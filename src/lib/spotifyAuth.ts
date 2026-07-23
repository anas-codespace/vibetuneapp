// Frontend-only Spotify Implicit Grant flow.
// No server, no client secret — token is returned via URL hash and stored in localStorage.

export const SPOTIFY_CLIENT_ID = "34de7c057a4d4520883fd4d4a07c7002";

export const SPOTIFY_TOKEN_KEY = "spotify_token";
export const SPOTIFY_TOKEN_EXPIRES_KEY = "spotify_token_expires_at";

export const getRedirectUri = (): string => {
  if (typeof window === "undefined") return "";
  return `${window.location.protocol}//${window.location.host}/spotify-callback`;
};

export const SPOTIFY_SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

export const getSpotifyLoginUrl = (): string => {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    scope: SPOTIFY_SCOPES,
    response_type: "token",
    show_dialog: "true",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
};

export const clearSpotifyToken = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SPOTIFY_TOKEN_KEY);
  window.localStorage.removeItem(SPOTIFY_TOKEN_EXPIRES_KEY);
};
