---
iron_loop_verdict: true
title: "Remainder: the fences and scanners — their own dark arms"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-fences-coverage.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-09-03T10:22:50.548Z
gate_crossed: review → done
---

# Remainder: the fences and scanners

**Scope (one line):** classify and cover the small dark ranges in the eight fence and scanner
modules — the checks that judge the rest of the codebase, and whose own unexercised arms are the
ones most likely to make a fence report a verdict it never earned.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/unexecutable-instruction-scan.js` | 190 · 242-243 · 271-272 · 439-440 · 504-505 · 521-522 |
| `src/lib/false-green-scan.js` | 345-347 · 428 · 564 |
| `src/lib/agent-honesty-scan.js` | 75-76 · 78-79 · 169-170 |
| `src/lib/human-facing-scan.js` | 284-285 · 507-508 |
| `src/lib/recipe-harness.js` | 68 · 150-151 · 264-268 |
| `src/lib/declared-breadth.js` | 144-145 · 161-162 |
| `src/lib/wiring.js` | 92-93 |
| `src/lib/reachability.js` | 155 |

**The planner did not read any of these eight files.** The table is the measurement handed to the
planner, not an analysis. Step 9 PREPARE re-derives the ranges from the gate's own report and
reads each one; where the code disagrees with anything in this plan, the code wins and the drift
is reported.

### The classification rule (from the approved parent plan, section 4)

Each range is exactly one of: **(a)** reachable behaviour → write a test a mutation would break;
**(b)** permission-gated or terminal-only → leave it and NAME it in the header with the reason (a
permission-gated case that cannot run announces a LOUD skip with a printed reason, never a silent
no-op); **(c)** dead → report it in `## Decisions Taken Under Ambiguity` and at Step 16, and
**never delete it**.

### What to expect, and the two rules that apply here specifically

These modules share one shape: they walk a tree, read a baseline, and return findings. So:

1. **A fence that cannot look must not report "clean".** Several of these ranges will be the
   fail-closed arms (an unreadable file, an unreadable baseline, a count below a non-vacuity
   floor). Where a range is one of those, the assertion must be that the module reports
   `available: false` / a failure / an explicit unreadable count — **never an empty findings list**.
   That is the same family as `stale-detector.js`'s `unreadCount` and the coverage gate's
   `resolveThreshold`, both of which fail closed by design.
2. **Never add a baseline entry to make a case pass.** Every baseline these modules read
   (`.ctoc/false-green-baseline.json`, `.ctoc/unexecutable-instruction-baseline.json`,
   `.ctoc/reachability-baseline.json`, `.ctoc/recipe-coverage.json`) has two deliberately separate
   structures — debt that may only shrink, and an exemption list that starts empty and requires a
   written justification. **This slice adds nothing to either.** Every baseline under test is a
   fixture copy under `os.tmpdir()`.

### Seams

- **Fixture-first.** These are pure-ish analysers: a temp tree with the exact file shapes that
  trigger a branch is a stronger test than a mock, and needs no restoration.
- **Filesystem faults:** `t.mock.method(safeFs, 'readFileSync'|'readdirSync'|'statSync', …)` with
  a path sentinel so only the case's own path throws.
- **Never mock the scanner under test**, and never assert only "returned an array" — assert the
  finding, its key, and its direction.

### Wiring — the live call sites

No module is added. All eight are live: `src/lib/iron-loop-enforcer.js` runs the fences as named
checks (`false-green-fence`, `agent-honesty-fence`, `unexecutable-instruction-fence`,
`golden-corpus-fence`, and the reachability and recipe checks), and each has a ratchet test file.
The new test file is reached by the gated suite (`npm test` → `src/scripts/test-gate.js`).

### Security review

- No real baseline is written; no exemption added anywhere.
- Fixture trees live under `os.tmpdir()` and are removed in `after`.
- `recipe-harness.js` EXECUTES shipped recipes: any case touching it must keep the harness's own
  rules — explicit `maxBuffer` with an overflow reported as a FAILURE, no memoization, no shell,
  and a loud throw on a missing target. Do not introduce a case that runs a recipe against the
  repository.
- No secret; no host path in an assertion message.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour and the mutation it kills — for
  example `an unreadable agent definition makes the census report NOT available, never an empty missing list`.
- Every such case RED before the change. A case GREEN on the first run means an existing ratchet
  test already reaches it and the map is stale — account for it at Step 11 and delete the
  duplicate; never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** This slice intends no source change, and
   declaring eight modules would make the write permission far broader than the work. If a case
   exposes a real defect in one of them, the executor files it through
   `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields) so the human sees it and
   decides — a defect in a fence is exactly the kind of finding that must reach a human rather
   than be quietly patched.
2. **Grouped by family, one test file.** These eight are one subject — the checks that judge the
   codebase — and the work surface stays a single file.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

### Recorded during execution (2026-09-01)

4. **The plan's target list named a file that does not exist: `src/lib/wiring.js`.** There is
   no such file. The module the coverage report measures — and the one carrying the uncovered
   lines 92-93 — is `src/lib/plan-index/wiring.js`, the plan-index composition root. The gate's
   report indents a nested directory's files without repeating the directory name, so the row
   read `wiring.js` and the planner recorded it under `src/lib/`. The code wins: the case was
   written against `src/lib/plan-index/wiring.js`, whose `resolveRoot` catch is the measured
   range, and it is now covered. **Nothing else in the plan's table drifted** — the other seven
   paths and every line range matched the 2026-09-01 measurement exactly.
5. **No range was permission-gated, terminal-only or dead.** All 21 are reachable through the
   modules' public surfaces, so this slice names nothing as deliberately left and reports no
   dead code. That is a finding in its own right: these eight fences have no unreachable arms.
6. **The TypeScript parser fault is injected one level further out than the plan's seam list
   suggests.** `createSourceFile` is a NON-CONFIGURABLE getter on the typescript namespace, so
   `t.mock.method` cannot replace it at all. The fault is injected at the next true boundary —
   the cached module exports, swapped for a delegating object with one own throwing property
   and restored in a `finally`. The function under test is still never mocked.
7. **Red provenance was taken by in-memory mutation, because a mutation could not be written.**
   The declared `files:` set covers no source file, so writing a mutant to disk would have been
   an undeclared write. Each target line was instead replaced in a copy compiled into
   `require.cache` under the module's own filename. The eight modules' sha256 digests were
   recorded before and re-verified identical after: no source file was touched at any point.

## Execution Plan

### Step 8: TEST
Write `tests/remainder-fences-coverage.test.js` with one named case per range classified (a).
Run it; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the uncovered ranges for all eight files. Read every range in the
current code and write the (a)/(b)/(c) classification, with the enclosing function, into the
header before any assertion is written. Read each module's existing ratchet test so this file
adds only what is missing and modifies nothing.

### Step 10: IMPLEMENT
- Sub-item 1: the fixture-tree builders (one per module shape).
- Sub-item 2: the (a) cases, fixture-driven, with sentinel-guarded filesystem faults only where a
  real fault is required.
- Sub-item 3: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; **no baseline entry or exemption added
anywhere**; no scanner under test mocked; every mock restored. Account for every case GREEN
before implementation.

### Step 12: OPTIMIZE
Shared fixture helpers; no memoized analysis between cases (a cached run is a check that did not
run). No sleeps, no retries.

### Step 13: SECURE
Confirm no recipe was executed against the repository; nothing written outside `os.tmpdir()`; no
shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the eight
files.

### Step 15: DOCUMENT
The header names every range and its disposition, so a later reader can tell tested from
deliberately-left from unreachable without re-deriving it.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; every range left, with its reason; and — most
importantly — any fence found to report "clean" on input it could not read.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — `tests/remainder-fences-coverage.test.js`, 21 named cases, one per uncovered range across the eight fence and scanner modules.
- [x] Test error conditions — every case IS an error condition: an unreadable file, an unreadable directory, a throwing parser, a throwing frontmatter reader, a truncated source, a refused run.
- [x] Run tests — all 21 pass against the unchanged code (this is a characterisation slice, so a first-run pass is expected, never banked). RED provenance was taken by MUTATION instead: each of the 21 target lines was replaced in memory (no source file written; the eight sha256 digests were re-checked afterwards and are unchanged) and the suite re-run — every mutation was killed by exactly its own case, and only that case, except the false-green `segment` mutation, which also killed two neighbouring false-green cases.

### Step 9: PREPARE
- [x] Install dependencies — none added. The test uses only node:test, node:assert, node:fs, node:os, node:path and the modules under test.
- [x] Check prerequisites — re-derived every uncovered range from `npm test`'s own coverage table on 2026-09-01 before writing an assertion. The plan's table matched the measurement line for line, with one naming drift recorded in the decisions below.
- [x] Verify dev environment ready — baseline gate run captured first: 99.29% overall, failed 0, skipped 0, PASS.
- [x] Create directories/config — none in the repository. Every fixture tree is created under `os.tmpdir()` at run time and removed in `after` (verified: no `ctoc-fences-*` directory survives a run).

### Step 10: IMPLEMENT
- [x] Implement — sub-item 1: fixture-tree builders (`makeTree`/`write`/`configTree`); sub-item 2: the 21 cases with faults injected only at the true boundary (`safe-fs` via a `CTOC-FAULT-SENTINEL` path guard, the typescript module's cached exports, the lazily-required frontmatter readers, the project-root finder); sub-item 3: the file header, naming every range with its class and reason.
- [x] Add error handling — every fault injection is sentinel-guarded so no unrelated read in the process breaks, and every replacement is undone (`t.mock` auto-restore, plus an explicit `finally` for the typescript cache swap and the plan-index require-cache reload).
- [x] Wire up integration points — no module is added. All eight modules are already live through `src/lib/iron-loop-enforcer.js`; the new test file is reached by the gated suite (`npm test` → `src/scripts/test-gate.js`), which ran it.

### Step 11: REVIEW
- [x] Self-review — no existing test file touched, no assertion weakened, no baseline entry or exemption added anywhere, no scanner under test mocked, every mock restored.
- [x] Verify integration points — the whole suite ran green with the new file in it; the eight modules moved from 96.74–99.89% to 100.00% line coverage each.
- [x] Check error handling completeness — each case asserts the DIRECTION of the fault arm (an unreadable input reports "could not look", never a passing empty result; a fence that could look invents no finding), not merely that a call returned.

### Step 12: OPTIMIZE
- [x] Remove redundant operations — three shared helpers (`makeTree`, `write`, `faultSafeFs`) and one shared config fixture builder; no analysis is memoised between cases, so no case reads a cached run.
- [x] Optimize critical paths — the file runs in about 0.11 s. No sleep, no retry, no network, no child process.
- [x] Simplify complex code — the one non-obvious seam (the typescript parser fault) carries a comment explaining why `t.mock.method` cannot reach it: `createSourceFile` is a non-configurable getter on the typescript namespace.

### Step 13: SECURE
- [x] Validate inputs — every fixture path is built with `path.join` from a freshly created `mkdtemp` root; nothing is written outside `os.tmpdir()`.
- [x] Sanitize outputs — no assertion message contains a host path; the reachability case asserts the ABSENCE of the absolute path in the error, which is that module's own leak guard.
- [x] No secrets in code — no credential, no token, no real project data; all fixture content is invented.
- [x] Safe file operations — no shell anywhere, and no shipped recipe is executed against this repository (the one `runRecipe` case asserts the harness REFUSES before it spawns, and its root is a temp directory).

### Step 14: VERIFY
- [x] Run lint + type check — both run inside `npm test`; the gate reported PASS.
- [x] Run ALL tests — `npm test` from the repository root: failed 0, skipped 0.
- [x] Check coverage — 99.37% on the final gate run, against the enforced floor of 99 in `.ctoc/coverage-baseline.json` (the floor was NOT touched). Up from 99.29% before this slice.
- [x] 0 skipped, 0 flaky — the gate reports `skipped 0`, and this file contains no skip at all: no case depends on a filesystem permission bit, so nothing degrades on Windows or as root.

### Step 15: DOCUMENT
- [x] Update relevant documentation — `CLAUDE.md`'s two test-file counts moved 531 → 532, the only reason that file is declared.
- [x] Add JSDoc comments — the three test helpers that carry a real decision (`faultSafeFs`, `withThrowingParser`, `configTree`) are documented; the header documents every range.
- [x] Update CHANGELOG — not needed: no shipped behaviour changed. This slice adds tests and a count line.

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — see the execution record below.
- [x] All quality checks passed — `npm test` PASS, 11792 tests, failed 0, skipped 0, coverage 99.37%.
- [x] Manual verification — the mutation matrix is the manual verification: 21 mutations, 21 killed, sources byte-identical afterwards.
- [x] Ready for human review — one decision is carried up: the plan named `src/lib/wiring.js`, which does not exist; the measured file is `src/lib/plan-index/wiring.js`.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record (Steps 8–16)

Built 2026-09-01 by the Iron Loop executor, task t77.

**What landed.** One new file, `tests/remainder-fences-coverage.test.js` (21 cases), and a
two-line count update in `CLAUDE.md` (531 → 532 test files). **No source file was changed**,
and none was needed: every one of the 21 measured ranges turned out to be class (a) —
reachable behaviour through the module's own public surface. Nothing is class (b) or (c),
so this slice adds no "left deliberately" line and reports no dead code.

**Coverage of the eight targets, before → after (node line coverage, scoped to `src/**`):**

| file | before | after |
|---|---|---|
| `src/lib/agent-honesty-scan.js` | 96.74 % | 100.00 % |
| `src/lib/recipe-harness.js` | 97.48 % | 100.00 % |
| `src/lib/unexecutable-instruction-scan.js` | 98.12 % | 100.00 % |
| `src/lib/declared-breadth.js` | 98.44 % | 100.00 % |
| `src/lib/plan-index/wiring.js` | 99.12 % | 100.00 % |
| `src/lib/human-facing-scan.js` | 99.25 % | 100.00 % |
| `src/lib/false-green-scan.js` | 99.29 % | 100.00 % |
| `src/lib/reachability.js` | 99.89 % | 100.00 % |

Whole repository: **99.29 % before → 99.37 % on the final verify run**. Two full gate runs were
made after this change and measured 99.33 % and 99.37 %; the spread is ordinary run-to-run
variance in this suite and both are well clear of the floor of 99. The number recorded as
evidence is the final run's.

**How red was established without changing a source file.** The declared `files:` set does
not include any of the eight modules, so a mutation could not be written to disk — and must
not have been. Instead each target line was replaced IN MEMORY: a preload compiled a mutated
copy of the module under its own filename into `require.cache` (and intercepted a later
re-load of that filename, which one case forces), so relative requires resolved normally and
the working tree was never touched. The eight files' sha256 digests were captured before the
run and re-verified identical afterwards.

| mutated line | mutation | case killed |
|---|---|---|
| `agent-honesty-scan.js:75` | report available with a compliant verdict | the unreadable-definition case |
| `agent-honesty-scan.js:78` | report available for an empty file | the empty-definition case |
| `agent-honesty-scan.js:169` | report the fragment as substantive | the unreadable-fragment case |
| `declared-breadth.js:144` | let the inner reader's fault escape | the fallback-still-finds-it case |
| `declared-breadth.js:161` | let the fault escape the function | the refusing-direction case |
| `plan-index/wiring.js:92` | return an empty root | the project-root-finder case |
| `reachability.js:155` | label with the absolute path | the last-two-segments case |
| `human-facing-scan.js:284` | report available with no findings | the gate-number parser case |
| `human-facing-scan.js:507` | report available with no modules | the screen-registry parser case |
| `recipe-harness.js:68` | return an empty script path | the verbatim-script-path case |
| `recipe-harness.js:150` | return an empty recipe list | the loud-throw case |
| `recipe-harness.js:264` | build the error without throwing it | the refuse-to-run case |
| `false-green-scan.js:345` | drop the still-open scope | the unbalanced-file case (plus two neighbours) |
| `false-green-scan.js:428` | end the span at its opening line | the unclosed-capture case |
| `false-green-scan.js:564` | fabricate a catch body at end-of-file | the truncated-catch case |
| `unexecutable-instruction-scan.js:190` | invent a "Tools" heading | the headingless-bullet case |
| `unexecutable-instruction-scan.js:242` | invent a file in a directory never listed | the unreadable-subdirectory case |
| `unexecutable-instruction-scan.js:271` | invent frontmatter for a file never read | the unreadable-definition case |
| `unexecutable-instruction-scan.js:439` | stop at the first embedded occurrence | the embedded-leaf case |
| `unexecutable-instruction-scan.js:504` | invent the content of an unreadable file | the unreadable-src-file case |
| `unexecutable-instruction-scan.js:521` | invent a file in a directory never listed | the unreadable-src-subdirectory case |

Twenty-one mutations, twenty-one killed, each by its own named case.

## Verification Evidence (Step 14)

`npm test` from the repository root, captured to a file and read from its last lines:

```
[CTOC test-gate] coverage 99.37% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

The floor in `.ctoc/coverage-baseline.json` is 99 and was not touched. No baseline debt entry
and no exemption was added anywhere, in any baseline.

The completion route then ran Step 14 itself and wrote the evidence artifact
(`.ctoc/state/verify/00249-close-the-coverage-holes-s15-remainder-fences.json`): lint, typecheck
and the full gated suite all passed, `skipped 0`, coverage **99.34 %** against the floor of 99.
That artifact is the authority; the three measurements taken across this build (99.33, 99.34,
99.37) differ only by ordinary run-to-run variance and all sit clear of the floor. The last-mile
launch check reported not-applicable for the usual reason on this repository: no
`general.entry_point.command` is declared in `.ctoc/settings.json`.

## Step 16 FINAL-REVIEW report

- **Every range covered, none left.** All 21 measured ranges are now exercised by a named
  behavioural case. Nothing was classified permission-gated, terminal-only or dead.
- **No fence was found reporting "clean" on input it could not read.** This was the question
  the slice existed to answer, and the answer is that all eight already point the right way:
  the honesty scanner refuses a census it could not complete, the gate-number scanner refuses
  a verdict on a file it could not parse, the reachability analyser refuses to label a file it
  could not read with an absolute path, the recipe harness refuses to run rather than guess,
  the false-green scanner neither loses a finding in a truncated file nor fabricates one, and
  the instruction scanner never treats a directory or a file it could not read as evidence
  that a key is read or a bullet is a capability manifest. Each of those is now a test.
- **One decision for the human**, recorded below: the plan's target list named a file that
  does not exist under that path.
