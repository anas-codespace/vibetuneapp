import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Resolve a CLEAN album cover for a given artist + track title via Deezer.
 * We deliberately do NOT return YouTube thumbnails here — those carry
 * baked-in text/view-count/branding overlays and are unfit for UI artwork.
 *
 * Query params:
 *   - artist  (required)
 *   - title   (required)
 *
 * Response: { image: string | null }
 */
export const Route = createFileRoute("/api/public/track-cover")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const { searchParams } = new URL(request.url);
        const artist = (searchParams.get("artist") ?? "").trim();
        const title = (searchParams.get("title") ?? "").trim();
        if (!artist && !title) {
          return new Response(JSON.stringify({ image: null }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        try {
          // Deezer advanced query: strictly scope by artist + track when both
          // are known, otherwise degrade gracefully. This is what prevents the
          // "loose match / random cover" class of bugs.
          const parts: string[] = [];
          if (artist) parts.push(`artist:"${artist.replace(/"/g, "")}"`);
          if (title) parts.push(`track:"${title.replace(/"/g, "")}"`);
          const q = parts.join(" ");
          const url = `https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=5&strict=on`;
          const res = await fetch(url);
          const data = (await res.json()) as {
            data?: Array<{
              title?: string;
              artist?: { name?: string };
              album?: { cover_xl?: string; cover_big?: string; cover_medium?: string };
            }>;
          };
          const items = data.data ?? [];

          // Tight relevance check: normalized artist token must overlap and
          // normalized title token must overlap. This blocks Deezer from
          // returning a totally unrelated cover for typo/near-miss queries.
          const norm = (s: string) =>
            s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
          const nArtist = norm(artist);
          const nTitle = norm(title);
          const chosen = items.find((it) => {
            const a = norm(it.artist?.name ?? "");
            const t = norm(it.title ?? "");
            const artistOk = !nArtist || a.includes(nArtist) || nArtist.includes(a);
            const titleOk = !nTitle || t.includes(nTitle) || nTitle.includes(t);
            return artistOk && titleOk;
          });

          const img =
            chosen?.album?.cover_xl ||
            chosen?.album?.cover_big ||
            chosen?.album?.cover_medium ||
            null;

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
