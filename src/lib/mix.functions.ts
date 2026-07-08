import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchMusic, type YTTrack } from "./youtube.server";

/** Interleave tracks so no two consecutive songs share the same artist. */
function interleave(tracks: YTTrack[]): YTTrack[] {
  if (tracks.length <= 2) return tracks;

  const byArtist = new Map<string, YTTrack[]>();
  for (const t of tracks) {
    const key = t.artist.toLowerCase();
    const bucket = byArtist.get(key) ?? [];
    bucket.push(t);
    byArtist.set(key, bucket);
  }

  // Sort buckets largest-first so the round-robin stays fair
  const buckets = [...byArtist.values()].sort((a, b) => b.length - a.length);
  const result: YTTrack[] = [];
  const total = tracks.length;

  while (result.length < total) {
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length === 0) continue;
      // Only add if last artist differs (or it's the first track)
      const lastArtist = result[result.length - 1]?.artist.toLowerCase();
      if (result.length > 0 && buckets[i][0].artist.toLowerCase() === lastArtist) {
        // Try the next bucket that isn't the same artist
        let found = false;
        for (let j = i + 1; j < buckets.length; j++) {
          if (buckets[j].length === 0) continue;
          if (buckets[j][0].artist.toLowerCase() !== lastArtist) {
            result.push(buckets[j].shift()!);
            found = true;
            break;
          }
        }
        if (!found) {
          // Unavoidable duplicate — just add it
          result.push(buckets[i].shift()!);
        }
      } else {
        result.push(buckets[i].shift()!);
      }
      if (result.length >= total) break;
    }
    // Remove exhausted buckets
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (buckets[i].length === 0) buckets.splice(i, 1);
    }
    if (buckets.length === 0) break;
  }

  return result;
}

export const getSmartMix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Step 1: Extract top artists from listening history + liked songs
    const [histRes, likedRes, profileRes] = await Promise.all([
      supabase
        .from("listening_history")
        .select("artist")
        .eq("user_id", userId)
        .order("played_at", { ascending: false })
        .limit(100),
      supabase
        .from("liked_songs")
        .select("artist")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("profiles")
        .select("fav_artists, fav_languages")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    // Count artist frequency
    const freq = new Map<string, number>();
    for (const r of histRes.data ?? []) {
      freq.set(r.artist, (freq.get(r.artist) ?? 0) + 1);
    }
    for (const r of likedRes.data ?? []) {
      freq.set(r.artist, (freq.get(r.artist) ?? 0) + 2); // likes count double
    }

    const topArtists = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    // Step 2: Fallback — use profile fav_artists or default keywords
    let seedArtists: string[] = topArtists;

    if (seedArtists.length === 0) {
      const favArtists = (profileRes.data?.fav_artists as Array<{ name: string }> | null) ?? [];
      if (favArtists.length > 0) {
        seedArtists = favArtists.map((a) => a.name).slice(0, 3);
      } else {
        const langs = profileRes.data?.fav_languages ?? [];
        const lang = langs[0] ?? "Tamil";
        seedArtists = [`${lang} trending hits`];
      }
    }

    // Step 3: Fetch from YouTube using smart query construction
    const query = seedArtists
      .slice(0, 2)
      .map((a) => `${a} audio`)
      .join(" OR ");

    const raw = await searchMusic(query, 18);

    // Step 4: Interleave and return
    const mixed = interleave(raw);
    return mixed;
  });

export const getExploreTracks = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        language: z.string().min(1).max(40),
        category: z.string().min(1).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { language, category } = data;

    const CATEGORY_QUERIES: Record<string, string> = {
      "Top Charts": "top charts latest hits",
      "New Releases": "new releases latest",
      "Lo-Fi Nights": "lofi chill beats",
      Workout: "workout gym high energy",
      Romance: "romantic love songs melody",
      "Tamil Hits": "mass kuthu tamil hits",
    };

    const catQuery = CATEGORY_QUERIES[category] ?? category.toLowerCase();
    const fullQuery = `${language} ${catQuery} official audio`;

    return searchMusic(fullQuery, 20);
  });
