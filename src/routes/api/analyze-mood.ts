// PHASE 5 BLUEPRINT — Librosa mood-analysis bridge.
// Posts the YouTube audio preview URL to an external Python/Librosa
// microservice, receives mood tags, and updates the Song record.
//
// Expected external endpoint contract (Python/FastAPI):
//   POST  ${LIBROSA_ENDPOINT_URL}/analyze
//   Body  { audioUrl: string, youtubeId: string }
//   Auth  Authorization: Bearer ${LIBROSA_API_KEY}
//   200   { tag: "Vera Level" | "Kadaisi Bench" | "Summa Chill",
//           confidence: number, features: { tempo, energy, valence } }

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RequestSchema = z.object({
  youtubeId: z.string().min(1).max(40),
  audioPreviewUrl: z.string().url(),
});

const ALLOWED_TAGS = ["Vera Level", "Kadaisi Bench", "Summa Chill"] as const;
type MoodTag = (typeof ALLOWED_TAGS)[number];

const ResponseSchema = z.object({
  tag: z.enum(ALLOWED_TAGS),
  confidence: z.number().min(0).max(1),
  features: z.object({
    tempo: z.number(),
    energy: z.number(),
    valence: z.number(),
  }).partial(),
});

export const Route = createFileRoute("/api/analyze-mood")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Validate input
        let body: unknown;
        try { body = await request.json(); }
        catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        const parsed = RequestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
        }

        const endpoint = process.env.LIBROSA_ENDPOINT_URL;
        const apiKey = process.env.LIBROSA_API_KEY;

        let tag: MoodTag;
        let confidence = 0;

        if (!endpoint || !apiKey) {
          // Blueprint mode — deterministic placeholder so the UI can flow
          // end-to-end before the Python microservice is wired up.
          const hash = [...parsed.data.youtubeId].reduce((s, c) => s + c.charCodeAt(0), 0);
          tag = ALLOWED_TAGS[hash % ALLOWED_TAGS.length];
          confidence = 0.5;
        } else {
          const res = await fetch(`${endpoint.replace(/\/$/, "")}/analyze`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              audioUrl: parsed.data.audioPreviewUrl,
              youtubeId: parsed.data.youtubeId,
            }),
          });
          if (!res.ok) {
            return Response.json(
              { error: `Librosa service ${res.status}` },
              { status: 502 },
            );
          }
          const raw = await res.json();
          const safe = ResponseSchema.safeParse(raw);
          if (!safe.success) {
            return Response.json({ error: "Unexpected mood response" }, { status: 502 });
          }
          tag = safe.data.tag;
          confidence = safe.data.confidence;
        }

        // Update the Song record (admin-elevated; song rows are catalog-wide).
        const { error } = await supabaseAdmin
          .from("songs")
          .update({ mood_tag: tag })
          .eq("youtube_id", parsed.data.youtubeId);
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({ youtubeId: parsed.data.youtubeId, tag, confidence });
      },
    },
  },
});
