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
  album: string;
  thumbnailUrl: string;
  durationSeconds: number;
  isEmbeddable: boolean;
}

/**
 * Extract an album/movie name from a raw YouTube title.
 * Handles common patterns:
 *   - Song (From "Movie")   /  Song [From 'Album']
 *   - Song | Movie Name | Extra
 *   - Song - Movie Name Songs
 * Returns "" if nothing confident is found.
 */
export function parseAlbum(raw: string): string {
  const from = /[\(\[\{]\s*from\s*["'“”‘’]?([^"'“”‘’\)\]\}]+?)["'“”‘’]?\s*[\)\]\}]/i.exec(raw);
  if (from?.[1]) return from[1].trim();
  const pipes = raw.split("|").map((s) => s.trim()).filter(Boolean);
  if (pipes.length >= 3) {
    const mid = pipes[1];
    if (mid && mid.length <= 40 && !/official|audio|video|lyric|hd|4k/i.test(mid)) return mid;
  }
  const dash = /-\s*([^-|()\[\]]{2,40}?)\s*(songs?|movie|album)\b/i.exec(raw);
  if (dash?.[1]) return dash[1].trim();
  return "";
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
 * Tamil-to-English transliteration variants. Same phoneme, different Roman spellings.
 * We expand the user's query into all variants and try each until we get hits.
 */
const TRANSLIT_PAIRS: Array<[RegExp, string[]]> = [
  [/aa/gi, ["aa", "a"]],
  [/ee/gi, ["ee", "i"]],
  [/oo/gi, ["oo", "u"]],
  [/th/gi, ["th", "t"]],
  [/dh/gi, ["dh", "d"]],
  [/zh/gi, ["zh", "l"]],
  [/w/gi, ["w", "v"]],
  [/ph/gi, ["ph", "f"]],
  [/ck/gi, ["ck", "k"]],
  [/y$/i, ["y", "i"]],
  [/u$/i, ["u", "a"]],
];

/** Produce up to N normalized transliteration variants of a query. */
function transliterationVariants(query: string, cap = 6): string[] {
  const seen = new Set<string>([query]);
  const out: string[] = [query];
  for (const [re, subs] of TRANSLIT_PAIRS) {
    if (out.length >= cap) break;
    for (const s of subs) {
      const v = query.replace(re, s);
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
        if (out.length >= cap) break;
      }
    }
  }
  return out;
}

/** Classic Levenshtein edit distance. Small strings only (queries). */
export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    let cur = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      const next = Math.min(prev[j] + 1, cur + 1, prev[j - 1] + cost);
      prev[j - 1] = cur;
      cur = next;
    }
    prev[t.length] = cur;
  }
  return prev[t.length];
}

/** Similarity 0..1 based on Levenshtein / max length. */
function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

/** Fetch YouTube autocomplete suggestions for a query (best-effort). */
async function ytSuggestions(query: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return Array.isArray(data?.[1]) ? data[1].slice(0, 10) : [];
  } catch {
    return [];
  }
}

/**
 * Pick the best correction candidate from a list using Levenshtein similarity
 * against the original query. Returns null if nothing is close enough.
 */
function bestCorrection(original: string, candidates: string[], minSim = 0.55): string | null {
  const orig = original.trim().toLowerCase();
  let best: { text: string; sim: number } | null = null;
  for (const cand of candidates) {
    const c = cand.trim();
    if (!c || c.toLowerCase() === orig) continue;
    const sim = similarity(orig, c.toLowerCase());
    if (sim >= minSim && (!best || sim > best.sim)) best = { text: c, sim };
  }
  return best?.text ?? null;
}

/**
 * Typo-tolerant strict search. Returns tracks plus (when the raw query didn't
 * work) the corrected query string that actually produced results — so callers
 * can surface a "Did you mean …?" hint.
 *
 * Strategy:
 *   1. Raw query.
 *   2. Transliteration variants (Tamil ↔ Roman).
 *   3. Trim-last-char (single-typo tail).
 *   4. Levenshtein-scored YouTube autocomplete suggestion.
 */
export interface SearchOptions {
  /** Wrap the user query in double quotes to force exact phrase match on the provider. */
  exactMatch?: boolean;
  /** Preferred language/industry to append (e.g. "Tamil"). Prevents cross-language drift. */
  language?: string;
}

export async function searchMusicWithCorrection(
  query: string,
  maxResults = 30,
  opts: SearchOptions = {},
): Promise<{ tracks: YTTrack[]; correctedQuery: string | null }> {
  const original = query.trim();
  if (!original) return { tracks: [], correctedQuery: null };

  const optKey = `${opts.exactMatch ? "x" : "_"}::${(opts.language ?? "").toLowerCase()}`;
  const cacheKey = `${CACHE_VERSION}::tolerant::${optKey}::${original.toLowerCase()}::${maxResults}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached) return { tracks: cached, correctedQuery: null };

  // Attempt 1: raw query.
  const rawHit = await searchMusicOnce(original, maxResults, opts);
  if (rawHit.length > 0) {
    SEARCH_CACHE.set(cacheKey, rawHit);
    return { tracks: rawHit, correctedQuery: null };
  }

  // Attempts 2–3: transliteration + trim-last-char.
  const secondary: string[] = [];
  for (const v of transliterationVariants(original)) if (v !== original) secondary.push(v);
  if (original.length > 3) secondary.push(original.slice(0, -1));

  for (const attempt of secondary) {
    const tracks = await searchMusicOnce(attempt, maxResults, opts);
    if (tracks.length > 0) {
      SEARCH_CACHE.set(cacheKey, tracks);
      return { tracks, correctedQuery: attempt };
    }
  }

  // Attempt 4: YouTube autocomplete + Levenshtein scoring.
  const suggestions = await ytSuggestions(original);
  const corrected = bestCorrection(original, suggestions);
  if (corrected) {
    const tracks = await searchMusicOnce(corrected, maxResults, opts);
    if (tracks.length > 0) {
      SEARCH_CACHE.set(cacheKey, tracks);
      return { tracks, correctedQuery: corrected };
    }
  }

  return { tracks: [], correctedQuery: null };
}

/** Back-compat wrapper — tracks only. */
export async function searchMusic(
  query: string,
  maxResults = 30,
  opts: SearchOptions = {},
): Promise<YTTrack[]> {
  const { tracks } = await searchMusicWithCorrection(query, maxResults, opts);
  return tracks;
}

/**
 * Strict 2-step music search (single attempt):
 *  Step 1: search endpoint (over-fetch 50) with type=video, videoCategoryId=10,
 *          and native negative-keyword filtering on the query.
 *  Step 2: videos endpoint for real contentDetails.duration + embeddability.
 * Filters: 60s <= duration <= 600s and embeddable.
 * Sort:    Official channels/titles first via scoreVideo().
 */
async function searchMusicOnce(
  query: string,
  maxResults = 30,
  opts: SearchOptions = {},
): Promise<YTTrack[]> {
  const optKey = `${opts.exactMatch ? "x" : "_"}::${(opts.language ?? "").toLowerCase()}`;
  const cacheKey = `${CACHE_VERSION}::${optKey}::${query.trim().toLowerCase()}::${maxResults}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached) return cached;

  // Task 1: Keyword expansion — map political/campaign queries to a richer query.
  const lowered = query.trim().toLowerCase();
  const expansion = KEYWORD_EXPANSIONS[lowered];
  const isPolitical = !!expansion || POLITICAL_RE.test(query);

  // Tasks 1 & 2 (System Directive): force EXACT match by wrapping the raw user
  // term in double quotes, and inject a regional/language context so global
  // APIs stop drifting to the wrong industry (e.g. Hindi results for a Tamil
  // transliterated query). Skip when the caller already supplies a fully
  // composed query (Spotify per-track resolves via `${artist} ${name} ...`).
  const rawUserTerm = opts.exactMatch ? `"${query.trim()}"` : query;
  const langSuffix = opts.language ? ` ${opts.language} song` : "";

  // Task 3: For political/campaign queries prefer "official song OR anthem"
  // (broader than "official audio", which was hiding campaign uploads).
  const base = expansion
    ? expansion
    : isPolitical
      ? `${rawUserTerm} official song anthem${langSuffix}`
      : `${rawUserTerm} official audio${langSuffix}`;
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

  // Guillotine + Quality Gate: block trailers/teasers/promos AND low-quality
  // keywords (status, whatsapp, edit, cover, mashup, remix, ringtone) regardless
  // of channel. Titles must ALSO look like a real release: either contain a
  // high-quality signal ("official", "audio", "full video/song", "anthem", HD/4K)
  // OR come from a verified-looking channel (checked below).
  const officialIds = officialChannelIds();
  const isOfficialChannel = (v: RawVideoItem) =>
    officialIds.has(v.snippet.channelId) ||
    OFFICIAL_LABEL_RE.test(v.snippet.channelTitle) ||
    /vevo$/i.test(v.snippet.channelTitle) ||
    /-\s*topic$/i.test(v.snippet.channelTitle);

  const filtered = durationFiltered.filter(({ v }) => {
    const t = v.snippet.title;
    if (FORBIDDEN_KEYWORDS_RE.test(t)) return false;
    if (LOW_QUALITY_RE.test(t)) return false;
    // Quality Gate: keep only titles that either signal a real release OR
    // originate from a verified channel.
    return HIGH_QUALITY_RE.test(t) || isOfficialChannel(v);
  });

  filtered.sort((a, b) => scoreVideo(b.v) - scoreVideo(a.v));

  // Tiered whitelist strategy:
  //   Layer 1 (priority): results from OFFICIAL_CHANNEL_IDS whitelist only.
  //   Layer 2 (fallback): if Layer 1 < 3 results, append verified-quality
  //                       channels (VEVO, "- Topic", label-name regex).
  //   Layer 3 (safety):   if still empty, allow the general quality-gated pool.
  // Political queries keep everything so anthems on party channels aren't lost.
  const tier1 = filtered.filter(({ v }) => officialIds.has(v.snippet.channelId));
  const tier2 = filtered.filter(
    ({ v }) =>
      !officialIds.has(v.snippet.channelId) &&
      (OFFICIAL_LABEL_RE.test(v.snippet.channelTitle) ||
        /vevo$/i.test(v.snippet.channelTitle) ||
        /-\s*topic$/i.test(v.snippet.channelTitle)),
  );

  let finalPool: typeof filtered;
  if (isPolitical) {
    finalPool = filtered;
  } else if (tier1.length >= 3) {
    finalPool = tier1;
  } else if (tier1.length + tier2.length >= 3) {
    finalPool = [...tier1, ...tier2];
  } else {
    finalPool = filtered;
  }
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
      album: parseAlbum(v.snippet.title),
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
