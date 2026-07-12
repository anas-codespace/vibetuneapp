// Server-only YouTube Data API v3 helpers.
// Strict filters: regionCode=IN, videoCategoryId=10 (Music), embeddable only.

const YT_BASE = "https://www.googleapis.com/youtube/v3";
const CACHE_VERSION = "strict-v3";
const SEARCH_CACHE = new Map<string, YTTrack[]>();

function key(): string {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY not configured");
  return k;
}

/**
 * Aggressively clean a YouTube video title:
 *  - strip bracketed tags like (Official Video), [Lyric Video], {4K}
 *  - strip trailing pipe segments like " | 4K", " | Full Song"
 *  - collapse whitespace
 */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*[\(\[\{][^)\]\}]*[\)\]\}]/g, "")
    .replace(/\s*\|[^|]*$/g, "")
    .replace(/\s*-\s*(official\s*(video|audio|lyric[s]?\s*video)?|full\s*(video\s*)?song|lyric[s]?\s*video|4k|hd)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
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

/** Regex of well-known official music labels / distributors + political party channels. */
const OFFICIAL_LABEL_RE =
  /vevo|sony music|think music|t-series|aditya music|saregama|zee music|lahari music|divo|wynk|yrf|speed records|mass appeal|def jam|universal music|warner music|columbia records|republic records|atlantic records|dmk\s*official|tvk\s*official|tamilaga\s*vettri\s*kazhagam|dravida\s*munnetra\s*kazhagam|aiadmk\s*official|bjp\s*tamil\s*nadu|makkal\s*needhi\s*maiam|mnm\s*official/i;

/** Titles/keywords we down-rank. */
const DOWNRANK_RE = /whatsapp\s*status|status\s*video|8d\s*audio|slowed|reverb|nightcore/i;

/** Hard-block: non-song promo + fan-made lyric/status/mashup uploads. */
const FORBIDDEN_KEYWORDS_RE =
  /trailer|teaser|promo|glimpse|making\s*of|sneak\s*peek|interview|announcement|first\s*look|behind\s*the\s*scenes|bts\s*video|fan\s*made|fanmade|whatsapp\s*status|\bstatus\b|lyrical\s*(video|whatsapp)?|lyric\s*video|\bmashup\b|\bremix\b|\bcover\b/i;

/** Quality Gate — low-quality keywords blocked regardless of channel. */
const LOW_QUALITY_RE =
  /\bstatus\b|whatsapp|\bedit\b|\bcover\b|\bmashup\b|\bremix\b|slowed|reverb|nightcore|8d\s*audio|ringtone|fan\s*made|fanmade/i;

/** Quality Gate — high-quality keywords that signal a legitimate release. */
const HIGH_QUALITY_RE =
  /\bofficial\b|\baudio\b|full\s*video|full\s*song|video\s*song|\banthem\b|\bhd\b|\b4k\b/i;

/** Positive song identifiers → +15. */
const SONG_KEYWORDS_RE =
  /\bofficial\s*(audio|video|song|anthem)\b|\banthem\b|\bcampaign\s*song\b|\baudio\b|full\s*video\s*song|video\s*song|full\s*song/i;

/** Extra negatives appended to the user query. */
const QUERY_NEGATIVES =
  "-trailer -teaser -promo -glimpse -making -shorts -jukebox -mashup -8d -cover -status -reaction -interview -announcement -lyrical -\"fan made\" -\"lyric video\"";

/** Task 1: Keyword expansion for known political/campaign queries. */
const KEYWORD_EXPANSIONS: Record<string, string> = {
  "mk stalin": "MK Stalin DMK official campaign song anthem",
  "stalin": "MK Stalin DMK official campaign song anthem",
  "tvk": "TVK Vijay Tamilaga Vettri Kazhagam official campaign song anthem",
  "vijay tvk": "TVK Vijay official campaign song anthem",
  "dmk": "DMK official campaign song anthem",
  "aiadmk": "AIADMK official campaign song anthem",
  "mnm": "Makkal Needhi Maiam MNM Kamal Haasan official campaign song",
};

/** Detect political/campaign queries → widen category filter (anthems aren't always Music/10). */
const POLITICAL_RE = /\b(stalin|dmk|tvk|vijay|aiadmk|edappadi|mnm|makkal|kamal\s*haasan|bjp|annamalai|campaign|anthem|party\s*song)\b/i;

interface RawVideoItem {
  id: string;
  snippet: {
    title: string;
    channelId: string;
    channelTitle: string;
    thumbnails: Record<string, { url: string }>;
  };
  contentDetails: { duration: string };
  status: { embeddable: boolean };
}

/**
 * Whitelist of verified official Indian music label channel IDs.
 * Populated from env var YOUTUBE_OFFICIAL_CHANNEL_IDS (comma-separated) plus
 * a small set of high-confidence defaults. Channel-title regex
 * (OFFICIAL_LABEL_RE) remains the fallback so a channel is treated as
 * "official" if EITHER its ID is whitelisted OR its name matches a known label.
 */
const DEFAULT_OFFICIAL_IDS = [
  "UCn4rEMqKtwBQ6-oEwbd4PcA", // Sony Music South
  "UCq-Fj5jknLsUf-MWSy4_brA", // T-Series
  "UCvS8DnkYnGw7GcQ4WgnFN4g", // Saregama Music
  "UCn372MiubHTkPFwxKVv45LQ", // Lahari Music
  "UCf-PcSHzYAtfroVPGT_UYag", // Aditya Music
  "UCLXo7UDZvByw2ixzpQCufnA", // Vevo
];
function officialChannelIds(): Set<string> {
  const extra = (process.env.YOUTUBE_OFFICIAL_CHANNEL_IDS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_OFFICIAL_IDS, ...extra]);
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
export async function searchMusic(query: string, maxResults = 30): Promise<YTTrack[]> {
  const cacheKey = `${CACHE_VERSION}::${query.trim().toLowerCase()}::${maxResults}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached) return cached;

  // Task 1: Keyword expansion — map political/campaign queries to a richer query.
  const lowered = query.trim().toLowerCase();
  const expansion = KEYWORD_EXPANSIONS[lowered];
  const isPolitical = !!expansion || POLITICAL_RE.test(query);

  // Task 3: For political/campaign queries prefer "official song OR anthem"
  // (broader than "official audio", which was hiding campaign uploads).
  const base = expansion
    ? expansion
    : isPolitical
      ? `${query} official song anthem`
      : `${query} official audio`;
  const q = `${base} ${QUERY_NEGATIVES}`.trim();

  // Political anthems are often uploaded under People/Politics (25) or News (25),
  // not Music (10). Drop the category restriction for those queries.
  const categoryParam = isPolitical ? "" : "&videoCategoryId=10";

  // Task 4: over-fetch 50 so nothing important gets clipped by strict filters.
  const searchUrl =
    `${YT_BASE}/search?part=snippet&type=video` +
    `${categoryParam}&videoEmbeddable=true` +
    `&maxResults=50&q=${encodeURIComponent(q)}&key=${key()}`;

  let searchRes: Response;
  try {
    searchRes = await fetch(searchUrl);
  } catch (e) {
    console.error("[youtube] network error", e);
    return [];
  }

  if (searchRes.status === 403) {
    console.warn("[youtube] quota exceeded or forbidden");
    return [];
  }
  if (!searchRes.ok) {
    console.error("[youtube] search failed", searchRes.status, await searchRes.text().catch(() => ""));
    return [];
  }

  const searchData = (await searchRes.json()) as {
    items: Array<{ id: { videoId?: string } }>;
  };
  const ids = searchData.items.map((i) => i.id.videoId).filter((v): v is string => !!v);
  if (ids.length === 0) return [];

  const items = await fetchVideoDetails(ids);

  // Duration bounds — widen for political anthems (often 60s–10min).
  const minDur = isPolitical ? 45 : 90;
  const maxDur = isPolitical ? 600 : 480;
  const durationFiltered = items
    .map((v) => ({ v, seconds: isoDurationToSeconds(v.contentDetails.duration) }))
    .filter(({ v, seconds }) => v.status.embeddable && seconds >= minDur && seconds <= maxDur);

  // Guillotine: hard-block trailers/teasers/promos/etc by title.
  const filtered = durationFiltered.filter(
    ({ v }) => !FORBIDDEN_KEYWORDS_RE.test(v.snippet.title),
  );

  // Verified-channel priority: whitelist by channel ID OR by label-name regex.
  const officialIds = officialChannelIds();
  const isOfficialChannel = (v: RawVideoItem) =>
    officialIds.has(v.snippet.channelId) ||
    OFFICIAL_LABEL_RE.test(v.snippet.channelTitle) ||
    /vevo$/i.test(v.snippet.channelTitle) ||
    /-\s*topic$/i.test(v.snippet.channelTitle);

  filtered.sort((a, b) => scoreVideo(b.v) - scoreVideo(a.v));

  // Task 2 (strict): if any official-channel results exist, discard the rest.
  // For political queries we already broadened; keep everything so anthems
  // uploaded to party channels still appear even if not in the ID whitelist.
  const officialOnly = filtered.filter(({ v }) => isOfficialChannel(v));
  const finalPool = !isPolitical && officialOnly.length > 0 ? officialOnly : filtered;
  filtered.length = 0;
  filtered.push(...finalPool);

  // Task 3: Only expose the channel as "artist" when it's a verified/official-looking
  // channel (label, VEVO, or auto-generated "- Topic"). Generic uploader channels
  // ("Song Tracks", "DesiWave", etc.) get an empty artist so the UI can fall back
  // to the cleaned title as the primary descriptor.
  const looksLikeRealArtistChannel = (channel: string) =>
    OFFICIAL_LABEL_RE.test(channel) ||
    /vevo$/i.test(channel) ||
    /-?\s*topic$/i.test(channel) ||
    /official/i.test(channel);

  const tracks: YTTrack[] = filtered.slice(0, maxResults).map(({ v, seconds }) => {
    const rawChannel = v.snippet.channelTitle;
    const cleanChannel = rawChannel.replace(/ *-? *Topic$/i, "").trim();
    return {
      youtubeId: v.id,
      title: cleanTitle(v.snippet.title),
      artist: looksLikeRealArtistChannel(rawChannel) ? cleanChannel : "",
      thumbnailUrl:
        v.snippet.thumbnails.high?.url ?? v.snippet.thumbnails.default?.url ?? "",
      durationSeconds: seconds,
      isEmbeddable: v.status.embeddable,
    };
  });

  if (tracks.length > 0) SEARCH_CACHE.set(cacheKey, tracks);
  return tracks;
}

export async function relatedArtistNames(seedArtist: string, limit = 8): Promise<string[]> {
  const url =
    `${YT_BASE}/search?part=snippet&type=video&videoCategoryId=10` +
    `&regionCode=IN&relevanceLanguage=ta&maxResults=25&q=${encodeURIComponent(seedArtist + " similar artists")}&key=${key()}`;
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
