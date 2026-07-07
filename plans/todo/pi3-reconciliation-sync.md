---
iron_loop: true
approved_by: human
approved_at: 2026-07-07T13:45:57.840Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-07T13:27:22.210Z
gate_crossed: functional → implementation
iron_loop: true
---

---
title: "PI3 — Reconciliation Sync: Hash Sweep & Hot-Path Triggers"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 3
depends_on:
  - pi1-index-store-and-schema
acceptance_criteria_count: 13
risk_level: MEDIUM
files:
  - "src/lib/plan-index/reconcile.js"
  - "src/lib/plan-index/content-hash.js"
  - "src/lib/plan-index/sync-unit.js"
  - "src/lib/plan-index/store.js"
  - "src/lib/plan-index/index.js"
  - "src/lib/actions.js"
  - "src/hooks/PostToolUse.plan-index-sync.js"
  - "tests/plan-index-sync.test.js"
  - "tests/readme-numbers.test.js"
  - "CLAUDE.md"
  - "README.md"
gate: "Pending Approval (Gate 1: functional → implementation)"
---

# PI3 — Reconciliation Sync: Hash Sweep & Hot-Path Triggers

> **Architecture pivot alignment (2026-07-07).** Retargeted to PI1's **pure-JS
> in-memory + single-JSON-file store**, same shape: the content-hash diff sweep +
> hot-path triggers drive the store's `upsertUnit`/`deleteUnit`/`moveUnit`
> primitives and use **`withBatch`** for the sweep (one lock acquire for many
> writes). Every "DB row" is an in-memory unit keyed on `(planPath, sectionId)`;
> every "DB write" is an `upsertUnit`/`deleteUnit` against the Map (persisted
> atomically to `.ctoc/index/plan-index.json`). There is **no** `plans.db`, no
> `initVectorTable`, no SQL — a "row exists" check is `store.getUnit(planPath,
> sectionId) !== null`, and idempotence is asserted via `getUnit`/`store.size`,
> not `SELECT COUNT(*)`. This slice also mirrors CF1's read-fresh rule: the sweep
> reads the ACTUAL current `.md` bytes from disk each pass (never a cached view)
> and the store's own `withLock` reload-under-lock merges any concurrent external
> write before mutating.

## Problem Statement

The plan index must never drift from the `.md` plan files regardless of how
those files are changed — menu operations, CLI moves, raw text editor saves,
`git pull`, or any other external tool. Without a content-hash reconciliation
sweep and hot-path triggers wired into every CTOC write path, the index silently
rots: the exact B1/B2-class failure this vision exists to kill. The `.md` plans
are the single source of truth; the store is a self-healing, rebuildable mirror.
This slice wires together PI1's store primitives (`upsertUnit`/`deleteUnit`/
`moveUnit`/`withBatch`) and a dependency-injected embedder (PI2 wired at
integration time by PI0) into a single idempotent `syncUnit` path used by every
write trigger and by the full reconciliation sweep.

## Business Alignment

**Job to Be Done:** When a plan file changes by any means — menu, CLI, editor,
or git — I want the index to reflect the change immediately for in-CTOC
operations and be fully correctable by a sweep for everything else, so that
semantic search and cross-correlation always work against current data.

**Impact Map:**
- **Goal:** Guarantee the DB mirrors the filesystem at all times (vision success criterion 5)
- **Actor:** CTOC pipeline and CTO/developer using CTOC
- **Impact:** Plan modifications are immediately visible in search and related-plan suggestions without manual rebuild steps; git pull and external editor saves heal automatically
- **Deliverable:** Content-hash sweep (`reconcileIndex` in `reconcile.js`) that drives `store.withBatch`, idempotent `syncUnit` with `calibrationReady()` gate calling `store.upsertUnit`/`store.deleteUnit`, content-hash guard in `actions.js movePlan` that re-paths via `store.moveUnit` (no re-embed on a pure stage move), and a dedicated `PostToolUse.plan-index-sync.js` hook targeting `plans/**/*.md` writes

## User Stories

**As a** developer using CTOC, **I want** plan edits to be reflected in the
index within the same menu interaction, **so that** related-plans suggestions
stay current without a manual rebuild step.

**As a** CTOC system component (git, external editor, CLI), **I want** the
reconciliation sweep to heal any drift automatically, **so that** the index is
self-correcting regardless of what external tool modified the plans.

## Acceptance Criteria

- [ ] **Scenario: Write tool creates a plan — PostToolUse hook indexes it**
  Given an empty index and the `PostToolUse.plan-index-sync.js` hook is active
  When Claude's Write tool creates a new file at `plans/functional/new-plan.md`
  Then the hook fires `syncUnit` with `tool_input.file_path` pointing to the new
  file; `store.getUnit('plans/functional/new-plan.md', '__plan__')` returns the
  plan-level unit (`PLAN_SENTINEL` sectionId) with the correct `contentHash`

- [ ] **Scenario: Move a plan — old path removed, new path present; no re-embed on pure stage move**
  Given a plan indexed at `plans/vision/x.md` with content hash H and a mock
  embedder spy reset to 0 calls
  When `movePlan('plans/vision/x.md', 'done')` is called (content unchanged,
  only stage label in path changes)
  Then the guard re-paths via `store.moveUnit('plans/vision/x.md',
  'plans/done/x.md')`, so `store.getUnit('plans/vision/x.md', '__plan__')`
  returns null, `store.getUnit('plans/done/x.md', '__plan__')` returns the unit
  with `contentHash` H and its `embedding` byte-for-byte unchanged, and the
  embedder spy call count remains 0 (content hash unchanged — re-embed skipped by
  the hash guard in `movePlan`, which uses `moveUnit`'s no-re-embed re-path)

- [ ] **Scenario: Edit tool modifies a plan — PostToolUse hook re-indexes it**
  Given a plan indexed with content hash A
  When Claude's Edit tool modifies the plan file and the
  `PostToolUse.plan-index-sync.js` hook fires with the file path
  Then `syncUnit` is called; `store.upsertUnit` replaces the unit's `contentHash`
  from A to hash B (the new content hash) — an idempotent replace keyed on
  `(planPath, sectionId)`; the old hash A is no longer stored

- [ ] **Scenario: Plan file deleted — reconcileIndex sweep removes orphaned unit**
  Given a plan indexed at `plans/functional/y.md`
  When the plan file is removed from the filesystem by any external tool
  Then after `reconcileIndex(plansRoot, { store, embedder })` is run (calling
  `store.deleteUnit` for the orphaned unit),
  `store.getUnit('plans/functional/y.md', '__plan__')` returns null

- [ ] **Scenario: Manual editor save caught by sweep**
  Given a plan file is modified directly by a text editor (outside CTOC control)
  When `reconcileIndex(plansRoot, { store, embedder })` is run
  Then the unit for that file is re-embedded and the stored hash matches the new
  content hash

- [ ] **Scenario: Simulated git pull caught by sweep**
  Given a plan file's content is replaced by writing new bytes directly to the
  filesystem (simulating a `git pull` change outside CTOC)
  When `reconcileIndex(plansRoot, { store, embedder })` is run
  Then the updated unit is in the DB; no manual intervention is required

- [ ] **Scenario: Sweep re-embeds only changed units (call count assertion)**
  Given 5 plans where 4 units are seeded DIRECTLY via `store.upsertUnit({ ...,
  contentHash: currentFileHash, embedding: stubVector })` (bypassing the
  embedder), 1 plan has its file content modified on disk, and the mock embedder
  spy is reset to 0 calls after the direct seeding
  When `reconcileIndex(plansRoot, { store, embedder: mockEmbedder })` is run
  (driving `store.withBatch` — one lock acquire for the whole pass)
  Then `mockEmbedder.callCount === 1` (only the changed plan is re-embedded);
  the 4 unchanged plans produce zero embedder calls

- [ ] **Scenario: syncUnit is idempotent**
  Given a plan is already indexed with hash `def456`
  When `syncUnit(path, { store, embedder })` is called twice on the same
  unchanged file
  Then `store.getUnit(path, '__plan__')` still returns exactly one unit and the
  plan's unit count (`store.size` delta) is 0 across the second call — no
  duplicate unit is created (`upsertUnit` is an idempotent replace keyed on
  `(planPath, sectionId)`); no second embed call is made

- [ ] **Scenario: syncUnit with stub embedder — stored embedding matches stub**
  Given a stub embedder that returns a fixed `Float32Array` of zeros at the
  configured dimension
  When `syncUnit(path, { store, embedder: stubEmbedder })` is called
  Then `store.getUnit(path, '__plan__').embedding` equals the stub zero array
  byte-for-byte (Float32 precision preserved through the store round-trip)

- [ ] **Scenario: PostToolUse hook fires syncUnit for plans/ file**
  Given the `PostToolUse.plan-index-sync.js` hook is active and a plan file
  under `plans/` is written by a Claude tool call
  When the hook fires
  Then a syncUnit spy is called with that specific file path; no error surfaces
  to the user; the hook exits in < 10 ms (fire-and-forget)

- [ ] **Scenario: Cross-platform — all file ops use path.join and fs.promises**
  Given CTOC is running on Windows (mocked via `process.platform = 'win32'`)
  When `reconcileIndex` walks `plans/**`
  Then all file reads use `fs.promises.readFile` with `path.join`-constructed
  paths; no shell commands are invoked; no hardcoded `/` separators appear in
  the walk logic

- [ ] **Scenario: Error isolation — throwing embedder does not block movePlan**
  Given a mock embedder that throws `Error('embed failed')` on every call
  When `movePlan('plans/vision/x.md', 'done')` is called
  Then the file is present at `plans/done/x.md` on disk (primary action
  succeeded), the error is written to `.ctoc/logs/` (logged, not swallowed
  silently), and no unhandled rejection or thrown error surfaces to the caller

- [ ] **Scenario: calibrationReady gate — syncUnit no-ops until calibration completes**
  Given `calibrationReady()` returns false (no `calibration.json` exists yet)
  When `syncUnit(path, { store, embedder })` is called
  Then the embedder is NOT called, no store write is made (no `upsertUnit`), and
  a diagnostic note (`'syncUnit: calibration not ready — deferred'`) is logged to
  `.ctoc/logs/`

## Non-Functional Requirements

- **Idempotent**: Every operation is safe to run multiple times — the sweep is
  idempotent; `syncUnit` is idempotent; re-running on unchanged files is a no-op.
- **Self-healing**: Partial or failed embeds from a previous run are retried on
  the next sweep because the content hash stored in the unit will not match the
  current file content.
- **Dependency-injected embedder**: `syncUnit(path, { store, embedder })` —
  PI3 never imports PI2 directly; PI2 is wired at integration time by PI0's
  composition root. PI3's structural dependency depth is 1 (PI1 only).
- **Error isolation**: Every `syncUnit` call in hot-path wrappers is wrapped in
  `try/catch`; index errors are logged to `.ctoc/logs/` and never surface to
  the user as plan-mutation failures. The store is a rebuildable cache; it must
  not block the primary action.
- **Hook minimalism**: The PostToolUse trigger uses a dedicated new
  `PostToolUse.plan-index-sync.js` hook; no logic is added to the existing
  `PostToolUse.status-check.js`. The new hook fires only for file paths matching
  `plans/**/*.md` (read from `tool_input.file_path`).

## Scope

### In Scope
- `content-hash.js`: deterministic SHA-256 of a unit's text + selected
  frontmatter fields (`files:`, `parent_vision`, `status`); wraps `hashString`
  from `src/lib/hash-utils.js` (reuse — do not reinvent crypto); cross-platform
- `sync-unit.js`: `syncUnit(path, { store, embedder })` — reads the file FRESH
  from disk (CF1 read-fresh rule), extracts units, hashes each, checks the stored
  unit via `store.getUnit`, re-embeds and `store.upsertUnit`s only if the hash
  changed; idempotent; checks `calibrationReady()` and no-ops with a logged note
  if calibration has not yet completed
- `reconcile.js`: exports `reconcileIndex(plansRoot, { store, embedder })`
  (named `reconcileIndex` to avoid collision with existing `src/lib/reconciliation.js
  reconcile()`); walks `plans/**/*.md` with `fs.promises`, drives the pass under a
  single `store.withBatch` (one lock acquire for many writes), calls `syncUnit`
  for each file, and calls `store.deleteUnit` for any stored unit whose `planPath`
  no longer exists on disk
- `src/lib/actions.js`: wrap ONLY `movePlan` — add a content-hash guard using
  `hashFile` from `src/lib/hash-utils.js`; if the file hash before and after the
  rename is identical (pure stage move), re-path the stored units via
  `store.moveUnit(fromPath, toPath)` WITHOUT re-embedding (PI1's `moveUnit`
  preserves each unit's `embedding`/`contentHash` byte-for-byte); if the hash
  differs, call `syncUnit`; both paths wrapped in `try/catch`
- `src/hooks/PostToolUse.plan-index-sync.js`: new dedicated hook; matcher targets
  `plans/**/*.md`; reads `tool_input.file_path`; calls `syncUnit` fire-and-forget
  (try/catch, logs errors to `.ctoc/logs/`, exits in < 10 ms, never awaited by
  the hook runner); the existing `PostToolUse.status-check.js` is not modified
- `tests/plan-index-sync.test.js`: covers all 13 scenarios above; uses injected
  mock embedder and either a real PI1 store (integration) or a mock store (unit)

### Out of Scope
- Producing actual vectors (PI2 — injected as a parameter, not imported)
- The store schema and CRUD primitives (PI1 — used via the public barrel API)
- Querying, ranking, or Reciprocal Rank Fusion (PI4)
- Duplicate guard thresholds and conflict detection (PI5–PI6)
- Modifying `src/scripts/move-plan.js` directly — it delegates to
  `actions.movePlan`; the trigger is therefore in `actions.js` only
- Modifying `src/hooks/PostToolUse.status-check.js` — the dedicated
  `PostToolUse.plan-index-sync.js` hook keeps concerns separated and eliminates
  the coupling risk to existing status-check behavior
- A dedicated file-system watcher process (`fs.watch` / `chokidar`): sweep +
  hook coverage is sufficient; a persistent watcher adds OS-specific complexity
- Batching multiple plans into a single embed call (PI3 embeds one plan at a
  time via `syncUnit`; batch optimization is a future PI2/PI4 concern)
- Reconciliation of non-plan files (only `plans/**/*.md` is in scope)

## Test Plan

Framework: Node `--test`. PI3 unit tests use a mock store (object with
`upsertUnit`, `getUnit`, `deleteUnit`, `moveUnit`, `withBatch` as spies) and a
stub embedder (returns fixed `Float32Array`). Integration tests against a real
PI1 store (`openStore` over a temp JSON path) are tagged and gated on PI1
completion. Plan-level units are keyed on the `PLAN_SENTINEL` (`'__plan__'`)
sectionId.

| Test ID | Description                                                | Key Assertion                                                             |
|---------|------------------------------------------------------------|---------------------------------------------------------------------------|
| SY-01   | Write tool creates plan → hook fires → getUnit present     | `getUnit(path,'__plan__')` returns unit; correct `contentHash`; hook fired via spy |
| SY-02   | movePlan pure stage move → old null, new present; hash guard | Re-path via `moveUnit`; both getUnit verified; embedder spy callCount === 0 |
| SY-03   | Edit tool modifies plan → hook fires → hash updated        | Stored `contentHash` !== original; new hash matches file; `upsertUnit` replace |
| SY-04   | Plan file deleted → reconcileIndex sweep → getUnit null    | `getUnit(path,'__plan__')` null after file removal + reconcileIndex (`deleteUnit`) |
| SY-05   | External file write (editor save) caught by sweep          | After reconcileIndex, stored `contentHash` = new content hash             |
| SY-06   | git pull simulation caught by sweep                        | Updated unit present in store after reconcileIndex; no manual step        |
| SY-07   | Sweep call count: 4 seeded directly, 1 changed, spy reset → 1 embed call | mockEmbedder.callCount === 1 after spy reset; sweep runs under `withBatch` |
| SY-08   | syncUnit idempotent: 2 calls → 1 unit, no duplicate        | `getUnit(path,'__plan__')` still one unit; `store.size` delta 0; one embed total |
| SY-09   | syncUnit with stub embedder: stored embedding = stub zeros | `getUnit(path,'__plan__').embedding` byte-equals stub Float32Array        |
| SY-10   | PostToolUse fires syncUnit for plans/ path                 | Spy called with correct file_path argument; hook exits < 10 ms            |
| SY-11   | PostToolUse does NOT fire for non-plans/ path              | Spy call count === 0 for src/ path                                       |
| SY-12   | reconcileIndex deletes orphaned units                      | `getUnit` null after file deleted + reconcileIndex (`store.deleteUnit`)   |
| SY-13   | Error isolation: throwing embedder does not block movePlan | File at new path; error in .ctoc/logs/; no rethrow                      |
| SY-14   | calibrationReady gate: embedder not called until ready     | Embedder not called; no `upsertUnit` write; note logged                  |
| SY-15   | Cross-platform path walk (win32 mock)                      | No separator errors; no shell invocations; fs.promises used              |

## Risks

### Technical Risks
- **syncUnit throw in actions.js blocks primary action**: If the `try/catch`
  wrapper is missing or incomplete, an index failure could surface to the user
  as a plan-mutation error.
  - Likelihood: MEDIUM (easy to get wrong during implementation)
  - Impact: HIGH (blocks all plan mutations if triggered)
  - Mitigation: Enforce `try/catch` wrapping in code review; SY-13 (error
    isolation test) asserts the primary action succeeds even when the embedder
    throws

- **Sweep performance on large plan sets**: Hashing every `.md` file on each
  sweep could be measurable at 200+ plans.
  - Likelihood: LOW (CTOC plans are typically <100 files)
  - Impact: LOW (runs in background; does not block the menu)
  - Mitigation: Benchmark at 200 plans during Step 14 VERIFY; document the
    p95 sweep latency in the plan's test results

### Business Risks
- **Hot-path trigger on every save is overhead**: If `syncUnit` queues an embed
  for every save, the embed queue grows during active editing sessions.
  - Likelihood: MEDIUM
  - Impact: LOW (async; no impact on editor performance; queue drains when
    editing stops)
  - Mitigation: Accept the queue growth; it is bounded by the number of saves
    in a session; the `calibrationReady()` gate prevents any embed work before
    PI0 completes calibration

### Dependency Risks
- **PI1 required for integration tests**: SY-01 through SY-15 against a real
  store require PI1's `openStore` and CRUD API.
  - Likelihood: HIGH (structural)
  - Impact: LOW (PI3 unit tests use a mock store and run independently; only
    the integration test suite is gated on PI1)
  - Mitigation: Ship PI1 first; PI3 unit tests are self-contained

## Rollback

1. Revert `src/lib/plan-index/reconcile.js`, `content-hash.js`, and
   `sync-unit.js` to prior commit.
2. Revert the additions to `src/lib/actions.js` — existing `movePlan` behavior
   is preserved because the changes are additive (try/catch-wrapped syncUnit call).
3. Delete `src/hooks/PostToolUse.plan-index-sync.js` — `PostToolUse.status-check.js`
   is unmodified and continues working as before.
4. Delete `.ctoc/index/plan-index.json` to clear any partial state; rebuild is
   trivially triggered on next `reconcileIndex` call (git-ignored, rebuildable
   cache — no committed data loss).
5. PI1 store code and PI2 embedding code are unaffected.

## Dependencies

- **PI1** (`pi1-index-store-and-schema`): `upsertUnit`, `deleteUnit`, `getUnit`
  API via the barrel `src/lib/plan-index/index.js`. Structural dependency.
- **PI2** (`pi2-embedding-engine`): injected as the `embedder` parameter at
  integration time by PI0's composition root; PI3 never imports PI2 directly.
- **`src/lib/hash-utils.js`**: reuses `hashString` and `hashFile` for content
  hashing; do not reinvent SHA-256.
- **PI0** (`pi0-bootstrap-and-runtime-wiring`): owns the composition root
  (constructs store + embedder + sync), background calibration, and the
  `calibrationReady()` signal that PI3's `syncUnit` checks.
- **Node 24 built-ins**: `node:crypto` (via hash-utils), `node:fs/promises`,
  `node:path`. No npm packages required.

## Decisions Taken Under Ambiguity

- **reconcileIndex naming**: The sweep function is exported as `reconcileIndex`
  (not `reconcile`) to avoid naming collision with the existing `reconcile()`
  in `src/lib/reconciliation.js`. Module-level naming is PI3's responsibility.
- **Dedicated hook file**: `PostToolUse.plan-index-sync.js` is a new dedicated
  hook rather than an extension of `PostToolUse.status-check.js`. This avoids
  coupling risk to existing status-check behavior and keeps the hook's exit path
  under < 10 ms (fire-and-forget syncUnit call). `PostToolUse.status-check.js`
  is never modified by PI3.
- **actions.js trigger scope**: Only `movePlan` is wrapped in `actions.js`
  (createPlan, editPlan, renamePlan, deletePlan do not exist in actions.js).
  Create and edit triggers are handled by the `PostToolUse.plan-index-sync.js`
  hook (fires after Claude's Write/Edit tool calls). Delete detection is handled
  by `reconcileIndex` sweep (orphan rows are removed). Single trigger layer:
  no double-triggering between actions.js and move-plan.js (move-plan.js delegates
  to actions.movePlan).
- **Content-hash guard in movePlan**: `movePlan` uses `hashFile` from
  `hash-utils.js` to compare the file hash before and after the rename. If
  identical (pure stage move), the stored units are re-pathed via
  `store.moveUnit(fromPath, toPath)` WITHOUT calling the embedder — PI1's
  `moveUnit` re-keys every unit of the plan and preserves `embedding`/
  `contentHash` byte-for-byte. If different (content also changed), `syncUnit` is
  called. This prevents unnecessary re-embedding on every stage transition.
- **planPath normalization (PI1 D9 contract)**: PI1 keys on the EXACT `planPath`
  string supplied at `upsertUnit` and does no normalization. PI3 therefore MUST
  normalize plan paths consistently (the same canonical form at `syncUnit`,
  `moveUnit`, `reconcileIndex`, and `deleteUnit`) so lookups match — this is a
  required PI3 acceptance criterion carried forward from PI1 D9.
- **calibrationReady() gate**: `syncUnit` checks `calibrationReady()` (supplied
  by PI0's composition root) before doing any embedding work. If calibration has
  not yet completed, `syncUnit` logs a diagnostic note and returns without
  writing to the store. This prevents dimension mismatches: if a differently-
  dimensioned embedding were upserted, PI1's store would do a FULL reset (clear
  all units + adopt the new dimension per D7) — the gate keeps writes off until
  the calibrated dimension is settled.
- **Error isolation policy**: syncUnit errors in hot-path wrappers are caught,
  logged to `.ctoc/logs/`, and swallowed. The store is a self-healing,
  rebuildable cache; an index failure must never block a plan mutation. Wrong
  choices here are caught at the next reconciliation sweep.
- **No fs.watch**: A persistent watcher is out of scope. The PostToolUse hook
  covers all in-CTOC tool-call writes; `reconcileIndex` covers everything else
  (external editors, git, CLI). The combination is sufficient and avoids
  OS-specific watcher complexity.
- **reconcileIndex deletes orphaned units**: When `reconcileIndex` finds a stored
  unit whose `planPath` no longer exists on disk, it calls `store.deleteUnit`.
  This is the correct self-healing behavior — the plan is the truth; the stale
  unit must be removed from the store.
- **Unit granularity**: Hashing mirrors PI1's units — one plan-summary unit +
  one unit per section; a unit's hash covers its source text plus the
  frontmatter fields that affect retrieval (`files:`, `parent_vision`, `status`).

---

# Implementation Details

> Produced by implementation-planner (Iron Loop Steps 5 PLAN / 6 DESIGN / 7 SPEC).
> Verified fresh against the shipped PI1 store (`src/lib/plan-index/store.js`,
> `index.js`), the reconciliation pattern (`src/lib/stale-cleanup.js`,
> `actions.js cleanupStaleInProgress`/`movePlan`), `src/lib/state.js`,
> `src/lib/hash-utils.js`, `src/lib/cache.js`, `src/lib/safe-fs.js`, and
> `.claude-plugin/hooks.json` on 2026-07-07. Signatures below are the EXACT
> shipped PI1 API — no invented methods.

## Architecture Decision (ADR)

**Context.** PI1 shipped a pure-JS in-memory + single-JSON store keyed on the
composite `(planPath, sectionId)` with the reserved plan-level sentinel
`PLAN_SENTINEL === '__plan__'`. Its public API is exactly:
`openStore(jsonPath, opts) → { upsertUnit, getUnit, deleteUnit, moveUnit,
getFilesForPlan, search, save, withBatch, dimension, size, __test }`, plus the
named export `PLAN_SENTINEL`. Every mutation (`upsertUnit`/`deleteUnit`/
`moveUnit`/`save`) is a locked read-modify-write via the internal `withLock`
(acquire → reload-under-lock → mutate → atomic save → release). `withBatch(fn)`
takes ONE lock, reloads once, and hands `fn` a lock-free API façade
(`upsertUnit`, `deleteUnit`, `moveUnit`, `getUnit`, `getFilesForPlan`, `search`),
then does ONE atomic save. `moveUnit(fromPath, toPath)` (and its withBatch
façade) re-keys every unit whose `planPath === fromPath` to `toPath` preserving
`embedding`/`_norm`/`contentHash` byte-for-byte (no re-embed) — verified at
`applyMove` (store.js lines 621–641). `planPath` is an OPAQUE key: the store does
NO normalization (D9); PI3 owns consistent normalization.

**Decision.** PI3 is three new leaf modules under `src/lib/plan-index/` plus one
new dedicated hook and a single additive guard in `actions.js movePlan`:

1. `content-hash.js` — deterministic per-unit content hashing, wrapping
   `hashString` from `hash-utils.js` (no new crypto).
2. `sync-unit.js` — `syncUnit(planPath, { store, embedder, calibrationReady?,
   logDir? })`, the single idempotent write path (read-fresh → hash → diff →
   re-embed + `upsertUnit` only on change), gated by `calibrationReady()`.
3. `reconcile.js` — `reconcileIndex(plansRoot, { store, embedder,
   calibrationReady?, logDir? })`, the full hash-sweep, driven under ONE
   `store.withBatch` (one lock acquire for the whole pass).
4. `src/hooks/PostToolUse.plan-index-sync.js` — dedicated fire-and-forget hook
   for `plans/**/*.md` writes; the existing `PostToolUse.status-check.js` is
   untouched.
5. `src/lib/actions.js movePlan` — additive, try/catch-wrapped content-hash guard
   that re-paths via `store.moveUnit` on a pure stage move (no re-embed) or calls
   `syncUnit` when content also changed.

**Consequences.**
- Structural dependency depth is 1 (PI1 only). PI2's embedder and PI0's
  `calibrationReady` are INJECTED, never imported (satisfies the DI + inward-flow
  rules). PI3 never `require`s `./store` directly — it imports the barrel
  `src/lib/plan-index/index.js` for `PLAN_SENTINEL` (and, at integration time via
  PI0, `openStore`).
- The store is a rebuildable, git-ignored cache written to
  `.ctoc/index/plan-index.json` — NOT a `plans/**` path. It does NOT change
  `getPlanCounts`/`getInboxCounts`, so PI3 needs NO `cache.invalidate()` and does
  NOT trip the CF1 guard (see "CF1 / cache.invalidate analysis" below).
- Adding a new top-level hook file bumps the `src/hooks` file count 15 → 16 — a
  cross-cutting change to `tests/readme-numbers.test.js` and `CLAUDE.md`
  (flagged in "README / count-bump impact" below).

## Dependency Graph

```
src/lib/hash-utils.js  (hashString)            [existing — reuse]
        ▲
        │ require
src/lib/plan-index/content-hash.js  (CREATE)   ── hashUnit / hashPlanUnits
        ▲
        │ require
src/lib/plan-index/sync-unit.js     (CREATE)   ── syncUnit
        ▲                    ▲
        │ require            │ require
src/lib/plan-index/         src/lib/actions.js movePlan (MODIFY, additive guard)
  reconcile.js  (CREATE)         │ require (lazy, inside try/catch)
  ── reconcileIndex               ▼
        ▲                    src/hooks/PostToolUse.plan-index-sync.js (CREATE)
        │ require (walk)          │ require
        ▼                        ▼
src/lib/safe-fs.js (fs choke) ── used by content-hash/sync-unit/reconcile/hook/actions

src/lib/plan-index/index.js (barrel) ── PLAN_SENTINEL imported by sync-unit + reconcile + movePlan guard
PI2 embedder  ── INJECTED as `embedder` param (NEVER required by PI3)
PI0 calibrationReady ── INJECTED as `calibrationReady` param (NEVER required by PI3)

tests/plan-index-sync.test.js (CREATE) ── tests all of the above with mock store + stub embedder
```

No cycles: `content-hash → hash-utils`; `sync-unit → content-hash, index(barrel), safe-fs`;
`reconcile → sync-unit, index(barrel), safe-fs`; `actions.movePlan → (lazy) sync-unit`;
`hook → sync-unit`. `hash-utils`, `safe-fs`, and the barrel never re-enter PI3.

## Implementation Order

1. `src/lib/plan-index/content-hash.js` (CREATE) — no PI3-internal deps.
2. `src/lib/plan-index/sync-unit.js` (CREATE) — depends on step 1 + barrel.
3. `src/lib/plan-index/reconcile.js` (CREATE) — depends on step 2 + barrel.
4. `src/hooks/PostToolUse.plan-index-sync.js` (CREATE) — depends on step 2.
5. `src/lib/actions.js` (MODIFY) — additive guard in `movePlan`; lazy-requires step 2.
6. `.claude-plugin/hooks.json` (MODIFY) — register the new PostToolUse hook.
7. `tests/readme-numbers.test.js` + `CLAUDE.md` (MODIFY) — bump hook count 15 → 16.
8. `tests/plan-index-sync.test.js` (CREATE) — Step 8 writes these FIRST (TDD-red).

Note: Iron Loop Step 8 (TEST) writes the tests before the implementation of
steps 1–5; the ORDER above is dependency order (what must exist before what),
which the test file references.

## File Specifications

### File: `src/lib/plan-index/content-hash.js`
**Action:** CREATE
**Purpose:** Deterministic per-unit content hash so the sweep and `syncUnit` can
diff a plan's current on-disk bytes against the stored `contentHash` without a
re-embed. Reuses `hashString` (SHA-256) from `hash-utils.js`.
**Change Type:** new-module

#### Exports
- `hashUnit(text: string, meta: { files?: string[], parentVision?: string|null, status?: string|null }) → string`
  - Canonicalizes the retrieval-affecting metadata into a stable prefix, then
    `hashString(prefix + '\n' + text)`. `files` is sorted + joined with `\n` so
    array order never changes the hash (frontmatter order is not semantic).
    `null`/`undefined` meta fields normalize to the empty string.
  - Throws: never (pure; `hashString` does not throw on a string). Non-string
    `text` is coerced via `String(text)` to stay total.
- `PLAN_SENTINEL: string` — re-exported from the barrel for call-site convenience
  (equals `'__plan__'`). Optional; sync-unit may import it from the barrel directly.

#### Dependencies
- `require('./index')` → `PLAN_SENTINEL` (barrel; NOT `./store`)
- `require('../hash-utils')` → `hashString`

#### Called By
- `src/lib/plan-index/sync-unit.js` — hashes each extracted unit.

#### Data Flow
```
(unit text, {files, parentVision, status})
  → canonicalizeMeta → `files.slice().sort().join('\n')` + parentVision + status
  → hashString(canonicalMeta + '\x1f' + text)  → hex digest (string)
```
Note: `\x1f` (unit separator) delimits meta from text so meta/text boundary
ambiguity cannot two different inputs collide.

#### Error Handling / Cross-Platform
- Pure string ops + `crypto` via `hash-utils`; no fs, no OS-specific code.

---

### File: `src/lib/plan-index/sync-unit.js`
**Action:** CREATE
**Purpose:** The single idempotent write path. Reads the plan file FRESH from disk
(CF1 read-fresh rule), extracts its units (plan-level `__plan__` + one per
section), hashes each, compares to the stored unit's `contentHash` via
`store.getUnit`, and re-embeds + `store.upsertUnit`s ONLY the changed units.
Gated by `calibrationReady()`.
**Change Type:** new-module

#### Exports
- `async syncUnit(planPath: string, deps: { store, embedder, calibrationReady?, logDir?, batchApi? }) → Promise<{ changed: string[], skipped: boolean, reason?: string }>`
  - `store`: a PI1 store handle (or the withBatch façade via `batchApi`), used for
    `getUnit`, `upsertUnit`, `deleteUnit`.
  - `embedder`: PI2's injected `embed(texts: string[]) → Promise<Float32Array[]>`.
  - `calibrationReady`: injected `() → boolean` (PI0). Defaults to `() => true`
    ONLY when omitted in a unit test that has already seeded a dimension; in the
    composition root PI0 always supplies it.
  - `batchApi`: OPTIONAL. When present (called from inside `reconcileIndex`'s
    `withBatch`), all reads/writes route through the lock-free façade instead of
    the locked public methods — so the sweep takes exactly ONE lock.
  - Returns the list of section ids re-embedded (`changed`), and `skipped:true`
    with a `reason` when the calibration gate or a missing file short-circuits.
  - Throws: only on a programmer error (missing `store`/`embedder`). Runtime I/O
    and embed failures are the CALLER's concern in hot paths (the hook and
    `movePlan` wrap `syncUnit` in try/catch); `syncUnit` itself does not swallow —
    it lets the caller log. (Design choice: keep `syncUnit` honest; isolation lives
    at the hot-path wrappers per the plan's Error-isolation NFR.)

#### Behavior (exact)
```
1. if calibrationReady && !calibrationReady():
     log 'syncUnit: calibration not ready — deferred' to logDir
     return { changed: [], skipped: true, reason: 'calibration-not-ready' }   // AC SY-14
2. read FRESH bytes: safeFs.promises.readFile(planPath, 'utf8')
     if ENOENT → return { changed: [], skipped: true, reason: 'file-missing' }
3. normalizePath(planPath)  → the SAME canonical form used everywhere (D9)
4. extract units: parseUnits(content)  → [{ sectionId:'__plan__', kind:'plan', text, files, parentVision, stepLabel, status }, ...sections]
5. for each unit u:
     h = hashUnit(u.text, { files:u.files, parentVision:u.parentVision, status:u.status })
     prior = api.getUnit(normPath, u.sectionId)
     if prior && prior.contentHash === h: continue            // unchanged → no-op (idempotent)  AC SY-08
     vector = (await embedder([u.text]))[0]                    // ONE embed per changed unit
     api.upsertUnit({ planPath:normPath, sectionId:u.sectionId, kind:u.kind,
                      text:u.text, files:u.files, parentVision:u.parentVision,
                      stepLabel:u.stepLabel, contentHash:h, embedding:vector })
     changed.push(u.sectionId)
6. delete stale sections: any stored unit for normPath whose sectionId is no
   longer present in the freshly-parsed set → api.deleteUnit(normPath, sectionId)
   (only reachable inside reconcile's batch, which can enumerate; the hook path
   syncs a single plan and relies on the sweep for section-level orphans —
   documented below).
7. return { changed, skipped: false }
```
`api` = `deps.batchApi || deps.store`. Both expose `getUnit/upsertUnit/deleteUnit`.

#### Dependencies
- `require('./content-hash')` → `hashUnit`
- `require('./index')` → `PLAN_SENTINEL`
- `require('../safe-fs')` → `promises.readFile`
- `require('../state')` → `parseMetadata` (reuse the SHIPPED frontmatter parser —
  do NOT reinvent YAML). Section splitting is a local helper (`## ` headers).
- `require('path')` → `path.normalize`/`path.sep` for `normalizePath`.

#### Called By
- `src/lib/plan-index/reconcile.js` (per file, with `batchApi`)
- `src/hooks/PostToolUse.plan-index-sync.js` (single plan, fire-and-forget)
- `src/lib/actions.js movePlan` (when content ALSO changed on the move)

#### `normalizePath` (D9 carry-forward — REQUIRED)
- PI1 keys on the EXACT string given at `upsertUnit`. PI3 MUST feed the SAME
  canonical string at `syncUnit`, `reconcileIndex`, the `movePlan` guard, and
  `deleteUnit`. Choice: `path.relative(plansRoot, absPath)` re-joined with
  POSIX separators (`split(path.sep).join('/')`) so the key is stable across
  Windows/macOS/Linux and matches the `plans/<stage>/<slug>.md` form used in the
  BDD ACs (e.g. `'plans/functional/new-plan.md'`). Documented in
  `## Decisions Taken Under Ambiguity` (already present as "planPath normalization").

#### Error Handling / Cross-Platform
- `fs.promises.readFile` via `safe-fs`; `path`-based normalization; no shell.
- ENOENT is data (`skipped:'file-missing'`), not an error.

---

### File: `src/lib/plan-index/reconcile.js`
**Action:** CREATE
**Purpose:** The full content-hash sweep. Enumerates every `plans/**/*.md`, drives
one pass under a single `store.withBatch`, calls `syncUnit` for each file (with the
batch façade), and `deleteUnit`s any stored unit whose `planPath` no longer exists
on disk. Named `reconcileIndex` to avoid collision with `src/lib/reconciliation.js
reconcile()`.
**Change Type:** new-module

#### Exports
- `async reconcileIndex(plansRoot: string, deps: { store, embedder, calibrationReady?, logDir? }) → Promise<{ swept: number, reembedded: number, deleted: number, skipped: boolean }>`

#### Behavior (exact) — mirrors the `cleanupStaleInProgress` / stale-cleanup reconcile shape
```
1. if calibrationReady && !calibrationReady(): log + return { skipped:true, ... }  // gate the whole sweep
2. files = await walkPlans(plansRoot)         // fs.promises + path.join, recursive; only *.md under plans/**
     - collect normalizePath(f) for each → `present` Set of plan paths on disk
3. result = await store.withBatch(async (api) => {                                // ONE lock acquire (AC SY-07)
       let reembedded = 0;
       for (const f of files) {
         const r = await syncUnit(f, { ...deps, store, batchApi: api });
         reembedded += r.changed.length;
       }
       // orphan removal: any stored unit whose planPath ∉ present → delete       // AC SY-04 / SY-12
       let deleted = 0;
       for (const planPath of storedPlanPaths(api)) {                              // see note
         if (!present.has(planPath)) { api.deleteUnit(planPath, '__plan__'); ...section ids; deleted++ }
       }
       return { reembedded, deleted };
     });
4. return { swept: files.length, reembedded, deleted, skipped:false };
```
IMPORTANT — enumerating stored units inside the batch: PI1's `withBatch` façade
exposes `getUnit`/`getFilesForPlan`/`search` but NO "list all keys" method, and
the store's `units` Map is private. reconcile needs the set of stored `planPath`s
to find orphans. **Decision (document in Decisions Taken Under Ambiguity):** derive
orphans by comparing the on-disk `present` set against the set of `planPath`s the
sweep is ALSO able to observe. Two viable, no-store-change options — pick ONE at
Step 10 and document it:
  (a) **Preferred:** add a tiny read-only enumerator to PI1's public API + withBatch
      façade — e.g. `listPlanPaths() → string[]` (distinct planPaths). This is a
      lock-free read mirroring `getFilesForPlan`'s shape; it is a PI1 change, so it
      belongs to PI1 as a follow-up, NOT silently added by PI3. If PI1 cannot be
      touched in this slice, use (b).
  (b) **No-PI1-change fallback:** reconcile maintains no external key list; instead
      it treats orphan removal as "delete any `(planPath,'__plan__')` + known
      section ids for a planPath that WAS present in a prior sweep snapshot but is
      absent now", persisting the prior snapshot of planPaths to
      `.ctoc/index/plan-index-sweep.json` (a sibling cache, git-ignored). The
      snapshot is written at the END of each successful sweep.
  This blueprint RECOMMENDS (a) as the clean design and flags it as a PI1 API
  addition to be raised through the pipeline — it must not be back-doored into
  PI1 by PI3. Until (a) lands, (b) keeps PI3 self-contained. **This is the one
  real discrepancy between the plan's stated API surface and what orphan-sweep
  needs — see "Discrepancies" at the end.**

#### Dependencies
- `require('./sync-unit')` → `syncUnit`
- `require('./index')` → `PLAN_SENTINEL`
- `require('../safe-fs')` → `promises.readdir`, `promises.stat`
- `require('path')` → `path.join`, `path.relative`, `path.sep`

#### Cross-Platform (AC SY-15)
- `walkPlans` uses `fs.promises.readdir(dir,{withFileTypes:true})` + `path.join`;
  no hardcoded `/`; no shell; recursion filters `entry.isDirectory()` /
  `entry.isFile() && name.endsWith('.md')`. Verified against the win32-mock AC.

---

### File: `src/hooks/PostToolUse.plan-index-sync.js`
**Action:** CREATE
**Purpose:** Dedicated fire-and-forget PostToolUse hook. Reads
`tool_input.file_path` from the hook stdin payload; if it matches `plans/**/*.md`,
calls `syncUnit` for just that plan; try/catch → logs to `.ctoc/logs/`, never
throws, exits < 10 ms. `PostToolUse.status-check.js` is NOT modified.
**Change Type:** new-hook

#### Behavior (exact)
```
1. read hook JSON from stdin (Claude Code passes { tool_input:{ file_path } }).
   (Note: status-check.js is a bare hook that reads no stdin; this hook DOES,
    matching the CTOC hook I/O convention — read the payload, guard, exit 0.)
2. fp = payload?.tool_input?.file_path; if not a string → exit 0.
3. if !isPlanMd(fp): exit 0.                                   // AC SY-11 (non-plans path → no-op)
     isPlanMd = normalized(fp) matches `plans/` + any depth + `.md`.
4. build deps from the composition root (PI0): require the wiring module that
   exposes { store, embedder, calibrationReady }. The hook does NOT construct the
   store/embedder itself — PI0 owns the singleton. If wiring is unavailable
   (PI0 not yet integrated), exit 0 silently (fail-open).
5. syncUnit(fp, deps).catch(err => logError(logDir, err));    // fire-and-forget; NOT awaited by the runner
6. exit 0 immediately (do not block on the embed).            // AC SY-10 (< 10 ms)
```

#### Dependencies
- `require('../lib/plan-index/sync-unit')` → `syncUnit`
- `require('../lib/safe-fs')` for the error log write
- `require('path')`
- PI0 wiring module (lazy require; fail-open if absent)

#### Called By
- Claude Code hook runner (registered in `.claude-plugin/hooks.json`).

#### Error Handling / Cross-Platform
- Whole body in try/catch; a thrown/rejected sync never reaches the user.
- `path`-based matching; no shell; `process.exit(0)` always.

---

### File: `src/lib/actions.js`  (MODIFY — additive, `movePlan` only)
**Action:** MODIFY
**Purpose:** Add a try/catch-wrapped content-hash guard to `movePlan` so an
in-CTOC stage transition keeps the index consistent: pure stage move (hash equal
before/after the rename) → `store.moveUnit(fromNorm, toNorm)` (NO re-embed);
content also changed → `syncUnit(newPath, deps)`. Both wrapped so an index failure
NEVER blocks the rename (AC SY-13). `createPlan`/`editPlan`/`renamePlan`/
`deletePlan` do NOT exist in actions.js — create/edit are covered by the hook,
delete-orphans by the sweep (per the plan's decision).

#### Changes (exact)
- **Import** (lazy, inside the guard, to avoid a load-time cycle and keep the hot
  path cheap): `const { syncUnit } = require('./plan-index/sync-unit');` and the
  PI0 wiring for `{ store, embedder, calibrationReady }`. Lazy-require mirrors how
  `movePlan`/`approvePlan` already lazy-require `./deployment` (actions.js line
  128) and `./state` (line 709).
- **In `movePlan`** (current body lines 50–65): after computing `newPath` and the
  existing `safeFs.renameSync(planPath, newPath); invalidate();`, ADD:
  ```
  try {
    const wiring = require('./plan-index/wiring-or-null')();   // PI0 seam; null if not integrated
    if (wiring) {
      const before = hashFile(newPath);   // file already at newPath post-rename
      const fromNorm = normalizePlanPath(root, planPath);
      const toNorm   = normalizePlanPath(root, newPath);
      // pure stage move: the bytes are identical, only the path changed → re-path, no re-embed
      wiring.store.moveUnit(fromNorm, toNorm);                 // AC SY-02 (embedder spy stays 0)
      // (a genuine content change on a move is not a movePlan case — movePlan only
      //  renames; content edits arrive via Edit → the PostToolUse hook. So the
      //  guard is a pure re-path. syncUnit is invoked here ONLY if a caller both
      //  edits and moves atomically, which movePlan does not do — kept for the
      //  documented hash-differs branch but unreachable in the pure-rename path.)
    }
  } catch (err) {
    logIndexError(root, 'movePlan', err);                      // .ctoc/logs/ ; never rethrow (AC SY-13)
  }
  ```
- The `invalidate()` call already present is UNCHANGED and is for the plans-count
  cache (a real `plans/**` move). The new block adds NO second `invalidate()` —
  the index write is not a plans-count write (see CF1 analysis).
- `module.exports` is UNCHANGED (no new exports; `movePlan` signature unchanged).

#### Why moveUnit and not syncUnit on a stage move
`movePlan` performs `renameSync` only — the file's bytes are byte-identical before
and after, so the plan's `contentHash` is unchanged. PI1's `moveUnit`/`applyMove`
(store.js 621–641) re-keys every unit of the plan to the new `planPath` and leaves
`embedding`/`_norm`/`contentHash` untouched. Result: `getUnit(oldPath,'__plan__')
=== null`, `getUnit(newPath,'__plan__').embedding` byte-identical, embedder spy
call count `=== 0` (AC SY-02). This is strictly cheaper than a re-embed and is the
whole point of the "no re-embed on pure stage move" requirement.

## Test Plan — `tests/plan-index-sync.test.js`
**Action:** CREATE  |  **Framework:** `node:test` (`describe`/`it`/`assert`)

Hermetic strategy (NO live Ollama, NO real vectors):
- **Stub embedder** — a spy: `let calls = 0; const embedder = async (texts) => {
  calls += texts.length; return texts.map(() => new Float32Array(DIM).fill(0)); };`
  with `embedder.reset = () => { calls = 0; }` and a `get callCount()`. Returns a
  FIXED zero `Float32Array(DIM)` so SY-09 can byte-compare. DIM is a small
  constant (e.g. 8) — the store infers dimension from the first upsert (PI1 D7).
- **Store** — unit cases use a MOCK store object (`{ upsertUnit, getUnit,
  deleteUnit, moveUnit, withBatch }` as spies over a plain `Map`, `withBatch(fn)`
  = `fn(self)`); integration cases use a REAL PI1 store via
  `openStore(path.join(tmp,'.ctoc','index','plan-index.json'))` over an
  `os.tmpdir()` scratch dir, torn down in `afterEach`.
- **calibrationReady** — injected `() => true` for the ready path; `() => false`
  for SY-14.
- **No network, no child_process, no Ollama import anywhere in the test.**

| Test ID | BDD AC (from Acceptance Criteria) | Named `it(...)` | Key assertion |
|---------|----------------------------------|-----------------|---------------|
| SY-01 | "Write tool creates a plan — hook indexes it" | `hook_index_new_plan` | after hook → `getUnit('plans/functional/new-plan.md','__plan__')` not null; `contentHash` = `hashUnit(...)` |
| SY-02 | "Move a plan — no re-embed on pure stage move" | `movePlan_pure_stage_move_repaths_no_reembed` | old `getUnit`→null; new `getUnit` present, `embedding` byte-equal; `embedder.callCount === 0` |
| SY-03 | "Edit tool modifies a plan — hook re-indexes" | `hook_reindex_on_edit` | stored `contentHash` A→B; old A absent; single upsert replace |
| SY-04 | "Plan file deleted — sweep removes orphan" | `reconcile_deletes_orphan_on_file_removal` | after unlink + `reconcileIndex` → `getUnit('plans/functional/y.md','__plan__')` null |
| SY-05 | "Manual editor save caught by sweep" | `reconcile_catches_external_edit` | after external write + sweep → stored `contentHash` = new file hash |
| SY-06 | "Simulated git pull caught by sweep" | `reconcile_catches_git_pull_bytes` | after raw byte replace + sweep → updated unit present |
| SY-07 | "Sweep re-embeds only changed units" | `reconcile_reembeds_only_changed_under_batch` | seed 4 direct + 1 changed, `embedder.reset()`, sweep → `embedder.callCount === 1`; sweep ran inside one `withBatch` |
| SY-08 | "syncUnit is idempotent" | `syncUnit_idempotent_no_duplicate` | 2 calls → one unit; `store.size` delta 0; one embed total |
| SY-09 | "syncUnit stored embedding = stub" | `syncUnit_stores_stub_vector_byte_exact` | `getUnit(...).embedding` byte-equals stub zero `Float32Array` |
| SY-10 | "PostToolUse fires syncUnit for plans/ file" | `hook_fires_for_plans_path_fast` | syncUnit spy called with the file_path; hook exits < 10 ms |
| SY-11 | "PostToolUse does NOT fire for non-plans/ path" | `hook_noop_for_non_plans_path` | syncUnit spy call count 0 for a `src/` path |
| SY-12 | "reconcileIndex deletes orphaned units" | `reconcile_orphan_removal_explicit` | `getUnit` null after delete + sweep (`deleteUnit` invoked) |
| SY-13 | "Throwing embedder does not block movePlan" | `movePlan_error_isolation` | file present at new path; error in `.ctoc/logs/`; no rethrow |
| SY-14 | "calibrationReady gate no-ops syncUnit" | `syncUnit_deferred_until_calibration_ready` | embedder NOT called; no `upsertUnit`; note logged |
| SY-15 | "Cross-platform path walk (win32 mock)" | `reconcile_walk_cross_platform` | no separator error; no shell; `fs.promises` used |

Coverage targets: line + branch ≥ 80% on the three new modules; every `try/catch`
error path exercised (SY-13, SY-14, ENOENT in SY-04); happy + edge + error per
function.

## Iron Loop Execution Steps (canonical labels — Steps 8–16)

> These are the MANDATORY canonical labels enforced by
> `src/lib/plan-validator.js` (`validateStepLabels`) and
> `src/hooks/validate-plan-steps.js`. Order: TEST → PREPARE → IMPLEMENT → REVIEW →
> OPTIMIZE → SECURE → VERIFY → DOCUMENT → FINAL-REVIEW. `iron_loop: true` is set in
> the first frontmatter block so `validateForExecution` passes at todo→in-progress.

- [ ] **Step 8: TEST** — Write `tests/plan-index-sync.test.js` FIRST (TDD-red):
  all 15 cases SY-01…SY-15 mapped above, with the stub embedder + mock/real
  store harness. Tests fail (modules do not yet exist).
- [ ] **Step 9: PREPARE** — Ensure `src/lib/plan-index/` exists (it does);
  confirm `hash-utils.hashString`, `safe-fs.promises`, `state.parseMetadata`,
  barrel `PLAN_SENTINEL` are importable; create the `os.tmpdir()` scratch harness.
- [ ] **Step 10: IMPLEMENT** — Create the four files in dependency order
  (content-hash.js → sync-unit.js → reconcile.js → PostToolUse.plan-index-sync.js),
  add the additive `movePlan` guard in actions.js, register the hook in
  `.claude-plugin/hooks.json`, and bump the hook count in
  `tests/readme-numbers.test.js` (15→16) + `CLAUDE.md`. Pick orphan-enumeration
  option (a) or (b) and record it in `## Decisions Taken Under Ambiguity`.
  NO stubs — make the documented choice and ship working code.
- [ ] **Step 11: REVIEW** — Self-review vs the Architecture Validation Checks
  below (dependency direction inward; DI embedder/calibration; barrel-only PI1
  import; fail-open hot paths).
- [ ] **Step 12: OPTIMIZE** — Confirm the sweep takes exactly one lock
  (`withBatch`), one embed per changed unit, no redundant re-reads.
- [ ] **Step 13: SECURE** — Run the Security Review checklist (path traversal on
  `file_path`, normalization/D9 consistency, no NUL in keys — PI1 rejects it, log
  messages leak no secrets).
- [ ] **Step 14: VERIFY** — `node --test tests/plan-index-sync.test.js` and the
  full suite green (`# fail 0`); lint/typecheck clean; coverage ≥ 80% on new
  modules; benchmark the sweep at 200 plans and record p95 (Risk mitigation).
- [ ] **Step 15: DOCUMENT** — JSDoc on every export (signatures above); update
  the module header comments; ensure `## Decisions Taken Under Ambiguity` records
  the orphan-enumeration choice and normalizePath form.
- [ ] **Step 16: FINAL-REVIEW** — implementation-reviewer verifies 14 quality
  dimensions + this checklist; Gate 3 is human-approved (never auto-crossed).

## Acceptance Criteria Mapping

| BDD Scenario | Implemented in | Test |
|--------------|----------------|------|
| Write creates plan → hook indexes | `PostToolUse.plan-index-sync.js` + `sync-unit.js` | SY-01 |
| Move → old removed/new present, no re-embed | `actions.js movePlan` guard → `store.moveUnit` | SY-02 |
| Edit → hook re-indexes (hash A→B) | hook + `sync-unit.js` upsert replace | SY-03 |
| Deleted → sweep removes orphan | `reconcile.js` orphan removal → `deleteUnit` | SY-04, SY-12 |
| Editor save caught by sweep | `reconcile.js` + `sync-unit.js` | SY-05 |
| git pull caught by sweep | `reconcile.js` + `sync-unit.js` | SY-06 |
| Sweep re-embeds only changed (count) | `reconcile.js` under `withBatch` | SY-07 |
| syncUnit idempotent | `sync-unit.js` hash-diff early-continue | SY-08 |
| stub embedder byte-exact | `sync-unit.js` upsert → PI1 store round-trip | SY-09 |
| hook fires for plans/ path < 10 ms | `PostToolUse.plan-index-sync.js` | SY-10 |
| hook no-op for non-plans path | `PostToolUse.plan-index-sync.js` `isPlanMd` | SY-11 |
| error isolation on throwing embedder | `movePlan` try/catch → `.ctoc/logs/` | SY-13 |
| calibration gate no-ops | `sync-unit.js` `calibrationReady()` guard | SY-14 |
| cross-platform walk | `reconcile.js walkPlans` | SY-15 |

Every BDD scenario maps to ≥ 1 implementation site and ≥ 1 named test. No gaps.

## Architecture Validation Checks (for Step 11 REVIEW)

| Check | Pass criteria |
|-------|---------------|
| Dependency direction | hook → lib; lib → lib (content-hash → hash-utils; sync-unit → content-hash/barrel/safe-fs/state; reconcile → sync-unit/barrel/safe-fs). No lib → hooks. |
| PI1 access via barrel | PI3 imports `src/lib/plan-index/index.js` for `PLAN_SENTINEL`; never `./store` directly. |
| Dependency injection | `embedder` + `calibrationReady` are PARAMETERS; PI3 never `require`s PI2 or PI0. Structural depth = 1. |
| Interface segregation | `syncUnit` takes `{ store, embedder, calibrationReady?, logDir?, batchApi? }` — only what it uses. |
| Fail-open hot paths | hook + `movePlan` guard wrap `syncUnit` in try/catch → `.ctoc/logs/`; never block the primary action. |
| One lock per sweep | `reconcileIndex` runs the whole pass inside a single `store.withBatch`. |

## Security Review (for Step 13 SECURE)

- [ ] **Path traversal** — `file_path` from the hook payload is normalized and
  matched against `plans/**/*.md` before use; a path escaping `plans/` is ignored
  (no-op, not an error). `reconcileIndex` walks only under `plansRoot`.
- [ ] **Key-injection / NUL** — PI1's `upsertUnit` rejects a NUL in
  `planPath`/`sectionId` (store.js 557) and `loadFromDisk` skips+warns NUL keys;
  PI3's `normalizePath` produces plain `plans/...md` strings — no NUL, no
  separator ambiguity (D9 consistent form).
- [ ] **No secrets** — no keys/tokens; log messages carry only paths + error
  `.message`.
- [ ] **Safe file ops** — all fs via `safe-fs`; writes target only
  `.ctoc/index/*` (via the store) and `.ctoc/logs/*` (error log). Never writes
  `plans/**`.
- [ ] **Error messages** — logged to `.ctoc/logs/`, not surfaced to the user; no
  stack traces to end users.
- [ ] **No command injection** — zero `exec`/`execSync`/shell; pure fs + crypto.

## CF1 / `cache.invalidate` analysis (confirmed — does NOT trip the guard)

- The CF1 guard (`tests/cache-freshness.test.js`) asserts that **plans/-count-
  mutating** writers — `movePlan`, `deletePlan`, queue reorder, `createCanvas`,
  `sync.moveToReviewAfterPush`, `stale-cleanup.archivePlan/deletePlan`,
  `vision-decomposer` stub writes, `inbox` question/decision writes — call
  `cache.invalidate()` so `getPlanCounts`/`getInboxCounts`/vision counts stay
  fresh.
- PI3 writes **only** `.ctoc/index/plan-index.json` (through the PI1 store's atomic
  save) and `.ctoc/logs/*`. It writes **NO `plans/**` file** — it never creates,
  moves, or deletes a plan. Therefore it changes NONE of the memoized counts and
  needs NO `cache.invalidate()`. This is the same posture as `task-reconcile`
  (writes `.ctoc/tasks`, not `plans/`) and the operating-manual injector.
- The `invalidate()` already inside `movePlan` (line 63) is for the REAL plan
  rename and is left untouched; PI3's additive index block adds no second
  `invalidate()`. **PI3 does not trip the CF1 guard and requires no cache wiring.**

## README / count-bump impact (FLAGGED)

- **Hook count bump (REQUIRED cross-cutting change):** PI3 adds a new top-level
  hook file `src/hooks/PostToolUse.plan-index-sync.js`. `tests/readme-numbers.test.js`
  line 143 asserts `countTopLevelFiles('src/hooks') === 15`; this MUST become
  `16`, and `CLAUDE.md` line 229 (`15 Claude Code hooks`) MUST become `16`.
  (Pre-existing note: README.md line 813 already says "13 Claude Code hooks" and
  the readme test line 253 asserts `/13 Claude Code hooks/` — a stale mismatch
  that predates PI3; PI3 should NOT be blamed for it but the implementer should
  flag it. The structural `=== 15` assertion is the one PI3 MUST update; touching
  the README prose 13→16 is optional cleanup to be raised, not silently changed
  beyond the required count.)
- **lib module count — NO bump.** `countTopLevelJs('src/lib')` counts ONLY
  top-level `src/lib/*.js` (readme test line 132: `=== 114`). PI3's three new
  modules live in the `src/lib/plan-index/` SUBDIRECTORY (like PI1's `store.js`/
  `index.js`, which also don't count). So the `114 JS modules` figure is
  UNCHANGED. No README/CLAUDE lib-count edit is needed.
- **agent/skill counts — unaffected.**

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| syncUnit throw blocks movePlan | try/catch → `.ctoc/logs/`, never rethrow | `actions.js movePlan` guard; SY-13 |
| Sweep perf at 200+ plans | benchmark at Step 14, record p95; one lock via `withBatch` | `reconcile.js`; VERIFY |
| Hot-path embed queue growth | `calibrationReady()` gate defers all embeds pre-calibration; hook is fire-and-forget | `sync-unit.js`, hook |
| Orphan enumeration needs a PI1 read not in the barrel | Option (a) add `listPlanPaths()` to PI1 (raise via pipeline) OR (b) sweep-snapshot sibling file — pick + document at Step 10 | `reconcile.js`; see Discrepancies |
| Dimension mismatch full-reset | gate writes on `calibrationReady()` until the calibrated dimension is settled (PI1 D7) | `sync-unit.js` |

## Discrepancies (surfaced, not swallowed)

1. **Orphan enumeration vs the shipped PI1 API.** The plan's Scope says
   `reconcileIndex` "calls `store.deleteUnit` for any stored unit whose `planPath`
   no longer exists on disk." Doing that requires enumerating the store's stored
   `planPath`s, but the shipped PI1 public API (`openStore` → `upsertUnit`,
   `getUnit`, `deleteUnit`, `moveUnit`, `getFilesForPlan`, `search`, `save`,
   `withBatch`) and the `withBatch` façade expose NO "list keys / list planPaths"
   read — the `units` Map is private. This is the single real gap between the
   stated design and the real API. Resolution options (both no-native, cross-
   platform, fail-open) are documented in `reconcile.js` above: (a) preferred — a
   small read-only `listPlanPaths()` added to PI1's public API + withBatch façade,
   raised through the pipeline as a PI1 change (NOT back-doored by PI3); (b)
   self-contained fallback — a git-ignored `.ctoc/index/plan-index-sweep.json`
   planPath snapshot maintained by reconcile. The implementer MUST pick one at
   Step 10 and record it under `## Decisions Taken Under Ambiguity`.
2. **`movePlan` "syncUnit on hash-differ" branch is unreachable in practice.**
   `movePlan` only renames (bytes unchanged), so the pure-move `moveUnit` path is
   the only one exercised; the hash-differ→`syncUnit` branch described in the
   plan's Scope cannot fire from `movePlan` alone (content edits arrive via the
   Edit hook). Kept as documented dead-safe code but noted so review does not
   flag it as missing coverage — it is intentionally a no-op branch for `movePlan`.
3. **Hook stdin convention.** `PostToolUse.status-check.js` reads NO stdin; the
   new hook DOES (it needs `tool_input.file_path`). This is consistent with how
   PreToolUse enforcement hooks read their payload, but it is a deliberate
   divergence from the one existing PostToolUse hook — noted so it is not mistaken
   for an inconsistency.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
