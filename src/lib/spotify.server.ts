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
