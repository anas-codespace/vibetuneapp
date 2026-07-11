import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Heart,
  ListMusic,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";

import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Slider } from "@/components/ui/slider";
import { logListen } from "@/lib/profile.functions";
import { getLikedIds, toggleLike } from "@/lib/library.functions";
import { getSmartMix } from "@/lib/mix.functions";
import { startAudioForeground, stopAudioForeground } from "@/lib/capacitor-audio";
import { SyncedLyrics } from "@/components/SyncedLyrics";
import { AddToPlaylistSheet } from "@/components/AddToPlaylistSheet";
import { QueueDrawer } from "@/components/QueueDrawer";
import { cn } from "@/lib/utils";
import { cleanYouTubeTitle } from "@/utils/textUtils";

export interface VibeTrack {
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
}

interface PlayerCtx {
  current: VibeTrack | null;
  queue: VibeTrack[];
  index: number;
  isPlaying: boolean;
  mixMode: boolean;
  play: (track: VibeTrack, queue?: VibeTrack[]) => void;
  startMix: (tracks: VibeTrack[]) => void;
  addToQueue: (track: VibeTrack) => void;
  removeFromQueue: (index: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  close: () => void;
  expand: () => void;
}


const Ctx = createContext<PlayerCtx | null>(null);

export function usePlayer() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlayer must be used within <VibePlayerProvider>");
  return v;
}

/* ------------------------- YouTube IFrame loader ------------------------- */

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytReadyPromise: Promise<any> | null = null;
function loadYT(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytReadyPromise) return ytReadyPromise;
  ytReadyPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  });
  return ytReadyPromise;
}

/* ------------------------------ Provider ------------------------------ */

export function VibePlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<VibeTrack | null>(null);
  const [queue, setQueue] = useState<VibeTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [mixMode, setMixMode] = useState(false);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<number | null>(null);
  const replenishRef = useRef<boolean>(false);
  const readyRef = useRef<boolean>(false);
  const pendingRef = useRef<string | null>(null);
  const logListenFn = useServerFn(logListen);
  const mixFn = useServerFn(getSmartMix);

  useEffect(() => {
    let cancelled = false;
    loadYT().then((YT) => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        height: "180",
        width: "320",
        playerVars: {
          autoplay: 0,
          controls: 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            playerRef.current?.setVolume?.(80);
            const pending = pendingRef.current;
            if (pending) {
              pendingRef.current = null;
              try {
                playerRef.current?.loadVideoById?.(pending);
                window.setTimeout(() => playerRef.current?.playVideo?.(), 0);
              } catch { /* noop */ }
            }
          },
          onStateChange: (e: any) => {
            if (e.data === 1) setIsPlaying(true);
            else if (e.data === 2) setIsPlaying(false);
            else if (e.data === 0) {
              setIsPlaying(false);
              nextRef.current?.();
            }
          },
          onError: (e: any) => {
            // 2=invalid id, 5=HTML5, 100=removed, 101/150=embedding disabled
            console.warn("[VibePlayer] YouTube error", e?.data);
            nextRef.current?.();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      try {
        setProgress(p.getCurrentTime() ?? 0);
        setDuration(p.getDuration() ?? 0);
      } catch { /* noop */ }
    }, 250);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  const loadAndPlay = useCallback((youtubeId: string) => {
    const p = playerRef.current;
    if (readyRef.current && p?.loadVideoById) {
      try {
        p.loadVideoById(youtubeId);
        window.setTimeout(() => p.playVideo?.(), 0);
        return;
      } catch { /* noop */ }
    }
    pendingRef.current = youtubeId;
  }, []);

  const play = useCallback((track: VibeTrack, q?: VibeTrack[]) => {
    const newQueue = q ?? [track];
    const idx = newQueue.findIndex((t) => t.youtubeId === track.youtubeId);
    setQueue(newQueue);
    setIndex(idx >= 0 ? idx : 0);
    setCurrent(track);
    setMixMode(false);
    loadAndPlay(track.youtubeId);
    logListenFn({
      data: { youtubeId: track.youtubeId, title: track.title, artist: track.artist },
    }).catch(() => {});
    startAudioForeground();
  }, [loadAndPlay, logListenFn]);

  const startMix = useCallback((tracks: VibeTrack[]) => {
    if (tracks.length === 0) return;
    setMixMode(true);
    setQueue(tracks);
    setIndex(0);
    setCurrent(tracks[0]);
    loadAndPlay(tracks[0].youtubeId);
    logListenFn({
      data: { youtubeId: tracks[0].youtubeId, title: tracks[0].title, artist: tracks[0].artist },
    }).catch(() => {});
    startAudioForeground();
  }, [loadAndPlay, logListenFn]);

  const addToQueue = useCallback((track: VibeTrack) => {
    setCurrent((cur) => {
      if (!cur) {
        // Nothing playing → start this track immediately.
        setQueue([track]);
        setIndex(0);
        setMixMode(false);
        loadAndPlay(track.youtubeId);
        logListenFn({
          data: { youtubeId: track.youtubeId, title: track.title, artist: track.artist },
        }).catch(() => {});
        startAudioForeground();
        toast.success("Playing now");
        return track;
      }
      setQueue((q) => [...q, track]);
      toast.success("Added to queue");
      return cur;
    });
  }, [loadAndPlay, logListenFn]);

  const removeFromQueue = useCallback((removeIdx: number) => {
    setQueue((q) => {
      if (removeIdx <= index || removeIdx >= q.length) return q;
      const next = q.slice();
      next.splice(removeIdx, 1);
      return next;
    });
  }, [index]);


  // Auto-replenish: when mix mode is on and queue is running low, fetch more tracks
  const replenishQueue = useCallback(async (remaining: number) => {
    if (!mixMode || replenishRef.current || remaining >= 3) return;
    replenishRef.current = true;
    try {
      const more = await mixFn();
      const newTracks: VibeTrack[] = (more ?? []).map((t) => ({
        youtubeId: t.youtubeId,
        title: t.title,
        artist: t.artist,
        thumbnailUrl: t.thumbnailUrl,
        durationSeconds: t.durationSeconds,
      }));
      if (newTracks.length > 0) {
        setQueue((prev) => [...prev, ...newTracks]);
      }
    } catch {
      // Silently fail — music continues with existing queue
    } finally {
      replenishRef.current = false;
    }
  }, [mixMode, mixFn]);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) {
      if (current) pendingRef.current = current.youtubeId;
      return;
    }
    try {
      if (isPlaying) p.pauseVideo?.();
      else p.playVideo?.();
    } catch { /* noop */ }
  }, [current, isPlaying]);

  const next = useCallback(() => {
    if (!queue.length) return;
    const ni = (index + 1) % queue.length;
    const t = queue[ni];
    setIndex(ni);
    setCurrent(t);
    loadAndPlay(t.youtubeId);
    logListenFn({ data: { youtubeId: t.youtubeId, title: t.title, artist: t.artist } }).catch(() => {});
    const remaining = queue.length - ni - 1;
    replenishQueue(remaining);
  }, [index, queue, loadAndPlay, logListenFn, replenishQueue]);

  const prev = useCallback(() => {
    if (!queue.length) return;
    const pi = (index - 1 + queue.length) % queue.length;
    const t = queue[pi];
    setIndex(pi);
    setCurrent(t);
    loadAndPlay(t.youtubeId);
    logListenFn({ data: { youtubeId: t.youtubeId, title: t.title, artist: t.artist } }).catch(() => {});
  }, [index, queue, loadAndPlay, logListenFn]);

  const nextRef = useRef(next);
  useEffect(() => { nextRef.current = next; }, [next]);

  const close = useCallback(() => {
    playerRef.current?.stopVideo?.();
    setCurrent(null);
    setIsPlaying(false);
    setExpanded(false);
    stopAudioForeground();
  }, []);

  const expand = useCallback(() => setExpanded(true), []);
  const collapse = useCallback(() => setExpanded(false), []);

  const value = useMemo<PlayerCtx>(
    () => ({ current, queue, index, isPlaying, mixMode, play, startMix, addToQueue, removeFromQueue, toggle, next, prev, close, expand }),
    [current, queue, index, isPlaying, mixMode, play, startMix, addToQueue, removeFromQueue, toggle, next, prev, close, expand],
  );


  const seek = useCallback((s: number) => playerRef.current?.seekTo?.(s, true), []);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-0 top-0 h-[180px] w-[320px] opacity-0" aria-hidden>
        <div ref={containerRef} />
      </div>
      <AnimatePresence>
        {current && !expanded && (
          <MiniPlayer
            track={current}
            isPlaying={isPlaying}
            progress={progress}
            duration={duration}
            onToggle={toggle}
            onExpand={expand}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {current && expanded && (
          <FullPlayer
            track={current}
            isPlaying={isPlaying}
            progress={progress}
            duration={duration}
            onToggle={toggle}
            onNext={next}
            onPrev={prev}
            onSeek={seek}
            onCollapse={collapse}
          />
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

/* ------------------------------- Mini ------------------------------- */

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

interface MiniProps {
  track: VibeTrack;
  isPlaying: boolean;
  progress: number;
  duration: number;
  onToggle: () => void;
  onExpand: () => void;
}

function MiniPlayer(p: MiniProps) {
  const pct = p.duration ? (p.progress / p.duration) * 100 : 0;
  return (
    <motion.div
      role="button"
      tabIndex={0}
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      onClick={p.onExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          p.onExpand();
        }
      }}
      className="fixed inset-x-0 z-40 cursor-pointer px-4 text-left"
      style={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }}
    >
      <div className="relative mx-auto flex max-w-md items-center gap-3 overflow-hidden rounded-2xl border border-pink-500/20 bg-[#1A1A1A] p-2 pr-3 shadow-[0_0_28px_-8px_rgba(255,0,127,0.5)] md:max-w-lg">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl">
          {p.track.thumbnailUrl ? (
            <img src={p.track.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="vibe-gradient h-full w-full" />
          )}
          <Visualizer playing={p.isPlaying} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{cleanYouTubeTitle(p.track.title)}</p>
          <p className="truncate text-xs text-white/50">{p.track.artist}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); p.onToggle(); }}
          aria-label={p.isPlaying ? "Pause" : "Play"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pink-500 text-white shadow-[0_0_20px_-4px_rgba(255,0,127,0.8)] active:scale-95"
        >
          {p.isPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4 translate-x-0.5" fill="currentColor" />}
        </button>
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/5">
          <div className="vibe-gradient-h h-full transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="sr-only">{fmt(p.progress)} / {fmt(p.duration)}</span>
    </motion.div>
  );
}

/* ----------------------------- Full screen ----------------------------- */

interface FullProps {
  track: VibeTrack;
  isPlaying: boolean;
  progress: number;
  duration: number;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (s: number) => void;
  onCollapse: () => void;
}

function FullPlayer(p: FullProps) {
  const [activeView, setActiveView] = useState<"player" | "lyrics">("player");
  const [addOpen, setAddOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  // Lock background scroll while the full-screen player is mounted.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const likedFn = useServerFn(getLikedIds);
  const toggleFn = useServerFn(toggleLike);
  const qc = useQueryClient();

  const { data: likedIds } = useQuery({
    queryKey: ["liked-ids"],
    queryFn: () => likedFn(),
  });
  const isLiked = (likedIds ?? []).includes(p.track.youtubeId);

  const handleLike = async () => {
    try {
      await toggleFn({
        data: {
          youtubeId: p.track.youtubeId,
          title: p.track.title,
          artist: p.track.artist,
          thumbnailUrl: p.track.thumbnailUrl ?? null,
        },
      });
      qc.invalidateQueries({ queryKey: ["liked-ids"] });
      qc.invalidateQueries({ queryKey: ["liked-songs"] });
    } catch { /* noop */ }
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 280, damping: 32 }}
      className="fixed inset-0 z-[70] flex flex-col bg-[#050505] pb-[env(safe-area-inset-bottom)]"
    >
      {/* Ambient glow from artwork */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {p.track.thumbnailUrl && (
          <img
            src={p.track.thumbnailUrl}
            aria-hidden
            className="absolute inset-0 h-full w-full scale-150 object-cover opacity-40 blur-3xl"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-[#050505]" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        {/* Drag handle */}
        <div className="mx-auto my-4 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-[env(safe-area-inset-top)] pb-2 pt-4">
          <button
            onClick={p.onCollapse}
            aria-label="Minimize"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
          <div className="flex gap-1 rounded-full bg-white/5 p-1">
            {(["player", "lyrics"] as const).map((t) => {
              const active = activeView === t;
              return (
                <button
                  key={t}
                  onClick={() => setActiveView(t)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition",
                    active
                      ? "bg-gradient-to-r from-fuchsia-600 to-pink-500 text-white shadow-[0_0_18px_-4px_rgba(236,0,140,0.6)]"
                      : "bg-white/5 text-white/50 hover:text-white",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setQueueOpen(true)}
            aria-label="Up next"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10"
          >
            <ListMusic className="h-5 w-5" />
          </button>

        </div>

        {activeView === "player" ? (
          <motion.div
            key="player-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-1 flex-col px-6"
          >
            {/* Album art — enforced perfect square, no letterboxing */}
            <div className="flex flex-1 items-center justify-center py-6">
              <motion.div
                layoutId="album-art"
                className="relative mx-auto mb-6 mt-8 aspect-square w-full max-w-[340px] overflow-hidden rounded-3xl border border-white/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]"
              >
                {p.track.thumbnailUrl ? (
                  <img
                    src={p.track.thumbnailUrl}
                    alt="Album Art"
                    className="absolute inset-0 h-full w-full scale-100 object-cover transition-transform duration-500"
                  />
                ) : (
                  <div className="vibe-gradient absolute inset-0 h-full w-full" />
                )}
              </motion.div>
            </div>

            {/* Title + artist */}
            <div className="text-center">
              <h2 className="line-clamp-1 text-2xl font-bold tracking-tight text-white">
                {cleanYouTubeTitle(p.track.title)}
              </h2>
              <p className="mt-1 text-base text-white/60">{p.track.artist}</p>
            </div>

            {/* Progress — thin bar, iOS-style thumb (hidden until hover/active) */}
            <div className="group mt-8">
              <Slider
                value={[p.duration ? (p.progress / p.duration) * 100 : 0]}
                onValueChange={(v) => p.duration && p.onSeek((v[0] / 100) * p.duration)}
                max={100}
                step={0.1}
                className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:opacity-0 [&_[role=slider]]:transition-opacity group-hover:[&_[role=slider]]:opacity-100 [&_[role=slider]:focus-visible]:opacity-100 [&_[role=slider]:active]:opacity-100"
              />
              <div className="mt-2 flex justify-between text-[11px] tabular-nums text-white/40">
                <span>{fmt(p.progress)}</span>
                <span>-{fmt(Math.max(0, p.duration - p.progress))}</span>
              </div>
            </div>

            {/* Controls — larger play, ergonomically spaced */}
            <div className="mt-8 flex items-center justify-center gap-6">
              <button
                onClick={handleLike}
                aria-label={isLiked ? "Unlike" : "Like"}
                className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/5 hover:text-white"
              >
                <Heart
                  className={cn("h-5 w-5 transition", isLiked && "fill-current")}
                  style={isLiked ? { color: "#EC008C", filter: "drop-shadow(0 0 8px rgba(236,0,140,0.7))" } : undefined}
                />
              </button>
              <button
                onClick={p.onPrev}
                aria-label="Previous"
                className="grid h-10 w-10 place-items-center rounded-full text-white/80 hover:bg-white/5 hover:text-white"
              >
                <SkipBack className="h-6 w-6" fill="currentColor" />
              </button>
              <button
                onClick={p.onToggle}
                aria-label={p.isPlaying ? "Pause" : "Play"}
                className="vibe-gradient mx-2 grid h-20 w-20 place-items-center rounded-full text-white shadow-[0_0_40px_-6px_rgba(236,0,140,0.75)] transition active:scale-95"
              >
                {p.isPlaying ? <Pause className="h-9 w-9" fill="currentColor" /> : <Play className="h-9 w-9 translate-x-0.5" fill="currentColor" />}
              </button>
              <button
                onClick={p.onNext}
                aria-label="Next"
                className="grid h-10 w-10 place-items-center rounded-full text-white/80 hover:bg-white/5 hover:text-white"
              >
                <SkipForward className="h-6 w-6" fill="currentColor" />
              </button>
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Add to playlist"
                className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/5 hover:text-white"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="h-8" />
          </motion.div>
        ) : (
          <motion.div
            key="lyrics-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="relative flex-1 overflow-hidden px-6"
          >
            <div className="hide-scrollbar fade-mask-y mx-auto h-[400px] max-w-md overflow-y-auto rounded-2xl">
              <SyncedLyrics
                title={p.track.title}
                artist={p.track.artist}
                currentTime={p.progress}
              />
            </div>
            {/* Inline mini controls */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent px-6 pb-4 pt-12">
              <Slider
                value={[p.duration ? (p.progress / p.duration) * 100 : 0]}
                onValueChange={(v) => p.duration && p.onSeek((v[0] / 100) * p.duration)}
                max={100}
                step={0.1}
              />
              <div className="mt-3 flex items-center justify-center gap-6">
                <button onClick={p.onPrev} aria-label="Previous" className="text-white/80">
                  <SkipBack className="h-6 w-6" fill="currentColor" />
                </button>
                <button
                  onClick={p.onToggle}
                  aria-label={p.isPlaying ? "Pause" : "Play"}
                  className="vibe-gradient grid h-14 w-14 place-items-center rounded-full text-white shadow-[0_0_24px_-4px_rgba(236,0,140,0.7)] active:scale-95"
                >
                  {p.isPlaying ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="h-6 w-6 translate-x-0.5" fill="currentColor" />}
                </button>
                <button onClick={p.onNext} aria-label="Next" className="text-white/80">
                  <SkipForward className="h-6 w-6" fill="currentColor" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <AddToPlaylistSheet open={addOpen} onClose={() => setAddOpen(false)} track={p.track} />
      <QueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
    </motion.div>
  );
}

/* ----------------------------- Visualizer ----------------------------- */

const BAR_COUNT = 4;

function Visualizer({ playing }: { playing: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-end justify-center gap-[2px] bg-black/40 p-1.5">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          className="vibe-gradient w-[2px] origin-bottom rounded-full"
          style={{
            height: "100%",
            animation: playing
              ? `vibeBar ${0.6 + (i % 3) * 0.18}s ease-in-out ${i * 0.07}s infinite alternate`
              : "none",
            transform: playing ? undefined : "scaleY(0.18)",
            opacity: 0.95,
          }}
        />
      ))}
      <style>{`@keyframes vibeBar { 0% { transform: scaleY(0.2); } 100% { transform: scaleY(1); } }`}</style>
    </div>
  );
}
