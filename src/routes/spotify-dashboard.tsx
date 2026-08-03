import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Music2, Heart, ListMusic, Link2, LogOut } from "lucide-react";
import { useSpotifyAuth } from "@/hooks/use-spotify-auth";
import {
  fetchLikedSongs,
  fetchPlaylists,
  fetchMe,
} from "@/lib/spotifyClient";

export const Route = createFileRoute("/spotify-dashboard")({
  head: () => ({
    meta: [
      { title: "Spotify Library · Vibetune" },
      { name: "description", content: "Browse your Spotify liked songs and playlists." },
    ],
  }),
  component: SpotifyDashboard,
});

function ConnectPrompt() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#1DB954]/15 text-[#1DB954]">
          <Music2 className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Connect Spotify</h1>
        <p className="mt-1 text-sm text-white/60">
          Sign in with your Spotify account to view your Liked Songs and playlists.
        </p>
        <Link
          to="/settings/spotify"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-black hover:brightness-110"
        >
          <Link2 className="h-4 w-4" />
          Connect Spotify
        </Link>
      </div>
    </main>
  );
}

function SpotifyDashboard() {
  const { token, logout } = useSpotifyAuth();

  const me = useQuery({
    queryKey: ["sp-me", token],
    queryFn: () => fetchMe(token!),
    enabled: !!token,
  });

  const liked = useQuery({
    queryKey: ["sp-liked", token],
    queryFn: () => fetchLikedSongs(token!),
    enabled: !!token,
  });

  const playlists = useQuery({
    queryKey: ["sp-playlists", token],
    queryFn: () => fetchPlaylists(token!),
    enabled: !!token,
  });

  if (!token) return <ConnectPrompt />;

  const expired =
    liked.error instanceof Error && liked.error.message.includes("expired");
  if (expired) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-sm text-white/80">Your Spotify session expired.</p>
          <Link
            to="/settings/spotify"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-black"
          >
            <Link2 className="h-4 w-4" /> Reconnect
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-24 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
      <div className="mx-auto max-w-2xl px-5">
        <header className="flex items-center gap-3">
          {me.data?.images?.[0]?.url ? (
            <img src={me.data.images[0].url} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[#1DB954]/15 text-[#1DB954]">
              <Music2 className="h-5 w-5" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/50">Signed in as</p>
            <p className="truncate text-sm font-semibold">
              {me.data?.display_name ?? me.data?.id ?? "Spotify user"}
            </p>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </header>

        {/* Liked Songs */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Heart className="h-4 w-4 text-[#1DB954]" />
            <h2 className="text-base font-semibold">Liked Songs</h2>
            {liked.data && (
              <span className="text-xs text-white/40">· {liked.data.total}</span>
            )}
          </div>
          {liked.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : liked.error ? (
            <p className="text-sm text-red-300">{(liked.error as Error).message}</p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
              {liked.data?.items.map(({ track }) => (
                <li key={track.id} className="flex items-center gap-3 px-3 py-2.5">
                  {track.album.images?.[2]?.url || track.album.images?.[0]?.url ? (
                    <img
                      src={track.album.images[2]?.url ?? track.album.images[0].url}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-white/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{track.name}</p>
                    <p className="truncate text-xs text-white/50">
                      {track.artists.map((a) => a.name).join(", ")}
                    </p>
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
              <span className="text-xs text-white/40">· {playlists.data.total}</span>
            )}
          </div>
          {playlists.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : playlists.error ? (
            <p className="text-sm text-red-300">{(playlists.error as Error).message}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {playlists.data?.items.map((pl) => (
                <div
                  key={pl.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-3"
                >
                  {pl.images?.[0]?.url ? (
                    <img
                      src={pl.images[0].url}
                      alt=""
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full rounded-lg bg-white/10" />
                  )}
                  <p className="mt-2 truncate text-sm font-medium">{pl.name}</p>
                  <p className="truncate text-xs text-white/50">
                    {pl.tracks.total} track{pl.tracks.total === 1 ? "" : "s"} · {pl.owner.display_name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
