/**
 * recommender.functions.ts — server-fn wrapper that assembles a candidate
 * pool (YouTube search around the listener's top artists + related-artist
 * neighbours) and ranks it with the pure recommender.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadTasteProfile } from "./taste.load.server";
import {
  recommendTracks,
  type Candidate,
  type ScoredCandidate,
} from "./recommender.server";
import type { TasteProfile } from "./taste.server";
import { searchMusic, relatedArtistNames, type YTTrack } from "./youtube.server";
import { isProviderError } from "./providerResult";
import type { Db } from "./taste.load.server";

const RECENT_EXCLUDE_WINDOW_MS = 6 * 60 * 60 * 1000;

function toCandidate(t: YTTrack, language: string | null, isDiscovery: boolean): Candidate {
  return {
    youtubeId: t.youtubeId,
    title: t.title,
    artist: t.artist,
    thumbnailUrl: t.thumbnailUrl,
    durationSeconds: t.durationSeconds,
    language,
    releasedAt: null,
    isDiscovery,
  };
}

/** Seeds used to build the candidate pool, honoring the cold-start state. */
export function seedsFor(profile: TasteProfile): { known: string[]; language: string | null } {
  const language =
    Object.entries(profile.languageMix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  if (profile.isColdStart === "active") {
    const recent = profile.recentSeeds.slice(0, 3);
    const top = profile.topArtists.slice(0, 3).map((a) => a.name);
    return { known: [...new Set([...recent, ...top])].slice(0, 4), language };
  }
  return { known: profile.topArtists.slice(0, 4).map((a) => a.name), language };
}

/** Tracks the listener played in the last 6h — excluded from recommendations. */
export async function recentlyPlayedIds(supabase: Db, userId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - RECENT_EXCLUDE_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("listening_events")
    .select("youtube_id")
    .eq("user_id", userId)
    .gte("started_at", since)
    .limit(200);
  return new Set((data ?? []).map((r) => r.youtube_id));
}

/** Build the raw candidate pool for a profile. Never throws. */
export async function buildCandidatePool(
  profile: TasteProfile,
  opts: { discoveryBoost?: boolean } = {},
): Promise<Candidate[]> {
  const { known, language } = seedsFor(profile);
  const pool: Candidate[] = [];

  if (known.length === 0) {
    const lang = language ?? "tamil";
    const trending = await searchMusic(`trending ${lang} songs official`, 24).catch(
      () => [] as YTTrack[],
    );
    return trending.map((t) => toCandidate(t, language, false));
  }

  const perSeed = await Promise.all(
    known.map(async (seed) => {
      const direct = await searchMusic(`${seed} official audio`, 10).catch(() => [] as YTTrack[]);
      const relatedRes = await relatedArtistNames(seed, opts.discoveryBoost ? 5 : 3).catch(
        () => null,
      );
      const related =
        relatedRes && !isProviderError(relatedRes) && relatedRes.status === "ok"
          ? relatedRes.data
          : [];
      const adjacent = await Promise.all(
        related.map((name) =>
          searchMusic(`${name} songs`, 6)
            .catch(() => [] as YTTrack[])
            .then((ts) => ts.map((t) => toCandidate(t, language, true))),
        ),
      );
      return [...direct.map((t) => toCandidate(t, language, false)), ...adjacent.flat()];
    }),
  );

  for (const list of perSeed) pool.push(...list);

  const seen = new Set<string>();
  return pool.filter((c) => {
    if (seen.has(c.youtubeId)) return false;
    seen.add(c.youtubeId);
    return true;
  });
}

export const getRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        count: z.number().int().min(1).max(40).default(12),
        discoveryBoost: z.boolean().optional(),
        hourLocal: z.number().int().min(0).max(23).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<ScoredCandidate[]> => {
    const { supabase, userId } = context;
    const profile = await loadTasteProfile(supabase as Db, userId);
    const [pool, exclude] = await Promise.all([
      buildCandidatePool(profile, { discoveryBoost: data.discoveryBoost }),
      recentlyPlayedIds(supabase as Db, userId),
    ]);
    return recommendTracks(pool, profile, {
      count: data.count,
      hourLocal: data.hourLocal ?? new Date().getUTCHours(),
      discoveryBoost: data.discoveryBoost,
      excludeYoutubeIds: exclude,
    });
  });
