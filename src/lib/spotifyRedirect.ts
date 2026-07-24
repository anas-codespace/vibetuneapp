/**
 * Single source of truth for Spotify OAuth redirect URLs.
 *
 * Spotify requires the redirect_uri sent to /authorize to EXACTLY match one of
 * the URIs registered in the Spotify Developer Dashboard, and the same string
 * must be sent again during the token exchange. Preview domains are unstable,
 * so non-production origins use the stable published callback as a relay.
 */
const SPOTIFY_CALLBACK_PATH = "/spotify/callback";
const DEFAULT_SPOTIFY_REDIRECT_ORIGIN = "https://vibetuneapp.lovable.app";
const DEFAULT_SPOTIFY_PREVIEW_ORIGIN = "https://id-preview--112fc725-919a-4e01-8756-ae5704084e86.lovable.app";

function normalizeUri(uri: string): string {
  return uri.trim().replace(/\/+$/, "");
}

function envValue(name: "VITE_SPOTIFY_REDIRECT_URI" | "VITE_SPOTIFY_REDIRECT_ORIGIN" | "VITE_SPOTIFY_PREVIEW_ORIGIN") {
  const value = import.meta.env[name] as string | undefined;
  return value?.trim() || null;
}

function currentOrigin(): string {
  if (typeof window === "undefined") return DEFAULT_SPOTIFY_REDIRECT_ORIGIN;
  return window.location.origin;
}

function currentHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

function isLocalOrPreviewHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local") ||
    hostname.includes("-preview--") ||
    hostname.includes("lovableproject.com")
  );
}

function configuredStableCallback(): string {
  const explicit = envValue("VITE_SPOTIFY_REDIRECT_URI");
  if (explicit) return normalizeUri(explicit);

  const origin = normalizeUri(envValue("VITE_SPOTIFY_REDIRECT_ORIGIN") ?? DEFAULT_SPOTIFY_REDIRECT_ORIGIN);
  return `${origin}${SPOTIFY_CALLBACK_PATH}`;
}

function configuredPreviewOrigin(): string {
  return normalizeUri(envValue("VITE_SPOTIFY_PREVIEW_ORIGIN") ?? DEFAULT_SPOTIFY_PREVIEW_ORIGIN);
}

function base64UrlDecode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return atob(padded);
  } catch {
    return null;
  }
}

function isAllowedReturnOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.origin === currentOrigin()) return true;
    if (url.origin === normalizeUri(envValue("VITE_SPOTIFY_REDIRECT_ORIGIN") ?? DEFAULT_SPOTIFY_REDIRECT_ORIGIN)) return true;
    if (url.origin === configuredPreviewOrigin()) return true;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function getSpotifyReturnUri(): string {
  return `${currentOrigin()}${SPOTIFY_CALLBACK_PATH}`;
}

export function getSpotifyRedirectUri(): string {
  const explicit = envValue("VITE_SPOTIFY_REDIRECT_URI");
  if (explicit) return normalizeUri(explicit);

  const origin = currentOrigin();
  return isLocalOrPreviewHost(currentHostname())
    ? configuredStableCallback()
    : `${origin}${SPOTIFY_CALLBACK_PATH}`;
}

export function getSpotifyCallbackRelayTarget(): string | null {
  if (typeof window === "undefined") return null;

  const state = new URLSearchParams(window.location.search).get("state");
  const encodedReturnUri = state?.split(".")[2];
  if (!encodedReturnUri) return null;

  const decoded = base64UrlDecode(encodedReturnUri);
  if (!decoded) return null;

  try {
    const target = new URL(decoded);
    if (target.pathname !== SPOTIFY_CALLBACK_PATH) return null;
    if (target.origin === window.location.origin) return null;
    if (!isAllowedReturnOrigin(target.origin)) return null;

    target.search = window.location.search;
    target.hash = "";
    return target.toString();
  } catch {
    return null;
  }
}

export const SPOTIFY_REGISTERED_REDIRECT_URI = configuredStableCallback();
