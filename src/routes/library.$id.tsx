import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ListMusic, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  deletePlaylist,
  getPlaylist,
  removeFromPlaylist,
} from "@/lib/library.functions";
import { usePlayer, type VibeTrack } from "@/components/VibePlayer";

export const Route = createFileRoute("/library/$id")({
  head: ({ params }) => {
    const url = `https://vibetuneapp.lovable.app/library/${params.id}`;
    return {
      meta: [
        { title: "Playlist · Vibtune" },
        { name: "description", content: "A Vibtune playlist — play, share, and manage your tracks." },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: "Playlist · Vibtune" },
        { property: "og:description", content: "A Vibtune playlist — play, share, and manage your tracks." },
        { property: "og:url", content: url },
        { property: "og:type", content: "music.playlist" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MusicPlaylist",
            "@id": url,
            url,
            name: "Vibtune Playlist",
            description: "A user-curated playlist on Vibtune.",
            isPartOf: {
              "@type": "WebSite",
              name: "Vibtune",
              url: "https://vibetuneapp.lovable.app",
            },
          }),
        },
      ],
    };
  },
  component: PlaylistPage,
});

function PlaylistPage() {
  const { id } = Route.useParams();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const fn = useServerFn(getPlaylist);
  const delFn = useServerFn(deletePlaylist);
  const rmFn = useServerFn(removeFromPlaylist);
  const qc = useQueryClient();
  const { play } = usePlayer();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => fn({ data: { id } }),
    enabled: !!session,
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      toast.success("Playlist deleted");
      navigate({ to: "/library" });
    },
  });

  const rm = useMutation({
    mutationFn: (youtubeId: string) => rmFn({ data: { playlistId: id, youtubeId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playlist", id] }),
  });

  const songs = data?.songs ?? [];
  const queue: VibeTrack[] = songs.map((s) => ({
    youtubeId: s.youtube_id,
    title: s.title,
    artist: s.artist,
    thumbnailUrl: s.thumbnail_url ?? undefined,
  }));

  if (isLoading) {
    return <main className="min-h-screen px-5 pt-16 text-sm text-white/40">Loading…</main>;
  }
  if (!data) {
    return <main className="min-h-screen px-5 pt-16 text-sm text-white/40">Playlist not found.</main>;
  }

  return (
    <main className="relative min-h-screen pb-44 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="px-5">
        <Link
          to="/library"
          className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> Library
        </Link>
      </div>

      <header className="mx-auto mt-4 max-w-md px-5">
        <div className="vibe-gradient mx-auto grid aspect-square w-44 place-items-center overflow-hidden rounded-2xl shadow-[0_30px_60px_-20px_rgba(236,0,140,0.6)]">
          {queue[0]?.thumbnailUrl ? (
            <img src={queue[0].thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ListMusic className="h-10 w-10 text-white" />
          )}
        </div>
        <h1 className="mt-5 text-center text-2xl font-bold">{data.playlist.name}</h1>
        <p className="mt-1 text-center text-xs text-white/50">{songs.length} songs</p>

        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            onClick={() => queue.length && play(queue[0], queue)}
            disabled={queue.length === 0}
            className="vibe-gradient flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-[0_0_20px_-4px_rgba(236,0,140,0.6)] disabled:opacity-40"
          >
            <Play className="h-4 w-4" fill="currentColor" /> Play
          </button>
          <button
            onClick={() => del.mutate()}
            className="glass grid h-12 w-12 place-items-center rounded-full text-white/70 hover:text-white"
            aria-label="Delete playlist"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="mx-auto mt-8 max-w-md px-5">
        {songs.length === 0 && (
          <p className="text-center text-sm text-white/40">
            No songs yet. Add some from the player.
          </p>
        )}
        <ul className="space-y-2">
          {songs.map((s) => {
            const t = queue.find((q) => q.youtubeId === s.youtube_id)!;
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/5">
                <button onClick={() => play(t, queue)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
                <button
                  onClick={() => rm.mutate(s.youtube_id)}
                  aria-label="Remove"
                  className="grid h-9 w-9 place-items-center rounded-full text-white/40 hover:bg-white/5 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
