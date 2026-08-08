import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Download, Heart, ListMusic, ListPlus, Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOnboardingGate } from "@/hooks/use-onboarding-gate";
import {
  createPlaylist,
  getLikedSongs,
  getMyPlaylists,
} from "@/lib/library.functions";
import { usePlayer, type VibeTrack } from "@/components/VibePlayer";
import { BulkAddToPlaylistSheet } from "@/components/BulkAddToPlaylistSheet";
import { cn } from "@/lib/utils";
import { useDownloads } from "@/hooks/use-downloads";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { useSyncStatus } from "@/hooks/use-sync-status";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Your Library · Vibtune" },
      { name: "description", content: "Your Vibtune library: liked songs, downloaded tracks, and playlists synced from Spotify — all in one place." },
      { property: "og:title", content: "Your Library · Vibtune" },
      { property: "og:description", content: "Liked songs, downloads, and playlists — your music library on Vibtune." },
      { property: "og:url", content: "https://vibetuneapp.lovable.app/library" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://vibetuneapp.lovable.app/library" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Your Library",
          description:
            "Your Vibtune library: liked songs, downloaded tracks, and playlists synced from Spotify.",
          url: "https://vibetuneapp.lovable.app/library",
          isPartOf: {
            "@type": "WebSite",
            name: "Vibtune",
            url: "https://vibetuneapp.lovable.app",
          },
          about: [
            { "@type": "Thing", name: "Liked Songs" },
            { "@type": "Thing", name: "Downloaded Tracks" },
            { "@type": "Thing", name: "Playlists" },
          ],
        }),
      },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { session, loading } = useAuth();
  useOnboardingGate();
  const navigate = useNavigate();
  const likedFn = useServerFn(getLikedSongs);
  const plFn = useServerFn(getMyPlaylists);
  const createFn = useServerFn(createPlaylist);
  const qc = useQueryClient();
  const { play } = usePlayer();
  const [showCreate, setShowCreate] = useState(false);
  const { items: downloads } = useDownloads();
  const sync = useSyncStatus();
  const [name, setName] = useState("");

  // Bulk-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (sync.phase === "done" || sync.phase === "partial") {
      qc.invalidateQueries({ queryKey: ["liked-songs"] });
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
    }
  }, [sync.phase, sync.updatedAt, qc]);

  const { data: liked } = useQuery({
    queryKey: ["liked-songs"],
    queryFn: () => likedFn(),
    enabled: !!session,
  });
  const { data: playlists } = useQuery({
    queryKey: ["my-playlists"],
    queryFn: () => plFn(),
    enabled: !!session,
  });

  const create = useMutation({
    mutationFn: (n: string) => createFn({ data: { name: n } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      setName("");
      setShowCreate(false);
    },
  });

  const likedQueue: VibeTrack[] = useMemo(
    () =>
      (liked ?? []).map((s) => ({
        youtubeId: s.youtube_id,
        title: s.title,
        artist: s.artist,
        thumbnailUrl: s.thumbnail_url ?? undefined,
      })),
    [liked],
  );

  const playLiked = () => {
    if (likedQueue.length === 0) return;
    play(likedQueue[0], likedQueue);
  };

  const enterSelect = () => {
    setSelectMode(true);
    setSelected(new Set());
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allIds = (liked ?? []).map((s) => s.youtube_id);
  const allSelected = allIds.length > 0 && selected.size === allIds.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const selectedTracks: VibeTrack[] = likedQueue.filter((t) =>
    selected.has(t.youtubeId),
  );

  return (
    <main className="relative min-h-screen px-5 pb-44 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Your Library</h1>
        <button
          onClick={() => setShowCreate(true)}
          aria-label="New playlist"
          className="rounded-full bg-white/5 p-2 text-white transition-colors hover:bg-white/10"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <SyncStatusBanner />

      {/* Quick access grid */}
      <section className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-4">
        <button
          onClick={playLiked}
          className="group relative flex h-28 flex-col justify-end overflow-hidden rounded-lg bg-gradient-to-br from-violet-500 to-cyan-300 p-4 text-left shadow-lg active:scale-[0.98]"
        >
          <Heart
            className="absolute -bottom-4 -right-4 h-20 w-20 rotate-12 text-white/20 transition-transform group-hover:scale-110"
            fill="currentColor"
          />
          <h2 className="relative z-10 text-lg font-bold text-white">Liked Songs</h2>
          <p className="relative z-10 text-sm text-white/80">{liked?.length ?? 0} songs</p>
        </button>
        <Link
          to="/library/downloaded"
          className="group relative flex h-28 flex-col justify-end overflow-hidden rounded-lg border border-white/5 bg-white/5 p-4 transition hover:bg-white/10 active:scale-[0.98]"
        >
          <Download className="absolute -bottom-4 -right-4 h-20 w-20 rotate-12 text-white/10 transition-transform group-hover:scale-110" />
          <div className="relative z-10">
            <h2 className="text-lg font-bold text-white">Downloaded</h2>
            <p className="text-sm text-white/50">
              {downloads.length} {downloads.length === 1 ? "track" : "tracks"}
            </p>
          </div>

        </Link>
      </section>

      {/* Playlists */}
      <section className="mx-auto mt-8 max-w-md">
        <h2 className="mb-4 text-xl font-bold text-white">Your Playlists</h2>
        {(!playlists || playlists.length === 0) && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-12">
            <ListMusic className="mb-4 h-12 w-12 text-white/40" />
            <h3 className="mb-2 text-lg font-medium text-white">No playlists yet</h3>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 rounded-full bg-white px-6 py-2 font-semibold text-black transition-transform hover:scale-105"
            >
              Create Playlist
            </button>
          </div>
        )}
        <ul className="space-y-2">
          {(playlists ?? []).map((p) => (
            <li key={p.id}>
              <Link
                to="/library/$id"
                params={{ id: p.id }}
                className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/5 active:scale-[0.98]"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/5">
                  {p.first_thumb ? (
                    <img src={p.first_thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ListMusic className="h-5 w-5 text-white/60" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                  <p className="text-xs text-white/40">Playlist · {p.song_count} songs</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Recently Added */}
      {liked && liked.length > 0 && (
        <section className="mx-auto mt-8 max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              {selectMode ? `${selected.size} selected` : "Recently Added"}
            </h2>
            {selectMode ? (
              <div className="flex items-center gap-3 text-xs">
                <button
                  onClick={toggleAll}
                  className="font-semibold text-white/70 hover:text-white"
                >
                  {allSelected ? "Clear" : "Select all"}
                </button>
                <button
                  onClick={exitSelect}
                  className="font-semibold text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                onClick={enterSelect}
                className="text-xs font-semibold text-white/70 hover:text-white"
              >
                Select
              </button>
            )}
          </div>

          <ul className="space-y-2">
            {liked.map((s) => {
              const isSel = selected.has(s.youtube_id);
              const t = likedQueue.find((x) => x.youtubeId === s.youtube_id)!;
              return (
                <li key={s.id}>
                  <button
                    onClick={() =>
                      selectMode ? toggle(s.youtube_id) : play(t, likedQueue)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/5 active:scale-[0.98]",
                      selectMode && isSel && "bg-white/[0.06]",
                    )}
                  >
                    {selectMode && (
                      <span
                        className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-full transition",
                          isSel ? "text-white" : "text-white/30",
                        )}
                        aria-hidden
                      >
                        {isSel ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </span>
                    )}
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/5">
                      {s.thumbnail_url ? (
                        <img src={s.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{s.title}</p>
                      <p className="truncate text-xs text-white/50">{s.artist}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Floating bulk action bar */}
      <AnimatePresence>
        {selectMode && selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-x-0 bottom-[96px] z-40 px-5 pb-[env(safe-area-inset-bottom)]"
          >
            <div className="glass-strong gradient-border mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl px-4 py-3">
              <button
                onClick={exitSelect}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/70"
                aria-label="Cancel selection"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="flex-1 text-sm font-semibold text-white">
                {selected.size} song{selected.size === 1 ? "" : "s"}
              </p>
              <button
                onClick={() => setBulkOpen(true)}
                className="vibe-gradient flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-[#050b14] shadow-[0_0_18px_-4px_rgba(127,216,232,0.7)]"
              >
                <ListPlus className="h-4 w-4" /> Add to playlist
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BulkAddToPlaylistSheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        tracks={selectedTracks}
        onDone={exitSelect}
      />

      {/* Create playlist modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCreate(false)}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong gradient-border absolute inset-x-5 top-1/3 mx-auto max-w-md rounded-3xl p-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">New playlist</h3>
                <button onClick={() => setShowCreate(false)} className="text-white/50">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My vibes"
                className="glass mt-4 w-full rounded-full px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--vibe-magenta)]"
              />
              <button
                onClick={() => name.trim() && create.mutate(name.trim())}
                disabled={!name.trim() || create.isPending}
                className="vibe-gradient mt-4 w-full rounded-full py-3 text-sm font-semibold text-[#050b14] shadow-[0_0_20px_-4px_rgba(127,216,232,0.6)] disabled:opacity-40"
              >
                Create
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
