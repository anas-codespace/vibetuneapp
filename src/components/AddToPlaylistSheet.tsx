import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ListMusic, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { addToPlaylist, createPlaylist, getMyPlaylists } from "@/lib/library.functions";
import type { VibeTrack } from "@/components/VibePlayer";

interface Props {
  open: boolean;
  onClose: () => void;
  track: VibeTrack;
}

export function AddToPlaylistSheet({ open, onClose, track }: Props) {
  const listFn = useServerFn(getMyPlaylists);
  const addFn = useServerFn(addToPlaylist);
  const createFn = useServerFn(createPlaylist);
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: playlists } = useQuery({
    queryKey: ["my-playlists"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const handleAdd = async (playlistId: string) => {
    try {
      await addFn({ data: { playlistId, track } });
      toast.success("Added to playlist");
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      qc.invalidateQueries({ queryKey: ["playlist", playlistId] });
      onClose();
    } catch (e) {
      toast.error("Couldn't add", { description: e instanceof Error ? e.message : "" });
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const pl = await createFn({ data: { name: newName.trim() } });
      await addFn({ data: { playlistId: pl.id, track } });
      toast.success(`Added to "${pl.name}"`);
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      onClose();
      setNewName("");
    } catch (e) {
      toast.error("Couldn't create", { description: e instanceof Error ? e.message : "" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong absolute inset-x-0 bottom-0 max-h-[80vh] overflow-hidden rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-lg font-bold text-white">Add to playlist</h3>
              <button
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/70 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 pb-3">
              <div className="flex items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New playlist name…"
                  className="glass flex-1 rounded-full px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--vibe-magenta)]"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="vibe-gradient grid h-11 w-11 place-items-center rounded-full text-white shadow-[0_0_20px_-4px_rgba(127,216,232,0.6)] disabled:opacity-40"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-3 pb-6">
              {(playlists ?? []).length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-white/40">
                  No playlists yet. Create one above.
                </p>
              )}
              {(playlists ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAdd(p.id)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/5"
                >
                  <div className="vibe-gradient grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl">
                    {p.first_thumb ? (
                      <img src={p.first_thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ListMusic className="h-5 w-5 text-white" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                    <p className="text-xs text-white/40">{p.song_count} songs</p>
                  </div>
                  <Check className="h-4 w-4 text-white/30" />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
