/**
 * taste.server.ts — Pure taste-profile math.
 *
 * NO DB, NO fetch. Everything here is a pure function of its inputs so it
 * can be unit-tested with plain objects. The DB-facing wrapper lives in
 * `taste.functions.ts`.
 *
 * All tunable weights and thresholds are exported constants so they can
 * be tuned without hunting through function bodies.
 */

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------

/** Half-life for signal recency decay, in days. Older events count for less. */
export const DECAY_HALF_LIFE_DAYS = 21;

/** How much each kind of user signal contributes to artist/language weight. */
export const SIGNAL_WEIGHTS = {
  like: 3.0,
  playlist_add: 2.5,
  completed: 2.0, // end_reason = 'completed' or 'skipped_late'
  skipped_late: 1.5,
  replay: 1.0, // per extra play of the same track within 24h
  search_then_play: 1.0,
  search_only: 0.3,
  skipped_early: -2.0,
  error: 0,
} as const;

/** Track counts. Kept small — profile is a coarse summary, not a full log. */
export const TOP_ARTISTS_LIMIT = 20;
export const RECENT_SEEDS_LIMIT = 10;

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

export type EndReason =
  | "completed"
  | "skipped_early"
  | "skipped_late"
  | "next_pressed"
  | "prev_pressed"
  | "error"
  | "abandoned";

export interface ListeningEventInput {
  youtube_id: string;
  title: string;
  artist: string;
  started_at: string; // ISO
  listened_ms: number;
  track_ms: number;
  end_reason: EndReason;
  context_lang: string | null;
  hour_local: number;
}

export interface LikeInput {
  youtube_id: string;
  artist: string;
  created_at: string;
}

export interface SearchEventInput {
  normalized_query: string;
  language: string | null;
  resulted_in_play: boolean;
  created_at: string;
}

export interface ProfileSeed {
  fav_languages: string[]; // from onboarding
  fav_artists: string[]; // artist names from onboarding
}

export type ColdStartState = "new" | "onboarded_no_plays" | "active";

export interface TasteProfile {
  topArtists: Array<{ name: string; score: number }>;
  languageMix: Record<string, number>; // normalized so sum == 1 (or empty)
  hourBuckets: Record<number, number>; // 0..23 → normalized weight
  recentSeeds: string[]; // last N distinct artists played
  discoveryOpenness: number; // 0..1
  isColdStart: ColdStartState;
  computedAt: string; // ISO
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Exponential decay by age in days. `now` is injected for testability. */
export function decayWeight(
  eventIso: string,
  now: Date = new Date(),
  halfLifeDays: number = DECAY_HALF_LIFE_DAYS,
): number {
  const ageMs = now.getTime() - new Date(eventIso).getTime();
  if (!isFinite(ageMs) || ageMs <= 0) return 1;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Classify a listening event into a signal weight.
 * `skipped_early` is a strong negative — the user actively rejected it.
 * `next_pressed`/`prev_pressed` are neutral unless combined with position;
 * this classifier assumes the caller has already resolved timing.
 */
export function classifyListen(ev: ListeningEventInput): number {
  switch (ev.end_reason) {
    case "completed":
      return SIGNAL_WEIGHTS.completed;
    case "skipped_late":
      return SIGNAL_WEIGHTS.skipped_late;
    case "skipped_early":
      return SIGNAL_WEIGHTS.skipped_early;
    case "error":
      return SIGNAL_WEIGHTS.error;
    case "next_pressed":
    case "prev_pressed":
    case "abandoned":
    default: {
      // Fall back to position-based inference.
      const ratio = ev.track_ms > 0 ? ev.listened_ms / ev.track_ms : 0;
      if (ratio >= 0.8) return SIGNAL_WEIGHTS.skipped_late;
      if (ratio >= 0.5) return SIGNAL_WEIGHTS.skipped_late / 2;
      if (ev.listened_ms < 5000 || ratio < 0.15) return SIGNAL_WEIGHTS.skipped_early;
      return 0;
    }
  }
}

/** Group listens by youtube_id within 24h to detect replays. */
export function countReplays(events: ListeningEventInput[]): Map<string, number> {
  const byTrack = new Map<string, ListeningEventInput[]>();
  for (const e of events) {
    const arr = byTrack.get(e.youtube_id) ?? [];
    arr.push(e);
    byTrack.set(e.youtube_id, arr);
  }
  const replays = new Map<string, number>();
  for (const [id, list] of byTrack) {
    const sorted = list.slice().sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );
    let count = 0;
    for (let i = 1; i < sorted.length; i++) {
      const dt =
        new Date(sorted[i]!.started_at).getTime() -
        new Date(sorted[i - 1]!.started_at).getTime();
      if (dt <= 24 * 60 * 60 * 1000) count++;
    }
    if (count > 0) replays.set(id, count);
  }
  return replays;
}

function normalize<K extends string | number>(map: Map<K, number>): Record<K, number> {
  const total = Array.from(map.values()).reduce((a, b) => a + Math.max(0, b), 0);
  const out = {} as Record<K, number>;
  if (total <= 0) return out;
  for (const [k, v] of map) out[k] = Math.max(0, v) / total;
  return out;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export interface BuildTasteInput {
  events: ListeningEventInput[];
  likes: LikeInput[];
  searches: SearchEventInput[];
  seed: ProfileSeed;
  now?: Date;
}

export function buildTasteProfile(input: BuildTasteInput): TasteProfile {
  const now = input.now ?? new Date();
  const { events, likes, searches, seed } = input;

  // Cold-start classification.
  const hasSeedArtists = (seed.fav_artists?.length ?? 0) > 0;
  const isColdStart: ColdStartState =
    events.length === 0
      ? hasSeedArtists
        ? "onboarded_no_plays"
        : "new"
      : "active";

  // Artist weight aggregation.
  const artistScore = new Map<string, number>();
  const languageScore = new Map<string, number>();
  const hourScore = new Map<number, number>();
  const replays = countReplays(events);

  // Onboarding seeds bootstrap the profile even before any plays land.
  for (const name of seed.fav_artists ?? []) {
    const key = normalizeArtistName(name);
    if (!key) continue;
    artistScore.set(key, (artistScore.get(key) ?? 0) + SIGNAL_WEIGHTS.completed);
  }
  for (const lang of seed.fav_languages ?? []) {
    const l = normalizeLang(lang);
    if (!l) continue;
    languageScore.set(l, (languageScore.get(l) ?? 0) + SIGNAL_WEIGHTS.completed);
  }

  // Play/skip signals.
  let unknownArtistPlays = 0;
  let unknownArtistSkips = 0;
  const seenArtists = new Set(artistScore.keys());
  for (const e of events) {
    const w = classifyListen(e) * decayWeight(e.started_at, now);
    if (w === 0) continue;
    const artist = normalizeArtistName(e.artist);
    if (artist) {
      artistScore.set(artist, (artistScore.get(artist) ?? 0) + w);
    }
    const lang = normalizeLang(e.context_lang ?? "");
    if (lang) {
      languageScore.set(lang, (languageScore.get(lang) ?? 0) + Math.max(0, w));
    }
    if (w > 0) {
      hourScore.set(e.hour_local, (hourScore.get(e.hour_local) ?? 0) + w);
    }
    // Openness tracking: how often does the user reject artists they don't know?
    if (artist && !seenArtists.has(artist)) {
      if (w > 0) unknownArtistPlays++;
      else unknownArtistSkips++;
    }
  }

  // Replay boost.
  for (const [id, extra] of replays) {
    const ev = events.find((e) => e.youtube_id === id);
    if (!ev) continue;
    const a = normalizeArtistName(ev.artist);
    if (!a) continue;
    artistScore.set(a, (artistScore.get(a) ?? 0) + extra * SIGNAL_WEIGHTS.replay);
  }

  // Likes.
  for (const l of likes) {
    const w = SIGNAL_WEIGHTS.like * decayWeight(l.created_at, now);
    const a = normalizeArtistName(l.artist);
    if (a) artistScore.set(a, (artistScore.get(a) ?? 0) + w);
  }

  // Searches — weaker signal, still counts toward language/artist affinity.
  for (const s of searches) {
    const w =
      (s.resulted_in_play ? SIGNAL_WEIGHTS.search_then_play : SIGNAL_WEIGHTS.search_only) *
      decayWeight(s.created_at, now);
    const lang = normalizeLang(s.language ?? "");
    if (lang) languageScore.set(lang, (languageScore.get(lang) ?? 0) + w);
    // We don't infer artist from raw query — noisy and biased.
  }

  const topArtists = Array.from(artistScore.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_ARTISTS_LIMIT)
    .map(([name, score]) => ({ name, score }));

  const recentSeeds = extractRecentSeeds(events, RECENT_SEEDS_LIMIT);

  const totalUnknown = unknownArtistPlays + unknownArtistSkips;
  const discoveryOpenness =
    totalUnknown === 0 ? 0.5 : unknownArtistPlays / totalUnknown;

  return {
    topArtists,
    languageMix: normalize(languageScore),
    hourBuckets: normalize(hourScore),
    recentSeeds,
    discoveryOpenness,
    isColdStart,
    computedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export function normalizeArtistName(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/\s*[-–—]\s*topic$/i, "") // "A.R. Rahman - Topic" → "a.r. rahman"
    .replace(/\bvevo\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLang(raw: string): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "";
  // Coalesce common variants.
  if (s === "tam" || s === "ta") return "tamil";
  if (s === "hin" || s === "hi") return "hindi";
  if (s === "eng" || s === "en") return "english";
  if (s === "tel" || s === "te") return "telugu";
  if (s === "mal" || s === "ml") return "malayalam";
  if (s === "kan" || s === "kn") return "kannada";
  return s;
}

/** Distinct artists, most-recent first, capped at N. */
export function extractRecentSeeds(events: ListeningEventInput[], n: number): string[] {
  const sorted = events
    .slice()
    .sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of sorted) {
    const a = normalizeArtistName(e.artist);
    if (!a || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
    if (out.length >= n) break;
  }
  return out;
}
