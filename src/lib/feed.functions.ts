/**
 * feed.functions.ts — orchestrates the home feed. Section layout, TTLs and
 * stale-fallback rules live in the pure `feed.server.ts`; this module only
 * supplies fetchers, cache reads/writes and auth.
 */

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  composeSection,
  planSections,
  titleFor,
  type CachedSection,
  type FeedSection,
  type FeedTrack,
  type SectionKind,
} from "./feed.server";
import {
  loadTasteProfile,
  readFeedCache,
  writeFeedCache,
  type CachedFeed,
  type Db,
} from "./taste.load.server";
import type { TasteProfile } from "./taste.server";
import { buildCandidatePool, recentlyPlayedIds } from "./recommender.functions";
import { recommendTracks } from "./recommender.server";
import { searchMusic, type YTTrack } from "./youtube.server";

const toFeedTrack = (t: YTTrack): FeedTrack => ({
  youtubeId: t.youtubeId,
  title: t.title,
  artist: t.artist,
  thumbnailUrl: t.thumbnailUrl,
  durationSeconds: t.durationSeconds,
});

function topLanguage(profile: TasteProfile): string | null {
  return Object.entries(profile.languageMix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function jumpBackIn(supabase: Db, userId: string): Promise<FeedTrack[]> {
  const { data } = await supabase
    .from("listening_events")
    .select("youtube_id, title, artist, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(60);

  const seen = new Set<string>();
  const out: FeedTrack[] = [];
  for (const r of data ?? []) {
    if (seen.has(r.youtube_id)) continue;
    seen.add(r.youtube_id);
    out.push({ youtubeId: r.youtube_id, title: r.title, artist: r.artist ?? "" });
    if (out.length >= 6) break;
  }
  return out;
}

export const getHomeFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeedSection[]> => {
    const supabase = context.supabase as Db;
    const userId = context.userId;

    const profile = await loadTasteProfile(supabase, userId);
    const cache = await readFeedCache(supabase, userId);
    const kinds = planSections(profile);
    const language = topLanguage(profile);
    const seedArtist = profile.recentSeeds[0] ?? profile.topArtists[0]?.name ?? undefined;
    const hourLocal = new Date().getUTCHours();

    // Shared, lazily-built pieces so we don't hit YouTube twice.
    let poolPromise: Promise<Awaited<ReturnType<typeof buildCandidatePool>>> | null = null;
    const pool = () => (poolPromise ??= buildCandidatePool(profile));
    let discoveryPoolPromise: Promise<Awaited<ReturnType<typeof buildCandidatePool>>> | null = null;
    const discoveryPool = () =>
      (discoveryPoolPromise ??= buildCandidatePool(profile, { discoveryBoost: true }));
    let excludePromise: Promise<Set<string>> | null = null;
    const exclude = () => (excludePromise ??= recentlyPlayedIds(supabase, userId));

    const fetcherFor = (kind: SectionKind): (() => Promise<FeedTrack[]>) => {
      switch (kind) {
        case "jump_back_in":
          return () => jumpBackIn(supabase, userId);
        case "because_you_listened_to":
          return async () => {
            if (!seedArtist) return [];
            const ts = await searchMusic(`${seedArtist} official audio`, 12);
            return ts.map(toFeedTrack);
          };
        case "made_for_you":
          return async () => {
            const [candidates, ex] = await Promise.all([pool(), exclude()]);
            return recommendTracks(candidates, profile, {
              count: 12,
              hourLocal,
              excludeYoutubeIds: ex,
            }).map((c) => ({
              youtubeId: c.youtubeId,
              title: c.title,
              artist: c.artist,
              thumbnailUrl: c.thumbnailUrl,
              durationSeconds: c.durationSeconds,
            }));
          };
        case "new_releases":
          return async () => {
            const lang = language ?? "tamil";
            const ts = await searchMusic(`new ${lang} songs latest official`, 14);
            return ts.map(toFeedTrack);
          };
        case "trending":
          return async () => {
            const lang = language ?? "tamil";
            const ts = await searchMusic(`trending ${lang} songs official`, 14);
            return ts.map(toFeedTrack);
          };
        case "discovery":
          return async () => {
            const [candidates, ex] = await Promise.all([discoveryPool(), exclude()]);
            return recommendTracks(candidates, profile, {
              count: 10,
              hourLocal,
              discoveryBoost: true,
              excludeYoutubeIds: ex,
            }).map((c) => ({
              youtubeId: c.youtubeId,
              title: c.title,
              artist: c.artist,
              thumbnailUrl: c.thumbnailUrl,
              durationSeconds: c.durationSeconds,
            }));
          };
      }
    };

    const sections = await Promise.all(
      kinds.map((kind) =>
        composeSection({
          kind,
          title: titleFor(kind, { seedArtist, language: language ?? undefined }),
          cached: (cache[kind] as CachedSection | undefined) ?? null,
          fetcher: fetcherFor(kind),
        }),
      ),
    );

    // Persist the freshest non-stale sections so the next visit is instant and
    // a provider outage still has something to serve.
    const nextCache: CachedFeed = { ...cache };
    const nowIso = new Date().toISOString();
    for (const s of sections) {
      if (!s.stale && s.tracks.length > 0) {
        nextCache[s.kind] = { tracks: s.tracks, computedAt: nowIso };
      }
    }
    await writeFeedCache(supabase, userId, nextCache).catch(() => undefined);

    return sections;
  });
