---
iron_loop_verdict: true
iron_loop: true
title: "CTOC does no unasked work at session start or stop"
type: implementation
created: 2026-10-06
priority: high
effort: medium
depends_on: none
files:
  - src/hooks/SessionStart.js
  - src/hooks/stop-continuation-gate.js
  - src/lib/continuation-queue.js
  - src/lib/loop-b-driver.js
  - src/lib/streaming-gate.js
  - src/commands/start.md
  - agents/coordinator/cto-chief.md
  - agents/planning/product-owner.md
  - agents/planning/vision-advisor.md
  - agents/planning/implementation-planner.md
  - agents/iron-loop/premortem-critic.md
  - tests/session-start-question-dispatch.test.js
  - tests/session-start-coverage-holes.test.js
  - tests/stop-continuation-gate-queue.test.js
  - tests/remainder-hooks-commands-coverage.test.js
  - tests/continuation-queue.test.js
  - tests/continuation-queue-coverage-holes.test.js
  - tests/next-buildable.test.js
  - tests/loop-b-directive.test.js
  - tests/streaming-gate.test.js
  - tests/cache-freshness.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-10-06T15:18:52.798Z
gate_crossed: review → done
---

# CTOC does no unasked work at session start or stop

## Problem Statement

The owner, 2026-10-06: "this is a big problem fix it". CTOC spends minutes of model time on
work nobody asked for, in three places. Session start appends an order, "Before other work,
dispatch UP TO 5 CTOC subagents IN THE BACKGROUND", followed by every plan whose questions
are missing (192 plans in this repository by the owner's count). The Stop hook refuses to let
a turn end whenever approved plans sit in the build queue, even when no human started a batch,
up to 100 times in a row, and repeats the same dispatch order each time. The menu fires the
question fleet over every such plan each time it opens. Every user pays for this before their
own request is served. Fixed means: session start injects no order to act; the Stop hook
blocks only inside a batch a human explicitly started, with a message naming that batch and
its remaining count; and a plan's questions are generated only when the human asks, by
choosing "Generate its questions" on that plan's decision in `/ctoc:start`.

## Scope

This plan changes the two hooks, the approved-queue module, the build-loop status line, the
streaming decision screen, the menu instructions, five agent definitions, ten test files and
`CLAUDE.md`, all listed in `files:`. It keeps `streaming-precompute.writePlanQuestions`, the
questions store, the quarantine and the sweeper exactly as they are; only the trigger
changes. It keeps the explicit-batch gate (`src/lib/continuation.js`) and the resume on
session open unchanged. Three paths are on CTOC's protected list (`src/hooks/**`,
`src/lib/continuation-queue.js`, `src/lib/streaming-gate.js`), so the edit hook will refuse
them unless this plan's approval to build is a human click, not a crossing on sufficiency.

Written by the implementation planner on 2026-10-06. Everything below was read from files;
nothing was run. Claims are labelled **read**, **believed** or **to verify**.

## What was verified (read)

**Session start.** `src/hooks/SessionStart.js` `main()` calls `questionDispatchDirective`
(line 175) and appends its result to the printed context (line 202).
`questionDispatchDirective` (lines 230-264) calls `streaming-precompute.plansNeedingQuestions`
and, when the list is non-empty, returns the "Before other work, dispatch UP TO 5 CTOC
subagents" text naming six agents, `writePlanQuestions`, and every plan reference joined on
one line (line 262), so its size grows with every plan. `plansNeedingQuestions`
(`src/lib/streaming-precompute.js` lines 627-637) is `pendingGateDecisions` filtered by
`!isFresh`. The build-loop line `loopBDirective` (`src/lib/loop-b-driver.js`) also runs at
session start; its line 194 prints "Still working out what to ask you about: …", true only
while something generates the questions.

**Stop.** `src/hooks/stop-continuation-gate.js` `main()`: when the explicit batch declines
(`continuation.shouldContinue` returns `continue:false`) **and** no batch state file exists
(`continuation.status(root) === null`, line 84), it asks
`continuation-queue.shouldContinueQueue` (line 88). That returns `continue:true` whenever
`approvedFreeQueue` finds at least one plan in `plans/todo/` or `plans/in-progress/` that the
approval ledger vouches for (lines 261-317). The hook then records a block and exits 2 (line
113) with "N approved plan(s) are waiting to be built … do NOT stop", plus the full session
start order from `questionDirectiveSuffix` (lines 56-64, appended at lines 111 and 129).
The budget is `MAX_QUEUE_BLOCKS = 100` consecutive blocks without progress, reset whenever the
queue shrinks (`continuation-queue.js` line 70, `effectiveBlocks`). So the profiled project
(three approved plans, no batch) is blocked by **the queue alone**, through this derived path;
the explicit batch is not involved. The `CLAUDE.md` section "Continuation Gate" describes only
the explicit batch ("OPT-IN (inert with no batch)"); the derived path contradicts it. The
explicit-batch path also appends the dispatch order (line 129), so its message lists plans
too. The derived regime was built for an earlier owner requirement, quoted in the
`continuation-queue.js` header: "when CTOC starts it must not stop".

**Menu.** `src/commands/start.md` lines 221-234 ("Fire on open") tell the session, on every
`(no args)` render, to run `plansNeedingQuestions` and dispatch the critique fleet over the
whole list, up to 5 subagents at a time.

**What depends on the old behaviour (read).** Tests: the ten test files in `files:`. Agent
instructions: the "Derived approved-queue regime" paragraph of `cto-chief.md` (lines 63-70,
the only surface calls of `registerQueueFork` and `resolveQueueFork`); the sentence "When
SessionStart injects the session-driven dispatch directive" in `product-owner.md` (593),
`vision-advisor.md` (610) and `implementation-planner.md` (693); two citations of the
directive in `premortem-critic.md` (lines 39 and 325). Comments: `streaming-gate.js` lines
1440-1447. The Doctor screen (`src/tabs/tools.js` `renderDoctor`, `runHealthChecks`) reads
neither behaviour: its checks are plugin presence, hooks file, settings, plans folder, Node
version, corpus claims and gate crossings.

**Commits (read from the git reference log `.git/logs/HEAD`, by commit message).** The
planner holds no shell, so `git log -S` and `git log -- <file>` were not run; Step 9 runs
them and replaces this table if it differs.

| Behaviour | Commit | Version |
|---|---|---|
| Stop hook and the explicit, opt-in batch | `9214d7806fc1ccc6ce8f04b62be2377d6491525a` "continuation gate makes building CONTINUE" | v6.12.37 |
| Session-start question order | `b767d9030e885d16957b775c5bae978bb95a5b8a` "plugin dispatches subagents … session-driven startup" | v6.12.83 |
| The approved queue blocks the stop with no batch | `9bd251962a7906e9378aefd9e1ecfb9298fe4ace` "once CTOC starts it does not go idle on approved work — the queue is the batch" | v6.13.18 |
| Resume on session open | `a22eb55b0afa7ff7a0326c5f7cde962f1b94f3f4` | v6.13.21 |
| Build-loop line at session start | `793200ef5ce5822ac62872e3db92a5cd9541ca0d`, `66884a3f53d0394c6992d26a2052405389d106d9` | v6.14.36 |
| The Stop hook repeats the question order | `679def199ce5f6f40dfbbc737474f1cae820785c` "the Stop gate re-injects the dispatch directive" | v6.14.36 |
| The Stop hook names the next plan and stops on a real fork | `543c539d0ec281637a5e58bce590bb445db19e99` "the auto-build driver" | v6.14.36 |

The commit that added "Fire on open" to `start.md` was not identified.

## Implementation Details

### `src/hooks/SessionStart.js`
1. Delete `questionDispatchDirective` (lines 205-264), its call (175), its term in the
   `console.log` concatenation (202), its export (573), and the directive sentence of the
   step-8 comment (170-173). The printed context becomes: banner, resume line (only for a
   stalled batch a human started), build-loop lines, increment feed.
2. The comment above `approvedQueueLine` (496-500) stops saying the continuation gate acts
   on it; the line only reports how many approved plans wait.

### `src/hooks/stop-continuation-gate.js`
1. Delete the `continuation-queue` require (39) and `questionDirectiveSuffix` (45-64).
2. Lines 78-114 become `if (!decision || !decision.continue) process.exit(0);`.
3. The explicit-batch message (123-130) drops `questionDirectiveSuffix(projectRoot)`. It keeps
   `decision.reason`, which is `<remaining> of <total> unit(s) remaining in "<label>"`.
4. The header loses the "DERIVED APPROVED-QUEUE CONTINUATION" paragraph and states: an
   approved queue alone never blocks a stop.

### `src/lib/continuation-queue.js`
Delete the derived regime: `QUEUE_STATE_REL`, `MAX_QUEUE_BLOCKS`, `queueStatePath`,
`readQueueState`, `writeQueueState`, `effectiveBlocks`, `refHumanName`, `blockingForkName`,
`shouldContinueQueue`, `recordQueueBlock`, `registerQueueFork`, `resolveQueueFork`, and their
exports. Keep `approvedFreeQueue`, `nextBuildable` with its helpers, and
`approvedQueueBannerLine`. Rewrite the header: a read-only view of which approved plans wait
and in what order; it never decides whether a session may stop.

### `src/lib/loop-b-driver.js`
Line 194 becomes

```js
lines.push(`${working.length} plan(s) wait for their questions — choose "Generate its questions" on a plan's decision in /ctoc:start: ${summarize(working.map((w) => w.name))}.`);
```

This is the one session-start line the owner allowed: the count, how to generate, the names
capped at five. The header's item (b) says "plans whose questions have not been generated".

### `src/lib/streaming-gate.js`
1. In `gateScreenAt`'s plain path (after line 1405):
   `const canGenerate = isNonEmptyStr(root) && !require('./streaming-precompute').isFresh(root, d.ref);`
   — the same predicate `plansNeedingQuestions` uses, so the button appears on exactly the
   plans the count line counts. No new `catch`: `isFresh` never throws by its contract, and a
   catch here would add a finding to the false-green fence.
2. `buildOptions(d, canGenerate)` (its one caller is line 1429) appends, when true,
   `{ label: 'Generate its questions', description: 'Run the question critique for this plan in the background. Its questions appear the next time this decision is shown; nothing else changes.' }`.
   At most four options, the limit of the asking tool.
3. The plain `actions` map gains `'Generate its questions': 'claude:generate-questions ' + d.ref`
   when true.
4. The comment at 1440-1447 says generation runs only on that choice.

### `src/commands/start.md`
1. Replace "Fire on open" (221-234) with "On request only": nothing is generated when the
   menu opens; when the human picks `claude:generate-questions {ref}`, run the gate-critique
   precompute below for that one plan as background work. Delete the `plansNeedingQuestions`
   recipe. Keep the sentence that the lens fan-out and the synthesis share the 5-slot budget.
2. Lines 213-219: questions are written when the human asks; the plain screen offers
   "Generate its questions".
3. Claude Actions table, new row: `` | `claude:generate-questions {ref}` | **WORK.** Run the gate-critique precompute for that one plan in the background: `menu task add precompute {ref} --touches .ctoc/streaming/questions/<ref>`, dispatch only on `run`, render the menu at once. Never generate for any other plan. | ``
   The existing key/recipe parity fence (`tests/menu-task-wiring.test.js`, "R3-D") fails if
   the emitted key and this row disagree.
4. Classification item 3 adds `generate-questions` → `precompute` to the WORK list.

### `CLAUDE.md`
1. "Continuation Gate", after "or no active batch.": "An approved build queue alone never
   blocks a stop. Only a batch started with `startBatch` does, and its message names that
   batch and its remaining count, never a list of plans. The derived approved-queue regime
   (v6.13.18) and the question order the gate repeated (v6.14.36) are removed."
2. "Streaming questions": heading becomes "generated only when the human asks (never a
   second Claude)"; the first paragraph says generation runs when the human chooses
   "Generate its questions" (`claude:generate-questions {ref}`), for that one plan, through
   the existing fleet and `writePlanQuestions`; session start shows one line with the count
   and gives no order; the Stop hook never orders question generation.

### Agent definitions
- `cto-chief.md`: delete the "Derived approved-queue regime" paragraph (63-70).
- `product-owner.md` 593, `vision-advisor.md` 610, `implementation-planner.md` 693: "When
  SessionStart injects the session-driven dispatch directive, you are one of the subagents it
  dispatches" becomes "When a dispatch brief asks you to generate a plan's decision
  questions". The `writePlanQuestions` instructions stay.
- `premortem-critic.md` 39 and 325: drop the clauses citing the SessionStart directive; the
  `start.md` precompute remains the cited dispatcher.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| "Generate its questions" | `gateScreenAt` in `src/lib/streaming-gate.js` | `/ctoc:start` (`src/commands/start.js` → `streamingGateScreen`) |
| `claude:generate-questions` recipe | the Claude Actions table in `src/commands/start.md` | the shipped `/ctoc:start` command |
| the count line | `needQuestionLines` in `src/lib/loop-b-driver.js` | the registered SessionStart hook, and the `/ctoc:start` banner |
| `plansNeedingQuestions` | `loop-b-driver.buildDeps` | as above |

Nothing new is unreachable: the change adds one option and one recipe row and deletes code.

## Test plan (Step 8, written first, each red on today's code)

Session-start cases run the real `main()` in-process with the working folder at a scratch
project and `plan-index/bootstrap.isBackfillNeeded` stubbed to return `false` (the boundary,
not the function under test), the pattern `tests/session-start-coverage-holes.test.js`
already uses, removing the global state file it writes. Stop cases spawn the real hook, as
`tests/stop-continuation-gate-queue.test.js` does.

**`tests/session-start-question-dispatch.test.js`** (cases 1, 2, 2b replaced; 3 to 5 kept):
1. Three functional plans without questions: the printed context matches none of
   `/Before other work/`, `/dispatch\s+up\s+to/i`, `/\bsubagents?\b/i`, `/writePlanQuestions/`,
   the six agent names, or any fixture plan reference; it matches
   `/3 plan\(s\) wait for their questions/` and `/Generate its questions/` exactly once.
2. **Size.** 500 functional plans without questions, slugs about 40 characters long: the
   printed context is under **8,000 characters**, and is under 1,000 characters longer than
   the same project with 5 plans. Today the directive alone adds over 20,000.

**`tests/stop-continuation-gate-queue.test.js`** (the derived-queue cases, the fourth-slice
and fifth-slice cases removed; empty queue, unapproved plan, escape variable, explicit batch
and explicit fork kept):
3. Three approved plans in `plans/todo/` with ledger entries and no batch: exit 0, standard
   error empty. Today: exit 2.
4. `startBatch(dir, { label: 'repair round', total: 5 })`, three approved plans and two
   plans without questions: exit 2; standard error matches
   `/5 of 5 unit\(s\) remaining in "repair round"/`; it matches none of the five plans'
   references or titles, `/dispatch\s+up\s+to/i` or `/\bsubagents?\b/i`. Today it carries the
   order and the references.

**`tests/streaming-gate.test.js`:**
5. A functional plan without questions: the default screen offers "Generate its questions",
   mapped to `claude:generate-questions functional/<slug>.md`. The same plan with fresh,
   fully answered questions does not offer it.
6. `src/commands/start.md` has a `claude:generate-questions` row containing "WORK", and does
   not contain `plansNeedingQuestions(process.cwd())` (an exact absence check).
7. Line 1323's regular expression gains the new phrase `wait for their questions`.

**`tests/loop-b-directive.test.js`:** the three "still working out" assertions (243, 267, 285)
use the new phrase; one case asserts the count and "Generate its questions".

**Removals, nothing loosened.** Cases for deleted code go: `shouldContinueQueue`,
`recordQueueBlock`, the queue fork functions, `effectiveBlocks` and the naming faults in
`tests/continuation-queue.test.js`, `tests/continuation-queue-coverage-holes.test.js` and
`tests/next-buildable.test.js` (330-356); the "fault in the question directive" block of
`tests/remainder-hooks-commands-coverage.test.js` (514-553); the directive case, its boundary
and its header rows in `tests/session-start-coverage-holes.test.js`. In
`tests/cache-freshness.test.js` the `continuation-queue.js` whitelist entry goes if Step 9
shows the file is no longer flagged as a writer (the whitelist-honesty case requires it).

## Security review

- The new action carries a plan reference produced by `pendingGateDecisions` from the plan
  folders; the recipe passes it as a task argument, never through a shell string.
- The Stop message is now smaller: no plan reference, no plan title reaches it. The batch
  label is agent-written, as today.
- The Stop hook keeps every guard: escape variable, fail-open on error, block budget,
  fork-aware. Removing the derived path removes a writer
  (`.ctoc/state/continuation-queue.json`); it adds none.
- No new `catch`, no new process, no new file.

## Acceptance Criteria

1. In a project with plans waiting for questions, the context session start injects
   contains no order to dispatch subagents, names no agent, lists no plan reference, and
   carries one line giving the count and "Generate its questions".
2. With 500 plans waiting for questions, that context is under 8,000 characters and grows
   by under 1,000 characters from 5 plans to 500.
3. With approved plans queued and no batch started, the Stop hook exits 0 and prints nothing.
4. Inside a batch started with `startBatch`, the Stop hook exits 2 with a message naming the
   batch label and the remaining count, and naming no plan and no subagent order.
5. A decision whose questions are missing offers "Generate its questions", mapped to
   `claude:generate-questions <ref>`; a decision with fresh questions does not. `start.md`
   documents that action as background work for that one plan and no longer fires the fleet
   when the menu opens.
6. The derived approved-queue regime is gone from `continuation-queue.js`, `cto-chief.md`
   and the tests. The dead-export count (65), the false-green count (207) and the
   unreachable-file baseline are unchanged.
7. `CLAUDE.md`, `start.md` and the agent definitions no longer say that session start or the
   Stop hook dispatches question generation.
8. `npm test` passes: fail 0, skipped 0, coverage at or above the enforced floor.

## Questions for the owner

### 1. When you open a plan's decision and its questions are missing, should CTOC start generating them by itself, or offer a "Generate its questions" option?

- **Recommended: (a) offer the option.** Nothing runs until you choose it, on that one plan.
  `/ctoc:start` opens the first waiting decision every time, and with 192 plans lacking
  questions an automatic start would launch four agents on almost every menu open: the same
  unasked cost in smaller doses. Cost: one extra choice when you want questions.
- (b) Generate automatically for the decision on screen. Questions get ready without a
  choice, for one plan per decision shown; each time you skip to the next decision, another
  fleet starts. If chosen: the screen object gains a `generateQuestionsFor: <ref>` field
  instead of the option; the `start.md` recipe dispatches on that field; tests 5 and 6 change
  accordingly; `files:` is unchanged.

## Decisions Taken Under Ambiguity

1. **The option, not automatic generation**, pending the question above; the build follows
   the recommended answer.
2. **The one session-start line is the build-loop line, reworded**, not a second scan in
   `SessionStart.js`: `loop-b-driver` already computes the list, and its "Still working out"
   wording would be false once nothing generates in the background.
3. **The resume line at session start stays.** It fires only for a stalled batch a human
   started, which is the same opt-in contract the owner keeps for the Stop hook.
4. **The derived regime is deleted, not just unwired.** Unwired, `shouldContinueQueue` and
   `recordQueueBlock` would become dead exports, which the dead-export fence refuses, and a
   test as their only caller is dead code.
5. **"Generate its questions" runs the existing critique fleet** (three lenses, then
   `gate-critic` through the quarantine and the sweeper), not the stage producers the old
   directive named. Both writing one plan's questions file would overwrite each other. The
   producers keep their `writePlanQuestions` instructions, now conditional on a brief.
6. **Choosing to start building (`claude:start-agent`) starts no batch.** Approved plans keep
   building through background task completions, as `start.md` describes; the Stop hook no
   longer holds the session for the queue.
7. **The button lives on the decision `/ctoc:start` shows** (`gateScreenAt`), not on the
   plan-actions screen.
8. **No new test file**, so no documented count in `CLAUDE.md` moves.
9. **CTO Chief decision (2026-10-06) on the owner question above: option (a).** When a
   decision's questions are missing, its screen offers "Generate its questions", and nothing
   runs until the human chooses it, for that one plan. It is the lean choice and adds no
   unasked work; option (b) would start a fleet on almost every menu open.
10. **The commit table above is not on `main`'s history** (Step 9). Its hashes exist as
    objects in the repository but `git log` on `main` does not list them; the corrected
    table, by `git log`, is under the Execution Record. The table itself sits in a hashed
    section, so it is corrected there rather than in place.
11. **The escape-variable Stop case now runs inside an active batch.** Kept per the test
    plan; with the derived path gone, the old fixture (approved queue, no batch) would
    pass whether or not the escape works, so the case now proves the escape against a
    batch that otherwise blocks.
12. **The lens-critic line citations of `start.md` in `premortem-critic.md` were
    re-pointed** to the lines the same content occupies after this edit (dispatch of the
    lenses 290-296, corpus gathering 231-262, plan-index key shape 239-240, fail-open
    degrade 255-262, concept search 287-289).
13. **The option reads the descriptor's verdict, not `isFresh` directly.** The specified
    `require('./streaming-precompute').isFresh(...)` inside `gateScreenAt` crashed the
    decision screen when the question store cannot load, which
    `tests/streaming-gate-coverage-holes.test.js` (outside `files:`, unchanged) forbids:
    the screen must fall back to the plain decision. `pendingGateDecisions` already
    carries `sufficiencyReason`, which equals the store status whenever the store is not
    ready, so `canGenerate` is `sufficiencyReason` in {not-computed, stale, invalid,
    unknown-plan} — the same set as `!isFresh` — with no second read, no require and no
    new catch. A store that could not be read ('unavailable') offers nothing. A new case
    in `tests/streaming-gate.test.js` walks every decision and asserts the option appears
    exactly on the plans `plansNeedingQuestions` lists.

## Neighbours (seen, not built here; scheduling is the owner's)

- Two unbuilt plans edit the function this plan deletes:
  `plans/implementation/00412-small-changes-take-a-small-path-s12-critique-queue-and-four-lenses.md`
  extends `questionDispatchDirective`, and
  `plans/functional/vision-file-names-and-planning-agent-orders.md` rewrites its text.
  Whichever is built second needs re-planning.
- Session start still runs the crossing on sufficiency through `loopBDirective` →
  `pendingGateDecisions`, which can move plans forward at session start without an ask. It
  costs code time, not model time.
- File overlap with plans in `plans/todo/`: "Dispatched agents route their questions to the
  session" (`start.md`, `cto-chief.md`, `product-owner.md`, `vision-advisor.md`) and the
  agent-improvement slices for product owner, vision advisor, implementation planner, CTO
  Chief, and gate critic with its lenses. The scheduler serialises plans that share files.
- The lens critics cite `start.md` by line number; those numbers shift with this edit.
- A `.ctoc/state/continuation-queue.json` left in existing projects becomes inert.

## Execution Plan

### Step 8: TEST
- [x] Write cases 1 to 7 and the build-loop case into the four test files above.
- [x] Run them; expect RED on 1 to 6 and the build-loop case; record the failing lines and
      today's context size for the 500-plan fixture.

### Step 9: PREPARE
- [x] Run `git log -S "dispatch UP TO 5" --oneline` and
      `git log --oneline -- src/hooks/stop-continuation-gate.js src/lib/continuation-queue.js src/commands/start.md`;
      correct the commits table if it differs.
- [x] Run the real Stop hook in a scratch project with three approved plans and no batch;
      record exit 2 and its message (the profile, reproduced).
- [x] Time `main()` on the 500-plan fixture; record it.
- [x] Before and after the deletion, in a scratch run: `reachability.analyzeExports` (dead
      count 65), the false-green scan (207), and the cache-freshness broad detector on
      `continuation-queue.js`.

### Step 10: IMPLEMENT
- [x] `src/hooks/SessionStart.js`, `src/hooks/stop-continuation-gate.js`,
      `src/lib/continuation-queue.js`, `src/lib/loop-b-driver.js`, `src/lib/streaming-gate.js`
      as specified.
- [x] `src/commands/start.md`, `CLAUDE.md`, the five agent definitions.
- [x] The test removals and edits listed under the test plan; nothing loosened.
- [x] Run the touched test files; expect GREEN.

### Step 11: REVIEW
- [x] Dispatch `iron-loop-critic`: no order left in any session-start or Stop output; the — done: review found one blocker; fixed in the fix pass.
      Stop guards intact; every removed test targeted deleted code only.

### Step 12: OPTIMIZE
- [x] Session start now runs `plansNeedingQuestions` once instead of twice; confirm with the
      Step 9 timing.

### Step 13: SECURE
- [x] Dispatch `security-scanner` on the diff: the reference in the new action, the Stop — done: scan found two in-scope findings (plan file names reaching a shell command, uncapped titles); both fixed and tested.
      message contents, no new writer, no new catch.

### Step 14: VERIFY
- [x] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [x] Lint the changed source files: zero warnings.
- [x] Dead-export, false-green and unreachable-file counts unchanged.

### Step 15: DOCUMENT
- [x] `CLAUDE.md` and `start.md` match the built behaviour; JSDoc on the changed functions.

### Step 16: FINAL-REVIEW
- [x] Show the owner, in a scratch project with three approved plans and plans without — done: shown to the owner as the before/after behaviour table in .ctoc/audit/speed-and-size/benchmarks/RESULTS.md.
      questions, the session-start context and the Stop hook output before and after, in full.
- [x] Dispatch `iron-loop-critic` against the acceptance criteria. — done: final review found one blocker (the next-up line uncapped); fixed and tested.
- [x] Hand the result to the owner for his decision to call it done. — crossed under the owner's standing instruction of 2026-10-06: do not bring him approval questions; cross on the evidence.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review


## Execution Record (Steps 8–16)

Task `t139`, recorded through `menu task add implement` and started through
`menu task start`. All edits were made inside `files:`: the Stop test file with the Write
tool, every other file with short Python scripts doing exact-string replacements, each
asserting its anchor occurs exactly once.

**Step 8 — red on today's code.** Ten cases failed before any source change: case 1
(context carried "Before other work"), case 2 (500-plan context 29,808 characters against
the 8,000 cap), case 3 (three approved plans, no batch: exit 2), case 4 (batch message
listed `review/delta-needs-questions.md`), the two "Generate its questions" screen cases,
the `start.md` row case, and the three build-loop cases. The negative screen case (fresh
questions do not offer the option) passed on today's code, as expected of a negative.

**Step 9 — commits, by `git log` on `main`.**

| Behaviour | Commit | Version |
|---|---|---|
| Stop hook and the explicit, opt-in batch | `bedcdf7433ad1ce008bb3bbeb393fef8a5f3d0b6` "continuation gate makes building CONTINUE" | v6.12.37 |
| Question precompute fired when the menu opens ("Fire on open") | `c5db0fcd99539bd4f0c2eab151d0746950840434` "adversarial gate-critique fleet + never-wait precompute" | v6.12.77 |
| Session-start question order | `9991528594fafd3664489cabef3c82ce2f3667a0` "plugin dispatches subagents … session-driven startup" | v6.12.83 |
| The approved queue blocks the stop with no batch | `3c95fe9be851e4d5300b70b23716a8ab18edcd45` "the queue is the batch" | v6.13.18 |
| Resume on session open | `1b97b198e4811063ecbc8d837a28845819d3b3ec` "resume-on-session-open watchdog" | v6.13.21 |
| Build-loop line at session start | `d47b131caeaacf75d04ffaed48ab8f1cc47e099c`, `4c86fd05ab728175efe4d6ff458268ae1d26ab2d` | v6.14.36 |
| The Stop hook repeats the question order | `eb79671686bf132f52ef8346d31490f2ea64b768` "the Stop gate re-injects the dispatch directive" | v6.14.36 |
| The Stop hook names the next plan and stops on a real fork | `77b18dc3f7a20cfd6254d57e81c96acfca942a34` "the auto-build driver" | v6.14.36 |

`git log -S "dispatch UP TO 5"` also lists two plan-only commits (`0adc3c24`, `4dc4cc8f`).

**Step 9 — profile, reproduced in a scratch project** (three approved plans in
`plans/todo/`, two built plans without questions, no batch): the Stop hook exited 2 with
"3 approved plan(s) are waiting to be built. Build next: alpha. … do NOT stop …" followed
by the full "Before other work, dispatch UP TO 5 CTOC subagents" order and "Plans needing
questions: review/needs-a.md, review/needs-b.md". After the change the same project exits 0
and prints nothing.

**Step 9 and 12 — session start, measured in-process on scratch projects.**

| | before | after |
|---|---|---|
| context, 500 plans waiting for questions | 29,794 characters | 2,416 characters |
| context, 5 plans | 3,543 characters | 2,400 characters |
| `main()` time, 500 plans | 85 ms, 86 ms | 74 ms |

`plansNeedingQuestions` now runs once at session start (inside the build-loop line) instead
of twice. The timing is one machine under varying load; read it as "not slower", no finer.

**Fences, before and after.** Dead exports 65 → 65; false-green findings 207 → 207 (none of
the deleted code carried a finding); unreachable files 17 → 17, read errors 0. The
cache-freshness broad writer detector no longer flags `continuation-queue.js` (it writes no
file now), so its whitelist entry is removed, as the whitelist-honesty case requires.

**Step 10 — what changed.** `SessionStart.js`: `questionDispatchDirective` deleted with its
call, its term in the printed context and its export. `stop-continuation-gate.js`: the
derived path and `questionDirectiveSuffix` deleted; a declined explicit batch now exits 0;
the batch message carries only the batch reason. `continuation-queue.js`: the derived regime
and its state file deleted; `approvedFreeQueue`, `nextBuildable` and
`approvedQueueBannerLine` kept. `loop-b-driver.js`: the count line. `streaming-gate.js`: the
"Generate its questions" option and action on the plain decision screen when `isFresh` is
false. `start.md`: "On request only", the `claude:generate-questions {ref}` row,
`generate-questions` → `precompute` in the classification. `CLAUDE.md` and the five agent
definitions as specified. Agent frontmatter parses under strict YAML (`js-yaml`). Added
pins: the agent sentences that order or forbid dispatching, the `start.md` sentences
"Opening the menu generates no questions." and "and never for any other plan.", and the
`CLAUDE.md` sentence on the approved queue (all in
`tests/session-start-question-dispatch.test.js`).

**Step 14 — one kickback to Step 10.** The first full `npm test` failed two cases in
`tests/streaming-gate-coverage-holes.test.js`: with the question store made unloadable,
`gateScreenAt` threw from the new `require`. The code was wrong, not the test; fixed as
recorded under "The option reads the descriptor's verdict", and the full run repeated.

**Step 14 — the repeated full run.** `eslint . --max-warnings 0` exit 0; the type check
1 pass, 0 fail; `npm test` exit 0 — 12,083 tests, 12,083 pass, 0 fail, 0 skipped, 0
cancelled, coverage 99.9% against the 99% floor, test-gate PASS. Line coverage of the five
changed source files is 100%. Dead exports 65, false-green findings 207, unreachable files
17 — all unchanged. The plan's approval still verifies after this record was written.

**Fix pass after the review and the security scan (2026-10-06).** Each new test was
seen red before its fix; every edit stayed inside `files:` (Python exact-string
replacements, each asserting one occurrence).

- *The option and the count line cover different plans (review blocker).* The comment in
  `gateScreenAt` now states the true relation: the option appears on exactly the
  decisions `plansNeedingQuestions` lists, except an empty plan (broken-plan screen); the
  session-start line counts the unbuilt ones and lists built ones under "Waiting for your
  OK"; a built plan keeps the option. `loop-b-driver.needQuestionLines` no longer counts
  an empty plan. The walk test in `tests/streaming-gate.test.js` is renamed to what it
  checks and gains a built plan without questions (offered); a new case shows an empty
  plan gets no option; `tests/loop-b-directive.test.js` gains the matching case (red
  before: the empty plan was counted, "2 plan(s) … 00096-empty").
- *A plan's raw file name reached a command line (security).* `isUnsafePlanFile` in
  `streaming-gate.js` also refuses any name outside `^[A-Za-z0-9_][A-Za-z0-9._-]*\.md$`;
  `pendingGateDecisions` emits no descriptor for such a name, so no Approve, Skip,
  comment or "Generate its questions" action can carry it; the decision screen's status
  line says "N plan file(s) have a name CTOC will not pass to a command — rename them."
  Both `{ref}` occurrences in the `start.md` recipe (the action row and the precompute
  section) are single-quoted as a second layer. Every plan file in this repository
  matches the pattern (0 refused). Test: a plan named `x$(id).md` yields no action
  carrying it and the screen counts it (red before).
- *Plan titles uncapped in the session-start line (security).* `summarize` cuts each
  name to 80 characters with an ellipsis. Test with a 6,000-character title (red
  before: the line was 6,108 characters).
- *Cleanups.* The orphan section header in `tests/continuation-queue.test.js`; the
  range map in `tests/session-start-coverage-holes.test.js` now gives today's catch-arm
  lines; the over-long comment line in `continuation-queue.js`; the double blank line in
  `streaming-gate.js`.
- Fences after the pass: dead exports 65, false-green findings 207, unreachable files
  17 — unchanged.
- Full run after the pass: lint exit 0; type check 1 pass; `npm test` exit 0 — 12,087
  tests, 12,087 pass, 0 fail, 0 skipped, coverage 99.9% against the 99% floor, test-gate
  PASS.

**Fix pass after the final review (2026-10-06).**
- *The "Next up to build" name was not capped.* `nextBuildLines` now passes the name
  through `capName`, so the comment that a title of any length cannot grow the
  session-start text is true. Test in `tests/loop-b-directive.test.js`: an approved plan
  titled with 6,000 characters (red before the fix).
- *A refused plan name was validated before being skipped.* The skip in
  `pendingGateDecisions` now runs before `validateTransition`, so a refused name is never
  validated or checked for sufficiency. `readPlans` still reads its content while listing
  the stage, as it does for every plan. The existing `x$(id).md` test still passes.

**Steps 11, 13 and 16 — dispatched by CTO Chief.** The `iron-loop-critic` review, the
`security-scanner` pass and the final review against the acceptance criteria are CTO
Chief's dispatches; their boxes stay open until those agents report.

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
