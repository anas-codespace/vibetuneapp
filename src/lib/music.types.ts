// Client-safe type shapes shared between server functions and UI.
export interface SpotifyArtistInfo {
  id: string;
  name: string;
  hdPhotoUrl: string | null;
  isVerified: boolean;
  followers: number;
  genres: string[];
}
