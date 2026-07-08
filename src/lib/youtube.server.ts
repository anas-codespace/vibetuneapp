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

/** Convert an ISO 8601 duration (e.g. "PT3M30S", "PT1H2M") to total seconds. */
export function isoDurationToSeconds(iso: string): number {
  const m = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Regex of well-known official music labels / distributors. */
const OFFICIAL_LABEL_RE =
  /vevo|sony music|think music|t-series|aditya music|saregama|zee music|lahari music|divo|wynk|yrf|speed records|mass appeal|def jam|universal music|warner music|columbia records|republic records|atlantic records/i;

/** Titles/keywords we down-rank (lyrical/status/etc.). */
const DOWNRANK_RE = /lyrical\s*video|lyric\s*video|whatsapp\s*status|status\s*video|8d\s*audio|slowed|reverb|nightcore/i;

/** Extra negatives appended to the user query to natively exclude junk. */
const QUERY_NEGATIVES = "-shorts -jukebox -mashup -8d -cover -status -reaction";

interface RawVideoItem {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: Record<string, { url: string }>;
  };
  contentDetails: { duration: string };
  status: { embeddable: boolean };
}

/** Score a video: higher = better. Official labels & "Official" keyword win. */
function scoreVideo(v: RawVideoItem): number {
  let score = 0;
  const title = v.snippet.title;
  const channel = v.snippet.channelTitle;

  if (OFFICIAL_LABEL_RE.test(channel)) score += 20;
  if (/official/i.test(title) || /official/i.test(channel)) score += 10;
  if (/-\s*topic$/i.test(channel)) score += 5; // auto-generated artist channels
  if (DOWNRANK_RE.test(title)) score -= 10;

  return score;
}

async function fetchVideoDetails(ids: string[]): Promise<RawVideoItem[]> {
  if (ids.length === 0) return [];
  const url =
    `${YT_BASE}/videos?part=snippet,contentDetails,status` +
    `&id=${ids.join(",")}&key=${key()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { items: RawVideoItem[] };
  return data.items;
}

/**
 * Strict 2-step music search:
 *  Step 1: search endpoint (over-fetch 30) with type=video, videoCategoryId=10,
 *          and native negative-keyword filtering on the query.
 *  Step 2: videos endpoint for real contentDetails.duration + embeddability.
 * Filters: 60s <= duration <= 600s and embeddable.
 * Sort:    Official channels/titles first via scoreVideo().
 */
export async function searchMusic(query: string, maxResults = 20): Promise<YTTrack[]> {
  const q = `${query} ${QUERY_NEGATIVES}`.trim();
  const searchUrl =
    `${YT_BASE}/search?part=id&type=video` +
    `&videoCategoryId=10&regionCode=IN&videoEmbeddable=true` +
    `&maxResults=30&q=${encodeURIComponent(q)}&key=${key()}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return [];
  const searchData = (await searchRes.json()) as {
    items: Array<{ id: { videoId?: string } }>;
  };
  const ids = searchData.items.map((i) => i.id.videoId).filter((v): v is string => !!v);
  if (ids.length === 0) return [];

  const items = await fetchVideoDetails(ids);

  // Strict duration + embeddable filter (no Shorts, no jukebox/full albums).
  const filtered = items
    .map((v) => ({ v, seconds: isoDurationToSeconds(v.contentDetails.duration) }))
    .filter(({ v, seconds }) => v.status.embeddable && seconds >= 60 && seconds <= 600);

  // Score & sort: official channels/titles first.
  filtered.sort((a, b) => scoreVideo(b.v) - scoreVideo(a.v));

  return filtered.slice(0, maxResults).map(({ v, seconds }) => ({
    youtubeId: v.id,
    title: v.snippet.title,
    artist: v.snippet.channelTitle.replace(/ *-? *Topic$/i, ""),
    thumbnailUrl:
      v.snippet.thumbnails.high?.url ?? v.snippet.thumbnails.default?.url ?? "",
    durationSeconds: seconds,
    isEmbeddable: v.status.embeddable,
  }));
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
