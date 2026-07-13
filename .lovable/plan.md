# Vibetune — Unified Taste System Architecture

One shared **TasteProfile** feeds all four surfaces. Signals in → profile → recs / feed / search ranking → user actions → more signals.

## 1. What exists today (from codebase audit)

- **APIs:** YouTube (primary playback + search, `src/lib/youtube.server.ts`), Spotify (metadata + user library sync, `src/lib/spotify.*`), Deezer (artist images only), LRCLIB (lyrics).
- **DB tables:** `profiles` (with `fav_languages TEXT[]`, `fav_artists JSONB`, `onboarded`), `songs` (catalog cache, mostly unused), `listening_history` (play-start only — no skip/completion/position), `liked_songs`, `playlists`, `playlist_songs`, `spotify_tokens`.
- **Search:** 5-step cascade already in place (contextual → raw → transliteration → char-trim → autocomplete + Levenshtein) with client-side title+album re-rank. Language flag threaded through. `exactMatch` is deprecated/no-op.
- **Home feed (`src/routes/app.tsx`):** 4 carousels + a 6-tile Quick Picks grid, but "Popular Radios" / "New Releases" are just slices of the same array. Sections are keyed off `fav_artists` and `fav_languages[0]`, not listening behaviour.
- **Player:** every `play/next/prev/jump` writes one `listening_history` row. Ended-naturally, skipped-early, and errored are indistinguishable. Auto-queue via `getContextualQueue`, mix-mode replenish via `getSmartMix`.

## 2. Gaps this design closes

- No skip / completion / skip-timing signals.
- No search-history signal (localStorage only, never reaches server).
- No time-of-day / session context.
- No decayed play counts — `getSmartMix` re-counts rows every call with no recency weighting.
- Home feed and recommendations don't share a scoring model; both re-derive taste ad-hoc.
- No cold-start distinction between "onboarded, no plays" vs "brand new".
- No cache for feed sections → every home visit refetches YouTube.

## 3. High-level shape

```text
                       ┌──────────────────────────┐
   plays / skips /     │   Signal Layer            │
   likes / searches ──▶│   (writes)                │
                       │   listening_events        │
                       │   search_events           │
                       └──────────┬────────────────┘
                                  │  read + decay
                                  ▼
                       ┌──────────────────────────┐
                       │   TasteProfile builder    │
                       │   (pure fn, cached 1h)    │
                       │   → top artists,          │
                       │     top languages,        │
                       │     genre weights,        │
                       │     hour-of-day buckets   │
                       └──┬─────────┬─────────┬────┘
                          │         │         │
                          ▼         ▼         ▼
                     Recommender  Home Feed  Search Ranker
                     (mix / queue) (sections) (re-rank layer)
```

## 4. The four systems

### 4A. Signal Layer (foundation)

**New tables** (migration):

- `listening_events` — replaces the write path of `listening_history` (keep the old table as a read-compat view for the History page).
  Columns: `id, user_id, youtube_id, title, artist, started_at, ended_at NULL, listened_ms, track_ms, end_reason ENUM('completed','skipped_early','skipped_late','next_pressed','prev_pressed','error','abandoned'), source ENUM('search','feed','queue','mix','playlist','liked','related'), context_lang TEXT NULL, hour_local SMALLINT`.
  - `skipped_early` = ended before 5s or before 15% of track_ms.
  - `skipped_late` = ended after 80% of track_ms (counts as a positive signal, not a skip).
  - Written from `VibePlayer` — see §5.
- `search_events` — `user_id, raw_query, normalized_query, language, resulted_in_play BOOLEAN, top_result_youtube_id NULL, created_at`.
- `user_taste_cache` — `user_id PRIMARY KEY, profile JSONB, computed_at TIMESTAMPTZ`. 1h TTL; rebuild on read if stale.

Grants + RLS scoped to `auth.uid()` on all three. Service_role for admin. No anon.

**Decay model** — half-life = 21 days.
`weight(event) = 0.5 ^ (age_days / 21)`
Applied at profile build time, not stored per-event, so it's tunable without a backfill.

**Signal weights** (feed into TasteProfile aggregation):

| Signal              | Weight |
| ------------------- | ------ |
| like                | +3.0   |
| playlist add        | +2.5   |
| completed play      | +2.0   |
| skipped_late        | +1.5   |
| replay (same track ≤ 24h) | +1.0 each extra |
| search-then-play    | +1.0   |
| search only         | +0.3   |
| skipped_early       | −2.0   |
| error               | 0      |

### 4B. TasteProfile

Pure function `buildTasteProfile(events, likes, playlists, profile)` in `src/lib/taste.server.ts` (unit-testable, no DB imports). Output shape:

```ts
type TasteProfile = {
  topArtists: Array<{ name: string; score: number }>;      // top 20
  languageMix: Record<string, number>;                     // normalized 0..1
  hourBuckets: Record<0..23, number>;                      // play density
  recentSeeds: string[];                                   // last 10 distinct artists played
  discoveryOpenness: number;                               // 0..1 from skip rate of unknown artists
  isColdStart: 'new' | 'onboarded_no_plays' | 'active';
};
```

Wrapped by `getTasteProfile()` server fn (auth-gated) that reads `user_taste_cache`, rebuilds if >1h old.

### 4C. Recommendation / Suggestion engine

`recommendTracks(profile, opts)` — pure ranker, then hydrated via YouTube/Spotify.

**Formula:**
```
score = 0.35 * artistAffinity      // artist match against topArtists
      + 0.20 * languageMatch       // languageMix[track.lang]
      + 0.15 * collaborative       // Spotify related/genre neighbour of a top artist
      + 0.15 * freshness           // 1 if released <60d, decays after
      + 0.10 * hourFit             // hourBuckets[currentHour] match
      + 0.05 * diversityBoost      // penalty if artist already appeared in last 5 recs
```

- **Cold-start:**
  - `new` (no profile, no onboarding) → trending in device-detected language, fallback Tamil.
  - `onboarded_no_plays` → seed from `fav_artists` + `fav_languages`, all weight on artistAffinity + languageMatch.
  - `active` → full formula.
- **Diversity:** greedy re-rank after scoring — cap 2 tracks per artist per section, inject 30% "adjacent" picks (related-artist neighbours the user hasn't played).
- **Anti-repetition:** exclude any track played in last 6h unless mix-mode explicitly wants replays.

### 4D. Home Feed

`buildHomeFeed(profile)` server fn returns an array of sections. Each section is `{ id, title, kind, tracks[], stale: boolean }`.

Sections (in order, some conditional):

1. **Jump back in** — last 6 distinct tracks (recency-only, no scoring).
2. **Because you listened to {artist}** — top-1 recent seed → related picks (skipped when `isColdStart !== 'active'`).
3. **Made for you** — `recommendTracks(profile, {count: 12})`.
4. **New releases in {top language}** — Spotify new-releases filtered by top language + related-artist genres.
5. **Trending in {language}** — current YouTube trending call (kept as-is).
6. **Discovery mix** — `recommendTracks(profile, {discoveryBoost: true, count: 10})` — deliberately raises the 30% adjacent share to 60%.

**Ranking across sections** = fixed order above; within a section = the recommender score.

**Cache + fallback strategy:**
- Each section cached in `user_taste_cache.profile.feed[sectionId]` with `stale_at`. TTL: Jump back in = 1min, others = 1h.
- On API failure: return the last cached `tracks[]` with `stale: true`. If no cache: `FALLBACK_TRACKS` (existing) tagged with section title. Never hide a section.
- Manual refresh (pull-to-refresh on home) forces regeneration.

### 4E. Search Ranker

Keep the existing 5-step YouTube cascade and Spotify contextual→raw cascade. Add a **ranking layer** on top:

```
searchScore = 0.40 * exactMatchTier   // 3 if quoted-exact, 2 if all-tokens, 1 if any-token, 0 fuzzy
            + 0.25 * languageAffinity // profile.languageMix[detectedLang]
            + 0.15 * artistAffinity   // profile.topArtists match
            + 0.10 * qualitySignal    // existing HIGH_QUALITY_RE / channel tier
            + 0.10 * popularityHint   // Spotify popularity when available
```

- **Exact-match first pass** = the quoted `"query"` variant. If ≥3 results at tier 3, return only those. Otherwise merge tier 3 → tier 2 → …
- **Typo tolerance** stays as "Did you mean?" hint only (never auto-substitute) — matches current UX decision.
- **Search-as-signal:** every `spotifySearchPlayable` / `searchYouTubeWithCorrection` call from `search.tsx` fires `logSearchEvent({ query, language })`. When a track from the results is played within 60s, mark `resulted_in_play=true` and `top_result_youtube_id` on that row.

## 5. Player wiring (skip / completion capture)

`src/components/VibePlayer.tsx` changes:

- Track `playStartedAt` and `lastKnownPositionMs` per current track.
- On any transition (`next`, `prev`, `jumpToQueueIndex`, YT `onStateChange==0`, `onError`), compute `end_reason` from position vs duration and call `logListenEvent({...})` before switching.
- Fire-and-forget. Never block playback on the write.
- Keep the old `logListen(started_at only)` call for backwards compat with the existing History page for one release, then remove.

## 6. Files & folders

```text
src/lib/
├── taste.server.ts             # pure buildTasteProfile + scoring fns
├── taste.functions.ts          # getTasteProfile, logListenEvent, logSearchEvent
├── recommender.server.ts       # pure recommendTracks + diversity re-rank
├── recommender.functions.ts    # getRecommendations
├── feed.server.ts              # pure buildHomeFeed section builders
├── feed.functions.ts           # getHomeFeed
├── search-rank.server.ts       # pure searchScore + tiering
└── (existing) youtube.server.ts / spotify.functions.ts unchanged in signature

src/components/VibePlayer.tsx   # emit listen events with end_reason
src/routes/app.tsx              # consume getHomeFeed instead of ad-hoc sections
src/routes/search.tsx           # call logSearchEvent + apply search-rank re-ranker

supabase/migrations/<ts>_taste_signals.sql
  - listening_events, search_events, user_taste_cache + GRANTs + RLS

tests/
├── taste.test.ts               # decay, aggregation, cold-start branches
├── recommender.test.ts         # scoring, diversity cap, anti-repetition
├── feed.test.ts                # section fallback, cache staleness
└── search-rank.test.ts         # tier merging, language affinity
```

All scoring/ranking is pure functions in `*.server.ts` files, taking plain data and returning plain data — no Supabase, no fetch — so unit tests need zero mocks.

## 7. Rollout order (once you approve)

1. Migration + grants for the 3 new tables.
2. `taste.server.ts` + `taste.functions.ts` + unit tests.
3. VibePlayer wiring for `listening_events` (keeps old writes running in parallel).
4. `recommender.*` + tests.
5. `feed.*` + `app.tsx` refactor + tests.
6. `search-rank.*` + `search.tsx` re-ranker + `logSearchEvent` + tests.

Each step ships independently and the app stays working between them.

## 8. Explicitly out of scope (unless you say otherwise)

- Cross-user collaborative filtering (no matrix factorisation / embeddings — Spotify's related-artist endpoint is the proxy).
- On-device ML.
- Persisting the player queue across refresh (separate feature).
- Backfilling `songs.mood_tag` — the column stays unused.

---

**Please confirm or edit** before I start implementing:
- Signal weights in §4A and formula weights in §4C/§4E.
- 21-day half-life for decay.
- 1h cache TTL for TasteProfile + feed sections.
- Section list and order in §4D.
- Whether to keep `listening_history` as a compat view or migrate the History page in the same pass.
