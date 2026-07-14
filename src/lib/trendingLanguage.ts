/**
 * Language preferences for trending / feed personalization. Multi-select.
 * Stored separately from region (localStorage). Downstream code uses these
 * as ranking/filtering hints for search queries and client-side re-ranking.
 */
export interface TrendingLanguage {
  code: string;   // internal short code (lowercase)
  label: string;  // display label
  /**
   * Keywords used for lightweight client-side ranking. If a track's title or
   * artist matches any of these, it's boosted. Include the language name and
   * common script cues where safe.
   */
  keywords: string[];
}

export const TRENDING_LANGUAGES: TrendingLanguage[] = [
  { code: "hindi",     label: "Hindi",     keywords: ["hindi", "bollywood"] },
  { code: "tamil",     label: "Tamil",     keywords: ["tamil", "kollywood"] },
  { code: "telugu",    label: "Telugu",    keywords: ["telugu", "tollywood"] },
  { code: "malayalam", label: "Malayalam", keywords: ["malayalam", "mollywood"] },
  { code: "kannada",   label: "Kannada",   keywords: ["kannada", "sandalwood"] },
  { code: "punjabi",   label: "Punjabi",   keywords: ["punjabi"] },
  { code: "bengali",   label: "Bengali",   keywords: ["bengali", "bangla"] },
  { code: "english",   label: "English",   keywords: ["english"] },
  { code: "spanish",   label: "Spanish",   keywords: ["spanish", "latino", "reggaeton"] },
  { code: "korean",    label: "Korean",    keywords: ["k-pop", "kpop", "korean"] },
  { code: "japanese",  label: "Japanese",  keywords: ["j-pop", "jpop", "japanese", "anime"] },
  { code: "arabic",    label: "Arabic",    keywords: ["arabic"] },
];

export const DEFAULT_TRENDING_LANGUAGES = ["tamil"];
const STORAGE_KEY = "vibtune:trendingLanguages";

export function getStoredTrendingLanguages(): string[] {
  if (typeof window === "undefined") return DEFAULT_TRENDING_LANGUAGES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (c): c is string => typeof c === "string" && TRENDING_LANGUAGES.some((l) => l.code === c),
        );
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_TRENDING_LANGUAGES;
}

export function setStoredTrendingLanguages(codes: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
    /* ignore */
  }
}

export function labelsForLanguages(codes: string[]): string {
  if (codes.length === 0) return "All languages";
  return codes
    .map((c) => TRENDING_LANGUAGES.find((l) => l.code === c)?.label ?? c)
    .join(" · ");
}

/**
 * Re-rank a track list: tracks whose title/artist mention any selected
 * language keyword are moved to the front (stable). Never filters things
 * out, so trending never goes empty when the region doesn't match a
 * selected language (preserves fallback behavior).
 */
export function rankByLanguages<T extends { title?: string | null; artist?: string | null }>(
  items: T[],
  codes: string[],
): T[] {
  if (codes.length === 0 || items.length === 0) return items;
  const kw = codes
    .flatMap((c) => TRENDING_LANGUAGES.find((l) => l.code === c)?.keywords ?? [])
    .map((k) => k.toLowerCase());
  if (kw.length === 0) return items;
  const scored = items.map((t, idx) => {
    const hay = `${t.title ?? ""} ${t.artist ?? ""}`.toLowerCase();
    const hit = kw.some((k) => hay.includes(k));
    return { t, idx, hit };
  });
  scored.sort((a, b) => (a.hit === b.hit ? a.idx - b.idx : a.hit ? -1 : 1));
  return scored.map((s) => s.t);
}
