---
title: "X4 — quality-agent.js cannot read node:test output at all, and push.js blocks on its verdict"
type: implementation
parent_plan: none
depends_on: 00056-x3-step-13-verify-fails-open
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/quality-agent.js"
  - "tests/quality-agent.test.js"
---

# X4 — the third false-green instrument, and this one gates the push

## How this was found

X3 repaired `src/lib/step-13-verify.js` and swept `src/` for a third instance of
the ANSI-naive parser, as its plan required. It found none of *that* bug — and
reported a different one, unprompted and out of scope:

> *"`src/lib/quality-agent.js` derives `passed` from the exit code alone — no
> fail-count guard at all... its `/(\d+)\s*(passed|passing)/i` cannot read
> node:test's `ℹ pass 8` at all."*

Verified independently before writing this plan.

## The defect, measured

`src/lib/quality-agent.js` counts test results with:

```js
/(\d+)\s*(passed|passing)/i
```

Fed the four real shapes:

```
  node:test spec  (ℹ pass 8)     -> NO MATCH
  node:test TAP   (# pass 8)     -> NO MATCH
  jest            (8 passed)     -> reads 8
  mocha         (8 passing)      -> reads 8
```

**It reads jest and mocha. It cannot read node:test at all** — neither reporter,
coloured or not. **CTOC's own suite is node:test.** The module that runs CTOC's
quality checks is blind to the runner CTOC itself uses.

This is a *different* mechanism from X2 and X3. Those were ANSI-naive anchoring on
a regex that otherwise knew the vocabulary. This one has the wrong vocabulary
entirely: `passed|passing` is the jest/mocha idiom; node:test emits `pass`.

## Two more defects in the same module

1. **`skipped: 0` is hardcoded.** Grep confirms the literal. CLAUDE.md's contract
   is *"0 skipped"* and Step 14 VERIFY enforces it — this module reports zero
   skipped unconditionally, whatever the run did. It does not enforce the
   contract; it asserts compliance with it.
2. **`passed` derives from the exit code alone.** No fail-count cross-check. The
   exact scenario `step-13-verify.js`'s own comment names — *"a runner can report
   FAILURES on stdout yet exit 0 (jest --passWithNoTests, a wrapping `|| true`,
   `set +e`, or a custom reporter that swallows the exit code)"* — passes this
   module green.

## Why this one matters most of the three

`src/lib/quality-agent.js:187`, its own comment:

> *"the other test-runner results so consumers (**push.js**) block on `!passed`"*

**This verdict gates the push.** X2's instance failed by accident and went red for
the wrong reason. X3's instance was silent but sat behind Gate 3. This one is the
last instrument between a broken tree and `git push`.

## The fix

1. **Add the node:test vocabulary.** `(?:#|ℹ)\s+pass\s+(\d+)` alongside the
   existing jest/mocha `(\d+)\s*(passed|passing)`. Do not replace it — other
   projects genuinely use jest and mocha, and this module serves them.
2. **Strip ANSI before parsing**, same as X2 and X3. Mirror their helper.
3. **Read the real skipped count** instead of hardcoding `0`, using the same
   `(?:#|ℹ)\s+skipped\s+(\d+)` shape the other two modules use.
4. **Cross-check the exit code against a fail count when one is readable.** Exit 0
   with `fail > 0` on stdout is the liar scenario; it must not pass.
5. **Fail closed on an unreadable instrument — but ONLY when the instrument was
   present.** See Decision 1. This is X3's `hasTestSummaryEvidence` boundary and it
   is the load-bearing judgement here too.

## Decisions Taken Under Ambiguity

1. **"Unreadable" means the instrument was PRESENT but illegible — not "no
   counter found".** X3 established this the hard way and its reasoning transfers
   verbatim: a project whose runner is not node:test at all (`node
   test/widget.test.js` printing `ok: ...`, exit 0 — what
   `tests/greenfield-journey.test.js` seeds) has output, no fail line, and *its
   exit code IS its instrument*. Refusing it would be a **false RED**, which is
   worse than the false green because a guard that cries wolf gets disabled. Read
   X3's `hasTestSummaryEvidence` in `src/lib/step-13-verify.js` and mirror its
   boundary. **If you cannot reproduce that boundary here, STOP and report.**
2. **Extend the jest/mocha regex, never replace it.** `quality-agent.js` serves
   any project CTOC is installed into, not only CTOC. Removing `passed|passing`
   would break every jest and mocha user to fix node:test. Both vocabularies, or
   the fix is a regression.
3. **Three modules now duplicate `stripAnsi`.** X3 flagged that a shared
   `src/lib/ansi.js` is the better answer and declined to build it because it
   would change X2's landed contract. At three copies that argument inverts —
   **but it is still not this plan's call.** Mirror the helper a third time,
   record the debt here, and let the owner schedule the consolidation. Do not
   refactor two landed modules from inside a third plan.
4. **`undetermined: true` already exists in this module** (line ~190-197) as a
   distinct state from `passed: false`, and `push.js` blocks on `!passed` so
   undetermined already blocks. **Reuse it** for the unreadable-instrument case
   rather than inventing a fourth state. Read that path before writing anything.

## Test Plan (TDD-Red first)

`tests/quality-agent.test.js`. Zero doubles — feed the literal bytes each runner
emits. Build colorized fixtures with `String.fromCharCode(27)`.

Write FIRST, observe RED:

1. **`reads a node:test spec pass count (ℹ pass 8)`** — currently NO MATCH → red.
2. **`reads a node:test TAP pass count (# pass 8)`** — currently NO MATCH → red.
3. **`still reads jest (8 passed) and mocha (8 passing)`** — green before AND
   after. The regression guard for Decision 2.
4. **`reads a colorized node:test count`** — red.
5. **`reports the REAL skipped count, not a hardcoded zero`** — feed output with
   `ℹ skipped 3`. Currently returns `0` → red. **This one has been silently
   asserting compliance with the 0-skipped contract.**
6. **`exit 0 with fail > 0 on stdout does NOT pass`** — the liar scenario. Build
   it as a real exit-0 liar (a wrapper swallowing the child's exit code), not a
   bare failing run — X3 found its own end-to-end test hollow because a bare
   `node --test` exits non-zero and the exit code caught it before the parser was
   ever consulted. Currently passes green → red.
7. **`a non-node:test runner with output and no counters is NOT refused`** — the
   false-red guard from Decision 1. Green before AND after.
8. **`an unreadable-but-present instrument yields undetermined, and push blocks on it`** —
   assert the `undetermined` path, and assert `push.js`'s consumption blocks on it.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write cases 1–8. Run. Cases 1, 2, 4, 5, 6 MUST fail. Quote the literal red. Touch no source before you have seen red — all three instances of this defect class shipped past green unit tests.

### Step 9: PREPARE — read `src/lib/quality-agent.js` IN FULL. Read the LANDED `src/lib/step-13-verify.js` (X3) and `src/scripts/test-gate.js` (X2) — they are the reference implementations and you must not invent a fourth pattern. Read `src/commands/push.js` to confirm exactly how it consumes this verdict; the claim that it blocks on `!passed` comes from a comment, and a comment is not the code.

### Step 10: IMPLEMENT — the five fixes above. Change no threshold and no definition of a failure.

### Step 11: REVIEW — re-read the diff. Confirm jest and mocha still parse, the non-node:test project still passes, and `undetermined` is reused rather than duplicated.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — this module gates the push. Enumerate every path where it can return `passed: true`, and show none is reachable with a readable `fail > 0` or a present-but-illegible instrument. X3 did the equivalent over 80 real combinations and validated its own oracle by replaying it against the old parser (44 violations found). **Do the same: a proof that never fires is not a proof.**

### Step 14: VERIFY — `node --test tests/quality-agent.test.js` → green. Then `npm test` with `FORCE_COLOR=0` and say that you did. Note the tree is churning: several plans are landing concurrently and the failure count has moved 8 → 12 → 22 within the hour. Attribute every failure you see individually rather than reconciling to a number in this plan; if you cannot attribute one, say so.

### Step 15: DOCUMENT — one line in the module header recording that it reads three runner vocabularies and fails closed on a present-but-illegible instrument. Do NOT touch `CLAUDE.md` — X2 already edited it and you would collide.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; the final parser code; all eight results; the Step 13 enumeration and its self-validation against the old code; `npm test` totals with the FORCE_COLOR setting. State explicitly whether `push.js` really blocks on this verdict, having read it rather than trusted the comment.

## Executor Verification (Steps 8-16)

- [x] Step 8 observed RED on cases 1, 2, 4, 5, 6 before `src/` was touched — and ALSO
      on case 3 (see the finding below), which the plan expected to be green
- [x] jest and mocha vocabularies still parse — Decision 2 not violated
- [x] The non-node:test project still passes — no false red introduced
- [x] `skipped` read from output, never hardcoded
- [x] Exit-0 liar built as a REAL liar, not a bare failing run
- [x] Step 13 enumeration self-validated by replaying against the old parser
      (66 real combinations; 0 live violations; the same oracle finds 21 fail-open
      violations against the old logic — the proof fires)
- [x] `push.js` consumption confirmed by READING it, not by its comment — it DOES block

## Finding against this plan's premise (case 3)

The plan states jest `(8 passed)` "reads 8". Measured against REAL jest output, it does
not. The old unanchored `/(\d+)\s*(passed|passing)/i` takes the FIRST match, and real
jest prints `Test Suites: 1 passed, 1 total` BEFORE `Tests: 8 passed, 8 total` — so it
read the SUITE count (1) as the test count. Case 3, which the plan predicted would be
green before and after, was RED before. The module read node:test not at all AND jest
wrongly; only mocha was genuinely correct. The fix anchors jest to its `Tests:` summary
line, and keeps the original unanchored regex as a LAST-resort fallback so no other
runner that used to be read stops being read.

## Debt recorded (Decision 3)

`stripAnsi` + `ANSI_PATTERN` are now duplicated in THREE modules: `src/scripts/test-gate.js`
(X2), `src/lib/step-13-verify.js` (X3), and `src/lib/quality-agent.js` (X4). A shared
`src/lib/ansi.js` is the better answer and the argument is stronger at three copies than
at two — but consolidating changes two already-landed contracts from inside a third plan,
so it is NOT taken here. It is the owner's to schedule.
