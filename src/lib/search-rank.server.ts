/**
 * search-rank.server.ts — Pure re-ranker layered on top of the existing
 * YouTube + Spotify cascade. Does not fetch; consumes candidates the
 * cascade returned and re-orders them by an explicit, tunable score.
 */

import type { TasteProfile } from "./taste.server";
import { normalizeArtistName, normalizeLang } from "./taste.server";

export const SEARCH_WEIGHTS = {
  exactMatchTier: 0.4,
  languageAffinity: 0.25,
  artistAffinity: 0.15,
  qualitySignal: 0.1,
  popularityHint: 0.1,
} as const;

export interface SearchCandidate {
  youtubeId: string;
  title: string;
  artist: string;
  album?: string;
  language?: string | null;
  /** 0 fuzzy → 3 quoted-exact. Provided by the ranker helper below. */
  matchTier?: number;
  /** 0..1 — from HIGH_QUALITY_RE / channel whitelist. */
  qualitySignal?: number;
  /** 0..1 — Spotify popularity if known. */
  popularity?: number;
}

export interface RankedSearchCandidate extends SearchCandidate {
  score: number;
}

/**
 * Compute the tier for a candidate against a raw user query.
 *   3 = full quoted-exact phrase appears in title or album
 *   2 = every token appears (in any order)
 *   1 = at least one token appears
 *   0 = no direct token match (fuzzy hit only)
 */
export function matchTierFor(query: string, c: SearchCandidate): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const hay = `${c.title ?? ""} ${c.album ?? ""} ${c.artist ?? ""}`.toLowerCase();
  if (hay.includes(q)) return 3;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  if (hits === tokens.length) return 2;
  if (hits > 0) return 1;
  return 0;
}

export function scoreSearchCandidate(
  query: string,
  c: SearchCandidate,
  profile: TasteProfile | null,
): RankedSearchCandidate {
  const tier = c.matchTier ?? matchTierFor(query, c);
  const tierNorm = tier / 3;

  const lang = normalizeLang(c.language ?? "");
  const languageAffinity = profile && lang ? profile.languageMix[lang] ?? 0 : 0;

  let artistAff = 0;
  if (profile) {
    const a = normalizeArtistName(c.artist);
    const top = profile.topArtists[0]?.score ?? 0;
    const hit = profile.topArtists.find((x) => x.name === a);
    artistAff = hit && top > 0 ? Math.min(1, hit.score / top) : 0;
  }

  const score =
    SEARCH_WEIGHTS.exactMatchTier * tierNorm +
    SEARCH_WEIGHTS.languageAffinity * languageAffinity +
    SEARCH_WEIGHTS.artistAffinity * artistAff +
    SEARCH_WEIGHTS.qualitySignal * (c.qualitySignal ?? 0) +
    SEARCH_WEIGHTS.popularityHint * (c.popularity ?? 0);

  return { ...c, matchTier: tier, score };
}

/**
 * Re-rank a candidate list. If ≥3 results are at the top tier (3), only
 * those are returned — this keeps exact matches from being drowned out by
 * a well-scored fuzzy result.
 */
export function rankSearchResults(
  query: string,
  candidates: SearchCandidate[],
  profile: TasteProfile | null,
): RankedSearchCandidate[] {
  const scored = candidates.map((c) => scoreSearchCandidate(query, c, profile));
  const tier3 = scored.filter((s) => (s.matchTier ?? 0) === 3);
  const pool = tier3.length >= 3 ? tier3 : scored;
  return pool.sort((a, b) => b.score - a.score);
}
