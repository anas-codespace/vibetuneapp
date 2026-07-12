import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getSeedArtists, expandSimilarArtists } from "@/lib/music.functions";
import type { SpotifyArtistInfo } from "@/lib/music.types";
import { cn } from "@/lib/utils";

interface Props {
  languages: string[];
  selected: SpotifyArtistInfo[];
  onToggle: (artist: SpotifyArtistInfo) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}

const MIN_PICKS = 3;

// Guaranteed-to-render fallback set. Used as the initial state so the grid
// never appears empty even if the seed server function is slow, fails, or
// returns zero rows. Each artist is tagged with a language for filtering.
type StaticArtist = SpotifyArtistInfo & { language: string };

const STATIC_ARTISTS: StaticArtist[] = [
  // Tamil
  { id: "static-anirudh", name: "Anirudh Ravichander", language: "Tamil", hdPhotoUrl: "https://i.scdn.co/image/ab6761610000e5eb0e08d5f67f9c58f2c2e5e9d3", isVerified: true, followers: 0, genres: ["tamil"] },
  { id: "static-arrahman", name: "A.R. Rahman", language: "Tamil", hdPhotoUrl: "https://i.scdn.co/image/ab6761610000e5eb9812c9f4d5f5b1c9e0c0a0e0", isVerified: true, followers: 0, genres: ["tamil"] },
  { id: "static-sidsriram", name: "Sid Sriram", language: "Tamil", hdPhotoUrl: "https://i.scdn.co/image/ab6761610000e5eba7f2c8c9c5f5b1c9e0c0a0e1", isVerified: true, followers: 0, genres: ["tamil"] },
  { id: "static-yuvan", name: "Yuvan Shankar Raja", language: "Tamil", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["tamil"] },
  { id: "static-shreya", name: "Shreya Ghoshal", language: "Tamil", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["tamil", "hindi"] },
  // Telugu
  { id: "static-thaman", name: "Thaman S", language: "Telugu", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["telugu"] },
  { id: "static-dsp", name: "Devi Sri Prasad", language: "Telugu", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["telugu"] },
  { id: "static-sunidhi", name: "Sunidhi Chauhan", language: "Telugu", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["telugu", "hindi"] },
  // Hindi
  { id: "static-arijit", name: "Arijit Singh", language: "Hindi", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["hindi"] },
  { id: "static-neha", name: "Neha Kakkar", language: "Hindi", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["hindi"] },
  { id: "static-badshah", name: "Badshah", language: "Hindi", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["hindi"] },
  // Malayalam
  { id: "static-vineeth", name: "Vineeth Sreenivasan", language: "Malayalam", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["malayalam"] },
  { id: "static-gopi", name: "Gopi Sundar", language: "Malayalam", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["malayalam"] },
  // English
  { id: "static-weeknd", name: "The Weeknd", language: "English", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["pop"] },
  { id: "static-taylor", name: "Taylor Swift", language: "English", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["pop"] },
  { id: "static-edsheeran", name: "Ed Sheeran", language: "English", hdPhotoUrl: null, isVerified: true, followers: 0, genres: ["pop"] },
];

export function ArtistStep({ languages, selected, onToggle, onBack, onFinish, saving }: Props) {
  const seedFn = useServerFn(getSeedArtists);
  const expandFn = useServerFn(expandSimilarArtists);
  const [artists, setArtists] = useState<SpotifyArtistInfo[]>(STATIC_ARTISTS);
  const [loading, setLoading] = useState(false);
  const [expanding, setExpanding] = useState<string | null>(null);
  const expandedSeedsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log("[onboarding] artists in state:", artists.length);
  }, [artists]);

  // Try to enrich with live seed data, but keep the static grid on failure.
  useEffect(() => {
    let cancelled = false;
    seedFn({ data: { languages } })
      .then((list) => {
        if (cancelled || !list || list.length === 0) return;
        setArtists((prev) => {
          const have = new Set(prev.map((a) => a.id));
          const additions = list.filter((a) => !have.has(a.id));
          return additions.length ? [...list, ...prev.filter((p) => !list.some((l) => l.id === p.id))] : prev;
        });
      })
      .catch((e) => {
        console.warn("[onboarding] seed fetch failed, using static fallback:", e);
      });
    return () => { cancelled = true; };
  }, [languages, seedFn]);

  // Language filter — only applied to static artists that carry a language tag.
  // Live-fetched artists (no `language` field) always pass through.
  const filteredArtists = languages.length > 0
    ? artists.filter((a) => {
        const lang = (a as StaticArtist).language;
        return !lang || languages.includes(lang);
      })
    : artists;

  async function handleSelect(artist: SpotifyArtistInfo) {
    const wasSelected = selected.some((a) => a.id === artist.id);
    onToggle(artist);
    if (wasSelected || expandedSeedsRef.current.has(artist.id)) return;

    // Smart expansion — when an artist is picked, surface similar ones inline.
    expandedSeedsRef.current.add(artist.id);
    setExpanding(artist.id);
    try {
      const similar = await expandFn({ data: { seedArtistName: artist.name } });
      setArtists((prev) => {
        const have = new Set(prev.map((a) => a.id));
        const additions = similar.filter((a) => !have.has(a.id));
        if (additions.length === 0) return prev;
        const idx = prev.findIndex((a) => a.id === artist.id);
        const out = [...prev];
        out.splice(idx + 1, 0, ...additions);
        return out;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't fetch similar artists");
    } finally {
      setExpanding(null);
    }
  }

  const canFinish = selected.length >= MIN_PICKS;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="mx-auto max-w-5xl"
    >
      <div className="text-center">
        <h1 className="text-4xl font-bold md:text-5xl">
          Pick artists you <span className="vibe-text">love</span>
        </h1>
        <p className="mt-3 text-white/60">
          Choose at least {MIN_PICKS}. Tapping an artist unlocks similar ones —{" "}
          <span className="inline-flex items-center gap-1 text-white/80">
            <Sparkles className="h-3.5 w-3.5" /> smart expansion
          </span>.
        </p>
      </div>

      {loading ? (
        <div className="mt-16 flex items-center justify-center text-white/60">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your starter set…
        </div>
      ) : filteredArtists.length === 0 ? (
        <p className="mt-16 text-center text-white/60">No artists found in state</p>
      ) : (
        <LayoutGroup>
          <motion.div
            layout
            className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {filteredArtists.map((a) => {
                const isSelected = selected.some((s) => s.id === a.id);
                const isExpanding = expanding === a.id;
                return (
                  <motion.button
                    key={a.id}
                    type="button"
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      layout: { type: "spring", stiffness: 350, damping: 32, mass: 0.8 },
                      opacity: { duration: 0.28, ease: "easeOut" },
                    }}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleSelect(a)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl text-left will-change-transform",
                      isSelected ? "gradient-border ring-2 ring-transparent" : "glass",
                    )}
                  >
                    <div className="aspect-square overflow-hidden">
                      {a.hdPhotoUrl ? (
                        <img
                          src={a.hdPhotoUrl}
                          alt={a.name}
                          loading="lazy"
                          className={cn(
                            "h-full w-full object-cover transition-transform duration-500",
                            isSelected ? "scale-105" : "group-hover:scale-110",
                          )}
                        />
                      ) : (
                        <div className="vibe-gradient h-full w-full" />
                      )}
                    </div>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="line-clamp-1 text-sm font-semibold text-white">{a.name}</p>
                      {a.isVerified && (
                        <p className="vibe-text text-[10px] uppercase tracking-widest">Verified</p>
                      )}
                    </div>
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          key="check"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 24 }}
                          className="vibe-gradient absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-white shadow-[0_0_20px_-2px_rgba(236,0,140,0.7)]"
                        >
                          <Check className="h-4 w-4" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {isExpanding && (
                      <div className="absolute inset-0 grid place-items-center bg-black/50 backdrop-blur-sm">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      )}

      <div className="sticky bottom-6 mt-12 flex items-center justify-between gap-4 rounded-full px-2">
        <button
          type="button"
          onClick={onBack}
          className="glass rounded-full px-6 py-3 text-sm text-white/80 hover:text-white"
        >
          Back
        </button>
        <p className="text-xs text-white/50">
          {selected.length} / {MIN_PICKS}+ selected
        </p>
        <button
          type="button"
          onClick={onFinish}
          disabled={!canFinish || saving}
          className={cn(
            "rounded-full px-8 py-3 text-sm font-semibold transition-all",
            canFinish && !saving
              ? "vibe-gradient-h text-white shadow-[0_0_40px_-10px_rgba(236,0,140,0.7)] hover:scale-105"
              : "cursor-not-allowed bg-white/5 text-white/30",
          )}
        >
          {saving ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span>
          ) : "Enter Vibtune"}
        </button>
      </div>
    </motion.div>
  );
}
