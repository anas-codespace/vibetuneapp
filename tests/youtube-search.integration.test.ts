/**
 * Integration test — Hybrid Cascading Search
 *
 * Verifies that `searchMusicWithCorrection` falls back from a contextual
 * (language-appended) query to the raw query when the first attempt returns
 * zero results. Single-word queries like "hukum" were previously broken by
 * strict phrase quoting + a mandatory language suffix; the cascade fixes it.
 *
 * The YouTube Data API is fully mocked via a `fetch` stub — no network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.YOUTUBE_API_KEY = "test-key";

// Import AFTER env is set so `key()` at first call sees the value.
import { searchMusicWithCorrection } from "@/lib/youtube.server";

/** Build a plausible YouTube /videos response item. */
function videoItem(overrides: {
  id: string;
  title: string;
  channelId?: string;
  channelTitle?: string;
  durationSec?: number;
  embeddable?: boolean;
}) {
  const sec = overrides.durationSec ?? 210;
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return {
    id: overrides.id,
    snippet: {
      title: overrides.title,
      // Default channel is T-Series (in the whitelist), keeping results on the
      // "tier1 >= 3" happy path so results survive the tiered filter.
      channelId: overrides.channelId ?? "UCq-Fj5jknLsUf-MWSy4_brA",
      channelTitle: overrides.channelTitle ?? "T-Series",
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${overrides.id}/hq.jpg` } },
    },
    contentDetails: { duration: `PT${mm}M${ss}S` },
    status: { embeddable: overrides.embeddable ?? true },
  };
}

interface Call {
  endpoint: "search" | "videos" | "other";
  q: string | null;
  url: string;
}

function installFetchMock(handler: (call: Call) => unknown) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const u = new URL(url);
    const endpoint: Call["endpoint"] = u.pathname.endsWith("/search")
      ? "search"
      : u.pathname.endsWith("/videos")
        ? "videos"
        : "other";
    const call: Call = { endpoint, q: u.searchParams.get("q"), url };
    calls.push(call);
    const body = handler(call);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", impl);
  return { calls, impl };
}

describe("Hybrid Cascading Search — searchMusicWithCorrection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to raw query when the contextual (language-suffixed) attempt returns 0", async () => {
    // Unique query keeps this run independent of the module-level SEARCH_CACHE.
    const query = "hukum-cascade-a";
    const rawIds = ["vidHUKUM1", "vidHUKUM2", "vidHUKUM3"];

    const { calls } = installFetchMock((call) => {
      if (call.endpoint === "search") {
        const q = (call.q ?? "").toLowerCase();
        // Attempt 1: contextual — includes "tamil" — return NO items.
        if (q.includes("tamil")) return { items: [] };
        // Attempt 2: raw — no language suffix — return whitelisted hits.
        return { items: rawIds.map((id) => ({ id: { videoId: id } })) };
      }
      if (call.endpoint === "videos") {
        return {
          items: [
            videoItem({ id: "vidHUKUM1", title: "Hukum Official Audio Jailer" }),
            videoItem({ id: "vidHUKUM2", title: "Hukum Official Video Song" }),
            videoItem({ id: "vidHUKUM3", title: "Hukum Full Video Song" }),
          ],
        };
      }
      return {};
    });

    const { tracks, correctedQuery } = await searchMusicWithCorrection(query, 10, {
      language: "Tamil",
    });

    // Two search calls: one contextual (with Tamil), one raw (without).
    const searchCalls = calls.filter((c) => c.endpoint === "search");
    expect(searchCalls.length).toBeGreaterThanOrEqual(2);
    expect(searchCalls[0]!.q!.toLowerCase()).toContain("tamil");
    expect(searchCalls[1]!.q!.toLowerCase()).not.toContain("tamil");
    // The raw attempt still sends the user term.
    expect(searchCalls[1]!.q!.toLowerCase()).toContain(query.toLowerCase());

    // Tracks came from the raw attempt — no "did you mean" correction surfaced.
    expect(correctedQuery).toBeNull();
    expect(tracks.length).toBeGreaterThan(0);
    const ids = tracks.map((t) => t.youtubeId);
    expect(ids).toContain("vidHUKUM1");
    for (const t of tracks) expect(t.title.toLowerCase()).toContain("hukum");
  });

  it("returns contextual results without invoking the raw fallback when attempt 1 succeeds", async () => {
    const query = "hukum-cascade-b";
    const ids = ["vidCTX1", "vidCTX2", "vidCTX3"];

    const { calls } = installFetchMock((call) => {
      if (call.endpoint === "search") {
        return { items: ids.map((id) => ({ id: { videoId: id } })) };
      }
      if (call.endpoint === "videos") {
        return {
          items: [
            videoItem({ id: "vidCTX1", title: "Hukum Official Audio Anirudh" }),
            videoItem({ id: "vidCTX2", title: "Hukum Official Video" }),
            videoItem({
              id: "vidCTX3",
              title: "Hukum Full Song",
              channelId: "UCn4rEMqKtwBQ6-oEwbd4PcA",
              channelTitle: "Sony Music South",
            }),
          ],
        };
      }
      return {};
    });

    const { tracks, correctedQuery } = await searchMusicWithCorrection(query, 10, {
      language: "Tamil",
    });

    const searchCalls = calls.filter((c) => c.endpoint === "search");
    // Only one search — contextual attempt sufficed, raw fallback never fired.
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]!.q!.toLowerCase()).toContain("tamil");

    expect(correctedQuery).toBeNull();
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.map((t) => t.youtubeId)).toContain("vidCTX1");
  });

  it("returns [] when neither the contextual nor the raw attempt yield hits", async () => {
    const query = "zzz-none-cascade";

    const { calls } = installFetchMock(() => ({ items: [] }));

    const { tracks, correctedQuery } = await searchMusicWithCorrection(query, 10, {
      language: "Tamil",
    });

    const searchCalls = calls.filter((c) => c.endpoint === "search");
    // Invariant: the cascade fired BOTH the contextual and the raw attempts.
    expect(searchCalls.some((c) => c.q!.toLowerCase().includes("tamil"))).toBe(true);
    expect(searchCalls.some((c) => !c.q!.toLowerCase().includes("tamil"))).toBe(true);

    expect(tracks).toEqual([]);
    expect(correctedQuery).toBeNull();
  });
});
