import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { spotifyExchangeCode, spotifyAutoSync, spotifyGetAuthUrl } from "@/lib/spotify.functions";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { setSyncStatus } from "@/hooks/use-sync-status";
import {
  getSpotifyCallbackParams,
  getSpotifyCallbackRelayTarget,
  getSpotifyRedirectUri,
  getSpotifyReturnUri,
  getSpotifyReturnUriFromState,
  getSpotifySettingsRestartTarget,
  SPOTIFY_REGISTERED_REDIRECT_URI,
} from "@/lib/spotifyRedirect";

const CALLBACK_TIMEOUT_MS = 20_000;
const CALLBACK_AUTO_RETRY_KEY = "spotify_callback_auto_retry_count";

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
  if (m.includes("redirect_uri") || m.includes("redirect uri") || m.includes("invalid redirect")) {
    return {
      code: "redirect_uri_mismatch",
      message: "Spotify rejected the callback URL.",
      hint: `Add this exact Redirect URI in your Spotify app settings, then retry: ${SPOTIFY_REGISTERED_REDIRECT_URI}`,
    };
  }
  if (m.includes("state mismatch")) return { code: "state_mismatch", message: "Security check failed (state mismatch).", hint: "This usually happens if the tab was reopened. Retry from Spotify settings." };
  if (m.includes("missing authorization code")) return { code: "missing_code", message: "Spotify did not include an authorization code.", hint: "Retry from Spotify settings. If it repeats, cancel any old Spotify authorization tabs and start a fresh connect." };
  if (m.includes("missing state")) return { code: "missing_state", message: "Spotify did not include the security state.", hint: "Retry from Spotify settings. If it repeats, open the connect link in the same browser where you're signed in." };
  if (m.includes("missing callback")) return { code: "missing_params", message: "Spotify returned without the required login details.", hint: "Retry from Spotify settings — the app will start a fresh secure connect flow." };
  if (m.includes("timed out") || m.includes("timeout")) return { code: "timeout", message: raw, hint: "Spotify or the network is slow. Check your connection and retry." };
  if (m.includes("invalid_grant")) return { code: "invalid_grant", message: "Authorization code expired or already used.", hint: "Retry the connect flow — codes are single-use." };
  if (m.includes("network") || m.includes("failed to fetch")) return { code: "network", message: "Network error while contacting Spotify.", hint: "Check your connection and retry." };
  if (m.includes("development mode") || (m.includes("/me") && m.includes("403"))) {
    return {
      code: "spotify_dev_mode",
      message: "Spotify blocked this account (403 on /me).",
      hint: "Your Spotify app is in Development Mode. Open the Spotify Developer Dashboard → your app → Users and Access, and add the exact email of the Spotify account you're signing in with. Then retry.",
    };
  }
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
  const getAuthUrl = useServerFn(spotifyGetAuthUrl);
  const [status, setStatus] = useState<"working" | "syncing" | "done" | "error">("working");
  const [msg, setMsg] = useState<string>("Linking your Spotify account…");
  const [hint, setHint] = useState<string>("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const readStoredReturnUri = () =>
        localStorage.getItem("spotify_return_uri") ?? sessionStorage.getItem("spotify_return_uri");

      const persistOAuthState = (state: string, redirectUri: string, returnUri: string) => {
        localStorage.setItem("spotify_state", state);
        localStorage.setItem("spotify_redirect_uri", redirectUri);
        localStorage.setItem("spotify_return_uri", returnUri);
        sessionStorage.setItem("spotify_state", state);
        sessionStorage.setItem("spotify_redirect_uri", redirectUri);
        sessionStorage.setItem("spotify_return_uri", returnUri);
      };

      const restartViaSettings = (returnUri?: string | null) => {
        sessionStorage.setItem("post_login_action", "connect_spotify");
        const target = getSpotifySettingsRestartTarget(returnUri) ?? "/settings/spotify?connect_spotify=1";
        window.location.replace(target);
      };

      const restartConnectFlow = async (reason: string, state?: string | null) => {
        const rawAttempts = sessionStorage.getItem(CALLBACK_AUTO_RETRY_KEY);
        const attempts = Number.parseInt(rawAttempts ?? "0", 10);
        const nextAttempts = (Number.isFinite(attempts) ? attempts : 0) + 1;

        sessionStorage.setItem(CALLBACK_AUTO_RETRY_KEY, String(nextAttempts));
        sessionStorage.setItem("post_login_action", "connect_spotify");
        sessionStorage.removeItem("spotify_last_error");
        setStatus("working");
        setMsg("Restarting Spotify connect…");
        setHint("");
        setSyncStatus({ phase: "connecting", source: "spotify", message: "Restarting Spotify connect…", progress: 0.05 });
        console.warn("[oauth-debug][spotify-callback] restarting incomplete callback", { reason });

        const returnUri = getSpotifyReturnUriFromState(state) ?? readStoredReturnUri() ?? getSpotifyReturnUri();
        if (nextAttempts > 3) {
          restartViaSettings(returnUri);
          return true;
        }

        try {
          const { data: sess } = await supabase.auth.getSession();
          if (!sess.session) {
            // No Supabase session — can't call the auth-required server fn.
            restartViaSettings(returnUri);
            return true;
          }
          const redirectUri = getSpotifyRedirectUri();
          const { url, state: freshState } = await getAuthUrl({ data: { redirectUri, returnTo: returnUri } });
          persistOAuthState(freshState, redirectUri, returnUri);
          window.location.replace(url);
        } catch (restartError) {
          console.warn("[oauth-debug][spotify-callback] direct restart failed; sending to settings", {
            message: restartError instanceof Error ? restartError.message : String(restartError),
          });
          restartViaSettings(returnUri);
        }
        return true;
      };

      try {
        const relayTarget = getSpotifyCallbackRelayTarget();
        if (relayTarget) {
          setMsg("Returning to the app…");
          window.location.replace(relayTarget);
          return;
        }

        setSyncStatus({ phase: "connecting", source: "spotify", message: "Linking your Spotify account…", progress: 0.1 });
        const params = getSpotifyCallbackParams();
        const code = params.get("code");
        const state = params.get("state");
        const err = params.get("error");
        const errDesc = params.get("error_description");
        // If the callback URL has no OAuth params at all, the user probably
        // opened /spotify/callback directly (or a stale tab). Send them back
        // to settings to restart cleanly instead of showing a scary error.
        if (!code && !state && !err) {
          await restartConnectFlow("empty-callback", state);
          return;
        }
        // Prefer localStorage (shared across tabs); fall back to sessionStorage
        // for legacy flows still open in the same tab.
        const savedState =
          localStorage.getItem("spotify_state") ?? sessionStorage.getItem("spotify_state");
        const savedRedirect =
          localStorage.getItem("spotify_redirect_uri") ??
          sessionStorage.getItem("spotify_redirect_uri");
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
        if (!code && !state) {
          await restartConnectFlow("missing-code-and-state", state);
          return;
        }
        if (!code) {
          await restartConnectFlow("missing-code", state);
          return;
        }
        if (!state) {
          await restartConnectFlow("missing-state", state);
          return;
        }
        // NOTE: We intentionally do NOT hard-fail on client-side state mismatch.
        // localStorage is per-origin and per-browser; a tab reopened in a fresh
        // browser (or a different origin) will legitimately lack the saved
        // state. The real security check happens server-side in
        // spotifyExchangeCode, which verifies `state` starts with the
        // authenticated user's id. We just log the mismatch for debugging.
        if (savedState && state !== savedState) {
          console.warn("[oauth-debug][spotify-callback] client state mismatch (allowed; server validates)", {
            statePrefix: state.slice(0, 12),
            savedStatePrefix: savedState.slice(0, 12),
          });
        }
        // Fall back to the stable registered redirect URI when localStorage
        // doesn't have the value from the connect click (different tab/browser).
        const redirectUri = savedRedirect ?? SPOTIFY_REGISTERED_REDIRECT_URI;

        const res = await withTimeout(exchange({ data: { code, state, redirectUri } }), CALLBACK_TIMEOUT_MS, "Spotify token exchange");
        sessionStorage.removeItem(CALLBACK_AUTO_RETRY_KEY);
        localStorage.removeItem("spotify_state");
        localStorage.removeItem("spotify_redirect_uri");
        localStorage.removeItem("spotify_return_uri");
        sessionStorage.removeItem("spotify_state");
        sessionStorage.removeItem("spotify_redirect_uri");
        sessionStorage.removeItem("spotify_return_uri");

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
        const raw = e instanceof Error ? e.message : "Failed to connect Spotify";
        const info = classifyError(raw);
        if (info.code === "missing_params" || info.code === "missing_code" || info.code === "missing_state") {
          await restartConnectFlow(info.code);
          return;
        }
        setStatus("error");
        setMsg(info.message);
        setHint(info.hint);
        setSyncStatus({ phase: "error", source: "spotify", message: info.message });
        try {
          sessionStorage.setItem(
            "spotify_last_error",
            JSON.stringify({ at: Date.now(), code: info.code, message: info.message, hint: info.hint, raw }),
          );
        } catch { /* ignore */ }
      }
    })();
  }, [exchange, autoSync, getAuthUrl, navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-black px-6 text-white">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {(status === "working" || status === "syncing") && <Loader2 className="h-8 w-8 animate-spin text-white/70" />}
        {status === "done" && <CheckCircle2 className="h-10 w-10 text-emerald-400" />}
        {status === "error" && <XCircle className="h-10 w-10 text-red-400" />}
        <p className="text-sm text-white/80">{msg}</p>
        {status === "error" && hint && (
          <p className="text-xs text-white/50">{hint}</p>
        )}
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

