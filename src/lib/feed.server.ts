/**
 * feed.server.ts — Pure home-feed layout logic. The DB-facing orchestrator
 * (fetching candidates from YouTube/Spotify) lives in `feed.functions.ts`.
 *
 * A section builder receives:
 *   - the taste profile
 *   - fetcher callbacks that resolve candidate arrays
 *   - a cache lookup for last-known-good tracks
 *
 * On fetcher failure or empty response, we surface the cached array with
 * `stale: true` rather than hiding the section — one of the plan's
 * explicit design goals.
 */

import type { TasteProfile } from "./taste.server";

export type SectionKind =
  | "jump_back_in"
  | "because_you_listened_to"
  | "made_for_you"
  | "new_releases"
  | "trending"
  | "discovery";

export interface FeedTrack {
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
}

export interface FeedSection {
  id: string;
  kind: SectionKind;
  title: string;
  tracks: FeedTrack[];
  stale: boolean; // true if served from cache after a fetch failure
  reasonHidden?: string; // present when we intentionally skip (e.g. cold start)
}

/** How long each section may be reused from cache without refetching. */
export const SECTION_TTL_MS: Record<SectionKind, number> = {
  jump_back_in: 60 * 1000,
  because_you_listened_to: 60 * 60 * 1000,
  made_for_you: 60 * 60 * 1000,
  new_releases: 60 * 60 * 1000,
  trending: 60 * 60 * 1000,
  discovery: 60 * 60 * 1000,
};

/** The fixed section order the client renders top-to-bottom. */
export const SECTION_ORDER: SectionKind[] = [
  "jump_back_in",
  "because_you_listened_to",
  "made_for_you",
  "new_releases",
  "trending",
  "discovery",
];

export function titleFor(kind: SectionKind, ctx: { seedArtist?: string; language?: string }): string {
  switch (kind) {
    case "jump_back_in":
      return "Jump back in";
    case "because_you_listened_to":
      return ctx.seedArtist ? `Because you listened to ${ctx.seedArtist}` : "For you";
    case "made_for_you":
      return "Made for you";
    case "new_releases":
      return ctx.language ? `New in ${capitalize(ctx.language)}` : "New releases";
    case "trending":
      return ctx.language ? `Trending in ${capitalize(ctx.language)}` : "Trending now";
    case "discovery":
      return "Discovery mix";
  }
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// Section-building helpers (pure planning; caller executes fetchers)
// ---------------------------------------------------------------------------

export interface CachedSection {
  tracks: FeedTrack[];
  computedAt: string; // ISO
}

/** True if a cached section is still within its TTL. */
export function isFresh(kind: SectionKind, cached: CachedSection | null, now: Date = new Date()): boolean {
  if (!cached) return false;
  const ageMs = now.getTime() - new Date(cached.computedAt).getTime();
  return ageMs < SECTION_TTL_MS[kind];
}

/**
 * Compose a section. Rules:
 *   1. If cache is fresh → return cache (not stale).
 *   2. Otherwise try the fetcher. On non-empty result → return live (not stale).
 *   3. On fetcher failure OR empty result → return the cached tracks with stale=true.
 *   4. If there's no cache either → return an empty tracks array (caller decides fallback).
 */
export async function composeSection(args: {
  kind: SectionKind;
  title: string;
  cached: CachedSection | null;
  fetcher: () => Promise<FeedTrack[]>;
  now?: Date;
}): Promise<FeedSection> {
  const { kind, title, cached, fetcher } = args;
  const now = args.now ?? new Date();
  const id = `${kind}-${now.getTime()}`;

  if (isFresh(kind, cached, now) && cached && cached.tracks.length > 0) {
    return { id, kind, title, tracks: cached.tracks, stale: false };
  }
  try {
    const fresh = await fetcher();
    if (fresh.length > 0) return { id, kind, title, tracks: fresh, stale: false };
    if (cached && cached.tracks.length > 0) {
      return { id, kind, title, tracks: cached.tracks, stale: true };
    }
    return { id, kind, title, tracks: [], stale: false };
  } catch {
    if (cached && cached.tracks.length > 0) {
      return { id, kind, title, tracks: cached.tracks, stale: true };
    }
    return { id, kind, title, tracks: [], stale: false };
  }
}

/**
 * Decide which sections make sense for a given profile. `because_you_listened_to`
 * is skipped for cold-start users — there's no seed to build it around.
 */
export function planSections(profile: TasteProfile): SectionKind[] {
  if (profile.isColdStart !== "active") {
    return SECTION_ORDER.filter((k) => k !== "because_you_listened_to");
  }
  return SECTION_ORDER;
}
