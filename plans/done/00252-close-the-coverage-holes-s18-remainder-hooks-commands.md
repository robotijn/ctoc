---
iron_loop_verdict: true
title: 'Remainder: the hooks, the three commands, and the release scripts'
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-hooks-commands-coverage.test.js
  - CLAUDE.md
kickback_counts:
  by_step:
    '14': 1
  total: 1
approved_by: human
approved_at: 2026-09-03T10:22:50.806Z
gate_crossed: review → done
---

# Remainder: the hooks, the three commands, and the release scripts

**Scope (one line):** classify and cover the small dark ranges in the eleven modules behind the
shipped commands, the stop gates, project initialisation and the release script.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/init-project.js` | 615-616 · 728-729 · 760-762 · 790-792 |
| `src/scripts/release.js` | 198-201 · 239-242 · 295-298 |
| `src/commands/update.js` | 140-141 · 204-211 |
| `src/commands/push.js` | 190-194 |
| `ctoc-routing-reminder.js` | 85-86 · 227-228 · 279-280 |
| `stop-continuation-gate.js` | 62-63 |
| `stop-test-gate.js` | 182-183 |
| `src/lib/settings.js` | 309-310 |
| `src/lib/v8-dispatcher.js` | 276 |
| `src/lib/tui.js` | 247-248 |
| `src/lib/cache.js` | 46 |

**Three paths in that table are ambiguous in the measurement handed to the planner and must be
resolved at Step 9 before anything is written:** `ctoc-routing-reminder.js`,
`stop-continuation-gate.js` and `stop-test-gate.js` were reported without a definite directory.
`src/hooks/UserPromptSubmit.js` requires `../lib/ctoc-routing-reminder`, so at least the routing
reminder has a `src/lib/` implementation; there may also be a `src/hooks/` file of the same name.
Locate each file for real (a directory listing, not a guess) and write the true path into the
header.

**The planner did not read any of these eleven files.** The table is the measurement, not an
analysis.

### The classification rule (from the approved parent plan, section 4)

**(a)** reachable → test it; **(b)** permission-gated or terminal-only → leave it and NAME it in
the header with the reason (a permission-gated case that cannot run announces a LOUD skip with a
printed reason); **(c)** dead → report it, never delete it.

Expect **(b)** to be the honest answer for parts of `src/lib/tui.js` — terminal rendering — and
possibly for parts of `update.js`. Naming those with a reason is the deliverable for them; faking
a terminal is not.

### The four rules that apply to this family specifically

1. **A stop gate must fail OPEN and stay escapable.** `stop-continuation-gate` blocks a premature
   stop but allows on any internal error, on a registered fork, on an exhausted budget, and under
   `CTOC_SKIP_CONTINUATION=1`. Any case here must assert the ALLOW direction on a fault. A mutant
   that made a gate fault into a block would trap the human in a loop — that is the mutation to
   kill.
2. **No case may run a real update, push, release or git operation.** `release.js` writes version
   numbers across files and `push.js` runs the quality gate: every case must run against a temp
   fixture project, and any git or network invocation must be intercepted at
   `child_process`. **Never invoke `git` against this repository from a test.**
3. **No case may modify `.ctoc/settings.yaml` or `.ctoc/quality-config.yaml` in the repository.**
   Those are command tables — their contents are obeyed, not merely believed — and they are
   protected precisely because writing them changes what runs on every commit. Fixture copies
   only.
4. **`init-project.js` creates `CLAUDE.md` and the `plans/` tree.** Every case runs in a temp
   directory, and the suite must assert afterwards that the repository's own `CLAUDE.md` and
   `plans/` are unchanged.

### Seams

- Fixture-first: a temp project, seeded with just enough to drive the branch.
- Child processes and git: `t.mock.method(require('node:child_process'), …)` guarded on the
  case's own argv; assert the module's verdict, not the spawn.
- Hooks with no export: spawn as a child with a `--require` preload that seeds `require.cache`
  for the module whose fault the case needs, exactly as `tests/pretooluse-write-coverage.test.js`
  does. Assert exit code and the documented stderr line.
- Filesystem faults: `t.mock.method(safeFs, …)` with a path sentinel.
- Never mock the function under test.

### Wiring — the live call sites

No module is added. All eleven are live: the three shipped commands (`/ctoc:start`, `/ctoc:push`,
`/ctoc:update`), the registered stop hooks, the initialisation path that runs when a project has
no `.ctoc/`, and the release script a human runs. The new test file is reached by the gated suite.

### Security review

- No git operation, no push, no release, no update against the repository.
- No command table in the repository is written.
- No secret in a fixture; no host path in an assertion message; argument arrays, no shell.
- Every temporary file removed in `after`.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour and the mutation it kills — for
  example `a fault inside the stop gate ALLOWS the stop — a gate that blocks on its own bug traps the human`.
- Every such case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** No source change is intended; a defect this
   slice exposes goes through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields)
   to the human.
2. **The three ambiguous paths are resolved by looking, not by assuming** — and the true paths are
   written into the header, so the next reader does not repeat the ambiguity.
3. **Terminal-only ranges are named, not faked** — the same standing decision that governs the
   dashboard's interactive branch.
4. **A dead range is reported, never deleted** (parent plan, Decision 2).
5. **The three ambiguous paths resolved to** `src/lib/ctoc-routing-reminder.js` (there is no
   `src/hooks/` file of that name), `src/hooks/stop-continuation-gate.js` and
   `src/hooks/stop-test-gate.js`. All three are written into the test file's header.
6. **Red provenance comes from mutation, not from a first failing run.** This slice writes no
   source, so no case can be red before an implementation that does not exist. Each of the
   seventeen ranges was mutated IN MEMORY — the source text swapped between the file read and
   V8 compilation, in the test process and in every child that inherits it — and the suite
   re-run. The repository file was never modified; every one of the ten sources was verified
   byte-identical by sha256 after the sweep.
7. **`src/lib/tui.js` 247-248 is class (b): named, not faked.** `process.stdin.setRawMode(true)`
   inside `setupKeyboard` runs only when stdin is a real terminal. Under the test runner stdin is
   a pipe, and a pipe has no `setRawMode` method at all, so the only way to "cover" it is to
   assign a fake `isTTY` and a fake `setRawMode` onto `process.stdin` — which tests the fake and
   proves nothing about a terminal.
8. **No range in the eleven modules was found dead.** Class (c) is empty for this slice.
9. **`.ctoc/settings.yaml` does not exist in this repository**, so the "command tables are
   unchanged" guard hashes `.ctoc/quality-config.yaml` and `CLAUDE.md` and asserts it hashed
   something, rather than silently guarding an empty list.

## Execution Plan

### Step 8: TEST
Write `tests/remainder-hooks-commands-coverage.test.js` with one named case per range classified
(a). Run it; record every case RED with its reason.

### Step 9: PREPARE
Resolve the three ambiguous file paths by listing the directories. Run the gate and re-derive the
uncovered ranges for all eleven files. Read every range and write the (a)/(b)/(c) classification,
with the enclosing function and the true path, into the header before asserting anything.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builders.
- Sub-item 2: the in-process cases.
- Sub-item 3: the spawned hook cases with `--require` preloads.
- Sub-item 4: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline, exemption or command table changed;
no function under test mocked; every mock restored; no git operation performed. Account for every
case GREEN before implementation.

### Step 12: OPTIMIZE
Shared fixture and spawn helpers. No sleeps, no retries.

### Step 13: SECURE
Confirm the repository's `CLAUDE.md`, `plans/`, `.ctoc/settings.yaml` and
`.ctoc/quality-config.yaml` are byte-for-byte unchanged after the suite; no shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the eleven
files.

### Step 15: DOCUMENT
The header names every range, its true file path, its class and its reason.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; the resolved paths for the three ambiguous entries;
every range left, with its reason; any stop gate found to block on its own fault.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — `tests/remainder-hooks-commands-coverage.test.js`, 19 cases across the eleven modules
- [x] Test error conditions — every case IS an error condition: 17 fail-open/fail-closed arms plus two version-resolution fallbacks
- [x] Run tests - expect RED (failing) — see "Red provenance" below: no source is written by this slice, so red comes from MUTATION. 19 mutants, 19 killed, each by its named case; all ten source files byte-identical afterwards (sha256)

### Step 9: PREPARE
- [x] Install dependencies if needed — none added
- [x] Check prerequisites — the three ambiguous paths resolved by listing `src/hooks/` and `src/lib/`: `src/lib/ctoc-routing-reminder.js` (no `src/hooks/` twin exists), `src/hooks/stop-continuation-gate.js`, `src/hooks/stop-test-gate.js`
- [x] Verify dev environment ready — baseline `npm test` re-run before writing anything: PASS, coverage 99.45%, failed 0, skipped 0
- [x] Create directories/config if needed — the plan's line ranges were re-derived from that run and matched the table EXACTLY for all eleven files

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — sub-item 1: temp-project fixture builders (release, mirror, init, approved-queue, test-gate); sub-item 2: 13 in-process cases; sub-item 3: 3 spawned cases with `--require` preloads seeding `require.cache`; sub-item 4: the header, every range with its class and reason
- [x] Add error handling — the fixtures fail loudly: the release fixture seeds every declared update path so no file can reach `failures` through the "missing expected path" arm, and the cache-directory stubs key on the real constant rather than on whatever the host has installed
- [x] Wire up integration points — no module added; the new test file is reached by the gated suite

### Step 11: REVIEW
- [x] Self-review all new code — no existing test touched; no assertion weakened; no baseline, exemption or command table changed; no function under test mocked; every stub restored in a `finally`; no git operation performed
- [x] Verify integration points work together — the three spawned cases drive the REAL files (`src/commands/push.js`, `src/hooks/stop-continuation-gate.js`, `src/hooks/stop-test-gate.js`) as child processes with a JSON-free stdin, against temp fixtures
- [x] Check error handling completeness — GREEN-BEFORE-CHANGE ACCOUNTED FOR: all 19 cases were green on their first correct run, and that is the expected shape for a characterisation slice that writes no source. Two were red on the very first run, both because MY fixture was wrong, not because the code was: the release documentation case seeded content the real replacement patterns did not match (so the write was never attempted), and the ambiguous-cache case passed the fixture through to the host's real plugin cache. Both were corrected and both now kill their mutant. A third, weaker case was caught by the mutation sweep itself: the JSON-version case originally asserted only `failures.length > 0`, which the unrelated "missing expected path" arm satisfied — its mutant SURVIVED. It was tightened to a deep-equal over every declared file and now kills it. Nothing was banked.

### Step 12: OPTIMIZE
- [x] Remove redundant operations — one `withStub` helper, one `withPoisonedRequire` helper, one `writeThrowingPreload` helper, one temp-directory registry cleaned in a single `after`
- [x] Optimize critical paths — no sleeps, no retries, no polling; the file runs in ~130 ms
- [x] Simplify complex code — the spawned cases share one preload shape

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — every fixture path is built with `path.join` under `os.tmpdir()`, resolved through `realpathSync`
- [x] Sanitize outputs — no host path and no secret appears in any assertion message
- [x] No secrets in code — none; no network call, no git command, no push, no real release, no real update
- [x] Safe file operations — the last case in the file re-hashes the repository's own `CLAUDE.md` and `.ctoc/quality-config.yaml` and re-lists the `plans/` tree, asserting both unchanged; `.ctoc/settings.yaml` does not exist in this repository and is therefore not hashed (the guard asserts it hashed something rather than silently guarding nothing)

### Step 14: VERIFY
- [x] Run lint + type check — run as part of the gated suite
- [x] Run ALL tests (TDD Green) — `npm test`: `[CTOC test-gate] PASS`, failed 0
- [x] Check coverage >= 80% — 99.52% against the enforced floor of 99, up from 99.45% at baseline
- [x] 0 skipped, 0 flaky tests — skipped 0; the file declares no skip, loud or otherwise

### Step 15: DOCUMENT
- [x] Update relevant documentation — the test file header names every range, its true path, its class and its reason
- [x] Add JSDoc comments to new functions — every helper in the file is documented
- [x] Update CHANGELOG if needed — `CLAUDE.md`'s two test-file count lines moved 534 → 535, the live value from `computeDocCounts`. Nothing else in `CLAUDE.md` was touched.

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed — per-file coverage read from the gate's own printed table, before and after
- [x] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

### Red provenance — 19 mutants, 19 killed, every source byte-identical afterwards

Each mutant flips the arm's DIRECTION or removes its naming. `killed by` is the case whose
assertion turned red; every kill was by the case named for that range, never a bystander.

| mutant | file:line | the flip | killed by |
|---|---|---|---|
| cache-46 | `src/lib/cache.js`:46 | drop the serialisation fallback | a non-serialisable memo argument must not throw |
| settings-309 | `src/lib/settings.js`:309 | fail-closed → fail-open | an unreadable setting never opens the ship gate |
| routing-85 | `ctoc-routing-reminder.js`:85 | zero state → `{}` | a plan-count fault yields an all-zero state |
| routing-227 | `ctoc-routing-reminder.js`:227 | `false` → `true` | an unpersisted memo reports false |
| routing-279 | `ctoc-routing-reminder.js`:279 | reason `error` → `not-ctoc` | a detector fault degrades to silence |
| release-198 | `src/scripts/release.js`:198 | drop the failure name | every unwritable JSON target is named |
| release-239 | `src/scripts/release.js`:239 | drop the failure name | every unwritable doc target is named |
| release-295 | `src/scripts/release.js`:295 | failure → "updated" | the count sync names CLAUDE.md when it cannot write it |
| update-140 | `src/commands/update.js`:140 | skip the shadow-clearing remove | the mirror clears a directory shadowing a source file |
| update-209 | `src/commands/update.js`:209 | single version → "unknown" | one installed version is reported, not "unknown" |
| update-211 | `src/commands/update.js`:209 | `=== 1` → `>= 1` | an ambiguous cache produces "unknown", never a pick |
| init-728 | `src/lib/init-project.js`:728 | drop "(template not found)" | the missing template is named |
| init-761 | `src/lib/init-project.js`:761 | swallow the fault | a lessons fault is a named skip |
| init-615 | `src/lib/init-project.js`:615 | drop the scrub-skipped note | a failed home scrub says so inside that skip |
| init-791 | `src/lib/init-project.js`:791 | swallow the fault | a manual-merge fault is a named skip |
| v8-276 | `src/lib/v8-dispatcher.js`:276 | fall-through → throw | an unrenderable value still writes the audit record |
| push-192 | `src/commands/push.js`:192 | exit 1 → exit 0 | a failed push command exits non-zero and prints why |
| contgate-62 | `stop-continuation-gate.js`:62 | fail-open → rethrow | a directive fault does not change the gate's verdict |
| testgate-182 | `stop-test-gate.js`:182 | exit 0 → exit 2 | a gate that cannot spawn its suite ALLOWS the stop |

### Coverage, before and after (the gate's own printed table, scoped to `src/**`)

| file | before | after | remaining |
|---|---|---|---|
| `src/lib/cache.js` | 98.89 | 100.00 | — |
| `src/lib/settings.js` | 99.43 | 100.00 | — |
| `src/lib/tui.js` | 99.30 | 99.30 | 247-248, class (b), named above |
| `src/lib/v8-dispatcher.js` | 99.76 | 100.00 | — |
| `src/lib/ctoc-routing-reminder.js` | 97.90 | 100.00 | — |
| `src/lib/init-project.js` | 98.98 | 100.00 | — |
| `src/scripts/release.js` | 96.69 | 100.00 | — |
| `src/commands/update.js` | 97.82 | 100.00 | — |
| `src/commands/push.js` | 97.42 | 100.00 | — |
| `src/hooks/stop-continuation-gate.js` | 98.55 | 100.00 | — |
| `src/hooks/stop-test-gate.js` | 99.11 | 100.00 | — |

Whole repository: **99.45% → 99.5%** against the enforced floor of 99. `npm test` reports
`[CTOC test-gate] PASS`, failed 0, skipped 0. The floor was not touched.

### One observation for the human — not a defect this slice fixes, and not a blocker

`src/lib/cache.js` documents its memo key as INJECTIVE, and for every serialisable argument it
is. The fallback on line 46 is not: an argument `JSON.stringify` cannot handle (a circular
object) is keyed as `["x", String(a)]`, and `String(...)` of any two distinct plain objects is
the same eight characters — so two DIFFERENT circular arguments share one cache entry and the
second caller receives the first caller's value. Nothing in CTOC memoises on a non-serialisable
argument today, so this is latent, not live, and no test here asserts the collision as correct.
Whether to close it (a per-call identity tag) or to leave it documented is the human's call.

### The recorded Step 14 evidence says FAILED. The suite did not fail. Read both.

`.ctoc/state/verify/00252-….json` records `passed: false`. Lint passed, typecheck passed, and the
test run inside it reported **11848 tests passed, 0 failed, 0 skipped** — then node's own coverage
reporter died with `Warning: Could not report code coverage. SyntaxError: Unexpected end of JSON
input`, so no coverage figure was produced, and the gate refused to call unmeasured coverage a
pass. That refusal is the gate working exactly as designed; the number it could not read is the
problem, not the suite.

Seven runs of the identical command all measured coverage and passed:

| run | how it was invoked | coverage | tests |
|---|---|---|---|
| baseline (before this slice) | `npm test` | 99.45% | fail 0, skipped 0 |
| verify 1 | `npm test` | 99.52% | fail 0, skipped 0 |
| verify 2 | `npm test` | 99.5% | fail 0, skipped 0 |
| diagnostic 1 | `npm test`, explicit coverage directory | 99.5% | fail 0, skipped 0 |
| diagnostic 2 | `npm test`, explicit coverage directory | 99.52% | fail 0, skipped 0 |
| diagnostic 3 | `npm test`, explicit coverage directory | 99.49% | fail 0, skipped 0 |
| diagnostic 4 | `npm test`, explicit coverage directory | 99.52% | fail 0, skipped 0 |
| diagnostic 5 | the runner's OWN shape — `execSync('npm test', { timeout: 120000, maxBuffer: 64 MB })` | 99.51% | fail 0, skipped 0 |

The failure did NOT reproduce in any of them, including the last, which is byte-for-byte the
invocation `src/lib/step-13-verify.js` uses (42 s wall clock, well inside its 120 s budget). Across
those runs the suite writes about 2160 separate V8 coverage profiles, one per spawned child; the
recorded failure is one of those profiles arriving unparseable. No zero-byte or truncated profile
was found in any run that was inspected, so the mechanism is NOT established and is not guessed at
here.

**Nothing was re-run to make this green, and the evidence artifact was not touched.** Two things
are now true at once and both belong to the human:

1. This slice's work is finished and verified — but the artifact a reviewer reads says it failed.
2. CTOC's own Step 14 can intermittently record a passing build as a failing one, because a
   coverage figure that was never produced is indistinguishable on disk from a build that was
   never measured for a real reason. That is a defect in the verification instrument, it is not in
   this plan's declared files, and scheduling it is the human's call — not something to be fixed
   sideways from inside a coverage slice.
