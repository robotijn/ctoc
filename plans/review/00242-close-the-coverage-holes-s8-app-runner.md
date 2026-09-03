---
iron_loop_verdict: true
title: "The last-mile driver reports a launch failure as a failure"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/app-runner-coverage-holes.test.js
  - src/lib/app-runner.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.671Z
gate_crossed: implementation → todo
---

# The last-mile driver reports a launch failure as a failure

**Scope (one line):** cover the dark ranges of `src/lib/app-runner.js` — the Step 14 check that
drives the declared entry point — where the arms nothing has exercised are exactly the ones that
must never report `applicable: false` when a real drive went wrong.

## Implementation Details

### Target and ranges

`src/lib/app-runner.js` — measured **98.05 %** on 2026-08-31. Uncovered:
`163-164` · `610` · `619-620` · `638` · `815-816` · `932-934` · `1117-1125` · `1133-1134` ·
`1193-1194`.

### What the planner verified (read this session: lines 1110-1139)

- **1116-1125** is the driver's launch-failure arm: when `spawnSync` returns a `proc.error`, it
  returns `{ applicable: true, launched: false, responded: false, evidence: { shape },
  durationMs: 0, errors: ['app-runner driver failed to launch: <message>'] }`. The load-bearing
  fact is `applicable: true` — a failed launch is a FAILURE, never "no app to launch". That is
  the exact false-green shape this module was fixed to avoid, and it is unasserted today.
- **1129-1134** is the result-marker parse: on a `JSON.parse` failure it falls through to the
  error result below (1136+), which is partly covered.

Every other range in this file is **unread by the planner**. Read the code at Step 9.

### Seams — exact

- **1117-1125:** `t.mock.method(require('node:child_process'), 'spawnSync', …)` returning
  `{ error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }), stdout: '', stderr: '' }`
  for the driver invocation only (guard on the argv the case expects, pass everything else
  through to the real function). Assert the full returned object, `applicable: true` first — a
  mutant flipping it to `false` is the defect this case exists to kill.
- **1133-1134:** mock `spawnSync` to return stdout that contains the result marker followed by
  invalid JSON. Assert the function returns the error-shaped result, still `applicable: true`,
  and does NOT throw.
- The remaining ranges: classify at Step 9 and pick the smallest real seam — the declared
  entry-point path reads `.ctoc/settings.json`, so several arms are reachable with a FIXTURE
  declaration (a command that exits non-zero, a command whose output omits the `expect`
  substring, a command that exceeds `timeout_ms`) and need no mock at all. Those three are the
  documented FAIL cases (`tests/last-mile-drives-entry-point.test.js` holds the contract — read
  it at Step 9 and do not modify it; write only what it does not already cover).

### Non-goals, restated so they are not "improved" into the tests

No browser automation, no screenshot, no network call, no multi-step interaction, no warm-up run,
**no retry**. A retry turns a flaky check into a slow check that lies. A timeout case must use a
small declared `timeout_ms` and an inert sleeping command
(`process.execPath -e "setTimeout(()=>{},5000)"`), never a real application.

### Wiring — the live call sites

No module is added. `src/lib/app-runner.js` is live: Step 14's last-mile check runs it. The new
test file is reached by the gated suite.

### Security review

- Every fixture command is an argv array with no shell; a declared command containing a shell
  operator is rejected by the module by contract, and a case should prove that if it is not
  already proven.
- The module's evidence artifact records only a byte count and a matched flag, never stdout
  (stdout may carry a secret). **Any new case must assert that property, never print captured
  output into a message.**
- Fixtures under `os.tmpdir()`, removed in `after`.

## Test Plan (TDD-Red first)

- `a driver that fails to LAUNCH is applicable:true, launched:false, with the launch error — never applicable:false`
- `a result marker followed by unparseable JSON yields the error result, not a throw`
- one case per remaining reachable range, named for its behaviour.
- Every case RED before the change. A case GREEN on the first run means
  `tests/last-mile-drives-entry-point.test.js` already covers it — say so at Step 11 and delete
  the duplicate rather than banking it.

## Decisions Taken Under Ambiguity

1. **`src/lib/app-runner.js` is declared in `files:` but no source change is intended** — the
   declaration exists so a defect this slice exposes can be fixed here, recorded with what failed
   and why the code was wrong.
2. **Fixture-driven where possible, mocked only at `child_process`.** The declared-entry-point
   arms are reachable with a real inert command; only the spawn-error arm genuinely needs a mock,
   because a launch failure cannot be produced reliably across platforms.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/app-runner-coverage-holes.test.js` with the named cases. Run it; record every case
RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive this file's uncovered ranges. Read every range and classify it. Read
`tests/last-mile-drives-entry-point.test.js` to find what is already covered, so this file adds
only what is missing and modifies nothing.

### Step 10: IMPLEMENT
- Sub-item 1: the fixture project with a declared entry point in `.ctoc/settings.json`.
- Sub-item 2: the two mocked `spawnSync` cases.
- Sub-item 3: the fixture-driven cases for the remaining reachable ranges.
- Sub-item 4: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no retry, warm-up or sleep introduced; no
function under test mocked; every mock restored. Account for every case GREEN before
implementation.

### Step 12: OPTIMIZE
One fixture builder; small timeouts; no sleeps beyond the one deliberate timeout case.

### Step 13: SECURE
No captured stdout in any message or artifact; no shell; no secret; nothing written outside
`os.tmpdir()`.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header states plainly that a failed drive is a FAILURE, never `applicable: false`, and that
the cases exist to keep it that way.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any place where a real
drive failure could still be reported as not-applicable.


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


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

**What landed:** one new test file, `tests/app-runner-coverage-holes.test.js` (six cases), plus the
two test-file count lines in `CLAUDE.md` (541 → 542). **`src/lib/app-runner.js` was NOT changed** —
it was restored byte-for-byte after mutation testing and verified against its sha256
(`a895289acbfa8f671c12839006984dd3917be1145e586d28fd67f3030897b09a`); `git status` reports it
unmodified. No test was weakened, no case deleted, no existing test file edited, no baseline,
exemption or coverage floor touched.

**Step 8 — TEST.** Six cases written first and run. Five were GREEN on the first run — expected for
a coverage slice over behaviour that is already correct — and **one was genuinely RED, for a reason
that was mine, not the module's**: it asserted that a MALFORMED declaration reaches `driveApp` as
`applicable: true`. That is wrong, and the module says so where it is implemented
(`malformedDeclarationResult`, "the ONE not-applicable that can follow an `entry_point` key ...
nothing was attempted"), and two existing cases in `tests/last-mile-drives-entry-point.test.js`
already pin it (case 7, ladder 6). The contract has two halves and the case had conflated them: a
declaration that was DRIVEN and did not answer is a FAILURE (`applicable: true`); a declaration that
could not be UNDERSTOOD is honestly not-applicable, but must stay distinguishable from a project
that never declared anything. The new case was rewritten to assert that real contract across BOTH
ladders (asynchronous and synchronous), which is what lines 163-164 actually protect. The existing
test file was not touched.

Red provenance for all six cases came from mutation: each mutation was applied to the source, the
new test file re-run, the named case observed failing, and the source restored byte-for-byte with a
sha256 check (`IDENTICAL`).

| mutation applied to `src/lib/app-runner.js` | case that went RED |
|---|---|
| the non-object arm degrades to "nothing declared" (`reason: null`) | a string, an array and a number each yield a reason … ; both ladders carry a non-object declaration through as MALFORMED … |
| `driveCli`'s entry fallback drops `main` (always `index.js`) | falls back to `main`, and to index.js when there is no main |
| `driveCli`'s last-resort entry renamed (`main.js`) | falls back to `main`, and to index.js when there is no main |
| the driver-launch-failure result reports `applicable: false` | a verdict too large to read reports applicable:true … |
| the driver-launch-failure result stops naming the error | a verdict too large to read reports applicable:true … |
| the verdict-parse `catch` rethrows instead of falling through | a result marker followed by unparseable JSON … |
| the unreadable-verdict result reports `applicable: false` | a result marker followed by unparseable JSON … |
| the `--drive` options parse rethrows instead of defaulting to `{}` | an unparseable options argument defaults to {} … |

**Step 9 — PREPARE.** Ranges re-derived from the gate's own report, not from the plan: `npm test`
before the change reported `app-runner.js 98.05 % | 163-164 610 619-620 638 815-816 932-934
1117-1125 1133-1134 1193-1194` — identical to the plan's list. Every range was then read and
classified:

| range | classification | how it is met |
|---|---|---|
| 163-164 | reachable | a declaration that is not an object at all |
| 610, 638 | platform-gated | `process.platform === 'win32'` `taskkill` arms in `teardown`; unreachable on the POSIX machine the floor is measured on, and faking the platform would run a Windows path against a POSIX process table |
| 619-620 | unreachable, defensive | `teardown`'s OUTER catch: its `try` holds only a `process.kill` that has its own catch, whose fallback has its own catch. `teardown` is unexported, so there is no seam either. Reported, not deleted |
| 815-816 | reachable | `bin` truthy but neither string nor object → the `main` / `index.js` fallback |
| 932-934 | unreachable, defensive | `driveServer`'s "no dev/start script" guard. `driveServer` is module-local; its only caller is `driveApp`, which reaches it only for shape `web`/`server`, and `detectAppShape` claims both on `Boolean(scripts.dev \|\| scripts.start)` — the identical predicate. Reported, not deleted |
| 1117-1125 | reachable | a driver child whose verdict overflows the parent's read buffer |
| 1133-1134 | reachable | a verdict whose framing marker appears a second time inside its own body |
| 1193-1194 | reachable | the `--drive` child spawned with an unparseable options argument |

`tests/last-mile-drives-entry-point.test.js` was read in full to find what is already covered: its
malformed-shape loop tests six malformed OBJECTS and no non-object, which is exactly why 163-164 was
dark. Nothing in it was modified, and no case here duplicates one of its cases.

**Step 10 — IMPLEMENT.** No production module added or changed. **Not one mock was needed**: both
`driveAppSync` recovery arms are driven by real faults from real runs. A declared command a little
over 1 MiB (echoed twice into the verdict, once as `evidence.command` and once inside the
undrivable-command reason) makes the child's verdict genuinely larger than `spawnSync`'s 1 MiB read
buffer, so the parent really does receive `error` = ENOBUFS — the same defect family the module's
own `--drive` comment documents. A declared `expect` equal to the driver's own framing marker makes
that marker appear twice in the child's output, so `lastIndexOf` really does land inside the JSON
body and the parse really does fail.

**Step 11 — REVIEW.** Every case GREEN before the change is accounted for above (there is no
implementation for them to precede; each is anchored by a mutation that breaks it). The one RED case
is accounted for as a wrong assertion of mine, corrected against a contract stated outside this test
— in the source and in two existing cases. No existing test touched, no assertion weakened, nothing
under test mocked, no retry, no warm-up, no sleep introduced (the two declared `timeout_ms` values,
5000 and 10000 ms, are ceilings that never elapse — both runs finish in tens of milliseconds).

**Step 12 — OPTIMIZE.** One project builder, one write helper, one declare helper, one shared
cleanup. The whole file runs in about 0.2 s.

**Step 13 — SECURE.** Every fixture is created under `os.tmpdir()` and removed in `after`, with a
failed removal reported on stderr rather than swallowed. Every launch is an argument array with
`shell:false`. This repository's own `.ctoc/` state is never read for a verdict, written or deleted.
The no-leak property is asserted, not assumed: the fixture plants a sentinel inside the declared
command and the case asserts the sentinel appears nowhere in the returned result, and that the
launch error is a short diagnosis rather than a captured payload. No permission bits are used, so
every case runs identically under root and on Windows.

**Step 14 — VERIFY.** `npm test` from the repository root, captured in full, exit 0:
`[CTOC test-gate] coverage 99.87% (threshold 99%), skipped 0, failed 0` then `[CTOC test-gate] PASS`.
`src/lib/app-runner.js` moved **98.05 % → 99.43 %** line coverage, with the uncovered list reduced to
exactly the four ranges classified above as platform-gated or unreachable: `610 619-620 638 932-934`.
The repository moved 99.85 % → 99.87 %.

**Step 15 — DOCUMENT.** The test file's header states the module's promise in its first lines — a
declared entry point that exits non-zero, omits its marker or times out FAILS verification and is
never reported as nothing-to-launch — names each range it covers, and names each range it leaves
with the reason it is left.

**Step 16 — FINAL-REVIEW.** Coverage before 98.05 %, after 99.43 %. Ranges left: `610` and `638`
(Windows-only), `619-620` and `932-934` (unreachable defensive depth, reported not deleted). There
is no place left where a real drive failure is reported as not-applicable: the two recovery arms in
the synchronous path are now pinned to `applicable: true`, and the one remaining `applicable: false`
that can follow an `entry_point` key — a declaration that could not be parsed — is pinned to a
distinguishable shape and reason in both ladders.

## Verification Evidence

- Full gated run: `npm test`, exit 0. Last lines read:
  `[CTOC test-gate] coverage 99.87% (threshold 99%), skipped 0, failed 0` · `[CTOC test-gate] PASS`.
- `src/lib/app-runner.js`: 98.05 % → 99.43 % line coverage; uncovered `610 619-620 638 932-934`.
- New file `tests/app-runner-coverage-holes.test.js`: 6 tests, 6 pass, 0 fail, 0 skipped.
- Source unchanged: sha256 `a895289acbfa8f671c12839006984dd3917be1145e586d28fd67f3030897b09a`
  before and after mutation testing; `git status` reports `src/lib/app-runner.js` unmodified.

## Decisions Taken Under Ambiguity

1. **A malformed declaration stays not-applicable; the case was corrected, not the module.** The
   first draft of this slice asserted that a non-object declaration reaches `driveApp` as a failure.
   The module deliberately says otherwise, in the implementation and in two existing cases: nothing
   was attempted, so nothing is claimed, and the honesty requirement is that the state stays
   distinguishable from a project that never declared anything. The code was left alone and the new
   case rewritten to pin the real contract in both ladders.
2. **The two recovery faults are produced, never mocked.** `spawnSync` is destructured at require
   time, so injecting a launch failure would have meant patching the module loader. Both arms turned
   out to be reachable by real runs instead — an over-large verdict and a self-referential marker —
   which is a stronger proof than a mock and needs no restoration.
3. **Two ranges are reported as unreachable, never deleted** (parent plan, Decision 2):
   `teardown`'s outer catch and `driveServer`'s no-script guard. Both are defensive depth behind a
   predicate that already decided the case; removing them is a separate decision for the human.
4. **A finding for the human, harmless today:** a project that declares `expect` equal to the
   driver's own framing marker `__APP_RUNNER_RESULT__` gets an unreadable verdict. It fails CLOSED —
   `applicable: true` with "Could not parse app-runner driver verdict" — so the check reports a
   failure rather than a false pass, which is the right direction. It is now pinned by a test. No
   change is proposed here.
