import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, Circle, Download, Trash2, X, Pause, Play, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDownloads } from "@/hooks/use-downloads";
import { usePlayer } from "@/components/VibePlayer";

export const Route = createFileRoute("/library/downloaded")({
  head: () => ({
    meta: [
      { title: "Downloaded · Vibtune" },
      { name: "description", content: "Your locally saved tracks." },
    ],
  }),
  component: DownloadedPage,
});

function DownloadedPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { items, remove, removeMany, clear, queue, pause, resume, cancel } = useDownloads();
  const { play } = usePlayer();
  const [usage, setUsage] = useState(0);

  useEffect(() => {
    import("@/lib/offline/storage").then(m => m.getStorageUsageMB()).then(setUsage);
  }, [items]);


  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(items.map((t) => t.youtubeId));
      const next = new Set<string>();
      prev.forEach((id) => ids.has(id) && next.add(id));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  useEffect(() => {
    if (items.length === 0 && selectMode) setSelectMode(false);
  }, [items.length, selectMode]);

  const allSelected = useMemo(
    () => items.length > 0 && selected.size === items.length,
    [items.length, selected.size],
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((t) => t.youtubeId)));
  };

  const enterSelect = (id?: string) => {
    setSelectMode(true);
    if (id) setSelected(new Set([id]));
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const removeSelected = () => {
    if (selected.size === 0) return;
    removeMany(Array.from(selected));
    setSelected(new Set());
  };

  return (
    <main className="relative min-h-screen px-5 pb-44 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <div className="mx-auto flex max-w-md items-center justify-between">
        {selectMode ? (
          <button
            onClick={exitSelect}
            aria-label="Cancel selection"
            className="rounded-full bg-white/5 p-2 text-white transition-colors hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <Link
            to="/library"
            aria-label="Back"
            className="rounded-full bg-white/5 p-2 text-white transition-colors hover:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="text-lg font-semibold text-white">
          {selectMode ? `${selected.size} selected` : "Downloaded"}
        </h1>
        {selectMode ? (
          <button
            onClick={toggleAll}
            disabled={items.length === 0}
            className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-30"
          >
            {allSelected ? "None" : "All"}
          </button>
        ) : (
          <button
            onClick={() => setSelectMode(true)}
            disabled={items.length === 0}
            className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-30"
          >
            Select
          </button>
        )}
      </div>

      <section className="mx-auto mt-6 max-w-md">
        <div className="relative flex h-40 flex-col justify-end overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-5">
          <Download className="absolute -bottom-6 -right-6 h-32 w-32 rotate-12 text-white/10" />
          <h2 className="relative z-10 text-2xl font-bold text-white">Downloaded</h2>
          <div className="relative z-10 mt-1 flex items-center gap-2">
            <p className="text-sm text-white/60">
              {items.length} {items.length === 1 ? "track" : "tracks"} • {usage.toFixed(1)} MB
            </p>
          </div>
        </div>

      </section>

      {/* Download Queue Section */}
      {queue.length > 0 && (
        <section className="mx-auto mt-8 max-w-md">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/40">
            <Download className="h-4 w-4" />
            Download Queue ({queue.length})
          </h3>
          <ul className="space-y-3">
            {queue.map((task) => (
              <li key={task.track.youtubeId} className="group relative overflow-hidden rounded-2xl bg-white/5 p-3 transition hover:bg-white/10">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/5">
                    {task.track.thumbnailUrl ? (
                      <img src={task.track.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{task.track.title}</p>
                    <div className="mt-1 flex items-center justify-between gap-4">
                      <div className="flex-1 overflow-hidden">
                        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                          <div 
                            className="h-full bg-cyan-400 transition-all duration-300 ease-out"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] font-medium text-white/40 uppercase">
                          {task.status === 'paused' ? 'Paused' : task.status === 'downloading' ? `Downloading ${task.progress}%` : 'Pending'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {task.status === "paused" ? (
                          <button 
                            onClick={() => resume(task.track.youtubeId)}
                            className="rounded-full bg-white/10 p-1.5 text-white transition hover:bg-white/20"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => pause(task.track.youtubeId)}
                            className="rounded-full bg-white/10 p-1.5 text-white transition hover:bg-white/20"
                          >
                            <Pause className="h-3.5 w-3.5 fill-current" />
                          </button>
                        )}
                        <button 
                          onClick={() => cancel(task.track.youtubeId)}
                          className="rounded-full bg-white/10 p-1.5 text-white/40 transition hover:bg-red-500/20 hover:text-red-400"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto mt-8 max-w-md">
        {items.length === 0 && queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-12 text-center">
            <Download className="mb-4 h-12 w-12 text-white/40" />
            <h3 className="mb-2 text-lg font-medium text-white">Nothing saved yet</h3>
            <p className="max-w-xs text-sm text-white/50">
              Tap the download icon on any track to save it here for quick access.
            </p>
          </div>
        ) : items.length > 0 ? (
          <>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white/40">
              Saved Tracks
            </h3>
            <ul className={`space-y-2 ${selectMode ? "pb-24" : ""}`}>
              {items.map((t) => {
                const isSelected = selected.has(t.youtubeId);
                return (
                  <li
                    key={t.youtubeId}
                    className={`flex items-center gap-3 rounded-2xl p-2 transition ${
                      isSelected ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >

                    <button
                      onClick={() =>
                        selectMode ? toggleOne(t.youtubeId) : play(t, items)
                      }
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!selectMode) enterSelect(t.youtubeId);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      {selectMode ? (
                        isSelected ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-white" />
                        ) : (
                          <Circle className="h-5 w-5 shrink-0 text-white/40" />
                        )
                      ) : null}
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/5">
                        {t.thumbnailUrl ? (
                          <img src={t.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{t.title}</p>
                        <p className="truncate text-xs text-white/50">{t.artist}</p>
                      </div>

                    </button>
                    {!selectMode && (
                      <button
                        onClick={() => remove(t.youtubeId)}
                        aria-label="Remove from downloads"
                        className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </section>

      {selectMode && items.length > 0 && (
        <div
          className="fixed inset-x-0 z-40 px-5"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl">
            <button
              onClick={clear}
              className="rounded-full px-3 py-2 text-xs font-medium text-white/60 transition hover:text-white"
            >
              Clear all
            </button>
            <button
              onClick={removeSelected}
              disabled={selected.size === 0}
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40"
            >
              <Trash2 className="h-4 w-4" />
              Remove{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
