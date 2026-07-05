---
approved_by: human
approved_at: 2026-07-05T17:49:12.584Z
gate_crossed: functional → implementation
---

---
title: "CF1 — Invalidate the read cache on every state write (always read fresh)"
type: functional
status: functional
created: 2026-07-04
program: ctoc-correctness
priority: HIGH
depends_on: []
files:
  - src/lib/actions.js
  - agents/_shared/ancestry-read.md
  - tests/cache-freshness.test.js
---

# CF1 — Invalidate the read cache on every state write

## 1. ASSESS — Problem Understanding

### Business Context

Direct CTO directive (2026-07-04): **"Make certain CTOC is always reading the
files, not doing it from memory."** CTOC must never serve dashboard/state reads
from stale memory when the underlying plan files have changed.

### Current State

`src/lib/cache.js` is a 5-second in-process TTL memoize wrapping the
filesystem-heavy count reads: `getPlanCounts` and `getVisionCounts`
(`src/lib/state.js:93,330`), and the cheap stale count relies on a cache hit
(`src/lib/menu-screens.js:270`). The module exports `invalidate(keyPrefix)` with
the doc "Useful when an operation writes state we know invalidates cached reads."

**But `invalidate()` is never called anywhere.** After a state-mutating
operation — `approvePlan`, `movePlan`, `startExecution`, `completeExecution`, or
any plan-file write — a subsequent read within the 5s TTL (and for the entire
lifetime of the long-lived interactive TUI process) returns the STALE cached
counts instead of re-reading the moved/updated files.

The per-invocation slash-command menu (`node menu.js` = fresh process, empty
cache) mostly dodges this, but the invariant "reads reflect current disk state"
is violated by construction and the TUI path is directly exposed.

### Impact

- A plan that just crossed a gate can still show under its old stage's count for
  up to 5s / for the life of the TUI — the dashboard "lies" about disk state.
- Violates the binding "always read files fresh, never memory" rule.

## 2. ALIGN — Approach (resolve at Gate 1 / planning)

- **(A) Invalidate on write — RECOMMENDED.** Call `cache.invalidate()` at the end
  of every state-mutating operation so the next read recomputes from disk. The
  cheapest, safest wiring point is the shared low-level write primitive
  (`movePlan`, through which every stage transition flows) plus any other
  plan/state file writer (marker/status writes, `writeState`). Keeps the perf
  cache for read-only navigation; guarantees freshness after any change.
- (B) Drop the cache entirely — simplest correctness, loses the O(1) render.
- (C) Shorten the TTL to ~0 — degenerate cache; effectively (B) with overhead.

Decide at Gate 1: A (targeted invalidate-on-write, recommended) vs B.

## 3. CAPTURE — Acceptance Criteria

### User Story

**As a** CTOC user, **I want** the dashboard/state counts to always reflect the
current plan files immediately after any change, **so that** I never see stale
numbers served from memory.

### BDD Scenarios

- [ ] **Scenario: a plan move busts the cached counts**
  Given `getPlanCounts` has been called (populating the cache) for a project
  When a plan is moved between stages (e.g. `movePlan` / `approvePlan`)
  And `getPlanCounts` is called again within the TTL window
  Then it returns counts reflecting the MOVE (recomputed from disk), not the
  stale cached value

- [ ] **Scenario: every mutating op invalidates**
  Given the read cache is populated
  When any of approvePlan / movePlan / startExecution / completeExecution runs
  Then the cache is invalidated (the next count read recomputes from disk)

- [ ] **Scenario: read-only navigation still benefits from the cache**
  Given no write occurs
  When the dashboard render calls the memoized counts multiple times within TTL
  Then the cache still serves the repeated in-render reads (perf preserved)

- [ ] **Scenario: vision counts also fresh**
  Given getVisionCounts is cached
  When a vision-stage plan moves
  Then the next getVisionCounts recomputes

- [ ] **Scenario: behavior unchanged elsewhere**
  Given the full suite
  Then it stays green (this is a correctness wire-up, no feature change)

### In Scope

- Wire `cache.invalidate()` into every state-mutating operation (via the shared
  `movePlan` write path + any other plan/state file writer) in `src/lib/actions.js`.
- A `tests/cache-freshness.test.js` proving move → fresh recompute (the stale-read
  regression guard).
- **Strengthen `agents/_shared/ancestry-read.md`** (prong 2 of the directive): add
  a binding mandate that every agent READ the actual current target files (code +
  full plan ancestry) FRESH before acting and TRUST THE CODE over any brief's
  quotes/summary/recollection — reporting discrepancies. This is the
  agent-definition-level enforcement of "never act from memory."

### Out of Scope

- Removing/replacing the cache (keep the perf; approach A).
- The interactive TUI render loop itself (the invalidate-on-write fix covers it).

## Notes

- Origin: 2026-07-04 CTO directive "always read files, not memory". Root cause
  verified by reading `src/lib/cache.js` (invalidate exists, never called) +
  `state.js` (memoized counts). Real numbers/behavior confirmed against current code.
