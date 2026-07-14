/**
 * Region options for the "Trending near you" section and localStorage
 * persistence helpers. Codes are ISO 3166-1 alpha-2 (YouTube regionCode /
 * Spotify market). Region is INDEPENDENT of language preference — do not
 * bake language names into the label here.
 */
export interface TrendingRegion {
  code: string;
  label: string;
}

export const TRENDING_REGIONS: TrendingRegion[] = [
  { code: "IN", label: "India" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "ES", label: "Spain" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "IT", label: "Italy" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "ID", label: "Indonesia" },
  { code: "NG", label: "Nigeria" },
  { code: "ZA", label: "South Africa" },
  { code: "AE", label: "UAE" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "TR", label: "Turkey" },
  { code: "RU", label: "Russia" },
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
