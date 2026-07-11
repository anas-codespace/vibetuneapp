import { useCallback, useEffect, useState } from "react";
import type { VibeTrack } from "@/components/VibePlayer";

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

  const toggle = useCallback((track: VibeTrack) => {
    const cur = read();
    const exists = cur.some((t) => t.youtubeId === track.youtubeId);
    const next = exists
      ? cur.filter((t) => t.youtubeId !== track.youtubeId)
      : [track, ...cur];
    write(next);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((t) => t.youtubeId !== id));
  }, []);

  const clear = useCallback(() => write([]), []);

  return { items, isDownloaded, toggle, remove, clear };
}
