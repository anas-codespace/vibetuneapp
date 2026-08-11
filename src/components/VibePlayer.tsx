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
  Download,
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
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Slider } from "@/components/ui/slider";
import { logListen } from "@/lib/profile.functions";
import { logListenEvent } from "@/lib/taste.functions";
import { getLikedIds, toggleLike } from "@/lib/library.functions";
import { getSmartMix, getContextualQueue } from "@/lib/mix.functions";
import {
  startAudioForeground,
  stopAudioForeground,
  updateNowPlaying,
  onMediaControl,
  requestNotificationPermission,
  setWebMediaSession,
} from "@/lib/capacitor-audio";
import {
  enableBackgroundPlayback,
  pauseBackgroundPlayback,
  disableBackgroundPlayback,
} from "@/lib/background-playback";
import { SyncedLyrics } from "@/components/SyncedLyrics";
import { AddToPlaylistSheet } from "@/components/AddToPlaylistSheet";
import { QueueDrawer } from "@/components/QueueDrawer";
import { cn } from "@/lib/utils";
import { cleanYouTubeTitle } from "@/utils/textUtils";
import { useDownloads, isTrackDownloaded } from "@/hooks/use-downloads";
import { isOffline } from "@/hooks/use-online-status";

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
  isLoadingNext: boolean;
  play: (track: VibeTrack, queue?: VibeTrack[]) => void;
  startMix: (tracks: VibeTrack[]) => void;
  addToQueue: (track: VibeTrack) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIdx: number, toIdx: number) => void;
  jumpToQueueIndex: (idx: number) => void;
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

/**
 * Offline gate: when the device has no connection, only tracks saved to the
 * offline library can be played.
 */
function blockedOffline(track: VibeTrack): boolean {
  if (!isOffline()) return false;
  if (isTrackDownloaded(track.youtubeId)) return false;
  toast.error("You're offline — only downloaded songs can play.");
  return true;
}

/* ------------------------------ Provider ------------------------------ */

export function VibePlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<VibeTrack | null>(null);
  const [queue, setQueue] = useState<VibeTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressRef = useRef(0);
  const durationRef = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [mixMode, setMixMode] = useState(false);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const playedHistoryRef = useRef<Set<string>>(new Set());

  // Freshest-state refs (avoid stale closures in async / event callbacks).
  const queueRef = useRef<VibeTrack[]>([]);
  const indexRef = useRef<number>(0);
  const currentRef = useRef<VibeTrack | null>(null);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { currentRef.current = current; }, [current]);

  // Prefetch coordination: when the currently-playing track is at (or near)
  // the end of the queue, warm up related-track suggestions and the next
  // thumbnail so the transition is instant.
  useEffect(() => {
    if (!current) return;
    const remaining = queue.length - index - 1;
    // Warm the next queued track's thumbnail so the UI paints instantly.
    if (remaining > 0) {
      const nextTrack = queue[index + 1];
      if (nextTrack?.thumbnailUrl && typeof window !== "undefined") {
        try { const img = new Image(); img.decoding = "async"; img.src = nextTrack.thumbnailUrl; } catch { /* noop */ }
      }
    }
    // If this is the last track, prefetch related-tracks now so autoplay is instant.
    if (remaining <= 0) {
      // Fire-and-forget; guarded internally against duplicate work.
      void prefetchRelatedForRef.current?.(current);
    }
  }, [current, queue, index]);


  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<number | null>(null);
  const replenishRef = useRef<boolean>(false);

  const readyRef = useRef<boolean>(false);
  const pendingRef = useRef<string | null>(null);
  const logListenFn = useServerFn(logListen);
  const logListenEventFn = useServerFn(logListenEvent);
  const mixFn = useServerFn(getSmartMix);
  const contextFn = useServerFn(getContextualQueue);

  /**
   * Track-in-progress state used to emit a rich `listening_events` row when
   * a track ends or is replaced. Kept as refs so it never triggers renders.
   */
  const currentTrackRef = useRef<VibeTrack | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const lastProgressMsRef = useRef<number>(0);
  const lastDurationMsRef = useRef<number>(0);
  const nextEndReasonRef = useRef<
    "completed" | "next_pressed" | "prev_pressed" | "error" | "abandoned"
  >("abandoned");

  /**
   * Emit a listening_events row for the *previous* track before replacing it.
   * Called from every transition (next/prev/jump/play/error/completed).
   */
  const flushListenEvent = useCallback(
    (reasonHint?: "completed" | "next_pressed" | "prev_pressed" | "error") => {
      const prev = currentTrackRef.current;
      const startedAt = startedAtRef.current;
      if (!prev || !startedAt) return;
      const listenedMs = Math.max(0, Math.floor(lastProgressMsRef.current));
      const trackMs = Math.max(0, Math.floor(lastDurationMsRef.current));
      const ratio = trackMs > 0 ? listenedMs / trackMs : 0;
      let endReason: "completed" | "skipped_early" | "skipped_late" | "next_pressed" | "prev_pressed" | "error" | "abandoned";
      const hint = reasonHint ?? nextEndReasonRef.current;
      if (hint === "completed") endReason = "completed";
      else if (hint === "error") endReason = "error";
      else if (ratio >= 0.8) endReason = "skipped_late";
      else if (listenedMs < 5000 || ratio < 0.15) endReason = "skipped_early";
      else endReason = hint;
      const hourLocal = new Date().getHours();
      logListenEventFn({
        data: {
          youtubeId: prev.youtubeId,
          title: prev.title,
          artist: prev.artist,
          startedAt,
          listenedMs,
          trackMs,
          endReason,
          source: "queue",
          contextLang: null,
          hourLocal,
        },
      }).catch(() => {});
    },
    [logListenEventFn],
  );

  /** Reset the per-track counters when a new track starts playing. */
  const beginTrack = useCallback((track: VibeTrack) => {
    currentTrackRef.current = track;
    startedAtRef.current = new Date().toISOString();
    lastProgressMsRef.current = 0;
    lastDurationMsRef.current = (track.durationSeconds ?? 0) * 1000;
    nextEndReasonRef.current = "abandoned";
  }, []);

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
              // Track ended naturally → flush as "completed" before switching.
              nextEndReasonRef.current = "completed";
              flushListenEvent("completed");
              currentTrackRef.current = null;
              startedAtRef.current = null;
              nextRef.current?.();
            }
          },
          onError: (e: any) => {
            // 2=invalid id, 5=HTML5, 100=removed, 101/150=embedding disabled
            console.warn("[VibePlayer] YouTube error", e?.data);
            flushListenEvent("error");
            currentTrackRef.current = null;
            startedAtRef.current = null;
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
    tickRef.current = window.setInterval(async () => {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      try {
        const cur = p.getCurrentTime() ?? 0;
        const dur = p.getDuration() ?? 0;
        
        // If we are offline or YouTube fails, we check for local blob
        // But the IFrame doesn't support local blobs easily.
        // In a real native app, we'd use a native player for local files.
        
        progressRef.current = cur;
        durationRef.current = dur;
        setProgress(cur);
        setDuration(dur);
        lastProgressMsRef.current = cur * 1000;
        if (dur > 0) lastDurationMsRef.current = dur * 1000;
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

  const autoPopulateQueue = useCallback((track: VibeTrack) => {
    contextFn({
      data: { youtubeId: track.youtubeId, title: track.title, artist: track.artist },
    })
      .then((related) => {
        if (!related?.length) return;
        setQueue((prev) => {
          const existing = new Set(prev.map((t) => t.youtubeId));
          const additions: VibeTrack[] = related
            .filter((t) => !existing.has(t.youtubeId))
            .map((t) => ({
              youtubeId: t.youtubeId,
              title: t.title,
              artist: t.artist,
              thumbnailUrl: t.thumbnailUrl,
              durationSeconds: t.durationSeconds,
            }));
          return [...prev, ...additions];
        });
      })
      .catch(() => {});
  }, [contextFn]);

  const play = useCallback((track: VibeTrack, q?: VibeTrack[]) => {
    // Emit the previous track's outcome (user swapped songs mid-play).
    flushListenEvent("next_pressed");
    const newQueue = q ?? [track];
    const idx = newQueue.findIndex((t) => t.youtubeId === track.youtubeId);
    setQueue(newQueue);
    setIndex(idx >= 0 ? idx : 0);
    setCurrent(track);
    setMixMode(false);
    loadAndPlay(track.youtubeId);
    beginTrack(track);
    logListenFn({
      data: { youtubeId: track.youtubeId, title: track.title, artist: track.artist },
    }).catch(() => {});
    startAudioForeground();
    // Context-aware auto-queue: append related tracks in the background
    autoPopulateQueue(track);
  }, [loadAndPlay, logListenFn, autoPopulateQueue, flushListenEvent, beginTrack]);


  const startMix = useCallback((tracks: VibeTrack[]) => {
    if (tracks.length === 0) return;
    flushListenEvent("next_pressed");
    setMixMode(true);
    setQueue(tracks);
    setIndex(0);
    setCurrent(tracks[0]);
    loadAndPlay(tracks[0].youtubeId);
    beginTrack(tracks[0]);
    logListenFn({
      data: { youtubeId: tracks[0].youtubeId, title: tracks[0].title, artist: tracks[0].artist },
    }).catch(() => {});
    startAudioForeground();
  }, [loadAndPlay, logListenFn, flushListenEvent, beginTrack]);

  const addToQueue = useCallback((track: VibeTrack) => {
    setCurrent((cur) => {
      if (!cur) {
        // Nothing playing → start this track immediately.
        setQueue([track]);
        setIndex(0);
        setMixMode(false);
        loadAndPlay(track.youtubeId);
        beginTrack(track);
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
  }, [loadAndPlay, logListenFn, beginTrack]);

  const removeFromQueue = useCallback((removeIdx: number) => {
    setQueue((q) => {
      if (removeIdx <= index || removeIdx >= q.length) return q;
      const next = q.slice();
      next.splice(removeIdx, 1);
      return next;
    });
  }, [index]);

  const reorderQueue = useCallback((fromIdx: number, toIdx: number) => {
    setQueue((q) => {
      // Only allow reordering within the upcoming portion (after `index`).
      if (fromIdx <= index || toIdx <= index) return q;
      if (fromIdx >= q.length || toIdx >= q.length) return q;
      if (fromIdx === toIdx) return q;
      const next = q.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, [index]);

  const jumpToQueueIndex = useCallback((targetIdx: number) => {
    setQueue((q) => {
      if (targetIdx <= index || targetIdx >= q.length) return q;
      const chosen = q[targetIdx];
      // Remove the chosen track from its queued slot and place it immediately after current.
      const next = q.slice();
      next.splice(targetIdx, 1);
      const insertAt = index + 1;
      next.splice(insertAt, 0, chosen);
      const newIdx = insertAt;
      flushListenEvent("next_pressed");
      setIndex(newIdx);
      setCurrent(chosen);
      loadAndPlay(chosen.youtubeId);
      beginTrack(chosen);
      logListenFn({
        data: { youtubeId: chosen.youtubeId, title: chosen.title, artist: chosen.artist },
      }).catch(() => {});
      startAudioForeground();
      return next;
    });
  }, [index, loadAndPlay, logListenFn, flushListenEvent, beginTrack]);


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

  const playAtIndex = useCallback((ni: number, q: VibeTrack[]) => {
    const t = q[ni];
    if (!t) return;
    setIndex(ni);
    setCurrent(t);
    loadAndPlay(t.youtubeId);
    beginTrack(t);
    playedHistoryRef.current.add(t.youtubeId);
    logListenFn({ data: { youtubeId: t.youtubeId, title: t.title, artist: t.artist } }).catch(() => {});
  }, [loadAndPlay, logListenFn, beginTrack]);

  // Prefetched "next batch" of related tracks — populated in the background
  // before the queue exhausts, so autoplay transitions are instant.
  const prefetchedNextRef = useRef<{ seedId: string; tracks: VibeTrack[]; readyAt: number } | null>(null);
  const prefetchInFlightRef = useRef<string | null>(null);
  const prefetchStartRef = useRef<Map<string, number>>(new Map());
  // Cache-hit metrics for autoplay transitions. Exposed on window.__vibePreloadStats.
  const preloadStatsRef = useRef({
    prefetchStarted: 0,
    prefetchSucceeded: 0,
    prefetchFailed: 0,
    prefetchDurationsMs: [] as number[],
    autoplayHits: 0,
    autoplayMisses: 0,
    autoplayStaleSeed: 0,
    lastHitAt: 0,
    lastMissAt: 0,
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __vibePreloadStats?: unknown }).__vibePreloadStats = preloadStatsRef.current;
    }
  }, []);
  const logPreload = useCallback((event: string, data: Record<string, unknown>) => {
    const s = preloadStatsRef.current;
    const total = s.autoplayHits + s.autoplayMisses;
    const hitRate = total > 0 ? Math.round((s.autoplayHits / total) * 100) : 0;
    const avgMs = s.prefetchDurationsMs.length > 0
      ? Math.round(s.prefetchDurationsMs.reduce((a, b) => a + b, 0) / s.prefetchDurationsMs.length)
      : 0;
    console.log(`[preload] ${event}`, { ...data, hitRate: `${hitRate}%`, avgPrefetchMs: avgMs, hits: s.autoplayHits, misses: s.autoplayMisses });
  }, []);

  const fetchAndAppendRelated = useCallback(async (lastTrack: VibeTrack): Promise<VibeTrack[]> => {
    try {
      const related = await contextFn({
        data: { youtubeId: lastTrack.youtubeId, title: lastTrack.title, artist: lastTrack.artist },
      });
      const history = playedHistoryRef.current;
      const uniques: VibeTrack[] = (related ?? [])
        .filter((t) => !history.has(t.youtubeId))
        .slice(0, 10)
        .map((t) => ({
          youtubeId: t.youtubeId,
          title: t.title,
          artist: t.artist,
          thumbnailUrl: t.thumbnailUrl,
          durationSeconds: t.durationSeconds,
        }));
      return uniques;
    } catch (err) {
      console.error("Autoplay failed to fetch related songs", err);
      return [];
    }
  }, [contextFn]);

  // Warm the browser cache for a track's thumbnail so the next track paints
  // instantly (no image flash during transition).
  const warmThumbnail = useCallback((url?: string) => {
    if (!url || typeof window === "undefined") return;
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    } catch { /* noop */ }
  }, []);

  // Prefetch the related-tracks batch for the given seed if we haven't already.
  // Cheap network work done during current playback so autoplay is instant.
  const prefetchRelatedFor = useCallback(async (seed: VibeTrack) => {
    if (!seed?.youtubeId) return;
    if (prefetchedNextRef.current?.seedId === seed.youtubeId) return;
    if (prefetchInFlightRef.current === seed.youtubeId) return;
    prefetchInFlightRef.current = seed.youtubeId;
    const startedAt = performance.now();
    prefetchStartRef.current.set(seed.youtubeId, startedAt);
    preloadStatsRef.current.prefetchStarted += 1;
    logPreload("prefetch:start", { seedId: seed.youtubeId, title: seed.title });
    try {
      const tracks = await fetchAndAppendRelated(seed);
      const durationMs = Math.round(performance.now() - startedAt);
      preloadStatsRef.current.prefetchDurationsMs.push(durationMs);
      if (preloadStatsRef.current.prefetchDurationsMs.length > 20) {
        preloadStatsRef.current.prefetchDurationsMs.shift();
      }
      if (tracks.length > 0) {
        prefetchedNextRef.current = { seedId: seed.youtubeId, tracks, readyAt: performance.now() };
        warmThumbnail(tracks[0]?.thumbnailUrl);
        preloadStatsRef.current.prefetchSucceeded += 1;
        logPreload("prefetch:ready", { seedId: seed.youtubeId, count: tracks.length, durationMs, nextTitle: tracks[0]?.title });
      } else {
        preloadStatsRef.current.prefetchFailed += 1;
        logPreload("prefetch:empty", { seedId: seed.youtubeId, durationMs });
      }
    } catch (err) {
      preloadStatsRef.current.prefetchFailed += 1;
      logPreload("prefetch:error", { seedId: seed.youtubeId, error: String(err) });
    } finally {
      prefetchStartRef.current.delete(seed.youtubeId);
      if (prefetchInFlightRef.current === seed.youtubeId) prefetchInFlightRef.current = null;
    }
  }, [fetchAndAppendRelated, warmThumbnail, logPreload]);
  const prefetchRelatedForRef = useRef(prefetchRelatedFor);
  useEffect(() => { prefetchRelatedForRef.current = prefetchRelatedFor; }, [prefetchRelatedFor]);

  const triggerSmartAutoplay = useCallback(async () => {
    // Always read the freshest state from refs to avoid stale closures.
    const curQueue = queueRef.current;
    const curIndex = indexRef.current;
    const lastTrack = curQueue[curIndex] ?? currentRef.current;
    if (!lastTrack) return;

    const autoplayStartedAt = performance.now();
    // Fast path: use prefetched batch if it matches the current seed.
    let newTracks: VibeTrack[] = [];
    const cached = prefetchedNextRef.current;
    const inflight = prefetchInFlightRef.current === lastTrack.youtubeId;
    if (cached && cached.seedId === lastTrack.youtubeId && cached.tracks.length > 0) {
      newTracks = cached.tracks;
      prefetchedNextRef.current = null;
      preloadStatsRef.current.autoplayHits += 1;
      preloadStatsRef.current.lastHitAt = Date.now();
      const ageMs = Math.round(performance.now() - cached.readyAt);
      logPreload("autoplay:hit", { seedId: lastTrack.youtubeId, cacheAgeMs: ageMs, count: newTracks.length });
    } else {
      preloadStatsRef.current.autoplayMisses += 1;
      preloadStatsRef.current.lastMissAt = Date.now();
      if (cached && cached.seedId !== lastTrack.youtubeId) {
        preloadStatsRef.current.autoplayStaleSeed += 1;
        logPreload("autoplay:miss", { reason: "stale-seed", seedId: lastTrack.youtubeId, cachedSeed: cached.seedId });
      } else if (inflight) {
        const startedAt = prefetchStartRef.current.get(lastTrack.youtubeId) ?? autoplayStartedAt;
        logPreload("autoplay:miss", { reason: "inflight", seedId: lastTrack.youtubeId, waitingMs: Math.round(performance.now() - startedAt) });
      } else {
        logPreload("autoplay:miss", { reason: "no-prefetch", seedId: lastTrack.youtubeId });
      }
      setIsLoadingNext(true);
      try {
        newTracks = await fetchAndAppendRelated(lastTrack);
      } finally {
        setIsLoadingNext(false);
      }
    }

    if (newTracks.length === 0) {
      logPreload("autoplay:end", { seedId: lastTrack.youtubeId, reason: "no-tracks", totalMs: Math.round(performance.now() - autoplayStartedAt) });
      playerRef.current?.pauseVideo?.();
      setIsPlaying(false);
      return;
    }
    // Re-read latest queue/index after any async gap.
    const freshQueue = queueRef.current;
    const freshIndex = indexRef.current;
    const merged = [...freshQueue, ...newTracks];
    const ni = freshIndex + 1;
    setQueue(merged);
    playAtIndex(ni, merged);
    const remaining = merged.length - ni - 1;
    replenishQueue(remaining);
    logPreload("autoplay:transition", { seedId: lastTrack.youtubeId, nextTitle: newTracks[0]?.title, totalMs: Math.round(performance.now() - autoplayStartedAt) });
  }, [fetchAndAppendRelated, playAtIndex, replenishQueue, logPreload]);


  const next = useCallback(() => {
    // Read freshest state from refs (avoids stale closures when called
    // from the YouTube onStateChange event or async continuations).
    const curQueue = queueRef.current;
    const curIndex = indexRef.current;
    if (!curQueue.length) return;
    flushListenEvent();
    const isLastSong = curIndex >= curQueue.length - 1;
    if (isLastSong) {
      // Queue exhausted → trigger Infinite Autoplay via the store action.
      void triggerSmartAutoplay();
      return;
    }
    const ni = curIndex + 1;
    playAtIndex(ni, curQueue);
    const remaining = curQueue.length - ni - 1;
    replenishQueue(remaining);
  }, [playAtIndex, replenishQueue, flushListenEvent, triggerSmartAutoplay]);


  const prev = useCallback(() => {
    if (!queue.length) return;
    flushListenEvent("prev_pressed");
    const pi = (index - 1 + queue.length) % queue.length;
    const t = queue[pi];
    setIndex(pi);
    setCurrent(t);
    loadAndPlay(t.youtubeId);
    beginTrack(t);
    logListenFn({ data: { youtubeId: t.youtubeId, title: t.title, artist: t.artist } }).catch(() => {});
  }, [index, queue, loadAndPlay, logListenFn, flushListenEvent, beginTrack]);

  const nextRef = useRef(next);
  useEffect(() => { nextRef.current = next; }, [next]);

  const close = useCallback(() => {
    playerRef.current?.stopVideo?.();
    setCurrent(null);
    setIsPlaying(false);
    setExpanded(false);
    stopAudioForeground();
    disableBackgroundPlayback();
  }, []);

  /* --------- Background playback keep-alive --------- */
  useEffect(() => {
    if (!current) {
      disableBackgroundPlayback();
      return;
    }
    if (isPlaying) {
      enableBackgroundPlayback(() => {
        // Returning to the foreground: resume if the OS silently paused us.
        try {
          const p = playerRef.current;
          if (p && typeof p.getPlayerState === "function" && p.getPlayerState() !== 1) {
            p.playVideo?.();
          }
        } catch {
          /* ignore */
        }
      });
    } else {
      pauseBackgroundPlayback();
    }
  }, [current, isPlaying]);

  useEffect(() => () => disableBackgroundPlayback(), []);

  const expand = useCallback(() => setExpanded(true), []);
  const collapse = useCallback(() => setExpanded(false), []);

  const value = useMemo<PlayerCtx>(
    () => ({ current, queue, index, isPlaying, mixMode, isLoadingNext, play, startMix, addToQueue, removeFromQueue, reorderQueue, jumpToQueueIndex, toggle, next, prev, close, expand }),
    [current, queue, index, isPlaying, mixMode, isLoadingNext, play, startMix, addToQueue, removeFromQueue, reorderQueue, jumpToQueueIndex, toggle, next, prev, close, expand],
  );


  const seek = useCallback((s: number) => playerRef.current?.seekTo?.(s, true), []);

  /* --------- Now Playing: native media notification + web MediaSession --------- */

  // Keep the latest transport callbacks in a ref so native listeners registered
  // once always invoke the freshest handlers.
  const controlsRef = useRef({ toggle, next, prev, close, seek });
  useEffect(() => {
    controlsRef.current = { toggle, next, prev, close, seek };
  }, [toggle, next, prev, close, seek]);

  // Register the native transport listener a single time.
  useEffect(() => {
    let dispose: (() => void) | undefined;
    void requestNotificationPermission();
    void onMediaControl((action, payload) => {
      const c = controlsRef.current;
      if (action === "play" || action === "pause") c.toggle();
      else if (action === "next") c.next();
      else if (action === "prev") c.prev();
      else if (action === "stop") c.close();
      else if (action === "seek" && typeof payload?.position === "number") c.seek(payload.position / 1000);
    }).then((off) => {
      dispose = off;
    });
    return () => dispose?.();
  }, []);

  // Publish metadata whenever the track or playback state changes.
  useEffect(() => {
    if (!current) {
      setWebMediaSession(null, {
        play: () => {},
        pause: () => {},
        next: () => {},
        prev: () => {},
      });
      return;
    }
    const handlers = {
      play: () => controlsRef.current.toggle(),
      pause: () => controlsRef.current.toggle(),
      next: () => controlsRef.current.next(),
      prev: () => controlsRef.current.prev(),
      stop: () => controlsRef.current.close(),
      seek: (s: number) => controlsRef.current.seek(s),
    };
    const publish = () => {
      const info = {
        title: current.title,
        artist: current.artist ?? "Unknown artist",
        album: "Vibetune",
        artwork: current.thumbnailUrl ?? "",
        isPlaying,
        position: Math.round(progressRef.current * 1000),
        duration: Math.round(durationRef.current * 1000),
      };
      void updateNowPlaying(info);
      setWebMediaSession(info, handlers);
    };
    publish();
    // Duration/artwork can arrive slightly after the track switch, and some OEM
    // notification shades drop the very first metadata push — re-publish a few
    // times so title/artist/art always settle on the correct track.
    const retries = [400, 1200, 3000].map((ms) => window.setTimeout(publish, ms));
    const ticker = window.setInterval(publish, 10000);
    return () => {
      retries.forEach((t) => window.clearTimeout(t));
      window.clearInterval(ticker);
    };
    // `progress` intentionally excluded — position is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, isPlaying, duration]);


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
            onNext={next}
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
  onNext: () => void;
  onExpand: () => void;
}

function MiniPlayer(p: MiniProps) {
  const pct = p.duration ? (p.progress / p.duration) * 100 : 0;
  const likedFn = useServerFn(getLikedIds);
  const toggleFn = useServerFn(toggleLike);
  const qc = useQueryClient();
  const { data: likedIds } = useQuery({
    queryKey: ["liked-ids"],
    queryFn: () => likedFn(),
  });
  const isLiked = (likedIds ?? []).includes(p.track.youtubeId);
  const likeMut = useMutation({
    mutationFn: () => toggleFn({ data: { youtubeId: p.track.youtubeId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["liked-ids"] }),
  });

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
      className="fixed left-2 right-2 z-[60] flex h-14 cursor-pointer items-center overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1a]/80 px-3 shadow-2xl backdrop-blur-xl"
      style={{ bottom: "calc(var(--bottom-nav-h, calc(72px + env(safe-area-inset-bottom))) + 8px)" }}
    >
      <div className="relative mx-auto flex w-full max-w-md items-center gap-3">

        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md">
          {p.track.thumbnailUrl ? (
            <img src={p.track.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="vibe-gradient h-full w-full" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{cleanYouTubeTitle(p.track.title)}</p>
          <p className="truncate text-xs text-white/50">{p.track.artist}</p>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={(e) => { e.stopPropagation(); likeMut.mutate(); }}
            aria-label={isLiked ? "Unlike" : "Like"}
            className={`shrink-0 transition ${isLiked ? "text-cyan-300" : "text-white/60 hover:text-white"}`}
          >
            <Heart className="h-5 w-5" fill={isLiked ? "currentColor" : "none"} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); p.onToggle(); }}
            aria-label={p.isPlaying ? "Pause" : "Play"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan-300 text-white shadow-[0_0_20px_-4px_rgba(127,216,232,0.8)] active:scale-95"
          >
            {p.isPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4 translate-x-0.5" fill="currentColor" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); p.onNext(); }}
            aria-label="Next"
            className="shrink-0 text-white/60 hover:text-white"
          >
            <SkipForward className="h-5 w-5" fill="currentColor" />
          </button>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-white/10">
        <div
          className="h-full bg-white"
          style={{ width: `${pct}%`, transition: "width 0.1s linear" }}
        />
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

  const { isDownloaded, toggle: toggleDownload, downloading } = useDownloads();
  const downloaded = isDownloaded(p.track.youtubeId);
  const isDownloading = downloading.has(p.track.youtubeId);

  const handleDownload = async () => {
    if (isDownloading) return;
    await toggleDownload(p.track);
    toast.success(downloaded ? "Removed from downloads" : "Saved to downloads");
  };


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
      className="fixed inset-0 z-[100] flex h-[100dvh] flex-col overflow-hidden bg-background pb-[env(safe-area-inset-bottom)]"
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
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-background" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Drag handle */}
        <div className="mx-auto my-3 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
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
                      ? "bg-gradient-to-r from-violet-500 to-cyan-300 text-white shadow-[0_0_18px_-4px_rgba(127,216,232,0.6)]"
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
            className="flex min-h-0 flex-1 flex-col px-6"
          >
            {/* Shrinkable middle: album art + title. Never pushes controls off. */}
            <div className="flex min-h-0 flex-1 flex-col justify-center">
              <div className="flex min-h-0 items-center justify-center py-2">
                <motion.div
                  layoutId="album-art"
                  className="relative mx-auto aspect-square h-full max-h-[340px] w-auto max-w-[340px] overflow-hidden rounded-3xl border border-white/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]"
                  style={{ width: "min(100%, 340px)" }}
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

              <div className="mt-6 text-center">
                <h2 className="line-clamp-1 text-2xl font-bold tracking-tight text-white">
                  {cleanYouTubeTitle(p.track.title)}
                </h2>
                <p className="mt-1 text-base text-white/60">{p.track.artist}</p>
              </div>
            </div>

            {/* Bottom pinned controls */}
            <div className="shrink-0 pb-8">
              <div className="group">
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

              <div className="mt-6 flex items-center justify-center gap-3 sm:gap-5">
                <button
                  onClick={handleLike}
                  aria-label={isLiked ? "Unlike" : "Like"}
                  className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/5 hover:text-white"
                >
                  <Heart
                    className={cn("h-5 w-5 transition", isLiked && "fill-current")}
                    style={isLiked ? { color: "#7fd8e8", filter: "drop-shadow(0 0 8px rgba(127,216,232,0.7))" } : undefined}
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
                  className="vibe-gradient mx-2 grid h-20 w-20 place-items-center rounded-full text-[#050b14] shadow-[0_0_40px_-6px_rgba(127,216,232,0.75)] transition active:scale-95"
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
                  onClick={handleDownload}
                  aria-label={downloaded ? "Remove download" : "Download"}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/5",
                    downloaded ? "text-emerald-400" : "text-white/70 hover:text-white",
                  )}
                >
                  <Download className={cn("h-5 w-5", isDownloading && "animate-pulse text-cyan-400")} fill={downloaded ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => setAddOpen(true)}
                  aria-label="Add to playlist"
                  className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/5 hover:text-white"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
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
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/90 to-transparent px-6 pb-4 pt-12">
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
                  className="vibe-gradient grid h-14 w-14 place-items-center rounded-full text-[#050b14] shadow-[0_0_24px_-4px_rgba(127,216,232,0.7)] active:scale-95"
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
