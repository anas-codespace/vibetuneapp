/**
 * Trending near you — YouTube mostPopular (categoryId=10, regionCode=IN).
 *
 * Caching strategy:
 *  - Fresh TTL: 30 minutes. Within TTL we return the cached list directly.
 *  - Stale-on-error: if the upstream call fails after retries, we return the
 *    last successful payload (regardless of age) so the home feed never
 *    collapses to an error state.
 *
 * Retry lives in `fetchTrendingNearYou` (exponential backoff on 5xx / network).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTrendingNearYou, type YTTrack } from "./youtube.server";

interface CacheEntry {
  fetchedAt: number;
  region: string;
  tracks: YTTrack[];
}

const FRESH_MS = 30 * 60 * 1000; // 30 min
const CACHE = new Map<string, CacheEntry>();

export interface TrendingResponse {
  tracks: YTTrack[];
  region: string;
  fetchedAt: number;
  stale: boolean;
  source: "fresh" | "cache" | "stale-fallback" | "empty";
}

export const getTrendingNearYou = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        regionCode: z.string().min(2).max(4).optional(),
        max: z.number().int().min(1).max(50).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<TrendingResponse> => {
    const region = (data.regionCode ?? "IN").toUpperCase();
    const max = data.max ?? 25;
    const cacheKey = `${region}:${max}`;
    const now = Date.now();

    const cached = CACHE.get(cacheKey);
    if (cached && now - cached.fetchedAt < FRESH_MS) {
      return {
        tracks: cached.tracks,
        region: cached.region,
        fetchedAt: cached.fetchedAt,
        stale: false,
        source: "cache",
      };
    }

    try {
      const tracks = await fetchTrendingNearYou(region, max);
      if (tracks.length > 0) {
        const entry: CacheEntry = { fetchedAt: now, region, tracks };
        CACHE.set(cacheKey, entry);
        return { tracks, region, fetchedAt: now, stale: false, source: "fresh" };
      }
      // Empty upstream: prefer stale cache if we have one.
      if (cached) {
        return {
          tracks: cached.tracks,
          region: cached.region,
          fetchedAt: cached.fetchedAt,
          stale: true,
          source: "stale-fallback",
        };
      }
      return { tracks: [], region, fetchedAt: now, stale: false, source: "empty" };
    } catch (err) {
      console.error("[trending] fetch failed:", err);
      if (cached) {
        return {
          tracks: cached.tracks,
          region: cached.region,
          fetchedAt: cached.fetchedAt,
          stale: true,
          source: "stale-fallback",
        };
      }
      return { tracks: [], region, fetchedAt: now, stale: false, source: "empty" };
    }
  });
