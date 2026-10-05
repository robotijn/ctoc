---
iron_loop_verdict: true
iron_loop: true
title: "The test gate fails on a suite that crashes while loading"
type: implementation
created: 2026-10-05
priority: high
effort: medium
depends_on: none
files:
  - src/scripts/test-gate.js
  - tests/coverage-gate.test.js
  - src/lib/false-green-scan.js
  - tests/false-green-fence.test.js
  - .ctoc/false-green-baseline.json
  - CLAUDE.md
approved_by: human
approved_at: 2026-10-05T19:26:55.593Z
gate_crossed: implementation → todo
---

# The test gate fails on a suite that crashes while loading

## Problem Statement

`npm test` runs the test gate, which decides pass or fail from the printed fail count, skipped count and coverage, and never reads the test runner's exit status. On Node v24 a test file whose `describe` body throws reports fail 0 and exits 0, and one whose `before()` hook throws reports fail 0 and exits 1; the gate prints PASS for both, so a whole test file can stop testing anything without anyone noticing. This hurts the owner and every later change, because a green `npm test` is what the verification step and the owner's decision to call work done rely on. The security scan of the tool-grant test reproduced both crashes and recorded them in `.ctoc/audit/tool-grant-run-notes/s1-step13-secure-d-tg-s1-step13.md`. Fixed means the gate fails, with a printed reason naming the runner, when the runner exits non-zero, is ended by a signal, or prints a top-level failure, and the false-green scanner gains a check for code that reads a child process's output but never its exit status.

## Scope

This plan changes the test gate `src/scripts/test-gate.js`, the false-green scanner `src/lib/false-green-scan.js`, their two test files, the false-green baseline (one whitelist entry on the recommended answer; its debt list is untouched), and two paragraphs of `CLAUDE.md`. It does not change `src/lib/app-runner.js` unless the owner picks the second or third answer to the question below, and it does not change the copied counter parsers in `src/lib/step-13-verify.js` and `src/lib/quality-agent.js`, listed under "Neighbours"; when those are built is the owner's decision.

Written by the implementation planner on 2026-10-05, dispatched by the CTO Chief session.
Everything below was read from files in this repository; nothing was run. Claims are
labelled **read**, **believed** or **to verify**.

## Why

`npm test` runs `src/scripts/test-gate.js`, the one command that enforces the coverage
floor and the zero-skipped rule. Its `main()` (read, lines 388-468) spawns
`node --test --experimental-test-coverage --test-coverage-include=src/** <files>`, joins
standard output and standard error, and decides from three parsed counters: `fail`,
`skipped`, coverage. It never reads the child's exit status (`result.status` appears
nowhere in the file; `result.error` is the only field of the result it checks).

The security scan of the tool-grant test reproduced two crashes this gate passes, on
Node v24.14.1 (source: the scan's findings titled "An unreadable agent file or a missing
`agents/` folder produces '0 tests, 0 failed, exit 0'" and "The test gate cannot see a
suite that fails while loading", in
`.ctoc/audit/tool-grant-run-notes/s1-step13-secure-d-tg-s1-step13.md`):

- a `describe` body that throws: the runner reports `fail 0` and exits 0;
- a `before()` hook that throws: the runner reports `fail 0` and exits 1.

Both read as green. A whole test file can stop testing anything and the gate still
prints PASS: the false-green shape this repository fences, one field to the left of the
counters it already guards.

## Implementation Details

### `src/scripts/test-gate.js`

1. **A pure decision on the runner itself**, beside `evaluateSummary`:

   ```js
   /**
    * The runner's verdict on itself: how it exited, and whether it printed a top-level
    * failure. Node can print `fail 0` for a suite that crashed while loading (v24: a
    * describe body that throws exits 0; a failing before() hook exits 1), so the
    * counters alone cannot certify a run. Pure; never throws.
    * @param {{status?: number|null, signal?: string|null, output?: string}} run
    * @returns {{ok: boolean, reasons: string[]}}
    */
   function evaluateRunner(run) {
     const { status, signal = null, output = '' } = run || {};
     const reasons = [];
     if (signal) {
       reasons.push(`the test runner was ended by signal ${signal} — the gate cannot certify this run`);
     } else if (typeof status !== 'number') {
       reasons.push('could not read the test runner\'s exit status — the gate cannot certify this run');
     } else if (status !== 0) {
       reasons.push(`the test runner exited with status ${status} — a suite can fail while loading and still report fail 0`);
     }
     const clean = stripAnsi(output);
     const top = clean.match(TOP_LEVEL_FAILURE);
     if (top) reasons.push(`the runner printed a top-level failure: ${top[0].slice(0, 160)}`);
     if (FAILING_TESTS_BLOCK.test(clean)) reasons.push('the runner printed a "failing tests:" block');
     return { ok: reasons.length === 0, reasons };
   }
   ```

   With two literal patterns (literal, because `src/` enforces the non-literal
   regular-expression rule at error):

   ```js
   // A failure printed at column 0: the Test Anything Protocol's `not ok`, or the spec
   // reporter's failure mark on a top-level test or suite. Nested failures are indented.
   const TOP_LEVEL_FAILURE = /^(?:not ok\b|✖ (?!failing tests:)).*$/m;
   // The spec reporter's closing list of failures.
   const FAILING_TESTS_BLOCK = /^✖ failing tests:\s*$/m;
   ```

   Column 0 is the whole precision: an indented `not ok` is a subtest whose failure the
   `fail` counter already counts, and a test name quoting "not ok" is printed after a
   mark, never at column 0. The colour escape codes are stripped first, exactly as the
   three counter parsers already do (an escape byte at column 0 is how the gate once went
   blind).

2. **`main()` wires it**: after the spawn,

   ```js
   const runner = evaluateRunner({ status: result.status, signal: result.signal, output });
   ```

   prints one more line to its report,
   `[CTOC test-gate] runner exit status <n>` (or `none, ended by signal <s>`), and puts
   `runner.reasons` first in the failure list: `[...runner.reasons, ...verdict.reasons, ...ledger.reasons]`.

3. The header comment's list of failing conditions gains the fourth (the runner did not
   exit cleanly, or printed a top-level failure). `evaluateRunner` is added to
   `module.exports`; `main()` calls it, so it is a live export.

No new `require`: the existing end-to-end tests copy this file into a temporary project
with shims for exactly its current library imports (read, `tests/coverage-gate.test.js`
line 503), so a new import would break them silently.

### `src/lib/false-green-scan.js`: a sixth signature, `exit-status-ignored`

The shape: a `spawnSync` result bound to a name whose output (`.stdout`, `.stderr` or
`.output`) is read in the same function while its `.status` never is. `spawnSync` does
not throw on a non-zero exit, so code shaped like this cannot tell "the program said it
passed" from "the program crashed after saying so".

1. `SIGNATURES` gains `'exit-status-ignored'` (bySignature always reports all six).
2. `FIXES['exit-status-ignored']`: "A spawnSync result's output was read for a verdict
   while its exit status never was. spawnSync does not throw on a non-zero exit, and a
   runner can exit non-zero, or be ended by a signal, while printing output that parses as
   success: Node's test runner prints fail 0 for a suite that crashed while loading. Read
   `.status` and `.signal` and treat anything but status 0 as a failure. Model:
   evaluateRunner in src/scripts/test-gate.js."
3. One literal pattern for the binding, matched on the comment-stripped line:
   `/\b([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*\.)?spawnSync\s*\(/` (covers
   `const r = spawnSync(`, `result = spawnSync(` and `cp.spawnSync(`).
4. The scan step: for each binding, take the innermost function scope (the existing
   `innermostScope`), read the lines from the binding to the end of that scope, and add a
   finding when `hasIdentFollowedBy(rest, name, '.stdout' | '.stderr' | '.output')` and
   not `hasIdentFollowedBy(rest, name, '.status')`. Both helpers exist (read); no new
   pattern constructor is built at run time.
5. The header's list of shipped instances gains the sixth: the gate that never read its
   runner's exit status.
6. **Stated limits**, in the header next to the existing precision note: a destructured
   result (`const { stdout } = spawnSync(…)`) is not detected; `execSync` and
   `execFileSync` are out of scope because they throw on a non-zero exit (believed from
   Node's documentation; to verify at Step 9), so their status is honoured unless a catch
   parses `err.stdout`, a shape this signature does not see. It under-reports rather than
   cries wolf, like its siblings.

### What the new signature will flag, and what happens to each (by reading)

Every `spawnSync` call in `src/` was read (a text search for the call name found the
candidates; each was then read in context):

| Site | Reads output | Reads status | Flagged | Resolution |
|---|---|---|---|---|
| `src/scripts/test-gate.js` `main` | yes | no | yes | fixed by this plan |
| `src/lib/app-runner.js` `driveAppSync` (line 1103) | yes (parses the framed verdict) | no | yes | see the owner question |
| `src/lib/app-runner.js` (line 824) | yes | yes (line 834, 841) | no | — |
| `src/lib/recipe-harness.js` (line 271) | yes | yes (line 299) | no | — |
| `src/hooks/stop-test-gate.js` (line 175) | yes | yes (line 188) | no | — |
| `src/lib/step-13-verify.js` (line 311) | no (a presence probe) | no | no | — |
| `src/lib/app-runner.js` (lines 610, 638) | `stdio: 'ignore'`, not bound | — | no | — |

The baseline's rules (read, `.ctoc/false-green-baseline.json`): `findings` is debt that
may only shrink and to which nothing may be added; `whitelist` is a permanent exemption
needing a written reason. So no new-signature finding goes into `findings`, and
`maxFindings` (207 as read) does not move. If Step 8's real scan flags a site not listed
above, the executor files a scope-growth request rather than touching the debt list.

### `CLAUDE.md`

- The false-green paragraph: "shipped five times" gains the sixth instance (a gate that
  never read its runner's exit status passed a suite that crashed while loading), and the
  list of signatures becomes six with `exit-status-ignored`.
- The paragraph "The gate FAILS CLOSED when it cannot read its own instrument" gains one
  sentence: the gate also fails when the runner exits non-zero, is ended by a signal, or
  prints a top-level failure, because Node can report `fail 0` for a suite that crashed
  while loading.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| `evaluateRunner` | `main()` in `src/scripts/test-gate.js` | `npm test` (the sanctioned script root) |
| `exit-status-ignored` | `scanFalseGreen` in `src/lib/false-green-scan.js` | `tests/false-green-fence.test.js` under `npm test`, and the `false-green-fence` check of `src/lib/iron-loop-enforcer.js` (thorough mode) |

## Test plan (written first, Step 8)

No new test file. Fixtures are written inline into temporary projects, the pattern
`tests/coverage-gate.test.js` already uses (read, its cases at lines 400-480 and 480-560):
copy the **real** gate into `<tmp>/src/scripts/test-gate.js`, shim its five library
imports to the real modules, write `<tmp>/src/thing.js` and a
`<tmp>/.ctoc/coverage-baseline.json` with `minPct: 50` so coverage is measured and can
never be the reason, write one fixture test file, and spawn the gate with
`NODE_TEST_CONTEXT` removed from the child's environment (without that, the nested runner
refuses to run, as those cases document). Every case first asserts the fixture really ran
(no "being called recursively" in the output).

**In `tests/coverage-gate.test.js`:**

1. **A `describe` body that throws** (the fixture requires `../src/thing.js` at the top,
   then `describe('loads', () => { throw new Error('crash while loading'); })`): the gate
   exits non-zero; its report does not print PASS; its stated reasons include a runner
   reason (exit status, top-level failure or failing-tests block) and no coverage reason.
   Red today: the gate exits 0.
2. **A `before()` hook that throws** around one test: exits non-zero; reasons name the
   runner's exit status. Red today.
3. **A test file that throws at module level** before any test: exits non-zero. (A
   regression guard; believed already non-zero through the fail count; Step 8 records.)
4. **The positive control.** The existing "loud but passing suite" case (around line 480)
   still ends in PASS; it gains an assertion that no runner reason is printed and that
   `runner exit status 0` is.
5. **`evaluateRunner` on its own**, with literal inputs:
   - `{ status: 0, output: '✔ a (1ms)\nℹ fail 0\n' }` passes;
   - `{ status: 1 }` fails naming status 1;
   - `{ status: null, signal: 'SIGTERM' }` fails naming the signal;
   - `{}` fails as an unreadable exit status (fail closed);
   - `not ok 1 - suite` at column 0 fails; `    not ok 1 - nested` alone passes;
   - a colourised `ESC[31m✖ failing tests:ESC[39m` (built with `String.fromCharCode(27)`,
     the file's convention) fails;
   - `✔ quotes the words not ok in its name` passes.

**In `tests/false-green-fence.test.js`:**

6. A sixth planted pair. Bad:
   `function run() { const r = spawnSync('node', ['--test'], { encoding: 'utf8', maxBuffer: 1 << 26 }); return parseVerdict(r.stdout); }`
   is flagged `exit-status-ignored`. Good: the same plus `if (r.status !== 0) return null;`
   is not.
7. A regression pin: `src/scripts/test-gate.js` has no `exit-status-ignored` finding.
8. The existing non-vacuity case already asserts every signature is reported; it now
   covers six.

**Characterisation, recorded, not asserted.** For fixtures 1 to 3, Step 8 records in the
execution record the exact `fail`, `cancelled` and exit status the runner printed and
which runner signal fired. Not asserted, so a future Node that counts the crash correctly
does not turn the build red for a good reason.

## Security review

- **No new process, no shell.** The spawn is unchanged (an argument list, `shell:false`,
  explicit `maxBuffer`).
- **No new capture or exit path**; the report still drains through `requestExit`.
- **Quoted output is bounded** (160 characters, colour codes stripped) and is a line the
  runner already printed to the same report.
- **Failing direction.** An unreadable exit status is a failure, never a pass; the new
  patterns can only add reasons, never remove one.
- **The scanner stays fail-loud**: the new step reads only the views the scanner already
  built; no new file reading.
- **The whitelist entry**, if the owner takes the recommended answer, carries a written
  justification and is checked by the fence's existing "whitelist is minimal" case.

## Acceptance criteria

1. On this Node, a suite whose `describe` body throws, or whose `before()` hook throws,
   makes `npm test` exit non-zero with a printed reason naming the runner.
2. A clean suite still prints PASS and `runner exit status 0`.
3. `evaluateRunner` passes the unit cases above, including the fail-closed `{}` case.
4. `scanFalseGreen` reports six signatures; the planted `exit-status-ignored` pair
   behaves; `test-gate.js` carries no finding of it; `maxFindings` is unchanged and
   `findings` gains nothing.
5. `npm test` passes: fail 0, skipped 0, coverage at or above the enforced floor.
6. `CLAUDE.md` names the sixth signature and the new failing condition.

## Questions for the owner

### 1. What should happen to the one existing site the new check flags in the app-runner, where the result's exit status is never read?

`driveAppSync` in `src/lib/app-runner.js` runs the app-launch check in a child process,
then parses the verdict the child prints after a fixed marker; it never reads the child's
exit status. By reading, the child prints its verdict as its last act and exits 0
(`requestExit(0)`, lines 1187-1215), and every interrupted or unreadable verdict already
fails closed through the parse path, proven by real-fault tests in
`tests/app-runner-coverage-holes.test.js` (lines 216-283). Those tests mock nothing, by a
written discipline.

- **Recommended: (a) a permanent exemption** in the whitelist of
  `.ctoc/false-green-baseline.json`, keyed
  `src/lib/app-runner.js:exit-status-ignored:driveAppSync`, with the written reason
  above. Reason: the construct is correct by design; a status check would add a branch no
  real fault can reach, testable only with the mocked `spawnSync` that module's tests
  forbid.
- (b) Fail the drive when the child exits non-zero: add the check in `driveAppSync`
  and test it. Every real fault that reaches that branch is already caught, so its test
  would need a mocked `spawnSync`.
- (c) Record the child's exit status in the verdict's evidence without changing the
  verdict. It reads the field, so the check no longer flags the site, and the owner sees
  the status, but it changes nothing a reader acts on.

If the owner picks (b) or (c): add `src/lib/app-runner.js` and
`tests/app-runner-coverage-holes.test.js` to `files:`, remove the whitelist edit, and
Step 10 makes the change with its test written first.

## Decisions Taken Under Ambiguity

1. **The spec reporter's column-0 failure mark counts as a top-level failure**, beside
   the Test Anything Protocol's `not ok`. The brief names `not ok` and the "failing
   tests:" block; the gate receives the spec reporter's output when piped (read, the
   comment in `parseSkipped`), so its top-level failure line is the mark, not `not ok`.
2. **The `cancelled` counter is not parsed.** The failing `before()` case already exits
   1, which the exit-status check catches; Step 8 records the counter, and a parser added
   without an observed need would be a fourth instrument to keep honest.
3. **No new test file and no fixture files on disk**: the fixtures are written into
   temporary projects inside the existing test file, so no documented count moves and no
   crashing file can be picked up by a future glob.
4. **No new import in `test-gate.js`**, so the existing copy-the-real-gate tests keep
   their shim list.
5. **The signature covers `spawnSync` only**, with the stated limits.
6. **`NODE_TEST_CONTEXT` is removed only in the tests' child environment**, as the
   existing cases do; the production gate is never itself a test child.

## Neighbours (seen, not built here; scheduling is the owner's)

- **Shell writes through a script interpreter skip plan coverage.** A command such as
  `python3 -c "open(…, 'a')…"` or `perl -pi -e …` is classified indeterminate and passes
  the shell channel's coverage check unchanged. This remains open; CLAUDE.md lists
  refusing indeterminate writes as unbuilt work.
- **The mirrored parsers.** `src/lib/step-13-verify.js` and `src/lib/quality-agent.js`
  copy this gate's counter parsers rather than import them (read). The first decides
  success from the command's exit status and then reads the fail count, so for a project
  whose test command is `npm test` it inherits this fix through the gate's exit status.
  For a project whose test runner exits 0 on a crashed suite and is not run through this
  gate, neither looks for a top-level failure line. By reading, not reproduced.

## Execution Plan

### Step 8: TEST
- [ ] Add cases 1 to 5 to `tests/coverage-gate.test.js` and the assertions to the positive-control case.
- [ ] Add the sixth planted pair and the regression pin to `tests/false-green-fence.test.js`.
- [ ] Run `node --test tests/coverage-gate.test.js tests/false-green-fence.test.js`; expect RED on cases 1, 2 and 5 (no `evaluateRunner`) and on the pair and pin; record the failing lines and the characterisation for fixtures 1 to 3.

### Step 9: PREPARE
- [ ] Record `node --version`, and the exact bytes Node prints for a failing top-level test and for the failing-tests block when piped (the mark, its spacing, the block's wording).
- [ ] Capture the output of the real, currently green suite with `npm run test:raw` into a scratch file and run both patterns over it: zero matches is the positive control. Any match is recorded and the pattern narrowed before Step 10.
- [ ] Read Node's documentation for `execSync` and `execFileSync` on a non-zero exit and record it beside the signature's stated limits.
- [ ] Run the extended scanner (planted through `sources`) over the real `src/` tree in a scratch run and confirm exactly the two flagged sites in the table; anything else becomes a scope-growth request.

### Step 10: IMPLEMENT
- [ ] `src/scripts/test-gate.js`: `TOP_LEVEL_FAILURE`, `FAILING_TESTS_BLOCK`, `evaluateRunner`, the wiring and report line in `main()`, the header, the export.
- [ ] `src/lib/false-green-scan.js`: the signature, its fix text, the binding pattern, the scan step, the header's sixth instance and stated limits.
- [ ] `.ctoc/false-green-baseline.json`: the whitelist entry on the recommended answer; `findings` and `maxFindings` untouched.
- [ ] `CLAUDE.md`: the two paragraphs.
- [ ] Run the two test files; expect GREEN.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` on the diff: false-red risk of both patterns, the fail-closed `{}` path, the signature's precision against the table, no edit to the debt list.

### Step 12: OPTIMIZE
- [ ] Keep `evaluateRunner` one pass over the stripped output; reuse `stripAnsi`.

### Step 13: SECURE
- [ ] Dispatch `security-scanner` on the diff: spawn arguments unchanged, quoted output bounded, no new import, nothing from the output reaches a file path.

### Step 14: VERIFY
- [ ] Run `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`, and the report prints `runner exit status 0`.
- [ ] Run the linter over the two source files: zero warnings, including the regular-expression safety rules.
- [ ] Confirm the false-green fence's count equals `maxFindings` unchanged.

### Step 15: DOCUMENT
- [ ] Confirm `CLAUDE.md` matches the built gate and scanner.
- [ ] JSDoc on `evaluateRunner` and on the new scan step.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in a scratch project, the same crashing suite under the old gate (PASS) and the new gate (FAIL, with the runner reason), output shown in full.
- [ ] Dispatch `iron-loop-critic` for the final review against the acceptance criteria.
- [ ] Hand the result to the owner for his decision to call it done.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
