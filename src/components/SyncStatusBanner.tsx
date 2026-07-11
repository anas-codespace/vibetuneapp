import { AnimatePresence, motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { clearSyncStatus, useSyncStatus } from "@/hooks/use-sync-status";

export function SyncStatusBanner() {
  const s = useSyncStatus();
  if (s.phase === "idle") return null;

  const isBusy = s.phase === "connecting" || s.phase === "syncing";
  const isError = s.phase === "error";
  const isPartial = s.phase === "partial";
  const isDone = s.phase === "done";

  const tone = isError
    ? "border-red-500/30 bg-red-500/10"
    : isPartial
      ? "border-amber-400/30 bg-amber-400/10"
      : isDone
        ? "border-emerald-500/30 bg-emerald-500/10"
        : "border-white/10 bg-white/5";

  const label =
    s.source === "spotify" ? "Spotify" : s.source === "youtube" ? "YouTube" : "Library";

  const totals = s.totals;
  const totalsLine = totals
    ? [
        totals.likedAdded !== undefined ? `${totals.likedAdded} liked` : null,
        totals.playlistsCreated !== undefined ? `${totals.playlistsCreated} playlists` : null,
        totals.tracksAdded !== undefined ? `${totals.tracksAdded} tracks` : null,
        totals.likedSkipped ? `${totals.likedSkipped} skipped` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <AnimatePresence>
      <motion.div
        key={s.updatedAt}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className={`mx-auto mt-4 max-w-md rounded-2xl border p-3 ${tone}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            {isBusy && <Loader2 className="h-4 w-4 animate-spin text-white/80" />}
            {isDone && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {isPartial && <AlertTriangle className="h-4 w-4 text-amber-300" />}
            {isError && <XCircle className="h-4 w-4 text-red-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              {label} sync
            </p>
            <p className="mt-0.5 truncate text-sm text-white">{s.message}</p>
            {totalsLine && (
              <p className="mt-1 truncate text-xs text-white/60">{totalsLine}</p>
            )}
            {typeof s.progress === "number" && isBusy && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-white/80 transition-all"
                  style={{ width: `${Math.max(4, Math.min(100, s.progress * 100))}%` }}
                />
              </div>
            )}
            {(isError || isPartial) && (
              <div className="mt-2 flex items-center gap-2">
                <Link
                  to="/settings/spotify"
                  className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Retry in settings
                </Link>
                <button
                  onClick={clearSyncStatus}
                  className="rounded-full px-3 py-1 text-xs text-white/60 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
          {(isDone || isBusy) && (
            <button
              onClick={clearSyncStatus}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-1 text-white/50 hover:bg-white/5 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
