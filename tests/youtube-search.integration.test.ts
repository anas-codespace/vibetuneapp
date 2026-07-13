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
      channelId: overrides.channelId ?? "UCq-Fj5jknLsUf-MWSy4_brA", // T-Series (whitelisted)
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

    const { calls } = installFetchMock((call) => {
      if (call.endpoint === "search") {
        const q = (call.q ?? "").toLowerCase();
        // Attempt 1: contextual — includes "tamil" — return NO items.
        if (q.includes("tamil")) return { items: [] };
        // Attempt 2: raw — no language suffix — return one hit.
        return { items: [{ id: { videoId: "vidHUKUM1" } }] };
      }
      if (call.endpoint === "videos") {
        return {
          items: [
            videoItem({
              id: "vidHUKUM1",
              title: "Hukum (Official Audio) - Jailer",
              channelTitle: "T-Series",
            }),
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

    // Track came from the raw attempt — no "did you mean" correction.
    expect(correctedQuery).toBeNull();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.youtubeId).toBe("vidHUKUM1");
    expect(tracks[0]!.title.toLowerCase()).toContain("hukum");
  });

  it("returns contextual results without invoking the raw fallback when attempt 1 succeeds", async () => {
    const query = "hukum-cascade-b";

    const { calls } = installFetchMock((call) => {
      if (call.endpoint === "search") {
        return { items: [{ id: { videoId: "vidHUKUM2" } }] };
      }
      if (call.endpoint === "videos") {
        return {
          items: [
            videoItem({
              id: "vidHUKUM2",
              title: "Hukum Official Audio — Anirudh",
              channelTitle: "Sony Music South",
              channelId: "UCn4rEMqKtwBQ6-oEwbd4PcA",
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
    // Only one search — contextual attempt sufficed.
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]!.q!.toLowerCase()).toContain("tamil");

    expect(correctedQuery).toBeNull();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.youtubeId).toBe("vidHUKUM2");
  });

  it("returns [] when neither the contextual nor the raw attempt yield hits", async () => {
    const query = "zzz-none-cascade";

    const { calls } = installFetchMock((call) => {
      if (call.endpoint === "search") return { items: [] };
      if (call.endpoint === "videos") return { items: [] };
      return {};
    });

    const { tracks, correctedQuery } = await searchMusicWithCorrection(query, 10, {
      language: "Tamil",
    });

    const searchCalls = calls.filter((c) => c.endpoint === "search");
    // Contextual + raw + a couple of transliteration / trim-last-char / suggestion
    // attempts may run. The invariant we care about: BOTH contextual and raw fired.
    expect(searchCalls.some((c) => c.q!.toLowerCase().includes("tamil"))).toBe(true);
    expect(searchCalls.some((c) => !c.q!.toLowerCase().includes("tamil"))).toBe(true);

    expect(tracks).toEqual([]);
    expect(correctedQuery).toBeNull();
  });
});
