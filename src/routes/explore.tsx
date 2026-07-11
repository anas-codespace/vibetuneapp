import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { BarChart3, Sparkles, Moon, Dumbbell, Heart, Flame, Loader2 } from "lucide-react";
import { getExploreTracks } from "@/lib/mix.functions";
import { usePlayer, type VibeTrack } from "@/components/VibePlayer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/explore")({
  head: () => ({ meta: [{ title: "Explore — Vibetune" }] }),
  component: ExplorePage,
});

const LANGUAGES = ["Tamil", "English", "Hindi", "Telugu", "Malayalam"] as const;
type Language = (typeof LANGUAGES)[number];

interface Category {
  key: string;
  label: string;
  icon: typeof BarChart3;
  gradient: string; // tailwind bg-gradient
  shadow: string;
}

const CATEGORIES: Category[] = [
  {
    key: "Top Charts",
    label: "Top Charts",
    icon: BarChart3,
    gradient: "from-[#7D3FF3] via-[#3a1273] to-black",
    shadow: "shadow-[0_20px_50px_-20px_rgba(125,63,243,0.7)]",
  },
  {
    key: "New Releases",
    label: "New Releases",
    icon: Sparkles,
    gradient: "from-[#EC008C] via-[#6a0640] to-black",
    shadow: "shadow-[0_20px_50px_-20px_rgba(236,0,140,0.7)]",
  },
  {
    key: "Lo-Fi Nights",
    label: "Lo-Fi Nights",
    icon: Moon,
    gradient: "from-[#1E3A8A] via-[#0b1a3d] to-black",
    shadow: "shadow-[0_20px_50px_-20px_rgba(30,58,138,0.7)]",
  },
  {
    key: "Workout",
    label: "Workout",
    icon: Dumbbell,
    gradient: "from-[#F97316] via-[#7a2f04] to-black",
    shadow: "shadow-[0_20px_50px_-20px_rgba(249,115,22,0.6)]",
  },
  {
    key: "Romance",
    label: "Romance",
    icon: Heart,
    gradient: "from-[#EF4444] via-[#5a0a0a] to-black",
    shadow: "shadow-[0_20px_50px_-20px_rgba(239,68,68,0.6)]",
  },
  {
    key: "Tamil Hits",
    label: "Trending Hits",
    icon: Flame,
    gradient: "from-[#10B981] via-[#053d2c] to-black",
    shadow: "shadow-[0_20px_50px_-20px_rgba(16,185,129,0.6)]",
  },
];

function ExplorePage() {
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("Tamil");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const exploreFn = useServerFn(getExploreTracks);
  const { startMix } = usePlayer();

  const handleTap = async (cat: Category) => {
    if (loadingKey) return;
    setLoadingKey(cat.key);
    try {
      const tracks = await exploreFn({
        data: { language: selectedLanguage, category: cat.key },
      });
      const list: VibeTrack[] = (tracks ?? []).map((t) => ({
        youtubeId: t.youtubeId,
        title: t.title,
        artist: t.artist,
        thumbnailUrl: t.thumbnailUrl,
        durationSeconds: t.durationSeconds,
      }));
      if (list.length > 0) startMix(list);
    } catch {
      // silent failure — button just re-enables
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#000000] px-5 pb-44 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <header className="mx-auto max-w-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-pink-500">
          Explore
        </p>
        <h1 className="mt-1 text-3xl font-bold text-white">Discover new vibes</h1>
      </header>

      {/* Language chips */}
      <div className="mx-auto mt-6 max-w-md">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LANGUAGES.map((lang) => {
            const active = selectedLanguage === lang;
            return (
              <button
                key={lang}
                onClick={() => setSelectedLanguage(lang)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition active:scale-95",
                  active
                    ? "bg-gradient-to-r from-[#7D3FF3] to-[#EC008C] text-white shadow-[0_0_20px_-4px_rgba(236,0,140,0.7)]"
                    : "border border-white/10 bg-white/5 text-white/50 hover:text-white",
                )}
              >
                {lang}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category grid */}
      <section className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3">
        {CATEGORIES.map((cat, i) => {
          const Icon = cat.icon;
          const loading = loadingKey === cat.key;
          return (
            <motion.button
              key={cat.key}
              onClick={() => handleTap(cat)}
              disabled={!!loadingKey}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                "group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br p-4 text-left transition active:scale-95 disabled:opacity-70",
                cat.gradient,
                cat.shadow,
              )}
            >
              {/* Aesthetic blurred blob */}
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-8 -left-8 h-20 w-20 rounded-full bg-black/40 blur-2xl" />

              <div className="relative z-10 flex items-start justify-between">
                <Icon className="h-5 w-5 text-white/90" strokeWidth={1.75} />
                {loading && (
                  <Loader2 className="h-4 w-4 animate-spin text-white/80" />
                )}
              </div>
              <div className="relative z-10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
                  {selectedLanguage}
                </p>
                <p className="mt-0.5 text-sm font-bold text-white">{cat.label}</p>
              </div>
            </motion.button>
          );
        })}
      </section>

      <p className="mx-auto mt-6 max-w-md text-center text-[11px] text-white/30">
        Tap a card to start an endless {selectedLanguage} mix
      </p>
    </main>
  );
}
