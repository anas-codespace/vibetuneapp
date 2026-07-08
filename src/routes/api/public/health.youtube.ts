import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/health/youtube
// Lightweight probe: confirms YOUTUBE_API_KEY is set and the YouTube Data API is reachable
// with that key. Returns JSON only — never echoes the key value.
export const Route = createFileRoute("/api/public/health/youtube")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const key = process.env.YOUTUBE_API_KEY;

        if (!key) {
          return Response.json(
            {
              ok: false,
              stage: "config",
              keyPresent: false,
              message: "YOUTUBE_API_KEY is not configured on the server.",
            },
            { status: 500 },
          );
        }

        // Cheapest valid call: search.list with maxResults=1
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.searchParams.set("part", "snippet");
        url.searchParams.set("q", "test");
        url.searchParams.set("type", "video");
        url.searchParams.set("maxResults", "1");
        url.searchParams.set("key", key);

        try {
          const res = await fetch(url.toString(), {
            signal: AbortSignal.timeout(5000),
          });
          const latencyMs = Date.now() - started;

          if (!res.ok) {
            let providerError: unknown = null;
            try {
              const body = (await res.json()) as { error?: { message?: string; errors?: unknown } };
              providerError = body.error ?? body;
            } catch {
              providerError = await res.text().catch(() => null);
            }
            return Response.json(
              {
                ok: false,
                stage: "api",
                keyPresent: true,
                httpStatus: res.status,
                latencyMs,
                message:
                  res.status === 400 || res.status === 403
                    ? "YouTube API rejected the key. Check that the key is valid, unrestricted for your usage, and that the YouTube Data API v3 is enabled."
                    : "YouTube API returned an error.",
                providerError,
              },
              { status: 502 },
            );
          }

          const body = (await res.json()) as { pageInfo?: { totalResults?: number } };
          return Response.json({
            ok: true,
            stage: "ok",
            keyPresent: true,
            httpStatus: 200,
            latencyMs,
            totalResults: body.pageInfo?.totalResults ?? null,
            message: "YouTube Data API v3 reachable with the configured key.",
          });
        } catch (err) {
          return Response.json(
            {
              ok: false,
              stage: "network",
              keyPresent: true,
              latencyMs: Date.now() - started,
              message: "Network error contacting YouTube API.",
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 504 },
          );
        }
      },
    },
  },
});
