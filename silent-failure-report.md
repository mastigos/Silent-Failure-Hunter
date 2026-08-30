# Silent Failure Report

Findings ordered by severity — most dangerous first.
Each entry includes a one-line slide summary followed by a full explanation.

---

## Finding 1 — Fail-Open Auth · CRITICAL

**Slide:** `isAdmin()` returns `true` when the permission service throws, so any
user who triggers a timeout is silently granted admin privileges.

### Files
- [`src/lib/auth.js`](src/lib/auth.js) — `isAdmin()`, line 20–22
- [`src/routes/admin.js`](src/routes/admin.js) — `DELETE /admin/wipe-data`, line 9

### What the code actually does
`isAdmin(userId)` calls `lookupRole(userId)` inside a `try/catch`. When
`lookupRole` throws (the demo triggers this for `'flaky-user'` on line 6–8 of
[`src/lib/auth.js`](src/lib/auth.js)), the catch branch executes:

```js
// src/lib/auth.js  lines 20-23
} catch (err) {
  // Should fail CLOSED (return false) - instead fails OPEN.
  return true; // <-- the bug
}
```

The route in [`src/routes/admin.js`](src/routes/admin.js) reads:

```js
// src/routes/admin.js  lines 9-11
if (!isAdmin(userId)) {
  return res.status(403).json({ error: 'forbidden' });
}
// ... destructive action proceeds
```

Because `isAdmin` returns `true`, `!isAdmin(userId)` is `false`, the guard is
skipped, and the destructive `DELETE /admin/wipe-data` action proceeds.

### Why it is a silent failure
- No exception propagates — `isAdmin` returns a normal boolean.
- The response to the caller is a clean HTTP 200; nothing in the logs indicates
  an access-control bypass occurred.
- A unit test that only tests the happy path (`role === 'admin'` → `true`,
  `role === 'guest'` → `false`) will pass; the error path is untested.
- A linter sees a perfectly valid `try/catch` returning a boolean either way.

### Root cause
The developer intended the catch as "something went wrong, let the request
through anyway." The correct security invariant is the opposite: uncertainty
about a principal's role must default to least privilege (denial), not to
maximum privilege (grant).

### Suggested fix
```js
} catch (err) {
  return false; // fail-closed: deny access when role cannot be determined
}
```
If downstream callers need to distinguish "not admin" from "service error,"
re-throw the error and let [`src/routes/admin.js`](src/routes/admin.js) catch
it and return 503.

---

## Finding 2 — Swallowed Error (Stale Pricing) · HIGH

**Slide:** After three failed retries `getPriceWithRetry()` silently returns
yesterday's cached price as if it were live data, with an HTTP 200 and no
staleness flag.

### Files
- [`src/lib/fetchWithRetry.js`](src/lib/fetchWithRetry.js) — `getPriceWithRetry()`, lines 14–24
- [`src/routes/pricing.js`](src/routes/pricing.js) — `GET /pricing/price/:itemId`, lines 5–8

### What the code actually does
`fetchLivePrice` always throws `'pricing service unavailable'` (line 4 of
[`src/lib/fetchWithRetry.js`](src/lib/fetchWithRetry.js)). The retry loop runs
three times; on the third failure it falls into:

```js
// src/lib/fetchWithRetry.js  lines 18-21
} catch (err) {
  if (attempt === 3) {
    return staleCache; // <-- the bug: silently returns stale data
  }
}
```

`staleCache` is `{ itemId: 'widget-1', price: 9.99, cachedAt: 'yesterday' }`.
The pricing route in [`src/routes/pricing.js`](src/routes/pricing.js) does:

```js
// src/routes/pricing.js  lines 6-7
const price = await getPriceWithRetry(req.params.itemId);
res.json(price); // Looks like a normal successful response.
```

The HTTP client receives `{ itemId: 'widget-1', price: 9.99, cachedAt: 'yesterday' }`
with status 200 — indistinguishable from a live response.

### Why it is a silent failure
- The function signature is `async () => Object` in both the success and
  fallback paths; the return type gives no signal.
- The response body carries no `fromCache`, `error`, or freshness fields that
  a downstream system could check.
- The HTTP status is 200; monitoring systems that alert on 5xx will never fire.
- Automated tests that mock `fetchLivePrice` to succeed will never exercise
  this path.

### Root cause
The developer added a best-effort cache fallback but did not add any way for
callers to distinguish "live price" from "stale fallback." The contract
between `getPriceWithRetry` and its callers is broken: the caller assumes the
returned object is always fresh.

### Suggested fix
Option A — throw on exhaustion (caller returns 503):
```js
if (attempt === 3) {
  throw new Error(`pricing service unavailable after 3 attempts: ${err.message}`);
}
```
Then in [`src/routes/pricing.js`](src/routes/pricing.js):
```js
try {
  const price = await getPriceWithRetry(req.params.itemId);
  res.json(price);
} catch (err) {
  res.status(503).json({ error: err.message });
}
```

Option B — flag the response (caller can still serve stale data, but honestly):
```js
if (attempt === 3) {
  return { ...staleCache, fromCache: true, liveError: err.message };
}
```

---

## Finding 3 — Race Condition (Leaderboard) · HIGH

**Slide:** Two concurrent score-update requests both read the same stale score
before either writes, so the last writer always wins regardless of which score
is higher.

### Files
- [`src/routes/leaderboard.js`](src/routes/leaderboard.js) — `POST /:userId/score`, lines 12–31

### What the code actually does
```js
// src/routes/leaderboard.js  lines 16-28
const current = leaderboard.get(userId) || { score: 0 };   // READ (snapshot)

// Simulated async I/O delay - this is where the race window opens.
await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));

// Comparison uses the PRE-DELAY snapshot, not the current value.
if (newScore > current.score) {
  leaderboard.set(userId, { score: newScore, updatedAt: Date.now() });
}
```

Two concurrent requests for the same `userId`:
1. Both read `current.score = 100` before either yields.
2. Request B (newScore=150) finishes its delay first, compares 150 > 100 ✓, writes 150.
3. Request A (newScore=120) finishes later, compares 120 > 100 ✓ (using the
   stale snapshot), writes 120 — overwriting the correct value of 150.

The leaderboard now shows 120. Both requests returned `{ status: 'ok' }`.

### Why it is a silent failure
- Both responses are HTTP 200 with `{ status: 'ok' }`.
- No exception is thrown at any point.
- A sequential test (single request at a time) always passes.
- Even a load test may miss it without a precise timing harness that checks the
  final stored value against the maximum submitted value.
- JavaScript is single-threaded, which gives developers a false sense that race
  conditions cannot occur — but `await` yields the event loop and multiple
  requests interleave freely.

### Root cause
The read and the write are not atomic. The stale snapshot captured before
`await` is used as the comparison baseline after `await`. Any concurrent
mutation during the delay window is invisible to the handler.

### Suggested fix
Move the read to *after* the await so the comparison always uses fresh state:

```js
// src/routes/leaderboard.js — fixed
await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));

const current = leaderboard.get(userId) || { score: 0 }; // read AFTER delay
if (newScore > current.score) {
  leaderboard.set(userId, { score: newScore, updatedAt: Date.now() });
}
```

With an actual database, use an atomic conditional update (e.g.,
`UPDATE ... WHERE score < $newScore`) instead.

---

## Finding 4 — Data Contract Mismatch (Profile Username) · MEDIUM

**Slide:** POST `/profile` stores `user_name` but GET `/profile/:id` reads
`username`, so the name field is always `undefined` in every profile response.

### Files
- [`src/routes/profile.js`](src/routes/profile.js) — `POST /profile`, line 12; `GET /profile/:id`, line 20

### What the code actually does
```js
// src/routes/profile.js  line 12 — write path
users.set(id, { id, user_name, email }); // <-- stores "user_name"

// src/routes/profile.js  line 20 — read path
res.json({ id: user.id, username: user.username, email: user.email });
//                                ^^^^^^^^^^^^^^ reads "username" — never set
```

Every record in the `users` Map has the key `user_name`. Every GET response
accesses the key `username`, which does not exist on any record.
`user.username` is always `undefined`. JavaScript silently returns `undefined`
for a missing property; `JSON.stringify` then drops the key entirely, so the
HTTP response contains `{ "id": "...", "email": "..." }` with no name field at
all.

### Why it is a silent failure
- No exception is thrown — accessing a missing property in JavaScript returns
  `undefined`, not an error.
- The POST response is always `{ status: 'ok' }`, confirming success.
- The GET response is well-formed JSON; the missing field just looks like an
  optional field that was never set.
- ESLint has no way to know that `user.username` should correspond to what was
  stored by a different route handler; cross-handler field-name consistency is
  outside the scope of any linter rule.
- A unit test that only checks the POST response (`{ status: 'ok' }`) would
  pass; a test that checks the GET response would need to specifically assert
  the `username` field is non-null to catch this.

### Root cause
No shared schema or type definition enforces a canonical field name between the
write path and the read path. The two route handlers were written (or edited)
independently, and the name diverged without any compile-time or runtime signal.

### Suggested fix
Pick one canonical name and apply it consistently. The minimal fix is to
update the GET read to match what POST writes:

```js
// src/routes/profile.js  line 20 — fixed
res.json({ id: user.id, username: user.user_name, email: user.email });
```

Or standardise both sides to `username`:

```js
// POST handler line 12
users.set(id, { id, username: user_name, email });

// GET handler line 20 — already correct once POST is fixed
res.json({ id: user.id, username: user.username, email: user.email });
```

---

## Summary Table

| # | Severity | Category | File(s) | One-Line Symptom |
|---|----------|----------|---------|-----------------|
| 1 | CRITICAL | Fail-Open | `auth.js` + `admin.js` | Permission-service error silently grants admin |
| 2 | HIGH | Swallowed Error | `fetchWithRetry.js` + `pricing.js` | Stale price returned as live with HTTP 200 |
| 3 | HIGH | Race Condition | `leaderboard.js` | Last writer wins; correct high score overwritten |
| 4 | MEDIUM | Data Mismatch | `profile.js` | Username always `undefined` in GET response |

---

*All four bugs share a common trait: the error path and the success path are
indistinguishable to the caller. No exception propagates, no HTTP error status
is set, and no field in the response indicates that something went wrong. They
can only be found by reading the logic of both the writer and the reader
together — which is exactly what automated tools rarely do.*
