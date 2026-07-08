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

// Clean "Artist - Topic", remove "(Official Audio)" etc.
function cleanQuery(title: string, artist: string) {
  const cleanArtist = artist.replace(/\s*-?\s*Topic\s*$/i, "").trim();
  const cleanTitle = title
    .replace(/\((?:official|lyric|audio|video|hd|hq|mv|m\/v|visualizer)[^)]*\)/gi, "")
    .replace(/\[(?:official|lyric|audio|video|hd|hq|mv|m\/v|visualizer)[^\]]*\]/gi, "")
    .replace(/[|｜]\s*.*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { cleanArtist, cleanTitle };
}

export async function fetchLyrics(title: string, artist: string): Promise<LyricsResult> {
  const key = `${title}::${artist}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const { cleanArtist, cleanTitle } = cleanQuery(title, artist);
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
  let result: LyricsResult = { source: "none", synced: null, plain: null };
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Vibtune/1.0" } });
    if (res.ok) {
      const json = (await res.json()) as { syncedLyrics?: string | null; plainLyrics?: string | null };
      result = {
        source: "lrclib",
        synced: json.syncedLyrics ? parseLrc(json.syncedLyrics) : null,
        plain: json.plainLyrics ?? null,
      };
    } else if (res.status === 404) {
      // Try search endpoint as fallback
      const sr = await fetch(
        `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`,
        { headers: { "User-Agent": "Vibtune/1.0" } },
      );
      if (sr.ok) {
        const arr = (await sr.json()) as Array<{ syncedLyrics?: string | null; plainLyrics?: string | null }>;
        const first = arr[0];
        if (first) {
          result = {
            source: "lrclib",
            synced: first.syncedLyrics ? parseLrc(first.syncedLyrics) : null,
            plain: first.plainLyrics ?? null,
          };
        }
      }
    }
  } catch {
    // Network error — leave default.
  }
  cache.set(key, { value: result, at: Date.now() });
  return result;
}
