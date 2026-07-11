import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { History, ListPlus, Play, Search as SearchIcon, X } from "lucide-react";

const HISTORY_KEY = "vibetune_search_history";
import { useAuth } from "@/hooks/use-auth";
import { searchTracks } from "@/lib/music.functions";
import { usePlayer, type VibeTrack } from "@/components/VibePlayer";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search · Vibtune" }] }),
  component: SearchPage,
});

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 320);
  const fn = useServerFn(searchTracks);
  const { play, addToQueue } = usePlayer();
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setSearchHistory(JSON.parse(saved));
    } catch {}
    setHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory));
    } catch {}
  }, [searchHistory, historyLoaded]);

  const addToHistory = (query: string) => {
    const clean = query.trim();
    if (!clean) return;
    setSearchHistory((prev) => [clean, ...prev.filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, 10));
  };

  const removeFromHistory = (query: string) => {
    setSearchHistory((prev) => prev.filter((s) => s !== query));
  };

  const clearHistory = () => setSearchHistory([]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => fn({ data: { query: debounced, max: 24 } }),
    enabled: !!session && debounced.length > 1,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (data && data.length > 0 && debounced.length > 1) addToHistory(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, debounced]);

  const tracks: VibeTrack[] = (data ?? []).map((t) => ({
    youtubeId: t.youtubeId,
    title: t.title,
    artist: t.artist,
    thumbnailUrl: t.thumbnailUrl,
    durationSeconds: t.durationSeconds,
  }));

  const top = tracks[0];
  const rest = tracks.slice(1);

  // Group artists from results (unique by artist name)
  const artists = Array.from(
    new Map(tracks.map((t) => [t.artist, t])).values(),
  ).slice(0, 8);

  return (
    <main className="relative min-h-screen pb-44 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="sticky top-0 z-20 px-5 pt-3 pb-2 backdrop-blur-2xl">
        <h1 className="mx-auto max-w-md text-2xl font-bold">Search</h1>
        <div className="mx-auto mt-3 max-w-md">
          <div className="glass-strong gradient-border flex items-center gap-2 rounded-full px-4 py-3">
            <SearchIcon className="h-4 w-4 text-white/50" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Songs, artists, vibes…"
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear" className="text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-2 max-w-md px-5">
        {!debounced && (
          <div className="mt-16 text-center text-sm text-white/40">
            Start typing to find your next vibe.
          </div>
        )}
        {debounced && isFetching && tracks.length === 0 && (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass h-16 animate-pulse rounded-2xl" />
            ))}
          </div>
        )}
        {debounced && !isFetching && tracks.length === 0 && (
          <p className="mt-12 text-center text-sm text-white/40">
            No results for "{debounced}".
          </p>
        )}

        <AnimatePresence>
          {top && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4"
            >
              <h2 className="vibe-text mb-2 text-[10px] font-bold uppercase tracking-[0.25em]">
                Top result
              </h2>
              <button
                onClick={() => play(top, tracks)}
                className="glass-strong gradient-border relative flex w-full items-center gap-3 overflow-hidden rounded-2xl p-3 text-left active:scale-[0.99]"
              >
                <div className="vibe-gradient h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                  {top.thumbnailUrl && (
                    <img src={top.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-base font-bold text-white">{top.title}</p>
                  <p className="mt-1 text-xs text-white/60">{top.artist}</p>
                </div>
                <div className="vibe-gradient grid h-10 w-10 shrink-0 place-items-center rounded-full text-white shadow-[0_0_18px_-4px_rgba(236,0,140,0.7)]">
                  <Play className="h-4 w-4 translate-x-0.5" fill="currentColor" />
                </div>
              </button>
            </motion.section>
          )}

          {artists.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <h2 className="vibe-text mb-3 text-[10px] font-bold uppercase tracking-[0.25em]">
                Artists
              </h2>
              <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2" style={{ scrollbarWidth: "none" }}>
                {artists.map((a) => (
                  <button
                    key={a.artist}
                    onClick={() => play(a, tracks)}
                    className="group flex w-20 shrink-0 flex-col items-center gap-2"
                  >
                    <div className="vibe-gradient h-20 w-20 overflow-hidden rounded-full ring-2 ring-white/10">
                      {a.thumbnailUrl && (
                        <img src={a.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <p className="line-clamp-2 text-center text-[11px] text-white/70">{a.artist}</p>
                  </button>
                ))}
              </div>
            </motion.section>
          )}

          {rest.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <h2 className="vibe-text mb-2 text-[10px] font-bold uppercase tracking-[0.25em]">
                Songs
              </h2>
              <ul className="space-y-2">
                {rest.map((t) => (
                  <li key={t.youtubeId}>
                    <div className="flex w-full items-center gap-2 rounded-2xl p-2 transition hover:bg-white/5">
                      <button
                        onClick={() => play(t, tracks)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.98]"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                          {t.thumbnailUrl ? (
                            <img src={t.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="vibe-gradient h-full w-full" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{t.title}</p>
                          <p className="truncate text-xs text-white/50">{t.artist}</p>
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToQueue(t);
                        }}
                        aria-label="Add to queue"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                      >
                        <ListPlus className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
