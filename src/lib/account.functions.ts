import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Remove avatar files
    try {
      const { data: files } = await supabaseAdmin.storage
        .from("avatars")
        .list(userId);
      if (files && files.length) {
        await supabaseAdmin.storage
          .from("avatars")
          .remove(files.map((f) => `${userId}/${f.name}`));
      }
    } catch {
      /* ignore */
    }

    // Cascade cleanup — delete all rows tied to this user across tables
    const userTables = [
      "playlist_songs",
      "playlists",
      "liked_songs",
      "listening_history",
      "spotify_tokens",
      "profiles",
    ] as const;
    for (const table of userTables) {
      try {
        await supabaseAdmin.from(table).delete().eq("user_id", userId);
      } catch {
        /* ignore per-table errors, continue */
      }
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
