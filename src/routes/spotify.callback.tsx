import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { spotifyExchangeCode, spotifyAutoSync } from "@/lib/spotify.functions";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { setSyncStatus } from "@/hooks/use-sync-status";

const CALLBACK_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

function classifyError(raw: string): { code: string; message: string; hint: string } {
  const m = raw.toLowerCase();
  if (m.includes("access_denied")) return { code: "access_denied", message: "You cancelled the Spotify sign-in.", hint: "Tap Retry to try connecting again." };
  if (m.includes("state mismatch")) return { code: "state_mismatch", message: "Security check failed (state mismatch).", hint: "This usually happens if the tab was reopened. Retry from Spotify settings." };
  if (m.includes("missing callback")) return { code: "missing_params", message: "The callback link was incomplete.", hint: "Start the connect flow again from Spotify settings." };
  if (m.includes("timed out") || m.includes("timeout")) return { code: "timeout", message: raw, hint: "Spotify or the network is slow. Check your connection and retry." };
  if (m.includes("invalid_grant")) return { code: "invalid_grant", message: "Authorization code expired or already used.", hint: "Retry the connect flow — codes are single-use." };
  if (m.includes("network") || m.includes("failed to fetch")) return { code: "network", message: "Network error while contacting Spotify.", hint: "Check your connection and retry." };
  return { code: "unknown", message: raw || "Failed to connect Spotify.", hint: "Retry from Spotify settings. If it keeps failing, disconnect and try again." };
}

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
        const errDesc = params.get("error_description");
        const savedState = sessionStorage.getItem("spotify_state");
        const savedRedirect = sessionStorage.getItem("spotify_redirect_uri");
        const { data: sessionData } = await supabase.auth.getSession();
        console.log("[oauth-debug][spotify-callback] received", {
          href: window.location.href,
          origin: window.location.origin,
          pathname: window.location.pathname,
          hasCode: !!code,
          codeLen: code?.length ?? 0,
          hasState: !!state,
          statePrefix: state?.slice(0, 12) ?? null,
          savedStatePrefix: savedState?.slice(0, 12) ?? null,
          stateMatches: !!state && !!savedState && state === savedState,
          savedRedirect,
          providerError: err,
          providerErrorDesc: errDesc,
          hasSupabaseSession: !!sessionData.session,
          supabaseUserIdPrefix: sessionData.session?.user.id.slice(0, 8) ?? null,
        });
        if (err) throw new Error(errDesc ? `${err}: ${errDesc}` : err);
        if (!code || !state || !savedState || !savedRedirect) throw new Error("Missing callback parameters");
        if (state !== savedState) throw new Error("State mismatch");

        const res = await withTimeout(exchange({ data: { code, state, redirectUri: savedRedirect } }), CALLBACK_TIMEOUT_MS, "Spotify token exchange");
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
        const raw = e instanceof Error ? e.message : "Failed to connect Spotify";
        const info = classifyError(raw);
        setMsg(info.message);
        setSyncStatus({ phase: "error", source: "spotify", message: info.message });
        try {
          sessionStorage.setItem(
            "spotify_last_error",
            JSON.stringify({ at: Date.now(), code: info.code, message: info.message, hint: info.hint, raw }),
          );
        } catch { /* ignore */ }
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
            className="mt-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:brightness-110"
          >
            Back to Spotify settings
          </button>
        )}
      </div>
    </main>
  );
}

