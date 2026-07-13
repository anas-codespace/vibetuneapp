/**
 * taste.functions.ts — server-fn wrappers over the pure taste layer.
 *
 * Writes into `listening_events`, `search_events`, and refreshes the
 * `user_taste_cache` snapshot. All auth-gated.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildTasteProfile,
  type ListeningEventInput,
  type LikeInput,
  type SearchEventInput,
  type TasteProfile,
} from "./taste.server";

// ---------------------------------------------------------------------------
// logListenEvent — every play transition writes one row.
// ---------------------------------------------------------------------------

const endReasonEnum = z.enum([
  "completed",
  "skipped_early",
  "skipped_late",
  "next_pressed",
  "prev_pressed",
  "error",
  "abandoned",
]);

const sourceEnum = z.enum([
  "search",
  "feed",
  "queue",
  "mix",
  "playlist",
  "liked",
  "related",
  "unknown",
]);

const listenSchema = z.object({
  youtubeId: z.string().min(1),
  title: z.string().default(""),
  artist: z.string().default(""),
  startedAt: z.string(), // ISO
  listenedMs: z.number().int().min(0),
  trackMs: z.number().int().min(0),
  endReason: endReasonEnum,
  source: sourceEnum.default("queue"),
  contextLang: z.string().nullable().optional(),
  hourLocal: z.number().int().min(0).max(23),
});

export const logListenEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("listening_events").insert({
      user_id: userId,
      youtube_id: data.youtubeId,
      title: data.title,
      artist: data.artist,
      started_at: data.startedAt,
      ended_at: new Date().toISOString(),
      listened_ms: data.listenedMs,
      track_ms: data.trackMs,
      end_reason: data.endReason,
      source: data.source,
      context_lang: data.contextLang ?? null,
      hour_local: data.hourLocal,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// logSearchEvent — one row per user search.
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  rawQuery: z.string().min(1),
  language: z.string().nullable().optional(),
  topResultYoutubeId: z.string().nullable().optional(),
});

function normalizeQuery(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

export const logSearchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("search_events")
      .insert({
        user_id: userId,
        raw_query: data.rawQuery,
        normalized_query: normalizeQuery(data.rawQuery),
        language: data.language ?? null,
        top_result_youtube_id: data.topResultYoutubeId ?? null,
        resulted_in_play: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

// ---------------------------------------------------------------------------
// markSearchPlayed — call within 60s of a play that came from search results.
// ---------------------------------------------------------------------------

const markSchema = z.object({
  searchEventId: z.string().uuid(),
  youtubeId: z.string().min(1),
});

export const markSearchPlayed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => markSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("search_events")
      .update({
        resulted_in_play: true,
        top_result_youtube_id: data.youtubeId,
      })
      .eq("id", data.searchEventId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// getTasteProfile — reads cache, rebuilds if >1h stale.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000;

export const getTasteProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TasteProfile> => {
    const { supabase, userId } = context;

    // Cache hit?
    const { data: cached } = await supabase
      .from("user_taste_cache")
      .select("profile, computed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (cached && cached.profile && cached.computed_at) {
      const ageMs = Date.now() - new Date(cached.computed_at).getTime();
      if (ageMs < CACHE_TTL_MS) {
        return cached.profile as unknown as TasteProfile;
      }
    }

    // Rebuild.
    const sinceIso = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const [eventsRes, likesRes, searchesRes, profileRes] = await Promise.all([
      supabase
        .from("listening_events")
        .select("youtube_id, title, artist, started_at, listened_ms, track_ms, end_reason, context_lang, hour_local")
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
      .map((x) => (typeof x === "string" ? x : x?.name ?? ""))
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

    await supabase
      .from("user_taste_cache")
      .upsert(
        {
          user_id: userId,
          profile: JSON.parse(JSON.stringify(profile)),
          computed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    return profile;
  });
