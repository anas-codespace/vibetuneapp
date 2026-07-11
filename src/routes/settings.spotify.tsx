import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  spotifyGetAuthUrl,
  spotifyGetConnection,
  spotifyDisconnect,
  spotifyImportLiked,
  spotifyListPlaylists,
  spotifyImportPlaylist,
} from "@/lib/spotify.functions";
import {
  ArrowLeft,
  Loader2,
  Music2,
  Check,
  Link2,
  Unlink,
  Heart,
  ListMusic,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/spotify")({
  head: () => ({ meta: [{ title: "Spotify · Vibetune" }] }),
  component: SpotifySettings,
});

type FailureReason = "no_youtube_match" | "duplicate" | "db_error" | "resolve_error";
interface Failure { title: string; artist: string; reason: FailureReason; detail?: string }
interface ImportResult {
  total: number;
  added: number;
  skipped: number;
  failures: Failure[];
  scope: "liked" | "playlist";
  label: string;
}

const REASON_LABEL: Record<FailureReason, string> = {
  no_youtube_match: "No playable match on YouTube",
  duplicate: "Already in your library",
  db_error: "Couldn't save to your library",
  resolve_error: "Lookup failed (network or quota)",
};

function IndeterminateBar() {
  return (
    <div className="relative mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div className="absolute inset-y-0 left-0 w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-[#1DB954]" />
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );
}

function ResultCard({ result, onDismiss }: { result: ImportResult; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const failed = result.failures.length;
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="flex items-start gap-3">
        <div className={`grid h-8 w-8 place-items-center rounded-full ${failed ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
          {failed ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">
            {result.label}: {result.added} imported
          </p>
          <p className="mt-0.5 text-xs text-white/50">
            {result.total} found · {result.added} added · {result.skipped} skipped
          </p>
        </div>
        <button onClick={onDismiss} className="text-xs text-white/50 hover:text-white">Dismiss</button>
      </div>
      {failed > 0 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
          >
            <span>{failed} track{failed === 1 ? "" : "s"} skipped — see reasons</span>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {open && (
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {result.failures.map((f, i) => (
                <li key={i} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="truncate text-xs font-medium">{f.title}</p>
                  <p className="truncate text-[11px] text-white/45">{f.artist}</p>
                  <p className="mt-1 text-[11px] text-amber-300/80">
                    {REASON_LABEL[f.reason]}
                    {f.detail ? ` — ${f.detail}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

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
  const [likedResult, setLikedResult] = useState<ImportResult | null>(null);
  const [playlistResults, setPlaylistResults] = useState<Record<string, ImportResult>>({});
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [redirectBlocked, setRedirectBlocked] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [callbackError, setCallbackError] = useState<{ code: string; message: string; hint: string; at: number } | null>(null);

  // Surface any error persisted by /spotify/callback so the user sees it here
  // with a Retry button (the callback route redirects here on failure).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("spotify_last_error");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setCallbackError({ code: parsed.code, message: parsed.message, hint: parsed.hint, at: parsed.at });
    } catch { /* ignore */ }
  }, []);

  const dismissCallbackError = () => {
    sessionStorage.removeItem("spotify_last_error");
    setCallbackError(null);
  };

  // Auto-trigger connect when arriving from the login "Continue with Spotify" button
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("post_login_action") !== "connect_spotify") return;
    if (connection.isLoading) return;
    sessionStorage.removeItem("post_login_action");
    if (!connection.data) connectMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.isLoading, connection.data]);

  const persistState = (state: string, redirectUri: string) => {
    sessionStorage.setItem("spotify_state", state);
    sessionStorage.setItem("spotify_redirect_uri", redirectUri);
    try {
      // Callback route also breaks out of the preview iframe; mirror state there.
      if (window.top && window.top !== window.self) {
        window.top.sessionStorage.setItem("spotify_state", state);
        window.top.sessionStorage.setItem("spotify_redirect_uri", redirectUri);
      }
    } catch {
      /* cross-origin top; ignore */
    }
  };

  const connectMut = useMutation({
    mutationFn: async () => {
      const redirectUri = `${window.location.origin}/spotify/callback`;
      const { url, state } = await getAuthUrl({ data: { redirectUri } });
      persistState(state, redirectUri);
      setPendingAuthUrl(url);

      // Spotify's auth page sends X-Frame-Options: DENY, so it cannot render inside
      // any iframe (including the Lovable preview). Try to escape to the top-level
      // window; if that's cross-origin (blocked), fall back to opening a new tab.
      // Either way we keep the URL in state so the user always has a manual link.
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = url;
          return;
        }
        window.location.href = url;
      } catch {
        const popup = window.open(url, "_blank", "noopener,noreferrer");
        if (!popup) {
          // Popup blocked too — surface the manual fallback.
          setRedirectBlocked(true);
          toast.error("Browser blocked the redirect. Use the 'Open in new tab' link below.");
        }
      }
    },
  });

  const openInNewTab = () => {
    if (!pendingAuthUrl) return;
    const popup = window.open(pendingAuthUrl, "_blank", "noopener,noreferrer");
    if (!popup) {
      setRedirectBlocked(true);
      toast.error("Popup blocked — allow popups for this site or copy the link.");
    }
  };

  const copyAuthUrl = async () => {
    if (!pendingAuthUrl) return;
    try {
      await navigator.clipboard.writeText(pendingAuthUrl);
      toast.success("Login link copied — paste it into a new tab.");
    } catch {
      toast.error("Couldn't copy — long-press the link to copy manually.");
    }
  };


  const disconnectMut = useMutation({
    mutationFn: () => disconnect(),
    onMutate: () => {
      // Optimistic: flip UI to Disconnected immediately.
      qc.setQueryData(["spotify-connection"], null);
    },
    onSuccess: () => {
      toast.success("Spotify disconnected");
      setLikedResult(null);
      setPlaylistResults({});
      setConfirmDisconnect(false);
      qc.removeQueries({ queryKey: ["spotify-playlists"] });
      qc.invalidateQueries({ queryKey: ["spotify-connection"] });
    },
    onError: (e: unknown) => {
      // Roll back optimistic update
      qc.invalidateQueries({ queryKey: ["spotify-connection"] });
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect Spotify");
    },
  });

  const likedMut = useMutation({
    mutationFn: () => importLiked(),
    onSuccess: (r) => {
      setLikedResult({ ...r, scope: "liked", label: "Liked Songs" });
      toast.success(`${r.added} liked song${r.added === 1 ? "" : "s"} imported`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  const plMut = useMutation({
    mutationFn: (v: { id: string; name: string; cover: string | null }) =>
      importPlaylist({ data: { playlistId: v.id, name: v.name, cover: v.cover } }).then((r) => ({ ...r, name: v.name, id: v.id })),
    onSuccess: (r) => {
      setPlaylistResults((prev) => ({
        ...prev,
        [r.id]: { total: r.total, added: r.added, skipped: r.skipped, failures: r.failures, scope: "playlist", label: r.name },
      }));
      toast.success(`${r.added} track${r.added === 1 ? "" : "s"} imported from "${r.name}"`);
    },
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
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Spotify account</p>
                <span
                  className={
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                    (connection.isLoading
                      ? "bg-white/10 text-white/60"
                      : connected
                      ? "bg-[#1DB954]/15 text-[#1DB954]"
                      : "bg-red-500/15 text-red-400")
                  }
                >
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " +
                      (connection.isLoading
                        ? "bg-white/40"
                        : connected
                        ? "bg-[#1DB954] animate-pulse"
                        : "bg-red-400")
                    }
                  />
                  {connection.isLoading ? "Checking" : connected ? "Connected" : "Disconnected"}
                </span>
              </div>
              {connected ? (
                <p className="mt-1 truncate text-base font-semibold text-white">
                  {connection.data?.spotify_display_name ?? connection.data?.spotify_user_id}
                </p>
              ) : (
                <p className="mt-1 text-xs text-white/50">
                  {connection.isLoading ? "Checking your Spotify connection…" : "Link Spotify to import your library and enrich search."}
                </p>
              )}
              {connected && connection.data?.spotify_display_name && connection.data?.spotify_user_id && (
                <p className="truncate text-[11px] text-white/40">@{connection.data.spotify_user_id}</p>
              )}
            </div>
            {connected ? (
              <button
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnectMut.isPending}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-50"
              >
                {disconnectMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => connectMut.mutate()}
                disabled={connectMut.isPending}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#1DB954] px-3.5 py-1.5 text-xs font-semibold text-black hover:brightness-110"
              >
                {connectMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Connect
              </button>
            )}
          </div>

          {!connected && callbackError && (
            <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/[0.07] p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <div className="flex-1 text-xs leading-relaxed">
                  <p className="font-semibold text-red-200">Spotify connection failed</p>
                  <p className="mt-1 text-red-100/85">{callbackError.message}</p>
                  <p className="mt-1 text-red-100/60">{callbackError.hint}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-red-100/40">
                    Code: {callbackError.code}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => { dismissCallbackError(); connectMut.mutate(); }}
                      disabled={connectMut.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#1DB954] px-3 py-1.5 text-[11px] font-semibold text-black hover:brightness-110 disabled:opacity-60"
                    >
                      {connectMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Retry connect
                    </button>
                    <button
                      onClick={dismissCallbackError}
                      className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}


          {!connected && pendingAuthUrl && (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="flex-1 text-xs leading-relaxed text-amber-100/90">
                  <p className="font-semibold text-amber-200">
                    {redirectBlocked ? "Redirect blocked" : "Didn't get redirected?"}
                  </p>
                  <p className="mt-1 text-amber-100/70">
                    Spotify's login page refuses to load inside embedded frames (like the
                    in-app preview) for security. If nothing opened, use the link below to
                    finish signing in — it'll come back here automatically.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={openInNewTab}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1.5 text-[11px] font-semibold text-black hover:brightness-110"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Open in new tab
                    </button>
                    <button
                      onClick={copyAuthUrl}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
                    >
                      Copy login link
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
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
                  <p className="text-xs text-white/50">
                    {likedMut.isPending
                      ? "Matching your tracks to playable versions…"
                      : "Up to 200 tracks, matched to playable versions"}
                  </p>
                </div>
                <button
                  onClick={() => likedMut.mutate()}
                  disabled={likedMut.isPending}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-50"
                >
                  {likedMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}
                </button>
              </div>
              {likedMut.isPending && <IndeterminateBar />}
              {likedResult && <ResultCard result={likedResult} onDismiss={() => setLikedResult(null)} />}
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
                {playlists.data?.map((p) => {
                  const isImporting = importingId === p.id && plMut.isPending;
                  const result = playlistResults[p.id];
                  return (
                    <li key={p.id} className="rounded-2xl bg-white/[0.02] p-2.5">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/5">
                          {p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate text-sm">{p.name}</p>
                          <p className="truncate text-xs text-white/40">
                            {isImporting ? "Importing…" : `${p.trackCount} tracks · ${p.owner}`}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setImportingId(p.id);
                            plMut.mutate({ id: p.id, name: p.name, cover: p.image });
                          }}
                          disabled={plMut.isPending}
                          className="rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-50"
                        >
                          {isImporting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : result ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            "Import"
                          )}
                        </button>
                      </div>
                      {isImporting && <IndeterminateBar />}
                      {result && (
                        <ResultCard
                          result={result}
                          onDismiss={() =>
                            setPlaylistResults((prev) => {
                              const next = { ...prev };
                              delete next[p.id];
                              return next;
                            })
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        <p className="mt-6 px-1 text-[11px] leading-relaxed text-white/40">
          Spotify is used to read your library and metadata. Playback is handled by VibeTune's own player — imported tracks
          are matched to a playable version automatically.
        </p>
      </div>

      {/* Disconnect confirmation */}
      {confirmDisconnect && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-5 backdrop-blur-sm"
          onClick={() => !disconnectMut.isPending && setConfirmDisconnect(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-400">
                <Unlink className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold">Disconnect Spotify?</h2>
                <p className="mt-1 text-sm text-white/60">
                  We'll remove your saved Spotify tokens. You'll need to reconnect to import
                  playlists or enrich search results with Spotify metadata. Your already-imported
                  tracks stay in your library.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmDisconnect(false)}
                disabled={disconnectMut.isPending}
                className="flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/15 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => disconnectMut.mutate()}
                disabled={disconnectMut.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500/90 disabled:opacity-70"
              >
                {disconnectMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
