---
title: "X2 — THE GATE LIES: test-gate.js reports `fail 0` over 8 real failures under FORCE_COLOR"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/scripts/test-gate.js"
  - "tests/coverage-gate.test.js"
---

# X2 — the instrument that decides whether anything ships is reporting a number that is not true

## The defect, reproduced

`src/scripts/test-gate.js` reads node's summary with an anchored regex:

```js
const matches = [...String(summaryText).matchAll(/^\s*(?:#|ℹ)\s+fail\s+(\d+)/gm)];
return matches.length ? Number(matches[matches.length - 1][1]) : 0;
```

Node colorizes its output when `FORCE_COLOR` is set — **even when piped**. The real
line the gate receives is not `ℹ fail 8`, it is `ESC[34mℹ fail 8ESC[39m`. The `^`
anchor then matches the escape byte, not `ℹ`. Zero matches. The function returns
its no-match default: **`0`**.

Reproduced directly:

```
  plain node output      -> fail 8   (correct)
  colorized node output  -> fail 0   <-- REPORTS ZERO. 8 TESTS ARE FAILING.
```

**The gate reports zero failures while eight tests fail.**

It currently exits non-zero **only by accident**: `parseCoveragePct` is broken by
the *same* ANSI-naive anchoring, returns `null`, and the coverage-null guard
trips. The gate fails for the wrong reason and prints the wrong story. **Fix the
coverage parse alone — an obvious, well-meant change — and `npm test` reports
GREEN over real failures and real skipped tests.**

The same defect hits `parseSkipped` (`/^\s*(?:#|ℹ)\s+skipped\s+(\d+)/gm`), so the
zero-skipped gate is equally blind.

Found independently by two executors running under `FORCE_COLOR=3`, then
reproduced in isolation. This is not a hypothesis.

## Why this outranks everything else

Every quality claim in this repository is downstream of this function. The
coverage floor of 99, the zero-skipped gate, `# fail 0` — the whole apparatus
reports through a parser that silently returns `0` when it cannot read its input.
`0` is indistinguishable from "everything passed."

**A parser whose no-match default is the success value is a false-green machine.**
That is the same defect class as `secret-scout` returning `pass` for a credential
format it has no pattern for: absence of evidence rendered as evidence of absence.

## The second-order defect: the test tests the wrong input

`tests/coverage-gate.test.js` exists and exercises these parsers. **Not one
fixture contains an ANSI escape sequence.** Verified: zero occurrences of the
escape byte, ``, `\x1b`, or `\033` in the file.

Its own header says:

> *"parsers are additionally exercised against BOTH the TAP-style (`# skipped 0`)
> and the Node "spec" reporter (`ℹ skipped 0`) summary shapes, so the instrument..."*

It reasoned carefully about reporter *shape* and never considered reporter
*colour*. So it proves the parser works on input the parser never receives in
production, and it has been green throughout. This is operating lesson 6 —
*test the behaviour, not the structure* — failing on the gate itself.

## The fix

1. **Strip ANSI before parsing.** One helper, applied at the top of
   `parseFail`, `parseSkipped`, `parseCoveragePct`. No new dependency — a literal
   `RegExp` over the CSI grammar, built with `String.fromCharCode(27)` so the
   source file carries no raw control byte.
2. **Make the no-match default LOUD, not silent.** This is the real lesson and it
   matters more than the strip. `parseFail` returning `0` on no-match means
   "unparseable" and "perfect" are the same value. They must not be. Return
   `null` on no-match and make `evaluateSummary` FAIL CLOSED on `null` with the
   reason *"could not read the fail count — the gate cannot certify this run"*.
   A gate that cannot read its instrument must never say green.
3. **Belt and braces: set `NO_COLOR=1` / `FORCE_COLOR=0` in the spawn env.** Do
   this IN ADDITION to (1) and (2), never instead. Controlling the environment is
   the fix for *this* cause; failing closed is the fix for *the next* one.

## Decisions Taken Under Ambiguity

1. **Fail closed on unparseable rather than defaulting to 0.** The minimal fix is
   the ANSI strip alone. Rejected as insufficient: it repairs the one cause we
   happened to find and leaves the structural defect — a success-valued default on
   a parse failure — waiting for the next output-format change. Node's reporter
   format is not our contract; the gate must survive it changing.
2. **Strip ANSI rather than only forcing `NO_COLOR` in the spawn.** Rejected as
   sole fix: a user, a continuous-integration runner, or a wrapper can re-inject
   colour through env inheritance, and the gate would silently break again. Do
   both.
3. **`parseCoveragePct` already returns `null` on no-match and the guard already
   fails closed — that is why the gate exits non-zero today.** That existing
   behaviour is CORRECT and is the model for the other two. Copy it; do not
   "harmonise" the three parsers by making coverage return 0.
4. **No new dependency.** `strip-ansi` would solve this in one import. The repo's
   standing rule is stdlib and what is already installed; a literal CSI regex is
   ten lines and the gate must never fail to load.

### Added by the executor during Steps 10–14

5. **The ANSI pattern in `src/` is a LITERAL RegExp using `\x1b` escapes, not
   `new RegExp(String.fromCharCode(27) + …)`.** The plan specified building it with
   `String.fromCharCode(27)`. Building it that way in `src/` requires the
   `RegExp` constructor over a non-literal, which trips
   `security/detect-non-literal-regexp` — an ERROR in `src/` under
   `--max-warnings 0` (the tests-only override at `eslint.config.js:170` does not
   apply). That would have added a NEW lint error, and warnings are bugs. A literal
   regex with `\x1b` escapes satisfies the plan's actual INTENT — no raw control
   byte in the source, since `\x1b` is four printable characters — and
   `no-control-regex` is off repo-wide (`eslint.config.js:106`). The TEST file still
   uses `String.fromCharCode(27)` exactly as specified (and is exempt from the rule).

6. **`stripAnsi` is NOT exported.** Nothing outside the module calls it; the three
   parsers use it internally and the tests exercise it THROUGH them on real
   colorized fixtures. A test is not a caller, so exporting it would add unreachable
   surface (the export fence's rule). The module contract stays: the gate decision
   plus its parsers.

7. **`evaluateSummary`'s parameter defaults changed from `fail = 0, skipped = 0` to
   `fail = null, skipped = null`.** An ABSENT key was itself a success-valued
   default — the same defect one level up. `evaluateSummary({})` and
   `evaluateSummary(undefined)` now fail closed on all three instruments.

8. **A negative count (`fail: -1`) still passes and was deliberately left alone.**
   Exhaustive enumeration (1331 combinations) found it. It is UNREACHABLE by
   construction: the capture group is `(\d+)`, which cannot capture a sign —
   `parseFail('ℹ fail -1')` returns `null` (verified), so the parsers emit only
   `null` or a non-negative integer, and `main()` is the only production caller.
   Guarding it would change "the definition of what counts as a failure", which this
   plan explicitly forbids. Reported rather than silently widened.

9. **One pre-existing assertion was TIGHTENED, not weakened:**
   `parseSkipped('no summary here')` asserted `0` and now asserts `null`. That
   assertion encoded the exact defect X2 exists to kill (a no-match default equal to
   the success value). Per Decision 1 the contract is explicitly replaced; the change
   moves the test toward the real fail-closed behaviour. No test was weakened,
   skipped, or deleted.

## Test Plan (TDD-Red first)

Extend `tests/coverage-gate.test.js`. Zero doubles — feed the parsers the LITERAL
bytes node emits under colour. Build fixtures with `String.fromCharCode(27)` so no
raw control character enters the source file.

Write FIRST, observe RED:

1. **`parseFail reads a colorized fail line`** — feed `ESC[34mℹ fail 8ESC[39m`.
   Expect `8`. Currently returns `0` → **red, and this is the bug**.
2. **`parseSkipped reads a colorized skipped line`** — same shape. Currently `0` → red.
3. **`parseCoveragePct reads a colorized coverage row`** — feed
   `ESC[32mℹ all files | 99.07 |ESC[39m`. Currently `null` → red.
4. **`an unreadable summary FAILS the gate, it does not pass it`** — feed
   `evaluateSummary` a summary whose fail count could not be parsed. It must fail
   with a reason naming the unparseable instrument. Currently a no-match yields
   `0` which reads as success → red. **This is the assertion that matters most.**
5. **`the TAP and plain shapes still parse`** — the existing plain-text cases must
   stay green. The strip must not break the uncoloured path.
6. **`end-to-end: the gate spawned under FORCE_COLOR=3 over a failing suite exits non-zero AND names the failure count`** — the only test that proves the real thing. Spawn the real gate against a fixture suite with a known failure, with `FORCE_COLOR=3` in the env, and assert both the exit code and that the printed count is the true one. A unit test on the parser is not enough; that is exactly how this shipped.

## Execution Plan (Steps 8-16)

### Step 8: TEST — add all six cases to `tests/coverage-gate.test.js`. Run. Cases 1–4 MUST fail. Quote the literal red. Do not touch `test-gate.js` before you have seen red — this whole plan exists because a green test hid a broken parser.

### Step 9: PREPARE — read `src/scripts/test-gate.js` IN FULL. Identify every regex that reads spawned output; the plan names three but there may be more. Read `tests/coverage-gate.test.js` IN FULL. Confirm with your own command that the current `npm test` is reporting `fail 0` while node reports 8 — do not take this plan's word for it.

### Step 10: IMPLEMENT — (a) the ANSI strip helper, applied in all output-reading parsers; (b) `parseFail` and `parseSkipped` return `null` on no-match and `evaluateSummary` fails closed on `null`; (c) `NO_COLOR=1`, `FORCE_COLOR=0` in the spawn env. Do not change the coverage threshold. Do not change what counts as a failure. Only how the numbers are read and what happens when they cannot be.

### Step 11: REVIEW — re-read the diff. Confirm the no-match default is `null` everywhere, that `evaluateSummary` treats `null` as failure with a distinct reason per instrument, and that no threshold moved.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — this IS the security-relevant step. The gate is the control that stops unreviewed and unverified code shipping. Confirm no path through `evaluateSummary` returns "pass" when any input is `null`. Enumerate the paths explicitly in the report.

### Step 14: VERIFY — `node --test tests/coverage-gate.test.js` → all cases green. Then run `npm test` TWICE and report both: once with `FORCE_COLOR=3` set, once with it unset. **Both must report the SAME failure count.** That equality is the proof. Then report the true failure count. Expect 8: doc-count (2), dead-export (3), iron-loop-enforcer (1), ESLint (1), typecheck (1). Note ESLint's composition has moved — it is now hashbang / `no-process-exit` / irregular-whitespace, NOT the `ALLOWED_TOOLS` error earlier reports named.

### Step 15: DOCUMENT — `CLAUDE.md` says `npm test` is "THE GATED ENTRY POINT". Add one line recording that the gate fails closed when it cannot read its own instrument, and why. Keep it to a sentence; the code and its tests are the real documentation.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; the final parser code; all six results; both `npm test` runs side by side with their counts; and an explicit statement of whether the two counts matched. If they did not match, the fix has NOT landed regardless of test colour — say so plainly.

## Executor Verification (Steps 8-16)

- [x] Step 8 observed RED on cases 1–4 before `test-gate.js` was touched — literal red for case 1 was `AssertionError: 0 !== 8`; case 6 reproduced the production defect end-to-end (`[CTOC test-gate] coverage unmeasured (threshold 80%), skipped 0, failed 0` while node emitted `ℹ fail 2` and `ℹ all files | 100.00`)
- [x] No-match default is `null` — NOT `0` — in every output parser (`parseFail`, `parseSkipped`; `parseCoveragePct` already correct and left as the model)
- [x] `evaluateSummary` fails closed on `null`, with a reason naming the instrument — proven by exhaustive enumeration of 1331 combinations, 0 false-green violations
- [x] No threshold, floor, or failure definition changed (floor still 99; `> 0` semantics untouched; see Decision 8 on the unreachable negative case)
- [x] `npm test` run BOTH with and without `FORCE_COLOR=3`; counts reported side by side; equality stated explicitly — both `failed 12`, identical 12-test failure sets, exit 1, reason `# fail 12 > 0`
- [x] No new dependency added (literal CSI/OSC regex; `strip-ansi` deliberately not used)

### Step-by-step (8–16)

- [x] Step 8 TEST — six cases written FIRST, run, RED observed and quoted (cases 1–4 + 6 red; case 5 correctly green)
- [x] Step 9 PREPARE — `test-gate.js` read in full; all three output-reading regexes identified (no fourth); premise independently reproduced (gate printed `failed 0` while node printed `ℹ fail 8`)
- [x] Step 10 IMPLEMENT — (a) ANSI strip in all three parsers, (b) `null` no-match + fail-closed `evaluateSummary`, (c) `NO_COLOR=1`/`FORCE_COLOR=0` in the spawn env
- [x] Step 11 REVIEW — diff re-read; null default confirmed everywhere; distinct reason per instrument; no threshold moved
- [x] Step 12 OPTIMIZE — n/a per plan
- [x] Step 13 SECURE — 1331-combination enumeration; no path returns `ok: true` with any unreadable input; `evaluateSummary(undefined)`/`({})` both fail closed
- [x] Step 14 VERIFY — 28/28 in `coverage-gate.test.js`; lint clean on both touched files; FILE reachability fence 5/5; EXPORT fence unchanged at 3 pre-existing failures; both `npm test` runs agree
- [x] Step 15 DOCUMENT — one sentence added to `CLAUDE.md` under Test & Verify
- [x] Step 16 FINAL-REVIEW — reported literally, including the 8→12 drift caused by concurrent agents
