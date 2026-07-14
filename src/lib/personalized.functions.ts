/**
 * getPersonalizedFeed — single source of truth for the Home carousels.
 *
 * Reads REAL user signals (liked_songs + listening_history), scores top
 * artists (liked = 2×, each play = 1×), and returns tracks with a
 * traceable `reason` per item. Cold-start users get honest language/
 * onboarding-artist fallbacks flagged with `coldStart: true`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchMusic, relatedArtistNames, type YTTrack } from "./youtube.server";
import { isProviderError } from "./providerResult";

export interface FeedTrack extends YTTrack {
  reason: string;
}

export interface PersonalizedFeed {
  coldStart: boolean;
  primaryLang: string;
  topArtist: string | null;
  topArtists: string[];
  likedSongs: FeedTrack[];
  recentlyPlayed: FeedTrack[];
  topArtistMix: FeedTrack[];
  suggestedForYou: FeedTrack[];
  dailyMix: FeedTrack[];
}

const withReason = (t: YTTrack, reason: string): FeedTrack => ({ ...t, reason });

export const getPersonalizedFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersonalizedFeed> => {
    const { supabase, userId } = context;

    const [histRes, likedRes, profileRes] = await Promise.all([
      supabase
        .from("listening_history")
        .select("youtube_id, title, artist, played_at")
        .eq("user_id", userId)
        .order("played_at", { ascending: false })
        .limit(200),
      supabase
        .from("liked_songs")
        .select("youtube_id, title, artist, thumbnail_url, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("profiles")
        .select("fav_artists, fav_languages")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const liked = likedRes.data ?? [];
    const history = histRes.data ?? [];

    // Score artists: liked 2×, each play 1×.
    const artistScore = new Map<string, number>();
    for (const r of history) {
      if (!r.artist) continue;
      artistScore.set(r.artist, (artistScore.get(r.artist) ?? 0) + 1);
    }
    for (const r of liked) {
      if (!r.artist) continue;
      artistScore.set(r.artist, (artistScore.get(r.artist) ?? 0) + 2);
    }

    const topArtists = [...artistScore.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([n]) => n);

    const favArtists =
      (profileRes.data?.fav_artists as Array<{ name: string }> | null) ?? [];
    const favLanguages = (profileRes.data?.fav_languages as string[] | null) ?? [];
    const primaryLang = (favLanguages[0] ?? "Tamil").toString();

    const coldStart = liked.length === 0 && history.length === 0;
    const topArtist = topArtists[0] ?? favArtists[0]?.name ?? null;

    // Set of ids the user already knows — exclude from suggestions.
    const knownIds = new Set<string>();
    for (const r of liked) knownIds.add(r.youtube_id);
    for (const r of history) knownIds.add(r.youtube_id);

    // ---- Liked Songs (real data) --------------------------------------
    const likedSongs: FeedTrack[] = liked.slice(0, 20).map((r) => ({
      youtubeId: r.youtube_id,
      title: r.title,
      artist: r.artist ?? "",
      album: "",
      thumbnailUrl: r.thumbnail_url ?? "",
      durationSeconds: 0,
      isEmbeddable: true,
      reason: "In your Liked Songs",
    }));

    // ---- Recently Played (dedup by youtubeId, keep latest) ------------
    const recentSeen = new Set<string>();
    const recentlyPlayed: FeedTrack[] = [];
    for (const r of history) {
      if (recentSeen.has(r.youtube_id)) continue;
      recentSeen.add(r.youtube_id);
      recentlyPlayed.push({
        youtubeId: r.youtube_id,
        title: r.title,
        artist: r.artist ?? "",
        album: "",
        thumbnailUrl: "",
        durationSeconds: 0,
        isEmbeddable: true,
        reason: "You played this recently",
      });
      if (recentlyPlayed.length >= 20) break;
    }


    // ---- Top-Artist Mix ------------------------------------------------
    let topArtistMix: FeedTrack[] = [];
    if (topArtist) {
      const raw = await searchMusic(`${topArtist} official audio`, 20).catch(
        () => [] as YTTrack[],
      );
      topArtistMix = raw
        .slice(0, 15)
        .map((t) => withReason(t, `Because you play ${topArtist}`));
    }

    // ---- Suggested For You --------------------------------------------
    // Real signal path: related artists of the user's top artists.
    // Cold-start path: onboarding fav_artists → language trending.
    const suggestSeeds =
      topArtists.length > 0
        ? topArtists.slice(0, 3)
        : favArtists.slice(0, 3).map((a) => a.name);

    let suggestedForYou: FeedTrack[] = [];

    if (suggestSeeds.length > 0) {
      // For each seed, get related artists then fetch their tracks.
      const perSeed = await Promise.all(
        suggestSeeds.map(async (seed) => {
          const relatedResult = await relatedArtistNames(seed, 4).catch(() => null);
          if (relatedResult && isProviderError(relatedResult)) {
            console.error("[personalized] related artists failed", { seed, httpStatus: relatedResult.httpStatus, reason: relatedResult.reason });
          }
          const related = relatedResult?.status === "ok" ? relatedResult.data : [];
          // Include the seed itself as a related node (deeper cuts).
          const targets = [...new Set([seed, ...related])].slice(0, 5);
          const tracksPerTarget = await Promise.all(
            targets.map((name) =>
              searchMusic(`${name} songs`, 6)
                .catch(() => [] as YTTrack[])
                .then((tracks) =>
                  tracks.map((t) =>
                    withReason(
                      t,
                      name === seed
                        ? `Because you like ${seed}`
                        : `${name} — related to ${seed}`,
                    ),
                  ),
                ),
            ),
          );
          return tracksPerTarget.flat();
        }),
      );

      const seen = new Set<string>();
      for (const list of perSeed) {
        for (const t of list) {
          if (knownIds.has(t.youtubeId)) continue; // don't suggest what they have
          if (seen.has(t.youtubeId)) continue;
          seen.add(t.youtubeId);
          suggestedForYou.push(t);
          if (suggestedForYou.length >= 24) break;
        }
        if (suggestedForYou.length >= 24) break;
      }
    }

    // Absolute cold fallback — honest language-based trending.
    if (suggestedForYou.length === 0) {
      const q = `trending ${primaryLang.toLowerCase()} songs official`;
      const raw = await searchMusic(q, 20).catch(() => [] as YTTrack[]);
      suggestedForYou = raw
        .filter((t) => !knownIds.has(t.youtubeId))
        .slice(0, 20)
        .map((t) =>
          withReason(t, `Popular in ${primaryLang} right now`),
        );
    }

    // ---- Daily Mix 1 ---------------------------------------------------
    // Blend of top artists + a couple of their related artists.
    let dailyMix: FeedTrack[] = [];
    if (topArtists.length > 0) {
      const mixSeeds = topArtists.slice(0, 3);
      const perSeed = await Promise.all(
        mixSeeds.map((a) =>
          searchMusic(`${a} hits`, 8)
            .catch(() => [] as YTTrack[])
            .then((tracks) =>
              tracks.map((t) => withReason(t, `Daily mix • ${a}`)),
            ),
        ),
      );
      const seen = new Set<string>();
      for (const list of perSeed) {
        for (const t of list) {
          if (seen.has(t.youtubeId)) continue;
          seen.add(t.youtubeId);
          dailyMix.push(t);
        }
      }
      dailyMix = dailyMix.slice(0, 20);
    } else {
      // Cold: use suggested set (already language-based) as a stand-in.
      dailyMix = suggestedForYou.slice(0, 20);
    }

    return {
      coldStart,
      primaryLang,
      topArtist,
      topArtists,
      likedSongs,
      recentlyPlayed,
      topArtistMix,
      suggestedForYou,
      dailyMix,
    };
  });
