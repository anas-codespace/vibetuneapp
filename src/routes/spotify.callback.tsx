import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { spotifyExchangeCode, spotifyAutoSync } from "@/lib/spotify.functions";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { setSyncStatus } from "@/hooks/use-sync-status";

export const Route = createFileRoute("/spotify/callback")({
  head: () => ({ meta: [{ title: "Connecting Spotify" }] }),
  component: SpotifyCallback,
});

function SpotifyCallback() {
  const navigate = useNavigate();
  const exchange = useServerFn(spotifyExchangeCode);
  const autoSync = useServerFn(spotifyAutoSync);
  const [status, setStatus] = useState<"working" | "syncing" | "done" | "error">("working");
  const [msg, setMsg] = useState<string>("Linking your Spotify account…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        setSyncStatus({ phase: "connecting", source: "spotify", message: "Linking your Spotify account…", progress: 0.1 });
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        const err = params.get("error");
        const savedState = sessionStorage.getItem("spotify_state");
        const savedRedirect = sessionStorage.getItem("spotify_redirect_uri");
        if (err) throw new Error(err);
        if (!code || !state || !savedState || !savedRedirect) throw new Error("Missing callback parameters");
        if (state !== savedState) throw new Error("State mismatch");

        const res = await exchange({ data: { code, state, redirectUri: savedRedirect } });
        sessionStorage.removeItem("spotify_state");
        sessionStorage.removeItem("spotify_redirect_uri");

        setStatus("syncing");
        const who = res.displayName ?? "Spotify user";
        setMsg(`Connected as ${who} — syncing your library…`);
        setSyncStatus({
          phase: "syncing",
          source: "spotify",
          message: `Connected as ${who} — syncing liked songs & playlists…`,
          progress: 0.4,
        });
        try {
          const result = await autoSync({});
          const totals = {
            likedAdded: result.likedAdded,
            likedSkipped: result.likedSkipped,
            playlistsCreated: result.playlistsCreated,
            playlistsSkipped: result.playlistsSkipped,
            tracksAdded: result.tracksAdded,
          };
          const anySkipped = (result.likedSkipped ?? 0) + (result.playlistsSkipped ?? 0) > 0;
          const summary = `Synced ${result.likedAdded} liked · ${result.playlistsCreated} playlist${result.playlistsCreated === 1 ? "" : "s"} · ${result.tracksAdded} tracks`;
          setMsg(summary);
          setSyncStatus({
            phase: anySkipped ? "partial" : "done",
            source: "spotify",
            message: anySkipped
              ? `${summary} — some tracks couldn't be resolved on YouTube.`
              : summary,
            progress: 1,
            totals,
          });
        } catch (syncErr) {
          setMsg("Connected. Library sync will finish in the background.");
          setSyncStatus({
            phase: "error",
            source: "spotify",
            message:
              syncErr instanceof Error
                ? `Sync failed: ${syncErr.message}`
                : "Sync failed. You can retry from Spotify settings.",
          });
        }
        setStatus("done");
        setTimeout(() => navigate({ to: "/library" }), 1200);
      } catch (e) {
        setStatus("error");
        const message = e instanceof Error ? e.message : "Failed to connect Spotify";
        setMsg(message);
        setSyncStatus({ phase: "error", source: "spotify", message });
      }
    })();
  }, [exchange, autoSync, navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-black px-6 text-white">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {(status === "working" || status === "syncing") && <Loader2 className="h-8 w-8 animate-spin text-white/70" />}
        {status === "done" && <CheckCircle2 className="h-10 w-10 text-emerald-400" />}
        {status === "error" && <XCircle className="h-10 w-10 text-red-400" />}
        <p className="text-sm text-white/80">{msg}</p>
        {status === "error" && (
          <button
            onClick={() => navigate({ to: "/settings/spotify" })}
            className="mt-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/15"
          >
            Back to Spotify settings
          </button>
        )}
      </div>
    </main>
  );
}
