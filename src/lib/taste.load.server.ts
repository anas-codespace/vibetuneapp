/**
 * taste.load.server.ts — shared loader that turns raw Supabase rows into a
 * TasteProfile. Used by `taste.functions.ts` (getTasteProfile) and by the
 * recommender / feed server functions so they don't have to re-implement the
 * cache-read + rebuild dance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import {
  buildTasteProfile,
  type ListeningEventInput,
  type LikeInput,
  type SearchEventInput,
  type TasteProfile,
} from "./taste.server";

export type Db = SupabaseClient<Database>;

/** How long a cached TasteProfile stays usable. */
export const TASTE_CACHE_TTL_MS = 60 * 60 * 1000;

/** Rebuild the profile from scratch and persist it into `user_taste_cache`. */
export async function rebuildTasteProfile(supabase: Db, userId: string): Promise<TasteProfile> {
  const sinceIso = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

  const [eventsRes, likesRes, searchesRes, profileRes] = await Promise.all([
    supabase
      .from("listening_events")
      .select(
        "youtube_id, title, artist, started_at, listened_ms, track_ms, end_reason, context_lang, hour_local",
      )
      .eq("user_id", userId)
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false })
      .limit(2000),
    supabase
      .from("liked_songs")
      .select("youtube_id, artist, created_at")
      .eq("user_id", userId)
      .limit(500),
    supabase
      .from("search_events")
      .select("normalized_query, language, resulted_in_play, created_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .limit(1000),
    supabase
      .from("profiles")
      .select("fav_languages, fav_artists")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const events: ListeningEventInput[] = (eventsRes.data ?? []).map((r) => ({
    youtube_id: r.youtube_id,
    title: r.title,
    artist: r.artist ?? "",
    started_at: r.started_at,
    listened_ms: r.listened_ms ?? 0,
    track_ms: r.track_ms ?? 0,
    end_reason: r.end_reason as ListeningEventInput["end_reason"],
    context_lang: r.context_lang ?? null,
    hour_local: r.hour_local ?? 0,
  }));

  const likes: LikeInput[] = (likesRes.data ?? []).map((r) => ({
    youtube_id: r.youtube_id,
    artist: r.artist ?? "",
    created_at: r.created_at,
  }));

  const searches: SearchEventInput[] = (searchesRes.data ?? []).map((r) => ({
    normalized_query: r.normalized_query,
    language: r.language,
    resulted_in_play: r.resulted_in_play,
    created_at: r.created_at,
  }));

  const rawFavArtists = (profileRes.data?.fav_artists ?? []) as Array<{ name?: string } | string>;
  const favArtistNames: string[] = rawFavArtists
    .map((x) => (typeof x === "string" ? x : (x?.name ?? "")))
    .filter((s): s is string => Boolean(s));

  const profile = buildTasteProfile({
    events,
    likes,
    searches,
    seed: {
      fav_languages: profileRes.data?.fav_languages ?? [],
      fav_artists: favArtistNames,
    },
  });

  await supabase.from("user_taste_cache").upsert(
    {
      user_id: userId,
      profile: JSON.parse(JSON.stringify(profile)),
      computed_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return profile;
}

/** Cache-first read. Rebuilds when missing or older than the TTL. */
export async function loadTasteProfile(supabase: Db, userId: string): Promise<TasteProfile> {
  const { data: cached } = await supabase
    .from("user_taste_cache")
    .select("profile, computed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (cached?.profile && cached.computed_at) {
    const ageMs = Date.now() - new Date(cached.computed_at).getTime();
    if (ageMs < TASTE_CACHE_TTL_MS) return cached.profile as unknown as TasteProfile;
  }

  return rebuildTasteProfile(supabase, userId);
}

// ---------------------------------------------------------------------------
// Feed section cache (stored alongside the profile in `user_taste_cache.feed`)
// ---------------------------------------------------------------------------

export interface CachedFeed {
  [sectionKind: string]: { tracks: unknown[]; computedAt: string } | undefined;
}

export async function readFeedCache(supabase: Db, userId: string): Promise<CachedFeed> {
  const { data } = await supabase
    .from("user_taste_cache")
    .select("feed")
    .eq("user_id", userId)
    .maybeSingle();
  return ((data?.feed ?? {}) as CachedFeed) ?? {};
}

export async function writeFeedCache(supabase: Db, userId: string, feed: CachedFeed): Promise<void> {
  await supabase
    .from("user_taste_cache")
    .upsert(
      { user_id: userId, feed: JSON.parse(JSON.stringify(feed)) },
      { onConflict: "user_id" },
    );
}
