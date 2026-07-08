import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Check, Loader2, X, Music, Globe } from "lucide-react";
import type { SpotifyArtistInfo } from "@/lib/music.types";
import { cn } from "@/lib/utils";

interface Props {
  languages: string[];
  artists: SpotifyArtistInfo[];
  onToggleLang: (lang: string) => void;
  onToggleArtist: (artist: SpotifyArtistInfo) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}

export function SummaryStep({
  languages,
  artists,
  onToggleLang,
  onToggleArtist,
  onBack,
  onFinish,
  saving,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="mx-auto max-w-2xl"
    >
      <div className="text-center">
        <h1 className="text-4xl font-bold md:text-5xl">
          Your <span className="vibe-text">vibe</span>, defined
        </h1>
        <p className="mt-3 text-white/60">
          Review your picks. Tap any item to remove it.
        </p>
      </div>

      {/* Languages summary */}
      <div className="mt-10">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/50">
          <Globe className="h-4 w-4" />
          Languages
          <span className="ml-auto text-xs font-normal normal-case text-white/30">
            {languages.length} picked
          </span>
        </div>
        <div className="glass rounded-2xl p-4">
          {languages.length === 0 ? (
            <p className="text-sm text-white/40">No languages selected.</p>
          ) : (
            <LayoutGroup>
              <AnimatePresence mode="popLayout">
                <motion.div
                  layout
                  className="flex flex-wrap gap-2"
                >
                  {languages.map((lang) => (
                    <motion.button
                      key={lang}
                      layout
                      type="button"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.18, ease: "easeInOut" as const } }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{
                        layout: { type: "spring", stiffness: 400, damping: 28 },
                        opacity: { duration: 0.2 },
                        scale: { duration: 0.2 },
                      }}
                      onClick={() => onToggleLang(lang)}
                      className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7D3FF3]/20 to-[#EC008C]/20 px-3.5 py-1.5 text-sm font-medium text-white/90 ring-1 ring-white/10 transition hover:from-[#7D3FF3]/30 hover:to-[#EC008C]/30 hover:ring-white/20"
                    >
                      {lang}
                      <X className="h-3.5 w-3.5 text-white/40 transition group-hover:text-white" />
                    </motion.button>
                  ))}
                </motion.div>
              </AnimatePresence>
            </LayoutGroup>
          )}
        </div>
      </div>

      {/* Artists summary */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/50">
          <Music className="h-4 w-4" />
          Artists
          <span className="ml-auto text-xs font-normal normal-case text-white/30">
            {artists.length} picked
          </span>
        </div>
        <div className="glass rounded-2xl p-4">
          {artists.length === 0 ? (
            <p className="text-sm text-white/40">No artists selected.</p>
          ) : (
            <LayoutGroup>
              <AnimatePresence mode="popLayout">
                <motion.div
                  layout
                  className="flex flex-wrap gap-3"
                >
                  {artists.map((a) => (
                    <motion.button
                      key={a.id}
                      layout
                      type="button"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05, transition: { duration: 0.18, ease: "easeInOut" as const } }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{
                        layout: { type: "spring", stiffness: 400, damping: 28 },
                        opacity: { duration: 0.2 },
                        scale: { duration: 0.2 },
                      }}
                      onClick={() => onToggleArtist(a)}
                      className="group relative flex items-center gap-2.5 rounded-full bg-white/5 px-3 py-2 text-left ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-white/20"
                    >
                      {a.hdPhotoUrl ? (
                        <img
                          src={a.hdPhotoUrl}
                          alt={a.name}
                          className="h-8 w-8 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="vibe-gradient h-8 w-8 rounded-full" />
                      )}
                      <span className="text-sm font-medium text-white/90">{a.name}</span>
                      <X className="h-3.5 w-3.5 text-white/30 transition group-hover:text-white" />
                    </motion.button>
                  ))}
                </motion.div>
              </AnimatePresence>
            </LayoutGroup>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-6 mt-12 flex items-center justify-between gap-4 rounded-full px-2">
        <button
          type="button"
          onClick={onBack}
          className="glass rounded-full px-6 py-3 text-sm text-white/80 hover:text-white"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={saving}
          className={cn(
            "rounded-full px-8 py-3 text-sm font-semibold transition-all",
            !saving
              ? "vibe-gradient-h text-white shadow-[0_0_40px_-10px_rgba(236,0,140,0.7)] hover:scale-105"
              : "cursor-not-allowed bg-white/5 text-white/30",
          )}
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4" /> Save & Enter Vibtune
            </span>
          )}
        </button>
      </div>
    </motion.div>
  );
}
