/**
 * homeFeed.ts — Pure home-feed assembly.
 *
 * Produces 5 sections:
 *   1. "Jump back in"   — recent plays (last 14 days), dedup by track
 *   2. "Made for you"   — ranked recommendations
 *   3. "New releases"   — recency-first from candidates
 *   4. "Because you liked <artist>" — related picks around a top artist
 *   5. "Trending now"   — fallback / global trending pool
 *
 * Cache freshness: 4 hours. `isFresh` is used by the server wrapper to
 * decide whether to serve from feed_cache or recompute.
 */

import type { CandidateTrack, TasteVector } from "./recommendations";
import { rankRecommendations, recencyBoost } from "./recommendations";

export const FEED_TTL_MS = 4 * 60 * 60 * 1000;
export const SECTION_LIMIT = 12;

export type FeedSectionKey =
  | "jump_back_in"
  | "made_for_you"
  | "new_releases"
  | "because_you_liked"
  | "trending_now";

export interface FeedSection {
  key: FeedSectionKey;
  title: string;
  tracks: CandidateTrack[];
}

export interface RecentPlay {
  track: CandidateTrack;
  playedAt: string; // ISO
}

export interface BuildFeedInput {
  taste: TasteVector;
  candidates: CandidateTrack[];      // pool for made-for-you / new-releases
  recentPlays: RecentPlay[];
  trending: CandidateTrack[];        // fallback pool
  now?: Date;
}

export function isFresh(cachedAtIso: string, now: Date = new Date()): boolean {
  const t = new Date(cachedAtIso).getTime();
  if (!isFinite(t)) return false;
  return now.getTime() - t < FEED_TTL_MS;
}

function topArtistName(taste: TasteVector): string | null {
  const entries = Object.entries(taste.artists ?? {});
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? null;
}

function dedupBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function buildHomeFeed(input: BuildFeedInput): FeedSection[] {
  const now = input.now ?? new Date();
  const cutoff = now.getTime() - 14 * 86_400_000;

  // 1. Jump back in
  const jump = dedupBy(
    input.recentPlays
      .filter((r) => new Date(r.playedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
      .map((r) => r.track),
    (t) => t.id,
  ).slice(0, SECTION_LIMIT);

  // 2. Made for you
  const ranked = rankRecommendations(input.candidates, input.taste, {
    limit: SECTION_LIMIT,
    now,
  });

  // 3. New releases
  const newReleases = input.candidates
    .map((t) => ({ t, r: recencyBoost(t.publishedAt, now) }))
    .filter((x) => x.r >= 0.5)
    .sort((a, b) => b.r - a.r)
    .map((x) => x.t)
    .slice(0, SECTION_LIMIT);

  // 4. Because you liked <artist>
  const topArtist = topArtistName(input.taste);
  const because = topArtist
    ? input.candidates
        .filter((t) => (t.artist || "").toLowerCase() === topArtist)
        .slice(0, SECTION_LIMIT)
    : [];

  // 5. Trending now (always populated; used as fallback too)
  const trending = dedupBy(input.trending, (t) => t.id).slice(0, SECTION_LIMIT);

  const sections: FeedSection[] = [
    { key: "jump_back_in", title: "Jump back in", tracks: jump },
    { key: "made_for_you", title: "Made for you", tracks: ranked },
    { key: "new_releases", title: "New releases", tracks: newReleases },
    {
      key: "because_you_liked",
      title: topArtist ? `Because you liked ${topArtist}` : "Because you liked",
      tracks: because,
    },
    { key: "trending_now", title: "Trending now", tracks: trending },
  ];

  // Cold-start / empty-section fallback: promote trending into any empty slot.
  return sections.map((s) =>
    s.tracks.length === 0 && s.key !== "trending_now"
      ? { ...s, tracks: trending.slice(0, SECTION_LIMIT) }
      : s,
  );
}
