/** Server function that drives the search cascade across Spotify + YouTube. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { planSearchStages, evaluateStage, type SearchStage, type SearchResultLite } from "./search";
import { searchTracks as spotifySearchTracks, type SpotifyPlayableResult } from "./spotify.server";
import { searchMusicResult } from "./youtube.server";
import { isProviderError, providerOk, type ProviderName, type ProviderResult } from "./providerResult";

const SEARCH_TRACE_QUERY = "jailer 2";
const shouldTraceSearch = (query: string) => query.trim().toLowerCase() === SEARCH_TRACE_QUERY;

function safeJsonForTrace(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type ProviderErr = Extract<ProviderResult<never>, { status: "error" }>;

async function runStage(
  stage: SearchStage,
  rawQuery: string,
  language: string | undefined,
  max: number,
): Promise<ProviderResult<SpotifyPlayableResult[]>> {
  const trace = shouldTraceSearch(rawQuery);
  if (trace) console.log("[search-trace][cascade.runStage] start", { stage, rawQuery, language, max });

  let lastProviderError: ProviderErr | null = null;
  let spot = await spotifySearchTracks(stage.query, Math.min(max, 20));
  if (isProviderError(spot)) {
    lastProviderError = spot;
    console.error("[search] spotify stage error", { stage: stage.kind, query: stage.query, httpStatus: spot.httpStatus, reason: spot.reason });
  }
  if (trace) console.log("[search-trace][cascade.runStage] spotify-probe-result", { stage: stage.kind, querySent: stage.query, status: spot.status, count: spot.status === "ok" ? spot.data.length : 0, error: spot.status === "error" ? spot : null, results: spot.status === "ok" ? safeJsonForTrace(spot.data) : "[]" });

  if (spot.status === "ok" && spot.data.length === 0 && stage.query.includes('"')) {
    const unquoted = stage.query.replace(/"/g, "").replace(/\s+/g, " ").trim();
    spot = await spotifySearchTracks(unquoted, Math.min(max, 20));
    if (isProviderError(spot)) {
      lastProviderError = spot;
      console.error("[search] spotify unquoted retry error", { stage: stage.kind, query: unquoted, httpStatus: spot.httpStatus, reason: spot.reason });
    }
    if (trace) console.log("[search-trace][cascade.runStage] spotify-unquoted-retry-result", { stage: stage.kind, querySent: unquoted, status: spot.status, count: spot.status === "ok" ? spot.data.length : 0, error: spot.status === "error" ? spot : null, results: spot.status === "ok" ? safeJsonForTrace(spot.data) : "[]" });
  }

  if (spot.status === "ok" && spot.data.length > 0) {
    const resolved = await Promise.all(
      spot.data.map(async (t) => {
        const primary = t.artists[0] ?? "";
        const targetSec = Math.round(t.durationMs / 1000);
        const yt = await searchMusicResult(`${primary} ${t.name}`, 3, { relaxed: true });
        if (isProviderError(yt)) {
          console.error("[search] per-track YouTube resolve error", { stage: stage.kind, query: `${primary} ${t.name}`, httpStatus: yt.httpStatus, reason: yt.reason });
          return { track: null as SpotifyPlayableResult | null, error: yt as ProviderErr };
        }
        if (trace) console.log("[search-trace][cascade.runStage] resolve-track-youtube", { stage: stage.kind, spotifyTrack: t, youtubeQuery: `${primary} ${t.name}`, targetSec, youtubeCount: yt.data.length, youtubeResults: safeJsonForTrace(yt.data) });
        if (yt.data.length === 0) return { track: null as SpotifyPlayableResult | null, error: null as ProviderErr | null };
        const best = [...yt.data].sort((a, b) => Math.abs(a.durationSeconds - targetSec) - Math.abs(b.durationSeconds - targetSec))[0];
        return {
          error: null as ProviderErr | null,
          track: {
            spotifyId: t.id,
            youtubeId: best.youtubeId,
            title: t.name,
            artist: t.artists.join(", "),
            album: t.album,
            albumArt: t.albumArt,
            durationSeconds: best.durationSeconds || targetSec,
          } satisfies SpotifyPlayableResult,
        };
      }),
    );
    const seen = new Set<string>();
    const out: SpotifyPlayableResult[] = [];
    for (const r of resolved) {
      if (r.error) lastProviderError = r.error;
      if (!r.track || seen.has(r.track.youtubeId)) continue;
      seen.add(r.track.youtubeId);
      out.push(r.track);
    }
    if (trace) console.log("[search-trace][cascade.runStage] spotify-after-resolution-dedup", { stage: stage.kind, beforeResolveCount: spot.data.length, resolvedNonNullCount: resolved.filter((r) => !!r.track).length, afterDedupCount: out.length, results: safeJsonForTrace(out) });
    if (out.length) return providerOk(out);
  }

  const wantLanguage = stage.kind === "quoted_lang" || stage.kind === "unquoted_lang";
  const wantRelaxed = stage.kind === "raw" || stage.kind === "typo_tolerant";
  if (trace) console.log("[search-trace][cascade.runStage] youtube-fallback-start", { stage: stage.kind, rawQuerySent: rawQuery, options: { language: wantLanguage ? language : undefined, relaxed: wantRelaxed } });
  const yt = await searchMusicResult(rawQuery, max, { language: wantLanguage ? language : undefined, relaxed: wantRelaxed });
  if (isProviderError(yt)) {
    console.error("[search] YouTube fallback error", { stage: stage.kind, httpStatus: yt.httpStatus, reason: yt.reason });
    return yt;
  }
  if (trace) console.log("[search-trace][cascade.runStage] youtube-fallback-result", { stage: stage.kind, count: yt.data.length, results: safeJsonForTrace(yt.data) });
  if (yt.data.length === 0 && lastProviderError) return providerOk([]);
  return providerOk(yt.data.map((t) => ({ spotifyId: `yt:${t.youtubeId}`, youtubeId: t.youtubeId, title: t.title, artist: t.artist, album: t.album ?? "", albumArt: t.thumbnailUrl ?? null, durationSeconds: t.durationSeconds })));
}

const toLite = (r: SpotifyPlayableResult): SearchResultLite => ({ id: r.youtubeId, title: r.title, artist: r.artist, album: r.album ?? null });

export interface CascadeProviderError {
  provider: ProviderName;
  reason: string;
  httpStatus: number;
  stage: SearchStage["kind"];
}

export interface CascadeResponse {
  results: SpotifyPlayableResult[];
  acceptedStage: SearchStage["kind"] | null;
  broadResults: boolean;
  correction: string | null;
  unavailable: boolean;
  providerErrors: CascadeProviderError[];
}

export const searchCascade = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().min(1).max(200), language: z.string().min(1).max(40).optional(), max: z.number().int().min(1).max(40).optional(), transliterations: z.array(z.string().max(80)).max(6).optional() }).parse(d))
  .handler(async ({ data }): Promise<CascadeResponse> => {
    const max = data.max ?? 24;
    const stages = planSearchStages({ rawQuery: data.query, language: data.language, transliterations: data.transliterations });
    const trace = shouldTraceSearch(data.query);
    if (trace) console.log("[search-trace][cascade] input", { data, max, stages });

    let bestResults: SpotifyPlayableResult[] = [];
    let bestStage: SearchStage | null = null;
    const providerErrors: CascadeProviderError[] = [];
    let stagesWithProviderError = 0;

    for (const stage of stages) {
      if (trace) console.log("[search-trace][cascade] stage-start", { stage });
      const result = await runStage(stage, data.query, data.language, max);
      if (isProviderError(result)) {
        stagesWithProviderError += 1;
        providerErrors.push({ provider: result.provider, reason: result.reason, httpStatus: result.httpStatus, stage: stage.kind });
        if (trace) console.error("[search-trace][cascade] stage-provider-error", { stage, error: result });
        continue;
      }
      const results = result.data;
      if (trace) console.log("[search-trace][cascade] stage-results-before-best-check", { stage, count: results.length, results: safeJsonForTrace(results) });
      if (results.length > bestResults.length) {
        bestResults = results;
        bestStage = stage;
      }
      const evalRes = evaluateStage(data.query, results.map(toLite));
      if (trace) console.log("[search-trace][cascade] stage-evaluation", { stage, evalRes, lite: safeJsonForTrace(results.map(toLite)), bestStage: bestStage?.kind ?? null, bestCount: bestResults.length });
      if (evalRes.accept) {
        const isBroad = stage.broadResults || stage.kind === "raw" || stage.kind === "typo_tolerant";
        return { results, acceptedStage: stage.kind, broadResults: isBroad, correction: stage.kind === "typo_tolerant" ? stage.query : null, unavailable: false, providerErrors };
      }
    }

    const unavailable = bestResults.length === 0 && providerErrors.length > 0 && stagesWithProviderError === stages.length;
    if (trace) console.log("[search-trace][cascade] fallback-return-best", { acceptedStage: bestStage?.kind ?? null, broadResults: bestResults.length > 0, count: bestResults.length, unavailable, providerErrors, results: safeJsonForTrace(bestResults) });
    return { results: bestResults, acceptedStage: bestStage?.kind ?? null, broadResults: bestResults.length > 0, correction: bestStage?.kind === "typo_tolerant" ? bestStage.query : null, unavailable, providerErrors };
  });