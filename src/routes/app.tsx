import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Play, Sparkles, Heart, Radio, Disc3 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlayer, type VibeTrack } from "@/components/VibePlayer";
import { getMyProfile } from "@/lib/profile.functions";
import { tracksForArtists } from "@/lib/music.functions";
import { getSmartMix } from "@/lib/mix.functions";
import { VibeCheck } from "@/components/MoodEngine/VibeCheck";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Vibetune" }] }),
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
  const { session, loading, user } = useAuth();
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyProfile);
  const tracksFn = useServerFn(tracksForArtists);
  const { play, startMix } = usePlayer();
  const [filter, setFilter] = useState<Filter>("For You");
  const [moodOpen, setMoodOpen] = useState(false);
  const [mixLoading, setMixLoading] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

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

  const favArtists = (profile?.fav_artists as Array<{ name: string }> | null) ?? [];
  const seedArtists = favArtists.length
    ? favArtists.map((a) => a.name).slice(0, 6)
    : ["Anirudh Ravichander", "A.R. Rahman", "The Weeknd", "Arijit Singh"];

  const { data: tracks, isLoading } = useQuery({
    queryKey: ["tracks-for", seedArtists],
    queryFn: () => tracksFn({ data: { artists: seedArtists } }),
    enabled: !!session,
    staleTime: 1000 * 60 * 10,
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

  const list: VibeTrack[] = (tracks ?? []).slice(0, 24).map((t) => ({
    youtubeId: t.youtubeId,
    title: t.title,
    artist: t.artist,
    thumbnailUrl: t.thumbnailUrl,
    durationSeconds: t.durationSeconds,
  }));




  const quickPicks = [
    { title: "Liked Songs", art: list[0]?.thumbnailUrl, icon: Heart, gradient: "from-pink-500 to-violet-500" },
    { title: "Tamil Top 50", art: list[1]?.thumbnailUrl, icon: Disc3, gradient: "from-orange-500 to-pink-500" },
    { title: "Anirudh Essentials", art: list[2]?.thumbnailUrl, icon: Sparkles, gradient: "from-violet-500 to-fuchsia-500" },
    { title: "Late Night Lo-Fi", art: list[3]?.thumbnailUrl, icon: Radio, gradient: "from-indigo-500 to-purple-500" },
    { title: "Daily Mix 1", art: list[4]?.thumbnailUrl, icon: Sparkles, gradient: "from-emerald-500 to-cyan-500" },
    { title: "Recently Played", art: list[5]?.thumbnailUrl, icon: Play, gradient: "from-rose-500 to-orange-500" },
  ];

  const suggestedForYou = list.slice(0, 8);
  const popularRadios = list.slice(6, 14);
  const newReleases = list.slice(10, 20);

  const renderCarousel = (
    title: string,
    items: VibeTrack[],
    subtitleFor: (t: VibeTrack) => string,
  ) => (
    <div className="mt-8">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-white">{title}</h3>
        <button className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 hover:text-white">
          See all
        </button>
      </div>
      <div className="-mx-5 mt-3 flex snap-x gap-4 overflow-x-auto px-5 pb-4 hide-scrollbar">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-36 w-36 shrink-0 animate-pulse rounded-md border border-white/5 bg-white/5"
            />
          ))}
        {!isLoading &&
          items.map((t) => (
            <button
              key={t.youtubeId}
              onClick={() => play(t, items)}
              className="w-36 flex-shrink-0 snap-start text-left"
            >
              <div className="aspect-square overflow-hidden rounded-md bg-white/5 shadow-lg shadow-black/50">
                {t.thumbnailUrl ? (
                  <img
                    src={t.thumbnailUrl}
                    alt={t.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="vibe-gradient h-full w-full" />
                )}
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
    <main className="relative min-h-screen bg-[#050505] pb-[140px]">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#050505]/80 px-6 pb-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] backdrop-blur-md flex items-center justify-center">
        <h1 className="text-base font-bold tracking-tight text-white">
          Vibe<span className="text-pink-500">tune</span>
        </h1>
      </header>

      <section className="mx-auto mt-6 max-w-md px-5">
        {/* Greeting */}
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
          {timeGreeting()}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-white">
          {displayName}
          <span className="vibe-text">.</span>
        </h2>

        {/* Quick Picks 2-col grid */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {quickPicks.map((qp, i) => {
            const Icon = qp.icon;
            return (
              <button
                key={qp.title}
                onClick={() => {
                  if (i === 0) handleSmartMix();
                  else if (list[i]) play(list[i], list);
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
                    <img
                      src={qp.art}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-90"
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

        {/* Horizontal sections */}
        {renderCarousel("Suggested For You", suggestedForYou, (t) => `Mix • ${t.artist}`)}
        {renderCarousel("Popular Radios", popularRadios, (t) => `${t.artist} Radio`)}
        {renderCarousel("New Releases", newReleases, (t) => t.artist)}




        {!isLoading && list.length === 0 && (
          <p className="mt-8 text-sm text-white/50">
            No tracks yet. Finish onboarding to personalize your feed.
          </p>
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
