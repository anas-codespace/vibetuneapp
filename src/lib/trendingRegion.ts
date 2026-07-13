/**
 * Region options for the "Trending near you" section and localStorage
 * persistence helpers. Codes are ISO 3166-1 alpha-2 (YouTube regionCode).
 */
export interface TrendingRegion {
  code: string;
  label: string;
  language: string; // human-readable primary language hint
}

export const TRENDING_REGIONS: TrendingRegion[] = [
  { code: "IN", label: "India", language: "Hindi / Tamil / Telugu" },
  { code: "US", label: "United States", language: "English" },
  { code: "GB", label: "United Kingdom", language: "English" },
  { code: "CA", label: "Canada", language: "English / French" },
  { code: "AU", label: "Australia", language: "English" },
  { code: "BR", label: "Brazil", language: "Portuguese" },
  { code: "MX", label: "Mexico", language: "Spanish" },
  { code: "ES", label: "Spain", language: "Spanish" },
  { code: "FR", label: "France", language: "French" },
  { code: "DE", label: "Germany", language: "German" },
  { code: "IT", label: "Italy", language: "Italian" },
  { code: "JP", label: "Japan", language: "Japanese" },
  { code: "KR", label: "South Korea", language: "Korean" },
  { code: "ID", label: "Indonesia", language: "Indonesian" },
  { code: "NG", label: "Nigeria", language: "English" },
  { code: "ZA", label: "South Africa", language: "English" },
  { code: "AE", label: "UAE", language: "Arabic / English" },
  { code: "SA", label: "Saudi Arabia", language: "Arabic" },
  { code: "TR", label: "Turkey", language: "Turkish" },
  { code: "RU", label: "Russia", language: "Russian" },
];

export const DEFAULT_TRENDING_REGION = "IN";
const STORAGE_KEY = "vibtune:trendingRegion";

export function getStoredTrendingRegion(): string {
  if (typeof window === "undefined") return DEFAULT_TRENDING_REGION;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && TRENDING_REGIONS.some((r) => r.code === v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_TRENDING_REGION;
}

export function setStoredTrendingRegion(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}

export function labelForRegion(code: string): string {
  return TRENDING_REGIONS.find((r) => r.code === code)?.label ?? code;
}
