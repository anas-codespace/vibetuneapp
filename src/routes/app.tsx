import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Play, Sparkles, Heart, Radio, Disc3 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOnboardingGate } from "@/hooks/use-onboarding-gate";
import { usePlayer, type VibeTrack } from "@/components/VibePlayer";
import { getMyProfile } from "@/lib/profile.functions";
import { searchYouTubeOnly } from "@/lib/music.functions";
import { getSmartMix } from "@/lib/mix.functions";
import { getPersonalizedFeed } from "@/lib/personalized.functions";
import { getHomeFeed } from "@/lib/feed.functions";
import { getTrendingNearYou, getLanguageTrending } from "@/lib/trending.functions";
import { VibeCheck } from "@/components/MoodEngine/VibeCheck";
import { cn } from "@/lib/utils";
import { FALLBACK_TRACKS } from "@/data/fallbackTracks";
import { SafeArt } from "@/components/SafeArt";
import { CleanArt } from "@/components/CleanArt";

import {
  TRENDING_REGIONS,
  DEFAULT_TRENDING_REGION,
  getStoredTrendingRegion,
  setStoredTrendingRegion,
  labelForRegion,
} from "@/lib/trendingRegion";
import {
  TRENDING_LANGUAGES,
  getStoredTrendingLanguages,
  setStoredTrendingLanguages,
  rankByLanguages,
} from "@/lib/trendingLanguage";



export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Vibtune — Personalized Music Player" },
      { name: "description", content: "Your Vibtune home: smart mixes, quick picks, and mood-aware playlists tailored to how you're feeling right now." },
      { property: "og:title", content: "Vibtune — Personalized Music Player" },
      { property: "og:description", content: "Smart mixes, quick picks, and mood-aware playlists tuned to your vibe." },
      { property: "og:url", content: "https://vibetuneapp.lovable.app/app" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://vibetuneapp.lovable.app/app" }],
  }),
  component: AppHome,
});


function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good Night";
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function AppHome() {
  const { session, status, user } = useAuth();
  useOnboardingGate();
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyProfile);
  const feedFn = useServerFn(getPersonalizedFeed);
  const trendingFn = useServerFn(searchYouTubeOnly);
  const trendingNearFn = useServerFn(getTrendingNearYou);
  const languageTrendingFn = useServerFn(getLanguageTrending);
  const homeFeedFn = useServerFn(getHomeFeed);

  const { play, startMix } = usePlayer();
  
  const [moodOpen, setMoodOpen] = useState(false);
  const [mixLoading, setMixLoading] = useState(false);
  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => { setGreeting(timeGreeting()); }, []);

  // Persisted region preference for "Trending near you".
  const [trendingRegion, setTrendingRegion] = useState<string>(DEFAULT_TRENDING_REGION);
  // Persisted multi-select language preference (independent of region).
  const [trendingLangs, setTrendingLangs] = useState<string[]>([]);
  useEffect(() => {
    setTrendingRegion(getStoredTrendingRegion());
    setTrendingLangs(getStoredTrendingLanguages());
  }, []);
  const changeTrendingRegion = (code: string) => {
    setTrendingRegion(code);
    setStoredTrendingRegion(code);
  };
  const toggleTrendingLang = (code: string) => {
    setTrendingLangs((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      setStoredTrendingLanguages(next);
      return next;
    });
  };


  useEffect(() => {
    if (status === "unauthenticated") navigate({ to: "/login", replace: true });
  }, [status, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    enabled: !!session,
  });

  const name =
    profile?.display_name?.split(" ")[0] ??
    user?.user_metadata?.display_name?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "vibe";
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

  // Personalized feed built from REAL user signals (liked_songs + history).
  const { data: feed, isLoading } = useQuery({
    queryKey: ["personalized-feed", user?.id],
    queryFn: () => feedFn(),
    enabled: !!session,
    staleTime: 1000 * 60 * 5,
  });


  // Taste-driven home sections (signal layer → TasteProfile → recommender).
  const { data: homeSections, isLoading: homeSectionsLoading } = useQuery({
    queryKey: ["home-feed", user?.id],
    queryFn: async () => {
      try {
        return await homeFeedFn();
      } catch (err) {
        console.error("[home-feed] failed:", err);
        return [];
      }
    },
    enabled: !!session,
    staleTime: 1000 * 60,
  });

  const favLanguages = (profile?.fav_languages as string[] | null) ?? [];
  // Prefer the explicit selector; fall back to profile fav_languages, then "tamil".
  const effectiveLangs = trendingLangs.length > 0 ? trendingLangs : favLanguages;
  const primaryLang = (effectiveLangs[0] ?? "tamil").toLowerCase();
  const langQueryPart = effectiveLangs.length > 0 ? effectiveLangs.join(" ") : primaryLang;
  const trendingQuery = `trending ${langQueryPart} songs official`;

  const { data: trending, isLoading: trendingLoading } = useQuery({
    queryKey: ["trending-default", trendingQuery],
    queryFn: async () => {
      try {
        const res = await trendingFn({ data: { query: trendingQuery, max: 20 } });
        if (!res || res.length === 0) {
          console.warn(`[Vibtune Protect] trending empty for "${trendingQuery}", using fallback.`);
          return [];
        }
        return res;
      } catch (err) {
        console.error(`[Vibtune Protect] trending failed for "${trendingQuery}", using fallback.`, err);
        return [];
      }
    },
    enabled: !!session,
    staleTime: 1000 * 60 * 30,
  });

  const { data: trendingNear, isLoading: trendingNearLoading } = useQuery({
    queryKey: ["trending-near-you", trendingRegion],
    queryFn: async () => {
      try {
        const res = await trendingNearFn({ data: { regionCode: trendingRegion, max: 25 } });
        if (res.stale) {
          console.warn("[trending-near-you] serving stale cache", {
            source: res.source,
            ageMs: Date.now() - res.fetchedAt,
          });
        }
        return res.tracks;
      } catch (err) {
        console.error("[trending-near-you] failed:", err);
        return [];
      }
    },
    enabled: !!session,
    staleTime: 1000 * 60 * 30,
    retry: 2,
  });

  // Playlist-Mapped trending: language → curated official playlist.
  // Fires whenever the primary language chip changes, guaranteeing
  // language-accurate hits instead of region-scoped aggregates.
  const { data: languageTrending, isLoading: languageTrendingLoading } = useQuery({
    queryKey: ["trending-language", primaryLang],
    queryFn: async () => {
      try {
        const res = await languageTrendingFn({ data: { language: primaryLang, max: 25 } });
        if (res.stale) {
          console.warn(`[trending-language] serving stale cache for ${primaryLang}`, {
            source: res.source,
            playlistId: res.playlistId,
          });
        }
        return res.tracks;
      } catch (err) {
        console.error(`[trending-language] failed for ${primaryLang}:`, err);
        return [];
      }
    },
    enabled: !!session,
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });






  const mixFn = useServerFn(getSmartMix);

  const handleSmartMix = async () => {
    setMixLoading(true);
    try {
      const mixTracks = await mixFn();
      const list: VibeTrack[] = (mixTracks ?? []).map((t) => ({
        youtubeId: t.youtubeId,
        title: t.title,
        artist: t.artist,
        thumbnailUrl: t.thumbnailUrl,
        durationSeconds: t.durationSeconds,
      }));
      if (list.length > 0) startMix(list);
    } catch {
      // Fallback: open mood engine instead
      setMoodOpen(true);
    }
    setMixLoading(false);
  };

  const mapTrack = (t: { youtubeId: string; title: string; artist: string; thumbnailUrl: string | null; durationSeconds: number }): VibeTrack => ({
    youtubeId: t.youtubeId,
    title: t.title,
    artist: t.artist,
    thumbnailUrl: t.thumbnailUrl ?? undefined,
    durationSeconds: t.durationSeconds,
  });

  const likedList: VibeTrack[] = (feed?.likedSongs ?? []).map(mapTrack);
  const recentList: VibeTrack[] = (feed?.recentlyPlayed ?? []).map(mapTrack);
  const suggestedList: VibeTrack[] = (feed?.suggestedForYou ?? []).map(mapTrack);
  const topArtistList: VibeTrack[] = (feed?.topArtistMix ?? []).map(mapTrack);
  const dailyList: VibeTrack[] = (feed?.dailyMix ?? []).map(mapTrack);
  const languageTrendingList: VibeTrack[] = (languageTrending ?? []).map(mapTrack);
  // "Trending Now" prefers the Playlist-Mapped language feed (guaranteed
  // language-accurate) and falls back to the search-based trending list.
  const trendingList: VibeTrack[] = rankByLanguages(
    languageTrendingList.length > 0 ? languageTrendingList : (trending ?? []).map(mapTrack),
    trendingLangs,
  );
  const trendingNearList: VibeTrack[] = rankByLanguages((trendingNear ?? []).map(mapTrack), trendingLangs);


  // For rows that lack real personalization, fall back to trending; if
  // trending is also empty, use static curated fallback.
  const ensureFilled = (items: VibeTrack[]): VibeTrack[] =>
    items.length > 0 ? items : trendingList.length > 0 ? trendingList : FALLBACK_TRACKS;

  const topArtistName = feed?.topArtist ?? null;
  const primaryLangLabel = feed?.primaryLang ?? "Tamil";
  const coldStart = feed?.coldStart ?? false;
  const artistTileTitle = topArtistName
    ? `${topArtistName} Essentials`
    : `${primaryLangLabel} Essentials`;

  type QuickPick = { title: string; art: string | undefined; icon: typeof Heart; gradient: string; list: VibeTrack[] };
  const quickPicks: QuickPick[] = [
    { title: "Liked Songs", art: likedList[0]?.thumbnailUrl, icon: Heart, gradient: "from-cyan-300 to-violet-500", list: likedList },
    { title: `${primaryLangLabel} Top`, art: suggestedList[0]?.thumbnailUrl, icon: Disc3, gradient: "from-teal-500 to-cyan-300", list: suggestedList },
    { title: artistTileTitle, art: topArtistList[0]?.thumbnailUrl, icon: Sparkles, gradient: "from-violet-500 to-violet-400", list: topArtistList.length ? topArtistList : suggestedList },
    { title: coldStart ? "Discover Mix" : "Daily Mix 1", art: dailyList[0]?.thumbnailUrl, icon: Sparkles, gradient: "from-emerald-500 to-cyan-500", list: dailyList },
    { title: "Recently Played", art: recentList[0]?.thumbnailUrl, icon: Play, gradient: "from-sky-400 to-teal-500", list: recentList },
    { title: "Late Night Lo-Fi", art: suggestedList[3]?.thumbnailUrl, icon: Radio, gradient: "from-indigo-500 to-purple-500", list: suggestedList },
  ];

  const suggestedForYou = ensureFilled(suggestedList.slice(0, 20));
  const trendingNow = ensureFilled(
    trendingList.length > 0 ? trendingList.slice(0, 20) : suggestedList.slice(0, 20),
  );
  const popularRadios = ensureFilled(topArtistList.slice(0, 20));
  const newReleases = ensureFilled(dailyList.slice(0, 20));
  const featured = suggestedForYou[0] ?? trendingNow[0] ?? null;



  const renderCarousel = (
    title: string,
    items: VibeTrack[],
    subtitleFor: (t: VibeTrack) => string,
    sectionLoading = false,
    trailing?: React.ReactNode,
    /** When true, cards represent an artist "radio" and use the artist's
     *  official picture instead of the track's album cover. */
    artistArt = false,
  ) => (

    <div className="mt-9 rule-hair pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-xl font-semibold tracking-tight text-white">{title}</h3>
        {trailing ? (
          trailing
        ) : (
          <button className="eyebrow shrink-0 whitespace-nowrap transition-colors hover:text-white">
            See all
          </button>
        )}
      </div>


      <div className="-mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-x-5 overflow-x-auto px-5 pb-6 hide-scrollbar [&>*]:snap-always">
        {(isLoading || sectionLoading) &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex w-40 shrink-0 flex-col gap-2 sm:w-44">
              <div className="aspect-square w-full animate-pulse rounded-md bg-neutral-800" />
              <div className="mt-2 h-4 w-24 animate-pulse rounded bg-neutral-800" />
              <div className="h-3 w-16 animate-pulse rounded bg-neutral-900" />
            </div>
          ))}

        {!(isLoading || sectionLoading) &&
          items.map((t) => (
            <button
              key={t.youtubeId}
              onClick={() => play(t, items)}
              className="flex w-40 shrink-0 snap-start flex-col text-left sm:w-44"
            >
              <div className="aspect-square overflow-hidden rounded-md bg-white/5 shadow-lg shadow-black/50">
                <CleanArt
                  mode={artistArt ? "artist" : "track"}
                  artist={t.artist}
                  title={t.title}
                  fallbackSrc={t.thumbnailUrl}
                  alt={t.title}
                />
              </div>
              <p className="mt-2 truncate text-sm font-bold text-white">
                {t.title}
              </p>
              <p className="line-clamp-2 text-xs text-white/60">
                {subtitleFor(t)}
              </p>
            </button>
          ))}
      </div>

    </div>
  );


  return (
    <main className="relative min-h-screen pb-[140px]">
      {/* Masthead */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/75 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <h1 className="font-display text-lg font-semibold tracking-tight text-white">
            <span aria-hidden="true">Vibe<span className="vibe-text">tune</span></span>
            <span className="sr-only">Vibtune — Personalized Music Player</span>
          </h1>
          <span className="eyebrow">{greeting}</span>
        </div>
      </header>

      <section className="mx-auto mt-7 max-w-md px-5">
        {/* Featured block */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Today's rotation</p>
            <h2 className="mt-2 font-display text-[2.6rem] leading-[0.95] font-semibold tracking-tight text-white">
              {displayName}
              <span className="vibe-text">.</span>
            </h2>
            <p className="mt-2 max-w-[24ch] text-sm text-white/55">
              Picked from what you played, where you are, and the languages you love.
            </p>
          </div>
          {featured ? (
            <button
              onClick={() => play(featured, suggestedForYou)}
              className="group h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 shadow-[var(--shadow-vibe)] transition-transform active:scale-[0.97]"
              aria-label={`Play ${featured.title}`}
            >
              <CleanArt
                mode="track"
                artist={featured.artist}
                title={featured.title}
                fallbackSrc={featured.thumbnailUrl}
                alt={featured.title}
              />
            </button>
          ) : null}
        </div>

        {/* Quick Picks 2-col grid */}
        <div className="mt-7 grid grid-cols-2 gap-3">

          {quickPicks.map((qp, i) => {
            const Icon = qp.icon;
            return (
              <button
                key={qp.title}
                onClick={() => {
                  if (qp.title === "Liked Songs" && qp.list.length === 0) {
                    handleSmartMix();
                  } else if (qp.list[0]) {
                    play(qp.list[0], qp.list);
                  } else {
                    handleSmartMix();
                  }
                }}
                className="group flex h-14 items-center overflow-hidden rounded-md bg-white/5 text-left transition-colors hover:bg-white/10 active:scale-[0.98]"
              >
                <div
                  className={cn(
                    "relative grid h-14 w-14 shrink-0 place-items-center bg-gradient-to-br",
                    qp.gradient,
                  )}
                >
                  {qp.art ? (
                    <SafeArt
                      src={qp.art}
                      alt=""
                      className="absolute inset-0 opacity-90"
                      fallbackClassName="absolute inset-0 grid place-items-center"
                    />
                  ) : (
                    <Icon className="h-5 w-5 text-white" strokeWidth={2} />
                  )}
                </div>
                <p className="ml-3 mr-2 line-clamp-2 text-sm font-bold text-white">
                  {qp.title}
                </p>
              </button>
            );
          })}
        </div>

        {/* Taste-driven sections from the unified feed builder. Trending keeps
            its dedicated selectors below, so it's excluded here. */}
        {(homeSections ?? [])
          .filter((s) => s.kind !== "trending" && s.tracks.length > 0)
          .map((s) =>
            <div key={s.id}>
              {renderCarousel(
                s.stale ? `${s.title}` : s.title,
                s.tracks.map((t) => ({
                  youtubeId: t.youtubeId,
                  title: t.title,
                  artist: t.artist,
                  thumbnailUrl: t.thumbnailUrl,
                  durationSeconds: t.durationSeconds ?? 0,
                })),
                (t) => t.artist || s.title,
                homeSectionsLoading,
                undefined,
                s.kind === "because_you_listened_to",
              )}
            </div>,
          )}

        {/* Horizontal sections */}
        {(homeSections ?? []).length === 0 &&
          renderCarousel("Suggested For You", suggestedForYou, (t) => `Mix • ${t.artist}`)}
        {renderCarousel(
          `Trending in ${primaryLangLabel}`,
          trendingNow,
          (t) => t.artist || "Trending",
          trendingLoading || languageTrendingLoading,
        )}

        {renderCarousel(
          `Trending in ${labelForRegion(trendingRegion)}`,
          trendingNearList.length > 0 ? trendingNearList.slice(0, 20) : trendingNow,
          (t) => t.artist || `Trending in ${trendingRegion}`,
          trendingNearLoading,
          <div className="flex flex-col items-end gap-2">
            <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
              <span>Region</span>
              <select
                aria-label="Trending region"
                value={trendingRegion}
                onChange={(e) => changeTrendingRegion(e.target.value)}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/80 hover:bg-white/10 focus:border-white/30 focus:outline-none"
              >
                {TRENDING_REGIONS.map((r) => (
                  <option key={r.code} value={r.code} className="bg-neutral-900 text-white">
                    {r.label} ({r.code})
                  </option>
                ))}
              </select>
            </label>
            <div
              role="group"
              aria-label="Preferred languages"
              className="flex max-w-[280px] flex-wrap justify-end gap-1.5"
            >
              {TRENDING_LANGUAGES.map((l) => {
                const active = trendingLangs.includes(l.code);
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => toggleTrendingLang(l.code)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors",
                      active
                        ? "border-white/60 bg-white text-black"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                    )}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>,
        )}

        {(homeSections ?? []).length === 0 && (
          <>
            {renderCarousel("Popular Radios", popularRadios, (t) => `${t.artist} Radio`, false, undefined, true)}
            {renderCarousel("New Releases", newReleases, (t) => t.artist)}
          </>
        )}

      </section>

      <VibeCheck
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        userName={displayName}
        onResult={() => setMoodOpen(false)}
      />
    </main>
  );
}
