---
title: "X3 — step-13-verify.js says 'fail closed' in its own comment and fails OPEN: reads 1 of 4 real node output shapes"
type: implementation
parent_plan: none
depends_on: 00054-x2-gate-reports-green-over-failures
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/step-13-verify.js"
  - "tests/step-13-verify.test.js"
---

# X3 — the second instance of the false-green parser, in the module that certifies SECURE and VERIFY

## How this was found

X2 repaired `src/scripts/test-gate.js`, which reported `fail 0` while 8 tests
failed. Its executor then flagged, unprompted and out of its own scope:

> *"`src/lib/step-13-verify.js` mirrors these parsers and appears to carry the
> same ANSI-naive anchoring; it is outside my file scope, so I did not read or
> touch it — worth its own plan."*

Measured. It is correct, and this instance is **worse than the one X2 fixed**.

## The defect, measured

`src/lib/step-13-verify.js:390`:

```js
const mFail = (check.output || '').match(/^#\s*fail\s+(\d+)/im);
if (mFail && parseInt(mFail[1], 10) > 0) {
  check.passed = false;
  errors.push(`${mFail[1]} failing test(s) reported despite exit 0`);
}
```

Fed the four shapes node actually emits:

```
  TAP, plain        (# fail 8)     -> reads 8
  spec, plain       (ℹ fail 8)     -> NO MATCH — reads nothing
  TAP, colorized                   -> NO MATCH — reads nothing
  spec, colorized                  -> NO MATCH — reads nothing
```

**Three of four read nothing.** Two independent causes, both live:

1. **No `ℹ` alternation.** The regex is `/^#\s*fail/` — TAP only. Node's **spec**
   reporter (its default on a TTY) emits `ℹ fail N`. `test-gate.js` handles both
   with `(?:#|ℹ)`; this file never did. So it is blind to the spec reporter even
   with colour off.
2. **No ANSI strip.** `FORCE_COLOR` makes node colorize even when piped, and the
   `^` anchor then matches the escape byte.

**And `if (mFail && ...)` fails OPEN.** No match → the guard is skipped in
silence. No error is pushed. `check.passed` stays `true`. There is no third state
between "read a number" and "certified clean".

## Why this is worse than X2's instance

`test-gate.js` failed **by accident** — its coverage parser returned `null` and a
different guard tripped, so the run went red for the wrong reason. Noisy, but not
silent.

This one has no accident to save it. It simply does not fire. And it is the module
that certifies **Step 13 SECURE** and **Step 14 VERIFY** — the last two gates
before Gate 3.

## The comment directly above the defect

```js
// A runner can report FAILURES on stdout yet exit 0 (jest --passWithNoTests, a
// wrapping `|| true`, `set +e`, or a custom reporter that swallows the exit
// code). tryCommand derives success solely from the zero exit, so parse the TAP
// `# fail N` summary and fail closed — mirroring the skipped-count logic below,
// which already proves we do not fully trust the exit code.
```

**It says "fail closed." It fails open.** The guard whose entire stated purpose is
to catch a runner that lies about its own exit code cannot read the output node
actually produces.

The same file reasons carefully and correctly about a *different* attack —
last-match ordering, so a stray or spoofed `all files | 100` line cannot beat the
real below-floor summary emitted after it. That care is real. Colour and the spec
reporter simply never crossed the author's mind. This is the second time this
session that a fence here was strong and the claim about it was not.

## The fix — mirror X2 exactly, do not invent a second pattern

1. **Alternate `#|ℹ`** in the fail parse, matching `test-gate.js`.
2. **Strip ANSI before parsing**, in every function that reads spawned output —
   `applyTestQualityContracts`, `parseCoveragePct`, `parseSkippedCount`, and any
   other found at Step 9.
3. **Fail closed on unreadable.** This is the real fix. When a test command RAN
   and produced output, but no fail-count line can be read from it, that is not
   "clean" — it is **uncertified**. Push an error naming the unreadable
   instrument. See Decision 1 for the boundary.
4. **Keep every existing behaviour**: last-match ordering, the absent-script
   tolerance (`npm error Missing script: "lint"` is an absent script, not a failed
   lint), and `no-verifiable-toolchain`. Those are correct and hard-won.

## Decisions Taken Under Ambiguity

1. **"Unreadable" means: a test command ran, produced output, and no fail-count
   line could be read from it.** It must NOT mean "any command with no fail line",
   because `lint` and `typecheck` legitimately emit no fail count and this guard
   also sees their output. Scope the new failure to test-runner checks only. Getting
   this wrong turns every clean lint run red — a false RED, which gets the guard
   disabled, which is worse than the false green it replaces. If the check-shape
   cannot be distinguished at that point in the code, STOP and report rather than
   guess.
2. **Mirror `test-gate.js`'s `stripAnsi` rather than share it.** X2 deliberately
   did NOT export `stripAnsi` — nothing outside that module calls it, and the
   export fence treats an unreachable export as dead surface. Exporting it now
   solely so this file can import it would trade one fence violation for another.
   Ten duplicated lines with a comment pointing at the sibling is the smaller debt.
   **If review prefers a shared `src/lib/ansi.js` imported by both, that is a
   better answer** — flagged rather than decided, because it changes X2's landed
   contract.
3. **The ANSI pattern is a LITERAL regex with `\x1b` escapes.** `new RegExp(
   String.fromCharCode(27) + …)` trips `security/detect-non-literal-regexp`, an
   ERROR in `src/` under `--max-warnings 0`. X2 hit this and documented it; do not
   rediscover it.
4. **No new dependency.** `strip-ansi` would do this in one import and is
   forbidden — stdlib and what is installed.

### Taken at execution (Steps 8-16)

5. **Decision 1's boundary is NARROWER than its literal wording, because the
   literal wording produces a false RED.** The plan says unreadable means "a test
   command ran, produced output, and no fail-count line could be read". Measured
   against the real fixtures, that rule turns legitimate projects red: a project
   whose test runner is NOT node:test at all — `node test/demo-widget.test.js`
   printing `ok: add(2,3) === 5` and exiting 0, which is exactly what
   `tests/greenfield-journey.test.js` seeds — produces output and no fail line, and
   would have been refused. Its exit code IS its instrument and it reported success;
   there is no illegible dial to fail on. The implemented rule therefore fails closed
   only when the instrument was actually PRESENT: a node:test-shaped summary sibling
   counter (`ℹ tests`/`# pass`/`duration_ms`…), a fail-SHAPED counter no number could
   be read from (`ℹ failures 2`, `# fail abc`), or raw TAP failure output
   (`not ok`, `TAP version`). See `hasTestSummaryEvidence`. Cases 5b and 7 pin both
   sides of that boundary.
6. **The plan's premise that `applyTestQualityContracts` "also sees the output of
   lint and typecheck checks" is FALSE against the code.** It has exactly one call
   site (`runFallbackChecks`, guarded by `if (testCheck.ran)`) and is only ever
   handed the TESTS check; it is not exported. Lint/typecheck can never reach it, so
   the feared false red was never reachable by that route. The REAL false-red route
   was the non-node:test runner in Decision 5 — which the plan did not anticipate.
7. **`parseSkippedCount` and `parseCoveragePct` carried the SAME bug and are fixed
   too** (plan fix item 2, "any other found at Step 9"): both were ANSI-naive, and
   `parseSkippedCount` was `#`-only while `parseCoveragePct` lacked the `ℹ` prefix.
   Cases 6a and 6d were RED before the fix and prove both. `parseSkippedCount` is
   left UNANCHORED (its pre-existing contract) rather than line-anchored like
   `test-gate.js` — anchoring is a behaviour change beyond this plan's remit and is
   flagged for review, not taken.

## Test Plan (TDD-Red first)

`tests/step-13-verify.test.js`. Zero doubles — feed the LITERAL bytes node emits.
Build fixtures with `String.fromCharCode(27)`; the test file is exempt from the
non-literal-regexp rule.

Write FIRST, observe RED:

1. **`reads a spec-reporter fail line (ℹ fail 8) — plain`** — currently NO MATCH
   → red. **This one is not about colour at all**: the module is blind to node's
   default TTY reporter today.
2. **`reads a colorized TAP fail line`** — currently NO MATCH → red.
3. **`reads a colorized spec fail line`** — currently NO MATCH → red.
4. **`a test check that RAN, produced output, and whose fail count cannot be read is NOT certified`** — the fail-open assertion. Currently the guard is skipped in silence and `passed` stays true → red. **This is the one that matters.**
5. **`a lint/typecheck check with no fail line is still fine`** — the guard against
   Decision 1's false-red. Must be green before AND after.
6. **`the existing contracts still hold`** — last-match ordering beats a spoofed
   earlier `all files | 100`; an absent script is not a failed check;
   `no-verifiable-toolchain` still fires when nothing ran. Green before and after —
   the fix must break none of them.
7. **`end-to-end: VERIFY over a suite with a real failure, under FORCE_COLOR=3, does not certify`** — the only test that proves the real thing. A unit test on a regex is not enough; that is exactly how both instances shipped.

## Execution Plan (Steps 8-16)

### Step 8: TEST — add cases 1–7. Run. Cases 1–4 MUST fail. Quote the literal red. Touch no source before you have seen red — both instances of this bug shipped past green unit tests.

### Step 9: PREPARE — read `src/lib/step-13-verify.js` IN FULL. Find EVERY regex reading spawned output; the plan names three, there may be more. Read the landed `src/scripts/test-gate.js` to mirror its shape exactly — X2 finished it and it is the reference. Read `tests/coverage-gate.test.js` for the fixture idiom.

### Step 10: IMPLEMENT — (a) `stripAnsi` mirrored from `test-gate.js`, applied in every output-reading function; (b) `#|ℹ` alternation in the fail parse; (c) fail closed on unreadable, scoped per Decision 1. Change no threshold and no definition of a failure.

### Step 11: REVIEW — re-read the diff. Confirm the absent-script tolerance and last-match ordering are intact, and that no lint/typecheck path can now report a false failure.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — this file IS Step 13. Enumerate every path where a check can end `passed: true`, and show that none of them is reachable with an unreadable fail count on a test check. X2 did this computationally over 1331 input combinations rather than by eye; do the equivalent here.

### Step 14: VERIFY — `node --test tests/step-13-verify.test.js` → green. Then `npm test` TWICE, with `FORCE_COLOR=3` and without. Both must report the SAME count — the gate now tells the truth (X2 landed), so this equality is meaningful for the first time. Current true count is 12; four are transient `effort:` frontmatter failures from a concurrent plan (F3c) and are not yours. Report both runs.

### Step 15: DOCUMENT — one line in the file header recording that it fails closed on an unreadable instrument, and why. Do not touch `CLAUDE.md` — X2 already added the gate's line there and you would collide.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; the final parser code; all seven results; both `npm test` runs with counts and whether they matched; the Step 13 path enumeration. State explicitly whether any OTHER module in `src/` reads spawned output with an ANSI-naive or TAP-only regex — this is the second instance found, so assume there is a third until you have looked.

## Executor Verification (Steps 8-16)

- [x] Step 8 observed RED on cases 1–4 before `src/` was touched (cases 1, 2, 3, 4, 4b,
      plus 6a and 6d — the same bug in the coverage and skipped parsers)
- [x] Case 1 (spec reporter, NO colour) red first — this is not only a colour bug
- [x] `#|ℹ` alternation present; ANSI stripped in every output-reading function
      (`parseFailCount`, `hasTestSummaryEvidence`, `parseSkippedCount`, `parseCoveragePct`)
- [x] Unreadable fail count on a test check → NOT certified, with a named reason
- [x] Lint/typecheck with no fail line still passes — no false red introduced (case 5);
      and a non-node:test runner still passes (case 5b) — the false red the plan missed
- [x] Last-match ordering and absent-script tolerance both still proven by test (6a, 6b)
- [x] Both `npm test` runs reported with counts and an explicit match/no-match statement:
      plain and `FORCE_COLOR=3` both = tests 9719 / pass 9697 / fail 22 / skipped 0 /
      coverage 99.07% — EXACT MATCH. All 22 attributed, none to this plan's files.
- [x] `src/` swept for a third instance; result stated either way — NO third instance of
      the ANSI-naive/TAP-only GATING parser. Separate, real finding recorded below.
- [x] Step 13 SECURE done computationally: 80 input combinations, 0 fail-open paths
      (44 on the old parser, 12 of which certified clean over 8 real failures).

## Out-of-scope finding (reported, not fixed)

`src/lib/quality-agent.js` is NOT a third instance of this parser bug — its
`/(\d+)\s*(passed|passing)/i` (lines 311, 371) is UNANCHORED (so colour cannot break it)
and NON-GATING (it only increments a cosmetic `passCount`; the verdict comes from
`result.success`). But it has the SIBLING exposure this plan's comment describes: it
derives `passed` from the EXIT CODE ALONE, with no fail-count guard at all, so the same
exit-0 liar (`|| true`, `set +e`, a reporter that swallows the exit code) passes it
green. It also hardcodes `skipped: 0`, so it never enforces the "0 skipped" contract.
Its pass-count regex also cannot read node:test's `ℹ pass 8` shape, so `passCount`
silently reads 0 for any node:test project. Worth its own plan; outside this file scope.
