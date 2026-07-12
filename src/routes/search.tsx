import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, History, MoreHorizontal, Play, Search as SearchIcon, X, Music2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

const HISTORY_KEY = "vibetune_search_history";
import { useAuth } from "@/hooks/use-auth";
import { spotifySearchPlayable, type SpotifyPlayableResult } from "@/lib/spotify.functions";
import { searchYouTubeOnly } from "@/lib/music.functions";

import { usePlayer, type VibeTrack } from "@/components/VibePlayer";
import { HorizontalCarousel } from "@/components/HorizontalCarousel";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search · Vibtune" },
      { name: "description", content: "Search millions of tracks on Vibtune — songs, artists, and albums resolved from Spotify and YouTube in one tap." },
      { property: "og:title", content: "Search · Vibtune" },
      { property: "og:description", content: "Find any song, artist, or album on Vibtune." },
      { property: "og:url", content: "https://vibetuneapp.lovable.app/search" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://vibetuneapp.lovable.app/search" }],
  }),
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
  const fn = useServerFn(spotifySearchPlayable);
  const ytFn = useServerFn(searchYouTubeOnly);
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

  const { data, isFetching, error } = useQuery({
    queryKey: ["search", debounced],
    queryFn: async () => {
      // Task 1: Strict-match query — send the user's term as-is (no " songs"
      // suffix, which was matching irrelevant compilations). The backend now
      // appends "official" and category=Music.
      const raw = debounced;

      let results: SpotifyPlayableResult[] = [];
      try {
        results = (await fn({ data: { query: raw, max: 24 } })) ?? [];
      } catch (err) {
        console.error("[search] Spotify search failed:", err);
      }
      console.log("[search] API Response (primary):", { query: raw, count: results.length });

      // Fallback — if primary returns 0, try YouTube-only with the same raw term.
      if (results.length === 0) {
        const broad = raw.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
        try {
          const yt = (await ytFn({ data: { query: broad || raw, max: 20 } })) ?? [];
          console.log("[search] API Response (fallback YT):", { query: broad, count: yt.length });
          results = yt.map((t): SpotifyPlayableResult => ({
            spotifyId: `yt:${t.youtubeId}`,
            youtubeId: t.youtubeId,
            title: t.title,
            artist: t.artist,
            album: "",
            albumArt: t.thumbnailUrl ?? null,
            durationSeconds: t.durationSeconds,
          }));
        } catch (err) {
          console.error("[search] YT fallback failed:", err);
        }
      }

      // Task 2: Client-side relevance sort — titles containing the search term win.
      const term = raw.toLowerCase();
      if (term) {
        results = [...results].sort((a, b) => {
          const aHit = a.title.toLowerCase().includes(term) ? 1 : 0;
          const bHit = b.title.toLowerCase().includes(term) ? 1 : 0;
          return bHit - aHit;
        });
      }
      return results;
    },
    enabled: !!session && debounced.length > 1,
    staleTime: 1000 * 60 * 5,
    placeholderData: undefined,
    retry: 1,
  });


  useEffect(() => {
    if (data && data.length > 0 && debounced.length > 1) addToHistory(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, debounced]);

  const results: SpotifyPlayableResult[] = data ?? [];
  const toVibe = (t: SpotifyPlayableResult): VibeTrack => ({
    youtubeId: t.youtubeId,
    title: t.title,
    artist: t.artist,
    thumbnailUrl: t.albumArt ?? "",
    durationSeconds: t.durationSeconds,
  });
  const vibeTracks = results.map(toVibe);
  const top = results[0];
  const rest = results.slice(1);

  // Group artists — only keep names whose tokens overlap with the query.
  // Filters out random YouTube channel names ("DesiWave", "Song Tracks", "T-Series", etc).
  const queryTokens = debounced
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const isLikelyRealArtist = (name: string) => {
    if (!name) return false;
    const n = name.toLowerCase();
    // Reject obvious channel/label patterns
    if (/\b(vevo|records?|music|official|tv|tracks?|wave|tunes?|audio|hits|nation|world|network|channel|entertainment|productions?)\b/i.test(name)) {
      return false;
    }
    if (queryTokens.length === 0) return true;
    return queryTokens.some((tok) => n.includes(tok));
  };
  const artists = Array.from(new Map(results.map((t) => [t.artist, t])).values())
    .filter((a) => isLikelyRealArtist(a.artist))
    .slice(0, 8);

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


        {!q.trim() && (
          searchHistory.length > 0 ? (
            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">
                  Recent Searches
                </h2>
                <button
                  onClick={clearHistory}
                  className="text-xs font-medium text-white/50 transition-colors hover:text-white"
                >
                  Clear All
                </button>
              </div>
              <ul className="space-y-1">
                {searchHistory.map((query) => (
                  <li
                    key={query}
                    onClick={() => setQ(query)}
                    className="group flex cursor-pointer items-center justify-between rounded-xl p-3 transition-colors hover:bg-white/5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <History className="h-4 w-4 shrink-0 text-white/40" />
                      <span className="truncate text-sm text-white/80">{query}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromHistory(query);
                      }}
                      aria-label={`Remove ${query}`}
                      className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/30 opacity-0 transition-all hover:bg-white/10 hover:text-white group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="mt-16 text-center text-sm text-white/40">
              Start typing to find your next vibe.
            </div>
          )
        )}
        {debounced && isFetching && results.length === 0 && (
          <>
            <div className="mt-8 text-center text-sm text-white/50 py-4" role="status" aria-live="polite">
              Searching Vibetune…
            </div>
            <div className="mt-2 space-y-5">
              {/* Top result skeleton */}
              <div className="flex items-center gap-4 rounded-2xl bg-white/[0.03] p-4">
                <div className="h-24 w-24 shrink-0 animate-pulse rounded-md bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
                  <div className="h-5 w-3/4 animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                </div>
              </div>
              {/* Song rows skeleton */}
              <div className="space-y-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-3">
                    <div className="h-12 w-12 shrink-0 animate-pulse rounded-md bg-white/10" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-2/3 animate-pulse rounded bg-white/10" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-white/10" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {debounced && !isFetching && error && (
          <div className="mt-12 text-center text-sm text-red-400/80 py-10" role="alert">
            Search failed. Please check your connection and try again.
          </div>
        )}
        {debounced && !isFetching && !error && results.length === 0 && (
          <div className="text-white/50 text-center py-20">
            No songs found. Try a different artist or movie.
          </div>
        )}

        <AnimatePresence>
          {top && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                Top Result
                <span className="inline-flex items-center gap-1 rounded-full bg-[#1DB954]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#1DB954] normal-case tracking-normal">
                  <Music2 className="h-2.5 w-2.5" /> Spotify
                </span>
              </h2>
              <button
                onClick={() => play(toVibe(top), vibeTracks)}
                className="group relative flex w-full items-center gap-5 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/[0.08] active:scale-[0.99]"
              >
                <div className="h-32 w-32 shrink-0 overflow-hidden rounded-lg shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]">
                  {top.albumArt ? (
                    <img src={top.albumArt} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="vibe-gradient h-full w-full" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-2xl font-bold leading-tight text-white">{top.title}</p>
                  <p className="mt-2 text-sm text-white/60">Song · {top.artist}</p>
                </div>
                <div className="vibe-gradient grid h-12 w-12 shrink-0 place-items-center rounded-full text-white opacity-0 shadow-[0_0_20px_-4px_rgba(236,0,140,0.7)] transition-opacity group-hover:opacity-100">
                  <Play className="h-4 w-4 translate-x-0.5" fill="currentColor" />
                </div>
              </button>
            </motion.section>
          )}

          {artists.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8"
            >
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/50">
                Artists
              </h2>
              <HorizontalCarousel
                ariaLabel="Artists — use arrow keys or swipe"
                className="-mx-5 gap-5 px-5 pb-2"
              >
                {artists.map((a) => (
                  <button
                    key={a.artist}
                    data-carousel-item
                    onClick={() => play(toVibe(a), vibeTracks)}
                    className="group flex w-24 shrink-0 snap-start flex-col items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-md"
                  >
                    <div className="aspect-square w-24 overflow-hidden rounded-full ring-1 ring-white/10 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] transition-transform group-hover:scale-[1.03] group-focus-visible:scale-[1.03]">
                      {a.albumArt ? (
                        <img src={a.albumArt} alt="" draggable={false} className="h-full w-full object-cover" />
                      ) : (
                        <div className="vibe-gradient h-full w-full" />
                      )}
                    </div>
                    <p className="line-clamp-2 text-center text-xs font-medium text-white/80">{a.artist}</p>
                    <p className="-mt-1 text-[10px] uppercase tracking-wider text-white/40">Artist</p>
                  </button>
                ))}
              </HorizontalCarousel>
            </motion.section>
          )}

          {rest.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8"
            >
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                Songs
              </h2>
              <ul className="space-y-0.5">
                {rest.map((t) => (
                  <li key={t.youtubeId}>
                    <div className="group flex w-full items-center gap-4 rounded-lg p-2 transition-colors hover:bg-white/5">
                      <button
                        onClick={() => play(toVibe(t), vibeTracks)}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md">
                          {t.albumArt ? (
                            <img src={t.albumArt} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="vibe-gradient h-full w-full" />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-col truncate">
                          <span className="truncate font-medium text-white">{t.title}</span>
                          <span className="truncate text-xs text-white/50">{t.artist}</span>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addToQueue(toVibe(t));
                          }}
                          aria-label="Save"
                          className="grid h-9 w-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <Heart className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          aria-label="More"
                          className="grid h-9 w-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <MoreHorizontal className="h-[18px] w-[18px]" />
                        </button>
                      </div>
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
