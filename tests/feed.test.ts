import { describe, it, expect } from "vitest";
import {
  composeSection,
  isFresh,
  planSections,
  SECTION_ORDER,
  SECTION_TTL_MS,
  titleFor,
  type CachedSection,
  type FeedTrack,
} from "../src/lib/feed.server";
import type { TasteProfile } from "../src/lib/taste.server";

const NOW = new Date("2026-01-31T12:00:00.000Z");

const track = (id: string): FeedTrack => ({ youtubeId: id, title: `T${id}`, artist: "A" });

const profile = (state: TasteProfile["isColdStart"]): TasteProfile => ({
  topArtists: [],
  languageMix: { tamil: 1 },
  hourBuckets: {} as TasteProfile["hourBuckets"],
  recentSeeds: [],
  discoveryOpenness: 0.5,
  isColdStart: state,
  computedAt: NOW.toISOString(),
});

describe("planSections", () => {
  it("returns every section for an active listener", () => {
    expect(planSections(profile("active"))).toEqual(SECTION_ORDER);
  });

  it("skips 'because you listened to' for cold-start listeners", () => {
    for (const state of ["new", "onboarded_no_plays"] as const) {
      expect(planSections(profile(state))).not.toContain("because_you_listened_to");
    }
  });
});

describe("titleFor", () => {
  it("uses the seed artist when there is one", () => {
    expect(titleFor("because_you_listened_to", { seedArtist: "Ilaiyaraaja" })).toBe(
      "Because you listened to Ilaiyaraaja",
    );
  });

  it("falls back gracefully without a language", () => {
    expect(titleFor("trending", {})).toBe("Trending now");
    expect(titleFor("trending", { language: "tamil" })).toBe("Trending in Tamil");
  });
});

describe("isFresh", () => {
  it("is false without a cache", () => {
    expect(isFresh("made_for_you", null, NOW)).toBe(false);
  });

  it("respects the per-section TTL", () => {
    const inside: CachedSection = {
      tracks: [track("a")],
      computedAt: new Date(NOW.getTime() - SECTION_TTL_MS.made_for_you / 2).toISOString(),
    };
    const outside: CachedSection = {
      tracks: [track("a")],
      computedAt: new Date(NOW.getTime() - SECTION_TTL_MS.made_for_you - 1000).toISOString(),
    };
    expect(isFresh("made_for_you", inside, NOW)).toBe(true);
    expect(isFresh("made_for_you", outside, NOW)).toBe(false);
  });

  it("expires 'jump back in' much sooner than the rest", () => {
    expect(SECTION_TTL_MS.jump_back_in).toBeLessThan(SECTION_TTL_MS.made_for_you);
  });
});

describe("composeSection", () => {
  const base = { kind: "made_for_you" as const, title: "Made for you", now: NOW };

  it("serves a fresh cache without calling the fetcher", async () => {
    let called = false;
    const s = await composeSection({
      ...base,
      cached: { tracks: [track("cached")], computedAt: NOW.toISOString() },
      fetcher: async () => {
        called = true;
        return [track("live")];
      },
    });
    expect(called).toBe(false);
    expect(s.stale).toBe(false);
    expect(s.tracks[0]?.youtubeId).toBe("cached");
  });

  it("fetches when the cache is stale", async () => {
    const s = await composeSection({
      ...base,
      cached: {
        tracks: [track("cached")],
        computedAt: new Date(NOW.getTime() - SECTION_TTL_MS.made_for_you - 1).toISOString(),
      },
      fetcher: async () => [track("live")],
    });
    expect(s.stale).toBe(false);
    expect(s.tracks[0]?.youtubeId).toBe("live");
  });

  it("falls back to the cache and flags stale when the fetcher throws", async () => {
    const s = await composeSection({
      ...base,
      cached: { tracks: [track("cached")], computedAt: new Date(0).toISOString() },
      fetcher: async () => {
        throw new Error("YouTube quota exceeded");
      },
    });
    expect(s.stale).toBe(true);
    expect(s.tracks[0]?.youtubeId).toBe("cached");
  });

  it("falls back to the cache when the fetcher returns nothing", async () => {
    const s = await composeSection({
      ...base,
      cached: { tracks: [track("cached")], computedAt: new Date(0).toISOString() },
      fetcher: async () => [],
    });
    expect(s.stale).toBe(true);
  });

  it("returns an empty section when there is no cache and the fetch fails", async () => {
    const s = await composeSection({
      ...base,
      cached: null,
      fetcher: async () => {
        throw new Error("down");
      },
    });
    expect(s.tracks).toEqual([]);
    expect(s.stale).toBe(false);
  });
});
