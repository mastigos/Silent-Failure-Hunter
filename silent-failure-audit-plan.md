# Silent Failure Audit — Plan

## Top-Level Overview

Audit the `demo-app` Node/Express application for four categories of silent
failures: data-contract mismatches, fail-open security logic, race conditions,
and swallowed errors. Each finding is a bug that produces incorrect behavior
or data without throwing an error, logging a meaningful warning, or being
caught by a linter or shallow review. The plan investigates and documents each
bug in isolation, then applies a minimal, targeted fix.

Files in scope:
- `src/lib/auth.js`
- `src/lib/db.js`
- `src/lib/fetchWithRetry.js`
- `src/routes/admin.js`
- `src/routes/leaderboard.js`
- `src/routes/profile.js`
- `src/routes/pricing.js`

---

## Sub-Tasks

---

### Sub-Task 1 — Data Contract Mismatch: `username` vs `user_name` in profile route

**Intent**
Fix the field-name mismatch between the POST writer and the GET reader in
`src/routes/profile.js`. The write path stores `user_name` but the read path
accesses `username`, so every GET response silently returns `username: undefined`.

**Expected Outcomes**
- POST `/profile` stores the field under a consistent, single canonical name.
- GET `/profile/:id` reads the same field name and returns the correct value.
- No schema or test change introduces new ambiguity.

**Todo List**
1. Read `src/routes/profile.js` in full.
2. Identify the exact field name used in `users.set(...)` (currently `user_name`).
3. Change the GET read path to use `user.user_name` (or standardise both sides
   to `username` — pick one and apply it consistently to both the write and
   the read).
4. Confirm no other file reads from the `users` store expecting either field name.
5. Verify the fix by tracing the round-trip: POST stores → GET returns the same
   value.

**Relevant Context**
- Write: `src/routes/profile.js` ~line 12 — `users.set(id, { id, user_name, email })`
- Read:  `src/routes/profile.js` ~line 20 — `res.json({ ..., username: user.username, ... })`
- Store: `src/lib/db.js` — `users` Map (no schema enforcement)

**Status:** `[ ] pending`

---

### Sub-Task 2 — Fail-Open Logic: `isAdmin` returns `true` on permission-service error

**Intent**
Fix `src/lib/auth.js` so that when `lookupRole(userId)` throws (e.g., a
permission-service timeout), the function denies access rather than granting it.
This is a critical security defect: any user that triggers a service error is
silently promoted to admin.

**Expected Outcomes**
- `isAdmin(userId)` returns `false` (or re-throws) when `lookupRole` throws.
- The `DELETE /admin/wipe-data` route rejects requests from non-admins even if
  the permission service is degraded.
- No legitimate admin workflow is disrupted.

**Todo List**
1. Read `src/lib/auth.js` in full.
2. Change the `catch` branch in `isAdmin` from `return true` to `return false`
   (fail-closed) — or re-throw the error if the route is expected to handle it.
3. Read `src/routes/admin.js` to confirm how `isAdmin`'s return value is used.
4. Decide: should the route return 403 (false returned) or 503 (error thrown)?
   Prefer fail-closed `return false` unless the route already has its own
   error handler that would produce a meaningful 503.
5. Confirm the fix by tracing: service error → `isAdmin` returns false →
   route returns 403.

**Relevant Context**
- Bug: `src/lib/auth.js` ~line 22 — `catch (err) { return true; }`
- Consumer: `src/routes/admin.js` ~line 9 — `if (!isAdmin(userId)) return 403`
- Trigger: `lookupRole('flaky-user')` throws `'permission service timeout'`

**Status:** `[ ] pending`

---

### Sub-Task 3 — Race Condition: Read-Modify-Write on leaderboard shared state

**Intent**
Fix the race condition in `src/routes/leaderboard.js` where two concurrent
POST requests for the same `userId` can both read the same stale score, then
race to write — causing the lower score to overwrite the higher one silently.

**Expected Outcomes**
- Concurrent score updates for the same user always converge to the highest
  submitted score.
- No lock library or external dependency is needed (the in-memory Map is the
  only store involved).
- The fix is contained to the route handler; no other files change.

**Todo List**
1. Read `src/routes/leaderboard.js` in full.
2. Remove the artificial `setTimeout` delay (it is the race-window amplifier)
   or, if it represents real I/O, move the second `leaderboard.get()` read to
   occur *after* the await, so the comparison uses a fresh value.
3. After the await, re-read `leaderboard.get(userId)` to get the current state
   before writing, so the comparison and write use the latest value rather than
   the value snapshotted before the delay.
4. Confirm the fix by tracing the concurrent scenario: two requests that read
   the same initial value will each re-read after their delay and the second
   write will correctly see the first write's result.

**Relevant Context**
- Read:  `src/routes/leaderboard.js` ~line 16 — `const current = leaderboard.get(userId)`
- Delay: `src/routes/leaderboard.js` ~line 19 — `await new Promise(setTimeout, random*50)`
- Write: `src/routes/leaderboard.js` ~line 27 — `if (newScore > current.score) leaderboard.set(...)`
- The stale `current` from before the delay is used in the comparison after the delay.

**Status:** `[ ] pending`

---

### Sub-Task 4 — Swallowed Error: Stale cache returned as fresh data after all retries fail

**Intent**
Fix `src/lib/fetchWithRetry.js` so that when all three fetch attempts fail,
the function signals the failure to its caller rather than silently returning
stale cached data as if it were a live, successful response. The pricing route
(`src/routes/pricing.js`) currently serves a hard-coded stale price with HTTP
200 and no indication that the data is old or that the upstream service is down.

**Expected Outcomes**
- When all retries are exhausted, `getPriceWithRetry` either throws or returns
  an object that explicitly marks the data as from cache (e.g., `{ ..., fromCache: true, error: 'service unavailable' }`).
- `src/routes/pricing.js` detects the failure signal and returns an appropriate
  HTTP response (e.g., 503 with a stale-data warning, or 200 with a clear
  `fromCache: true` flag so callers can decide).
- No retry behaviour changes; only the exhausted-retries path changes.

**Todo List**
1. Read `src/lib/fetchWithRetry.js` in full.
2. On the last retry failure, change `return staleCache` to throw an error (or
   return `{ ...staleCache, fromCache: true, liveError: err.message }`).
3. Read `src/routes/pricing.js` to see how the return value is used.
4. In `src/routes/pricing.js`, catch a thrown error and return a 503; OR check
   for `fromCache: true` in the result and include that signal in the response.
5. Confirm the fix by tracing: all 3 attempts throw → caller receives a clear
   failure signal → HTTP client sees either 503 or a response body that
   explicitly marks the data as stale.

**Relevant Context**
- Bug:      `src/lib/fetchWithRetry.js` ~line 20 — `if (attempt === 3) { return staleCache; }`
- Consumer: `src/routes/pricing.js` ~line 6  — `const price = await getPriceWithRetry(...); res.json(price)`
- Stale cache is `{ itemId: 'widget-1', price: 9.99, cachedAt: 'yesterday' }` — no freshness metadata

**Status:** `[ ] pending`

---

## Notes for Implementation

- Each sub-task is independent and should be committed (or reviewed) separately.
- Fixes should be minimal: change only the lines responsible for the defect.
- No new dependencies, no test scaffolding, no refactoring beyond what the fix
  requires.
- Sub-tasks 1 and 2 are purely synchronous and straightforward.
- Sub-task 3 requires careful placement of the second `.get()` call relative
  to the `await`.
- Sub-task 4 has two files to touch (the library and the route); keep both
  changes minimal and consistent.
