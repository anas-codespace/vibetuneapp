// Keyless fallback music search.
//
// When the YouTube Data API v3 quota is exhausted (429 / quotaExceeded) the
// whole app used to go dark with "Music services are busy right now".
// This module talks to the public YouTube Music (`youtubei`) search endpoint,
// which does NOT consume our Data API quota, and maps the response into the
// same `YTTrack` shape the rest of the app already understands.
//
// It is intentionally best-effort: any parsing/network failure returns [].

export interface YTMusicTrack {
  youtubeId: string;
  title: string;
  artist: string;
  album: string;
  thumbnailUrl: string;
  durationSeconds: number;
  isEmbeddable: boolean;
}

const YTM_ENDPOINT =
  "https://music.youtube.com/youtubei/v1/search?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30&prettyPrint=false";
// "Songs" filter params — restricts results to real songs (no videos/playlists).
const SONGS_FILTER = "EgWKAQIIAWoKEAoQCRADEAQQBQ%3D%3D";

const CACHE = new Map<string, { at: number; tracks: YTMusicTrack[] }>();
const CACHE_TTL_MS = 60 * 60_000;

function parseDurationText(text: string): number {
  const parts = text.split(":").map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function collectRenderers(node: unknown, out: any[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRenderers(child, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.musicResponsiveListItemRenderer) out.push(obj.musicResponsiveListItemRenderer);
    for (const value of Object.values(obj)) collectRenderers(value, out);
  }
}

function runsOf(column: any): Array<{ text?: string }> {
  return column?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];
}

function videoIdOf(renderer: any): string | null {
  return (
    renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.videoId ??
    renderer?.playlistItemData?.videoId ??
    null
  );
}

function thumbOf(renderer: any, videoId: string): string {
  const thumbs: Array<{ url?: string }> =
    renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
  const last = thumbs[thumbs.length - 1]?.url;
  return last ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Search YouTube Music without consuming Data API quota.
 * Returns [] on any failure so callers can fall through to other strategies.
 */
export async function searchYouTubeMusicFallback(
  query: string,
  maxResults = 24,
  opts: { minSeconds?: number; maxSeconds?: number } = {},
): Promise<YTMusicTrack[]> {
  const term = query.trim();
  if (!term) return [];
  const cacheKey = `${term.toLowerCase()}::${maxResults}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.tracks;

  const minSeconds = opts.minSeconds ?? 60;
  const maxSeconds = opts.maxSeconds ?? 720;

  let json: unknown;
  try {
    const res = await fetch(YTM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: {
          client: { clientName: "WEB_REMIX", clientVersion: "1.20240101.01.00", hl: "en", gl: "IN" },
        },
        query: term,
        params: SONGS_FILTER,
      }),
    });
    if (!res.ok) {
      console.warn("[ytmusic-fallback] non-ok response", { status: res.status });
      return [];
    }
    json = await res.json();
  } catch (e) {
    console.warn("[ytmusic-fallback] request failed", e instanceof Error ? e.message : String(e));
    return [];
  }

  const renderers: any[] = [];
  try {
    collectRenderers(json, renderers);
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const tracks: YTMusicTrack[] = [];
  for (const renderer of renderers) {
    const videoId = videoIdOf(renderer);
    if (!videoId || seen.has(videoId)) continue;
    const columns = renderer?.flexColumns ?? [];
    const title = runsOf(columns[0])[0]?.text?.trim();
    if (!title) continue;

    const metaRuns = runsOf(columns[1])
      .map((r) => (r.text ?? "").trim())
      .filter((t) => t && t !== "•");
    const durationText = metaRuns.find((t) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) ?? "";
    const durationSeconds = parseDurationText(durationText);
    if (durationSeconds && (durationSeconds < minSeconds || durationSeconds > maxSeconds)) continue;

    const nonDuration = metaRuns.filter((t) => t !== durationText && !/^song$/i.test(t) && !/^\d+(\.\d+)?[MK]? plays$/i.test(t));
    const artist = nonDuration[0] ?? "Unknown artist";
    const album = nonDuration.length > 1 ? nonDuration[1] : "";

    seen.add(videoId);
    tracks.push({
      youtubeId: videoId,
      title,
      artist,
      album,
      thumbnailUrl: thumbOf(renderer, videoId),
      durationSeconds: durationSeconds || 0,
      isEmbeddable: true,
    });
    if (tracks.length >= maxResults) break;
  }

  if (tracks.length > 0) CACHE.set(cacheKey, { at: Date.now(), tracks });
  return tracks;
}
