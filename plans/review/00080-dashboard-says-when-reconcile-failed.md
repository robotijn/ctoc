---
approved_by: human
approved_at: 2026-07-19T07:40:42.747Z
gate_crossed: implementation → todo
title: "The dashboard says so when the reconcile pass failed — stale state is never presented as live"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00075-wedge-reports-get-a-reader, 00077-quarantine-on-every-promote-path
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/menu-screens.js"
  - "src/commands/start.md"
  - "tests/dashboard-reconcile-failure.test.js"
  - "CLAUDE.md"
  - ".ctoc/false-green-baseline.json"
---

# The dashboard says so when the reconcile pass failed

`src/lib/menu-screens.js:230-234`:

```js
try {
  const { report } = taskReconcile.reconcileState(root, { liveAgentIds: opts.liveAgentIds });
  orphanedCount = (report && Array.isArray(report.orphaned)) ? report.orphaned.length : 0;
} catch { /* reconcile is best-effort; a failure must never brick the dashboard */ }
```

The comment is half right and the code acts on the wrong half. A reconcile failure
must indeed not brick the dashboard — but "do not brick" and "say nothing" are
different instructions, and only one of them is implemented. When
`reconcileState` throws, the dashboard renders the task registry **exactly as it
would if the pass had succeeded**: the same TASKS block, the same counts, no
orphan line, nothing amiss. The human reads a screen that says the background
plane is in a known state, when in fact nothing checked it.

That is presenting **stale state as live**, and it is worse than a blank section.
A blank section prompts a question. A confident, wrong section does not.

## Three ways the pass fails, none of them on screen

The swallowed throw is one of three. The reconcile pass records the other two on
its own report and nothing reads either:

| Signal | Meaning | Written at | Read at |
|---|---|---|---|
| the thrown error (caught here) | the pass did not run at all | `menu-screens.js:234` | nowhere |
| `report.corrupt` | the registry could not be parsed; the pass ran against an EMPTY view | `task-reconcile.js:280`, `:437`, `:593` | nowhere |
| `report.saveFailed` | the pass ran and decided, but could NOT persist — what you see is not what is stored | `task-reconcile.js:599` | nowhere |

All three mean the same thing to a human: **the task state on this screen is not
trustworthy right now.** They differ in *why*, and the difference changes what the
human should do, so each renders its own line.

This is deliberately a separate slice from the wedge-reports plan. That one shows
**more of what the pass found** — its results. This one is about **refusing to
present a result at all when the pass did not produce one**. Different behaviour,
different failure mode, different test surface: the wedge tests seed registries and
assert richer output; this slice's tests force the machinery to fail and assert
that the screen admits it.

## Ordering

It touches `src/lib/menu-screens.js`, the same file as two slices ahead of it —
the wedge-reports slice edits `buildDashboardTable` (the same function this slice
edits) and the promote-parity slice edits `computePromote` in the same file. Both
are declared as dependencies so the three land in a defined order rather than
colliding. The content dependency on the wedge-reports slice is real and not merely
file-level: this slice renders **above** the wedge block, and its case 7 asserts
the two coexist in the right order.

## Implementation Details

### File: `src/lib/menu-screens.js`
**Action:** MODIFY
**Purpose:** Make a failed or unpersisted reconcile pass visible instead of invisible.
**Change type:** modify-existing — the `reconcileState` call site in `buildDashboardTable`, plus one module-private renderer

#### Change 1 — capture the failure instead of discarding it

Building on the wedge slice's Change 1 (which already retains `reconcileReport`):

```js
let orphanedCount = 0;
/** @type {object|null} */
let reconcileReport = null;
/** @type {string|null} */
let reconcileThrew = null;
try {
  const { report } = taskReconcile.reconcileState(root, { liveAgentIds: opts.liveAgentIds });
  reconcileReport = report || null;
  orphanedCount = (report && Array.isArray(report.orphaned)) ? report.orphaned.length : 0;
} catch (err) {
  // NOT swallowed. A reconcile failure must not BRICK the dashboard — it must also
  // not be INVISIBLE. Rendering the registry as though the pass succeeded presents
  // stale state as live, which is the more dangerous of the two failures: a blank
  // section prompts a question, a confident wrong section does not.
  reconcileThrew = (err && err.message) ? String(err.message) : String(err);
}
```

The dashboard still renders — the throw is still caught, `reconcileReport` is
still `null`, and every line below is unaffected. The only change is that the
reason is kept.

#### Change 2 — a module-private renderer for the three untrustworthy states

Add beside `renderWedgeReports`:

```js
/** Max characters of a captured failure message rendered on one dashboard line. */
const FAILURE_MESSAGE_CAP = 120;

/**
 * Render the reconcile pass's TRUSTWORTHINESS, not its findings.
 *
 * Three distinct states mean "the task state below is not reliable right now", and
 * none of them had a reader: the pass THREW (it never ran), the registry was
 * CORRUPT (it ran against an empty view), or the save FAILED (it ran and decided,
 * but the decisions are not on disk). Each renders one line naming what to do.
 *
 * Returns '' when the pass ran, parsed and persisted — so a healthy project's
 * dashboard is byte-identical.
 *
 * @param {string|null} threw  the caught reconcile error message, or null.
 * @param {object|null} report  the reconcile report, or null when it threw.
 * @returns {string}
 */
function renderReconcileHealth(threw, report) { /* … */ }
```

Behaviour, exactly:

1. **Threw** — when `threw` is a non-empty string:
   ```
     ⛔ the background task check DID NOT RUN — the task counts below are unchecked and may be stale: ${msg} · view: tasks
   ```
   where `msg = stripCtl(String(threw))` truncated to `FAILURE_MESSAGE_CAP` with a
   trailing `…`. When this line renders, no other line from this function does —
   there is no report to inspect.
2. **Corrupt** — when `report && report.corrupt`:
   ```
     ⛔ the task registry could not be read (${reason}) — the check ran against an EMPTY view, so anything below is a floor, not the truth · view: tasks
   ```
   where `reason = stripCtl(String(report.corrupt.reason ?? 'unknown'))`, and when
   `report.corrupt.skipped` is a finite number greater than zero, append
   ` · ${n} malformed entr${n === 1 ? 'y' : 'ies'} skipped`.
   The wording distinguishes the two shapes reconcile actually writes: a
   whole-registry failure (`not-a-registry-value`, `load-failed`) versus per-entry
   damage (`malformed-entries-skipped`).
3. **Save failed** — when `report && report.saveFailed`:
   ```
     ⛔ the task check ran but could NOT be saved — what you see is not what is stored, and the same work will be re-decided next open: ${msg} · view: tasks
   ```
   with the same stripping and truncation.
   Corrupt and save-failed can both hold; both render, corrupt first (a bad read
   explains a bad write, not the reverse).
4. Otherwise return `''`.

#### Change 3 — render it FIRST

In `buildDashboardTable`, immediately **before** the orphan-count line and the
wedge block:

```js
// Trustworthiness before findings: a human who reads the counts without knowing the
// check never ran has been actively misled, not merely under-informed.
out += renderReconcileHealth(reconcileThrew, reconcileReport);
```

Ordering is load-bearing and is asserted by the tests: every line this function
emits appears **above** the orphan line and above the wedge block.

`renderReconcileHealth` is not exported, for the reason recorded at
`menu-screens.js:2216-2219`; the tests drive `buildDashboardTable`.

---

### File: `src/commands/start.md`

> Record reconciliation (review): this plan was authored against `src/commands/menu.md`.
> After Gate 2 approval, that file was renamed `src/commands/menu.md` → `src/commands/start.md`
> (the command is `/ctoc:start`, not `/ctoc:menu`). The one-line promote-contract correction
> below landed in `src/commands/start.md:124`, and the test (case 13) reads `start.md`. The
> `files:` declaration and this heading are corrected to the real path; the change itself is
> unaffected.

**Action:** MODIFY
**Purpose:** One-line correction — the promote contract's description is now inaccurate on all four routes.
**Change type:** documentation correction, one parenthetical

Line 124 describes the promote list as:

> the scheduler's `nextRunnable` set

After the promote-parity slice landed, `promote[]` is that set **minus the
quarantined candidates** on all four routes — and it was already that on the
dashboard route before it. The wording tells the model driving the completion turn
that it is receiving the raw scheduler output, which is the one thing it is not.
Apply the executor's own recommended wording, reported as a handover in that
slice's decision 9:

> the scheduler's newly-runnable set with the concurrent-edit guard applied

Nothing else in that file is touched. The sanctioned-promotion rule it states —
never start a queued task the scheduler did not return in `promote[]` — remains
correct and unchanged.

---

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `renderReconcileHealth` | `menu-screens.buildDashboardTable` (this slice) | `/ctoc:menu` → dashboard render |
| the captured `reconcileThrew` | same function, same slice | `/ctoc:menu` → dashboard render |
| `report.corrupt` reader | `renderReconcileHealth` (this slice) — the field's FIRST reader | `/ctoc:menu` |
| `report.saveFailed` reader | `renderReconcileHealth` (this slice) — the field's FIRST reader | `/ctoc:menu` |
| corrected promote wording | read by the session model on every completion turn | `/ctoc:menu` |

## Test Plan

### Tests: `tests/dashboard-reconcile-failure.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `before` / `after` / `node:assert`)

Each case forces a real failure and asserts the screen admits it. The three
failures are induced at their real sources, never by stubbing the renderer.

| # | Case | How the failure is induced | Assertion |
|---|---|---|---|
| 1 | **a thrown pass is announced** | stub `taskReconcile.reconcileState` through the `require.cache` seam to throw `Error('injected reconcile failure')` | text contains `the background task check DID NOT RUN`, contains `injected reconcile failure`, and the dashboard still renders its other sections (`INBOX`, `AGENT` both present) |
| 2 | **the dashboard is not bricked** | same | `buildDashboardTable` returns a non-empty string and does not throw |
| 3 | **an unparseable registry is announced** | write `not json at all` to `.ctoc/state/tasks.json` | text contains `the task registry could not be read` and names a reason |
| 4 | **malformed entries are counted** | a registry whose `tasks` array contains two entries missing `id` | text contains `malformed entr` and the count `2` |
| 5 | **a failed save is announced** | make the save fail at its real source — the `safe-fs` write seam — so `report.saveFailed` is set by `task-reconcile.js:599` | text contains `could NOT be saved` and `what you see is not what is stored` |
| 6 | **a healthy project renders byte-identically** | a clean registry, one `done` task | text contains none of `DID NOT RUN`, `could not be read`, `could NOT be saved` |
| 7 | **health leads findings** | a corrupt-entry registry that ALSO produces a wedge | the index of the health line is LESS than the index of the wedge block and less than the orphan line |
| 8 | **corrupt and save-failed both render, corrupt first** | induce both | both lines present; corrupt's index is lower |
| 9 | **a long message is bounded** | inject a 500-character error | the health line is at most ~200 characters and the message ends `…` |
| 10 | **a control character cannot forge a row** | inject an error message containing an escape sequence and a newline | the rendered text contains no escape character and the health line remains one line |
| 11 | **a null-ish report does not crash the renderer** | force `reconcileState` to return `{}` (no `report`) | no throw; no health line; dashboard renders |
| 12 | **the promote wording is corrected** | read `src/commands/menu.md` | line 124 contains `with the concurrent-edit guard applied` and does not describe `promote[]` as the bare `nextRunnable` set |

Cross-platform: `fs.promises`, `path.join`, `os.tmpdir()`; teardown with
`fs.promises.rm(root, { recursive: true, force: true })`. Case 5 uses the
`safe-fs` seam rather than a read-only directory: a permission-based fixture would
have to be skipped on some platform, and a skip is a gate failure under the
zero-skipped rule, while a seam behaves identically everywhere.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/dashboard-reconcile-failure.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 3, 4, 5, 7, 8 and 12 MUST be red: today the dashboard renders as though the pass succeeded in every one of them, and the promote wording is uncorrected.
- [x] COMPLETE — written and run BEFORE any source edit: `tests 13`, `suites 1`, `pass 4`, `fail 9`, `cancelled 0`, `skipped 0`, `todo 0`. Verbatim red evidence, including the human-visible render, is in the Execution Record below.
### Step 9: PREPARE — re-read from disk: `src/lib/menu-screens.js:160-320` INCLUDING the landed wedge rendering (if `renderWedgeReports` is absent, STOP and report — case 7 depends on it); `src/lib/task-reconcile.js` where `corrupt` and `saveFailed` are written (`:280`, `:437`, `:593`, `:599`) to confirm their exact shapes; `src/lib/safe-fs.js` for the deterministic save-failure seam; and `src/commands/menu.md:110-135` to confirm line 124's current wording before rewriting it.
- [x] COMPLETE — `renderWedgeReports` IS present, so case 7 stands. The landed code WINS over this plan's line numbers: the reconcile call site is at `:373-383`, not `:230-234`, and the `corrupt`/`saveFailed` writers are at `task-reconcile.js:296`, `:453`, `:609`, `:615` — not `:280`/`:437`/`:593`/`:599`. Shapes confirmed at their real writers: `corrupt` is `{reason, skipped?}`, `saveFailed` is a message string.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] COMPLETE — Changes 1, 2 and 3 applied, plus two ratchets moved in the correct direction (decisions 12 and 13).
  - `src/lib/menu-screens.js` — Changes 1, 2 and 3 (capture the throw; add `FAILURE_MESSAGE_CAP` and `renderReconcileHealth`; render it above everything else in the task area).
  - `src/commands/menu.md` — the one-line promote-contract correction.
### Step 11: REVIEW — confirm the dashboard still renders on every induced failure (no path where a health line replaces the screen). Confirm no other swallowing `catch` in `buildDashboardTable` hides a comparable failure; list each remaining one with a justification. Confirm the comment at the reconcile call site no longer says a failure must be silent. Confirm the `menu.md` edit changed exactly one line and left the sanctioned-promotion rule intact.
- [x] COMPLETE — the dashboard renders on every induced failure (cases 2 and 12 assert it; every other case reads `INBOX`/`AGENT` out of the same string). Two `catch`es remain in `buildDashboardTable`, both justified: `taskRegistry.load` → `emptyRegistry()` and `taskView.renderTasksSection` → `''`. Neither can hide THIS defect, and the argument is structural rather than a hope: any condition that makes `taskRegistry.load` throw ALSO reaches `reconcileState` first, which either records `corrupt: 'load-failed'` or throws — so the health line renders and the empty TASKS block is never presented as a trustworthy zero. `renderTasksSection` is a pure view over an already-loaded value and makes no freshness claim. The call-site comment no longer says the failure must be silent; the `menu.md` edit changed exactly one line and the sanctioned-promotion rule is byte-identical.
### Step 12: OPTIMIZE — the renderer is a few string comparisons on an object already in hand; no extra reconcile call, no re-read of the registry.
- [x] COMPLETE — two truthiness tests and at most three string builds on an object already in hand. No extra reconcile call, no registry re-read, no allocation on the healthy path (it returns `''` before building anything).
### Step 13: SECURE — the error message may originate from a corrupt registry file, which is attacker-influenceable: it passes through `stripCtl` AND is length-bounded, and newlines are removed so a crafted message cannot inject additional dashboard rows. No stack traces and no absolute paths are rendered — message text only.
- [x] COMPLETE — every interpolated value (`threw`, `corrupt.reason`, `saveFailed`) goes through `stripCtl` and the 120-character bound. Only `err.message` is read, never `err.stack`. Proved from the human's seat by the control-character case, which drives the real render and asserts no escape byte reaches the screen and that an embedded newline cannot forge a second row.
### Step 14: VERIFY — `node --test tests/dashboard-reconcile-failure.test.js tests/dashboard-wedge-reports.test.js tests/menu-screens-coverage.test.js tests/menu-protocol.test.js tests/w10-live-agent-reconcile.test.js` green, then the full gated run `npm test`. Lint the changed JavaScript files. No git operations.
- [x] COMPLETE — verbatim numbers in the Execution Record below. The 99 floor was NOT touched. No git operations.
### Step 15: DOCUMENT — JavaScript doc on `renderReconcileHealth` stating the distinction this slice rests on: not bricking and not saying anything are different instructions. Update the block comment at `menu-screens.js:216-229` so it no longer describes the pass as purely best-effort.
- [x] COMPLETE — the JavaScript doc states the distinction in those words and records what is and is not reachable, with evidence. The call-site block comment now reads "fail-open but NOT SILENT" instead of describing the pass as purely best-effort. No CHANGELOG exists in this repository.
### Step 16: FINAL-REVIEW — report files, tests, verbatim red evidence, verbatim green evidence, and every decision taken under ambiguity.
- [x] COMPLETE — reported below. Gate 3 is the human's and was not crossed.

## Decisions Taken Under Ambiguity

1. **Three separate lines, not one "reconcile unhealthy" line.** The three states
   call for different human responses — a thrown pass may be a code defect, a
   corrupt registry needs the file repaired or deleted, a failed save is usually a
   permission or disk problem. Collapsing them would force the human to open the
   logs to learn which one happened.
2. **Health renders above findings.** A human who reads task counts without knowing
   the check never ran has been actively misled. Ordering is the cheapest possible
   fix for that and is asserted rather than left to convention.
3. **The throw is still caught.** Letting it propagate would brick the dashboard,
   which the existing comment is right to forbid. This slice changes only whether
   the failure is *reported*, never whether it is *survived*.
4. **A `⛔` marker for all three**, matching the permanent-wedge marker used by the
   wedge slice, because none of the three clears on its own.
5. **Case 5 uses the `safe-fs` seam, not a read-only directory.** A permission-based
   test would have to be skipped on some platform, and a skip is a gate failure
   under the zero-skipped rule.
6. **`report.corrupt` and `report.saveFailed` get their first readers here rather
   than in the wedge slice.** They describe the pass's own health, not what it
   found. Putting them with the findings would have blurred exactly the distinction
   this slice exists to draw.
7. **The `src/commands/menu.md:124` correction is folded into THIS slice.** Two
   reasons, and the second is the deciding one. **Subject:** this slice is about
   what consumers are told regarding the reconcile pass's output — the dashboard
   tells the human, `menu.md:124` tells the model driving the completion turn, and
   both descriptions were inaccurate for the same underlying reason. **Gate
   integrity:** the two closer candidates were both unavailable. The promote-parity
   slice that created the inaccuracy has already crossed into review — amending a
   landed slice would edit work already gated. The wedge-reports slice has crossed
   Gate 2 with a human-approved three-file `files:` list, and adding a fourth file
   to an approved plan expands its write surface after the human approved it, which
   is not the planner's call. This slice is still in `implementation/`, pre-Gate-2,
   so its scope is still under review and the addition is visible to the human who
   rules on it.

Decisions 8–15 were taken by the executor DURING Steps 8–16 and are recorded here as
required.

8. **The plan's case 3 asserted a line the code CANNOT emit, and was replaced by the
   real behaviour plus a real load failure.** The plan says writing `not json at all`
   to the registry file produces `report.corrupt`. It does not. `task-registry.load`
   fails OPEN on an unparseable file (`JSON.parse` throws → `loadedEmpty()`,
   `task-registry.js:381-386`), so `reconcile` receives a well-formed EMPTY registry
   and sets no corrupt marker at all. Writing the test the plan specified would have
   forced a false alarm into the renderer — a dashboard claiming a corruption it never
   observed, which is the SAME defect class this slice exists to remove (a verdict on
   input the surface never received), just inverted. So case 3 now pins the true
   behaviour (garbage file ⇒ dashboard renders, and does NOT claim corruption) and a
   NEW case 4 induces the reachable `corrupt.reason === 'load-failed'` at
   `task-reconcile.js:609`. This TIGHTENS the specification; nothing was weakened.
9. **The plan's case 4 (`malformed-entries-skipped`) is UNREACHABLE through
   `reconcileState`, and is injected at the module boundary rather than dropped.**
   Evidence: `normalizeLoadedTask` (`task-registry.js`) guarantees a string `id`,
   `kind` and `status` on every task that survives a load, and drops the rest at LOAD
   time; `reconcile`'s own skip counter (`task-reconcile.js:309`) tests exactly those
   fields, so it is always 0 on this path. The `{reason:'malformed-entries-skipped',
   skipped:n}` shape IS live for a direct `reconcile` caller, so the branch is real
   code with a real writer and it gets a real assertion — injected at the
   `taskReconcile.reconcileState` namespace boundary, the same seam the wedge slice
   used for shapes disk cannot produce. Deleting the case would have left a branch of
   an honesty renderer untested.
10. **The load-failure case is injected by replacing `taskRegistry.withRegistry`, NOT
    `safe-fs` as the plan specified — and the reason is a defect this slice does not
    own.** Making `safeFs.existsSync` throw for the registry file also breaks
    `state.getAgentStatus`, which calls `taskRegistry.load` UNGUARDED
    (`src/lib/state.js:258`) from `buildDashboardTable` BEFORE reconcile runs, so the
    ENTIRE dashboard throws. That is a real second bricking path for an operating-system
    level registry read error, it lives in a file this slice does not declare, and it is
    REPORTED as a finding rather than fixed here or hidden by quietly choosing a seam
    that does not trip it. The `withRegistry` seam still exercises the real failure
    report, built by the real code at `task-reconcile.js:609`.
11. **The health line says "the task counts ABOVE", not "below" as the plan drafted
    it.** The line renders INSIDE the TASKS section, immediately beneath the counts it
    qualifies — moving it above the `TASKS` header would leave a bare ⛔ line belonging
    to no section. The plan's wording was drafted against an assumed position; the
    rendered screen was checked and the wording follows the screen. The plan's actual
    ordering requirement (health leads every FINDING — the orphan line and every wedge
    line) is met and asserted.
12. **A ratchet moved in the correct direction: the false-green baseline went 218 →
    217.** The empty `catch` this slice removes was a TRACKED finding
    (`src/lib/menu-screens.js:silent-catch:buildDashboardTable`). The fence failed
    loudly on the unclaimed progress. The key was removed from `findings` and
    `maxFindings` lowered to 217. **No whitelist entry was added and no threshold was
    raised.** Debt shrank, which is the only direction allowed.
13. **A second ratchet: the documented test-file count in `CLAUDE.md` went 426 → 427**
    (two places), because this slice adds one test file and `tests/doc-counts.test.js`
    verifies that count against disk. `CLAUDE.md` and `.ctoc/false-green-baseline.json`
    were added to this plan's `files:` to declare both writes rather than touch
    undeclared files.
14. **The `menu.md` correction NAMES `nextRunnable` as well as the guard.** The plan's
    suggested wording ("the scheduler's newly-runnable set with the concurrent-edit
    guard applied") drops the identifier, and a pre-existing test —
    `tests/menu-protocol.test.js`, "SPEC-A — DC-COMPLETE" — requires the completion
    recipe to name `nextRunnable`. That test is RIGHT: the model driving the completion
    turn needs to know which scheduler output is meant. The default rule was followed
    (the code is wrong, not the test) and the prose was improved rather than the test
    weakened: "the scheduler's newly-runnable `nextRunnable` set with the concurrent-edit
    guard applied — that set MINUS the candidates the guard held, never the raw set".
    Verified against the code first: `reconcileState` (`task-reconcile.js:645-649`) and
    `computePromote` (`menu-screens.js:2014`) both pass `nextRunnable`'s output through
    `applyQuarantine`, so all four routes publish the guarded set.
15. **The gated run caught a documentation invariant and the code was fixed, not the
    test.** `tests/menu-task-wiring.test.js` ("E7: registry path via task-registry")
    forbids `menu-screens.js` from naming the registry file anywhere, including in a
    comment, so the module cannot re-encode a path the registry owns. The new JavaScript
    doc named it while explaining what is reachable; the sentence was reworded to "an
    unparseable registry file". The invariant is correct and was left untouched.

## Execution Record (Steps 8–16)

### Step 8 TEST — the red, and what the HUMAN SAW

`tests/dashboard-reconcile-failure.test.js` was written in full and run BEFORE any source
edit: `tests 13`, `suites 1`, `pass 4`, `fail 9`, `cancelled 0`, `skipped 0`, `todo 0`.

The load-bearing red is not a message about a flag — it is the screen. With
`reconcileState` throwing, the ENTIRE human-visible dashboard was, verbatim from the
assertion output:

```
CTOC v6.12.90
────────────────────────────────────────────────────────────

▼ Business (0)
    Vision         0
    Canvas         0
    Functional     0

▼ Implementation (0)
    Implementation 0
    Todo           0

▼ Execution (0)
    In progress    0
    Review         0
    Done           0

TASKS
  ⏸ 1 queued    implement a task (waits: queued)

INBOX
  ○ Inbox clear — no async items waiting

AGENT
  ○ Idle
```

Nothing on that screen differs by one byte from a screen where the pass ran and found
everything healthy. `⏸ 1 queued` is presented as a checked fact; nothing checked it. That
is the defect, reproduced from the human's seat.

AFTER, same fixture, same throw (message shown as a realistic `EACCES`):

```
TASKS
  ⏸ 1 queued    implement a task (waits: queued)

  ⛔ the background task check DID NOT RUN — the task counts above are unchecked and may be stale: EACCES: permission denied, open tasks.json · view: tasks
INBOX
```

### Steps 9–13

Recorded inline against each step above. The one finding NOT fixed here is decision 10:
`state.getAgentStatus` calls `taskRegistry.load` UNGUARDED from `buildDashboardTable`
(`src/lib/state.js:258`), so an operating-system level registry read error bricks the whole
dashboard before reconcile is ever reached. Different file, different failure mode, not in
this slice's declared `files:` — reported, not silently absorbed.

### Step 14 VERIFY — verbatim

Targeted run (this file plus every suite that reads the same render):
`tests 172`, `suites 47`, `pass 172`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`.

Full gated run, `npm test`:

```
ℹ tests 9978
ℹ suites 1731
ℹ pass 9978
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
[CTOC test-gate] coverage 99.05% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

The 99 floor was NOT touched. Lint clean: `eslint --max-warnings 0` on
`src/lib/menu-screens.js` and `tests/dashboard-reconcile-failure.test.js`. Reachability and
export-reachability fences green — `renderReconcileHealth` is module-private and reached
from `buildDashboardTable`, which every `/ctoc:menu` dashboard render calls. No git
operations were performed.

### Wiring — confirmed live

`report.corrupt` and `report.saveFailed` each have their FIRST reader as of this slice:
`renderReconcileHealth`, reached from `buildDashboardTable`, reached from the shipped
`/ctoc:menu` dashboard render. The captured `reconcileThrew` has exactly one reader, the
same function. No follow-up wiring, no dead code.
