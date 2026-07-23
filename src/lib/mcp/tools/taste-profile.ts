import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_taste_profile",
  title: "Get taste profile",
  description:
    "Return the signed-in user's Vibtune taste profile (top artists, languages, genres, discovery openness).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const [{ data: profile }, { data: taste }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name,fav_languages,fav_artists,onboarded")
        .eq("user_id", ctx.getUserId())
        .maybeSingle(),
      supabase
        .from("user_taste_profile")
        .select("genres,artists,languages,discovery_openness,recomputed_at")
        .eq("user_id", ctx.getUserId())
        .maybeSingle(),
    ]);
    const result = { profile, taste };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
