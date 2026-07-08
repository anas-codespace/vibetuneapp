// Server-only YouTube Data API v3 helpers.
// Strict filters: regionCode=IN, videoCategoryId=10 (Music), embeddable only.

const YT_BASE = "https://www.googleapis.com/youtube/v3";

function key(): string {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY not configured");
  return k;
}

export interface YTTrack {
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSeconds: number;
  isEmbeddable: boolean;
}

function isoDurationToSeconds(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  return (Number(m[1] ?? 0)) * 3600 + (Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0);
}

async function videosByIds(ids: string[]): Promise<YTTrack[]> {
  if (ids.length === 0) return [];
  const url =
    `${YT_BASE}/videos?part=snippet,contentDetails,status` +
    `&id=${ids.join(",")}&key=${key()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Array<{
    id: string;
    snippet: { title: string; channelTitle: string; thumbnails: Record<string, { url: string }> };
    contentDetails: { duration: string };
    status: { embeddable: boolean };
  }> };
  return data.items
    .filter((v) => v.status.embeddable)
    .map((v) => ({
      youtubeId: v.id,
      title: v.snippet.title,
      artist: v.snippet.channelTitle.replace(/ *-? *Topic$/i, ""),
      thumbnailUrl: v.snippet.thumbnails.high?.url ?? v.snippet.thumbnails.default?.url ?? "",
      durationSeconds: isoDurationToSeconds(v.contentDetails.duration),
      isEmbeddable: v.status.embeddable,
    }));
}

export async function searchMusic(query: string, maxResults = 20): Promise<YTTrack[]> {
  const url =
    `${YT_BASE}/search?part=id&type=video` +
    `&videoCategoryId=10&regionCode=IN&videoEmbeddable=true` +
    `&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${key()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Array<{ id: { videoId: string } }> };
  const ids = data.items.map((i) => i.id.videoId).filter(Boolean);
  return videosByIds(ids);
}

export async function relatedArtistNames(seedArtist: string, limit = 8): Promise<string[]> {
  // YouTube Search → use channel + topic to surface adjacent artists.
  const url =
    `${YT_BASE}/search?part=snippet&type=video&videoCategoryId=10` +
    `&regionCode=IN&maxResults=25&q=${encodeURIComponent(seedArtist + " similar artists")}&key=${key()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Array<{ snippet: { channelTitle: string } }> };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of data.items) {
    const name = item.snippet.channelTitle.replace(/ *-? *Topic$/i, "").trim();
    const lower = name.toLowerCase();
    if (!name || lower === seedArtist.toLowerCase() || seen.has(lower)) continue;
    seen.add(lower);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}
