import { describe, it, expect } from "vitest";
import {
  matchTierFor,
  rankSearchResults,
  scoreSearchCandidate,
  type SearchCandidate,
} from "../src/lib/search-rank.server";
import type { TasteProfile } from "../src/lib/taste.server";

const profile: TasteProfile = {
  topArtists: [{ name: "anirudh ravichander", score: 10 }],
  languageMix: { tamil: 0.9, hindi: 0.1 },
  hourBuckets: {} as TasteProfile["hourBuckets"],
  recentSeeds: [],
  discoveryOpenness: 0.5,
  isColdStart: "active",
  computedAt: new Date("2026-01-31T12:00:00.000Z").toISOString(),
};

const c = (over: Partial<SearchCandidate> = {}): SearchCandidate => ({
  youtubeId: "y1",
  title: "Jailer Theme",
  artist: "Anirudh Ravichander",
  album: "Jailer",
  language: "tamil",
  ...over,
});

describe("matchTierFor", () => {
  it("tier 3 for a full phrase hit", () => {
    expect(matchTierFor("jailer theme", c())).toBe(3);
  });

  it("tier 2 when every token is present out of order", () => {
    expect(matchTierFor("theme jailer", c({ album: "" }))).toBe(2);
  });

  it("tier 1 when only some tokens hit", () => {
    expect(matchTierFor("jailer zzzz", c())).toBe(1);
  });

  it("tier 0 for no overlap", () => {
    expect(matchTierFor("qqqq", c())).toBe(0);
  });
});

describe("scoreSearchCandidate", () => {
  it("scores an exact, on-taste result above a fuzzy off-taste one", () => {
    const exact = scoreSearchCandidate("jailer theme", c(), profile);
    const fuzzy = scoreSearchCandidate(
      "jailer theme",
      c({ youtubeId: "y2", title: "Random Song", album: "", artist: "Nobody", language: "french" }),
      profile,
    );
    expect(exact.score).toBeGreaterThan(fuzzy.score);
  });

  it("works without a taste profile", () => {
    const s = scoreSearchCandidate("jailer theme", c(), null);
    expect(s.score).toBeGreaterThan(0);
  });

  it("uses language affinity as a tie-breaker at equal tiers", () => {
    const tamil = scoreSearchCandidate("song", c({ title: "song", language: "tamil" }), profile);
    const hindi = scoreSearchCandidate(
      "song",
      c({ youtubeId: "y3", title: "song", artist: "Nobody", language: "hindi" }),
      profile,
    );
    expect(tamil.score).toBeGreaterThan(hindi.score);
  });
});

describe("rankSearchResults", () => {
  it("returns only tier-3 hits when there are at least three", () => {
    const exacts = [1, 2, 3].map((i) =>
      c({ youtubeId: `e${i}`, title: "Jailer Theme", artist: `Artist ${i}` }),
    );
    const fuzzy = c({ youtubeId: "f1", title: "Something Else", album: "", artist: "Nobody" });
    const ranked = rankSearchResults("jailer theme", [...exacts, fuzzy], profile);
    expect(ranked).toHaveLength(3);
    expect(ranked.map((r) => r.youtubeId)).not.toContain("f1");
  });

  it("merges lower tiers when exact hits are scarce", () => {
    const ranked = rankSearchResults(
      "jailer theme",
      [c(), c({ youtubeId: "f1", title: "Jailer Promo", album: "", artist: "Nobody" })],
      profile,
    );
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.youtubeId).toBe("y1");
  });

  it("is stable for an empty list", () => {
    expect(rankSearchResults("anything", [], profile)).toEqual([]);
  });
});
