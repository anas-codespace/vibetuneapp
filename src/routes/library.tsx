import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Heart, ListMusic, ListPlus, Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  createPlaylist,
  getLikedSongs,
  getMyPlaylists,
} from "@/lib/library.functions";
import { usePlayer, type VibeTrack } from "@/components/VibePlayer";
import { BulkAddToPlaylistSheet } from "@/components/BulkAddToPlaylistSheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/library")({
  head: () => ({ meta: [{ title: "Library · Vibtune" }] }),
  component: LibraryPage,
});

function LibraryPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const likedFn = useServerFn(getLikedSongs);
  const plFn = useServerFn(getMyPlaylists);
  const createFn = useServerFn(createPlaylist);
  const qc = useQueryClient();
  const { play } = usePlayer();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");

  // Bulk-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

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
        <h1 className="text-3xl font-bold">Your Library</h1>
        <button
          onClick={() => setShowCreate(true)}
          aria-label="New playlist"
          className="vibe-gradient grid h-10 w-10 place-items-center rounded-full text-white shadow-[0_0_18px_-4px_rgba(236,0,140,0.7)]"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Liked songs hero card */}
      <section className="mx-auto mt-6 max-w-md">
        <button
          onClick={playLiked}
          className="gradient-border relative flex w-full items-center gap-4 overflow-hidden rounded-2xl p-4 text-left active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg, rgba(125,63,243,0.25), rgba(236,0,140,0.15) 60%, rgba(255,69,0,0.1))" }}
        >
          <div className="vibe-gradient grid h-16 w-16 shrink-0 place-items-center rounded-2xl shadow-[0_0_24px_-4px_rgba(236,0,140,0.6)]">
            <Heart className="h-7 w-7 text-white" fill="currentColor" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-white">Liked Songs</p>
            <p className="text-xs text-white/60">{liked?.length ?? 0} songs</p>
          </div>
        </button>
      </section>

      {/* Playlists */}
      <section className="mx-auto mt-8 max-w-md">
        <h2 className="vibe-text mb-3 text-[10px] font-bold uppercase tracking-[0.25em]">
          Your Playlists
        </h2>
        {(!playlists || playlists.length === 0) && (
          <div className="glass rounded-2xl p-6 text-center">
            <ListMusic className="mx-auto mb-3 h-6 w-6 text-white/40" />
            <p className="text-sm text-white/60">No playlists yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-xs font-semibold text-[var(--vibe-magenta)]"
            >
              Create your first playlist
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
                <div className="vibe-gradient grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl">
                  {p.first_thumb ? (
                    <img src={p.first_thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ListMusic className="h-5 w-5 text-white" />
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

      {/* Liked songs list */}
      {liked && liked.length > 0 && (
        <section className="mx-auto mt-8 max-w-md">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="vibe-text text-[10px] font-bold uppercase tracking-[0.25em]">
              {selectMode ? `${selected.size} selected` : "Liked Songs"}
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
                  className="font-semibold text-[var(--vibe-magenta)]"
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
                          isSel ? "text-[var(--vibe-magenta)]" : "text-white/30",
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
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                      {s.thumbnail_url ? (
                        <img src={s.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="vibe-gradient h-full w-full" />
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
                className="vibe-gradient flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white shadow-[0_0_18px_-4px_rgba(236,0,140,0.7)]"
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
                className="vibe-gradient mt-4 w-full rounded-full py-3 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(236,0,140,0.6)] disabled:opacity-40"
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
