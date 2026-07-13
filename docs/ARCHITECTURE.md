# Vibetune — Unified Taste System

This document explains how Vibetune's **signal layer**, **recommender**,
**home feed**, and **search ranker** fit together. They share one central
data structure — the **TasteProfile** — so every surface reflects the same
model of the user.

```text
                       ┌──────────────────────────┐
   plays / skips /     │   Signal Layer            │
   likes / searches ──▶│   listening_events        │
                       │   search_events           │
                       │   liked_songs             │
                       └──────────┬────────────────┘
                                  │  aggregated + decayed
                                  ▼
                       ┌──────────────────────────┐
                       │   TasteProfile            │
                       │   (cached 1h per user)    │
                       └──┬─────────┬─────────┬────┘
                          ▼         ▼         ▼
                     Recommender  Home Feed  Search Ranker
```

## 1. Signal layer

Three Supabase tables persist implicit and explicit user signals.

| Table              | Purpose                                                       | Written from                                        |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------------- |
| `listening_events` | Every play transition, with `end_reason`, `listened_ms`, source | `VibePlayer` via `logListenEvent`                   |
| `search_events`    | Every executed search + whether it led to a play              | `search.tsx` via `logSearchEvent` / `markSearchPlayed` |
| `user_taste_cache` | JSON snapshot of the derived profile                          | `taste.functions.ts` (`getTasteProfile`)            |

All three are RLS-scoped to `auth.uid()`. Reads use the standard
`requireSupabaseAuth` middleware.

### End reasons

`end_reason` on `listening_events` is one of:

- `completed` — the track ended naturally (YouTube state 0).
- `skipped_late` — user pressed next after 80% of the track. Counts as a
  weak positive.
- `skipped_early` — user pressed next before 5s or 15% of the track. A
  strong negative signal.
- `next_pressed` / `prev_pressed` / `abandoned` — inferred from position.
- `error` — playback failure. Ignored in scoring.

### Decay

Every event contributes with an exponential-decay weight
`0.5 ^ (age_days / 21)`. Half-life lives in
`src/lib/taste.server.ts::DECAY_HALF_LIFE_DAYS`.

## 2. TasteProfile

Built by `buildTasteProfile()` in **`src/lib/taste.server.ts`** — a pure
function of its inputs so it's fully unit-testable.

```ts
{
  topArtists: [{ name, score }, ...],   // up to 20
  languageMix: { tamil: 0.6, hindi: 0.3, english: 0.1 },
  hourBuckets: { 21: 0.4, 22: 0.35, ... },
  recentSeeds: ['a.r. rahman', 'anirudh', ...], // last 10 distinct
  discoveryOpenness: 0.42,               // 0..1
  isColdStart: 'new' | 'onboarded_no_plays' | 'active',
  computedAt: '2026-...'
}
```

The server wrapper `getTasteProfile` (in `taste.functions.ts`) reads the
1-hour cache, rebuilds if stale, and writes back to `user_taste_cache`.

**Cold start** falls into three states:

- `new` — no listening events, no onboarding artists. Fall back to
  trending tracks in the device-detected language.
- `onboarded_no_plays` — the user picked artists during onboarding but
  hasn't played anything yet. Recommendations weight `artistAffinity` and
  `languageMatch` off the seed alone.
- `active` — full formula applies.

## 3. Recommender

**`src/lib/recommender.server.ts`** exposes `recommendTracks(candidates,
profile, opts)`. It's a pure ranker — the caller supplies the candidate
pool (from YouTube search, Spotify related artists, etc.).

### Scoring formula

```
score = 0.35 * artistAffinity
      + 0.20 * languageMatch
      + 0.15 * collaborative     // related-artist neighbours
      + 0.15 * freshness         // released <60d → 1, decays after
      + 0.10 * hourFit
      + 0.05 * diversityBoost
```

All six weights live in `REC_WEIGHTS` in the same file.

### Diversity + anti-repetition

`selectDiversified` performs a two-pass greedy pick:

1. Reserve ~30% of slots (60% in discovery mode) for tracks the caller
   flagged `isDiscovery`.
2. Fill the rest with the highest-scored remaining tracks.

Both passes cap the same artist at `MAX_PER_ARTIST` and honour an
optional `excludeYoutubeIds` set (used to hide tracks played in the last
6 hours).

## 4. Home feed

**`src/lib/feed.server.ts`** owns the section plan and cache-fallback
logic. **`src/lib/feed.functions.ts`** binds it to real fetchers.

Sections, in fixed order:

1. `jump_back_in` — last 6 distinct tracks.
2. `because_you_listened_to` — top recent seed → related picks (hidden
   during cold start).
3. `made_for_you` — `recommendTracks({count: 12})` over pooled
   candidates from top-artist searches.
4. `new_releases` — Spotify new-releases in the top language.
5. `trending` — the existing YouTube "trending {lang} songs" call.
6. `discovery` — `recommendTracks({discoveryBoost: true, count: 10})`.

### Cache + fallback

Each section is composed by `composeSection`, which enforces three rules:

- If the per-section cache is still within TTL (`SECTION_TTL_MS`), return
  it without hitting the API.
- Otherwise call the fetcher. On non-empty result, return live.
- On fetcher failure OR empty result, return the cached array with
  `stale: true`. If there's no cache, return `[]` and let the client
  show the static `FALLBACK_TRACKS` playlist. **Never hide a section.**

## 5. Search ranker

**`src/lib/search-rank.server.ts`** wraps the existing "Hybrid Cascading
Search" (contextual → raw → transliteration → char-trim → fuzzy) with a
scored re-rank layer:

```
searchScore = 0.40 * exactMatchTier / 3
            + 0.25 * languageAffinity
            + 0.15 * artistAffinity
            + 0.10 * qualitySignal
            + 0.10 * popularityHint
```

`matchTierFor()` classifies each result 0..3 against the raw query. If ≥3
candidates score tier 3, the ranker returns only those — protecting exact
matches from being outranked by fuzzy hits. Typo correction stays a
"Did you mean?" hint; the ranker never silently auto-substitutes.

### Search as a taste signal

Every executed search calls `logSearchEvent` (server-side, not the
existing localStorage-only history). If the user plays a track from the
results within 60s, the client fires `markSearchPlayed` with the search
event ID and the played `youtubeId`; the row's `resulted_in_play` flag
becomes `true` and feeds `search_then_play` weight into the profile.

## 6. Where things live

```
src/lib/
├── taste.server.ts          # buildTasteProfile + decay + weights
├── taste.functions.ts       # logListenEvent, logSearchEvent, markSearchPlayed, getTasteProfile
├── recommender.server.ts    # scoreCandidate + selectDiversified + recommendTracks
├── search-rank.server.ts    # rankSearchResults + matchTierFor
├── feed.server.ts           # composeSection + planSections + SECTION_ORDER
├── feed.functions.ts        # getHomeFeed
└── (existing) youtube.server.ts / spotify.functions.ts / mix.functions.ts

src/components/VibePlayer.tsx   # emits logListenEvent with end_reason
src/routes/search.tsx           # calls logSearchEvent + rankSearchResults
src/routes/app.tsx              # consumes getHomeFeed for sections

tests/
├── taste.test.ts            # decay, aggregation, cold-start branches
├── recommender.test.ts      # scoring, diversity cap, anti-repetition
├── search-rank.test.ts      # tier merging, language affinity, exact-match protection
└── feed.test.ts             # cache-fresh, stale-fallback, empty behaviour

supabase/migrations/<ts>_taste_signals.sql  # tables + GRANTs + RLS
```

## 7. Tuning

Every weight, TTL, half-life, and cap is a named export. Change the
number, re-run tests, ship. In particular:

- `SIGNAL_WEIGHTS`, `DECAY_HALF_LIFE_DAYS` in `taste.server.ts`
- `REC_WEIGHTS`, `MAX_PER_ARTIST`, `DEFAULT_DISCOVERY_SHARE` in
  `recommender.server.ts`
- `SEARCH_WEIGHTS` in `search-rank.server.ts`
- `SECTION_TTL_MS`, `SECTION_ORDER` in `feed.server.ts`
