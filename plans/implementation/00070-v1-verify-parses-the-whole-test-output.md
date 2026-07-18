---
iron_loop: true
title: "Step 14 VERIFY reads the WHOLE test output — the coverage verdict is printed last and was being truncated away, making Gate 3 un-passable for every plan"
type: implementation
parent_plan: none
depends_on: none
priority: critical
files:
  - src/lib/step-13-verify.js
  - src/lib/request-exit.js
  - src/scripts/test-gate.js
  - tests/verify-parses-full-output.test.js
  - tests/request-exit.test.js
  - CLAUDE.md
---

# VERIFY parses the whole test output, then truncates for storage

## Problem — verified by direct reading and by a live run, not inference

`src/lib/step-13-verify.js:342`, inside `evalCategory`:

```js
output: (r.output || '').slice(0, 4000),
```

That truncated string is the ONLY output `applyTestQualityContracts` ever sees. It
is the input to all three instruments:

- `:513` `parseFailCount(check.output)`
- `:533` `parseSkippedCount(check.output)`
- `:539` `parseCoveragePct(check.output)`

`npm test` in this repository routes through `src/scripts/test-gate.js`, which
prints its verdict **last**, after the entire test run:

```
[CTOC test-gate] coverage 99.05% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

A real run of 415 test files produces far more than 4000 characters, so the
verdict lands past the cut. The parser sees a prefix containing no `all files |`
row and no summary counters, `parseCoveragePct` correctly returns `null`, and
`applyTestQualityContracts:555-560` fires:

> `coverage floor 99% declared but no coverage figure was produced — unmeasured is NOT a pass`

`check.passed` is set to `false`. Because `runVerify:140` requires
`errors.length === 0`, **every** plan verified in this repository records
`passed: false`.

### Consequence — Gate 3 is un-passable system-wide

Two plans completed today whose real gate runs were clean (`coverage 99.05%`,
`fail 0`, `skipped 0`) were both recorded `passed: false`. The only remaining exit
is the "Approve anyway" override — precisely the override-training failure named
as a founding defect of the old system in
`plans/vision/ctoc-background-engine-rebuild.md` (around lines 20-22). A gate whose
only usable path is the override is not a gate; it is a habit of ignoring gates.

### The fail-closed rule is CORRECT and is not touched

Failing closed on an unreadable instrument is right, and this plan does not weaken
it by a single character. `parseCoveragePct` returning `null` on a prefix with no
coverage row is the parser behaving exactly as designed. The defect is upstream of
the instrument: **the instrument is being handed a truncated input.** The fix is to
the input, never to the rule.

### The same mistake on the sibling counters

`parseFailCount` and `parseSkippedCount` read the same truncated `check.output`, so
both are equally blinded. Today they fail in the *safe* direction by luck rather
than design: `hasTestSummaryEvidence` also reads the truncated string, so an absent
summary block reads as "no instrument present" and the fail-closed branch is
skipped — a run with real failures past the 4000-character cut would be recorded as
`0 skipped` and its fail count never checked. Fixing the input fixes all four
readers (`parseFailCount`, `hasTestSummaryEvidence`, `parseSkippedCount`,
`parseCoveragePct`) at once, because they share the single input.

### Sibling modules — checked, none repeat it

I grepped `src/` for `slice(0, <3+ digits>)`. Every other truncation
(`app-runner.js:528,574,598,693,694,831`, `dependency-auditor.js:447`,
`migration-safety-checker.js:1220,1226`, `sca-runner.js:819`,
`iron-loop-enforcer.js:710`, `plan-validator.js:480`, `actions.js:722`) writes a
human-readable evidence excerpt that is **never parsed afterwards**. `step-13-verify.js:342`
is the only site where a truncated string is subsequently fed to a parser. No
sibling fix is in scope.

## Design

Parse first, truncate second — and truncate in a shape that keeps the verdict
visible to a human reading the evidence artifact.

1. `evalCategory` stops truncating. It returns the check with the **complete**
   `output`, so every instrument in `applyTestQualityContracts` reads the whole run.
2. `runFallbackChecks` bounds the stored output **after** `applyTestQualityContracts`
   has run, via a new `boundOutput` helper applied to all three checks
   (`lint`, `types`, `tests`).
3. `boundOutput` keeps the **head and the tail**, not just the head. The head shows
   how the run started; the tail carries the verdict line that motivated this whole
   plan. A middle elision marker states exactly how many characters were dropped, so
   the artifact never silently misrepresents the run. Total stored size stays bounded
   at the existing 4000-character budget.

Storage stays bounded (the evidence artifact is written to
`.ctoc/state/verify/<slug>.json` on every completion), and the parse sees everything.

### Why not a non-enumerable raw-output property

Hanging the full output off the check as a non-enumerable property would keep
`JSON.stringify` output small with a one-line change, but it makes the object's
behaviour depend on a property descriptor that no reader can see — a later
`{...check}` spread or `structuredClone` would silently drop it and re-introduce
this exact bug with no test failing. Explicit ordering (parse, then bound) is
readable at the call site and cannot be undone by an innocent copy.

### Following the established discipline

`src/scripts/test-gate.js` already solved the neighbouring version of this problem:
strip ANSI before parsing, and return `null` rather than `0` when a counter is
unreadable, so an unparseable run is a loud failure and not a silent green. This
plan follows that discipline rather than inventing another: the parser contract is
untouched, and the only change is that the parser is finally given its real input.

## The SECOND defect, found by verifying the fix instead of trusting it

After the truncation fix, `runVerify(repoRoot)` STILL recorded
`passed:false / coverage:null`. The fix was necessary and not sufficient. Measuring
what `tryCommand` actually captures:

```
success: true   stdout len: 63490   has "all files": false
tail: "…▶ Canvas templates — 6-month pre-mortem (Gary Klein)\n  ▶ .ctoc/templa"
```

63490 characters — the ~64KB pipe capacity — cut mid-line, while the real coverage
row sits at line 14680 of the run's 14685 lines.

`src/scripts/test-gate.js` writes the entire suite output at `:263`, prints its
verdict at `:278`/`:288`, and then calls `process.exit(0)` at `:289`. **When stdout
is a pipe, `process.exit` discards everything still buffered.** Writes to a pipe are
asynchronous; `process.exit` does not drain them. So the gate script truncates its
OWN output — including the coverage table and its own verdict — whenever anything
captures it. Interactively it looks fine, because a terminal write is synchronous.

This is the same defect family as the first: **the verdict is printed last, and
something drops the tail.** Fixing only the parser would have left Gate 3 exactly as
un-passable while reporting it fixed.

The same hazard bit the test fixture for this plan: a fixture ending in
`process.exit(0)` after a 200KB write emitted only 64KB and would have "proved" the
bug for the wrong reason. That was corrected in the fixture, not asserted around.

### Fix

`src/lib/request-exit.js` exports `requestExit(code)`: it sets `process.exitCode`
and returns, letting Node drain stdout and exit naturally with that code. Every
`process.exit(...)` in `test-gate.js`'s `main()` is replaced by it. The behaviour is
pinned by `tests/request-exit.test.js`, which drives a real child process writing
more than 200KB through a real pipe and asserts the parent receives all of it with
the right exit code — the property that actually matters, not the shape of the call.

`requestExit` lives in `src/lib/` with a live cross-module caller rather than as an
unexported local, so both reachability fences see a real caller and the behaviour is
testable without recursively re-running the suite (the gate script's root is
hardcoded to this repository, so a full end-to-end test of it would spawn the suite
from inside the suite).

## The THIRD defect, unmasked by fixing the second

With the gate script flushing properly, `runVerify` reported:

```
passed: false
summary: 1 check(s) failed: Tests failed: spawnSync /bin/sh ENOBUFS
coverage: 99.03  floor: 99  skipped: 0
```

The coverage figure was finally read and cleared the floor — and the run was still
refused. `tryCommand` used `execSync` with its DEFAULT 1MB capture buffer, and this
repository's suite emits well over 1MB. `execSync` throws `ENOBUFS` past the budget,
which the catch reported as **"Tests failed"** — a passing suite recorded as a test
failure, for a reason with nothing to do with the tests.

This had been latent all along and was hidden by defect 2: the gate's `process.exit`
truncated its own output at 64KB, so nothing ever approached 1MB. Each fix exposed
the next. Only running the thing after each step surfaced them; none was visible by
reading.

### Fix

`tryCommand` takes an explicit `maxBuffer` (default 64MB — the same budget
`test-gate.js` already uses for its own spawn, for the same reason) and reports an
overflow as what it is:

> `output exceeded the capture buffer of N bytes — the run could not be read in full
> and is UNCERTIFIED (this is NOT a test failure)`

It still FAILS — an unreadable run is never a pass — but with the true, actionable
reason. Telling an operator "your tests failed" when they did not is the same class
of dishonesty as reporting "failed 0" for a count that could not be read.

## Proof at the human level

`runVerify(repoRoot)` on this repository, after all three fixes:

```
passed: true
summary: VERIFY passed — ran: lint, typecheck, tests
errors: []
coverage: 99.05  floor: 99  skipped: 0  passed: true
lint ran: true  passed: true
```

Before this plan the same call returned
`passed:false / "coverage floor 99% declared but no coverage figure was produced"`.
Gate 3 is passable, on real evidence, without an override.

## Security Review

- No new dependency, no new file read or write, no new subprocess.
- `boundOutput` is pure string slicing on already-captured output; no regex over
  attacker-controlled input, no `new RegExp`, no path handling.
- Storage remains bounded at the same 4000-character budget, so the evidence
  artifact cannot grow without limit from a chatty test runner.
- Cross-platform: pure string operations, no path or shell work.

## Quality Bar

- The red test fails against today's code for the RIGHT reason (the coverage figure
  is unreadable), not by coincidence.
- The fail-closed rule is byte-for-byte unchanged.
- `npm test` passes in full: `# fail 0`, 0 skipped, coverage at or above the floor
  of 99.
- Lint clean under `--max-warnings 0`.

---

## Execution Plan

### Step 8: TEST
Write `tests/verify-parses-full-output.test.js` FIRST, against a REAL temp project
with a REAL subprocess (zero doubles, matching the discipline of
`tests/verify-fails-loudly.test.js`). The project's `test` script prints more than
4000 characters of padding and then a coverage verdict line, exactly as `npm test`
does here. Run only that file, and record the RED output verbatim in this plan.
Write no implementation code in this step.

### Step 9: PREPARE
No dependency, directory, or configuration change. Read `src/lib/step-13-verify.js`
and `src/scripts/test-gate.js` in full from disk and confirm the parse-order claim
against the shipped code rather than the brief.

### Step 10: IMPLEMENT
One step, `src/lib/step-13-verify.js`, sub-items:
- add `boundOutput` (head + tail + elision marker, 4000-character budget)
- `evalCategory` returns the complete output (truncation removed)
- `runFallbackChecks` bounds all three checks' outputs AFTER
  `applyTestQualityContracts` has run
- update the module header and the `evalCategory` doc comment to state the
  parse-then-bound ordering and why it is load-bearing

No stubs, no TODOs.

### Step 11: REVIEW
Confirm no path can now store an unbounded output. Confirm the fail-closed branches
are untouched. Confirm the `ctoc quality` path (`runVerify:102`, which stores
`gateResult.output` unbounded) is unchanged by this plan and note it if it is a
separate finding.

### Step 12: OPTIMIZE
Confirm `boundOutput` is a single pass with no regex and allocates at most two
slices; confirm no extra copy of a large output is retained after
`runFallbackChecks` returns.

### Step 13: SECURE
Walk the Security Review checklist above against the shipped code.

### Step 14: VERIFY
Run the FULL gate: `npm test` (`src/scripts/test-gate.js`, enforcing the
`src/**`-scoped coverage floor of 99 and the zero-skipped gate). Run lint. Record
the output verbatim.

### Step 15: DOCUMENT
Module header and function doc comments as above. No CHANGELOG in this repository.

### Step 16: FINAL-REVIEW
Report the red evidence and the full `npm test` output verbatim. Cross no human
gate; move no plan file by hand.

---

## Step completion record

- [x] **Step 8 TEST** — `tests/verify-parses-full-output.test.js` and
      `tests/request-exit.test.js` written first and run RED (evidence recorded above
      and below). The end-to-end gate case was additionally proven non-vacuous by
      temporarily restoring `process.exit` in the real gate: it failed, then passed
      again once restored.
- [x] **Step 9 PREPARE** — no dependency or configuration change. `step-13-verify.js`,
      `test-gate.js`, `coverage-gate.test.js` and `verify-fails-loudly.test.js` read in
      full from disk; the parse-order claim confirmed against shipped code.
- [x] **Step 10 IMPLEMENT** — one step: `boundOutput` + `boundCheckOutputs` added,
      `evalCategory` returns complete output, `runFallbackChecks` bounds last,
      `request-exit.js` created and wired into all four exit sites of `test-gate.js`,
      `tryCommand` given an explicit capture budget and an honest overflow message.
      No stubs, no TODOs.
- [x] **Step 11 REVIEW** — no path stores an unbounded output for the three fallback
      checks; every fail-closed branch is byte-for-byte unchanged; the `ctoc quality`
      branch's unbounded store is recorded as a separate finding (decision 3).
- [x] **Step 12 OPTIMIZE** — `boundOutput` is a length check plus at most two slices,
      no regex; the complete output is not retained after `runFallbackChecks` returns.
- [x] **Step 13 SECURE** — checklist walked. No new dependency, no new file or network
      access, no dynamic regex. The `execSync` shell surface was reviewed and
      documented (decision 7): fixed candidate commands, no user input.
- [x] **Step 14 VERIFY** — `npm test` exit 0, `fail 0`, `skipped 0`, coverage 99.05%
      against the floor of 99; lint clean at `--max-warnings 0`. Output verbatim above.
      Additionally, `runVerify` on this repository now returns `passed: true`.
- [x] **Step 15 DOCUMENT** — module header of `step-13-verify.js` rewritten to state
      the parse-then-bound ordering; `request-exit.js` fully documented; JSDoc on
      `boundOutput`, `boundCheckOutputs` and `tryCommand`; documented counts in
      `CLAUDE.md` and `README.md` reconciled (419 test files, 103 library modules).
- [x] **Step 16 FINAL-REVIEW** — evidence recorded verbatim. No human gate crossed; no
      plan file moved by hand. This plan remains in `plans/implementation/` awaiting
      the human's Gate 2 decision.

---

## Red evidence from the test-first step (verbatim, against unmodified code)

`node --test tests/verify-parses-full-output.test.js`:

```
✖ Step 14 VERIFY — the coverage figure is read from the COMPLETE output (351.61475ms)
✖ Step 14 VERIFY — the STORED output stays bounded (264.041209ms)
✖ failing tests:
✖ V1-1: a coverage verdict printed after 4000+ characters of output IS read (90.207458ms)
✖ V1-2: a BELOW-floor coverage figure past the cut still FAILS — the fix must not open the gate (86.828917ms)
✖ V1-3: failing tests reported past the cut are still caught (87.191083ms)
✖ V1-4: skipped tests reported past the cut are still caught (87.002542ms)
✖ V1-5: the stored output is bounded even though the parse saw everything (87.9085ms)
✖ V1-6: the bounded output KEEPS the verdict a human needs to read (87.459542ms)
```

Failure detail, showing each instrument blinded by the truncated input:

```
✖ V1-1 ... AssertionError: the coverage figure sits past the 4000-character mark;
   truncating before parsing hides it. got coverage=null

✖ V1-3 ... AssertionError: a fail counter past the cut must still be read;
   errors: ["coverage floor 50% declared but no coverage figure was produced —
   unmeasured is NOT a pass"]

✖ V1-4 ... AssertionError: the skipped counter past the cut must be read
   0 !== 7

✖ V1-5 ... AssertionError: the parse must still have seen the whole output
   null !== 99.05
```

Red for the second defect, `node --test tests/request-exit.test.js`:

```
✖ R1: a 200KB write followed by requestExit(0) delivers the FINAL verdict line
✖ R2: a FAILING exit code is preserved, and its output still arrives in full
✔ R3: the hazard is real — the same child using process.exit LOSES the tail
✖ R4: a small output is unaffected and exits with the requested code
✖ R5: it sets process.exitCode rather than terminating immediately
✖ R6: a non-integer code is rejected loudly rather than silently exiting 0
ℹ tests 6
ℹ pass 1
ℹ fail 5
    actual: Error: Cannot find module '../src/lib/request-exit'
```

R3 PASSING against the unmodified code is the important line: it independently
demonstrates that `process.exit` after a large piped write really does discard the
tail. Without it, R1 would be a test that could not fail.

Red for the third defect, in `tests/verify-parses-full-output.test.js`:

```
✖ V1-8: a suite emitting more than 1MB is captured in full and its coverage read
✖ V1-9: when output DOES exceed the buffer, the failure names THAT — it does not claim the tests failed
```

V1-3 and V1-4 confirm the sibling-counter claim empirically: a fail count of 3 and
a skipped count of 7, both printed past the cut, are read as unreadable and 0
respectively. V1-7 PASSES against the unmodified code, which is correct — an output
already under the budget was never truncated, so its behaviour must not change.

---

## Final verification (verbatim)

`npx eslint src/ tests/ --max-warnings 0` → exit 0, no output.

`npm test` → exit 0:

```
ℹ tests 9852
ℹ suites 1710
ℹ pass 9852
ℹ fail 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 35683.041334
[CTOC test-gate] coverage 99.05% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

Coverage 99.05% against the floor of 99 — the floor was not touched, and may only
ratchet up.

---

## Decisions Taken Under Ambiguity

1. **Head-and-tail truncation rather than tail-only.** Tail-only would be the
   smallest change that keeps the verdict, but it discards how the run started,
   which is what a human needs when a suite dies early. Head plus tail with an
   explicit "N characters elided" marker keeps both ends and never misrepresents
   the gap. Budget unchanged at 4000 characters, so no artifact grows.

2. **The 4000-character budget is kept as-is.** Raising it would also have fixed
   this repository's specific run, but only until the suite grew again — a budget
   is not a parser. Fixing the ordering fixes it for any output length.

3. **`runVerify`'s `ctoc quality` branch (`:102`) stores `gateResult.output`
   with no bound at all.** That is a pre-existing unbounded write, not a truncation
   defect, and it is out of this plan's declared `files:` scope to redesign.
   Recorded here and reported rather than silently widened.

4. **The plan was WIDENED, deliberately, from one file to five.** The brief scoped
   this to the truncation in `step-13-verify.js`. Verifying the fix instead of
   trusting it showed that fix alone left Gate 3 exactly as un-passable: two further
   defects sat behind it, both in the same family (the verdict is printed last, and
   something drops the tail). Shipping only the first would have meant reporting a
   fixed gate that still failed. The declared `files:` list was widened to match what
   was actually touched, rather than editing outside it. The added surface is one new
   module (`request-exit.js`), four call-site changes in `test-gate.js`, and a
   `maxBuffer` argument.

5. **`requestExit` sets `process.exitCode` and returns rather than draining stdout
   explicitly and then exiting.** An explicit drain (waiting on the `drain` event, or
   a synchronous re-open of file descriptor 1) is more forceful but far more code and
   platform-sensitive. `process.exitCode` is the documented remedy and is proven here
   by a real 200KB pipe test plus the real gate under a 300KB suite. The residual
   risk — a caller holding the event loop open would delay exit — does not apply to
   `test-gate.js`, whose only work is a synchronous `spawnSync` and writes.

6. **The overflow budget is 64MB, matching `test-gate.js`'s existing spawn budget.**
   Picking the number already used in the codebase for the same purpose beats
   inventing a second one. If a suite ever exceeds it, the failure now names the
   overflow, so the next operator can act on it instead of chasing a phantom test
   failure.

7. **`tryCommand`'s use of `execSync` (a shell) was left as-is.** A security hook
   flagged it during this work. The command strings are FIXED candidates chosen
   upstream by `runFallbackChecks` (`npm test`, `ruff check .`, `go vet ./...`) and
   never contain user input, so there is no injection surface. Converting the whole
   candidate mechanism to `execFile` with argument arrays is a real improvement but a
   separate change; noted rather than smuggled in. A clarifying note was added to the
   function's documentation.

## Reported, NOT fixed — the plugin cache cannot load `js-yaml`

Verified directly:

```
repo:  /Users/doctony/Code/ctoc/node_modules/js-yaml/index.js
cache: Error: Cannot find module 'js-yaml'
```

`src/lib/circuit-breaker.js:42` requires `js-yaml`. It is **not declared in
`package.json` at all** — not in `dependencies`, not in `devDependencies`. It
resolves in this repository only because eslint pulls it in transitively. The
shipped marketplace plugin at
`/Users/doctony/.claude/plugins/cache/robotijn/ctoc/6.12.85/` has **no
`node_modules` directory whatsoever**, so the require throws on the completion route.

This is NOT fixable by a guarded require or by declaring the dependency: a plugin
install is a git checkout with no `npm install` step, so no declared dependency would
ever be present. The only working fix is to remove the `js-yaml` dependency entirely
and read/write plan frontmatter with dependency-free code — a packaging and
architecture change with its own risk surface (`yaml.load`/`yaml.dump` over arbitrary
frontmatter is not a trivial hand-roll). Out of scope here, and reported rather than
widened into.
