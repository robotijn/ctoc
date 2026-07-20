---
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

The registry totals, measured: **64** records, **59** `done`, **4** `queued`, **1**
`cancelled`, **zero** `running`, **zero** `cancelling`. `00129` measured 63 records a
day earlier; one further `done` record has appeared since, which is itself evidence
that the pattern continued rather than stopped.

The integrity defects `00129` found are still there and were re-confirmed: `t60`
carries `plan: "--plan"` — a command-line flag where a plan slug belongs — with
`ts.started: null`, and it is not alone in lacking a start timestamp.

**A record that says `done` for work it never saw start is not a record of execution.
It is a record of intent, written after the fact, because no task existed while the
work was happening.**

## What this plan changes, and what it deliberately does not

The obvious move is to make the completion route REFUSE a plan that was never claimed,
so the absence surfaces at the end rather than never.

**That would be an outage.** Today every completion is unclaimed — the building set is
empty, measured. A refusal whose ordinary case is denial is not a stricter check; it
stops the work. `00129` reached exactly this conclusion about a permission narrowing
and blocked itself over it rather than shipping. The same reasoning applies here and
the same conclusion follows.

**So the completion route stops FABRICATING and starts REPORTING, without refusing
anything.** Concretely: it establishes whether a genuine prior claim existed, it says
so in its returned result and in what a human sees, and it never presents an
after-the-fact record as a record of execution.

This makes a missing claim **impossible to ignore** rather than impossible to make. It
is the backstop under `00166`, and it is deliberately **independent of it** — buildable
today, whatever `00165` reports about whether the dispatch hook runs at all. If the
mechanical seat turns out to be dead, this is what remains, and it is real code on a
route that certainly executes.

## Why this route is guaranteed to run, when the dispatch seat is not

`completeTaskPlan` (`actions.js:1055-1101`) is the real completion for a scheduler
task's plan. Its live call site is the menu's `task complete` route in
`src/lib/menu-screens.js` (`:2213-2215`), and it is the only producer of the Gate 3
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
| `claimed` | a task for this plan reached a running state, and the record shows it | the registry holds a task naming this slug whose `ts.started` is a real instant that PRECEDES this completion by more than a floor |
| `unclaimed` | the registry was read successfully and holds no evidence this plan was ever started | no such task, or a task whose `ts.started` is null |
| `unreadable` | the registry could not be read, so nothing is known | `task-registry.load` reported corruption, or the read threw |

The three never collapse into two. `unreadable` reporting as `unclaimed` would be the
same false-green inversion this repository fences — the unread instrument answering as
if it had been read. `task-registry.load` fails open to empty by design
(`task-registry.js:74`), which is correct for navigation and **wrong as an input to a
verdict**: an empty result must be distinguishable from a corrupt one here, and Step 9
establishes whether `load` exposes that distinction. **If it does not, this plan adds
the distinction at its own call site rather than changing `load`'s contract**, which
the navigation plane depends on.

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
interval informs the human; it does not decide the answer.

The floor's value is chosen at Step 9 from the measured distribution and recorded with
its justification. Planning's measurement — 22, 6 and 6 seconds against genuine slices
that took much longer — is the evidence, not the threshold.

## Implementation Details

### Dependency graph

```
src/lib/actions.js  [MODIFY — completeTaskPlan gains a witness; no new module]
  └─already requires→ src/lib/task-registry.js   [existing, unchanged]

src/lib/menu-screens.js ──already calls→ actions.completeTaskPlan   [UNCHANGED — no edit]
```

No new module and no new edge. `actions.js` already requires `task-registry` at the top
of the file, so there is no lazy-require question and no cycle risk. Step 11 confirms
that by reading the require graph.

**`src/lib/menu-screens.js` is NOT declared and NOT modified** — a concurrent executor
is finishing a slice that touches it. The wiring already exists: the menu calls
`completeTaskPlan` and renders its result, so a new field on that result reaches the
human through the existing call site. **Step 9 confirms the menu renders the result
rather than a hand-picked subset of its fields; if it picks fields, the human-facing
surfacing must wait for that file to be free, and Step 16 reports that the finding is
recorded but not yet visible.** Shipping a field nobody sees would be dead code with a
certificate.

### File: `src/lib/actions.js`
**Action:** MODIFY — one addition to `completeTaskPlan`; no other function touched

**LINE NUMBERS ARE A NAVIGATION AID ONLY.** `completeTaskPlan` begins at `:1055` and
returns at `:1094-1100`; `isSafePlanSlug` is at `:1049-1053`; `taskSpecFromPlan` at
`:1332`. Another plan in this set reads this file and other plans have edited it
recently. **Read live at Step 9 and let the code win.**

Add:

- `claimWitness(root, slug, opts)` → `{ witness, startedAt, elapsedMs, implausible, taskId }`
  - `witness` is `'claimed' | 'unclaimed' | 'unreadable'`.
  - `startedAt` is the ISO instant or `null`; `elapsedMs` is the measured interval or
    `null`; `implausible` is the advisory boolean; `taskId` names the record consulted.
  - **Never throws.** A registry fault yields `'unreadable'`, never `'unclaimed'`.
  - Exported, because a witness nobody else can ask about is a witness that cannot be
    surfaced elsewhere later.

- `completeTaskPlan` consults it and adds the result to **every** return shape it
  already has — the `ran: false` early returns, the `blocked: true` return, and the
  success return. A completion that reports a witness on only one path teaches a reader
  the field is sometimes absent and therefore ignorable.

**What does NOT change:** no refusal, no new denial, no change to whether a completion
runs, no change to the plan move, no change to the verify evidence, no change to
`completeExecution`, no change to the slug safety check, and no change to any existing
field on any return shape. **This is an additive, verdict-neutral change and Step 14
must verify it as one.**

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
| 6 | **THE FENCE** — a corrupt registry | `witness === 'unreadable'`, **never `'unclaimed'`**; no throw |
| 7 | **an empty registry is `unclaimed`, not `unreadable`** | the two states never collapse |
| 8 | **a malformed plan field is not a witness** — a task carrying `plan: "--plan"`, the real `t60` shape | `witness === 'unclaimed'` for the plan actually being completed; no throw |
| 9 | **a task for a DIFFERENT plan is not a witness** | `unclaimed` |
| 10 | **a task of a different kind is not a witness** — a `review` task naming the slug | `unclaimed` |
| 11 | **witness on the not-found path** — completing a slug with no plan file | the `ran: false` return still carries a witness field |
| 12 | **witness on the blocked path** — a plan that fails pre-review validation | the `blocked: true` return still carries a witness field |
| 13 | **witness on the success path** | present, alongside every field that is there today |
| 14 | **VERDICT-NEUTRALITY** — the same fixtures before and after the change | every existing field of every return shape is IDENTICAL; whether the completion ran, was blocked, or moved the plan is unchanged in every case. **This is the whole safety argument** |
| 15 | **never throws** — `root` a file, empty string, `null`; slug `null`, `''`, `'../../etc/passwd'`, NUL-bearing | a result is returned for each; no throw; the unsafe-slug refusal is unchanged |
| 16 | **no leak** — a registry whose task carries an absolute path and a newline in its fields | the returned text carries no absolute path, no stack trace, no forged line |
| 17 | **the fence is not vacuous** — case 1's assertion applied to case 2's fixture | FAILS, proving case 1 discriminates on a real absence |

Cases 6, 7 and 14 are the plan. Case 14 is what permits shipping this while the
building set is empty; case 17 guards against a test that passes against anything.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `claimWitness` | `completeTaskPlan`, same file | — |
| the witness on the result | `menu-screens` `task complete` route (`:2213`), **already wired, not edited here**) | the human's terminal, on every completion |
| the test file | the suite | `npm test` |

Nothing here is reachable only from a test. **Step 9 must confirm the menu renders the
result rather than a fixed subset of its fields** — if it picks fields, this change is
recorded but not yet visible, and Step 16 says so plainly rather than claiming a
surfacing that does not happen.

## A correction to the record: what `.ctoc/state/agent.json` actually controls

The commissioning report says the agent state file claims a plan is active whose task
finished two days ago. **The file's contents are exactly as described** — verified by
reading it:

```json
{ "active": true, "plan": "00071-fg1-false-green-fence", "step": 8,
  "phase": "TEST", "startedAt": "2026-07-18T13:23:02.265Z" }
```

**But that file does not decide anything.** `state.getAgentStatus` (`state.js:254-293`)
derives liveness from the REGISTRY — `status === 'running' && kind === 'implement'` —
and returns `{ active: false }` when there are none, which is the case today. Only
after that does it read `agent.json`, and only for supplementary detail (step, phase,
task). The file's own header says so: *"`.ctoc/state/agent.json` remains the
human-facing supplementary detail record but never decides liveness."*

**So the dashboard does not currently claim a build is active.** The stale file is a
real artifact and a real smell, and it has one real consequence: the moment a genuine
claim exists again, the dashboard will show that claim's plan alongside `step: 8`,
`phase: TEST`, `task: "Starting implementation"` **from two days ago**, because those
fields come from the stale file. That is a defect worth fixing and it is **not fixed
here** — this plan does not declare `state.js` and does not touch the file.

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
3. **It does not repair the 64 existing records.** Six `done` records with no start
   timestamp and one carrying `"--plan"` are reported, not rewritten. Repairing them
   inside the route that consults them would mean a check editing its own instrument.
4. **It does not clean `.ctoc/state/agent.json`**, and it does not touch `state.js`.
   See the correction above for what that file does and does not control.
5. **It does not narrow the write surface.** `00129` Part B stays blocked. No allow or
   deny for any edit changes.
6. **It cannot tell an honest fast build from an after-the-fact record.** The
   `implausible` flag is an advisory over a measured interval, and it is reported as
   exactly that. A genuinely quick slice reads implausible; a slow fabrication does
   not.
7. **It does not surface the witness anywhere except the completion result.** If Step 9
   finds the menu picks fields rather than rendering the result, the human does not see
   it until `menu-screens.js` is free, and Step 16 reports that.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/a-completion-says-whether-the-work-was-ever-claimed.test.js` in full and
run **only that file, before touching `src/`**. Record the starting state verbatim.

- **Cases 1-13 and 15-16 must be RED** — no witness exists on any return shape today.
- **Case 14 must be GREEN already** and must stay green: it asserts today's return
  shapes against today's code. It is the proof this change is additive, and if it is
  red at Step 8 the fixtures are wrong, not the code. **Record its green explicitly.**
- **Case 17 must FAIL as designed**; record that it does, or case 1 is not
  discriminating.

### Step 9: PREPARE

Read from disk, in full, and let the code win: `src/lib/actions.js` —
`completeTaskPlan` (`:1055-1101`), `completeExecution` (`:872`), `isSafePlanSlug`
(`:1049`) — **another plan in this set reads this file; confirm its shape has not moved
and stop and ask if it has**; `src/lib/task-registry.js` (`load`, and specifically
whether a corrupt load is DISTINGUISHABLE from an empty one at the call site);
`src/lib/state.js:247-293` (the liveness doctrine, for the correction above);
`src/lib/menu-screens.js` **READ ONLY — a concurrent executor is editing it; do not
modify it, and stop and ask if its call to `completeTaskPlan` has changed shape**.

Then measure, and **report before any code is written**:

1. **Re-measure the registry**: total records, counts by status, `done` records with
   `ts.started === null`, records whose `plan` is not a plan slug. Planning measured
   64 / 59 done / 4 queued / 1 cancelled / **0 running** / **0 cancelling**, with `t60`
   carrying `"--plan"`. **Report the current numbers verbatim.**
2. **Measure the created→done interval for every `done` record** and report the
   distribution. **The floor for `implausible` is chosen from this measurement and
   recorded with its justification** — not copied from this plan, which deliberately
   names none.
3. **Can a corrupt registry be distinguished from an empty one** at this call site? If
   `load` does not expose it, add the distinction HERE and do not change `load`'s
   fail-open contract, which the navigation plane depends on.
4. **Does the menu RENDER the completion result, or pick fields from it?** This decides
   whether the witness reaches a human in this plan or waits for `menu-screens.js` to be
   free. **Report which, plainly.**
5. Confirm `plans/in-progress/` is still empty (planning measured zero) — the reason
   refusal is not shipped.

### Step 10: IMPLEMENT
One step, files as sub-items.

- `src/lib/actions.js` — `claimWitness` (three states that never collapse, never
  throws, exported); `completeTaskPlan` carries the witness on **every** return shape;
  no refusal, no verdict change.
- `tests/a-completion-says-whether-the-work-was-ever-claimed.test.js` — the seventeen
  cases.

### Step 11: REVIEW
Confirm there is exactly ONE encoding of the claim witness and no second copy anywhere
in `actions.js`. Confirm **no code path can return `'unclaimed'` from a guarded read
failure** — read the diff, do not infer it from the tests. Confirm the witness is
present on every return shape without exception. Confirm no allow/deny, no move, and
no validation logic was touched. Confirm `completeExecution`, `isSafePlanSlug` and
`taskSpecFromPlan` signatures are unchanged. **Confirm by reading the require graph
that no new edge and no cycle was introduced.**

### Step 12: OPTIMIZE
Confirm the registry is loaded at most ONCE per completion — `completeTaskPlan` must
not add a second load beside the one `completeExecution` already performs. If it would,
pass the loaded value rather than re-reading. Confirm nothing new runs on any path
other than a completion. Record the before-and-after timing.

### Step 13: SECURE
- Confirm a hostile registry cannot inject text: a task whose `plan`, `label` or
  `result.summary` carries a newline, a terminal escape, `%s`, and a
  10,000-character string. The witness surfaces a fixed-vocabulary state, a bounded
  identifier, and numbers.
- Confirm the witness leaks no absolute path, no plan file contents, no stack trace.
- Confirm the existing unsafe-slug refusal (`:1063`) still fires **before** any
  filesystem access and before the witness is computed — the witness must never become
  a path oracle for a crafted slug.
- Confirm every fault path returns rather than throws: absent registry, corrupt
  registry, unreadable registry, absent plans directory, unreadable plan file.

### Step 14: VERIFY
Targeted run first: the new test file, `tests/actions-scheduler.test.js`,
`tests/task-registry.test.js`, `tests/task-reconcile.test.js`,
`tests/e2e-menu-lifecycle.test.js`, `tests/e2e-enforcement-and-gates.test.js`,
`tests/architecture-invariants.test.js`, `tests/export-reachability.test.js`,
`tests/false-green-fence.test.js`, `tests/doc-counts.test.js`,
`tests/readme-numbers.test.js`, plus whatever Step 9 finds covering
`completeTaskPlan`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be lowered.
Lint every changed JavaScript file at `--max-warnings 0`.

Then prove it **the way a human would**: complete a real plan through the menu's `task
complete` route and **read what comes out.** It must say whether the work was ever
claimed. Given the measurement it should say `unclaimed` — and that is a PASS of this
plan: the backstop correctly reporting that the dispatch path recorded nothing. Then
complete a plan that WAS claimed through the menu's start route and confirm it reads
`claimed` with a real elapsed time. **No git operations.**

### Step 15: DOCUMENT
A comment at `claimWitness` recording: why three states and why `unreadable` must never
render as `unclaimed`; why the witness is decided by a structural fact (`ts.started` is
a real instant) and NOT by the elapsed interval; why the interval is reported as a
measured number with an advisory flag rather than as a verdict; and the measurement
that motivated it — `t63` at 22 seconds for a four-file slice, `t62` and `t61` at 6.

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
3. What the completion actually said when run by hand at Step 14, for a claimed plan
   and an unclaimed one.
4. **Whether the witness reaches a human**, per Step 9 measurement 4 — and if it does
   not, say so plainly rather than claiming a surfacing that does not happen.
5. The seven things this does NOT fix, the unfilled claim first.
6. The correction about `.ctoc/state/agent.json` — that its contents are stale as
   reported, but that it does not decide liveness and the dashboard does not currently
   claim an active build.
7. Every decision taken under ambiguity.

## Ordering and file conflicts

**This plan has no dependencies and is buildable today**, independent of `00165` and
`00166`. It is deliberately the one piece of this set that does not rest on the
dispatch hook running.

**A concurrent executor is finishing a slice touching `src/lib/project-root.js` and
`src/lib/menu-screens.js`.** This plan declares NEITHER. It **reads** `menu-screens.js`
at Step 9 and must not modify it; if that file's call to `completeTaskPlan` has changed
shape, **stop and ask**.

`src/lib/actions.js` is declared here and is **read but not modified** by `00166`.
`00145`, already in this repository's implementation set, also declares `actions.js`.
Plans build sequentially, so there is no concurrent-edit hazard, but the executor must
read live at Step 9 rather than trusting any line number in this plan.

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
   a human has.
4. **The floor's value is chosen at Step 9 from the measured distribution and is
   deliberately NOT named here.** Planning measured three intervals; three points do
   not justify a constant, and a number written into a plan without its evidence is an
   estimate wearing the clothes of a fact.
5. **Three witness states, and `unreadable` never folds into `unclaimed`.** The
   registry's `load` fails open to empty by design, which is right for navigation and
   wrong as an input to a verdict: an empty answer from an unread instrument is this
   repository's documented false-green class.
6. **The distinction is added at this call site, not by changing `load`'s contract.**
   The navigation plane depends on that fail-open behaviour, and a permission-adjacent
   change that alters a shared fail-open primitive would reach much further than this
   plan's blast radius.
7. **The witness appears on EVERY return shape**, including the `ran: false` and
   `blocked: true` paths. A field present on only the success path teaches a reader it
   is optional and therefore ignorable.
8. **`menu-screens.js` is read but not modified**, because a concurrent executor is
   editing it. The wiring already exists, so the field reaches the human through the
   existing call site — **if** the menu renders the result rather than picking fields.
   Step 9 measures which, and Step 16 reports the truth rather than assuming the
   favourable case.
9. **The report's claim about `.ctoc/state/agent.json` is CORRECTED, not repeated.**
   The file's contents are stale exactly as described, but `state.getAgentStatus`
   derives liveness from the registry and treats the file as supplementary detail only,
   so the dashboard does not currently claim an active build. The code wins over the
   report. The real consequence — stale step/phase detail surfacing beside the next
   genuine claim — is named and left unfixed here.
10. **The 64 existing records are reported, not repaired.** Repairing them inside the
    route that consults them would mean a check editing its own instrument, and their
    disposition is a decision already before the human.
11. **The registry count is 64, not the 63 `00129` measured**, with one further `done`
    record appearing between the two measurements. Stated with its value rather than
    carried forward, because a repair that carries a wrong number forward is a repair
    nobody can check.
</content>
