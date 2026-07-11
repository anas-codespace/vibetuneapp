import { useEffect, useState } from "react";

export type SyncPhase = "idle" | "connecting" | "syncing" | "done" | "error" | "partial";

export interface SyncStatus {
  phase: SyncPhase;
  source: "spotify" | "youtube" | null;
  message: string;
  /** 0..1 progress if known */
  progress?: number;
  totals?: {
    likedAdded?: number;
    likedSkipped?: number;
    playlistsCreated?: number;
    playlistsSkipped?: number;
    tracksAdded?: number;
  };
  /** ISO timestamp */
  updatedAt: number;
  /** Optional retry callback identifier for UI action */
  retryHref?: string;
}

const EVENT = "vibtune:sync-status";
let current: SyncStatus = {
  phase: "idle",
  source: null,
  message: "",
  updatedAt: 0,
};

export function setSyncStatus(next: Partial<SyncStatus>) {
  current = { ...current, ...next, updatedAt: Date.now() };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<SyncStatus>(EVENT, { detail: current }));
  }
}

export function clearSyncStatus() {
  setSyncStatus({ phase: "idle", source: null, message: "", progress: undefined, totals: undefined, retryHref: undefined });
}

export function useSyncStatus(): SyncStatus {
  const [state, setState] = useState<SyncStatus>(current);
  useEffect(() => {
    const handler = (e: Event) => setState((e as CustomEvent<SyncStatus>).detail);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return state;
}
