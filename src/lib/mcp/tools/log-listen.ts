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
  name: "log_listen",
  title: "Log a listen",
  description:
    "Record that the signed-in user listened to a track on Vibtune. Use when the assistant is playing music on behalf of the user.",
  inputSchema: {
    youtubeId: z.string().min(1).max(40).describe("YouTube video ID of the track."),
    title: z.string().min(1).max(300),
    artist: z.string().min(1).max(200),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ youtubeId, title, artist }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { error } = await supabaseForUser(ctx).from("listening_history").insert({
      user_id: ctx.getUserId(),
      youtube_id: youtubeId,
      title,
      artist,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: "Logged" }] };
  },
});
