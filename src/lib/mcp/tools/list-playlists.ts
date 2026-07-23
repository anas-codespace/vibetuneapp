import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_playlists",
  title: "List playlists",
  description: "List the signed-in user's Vibtune playlists.",
  inputSchema: {
    includeTracks: z
      .boolean()
      .optional()
      .describe("If true, include each playlist's tracks (capped at 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ includeTracks }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: playlists, error } = await supabase
      .from("playlists")
      .select("id,name,description,cover_url,created_at,updated_at")
      .eq("user_id", ctx.getUserId())
      .order("updated_at", { ascending: false });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    let result: unknown = playlists ?? [];
    if (includeTracks && playlists && playlists.length) {
      const ids = playlists.map((p) => p.id);
      const { data: tracks } = await supabase
        .from("playlist_songs")
        .select("playlist_id,youtube_id,title,artist,thumbnail_url,created_at")
        .in("playlist_id", ids)
        .order("created_at", { ascending: true })
        .limit(100);
      const byId = new Map<string, unknown[]>();
      for (const t of tracks ?? []) {
        const arr = byId.get(t.playlist_id) ?? [];
        arr.push(t);
        byId.set(t.playlist_id, arr);
      }
      result = playlists.map((p) => ({ ...p, tracks: byId.get(p.id) ?? [] }));
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: { playlists: result },
    };
  },
});
