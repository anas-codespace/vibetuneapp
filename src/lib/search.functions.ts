/**
 * search.functions.ts — Server function that drives the 4-stage cascade
 * planner (src/lib/search.ts) against Spotify + YouTube, and returns the
 * first accepted stage's results alongside metadata for the UI.
 *
 * The UI uses this to render a "Showing related results" banner when a
 * broader stage (raw / typo-tolerant / relaxed) produced the results.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  planSearchStages,
  evaluateStage,
  type SearchStage,
  type SearchResultLite,
} from "./search";
import { searchTracks as spotifySearchTracks, type SpotifyPlayableResult } from "./spotify.server";
import { searchMusic } from "./youtube.server";

async function runStage(
  stage: SearchStage,
  rawQuery: string,
  language: string | undefined,
  max: number,
): Promise<SpotifyPlayableResult[]> {
  // ---- Spotify probe ----
  let spot: Awaited<ReturnType<typeof spotifySearchTracks>> = [];
  try {
    spot = await spotifySearchTracks(stage.query, Math.min(max, 20));
  } catch {
    spot = [];
  }
  // Stage 1 uses a quoted phrase. If Spotify's strict phrase returned 0,
  // retry with an unquoted variant of the same stage before giving up.
  if (spot.length === 0 && stage.query.includes('"')) {
    const unquoted = stage.query.replace(/"/g, "").replace(/\s+/g, " ").trim();
    try {
      spot = await spotifySearchTracks(unquoted, Math.min(max, 20));
    } catch {
      spot = [];
    }
  }

  if (spot.length > 0) {
    const resolved = await Promise.all(
      spot.map(async (t) => {
        try {
          const primary = t.artists[0] ?? "";
          const targetSec = Math.round(t.durationMs / 1000);
          // Spotify already gave us title/artist — resolve with a *relaxed*
          // YouTube lookup so non-whitelisted uploads (indie/regional labels)
          // are not silently dropped by the strict Quality Gate.
          const yt = await searchMusic(`${primary} ${t.name}`, 3, { relaxed: true });
          if (yt.length === 0) return null;
          const best = [...yt].sort(
            (a, b) => Math.abs(a.durationSeconds - targetSec) - Math.abs(b.durationSeconds - targetSec),
          )[0];
          return {
            spotifyId: t.id,
            youtubeId: best.youtubeId,
            title: t.name,
            artist: t.artists.join(", "),
            album: t.album,
            albumArt: t.albumArt,
            durationSeconds: best.durationSeconds || targetSec,
          } satisfies SpotifyPlayableResult;
        } catch {
          return null;
        }
      }),
    );
    const seen = new Set<string>();
    const out: SpotifyPlayableResult[] = [];
    for (const r of resolved) {
      if (!r || seen.has(r.youtubeId)) continue;
      seen.add(r.youtubeId);
      out.push(r);
    }
    if (out.length) return out;
  }

  // ---- YouTube fallback ----
  // Pass the RAW user query (never the quoted / language-suffixed stage.query)
  // so YouTube's own hybrid cascade inside youtube.server.ts can do its job.
  // The stage merely governs whether we forward the language hint and whether
  // we accept a relaxed pass.
  const wantLanguage = stage.kind === "quoted_lang" || stage.kind === "unquoted_lang";
  const wantRelaxed = stage.kind === "raw" || stage.kind === "typo_tolerant";
  try {
    const yt = await searchMusic(rawQuery, max, {
      language: wantLanguage ? language : undefined,
      relaxed: wantRelaxed,
    });
    return yt.map((t) => ({
      spotifyId: `yt:${t.youtubeId}`,
      youtubeId: t.youtubeId,
      title: t.title,
      artist: t.artist,
      album: t.album ?? "",
      albumArt: t.thumbnailUrl ?? null,
      durationSeconds: t.durationSeconds,
    }));
  } catch {
    return [];
  }
}

const toLite = (r: SpotifyPlayableResult): SearchResultLite => ({
  id: r.youtubeId,
  title: r.title,
  artist: r.artist,
  album: r.album ?? null,
});

export interface CascadeResponse {
  results: SpotifyPlayableResult[];
  /** Which planned stage produced the accepted results. */
  acceptedStage: SearchStage["kind"] | null;
  /** True when the results came from a broader stage (raw / typo-tolerant)
   *  or a relaxed fallback — i.e. NOT a perfect strict match. UI should show
   *  "Showing related results for …". */
  broadResults: boolean;
  /** Optional "did you mean" from transliteration fallback. */
  correction: string | null;
}

export const searchCascade = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        query: z.string().min(1).max(200),
        language: z.string().min(1).max(40).optional(),
        max: z.number().int().min(1).max(40).optional(),
        transliterations: z.array(z.string().max(80)).max(6).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CascadeResponse> => {
    const max = data.max ?? 24;
    const stages = planSearchStages({
      rawQuery: data.query,
      language: data.language,
      transliterations: data.transliterations,
    });

    let bestResults: SpotifyPlayableResult[] = [];
    let bestStage: SearchStage | null = null;

    for (const stage of stages) {
      const results = await runStage(stage, data.query, data.language, max);
      if (results.length > bestResults.length) {
        bestResults = results;
        bestStage = stage;
      }
      const evalRes = evaluateStage(data.query, results.map(toLite));
      if (evalRes.accept) {
        const isBroad =
          stage.broadResults ||
          stage.kind === "raw" ||
          stage.kind === "typo_tolerant";
        return {
          results,
          acceptedStage: stage.kind,
          broadResults: isBroad,
          correction: stage.kind === "typo_tolerant" ? stage.query : null,
        };
      }
    }

    // No stage cleared the acceptance threshold — return the largest stage's
    // output. broadResults=true because it's not a strict match.
    return {
      results: bestResults,
      acceptedStage: bestStage?.kind ?? null,
      broadResults: bestResults.length > 0,
      correction: bestStage?.kind === "typo_tolerant" ? bestStage.query : null,
    };
  });
