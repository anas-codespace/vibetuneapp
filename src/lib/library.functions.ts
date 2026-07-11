import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TrackInput = z.object({
  youtubeId: z.string().min(1).max(40),
  title: z.string().min(1).max(300),
  artist: z.string().min(1).max(200),
  thumbnailUrl: z.string().url().nullable().optional(),
});

export const getLikedSongs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("liked_songs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getLikedIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("liked_songs")
      .select("youtube_id")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.youtube_id);
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TrackInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("liked_songs")
      .select("id")
      .eq("user_id", userId)
      .eq("youtube_id", data.youtubeId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("liked_songs")
        .delete()
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
    const { error } = await supabase.from("liked_songs").insert({
      user_id: userId,
      youtube_id: data.youtubeId,
      title: data.title,
      artist: data.artist,
      thumbnail_url: data.thumbnailUrl ?? null,
    });
    if (error) throw new Error(error.message);
    return { liked: true };
  });

export const getMyPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: playlists, error } = await supabase
      .from("playlists")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Get song counts
    const ids = (playlists ?? []).map((p) => p.id);
    let counts = new Map<string, number>();
    if (ids.length) {
      const { data: songs } = await supabase
        .from("playlist_songs")
        .select("playlist_id, thumbnail_url")
        .in("playlist_id", ids);
      const byId = new Map<string, { count: number; thumb: string | null }>();
      for (const s of songs ?? []) {
        const cur = byId.get(s.playlist_id) ?? { count: 0, thumb: null };
        cur.count += 1;
        if (!cur.thumb && s.thumbnail_url) cur.thumb = s.thumbnail_url;
        byId.set(s.playlist_id, cur);
      }
      return (playlists ?? []).map((p) => ({
        ...p,
        song_count: byId.get(p.id)?.count ?? 0,
        first_thumb: byId.get(p.id)?.thumb ?? null,
      }));
    }
    return (playlists ?? []).map((p) => ({ ...p, song_count: 0, first_thumb: null }));
  });

export const createPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ name: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("playlists")
      .insert({ user_id: userId, name: data.name })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("playlists")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: playlist, error } = await supabase
      .from("playlists")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!playlist) return null;
    const { data: songs } = await supabase
      .from("playlist_songs")
      .select("*")
      .eq("playlist_id", playlist.id)
      .order("position", { ascending: true });
    return { playlist, songs: songs ?? [] };
  });

export const addToPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ playlistId: z.string().uuid(), track: TrackInput }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("playlist_songs")
      .select("*", { count: "exact", head: true })
      .eq("playlist_id", data.playlistId);
    const { error } = await supabase.from("playlist_songs").insert({
      playlist_id: data.playlistId,
      user_id: userId,
      youtube_id: data.track.youtubeId,
      title: data.track.title,
      artist: data.track.artist,
      thumbnail_url: data.track.thumbnailUrl ?? null,
      position: count ?? 0,
    });
    if (error && !error.message.includes("duplicate")) {
      throw new Error(error.message);
    }
    await supabase
      .from("playlists")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.playlistId)
      .eq("user_id", userId);
    return { ok: true };
  });

export const removeFromPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ playlistId: z.string().uuid(), youtubeId: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", data.playlistId)
      .eq("user_id", userId)
      .eq("youtube_id", data.youtubeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkAddToPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        playlistId: z.string().uuid(),
        tracks: z.array(TrackInput).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("playlist_songs")
      .select("*", { count: "exact", head: true })
      .eq("playlist_id", data.playlistId);
    const base = count ?? 0;

    // Skip tracks already in the playlist
    const ids = data.tracks.map((t) => t.youtubeId);
    const { data: existing } = await supabase
      .from("playlist_songs")
      .select("youtube_id")
      .eq("playlist_id", data.playlistId)
      .in("youtube_id", ids);
    const have = new Set((existing ?? []).map((r) => r.youtube_id));

    const rows = data.tracks
      .filter((t) => !have.has(t.youtubeId))
      .map((t, i) => ({
        playlist_id: data.playlistId,
        user_id: userId,
        youtube_id: t.youtubeId,
        title: t.title,
        artist: t.artist,
        thumbnail_url: t.thumbnailUrl ?? null,
        position: base + i,
      }));

    if (rows.length) {
      const { error } = await supabase.from("playlist_songs").insert(rows);
      if (error) throw new Error(error.message);
    }
    await supabase
      .from("playlists")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.playlistId)
      .eq("user_id", userId);
    return { added: rows.length, skipped: data.tracks.length - rows.length };
  });

export const getListeningStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("listening_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    const { data: distinct } = await supabase
      .from("listening_history")
      .select("youtube_id")
      .eq("user_id", userId);
    const uniqueSongs = new Set((distinct ?? []).map((d) => d.youtube_id)).size;
    // Estimate minutes: 3.5 min average per play
    const minutes = Math.round((count ?? 0) * 3.5);
    return {
      totalPlays: count ?? 0,
      uniqueSongs,
      totalMinutes: minutes,
    };
  });

export const updateProfilePic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ profile_pic_url: data.url })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ name: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: data.name })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
