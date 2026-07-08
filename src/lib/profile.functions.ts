import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const ArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  hdPhotoUrl: z.string().nullable(),
  isVerified: z.boolean(),
});

export const saveOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      languages: z.array(z.string().min(1).max(40)).min(1).max(10),
      artists: z.array(ArtistSchema).min(1).max(20),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({
        fav_languages: data.languages,
        fav_artists: data.artists,
        onboarded: true,
      })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logListen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      youtubeId: z.string().min(1).max(40),
      title: z.string().min(1).max(300),
      artist: z.string().min(1).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("listening_history").insert({
      user_id: userId,
      youtube_id: data.youtubeId,
      title: data.title,
      artist: data.artist,
    });
    return { ok: true };
  });
