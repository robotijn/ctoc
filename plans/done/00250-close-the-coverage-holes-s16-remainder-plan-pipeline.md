---
iron_loop_verdict: true
title: "Remainder: the plan pipeline, plan state and the plan index"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-plan-pipeline-coverage.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-09-03T10:22:50.637Z
gate_crossed: review → done
---

# Remainder: the plan pipeline, plan state and the plan index

**Scope (one line):** classify and cover the small dark ranges in the fourteen modules that
parse, validate, migrate and index plans.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/migration-safety-checker.js` | 952-953 · 1030-1031 · 1053-1054 · 1061-1062 · 1220-1221 |
| `src/lib/plan-validator.js` | 243-245 · 1124-1125 |
| `src/lib/project-root.js` | 169-179 |
| `src/lib/collapse-stacked-frontmatter.js` | 58-63 · 166-167 |
| `src/lib/frontmatter-merge.js` | 188-193 |
| `src/lib/state.js` | 147 · 150-151 |
| `src/lib/documented-counts.js` | 165-166 |
| `src/lib/traceability-matrix.js` | 64-65 · 201 |
| `src/lib/task-registry.js` | 578 |
| `src/lib/plan-index/conflict-detect.js` | 119-120 · 174-175 |
| `src/lib/plan-index/store.js` | 386-388 |
| `src/lib/plan-index/search.js` | 327-328 |
| `src/lib/plan-index/fusion.js` | 78 |
| `src/lib/plan-index/ollama-client.js` | 44-46 |

**The planner read only one of these: `src/lib/documented-counts.js` in full.** Its 165-166 is the
catch inside `checkPlanDeclaresCountMovers` that sets `counts = null` when `computeDocCounts`
throws — the fail-soft arm that yields a `null` count rather than throwing out of a validation
gate. Its assertion is therefore precise: with `computeDocCounts` made to throw, an offender is
still reported, with `currentCount: null` — **`null`, not `0`**, because nothing was counted.

Every other range in the table is unread by the planner. Step 9 PREPARE reads each one; where the
code disagrees with this plan, the code wins and the drift is reported.

### The classification rule (from the approved parent plan, section 4)

**(a)** reachable → test it; **(b)** permission-gated or terminal-only → leave it and NAME it in
the header with the reason (a permission-gated case that cannot run announces a LOUD skip with a
printed reason); **(c)** dead → report it, never delete it.

### The rule that applies to this family specifically

**A count or a verdict that could not be established is `null`, never `0`, and "could not read" is
never "found nothing".** Several ranges here are the arms that carry that distinction
(`documented-counts` 165-166 is a confirmed one). Where a case covers such an arm, assert the
`null`/unreadable value explicitly — an assertion that only checks "did not throw" lets the two
collapse, which is the false-green shape this repository fences.

Two further constraints:

- **`plan-index/ollama-client.js` must never reach the network in the suite.** Its 44-46 is
  likely a connection-failure arm; drive it against a closed local port or an injected client
  error, never a real endpoint, and assert the fail-soft value. If it cannot be covered without a
  request, report the range as uncovered with that reason — a fetching suite is worse than a dark
  line.
- **No case may move, approve or edit a real plan.** Every fixture is a temp project under
  `os.tmpdir()`; the repository's `plans/` tree is read-only to this slice, and nothing under
  `.ctoc/approvals/` is written at all.

### Seams

- Fixture-first: a temp project with plan files of the exact shape that triggers a branch
  (stacked frontmatter, a malformed `files:` block, a duplicate number, a missing heading).
- Filesystem faults: `t.mock.method(safeFs, …)` with a path sentinel.
- Dependency faults: `t.mock.method` on a required module's exports object (for example
  `computeDocCounts` on `src/lib/doc-counts.js`), or a `Module._load` patch restored in `finally`.
- Never mock the function under test.

### Wiring — the live call sites

No module is added. All fourteen are live: the validator runs at the queue transition, the state
and frontmatter modules are read by every plan operation, `documented-counts` is called by
`plan-validator.validateForQueue`, and the plan-index modules are driven by the index sync hook
and the duplicate guard. The new test file is reached by the gated suite.

### Security review

- No plan is moved or approved outside a temp fixture; no approval marker and no ledger entry is
  written anywhere real.
- No network request from `ollama-client` cases.
- No secret in a fixture; no host path in an assertion message; no shell.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour — for example
  `an unreadable component count is reported as null, never 0 — a null count means nobody counted`.
- Every such case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** No source change is intended, and declaring
   fourteen modules would make the write permission far broader than the work. A defect this
   slice exposes goes through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields)
   to the human.
2. **Grouped by family, one test file** — these fourteen are one subject: how a plan is read,
   checked and indexed.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/remainder-plan-pipeline-coverage.test.js` with one named case per range classified
(a). Run it; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the uncovered ranges for all fourteen files. Read every range and write
the (a)/(b)/(c) classification, with the enclosing function, into the header before asserting
anything. Confirm whether the `ollama-client` range can be reached offline.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builders (per plan shape).
- Sub-item 2: the (a) cases, fixture-driven, with boundary mocks only where a real fault is
  required.
- Sub-item 3: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function under
test mocked; every mock restored; no real plan touched. Account for every case GREEN before
implementation.

### Step 12: OPTIMIZE
Shared fixture helpers. No sleeps, no retries.

### Step 13: SECURE
Confirm no network request was made; confirm the repository's `plans/` and `.ctoc/approvals/` are
unchanged after the suite; no shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the fourteen
files.

### Step 15: DOCUMENT
The header names every range and its disposition.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; every range left, with its reason; any arm found to
report `0` where it meant "could not count".


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — `tests/remainder-plan-pipeline-coverage.test.js`, 25 cases
- [x] Test error conditions — every case IS an error/fault arm or the invariant guarding a dead one
- [x] Run tests - expect RED (failing) — see "Red provenance" below: 23 mutants run, 23 killed

### Step 9: PREPARE
- [x] Install dependencies if needed — none added
- [x] Check prerequisites — all fourteen ranges re-derived from `npm test`'s own table (2026-09-01); every path verified on disk
- [x] Verify dev environment ready — node test runner + coverage, no network
- [x] Create directories/config if needed — fixtures are temp projects under the system temp directory only

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — 19 behaviour cases + 6 dead-range guards
- [x] Add error handling — every fixture cleanup and every mock restore is unconditional (`finally`)
- [x] Wire up integration points — the new file is reached by the gated suite; no module added, so no new wiring is owed

### Step 11: REVIEW
- [x] Self-review all new code — read line by line against each production source
- [x] Verify integration points work together — full suite green; no existing test touched
- [x] Check error handling completeness — see "Green before change" below: all 25 accounted for, none banked

### Step 12: OPTIMIZE
- [x] Remove redundant operations — two shared fault helpers (`withSafeFs`, `withDependencyStub`) and shared fixture builders
- [x] Optimize critical paths — no sleeps and no retries; the one timed wait is the injected 80 ms response the abort case requires
- [x] Simplify complex code — one virtual-tree helper drives all three migration-walk cases

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — every fixture path is built with `path.join` under a `mkdtemp` root
- [x] Sanitize outputs — no host path or error text is asserted from outside the fixtures
- [x] No secrets in code — no credential, no token, no host, no network call of any kind
- [x] Safe file operations — `plans/` and `.ctoc/approvals/` in this repository are untouched (verified with `git status` after the run); the one spawned command is given an EXPLICIT temp target so its `plans/review` default is never used

### Step 14: VERIFY
- [x] Run lint + type check — `eslint --max-warnings 0` clean; `tests/typecheck.test.js` fail 0
- [x] Run ALL tests (TDD Green) — `npm test`: `[CTOC test-gate] PASS`, failed 0, skipped 0, 533 test files
- [x] Check coverage >= 80% — measured 99.4% (up from 99.33% before this slice) against the enforced floor of 99
- [x] 0 skipped, 0 flaky tests — skipped 0; no skip exists in this file, loud or silent

### Step 15: DOCUMENT
- [x] Update relevant documentation — the test file header names all 23 ranges with their class and reason; `CLAUDE.md`'s test-file count moved 532 → 533
- [x] Add JSDoc comments to new functions — every helper documented
- [x] Update CHANGELOG if needed — no changelog file in this repository; the release note is the commit message, which the session owns

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed — the 23-mutant run is the manual verification; its result is recorded below
- [x] Ready for human review — with one decision for the human: six dead ranges found, listed below


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

Built 2026-09-01. One file landed: `tests/remainder-plan-pipeline-coverage.test.js`
(25 cases). `CLAUDE.md`'s test-file count moved 532 → 533. No source file changed —
verified by sha256 before and after every run and by `git status`.

### Drift between this plan and the code

1. **`collapse-stacked-frontmatter.js` is in `src/scripts/`, not `src/lib/`.** The
   plan's table listed it under `src/lib/`. Same class of misreading the previous
   remainder slice hit on the nested index directory; the path was verified on disk
   before anything was written against it.
2. **Every line range in the plan's table is still exact.** All fourteen were
   re-derived from the gate's own coverage table on 2026-09-01 and none had moved.

### Classification (the parent plan's (a)/(b)/(c) rule)

**(a) reachable — 17 ranges, covered by 19 cases.** documented-counts 165-166 ·
plan-validator 1124-1125 · project-root 169-179 · collapse-stacked-frontmatter 58-63
and 166-167 · frontmatter-merge 188-193 · state 147 and 150-151 ·
traceability-matrix 64-65 · migration-safety-checker 1030-1031, 1053-1054,
1061-1062 and 1220-1221 · plan-index/conflict-detect 119-120 and 174-175 ·
plan-index/search 327-328 · plan-index/ollama-client 44-46.

**(b) permission-gated or terminal-only — none.** No range in these fourteen
modules depends on permission bits or on an interactive terminal, so this slice
contains no skips at all, loud or silent.

**(c) dead — 6 ranges, reported and NOT deleted.** Each has a guard case asserting
the invariant that keeps it dark, so reviving it fails a named test first:

| range | why it cannot run |
|---|---|
| `plan-validator.js` 243-245 | its producer, `validateInstructionAdherence`, has no `errors.push` on any path — it is warnings-only, so "instruction errors invalidate the plan" can never fire. The check READS as blocking and is advisory in fact. |
| `traceability-matrix.js` 201 | the `throw lastErr \|\| new StaleMatrixError(...)` fallback: the only path reaching the give-up assigns `lastErr` first, so the fallback argument is never constructed. Line 200 IS covered. |
| `task-registry.js` 578 | the identical shape in `withRegistry`. Line 577 IS covered. |
| `migration-safety-checker.js` 952-953 | `efDownBodyLines`'s fail-soft catch. Its body is a bounded loop over `indexOf`, a brace scan, a newline count and a `Set.add` — no operation in it throws for any string input. |
| `plan-index/fusion.js` 78 | the comparator's `return 0`. `fuseRRF` accumulates into a `Map` and rejects a non-string id, so the two sides are always distinct strings and exactly one of `<` / `>` holds. |
| `plan-index/store.js` 386-388 | `atomicSave`'s memory-only guard, shadowed by the identical guard in its ONLY caller (`withLock` returns before reaching it). |

### Red provenance — 23 mutants run, 23 killed

No source file is declared by this plan, so red was taken by MUTATION, applied in
memory at compile time (a `Module.prototype._compile` interception; the file on disk
is never written). Every source file's sha256 was identical before and after, and
`git status` showed only the new test file. Each mutant was run alone under
`--test-name-pattern` and had to turn its named case red.

| # | mutant | killed by |
|---|---|---|
| 1 | `documented-counts` catch sets `{testFiles:0}` instead of `null` | a component count that could not be computed is reported as null |
| 2 | `plan-validator` stage catch `continue` → `return false` | one unreadable plan stage does not abort the parent-plan lookup |
| 3 | `project-root` `walk failed:` reason → the found-nothing reason | a project-root walk that could not complete says so |
| 4 | `collapse-stacked` drops `err.tempCleanupFailed` | a failed plan write rethrows the REAL write error |
| 5 | `collapse-stacked` `require.main === module` → `false` | the frontmatter-collapse command runs as a command |
| 6 | `frontmatter-merge` stray-line push removed | keeps a stray comment line and drops a pure blank |
| 7 | `state` tie-break `a.created - b.created` → `0` | two plans that vanish between the queue read and the order read |
| 8 | `state` catch returns `files` unsorted | a queue-order read that throws falls back to creation order |
| 9 | `traceability-matrix` `diskGeneration` catch returns `-1` | an unreadable traceability matrix reads as generation 0 |
| 10 | `migration-safety-checker` discover `isDirectory` try/catch removed | an entry whose type cannot be read is skipped |
| 11 | `migration-safety-checker` discover `readdirSync` try/catch removed | an unreadable subdirectory ends that branch only |
| 12 | `migration-safety-checker` collect `isDirectory`/`isFile` try/catch removed | inside a migrations directory, an entry whose type cannot be read |
| 13 | `migration-safety-checker` atlas `if (out && out.trim())` → `if (false)` | atlas exiting 0 with a report is surfaced verbatim |
| 14 | `conflict-detect` overlap catch `hit = false` → `hit = true` | a glob engine that throws never crashes conflict detection |
| 15 | `conflict-detect` `isBroadGlob` compile try/catch removed | a glob engine that throws while measuring index breadth |
| 16 | `search` embedder try/catch removed | an embedder that throws degrades hybrid search |
| 17 | `ollama-client` already-aborted early return removed | a response arriving after the timeout rejects at once (killed by the case's own 10 s timeout — without the arm the client waits forever) |
| 18 | `plan-validator` instruction warning → error | GUARD (plan-validator 243-245 is dead) |
| 19 | `traceability-matrix` `throw lastErr \|\|` → always generic | GUARD (traceability-matrix 201 is dead) |
| 20 | `task-registry` `throw lastErr \|\|` → always generic | GUARD (task-registry 578 is dead) |
| 21 | `migration-safety-checker` `efDownBodyLines(...)` → `new Set()` | GUARD (migration-safety-checker 952-953 is dead) |
| 22 | `fusion` id tie-break removed | GUARD (fusion 78 is dead) |
| 23 | `plan-index/store` `withLock` memory-only early return removed | GUARD (plan-index/store 386-388 is dead) |

Two defects in the MUTATION HARNESS itself were found and fixed rather than worked
around, both instances of the shape this repository fences — a checker reporting a
verdict on input it never read. It first parsed `# pass N` while the runner prints
`ℹ pass N`, and its no-match default was `-1` (never `0`), so an unreadable run was
reported UNREADABLE instead of green. It then read only the `fail` counter, which
would have reported the hanging ollama-client mutant as a SURVIVOR; a cancelled test
is now counted as a kill.

### Green before implementation — all 25 accounted for, none banked

No source changed, so every case was green on its first run by construction. That is
not evidence of anything on its own, which is why red was taken from mutation
instead: the 19 behaviour cases are proven by mutants 1-17 (two cases share the
collapse-stacked and frontmatter-merge mutants), and the 6 dead-range guards by
mutants 18-23. Not one case is banked as red-by-assertion.

### Decisions taken under ambiguity in this slice

1. **The two conflict-detect glob catches are asserted by faulting the DEPENDENCY,
   not by natural input.** `plan-coverage.globToRegex` compiles with a non-throwing
   tokenizer and matches with iterative dynamic programming, so it cannot throw for
   string input today and the two catches are unreachable through data. They are
   still worth asserting because the two consumers of that one call fail in OPPOSITE
   directions on purpose — conflict-detect (advisory) fails open to "no overlap",
   plan-coverage's own `touchesOverlap` (a safety oracle) fails closed to "block" —
   and a silent flip of either is exactly what a fault-injection case catches. The
   test file says this in the open rather than implying the arms are reachable.
2. **The `plan-coverage` fail-closed oracle is asserted by contract, not by
   injection.** `touchesOverlap` calls `globToRegex` from its own module scope, so
   its catch cannot be driven from outside the module. Its case asserts the
   block-ward direction of the shipped behaviour and says plainly why the arm itself
   is not injectable. (That arm belongs to an earlier slice in any case.)
3. **Plan creation times are pinned at the stat boundary in the queue-order cases.**
   Birthtime resolution is a filesystem property; letting it decide an ordering
   assertion would make the case flaky rather than deterministic, and the alternative
   — sleeping between file writes — is the retry-shaped fix this plan forbids.
4. **The frontmatter-collapse command is spawned with an EXPLICIT temp target.**
   Run with no arguments it defaults to `<root>/plans/review` and REWRITES every plan
   there. It is never invoked argument-less anywhere in this file.

### For the human — one decision this slice carries

Six ranges are dead: they can never execute. This slice reports them and does not
delete a line (the parent plan's Decision 2). Two of the six are worth a look
independently of coverage:

- **`plan-validator.js` 243-245 makes a check look blocking that is advisory.** The
  instruction-adherence check sits on the review path and reads as though a
  contradiction between what was asked for and what was built can fail a plan. It
  cannot: its producer only ever emits warnings. Either the check should be able to
  fail a plan, or the branch should go — but that is a decision about how strict the
  review gate is, which belongs to the human, not to this slice.
- **`traceability-matrix.js` 64-65 returns `0` for "could not read the matrix".**
  That is the count-versus-null shape this plan names. It is SAFE as wired, because
  the caller's compare-and-swap then refuses the write (proven by the case), but it
  is safe by consequence rather than by construction: a caller passing an unversioned
  value skips the compare and would commit generation 1 over a generation-5 file.
  Nothing does that today.

### Per-file coverage, before and after

| file | before | after | dark lines left |
|---|---|---|---|
| `src/lib/documented-counts.js` | 98.86 | **100.00** | – |
| `src/lib/frontmatter-merge.js` | 97.96 | **100.00** | – |
| `src/lib/project-root.js` | 95.44 | **100.00** | – |
| `src/lib/state.js` | 99.54 | **100.00** | – |
| `src/scripts/collapse-stacked-frontmatter.js` | 95.27 | **100.00** | – |
| `src/lib/plan-index/conflict-detect.js` | 98.90 | **100.00** | – |
| `src/lib/plan-index/ollama-client.js` | 98.49 | **100.00** | – |
| `src/lib/plan-index/search.js` | 99.47 | **100.00** | – |
| `src/lib/plan-validator.js` | 99.64 | 99.79 | 243-245 (dead) |
| `src/lib/traceability-matrix.js` | 99.01 | 99.67 | 201 (dead) |
| `src/lib/migration-safety-checker.js` | 99.27 | 99.85 | 952-953 (dead) |
| `src/lib/task-registry.js` | 99.92 | 99.92 | 578 (dead) |
| `src/lib/plan-index/store.js` | 99.66 | 99.66 | 386-388 (dead) |
| `src/lib/plan-index/fusion.js` | 99.11 | 99.11 | 78 (dead) |

Suite total 99.33% → **99.40%**. Every remaining dark line in these fourteen files is
one of the six ranges classified dead above — nothing is left unclassified.

### One existing fence fired during verification, and the code was fixed, not the fence

`tests/skip-guard-integrity.test.js` flagged the new file. Its detector matches a
`require()` inside a `try` whose `catch` nulls a binding, and its non-greedy scan ran
from one helper's `try`/`finally` (which has no `catch`) into a LATER
`catch { resolved = null; }` in the module-loader helper, sweeping a `require(` out of
a documentation comment on the way. The fence is conservative and was left exactly as
it is; the helper was changed instead — an unresolvable module specifier is now simply
left undefined and passed through to the real loader, which is both simpler and
unambiguous. All 23 mutants were re-run afterwards and all 23 still die.
