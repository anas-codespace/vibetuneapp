/**
 * taste.functions.ts — server-fn wrappers over the pure taste layer.
 *
 * Writes into `listening_events`, `search_events`, and refreshes the
 * `user_taste_cache` snapshot. All auth-gated.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TasteProfile } from "./taste.server";
import { loadTasteProfile, type Db } from "./taste.load.server";

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

export const getTasteProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TasteProfile> => {
    return loadTasteProfile(context.supabase as Db, context.userId);
  });
