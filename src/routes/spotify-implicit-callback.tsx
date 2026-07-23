import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  SPOTIFY_TOKEN_KEY,
  SPOTIFY_TOKEN_EXPIRES_KEY,
} from "@/lib/spotifyAuth";

export const Route = createFileRoute("/spotify-implicit-callback")({
  head: () => ({ meta: [{ title: "Connecting Spotify · Vibetune" }] }),
  component: SpotifyCallback,
});

function SpotifyCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;

    if (!hash || !hash.includes("access_token=")) {
      // Spotify puts errors in the query string (not the hash).
      const qs = new URLSearchParams(window.location.search);
      setError(qs.get("error") ?? "No token returned from Spotify.");
      return;
    }

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const expiresIn = Number(params.get("expires_in") ?? "3600");

    if (!accessToken) {
      setError("Missing access_token in Spotify response.");
      return;
    }

    window.localStorage.setItem(SPOTIFY_TOKEN_KEY, accessToken);
    window.localStorage.setItem(
      SPOTIFY_TOKEN_EXPIRES_KEY,
      String(Date.now() + expiresIn * 1000),
    );
    window.location.hash = "";
    navigate({ to: "/spotify-dashboard", replace: true });
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-black px-6 text-white">
      {error ? (
        <div className="max-w-sm rounded-2xl border border-red-400/25 bg-red-500/[0.07] p-5 text-center">
          <p className="text-sm font-semibold text-red-200">Spotify connection failed</p>
          <p className="mt-2 text-xs text-red-100/80">{error}</p>
          <button
            onClick={() => navigate({ to: "/spotify-dashboard" })}
            className="mt-4 rounded-full bg-white/10 px-4 py-1.5 text-xs hover:bg-white/15"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-white/70">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Finishing Spotify sign-in…</p>
        </div>
      )}
    </main>
  );
}
