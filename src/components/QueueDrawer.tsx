import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { usePlayer } from "@/components/VibePlayer";


interface Props {
  open: boolean;
  onClose: () => void;
}

export function QueueDrawer({ open, onClose }: Props) {
  const { current, queue, index, isPlaying, removeFromQueue } = usePlayer();
  const upNext = queue.slice(index + 1);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[85vh] flex-col rounded-t-3xl border-t border-white/10 bg-[#0B0B0B] pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-label="Up next queue"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />
            <header className="flex items-center justify-between px-5 py-3">
              <h2 className="text-lg font-bold text-white">Up Next</h2>
              <button
                onClick={onClose}
                aria-label="Close queue"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="overflow-y-auto px-5 pb-6">
              {current && (
                <section className="mb-6">
                  <p className="vibe-text mb-2 text-[10px] font-bold uppercase tracking-[0.25em]">
                    Now Playing
                  </p>
                  <div className="glass-strong gradient-border flex items-center gap-3 rounded-2xl p-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                      {current.thumbnailUrl ? (
                        <img src={current.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="vibe-gradient h-full w-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{current.title}</p>
                      <p className="truncate text-xs text-white/50">{current.artist}</p>
                    </div>
                    <EqIcon playing={isPlaying} />
                  </div>
                </section>
              )}

              <section>
                <p className="vibe-text mb-2 text-[10px] font-bold uppercase tracking-[0.25em]">
                  Next in Queue
                </p>
                {upNext.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-white/40">
                    Nothing in the queue. Add some vibes!
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {upNext.map((t, i) => {
                      const absoluteIdx = index + 1 + i;
                      return (
                        <li
                          key={`${t.youtubeId}-${absoluteIdx}`}
                          className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5"
                        >
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                            {t.thumbnailUrl ? (
                              <img src={t.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="vibe-gradient h-full w-full" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-white">{t.title}</p>
                            <p className="truncate text-xs text-white/50">{t.artist}</p>
                          </div>
                          <button
                            onClick={() => removeFromQueue(absoluteIdx)}
                            aria-label={`Remove ${t.title}`}
                            className="grid h-9 w-9 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function EqIcon({ playing }: { playing: boolean }) {
  return (
    <div className="flex h-8 w-8 items-end justify-center gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="vibe-gradient w-[3px] origin-bottom rounded-full"
          style={{
            height: "100%",
            animation: playing
              ? `vibeBar ${0.55 + i * 0.15}s ease-in-out ${i * 0.08}s infinite alternate`
              : "none",
            transform: playing ? undefined : "scaleY(0.2)",
          }}
        />
      ))}
    </div>
  );
}
