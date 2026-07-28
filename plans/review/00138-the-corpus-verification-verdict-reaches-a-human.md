---
approved_by: human
approved_at: 2026-07-19T21:33:26.685Z
gate_crossed: implementation → todo
---

---
title: "The corpus verification verdict reaches a human, and the scheduled check has a place to run"
type: implementation
parent_plan: corpus-claim-verification
depends_on: 00137-the-verification-verdict-is-enforced-offline-on-every-build
priority: MEDIUM
program: corpus-quality
iron_loop: true
files:
  - "src/tabs/tools.js"
  - "tests/claim-verdict-surface.test.js"
  - "CLAUDE.md"
---

# The corpus verification verdict reaches a human

> Design derivations live in
> `plans/implementation/00135-guides-declare-their-checkable-claims-and-the-corpus-reports-how-many-it-has.md`.
> The gated-versus-scheduled ruling is in
> `plans/implementation/00137-the-verification-verdict-is-enforced-offline-on-every-build.md`.

## Why this slice exists rather than being "already done"

After `00137`, the verdict is enforced on every build — but the only place a human
meets it is a failing test, which means **the only time anyone learns anything is
when something is already broken.** The numbers that matter between failures — how
many claims are verified, how many sources are unreachable, how much of the corpus
declares nothing at all — exist in a ledger nobody opens.

Operating Lesson 1: *the measure is the human.* A verdict that only appears as a
red build is a verdict a human meets at the worst possible moment and never
otherwise. And Operating Lesson 16: a module is done when a human can **reach**
it.

This slice also closes the gap `00137` names in its own "does not fix" section:
**nothing schedules the verifier.** Without a schedule, the horizon eventually
fails the build for the honest reason that nobody has checked — correct behaviour,
but useless if there is no documented way to make it stop being true.

## Scheduling — what is actually decided here, and what is not

CTOC is a plugin inside the Claude command-line interface. It has **no daemon, no
cron, and no background scheduler of its own**, and it must never spawn a second
Claude (`CLAUDE.md`, and the recorded runtime constraint: no `claude -p`, no
online API calls from plain code).

So this slice does **not** invent a scheduler. It provides the two things that
make scheduling somebody's straightforward choice:

1. **A documented, single, cross-platform command** — `node src/scripts/verify-claims.js` —
   with its exit codes and its expected cadence written down, so it can be wired
   into whatever the project already uses (a continuous-integration schedule, a
   local task runner, a manual weekly habit).
2. **A menu surface** that shows the current verdict and its age, so a human can
   see "last verified 6 days ago, horizon 7" and run it on the spot.

**Which scheduler to use is the human's decision and is deliberately not made
here.** The technical dependency graph is my job; the schedule is his
(`CLAUDE.md`, and Operating Lesson: he alone schedules). See the open question.

## Implementation Details

### Dependency Graph

```
src/lib/claim-ledger.js (00137)  ──readLedger/gateLedger──▶  src/tabs/tools.js (MODIFY)
                                                                     ▲
                                                                     │
                                              tests/claim-verdict-surface.test.js (CREATE)
                                                                     │
CLAUDE.md (MODIFY) ── documents the command, the cadence, the exit codes
```

No cycles. `src/tabs/tools.js` already lives in the dashboard layer and may
require from `src/lib/` — the dependency direction (hooks → commands → lib) is
respected.

### File: `src/tabs/tools.js`
**Action:** MODIFY — add one verdict row and one action
**Purpose:** Put the corpus verdict where a human already looks.

**Read the file before editing it.** The line numbers and the existing row shape
in this section are from planning-time reading and **the code wins** if it has
moved.

- **Add a row** rendering the ledger summary:

  ```
  corpus claims   verified 128  refuted 0  unverifiable 3   last verified 2d ago
  ```

  - **All three counts always render, including the zeros.** `unverifiable` must
    be structurally impossible to omit — the same rule `00137` applies to the
    summary object, carried to the display. A row that hides a zero teaches a
    reader that the absent number is the good number.
  - **When the ledger is ABSENT:** render `never verified — run [N]`, **not** a
    clean row and **not** a blank. Absence is a state with a name.
  - **When the ledger is CORRUPT:** render `unreadable — see [N]`. It must be
    visibly different from both clean and absent. This is the display half of the
    distinction `00137` draws in data, and it is the specific gap
    `src/lib/stale-detector.js:68-73` names about itself:

    > *"NOT WIRED TO THE DASHBOARD YET… This module produces `unreadCount`; no
    > consumer renders it… the menu still renders a PARTIAL scan as a clean one.
    > The data now says otherwise; the display does not yet."*

    **That is an open, named debt in this repository, and this slice must not
    reproduce it for claims.** The honest signal and its display land together.
  - **Age is rendered against the horizon**, so `last verified 6d ago (horizon 7d)`
    reads as the warning it is.

- **Add a menu action** that runs `node src/scripts/verify-claims.js` and reports
  its result. **It runs in the background** and never blocks the terminal
  (`CLAUDE.md`: updates always run in the background; the human never watches a
  spinner). Report the result when it lands.

### File: `tests/claim-verdict-surface.test.js`
**Action:** CREATE
**Purpose:** Prove a human actually sees each state — including the two that a display usually swallows.

| # | Case | Assertion |
|---|---|---|
| 1 | clean fresh ledger renders all three counts | verified/refuted/unverifiable all present, zeros included |
| 2 | **`unverifiable > 0` is VISIBLE in the rendered row** | the count appears in the output string, not only in the data |
| 3 | **ABSENT ledger renders "never verified", NOT a clean row** | assert the clean-row text is absent |
| 4 | **CORRUPT ledger renders "unreadable", distinct from both clean and absent** | three distinct rendered strings for three states |
| 5 | `refuted > 0` renders prominently and names a guide path | |
| 6 | age renders against the horizon; inside/outside produce different text | |
| 7 | **the row renders without a network call** | network primitives patched to throw |
| 8 | **the action is dispatched in the background, not awaited inline** | assert the render path returns before the command completes |
| 9 | rendering degrades rather than throwing on a malformed summary | the dashboard must never crash on a data fault |
| 10 | no absolute path reaches the rendered row | repository-relative only |

Fixtures under `os.tmpdir()`; the real ledger is never written by a test.

### File: `CLAUDE.md`
**Action:** MODIFY — add the scheduling and command documentation
**Purpose:** Make the scheduled half somebody's straightforward choice rather than an unwritten assumption.

Document, concisely and in the existing voice:

- the command, `node src/scripts/verify-claims.js`, cross-platform, no shell;
- its exit codes — `0` clean, non-zero when any claim is `REFUTED`;
- the cadence the horizon expects (default 7 days, so a weekly run with margin);
- that **`npm test` performs no network access** and enforces the ledger only;
- that a stale ledger is a build failure **by design**, and running the command is
  how it is cleared — **never by widening the horizon**. State that plainly, since
  widening the horizon is the cheapest way to make red go green and is exactly the
  move Operating Lesson 14 forbids.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| ledger summary row | `src/tabs/tools.js` render path | **`/ctoc:menu`** — the shipped slash command a human opens |
| run action | `src/tabs/tools.js` action dispatch | `/ctoc:menu` |
| the documented command | run by a human or a project scheduler | `node src/scripts/verify-claims.js` |

This slice is what makes the whole set reachable by a person rather than only by a
test runner. **`src/tabs/tools.js` must not declare a `model:`** — it is not a
slash command, but confirm at Step 11 that nothing added here pins a model
(`tests/slash-command-no-model-pin.test.js` guards the commands themselves).

## Test Plan

Covered by `tests/claim-verdict-surface.test.js`. Load-bearing cases are **2, 3
and 4** — the three states that a display naturally collapses into "looks fine",
and the exact debt `stale-detector.js` documents against itself.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Write `tests/claim-verdict-surface.test.js` in FULL and run ONLY that file first. Record TDD-RED verbatim.
- [x] **Case 4 must be red for the right reason** — confirm that before the change the corrupt-ledger path renders identically to one of the other states, and record that output. That is the defect being fixed, and it must be observed rather than assumed.

### Step 9: PREPARE
- [x] Read `src/tabs/tools.js` in full — the real row shape, the real action-dispatch convention. **The code wins over this plan.**
- [x] Read `src/lib/stale-detector.js:68-73` — the self-documented display debt this slice must not reproduce.
- [x] Read `src/commands/menu.js` and `src/lib/menu-screens.js` for the background-dispatch convention, and follow it rather than inventing one.
- [x] Read `CLAUDE.md`'s Release section on background execution before wiring the action.

### Step 10: IMPLEMENT
- [x] `src/tabs/tools.js` — the summary row (three states rendered distinctly, all counts including zeros, age against the horizon) and the background run action.
- [x] `tests/claim-verdict-surface.test.js` — the ten cases.
- [x] `CLAUDE.md` — the command, exit codes, cadence, and the "clear it by running it, never by widening the horizon" rule.

### Step 11: REVIEW
- [x] Clean, absent and corrupt render as three genuinely distinct strings — read the rendered output, do not infer from the branch.
- [x] `unverifiable` cannot be omitted from the row by any code path.
- [x] The action does not block the render; the terminal stays free.
- [x] Nothing added declares a `model:`.
- [x] **Report whether any OTHER dashboard row renders a degraded signal as a clean one** — `stale-detector.js`'s `unreadCount` is the known instance and is out of scope here, but the inventory is this slice's finding to produce.

### Step 12: OPTIMIZE
- [x] The row costs one ledger read; no corpus walk on the menu hot path. Report the measured render time.
- [x] Reuse the existing cache/memoization convention in the tools tab rather than adding one.

### Step 13: SECURE
- [x] No absolute path in any rendered string (case 10) — an absolute path carries a user name onto a screen.
- [x] Control characters stripped from anything ledger-derived before rendering, mirroring `stripCtlChars` at `src/lib/stale-detector.js:270` — a hostile guide path must not carry escape sequences into the terminal.
- [x] The background action spawns with an argument array, **never a shell string**.
- [x] Ledger read is size-gated; a corrupt ledger degrades the row and never crashes the dashboard (case 9).

### Step 14: VERIFY
- [x] `node --test tests/claim-verdict-surface.test.js` green.
- [x] Full gated run `npm test`; report verbatim counts and coverage.
- [x] **Open the real menu and paste the real row, verbatim, for each of the three ledger states** (clean, absent, corrupt — using temporary copies, restoring after). A rendering test is not proof a human sees it; Operating Lesson 6 requires driving the real flow.
- [x] Confirm the declared entry-point check still passes (`.ctoc/settings.json` `entry_point`, `node src/commands/menu.js`, expecting `CTOC v`).
- [x] Lint `--max-warnings 0`; typecheck clean.

### Step 15: DOCUMENT
- [x] `CLAUDE.md` — the command, cadence, exit codes, the no-network-in-`npm test` statement, and the horizon rule.
- [x] Update documented test-file count in both places, read live from disk.

### Step 16: FINAL-REVIEW
- [x] Report: files, tests, Step 8 red verbatim, **the three real rendered rows**, the Step 11 inventory of other degraded-signal displays, and every decision taken under ambiguity.
- [x] Ready for human review at Gate 3.

---

## What this slice does NOT fix

1. **It does not choose or install a scheduler.** It documents the command and its
   cadence and surfaces the age. Wiring it into a specific runner is the human's
   scheduling decision.
2. **It does not surface `stale-detector.js`'s own `unreadCount`**, which remains
   the named, pre-existing instance of the same display debt. Fixing it is a
   separate change to a separate module and is not bundled here.
3. **It does not make the corpus more correct.** It makes the verdict visible.
4. **A guide that cites a real page and describes it wrongly still passes**, at
   every layer of this mechanism.

## Open question for the human — NOT decided here

**Where should the scheduled run live?** Options exist (a continuous-integration
schedule; a local weekly habit prompted by the menu row; a project task runner),
each with different failure modes — a continuous-integration schedule is reliable
but needs network egress policy; a human habit is free but forgettable, though the
horizon makes forgetting loud rather than silent. **The dependency graph is
settled; the schedule is the human's call**, and the mechanism works under any of
them because the horizon enforces the cadence regardless of who runs it.

## Decisions Taken Under Ambiguity

1. **The display lands with the data, in the same slice.**
   `src/lib/stale-detector.js:68-73` documents, in its own header, a case where an
   honest signal shipped with no consumer and the menu kept rendering a partial
   scan as a clean one. That is a named open debt in this repository. Reproducing
   it for claims — shipping `unverifiable` into a ledger nobody renders — would be
   repeating a mistake this codebase has already written down.
2. **All three counts render always, including zeros.** A row that omits
   `unverifiable 0` trains the reader to treat its absence as good news, so when
   it becomes `unverifiable 12` there is no baseline to notice against. The zero
   is what makes the non-zero legible.
3. **Absent, corrupt and clean are three distinct rendered strings.** Two of them
   collapsing is precisely the false-green shape at the display layer, and a
   display-layer false green is worse than a data-layer one, because the data is
   right and nobody can tell.
4. **No scheduler is invented.** CTOC is a plugin with no daemon and must never
   spawn a second Claude. Shipping a bespoke scheduler would be building
   infrastructure the project deliberately does not have, and the schedule is the
   human's decision regardless.
5. **The run action is backgrounded.** `CLAUDE.md` states that every update runs in
   the background and the human never watches a spinner. A verification pass over
   the corpus is exactly the kind of multi-second network work that must not
   occupy the terminal.
6. **Step 14 requires pasting the three real rendered rows.** A passing render test
   is not evidence a human sees the right thing — Operating Lesson 6 (test the
   human's behaviour, not the structure) and Operating Lesson 1 (the measure is
   the human) both point at driving the real menu and reading the real output.
7. **The horizon must never be widened to clear a stale ledger, and this is written
   into `CLAUDE.md` rather than left to judgment.** Widening it is the cheapest
   possible way to turn red green, it looks reasonable in a diff, and it silently
   destroys the one property that makes a scheduled check trustworthy. Writing the
   rule next to the number is the only place a person will actually meet it.

## Decisions Taken Under Ambiguity (build, 00138)

8. **"last verified" age is the OLDEST (stalest) `lastVerifiedAt` across ledger
   entries, not `generatedAt`.** This is the exact age `gateLedger` measures staleness
   against — the age that actually fails the build — so the row shows the human the
   same number the gate enforces. `generatedAt` (when the run happened) could read
   fresh while an individual claim's verification is stale.
9. **Counts are read straight from `ledger.claims` states via `readLedger` — a single
   read, no corpus walk.** `gateLedger` would give the same summary but requires the
   extracted corpus claims, i.e. a `skills/**` walk on the menu hot path, which Step 12
   forbids. The row therefore counts `VERIFIED`/`REFUTED`/(everything else →
   `UNVERIFIABLE`) directly and defensively (a null/non-object entry counts as
   unverifiable, never throws).
10. **The Doctor verifier action is `[5]`, and the row references `[5]` literally**
    (`never verified — run [5]`, `unreadable — see [5]`) so the pointer in the row
    matches the action a human presses. The action spawns `verify-claims.js` detached
    with an argv array and `stdio:'ignore'`, unref'd, returning immediately.

## Step 11 finding — other dashboard rows that could render a degraded signal as clean

Requested inventory. The one KNOWN unrendered degraded signal remains
`src/lib/stale-detector.js`'s `unreadCount` (a partial plan scan still displays as a
clean one until `inbox.js`/`menu-screens.js` render it) — named by this plan as OUT OF
SCOPE and unchanged here. Beyond it: the background-task plane in
`src/lib/menu-screens.js` already surfaces its own blind spot ("the background task
check DID NOT RUN — the task counts above are unchecked"), so it does NOT render a
degraded signal as clean. The other tabs (`overview.js`, `review.js`, `vision.js`)
render committed plan/state data, not a scan with a partial-read failure mode, so they
have no equivalent silent-degrade path. No NEW instance of the debt was found.
</content>
