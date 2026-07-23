/**
 * Language → official "Top Hits" YouTube playlist map.
 *
 * We fetch these via YouTube Data API `playlistItems` (not `search`) so trends
 * are guaranteed to match the requested language regardless of regionCode
 * aggregation quirks. IDs point at YouTube Music auto-generated charts or
 * curated label playlists (T-Series / Sony Music). Update if a playlist
 * becomes private or empty.
 *
 * NOTE: RD* "radio" playlists are NOT usable with playlistItems (private,
 * user-scoped) — only PL* / auto-generated chart playlists work.
 */
export const LANGUAGE_PLAYLIST_MAP: Record<string, string> = {
  // YouTube Music charts — Top Songs (country/language scoped)
  HINDI:     "PLFgquLnL59akA2PflFpeQG9L01VFg90wS", // Top Music Videos – India
  TAMIL:     "PLO7-VO1D0_6NyH9lYWUlkypqYUu2WkfHR", // Sony Music South – Tamil Hits
  TELUGU:    "PLO7-VO1D0_6MYQeE2c2VLrmfDzZAPuVvL", // Sony Music South – Telugu Hits
  MALAYALAM: "PLbUUXQGWjujjq6X-Yn2vlQZ4pAvajLuwK", // Malayalam Hits
  KANNADA:   "PLbUUXQGWjujilzsD7DYzIQO4E1jFj4xTn", // Kannada Hits
  PUNJABI:   "PLFgquLnL59amyjyMFcZ0S-58ceSTBCJK-", // T-Series Punjabi Hits
  BENGALI:   "PLbUUXQGWjujjZ4H1BqfHRUEd2n0xF9M8s", // Bengali Hits
  ENGLISH:   "PLw-VjHDlEOgs658kAHR_LAaILBXb-s6Q5", // Top Global Hits
  SPANISH:   "PLw-VjHDlEOguXFvSFJ8b4vBFhcHVJ_9wG", // Top Latino Hits
  KOREAN:    "PLw-VjHDlEOgtn9yQ9-J1yWv-vwsUqYw8G", // K-Pop Hits
  JAPANESE:  "PLw-VjHDlEOgvBg2u3G6vT8kMxaBHR_5oE", // J-Pop Hits
  ARABIC:    "PLw-VjHDlEOguPQ5oGqHb3nH_9NnB6oR6q", // Arabic Hits
  // Fallback for "ALL" or unmapped
  ALL:       "PLFgquLnL59akA2PflFpeQG9L01VFg90wS",
};

export function playlistIdForLanguage(languageCode: string | null | undefined): string {
  const key = (languageCode ?? "ALL").toUpperCase();
  return LANGUAGE_PLAYLIST_MAP[key] ?? LANGUAGE_PLAYLIST_MAP.ALL;
}
