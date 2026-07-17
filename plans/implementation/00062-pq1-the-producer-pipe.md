---
title: "PQ1 — The producer pipe: a CTOC agent's questions reach the streaming store, so the human is asked"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: streaming-human-loop
iron_loop: true
files:
  - "src/lib/streaming-producer.js"
  - "tests/streaming-producer.test.js"
---

# PQ1 — connect the pipe that was never connected

## The gap, measured

The streaming human loop is built end to end EXCEPT its source:

```
plansNeedingQuestions(root)  → 60 real plans need questions          ✓ works
[   THE MISSING PIPE — nothing dispatches an agent and fills the store   ]
writePlanQuestions(root,ref,qs) → .ctoc/streaming/questions/<ref>.json   ✓ exists, never called by a producer
richQuestionScreen(...)      → shows the app-question to the human    ✓ built
streamAnswer(...)            → records the answer                     ✓ built
hasEnoughInformation(...)    → {enough} , fails closed                ✓ built + wired (W1)
X6 crossBySufficiency        → crosses the gate when enough           ✓ built + verified
```

Measured: `writePlanQuestions` has **no producer caller**. `.ctoc/streaming/questions/`
does not exist. The human sees `"Approve X across Gate 3?"` — the fallback — because
`richQuestionScreen` returns null over an empty store, not because the screen can't
ask.

The two halves have never met at the code level: `product-owner` emits questions
through `markNeedsInput` → `src/lib/background.js` (the OLD needs-input status pipe);
the streaming screen reads from `streaming-precompute`'s store. **This module is the
adapter between them.**

## What it does

`src/lib/streaming-producer.js` — the background generation half of "precompute
questions, never wait" ([[feedback_precompute_questions_never_wait]]): generation is
DECOUPLED from answering. This module GENERATES; the human never waits for it.

```
produceForPlan(root, ref, dispatch)
    - reads the plan text from disk
    - calls dispatch(ref, planText, stage) -> Promise<questions[]>  (INJECTED)
    - validates the result against streaming-precompute.validatePlanQuestions
    - on valid: writePlanQuestions(root, ref, questions) ; returns {written:true, count}
    - on invalid / empty / throw: returns {written:false, reason} — NEVER throws,
      NEVER writes a partial or fabricated question. A plan with no real fork
      gets an empty store entry (which reads as "enough information"), not a
      made-up question.

produceAllNeeded(root, dispatch, {max})
    - drains plansNeedingQuestions(root) up to `max` (default = the 5 concurrency
      cap from task-registry.MAX_CONCURRENT — imported, never re-hardcoded)
    - one produceForPlan per plan; a failure on one plan never stops the others
    - returns a summary {attempted, written, skipped:[{ref,reason}]}

defaultDispatch(ref, planText, stage)
    - spawns the stage-appropriate CTOC producer agent via `claude -p
      --output-format json` (the CTOC runtime is the Claude CLI —
      [[project_ctoc_runtime_is_claude_cli]]; no raw API key exists), briefing it
      to emit questions AS JSON matching the store schema, and parses that JSON.
    - stage → agent:  functional → product-owner ; vision → vision-advisor ;
      implementation → implementation-planner. (Derive the real stage set from
      streaming-precompute; do not hardcode a list this plan invented.)
    - a MISSING `claude` binary is a LOUD SKIP (returns [] with a logged reason),
      never a crash and never a fabricated question.
```

## The hard rules this module must honor

1. **NEVER fabricate a question.** The agent does the thinking; this module does the
   plumbing. If dispatch returns nothing usable, the store entry is EMPTY, not
   invented. A fabricated question is worse than none — it asks the human about a
   fork that does not exist. ([[user_role_and_collaboration.md]]: no invented
   content.)
2. **Fail soft, always.** A dispatch that throws, times out, or returns garbage
   skips that plan with a logged reason. The generation loop is background and must
   never take down the session or block the menu.
3. **The agent is a REAL CTOC agent.** `defaultDispatch` spawns `product-owner` /
   `vision-advisor` / `implementation-planner` — never a generic or invented
   substitute ([[feedback_dont_touch_global_skills]] sibling rule: use CTOC's own
   agents). If the stage has no producer agent, skip with a reason.
4. **Idempotent + fresh-aware.** `plansNeedingQuestions` already filters to plans
   whose store entry is missing or stale; honor its selection. Do not re-produce a
   plan whose questions are fresh.

## Decisions Taken Under Ambiguity

1. **`dispatch` is injected; `defaultDispatch` is the shipped default.** Tests drive
   a fake dispatch returning known questions — no spawn, no model, no network,
   deterministic. `defaultDispatch` is exercised separately with the spawn boundary
   stubbed. This is the only way to test a model-calling pipe without doubles in the
   logic itself.
2. **An empty question set is a VALID, written result — the empty array.** A plan the
   agent judges to need no forks has "enough information" by definition. Writing `[]`
   records "asked, nothing needed" and lets `hasEnoughInformation` return enough.
   NOT writing anything would leave it forever pending. This mirrors the gate
   predicate's own `[]`-is-not-null distinction.
3. **`produceAllNeeded` respects `MAX_CONCURRENT`, imported from `task-registry`.**
   The 5-cap is enforced there ([[feedback_subagent_concurrency]]); re-hardcoding it
   here would let the two drift. Import the constant.
4. **This plan does NOT wire a trigger.** It builds the pipe and its default
   dispatch. WHERE the loop is kicked off (session start, menu open, a background
   job) is the next plan — deciding the trigger point is a design choice the owner
   should see separately, not one smuggled into the plumbing.

## Test Plan (TDD-Red first)

Zero doubles in the LOGIC. The injected `dispatch` is a test fake by design (it is
the seam), not a mock of this module's behavior. Write FIRST, observe RED:

1. **`produceForPlan writes valid questions to the store`** — fake dispatch returns
   two well-formed questions; assert `.ctoc/streaming/questions/<ref>.json` now
   loads them via the REAL `loadPlanQuestions`. Red (module absent).
2. **`produceForPlan REJECTS invalid questions and writes nothing`** — fake dispatch
   returns `[{prompt:'no id'}]`; assert `written:false`, a reason naming the
   validation error, and NO file created. The no-fabrication guard.
3. **`produceForPlan on a throwing dispatch is fail-soft`** — dispatch throws; assert
   `written:false`, reason captured, no crash, no file.
4. **`an empty question set is written as []`** — fake dispatch returns `[]`; assert
   the store entry exists and `hasEnoughInformation` reads it as enough. Decision 2.
5. **`produceAllNeeded drains the real queue and never exceeds max`** — seed 3 plans
   needing questions, `max:2`; assert exactly 2 attempted this pass, the third
   untouched, summary accurate.
6. **`produceAllNeeded — one plan failing does not stop the others`** — dispatch
   throws for plan B; assert A and C are still written and B is in `skipped`.
7. **`defaultDispatch loud-skips when claude is absent`** — stub the spawn to signal
   ENOENT; assert `[]` and a logged reason, never a throw, never a fabricated
   question. Do NOT actually spawn a model in the test.
8. **`defaultDispatch maps stage to the real CTOC agent`** — stub the spawn to
   capture its argv; assert `functional` → product-owner, `implementation` →
   implementation-planner, and an unknown stage → skip. Assert the agent names
   resolve to REAL files under `agents/` (read the tree), so a rename can't leave
   this pointing at a ghost.
9. **`no question the producer writes was invented by the producer`** — feed dispatch
   a known set; assert every written question id/prompt appears verbatim in the
   dispatch return. Structural proof the module is a pipe, not an author.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write cases 1–9. Run. All fail (module absent). Quote the literal red. Touch no source before you have seen red.

### Step 9: PREPARE — read `src/lib/streaming-precompute.js` IN FULL: `validatePlanQuestions` (the exact schema you must satisfy), `writePlanQuestions`, `plansNeedingQuestions`, `hasEnoughInformation`. Read `task-registry.js` for `MAX_CONCURRENT`. Read how another module in this repo spawns `claude -p` (grep node for a real example — do NOT trust a grep for load-bearing facts, the shell `grep` here silently skips gitignored files; use `node` to read). Confirm the real producer agent filenames under `agents/planning/`.

### Step 10: IMPLEMENT — the module. `dispatch` injected; `defaultDispatch` the shipped default. No fabrication path anywhere. Fail-soft everywhere.

### Step 11: REVIEW — re-read. Confirm: every written question came from dispatch (no synthesis); `MAX_CONCURRENT` imported not hardcoded; a missing binary and a throwing dispatch both return cleanly.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — `defaultDispatch` spawns a subprocess. Confirm the plan ref and any interpolated value are passed as argv elements to `execFile`-style spawning (no shell, no string concatenation into a command), so a crafted plan filename can never inject a command. Cross-platform: `claude` resolution must not assume a POSIX path.

### Step 14: VERIFY — `npm test` with `FORCE_COLOR=0`, say that you did. Baseline is **fail 0, 9766 tests, coverage 99.06%** — the honest green landed today. Anything you break is yours.

### Step 15: DOCUMENT — a header block on the module in the voice of `approval-ledger.js`'s header: what it is (the generation half), what it must never do (fabricate), and the injected-dispatch seam.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; all nine results; `npm test` totals; and confirm by quoting code that there is NO path where the module writes a question it was not handed by dispatch.

## Executor Verification (Steps 8-16)

- [ ] Step 8 RED observed before source
- [ ] No fabrication path — every written question traces to a dispatch return (case 9)
- [ ] Invalid/throwing/missing-binary all fail soft, no file, no crash
- [ ] `MAX_CONCURRENT` imported from task-registry, not re-hardcoded
- [ ] `defaultDispatch` spawns REAL CTOC agents by stage; argv-safe; cross-platform
- [ ] `npm test` still fail 0
