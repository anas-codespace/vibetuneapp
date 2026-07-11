import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { spotifyExchangeCode, spotifyAutoSync } from "@/lib/spotify.functions";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

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
        setMsg(`Connected as ${res.displayName ?? "Spotify user"} — syncing your library…`);
        try {
          const sync = await autoSync({});
          setMsg(
            `Synced ${sync.likedAdded} liked · ${sync.playlistsCreated} playlist${sync.playlistsCreated === 1 ? "" : "s"} · ${sync.tracksAdded} tracks`,
          );
        } catch {
          setMsg("Connected. Library sync will finish in the background.");
        }
        setStatus("done");
        setTimeout(() => navigate({ to: "/library" }), 1200);
      } catch (e) {
        setStatus("error");
        setMsg(e instanceof Error ? e.message : "Failed to connect Spotify");
      }
    })();
  }, [exchange, autoSync, navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-black px-6 text-white">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {status === "working" && <Loader2 className="h-8 w-8 animate-spin text-white/70" />}
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
