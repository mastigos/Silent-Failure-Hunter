# Silent Failure Hunter

An IBM Bob 2.0–powered audit workflow that finds bugs that don't 
throw errors, don't fail tests, and don't show up in logs.

## The Problem It Solves
Traditional tooling is blind to silent failures:
| Tool | What it misses |
|---|---|
| ESLint / linters | Runtime behavior and intent |
| Unit tests | Failure modes nobody thought to test |
| Code review | Full call graph across multiple files |

## How to Run It on Your Codebase

### Step 1 — Open your project in IBM Bob 2.0
Make sure your codebase is loaded as the active workspace.

### Step 2 — Switch to Plan mode
This lets Bob scope the investigation before executing.

### Step 3 — Paste this prompt
> "Run a Silent Failure audit on this codebase.
>  Investigate for:
>  1. Fail-Open auth checks — where an exception silently grants access
>  2. Swallowed errors — retry/fallback paths that discard real errors
>  3. Race conditions — async operations with ordering assumptions
>  4. Data contract mismatches — write/read field name divergence
>  Spawn a subagent for each category, run them in parallel,
>  and synthesize findings into a severity-ranked Silent Failure Report."

### Step 4 — Approve subagent spawning
Bob will propose spawning 4 parallel subagents — one per audit 
category. Approve each one. They run concurrently with isolated 
context windows.

### Step 5 — Receive your Silent Failure Report
A single severity-ranked report is returned, with file references, 
root causes, and suggested fixes for every finding.

## What Gets Audited
| Category | What Bob looks for |
|---|---|
| Fail-Open | `try/catch` that returns permissive value on error |
| Swallowed Error | Retry exhaustion that returns fallback silently |
| Race Condition | Read before `await`, write after — stale snapshot |
| Data Mismatch | Field written under one name, read under another |

## Demo App
The `Quiet Fail Demo App` in this repo contains 4 deliberately 
planted silent bugs — one per category — to demonstrate detection.

### Run the demo
npm install && npm start

### Endpoints
- POST   /profile              — save a user profile
- GET    /profile/:id          — read a user profile  
- DELETE /admin/wipe-data      — admin-only destructive action
- POST   /leaderboard/:userId/score — update a leaderboard score
- GET    /leaderboard/:userId  — read a leaderboard score
- GET    /pricing/price/:itemId — get item pricing
