// LRCLIB synced lyrics fetcher (server-only).
// https://lrclib.net/docs

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface LyricsResult {
  source: "lrclib" | "none";
  synced: LyricLine[] | null;
  plain: string | null;
}

const cache = new Map<string, { value: LyricsResult; at: number }>();
const TTL = 1000 * 60 * 60 * 24; // 24h

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const m = /^\[(\d+):(\d+)(?:\.(\d+))?\](.*)$/.exec(raw);
    if (!m) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const ms = m[3] ? Number(m[3].padEnd(3, "0").slice(0, 3)) : 0;
    const text = (m[4] ?? "").trim();
    if (!text) continue;
    lines.push({ time: min * 60 + sec + ms / 1000, text });
  }
  return lines;
}

const LABEL_RE = /music|series|records|entertainment|vevo|channel|official|label|studios?|productions?/i;

function coreTitle(title: string): string {
  let t = title.split("-")[0].split("|")[0].split("｜")[0].trim();
  t = t.replace(/\[.*?\]|\(.*?\)/g, "").trim();
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function firstWords(t: string, n = 3): string {
  return t.split(/\s+/).slice(0, n).join(" ");
}

type LrclibHit = {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
};

async function fetchFromLRCLIB(query: string): Promise<LrclibHit | null> {
  if (!query.trim()) return null;
  try {
    const res = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "Vibtune/1.0" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as LrclibHit[];
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.find((d) => d.syncedLyrics || d.plainLyrics) ?? data[0];
  } catch {
    return null;
  }
}

function toResult(hit: LrclibHit | null): LyricsResult {
  if (!hit) return { source: "none", synced: null, plain: null };
  return {
    source: "lrclib",
    synced: hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : null,
    plain: hit.plainLyrics ?? null,
  };
}

export async function fetchLyrics(title: string, artist: string): Promise<LyricsResult> {
  const key = `${title}::${artist}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const core = coreTitle(title);
  const cleanArtist = artist.replace(/\s*-?\s*Topic\s*$/i, "").trim();
  const isLabel = !cleanArtist || LABEL_RE.test(cleanArtist);

  let trackData: LrclibHit | null = null;

  // Attempt 1: title + artist (only if artist isn't a label).
  if (!isLabel) {
    trackData = await fetchFromLRCLIB(`${core} ${cleanArtist}`);
  }

  // Attempt 2: title only — very effective for label-uploaded tracks.
  if (!trackData) {
    trackData = await fetchFromLRCLIB(core);
  }

  // Attempt 3: first 2-3 words of the title as a last resort.
  if (!trackData) {
    const short = firstWords(core, 3);
    if (short && short.toLowerCase() !== core.toLowerCase()) {
      trackData = await fetchFromLRCLIB(short);
    }
  }

  const result = toResult(trackData);
  cache.set(key, { value: result, at: Date.now() });
  return result;
}
