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

/** Fisher–Yates shuffle so the mix feels fresh on every refresh. */
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Smart Suggestion algorithm.
 *
 * Step 1 — Seed extraction: pull recent listening_history + liked_songs,
 *          score artists (likes weigh 2×, each play weighs 1×), take top 3.
 *          Fallback: profile.fav_artists → language-based trending query.
 * Step 2 — Parallel fetch: query YouTube per seed artist independently so
 *          one slow/empty seed doesn't drown the mix.
 * Step 3 — Freshness filter: drop tracks the user has already played 3+
 *          times (avoid repetition) BUT keep any track they've liked.
 * Step 4 — Shuffle & cap: dedupe, shuffle, then interleave by artist so no
 *          two consecutive songs share an artist. Return top 20.
 */
export const getSmartMix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // ---- Step 1: Extract seed data --------------------------------------
    const [histRes, likedRes, profileRes] = await Promise.all([
      supabase
        .from("listening_history")
        .select("youtube_id, artist")
        .eq("user_id", userId)
        .order("played_at", { ascending: false })
        .limit(200),
      supabase
        .from("liked_songs")
        .select("youtube_id, artist")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("profiles")
        .select("fav_artists, fav_languages")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    // Per-song play counts (used to filter over-played tracks later)
    const playCount = new Map<string, number>();
    // Per-artist frequency score
    const artistScore = new Map<string, number>();

    for (const r of histRes.data ?? []) {
      playCount.set(r.youtube_id, (playCount.get(r.youtube_id) ?? 0) + 1);
      artistScore.set(r.artist, (artistScore.get(r.artist) ?? 0) + 1);
    }
    // Likes weigh 2× on artist scoring; liked ids are "protected" from filtering
    const likedIds = new Set<string>();
    for (const r of likedRes.data ?? []) {
      likedIds.add(r.youtube_id);
      artistScore.set(r.artist, (artistScore.get(r.artist) ?? 0) + 2);
    }

    let seedArtists = [...artistScore.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    // Fallbacks when the user has no history yet
    if (seedArtists.length === 0) {
      const favArtists =
        (profileRes.data?.fav_artists as Array<{ name: string }> | null) ?? [];
      if (favArtists.length > 0) {
        seedArtists = favArtists.map((a) => a.name).slice(0, 3);
      } else {
        const langs = profileRes.data?.fav_languages ?? [];
        const lang = langs[0] ?? "Tamil";
        seedArtists = [`${lang} trending hits`];
      }
    }

    // ---- Step 2: Parallel fetch per seed artist -------------------------
    const perSeedResults = await Promise.all(
      seedArtists.map((a) =>
        searchMusic(`${a} official audio`, 12).catch(() => [] as YTTrack[]),
      ),
    );

    // ---- Step 3: Merge + freshness filter -------------------------------
    const seen = new Set<string>();
    const pooled: YTTrack[] = [];
    for (const list of perSeedResults) {
      for (const t of list) {
        if (seen.has(t.youtubeId)) continue;
        // Drop tracks played 3+ times UNLESS the user has liked them
        const plays = playCount.get(t.youtubeId) ?? 0;
        if (plays >= 3 && !likedIds.has(t.youtubeId)) continue;
        seen.add(t.youtubeId);
        pooled.push(t);
      }
    }

    // ---- Step 4: Shuffle, interleave by artist, cap at 20 ---------------
    const shuffled = shuffle(pooled);
    const mixed = interleave(shuffled).slice(0, 20);
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

/**
 * Context-Aware Auto-Queue.
 *
 * Given the currently-playing track's metadata, fetch related tracks that
 * share its hero/artist/movie vibe. Language is inferred lightly from the
 * artist/title (Tamil/Telugu/Hindi keywords), defaulting to no suffix so the
 * result set stays broad when we can't tell.
 */
const LANG_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /anirudh|thalapathy|vijay|rajini|dhanush|tamil|kollywood|சிற|கிற/i, label: "Tamil" },
  { re: /telugu|tollywood|allu|ntr|prabhas|jr\.?\s*ntr/i, label: "Telugu" },
  { re: /hindi|bollywood|arijit|shreya|kishore|arrahman hindi/i, label: "Hindi" },
  { re: /malayalam|mollywood/i, label: "Malayalam" },
  { re: /kannada|sandalwood/i, label: "Kannada" },
];

function inferLanguage(title: string, artist: string): string {
  const hay = `${title} ${artist}`;
  for (const h of LANG_HINTS) if (h.re.test(hay)) return h.label;
  return "";
}

export const getContextualQueue = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        youtubeId: z.string().min(1).max(32),
        title: z.string().min(1).max(240),
        artist: z.string().min(1).max(240),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { youtubeId, title, artist } = data;
    const lang = inferLanguage(title, artist);
    // Highly contextual query: hero/artist + language hint + audio bias
    const query = `${artist} ${lang} hit songs audio`.replace(/\s+/g, " ").trim();

    const results = await searchMusic(query, 20).catch(() => [] as YTTrack[]);
    // Drop current track + any dupes; cap at 15
    const seen = new Set<string>([youtubeId]);
    const out: YTTrack[] = [];
    for (const t of results) {
      if (seen.has(t.youtubeId)) continue;
      seen.add(t.youtubeId);
      out.push(t);
      if (out.length >= 15) break;
    }
    return out;
  });

