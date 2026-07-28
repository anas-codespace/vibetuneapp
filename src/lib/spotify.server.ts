// Server-only Spotify helpers (Client Credentials flow).
// Cached token across invocations of the same worker.
import {
  extractProviderReason,
  isProviderError,
  providerError,
  providerOk,
  type ProviderResult,
} from "./providerResult";

interface TokenCache {
  token: string;
  tokenType: string;
  scope: string;
  expiresAt: number;
}

let cache: TokenCache | null = null;
let spotifyConsecutive403 = 0;
let spotifyDisabledUntil = 0;
const SPOTIFY_403_BREAKER_THRESHOLD = 2;

function spotifyBreakerMs(): number {
  return Number(process.env.SPOTIFY_CIRCUIT_BREAKER_MS ?? 15 * 60_000);
}

const SEARCH_TRACE_QUERY = "jailer 2";
const shouldTraceSearch = (query: string) => query.trim().toLowerCase().includes(SEARCH_TRACE_QUERY);

function safeJsonForTrace(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function getSpotifyToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now() + 30_000) return cache.token;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Spotify credentials not configured");

  const basic = btoa(`${id}:${secret}`);
  console.log("[spotify] requesting client-credentials token", {
    grantType: "client_credentials",
    requestedScope: "none",
    hasClientId: !!id,
    hasClientSecret: !!secret,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const reason = extractProviderReason(text);
    console.error("[spotify] client-credentials token failed", { httpStatus: res.status, reason });
    throw new Error(`Spotify token error ${res.status}: ${reason}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number; token_type?: string; scope?: string };
  cache = {
    token: data.access_token,
    tokenType: data.token_type ?? "Bearer",
    scope: data.scope ?? "",
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  console.log("[spotify] client-credentials token ok", {
    tokenType: cache.tokenType,
    scope: cache.scope || "none",
    expiresIn: data.expires_in,
  });
  return cache.token;
}

function spotifyTokenState() {
  return {
    hasCachedToken: !!cache?.token,
    tokenType: cache?.tokenType ?? null,
    scope: cache?.scope ?? null,
    expiresAt: cache?.expiresAt ? new Date(cache.expiresAt).toISOString() : null,
    expired: cache ? cache.expiresAt <= Date.now() : null,
    usableForRequest: cache ? cache.expiresAt > Date.now() + 30_000 : false,
  };
}

function spotifyBreakerResult<T>(): ProviderResult<T> | null {
  if (Date.now() < spotifyDisabledUntil) {
    const reason = `Spotify circuit breaker active until ${new Date(spotifyDisabledUntil).toISOString()}`;
    console.warn("[spotify] skipping request", { httpStatus: 503, reason });
    return providerError("spotify", reason, 503);
  }
  return null;
}

function recordSpotifyHttpStatus(httpStatus: number, reason: string) {
  if (httpStatus === 403) {
    spotifyConsecutive403 += 1;
    console.error("[spotify] provider error", { httpStatus, reason, consecutive403: spotifyConsecutive403 });
    if (spotifyConsecutive403 >= SPOTIFY_403_BREAKER_THRESHOLD) {
      const durationMs = spotifyBreakerMs();
      spotifyDisabledUntil = Date.now() + durationMs;
      console.warn("[spotify] circuit breaker opened", {
        httpStatus,
        reason,
        disabledUntil: new Date(spotifyDisabledUntil).toISOString(),
        durationMs,
      });
    }
  } else if (httpStatus >= 200 && httpStatus < 300) {
    spotifyConsecutive403 = 0;
  } else {
    console.error("[spotify] provider error", { httpStatus, reason });
  }
}

export type { SpotifyArtistInfo } from "./music.types";
import type { SpotifyArtistInfo } from "./music.types";

export async function searchArtist(name: string): Promise<ProviderResult<SpotifyArtistInfo | null>> {
  const breaker = spotifyBreakerResult<SpotifyArtistInfo | null>();
  if (breaker) return breaker;
  const token = await getSpotifyToken();
  const url = `https://api.spotify.com/v1/search?type=artist&limit=1&q=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) {
    const reason = extractProviderReason(text);
    recordSpotifyHttpStatus(res.status, reason);
    return providerError("spotify", reason, res.status);
  }
  recordSpotifyHttpStatus(res.status, "ok");
  const data = JSON.parse(text) as {
    artists: { items: Array<{ id: string; name: string; images: { url: string }[]; followers: { total: number }; genres: string[] }> };
  };
  const a = data.artists.items[0];
  if (!a) return providerOk(null);
  return providerOk({
    id: a.id,
    name: a.name,
    hdPhotoUrl: a.images[0]?.url ?? null,
    isVerified: a.followers.total > 100_000,
    followers: a.followers.total,
    genres: a.genres,
  });
}

export async function getRelatedArtistsByName(name: string, limit = 8): Promise<ProviderResult<SpotifyArtistInfo[]>> {
  const breaker = spotifyBreakerResult<SpotifyArtistInfo[]>();
  if (breaker) return breaker;
  const token = await getSpotifyToken();
  const seed = await searchArtist(name);
  if (isProviderError(seed)) return seed;
  if (!seed.data) return providerOk([]);
  // Spotify "related-artists" endpoint was deprecated; use genre-based recs fallback.
  const genreQuery = seed.data.genres[0] ? `genre:"${seed.data.genres[0]}"` : seed.data.name;
  const url = `https://api.spotify.com/v1/search?type=artist&limit=${limit + 4}&q=${encodeURIComponent(genreQuery)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) {
    const reason = extractProviderReason(text);
    recordSpotifyHttpStatus(res.status, reason);
    return providerError("spotify", reason, res.status);
  }
  recordSpotifyHttpStatus(res.status, "ok");
  const data = JSON.parse(text) as { artists: { items: Array<{ id: string; name: string; images: { url: string }[]; followers: { total: number }; genres: string[] }> } };
  return providerOk(data.artists.items
    .filter((a) => a.id !== seed.data!.id && a.images.length > 0)
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      name: a.name,
      hdPhotoUrl: a.images[0]?.url ?? null,
      isVerified: a.followers.total > 100_000,
      followers: a.followers.total,
      genres: a.genres,
    })));
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

export async function searchTracks(query: string, limit = 20): Promise<ProviderResult<SpotifyTrackMeta[]>> {
  const trace = shouldTraceSearch(query);
  const breaker = spotifyBreakerResult<SpotifyTrackMeta[]>();
  if (breaker) return breaker;
  if (trace) {
    console.log("[search-trace][spotify.searchTracks] input", { query, limit, tokenBefore: spotifyTokenState() });
  }
  const token = await getSpotifyToken();
  const url = `https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(query)}`;
  if (trace) {
    console.log("[search-trace][spotify.searchTracks] request", {
      provider: "spotify",
      url,
      hasBearerTokenAttached: !!token,
      tokenType: cache?.tokenType ?? null,
      scope: cache?.scope ?? null,
      tokenAfter: spotifyTokenState(),
    });
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (trace) {
    console.log("[search-trace][spotify.searchTracks] response", {
      status: res.status,
      ok: res.ok,
      body: text,
    });
  }
  if (!res.ok) {
    const reason = extractProviderReason(text);
    recordSpotifyHttpStatus(res.status, reason);
    return providerError("spotify", reason, res.status);
  }
  recordSpotifyHttpStatus(res.status, "ok");
  const data = JSON.parse(text) as { tracks: { items: RawTrack[] } };
  if (trace) {
    console.log("[search-trace][spotify.searchTracks] transform", {
      beforeMapCount: data.tracks?.items?.length ?? 0,
      sampleBeforeMap: safeJsonForTrace(data.tracks?.items?.slice(0, 3) ?? []),
    });
  }
  const mapped = data.tracks.items.map(mapTrack);
  if (trace) {
    console.log("[search-trace][spotify.searchTracks] mapped", {
      afterMapCount: mapped.length,
      sampleAfterMap: safeJsonForTrace(mapped.slice(0, 5)),
    });
  }
  return providerOk(mapped);
}

// ---------- User OAuth (Authorization Code) ----------

export const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-read-playback-state",
].join(" ");

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return atob(padded);
  } catch {
    return null;
  }
}

async function signSpotifyLoginState(unsignedState: string): Promise<string> {
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new Error("Spotify credentials not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsignedState));
  let binary = "";
  new Uint8Array(signature).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function buildSpotifyState(userId: string, returnTo?: string): string {
  const nonce = crypto.randomUUID();
  const safeReturn = returnTo?.trim();
  return safeReturn ? `${userId}.${nonce}.${base64UrlEncode(safeReturn)}` : `${userId}.${nonce}`;
}

export async function buildSpotifyLoginState(returnTo?: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const encodedReturn = base64UrlEncode(returnTo?.trim() || "");
  const unsignedState = `login.${nonce}.${encodedReturn}`;
  return `${unsignedState}.${await signSpotifyLoginState(unsignedState)}`;
}

export async function verifySpotifyLoginState(state: string): Promise<{ returnTo: string | null }> {
  const parts = state.split(".");
  if (parts.length !== 4 || parts[0] !== "login") {
    throw new Error("Invalid Spotify login state");
  }

  const unsignedState = parts.slice(0, 3).join(".");
  const expected = await signSpotifyLoginState(unsignedState);
  const actual = parts[3] ?? "";
  if (!safeCompare(actual, expected)) {
    throw new Error("Invalid Spotify login state");
  }

  const decodedReturn = base64UrlDecode(parts[2] ?? "");
  return { returnTo: decodedReturn && decodedReturn.length > 0 ? decodedReturn : null };
}

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
  console.log("[oauth-debug][spotify] buildAuthUrl", {
    redirectUri,
    clientIdPrefix: id ? `${id.slice(0, 6)}…(len=${id.length})` : "MISSING",
    statePrefix: state.slice(0, 8),
    stateLen: state.length,
    scopes: SPOTIFY_SCOPES,
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

export class SpotifyUserRequestError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "SpotifyUserRequestError";
  }
}

async function tokenExchange(body: URLSearchParams, label: string): Promise<TokenResp> {
  const id = process.env.SPOTIFY_CLIENT_ID!;
  const secret = process.env.SPOTIFY_CLIENT_SECRET!;
  const basic = btoa(`${id}:${secret}`);
  const started = Date.now();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const ms = Date.now() - started;
  if (!res.ok) {
    const text = await res.text();
    console.error("[oauth-debug][spotify] tokenExchange failed", {
      label,
      status: res.status,
      ms,
      body: text.slice(0, 500),
      clientIdPrefix: id ? `${id.slice(0, 6)}…` : "MISSING",
      hasSecret: !!secret,
    });
    throw new Error(`Spotify token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as TokenResp;
  console.log("[oauth-debug][spotify] tokenExchange ok", {
    label,
    ms,
    scope: json.scope,
    expiresIn: json.expires_in,
    hasRefresh: !!json.refresh_token,
  });
  return json;
}

export async function exchangeAuthCode(code: string, redirectUri: string): Promise<TokenResp> {
  console.log("[oauth-debug][spotify] exchangeAuthCode start", {
    redirectUri,
    codePrefix: code.slice(0, 6),
    codeLen: code.length,
  });
  return tokenExchange(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
    "authorization_code",
  );
}

export async function refreshUserToken(refreshToken: string): Promise<TokenResp> {
  return tokenExchange(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    "refresh_token",
  );
}

export async function spotifyGet<T>(userToken: string, path: string): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const reason = extractProviderReason(text);
    const cid = process.env.SPOTIFY_CLIENT_ID ?? "";
    console.error("[spotify] user request failed", {
      path,
      status: res.status,
      reason,
      body: text.slice(0, 300),
      clientIdPrefix: cid ? `${cid.slice(0, 6)}…(len=${cid.length})` : "MISSING",
    });
    if (res.status === 403) {
      throw new SpotifyUserRequestError(
        path,
        res.status,
        reason,
        `Spotify ${path} → 403 Forbidden. Spotify blocked this user endpoint for the current account/app. Client ID starts "${cid.slice(0, 6)}…". In Spotify development mode, the app owner must have Premium and every tester must be allowlisted and have accepted the invite. (${reason})`,
      );
    }
    if (res.status === 401) {
      throw new SpotifyUserRequestError(
        path,
        res.status,
        reason,
        `Spotify ${path} → 401 Unauthorized. Reconnect Spotify to refresh your session. (${reason})`,
      );
    }
    throw new SpotifyUserRequestError(path, res.status, reason, `Spotify ${path} → ${res.status} ${reason}`);
  }
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

export async function getUserProfileIfAvailable(
  userToken: string,
): Promise<{ profile: SpotifyProfile | null; warning: string | null }> {
  try {
    return { profile: await getUserProfile(userToken), warning: null };
  } catch (error) {
    if (error instanceof SpotifyUserRequestError && error.path === "/me" && error.status === 403) {
      console.warn("[oauth-debug][spotify] /me blocked; continuing without profile", {
        status: error.status,
        reason: error.reason,
      });
      return {
        profile: null,
        warning: "Spotify connected, but Spotify blocked profile lookup for this account/app.",
      };
    }
    throw error;
  }
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

// ---------- Availability probe ----------
// Lightweight check that classifies whether the Spotify Web API is usable for
// this app's client credentials. Cached briefly to avoid hammering Spotify.

export type SpotifyAvailability =
  | { status: "ok"; checkedAt: number }
  | { status: "not_configured"; checkedAt: number; message: string }
  | { status: "premium_required"; checkedAt: number; message: string }
  | { status: "auth_error"; checkedAt: number; message: string }
  | { status: "unknown_error"; checkedAt: number; message: string };

let availabilityCache: { value: SpotifyAvailability; expiresAt: number } | null = null;
const AVAILABILITY_TTL_MS = 5 * 60_000; // 5 minutes

export async function checkSpotifyAvailability(force = false): Promise<SpotifyAvailability> {
  if (!force && availabilityCache && availabilityCache.expiresAt > Date.now()) {
    return availabilityCache.value;
  }

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  const now = Date.now();

  const finalize = (value: SpotifyAvailability, ttl = AVAILABILITY_TTL_MS): SpotifyAvailability => {
    availabilityCache = { value, expiresAt: Date.now() + ttl };
    return value;
  };

  if (!id || !secret) {
    return finalize({
      status: "not_configured",
      checkedAt: now,
      message: "Spotify credentials are not configured.",
    });
  }

  let token: string;
  try {
    token = await getSpotifyToken();
  } catch (e) {
    return finalize({
      status: "auth_error",
      checkedAt: now,
      message: e instanceof Error ? e.message : "Spotify token exchange failed.",
    }, 60_000);
  }

  // Cheapest search possible: type=track, limit=1, minimal query.
  const res = await fetch(
    "https://api.spotify.com/v1/search?type=track&limit=1&q=test",
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.ok) {
    return finalize({ status: "ok", checkedAt: now });
  }

  const bodyText = await res.text().catch(() => "");
  const lower = bodyText.toLowerCase();

  if (res.status === 403 && lower.includes("premium")) {
    return finalize({
      status: "premium_required",
      checkedAt: now,
      message:
        "Spotify now requires an active Premium subscription on the developer account that owns this app before Web API search will return results.",
    });
  }

  if (res.status === 401 || res.status === 403) {
    return finalize({
      status: "auth_error",
      checkedAt: now,
      message: `Spotify rejected the request (${res.status}). ${bodyText.slice(0, 200)}`.trim(),
    }, 60_000);
  }

  return finalize({
    status: "unknown_error",
    checkedAt: now,
    message: `Spotify returned ${res.status}. ${bodyText.slice(0, 200)}`.trim(),
  }, 60_000);
}
