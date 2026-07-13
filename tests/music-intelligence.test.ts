import { describe, it, expect } from "vitest";
import { rankRecommendations, scoreTrack, recencyBoost } from "../src/lib/recommendations";
import { buildHomeFeed, isFresh } from "../src/lib/homeFeed";
import { planSearchStages, evaluateStage } from "../src/lib/search";

const now = new Date("2026-07-01T00:00:00Z");

const taste = {
  artists: { "a.r. rahman": 10, "anirudh": 6 },
  genres: { "film": 8, "pop": 2 },
  languages: { "tamil": 12, "english": 3 },
  discoveryOpenness: 0.7,
  recentSeeds: ["a.r. rahman"],
};

describe("recommendations", () => {
  it("scores familiar-genre, familiar-artist tracks highest", () => {
    const rahman = { id: "1", title: "A", artist: "a.r. rahman", genre: "film", language: "tamil", publishedAt: "2026-06-15" };
    const rando = { id: "2", title: "B", artist: "unknown", genre: "metal", language: "german", publishedAt: "2020-01-01" };
    expect(scoreTrack(rahman, taste, now)).toBeGreaterThan(scoreTrack(rando, taste, now));
  });

  it("caps tracks per artist", () => {
    const cands = Array.from({ length: 5 }, (_, i) => ({
      id: String(i), title: `t${i}`, artist: "a.r. rahman", genre: "film", language: "tamil", publishedAt: "2026-06-01",
    }));
    const ranked = rankRecommendations(cands, taste, { limit: 20, maxPerArtist: 2, now });
    expect(ranked.length).toBe(2);
  });

  it("recencyBoost decays with age", () => {
    expect(recencyBoost("2026-06-25", now)).toBe(1);
    expect(recencyBoost("2020-01-01", now)).toBe(0);
  });
});

describe("homeFeed", () => {
  it("assembles 5 sections and falls back to trending when empty", () => {
    const trending = [{ id: "tr1", title: "T", artist: "x", genre: "film", language: "tamil", publishedAt: "2026-06-20" }];
    const sections = buildHomeFeed({
      taste, candidates: [], recentPlays: [], trending, now,
    });
    expect(sections.map((s) => s.key)).toEqual([
      "jump_back_in", "made_for_you", "new_releases", "because_you_liked", "trending_now",
    ]);
    // All non-trending sections should have fallen back to trending.
    for (const s of sections) expect(s.tracks.length).toBeGreaterThan(0);
  });

  it("isFresh returns false past TTL", () => {
    expect(isFresh(new Date(now.getTime() - 1000).toISOString(), now)).toBe(true);
    expect(isFresh(new Date(now.getTime() - 5 * 3600 * 1000).toISOString(), now)).toBe(false);
  });
});

describe("search cascade", () => {
  it("plans 4 stages when transliterations provided", () => {
    const stages = planSearchStages({ rawQuery: "hukum", language: "tamil", transliterations: ["ஹுகும்"] });
    expect(stages.map((s) => s.kind)).toEqual([
      "quoted_lang", "unquoted_lang", "raw", "typo_tolerant",
    ]);
    expect(stages[3].broadResults).toBe(true);
  });

  it("evaluates stage accept threshold", () => {
    const results = [
      { id: "1", title: "Hukum Thalaivar", artist: "Anirudh", album: "Jailer" },
      { id: "2", title: "Hukum Reprise", artist: "Anirudh", album: "Jailer" },
      { id: "3", title: "Hukum Instrumental", artist: "Anirudh", album: "Jailer" },
    ];
    const ev = evaluateStage("hukum jailer", results);
    expect(ev.accept).toBe(true);
    expect(ev.hits).toBeGreaterThanOrEqual(3);
  });
});
