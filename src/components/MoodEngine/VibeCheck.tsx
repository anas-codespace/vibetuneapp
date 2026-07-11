import { useEffect, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Sofa,
  Car,
  Code,
  Dumbbell,
  Flame,
  Smile,
  HeartCrack,
  TrendingUp,
  Rewind,
  Globe2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { searchTracks } from "@/lib/music.functions";
import type { VibeTrack } from "@/components/VibePlayer";
import { cn } from "@/lib/utils";

/* ----------------------------- Types & data ----------------------------- */

type Lang = "English" | "Tanglish";

type ContextKey = "chill" | "drive" | "work" | "workout";
type EnergyKey = "hype" | "peace" | "feels";
type FlavorKey = "trending" | "nostalgia" | "global";

interface ContextOption {
  key: ContextKey;
  label: string;
  icon: LucideIcon;
}
interface EnergyOption {
  key: EnergyKey;
  emoji: string;
  label: string;
}
interface FlavorOption {
  key: FlavorKey;
  emoji: string;
  label: string;
  gradient: string;
}

const CONTEXT_OPTIONS: ContextOption[] = [
  { key: "chill", label: "Chilling", icon: Sofa },
  { key: "drive", label: "Long Drive", icon: Car },
  { key: "work", label: "Deep Work", icon: Code },
  { key: "workout", label: "Workout", icon: Dumbbell },
];

const ENERGY_OPTIONS: Record<Lang, EnergyOption[]> = {
  English: [
    { key: "hype", emoji: "🔥", label: "Pure Hype" },
    { key: "peace", emoji: "😌", label: "Total Peace" },
    { key: "feels", emoji: "💔", label: "In my feelings" },
  ],
  Tanglish: [
    { key: "hype", emoji: "🔥", label: "Vera Level" },
    { key: "peace", emoji: "😌", label: "Summa Chill" },
    { key: "feels", emoji: "💔", label: "Kadaisi Bench" },
  ],
};

const FLAVOR_OPTIONS: FlavorOption[] = [
  {
    key: "trending",
    emoji: "📈",
    label: "Current Trending",
    gradient: "from-pink-500/40 via-fuchsia-700/30 to-violet-900/40",
  },
  {
    key: "nostalgia",
    emoji: "⏪",
    label: "2000s Nostalgia",
    gradient: "from-amber-500/30 via-rose-700/30 to-indigo-900/40",
  },
  {
    key: "global",
    emoji: "🌍",
    label: "Global Hits",
    gradient: "from-cyan-500/30 via-blue-700/30 to-violet-900/40",
  },
];

/* ----------------------------- Motion variants ----------------------------- */

const spring = { type: "spring", stiffness: 300, damping: 30 } as const;

const stepVariants: Variants = {
  enter: { x: 50, opacity: 0 },
  center: { x: 0, opacity: 1, transition: spring },
  exit: { x: -50, opacity: 0, transition: { duration: 0.2 } },
};

const titleVariants: Variants = {
  hidden: { y: 12, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { ...spring, delay: 0.05 } },
};

const cardVariants: Variants = {
  hidden: { y: 16, opacity: 0 },
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    transition: { ...spring, delay: 0.05 + i * 0.06 },
  }),
};

/* ----------------------------- Query builder ----------------------------- */

function buildQuery(
  lang: Lang,
  ctx: ContextKey,
  energy: EnergyKey,
  flavor: FlavorKey,
): string {
  const base = lang === "Tanglish" ? "tamil " : "";
  const ctxQ: Record<ContextKey, string> = {
    chill: "chill mellow",
    drive: "long drive road trip",
    work: "focus lofi deep work instrumental",
    workout: "workout gym high bpm",
  };
  const enQ: Record<EnergyKey, string> = {
    hype: "high energy hype mass",
    peace: "calm peaceful melody",
    feels: "sad emotional heartbreak ballads",
  };
  const flQ: Record<FlavorKey, string> = {
    trending: "trending hits new",
    nostalgia: "2000s nostalgia classics",
    global: "global hits international top",
  };
  return `${base}${ctxQ[ctx]} ${enQ[energy]} ${flQ[flavor]}`.trim();
}

function labelFor(
  ctx: ContextOption,
  energy: EnergyOption,
  flavor: FlavorOption,
): string {
  return `${flavor.label} · ${energy.label} · ${ctx.label}`;
}

/* ----------------------------- Component ----------------------------- */

interface Props {
  open: boolean;
  onClose: () => void;
  userName: string;
  lang?: Lang;
  onResult?: (label: string, tracks: VibeTrack[]) => void;
}

type Step = 1 | 2 | 3 | 4; // 4 = climax

export function VibeCheck({
  open,
  onClose,
  userName,
  lang = "English",
  onResult,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [ctx, setCtx] = useState<ContextOption | null>(null);
  const [energy, setEnergy] = useState<EnergyOption | null>(null);

  const searchFn = useServerFn(searchTracks);

  const mix = useMutation({
    mutationFn: (q: string) => searchFn({ data: { query: q, max: 12 } }),
  });

  useEffect(() => {
    if (!open) {
      // reset on close
      const t = setTimeout(() => {
        setStep(1);
        setCtx(null);
        setEnergy(null);
        mix.reset();
      }, 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pickContext = (o: ContextOption) => {
    setCtx(o);
    setStep(2);
  };
  const pickEnergy = (o: EnergyOption) => {
    setEnergy(o);
    setStep(3);
  };
  const pickFlavor = async (o: FlavorOption) => {
    if (!ctx || !energy) return;
    setStep(4);
    const q = buildQuery(lang, ctx.key, energy.key, o.key);
    try {
      const tracks = await mix.mutateAsync(q);
      const list: VibeTrack[] = (tracks ?? []).map((t) => ({
        youtubeId: t.youtubeId,
        title: t.title,
        artist: t.artist,
        thumbnailUrl: t.thumbnailUrl,
        durationSeconds: t.durationSeconds,
      }));
      onResult?.(labelFor(ctx, energy, o), list);
    } catch {
      /* swallow; UI shows generic state */
    }
    setTimeout(() => onClose(), 2000);
  };

  const progress = step === 4 ? 3 : step;
  const showStep: 1 | 2 | 3 = step === 4 ? 3 : (step as 1 | 2 | 3);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[90] grid place-items-end bg-black/40 p-3 backdrop-blur-3xl sm:place-items-center sm:p-6"
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={spring}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[#222] bg-[#000000] p-5 pt-4 shadow-[0_20px_80px_-20px_rgba(255,0,127,0.4)]"
          >
            {/* Close */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Persistent header */}
            <div className="pr-10">
              {/* Progress bar */}
              <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/5">
                <motion.div
                  initial={false}
                  animate={{ width: `${(progress / 3) * 100}%` }}
                  transition={spring}
                  className="h-full bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500"
                />
              </div>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">
                Step {progress} of 3
              </p>
              <motion.h2
                key={`title-${showStep}`}
                variants={titleVariants}
                initial="hidden"
                animate="visible"
                className="mt-1 text-[22px] font-bold leading-tight text-white"
              >
                Hey <span className="text-pink-500">{userName}</span>, let's tune your vibe.
              </motion.h2>
            </div>

            {/* Step body */}
            <div className="relative mt-6 min-h-[320px]">
              <AnimatePresence mode="wait" initial={false}>
                {step === 1 && (
                  <motion.div
                    key="step-1"
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <p className="text-sm text-white/60">
                      Where's the energy right now?
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {CONTEXT_OPTIONS.map((opt, i) => {
                        const Icon = opt.icon;
                        const active = ctx?.key === opt.key;
                        return (
                          <motion.button
                            key={opt.key}
                            custom={i}
                            variants={cardVariants}
                            initial="hidden"
                            animate="visible"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => pickContext(opt)}
                            className={cn(
                              "aspect-square rounded-2xl border p-4 text-left transition",
                              active
                                ? "border-pink-500 bg-pink-500/10 shadow-[0_0_24px_-6px_rgba(255,0,127,0.7)]"
                                : "border-white/5 bg-white/5 hover:bg-white/[0.07]",
                            )}
                          >
                            <div className="flex h-full flex-col items-center justify-center gap-3">
                              <Icon
                                className={cn(
                                  "h-9 w-9",
                                  active ? "text-pink-500" : "text-white/80",
                                )}
                                strokeWidth={1.5}
                              />
                              <span className="text-sm font-semibold text-white">
                                {opt.label}
                              </span>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step-2"
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <p className="text-sm text-white/60">Match your frequency.</p>
                    <div className="mt-4 space-y-3">
                      {ENERGY_OPTIONS[lang].map((opt, i) => {
                        const active = energy?.key === opt.key;
                        return (
                          <motion.button
                            key={opt.key}
                            custom={i}
                            variants={cardVariants}
                            initial="hidden"
                            animate="visible"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => pickEnergy(opt)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-full border px-5 py-4 text-left transition",
                              active
                                ? "border-pink-500 bg-pink-500/10 shadow-[0_0_24px_-6px_rgba(255,0,127,0.7)]"
                                : "border-white/5 bg-white/5 hover:bg-white/[0.07]",
                            )}
                          >
                            <span className="text-xl">{opt.emoji}</span>
                            <span className="flex-1 text-base font-semibold text-white">
                              {opt.label}
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step-3"
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <p className="text-sm text-white/60">Pick your flavor.</p>
                    <div className="-mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {FLAVOR_OPTIONS.map((opt, i) => (
                        <motion.button
                          key={opt.key}
                          custom={i}
                          variants={cardVariants}
                          initial="hidden"
                          animate="visible"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => pickFlavor(opt)}
                          className="relative h-56 w-44 shrink-0 overflow-hidden rounded-2xl border border-white/5 bg-black text-left"
                        >
                          <div
                            className={cn(
                              "absolute inset-0 bg-gradient-to-br",
                              opt.gradient,
                            )}
                          />
                          <div className="absolute inset-0 backdrop-blur-xl" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                          <div className="absolute inset-0 flex flex-col justify-between p-4">
                            <span className="text-3xl">{opt.emoji}</span>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                                Flavor
                              </p>
                              <p className="mt-0.5 text-base font-bold leading-tight text-white">
                                {opt.label}
                              </p>
                            </div>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === 4 && (
                  <motion.div
                    key="step-climax"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex min-h-[320px] flex-col items-center justify-center gap-6 text-center"
                  >
                    <div className="relative h-32 w-32">
                      <motion.div
                        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.2, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 blur-2xl"
                      />
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-2 rounded-full bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-pink-500 shadow-[0_0_60px_-10px_rgba(255,0,127,0.8)]"
                      />
                      <motion.div
                        animate={{ scale: [0.95, 1.05, 0.95] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-6 rounded-full bg-[#000000]/60 backdrop-blur-md"
                      />
                    </div>
                    <p className="text-base font-semibold text-white">
                      Mixing your perfect soundwave…
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
