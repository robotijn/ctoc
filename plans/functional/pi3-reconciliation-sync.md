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
acceptance_criteria_count: 11
risk_level: MEDIUM
files:
  - "src/lib/plan-index/reconcile.js"
  - "src/lib/plan-index/content-hash.js"
  - "src/lib/plan-index/sync-unit.js"
  - "src/lib/actions.js"
  - "src/scripts/move-plan.js"
  - "src/hooks/PostToolUse.status-check.js"
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
embedder (PI2 wired at integration time) into a single idempotent `syncUnit`
path used by every write trigger and by the full reconciliation sweep.

## Business Alignment

**Job to Be Done:** When a plan file changes by any means — menu, CLI, editor,
or git — I want the index to reflect the change immediately for in-CTOC
operations and be fully correctable by a sweep for everything else, so that
semantic search and cross-correlation always work against current data.

**Impact Map:**
- **Goal:** Guarantee the DB mirrors the filesystem at all times (vision success criterion 5)
- **Actor:** CTOC pipeline and CTO/developer using CTOC
- **Impact:** Plan modifications are immediately visible in search and related-plan suggestions without manual rebuild steps; git pull and external editor saves heal automatically
- **Deliverable:** Content-hash sweep (`reconcile.js`), idempotent `syncUnit`, and hot-path trigger wrappers in `actions.js`, `move-plan.js`, and `PostToolUse.status-check.js`

## User Stories

**As a** developer using CTOC, **I want** plan edits to be reflected in the
index within the same menu interaction, **so that** related-plans suggestions
stay current without a manual rebuild step.

**As a** CTOC system component (git, external editor, CLI), **I want** the
reconciliation sweep to heal any drift automatically, **so that** the index is
self-correcting regardless of what external tool modified the plans.

## Acceptance Criteria

- [ ] **Scenario: Create a plan — DB reflects it**
  Given an empty index
  When a new plan file is created via `actions.js` `createPlan`
  Then `getUnit(path, 'summary')` returns a row with the correct content hash
  within the same async operation (after `await`)

- [ ] **Scenario: Move a plan — old path removed, new path present**
  Given a plan indexed at `plans/vision/x.md`
  When the plan is moved to `plans/done/x.md` via `move-plan.js`
  Then `getUnit('plans/vision/x.md', 'summary')` returns `null` and
  `getUnit('plans/done/x.md', 'summary')` returns the unit

- [ ] **Scenario: Edit a plan — content hash is updated**
  Given a plan is indexed with hash `abc123`
  When the plan file body is edited and saved via a CTOC action
  Then the next `syncUnit` call upserts a row with a new content hash; the old
  hash `abc123` is no longer stored

- [ ] **Scenario: Delete a plan — unit removed**
  Given a plan is indexed at `plans/functional/y.md`
  When the plan file is deleted via `actions.js` `deletePlan`
  Then `getUnit('plans/functional/y.md', 'summary')` returns `null`

- [ ] **Scenario: Manual editor save caught by sweep**
  Given a plan file is modified directly by a text editor (outside CTOC control)
  When `reconcile(plansRoot, { store, embedder })` is run
  Then the unit for that file is re-embedded and the stored hash matches the new
  content hash

- [ ] **Scenario: Simulated git pull caught by sweep**
  Given a plan file's content is replaced by writing new bytes directly to the
  filesystem (simulating a `git pull` change outside CTOC)
  When `reconcile(plansRoot, { store, embedder })` is run
  Then the updated unit is in the DB; no manual intervention is required

- [ ] **Scenario: Sweep re-embeds only changed units (call count assertion)**
  Given 5 plans are indexed; exactly 1 plan is modified
  When `reconcile(plansRoot, { store, embedder })` is run with an injected mock
  embedder
  Then the mock embedder is called exactly once (for the changed plan only);
  the 4 unchanged plans produce zero embedder calls

- [ ] **Scenario: syncUnit is idempotent**
  Given a plan is already indexed with hash `def456`
  When `syncUnit(path, { store, embedder })` is called twice on the same
  unchanged file
  Then `SELECT COUNT(*) FROM units WHERE plan_path = ?` returns exactly 1;
  no duplicate row is created; no second embed call is made

- [ ] **Scenario: syncUnit uses injected embedder — no real engine**
  Given a stub embedder that synchronously returns a fixed `Float32Array` of
  zeros at the configured dimension
  When `syncUnit(path, { store, embedder: stubEmbedder })` is called
  Then no real Ollama HTTP call is made; no in-process ONNX runtime is loaded;
  the stored vector equals the stub zeros

- [ ] **Scenario: PostToolUse hook fires syncUnit for plans/ file**
  Given the PostToolUse hook is active and a plan file under `plans/` is written
  by a Claude tool call
  When the hook fires
  Then `syncUnit` is called with that specific file path (verified via an
  injected sync spy); no error surfaces to the user

- [ ] **Scenario: Cross-platform — all file ops use path.join and fs.promises**
  Given CTOC is running on Windows (mocked via `process.platform = 'win32'`)
  When `reconcile` walks `plans/**`
  Then all file reads use `fs.promises.readFile` with `path.join`-constructed
  paths; no shell commands are invoked; no hardcoded `/` separators appear in
  the walk logic

## Non-Functional Requirements

- **Async throughout**: `reconcile` and `syncUnit` are async functions returning
  `Promise`; the CTOC menu event loop is never blocked.
- **Idempotent**: Every operation is safe to run multiple times — the sweep is
  idempotent; `syncUnit` is idempotent; re-running on unchanged files is a no-op.
- **Self-healing**: Partial or failed embeds from a previous run are retried on
  the next sweep because the content hash in the DB will not match the current
  file content.
- **Dependency-injected embedder**: `syncUnit(path, { store, embedder })` —
  PI3 never imports PI2 directly; PI2 is wired at integration time by the
  caller. PI3's structural dependency depth is 1 (PI1 only).
- **Error isolation**: Every `syncUnit` call inside `actions.js` hot-path
  triggers is wrapped in `try/catch`; index errors are logged to `.ctoc/logs/`
  and never surface to the user as plan-mutation failures. The DB is a cache;
  it must not block the primary action.
- **Hook minimalism**: The PostToolUse trigger extends the existing
  `PostToolUse.status-check.js`; no new hook file is added; the syncUnit call
  fires only for file paths matching `plans/**/*.md`.

## Scope

### In Scope
- `content-hash.js`: deterministic SHA-256 of a unit's text + selected
  frontmatter fields (`files:`, `parent_vision`, `status`); uses
  `node:crypto`; cross-platform
- `sync-unit.js`: `syncUnit(path, { store, embedder })` — reads file, extracts
  units, hashes each, checks DB, re-embeds and upserts only if hash changed;
  idempotent
- `reconcile.js`: `reconcile(plansRoot, { store, embedder })` — walks
  `plans/**/*.md` with `fs.promises`, calls `syncUnit` for each file, calls
  `store.deleteUnit` for any DB row whose path no longer exists on disk
- `src/lib/actions.js`: wrap `createPlan`, `movePlan`, `editPlan`,
  `renamePlan`, `deletePlan` — call `syncUnit` (create/edit/rename) or
  `store.deleteUnit` (delete) after the filesystem op, inside a `try/catch`
- `src/scripts/move-plan.js`: add `syncUnit` call after the move filesystem
  op, inside a `try/catch`
- `src/hooks/PostToolUse.status-check.js`: extend with a `syncUnit` call that
  fires after existing status-check logic, guarded to `plans/**/*.md` paths only
- `tests/plan-index-sync.test.js`: covers all 11 scenarios above; uses injected
  mock embedder and either a real PI1 store (integration) or a mock store (unit)

### Out of Scope
- Producing actual vectors (PI2 — injected as a parameter, not imported)
- The store schema and CRUD primitives (PI1 — used via the public barrel API)
- Querying, ranking, or Reciprocal Rank Fusion (PI4)
- Duplicate guard thresholds and conflict detection (PI5–PI6)
- A dedicated file-system watcher process (`fs.watch` / `chokidar`): sweep +
  hook coverage is sufficient; a persistent watcher adds OS-specific complexity
  and is out of scope
- Batching multiple plans into a single embed call (PI3 embeds one plan at a
  time via `syncUnit`; batch optimization is a future PI2/PI4 concern)
- Reconciliation of non-plan files (only `plans/**/*.md` is in scope)

## Test Plan

Framework: Node `--test`. PI3 unit tests use a mock store (object with
`upsertUnit`, `getUnit`, `deleteUnit` as jest-style spies) and a stub embedder
(returns fixed `Float32Array`). Integration tests against a real PI1 store are
tagged and gated on PI1 completion.

| Test ID | Description                                              | Key Assertion                                                   |
|---------|----------------------------------------------------------|-----------------------------------------------------------------|
| SY-01   | createPlan → getUnit present                             | getUnit returns row with correct hash                           |
| SY-02   | movePlan → old null, new present                         | Both getUnit calls verified                                     |
| SY-03   | editPlan → hash updated                                  | Stored hash !== original hash                                   |
| SY-04   | deletePlan → getUnit null                                | getUnit returns null                                            |
| SY-05   | External file write caught by sweep                      | After reconcile, stored hash matches new content hash           |
| SY-06   | Sweep call count: 1 changed / 5 total → 1 embed call    | mock embedder.callCount === 1                                   |
| SY-07   | syncUnit idempotent: 2 calls → 1 DB row                  | SELECT COUNT(*) === 1; embedder called once total               |
| SY-08   | syncUnit with stub embedder: no real engine              | No HTTP call; no ONNX load; stored vector === stub zeros        |
| SY-09   | PostToolUse fires syncUnit for plans/ path               | Spy called with correct path argument                           |
| SY-10   | PostToolUse does NOT fire for non-plans/ path            | Spy call count === 0 for src/ path                              |
| SY-11   | reconcile deletes DB rows for deleted files              | getUnit returns null after file deleted + reconcile             |
| SY-12   | Cross-platform path walk (win32 mock)                    | No separator errors; no shell invocations                       |

## Risks

### Technical Risks
- **syncUnit throw in actions.js breaks primary action**: If the `try/catch`
  wrapper is missing or incomplete, an index failure could surface to the user
  as a plan-mutation error.
  - Likelihood: MEDIUM (easy to get wrong during implementation)
  - Impact: HIGH (blocks all plan mutations if triggered)
  - Mitigation: Enforce the `try/catch` wrapping in code review; add a test
    (SY-01 variant) that simulates a syncUnit throw and asserts the primary
    action still succeeds

- **Sweep performance on large plan sets**: Hashing every `.md` file on each
  sweep could be measurable at 200+ plans.
  - Likelihood: LOW (CTOC plans are typically <100 files)
  - Impact: LOW (async; does not block the menu)
  - Mitigation: Benchmark at 200 plans during Step 14 VERIFY; document the
    p95 sweep latency in the plan's test results

- **PostToolUse hook extension breaks existing status-check behavior**: Adding
  the syncUnit call to an existing hook file introduces coupling risk.
  - Likelihood: MEDIUM
  - Impact: MEDIUM (hook regression could affect existing CTOC status reporting)
  - Mitigation: Place the syncUnit call after all existing status-check logic;
    guard with a `plans/` path check before any index call; the existing
    `PostToolUse.status-check.js` tests must still pass after the extension

### Business Risks
- **Hot-path trigger on every save is async overhead**: If `syncUnit` queues
  an embed for every keystroke-triggered save, the embed queue grows during
  active editing sessions.
  - Likelihood: MEDIUM
  - Impact: LOW (async; no impact on editor performance; queue drains when
    editing stops)
  - Mitigation: Accept the queue growth; it is bounded by the number of saves
    in a session; embed queue is drained before the next menu interaction

### Dependency Risks
- **PI1 required for integration tests**: SY-01 through SY-12 against a real
  store require PI1's `openStore` and CRUD API.
  - Likelihood: HIGH (structural)
  - Impact: LOW (PI3 unit tests use a mock store and run independently; only
    the integration test suite is gated on PI1)
  - Mitigation: Ship PI1 first; PI3 unit tests are self-contained

## Rollback

1. Revert `src/lib/plan-index/reconcile.js`, `content-hash.js`, and
   `sync-unit.js` to prior commit.
2. Revert the additions to `src/lib/actions.js`, `src/scripts/move-plan.js`,
   and `src/hooks/PostToolUse.status-check.js` — existing behavior is preserved
   because the existing test suites for these files must still pass.
3. Delete `.ctoc/index/plans.db` to clear any partial state; rebuild is
   trivially triggered on next `reconcile` call.
4. PI1 store code is unaffected; PI2 embedding code is unaffected.

## Dependencies

- **PI1** (`pi1-index-store-and-schema`): `upsertUnit`, `deleteUnit`, `getUnit`
  API via the barrel `src/lib/plan-index/index.js`. Structural dependency.
- **PI2** (`pi2-embedding-engine`): injected as the `embedder` parameter at
  integration time; PI3 never imports PI2 directly. Wired by the caller
  (reconcile trigger, hot-path wrapper, PostToolUse hook).
- **Node 24 built-ins**: `node:crypto` (SHA-256), `node:fs/promises`,
  `node:path`. No npm packages required.

## Decisions Taken Under Ambiguity

- **Unit granularity**: Hashing mirrors PI1's units — one plan-summary unit +
  one unit per section; a unit's hash covers its source text plus the
  frontmatter fields that affect retrieval (`files:`, `parent_vision`, `status`).
- **Hook reuse**: Extends existing `PostToolUse.status-check.js` rather than
  adding a new hook file, to avoid hook proliferation. The extension is guarded
  to `plans/**/*.md` paths; existing hook behavior is unchanged for all other
  paths.
- **Injected embedder pattern**: `syncUnit(path, { store, embedder })` —
  PI3 depends structurally on PI1 only. PI2 is wired at the integration call
  site. This keeps every dependency chain at depth <= 2 and makes PI3
  independently testable with a stub embedder.
- **Error isolation policy**: syncUnit errors in hot-path wrappers are caught,
  logged to `.ctoc/logs/`, and swallowed. The DB is a self-healing cache; an
  index failure must never block a plan mutation. Wrong choices here are caught
  at the next reconciliation sweep.
- **No fs.watch**: A persistent watcher is out of scope. The PostToolUse hook
  covers all in-CTOC tool-call writes; the reconciliation sweep covers
  everything else (external editors, git, CLI). The combination is sufficient
  and avoids OS-specific watcher complexity.
- **reconcile deletes orphaned DB rows**: When `reconcile` finds a DB unit
  whose `plan_path` no longer exists on disk, it calls `store.deleteUnit`.
  This is the correct self-healing behavior — the plan is the truth; the DB
  row must be removed.
