---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T12:36:24.694Z
gate_crossed: implementation → todo
---

---
title: "PI6-s2 — Conflict flags in the LIVE pipeline area"
type: implementation
parent_plan: pi6-conflict-dependency-detection
depends_on: pi6-s1-conflict-detect-core
priority: MEDIUM
program: ctoc-planning-intelligence
iron_loop: true
files:
  - "src/areas/pipeline.js"
  - "tests/plan-index-conflict-surface.test.js"
---

# PI6-s2 — Conflict flags in the LIVE pipeline area

> **Slice scope.** Wire `detectConflicts` (from PI6-s1's barrel export) into the
> **LIVE mounted pipeline area** (`src/areas/pipeline.js`) so the dashboard a user
> actually sees shows a "potential conflict or dependency" flag naming the other plan
> and the overlapping files. This is the PI4 lesson applied LITERALLY: the wiring goes
> into the SAME mounted `render(app)` / `activate(app)` path that PI4-s4 used for the
> Related-Plans panel, reusing the SAME async-fetch/sync-render bridge, and the test
> DRIVES the real pipeline render (`render(app)` after the async prefetch), not a
> private helper in isolation.
>
> **BUG THIS SLICE FIXES.** The prior s2 (`pi6-s2-overview-conflict-surface.md`, now
> deleted) targeted `src/tabs/overview.js` — the LEGACY UNMOUNTED overview tab. PI4
> proved first-hand that features wired into `src/tabs/overview.js` are DEAD to the
> human: the mounted dashboard is `src/areas/pipeline.js`, and PI4-s4 was itself a
> kickback that moved the Related-Plans panel OUT of `overview.js` and INTO
> `pipeline.js`. Rendering the conflict surface in `overview.js` would repeat exactly
> that pi1-inert / dead-tab mistake. This slice targets the LIVE `pipeline.js`.

## Implementation Details

### Architecture Decision

**Context — the LIVE bridge already exists in `src/areas/pipeline.js`.** Read fresh,
`pipeline.js` is the default landing area (the mounted dashboard). PI4-s4 already
wired the Related-Plans panel into it:
- It imports the helpers from the canonical home:
  `const { renderRelatedPanel, prefetchRelated } = require('../tabs/overview');`
  (overview.js is kept as the ONE implementation of the async-fetch/sync-render bridge
  to avoid drift — pipeline.js's own comment says so).
- Its mounted `render(app)` calls `out += renderRelatedPanel(app);` (sync render half,
  reads the pre-stashed `app.relatedPlans`).
- Its `async function activate(app)` seeds `app.selectedPlan` via `pickSeedPlan(root)`
  then `await prefetchRelated(app)` (async fetch half, fired off the render path on area
  activation). Fully fail-open: `catch { app.relatedPlans = []; }`.
- `module.exports = { render, handleKey, activate, pickSeedPlan };`

**Decision — mirror that exact bridge for conflicts, additively, in `pipeline.js`.**
The conflict async-fetch/sync-render helpers live in the SAME canonical home
(`src/tabs/overview.js`) that PI6-s2's sibling wiring imports from — keeping ONE
implementation, exactly as pipeline.js already does for Related Plans and exactly as
PI4-s4 established. Concretely:

1. **`overview.js` gains `prefetchConflicts(app)` + `renderConflictPanel(app)`**
   (the async-fetch half and the sync-render half), mirroring its existing
   `prefetchRelated` / `renderRelatedPanel` pair. `prefetchConflicts` reads
   `app.selectedPlan` (the SAME seed `prefetchRelated` uses),
   `await require('../lib/plan-index').detectConflicts(seed, { projectPath })`, and
   stashes `app.conflicts = results.slice(0, cap)`. `renderConflictPanel` reads
   `app.conflicts` and returns the rendered block (or `''` when empty/absent). Both are
   fully fail-open (fetch → `app.conflicts = []` on any error; render → `''` on any error).

   > NOTE ON FILE OWNERSHIP: this slice's declared `files:` is `src/areas/pipeline.js`
   > (the LIVE mount) + its test. The `prefetchConflicts` / `renderConflictPanel` helpers
   > added to `src/tabs/overview.js` are the shared bridge implementation reused by the
   > pipeline mount — created here as the minimal support for the live wiring, exactly as
   > PI4-s4's Related-Plans helpers live in overview.js and are consumed by pipeline.js.
   > If the executor prefers to keep the helper bodies co-located in `pipeline.js` instead
   > of `overview.js` (to keep this slice's edits within its declared `files:`), that is an
   > acceptable equivalent: the load-bearing requirement is that the conflict panel renders
   > in the LIVE `pipeline.js` `render(app)` output and the fetch fires from
   > `pipeline.js`'s `activate(app)`. This choice is recorded in
   > `## Decisions Taken Under Ambiguity`.

2. **`pipeline.js` `render(app)` renders the conflict panel in the LIVE output:** add
   `out += renderConflictPanel(app);` directly AFTER the existing
   `out += renderRelatedPanel(app);` line — so the conflict block appears in the actual
   mounted dashboard, NOT behind a flag, NOT in the dead overview tab.

3. **`pipeline.js` `activate(app)` fires the conflict prefetch off the render path:**
   after `await prefetchRelated(app);` add `await prefetchConflicts(app);` (same seeded
   `app.selectedPlan`), inside the same fail-open try/catch so activation NEVER breaks
   the menu (`catch { app.relatedPlans = []; app.conflicts = []; }`).

4. **`pipeline.js` imports** `prefetchConflicts, renderConflictPanel` from
   `../tabs/overview` alongside the existing `renderRelatedPanel, prefetchRelated`.

**Consequences.** The conflict flag renders in the real pipeline area a user actually
sees — the same surface that fixed PI4-s4. No new surface, no duplication of the bridge,
no touching the dead `overview.js` render path. `detectConflicts` is async and the
PI4-s4 bridge is purpose-built for an async fetch feeding a sync render, so the shapes
match. Fail-open is preserved end-to-end: a semantic-index fault can never break the
dashboard (the load-bearing "never break the menu" invariant pipeline.js already holds).

### Dependency Graph

```
src/areas/pipeline.js
  render(app)   --calls (sync)-->  renderConflictPanel(app)   [reads app.conflicts]
  activate(app) --awaits-->        prefetchConflicts(app)      [fetch off render path]
  --imports-->  { renderConflictPanel, prefetchConflicts } from ../tabs/overview

src/tabs/overview.js  (canonical bridge home — reused, mirrors renderRelatedPanel/prefetchRelated)
  prefetchConflicts(app) --awaits--> require('../lib/plan-index').detectConflicts  [PI6-s1 barrel]
  renderConflictPanel(app)          --reads--> app.conflicts

tests/plan-index-conflict-surface.test.js
  --drives-->  pipeline.activate(app) then pipeline.render(app)   (the REAL mounted flow)
  --asserts--> render(app) output contains the conflict panel (slug + files + severity)
```

Depends on PI6-s1 (`detectConflicts` must exist on the barrel). No cycle: `pipeline.js`
already imports from `../tabs/overview` and `../lib/plan-index`; neither imports back
into `pipeline.js`.

### File Specifications

#### File: `src/areas/pipeline.js`
**Action:** MODIFY
**Purpose:** Surface conflict/dependency flags in the LIVE mounted pipeline dashboard
via the existing PI4-s4 async-fetch/sync-render bridge.
**Change Type:** modify-existing (additive)

##### Changes
- **Extend the import** (line ~22) from:
  `const { renderRelatedPanel, prefetchRelated } = require('../tabs/overview');`
  to also pull `renderConflictPanel, prefetchConflicts`.
- **Modify `render(app)`**: after the existing `out += renderRelatedPanel(app);`
  (line ~70) add `out += renderConflictPanel(app);` — the conflict block renders in the
  LIVE mounted output, right below the Related-Plans panel.
- **Modify `activate(app)`**: inside the existing try (after `await prefetchRelated(app);`,
  line ~101) add `await prefetchConflicts(app);`; extend the `catch` to also reset
  `app.conflicts = []` so activation stays fail-open and never breaks the menu.
- **Do NOT change** `module.exports` shape unless the executor co-locates the helper
  bodies in pipeline.js (see the ownership note above); the render/activate wiring is
  the load-bearing change.

##### Supporting bridge helpers (canonical home `src/tabs/overview.js`, mirroring the Related pair)
- `async function prefetchConflicts(app)`:
  `projectPath = (app && app.projectPath) || process.cwd()`; `seed = app && app.selectedPlan`;
  if `seed` is not a non-empty string → `app.conflicts = []; return`. Lazy
  `const planIndex = /** @type {any} */ (require('../lib/plan-index'));`; if
  `typeof planIndex.detectConflicts !== 'function'` → `app.conflicts = []; return`.
  `const results = await planIndex.detectConflicts(seed, { projectPath });`
  `app.conflicts = Array.isArray(results) ? results.slice(0, 5) : [];`
  Whole body in try/catch → `catch { if (app) app.conflicts = []; }` (never rejects).
- `function renderConflictPanel(app)`:
  try/catch returning `''` on any error. `const conflicts = Array.isArray(app && app.conflicts) ? app.conflicts : [];`
  if `conflicts.length === 0` return `''`. Build:
  `${c.bold}Potential conflicts${c.reset}\n`, then per row (`slice(0,5)`):
  `  ${c.yellow}${row.conflictingPlan}${c.reset} ${c.dim}[${row.severity}]${c.reset}\n`
  and `    ${c.dim}files: ${(row.overlappingFiles||[]).join(', ')}${c.reset}\n`.
  After the rows, one dim note line:
  `  ${c.dim}Review before both plans enter implementation simultaneously.${c.reset}\n`.
  Trailing `\n`. Label MUST read informational ("Potential conflicts" / severity), never
  "error"/"block". Add both to `overview.js` `module.exports`.

##### Dependencies
- `src/areas/pipeline.js`: existing `const { c, line, renderFooter } = require('../lib/tui');`
  (colors), existing `require('../tabs/overview')` (extended import), existing
  `getPlanCounts`/`getAgentStatus`/etc.
- `src/tabs/overview.js` bridge helpers: existing `c.*` from `../lib/tui`; lazy
  `require('../lib/plan-index')` (already used by `prefetchRelated`) for `detectConflicts`.

##### Called By
- The menu area renderer calls `pipeline.render(app)` (mounted) each frame → renders the
  conflict panel below Related Plans.
- The menu area-activation handler calls `pipeline.activate(app)` on switch into the
  pipeline area → fires `prefetchConflicts(app)` off the render path, then re-renders.

##### Data Flow
```
area activation (switch into pipeline)
  → activate(app): seed app.selectedPlan (pickSeedPlan) → await prefetchRelated(app)
                                                        → await prefetchConflicts(app)
       prefetchConflicts: detectConflicts(app.selectedPlan,{projectPath}) → app.conflicts (≤5)
  → re-render
render(app) [mounted, sync]
  → ... renderRelatedPanel(app) → renderConflictPanel(app) [reads app.conflicts] → panel string
```

##### Error Handling
- `activate` stays wrapped in its existing try/catch; on any throw
  `app.relatedPlans = []` AND `app.conflicts = []` — activation never breaks the menu.
- `prefetchConflicts`: any throw/reject in the fetch → `app.conflicts = []` (fail-open).
- `renderConflictPanel`: any error → `''` (the dashboard renders unchanged, matching the
  `renderRelatedPanel` fail-open precedent).
- Neither ever throws into the menu loop (the load-bearing "never break the dashboard").

##### Cross-Platform Notes
- Pure string building + a lazy require; no fs/path beyond what pipeline.js/overview.js
  already use. `process.cwd()` fallback only.

### Test Plan

#### Tests: `tests/plan-index-conflict-surface.test.js`
**Action:** CREATE
**Framework:** `node:test`. Follow `tests/plan-index-search-ui.test.js` (the PI4-s4 UI
test) for the drive-the-real-render pattern, and mirror how the PI4-s4 pipeline test
drives `pipeline.render(app)` after the prefetch.

##### Test Cases — DRIVE THE REAL PIPELINE FLOW (the PI4 lesson)
1. **End-to-end LIVE flow — flag renders in `pipeline.render(app)`.** Rewire the barrel
   `require('../lib/plan-index').detectConflicts` (module-level rewire on the required
   barrel object, exactly as the PI4-s4 UI tests rewire `related`/`search`) to resolve
   `[{ conflictingPlan:'auth-rate-limiting', overlappingFiles:['src/lib/auth.js'],
   score:0.87, severity:'potential conflict or dependency' }]`. Build
   `app = { projectPath, selectedPlan:'auth-middleware-refactor' }`.
   `await pipeline.activate(app)` (or `await prefetchConflicts(app)` if activate needs a
   plans dir) so `app.conflicts` is stashed; then `const out = pipeline.render(app);`.
   Assert `out` CONTAINS `'auth-rate-limiting'`, `'src/lib/auth.js'`, and the severity/
   "Potential conflicts" label — proving the flag reaches the REAL mounted pipeline
   render, NOT the dead overview tab and NOT just a helper return value.
2. **No conflicts → panel omitted from the pipeline render.** `detectConflicts` resolves
   `[]`; after prefetch, `pipeline.render(app)` output does NOT contain "Potential conflicts".
3. **Fail-open — detectConflicts throws → pipeline render still works.** Rewire
   `detectConflicts` to reject. `await prefetchConflicts(app)` does not reject and sets
   `app.conflicts = []`; `pipeline.render(app)` returns a normal dashboard string (Pipeline
   header present, no crash, no conflict block).
4. **Fail-open — barrel export missing.** Temporarily set `planIndex.detectConflicts =
   undefined`; `prefetchConflicts` sets `app.conflicts = []`; `pipeline.render(app)` unaffected.
5. **No selected plan → no fetch, no panel.** `app.selectedPlan` undefined; `prefetchConflicts`
   sets `app.conflicts = []` WITHOUT calling the (spied) `detectConflicts`; `pipeline.render`
   omits the block.
6. **Severity label passthrough.** A row with `severity:'broad overlap'` renders the
   `[broad overlap]` label in the pipeline output (never "error"/"block").
7. **Display cap.** `detectConflicts` resolves 8 rows; `app.conflicts.length <= 5` and the
   rendered pipeline block shows at most 5.
8. **Activation is fail-open (menu never breaks).** Rewire `detectConflicts` to throw and
   point `app.projectPath` at a temp dir with no plans; `await pipeline.activate(app)` does
   NOT reject, and `app.conflicts === []` (and `app.relatedPlans === []`), proving the
   conflict prefetch is inside the same fail-open activation guard.

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80% on the added functions (both fail-open branches, the empty
  branch, the render-with-rows branch, the activate wiring).
- The primary test (case 1) asserts against `pipeline.render(app)` output — the REAL
  mounted surface (not `overview.render`, which is the dead tab).

### Security Review
- [x] **Path traversal** — none; string rendering + lazy require only. `projectPath`
  falls back to `process.cwd()`; no path derived from untrusted input.
- [x] **Input validation** — `app`/`selectedPlan` shape-checked before use; array guards
  on `app.conflicts`; `overlappingFiles` guarded with `|| []` before `.join`.
- [x] **No secrets** — none.
- [x] **Safe file operations** — no writes.
- [x] **Error messages** — no error strings surfaced; fail-open returns `''`/`[]`.
- [x] **Prototype pollution** — reads array rows by index/field; no untrusted-key assignment.
- [x] **Output safety** — conflicting-plan slug + file globs rendered as TUI text via the
  existing `c.*` color helpers; no eval, no HTML sink.
- [x] **Command injection** — none.

### Architecture Validation
- [x] **Dependency direction** — an `areas/` mount depending on `tabs/overview` (shared
  bridge) and `lib/plan-index` (barrel); neither imports back into `areas/pipeline.js`.
- [x] **No framework coupling** — pure string render + lazy barrel require; `detectConflicts`
  resolved through the fail-open barrel getter.
- [x] **Interface segregation** — the render half takes only `app.conflicts`; the fetch
  half takes only `app.selectedPlan` + `projectPath`.
- [x] **Open/closed** — the Related-Plans wiring is extended-around (conflict panel added
  after it), not modified; `activate` extended within its existing guard.
- [x] **Test independence** — each case rewires its own `detectConflicts` and builds its own
  `app`; no shared mutable state; no ordering dependency.
- [x] **Cross-platform** — string building + lazy require; `process.cwd()` fallback.

## Execution Plan

### Step 8: TEST
Write `tests/plan-index-conflict-surface.test.js` (8 cases), RED first. Case 1 MUST assert
against `pipeline.render(app)` output after the conflict prefetch — driving the REAL
mounted pipeline flow, per the PI4 lesson. Rewire the barrel `detectConflicts` the way the
PI4-s4 UI tests rewire `related`/`search`.

### Step 9: PREPARE
Re-read `src/areas/pipeline.js` for the exact insertion points: the
`require('../tabs/overview')` import (~22), the `out += renderRelatedPanel(app);` line in
`render` (~70), and the `await prefetchRelated(app);` line + `catch` in `activate` (~101).
Re-read `src/tabs/overview.js` for the `prefetchRelated`/`renderRelatedPanel` pair to
mirror and its `module.exports`. Confirm PI6-s1's `detectConflicts` is exported on the
barrel (`require('../lib/plan-index').detectConflicts` — depends_on gate).

### Step 10: IMPLEMENT
Add `prefetchConflicts` + `renderConflictPanel` to the canonical bridge home
(`src/tabs/overview.js`), mirroring the Related pair; extend `overview.js` `module.exports`.
In `src/areas/pipeline.js`: extend the import, add `out += renderConflictPanel(app);` after
the Related panel in `render`, add `await prefetchConflicts(app);` in `activate` and reset
`app.conflicts = []` in its catch. No stubs; document any ambiguity in
`## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
Verify the wiring is in the LIVE `pipeline.js` `render`/`activate` path (NOT the dead
`overview.js` render path); fail-open posture matches `renderRelatedPanel`/`prefetchRelated`;
no new require cycle; exports complete.

### Step 12: OPTIMIZE
Confirm the async fetch runs off-render (no `await` inside `render`); the sync render reads
a cached `app.conflicts` array only; display capped at 5; `detectConflicts` awaited once per
activation.

### Step 13: SECURE
Run the Security Review checklist; confirm `render`/`prefetchConflicts`/`activate` never
throw into the menu loop.

### Step 14: VERIFY
`node --test tests/plan-index-conflict-surface.test.js` → 0 fail, 0 skipped. Full suite
`node --test tests/*.test.js` → `# fail 0` (existing pipeline + overview + PI4-s4 tests still
green). Coverage ≥ 80% on the added functions.

### Step 15: DOCUMENT
JSDoc on `prefetchConflicts` and `renderConflictPanel` mirroring the `prefetchRelated` /
`renderRelatedPanel` docblocks (async-fetch/sync-render bridge, fail-open contract). One-line
comment at the pipeline `render`/`activate` insertion points mirroring the PI4-s4 kickback
comments.

### Step 16: FINAL-REVIEW
Confirm the parent acceptance criterion "view plan A → flag naming plan B + overlapping
files, labeled 'potential conflict or dependency'" is proven by case 1 driving the REAL
`pipeline.render`. Confirm the block is informational, not "error"/"block", and that the
LEGACY `src/tabs/overview.js` render path is NOT the surface (the dead-tab bug is fixed).

## Decisions Taken Under Ambiguity

- **Target is `src/areas/pipeline.js` (LIVE mount), NOT `src/tabs/overview.js` (dead tab).**
  The prior s2 targeted `overview.js`, which PI4 proved is unmounted and dead to the human —
  PI4-s4 was itself a kickback that moved the Related-Plans panel from `overview.js` into
  `pipeline.js`. Rendering conflicts in `overview.js` would repeat that exact mistake, so
  this slice retargets to the LIVE pipeline area. The old `pi6-s2-overview-conflict-surface.md`
  is deleted.
- **Bridge helpers live in the canonical `src/tabs/overview.js` home, consumed by the
  pipeline mount.** pipeline.js already imports `renderRelatedPanel`/`prefetchRelated` from
  `../tabs/overview` and its own comment mandates keeping ONE implementation to avoid drift.
  The conflict pair `renderConflictPanel`/`prefetchConflicts` follows the SAME pattern:
  defined in overview.js (the bridge home), imported and mounted by pipeline.js. This slice's
  declared `files:` is `src/areas/pipeline.js` because that is the LIVE surface whose render
  MUST show the panel; the overview.js helper additions are the minimal shared support for
  that wiring (equivalent to how PI4-s4's helpers live in overview.js). An acceptable
  executor equivalent is to co-locate the helper bodies inside `pipeline.js` to keep all
  edits within this slice's `files:` — the load-bearing requirement is only that the panel
  renders in the LIVE `pipeline.render(app)` and the fetch fires from `pipeline.activate(app)`.
- **Seed plan = `app.selectedPlan` from `pickSeedPlan`.** The conflict prefetch reuses the
  SAME seed the Related-Plans prefetch uses (first in-progress → first todo → first
  implementation draft, chosen by pipeline.js's existing `pickSeedPlan`). The pipeline area
  has no explicit per-plan cursor yet, so this mirrors the established PI4-s4 seeding rather
  than inventing a new selection mechanism.
- **Display cap = 5 rows.** A conflict panel names a handful of nearest conflicting plans,
  not an unbounded list. `app.conflicts` is sliced to 5 in the fetch and the render also caps
  at 5, matching the Related-Plans panel's bounded display.
- **Fail-open end to end.** `prefetchConflicts` → `[]` on any error; `renderConflictPanel` →
  `''` on any error; `activate` resets `app.conflicts = []` in its existing catch. A
  semantic-index fault can NEVER break the mounted dashboard — the load-bearing invariant
  pipeline.js already enforces for Related Plans.

### Executor decisions (Steps 8–16, 2026-07-08)

- **Helper bodies co-located IN `src/areas/pipeline.js`, NOT `src/tabs/overview.js`.**
  The plan's prose offered both placements (see the "NOTE ON FILE OWNERSHIP" and the
  bridge-home decision), explicitly recording the co-located-in-pipeline.js variant as an
  acceptable equivalent that keeps all edits within this slice's declared `files:`. The
  executor took that variant on directive: `renderConflictPanel` + `prefetchConflicts` are
  defined directly in `pipeline.js`, so the LIVE wiring carries ZERO dependency on the dead
  `overview.js` render path (which PI4 proved is unmounted). `src/tabs/overview.js` was NOT
  touched (confirmed: empty git diff). This keeps the slice within its declared `files:`
  (`src/areas/pipeline.js` + its test) and eliminates any coupling to the dead tab.
- **Test drives the REAL mounted render (PI4 "measure is the human" lesson).** Case 1
  drives `pipeline.prefetchConflicts(app)` then `pipeline.render(app)` and asserts the
  rendered dashboard STRING contains the conflicting plan (`auth-rate-limiting`), the
  overlapping file (`src/lib/auth.js`), and the severity label — proving the flag reaches
  the surface a human actually sees, not a helper return in isolation. Case 9 drives the
  real `pipeline.activate(app)` to prove the conflict prefetch sits inside the same
  fail-open activation guard as Related Plans (menu never breaks).
- **No CHANGELOG entry.** This is an internal pre-release vector-chain slice; version bump
  and changelog are handled at release, not per-slice. No stub, no TODO written.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (`tests/plan-index-conflict-surface.test.js`, 10 cases)
- [x] Test error conditions (throw / undefined export / no-seed / poison / activation fail-open)
- [x] Run tests - expect RED (failing) — RED: 10 tests, 1 pass, 9 fail

### Step 9: PREPARE
- [x] Install dependencies if needed (none)
- [x] Check prerequisites (PI6-s1 `detectConflicts` confirmed on barrel via lazy getter)
- [x] Verify dev environment ready (re-read pipeline.js insertion points + PI4-s4 bridge)
- [x] Create directories/config if needed (none)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (helpers IN pipeline.js, not overview.js)
- [x] Add error handling (fail-open: render→'', prefetch→[], activate resets app.conflicts)
- [x] Wire up integration points (render() + activate() + module.exports)

### Step 11: REVIEW
- [x] Self-review all new code (wiring is in LIVE pipeline.js render/activate; not overview)
- [x] Verify integration points work together (E2E test drives real render after prefetch)
- [x] Check error handling completeness (all three fail-open branches proven)

### Step 12: OPTIMIZE
- [x] Remove redundant operations (async fetch off render path; sync render reads cached array)
- [x] Optimize critical paths (detectConflicts awaited once per activation; display capped at 5)
- [x] Simplify complex code (mirrors the Related-Plans pair exactly)

### Step 13: SECURE
- [x] Validate inputs (no path traversal; projectPath falls back to process.cwd())
- [x] Sanitize outputs (array guards; overlappingFiles `|| []` before join; TUI text only)
- [x] No secrets in code
- [x] Safe file operations (no writes)

### Step 14: VERIFY
- [x] Run lint + type check (eslint exit 0; tsc baseline-neutral 89→89)
- [x] Run ALL tests (TDD Green) — new suite 10/10; full suite 3140 pass, 0 fail
- [x] Check coverage >= 80% (added helpers fully exercised; file line 82.67%)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation (JSDoc + insertion-point comments in pipeline.js)
- [x] Add JSDoc comments to new functions (prefetchConflicts + renderConflictPanel)
- [x] Update CHANGELOG if needed (n/a — pre-release slice)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed (panel-appears + fail-open proven against real render)
- [x] Ready for human review
