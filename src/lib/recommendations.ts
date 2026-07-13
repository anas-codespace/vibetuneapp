/**
 * recommendations.ts — Pure recommendation scoring.
 *
 * score = 0.40*genreMatch + 0.25*artistAffinity + 0.15*languageMatch
 *       + 0.10*recencyBoost + 0.10*discoveryBonus
 *
 * All inputs are plain data so this can be unit-tested without a DB.
 */

export const REC_WEIGHTS = {
  genre: 0.40,
  artist: 0.25,
  language: 0.15,
  recency: 0.10,
  discovery: 0.10,
} as const;

/** Max tracks per artist in a top-N list (deduplication cap). */
export const MAX_TRACKS_PER_ARTIST = 2;

export interface CandidateTrack {
  id: string;
  title: string;
  artist: string;
  genre?: string | null;
  language?: string | null;
  /** ISO timestamp of publish/release. */
  publishedAt?: string | null;
}

export interface TasteVector {
  /** artist name (normalized) → weight */
  artists: Record<string, number>;
  /** genre → weight */
  genres: Record<string, number>;
  /** language → weight */
  languages: Record<string, number>;
  /** 0..1 openness to unfamiliar artists */
  discoveryOpenness: number;
  /** artists the user has already heard recently, used to bias toward discovery */
  recentSeeds?: string[];
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function affinity(map: Record<string, number>, key: string): number {
  const v = map[norm(key)];
  if (!v || v <= 0) return 0;
  // Squash into 0..1 using a soft cap.
  return Math.min(1, v / (v + 5));
}

/** Newer tracks score higher; ~1 for <30d, ~0 for >2y. */
export function recencyBoost(publishedAt: string | null | undefined, now: Date = new Date()): number {
  if (!publishedAt) return 0.3;
  const t = new Date(publishedAt).getTime();
  if (!isFinite(t)) return 0.3;
  const ageDays = Math.max(0, (now.getTime() - t) / 86_400_000);
  if (ageDays <= 30) return 1;
  if (ageDays >= 730) return 0;
  return 1 - (ageDays - 30) / 700;
}

/** Discovery bonus: unfamiliar artist × user's openness. */
export function discoveryBonus(track: CandidateTrack, taste: TasteVector): number {
  const a = norm(track.artist);
  if (!a) return 0;
  const known = a in taste.artists || (taste.recentSeeds ?? []).some((s) => norm(s) === a);
  return known ? 0 : Math.max(0, Math.min(1, taste.discoveryOpenness));
}

export function scoreTrack(track: CandidateTrack, taste: TasteVector, now: Date = new Date()): number {
  const g = affinity(taste.genres, track.genre ?? "");
  const a = affinity(taste.artists, track.artist);
  const l = affinity(taste.languages, track.language ?? "");
  const r = recencyBoost(track.publishedAt, now);
  const d = discoveryBonus(track, taste);
  return (
    REC_WEIGHTS.genre * g +
    REC_WEIGHTS.artist * a +
    REC_WEIGHTS.language * l +
    REC_WEIGHTS.recency * r +
    REC_WEIGHTS.discovery * d
  );
}

/** Rank candidates and enforce max-per-artist cap. */
export function rankRecommendations(
  candidates: CandidateTrack[],
  taste: TasteVector,
  opts: { limit?: number; maxPerArtist?: number; now?: Date } = {},
): Array<CandidateTrack & { score: number }> {
  const limit = opts.limit ?? 20;
  const maxPer = opts.maxPerArtist ?? MAX_TRACKS_PER_ARTIST;
  const now = opts.now ?? new Date();

  const scored = candidates.map((t) => ({ ...t, score: scoreTrack(t, taste, now) }));
  scored.sort((a, b) => b.score - a.score);

  const perArtist = new Map<string, number>();
  const out: Array<CandidateTrack & { score: number }> = [];
  for (const t of scored) {
    const key = norm(t.artist);
    const used = perArtist.get(key) ?? 0;
    if (used >= maxPer) continue;
    perArtist.set(key, used + 1);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
