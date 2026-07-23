// Frontend Spotify Web API helpers used with an Implicit Grant token.

export interface SpotifyImage { url: string; height?: number; width?: number }
export interface SpotifyArtist { id: string; name: string }
export interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: { id: string; name: string; images: SpotifyImage[] };
}
export interface SpotifyLikedItem { added_at: string; track: SpotifyTrack }
export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: SpotifyImage[];
  tracks: { total: number };
  owner: { display_name: string };
}
export interface SpotifyPaged<T> { items: T[]; total: number; next: string | null }

const BASE = "https://api.spotify.com/v1";

async function spotifyGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("Spotify token expired — reconnect.");
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const fetchLikedSongs = (token: string, limit = 50) =>
  spotifyGet<SpotifyPaged<SpotifyLikedItem>>(`/me/tracks?limit=${limit}`, token);

export const fetchPlaylists = (token: string, limit = 50) =>
  spotifyGet<SpotifyPaged<SpotifyPlaylist>>(`/me/playlists?limit=${limit}`, token);

export const fetchMe = (token: string) =>
  spotifyGet<{ id: string; display_name: string; images: SpotifyImage[] }>(`/me`, token);
