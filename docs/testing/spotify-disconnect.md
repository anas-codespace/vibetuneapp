# Spotify Disconnect — Test Plan

Covers the four scenarios in `src/routes/settings.spotify.tsx` → `disconnectMut`
and `spotifyDisconnect` in `src/lib/spotify.functions.ts`.

Prereqs: signed in, Spotify connected (status pill = **Connected**, display name shown).

---

## 1. Confirmation prompt

**Steps**
1. Open **Profile → Spotify settings**.
2. Click **Disconnect** in the connection card header.

**Expected**
- Modal appears with title "Disconnect Spotify?" and Cancel / Confirm buttons.
- Backdrop click and **Cancel** close the modal with no network request (verify Network tab shows no `spotifyDisconnect` call).
- Status pill still reads **Connected**.

---

## 2. Token clearing (server-side)

**Steps**
1. Open the modal, click **Confirm disconnect**.
2. After the toast "Spotify disconnected", query the backend:

```sql
select count(*) from spotify_tokens where user_id = auth.uid();
```

**Expected**
- `count = 0` for the current user.
- Reloading the page keeps the pill on **Disconnected** (no stale row rehydrates it).

---

## 3. Optimistic UI update

**Steps**
1. In DevTools → Network, throttle to **Slow 3G** (so the request is visibly slow).
2. Click **Disconnect → Confirm disconnect**.

**Expected**
- Pill flips to **Disconnected** and the display name disappears **before** the `spotifyDisconnect` POST resolves (driven by `onMutate` → `qc.setQueryData(["spotify-connection"], null)`).
- Modal closes on success; toast reads "Spotify disconnected".
- `spotify-playlists` query is removed (import panels disappear).

---

## 4. Failure rollback

Simulate a server failure to verify `onError` restores the connected state.

**Option A — offline**
1. DevTools → Network → **Offline**.
2. Click **Disconnect → Confirm disconnect**.

**Option B — patched fetch (paste in console before confirming)**
```js
const _f = window.fetch;
window.fetch = (u, o) => String(u).includes("spotifyDisconnect")
  ? Promise.resolve(new Response("boom", { status: 500 }))
  : _f(u, o);
```

**Expected**
- Pill briefly shows **Disconnected** (optimistic), then rolls back to **Connected** once `onError` invalidates `["spotify-connection"]` and it refetches the still-present tokens.
- Red toast: "Couldn't disconnect Spotify" (or server message).
- `spotify_tokens` row still exists for the user (re-run the SQL from §2 → `count = 1`).
- Clicking **Disconnect** again after restoring the network succeeds normally.

---

## Regression checklist

- [ ] Cancel does not call the server.
- [ ] Confirm removes the row from `spotify_tokens`.
- [ ] Pill flips before the network response completes.
- [ ] On 5xx/offline, pill returns to **Connected** and tokens remain.
- [ ] After a successful disconnect, `spotify-playlists` cached queries are gone.
