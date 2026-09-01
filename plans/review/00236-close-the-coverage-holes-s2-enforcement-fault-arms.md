---
iron_loop_verdict: true
title: "Make every fail-closed enforcement arm throw, and watch it deny"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: medium
files:
  - tests/enforcement-fault-arms.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.276Z
gate_crossed: implementation → todo
---

# Make every fail-closed enforcement arm throw, and watch it deny

**Scope (one line):** one named fault-injection case per arm in the parent plan's table B,
injecting at the true boundary and asserting the deny-ward value — because today every one of
these arms is believed, not verified, and a future edit could flip any of them to an allow with
the suite still green.

## Implementation Details

### The arms, as the planner read them this session

| # | file | lines | function | the value a fault MUST produce |
|---|---|---|---|---|
| 1 | `src/lib/approval-residency.js` | 285-288 | `isApprovedForCoverage` catch | `{ approved: false, reason: 'classify-error', kind: null }` |
| 2 | `src/lib/plan-coverage.js` | 245-247 | `touchesOverlap` glob catch | `true` (treat as overlapping → block) |
| 3 | `src/lib/plan-coverage.js` | 467-469 | target-path resolution fault | the FAILED verdict |
| 4 | `src/lib/plan-coverage.js` | 669-672 | explain-only fault | `null` — never changes a decision |
| 5 | `src/lib/real-path-confinement.js` | 165-169 | `resolveExisting` loop-exhaustion + outer catch | `{ ok: false, real: null, reason: 'resolve-failed' }` |
| 6 | `src/lib/real-path-confinement.js` | 196-198 | `resolveBasis` outer catch | `{ ok: false, real: null, reason: 'resolve-failed' }` |
| 7 | `src/lib/real-path-confinement.js` | 258-259 | `escapesRoot` outer catch | `{ escapes: true, reason: 'fault' }` |
| 8 | `src/lib/real-path-confinement.js` | 305-306 | `resolvesUnder` outer catch | `true` (treated as inside the protected dir) |
| 9 | `src/lib/shell-write-targets.js` | 526-528 | `classifyWrites` catch | `{ verdict: 'indeterminate', targets: [], reason: REASONS.FAULT }` — **never `none`** |
| 10 | `src/lib/shell-write-targets.js` | 187 | `skipWrapperArgs`'s `suppresses` false arm | `false` (a non-matching flag does not suppress the operand) |
| 11 | `src/hooks/PreToolUse.Bash.js` | 827-830 | `checkWriteCoverage` catch | `result: 'uncovered'` → the channel DENIES |
| 12 | `src/hooks/PreToolUse.Bash.js` | 1069-1070 | `main().catch` | exit 1 + `[CTOC] Bash gate error:` on stderr |

Arm 10 is not a fault arm — it is a plain behavioural branch that happens to be dark; it is in
this slice because it lives in the same module as arm 9 and needs no separate file.

### What the planner verified (read this session)

Read in full or at the cited ranges: `src/lib/approval-residency.js` (lines 1-130 and 200-299),
`src/lib/real-path-confinement.js` (lines 130-313 — every one of the four arms),
`src/lib/shell-write-targets.js` (lines 160-199 and 440-531),
`src/lib/plan-coverage.js` lines 215-251 (arm 2 only),
`src/hooks/PreToolUse.Bash.js` lines 770-831 and 1020-1071.

**Not read, and therefore to be located at Step 9 PREPARE:** `plan-coverage.js` around 467-469
and 669-672 (arms 3 and 4). The parent plan names their behaviour (`FAILED`, and `null` that
never changes a decision); confirm the enclosing function and the exact returned value against
the code before writing the assertion, and if the code disagrees with the table, **trust the
code and report the drift**.

### The injection rule, and the one trap in it

Inject at the TRUE boundary — `safeFs`, `fs`, `path`, `child_process`, the module loader — via
`t.mock.method(...)` (auto-restored by `node:test`) or `Module._load` patching restored in a
`finally`. **Never stub the function under test.**

**The trap:** a module-internal call binds the function directly. `isApprovedForCoverage` calls
`classifyResidency` by name inside its own module, so mocking `module.exports.classifyResidency`
does **nothing**. The fault must originate deeper, inside `classifyResidency`, at a real
boundary. The same is true of `classifyWrites` → `splitSegments`/`tokenize`/`classifySegment`,
and of `escapesRoot` → `resolveBasis`/`resolveExisting`.

Where a shared module object IS the boundary, mocking works because the call site looks the
property up at call time: `approval-residency.js` calls `safeFs.readFileSync(...)`, so
`t.mock.method(require('../src/lib/safe-fs'), 'readFileSync', fn)` reaches it.

**Guard every mock with a path sentinel** so only the case's own input throws and the rest of
the process keeps working:

```js
const realStat = safeFs.statSync;
t.mock.method(safeFs, 'statSync', (p, o) => {
  if (String(p).includes('CTOC-FAULT-SENTINEL')) throw new Error('injected');
  return realStat(p, o);
});
```

### Seams, arm by arm

- **Arm 1** — `isApprovedForCoverage(planPath, 'todo', root)`. `classifyResidency` reads the
  ledger and the plan; make a `safeFs` read used inside it throw a **non-Error** value (a plain
  object, or one whose `code` getter throws) so no inner `catch (err)` that inspects `err.code`
  can absorb it cleanly and the outer catch is reached. Verify at PREPARE which read
  `classifyResidency` performs first (`readPlan` has its OWN catch returning `null`, so
  `readFileSync` alone will NOT reach the outer catch — pick a call that is not already
  wrapped). Assert the full triple, `reason: 'classify-error'` included, not just `approved`.
  Also assert the neighbouring closed arm at line 279 (`stage-not-coverable`) with an
  unrecognised stage, since it is the same fail-closed contract one branch over.
- **Arm 2** — `touchesOverlap(['a'], ['b'])` with `globToRegex` made to throw. `globToRegex` is
  called by name inside the module, so inject via the loader: the module requires it from a
  sibling; patch `Module._load` for that resolved filename to return a `globToRegex` that
  throws, restore in `finally`. Assert `true`. A mutant returning `false` here makes the
  scheduler call two conflicting plans safe to run at once.
- **Arms 5-8** — the four `real-path-confinement` totality arms. The outer catches sit around
  code whose only throwing primitives are `path.*` calls and the inner `catch (err)` bodies
  that read `err.code`. Two seams, both real:
  - `t.mock.method(path, 'isAbsolute'|'dirname'|'basename'|'resolve', …)` with a sentinel, for
    the arms whose outer try contains a bare `path` call (arms 7 and 8 call
    `path.isAbsolute(targetFile)`/`path.join` before anything else).
  - a **getter-throwing error object** for the arms whose only outer-try code is an inner
    `catch (err)` that evaluates `err && err.code`:
    `t.mock.method(safeFs, 'realpathSync', () => { throw { get code() { throw new Error('boom'); } }; })`
    reaches `resolveBasis`'s outer catch (arm 6) through its own inner catch.
  For arm 5 also cover the loop-exhaustion return at line 165 with a path whose non-existent
  tail is longer than the walk bound — read the bound at PREPARE (it is above line 130, which
  the planner did not read) and build the path from it rather than guessing a depth.
  Assert the exact object each arm returns, and for arms 7/8 assert the **direction**: `escapes`
  is `true` and `resolvesUnder` is `true` — a mutant returning the other boolean turns a
  confinement check into a permission grant.
- **Arm 9** — `classifyWrites` is pure and has no injectable dependency inside its try. Reach
  the catch through the input: pass a value that passes `typeof command === 'string'` yet makes
  a later operation throw. At PREPARE, read `splitSegments`/`tokenize` (lines ~200-440, not read
  by the planner) and choose a real input that throws — for example a string that drives a
  pathological path in one of the regexes, or a `String` subclass instance if the guard admits
  one. **If no genuine input reaches the arm, say so and inject at the loader boundary instead**
  (patch the module's own `require` of any sibling it uses inside the try). Do not fabricate a
  case, and do not weaken the guard to let one in. Assert `verdict: 'indeterminate'` and
  `reason === REASONS.FAULT`, and assert explicitly that the verdict is **not** `'none'` — that
  is the mutation that matters, because `none` means "no write here, allow".
- **Arm 10** — call the classifier with a wrapper command carrying a `suppressOperand` flag list
  and a flag that does NOT match it, so `suppresses(tok)` returns `false` at line 187. Read the
  wrapper table at PREPARE (above line 160) to pick a real wrapper and a real non-matching flag.
  Assert the resulting targets, not the internal return.
- **Arm 11** — `PreToolUse.Bash.js` exports nothing and is only runnable as a process. Spawn it
  with a preload: `spawnSync(process.execPath, ['--require', preload, HOOK], { input, cwd })`,
  where `preload` seeds `require.cache` for the resolved `src/lib/plan-coverage.js` with a
  `findCoveringPlan` that throws (keeping the module's other exports intact, since the hook also
  uses them). The payload must carry a determinate write to a non-whitelisted target and must
  reach the coverage stage — reuse the state setup in `tests/bash-gate-plan-coverage.test.js`
  (read it at PREPARE; do not modify it). Assert the harness-visible DENY: the
  `permissionDecision: "deny"` JSON on stdout, and that the message names the target.
- **Arm 12** — same spawn shape, with a preload that makes a module `main()` uses throw. Assert
  exit code 1 and stderr containing `[CTOC] Bash gate error:`. Record in the test's header what
  the file's own comment states: **exit 1 is NOT a deny** — the harness treats it as
  non-blocking — so this case pins a documented fail-open, and changing it is the human's
  decision, not this slice's.

### Wiring — the live call sites

This slice adds no module and no export. The new test file is reached by the gated suite
(`npm test` → `src/scripts/test-gate.js` → `node --test tests/*.test.js`). Every function under
test already has live call sites in the enforcement path: `plan-coverage` and
`approval-residency` are called by `src/hooks/PreToolUse.Edit.js` and `PreToolUse.Bash.js`;
`real-path-confinement` and `shell-write-targets` are called by `PreToolUse.Bash.js`.

### Security review

- No secret is read or printed. The Bash-hook cases must not put a command string into any
  assertion message — a command can carry a secret, which is why the hook's own log records a
  fixed-vocabulary reason instead.
- The preload scripts live under `os.tmpdir()` and are removed in `after`.
- Every child is spawned with an argument array and no shell.
- No mock outlives its case: `t.mock.method` restores automatically; `Module._load` patches are
  restored in `finally`; `require.cache` entries are saved and restored.

## Test Plan (TDD-Red first)

One `describe` per module, one `it` per arm, each named for the arm and the value it must
return — for example:
`approval-residency: a classifier fault returns approved:false with reason classify-error (never a throw, because a throw becomes an ALLOW)`.

All twelve cases are RED before the change (every cited range is uncovered today). Any case that
is GREEN on the first run means the arm was already reachable by an existing test and the range
map is stale — account for it at Step 11 and say so; never bank it.

Mutation intent, stated per case so no case is a line-toucher:
- arms 1, 11: flipping the returned verdict to an allow reds the case.
- arms 2, 8: returning `false` reds the case.
- arms 5-7: returning `ok: true` / `escapes: false` reds the case.
- arm 9: returning `none` reds the case.
- arm 12: exiting 0 reds the case.

## Decisions Taken Under Ambiguity

1. **One test file for all twelve arms.** They are one contract — "a fault in an enforcement
   oracle denies" — and splitting them across six files would hide that. The work surface stays
   one file.
2. **No source file is declared in `files:`.** This slice intends no source change. If a case
   exposes a real defect (an arm that does NOT return its documented value), the executor must
   NOT quietly edit the module: file the growth through `src/lib/scope-growth.js`
   (`requestScopeGrowth`) with all seven fields, which surfaces it to the human as a question.
   A fault arm returning the wrong value is exactly the finding this slice exists to produce.
3. **Arm 12 asserts exit 1, the documented value, and does not argue with it.** The file's
   comment says the harness reads exit 1 as non-blocking and that this must be preserved rather
   than "unified" with the Edit hook's `exit(0)`. Pinning it makes any future change visible.
4. **Where the planner did not read the code, the plan says so** (arms 3, 4, the walk bound for
   arm 5, the wrapper table for arm 10, the tokenizer for arm 9). Step 9 locates them in the
   code; if the code disagrees with the table above, the code wins and the drift is reported.

5. **Arm 2 is UNREACHABLE and is reported as unreached, never faked.** The plan expected
   `globToRegex` to be required from a sibling module, so that a loader patch could make it throw.
   It is not: it is defined INSIDE `src/lib/plan-coverage.js` (line 206), and `tokenizeGlob` /
   `matchTokens` are total functions over every string — the module's own docblock says so and
   calls the `touchesOverlap` catch "documented-unreachable defense in depth". Both non-string and
   empty entries are filtered before the `try`, so no input reaches it either. Reaching it would
   require stubbing the module under test, which this slice forbids. The case written instead pins
   the PREMISE the unreachability rests on (totality over adversarial globs), and the test file's
   header names lines 245-247 as deliberately left with that reason. Under a mutation that breaks
   `globToRegex`'s totality, `touchesOverlap` returns `true` (block) — the documented conservative
   direction — and the premise case reddens, so the arm's correctness is not merely assumed.
6. **The red provenance is a mutation matrix, because a slice that changes no source cannot have a
   failing-first run.** Thirteen mutations, one arm at a time, each flipping the arm to its
   allow-ward value; each reddened exactly one case and no other; each file restored byte-for-byte
   with a sha256 check and a clean `git status src/`. No mutation was left on disk.
7. **Two extra cases beyond the twelve arms.** `approval-residency` line 279
   (`stage-not-coverable`) is asserted alongside arm 1 because it is the same fail-closed contract
   one branch over, as the plan directed; and arm 5 is split into two cases because its two
   deny-ward returns (walk exhaustion at line 165, outer catch at 168) are different code with the
   same value, and one case would leave the other dark.

## Execution Plan

### Step 8: TEST
Write `tests/enforcement-fault-arms.test.js` with the twelve named cases. Run
`node --test tests/enforcement-fault-arms.test.js` and record every case as RED with the reason.

### Step 9: PREPARE
Re-derive the uncovered ranges from the gate's report (the numbers above are from 2026-08-31).
Read the four places the planner did not: `plan-coverage.js` 467-469 and 669-672,
`real-path-confinement.js` above line 130 (the walk bound), `shell-write-targets.js` 200-440
(the tokenizer and wrapper table), and `tests/bash-gate-plan-coverage.test.js` (the state setup
that reaches the coverage stage). Confirm each arm's real returned value before asserting it.

### Step 10: IMPLEMENT
- Sub-item 1: the in-process cases (arms 1-10) with sentinel-guarded boundary mocks.
- Sub-item 2: the two spawned cases (arms 11, 12) with `--require` preloads under `os.tmpdir()`.
- Sub-item 3: a header naming every range covered and every range deliberately left, with its
  reason, per the parent plan's classification rule.

### Step 11: REVIEW
No function under test is mocked; every mock is at a real boundary and is restored; no existing
test file is touched; no assertion is weakened; no baseline or exemption is added. Account for
every case that was GREEN before implementation.

### Step 12: OPTIMIZE
One shared sentinel-mock helper and one shared spawn helper. No sleeps, no retries.

### Step 13: SECURE
No command string in any message or assertion; no secret in a fixture; every temporary file
removed; no shell.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the new percentage for each of the five modules touched.

### Step 15: DOCUMENT
The test file's header states, in plain words, that these arms are the ones that keep the
harness closed when something breaks, and that each case asserts the deny-ward value.

### Step 16: FINAL-REVIEW
Report: which arms now have a named case; any arm whose real behaviour differed from the table
(with the drift); any arm that could not be reached without stubbing the function under test —
named as unreached, never faked.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — `tests/enforcement-fault-arms.test.js`, 14 named cases across 5 modules
- [x] Test error conditions — every case IS an error condition — a fault injected at a true boundary
- [x] Run tests - expect RED (failing) — RED PROVENANCE BY MUTATION (this slice changes no source, so a healthy tree is green by design): 13 mutations, one arm at a time, each flipping the arm to its allow-ward value, each reddening EXACTLY ONE case — its own — and each file restored byte-for-byte (sha256 + clean `git status src/`). Full matrix in Verification Evidence below. One genuine first-run RED was a defect in the TEST, not the code: the deny-JSON parser took the innermost `{` rather than the whole document, so a real DENY read as an allow. Fixed in the test; the hook was never touched.

### Step 9: PREPARE
- [x] Install dependencies if needed — none — `node:test`, `node:assert/strict` and stdlib only
- [x] Check prerequisites — all four places the planner had not read were located and read: `plan-coverage.js` `scanForCoverage` 467-469 and `explainDenial` 664-672; `MAX_ANCESTOR_WALK = 4096` (real-path-confinement line 103); the `WRAPPERS` table and `skipWrapperArgs` (shell-write-targets 118-201) plus `tokenize`/`splitSegments`/`classifySegment`; and `tests/bash-gate-plan-coverage.test.js`'s state setup (read, NOT modified)
- [x] Verify dev environment ready — `node --test` and `npm test` both run from the repository root
- [x] Create directories/config if needed — none — every fixture is a temp project under `os.tmpdir()`, removed in `afterEach`

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — 14 cases — arms 1, 1b (stage-not-coverable), 3, 4, 5a (outer catch), 5b (walk exhaustion), 6, 7, 8, 9, 10, 11, 12, plus the arm-2 premise case
- [x] Add error handling — every mock is sentinel-guarded so only the case's own input faults; the spawned cases mutate only a CHILD's module cache and remove their preload files
- [x] Wire up integration points — the file is reached by the gated suite (`npm test` -> `src/scripts/test-gate.js` -> `node --test tests/*.test.js`); no module and no export was added, so there is nothing new to wire

### Step 11: REVIEW
- [x] Self-review all new code — no function under test is stubbed — the boundaries used are the `approval-ledger` exports object, `node:path` (`isAbsolute`, `join`, `resolve`, `posix.normalize`), `safe-fs` (`realpathSync`, `lstatSync`) and a child's module cache seeded through `--require`. No existing test file modified, no assertion weakened, no baseline/whitelist/exemption entry added anywhere.
- [x] Verify integration points work together — the two spawned cases drive the REAL hook end to end and read the harness-visible verdict (the deny decision JSON, the exit code, stderr)
- [x] Check error handling completeness — every case that admits a meaningful control asserts the control too (arms 1, 3, 4, 5a, 8, 9, 11, 12), so no case can pass on an input that never reached the arm. GREEN-BEFORE-IMPLEMENTATION ACCOUNTING: all 14 were green on the first healthy run, which is expected of a slice that changes no source — none is banked; their value rests on the mutation matrix, in which each case is the unique detector of its own arm's inversion.

### Step 12: OPTIMIZE
- [x] Remove redundant operations — one `makeProject`, one `writePlan`, one `runHook`, one `writePreload` helper shared across the file
- [x] Optimize critical paths — no sleeps, no retries, no polling; the slowest case is the 4096-deep ancestor walk at ~44 ms and the whole file runs in ~210 ms
- [x] Simplify complex code — each fixture is the minimum its case needs; nothing is shared across describes in a way that couples two cases

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — every fixture path is built with `path.join` under `os.tmpdir()` and realpath'd; nothing is written outside the temp project or the temp preload file
- [x] Sanitize outputs — no command string appears in any assertion or assertion message (a command can carry a secret — the hook's own log records a fixed-vocabulary reason for the same reason); the arm-11 assertion matches only the fixture TARGET path
- [x] No secrets in code — no credential, no token, no high-entropy fixture value
- [x] Safe file operations — every child is spawned with an argument array and NO shell; temp projects and preload files are removed in `afterEach`

### Step 14: VERIFY
- [x] Run lint + type check — run as part of the gated suite
- [x] Run ALL tests (TDD Green) — `npm test` -> `[CTOC test-gate] PASS`, failed 0
- [x] Check coverage >= 80% — measured 99.25 %, against the enforced floor of 99 in `.ctoc/coverage-baseline.json`
- [x] 0 skipped, 0 flaky tests — `skipped 0`; no case has a sleep, a retry or a wall-clock dependency

### Step 15: DOCUMENT
- [x] Update relevant documentation — the test file's header states in plain words what these arms are, that each case asserts the deny-ward value, every range covered, and the ONE range deliberately left with its reason
- [x] Add JSDoc comments to new functions — every helper in the test file carries one
- [x] Update CHANGELOG if needed — `CLAUDE.md`'s test-file count moved 528 -> 529 in both places it appears — the only reason `CLAUDE.md` is declared by this slice

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — each step above carries its evidence
- [x] All quality checks passed — see Verification Evidence below
- [x] Manual verification if needed — the mutation matrix is the manual verification
- [x] Ready for human review — the built work is waiting for a human's OK to call it done


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Verification Evidence

### The mutation matrix — the red provenance

Each row: one arm flipped to its allow-ward value, the whole test file re-run, the source restored
byte-for-byte (sha256 verified, `git status src/` clean afterwards). Every mutation reddened
**exactly one** case — its own — and no other, so no case is a line-toucher and no case is a
duplicate detector.

| arm | file · line | mutated to | cases reddened |
|---|---|---|---|
| 1 | `approval-residency.js` 287 | `approved: true` | 1 (only) |
| 1b | `approval-residency.js` 279 | `approved: true` | 1 (only) |
| 3 | `plan-coverage.js` 468 | a fabricated covering match | 1 (only) |
| 4 | `plan-coverage.js` 671 | a fabricated denial | 1 (only) |
| 5a | `real-path-confinement.js` 168 | `ok: true` | 1 (only) |
| 5b | `real-path-confinement.js` 165 | `ok: true` | 1 (only) |
| 6 | `real-path-confinement.js` 197 | `ok: true` | 1 (only) |
| 7 | `real-path-confinement.js` 258 | `escapes: false` | 1 (only) |
| 8 | `real-path-confinement.js` 305 | `false` | 1 (only) |
| 9 | `shell-write-targets.js` 527 | `verdict: 'none'` | 1 (only) |
| 10 | `shell-write-targets.js` 187 | `true` (always suppress) | 1 (only) |
| 11 | `PreToolUse.Bash.js` 829 | `result: 'covered'` | 1 (only) |
| 12 | `PreToolUse.Bash.js` 1070 | `process.exit(0)` | 1 (only) |
| 2 | `plan-coverage.js` 207 | `globToRegex` made non-total | the premise case (plus 3 collateral cases that use the same matcher); `touchesOverlap` returned `true` — block — the documented conservative direction |


`npm test` (the gated entry point — the only run that enforces the coverage floor and the
zero-skipped gate), run from the repository root on 2026-09-01:

```
[CTOC test-gate] coverage 99.25% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

Measured line coverage for the five modules this slice targets:

| module | line coverage | lines still uncovered |
|---|---|---|
| `src/lib/approval-residency.js` | 100.00 % | none |
| `src/lib/real-path-confinement.js` | 100.00 % | none |
| `src/lib/shell-write-targets.js` | 100.00 % | none |
| `src/hooks/PreToolUse.Bash.js` | 100.00 % | none |
| `src/lib/plan-coverage.js` | 99.56 % | 245-247 — the unreachable overlap catch (Decision 5) |

The single remaining uncovered range across all five modules is exactly the one arm named as
unreachable in the test file's header. Every other arm in the parent plan's table is now asserted
by a named case, and every one returned its documented deny-ward value.

## Execution Record

Landed: `tests/enforcement-fault-arms.test.js` (new, 14 cases) and a one-word count change in
`CLAUDE.md` (528 -> 529 test files, in both places it appears). No source file was changed; none is
declared by this slice, and none needed changing — every one of the eleven reachable fail-closed
arms plus the behavioural branch already returned its documented value under an injected fault. No
scope-growth request was needed and none was filed.

Drift between the approved plan and the code, reported rather than silently absorbed:

1. `globToRegex` is module-local, not required from a sibling — so arm 2's planned loader seam does
   not exist and the arm is unreachable (Decision 5 above).
2. `resolveExisting` and `resolveBasis` are not exported, so arms 5 and 6 are asserted through their
   public callers `escapesRoot` / `resolvesUnder`. The deny-ward values are unchanged; the reason
   string observed at the public boundary for arm 6 is `root-resolve-failed`, which is
   `resolve-failed` as the plan's table states, prefixed by the caller to say WHICH side failed.
3. The walk bound the plan asked to be read is `MAX_ANCESTOR_WALK = 4096`; the exhaustion case
   builds a 4200-segment path from it rather than guessing a depth.
