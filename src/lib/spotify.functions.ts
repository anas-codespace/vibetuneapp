// IMPORTANT: This file must contain ONLY imports + `createServerFn` declarations.
// Sibling helpers/types inside a .functions.ts file are extracted by TSS's
// server-fn split transform and re-hashed on every hot reload, which causes:
//   - runtime ReferenceError from `?tss-serverfn-split`
//   - unstable server-function IDs (client posts to /_serverFn/<oldHash> → 500)
// All shared helpers/types therefore live in `./spotify.server.ts`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildAuthUrl,
  exchangeAuthCode,
  getUserProfile,
  getUserProfileIfAvailable,
  getMyLikedTracks,
  getMyPlaylistsList,
  getPlaylistTracks,
  searchTracks,
  getFreshUserToken,
  resolveToYoutube,
  checkSpotifyAvailability,
  buildSpotifyState,
  buildSpotifyLoginState,
  verifySpotifyLoginState,
  type FailureEntry,
  type SpotifyPlayableResult,
  type SpotifyAvailability,
} from "./spotify.server";
import { searchMusic } from "./youtube.server";
import { isProviderError } from "./providerResult";

export type { SpotifyPlayableResult, SpotifyAvailability };

export const spotifyAvailability = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ force: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    return await checkSpotifyAvailability(!!data.force);
  });

// ---------- Auth flow ----------

export const spotifyGetAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ redirectUri: z.string().url(), returnTo: z.string().url().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const state = buildSpotifyState(context.userId, data.returnTo);
    return { url: buildAuthUrl(data.redirectUri, state), state };
  });

export const spotifyGetLoginAuthUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ redirectUri: z.string().url(), returnTo: z.string().url().optional() }).parse(d))
  .handler(async ({ data }) => {
    const state = await buildSpotifyLoginState(data.returnTo);
    return { url: buildAuthUrl(data.redirectUri, state), state };
  });

export const spotifyCompleteLogin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        code: z.string().min(1),
        redirectUri: z.string().url(),
        state: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const loginState = await verifySpotifyLoginState(data.state);
    const tok = await exchangeAuthCode(data.code, data.redirectUri);
    const profile = await getUserProfile(tok.access_token);
    const email = profile.email?.trim().toLowerCase();
    if (!email) {
      throw new Error("Spotify did not share an email address. Allow email access and try again.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const displayName = profile.display_name ?? email.split("@")[0] ?? "Spotify user";
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          display_name: displayName,
          spotify_user_id: profile.id,
        },
      },
    });
    if (linkError) throw new Error(linkError.message);

    const tokenHash = linkData.properties.hashed_token;
    if (!tokenHash) throw new Error("Could not create app session from Spotify login.");
    const { data: authData, error: authError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    if (authError) throw new Error(authError.message);
    if (!authData.session?.access_token || !authData.session.refresh_token || !authData.user?.id) {
      throw new Error("Could not create app session from Spotify login.");
    }

    let refreshToken = tok.refresh_token;
    if (!refreshToken) {
      const { data: existing } = await supabaseAdmin
        .from("spotify_tokens")
        .select("refresh_token")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      refreshToken = existing?.refresh_token ?? undefined;
    }
    if (!refreshToken) {
      throw new Error("Spotify did not issue a refresh token. Remove Vibetune from Spotify connected apps, then try again.");
    }

    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();
    const { error: tokenError } = await supabaseAdmin.from("spotify_tokens").upsert(
      {
        user_id: authData.user.id,
        access_token: tok.access_token,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        scope: tok.scope,
        spotify_user_id: profile.id,
        spotify_display_name: profile.display_name,
      },
      { onConflict: "user_id" },
    );
    if (tokenError) throw new Error(tokenError.message);

    await supabaseAdmin
      .from("profiles")
      .upsert({ user_id: authData.user.id, display_name: displayName }, { onConflict: "user_id" });

    return {
      connected: true,
      displayName: profile.display_name,
      returnTo: loginState.returnTo,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
    };
  });

export const spotifyExchangeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        code: z.string().min(1),
        redirectUri: z.string().url(),
        state: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    console.log("[oauth-debug][spotify] spotifyExchangeCode start", {
      userIdPrefix: context.userId.slice(0, 8),
      redirectUri: data.redirectUri,
      statePrefix: data.state.slice(0, 12),
      stateLen: data.state.length,
      stateMatchesUser: data.state.startsWith(`${context.userId}.`),
      codeLen: data.code.length,
    });
    if (!data.state.startsWith(`${context.userId}.`)) {
      console.error("[oauth-debug][spotify] state/user mismatch", {
        userIdPrefix: context.userId.slice(0, 8),
        statePrefix: data.state.slice(0, 12),
      });
      throw new Error("Invalid state");
    }
    const tok = await exchangeAuthCode(data.code, data.redirectUri);
    const { profile, warning } = await getUserProfileIfAvailable(tok.access_token);
    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();

    let refreshToken = tok.refresh_token;
    if (!refreshToken) {
      const { data: existing } = await context.supabase
        .from("spotify_tokens")
        .select("refresh_token")
        .eq("user_id", context.userId)
        .maybeSingle();
      refreshToken = existing?.refresh_token ?? undefined;
    }

    if (!refreshToken) {
      throw new Error("Spotify did not issue a refresh token. Remove Vibetune from Spotify connected apps, then try again.");
    }

    const { error } = await context.supabase
      .from("spotify_tokens")
      .upsert(
        {
          user_id: context.userId,
          access_token: tok.access_token,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          scope: tok.scope,
          spotify_user_id: profile?.id ?? null,
          spotify_display_name: profile?.display_name ?? null,
        },
        { onConflict: "user_id" },
      );
    if (error) {
      console.error("[oauth-debug][spotify] token upsert failed", { message: error.message });
      throw new Error(error.message);
    }
    console.log("[oauth-debug][spotify] exchange complete", {
      spotifyUserId: profile?.id ?? null,
      displayName: profile?.display_name ?? null,
      expiresAt,
      profileWarning: warning,
    });
    return { connected: true, displayName: profile?.display_name ?? null, warning };
  });

export const spotifyGetConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("spotify_tokens")
      .select("spotify_user_id, spotify_display_name, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

export const spotifyDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("spotify_tokens").delete().eq("user_id", context.userId);
    return { ok: true };
  });

// ---------- Search ----------

export const spotifySearch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const spot = await searchTracks(data.query, 12);
    if (isProviderError(spot)) {
      console.error("[spotify.functions] search failed", { httpStatus: spot.httpStatus, reason: spot.reason });
      return [];
    }
    return spot.data.map((t) => ({
      spotifyId: t.id,
      title: t.name,
      artist: t.artists.join(", "),
      album: t.album,
      albumArt: t.albumArt,
      durationMs: t.durationMs,
    }));
  });

/** Spotify-first search that also resolves each track to a playable YouTube id. */
export const spotifySearchPlayable = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      query: z.string().min(1).max(120),
      max: z.number().int().min(1).max(24).optional(),
      language: z.string().min(1).max(40).optional(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<SpotifyPlayableResult[]> => {
    // Hybrid cascade: try a contextual query (language appended, no strict quotes)
    // first, then fall back to the raw query if the contextual pass finds nothing.
    const cleanQuery = data.query.trim();
    const lang = data.language ?? "Tamil";
    const contextQuery = `${cleanQuery} ${lang}`;
    const max = Math.min(data.max ?? 16, 20);
    let spotResult = await searchTracks(contextQuery, max);
    if (isProviderError(spotResult)) {
      console.error("[spotify.functions] contextual search failed", { httpStatus: spotResult.httpStatus, reason: spotResult.reason });
    }
    let spot = spotResult.status === "ok" ? spotResult.data : [];
    if (spot.length === 0) {
      spotResult = await searchTracks(cleanQuery, max);
      if (isProviderError(spotResult)) {
        console.error("[spotify.functions] raw search failed", { httpStatus: spotResult.httpStatus, reason: spotResult.reason });
        spot = [];
      } else {
        spot = spotResult.data;
      }
    }

    const resolved = await Promise.all(
      spot.map(async (t): Promise<SpotifyPlayableResult | null> => {
        try {
          const primary = t.artists[0] ?? "";
          const targetSec = Math.round(t.durationMs / 1000);
          const yt = await searchMusic(`${primary} ${t.name} official audio`, 5);
          if (yt.length === 0) return null;
          const best = [...yt].sort(
            (a, b) => Math.abs(a.durationSeconds - targetSec) - Math.abs(b.durationSeconds - targetSec),
          )[0];
          return {
            spotifyId: t.id,
            youtubeId: best.youtubeId,
            title: t.name,
            artist: t.artists.join(", "),
            album: t.album,
            albumArt: t.albumArt,
            durationSeconds: best.durationSeconds || targetSec,
          };
        } catch {
          return null;
        }
      }),
    );
    const seen = new Set<string>();
    const out: SpotifyPlayableResult[] = [];
    for (const r of resolved) {
      if (!r || seen.has(r.youtubeId)) continue;
      seen.add(r.youtubeId);
      out.push(r);
    }
    return out;
  });

// ---------- Import: Liked Songs ----------

export const spotifyImportLiked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const token = await getFreshUserToken(context.supabase, context.userId);
    const liked = await getMyLikedTracks(token, 200);

    let added = 0;
    let skipped = 0;
    const failures: FailureEntry[] = [];

    for (const track of liked) {
      const label = { title: track.name, artist: track.artists.join(", ") };
      let resolved: Awaited<ReturnType<typeof resolveToYoutube>> = null;
      try {
        resolved = await resolveToYoutube(track);
      } catch (e) {
        failures.push({ ...label, reason: "resolve_error", detail: e instanceof Error ? e.message : String(e) });
        skipped++;
        continue;
      }
      if (!resolved) {
        failures.push({ ...label, reason: "no_youtube_match" });
        skipped++;
        continue;
      }

      const { data: existing } = await context.supabase
        .from("liked_songs")
        .select("id")
        .eq("user_id", context.userId)
        .eq("youtube_id", resolved.youtubeId)
        .maybeSingle();
      if (existing) {
        failures.push({ ...label, reason: "duplicate" });
        skipped++;
        continue;
      }

      const { error } = await context.supabase.from("liked_songs").insert({
        user_id: context.userId,
        youtube_id: resolved.youtubeId,
        title: resolved.title,
        artist: resolved.artist,
        thumbnail_url: resolved.thumbnailUrl,
      });
      if (error) {
        failures.push({ ...label, reason: "db_error", detail: error.message });
        skipped++;
        continue;
      }
      added++;
    }
    return { total: liked.length, added, skipped, failures };
  });

// ---------- Import: Playlists ----------

export const spotifyListPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const token = await getFreshUserToken(context.supabase, context.userId);
    return getMyPlaylistsList(token);
  });

/** Raw read of the user's Spotify Liked Songs — no DB write, for the dashboard view. */
export const spotifyListLiked = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const token = await getFreshUserToken(context.supabase, context.userId);
    const items = await getMyLikedTracks(token, 100);
    return items.map((t) => ({
      spotifyId: t.id,
      title: t.name,
      artist: t.artists.join(", "),
      album: t.album,
      albumArt: t.albumArt,
      durationMs: t.durationMs,
    }));
  });


export const spotifyImportPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ playlistId: z.string().min(1), name: z.string().min(1), cover: z.string().nullable().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await getFreshUserToken(context.supabase, context.userId);
    const tracks = await getPlaylistTracks(token, data.playlistId, 300);

    const { data: pl, error: plErr } = await context.supabase
      .from("playlists")
      .insert({
        user_id: context.userId,
        name: data.name,
        cover_image: data.cover ?? null,
      })
      .select("id")
      .single();
    if (plErr || !pl) throw new Error(plErr?.message ?? "Failed to create playlist");

    let added = 0;
    let skipped = 0;
    const failures: FailureEntry[] = [];
    const rows: Array<{
      playlist_id: string;
      user_id: string;
      youtube_id: string;
      title: string;
      artist: string;
      thumbnail_url: string | null;
      position: number;
    }> = [];
    for (const t of tracks) {
      const label = { title: t.name, artist: t.artists.join(", ") };
      let resolved: Awaited<ReturnType<typeof resolveToYoutube>> = null;
      try {
        resolved = await resolveToYoutube(t);
      } catch (e) {
        failures.push({ ...label, reason: "resolve_error", detail: e instanceof Error ? e.message : String(e) });
        skipped++;
        continue;
      }
      if (!resolved) {
        failures.push({ ...label, reason: "no_youtube_match" });
        skipped++;
        continue;
      }
      rows.push({
        playlist_id: pl.id,
        user_id: context.userId,
        youtube_id: resolved.youtubeId,
        title: resolved.title,
        artist: resolved.artist,
        thumbnail_url: resolved.thumbnailUrl,
      position: rows.length,
      });
      added++;
    }
    if (rows.length) {
      const { error } = await context.supabase.from("playlist_songs").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { playlistId: pl.id, total: tracks.length, added, skipped, failures };
  });

// ---------- Auto-sync on login: Liked + all Playlists ----------


export interface AutoSyncResult {
  likedAdded: number;
  likedSkipped: number;
  playlistsCreated: number;
  playlistsSkipped: number;
  tracksAdded: number;
}

export const spotifyAutoSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutoSyncResult> => {
    const token = await getFreshUserToken(context.supabase, context.userId);

    // --- Liked Songs ---
    const liked = await getMyLikedTracks(token, 200);
    let likedAdded = 0;
    let likedSkipped = 0;
    for (const track of liked) {
      let resolved: Awaited<ReturnType<typeof resolveToYoutube>> = null;
      try {
        resolved = await resolveToYoutube(track);
      } catch {
        likedSkipped++;
        continue;
      }
      if (!resolved) {
        likedSkipped++;
        continue;
      }
      const { data: existing } = await context.supabase
        .from("liked_songs")
        .select("id")
        .eq("user_id", context.userId)
        .eq("youtube_id", resolved.youtubeId)
        .maybeSingle();
      if (existing) {
        likedSkipped++;
        continue;
      }
      const { error } = await context.supabase.from("liked_songs").insert({
        user_id: context.userId,
        youtube_id: resolved.youtubeId,
        title: resolved.title,
        artist: resolved.artist,
        thumbnail_url: resolved.thumbnailUrl,
      });
      if (error) likedSkipped++;
      else likedAdded++;
    }

    // --- Playlists ---
    const playlists = await getMyPlaylistsList(token);
    let playlistsCreated = 0;
    let playlistsSkipped = 0;
    let tracksAdded = 0;

    for (const p of playlists) {
      // Skip if a playlist with the same name already exists (idempotent sync).
      const { data: dup } = await context.supabase
        .from("playlists")
        .select("id")
        .eq("user_id", context.userId)
        .eq("name", p.name)
        .maybeSingle();
      if (dup) {
        playlistsSkipped++;
        continue;
      }

      const tracks = await getPlaylistTracks(token, p.id, 300);
      const { data: pl, error: plErr } = await context.supabase
        .from("playlists")
        .insert({ user_id: context.userId, name: p.name, cover_image: p.image ?? null })
        .select("id")
        .single();
      if (plErr || !pl) {
        playlistsSkipped++;
        continue;
      }
      playlistsCreated++;

      const rows: Array<{
        playlist_id: string;
        user_id: string;
        youtube_id: string;
        title: string;
        artist: string;
        thumbnail_url: string | null;
        position: number;
      }> = [];
      for (const t of tracks) {
        let resolved: Awaited<ReturnType<typeof resolveToYoutube>> = null;
        try {
          resolved = await resolveToYoutube(t);
        } catch {
          continue;
        }
        if (!resolved) continue;
        rows.push({
          playlist_id: pl.id,
          user_id: context.userId,
          youtube_id: resolved.youtubeId,
          title: resolved.title,
          artist: resolved.artist,
          thumbnail_url: resolved.thumbnailUrl,
          position: rows.length,
        });
      }
      if (rows.length) {
        const { error } = await context.supabase.from("playlist_songs").insert(rows);
        if (!error) tracksAdded += rows.length;
      }
    }

    return { likedAdded, likedSkipped, playlistsCreated, playlistsSkipped, tracksAdded };
  });
