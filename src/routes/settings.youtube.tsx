import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Search, Youtube, Loader2, AlertCircle, Check, Download } from "lucide-react";
import { toast } from "sonner";
import { searchYouTubeOnly, importTracksToLibrary } from "@/lib/music.functions";
import type { YTTrack } from "@/lib/youtube.server";

export const Route = createFileRoute("/settings/youtube")({
  head: () => ({
    meta: [
      { title: "YouTube API · Vibtune" },
      { name: "description", content: "Verify YouTube Data API connectivity with a live search." },
    ],
  }),
  component: YouTubeSettingsPage,
});

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function YouTubeSettingsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const searchMut = useMutation({
    mutationFn: async (q: string): Promise<YTTrack[]> => {
      return await searchYouTubeOnly({ data: { query: q, max: 12 } });
    },
    onSuccess: () => setSelected(new Set()),
  });

  const importMut = useMutation({
    mutationFn: async (tracks: YTTrack[]) => {
      return await importTracksToLibrary({ data: { tracks } });
    },
    onSuccess: (res) => {
      toast.success(`Imported ${res.imported} track${res.imported === 1 ? "" : "s"}`, {
        description: res.skipped > 0 ? `${res.skipped} already in library` : undefined,
      });
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["liked-songs"] });
    },
    onError: (err) => {
      toast.error("Import failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    searchMut.mutate(q);
  };

  const results = searchMut.data ?? [];
  const errMsg = searchMut.error instanceof Error ? searchMut.error.message : null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === results.length) setSelected(new Set());
    else setSelected(new Set(results.map((t) => t.youtubeId)));
  };

  const onImport = () => {
    const picks = results.filter((t) => selected.has(t.youtubeId));
    if (picks.length === 0) return;
    importMut.mutate(picks);
  };

  return (
    <div className="min-h-[100dvh] bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-black/80 px-4 py-4 backdrop-blur">
        <Link to="/profile" className="rounded-full p-2 hover:bg-white/10" aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2">
          <Youtube className="h-5 w-5 text-red-500" />
          <h1 className="text-lg font-semibold">YouTube API</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <p className="text-sm text-white/60">
          Run a live search against the YouTube Data API v3, then select tracks to import into your Liked Songs.
        </p>

        <form onSubmit={onSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a song, artist, album…"
              className="w-full rounded-full border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
          </div>
          <button
            type="submit"
            disabled={searchMut.isPending || !query.trim()}
            className="rounded-full bg-white px-5 text-sm font-semibold text-black transition disabled:opacity-40"
          >
            {searchMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </button>
        </form>

        {errMsg && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Search failed</div>
              <div className="text-xs opacity-80">{errMsg}</div>
            </div>
          </div>
        )}

        {searchMut.isSuccess && results.length === 0 && !errMsg && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            No results — API reachable but the query returned nothing.
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs uppercase tracking-wider text-white/60 hover:text-white"
              >
                {selected.size === results.length ? "Clear all" : "Select all"} · {results.length}
              </button>
              <button
                type="button"
                onClick={onImport}
                disabled={selected.size === 0 || importMut.isPending}
                className="flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
              >
                {importMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Import {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            </div>

            <ul className="space-y-2">
              {results.map((t) => {
                const isSel = selected.has(t.youtubeId);
                return (
                  <li key={t.youtubeId}>
                    <button
                      type="button"
                      onClick={() => toggle(t.youtubeId)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-2 pr-4 text-left transition ${
                        isSel
                          ? "border-red-500/60 bg-red-500/10"
                          : "border-white/5 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          isSel ? "border-red-500 bg-red-500" : "border-white/30"
                        }`}
                      >
                        {isSel && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <img
                        src={t.thumbnailUrl}
                        alt=""
                        className="h-14 w-14 rounded-md object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        <div className="truncate text-xs text-white/50">{t.artist}</div>
                      </div>
                      <div className="text-xs tabular-nums text-white/50">
                        {formatDuration(t.durationSeconds)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
