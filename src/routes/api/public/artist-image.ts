import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/artist-image")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get("name");
        if (!name) {
          return new Response(JSON.stringify({ image: null }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        try {
          const res = await fetch(
            `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`,
          );
          const data = (await res.json()) as {
            data?: Array<{ picture_medium?: string; picture_big?: string }>;
          };
          const img =
            data.data && data.data.length > 0
              ? data.data[0].picture_big || data.data[0].picture_medium || null
              : null;
          return new Response(JSON.stringify({ image: img }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=86400",
              ...CORS,
            },
          });
        } catch {
          return new Response(JSON.stringify({ image: null }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
