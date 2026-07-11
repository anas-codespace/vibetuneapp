import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  spotifyGetAuthUrl,
  spotifyGetConnection,
  spotifyDisconnect,
  spotifyImportLiked,
  spotifyListPlaylists,
  spotifyImportPlaylist,
} from "@/lib/spotify.functions";
import { ArrowLeft, Loader2, Music2, Check, Link2, Unlink, Heart, ListMusic } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/spotify")({
  head: () => ({ meta: [{ title: "Spotify · Vibetune" }] }),
  component: SpotifySettings,
});

function SpotifySettings() {
  const qc = useQueryClient();
  const getAuthUrl = useServerFn(spotifyGetAuthUrl);
  const getConnection = useServerFn(spotifyGetConnection);
  const disconnect = useServerFn(spotifyDisconnect);
  const importLiked = useServerFn(spotifyImportLiked);
  const listPlaylists = useServerFn(spotifyListPlaylists);
  const importPlaylist = useServerFn(spotifyImportPlaylist);

  const connection = useQuery({
    queryKey: ["spotify-connection"],
    queryFn: () => getConnection(),
  });

  const playlists = useQuery({
    queryKey: ["spotify-playlists"],
    queryFn: () => listPlaylists(),
    enabled: !!connection.data,
  });

  const [importingId, setImportingId] = useState<string | null>(null);

  const connectMut = useMutation({
    mutationFn: async () => {
      const redirectUri = `${window.location.origin}/spotify/callback`;
      const { url, state } = await getAuthUrl({ data: { redirectUri } });
      sessionStorage.setItem("spotify_state", state);
      sessionStorage.setItem("spotify_redirect_uri", redirectUri);
      window.location.href = url;
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      toast.success("Spotify disconnected");
      qc.invalidateQueries({ queryKey: ["spotify-connection"] });
      qc.invalidateQueries({ queryKey: ["spotify-playlists"] });
    },
  });

  const likedMut = useMutation({
    mutationFn: () => importLiked(),
    onSuccess: (r) => toast.success(`Imported ${r.added} liked songs (${r.skipped} skipped)`),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  const plMut = useMutation({
    mutationFn: (v: { id: string; name: string; cover: string | null }) =>
      importPlaylist({ data: { playlistId: v.id, name: v.name, cover: v.cover } }),
    onSuccess: (r) => toast.success(`Imported ${r.added} tracks (${r.skipped} skipped)`),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Import failed"),
    onSettled: () => setImportingId(null),
  });

  const connected = !!connection.data;

  return (
    <main className="min-h-screen bg-black pb-32 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
      <div className="mx-auto max-w-md px-5">
        <div className="flex items-center gap-3">
          <Link to="/profile" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold">Spotify</h1>
        </div>

        {/* Connection card */}
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-[#1DB954]/15 text-[#1DB954]">
              <Music2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Spotify account</p>
              <p className="text-xs text-white/50">
                {connection.isLoading
                  ? "Checking…"
                  : connected
                  ? `Connected as ${connection.data?.spotify_display_name ?? connection.data?.spotify_user_id}`
                  : "Not connected"}
              </p>
            </div>
            {connected ? (
              <button
                onClick={() => disconnectMut.mutate()}
                disabled={disconnectMut.isPending}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
              >
                <Unlink className="h-3.5 w-3.5" /> Disconnect
              </button>
            ) : (
              <button
                onClick={() => connectMut.mutate()}
                disabled={connectMut.isPending}
                className="flex items-center gap-1.5 rounded-full bg-[#1DB954] px-3.5 py-1.5 text-xs font-semibold text-black hover:brightness-110"
              >
                {connectMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Connect
              </button>
            )}
          </div>
        </section>

        {connected && (
          <>
            {/* Import Liked */}
            <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-pink-500/15 text-pink-400">
                  <Heart className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Import Liked Songs</p>
                  <p className="text-xs text-white/50">Up to 200 tracks, matched to playable versions</p>
                </div>
                <button
                  onClick={() => likedMut.mutate()}
                  disabled={likedMut.isPending}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
                >
                  {likedMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}
                </button>
              </div>
            </section>

            {/* Playlists */}
            <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-3 flex items-center gap-2">
                <ListMusic className="h-4 w-4 text-white/60" />
                <p className="text-sm font-medium">Your Playlists</p>
              </div>
              {playlists.isLoading && (
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              )}
              {playlists.data && playlists.data.length === 0 && (
                <p className="text-xs text-white/50">No playlists found on your Spotify account.</p>
              )}
              <ul className="space-y-2">
                {playlists.data?.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.02] p-2.5">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/5">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="truncate text-xs text-white/40">{p.trackCount} tracks · {p.owner}</p>
                    </div>
                    <button
                      onClick={() => {
                        setImportingId(p.id);
                        plMut.mutate({ id: p.id, name: p.name, cover: p.image });
                      }}
                      disabled={plMut.isPending}
                      className="rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-50"
                    >
                      {importingId === p.id && plMut.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : plMut.isSuccess && importingId === p.id ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        "Import"
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <p className="mt-6 px-1 text-[11px] leading-relaxed text-white/40">
          Spotify is used to read your library and metadata. Playback is handled by VibeTune's own player — imported tracks
          are matched to a playable version automatically.
        </p>
      </div>
    </main>
  );
}
