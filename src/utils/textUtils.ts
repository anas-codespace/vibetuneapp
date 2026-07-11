/**
 * Strip common YouTube title noise so it reads like a proper track title.
 *
 * Removes bracketed / parenthesized annotations, trailing pipe segments,
 * and dangling "official/music/lyric/video/audio ..." tails.
 */
export function cleanYouTubeTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\[.*?\]|\(.*?\)/g, "") // brackets & parentheses w/ contents
    .replace(/\|.*$/g, "") // everything after a pipe
    .replace(/-?\s*(official|music|lyric|lyrics|video|audio|hd|4k|full\s+song|full\s+video)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–—:]+$/g, "")
    .trim();
}
