/**
 * recommender.server.ts — Pure candidate scoring + diversity re-rank.
 *
 * The recommender does NOT fetch tracks. Callers pass in a pool of
 * candidate tracks (from YouTube/Spotify search or related-artist queries)
 * plus a TasteProfile, and receive a ranked, diversified subset.
 *
 * Kept side-effect-free so unit tests can pass plain objects.
 */

import type { TasteProfile } from "./taste.server";
import { normalizeArtistName, normalizeLang } from "./taste.server";

// ---------------------------------------------------------------------------
// Weights (tunable)
// ---------------------------------------------------------------------------

export const REC_WEIGHTS = {
  artistAffinity: 0.35,
  languageMatch: 0.2,
  collaborative: 0.15,
  freshness: 0.15,
  hourFit: 0.1,
  diversityBoost: 0.05,
} as const;

/** Max tracks from the same artist inside a single ranked list. */
export const MAX_PER_ARTIST = 2;

/** Adjacent-discovery share of the final list for the default section. */
export const DEFAULT_DISCOVERY_SHARE = 0.3;
/** Discovery share when the caller flags `discoveryBoost`. */
export const DISCOVERY_MODE_SHARE = 0.6;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface Candidate {
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  language?: string | null;
  releasedAt?: string | null; // ISO
  /** true if the caller flagged this candidate as an "adjacent"/discovery pick. */
  isDiscovery?: boolean;
  /** Optional external popularity hint, 0..1. Used lightly. */
  popularity?: number;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  breakdown: {
    artistAffinity: number;
    languageMatch: number;
    collaborative: number;
    freshness: number;
    hourFit: number;
    diversityBoost: number;
  };
}

export interface RecommendOptions {
  count: number;
  hourLocal: number;
  discoveryBoost?: boolean;
  /** Tracks to exclude (e.g. played in last 6h). */
  excludeYoutubeIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Individual scoring components (0..1 each)
// ---------------------------------------------------------------------------

export function artistAffinity(candidate: Candidate, profile: TasteProfile): number {
  const a = normalizeArtistName(candidate.artist);
  if (!a) return 0;
  const hit = profile.topArtists.find((x) => x.name === a);
  if (!hit) return 0;
  const top = profile.topArtists[0]?.score ?? 1;
  return top > 0 ? Math.min(1, hit.score / top) : 0;
}

export function languageMatch(candidate: Candidate, profile: TasteProfile): number {
  const lang = normalizeLang(candidate.language ?? "");
  if (!lang) return 0;
  return profile.languageMix[lang] ?? 0;
}

export function freshness(candidate: Candidate, now: Date = new Date()): number {
  if (!candidate.releasedAt) return 0;
  const days =
    (now.getTime() - new Date(candidate.releasedAt).getTime()) /
    (1000 * 60 * 60 * 24);
  if (days < 0) return 0;
  if (days <= 60) return 1;
  if (days >= 365) return 0;
  // Linear decay from 60d → 365d.
  return 1 - (days - 60) / (365 - 60);
}

export function hourFit(hourLocal: number, profile: TasteProfile): number {
  const weight = profile.hourBuckets[hourLocal] ?? 0;
  const peak = Math.max(0, ...Object.values(profile.hourBuckets));
  return peak > 0 ? weight / peak : 0;
}

// ---------------------------------------------------------------------------
// Aggregate score
// ---------------------------------------------------------------------------

export function scoreCandidate(
  candidate: Candidate,
  profile: TasteProfile,
  hourLocal: number,
  now: Date = new Date(),
): ScoredCandidate {
  const b = {
    artistAffinity: artistAffinity(candidate, profile),
    languageMatch: languageMatch(candidate, profile),
    // Collaborative: caller marks isDiscovery for tracks pulled from a
    // related-artist neighbourhood of a top artist.
    collaborative: candidate.isDiscovery ? 0.7 : candidate.popularity ?? 0,
    freshness: freshness(candidate, now),
    hourFit: hourFit(hourLocal, profile),
    diversityBoost: 0, // set during greedy pass
  };
  const score =
    REC_WEIGHTS.artistAffinity * b.artistAffinity +
    REC_WEIGHTS.languageMatch * b.languageMatch +
    REC_WEIGHTS.collaborative * b.collaborative +
    REC_WEIGHTS.freshness * b.freshness +
    REC_WEIGHTS.hourFit * b.hourFit +
    REC_WEIGHTS.diversityBoost * b.diversityBoost;
  return { ...candidate, score, breakdown: b };
}

// ---------------------------------------------------------------------------
// Greedy diversity-aware selection
// ---------------------------------------------------------------------------

/**
 * Select `count` tracks with:
 *  - no duplicate youtubeIds
 *  - no more than MAX_PER_ARTIST tracks per artist
 *  - discovery share respected (roughly)
 *  - exclusion list honored
 */
export function selectDiversified(
  scored: ScoredCandidate[],
  opts: RecommendOptions,
): ScoredCandidate[] {
  const exclude = opts.excludeYoutubeIds ?? new Set<string>();
  const targetDiscovery = Math.round(
    opts.count *
      (opts.discoveryBoost ? DISCOVERY_MODE_SHARE : DEFAULT_DISCOVERY_SHARE),
  );

  const sorted = scored
    .filter((c) => !exclude.has(c.youtubeId))
    .sort((a, b) => b.score - a.score);

  const picked: ScoredCandidate[] = [];
  const seenIds = new Set<string>();
  const perArtist = new Map<string, number>();
  let discoveryPicked = 0;

  const canPick = (c: ScoredCandidate) => {
    if (seenIds.has(c.youtubeId)) return false;
    const artistKey = normalizeArtistName(c.artist) || "__unknown";
    if ((perArtist.get(artistKey) ?? 0) >= MAX_PER_ARTIST) return false;
    return true;
  };

  const commit = (c: ScoredCandidate) => {
    picked.push(c);
    seenIds.add(c.youtubeId);
    const artistKey = normalizeArtistName(c.artist) || "__unknown";
    perArtist.set(artistKey, (perArtist.get(artistKey) ?? 0) + 1);
    if (c.isDiscovery) discoveryPicked++;
  };

  // Pass 1: prioritise discovery until quota met.
  for (const c of sorted) {
    if (picked.length >= opts.count) break;
    if (!c.isDiscovery) continue;
    if (discoveryPicked >= targetDiscovery) break;
    if (!canPick(c)) continue;
    commit(c);
  }

  // Pass 2: fill the rest with best-scored remaining candidates.
  for (const c of sorted) {
    if (picked.length >= opts.count) break;
    if (seenIds.has(c.youtubeId)) continue;
    if (!canPick(c)) continue;
    commit(c);
  }

  return picked;
}

export function recommendTracks(
  candidates: Candidate[],
  profile: TasteProfile,
  opts: RecommendOptions,
  now: Date = new Date(),
): ScoredCandidate[] {
  const scored = candidates.map((c) => scoreCandidate(c, profile, opts.hourLocal, now));
  return selectDiversified(scored, opts);
}
