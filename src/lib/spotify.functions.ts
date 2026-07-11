import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildAuthUrl,
  exchangeAuthCode,
  refreshUserToken,
  getUserProfile,
  getMyLikedTracks,
  getMyPlaylistsList,
  getPlaylistTracks,
  searchTracks,
  type SpotifyTrackMeta,
} from "./spotify.server";
import { searchMusic } from "./youtube.server";

// ---------- Auth flow ----------

export const spotifyGetAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ redirectUri: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    // state = user id + random nonce
    const state = `${context.userId}.${crypto.randomUUID()}`;
    return { url: buildAuthUrl(data.redirectUri, state), state };
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
    if (!data.state.startsWith(`${context.userId}.`)) {
      throw new Error("Invalid state");
    }
    const tok = await exchangeAuthCode(data.code, data.redirectUri);
    const profile = await getUserProfile(tok.access_token);
    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();

    const { error } = await context.supabase
      .from("spotify_tokens")
      .upsert(
        {
          user_id: context.userId,
          access_token: tok.access_token,
          refresh_token: tok.refresh_token!,
          expires_at: expiresAt,
          scope: tok.scope,
          spotify_user_id: profile.id,
          spotify_display_name: profile.display_name,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { connected: true, displayName: profile.display_name };
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

// ---------- Internal: get a fresh user token ----------

async function getFreshUserToken(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("spotify_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Spotify not connected");

  const expMs = new Date(data.expires_at as string).getTime();
  if (expMs > Date.now() + 60_000) return data.access_token as string;

  const refreshed = await refreshUserToken(data.refresh_token as string);
  const newExp = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("spotify_tokens")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExp,
      refresh_token: refreshed.refresh_token ?? data.refresh_token,
    })
    .eq("user_id", userId);
  return refreshed.access_token;
}

// ---------- Resolve Spotify track → YouTube playable id ----------

type ResolveFailReason = "no_youtube_match" | "duplicate" | "db_error" | "resolve_error";

interface FailureEntry {
  title: string;
  artist: string;
  reason: ResolveFailReason;
  detail?: string;
}

async function resolveToYoutube(track: SpotifyTrackMeta) {
  const q = `${track.artists[0] ?? ""} ${track.name}`.trim();
  const results = await searchMusic(q, 3);
  const yt = results[0];
  if (!yt) return null;
  return {
    youtubeId: yt.youtubeId,
    title: track.name,
    artist: track.artists.join(", "),
    thumbnailUrl: track.albumArt ?? yt.thumbnailUrl ?? null,
  };
}

// ---------- Search (Spotify-first, playable via YouTube) ----------

export const spotifySearch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const spot = await searchTracks(data.query, 12);
    return spot.map((t) => ({
      spotifyId: t.id,
      title: t.name,
      artist: t.artists.join(", "),
      album: t.album,
      albumArt: t.albumArt,
      durationMs: t.durationMs,
    }));
  });

export interface SpotifyPlayableResult {
  spotifyId: string;
  youtubeId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  durationSeconds: number;
}

/** Spotify-first search that also resolves each track to a playable YouTube id. */
export const spotifySearchPlayable = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().min(1).max(120), max: z.number().int().min(1).max(24).optional() }).parse(d))
  .handler(async ({ data }): Promise<SpotifyPlayableResult[]> => {
    const spot = await searchTracks(data.query, Math.min(data.max ?? 16, 20));
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

// ---------- Import: Playlists (list only) ----------

export const spotifyListPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const token = await getFreshUserToken(context.supabase, context.userId);
    return getMyPlaylistsList(token);
  });

// ---------- Import: single playlist into user's library ----------

export const spotifyImportPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ playlistId: z.string().min(1), name: z.string().min(1), cover: z.string().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await getFreshUserToken(context.supabase, context.userId);
    const tracks = await getPlaylistTracks(token, data.playlistId, 300);

    // Create playlist
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
