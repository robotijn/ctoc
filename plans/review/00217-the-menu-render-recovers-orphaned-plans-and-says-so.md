---
approved_by: human
approved_at: 2026-07-23T17:28:47.522Z
gate_crossed: implementation → todo
title: "The menu render recovers orphaned plans and says so — the recovery projection reaches the screen the human opens"
type: implementation
parent_plan: none
depends_on: 00216-an-orphaned-in-progress-plan-is-recovered-to-todo-when-its-builder-is-gone
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/menu-screens.js"
  - "tests/plan-recovery-wiring.test.js"
---

# The menu render recovers orphaned plans and says so

## Why this slice exists

Slice 00216 ships `recoverOrphanedPlans(root, opts)` in `src/lib/plan-recovery.js` —
a module whose only caller is its own test. A module is done when a human can REACH it,
not when its test passes (a test is a caller). This slice makes it reachable from the
live entry point the human actually opens: the menu dashboard render. Without this, the
V4 scenario is unchanged — 5 orphaned plans still read as "being built" — because
nothing calls the recovery.

## The call site, read on disk

`src/lib/menu-screens.js:440` `buildDashboardTable(projectPath, opts)` is the dashboard
render. It already runs the TASK reconciler on every open, at `:512-523`:

```js
try {
  const { report } = taskReconcile.reconcileState(root, { liveAgentIds: opts.liveAgentIds });
  reconcileReport = report || null;
  orphanedCount = (report && Array.isArray(report.orphaned)) ? report.orphaned.length : 0;
} catch (err) {
  reconcileThrew = (err && err.message) ? String(err.message) : String(err);
}
```

The catch is deliberately NOT empty (`:516-523`) — a reconcile failure must not brick the
dashboard AND must not be invisible; the reason is kept and rendered by
`renderReconcileHealth` (`:262`, called at `:536`). The task orphan count is surfaced at
`:540-542`, and the reconcile pass's wedge reports at `:548` via `renderWedgeReports`
(`:345`).

**Recovery belongs immediately after `reconcileState` and before the render tail.** The
reconciler must run first: it is what writes the `orphanReason` markers recovery reads.
Recovery then projects those markers onto the plan files, and its `recovered`/`surfaced`
counts render alongside the existing reconcile-health and wedge lines.

## The change

### File: `src/lib/menu-screens.js`
**Action:** MODIFY — `buildDashboardTable`, plus a small render helper

1. **Call recovery after the `reconcileState` try/catch (after `:523`)**, in its OWN
   try/catch that keeps the failure reason (mirroring the reconcile pattern — fail-open
   but NOT silent):
   ```js
   let recoveryReport = null;
   let recoveryThrew = null;
   try {
     recoveryReport = planRecovery.recoverOrphanedPlans(root, { liveAgentIds: opts.liveAgentIds });
   } catch (err) {
     recoveryThrew = (err && err.message) ? String(err.message) : String(err);
   }
   ```
   (`recoverOrphanedPlans` never throws by contract, so `recoveryThrew` is a
   belt-and-suspenders guard; it is rendered if ever set. `liveAgentIds` is passed for
   forward-compatibility even though 00216 reads the persisted verdict, not the live
   list — an extra opt is ignored, and it keeps the two calls symmetric.)
2. **Require the module** at the top of the file alongside the existing `taskReconcile`
   require: `const planRecovery = require('./plan-recovery');`.
3. **Render helper `renderRecoveryReport(report, threw)`** — returns `''` when there is
   nothing to say (no recovered, no surfaced, no throw), so a project with no orphaned
   plans renders BYTE-IDENTICALLY to today. Otherwise:
   - recovered > 0 ⇒ `  ⚠ ${n} plan${s} recovered — its builder is no longer running; re-queued to todo\n`
   - surfaced > 0 ⇒ `  ⚠ ${m} plan${s} orphaned on staleness alone — the builder may still be running; not yet recovered\n`
   - threw ⇒ `  ⛔ plan recovery could not run: ${threw}\n` (honest, matches the
     reconcile-health line style)
4. **Emit it in the TASKS section**, directly after the `renderWedgeReports` line
   (`:548`), so the recovery lines sit with the other reconcile-pass findings:
   `out += renderRecoveryReport(recoveryReport, recoveryThrew);`

Byte-identical-for-clean-projects is a hard requirement: the existing dashboard has many
substring/count regression tests. `renderRecoveryReport` returning `''` on the empty
case is what protects them.

### File: `tests/plan-recovery-wiring.test.js`
**Action:** CREATE — `node:test`. Drive `buildDashboardTable` end to end against a real
temp project (mirror the fixture in `tests/w10-live-agent-reconcile.test.js` and
`tests/dashboard-wedge-reports.test.js`). Test the human's behavior: open the dashboard,
the plan moves and the screen says so.

| # | Case | Assertion |
|---|---|---|
| 1 | in-progress plan whose implement task is orphaned `'presumed-dead'`, not review-ready | after `buildDashboardTable`: output contains the `recovered … re-queued to todo` line AND the plan file is physically in `plans/todo/`, gone from `in-progress/` |
| 2 | in-progress plan, implement task orphaned `'staleness'` | output contains the `orphaned on staleness alone … not yet recovered` surface line AND the plan STAYS in `in-progress/` |
| 3 | clean project, no orphaned tasks | output contains NEITHER recovery line — assert the exact absence (byte-identical-for-clean guard) |
| 4 | recovery-eligible plan present | the output STILL renders the rest of the dashboard (version, inbox) — recovery is additive, not replacing |
| 5 | plan-recovery module stubbed to throw (inject via a spy require, or a monkeypatched export in the test) | dashboard still renders AND shows the `plan recovery could not run` line — fail-open, not silent, not bricked |

Cases 1 and 3 are load-bearing: 1 is the whole point (the human opens the menu and the
phantom "being built" plan is actually recovered), 3 guarantees no regression to the
clean dashboard.

---

### Wiring — the live call sites

| change | live call site | root it becomes reachable from |
|---|---|---|
| `recoverOrphanedPlans` call | `menu-screens.buildDashboardTable:~523` | `/ctoc:menu` dashboard render (`route` → `dashboardPipeline`/`buildDashboardTable`) |
| `renderRecoveryReport` | emitted in `buildDashboardTable`'s TASKS section `:~548` | same |

`buildDashboardTable` is on the live menu path today (it is what the dashboard prints on
every open). This slice puts recovery on that path; nothing here is reachable only from a
test. This is the "wired is done" completion of 00216.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
Write `tests/plan-recovery-wiring.test.js` FIRST and run only it. Cases 1, 2, 5 must be
RED (the call site does not exist yet; case 3's absence assertion may be trivially green
before wiring — note that and rely on cases 1/2 for the red). Record case 1's red
verbatim: a plan left in `in-progress` after the dashboard render is the phantom the
mechanism removes.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
Read from disk: `src/lib/menu-screens.js:440-548` (the `buildDashboardTable` render tail,
the `reconcileState` try/catch, `renderReconcileHealth`, the orphan line,
`renderWedgeReports`) and the top-of-file require block (to place the `plan-recovery`
require next to `taskReconcile`); `src/lib/plan-recovery.js` (00216's export shape —
`{ recovered, surfaced, skipped }` — CODE WINS if it differs). Read the existing dashboard
tests that set up in-progress plans with tasks (`tests/w10-live-agent-reconcile.test.js`,
`tests/dashboard-wedge-reports.test.js`, `tests/menu-screens.test.js`) and CHECK whether
any of them stages a presumed-dead orphaned implement task in `in-progress` — because the
new side effect (moving that plan to `todo`) could change their expected output. Any that
does is reconciled at Step 14, not silently.

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
- `src/lib/menu-screens.js` — the `plan-recovery` require, the recovery call after
  `reconcileState`, `renderRecoveryReport`, and its emission after `renderWedgeReports`.
- `tests/plan-recovery-wiring.test.js` — the five cases.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
Confirm: `renderRecoveryReport` returns `''` for the empty case (no dashboard
regression); the recovery call is fail-open with the reason kept (not an empty catch);
recovery runs AFTER `reconcileState` (order is load-bearing — the markers must exist);
the recovery lines read honestly (surfaced ≠ recovered wording). Confirm no existing
dashboard substring assertion regressed.

### Step 12: OPTIMIZE
One recovery call per render, sharing the `root` already resolved for `reconcileState`.
No extra registry load beyond the one `recoverOrphanedPlans` does internally.

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
`renderRecoveryReport` emits counts and fixed wording plus, on the error line, the
recovery error message — confirm that message is a control-flow string (recovery's own
reasons), never file contents or an absolute path leaked to the screen. No user input
reaches the render.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
`node --test tests/plan-recovery-wiring.test.js`, then the FULL existing menu/dashboard
suite (`menu-screens*.test.js`, `dashboard-*.test.js`, `w10-live-agent-reconcile.test.js`,
`menu-coverage.test.js`), then the full gated `npm test`. Lint `--max-warnings 0`.
Coverage on the new/edited lines at or above the 99 floor, 0 skipped. No git operations.
If any pre-existing dashboard test broke because a staged orphan now moves, fix the CODE
or the TEST per lesson 14 (the code is right — a phantom in-progress plan SHOULD move; a
test that asserted the phantom stays is asserting the bug), and record which and why.

### Step 15: DOCUMENT
JSDoc on `renderRecoveryReport` and a one-line comment at the call site naming why
recovery runs after `reconcileState` (the markers). Do NOT edit `CLAUDE.md` — not in
this slice's `files:`; the doc-count is generated by `release.js` (v6.13.13).

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
Report every Step 8 red verbatim, the Step 14 full-suite result and coverage number, any
pre-existing dashboard test that had to be reconciled (with the reason), and confirm the
end-to-end behavior: opening the dashboard on a project with a dead-builder orphan
re-queues the plan to `todo` and the screen says so.

## What this plan does NOT do

- It does **not** change `recoverOrphanedPlans`'s logic (00216 owns it) — it only calls
  it and renders the result.
- It does **not** wire recovery into `startAgent` — the menu render is the trigger the
  V4 scenario needs; a second wiring point is the human's to schedule.
- It does **not** add a new dashboard SCREEN — the recovery lines join the existing TASKS
  section, matching how the orphan and wedge lines are already surfaced (no new
  navigation, mirroring the reconcile pass's own render).

## Decisions Taken Under Ambiguity

1. **Recovery runs on the menu hot path, after `reconcileState`** — that ordering is
   required (the reconciler writes the `orphanReason` markers recovery reads) and the
   menu open is exactly when the human sees the phantom plans.
2. **The recovery call is fail-open with the reason kept**, mirroring the adjacent
   `reconcileState` catch — a recovery failure must not brick the dashboard and must not
   be invisible.
3. **`renderRecoveryReport` returns `''` for the empty case** — the byte-identical-for-clean
   contract that protects every existing dashboard regression test.
4. **The recovery lines join the existing TASKS section** rather than a new screen —
   consistent with the orphan and wedge lines already rendered there.

## Decisions Taken During Execution

### `liveAgentIds` is NOT passed to `recoverOrphanedPlans` — the plan's pseudocode was corrected against the real type contract
The plan step 1 passed `{ liveAgentIds: opts.liveAgentIds }` "for forward-compatibility".
The shipped `recoverOrphanedPlans` (00216) types its opts as `{ now?: number }` ONLY and
reads the reconciler's PERSISTED verdict, not the live list — so the extra property is
both ignored at runtime and rejected by `tsc --checkJs` (`error TS2353: 'liveAgentIds'
does not exist in type '{ now?: number }'`), which regressed the typecheck baseline from
0 to 1. Widening `plan-recovery.js`'s JSDoc is out of this slice's declared `files:`.
Resolution: call `planRecovery.recoverOrphanedPlans(root)` with no opts. The fail-open
try/catch and the belt-and-suspenders throw guard are unchanged; only the ignored,
type-invalid argument is dropped. Code wins over the plan's pseudocode.

### The render helper counts array LENGTHS, and `skipped` is not surfaced
`recoverOrphanedPlans` returns `{ recovered, surfaced, skipped }` where each is an ARRAY
(the plan pseudocode wrote `recovered > 0`, treating them as numbers). `renderRecoveryReport`
uses `.length`. `skipped` (a live re-claim or a move collision) is deliberately NOT
rendered: from the human's seat nothing happened to the plan, and the collision path already
records its own cleanup-log entry — surfacing it would be noise, not a finding.

### The lines name the ACTION in plain words, never a stage name
The plan's example wording "re-queued to todo" names the raw stage `todo`, which is internal
vocabulary a person cannot decode (the same class the gate-words fence forbids). The rendered
lines say "re-queued for a clean rebuild and re-verification" (recovered) and "the builder may
still be running; not yet recovered" (surfaced) — echoing 00216's own `RECOVER_REASON`
constant, with no stage name, gate number, or plan slug.
