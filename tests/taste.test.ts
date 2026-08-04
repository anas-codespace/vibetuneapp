import { describe, it, expect } from "vitest";
import {
  buildTasteProfile,
  classifyListen,
  countReplays,
  decayWeight,
  DECAY_HALF_LIFE_DAYS,
  normalizeArtistName,
  type ListeningEventInput,
} from "../src/lib/taste.server";

const NOW = new Date("2026-01-31T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const ev = (over: Partial<ListeningEventInput> = {}): ListeningEventInput => ({
  youtube_id: "yt1",
  title: "Track",
  artist: "Anirudh Ravichander",
  started_at: daysAgo(1),
  listened_ms: 200000,
  track_ms: 210000,
  end_reason: "completed",
  context_lang: "tamil",
  hour_local: 20,
  ...over,
});

describe("decayWeight", () => {
  it("is 1 for a brand-new event", () => {
    expect(decayWeight(NOW.toISOString(), NOW)).toBe(1);
  });

  it("halves at exactly one half-life", () => {
    expect(decayWeight(daysAgo(DECAY_HALF_LIFE_DAYS), NOW)).toBeCloseTo(0.5, 6);
  });

  it("keeps decaying past the half-life", () => {
    expect(decayWeight(daysAgo(42), NOW)).toBeCloseTo(0.25, 6);
  });
});

describe("classifyListen", () => {
  it("rewards completions and penalises early skips", () => {
    expect(classifyListen(ev({ end_reason: "completed" }))).toBeGreaterThan(0);
    expect(classifyListen(ev({ end_reason: "skipped_early" }))).toBeLessThan(0);
  });

  it("treats skipped_late as a positive signal", () => {
    expect(classifyListen(ev({ end_reason: "skipped_late" }))).toBeGreaterThan(0);
  });

  it("infers from position when the reason is a raw button press", () => {
    const early = classifyListen(
      ev({ end_reason: "next_pressed", listened_ms: 2000, track_ms: 200000 }),
    );
    const late = classifyListen(
      ev({ end_reason: "next_pressed", listened_ms: 190000, track_ms: 200000 }),
    );
    expect(early).toBeLessThan(0);
    expect(late).toBeGreaterThan(0);
  });
});

describe("countReplays", () => {
  it("counts repeat plays of the same track within 24h", () => {
    const events = [
      ev({ started_at: daysAgo(1) }),
      ev({ started_at: new Date(NOW.getTime() - 23 * 3600000).toISOString() }),
    ];
    expect(countReplays(events).get("yt1")).toBe(1);
  });

  it("ignores plays more than 24h apart", () => {
    const events = [ev({ started_at: daysAgo(10) }), ev({ started_at: daysAgo(1) })];
    expect(countReplays(events).has("yt1")).toBe(false);
  });
});

describe("buildTasteProfile cold-start branches", () => {
  const empty = { events: [], likes: [], searches: [], now: NOW };

  it("classifies a brand-new user as 'new'", () => {
    const p = buildTasteProfile({ ...empty, seed: { fav_artists: [], fav_languages: [] } });
    expect(p.isColdStart).toBe("new");
    expect(p.topArtists).toHaveLength(0);
  });

  it("classifies an onboarded user with no plays", () => {
    const p = buildTasteProfile({
      ...empty,
      seed: { fav_artists: ["Anirudh Ravichander"], fav_languages: ["Tamil"] },
    });
    expect(p.isColdStart).toBe("onboarded_no_plays");
    expect(p.topArtists[0]?.name).toBe(normalizeArtistName("Anirudh Ravichander"));
    expect(p.languageMix["tamil"]).toBeCloseTo(1, 6);
  });

  it("classifies a user with plays as 'active'", () => {
    const p = buildTasteProfile({
      events: [ev()],
      likes: [],
      searches: [],
      seed: { fav_artists: [], fav_languages: [] },
      now: NOW,
    });
    expect(p.isColdStart).toBe("active");
  });
});

describe("buildTasteProfile aggregation", () => {
  it("ranks a recently-played artist above a long-ago one", () => {
    const p = buildTasteProfile({
      events: [
        ev({ artist: "Recent Artist", youtube_id: "a", started_at: daysAgo(1) }),
        ev({ artist: "Old Artist", youtube_id: "b", started_at: daysAgo(180) }),
      ],
      likes: [],
      searches: [],
      seed: { fav_artists: [], fav_languages: [] },
      now: NOW,
    });
    expect(p.topArtists[0]?.name).toBe("recent artist");
  });

  it("drops artists whose signal is net-negative", () => {
    const p = buildTasteProfile({
      events: [ev({ artist: "Rejected", youtube_id: "c", end_reason: "skipped_early" })],
      likes: [],
      searches: [],
      seed: { fav_artists: [], fav_languages: [] },
      now: NOW,
    });
    expect(p.topArtists.find((a) => a.name === "rejected")).toBeUndefined();
  });

  it("normalizes the language mix to sum to 1", () => {
    const p = buildTasteProfile({
      events: [
        ev({ youtube_id: "d", context_lang: "tamil" }),
        ev({ youtube_id: "e", context_lang: "hindi" }),
      ],
      likes: [],
      searches: [],
      seed: { fav_artists: [], fav_languages: [] },
      now: NOW,
    });
    const sum = Object.values(p.languageMix).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("boosts artists the user liked", () => {
    const p = buildTasteProfile({
      events: [],
      likes: [{ youtube_id: "x", artist: "Liked Artist", created_at: daysAgo(1) }],
      searches: [],
      seed: { fav_artists: [], fav_languages: [] },
      now: NOW,
    });
    expect(p.topArtists[0]?.name).toBe("liked artist");
  });

  it("counts search language affinity", () => {
    const p = buildTasteProfile({
      events: [],
      likes: [],
      searches: [
        {
          normalized_query: "jailer",
          language: "tamil",
          resulted_in_play: true,
          created_at: daysAgo(1),
        },
      ],
      seed: { fav_artists: [], fav_languages: [] },
      now: NOW,
    });
    expect(p.languageMix["tamil"]).toBeCloseTo(1, 6);
  });
});
