import { useCallback, useEffect, useState, useRef } from "react";
import type { VibeTrack } from "@/components/VibePlayer";
import { saveAudioBlob, deleteAudioBlob, getAudioBlob } from "@/lib/offline/storage";
import { writeNativeAudio, deleteNativeAudio, ensureNativeDir } from "@/lib/offline/native-fs";

const KEY = "vibtune:downloads:v1";

export interface DownloadTask {
  track: VibeTrack;
  progress: number;
  status: "pending" | "downloading" | "paused" | "error";
  abortController?: AbortController;
}

function read(): VibeTrack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VibeTrack[]) : [];
  } catch {
    return [];
  }
}

function write(list: VibeTrack[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("vibtune:downloads-changed"));
}

export function useDownloads() {
  const [items, setItems] = useState<VibeTrack[]>([]);
  const [queue, setQueue] = useState<DownloadTask[]>([]);
  const queueRef = useRef<DownloadTask[]>([]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    setItems(read());
    const sync = () => setItems(read());
    window.addEventListener("vibtune:downloads-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("vibtune:downloads-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isDownloaded = useCallback(
    (id: string) => items.some((t) => t.youtubeId === id),
    [items],
  );

  const updateTask = useCallback((id: string, updates: Partial<DownloadTask>) => {
    setQueue((prev) =>
      prev.map((task) =>
        task.track.youtubeId === id ? { ...task, ...updates } : task
      )
    );
  }, []);

  const processQueue = useCallback(async () => {
    const nextTask = queueRef.current.find((t) => t.status === "pending");
    if (!nextTask) return;

    // Check Wi-Fi restriction
    if (typeof window !== "undefined") {
      const wifiOnly = localStorage.getItem("vibtune.audio.wifi_only") === "true";
      if (wifiOnly && "connection" in navigator) {
        const conn = (navigator as any).connection;
        if (conn && conn.type && conn.type !== "wifi") {
          console.log("Download deferred: Wi-Fi only mode active");
          return;
        }
      }
    }

    const id = nextTask.track.youtubeId;
    const controller = new AbortController();
    
    updateTask(id, { status: "downloading", abortController: controller });

    try {
      // Get preferred quality
      const quality = typeof window !== "undefined" ? localStorage.getItem("vibtune.audio.download_quality") || "normal" : "normal";
      
      // Simulate progress since we are stubbing the blob anyway
      for (let p = 0; p <= 100; p += 10) {
        if (queueRef.current.find(t => t.track.youtubeId === id)?.status === "paused") {
          return; // Stop if paused
        }
        updateTask(id, { progress: p });
        await new Promise(r => setTimeout(r, 200));
      }

      // Metadata could store quality if needed
      const blob = new Blob([`offline-audio-stub-${quality}`], { type: "audio/mpeg" });
      await saveAudioBlob(id, blob);
      // Also persist to the device filesystem (Documents/Vibetune) on Android.
      await writeNativeAudio(id, blob);
      
      const cur = read();
      if (!cur.some(t => t.youtubeId === id)) {
        write([nextTask.track, ...cur]);
      }
      
      setQueue(prev => prev.filter(t => t.track.youtubeId !== id));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Download aborted');
      } else {
        console.error("Download failed:", err);
        updateTask(id, { status: "error" });
      }
    }
  }, [updateTask]);


  useEffect(() => {
    const hasActive = queue.some(t => t.status === "downloading");
    const hasPending = queue.some(t => t.status === "pending");
    if (!hasActive && hasPending) {
      processQueue();
    }
  }, [queue, processQueue]);

  const download = useCallback((track: VibeTrack) => {
    void ensureNativeDir();
    if (queue.some(t => t.track.youtubeId === track.youtubeId)) return;
    if (isDownloaded(track.youtubeId)) return;

    setQueue(prev => [...prev, {
      track,
      progress: 0,
      status: "pending"
    }]);
  }, [queue, isDownloaded]);

  const pause = useCallback((id: string) => {
    const task = queue.find(t => t.track.youtubeId === id);
    if (!task) return;
    
    if (task.abortController) {
      task.abortController.abort();
    }
    updateTask(id, { status: "paused", abortController: undefined });
  }, [queue, updateTask]);

  const resume = useCallback((id: string) => {
    updateTask(id, { status: "pending" });
  }, [updateTask]);

  const cancel = useCallback((id: string) => {
    const task = queue.find(t => t.track.youtubeId === id);
    if (task?.abortController) {
      task.abortController.abort();
    }
    setQueue(prev => prev.filter(t => t.track.youtubeId !== id));
  }, [queue]);

  const remove = useCallback(async (id: string) => {
    await deleteAudioBlob(id);
    await deleteNativeAudio(id);
    write(read().filter((t) => t.youtubeId !== id));
  }, []);

  const toggle = useCallback(async (track: VibeTrack) => {
    const exists = isDownloaded(track.youtubeId);
    if (exists) {
      await remove(track.youtubeId);
    } else {
      download(track);
    }
  }, [isDownloaded, remove, download]);

  const removeMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    for (const id of ids) {
      await deleteAudioBlob(id);
      await deleteNativeAudio(id);
    }
    const set = new Set(ids);
    write(read().filter((t) => !set.has(t.youtubeId)));
  }, []);

  const clear = useCallback(async () => {
    const all = read();
    for (const t of all) {
      await deleteAudioBlob(t.youtubeId);
      await deleteNativeAudio(t.youtubeId);
    }
    write([]);
  }, []);

  const removeOldest = useCallback(async (count: number = 1) => {
    const all = read();
    if (all.length === 0) return;
    // The items are written to the head: write([nextTask.track, ...cur])
    // So the oldest items are at the end of the array.
    const toRemove = all.slice(-count);
    await removeMany(toRemove.map(t => t.youtubeId));
  }, [removeMany]);

  const downloading = new Set(queue.map(t => t.track.youtubeId));

  return { 
    items, 
    isDownloaded, 
    downloading, 
    toggle, 
    remove, 
    removeMany, 
    clear, 
    removeOldest,
    download, 
    queue,
    pause,
    resume,
    cancel
  };
}


/** Non-reactive read of downloaded track ids (used by offline playback gating). */
export function getDownloadedIds(): string[] {
  return read().map((t) => t.youtubeId);
}

/** True when the given track is available offline. */
export function isTrackDownloaded(id: string): boolean {
  return read().some((t) => t.youtubeId === id);
}
