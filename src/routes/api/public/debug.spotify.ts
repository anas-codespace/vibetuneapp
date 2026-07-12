import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/debug/spotify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q") ?? "arijit singh tum hi ho";
        const out: Record<string, unknown> = {};
        try {
          const id = process.env.SPOTIFY_CLIENT_ID;
          const secret = process.env.SPOTIFY_CLIENT_SECRET;
          out.hasId = !!id;
          out.hasSecret = !!secret;
          out.idPrefix = id ? id.slice(0, 6) + "…" : null;
          const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
            },
            body: "grant_type=client_credentials",
          });
          out.tokenStatus = tokenRes.status;
          const tokenJson: unknown = await tokenRes.json().catch(() => ({}));
          if (!tokenRes.ok) {
            out.tokenError = tokenJson;
          } else {
            const token = (tokenJson as { access_token: string }).access_token;
            out.tokenLen = token?.length ?? 0;
            const sUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`;
            const sRes = await fetch(sUrl, { headers: { Authorization: `Bearer ${token}` } });
            out.searchStatus = sRes.status;
            const sText = await sRes.text();
            out.searchBody = sText.slice(0, 500);
            let sJson: { tracks?: { items?: Array<{ name: string; artists: Array<{ name: string }> }> } } = {};
            try { sJson = JSON.parse(sText); } catch { /* noop */ }
            out.trackCount = sJson.tracks?.items?.length ?? 0;
            out.tracks = (sJson.tracks?.items ?? []).map((t) => ({
              name: t.name,
              artists: t.artists.map((a) => a.name),
            }));
          }
        } catch (e) {
          out.exception = e instanceof Error ? e.message : String(e);
        }
        return new Response(JSON.stringify(out, null, 2), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
