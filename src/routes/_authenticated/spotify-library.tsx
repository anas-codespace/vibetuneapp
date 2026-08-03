import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Heart, ListMusic, Music2, ArrowLeft, Link2 } from "lucide-react";
import {
  spotifyGetConnection,
  spotifyListLiked,
  spotifyListPlaylists,
} from "@/lib/spotify.functions";

export const Route = createFileRoute("/_authenticated/spotify-library")({
  head: () => ({
    meta: [
      { title: "Spotify Library · Vibetune" },
      { name: "description", content: "Your Spotify liked songs and playlists." },
    ],
  }),
  component: SpotifyLibrary,
});

function SpotifyLibrary() {
  const getConnection = useServerFn(spotifyGetConnection);
  const listLiked = useServerFn(spotifyListLiked);
  const listPlaylists = useServerFn(spotifyListPlaylists);

  const connection = useQuery({
    queryKey: ["spotify-connection"],
    queryFn: () => getConnection(),
  });
  const connected = !!connection.data;

  const liked = useQuery({
    queryKey: ["spotify-liked-raw"],
    queryFn: () => listLiked(),
    enabled: connected,
  });
  const playlists = useQuery({
    queryKey: ["spotify-playlists"],
    queryFn: () => listPlaylists(),
    enabled: connected,
  });

  return (
    <main className="min-h-screen bg-background pb-24 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
      <div className="mx-auto max-w-2xl px-5">
        <header className="flex items-center gap-3">
          <Link to="/app" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold">Spotify Library</h1>
        </header>

        {connection.isLoading ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking Spotify connection…
          </div>
        ) : !connected ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#1DB954]/15 text-[#1DB954]">
              <Music2 className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm text-white/70">
              Connect your Spotify account to view your Liked Songs and playlists.
            </p>
            <Link
              to="/settings/spotify"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-black hover:brightness-110"
            >
              <Link2 className="h-4 w-4" />
              Connect Spotify
            </Link>
          </div>
        ) : (
          <>
            {/* Liked Songs */}
            <section className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <Heart className="h-4 w-4 text-[#1DB954]" />
                <h2 className="text-base font-semibold">Liked Songs</h2>
                {liked.data && (
                  <span className="text-xs text-white/40">· {liked.data.length}</span>
                )}
              </div>
              {liked.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : liked.error ? (
                <p className="text-sm text-red-300">
                  {(liked.error as Error).message}
                </p>
              ) : (
                <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
                  {liked.data?.map((t) => (
                    <li key={t.spotifyId} className="flex items-center gap-3 px-3 py-2.5">
                      {t.albumArt ? (
                        <img src={t.albumArt} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-white/10" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="truncate text-xs text-white/50">{t.artist}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Playlists */}
            <section className="mt-10">
              <div className="mb-3 flex items-center gap-2">
                <ListMusic className="h-4 w-4 text-[#1DB954]" />
                <h2 className="text-base font-semibold">Your Playlists</h2>
                {playlists.data && (
                  <span className="text-xs text-white/40">· {playlists.data.length}</span>
                )}
              </div>
              {playlists.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : playlists.error ? (
                <p className="text-sm text-red-300">
                  {(playlists.error as Error).message}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {playlists.data?.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                      {p.image ? (
                        <img src={p.image} alt="" className="aspect-square w-full rounded-lg object-cover" />
                      ) : (
                        <div className="aspect-square w-full rounded-lg bg-white/10" />
                      )}
                      <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-white/50">
                        {p.trackCount} track{p.trackCount === 1 ? "" : "s"} · {p.owner}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
