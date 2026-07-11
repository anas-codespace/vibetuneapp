import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Play, Sparkles } from "lucide-react";
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

const FILTERS = ["For You", "New Releases", "Chill", "Tamil", "Lo-Fi"] as const;
type Filter = (typeof FILTERS)[number];

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

  const continueListening = list.slice(0, 3);
  const madeForYou = list.slice(3, 13);
  const heroArt = list[0]?.thumbnailUrl;

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


        {/* Hero circular vibe card */}
        <div className="relative mx-auto mt-6 flex h-56 items-center justify-center">
          {/* glowing background ring */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-48 w-48 rounded-full bg-[radial-gradient(circle_at_center,rgba(236,0,140,0.45),rgba(125,63,243,0.25)_55%,transparent_72%)] blur-2xl" />
          </div>
          <button
            onClick={handleSmartMix}
            disabled={mixLoading}
            className="group relative grid h-44 w-44 place-items-center overflow-hidden rounded-full border border-white/10 bg-[#0c0c0c] shadow-[0_0_60px_-10px_rgba(255,0,127,0.55)] active:scale-95"
          >
            {heroArt ? (
              <img
                src={heroArt}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-50"
              />
            ) : (
              <div className="vibe-gradient absolute inset-0 opacity-50" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/70" />
            <div className="relative z-10 px-6 text-center">
              <Sparkles className="mx-auto h-5 w-5 text-pink-500" />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">
                Today&rsquo;s Vibe
              </p>
              <p className="mt-1 text-sm font-medium leading-snug text-white">
                Feel the rhythm.
                <br />
                Find your sound.
              </p>
            </div>
          </button>
        </div>

        {/* Filter pills */}
        <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition active:scale-95",
                  active
                    ? "bg-pink-500 text-white shadow-[0_0_18px_-4px_rgba(255,0,127,0.7)]"
                    : "border border-white/5 bg-white/5 text-white/60 hover:text-white",
                )}
              >
                {f}
              </button>
            );
          })}
        </div>

        {/* Continue Listening */}
        <div className="mt-8 flex items-baseline justify-between">
          <h3 className="text-base font-bold text-white">Continue Listening</h3>
          <button className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 hover:text-white">
            See all
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[68px] animate-pulse rounded-2xl border border-white/5 bg-white/5"
              />
            ))}
          {!isLoading &&
            continueListening.map((t, i) => {
              const pct = 18 + i * 22;
              return (
                <button
                  key={t.youtubeId}
                  onClick={() => play(t, list)}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-[#121212] p-2 pr-3 text-left transition hover:bg-[#181818] active:scale-[0.99]"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
                    {t.thumbnailUrl ? (
                      <img
                        src={t.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="vibe-gradient h-full w-full" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {t.title}
                    </p>
                    <p className="truncate text-xs text-white/50">{t.artist}</p>
                    <div className="mt-1.5 h-[2px] w-full overflow-hidden rounded-full bg-white/5">
                      <div
                        className="vibe-gradient-h h-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pink-500 text-white shadow-[0_0_16px_-4px_rgba(255,0,127,0.8)]"
                  >
                    <Play
                      className="h-4 w-4 translate-x-0.5"
                      fill="currentColor"
                    />
                  </span>
                </button>
              );
            })}
        </div>

        {/* Made For You */}
        <div className="mt-8 flex items-baseline justify-between">
          <h3 className="text-base font-bold text-white">Made For You</h3>
          <button className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 hover:text-white">
            See all
          </button>
        </div>

        {isLoading && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-2xl border border-white/5 bg-white/5"
              />
            ))}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          {madeForYou.map((t, i) => (
            <motion.button
              key={t.youtubeId}
              onClick={() => play(t, list)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="group relative overflow-hidden rounded-2xl border border-white/5 bg-[#121212] text-left active:scale-95"
            >
              <div className="aspect-square overflow-hidden">
                {t.thumbnailUrl ? (
                  <img
                    src={t.thumbnailUrl}
                    alt={t.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="vibe-gradient h-full w-full" />
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3">
                <p className="vibe-text line-clamp-1 text-sm font-bold">
                  {t.title}
                </p>
                <p className="line-clamp-1 text-[11px] text-white/60">
                  {t.artist}
                </p>
              </div>
            </motion.button>
          ))}
        </div>

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
