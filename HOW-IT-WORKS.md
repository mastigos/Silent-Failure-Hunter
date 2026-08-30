# How Silent Failure Hunter Works

## Architecture

Bob's main agent orchestrates 4 parallel subagents:

┌─────────────────────────────────────┐
│         Bob Main Agent              │
│         (Plan → Agent mode)         │
└──────┬──────┬──────┬────────┬───────┘
       │      │      │        │
       ▼      ▼      ▼        ▼
  [Fail  [Swallow [Race  [Data
  Open]   Error]  Cond.] Mismatch]
  Agent   Agent   Agent   Agent
       │      │      │        │
       └──────┴──────┴────────┘
                   │
                   ▼
        Silent Failure Report
        (severity-ranked, unified)

## Why Parallel Subagents?
Each audit category gets:
- Its own clean context window (no cross-contamination)
- Deep file traversal without bloating the main context
- Concurrent execution — all 4 run simultaneously

Result: faster audit + lower token cost vs. one serial pass.

## Reproducibility
The same 4-category prompt run against any Node.js/JavaScript 
codebase will trigger the same investigation pattern.
The demo app was audited fresh — no pre-seeded hints were given 
to Bob. The Silent Failure Report was generated in a single session.