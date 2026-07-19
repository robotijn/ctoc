---
title: "The wedge reports get a reader — the dashboard shows what can never run"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00076-quarantine-fault-fails-safe, 00077-quarantine-on-every-promote-path
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/menu-screens.js"
  - "tests/dashboard-wedge-reports.test.js"
  - "tests/dashboard-wedge-fault.test.js"
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-18T21:08:04.207Z
gate_crossed: implementation → todo
---

# The wedge reports get a reader

The reconcile pass computes five fields that describe work which is stuck, held,
lost, or unverifiable. Verified on disk against the code as it stands **now**,
after the concurrent-edit guard slice and the promote-parity slice both landed:

| Field | Written at | Read at |
|---|---|---|
| `report.unsatisfiable` | `task-reconcile.js:478` | nowhere |
| `report.deferred` | `task-reconcile.js:465` | nowhere |
| `report.stalenessOrphaned` | `task-reconcile.js:376` | nowhere |
| `report.quarantined` | `task-reconcile.js:648` (from `applyQuarantine`) | the three `menu task` command results only — **not the dashboard** |
| `report.quarantineFaulted` | `task-reconcile.js:649` (from `applyQuarantine`) | nowhere |

`src/lib/menu-screens.js:230-245` calls `taskReconcile.reconcileState`, keeps
`report.orphaned.length` and **discards the rest of the report object**. The
dashboard therefore renders exactly one line — `⚠ N tasks orphaned — offer
re-run` — and a task that has been marked `failed` because its dependency graph
contains a permanent cycle is indistinguishable, from the human's seat, from a
task that failed once for an ordinary reason. A computed value with no reader is
the same defect class as a claim with no test: it looks like the system knows
something, and no human ever learns it.

This slice gives all five fields a reader on the one screen a human actually
opens, and renders each with its reason and the dependency ids the data already
carries, so a **permanent** wedge is visually distinct from a **one-off** failure,
and a **held** task is distinct from a held task whose **guard never ran**.

It also corrects a false claim in the plan that shipped the first three fields.

**The declared `files:` list is unchanged from the one approved at Gate 2** — the
same three files. The amendment below adds two more report fields to the same
renderer inside the same file; it grants no new write surface.

## Written against the code that exists now

Two sibling slices landed after this plan was first written, and they changed the
shape of the data this render consumes. This plan is written against the code as
it is today, not as it was:

- **`plans/review/00076-quarantine-fault-fails-safe.md`** made the concurrent-edit
  guard fail safe and introduced `report.quarantineFaulted`.
- **`plans/review/00077-quarantine-on-every-promote-path.md`** extracted the guard
  into a new exported pure function in `src/lib/task-reconcile.js`:

  ```js
  applyQuarantine(registry, candidates)
    → { promote, quarantined, faulted }
  ```

  `reconcileState` is now one of its callers and translates the result onto the
  report (`task-reconcile.js:645-649`):
  `report.quarantined = guarded.quarantined;` and
  `if (guarded.faulted) report.quarantineFaulted = guarded.faulted;`.
  `computePromote` in `menu-screens.js:1773` is the other caller and now returns
  `{ promote, quarantined }`.

**What this means for the dashboard render — and it is the load-bearing point:**
`reconcileState`'s return shape is unchanged, so this slice still reads the same
`report` object. But `report.quarantineFaulted`'s shape is now defined by
`applyQuarantine`'s `faulted` (`{phase, error, dropped}`), and Step 9 must confirm
it against that function rather than against any inline block, which no longer
exists.

## Correcting the premise on `report.quarantined`

The instruction for this amendment stated that the dropped candidates are already
visible through `report.quarantined`, so only the fault itself is missing. **That
is half true, and the half that is false is the half that matters here.** The
evidence, from `grep -n "\.quarantined" src/`:

- On the three command routes — `menu task fail | cancel | complete` — the held
  candidates ARE surfaced: `menu-screens.js:1859`, `:1903` and `:2055` attach
  `quarantined` to the command result, which the completion turn reads.
- On the **dashboard**, nothing reads `report.quarantined`. A human who opens
  `/ctoc:menu` and never runs a `menu task` command sees no held task at all.

So this slice renders `report.quarantined` too. Without it, the fault line would
announce that a safety check failed and name a count of held tasks that appear
nowhere on the same screen — a line pointing at evidence the human cannot see.
Five fields, not four.

## Implementation Details

### Dependency graph

```
src/lib/menu-screens.js  --already-requires-->  src/lib/task-reconcile.js  (no new import)
src/lib/menu-screens.js  --already-defines-->   stripCtl (module scope, line 61)
src/lib/task-reconcile.js  --applyQuarantine-->  report.quarantined + report.quarantineFaulted  (landed)
tests/dashboard-wedge-reports.test.js  --drives-->  menu-screens.buildDashboardTable (exported)
plans/review/00003-r2a-scheduler-lifecycle-honesty.md  --documents-->  the fields this slice reads
```

No new module, no new import, no change to `src/lib/task-reconcile.js`, no change
to the scheduler.

---

### File: `src/lib/menu-screens.js`
**Action:** MODIFY
**Purpose:** Give the five wedge report fields a reader on the dashboard.
**Change type:** modify-existing (one function body + one new module-private helper)

#### Change 1 — keep the whole report, not one number

At line 230-234 the current code is:

```js
let orphanedCount = 0;
try {
  const { report } = taskReconcile.reconcileState(root, { liveAgentIds: opts.liveAgentIds });
  orphanedCount = (report && Array.isArray(report.orphaned)) ? report.orphaned.length : 0;
} catch { /* reconcile is best-effort; a failure must never brick the dashboard */ }
```

Replace with a version that retains the report object itself:

```js
let orphanedCount = 0;
/** @type {object|null} */
let reconcileReport = null;
try {
  const { report } = taskReconcile.reconcileState(root, { liveAgentIds: opts.liveAgentIds });
  reconcileReport = report || null;
  orphanedCount = (report && Array.isArray(report.orphaned)) ? report.orphaned.length : 0;
} catch { /* reconcile is best-effort; a failure must never brick the dashboard */ }
```

The `catch` stays exactly as it is and `reconcileReport` stays `null` on that path.
Making that swallowed throw visible is a different behaviour with a different test
surface and is its own slice —
`plans/implementation/00080-dashboard-says-when-reconcile-failed.md`. This slice
must not pre-empt it.

#### Change 2 — a new module-private renderer

Add, immediately above `buildDashboardTable`:

```js
/** Cap on rendered entries per wedge category; the rest collapse to a count. */
const WEDGE_RENDER_CAP = 5;
/** Max characters of a recorded fault/summary message rendered on one line. */
const WEDGE_MESSAGE_CAP = 120;

/**
 * Human wording for each `unsatisfiableTasks` reason, and whether the wedge is
 * PERMANENT (no passage of time clears it) or a ONE-OFF (a rerun or a repaired
 * dependency clears it). The distinction is the point of the whole line: a
 * dependency cycle needs a human to break it; a failed dependency does not.
 * @type {Object<string,{permanent:boolean, text:string}>}
 */
const WEDGE_REASONS = Object.freeze({
  'dep-cycle':   { permanent: true,  text: 'dependency cycle — this can NEVER clear on its own; a human must break the cycle' },
  'dep-failed':  { permanent: false, text: 'a dependency failed' },
  'dep-missing': { permanent: false, text: 'a dependency is gone from the registry' }
});

/**
 * Render the reconcile pass's five wedge reports as dashboard lines.
 *
 * These fields — `unsatisfiable`, `deferred`, `stalenessOrphaned`, `quarantined`,
 * `quarantineFaulted` — had NO reader on this screen before this function existed:
 * the pass computed them on every menu open and threw them away, so queued work
 * that can never run, work being held, and a safety check that did not run at all
 * were all invisible to a human who opened the dashboard.
 *
 * TOTAL and fail-open: a null/absent/malformed report, or a malformed entry inside
 * a well-formed report, yields fewer lines, never a throw. An EMPTY report yields
 * the EMPTY STRING, so a project with no wedges renders a byte-identical dashboard.
 *
 * @param {object|null} report  a reconcile report (see ReconcileReport in task-reconcile.js).
 * @returns {string}  zero or more complete lines (each newline-terminated), or ''.
 */
function renderWedgeReports(report) { /* … */ }
```

Behaviour of `renderWedgeReports`, exactly:

1. `if (!report || typeof report !== 'object') return '';`
2. Read the arrays defensively: `const list = (v) => Array.isArray(v) ? v : [];`
3. **Quarantine-fault line** — when `report.quarantineFaulted` is a truthy object.
   One line, not a list: the field is a single object describing one fault.

   ```
     ⛔ the concurrent-edit safety check FAILED to run (${phase}) — ${n} task${n === 1 ? '' : 's'} held as a blanket precaution, not by a decision: ${error} · view: tasks
   ```

   where `phase = stripCtl(String(f.phase ?? 'unknown'))`,
   `n = list(f.dropped).length`, and
   `error = stripCtl(String(f.error ?? 'no message recorded'))` truncated to
   `WEDGE_MESSAGE_CAP` with a trailing `…`. The dropped ids are not repeated —
   they appear in the held block below, which is why that block must also render.
   The `⛔` marker matches the permanent-wedge marker: a safety check that cannot
   run will not fix itself.
4. **Held (quarantined) block** — when `list(report.quarantined).length > 0`:
   - header: `  ⊙ ${n} task${n === 1 ? '' : 's'} held this pass — files reserved by an agent that was never confirmed dead · view: tasks\n`
   - up to `WEDGE_RENDER_CAP` detail lines: `      ${id} — ${summary}\n`, where
     `summary = stripCtl(String(e.summary ?? e.reason ?? 'held'))` truncated to
     `WEDGE_MESSAGE_CAP`. The guard writes two distinct `reason` values —
     `staleness-orphan-quarantine` (a real decision) and `quarantine-fault` (the
     check could not decide) — and the summary text already distinguishes them.
   - overflow line: `      … and ${n - WEDGE_RENDER_CAP} more\n`
5. **Unsatisfiable block** — when `list(report.unsatisfiable).length > 0`:
   - header: `  ⛔ ${n} task${n === 1 ? '' : 's'} can NEVER run — the scheduler failed ${n === 1 ? 'it' : 'them'} · view: tasks\n`
   - up to the cap, one detail line per entry:
     `      ${marker}${id} — ${reasonText} · depends on: ${deps}\n`
     where `id = stripCtl(String(e.id))`,
     `reasonText = (WEDGE_REASONS[e.reason] || { text: stripCtl(String(e.reason)) }).text`,
     `deps = list(e.deps).map((d) => stripCtl(String(d))).join(', ') || 'none recorded'`,
     and `marker` is `⛔ PERMANENT — ` when
     `WEDGE_REASONS[e.reason].permanent === true`, else `⚠ `. This is the required
     visual distinction and it is asserted by the test.
   - overflow line as above.
6. **Deferred block** — when `list(report.deferred).length > 0`:
   - header: `  ⊙ ${n} task${n === 1 ? '' : 's'} held one pass — every dead dependency was orphaned on age alone and may still finish · view: tasks\n`
   - up to the cap: `      ${id} — waiting on: ${deps}\n`; overflow line as above.
7. **Staleness-orphaned block** — when `list(report.stalenessOrphaned).length > 0`:
   - header: `  ⚠ ${n} task${n === 1 ? '' : 's'} orphaned on age alone — the agent was never confirmed dead and may still be alive · view: tasks\n`
   - up to the cap:
     `      ${id} (${kind}) — ${mins} min old, the floor for this kind is ${floor} min\n`
     where `kind = stripCtl(String(e.kind ?? 'unknown'))`,
     `mins = Number.isFinite(e.ageMs) ? Math.round(e.ageMs / 60000) : 'unknown'`,
     `floor = Number.isFinite(e.thresholdMs) ? Math.round(e.thresholdMs / 60000) : 'unknown'`.
     A `null` `ageMs` (reconcile writes `null` for an unparseable start time —
     `task-reconcile.js:379`) renders `unknown`, never `NaN`.
   - overflow line as above.
8. Concatenate in the order **fault → held → unsatisfiable → deferred →
   staleness-orphaned** and return. All-empty ⇒ `''`.
   The fault leads because it is the only line that says a *check* did not happen;
   everything below it is a *result*, and a reader who has not seen the fault line
   will misread those results as decisions. The held block follows immediately so
   the fault's count has its evidence directly beneath it.

#### Change 3 — call the renderer

In `buildDashboardTable`, immediately after the existing orphaned-count block
(current lines 243-245, which is left untouched):

```js
// The five wedge reports the reconcile pass computes on every open finally have a
// READER on the screen a human opens. Before this, a task the scheduler had already
// failed for a permanent dependency cycle was indistinguishable from an ordinary
// one-off failure; a held task was invisible unless you happened to run a
// `menu task` command; and a concurrent-edit guard that never ran looked exactly
// like one that ran and decided to hold.
out += renderWedgeReports(reconcileReport);
```

`renderWedgeReports` returns `''` for a clean project, so this line adds zero bytes
to the dashboard of a project with no wedges — every existing dashboard substring
and count assertion is preserved by construction.

`renderWedgeReports` is deliberately **not exported**, per the standing rule
recorded in this file's own export block (`:2216-2219`); the tests drive
`buildDashboardTable`.

---

### File: `plans/review/00003-r2a-scheduler-lifecycle-honesty.md`
**Action:** MODIFY
**Purpose:** Correct two claims that were false on the day they were written.
**Change type:** documentation correction — two clauses, nothing else

1. **Line 36-37** currently ends item 2 with:
   `… and pushes a report entry so the caller surfaces it to the inbox — silent-forever is the defect; every wedge becomes a loud event.`
   Replace the final clause with:
   `… and pushes a report entry. THIS WAS NOT SUFFICIENT: as shipped, report.unsatisfiable had no reader anywhere in src — the dashboard read only report.orphaned.length and discarded the rest — so a wedge was recorded and never shown. The reader is added by plans/todo/00075-wedge-reports-get-a-reader.md; the claim "every wedge becomes a loud event" was false until that slice landed.`
2. **Line 51-53** currently claims of `report.stalenessOrphaned` that it is added
   `so the inbox can say "orphaned on staleness alone — may still be alive"`.
   Append: `— a capability that did not exist until plans/todo/00075-wedge-reports-get-a-reader.md gave the field a reader; the field was written and discarded on every menu open.`

No other line of that plan is touched by this slice. Its
`## Decisions Taken Under Ambiguity` section belongs to
`plans/implementation/00078-scheduler-lifecycle-decision-record.md`.

---

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `renderWedgeReports` | `menu-screens.buildDashboardTable` (this slice, same file) | `/ctoc:menu` → dashboard render |
| retained `reconcileReport` | same function, same slice | `/ctoc:menu` → dashboard render |

`buildDashboardTable` is called on every dashboard render by the shipped
`/ctoc:menu` command. There is no follow-up wiring and no dead code, and after
this slice lands `report.quarantineFaulted` is no longer a field with no reader
and `report.quarantined` is no longer invisible to a human who only opens the
dashboard.

## Test Plan

### Tests: `tests/dashboard-wedge-reports.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `before` / `after` / `node:assert`)

Every case drives the real human path: seed a temp project root with a real
`.ctoc/state/tasks.json`, call `menuScreens.buildDashboardTable(root)`, assert on
the rendered text. No stub of `reconcileState`, no direct call to the private
renderer. The fault cases are the exception and are described below.

Setup (cross-platform): `await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ctoc-wedge-'))`,
then `fs.promises.mkdir(path.join(root, '.ctoc', 'state'), { recursive: true })`,
then `fs.promises.writeFile(path.join(root, '.ctoc', 'state', 'tasks.json'), JSON.stringify(registry))`.
Teardown: `fs.promises.rm(root, { recursive: true, force: true })`.

| # | Case | Seed | Assertion |
|---|---|---|---|
| 1 | clean project renders byte-identically | one `done` task | none of `can NEVER run`, `held one pass`, `held this pass`, `orphaned on age alone`, `FAILED to run` appear |
| 2 | a dependency cycle is PERMANENT | `t1.blockedBy=['t2']`, `t2.blockedBy=['t1']`, both queued | matches `/2 tasks can NEVER run/`, contains `⛔ PERMANENT`, `dependency cycle`, and both ids |
| 3 | a failed dependency is a ONE-OFF | `t1` `failed`; `t2` queued `blockedBy:['t1']` | contains `a dependency failed`, `depends on: t1`; does NOT contain `PERMANENT` |
| 4 | a missing dependency names the id | `t2` queued `blockedBy:['t99']` | contains `a dependency is gone from the registry`, `depends on: t99` |
| 5 | a deferred task shows what it waits on | `t1` running 200 min, kind `implement`, no `agentTaskId`; `t2` queued `blockedBy:['t1']` | contains `held one pass`, `t2`, `waiting on: t1` |
| 6 | an age-only orphan shows age and floor | same as 5 | contains `orphaned on age alone`, `(implement)`, `min old`, `the floor for this kind is 120 min` |
| 7 | **a held candidate is visible on the DASHBOARD** | an `orphaned` task with `result.orphanReason:'staleness'` and `touches:['src/a.js']`, plus a queued task touching `src/a.js` | contains `held this pass` and the queued task's id — red today, and the case that makes the fault line's count meaningful |
| 8 | an unparseable start time renders `unknown` | `ts.started: 'not-a-date'` | contains `unknown`, does not match `/NaN/` |
| 9 | overflow collapses past the cap | 7 queued tasks each with a missing dependency | contains `… and 2 more`, exactly 5 detail lines in that block |
| 10 | a control character cannot forge a row | `blockedBy: ['t[2Jx']` | rendered text contains no escape character |
| 11 | a malformed entry degrades | a wedge whose `deps` is absent | contains `none recorded`; no throw |
| 12 | a broken registry still renders | `tasks.json` = `not json at all` | returns a non-empty string |
| 13 | **the fault line renders** | fault injected (see note) | contains `the concurrent-edit safety check FAILED to run`, the phase, the injected message, and the held count |
| 14 | **the fault line leads, the held block follows** | fault injected with a staleness orphan present | index of `FAILED to run` < index of `held this pass` < index of `orphaned on age alone` |
| 15 | **no fault ⇒ no fault line** | a genuine quarantine hold, real overlap test | contains `held this pass` but NOT `FAILED to run` — the case that proves the line means what it says |
| 16 | a long message is bounded | fault with a 500-character message | the line is at most ~200 characters and the message ends `…` |
| 17 | a malformed fault object degrades | `quarantineFaulted` present, `dropped` and `phase` absent | renders `unknown` and `0 tasks`; no throw; no `undefined` in the text |

**Note on cases 13-17.** These need a *thrown* overlap test, which cannot be
produced from disk state alone. Use the seam the landed
`tests/task-reconcile-quarantine-fault.test.js` already proved: install a throwing
`touchesOverlap` through the `require.cache` entry for `src/lib/plan-coverage`
before `src/lib/task-reconcile` and `src/lib/menu-screens` are required, requiring
`task-registry` first so the scheduler keeps the real overlap test, and restore in
`after()`. Read that file at Step 9 and follow what it actually does. If the
modules cannot be cleanly re-required per `describe` block, split cases 13-17 into
`tests/dashboard-wedge-fault.test.js`, record the split, and do NOT drop them.

Coverage targets: every branch of `renderWedgeReports` — all five blocks present,
all five absent, cap hit and not hit, each of the three reasons, an unknown
reason, non-finite age, non-finite threshold, truthy/absent/malformed
`quarantineFaulted`, both `quarantined` reason values, null report.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/dashboard-wedge-reports.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1 and 12 may already pass (they assert preserved behaviour); cases 2-11 and 13-17 MUST be red before any source edit.
- [x] COMPLETE — both test files written and run BEFORE any source edit: tests 17 / pass 4 / fail 13 / 0 omitted. The load-bearing red was the dependency-cycle case: the whole dashboard rendered `✗ 7 failed   implement t1` and nothing else, so a permanent cycle and an ordinary failure were literally the same line.
### Step 9: PREPARE — re-read from disk: `src/lib/menu-screens.js:1-70` and `:160-320`; `src/lib/task-reconcile.js`'s `ReconcileReport` typedef AND `applyQuarantine`, to confirm the exact shapes of `quarantined` (entry `{id, reason, summary}`) and `quarantineFaulted` (`{phase, error, dropped}`) against the landed code rather than this plan's quotation; and `tests/task-reconcile-quarantine-fault.test.js` for the working fault-injection seam. If `applyQuarantine` is absent, STOP and report — do not stub around a missing dependency.
- [x] COMPLETE — re-read from disk: menu-screens.js:1-70 and :160-320, task-reconcile.js ReconcileReport typedef and applyQuarantine (present, returning {promote, quarantined, faulted}), and tests/task-reconcile-quarantine-fault.test.js for the working seam. Shapes confirmed against the landed code: quarantined entry {id, reason, summary}, quarantineFaulted {phase, error, dropped}.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] COMPLETE — src/lib/menu-screens.js Changes 1, 2 and 3 applied with all five blocks. The scheduler-lifecycle plan correction was NOT applied — see decision 12 (handover).
  - `src/lib/menu-screens.js` — Changes 1, 2 and 3 (retain the report; add `WEDGE_RENDER_CAP`, `WEDGE_MESSAGE_CAP`, `WEDGE_REASONS`, `renderWedgeReports` with all five blocks; call it from `buildDashboardTable`).
  - `plans/review/00003-r2a-scheduler-lifecycle-honesty.md` — the two clause corrections.
### Step 11: REVIEW — diff against this plan. Confirm: the existing orphaned-count block is untouched; the swallowing `catch` around `reconcileState` is untouched (it belongs to slice 00080); `renderWedgeReports` returns `''` for an empty report; the function is not exported; no new `require` was added; the block comment at `:216-245` no longer claims anything the code does not do. Then confirm and report that `report.quarantineFaulted` now has exactly one reader and that `report.quarantined` now has a dashboard reader, naming both.
- [x] COMPLETE — the orphaned-count block is untouched; the swallowing catch around reconcileState is untouched; renderWedgeReports returns the empty string for an empty report; it is not exported; no new require was added. report.quarantineFaulted now has exactly ONE reader: renderWedgeReports, reached from buildDashboardTable. report.quarantined now has a DASHBOARD reader for the first time (its only prior readers were the three menu task command results).
### Step 12: OPTIMIZE — one linear pass over four bounded arrays plus one object, with a hard render cap; no sorting, no repeated `JSON.stringify`, no second reconcile call.
- [x] COMPLETE — one linear pass over four bounded arrays plus one object, hard render cap of 5, no sorting, no JSON.stringify, no second reconcile call.
### Step 13: SECURE — every interpolated value (`id`, `reason`, `summary`, `deps`, `kind`, `phase`, `error`) passes through the module's existing `stripCtl`: a registry file is attacker-influenceable and an embedded escape sequence could otherwise forge a dashboard row. The two free-text fields (`summary`, `error`) are additionally length-bounded. No new regex literal beyond the existing `stripCtl`. No filesystem write. `path.join` only, in the test helper.
- [x] COMPLETE — every interpolated value (id, reason, summary, deps, kind, phase, error) passes through the module stripCtl; the two free-text fields are additionally bounded at 120 characters. No new regex literal, no filesystem write. Proved by the control-character case, which drives the real render.
### Step 14: VERIFY — `node --test tests/dashboard-wedge-reports.test.js` green, then the full gated run `npm test` (suite + coverage floor + the zero-skip gate). Lint `src/lib/menu-screens.js` and the new test file. No git operations.
- [x] COMPLETE — see the Execution Record below for the verbatim gated numbers.
### Step 15: DOCUMENT — JavaScript doc on `renderWedgeReports` and `WEDGE_REASONS` stating plainly that these fields had no dashboard reader before this slice, naming the writers they read, and drawing the distinction the ordering rests on: the fault line describes a check that did not run, every line below it describes what a check produced. Update the block comment at `:216-229` so it describes reading the whole report.
- [x] COMPLETE — JavaScript doc on renderWedgeReports and WEDGE_REASONS naming the writers and stating these fields had no dashboard reader before; the block comment above the reconcile call now says the report is kept WHOLE. No CHANGELOG exists in this repository.
### Step 16: FINAL-REVIEW — report files, tests, verbatim red evidence, verbatim green evidence, whether cases 13-17 stayed in this file or were split, and every decision taken under ambiguity.
- [x] COMPLETE — reported below. Cases 13-17 were SPLIT into tests/dashboard-wedge-fault.test.js (decision 13). Gate 3 is the human. 

## Decisions Taken Under Ambiguity

1. **Five fields, not four — `report.quarantined` is rendered too.** The amendment
   instruction said the dropped candidates were already visible through that field.
   Checked against `grep -n "\.quarantined" src/`: they are visible on the three
   `menu task` command results (`menu-screens.js:1859`, `:1903`, `:2055`) and
   **not** on the dashboard. Rendering the fault line without them would announce a
   failed safety check and cite a count of held tasks that appear nowhere on the
   same screen. The premise is corrected here with its evidence rather than
   silently followed.
2. **The fault line leads and the held block follows it directly.** Ordering is a
   claim about what matters: a human who reads "3 tasks held" and stops has learned
   something false if the guard never ran, and the fault's count needs its evidence
   immediately beneath it.
3. **The fault renders as ONE line and does not repeat the dropped ids.** They are
   in the held block directly below; repeating them would imply two incidents.
4. **Free text is truncated to 120 characters.** The guard records message strings,
   but "message string" is not a bound, and an unbounded interpolation is how a
   dashboard line becomes unreadable. The full value stays in the report object.
5. **A render cap of 5 entries per category with an overflow count.** The header
   line always carries the TRUE total, so nothing is hidden — only the detail list
   is capped.
6. **`renderWedgeReports` is module-private; tests drive `buildDashboardTable`.**
   Exporting it solely for a test would be a dead export, which this file
   explicitly refuses at `:2216-2219`.
7. **Ages render in whole minutes**, matching how the thresholds are expressed in
   `task-reconcile.js`.
8. **The `catch` around `reconcileState` keeps swallowing IN THIS SLICE.** Making
   that failure visible is slice 00080; doing it here would merge two behaviours
   into one test surface.
9. **The correction to the scheduler-lifecycle plan is surgical** — two clauses,
   both of which asserted a reader that did not exist. Rewriting its history would
   erase the evidence of how a false claim shipped.
10. **The declared `files:` list is unchanged from the Gate 2 approval.** This
    amendment adds two report fields to a renderer inside a file already declared;
    it grants no new write surface. Expanding an approved plan's file list after
    the human approved it is not the planner's call, and was not needed.
11. **Both sibling slices are declared as dependencies even though both have
    already crossed into review.** This plan reads fields they write and calls a
    shape they defined; Step 9 stops if `applyQuarantine` is absent. Recording the
    edges keeps the ordering true if any of the three is ever replayed on a fresh
    tree.

Decisions 12–17 were taken by the executor DURING Steps 8–16 and are recorded here
as required:

12. **The correction to `plans/review/00003-r2a-scheduler-lifecycle-honesty.md` was
    NOT applied — it is a HANDOVER, not a silent omission.** The executor's dispatch
    brief stated that a planning agent was concurrently editing files under `plans/`
    and instructed the executor to touch nothing under `plans/` except this plan
    file. That instruction is newer than this plan and it is a real concurrency
    hazard: two writers on one file lose an edit. The correction is therefore handed
    over VERBATIM so it can be applied by whoever owns that file next — the two
    clause replacements are still written out in full in the "File:
    plans/review/00003-…" section above, unchanged. `plans/review/00003-…` was
    removed from this plan's `files:` list, because declaring a file the slice does
    not write would be a false claim about its own scope. **The two false claims in
    that plan are still false and still need correcting.**
13. **Cases 13-17 were SPLIT into `tests/dashboard-wedge-fault.test.js`**, exactly as
    the Test Plan's note permits. The reason is stronger than "the modules could not
    be re-required": `menu-screens` requires `task-reconcile` at ITS module load, so
    deleting `task-reconcile` from the require cache mid-file would leave
    `menu-screens` holding the OLD exports object with the REAL `touchesOverlap`
    binding — the injection would silently not reach the code under test, and the
    fault cases would have been green for the wrong reason. In its own file the seam
    needs no cache surgery at all: `task-registry` and `plan-coverage` are required
    first, the stub is installed on the `plan-coverage` exports object, and only THEN
    is `menu-screens` required, so `task-reconcile`'s destructured binding picks the
    stub up on its first and only load. The node test runner gives the file its own
    process, so nothing leaks.
14. **Two report shapes that disk cannot produce are injected at the
    `taskReconcile.reconcileState` boundary.** A wedge entry whose `deps` is absent,
    and a fault object with no `phase` and no `dropped`, cannot arise from any
    on-disk registry — `unsatisfiableTasks` always sets `deps`, and `applyQuarantine`
    always sets all three fault fields. `menu-screens` holds `task-reconcile` as a
    NAMESPACE (not destructured), which is the same rewire seam the module's own
    header documents for `stale-detector`, so the collaborator is replaced at a module
    boundary while the render under test stays real. Deleting these cases instead
    would leave the fail-open branches of a fail-open renderer untested, which is the
    class of code this slice exists to remove.
15. **The dashboard tests use the REAL clock, not an injected one.**
    `buildDashboardTable` passes only `liveAgentIds` to `reconcileState` and has no
    `now` seam. Rather than add one — which would be new production surface existing
    only for a test — the fixtures express every timestamp relative to `Date.now()`
    at seed time (a 200-minute-old `implement` runner is past its 120-minute floor on
    any clock). No test asserts an absolute instant, so none is clock-fragile.
16. **The wedge block renders after the existing orphaned-count line with no blank
    line before `INBOX`.** That matches exactly what the pre-existing orphan line
    already does; adding a separator would have been a cosmetic change to a
    dashboard whose byte-level output several other suites assert.
17. **One ratchet outside the originally-declared `files:` was moved, in the correct
    direction, and `CLAUDE.md` was added to `files:` to declare it.** The documented
    test-file count went 422 → 424, because this slice adds two test files and
    `tests/doc-counts.test.js` verifies that count against disk. It is bookkeeping
    the gate demands as a direct consequence of the change; no threshold was
    lowered. The false-green baseline did NOT need to move: this slice adds no
    silent-catch site, and the gated run confirmed it.

## Execution Record (Steps 8–16)

- [x] **Step 8 TEST (TDD red)** — `tests/dashboard-wedge-reports.test.js` and
  `tests/dashboard-wedge-fault.test.js` created and run BEFORE any source edit:
  `tests 17 / pass 4 / fail 13 / 0 omitted`. The load-bearing red, verbatim from the
  overflow case, was the rendered dashboard itself — for SEVEN permanently wedged
  tasks the entire human-visible output was `TASKS\n  ✗ 7 failed   implement t1`,
  with no reason, no dependency ids, and nothing distinguishing a permanent cycle
  from a one-off failure. That is the defect, reproduced from the human's seat.
- [x] **Step 9 PREPARE** — the landed code was read from disk and it WINS over this
  plan's quotation of it. `applyQuarantine(registry, candidates) → {promote,
  quarantined, faulted}` is present and exported from `src/lib/task-reconcile.js`;
  `reconcileState` is one of its callers and translates `faulted` onto
  `report.quarantineFaulted`. Confirmed shapes: `quarantined` entry `{id, reason,
  summary}` with `reason` one of `staleness-orphan-quarantine` or
  `quarantine-fault`; `quarantineFaulted` `{phase, error, dropped}` with `phase` one
  of `collect` or `filter`, ABSENT (not null) when no fault occurred.
- [x] **Step 10 IMPLEMENT** — `src/lib/menu-screens.js` only (see decision 12 on the
  scheduler-lifecycle plan handover).
- [x] **Step 11 REVIEW** — `report.quarantineFaulted` now has exactly ONE reader:
  `renderWedgeReports`, reached from `buildDashboardTable`, reached from every
  `/ctoc:menu` dashboard render. `report.quarantined` now has a DASHBOARD reader for
  the first time; its only prior readers were the three `menu task` command results.
- [x] **Step 12 OPTIMIZE** — one linear pass, hard cap of 5 per category, no second
  reconcile call.
- [x] **Step 13 SECURE** — every interpolated value passes through `stripCtl`; the two
  free-text fields are bounded at 120 characters; no new regex, no filesystem write.
- [x] **Step 14 VERIFY** — `npm test` (the gated entry point), verbatim:
  `tests 9924`, `suites 1727`, `pass 9924`, `fail 0`, `cancelled 0`, `todo 0`, and
  `skipped 0`; gate line `[CTOC test-gate] coverage 99.02% (threshold 99%),
  skipped 0, failed 0` followed by `[CTOC test-gate] PASS`. The 99 floor was NOT
  touched. Lint clean (`eslint --max-warnings 0`) on all three changed source and
  test files. Reachability and export-reachability fences green. No git operations.
- [x] **Step 15 DOCUMENT** — JavaScript doc on `renderWedgeReports` and
  `WEDGE_REASONS`; the block comment above the reconcile call now states the report
  is kept whole. No CHANGELOG exists in this repository.
- [x] **Step 16 FINAL-REVIEW** — complete. Gate 3 is the human's and was not crossed.

### One finding that is NOT this slice's to fix

The FIRST gated run of this slice failed on `iron-loop-enforcer`'s
`gate-destinations-approved` check, with exactly one offender: this plan file, then
resident in `plans/todo/`. The cause is provenance, not code — the approval ledger
entry `.ctoc/approvals/00075-wedge-reports-get-a-reader.json` records a
`content_sha256` for the plan as it stood at 21:08, and the plan was AMENDED after
that approval (it is now written against the two landed sibling slices). The hash no
longer matches, so `hasLedgerApproval` correctly refuses it. The finding cleared the
moment the plan left `todo/` for `in-progress/` on the ordinary pick-up transition,
and the gated run above is green.

**The ledger was NOT re-hashed and MUST NOT be.** Rewriting a `content_sha256` to
match an amended plan would forge a human approval of text the human never approved,
which is precisely the forgery `plans/done/00012-r3a-ledger-forgery-closed.md`
closed. Recorded here so the reviewer knows the amend-after-approval pattern
temporarily red-flags any plan still resident at a gate destination.
