---
iron_loop_verdict: true
title: "The completion route records work it never saw start"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/actions.js"
  - "tests/a-completion-says-whether-the-work-was-ever-claimed.test.js"
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-30T19:04:14.746Z
gate_crossed: implementation → todo
---

# The completion route records work it never saw start

## The measurement this plan exists for

The task registry is supposed to be a record of execution. Measured on this repository
today, it is a record of bookkeeping performed around execution that had already
happened by hand.

Read from `.ctoc/state/tasks.json` directly:

| task | plan | created → started → done | elapsed |
|---|---|---|---|
| `t63` | `00128-a-link-inside-the-repository-reaches-outside-it…` | 21:44:58 → 21:45:00 → 21:45:20 | **22 seconds** |
| `t62` | `00103-the-last-mile-check-keeps-opting-itself-out` | 20:58:08 → 20:58:10 → 20:58:14 | **6 seconds** |
| `t61` | `00102-git-exclusivity-is-undefended-where-work-actually-starts` | 20:48:45 → 20:48:47 → 20:48:51 | **6 seconds** |

`t63` covers four files — `real-path-confinement.js`, its test, `plan-coverage.js` and
`PreToolUse.Edit.js` — through a full Iron Loop slice. **Twenty-two seconds is not the
duration of that build. It is the duration of writing down that the build happened.**

The registry totals measured at planning time: **64** records, **59** `done`, **4**
`queued`, **1** `cancelled`, **zero** `running`, **zero** `cancelling`. `00129` measured
63 records a day earlier; one further `done` record had appeared since, which is itself
evidence that the pattern continued rather than stopped. **These are planning-time
numbers; Step 9 re-measures them verbatim before any code is written — the registry has
almost certainly moved again since.**

The integrity defects `00129` found were re-confirmed: `t60` carries `plan: "--plan"` —
a command-line flag where a plan slug belongs — with `ts.started: null`, and it is not
alone in lacking a start timestamp.

**A record that says `done` for work it never saw start is not a record of execution.
It is a record of intent, written after the fact, because no task existed while the
work was happening.**

## What this plan changes, and what it deliberately does not

The obvious move is to make the completion route REFUSE a plan that was never claimed,
so the absence surfaces at the end rather than never.

**That would be an outage.** At planning time every completion is unclaimed — the
building set is empty, measured. A refusal whose ordinary case is denial is not a
stricter check; it stops the work. `00129` reached exactly this conclusion about a
permission narrowing and blocked itself over it rather than shipping. The same reasoning
applies here and the same conclusion follows.

**So the completion route stops FABRICATING and starts REPORTING, without refusing
anything.** Concretely: it establishes whether a genuine prior claim existed, it says
so in its returned result and in what a machine consumer sees, and it never presents an
after-the-fact record as a record of execution.

This makes a missing claim **impossible to ignore** rather than impossible to make. It
is the backstop under `00166`, and it is deliberately **independent of it** — buildable
today, whatever `00165` reports about whether the dispatch hook runs at all. If the
mechanical seat turns out to be dead, this is what remains, and it is real code on a
route that certainly executes.

## Why this route is guaranteed to run, when the dispatch seat is not

`completeTaskPlan` (`actions.js:1275-1326`) is the real completion for a scheduler
task's plan. Its live call site is the menu's `task complete` route — `taskComplete` in
`src/lib/menu-screens.js` (`:2337`), which calls `completeTaskPlan` at `:2374-2375`. It
is the wrapper that runs `completeExecution` (`:1017`), the only producer of the Gate 3
verify evidence. It is what has been writing the completion half of every record in the
table above.

That is the whole argument for seating a check here: **this code demonstrably ran, 59
times.** The dispatch hook, by contrast, has left no evidence of ever running — the
subject of `00165`.

## The claim witness, and what counts as one

`completeTaskPlan` receives a plan slug. Before completing, it establishes whether that
plan was ever genuinely claimed, and reports one of three answers:

| witness | meaning | how it is reached |
|---|---|---|
| `claimed` | a task for this plan reached a running state, and the record shows it | the registry holds an `implement` task naming this slug whose `ts.started` is a real instant that PRECEDES this completion |
| `unclaimed` | the registry was read successfully and holds no evidence this plan was ever started | no such task, or a task whose `ts.started` is null |
| `unreadable` | the registry could not be read, so nothing is known | `task-registry.load` reported corruption (its `unreadable` flag), or the `load` call itself threw |

The three never collapse into two. `unreadable` reporting as `unclaimed` would be the
same false-green inversion this repository fences — the unread instrument answering as
if it had been read.

**The distinction already exists in the current `load`, so this plan CONSUMES it rather
than adding it.** `task-registry.load` (`task-registry.js:395`) fails open to empty by
design, which is correct for navigation, but it now DISTINGUISHES the two empties: on a
read/parse THROW it returns `{ ...loadedEmpty(), unreadable: true, reason }` (`:415`);
an absent or genuinely-empty registry returns `loadedEmpty()` without that flag
(`:404`). `state.getAgentStatus` already turns exactly this flag into its third state
(`state.js:327-329`) — this plan mirrors that established pattern. **The one gap the
executor must respect:** a file that PARSES as JSON but has a wrong shape or version
returns empty WITHOUT the `unreadable` flag (`:417-420`), so it reads as `unclaimed`.
The fence's corrupt-registry case (case 6) must therefore write genuinely unparseable
bytes to reach the `unreadable` verdict. And `load` THROWS a `TypeError` on a bad `root`
(`:396-398`), so `claimWitness` wraps the call in try/catch → `unreadable`, exactly as
`getAgentStatus` does (`state.js:314-320`).

### The floor, and why there is one

A record whose `created`, `started` and `done` fall inside a few seconds of one another
was not observed by the registry; it was written around work already finished. But a
threshold is a heuristic, and a heuristic reported as a fact is exactly what this plan
objects to.

**So the elapsed time is REPORTED as a measured number, never as a verdict.** The
result carries the actual interval, and the human-facing text states it. A separate,
clearly-named advisory flag marks an interval below the floor as implausible for a
full Iron Loop slice. **The witness itself is decided by `ts.started` being a real
instant that precedes the completion — a structural fact — not by the interval.** The
interval informs the reader; it does not decide the answer.

The floor's value is chosen at Step 9 from the measured distribution and recorded with
its justification. Planning's measurement — 22, 6 and 6 seconds against genuine slices
that took much longer — is the evidence, not the threshold.

## Implementation Details

### Dependency graph

```
src/lib/actions.js  [MODIFY — completeTaskPlan gains a witness; no new module]
  └─already requires→ src/lib/task-registry.js   [existing, unchanged; required at :31]

src/lib/menu-screens.js ──already calls→ actions.completeTaskPlan   [UNCHANGED — no edit]
```

No new module and no new edge. `actions.js` already requires `task-registry` at the top
of the file (`:31`), so there is no lazy-require question and no cycle risk. Step 11
confirms that by reading the require graph.

**`src/lib/menu-screens.js` is NOT declared and NOT modified.** The wiring already
exists: the menu calls `completeTaskPlan` (`:2374-2375`) and passes its whole result
through as `res.completion` on the returned object (`:2503`), so a new field on that
result reaches the machine consumer through the existing call site. **What was an open
Step 9 question is now measured (see Step 9 measurement 4): the menu's human-facing
`text` string is built from PICKED fields (`completion.ran`, `completion.newPath`,
`completion.verify.passed`, `:2480-2491`) and does NOT include the witness. So the
witness reaches `res.completion.witness` — a machine consumer, the returned JSON — but
NOT the terminal text line a person reads.** Surfacing it in the human text is a
one-line edit to `menu-screens.js:2480-2491`, deliberately OUT of this slice's declared
files; Step 16 reports that the finding is recorded but not yet human-visible in the
text. Shipping a field nobody's tooling reads would be dead code with a certificate; a
field carried on the returned result and consumable by the machine is not.

### File: `src/lib/actions.js`
**Action:** MODIFY — one addition to `completeTaskPlan`; no other function touched

**LINE NUMBERS ARE A NAVIGATION AID, verified against the current tree at rebase but
still subject to drift.** `completeTaskPlan` is at `:1275-1326`; its guard is
`classifyCompletionFault` at `:1251-1273` (00131) which wraps `isSafePlanSlug` at
`:1218-1222`; `completeExecution` is at `:1017`; `taskSpecFromPlan` at `:1592`. Other
plans have edited this file recently. **Read live at Step 9 and let the code win.**

`completeTaskPlan`'s CURRENT return shapes — there are FOUR, and 00131 added the `fault`
field to all of them; the witness goes on EVERY one:

1. `{ ran: false, fault, reason }` — the `classifyCompletionFault` early return
   (`:1282-1284`): covers an unsafe/pathlike slug (`fault:'caller'`) AND a task naming
   no plan (`fault:null, reason:'task carries no plan'`).
2. `{ ran: false, fault: null, reason }` — no plan file in `in-progress/` or `review/`
   (`:1303`).
3. `{ ran: true, fault: null, blocked: true, stage, newPath: null, errors, reason }` —
   pre-review validation failed (`:1308-1316`).
4. `{ ran: true, fault: null, blocked: false, stage, newPath, verify }` — success
   (`:1318-1325`).

Add:

- `claimWitness(root, slug, opts)` → `{ witness, startedAt, elapsedMs, implausible, taskId }`
  - `witness` is `'claimed' | 'unclaimed' | 'unreadable'`.
  - `startedAt` is the ISO instant or `null`; `elapsedMs` is the measured interval or
    `null`; `implausible` is the advisory boolean; `taskId` names the record consulted
    (`null` when none).
  - Reads the registry via `taskRegistry.load(root)` wrapped in try/catch; consumes
    `registry.unreadable` for the `'unreadable'` verdict, matching `getAgentStatus`.
  - Matches the slug against `implement` tasks' `plan` STRING field — it NEVER joins the
    slug into a filesystem path, so it cannot become a path oracle for a crafted slug.
  - **Never throws.** A registry fault or a bad `root` yields `'unreadable'`, never
    `'unclaimed'`.
  - Exported, because a witness nobody else can ask about is a witness that cannot be
    surfaced elsewhere later — AND because the seventeen cases distinguish its own
    return fields (`startedAt`, `elapsedMs`, `implausible`) from the witness carried on
    the completion result. **Exporting it is fence-safe:** `completeTaskPlan` calls it in
    the same file, so it is LIVE via the same intra-file code edge that keeps
    `completeExecution` live (`tests/export-reachability.test.js:244-262,441-463`); a
    test is never a caller, but a live sibling in the same module is.

- `completeTaskPlan` computes the witness at the TOP, before `completeExecution` mutates
  the task (the coupling settles the running task to `done` at `:1108-1117`; the witness
  must reflect the pre-completion state and measure elapsed against the completion
  moment). It adds the result to **every** return shape above. On the two
  `classifyCompletionFault` early-return paths — where the slug is unsafe or absent and
  the completion is not proceeding — the witness is a FIXED `unclaimed` (`startedAt:null,
  elapsedMs:null, implausible:false, taskId:null`) attached WITHOUT reading the registry,
  so a crafted slug drives no filesystem read and the refusal still fires first (Step
  13). On the three proceeding shapes the witness is the computed `claimWitness` result.
  A completion that reports a witness on only one path teaches a reader the field is
  sometimes absent and therefore ignorable.

**What does NOT change:** no refusal, no new denial, no change to whether a completion
runs, no change to the plan move, no change to the verify evidence, no change to
`completeExecution`, no change to `classifyCompletionFault`/`isSafePlanSlug`, and no
change to any existing field on any return shape. **This is an additive, verdict-neutral
change and Step 14 must verify it as one.**

### File: `tests/a-completion-says-whether-the-work-was-ever-claimed.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, no shell. Registry fixtures minted with the real
`task-registry`, plan fixtures written as real plan files — never hand-built JSON,
which drifts from the schema the moment the schema moves.

| # | Case | Assertion |
|---|---|---|
| 1 | **the defect** — complete a plan with no task in the registry at all | `witness === 'unclaimed'`; the completion **still runs** and still produces its evidence |
| 2 | **the honest case** — a task with a real `ts.started` well before completion | `witness === 'claimed'`; `startedAt` and `elapsedMs` are the real values |
| 3 | **the measured shape** — a task created/started/done inside 22 seconds, mirroring `t63` | `implausible === true`, and `elapsedMs` is the MEASURED number, not a bucket |
| 4 | **`implausible` does not decide the witness** — the same fixture | `witness === 'claimed'`, because `ts.started` is structurally real. The advisory is advice |
| 5 | **a null start is not a claim** — a `done` task with `ts.started: null`, the real shape of six existing records | `witness === 'unclaimed'` |
| 6 | **THE FENCE** — a registry file of genuinely unparseable bytes (so `load` sets `unreadable`) | `witness === 'unreadable'`, **never `'unclaimed'`**; no throw |
| 7 | **an empty registry is `unclaimed`, not `unreadable`** | the two states never collapse |
| 8 | **a malformed plan field is not a witness** — a task carrying `plan: "--plan"`, the real `t60` shape | `witness === 'unclaimed'` for the plan actually being completed; no throw |
| 9 | **a task for a DIFFERENT plan is not a witness** | `unclaimed` |
| 10 | **a task of a different kind is not a witness** — a `review` task naming the slug | `unclaimed` |
| 11 | **witness on the not-found path** — completing a slug with no plan file | the `ran: false, fault: null` return still carries a witness field |
| 12 | **witness on the blocked path** — a plan that fails pre-review validation | the `ran: true, blocked: true` return still carries a witness field |
| 13 | **witness on the success path** | present, alongside every field that is there today |
| 14 | **VERDICT-NEUTRALITY** — the same fixtures before and after the change | every existing field of every return shape (`ran`, `fault`, `blocked`, `stage`, `newPath`, `verify`, `errors`, `reason`) is IDENTICAL; whether the completion ran, was blocked, or moved the plan is unchanged in every case. **This is the whole safety argument** |
| 15 | **never throws** — `root` a file, empty string, `null`; slug `null`, `''`, `'../../etc/passwd'`, NUL-bearing | a result is returned for each; no throw; the caller-fault refusal (`fault:'caller'`) is unchanged and its witness is the fixed `unclaimed` (no registry read for a crafted slug) |
| 16 | **no leak** — a registry whose task carries an absolute path and a newline in its fields | the returned text carries no absolute path, no stack trace, no forged line |
| 17 | **the fence is not vacuous** — case 1's assertion applied to case 2's fixture | FAILS, proving case 1 discriminates on a real absence |

Cases 6, 7 and 14 are the plan. Case 14 is what permits shipping this while the
building set is empty; case 17 guards against a test that passes against anything.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `claimWitness` | `completeTaskPlan`, same file (`:1275`) | — (intra-file code edge; fence-live) |
| the witness on the result | `menu-screens` `task complete` route: `completeTaskPlan` at `:2374`, result passed through as `res.completion` at `:2503` — **already wired, not edited here** | the machine consumer (returned JSON), on every completion |
| the test file | the suite | `npm test` |

`claimWitness` is reachable from a live production caller, not only a test. **Measured
(Step 9 measurement 4, now confirmed): the witness reaches `res.completion.witness`, but
NOT the human-facing `text` line, which the menu builds from picked fields.** So this
change is machine-consumable today and recorded; making it appear in the person's
terminal is a follow-up edit to `menu-screens.js`, out of this slice's scope, and Step 16
says so plainly rather than claiming a human-text surfacing that does not happen.

## A correction to the record: what `.ctoc/state/agent.json` actually controls

The commissioning report says the agent state file claims a plan is active whose task
finished days ago. **The file's contents are exactly as described** — verified by
reading it:

```json
{ "active": true, "plan": "00071-fg1-false-green-fence", "step": 8,
  "phase": "TEST", "task": "Starting implementation",
  "startedAt": "2026-07-18T13:23:02.265Z", "updatedAt": "2026-07-18T13:23:02.265Z" }
```

**But that file does not decide anything.** `state.getAgentStatus`
(`state.js:309-370`) derives liveness from the REGISTRY — `status === 'running' &&
kind === 'implement'` (`:330-336`) — and returns `{ active: false }` when there are
none, which was the case at planning time. Only after that does it read `agent.json`,
and only for supplementary detail (step, phase, task; `:338-357`). The code's own
comment says so: *"Supplementary detail for the dashboard (never authoritative for
liveness)."*

**So the dashboard does not currently claim a build is active.** The stale file is a
real artifact and a real smell, and it has one real consequence: the moment a genuine
claim exists again, the dashboard will show that claim's plan alongside `step: 8`,
`phase: TEST`, `task: "Starting implementation"` **from days ago**, because those fields
come from the stale file. That is a defect worth fixing and it is **not fixed here** —
this plan does not declare `state.js` and does not touch the file.

The correction stands on its own: **where the code disagrees with the report, the code
wins.** The report's conclusion — that the state is stale and nobody cleans it — is
right. Its implication — that the file is authoritative — is not.

## What this does NOT fix

1. **It does not make anything claim its work.** That is `00166`, and `00166` is gated
   on whether its seat runs at all. This plan makes the absence visible; it does not
   fill it.
2. **It does not refuse an unclaimed completion**, deliberately. Today every completion
   is unclaimed, so refusing would stop the build. When the dispatch seat is proven
   live and the ordinary case is a real claim, refusal becomes a safe follow-up — and
   that is a decision for the human to schedule, not a phase this plan declares.
3. **It does not repair the existing records.** The `done` records with no start
   timestamp and the one carrying `"--plan"` are reported, not rewritten. Repairing them
   inside the route that consults them would mean a check editing its own instrument.
4. **It does not clean `.ctoc/state/agent.json`**, and it does not touch `state.js`.
   See the correction above for what that file does and does not control.
5. **It does not narrow the write surface.** `00129` Part B stays blocked. No allow or
   deny for any edit changes.
6. **It cannot tell an honest fast build from an after-the-fact record.** The
   `implausible` flag is an advisory over a measured interval, and it is reported as
   exactly that. A genuinely quick slice reads implausible; a slow fabrication does
   not.
7. **It does not surface the witness in the human-facing menu text.** Measured at
   rebase: the menu passes the witness through as `res.completion.witness` (machine-
   reachable) but its terminal `text` line is built from picked fields. The person does
   not see it in the text until `menu-screens.js:2480-2491` is edited — a follow-up out
   of this slice — and Step 16 reports that.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/a-completion-says-whether-the-work-was-ever-claimed.test.js` in full and
run **only that file, before touching `src/`**. Record the starting state verbatim.

- **Cases 1-13 and 15-16 must be RED** — no witness exists on any return shape today.
- **Case 14 must be GREEN already** and must stay green: it asserts today's return
  shapes (`ran`, `fault`, `blocked`, `stage`, `newPath`, `verify`, `errors`, `reason`)
  against today's code. It is the proof this change is additive, and if it is red at
  Step 8 the fixtures are wrong, not the code. **Record its green explicitly.** (A test
  passing before the implementation exists is normally a finding — here it is the
  DELIBERATE verdict-neutrality control, accounted for, not banked.)
- **Case 17 must FAIL as designed**; record that it does, or case 1 is not
  discriminating.

### Step 9: PREPARE

Read from disk, in full, and let the code win: `src/lib/actions.js` —
`completeTaskPlan` (`:1275-1326`), `classifyCompletionFault` (`:1251-1273`),
`isSafePlanSlug` (`:1218-1222`), `completeExecution` (`:1017`) — **confirm the four
return shapes above have not moved and stop and ask if they have**;
`src/lib/task-registry.js` — `load` (`:395`), confirming the `unreadable` flag is set on
a read/parse throw (`:415`) and NOT on a shape/version mismatch (`:417-420`);
`src/lib/state.js:309-370` (the liveness doctrine and the `getAgentStatus` unreadable
pattern to mirror, for the correction above); `src/lib/menu-screens.js` **READ ONLY — do
not modify it; confirm `taskComplete` (`:2337`) still calls `completeTaskPlan` (`:2374`)
and passes its result through as `res.completion` (`:2503`), and stop and ask if that
shape has changed**.

Then measure, and **report before any code is written**:

1. **Re-measure the registry**: total records, counts by status, `done` records with
   `ts.started === null`, records whose `plan` is not a plan slug. Planning measured
   64 / 59 done / 4 queued / 1 cancelled / **0 running** / **0 cancelling**, with `t60`
   carrying `"--plan"`. **Report the current numbers verbatim** — the registry has moved
   since planning.
2. **Measure the created→done interval for every `done` record** and report the
   distribution. **The floor for `implausible` is chosen from this measurement and
   recorded with its justification** — not copied from this plan, which deliberately
   names none.
3. **Confirm the corrupt-vs-empty distinction at this call site.** This is now expected
   to be AFFIRMATIVE: `load` exposes `unreadable` on a read/parse throw (`:415`) and
   `getAgentStatus` already consumes it. Confirm the shape/version-mismatch path
   (`:417-420`) reads as empty (→ `unclaimed`), so the fence fixture uses unparseable
   bytes. **Do NOT change `load`'s fail-open contract**, which the navigation plane
   depends on.
4. **Does the menu RENDER the completion result, or pick fields from it?** Measured at
   rebase and to be re-confirmed live: the human-facing `text` is built from picked
   fields (`:2480-2491`) and does NOT include the witness, but the whole `completion` is
   passed through as `res.completion` (`:2503`). So the witness reaches the machine
   consumer (`res.completion.witness`) but not the human text line. **Report which,
   plainly**, and confirm the pass-through still holds.
5. Confirm `plans/in-progress/` is still empty (planning measured zero) — the reason
   refusal is not shipped. If it is NOT empty, report the running set.

### Step 10: IMPLEMENT
One step, files as sub-items.

- `src/lib/actions.js` — `claimWitness` (three states that never collapse, never throws,
  wraps `load` in try/catch and consumes `registry.unreadable`, never joins the slug
  into a path, exported and added to `module.exports` at `:2337`); `completeTaskPlan`
  computes the witness at the top before `completeExecution` runs and carries it on
  **every** return shape (fixed `unclaimed` on the two `classifyCompletionFault`
  early-returns, computed on the three proceeding shapes); no refusal, no verdict change.
- `tests/a-completion-says-whether-the-work-was-ever-claimed.test.js` — the seventeen
  cases.

### Step 11: REVIEW
Confirm there is exactly ONE encoding of the claim witness and no second copy anywhere
in `actions.js`. Confirm **no code path can return `'unclaimed'` from a guarded read
failure** — read the diff, do not infer it from the tests. Confirm the witness is
present on all FOUR return shapes without exception. Confirm no allow/deny, no move, and
no validation logic was touched. Confirm `completeExecution`, `classifyCompletionFault`,
`isSafePlanSlug` and `taskSpecFromPlan` signatures are unchanged. Confirm the witness is
computed BEFORE `completeExecution` mutates the task. **Confirm by reading the require
graph that no new edge and no cycle was introduced** (`task-registry` is already required
at `:31`).

### Step 12: OPTIMIZE
`completeExecution` loads the registry INTERNALLY via `taskRegistry.withRegistry`
(`:1090`) and does not expose that value to `completeTaskPlan`, so `claimWitness`
necessarily performs its OWN single `load`. Confirm `claimWitness` loads at most ONCE per
completion and that this is the only added read. One extra read of `tasks.json` on a
human-triggered completion (never a hot path) is acceptable; do not attempt to thread the
encapsulated `withRegistry` value out of `completeExecution`. Confirm nothing new runs on
any path other than a completion. Record the before-and-after timing.

### Step 13: SECURE
- Confirm a hostile registry cannot inject text: a task whose `plan`, `label` or
  `result.summary` carries a newline, a terminal escape, `%s`, and a
  10,000-character string. The witness surfaces a fixed-vocabulary state, a bounded
  identifier, and numbers.
- Confirm the witness leaks no absolute path, no plan file contents, no stack trace.
- Confirm the existing caller-fault refusal (`classifyCompletionFault` at `:1281-1284`)
  still fires **first**, and that on the `fault:'caller'` path the witness is the fixed
  `unclaimed` attached WITHOUT any registry read — so a crafted slug drives no
  filesystem access and the witness never becomes a path oracle. Confirm `claimWitness`
  string-matches the slug against registry `task.plan` values and never joins it into a
  path.
- Confirm every fault path returns rather than throws: absent registry, corrupt
  registry, unreadable registry, `load` throwing on a bad `root`, absent plans
  directory, unreadable plan file.

### Step 14: VERIFY
Targeted run first: the new test file, `tests/actions-scheduler.test.js`,
`tests/task-registry.test.js`, `tests/task-reconcile.test.js`,
`tests/e2e-menu-lifecycle.test.js`, `tests/e2e-enforcement-and-gates.test.js`,
`tests/architecture-invariants.test.js`, `tests/export-reachability.test.js`,
`tests/false-green-fence.test.js`, plus whatever Step 9 finds covering
`completeTaskPlan`. (The frontmatter declares only `src/lib/actions.js` and the new test
file. **No CLAUDE.md edit is needed**: since plan 00215 the test-file count is a GROWING
tally generated by `release.js` and cross-checked against a live disk walk
[`doc-counts.test.js` GROWING_ROWS; `readme-numbers.test.js` `>=65` floor], so adding a
`.test.js` never breaks a count test, and this plan adds no new `src/lib` module.)

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be lowered.
Lint every changed JavaScript file at `--max-warnings 0`.

Then prove it **the way a machine consumer would**: complete a real plan through the
menu's `task complete` route and **read `res.completion.witness`.** It must say whether
the work was ever claimed. Given the measurement it should say `unclaimed` — and that is
a PASS of this plan: the backstop correctly reporting that the dispatch path recorded
nothing. Then complete a plan that WAS claimed (start it through the menu's start route
first) and confirm the witness reads `claimed` with a real elapsed time. **No git
operations.**

### Step 15: DOCUMENT
A comment at `claimWitness` recording: why three states and why `unreadable` must never
render as `unclaimed`; that it consumes `load`'s `unreadable` flag and mirrors
`getAgentStatus`; why the witness is decided by a structural fact (`ts.started` is a real
instant) and NOT by the elapsed interval; why the interval is reported as a measured
number with an advisory flag rather than as a verdict; and the measurement that motivated
it — `t63` at 22 seconds for a four-file slice, `t62` and `t61` at 6.

A comment at `completeTaskPlan` recording why this route REPORTS rather than REFUSES:
that the ordinary case today is unclaimed, so refusal would be an outage, and that
refusal becomes safe only once the dispatch seat is proven live — a decision for the
human, not a phase this plan schedules.

### Step 16: FINAL-REVIEW
Report, in this order:

1. The Step 9 registry measurement verbatim, and the elapsed-time distribution, with
   the chosen floor and its justification.
2. The Step 8 verbatim reds, **case 14's green** (the verdict-neutrality proof), and
   case 17's designed failure.
3. What the completion actually reported (`res.completion.witness`) when run by hand at
   Step 14, for a claimed plan and an unclaimed one.
4. **Whether the witness reaches a human**, per Step 9 measurement 4 — and since the
   menu builds its text from picked fields, say plainly that the witness reaches the
   machine consumer (`res.completion.witness`) but not yet the human-facing text line.
5. The seven things this does NOT fix, the unfilled claim first.
6. The correction about `.ctoc/state/agent.json` — that its contents are stale as
   reported, but that it does not decide liveness and the dashboard does not currently
   claim an active build.
7. Every decision taken under ambiguity.

## Ordering and file conflicts

**This plan has no dependencies and is buildable today**, independent of `00165` and
`00166`. It is deliberately the one piece of this set that does not rest on the
dispatch hook running.

Plans build **sequentially** (one at a time on a shared tree), so there is no
concurrent-edit hazard. This plan declares `src/lib/actions.js` and the new test file;
it **reads** `src/lib/menu-screens.js` at Step 9 and must not modify it — if that file's
call to `completeTaskPlan` (`:2374`) or its `res.completion` pass-through (`:2503`) has
changed shape, **stop and ask**. `src/lib/actions.js` is also declared by other plans in
this repository's set (`00166` reads it, `00145` declares it); the executor must read
live at Step 9 rather than trusting any line number in this plan.

## Decisions Taken Under Ambiguity

1. **The completion route REPORTS rather than REFUSES.** Refusal was the candidate
   named in the ruling, and it was weighed and rejected for today: every completion is
   currently unclaimed, so refusing would deny the ordinary case and stop the build —
   the identical trap `00129` blocked itself over. Refusal becomes correct once a real
   claim is the ordinary case; **when to make that change is the human's decision, not
   this plan's.**
2. **The witness is decided by a structural fact, never by a threshold.** `ts.started`
   being a real instant that precedes the completion is checkable and not a matter of
   degree. Deciding `claimed` from an elapsed-time heuristic would replace a fabricated
   record with a guessed verdict.
3. **The elapsed interval is reported as a measured number with a clearly-named
   advisory flag.** Reporting a heuristic as a fact is the defect this plan objects to;
   suppressing the number entirely would hide the single most legible piece of evidence
   a reader has.
4. **The floor's value is chosen at Step 9 from the measured distribution and is
   deliberately NOT named here.** Planning measured three intervals; three points do
   not justify a constant, and a number written into a plan without its evidence is an
   estimate wearing the clothes of a fact.
5. **Three witness states, and `unreadable` never folds into `unclaimed`.** The
   registry's `load` fails open to empty by design, which is right for navigation and
   wrong as an input to a verdict: an empty answer from an unread instrument is this
   repository's documented false-green class.
6. **The distinction is CONSUMED from `load`, not added by changing its contract.**
   Verified at rebase: `load` already flags a read/parse throw with `unreadable: true`
   (`task-registry.js:415`) and `getAgentStatus` already consumes it
   (`state.js:327-329`). `claimWitness` mirrors that pattern and wraps `load` in
   try/catch for the bad-`root` throw. `load`'s fail-open contract is untouched, because
   the navigation plane depends on it.
7. **The witness appears on all FOUR return shapes**, including the two
   `classifyCompletionFault` `ran:false` paths and the `blocked:true` path. A field
   present on only the success path teaches a reader it is optional and therefore
   ignorable. On the caller-fault path the witness is a fixed `unclaimed` attached
   without a registry read, so a crafted slug drives no filesystem access.
8. **`menu-screens.js` is read but not modified**, and the reason is now the declared
   scope, not a concurrent executor (plans build sequentially). The wiring already
   exists: the witness reaches the machine consumer through `res.completion` (`:2503`).
   Measured at rebase, the human-facing `text` is built from picked fields (`:2480-2491`)
   and does not include the witness, so surfacing it in the person's terminal is a
   one-line follow-up out of this slice; Step 16 reports the truth rather than assuming
   the favourable case.
9. **The report's claim about `.ctoc/state/agent.json` is CORRECTED, not repeated.**
   The file's contents are stale exactly as described (verified byte-for-byte), but
   `state.getAgentStatus` derives liveness from the registry and treats the file as
   supplementary detail only (`state.js:338-357`), so the dashboard does not currently
   claim an active build. The code wins over the report. The real consequence — stale
   step/phase detail surfacing beside the next genuine claim — is named and left unfixed
   here.
10. **The existing records are reported, not repaired.** Repairing them inside the route
    that consults them would mean a check editing its own instrument, and their
    disposition is a decision already before the human.
11. **The planning-time registry count (64) is stated with its value and its measurement
    date, not carried forward as a fact.** Step 9 re-measures verbatim, because a repair
    that carries a wrong number forward is a repair nobody can check.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
