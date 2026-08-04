import { describe, it, expect } from "vitest";
import {
  artistAffinity,
  freshness,
  hourFit,
  languageMatch,
  MAX_PER_ARTIST,
  recommendTracks,
  scoreCandidate,
  selectDiversified,
  type Candidate,
} from "../src/lib/recommender.server";
import type { TasteProfile } from "../src/lib/taste.server";

const NOW = new Date("2026-01-31T12:00:00.000Z");

const profile: TasteProfile = {
  topArtists: [
    { name: "anirudh ravichander", score: 10 },
    { name: "sid sriram", score: 5 },
  ],
  languageMix: { tamil: 0.8, hindi: 0.2 },
  hourBuckets: { 20: 8, 9: 2 } as unknown as TasteProfile["hourBuckets"],
  recentSeeds: ["anirudh ravichander"],
  discoveryOpenness: 0.5,
  isColdStart: "active",
  computedAt: NOW.toISOString(),
};

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  youtubeId: "y1",
  title: "Track",
  artist: "Anirudh Ravichander",
  language: "tamil",
  ...over,
});

describe("scoring components", () => {
  it("gives the top artist full affinity and an unknown artist none", () => {
    expect(artistAffinity(cand(), profile)).toBe(1);
    expect(artistAffinity(cand({ artist: "Sid Sriram" }), profile)).toBeCloseTo(0.5, 6);
    expect(artistAffinity(cand({ artist: "Nobody" }), profile)).toBe(0);
  });

  it("maps language to the normalized mix", () => {
    expect(languageMatch(cand(), profile)).toBeCloseTo(0.8, 6);
    expect(languageMatch(cand({ language: "telugu" }), profile)).toBe(0);
  });

  it("treats releases under 60 days as fully fresh and old ones as stale", () => {
    const recent = new Date(NOW.getTime() - 10 * 86400000).toISOString();
    const ancient = new Date(NOW.getTime() - 400 * 86400000).toISOString();
    expect(freshness(cand({ releasedAt: recent }), NOW)).toBe(1);
    expect(freshness(cand({ releasedAt: ancient }), NOW)).toBe(0);
    expect(freshness(cand(), NOW)).toBe(0);
  });

  it("peaks hourFit at the user's busiest hour", () => {
    expect(hourFit(20, profile)).toBe(1);
    expect(hourFit(3, profile)).toBe(0);
  });
});

describe("scoreCandidate", () => {
  it("ranks an on-taste track above an off-taste one", () => {
    const good = scoreCandidate(cand(), profile, 20, NOW);
    const bad = scoreCandidate(
      cand({ youtubeId: "y2", artist: "Nobody", language: "french" }),
      profile,
      20,
      NOW,
    );
    expect(good.score).toBeGreaterThan(bad.score);
  });
});

describe("selectDiversified", () => {
  const many = (n: number, artist: string, prefix: string): Candidate[] =>
    Array.from({ length: n }, (_, i) => cand({ youtubeId: `${prefix}${i}`, artist }));

  it("caps tracks per artist", () => {
    const scored = many(6, "Anirudh Ravichander", "a").map((c) =>
      scoreCandidate(c, profile, 20, NOW),
    );
    const picked = selectDiversified(scored, { count: 6, hourLocal: 20 });
    expect(picked.length).toBeLessThanOrEqual(MAX_PER_ARTIST);
  });

  it("honors the exclusion list", () => {
    const scored = many(4, "Sid Sriram", "s").map((c) => scoreCandidate(c, profile, 20, NOW));
    const picked = selectDiversified(scored, {
      count: 4,
      hourLocal: 20,
      excludeYoutubeIds: new Set(["s0", "s1"]),
    });
    expect(picked.map((p) => p.youtubeId)).not.toContain("s0");
    expect(picked.map((p) => p.youtubeId)).not.toContain("s1");
  });

  it("never returns duplicate ids", () => {
    const scored = [cand({ youtubeId: "dup" }), cand({ youtubeId: "dup" })].map((c) =>
      scoreCandidate(c, profile, 20, NOW),
    );
    const picked = selectDiversified(scored, { count: 5, hourLocal: 20 });
    expect(picked).toHaveLength(1);
  });

  it("pulls in more discovery picks when discoveryBoost is set", () => {
    const pool: Candidate[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        cand({ youtubeId: `k${i}`, artist: `Known ${i}`, isDiscovery: false }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        cand({ youtubeId: `d${i}`, artist: `New ${i}`, isDiscovery: true }),
      ),
    ];
    const normal = recommendTracks(pool, profile, { count: 10, hourLocal: 20 }, NOW);
    const boosted = recommendTracks(
      pool,
      profile,
      { count: 10, hourLocal: 20, discoveryBoost: true },
      NOW,
    );
    const share = (list: typeof normal) => list.filter((t) => t.isDiscovery).length;
    expect(share(boosted)).toBeGreaterThanOrEqual(share(normal));
  });
});

describe("recommendTracks", () => {
  it("returns at most `count` tracks", () => {
    const pool = Array.from({ length: 30 }, (_, i) =>
      cand({ youtubeId: `p${i}`, artist: `Artist ${i}` }),
    );
    expect(recommendTracks(pool, profile, { count: 8, hourLocal: 20 }, NOW)).toHaveLength(8);
  });

  it("returns an empty list for an empty pool", () => {
    expect(recommendTracks([], profile, { count: 8, hourLocal: 20 }, NOW)).toEqual([]);
  });
});
