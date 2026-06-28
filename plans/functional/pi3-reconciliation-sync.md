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
  - "src/lib/actions.js"
  - "src/hooks/PostToolUse.plan-index-sync.js"
  - "tests/plan-index-sync.test.js"
gate: "Pending Approval (Gate 1: functional → implementation)"
---

# PI3 — Reconciliation Sync: Hash Sweep & Hot-Path Triggers

## Problem Statement

The plan index must never drift from the `.md` plan files regardless of how
those files are changed — menu operations, CLI moves, raw text editor saves,
`git pull`, or any other external tool. Without a content-hash reconciliation
sweep and hot-path triggers wired into every CTOC write path, the DB silently
rots: the exact B1/B2-class failure this vision exists to kill. The `.md` plans
are the single source of truth; the DB is a self-healing, rebuildable mirror.
This slice wires together PI1's store primitives and a dependency-injected
embedder (PI2 wired at integration time by PI0) into a single idempotent
`syncUnit` path used by every write trigger and by the full reconciliation sweep.

## Business Alignment

**Job to Be Done:** When a plan file changes by any means — menu, CLI, editor,
or git — I want the index to reflect the change immediately for in-CTOC
operations and be fully correctable by a sweep for everything else, so that
semantic search and cross-correlation always work against current data.

**Impact Map:**
- **Goal:** Guarantee the DB mirrors the filesystem at all times (vision success criterion 5)
- **Actor:** CTOC pipeline and CTO/developer using CTOC
- **Impact:** Plan modifications are immediately visible in search and related-plan suggestions without manual rebuild steps; git pull and external editor saves heal automatically
- **Deliverable:** Content-hash sweep (`reconcileIndex` in `reconcile.js`), idempotent `syncUnit` with `calibrationReady()` gate, content-hash guard in `actions.js movePlan`, and a dedicated `PostToolUse.plan-index-sync.js` hook targeting `plans/**/*.md` writes

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
  file; `getUnit('plans/functional/new-plan.md', 'summary')` returns a row with
  the correct content hash

- [ ] **Scenario: Move a plan — old path removed, new path present; no re-embed on pure stage move**
  Given a plan indexed at `plans/vision/x.md` with content hash H and a mock
  embedder spy reset to 0 calls
  When `movePlan('plans/vision/x.md', 'done')` is called (content unchanged,
  only stage label in path changes)
  Then `getUnit('plans/vision/x.md', 'summary')` returns null,
  `getUnit('plans/done/x.md', 'summary')` returns the unit with hash H,
  and the embedder spy call count remains 0 (content hash unchanged — re-embed
  skipped by hash guard in `movePlan`)

- [ ] **Scenario: Edit tool modifies a plan — PostToolUse hook re-indexes it**
  Given a plan indexed with content hash A
  When Claude's Edit tool modifies the plan file and the
  `PostToolUse.plan-index-sync.js` hook fires with the file path
  Then `syncUnit` is called; the stored content hash is updated from A to hash B
  (the new content hash); the old hash A is no longer stored

- [ ] **Scenario: Plan file deleted — reconcileIndex sweep removes orphaned unit**
  Given a plan indexed at `plans/functional/y.md`
  When the plan file is removed from the filesystem by any external tool
  Then after `reconcileIndex(plansRoot, { store, embedder })` is run,
  `getUnit('plans/functional/y.md', 'summary')` returns null

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
  contentHash: currentFileHash, vector: stubVector })` (bypassing the embedder),
  1 plan has its file content modified on disk,
  and the mock embedder spy is reset to 0 calls after the direct seeding
  When `reconcileIndex(plansRoot, { store, embedder: mockEmbedder })` is run
  Then `mockEmbedder.callCount === 1` (only the changed plan is re-embedded);
  the 4 unchanged plans produce zero embedder calls

- [ ] **Scenario: syncUnit is idempotent**
  Given a plan is already indexed with hash `def456`
  When `syncUnit(path, { store, embedder })` is called twice on the same
  unchanged file
  Then `SELECT COUNT(*) FROM units WHERE plan_path = ?` returns exactly 1;
  no duplicate row is created; no second embed call is made

- [ ] **Scenario: syncUnit with stub embedder — stored vector matches stub**
  Given a stub embedder that returns a fixed `Float32Array` of zeros at the
  configured dimension
  When `syncUnit(path, { store, embedder: stubEmbedder })` is called
  Then `getUnit(path, 'summary').vector` equals the stub zero array byte-for-byte

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
  Then the embedder is NOT called, no DB write is made, and a diagnostic note
  (`'syncUnit: calibration not ready — deferred'`) is logged to `.ctoc/logs/`

## Non-Functional Requirements

- **Idempotent**: Every operation is safe to run multiple times — the sweep is
  idempotent; `syncUnit` is idempotent; re-running on unchanged files is a no-op.
- **Self-healing**: Partial or failed embeds from a previous run are retried on
  the next sweep because the content hash in the DB will not match the current
  file content.
- **Dependency-injected embedder**: `syncUnit(path, { store, embedder })` —
  PI3 never imports PI2 directly; PI2 is wired at integration time by PI0's
  composition root. PI3's structural dependency depth is 1 (PI1 only).
- **Error isolation**: Every `syncUnit` call in hot-path wrappers is wrapped in
  `try/catch`; index errors are logged to `.ctoc/logs/` and never surface to
  the user as plan-mutation failures. The DB is a cache; it must not block the
  primary action.
- **Hook minimalism**: The PostToolUse trigger uses a dedicated new
  `PostToolUse.plan-index-sync.js` hook; no logic is added to the existing
  `PostToolUse.status-check.js`. The new hook fires only for file paths matching
  `plans/**/*.md` (read from `tool_input.file_path`).

## Scope

### In Scope
- `content-hash.js`: deterministic SHA-256 of a unit's text + selected
  frontmatter fields (`files:`, `parent_vision`, `status`); wraps `hashString`
  from `src/lib/hash-utils.js` (reuse — do not reinvent crypto); cross-platform
- `sync-unit.js`: `syncUnit(path, { store, embedder })` — reads file, extracts
  units, hashes each, checks DB, re-embeds and upserts only if hash changed;
  idempotent; checks `calibrationReady()` and no-ops with a logged note if
  calibration has not yet completed
- `reconcile.js`: exports `reconcileIndex(plansRoot, { store, embedder })`
  (named `reconcileIndex` to avoid collision with existing `src/lib/reconciliation.js
  reconcile()`); walks `plans/**/*.md` with `fs.promises`, calls `syncUnit` for
  each file, calls `store.deleteUnit` for any DB row whose path no longer exists
  on disk
- `src/lib/actions.js`: wrap ONLY `movePlan` — add a content-hash guard using
  `hashFile` from `src/lib/hash-utils.js`; if the file hash before and after the
  rename is identical (pure stage move), update the DB row path without
  re-embedding; if the hash differs, call `syncUnit`; both paths wrapped in
  `try/catch`
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
`upsertUnit`, `getUnit`, `deleteUnit` as spies) and a stub embedder (returns
fixed `Float32Array`). Integration tests against a real PI1 store are tagged and
gated on PI1 completion.

| Test ID | Description                                                | Key Assertion                                                             |
|---------|------------------------------------------------------------|---------------------------------------------------------------------------|
| SY-01   | Write tool creates plan → hook fires → getUnit present     | getUnit returns row; correct hash; hook fired via spy                     |
| SY-02   | movePlan pure stage move → old null, new present; hash guard | Both getUnit verified; embedder spy callCount === 0                     |
| SY-03   | Edit tool modifies plan → hook fires → hash updated        | Stored hash !== original hash; new hash matches file content              |
| SY-04   | Plan file deleted → reconcileIndex sweep → getUnit null    | getUnit returns null after file removal + reconcileIndex run              |
| SY-05   | External file write (editor save) caught by sweep          | After reconcileIndex, stored hash = new content hash                     |
| SY-06   | git pull simulation caught by sweep                        | Updated unit in DB after reconcileIndex; no manual step                  |
| SY-07   | Sweep call count: 4 seeded directly, 1 changed, spy reset → 1 embed call | mockEmbedder.callCount === 1 after spy reset      |
| SY-08   | syncUnit idempotent: 2 calls → 1 DB row                    | SELECT COUNT(*) === 1; embedder called once total                        |
| SY-09   | syncUnit with stub embedder: stored vector = stub zeros    | getUnit(path).vector byte-equals stub Float32Array                       |
| SY-10   | PostToolUse fires syncUnit for plans/ path                 | Spy called with correct file_path argument; hook exits < 10 ms            |
| SY-11   | PostToolUse does NOT fire for non-plans/ path              | Spy call count === 0 for src/ path                                       |
| SY-12   | reconcileIndex deletes orphaned DB rows                    | getUnit null after file deleted + reconcileIndex                         |
| SY-13   | Error isolation: throwing embedder does not block movePlan | File at new path; error in .ctoc/logs/; no rethrow                      |
| SY-14   | calibrationReady gate: embedder not called until ready     | Embedder not called; no DB write; note logged                            |
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
4. Delete `.ctoc/index/plans.db` to clear any partial state; rebuild is
   trivially triggered on next `reconcileIndex` call.
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
  identical (pure stage move), the DB row is updated to the new path without
  calling the embedder. If different (content also changed), `syncUnit` is called.
  This prevents unnecessary re-embedding on every stage transition.
- **calibrationReady() gate**: `syncUnit` checks `calibrationReady()` (supplied
  by PI0's composition root) before doing any embedding work. If calibration has
  not yet completed, `syncUnit` logs a diagnostic note and returns without writing
  to the DB. This prevents dimension mismatches if syncUnit fires before
  `initVectorTable` is called.
- **Error isolation policy**: syncUnit errors in hot-path wrappers are caught,
  logged to `.ctoc/logs/`, and swallowed. The DB is a self-healing cache; an
  index failure must never block a plan mutation. Wrong choices here are caught
  at the next reconciliation sweep.
- **No fs.watch**: A persistent watcher is out of scope. The PostToolUse hook
  covers all in-CTOC tool-call writes; `reconcileIndex` covers everything else
  (external editors, git, CLI). The combination is sufficient and avoids
  OS-specific watcher complexity.
- **reconcileIndex deletes orphaned DB rows**: When `reconcileIndex` finds a DB
  unit whose `plan_path` no longer exists on disk, it calls `store.deleteUnit`.
  This is the correct self-healing behavior — the plan is the truth; the DB
  row must be removed.
- **Unit granularity**: Hashing mirrors PI1's units — one plan-summary unit +
  one unit per section; a unit's hash covers its source text plus the
  frontmatter fields that affect retrieval (`files:`, `parent_vision`, `status`).
