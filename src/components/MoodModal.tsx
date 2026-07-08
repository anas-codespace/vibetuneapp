import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { searchTracks } from "@/lib/music.functions";
import { usePlayer, type VibeTrack } from "@/components/VibePlayer";
import { cn } from "@/lib/utils";

type Lang = "English" | "Tamil" | "Tanglish";
type MoodKey = "energy" | "chill" | "heartbreak";

interface MoodOption {
  key: MoodKey;
  emoji: string;
  label: string;
  query: string;
}

const COPY: Record<Lang, { prompt: string; options: MoodOption[] }> = {
  English: {
    prompt: "What's your current mood?",
    options: [
      { key: "energy", emoji: "🔥", label: "Energy", query: "high energy workout hype hits" },
      { key: "chill", emoji: "☕", label: "Chill", query: "chill lofi relaxing acoustic" },
      { key: "heartbreak", emoji: "🌧️", label: "Heartbreak", query: "sad heartbreak emotional ballads" },
    ],
  },
  Tamil: {
    prompt: "இன்னைக்கு உங்க மனநிலை எப்படி இருக்கு?",
    options: [
      { key: "energy", emoji: "🔥", label: "வெறித்தனம்", query: "tamil mass kuthu high bpm" },
      { key: "chill", emoji: "☕", label: "அமைதி", query: "tamil melody chill sid sriram" },
      { key: "heartbreak", emoji: "🌧️", label: "சோகம்", query: "tamil sad love failure songs" },
    ],
  },
  Tanglish: {
    prompt: "Machi, innaiku unga vibe epdi?",
    options: [
      { key: "energy", emoji: "🔥", label: "Vera Level", query: "anirudh mass kuthu tamil hype" },
      { key: "chill", emoji: "☕", label: "Summa Chill", query: "tamil chill melody sid sriram" },
      { key: "heartbreak", emoji: "🌧️", label: "Kadaisi Bench", query: "tamil sad love failure heartbreak" },
    ],
  },
};

const LANG_PROMPTS: Record<Lang, string> = {
  English: "How do you want to vibe today",
  Tamil: "இன்னைக்கு எப்படி vibe பண்ணணும்",
  Tanglish: "Machi, epdi vibe pannanum",
};

interface Props {
  open: boolean;
  onClose: () => void;
  userName: string;
  onResult?: (label: string, tracks: VibeTrack[]) => void;
}

export function MoodModal({ open, onClose, userName, onResult }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [lang, setLang] = useState<Lang>("English");
  const [mood, setMood] = useState<MoodOption | null>(null);
  const searchFn = useServerFn(searchTracks);
  const { play } = usePlayer();

  const fetchMood = useMutation({
    mutationFn: (opt: MoodOption) =>
      searchFn({ data: { query: opt.query, max: 12 } }),
    onSuccess: (tracks, opt) => {
      const list: VibeTrack[] = tracks.map((t) => ({
        youtubeId: t.youtubeId,
        title: t.title,
        artist: t.artist,
        thumbnailUrl: t.thumbnailUrl,
        durationSeconds: t.durationSeconds,
      }));
      onResult?.(opt.label, list);
      setStep(3);
      // brief pause so the user sees the success state
      setTimeout(() => {
        reset();
        onClose();
      }, 700);
    },
  });

  const reset = () => {
    setStep(1);
    setMood(null);
    fetchMood.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickLang = (l: Lang) => {
    setLang(l);
    setStep(2);
  };
  const pickMood = (opt: MoodOption) => {
    setMood(opt);
    fetchMood.mutate(opt);
  };

  const results = fetchMood.data ?? [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-5 backdrop-blur-md"
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong gradient-border relative w-full max-w-md overflow-hidden rounded-3xl p-6"
          >
            <button
              onClick={handleClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative min-h-[260px]">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <p className="vibe-text text-[10px] font-bold uppercase tracking-[0.25em]">
                      Step 1 of 2
                    </p>
                    <h2 className="mt-2 text-2xl font-bold leading-tight">
                      {LANG_PROMPTS[lang]},{" "}
                      <span className="vibe-text">{userName}</span>?
                    </h2>
                    <p className="mt-2 text-sm text-white/55">
                      Pick your language to get started.
                    </p>

                    <div className="mt-7 flex flex-wrap gap-2.5">
                      {(["English", "Tamil", "Tanglish"] as Lang[]).map((l) => (
                        <button
                          key={l}
                          onClick={() => pickLang(l)}
                          className={cn(
                            "glass rounded-full px-5 py-3 text-sm font-semibold text-white transition active:scale-95",
                            "hover:bg-white/[0.08]",
                          )}
                        >
                          {l === "Tamil" ? "தமிழ்" : l}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <button
                      onClick={() => setStep(1)}
                      className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50 hover:text-white"
                    >
                      ← Step 2 of 2
                    </button>
                    <h2 className="mt-2 text-2xl font-bold leading-tight">
                      {COPY[lang].prompt}
                    </h2>

                    <div className="mt-7 space-y-2.5">
                      {COPY[lang].options.map((opt) => {
                        const isLoading =
                          fetchMood.isPending && mood?.key === opt.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => pickMood(opt)}
                            disabled={fetchMood.isPending}
                            className={cn(
                              "glass flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition active:scale-[0.98]",
                              "hover:bg-white/[0.08] disabled:opacity-60",
                              isLoading && "ring-2 ring-[var(--vibe-magenta)]",
                            )}
                          >
                            <span className="text-2xl">{opt.emoji}</span>
                            <span className="flex-1 text-sm font-semibold text-white">
                              {opt.label}
                            </span>
                            {isLoading && (
                              <Loader2 className="h-4 w-4 animate-spin text-[var(--vibe-magenta)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {fetchMood.isError && (
                      <p className="mt-3 text-xs text-red-400">
                        Couldn't load your vibe — try again.
                      </p>
                    )}
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="grid place-items-center py-10 text-center"
                  >
                    <div className="vibe-gradient grid h-16 w-16 place-items-center rounded-full text-2xl shadow-[0_0_30px_-4px_rgba(236,0,140,0.7)]">
                      {mood?.emoji}
                    </div>
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.25em] text-white/50">
                      Your vibe is ready
                    </p>
                    <h3 className="vibe-text mt-1 text-2xl font-bold">
                      {mood?.label}
                    </h3>
                    <p className="mt-1 text-xs text-white/50">
                      {results.length} tracks queued
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
