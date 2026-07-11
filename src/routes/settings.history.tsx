import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Play, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { usePlayer } from "@/components/VibePlayer";
import { toast } from "sonner";

type Row = {
  id: string;
  youtube_id: string;
  title: string;
  artist: string;
  played_at: string;
};

export const Route = createFileRoute("/settings/history")({
  head: () => ({
    meta: [
      { title: "Playback History · Vibtune" },
      { name: "description", content: "Songs you've recently listened to." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { play } = usePlayer();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  const load = async () => {
    if (!session?.user.id) return;
    const { data, error } = await supabase
      .from("listening_history")
      .select("id, youtube_id, title, artist, played_at")
      .eq("user_id", session.user.id)
      .order("played_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Couldn't load history");
      setRows([]);
      return;
    }
    setRows(data ?? []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const removeOne = async (id: string) => {
    if (!session?.user.id) return;
    const prev = rows;
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
    const { error } = await supabase
      .from("listening_history")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id);
    if (error) {
      setRows(prev);
      toast.error("Couldn't remove");
    }
  };

  const clearAll = async () => {
    if (!session?.user.id || !rows?.length) return;
    if (!confirm("Clear all playback history?")) return;
    setBusy(true);
    const { error } = await supabase
      .from("listening_history")
      .delete()
      .eq("user_id", session.user.id);
    setBusy(false);
    if (error) {
      toast.error("Couldn't clear history");
      return;
    }
    setRows([]);
    toast.success("History cleared");
  };

  return (
    <main className="relative min-h-screen pb-44 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="mx-auto max-w-md px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/profile"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10"
              aria-label="Back"
            >
              <ChevronLeft size={20} />
            </Link>
            <h1 className="text-lg font-bold text-white">Playback History</h1>
          </div>
          {rows && rows.length > 0 && (
            <button
              onClick={clearAll}
              disabled={busy}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="mt-6">
          {rows === null ? (
            <div className="grid place-items-center py-24 text-sm text-white/40">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-white/5 bg-white/5 py-16 text-center">
              <p className="text-sm font-medium text-white/70">No history yet</p>
              <p className="mt-1 text-xs text-white/40">
                Play a song and it'll show up here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-white/5">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-white/5"
                >
                  <img
                    src={`https://i.ytimg.com/vi/${r.youtube_id}/mqdefault.jpg`}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                  <button
                    onClick={() =>
                      play({
                        youtubeId: r.youtube_id,
                        title: r.title,
                        artist: r.artist,
                        thumbnailUrl: `https://i.ytimg.com/vi/${r.youtube_id}/mqdefault.jpg`,
                      })
                    }
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium text-white/90">
                      {r.title}
                    </p>
                    <p className="truncate text-xs text-white/50">
                      {r.artist} · {timeAgo(r.played_at)}
                    </p>
                  </button>
                  <button
                    onClick={() =>
                      play({
                        youtubeId: r.youtube_id,
                        title: r.title,
                        artist: r.artist,
                        thumbnailUrl: `https://i.ytimg.com/vi/${r.youtube_id}/mqdefault.jpg`,
                      })
                    }
                    className="grid h-9 w-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label="Play"
                  >
                    <Play size={16} />
                  </button>
                  <button
                    onClick={() => removeOne(r.id)}
                    className="grid h-9 w-9 place-items-center rounded-full text-white/40 hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Remove"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
