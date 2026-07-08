import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchLyrics } from "./lyrics.server";

export const getLyrics = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      title: z.string().min(1).max(300),
      artist: z.string().min(1).max(200),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    return fetchLyrics(data.title, data.artist);
  });
