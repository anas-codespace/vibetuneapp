import { useEffect, useState } from "react";
import {
  SPOTIFY_TOKEN_KEY,
  SPOTIFY_TOKEN_EXPIRES_KEY,
  clearSpotifyToken,
} from "@/lib/spotifyAuth";

/**
 * Extracts the Spotify access token from either the URL hash (post-redirect)
 * or localStorage. Returns null while not authenticated / expired.
 */
export const useSpotifyAuth = () => {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readStored = (): string | null => {
      const stored = window.localStorage.getItem(SPOTIFY_TOKEN_KEY);
      const expiresAt = Number(window.localStorage.getItem(SPOTIFY_TOKEN_EXPIRES_KEY) ?? "0");
      if (!stored) return null;
      if (expiresAt && Date.now() > expiresAt) {
        clearSpotifyToken();
        return null;
      }
      return stored;
    };

    const hash = window.location.hash;
    if (hash && hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      const expiresIn = Number(params.get("expires_in") ?? "3600");
      if (accessToken) {
        window.localStorage.setItem(SPOTIFY_TOKEN_KEY, accessToken);
        window.localStorage.setItem(
          SPOTIFY_TOKEN_EXPIRES_KEY,
          String(Date.now() + expiresIn * 1000),
        );
        // Clean the URL so the token doesn't linger in browser history.
        window.history.replaceState({}, document.title, window.location.pathname);
        setToken(accessToken);
        return;
      }
    }

    setToken(readStored());
  }, []);

  const logout = () => {
    clearSpotifyToken();
    setToken(null);
  };

  return { token, logout };
};
