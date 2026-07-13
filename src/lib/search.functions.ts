/**
 * search.functions.ts — Server function that drives the 4-stage cascade
 * planner (src/lib/search.ts) against Spotify + YouTube, and returns the
 * first accepted stage's results alongside metadata for the UI.
 *
 * The UI uses this to render a "Showing broader results" banner when
 * stage 4 (typo-tolerant) had to run.
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

async function runStage(stage: SearchStage, max: number): Promise<SpotifyPlayableResult[]> {
  // Spotify first (has richer metadata), fall back to YouTube-only.
  let spot: Awaited<ReturnType<typeof spotifySearchTracks>> = [];
  try {
    spot = await spotifySearchTracks(stage.query, Math.min(max, 20));
  } catch {
    spot = [];
  }

  if (spot.length > 0) {
    const resolved = await Promise.all(
      spot.map(async (t) => {
        try {
          const r = await resolveToYoutube(t);
          if (!r) return null;
          return {
            spotifyId: t.id,
            youtubeId: r.youtubeId,
            title: t.name,
            artist: t.artists.join(", "),
            album: t.album,
            albumArt: t.albumArt,
            durationSeconds: r.durationSeconds,
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

  // YouTube fallback for this stage.
  try {
    const yt = await searchMusic(stage.query, max);
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
  /** True when we fell through to stage 4 (typo-tolerant / broad). */
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

    let lastResults: SpotifyPlayableResult[] = [];
    let lastStage: SearchStage | null = null;

    for (const stage of stages) {
      const results = await runStage(stage, max);
      lastResults = results;
      lastStage = stage;
      const evalRes = evaluateStage(data.query, results.map(toLite));
      if (evalRes.accept) {
        return {
          results,
          acceptedStage: stage.kind,
          broadResults: stage.broadResults,
          correction: stage.kind === "typo_tolerant" ? stage.query : null,
        };
      }
    }

    // No stage cleared the acceptance threshold — return whatever the last
    // stage produced, and flag broadResults if we ended on typo_tolerant.
    return {
      results: lastResults,
      acceptedStage: lastStage?.kind ?? null,
      broadResults: lastStage?.broadResults ?? false,
      correction: lastStage?.kind === "typo_tolerant" ? lastStage.query : null,
    };
  });
