---
iron_loop: true
approved_by: human
approved_at: 2026-07-15T00:00:00.000Z
gate_crossed: implementation → todo
approval_note: "Standing 2026-07-14 orders. ui.js#doctor is a dead export in the 104 baseline (R4-C surfaced it — R4-B had falsely credited it via unrelated 'clinic doctor'/'mix doctor' prose tokens). The live doctor screen is tools.js#renderDoctor (wired via menu.js). Resolve: wire or delete, no third state."
---

---
title: "R6-C — Resolve the dead ui.js#doctor export: wire it or delete it"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: MEDIUM
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/ui.js"
  - "src/tabs/tools.js"
  - "tests/ui*.test.js"
  - "tests/tab-modules.test.js"
  - ".ctoc/export-reachability-baseline.json"
  - "tests/export-reachability.test.js"
---

# R6-C — ui.js#doctor: rewire or delete, no third state

`src/lib/ui.js` exports `doctor(checks, version)` — a formatter with ZERO live
callers (it is in the export-fence baseline). The live doctor screen is
`src/tabs/tools.js#renderDoctor` (wired via `menu.js:343`).

## Implementation Details
Read BOTH `ui.js#doctor` and `tools.js#renderDoctor` in full first, then choose
the honest resolution and DO it (document which and why):
- **If `renderDoctor` reimplements what `doctor()` already formats** (duplication),
  make `renderDoctor` DELEGATE to `ui.js#doctor` (DRY — wiring the export to a live
  call site), OR delete `ui.js#doctor` if `renderDoctor` is the better/only needed
  formatter. Prefer deletion unless `doctor()` carries logic `renderDoctor` lacks.
- **If `doctor()` is simply obsolete**, delete it and its export.
Whichever you pick: after the change, `ui.js#doctor` is either LIVE (a real caller)
or GONE — never a baselined dead export. REMOVE its entry from
`.ctoc/export-reachability-baseline.json` and LOWER `maxDead` accordingly (the
export fence only tightens). Do not disturb other baseline entries.

### Wiring — the live call sites (MANDATORY)
| resolution | live call site | root |
|---|---|---|
| wire | tools.js renderDoctor → ui.doctor | /ctoc:menu |
| delete | n/a (export removed; baseline count drops) | n/a |

### Test Plan (TDD-Red first)
If WIRED: a test drives `renderDoctor` and asserts it produces the `doctor()`
formatting (behavior preserved). If DELETED: require-time assertion `ui.doctor`
is undefined; whatever tested `doctor()` directly is removed or retargeted. Either
way: `analyzeExports().dead` no longer contains `src/lib/ui.js#doctor`, and the
baseline maxDead dropped by exactly 1; export-reachability.test.js green.

## Execution Plan (Steps 8-16)
Step 8 TEST red · Step 9 PREPARE (read ui.js#doctor + tools.js#renderDoctor) ·
Step 10 IMPLEMENT (wire or delete) · Step 11 REVIEW · Step 14 VERIFY (named tests
+ eslint + export fence; no git) · Step 16 REPORT (which resolution + why).

## Execution Log (R6-C)
- Step 8 TEST (Red): rewrote `tests/ui.test.js` doctor block into a removal guard
  (`ui.doctor === undefined`), stripped `doctor` from both export-list assertions,
  removed orphaned `healthyChecks`/`mixedChecks` fixtures; lowered baseline to 103
  and removed the `ui.js#doctor` entry. Ran → RED as designed: ui.test.js failed
  (`ui.doctor` still `[Function: doctor]`); export-reachability failed
  (`dead.length 104 !== 103`, ui.js#doctor dead-but-unbaselined).
- Step 9 PREPARE: both call sites read in full; no dependencies, no environment
  change needed for a deletion.
- Step 10 IMPLEMENT: DELETED `doctor(checks, version)` from `src/lib/ui.js`
  (lines 154–176) and removed it from the module.exports. `src/tabs/tools.js`
  intentionally untouched — `renderDoctor` is the live screen and is kept.
- Step 11/12/13 REVIEW/OPTIMIZE/SECURE: pure deletion of a dead formatter — no new
  surface, nothing to optimize, no input/security path introduced.
- Step 14 VERIFY (Green):
  - `tests/ui.test.js` — tests 69, pass 69, fail 0, skipped 0.
  - `tests/tab-modules.test.js` — tests 54, pass 54, fail 0, skipped 0.
  - `tests/export-reachability.test.js` — tests 16, pass 16, fail 0, skipped 0.
  - export fence: `analyzeExports().dead.length = 103`, `maxDead = 103`,
    `ui.js#doctor in dead? false`, `in baseline? false`.
  - `eslint src/lib/ui.js src/tabs/tools.js tests/ui.test.js
    tests/tab-modules.test.js tests/export-reachability.test.js` — exit 0, no output.
- Constraints honored: only ui.js, tools.js (untouched), the named ui/tab test
  files, and the baseline were edited. No git, no staging, no full-suite run.

## Decisions Taken Under Ambiguity

### Resolution: DELETE `ui.js#doctor` (not wire)

Read both sites in full before deciding.

- `src/lib/ui.js#doctor(checks, version)` is a pure string formatter over a
  section-shaped data model: `checks = [{ name, items: [{ ok, warn, label }] }]`.
  Its `version` parameter is accepted but NEVER used. It renders a self-contained
  screen headed `CTOC Doctor - Health Check` with three-state icons
  (green ✓ / yellow ⚠ / red ✗) grouped by section, ending `Doctor check complete`.
  It has ZERO live callers (confirmed: only `tests/ui.test.js` and the export
  baseline reference it).
- `src/tabs/tools.js#renderDoctor(app)` is the LIVE screen (wired via
  `menu.js:343`). It calls `runHealthChecks(app.projectPath)`, which returns a
  FLAT two-state array `[{ label, pass }]` — no sections, no warn state, no
  version. It renders a different screen (`Tools › Doctor`) and carries strictly
  MORE than `doctor()`: an all-pass summary, last-sync info (`getLastSync`), an
  interactive action menu (run again / repair / sync / logs), a live input prompt
  (`app.doctorInput`), and the `tui` footer.

`doctor()` carries NO logic `renderDoctor` lacks. Wiring `renderDoctor` to
delegate to `ui.doctor` would DEGRADE the live screen: `runHealthChecks` produces
the flat `{label,pass}` model, so `ui.doctor`'s section/warn/version model is
inapplicable, and `ui.doctor` emits its own full-screen string that would
displace the sync info, action menu, input prompt, and footer. The plan directs
"prefer deletion unless `doctor()` carries logic `renderDoctor` lacks" — it does
not. Therefore: DELETE `doctor()` and its export; it is an obsolete formatter
nothing renders.

### Baseline
`.ctoc/export-reachability-baseline.json`: remove `"src/lib/ui.js#doctor"`,
lower `maxDead` 104 → 103 (fence only tightens). No other entry disturbed.

### Test retargeting
`tests/ui.test.js`: the `describe('doctor')` block tested the deleted function
directly (a test is never a caller) — removed, along with its now-orphaned
`fixtures.healthyChecks` / `fixtures.mixedChecks` (used only there). Added a
require-time guard: `ui.doctor` is `undefined`. Removed `'doctor'` from the two
module-export list assertions. No behavior lost: the live doctor screen is
covered by `tests/tab-modules.test.js` (renderDoctor + doctor-mode key dispatch).
