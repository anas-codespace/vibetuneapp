// Server-only Spotify helpers (Client Credentials flow).
// Cached token across invocations of the same worker.

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cache: TokenCache | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now() + 30_000) return cache.token;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Spotify credentials not configured");

  const basic = btoa(`${id}:${secret}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify token error ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cache.token;
}

export type { SpotifyArtistInfo } from "./music.types";
import type { SpotifyArtistInfo } from "./music.types";

export async function searchArtist(name: string): Promise<SpotifyArtistInfo | null> {
  const token = await getSpotifyToken();
  const url = `https://api.spotify.com/v1/search?type=artist&limit=1&q=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    artists: { items: Array<{ id: string; name: string; images: { url: string }[]; followers: { total: number }; genres: string[] }> };
  };
  const a = data.artists.items[0];
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    hdPhotoUrl: a.images[0]?.url ?? null,
    isVerified: a.followers.total > 100_000,
    followers: a.followers.total,
    genres: a.genres,
  };
}

export async function getRelatedArtistsByName(name: string, limit = 8): Promise<SpotifyArtistInfo[]> {
  const token = await getSpotifyToken();
  const seed = await searchArtist(name);
  if (!seed) return [];
  // Spotify "related-artists" endpoint was deprecated; use genre-based recs fallback.
  const genreQuery = seed.genres[0] ? `genre:"${seed.genres[0]}"` : seed.name;
  const url = `https://api.spotify.com/v1/search?type=artist&limit=${limit + 4}&q=${encodeURIComponent(genreQuery)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = (await res.json()) as { artists: { items: Array<{ id: string; name: string; images: { url: string }[]; followers: { total: number }; genres: string[] }> } };
  return data.artists.items
    .filter((a) => a.id !== seed.id && a.images.length > 0)
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      name: a.name,
      hdPhotoUrl: a.images[0]?.url ?? null,
      isVerified: a.followers.total > 100_000,
      followers: a.followers.total,
      genres: a.genres,
    }));
}

// ---------- Track search (Client Credentials) ----------

export interface SpotifyTrackMeta {
  id: string;
  name: string;
  artists: string[];
  album: string;
  albumArt: string | null;
  durationMs: number;
  isrc?: string;
}

interface RawTrack {
  id: string;
  name: string;
  duration_ms: number;
  album: { name: string; images: { url: string }[] };
  artists: { name: string }[];
  external_ids?: { isrc?: string };
}

function mapTrack(t: RawTrack): SpotifyTrackMeta {
  return {
    id: t.id,
    name: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album?.name ?? "",
    albumArt: t.album?.images?.[0]?.url ?? null,
    durationMs: t.duration_ms,
    isrc: t.external_ids?.isrc,
  };
}

export async function searchTracks(query: string, limit = 20): Promise<SpotifyTrackMeta[]> {
  const token = await getSpotifyToken();
  const url = `https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = (await res.json()) as { tracks: { items: RawTrack[] } };
  return data.tracks.items.map(mapTrack);
}

// ---------- User OAuth (Authorization Code) ----------

export const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
].join(" ");

export function buildAuthUrl(redirectUri: string, state: string): string {
  const id = process.env.SPOTIFY_CLIENT_ID!;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: id,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: "true",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

interface TokenResp {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

async function tokenExchange(body: URLSearchParams): Promise<TokenResp> {
  const id = process.env.SPOTIFY_CLIENT_ID!;
  const secret = process.env.SPOTIFY_CLIENT_SECRET!;
  const basic = btoa(`${id}:${secret}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResp;
}

export async function exchangeAuthCode(code: string, redirectUri: string): Promise<TokenResp> {
  return tokenExchange(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );
}

export async function refreshUserToken(refreshToken: string): Promise<TokenResp> {
  return tokenExchange(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

export async function spotifyGet<T>(userToken: string, path: string): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  if (!res.ok) throw new Error(`Spotify ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export interface SpotifyProfile {
  id: string;
  display_name: string | null;
  email?: string;
  images?: { url: string }[];
}

export async function getUserProfile(userToken: string): Promise<SpotifyProfile> {
  return spotifyGet<SpotifyProfile>(userToken, "/me");
}

export async function getMyLikedTracks(userToken: string, max = 200): Promise<SpotifyTrackMeta[]> {
  const out: SpotifyTrackMeta[] = [];
  let url = `/me/tracks?limit=50`;
  while (out.length < max) {
    const data = await spotifyGet<{ items: { track: RawTrack }[]; next: string | null }>(userToken, url);
    for (const it of data.items) if (it.track) out.push(mapTrack(it.track));
    if (!data.next) break;
    url = data.next.replace("https://api.spotify.com/v1", "");
  }
  return out.slice(0, max);
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  image: string | null;
  trackCount: number;
  owner: string;
}

export async function getMyPlaylistsList(userToken: string): Promise<SpotifyPlaylistSummary[]> {
  const out: SpotifyPlaylistSummary[] = [];
  let url = `/me/playlists?limit=50`;
  while (true) {
    const data = await spotifyGet<{
      items: Array<{ id: string; name: string; images: { url: string }[]; tracks: { total: number }; owner: { display_name: string } }>;
      next: string | null;
    }>(userToken, url);
    for (const p of data.items) {
      out.push({
        id: p.id,
        name: p.name,
        image: p.images?.[0]?.url ?? null,
        trackCount: p.tracks.total,
        owner: p.owner.display_name,
      });
    }
    if (!data.next) break;
    url = data.next.replace("https://api.spotify.com/v1", "");
  }
  return out;
}

export async function getPlaylistTracks(userToken: string, playlistId: string, max = 300): Promise<SpotifyTrackMeta[]> {
  const out: SpotifyTrackMeta[] = [];
  let url = `/playlists/${playlistId}/tracks?limit=100`;
  while (out.length < max) {
    const data = await spotifyGet<{ items: { track: RawTrack | null }[]; next: string | null }>(userToken, url);
    for (const it of data.items) if (it.track) out.push(mapTrack(it.track));
    if (!data.next) break;
    url = data.next.replace("https://api.spotify.com/v1", "");
  }
  return out.slice(0, max);
}

// ---------- Server-only helpers shared by spotify.functions.ts ----------
// Keeping these here (not in .functions.ts) is required by the TSS server-fn
// split transform: sibling helpers in a .functions.ts file cause runtime
// ReferenceError and shift server-function IDs on every hot reload.

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchMusic } from "./youtube.server";

export type ResolveFailReason = "no_youtube_match" | "duplicate" | "db_error" | "resolve_error";

export interface FailureEntry {
  title: string;
  artist: string;
  reason: ResolveFailReason;
  detail?: string;
}

export interface SpotifyPlayableResult {
  spotifyId: string;
  youtubeId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  durationSeconds: number;
}

export async function getFreshUserToken(
  supabase: SupabaseClient,
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

export async function resolveToYoutube(track: SpotifyTrackMeta) {
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
