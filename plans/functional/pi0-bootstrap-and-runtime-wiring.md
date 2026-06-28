---
title: "PI0 — Bootstrap, Runtime Capability-Gate & Composition Root"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 4
depends_on:
  - pi1-index-store-and-schema
  - pi2-embedding-engine
  - pi3-reconciliation-sync
files:
  - "src/lib/plan-index/runtime.js"
  - "src/lib/plan-index/bootstrap.js"
  - "src/lib/plan-index/index.js"
  - "src/hooks/SessionStart.js"
  - "src/tabs/overview.js"
  - ".gitignore"
  - "tests/plan-index-smoke.test.js"
  - "tests/plan-index-bootstrap.test.js"
---

# PI0 — Bootstrap, Runtime Capability-Gate & Composition Root

> **Pending Approval — Gate 1: functional → implementation**

This plan was added by the adversarial review (2026-06-28). The 5-critic panel
found three load-bearing capabilities that **no PI1–PI6 plan owned**: first-run
backfill, query-embedding wiring, and the production composition root. Without
them the index is permanently empty and search has no probe vector — the feature
would "run" while the human sees nothing. PI0 owns the runtime that makes the
rest live.

## Problem Statement

- **First-run backfill is unowned.** PI3's triggers fire only on *new* mutations;
  nothing reconciles the index over *existing* plans at startup. Fresh install →
  empty index → search/related/duplicate/conflict all return nothing.
- **Query embedding is unowned.** PI4 is read-only and does not call PI2, so the
  vector half of `search()` has no probe vector.
- **The composition root is unowned.** PI3 injects an embedder but refuses to
  import PI2; nobody constructs and wires the real embedder + store + sync in
  production.
- **Runtime availability is unowned.** `node:sqlite` needs Node 22.5+ (extension
  loading ~24), emits an `ExperimentalWarning` (a defect by "warnings are bugs"),
  and may throw on flagged/older builds; `package.json` says `engines >=18` and
  the plugin runs under the *user's* Node. CTOC must never crash or break an
  existing install because the index runtime is absent.

## Scope this slice owns

1. **Capability gate** (`runtime.js`): at load, feature-detect `node:sqlite`,
   `enableLoadExtension`/`loadExtension`, the `vec0` extension, and FTS5. If any
   is unavailable, the index is **disabled gracefully** — the menu works
   normally and shows a one-line, legible "semantic index unavailable on this
   Node (needs ≥ 22.5 with extension support)" notice. Capture/justify the
   `ExperimentalWarning` so it is never emitted raw. Document the minimum Node.
2. **Composition root** (`runtime.js`): construct the store (PI1), the embedder
   (PI2), and the sync (PI3) once, and expose the wired singletons (incl. the
   embedder PI4 uses to embed queries).
3. **Bootstrap / backfill** (`bootstrap.js`): on first run and on SessionStart,
   run the full `reconcile` over **all existing plans**. Calibration (30–90 s)
   and the initial embed run in a **background process** (the existing background
   mechanism), never on the menu render path; a visible "building index N/M"
   status is surfaced in `src/tabs/overview.js`. (Per the locked execution
   decision: synchronous reads, background build.)
4. **Gitignore** `.ctoc/index/`. Commit the runtime smoke test.

## Business Alignment

**JTBD:** When I install or open a CTOC project, the semantic index either works
end-to-end (search returns real results over my existing plans) or, where my Node
cannot support it, CTOC keeps working and tells me plainly why the index is off —
never a crash, never a silent empty box.

## Acceptance Criteria

- [ ] **Scenario: Capability gate disables cleanly on unsupported Node**
  Given a runtime where `require('node:sqlite')` throws or `vec0`/FTS5 is absent
  When the index runtime loads
  Then `isIndexAvailable()` returns false, the menu renders normally, and a
  single legible "index unavailable" notice is shown — no exception propagates.
- [ ] **Scenario: ExperimentalWarning is owned**
  Given a supported Node that emits the SQLite `ExperimentalWarning`
  When the runtime initializes
  Then the raw warning is suppressed/captured and replaced by a controlled,
  documented log line (no unhandled `ExperimentalWarning` reaches the user).
- [ ] **Scenario: First-run backfill populates the index over existing plans**
  Given a project with N plan files and an empty/missing `.ctoc/index/plans.db`
  When bootstrap runs
  Then after the background build completes the index contains units for all N
  plans and a search for a known plan's topic returns it.
- [ ] **Scenario: Background build never blocks the menu**
  Given calibration has not yet run
  When the user opens the menu
  Then the menu renders within its normal time budget and shows a
  "building index" status; no render call waits on calibration or embedding.
- [ ] **Scenario: Composition root provides the query embedder to search**
  Given the runtime is available and calibrated
  When `search(query)` runs
  Then the query is embedded via the wired PI2 embedder and the vector half of
  retrieval is non-empty (the read features never construct their own embedder).
- [ ] **Scenario: Rebuild equivalence (vision criterion 5)**
  Given a populated index
  When `.ctoc/index/plans.db` is deleted and bootstrap re-runs on the same
  machine with the same calibrated model
  Then the rebuilt index returns the same top-k for a fixed query set as before
  the delete (set-equal within float tolerance).
- [ ] **Scenario: Committed runtime smoke test**
  Given CI on a supported Node
  When `tests/plan-index-smoke.test.js` runs
  Then it loads `vec0` (`vec_version()` matches semver), creates an FTS5 table,
  and a 2-vector KNN returns correct ordering — proving the stack, not asserting it.

## Non-Functional Requirements

| NFR | Target |
|---|---|
| Never break install | On any Node, loading CTOC + opening the menu must succeed even when the index is unavailable. |
| Cross-platform | macOS/Linux/Windows; binary + paths via `process.platform`/`path.join`. |
| Non-blocking | Render path never awaits embedding/calibration; background build only. |
| Fail-open | Any index/runtime error is logged to `.ctoc/logs/` and disables the index; it never blocks the menu or a plan mutation. |

## Out of Scope

Store schema (PI1), embedder internals (PI2), sync triggers (PI3), the retrieval
algorithms and UI panels (PI4–PI6). PI0 only wires, gates, and bootstraps them.

## Dependencies

PI1 (store), PI2 (embedder + calibration dimension), PI3 (reconcile + syncUnit).
PI4/PI5/PI6 depend on PI0 for the wired runtime + query embedder.

## Rollback

Capability gate already makes the feature removable at runtime (disable flag);
deleting `.ctoc/index/` and the `plan-index` modules restores prior behavior.

## Decisions Taken Under Ambiguity

- **Execution model (locked by human):** synchronous DB reads on the main thread;
  embedding + calibration in a background process; the infeasible async-injection
  / 500 ms-partial NFRs are dropped.
- **Runtime policy (locked by human):** capability-gate and degrade; never bump
  `engines` (would break existing installs).
- **Settings:** read via `src/lib/settings.js` `getSetting` (`.ctoc/settings.json`);
  `plan_index` registered in `SETTINGS_SCHEMA` by PI1. (Note pre-existing drift:
  init writes `settings.yaml` while the runtime API reads `settings.json`.)
- **Backfill trigger:** SessionStart kicks a background build if the index is
  stale/empty; the menu reads whatever is ready.
