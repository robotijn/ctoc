---
title: "X7 — Session-driven startup: on ctoc start, the model dispatches up to 5 subagents to find issues + generate questions; delete the claude -p machinery"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: streaming-human-loop
iron_loop: true
files:
  - "src/hooks/SessionStart.js"
  - "src/lib/streaming-gate.js"
  - "src/lib/streaming-producer.js"
  - "src/scripts/produce-questions.js"
  - ".ctoc/reachability-roots.json"
  - "agents/planning/product-owner.md"
  - "agents/planning/vision-advisor.md"
  - "agents/planning/implementation-planner.md"
  - "CLAUDE.md"
  - "README.md"
  - "tests/readme-numbers.test.js"
  - "tests/streaming-producer.test.js"
  - "tests/produce-questions.test.js"
  - "tests/streaming-human-loop-e2e.test.js"
  - "tests/session-start-question-dispatch.test.js"
  - "tests/streaming-gate.test.js"
---

# X7 — the plugin dispatches subagents, it does not spawn a second Claude

## The ruling this implements

Owner, 2026-07-18: **"there is no model calling, it is a plugin in claude cli, not
using online api calls"** and **"session driven, when starting ctoc, ctoc is
starting at least one subagent immediately to find open issues and generate
questions, preferably up to 5."**

v6.12.82 shipped the WRONG mechanism: `streaming-producer.js`'s `defaultDispatch`
spawns `claude -p`, and `produce-questions.js` is a detached subprocess that does
the same per plan. That starts a brand-new second Claude beside the one already
running the session — absurd for a plugin. Only the MODEL can dispatch a subagent;
plain code cannot. So code must INJECT AN INSTRUCTION the model acts on, and the
model dispatches the subagents. This plan replaces the subprocess machinery with a
session-start directive. See [[project_ctoc_runtime_is_claude_cli]].

## What is DELETED (the wrong mechanism)

- `src/scripts/produce-questions.js` — the detached `claude -p` runner.
- `src/lib/streaming-producer.js` — the `claude -p` dispatcher + its `produceForPlan`
  wrapper. Its validate-and-write role is already `streaming-precompute.writePlanQuestions`;
  its dispatch role is now the model's. Redundant → gone.
- `maybeKickProduction` in `src/lib/streaming-gate.js` and its call in the render path
  — the detached-spawn trigger.
- the `produce-questions.js` entry in `.ctoc/reachability-roots.json`.
- `tests/produce-questions.test.js`, `tests/streaming-producer.test.js` — they test
  deleted code.

## What is ADDED / CHANGED (the plugin-native mechanism)

### 1. `SessionStart.js` injects the dispatch directive

`SessionStart.js` is a registered hook root; its `console.log(context)` is injected
into the session model at start. Add: compute `plansNeedingQuestions(root)` (require
`streaming-precompute` — this keeps that module reachable from a hook root). When the
list is NON-EMPTY, append a directive to the injected context, verbatim shape:

```
## Streaming questions — open forks awaiting the human (N plan(s))

Before other work, dispatch UP TO 5 CTOC subagents IN THE BACKGROUND to find open
issues and generate their questions — at least one, at most 5 at a time, refilling
as they complete:
  • producers, per plan stage — product-owner (functional), vision-advisor (vision),
    implementation-planner (implementation) — generate a plan's decision forks;
  • the adversarial critics — premortem-critic, devils-advocate-critic, red-team-critic
    — surface forks nobody has asked yet.
Each subagent writes its questions to the streaming store via
`src/lib/streaming-precompute.js` → writePlanQuestions(root, ref, questions, planMtimeMs),
questions = [{ id, prompt, critical?, important?, options:[{key,label,pros?,cons?}] }].
The human answers them in /ctoc:menu; a plan with every fork answered that passes
validation crosses its pre-build gate by itself.

Plans needing questions: <ref>, <ref>, …
```

When the list is EMPTY, inject NOTHING extra — the startup context stays as it is.
The directive is silent when there is no work, so it is never session-start noise.

### 2. The producer agents name the store-writer (keeps it live + is the real path)

`agents/planning/{product-owner,vision-advisor,implementation-planner}.md` each gain a
short "Writing questions to the streaming store" section instructing the agent to write
its questions via `src/lib/streaming-precompute.js` `writePlanQuestions(root, ref,
questions, planMtimeMs)` with the schema above. This is the genuine write path AND —
because the reachability model credits an export named in a shipped instruction surface
(agent markdown) — it keeps `writePlanQuestions` a LIVE export after the only JS caller
(`streaming-producer`) is deleted. See [[principle_wired_is_done]].

### 3. The e2e test is rewritten to the real write path

`tests/streaming-human-loop-e2e.test.js` currently drives `produceForPlan` (deleted).
Rewrite it to write the sandbox plan's questions with `writePlanQuestions` DIRECTLY —
which is exactly what the dispatched subagent does — then answer via the real
`streamAnswer` and assert the real `pendingGateDecisions` crosses the plan
functional→implementation with `entryKind === 'sufficiency'`, non-empty evidence, and
NO `approved_by`. The fail-closed sibling (one fork unanswered ⇒ no cross) stays.

## Decisions Taken Under Ambiguity

1. **Trigger = SessionStart, gated on there being work.** The owner said "when
   starting ctoc … immediately." SessionStart is the earliest, most literal "starting."
   It is gated on `plansNeedingQuestions` being non-empty so a session with nothing
   pending sees no directive. Menu-open remains a fine additional trigger later; this
   is the minimal one that fires "immediately on start."
2. **The directive dispatches BOTH producers and critics.** "Find open issues AND
   generate questions" is two jobs: producers generate a plan's known forks; the
   adversarial critics surface the forks nobody asked. The directive names both, capped
   at 5 concurrent ([[feedback_subagent_concurrency]]).
3. **`streaming-producer.js` is DELETED, not slimmed.** Its dispatch role (claude -p)
   is wrong; its write role duplicates `writePlanQuestions`. Nothing correct is lost.
   Keeping a slimmed version would leave a module whose only caller is a runtime
   `node -e`, which is not static-reachable → dead. Delete it.
4. **The write path is `writePlanQuestions`, kept live via instruction surface, not a
   new reachable JS caller.** Adding a JS caller just to satisfy the fence would be the
   very code-drives-model shape being removed. The honest reachable path here is the
   agent markdown naming the export — which is also literally how the subagent writes.
5. **Counts go DOWN and are reconciled in this slice** (Lesson 16): two `src/` files
   removed (`streaming-producer.js` from src/lib, `produce-questions.js` from src/scripts)
   plus test-file changes. Re-measure from disk; update every count assertion, `CLAUDE.md`,
   and `README.md`.

## Test Plan (TDD-Red first)

Write FIRST, observe RED:

1. **`SessionStart injects the dispatch directive when a plan needs questions`** — in a
   sandbox with one plan needing questions, run SessionStart and assert its output names
   "up to 5", `product-owner`, `writePlanQuestions`, and the plan ref. Red (not added).
2. **`SessionStart injects NOTHING extra when no plan needs questions`** — empty queue ⇒
   the directive section is absent. The no-noise guard.
3. **`the producer agents name the store-writer`** — assert each of the three agent .md
   files contains `writePlanQuestions` and `streaming-precompute`. This is the
   instruction-surface reachability anchor. Red (not added).
4. **`streaming-producer.js and produce-questions.js are gone`** — assert both paths do
   not exist. Red (present).
5. **`the reachability fence is at zero with the producer deleted`** — run the REAL
   analyzer; assert 0 unreachable AND `writePlanQuestions` is not a new dead export
   (kept live by the agent markdown). This is the load-bearing reachability proof.
6. **`the e2e loop still crosses by sufficiency`** — the rewritten sandbox test:
   `writePlanQuestions` → answer all → assert cross to implementation, `sufficiency`
   kind, no `approved_by`. Green after rewrite.
7. **`the e2e loop fails closed`** — one fork unanswered ⇒ stays functional. Green.
8. **`counts reconcile`** — the count ratchets pass with the two files removed.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write cases 1–8 (and the SessionStart test file). Run. Cases 1,3,4,5 fail; 6/7 fail until the e2e rewrite; counts fail until reconciled. Quote the red. Touch no source first.

### Step 9: PREPARE — read `src/hooks/SessionStart.js` IN FULL (how it builds `context` and whether it has the project root). Read `src/lib/reachability.js`'s instruction-surface + export logic to CONFIRM naming `writePlanQuestions` in agent markdown keeps it a live export (do not assume — verify with the real analyzer in Step 11). Read the current e2e test and the count assertions (with node, not the shell grep — it silently skips gitignored files).

### Step 10: IMPLEMENT — the deletions, the SessionStart directive, the three agent-md sections, the e2e rewrite, the SessionStart test, and the count reconciliation. Remove `maybeKickProduction` and its render-path call cleanly (no dangling reference).

### Step 11: REVIEW — run the REAL reachability analyzer: 0 unreachable, no new dead export, `writePlanQuestions` live. If it is NOT live via instruction surface, STOP and report — do not add a token JS caller or lower a baseline to force it.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — confirm no `claude -p` / `child_process` spawn of a model remains anywhere in the streaming path (grep the deleted-code surface with node). The plugin must never spawn a second Claude. Confirm the SessionStart directive is plain injected text — it cannot itself execute anything; it only instructs the model.

### Step 14: VERIFY — `npm test` with `FORCE_COLOR=0`, say you did. Target **fail 0**, coverage ≥ 99 (deleting the two lower-coverage files should HELP coverage, not hurt it). Name any residual failure with its cause.

### Step 15: DOCUMENT — update `CLAUDE.md` counts and its streaming note to reflect the session-start dispatch (remove any mention of the deleted producer/`claude -p`). One sentence on the new trigger.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; all eight results; the analyzer output (0 unreachable, writePlanQuestions live via instruction surface); `npm test` totals; and confirm no model-spawning subprocess remains. State plainly whether it reached fail 0.

## Executor Verification (Steps 8-16)

- [x] Step 8 RED observed before source (cases 1/2/2b/3/4/4b/4c failing; 5/5b green-stays-green)
- [x] `streaming-producer.js` + `produce-questions.js` DELETED; no dangling references
- [x] `maybeKickProduction` removed cleanly from streaming-gate + render path (export gone too)
- [x] SessionStart injects the directive ONLY when a plan needs questions (empty → '')
- [x] Three producer agents name `writePlanQuestions` (instruction-surface anchor)
- [x] REAL analyzer: 0 unreachable, `writePlanQuestions` live, no new dead export
- [x] No `claude -p` / model subprocess anywhere in the X7 question-generation path
- [x] e2e crosses by sufficiency (no approved_by) + fail-closed sibling green
- [x] counts reconciled from disk (src/lib 102→101, tests 417→416); `npm test` = fail 0
