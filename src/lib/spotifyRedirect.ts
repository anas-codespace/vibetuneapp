/**
 * Single source of truth for the Spotify OAuth redirect_uri.
 *
 * Spotify requires the redirect_uri sent to /authorize to EXACTLY match one of
 * the URIs registered in the Spotify Developer Dashboard, and the same string
 * must be sent again during the token exchange. Any mismatch (trailing slash,
 * http vs https, different subdomain) produces:
 *   "INVALID_CLIENT: Invalid redirect URI" / "redirect_uri: Not matching configuration"
 *
 * Resolution order:
 *  1. VITE_SPOTIFY_REDIRECT_URI  — explicit override, wins on every environment.
 *  2. `${window.location.origin}/spotify/callback` — dynamic fallback so preview
 *     and production domains both work without configuration.
 *
 * Whatever this function returns MUST be added verbatim to the Spotify
 * Developer Dashboard → your app → Redirect URIs.
 */
export function getSpotifyRedirectUri(): string {
  const fromEnv = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined)?.trim();
  const uri = fromEnv && fromEnv.length > 0
    ? fromEnv
    : `${window.location.origin}/spotify/callback`;

  // Normalize: strip trailing slash (Spotify treats "/x" and "/x/" as different).
  return uri.replace(/\/+$/, "");
}
