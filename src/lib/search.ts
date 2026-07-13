/**
 * search.ts — Pure 4-stage Hybrid Cascading Search planner.
 *
 * This module does NOT call any API. It plans the sequence of queries a
 * caller should try, and grades the raw results after each stage so the
 * caller can decide whether to stop or move to the next stage.
 *
 * Stage 1: quoted query + language suffix         (highest precision)
 * Stage 2: unquoted query + language suffix       (context, looser)
 * Stage 3: raw unquoted query                     (broad match)
 * Stage 4: unquoted + typo-tolerant transliteration; flag "broadResults"
 */

export type SearchStageKind =
  | "quoted_lang"
  | "unquoted_lang"
  | "raw"
  | "typo_tolerant";

export interface SearchStage {
  kind: SearchStageKind;
  query: string;
  /** True when the caller should mark returned results as "broader match". */
  broadResults: boolean;
}

export interface SearchPlanInput {
  rawQuery: string;
  /** e.g. "tamil", "hindi"; empty string skips the language suffix. */
  language?: string;
  /** Provide when known — used by stage 4 for typo tolerance. */
  transliterations?: string[];
}

export function planSearchStages(input: SearchPlanInput): SearchStage[] {
  const q = (input.rawQuery ?? "").trim();
  if (!q) return [];
  const lang = (input.language ?? "").trim().toLowerCase();
  const withLang = (s: string) => (lang ? `${s} ${lang} song` : s);

  const stages: SearchStage[] = [];
  if (lang) {
    stages.push({ kind: "quoted_lang", query: withLang(`"${q}"`), broadResults: false });
    stages.push({ kind: "unquoted_lang", query: withLang(q), broadResults: false });
  } else {
    stages.push({ kind: "quoted_lang", query: `"${q}"`, broadResults: false });
  }
  stages.push({ kind: "raw", query: q, broadResults: false });

  const translits = (input.transliterations ?? []).filter((t) => t && t.trim() && t.trim() !== q);
  if (translits.length) {
    stages.push({
      kind: "typo_tolerant",
      query: `${q} ${translits.join(" ")}`.trim(),
      broadResults: true,
    });
  }
  return stages;
}

export interface SearchResultLite {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
}

/** Simple token overlap score in 0..1. Used to decide whether to stop cascading. */
export function relevanceScore(query: string, r: SearchResultLite): number {
  const q = tokenize(query);
  if (!q.length) return 0;
  const hay = tokenize(`${r.title} ${r.artist} ${r.album ?? ""}`);
  if (!hay.length) return 0;
  const hSet = new Set(hay);
  let hit = 0;
  for (const t of q) if (hSet.has(t)) hit++;
  return hit / q.length;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/["'.,()\[\]!?]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Threshold below which the cascade proceeds to the next stage. */
export const MIN_ACCEPTABLE_TOP_SCORE = 0.5;
/** Minimum number of on-topic (>= threshold) results to accept a stage. */
export const MIN_ACCEPTABLE_HITS = 3;

export interface StageEvaluation {
  accept: boolean;
  hits: number;
  topScore: number;
}

export function evaluateStage(query: string, results: SearchResultLite[]): StageEvaluation {
  if (!results.length) return { accept: false, hits: 0, topScore: 0 };
  const scored = results.map((r) => relevanceScore(query, r));
  const hits = scored.filter((s) => s >= MIN_ACCEPTABLE_TOP_SCORE).length;
  const topScore = Math.max(...scored);
  return {
    accept: hits >= MIN_ACCEPTABLE_HITS && topScore >= MIN_ACCEPTABLE_TOP_SCORE,
    hits,
    topScore,
  };
}
