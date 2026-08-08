import { useCallback, useEffect, useState } from "react";
import type { VibeTrack } from "@/components/VibePlayer";
import { saveAudioBlob, deleteAudioBlob, getAudioBlob } from "@/lib/offline/storage";

const KEY = "vibtune:downloads:v1";

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
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

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

  const download = useCallback(async (track: VibeTrack) => {
    if (downloading.has(track.youtubeId)) return;
    setDownloading((prev) => new Set(prev).add(track.youtubeId));

    try {
      // In a real app, we'd fetch the actual audio stream here.
      // For this implementation, we simulate the download by fetching a dummy blob
      // or using a placeholder, as we don't have a direct YouTube stream URL yet.
      // Note: Real YouTube stream fetching requires a server-side proxy or specific library.
      const resp = await fetch(`https://www.youtube.com/watch?v=${track.youtubeId}`, { mode: 'no-cors' });
      const blob = new Blob(["offline-audio-stub"], { type: "audio/mpeg" });
      await saveAudioBlob(track.youtubeId, blob);
      
      const cur = read();
      if (!cur.some(t => t.youtubeId === track.youtubeId)) {
        write([track, ...cur]);
      }
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(track.youtubeId);
        return next;
      });
    }
  }, [downloading]);

  const remove = useCallback(async (id: string) => {
    await deleteAudioBlob(id);
    write(read().filter((t) => t.youtubeId !== id));
  }, []);

  const toggle = useCallback(async (track: VibeTrack) => {
    const exists = isDownloaded(track.youtubeId);
    if (exists) {
      await remove(track.youtubeId);
    } else {
      await download(track);
    }
  }, [isDownloaded, remove, download]);

  const removeMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    for (const id of ids) {
      await deleteAudioBlob(id);
    }
    const set = new Set(ids);
    write(read().filter((t) => !set.has(t.youtubeId)));
  }, []);

  const clear = useCallback(async () => {
    const all = read();
    for (const t of all) {
      await deleteAudioBlob(t.youtubeId);
    }
    write([]);
  }, []);

  return { items, isDownloaded, downloading, toggle, remove, removeMany, clear, download };
}

