import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSongByYoutubeId = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("songs")
      .select("youtube_id, title, artist, thumbnail_url, duration_seconds")
      .eq("youtube_id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
