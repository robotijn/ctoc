---
iron_loop_verdict: true
title: "Remainder: the security scanners, tool detection and the audit chain"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-security-tooling-coverage.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.423Z
gate_crossed: implementation → todo
---

# Remainder: the security scanners, tool detection and the audit chain

**Scope (one line):** classify and cover the small dark ranges in the twelve modules that scan for
secrets and vulnerabilities, detect the project's tools, and record the audit chain.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/audit-chain.js` | 117-118 · 203-204 · 211 |
| `src/lib/tool-detector.js` | 282-283 · 688-690 |
| `src/lib/sast-runner.js` | 578-580 · 583-584 |
| `src/lib/sca-runner.js` | 375-377 · 380-381 |
| `src/lib/secrets-scanner.js` | 1154-1155 · 1164-1165 |
| `src/lib/quality-state.js` | 259-262 |
| `src/lib/eu-ai-act-helpers.js` | 324-326 |
| `src/lib/framework-detector.js` | 298-300 |
| `src/lib/framework-security-checker.js` | 452-453 |
| `src/lib/deployment.js` | 462-463 |
| `src/lib/regulatory-regime.js` | 155 |
| `src/lib/step-13-verify.js` | 134-135 |

**The planner did not read any of these twelve files.** The table is the measurement handed to the
planner, not an analysis. Step 9 PREPARE re-derives the ranges and reads each one; where the code
disagrees with this plan, the code wins and the drift is reported.

### The classification rule (from the approved parent plan, section 4)

**(a)** reachable → test it; **(b)** permission-gated or terminal-only → leave it and NAME it in
the header with the reason (a permission-gated case that cannot run announces a LOUD skip with a
printed reason); **(c)** dead → report it, never delete it.

### The three rules that apply to this family specifically

1. **A scanner that found nothing because it could not look must say so.** The precedent is the
   secrets-scanner's own history: findings were once dropped silently. Where a range is a
   detection-failure or an unreadable-input arm, assert the module reports the failure — never an
   empty findings list that reads as "clean".
2. **A zero-tool detection is NOT a pass.** `tool-detector` feeds the quality agent, where
   `runLint`/`runTypecheck` return `{ passed: false, undetermined: true, ran: 0, errors: null }`
   on a zero-tool detection. Any case here must preserve that direction and must never assert a
   shape that lets "no tool found" read as "check passed".
   `tests/vacuous-verification.test.js` holds the contract — read it, do not modify it.
3. **Test fixtures for the secrets scanner use generic high-entropy values, never real provider
   formats.** No `sk_live_`, no `ghp_`, no `AKIA`. The platform's push protection rejects a push
   containing them, and the bypass is never to be used. This is not negotiable and it is not a
   weakening: a generic high-entropy string exercises the same detector path.

### Seams

- Fixture-first: a temp project whose files, manifest or lockfile trigger the branch.
- Child processes: the scanners spawn external tools. Inject at
  `t.mock.method(require('node:child_process'), 'spawnSync'|'execFileSync', …)` guarded on the
  case's own argv, and assert the module's VERDICT, not the spawn. Keep every fixture command an
  argv array with `shell: false`, and assert an overflow of an explicit `maxBuffer` is reported as
  a FAILURE, never as a pass.
- Filesystem faults: `t.mock.method(safeFs, …)` with a path sentinel.
- Never mock the scanner under test.

### Wiring — the live call sites

No module is added. All twelve are live: the scanners run at Step 13 and on `/ctoc:push`, the
detectors feed initialisation and the quality agent, and the audit chain records dispatches. The
new test file is reached by the gated suite.

### Security review

- **No realistic credential in any fixture** (rule 3 above). Reference secrets by name, never by
  value, even in a test.
- No external security tool is actually executed against the repository; every spawn is either
  intercepted at the boundary or points at an inert argv command.
- No network request. If a range can only be covered by fetching an advisory database, report it
  as uncovered with that reason.
- Nothing written outside `os.tmpdir()`; no shell; no host path in an assertion message.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour and the mutation it kills — for
  example `a scanner whose tool could not run reports NOT VERIFIED, never an empty clean result`.
- Every such case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** No source change is intended; a defect this
   slice exposes goes through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields)
   to the human. A defect in a security scanner is precisely a finding that must reach a human.
2. **Grouped by family, one test file** — these twelve are one subject: what CTOC scans for and
   what it detects.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).
4. **Six ranges are unreachable through their module's public surface and are reported here
   rather than covered or deleted.** Each was traced to the caller that makes it unreachable:
   `audit-chain.js` 203-204 (the log heal already strips exactly what this backward scan skips,
   and renames an entirely corrupt log aside, so the last line always parses);
   `sast-runner.js` 583-584 and `sca-runner.js` 380-381 (identical safety nets — every inner
   run method is total, recording failures by pushing to `errors` rather than throwing);
   `secrets-scanner.js` 1154-1155 (`runTruffleHog` is total, unlike its detect-secrets sibling,
   which IS reachable and is covered); `step-13-verify.js` 134-135 (`tryCommand` returns on every
   path, including its timeout and capture-overflow arms); `framework-detector.js` 298-300 (see
   the finding below). Faking any of them would have needed a manufactured throw no real
   filesystem or child process produces, which is the opposite of what this slice is for.
5. **A real defect was found next to the dead range in the framework detector, and is NOT
   fixed here.** `src/lib/framework-detector.js` is not among this plan's declared files, and a
   test asserting today's wrong answer would pin the bug in place, so no case was written for it.
   Reproduced by hand on this tree: a project whose `package.json` carries `react`, `react-dom`
   and `react-scripts` in `dependencies` — the layout Create React App's own generator writes —
   makes `detect()` return **null**, no framework at all. The cause is an asymmetry between two
   helpers: the confidence score credits a framework's dev-dependency signal through
   `hasDevDependency`, which reads only `devDependencies`, while the disqualifier that follows
   asks `hasDependency`, which reads all four dependency maps. A canonical Create React App
   therefore scores 40 on the react dependency alone, ties the Vite React profile, loses the tie
   on priority order, and is then nulled by the Vite-evidence guard. The same asymmetry is what
   makes lines 298-300 unreachable. Moving `react-scripts` to `devDependencies` — the shape the
   existing regression test uses — detects correctly, which is why no test has caught this. It
   needs its own plan.

## Execution Plan

### Step 8: TEST
Write `tests/remainder-security-tooling-coverage.test.js` with one named case per range classified
(a). Run it; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the uncovered ranges for all twelve files. Read every range and write
the (a)/(b)/(c) classification, with the enclosing function, into the header before asserting
anything. Re-read `tests/vacuous-verification.test.js` so no new assertion contradicts it.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builders.
- Sub-item 2: the (a) cases, with child-process interception at the boundary.
- Sub-item 3: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no scanner under
test mocked; every mock restored; the not-verified-versus-passed distinction preserved exactly.
Account for every case GREEN before implementation.

### Step 12: OPTIMIZE
Shared fixture helpers; one spawn-interception helper. No sleeps, no retries.

### Step 13: SECURE
Confirm no fixture carries a realistic credential; confirm no external tool ran against the
repository; confirm no network request; nothing written outside `os.tmpdir()`; no shell.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the twelve
files.

### Step 15: DOCUMENT
The header names every range and its disposition, and states the fixture rule for secret-shaped
values so the next author does not reach for a real provider format.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; every range left, with its reason; any scanner found
to report clean on input it could not read.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — 12 behavioural cases in tests/remainder-security-tooling-coverage.test.js, one per range classified reachable
- [x] Test error conditions — every case IS an error condition: an unreadable lock, a zero-byte log, an unreadable directory, an unparseable tool route, a malformed external report, exhausted lock contention, an unreadable regulatory profile, an unclassifiable directory entry, an unknown script extension, a truncated profile
- [x] Run tests - expect RED (failing) — characterisation over existing code runs GREEN, so red provenance was taken from MUTATION: 12 in-memory single-line mutants (module-loader substitution, nothing written to disk), each killed by exactly its own named case and no other; the twelve sources' sha256 were identical before and after

### Step 9: PREPARE
- [x] Install dependencies if needed — none; node:test and the repository's own modules only
- [x] Check prerequisites — all twelve module paths confirmed present on disk before any test was written
- [x] Verify dev environment ready — the ranges were re-derived from a full `npm test` coverage run; the plan's table matched the live measurement exactly for all twelve files
- [x] Create directories/config if needed — none; every fixture is created under os.tmpdir() at run time and removed in a finally

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — sub-item 1: temp-project fixture builders; sub-item 2: the twelve cases with interception at child_process and safe-fs; sub-item 3: the header naming every range with its class and reason
- [x] Add error handling — every fake is restored in a finally, every fixture removed, the working directory restored
- [x] Wire up integration points — no module added; the new test file is reached by the gated suite

### Step 11: REVIEW
- [x] Self-review all new code — no existing test touched, no assertion weakened, no baseline or exemption entry added, no scanner under test mocked
- [x] Verify integration points work together — full suite green with the new file in place
- [x] Check error handling completeness — all 12 cases were GREEN before any change (characterisation, expected); each was accounted for by a mutation that made it fail, so none is banked

### Step 12: OPTIMIZE
- [x] Remove redundant operations — one fixture builder, one remover, one fresh-require helper, one child-process restorer shared across the file
- [x] Optimize critical paths — no sleeps and no retries; the whole file runs in about 170ms
- [x] Simplify complex code — the fault injection is one guarded assignment per case

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — every path is built with path.join from a mkdtemp root; nothing is written outside os.tmpdir()
- [x] Sanitize outputs — no host path, no command string and no captured output appears in any assertion message
- [x] No secrets in code — no fixture carries a realistic provider credential (no sk_live_, no ghp_, no AKIA); the external-tool fixtures carry no credential at all
- [x] Safe file operations — no shell anywhere; the only real child process is node running CTOC's own tool-detector entry point; no external scanner runs and nothing touches the network

### Step 14: VERIFY
- [x] Run lint + type check — run by the gated suite
- [x] Run ALL tests (TDD Green) — `npm test`: tests 11829, pass 11829, fail 0
- [x] Check coverage >= 80% — 99.46% against the enforced floor of 99 (99.40% before this slice)
- [x] 0 skipped, 0 flaky tests — `[CTOC test-gate] coverage 99.46% (threshold 99%), skipped 0, failed 0` then `[CTOC test-gate] PASS`

### Step 15: DOCUMENT
- [x] Update relevant documentation — CLAUDE.md's test-file count moved 533 to 534 in both places it appears; that is the only reason CLAUDE.md is declared and the only change made to it
- [x] Add JSDoc comments to new functions — the file header classifies every range with its reason, states the fixture rule for secret-shaped values, and records the finding below
- [x] Update CHANGELOG if needed — no changelog entry; no shipped behaviour changed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — see the Execution Record
- [x] All quality checks passed — the gate reported PASS
- [x] Manual verification if needed — the framework-detector finding below was reproduced by hand against a fixture before being recorded
- [x] Ready for human review — one decision goes with it, recorded below


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

**What landed.** One new test file, `tests/remainder-security-tooling-coverage.test.js`, with
12 behavioural cases across the twelve modules that scan for secrets and vulnerabilities,
detect the project's tools, and record the audit chain. No source file was changed; the twelve
modules' sha256 are identical to what they were before this slice began. `CLAUDE.md`'s
test-file count moved from 533 to 534, which is the only edit made to it.

**Every range, and what happened to it.** Eighteen ranges were named by the plan across twelve
files. Twelve are now covered by a case; six are unreachable through their module's public
surface and are named in the test file's header with the caller that makes them unreachable.
None is permission-gated or terminal-only, so this file contains no skip.

**Per-file line coverage, before and after** (`npm test`, scoped to `src/**`):

| file | before | after | left dark |
|---|---|---|---|
| `src/lib/audit-chain.js` | 98.94 | 99.57 | 203-204 (unreachable) |
| `src/lib/deployment.js` | 99.71 | 100.00 | — |
| `src/lib/eu-ai-act-helpers.js` | 99.11 | 100.00 | — |
| `src/lib/framework-detector.js` | 99.43 | 99.43 | 298-300 (unreachable; see the finding) |
| `src/lib/framework-security-checker.js` | 99.71 | 100.00 | — |
| `src/lib/quality-state.js` | 99.27 | 100.00 | — |
| `src/lib/regulatory-regime.js` | 99.74 | 100.00 | — |
| `src/lib/sast-runner.js` | 99.56 | 99.82 | 583-584 (unreachable) |
| `src/lib/sca-runner.js` | 99.52 | 99.81 | 380-381 (unreachable) |
| `src/lib/secrets-scanner.js` | 99.74 | 99.87 | 1154-1155 (unreachable) |
| `src/lib/step-13-verify.js` | 99.80 | 99.80 | 134-135 (unreachable) |
| `src/lib/tool-detector.js` | 99.28 | 100.00 | — |

Whole-repository line coverage moved from 99.40% to 99.46% against the enforced floor of 99.

**Red provenance.** Characterising existing behaviour runs green on the first attempt, so every
case earned its red from a mutation instead. Twelve single-line mutants were applied in memory
through the module loader — nothing was written to any source file, and all twelve sha256 were
confirmed unchanged afterwards. Each mutant flipped its arm toward the false-green direction (a
swallowed error becomes silence, a NOT-RUN scanner reports RUN, a refused lock reports acquired,
an unreadable regulatory profile returns invented dates, an unknown script extension gets a
shell). Every mutant was killed by exactly the case named for it, and by no other case.

**Step 14 VERIFY.** `npm test` from the repository root: tests 11829, pass 11829, fail 0,
skipped 0; `[CTOC test-gate] coverage 99.46% (threshold 99%), skipped 0, failed 0`;
`[CTOC test-gate] PASS`.

**The one thing that needs a decision.** A canonical Create React App project is detected as no
framework at all — see Decision 5 above. It cannot be fixed inside this slice's declared files
and needs its own plan.
