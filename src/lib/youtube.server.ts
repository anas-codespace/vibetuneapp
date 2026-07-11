// Server-only YouTube Data API v3 helpers.
// Strict filters: regionCode=IN, videoCategoryId=10 (Music), embeddable only.

const YT_BASE = "https://www.googleapis.com/youtube/v3";
const CACHE_VERSION = "fallback-v2";
const SEARCH_CACHE = new Map<string, YTTrack[]>();

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

/** Titles/keywords we down-rank (status/8d/etc.). */
const DOWNRANK_RE = /whatsapp\s*status|status\s*video|8d\s*audio|slowed|reverb|nightcore/i;

/** Hard-block: non-song promotional content. */
const FORBIDDEN_KEYWORDS_RE =
  /trailer|teaser|promo|glimpse|making\s*of|sneak\s*peek|interview|announcement|first\s*look|behind\s*the\s*scenes|bts\s*video/i;

/** Positive song identifiers → +15 score. */
const SONG_KEYWORDS_RE =
  /\blyric(?:s|al)?\b|\baudio\b|full\s*video\s*song|video\s*song|full\s*song|official\s*song/i;

/** Extra negatives appended to the user query to natively exclude junk. */
const QUERY_NEGATIVES =
  "-trailer -teaser -promo -glimpse -making -shorts -jukebox -mashup -8d -cover -status -reaction -interview -announcement";

const FALLBACK_TRACKS: YTTrack[] = [
  {
    youtubeId: "YR12Z8f1Dh8",
    title: "Why This Kolaveri Di (Official Video)",
    artist: "Anirudh Ravichander",
    thumbnailUrl: "https://i.ytimg.com/vi/YR12Z8f1Dh8/hqdefault.jpg",
    durationSeconds: 249,
    isEmbeddable: true,
  },
  {
    youtubeId: "KUN5Uf9mObQ",
    title: "Arabic Kuthu - Video Song",
    artist: "Anirudh Ravichander",
    thumbnailUrl: "https://i.ytimg.com/vi/KUN5Uf9mObQ/hqdefault.jpg",
    durationSeconds: 282,
    isEmbeddable: true,
  },
  {
    youtubeId: "fRD_3vJagxk",
    title: "Vaathi Coming - Video Song",
    artist: "Anirudh Ravichander",
    thumbnailUrl: "https://i.ytimg.com/vi/fRD_3vJagxk/hqdefault.jpg",
    durationSeconds: 229,
    isEmbeddable: true,
  },
  {
    youtubeId: "Umqb9KENgmk",
    title: "Tum Hi Ho - Aashiqui 2",
    artist: "Arijit Singh",
    thumbnailUrl: "https://i.ytimg.com/vi/Umqb9KENgmk/hqdefault.jpg",
    durationSeconds: 262,
    isEmbeddable: true,
  },
  {
    youtubeId: "4NRXx6U8ABQ",
    title: "The Weeknd - Blinding Lights (Official Video)",
    artist: "The Weeknd",
    thumbnailUrl: "https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg",
    durationSeconds: 262,
    isEmbeddable: true,
  },
  {
    youtubeId: "JGwWNGJdvx8",
    title: "Ed Sheeran - Shape of You (Official Music Video)",
    artist: "Ed Sheeran",
    thumbnailUrl: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg",
    durationSeconds: 264,
    isEmbeddable: true,
  },
  {
    youtubeId: "UqyT8IEBkvY",
    title: "Bruno Mars - 24K Magic (Official Music Video)",
    artist: "Bruno Mars",
    thumbnailUrl: "https://i.ytimg.com/vi/UqyT8IEBkvY/hqdefault.jpg",
    durationSeconds: 226,
    isEmbeddable: true,
  },
  {
    youtubeId: "DyDfgMOUjCI",
    title: "Billie Eilish - bad guy (Official Music Video)",
    artist: "Billie Eilish",
    thumbnailUrl: "https://i.ytimg.com/vi/DyDfgMOUjCI/hqdefault.jpg",
    durationSeconds: 206,
    isEmbeddable: true,
  },
  {
    youtubeId: "TUVcZfQe-Kw",
    title: "Dua Lipa - Levitating Featuring DaBaby (Official Music Video)",
    artist: "Dua Lipa",
    thumbnailUrl: "https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg",
    durationSeconds: 230,
    isEmbeddable: true,
  },
  {
    youtubeId: "b1kbLwvqugk",
    title: "Taylor Swift - Anti-Hero (Official Music Video)",
    artist: "Taylor Swift",
    thumbnailUrl: "https://i.ytimg.com/vi/b1kbLwvqugk/hqdefault.jpg",
    durationSeconds: 309,
    isEmbeddable: true,
  },
  {
    youtubeId: "xpVfcZ0ZcFM",
    title: "Drake - God's Plan (Official Music Video)",
    artist: "Drake",
    thumbnailUrl: "https://i.ytimg.com/vi/xpVfcZ0ZcFM/hqdefault.jpg",
    durationSeconds: 357,
    isEmbeddable: true,
  },
  {
    youtubeId: "gdZLi9oWNZg",
    title: "BTS - Dynamite (Official MV)",
    artist: "BTS",
    thumbnailUrl: "https://i.ytimg.com/vi/gdZLi9oWNZg/hqdefault.jpg",
    durationSeconds: 224,
    isEmbeddable: true,
  },
  {
    youtubeId: "IHNzOHi8sJs",
    title: "BLACKPINK - DDU-DU DDU-DU M/V",
    artist: "BLACKPINK",
    thumbnailUrl: "https://i.ytimg.com/vi/IHNzOHi8sJs/hqdefault.jpg",
    durationSeconds: 215,
    isEmbeddable: true,
  },
  {
    youtubeId: "Cr8K88UcO0s",
    title: "Bad Bunny - Tití Me Preguntó (Official Video)",
    artist: "Bad Bunny",
    thumbnailUrl: "https://i.ytimg.com/vi/Cr8K88UcO0s/hqdefault.jpg",
    durationSeconds: 243,
    isEmbeddable: true,
  },
];

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
  if (SONG_KEYWORDS_RE.test(title)) score += 15; // explicit song identifiers
  if (DOWNRANK_RE.test(title)) score -= 10;

  return score;
}

function fallbackSearch(query: string, maxResults: number): YTTrack[] {
  const terms = query
    .toLowerCase()
    .replace(/official|audio|video|song|music/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);

  const scored = FALLBACK_TRACKS.map((track, position) => {
    const haystack = `${track.title} ${track.artist}`.toLowerCase();
    const matches = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
    const officialBoost = /official|vevo/i.test(`${track.title} ${track.artist}`) ? 10 : 0;
    return { track, score: matches * 25 + officialBoost - position };
  });

  return scored
    .filter((item) => terms.length === 0 || item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track)
    .slice(0, maxResults);
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
  const cacheKey = `${CACHE_VERSION}::${query.trim().toLowerCase()}::${maxResults}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached) return cached;

  const q = `${query} ${QUERY_NEGATIVES}`.trim();
  const searchUrl =
    `${YT_BASE}/search?part=id&type=video` +
    `&videoCategoryId=10&regionCode=IN&videoEmbeddable=true` +
    `&maxResults=30&q=${encodeURIComponent(q)}&key=${key()}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    const fallback = fallbackSearch(query, maxResults);
    if (fallback.length > 0) SEARCH_CACHE.set(cacheKey, fallback);
    return fallback;
  }
  const searchData = (await searchRes.json()) as {
    items: Array<{ id: { videoId?: string } }>;
  };
  const ids = searchData.items.map((i) => i.id.videoId).filter((v): v is string => !!v);
  if (ids.length === 0) {
    const fallback = fallbackSearch(query, maxResults);
    if (fallback.length > 0) SEARCH_CACHE.set(cacheKey, fallback);
    return fallback;
  }

  const items = await fetchVideoDetails(ids);

  // Strict duration + embeddable filter (no Shorts, no jukebox/full albums).
  const filtered = items
    .map((v) => ({ v, seconds: isoDurationToSeconds(v.contentDetails.duration) }))
    .filter(({ v, seconds }) => v.status.embeddable && seconds >= 60 && seconds <= 600);

  // Score & sort: official channels/titles first.
  filtered.sort((a, b) => scoreVideo(b.v) - scoreVideo(a.v));

  const tracks = filtered.slice(0, maxResults).map(({ v, seconds }) => ({
    youtubeId: v.id,
    title: v.snippet.title,
    artist: v.snippet.channelTitle.replace(/ *-? *Topic$/i, ""),
    thumbnailUrl:
      v.snippet.thumbnails.high?.url ?? v.snippet.thumbnails.default?.url ?? "",
    durationSeconds: seconds,
    isEmbeddable: v.status.embeddable,
  }));

  const result = tracks.length > 0 ? tracks : fallbackSearch(query, maxResults);
  if (result.length > 0) SEARCH_CACHE.set(cacheKey, result);
  return result;
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
