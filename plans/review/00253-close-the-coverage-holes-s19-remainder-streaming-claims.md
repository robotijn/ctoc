---
iron_loop_verdict: true
title: "Remainder: the streaming store, the continuation state, the inbox and the claim fetcher"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-streaming-claims-coverage.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.489Z
gate_crossed: implementation → todo
---

# Remainder: the streaming store, the continuation state, the inbox and the claim fetcher

**Scope (one line):** classify and cover the small dark ranges in the twelve modules behind the
questions store, the build-continuation state, the inbox surfaces and the citation fetcher.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/claim-fetcher.js` | 233-237 · 254-257 · 531-533 · 553-554 |
| `src/lib/streaming-render.js` | 297-303 |
| `src/lib/sufficiency-audit.js` | 221-225 |
| `src/lib/increment-feed.js` | 83-84 · 92-93 |
| `src/lib/inbox.js` | 119-120 |
| `src/lib/continuation.js` | 84-85 |
| `src/lib/stale-cleanup.js` | 189-190 |
| `src/lib/state-manager.js` | 51-52 |
| `src/lib/ledger-backfill.js` | 218-219 |
| `src/lib/corpus-claims.js` | 44-45 |
| `src/lib/streaming-precompute.js` | 687 |
| `src/tabs/vision.js` | 182 |

**The planner did not read any of these twelve files.** The table is the measurement handed to the
planner, not an analysis. Step 9 PREPARE re-derives the ranges and reads each one; where the code
disagrees with this plan, the code wins and the drift is reported.

### The classification rule (from the approved parent plan, section 4)

**(a)** reachable → test it; **(b)** permission-gated or terminal-only → leave it and NAME it in
the header with the reason (a permission-gated case that cannot run announces a LOUD skip with a
printed reason); **(c)** dead → report it, never delete it.

### The four rules that apply to this family specifically

1. **`claim-fetcher.js` is the network module. The gated suite performs NO network access.** Every
   case must use the module's own offline seam (`noNetwork`, an injected fetcher, a closed
   loopback port) — read the module's options at Step 9. If a range cannot be reached offline,
   report it as uncovered with that reason. A fetching suite is a worse outcome than a dark line,
   and this is not a trade the executor may make.
2. **The streaming store is agent-write-denied and a questions file is a believed artifact.** No
   case may write into the repository's `.ctoc/streaming/`. Fixtures only, under `os.tmpdir()`.
3. **A renderer that consumes a persisted contract is driven against the CAPTURED REAL sample**
   in `tests/fixtures/golden-corpus/`, never an invented one. The precedent is recorded: a
   decision-matrix renderer passed four synthetic tests while the human's screen was still
   unreadable, because the real file carries option fields over a thousand characters long. If a
   `streaming-render.js` case renders anything, it renders the real sample. Captures are never
   shortened or redacted — redaction is sanitisation, the exact defect.
4. **`stale-cleanup.js` deletes things.** No case may delete anything outside its temp fixture, and
   the suite must assert the repository's `plans/` tree is unchanged afterwards.

### Seams

- Fixture-first: a temp project with a questions store, a continuation state file, an inbox and a
  small ledger, seeded per case.
- Filesystem faults: `t.mock.method(safeFs, …)` with a path sentinel — several of these ranges are
  two-line read-failure arms, which this seam reaches directly.
- Dependency faults: `Module._load` patched for one resolved filename, restored in `finally`.
- Never mock the function under test.

### Wiring — the live call sites

No module is added. All twelve are live: the questions store is read by `/ctoc:start` and written
by the precompute path, the continuation state is consumed by the Stop hook, the inbox and the
vision tab are dashboard surfaces, and the claim fetcher is called by
`src/scripts/verify-claims.js`. The new test file is reached by the gated suite.

### Security review

- **No network request from any case.**
- Nothing written into `.ctoc/streaming/`, `.ctoc/approvals/` or `.ctoc/state/verify/` in the
  repository — all three are agent-write-denied for good reason, and a test is not an exception.
- Question ids and option text are producer-authored and untrusted: a case should feed a control
  character and a terminal escape and assert neither survives into rendered output.
- Nothing deleted outside `os.tmpdir()`; no secret; no shell; no host path in an assertion
  message.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour and the mutation it kills — for
  example `an unreadable questions file is reported as unreadable, never as "no questions"`.
- Every such case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** No source change is intended; a defect this
   slice exposes goes through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields)
   to the human.
2. **Offline or not at all** for the claim fetcher; the range is reported uncovered rather than
   the suite made to fetch.
3. **Grouped by family, one test file** — these twelve are one subject: what the human is shown
   between builds, and the state behind it.
4. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/remainder-streaming-claims-coverage.test.js` with one named case per range classified
(a). Run it; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the uncovered ranges for all twelve files. Read every range and write
the (a)/(b)/(c) classification, with the enclosing function, into the header before asserting
anything. Read `src/lib/claim-fetcher.js`'s offline options and confirm which ranges are reachable
without a request. Read `tests/real-question-file-render.test.js` and the golden-corpus manifest
for the render precedent, and modify neither.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builders (questions store, continuation state, inbox,
  ledger).
- Sub-item 2: the (a) cases, fixture-driven, with sentinel-guarded faults where required.
- Sub-item 3: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function under
test mocked; every mock restored; no write into any agent-write-denied directory. Account for
every case GREEN before implementation.

### Step 12: OPTIMIZE
Shared fixture helpers. No sleeps, no retries.

### Step 13: SECURE
Confirm no network request; confirm `.ctoc/streaming/`, `.ctoc/approvals/`, `.ctoc/state/verify/`
and `plans/` in the repository are unchanged after the suite; no shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the twelve
files.

### Step 15: DOCUMENT
The header names every range and its disposition, and states plainly that this file performs no
network access and writes into no protected directory.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; every range left, with its reason; any range left
uncovered because covering it would have meant fetching (named, with the reason).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — `tests/remainder-streaming-claims-coverage.test.js`, 19 named cases over 17 ranges in 13 modules.
- [x] Test error conditions — every case IS an error/fault arm except the two positive controls (a readable cache entry; a parseable answer time).
- [x] Run tests - expect RED (failing) — this is a CHARACTERISATION slice with no source change, so all 19 were GREEN on the first run. Red provenance therefore comes from MUTATION, not from absent code: 18 mutants were compiled in memory through the module cache under the original filename and the suite re-run against each. All 18 were killed BY THEIR OWN NAMED CASE, and the sha256 of all eight mutated source files was byte-identical afterwards. Full mutant list in the Execution Record below.

### Step 9: PREPARE
- [x] Install dependencies if needed — none added; the project has no dependencies.
- [x] Check prerequisites — ranges re-derived from `npm test`'s own coverage table (the gate's report is the source of truth, not the plan's table). Two path misreadings found and reported below.
- [x] Verify dev environment ready — baseline `npm test` PASS at 99.50% before any change.
- [x] Create directories/config if needed — none; every fixture is created per case under `os.tmpdir()`.

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — sub-item 1: per-case temp fixtures (cache directory, plans tree, answers log, ledger directory, guides tree); sub-item 2: the 19 behavioural cases; sub-item 3: the file header classifying every range (a)/(b)/(c) with its reason.
- [x] Add error handling — every mock is guarded by a path sentinel and restored (`t.mock.method`, or `Module._load` restored in a `finally`); every temp tree is removed in a `finally`.
- [x] Wire up integration points — no module added; the new test file is reached by the gated suite. The reachability and export fences both pass in the run below.

### Step 11: REVIEW
- [x] Self-review all new code — no existing test touched, no assertion weakened, no baseline or exemption entry added, no function under test mocked, no write into any agent-write-denied directory.
- [x] Verify integration points work together — accounted for every case green before implementation: ALL of them, because this slice changes no source. That is the expected shape of a characterisation slice, and it is why mutation, not first-run colour, is the evidence here. One case that was written and then deleted before the first commit: a final "protected directories untouched" check whose only assertion was that a hash string is 64 characters long — vacuous, a line-toucher, replaced with a real listing tripwire that compares a recursive name+size hash taken at load time.
- [x] Check error handling completeness — every fault arm asserts the DIRECTION as well as the value: a corrupt cache reads as "could not look", never as a cached check; a gap in the ledger never renders as a clean history; a faulting stage never empties the feed.

### Step 12: OPTIMIZE
- [x] Remove redundant operations — shared `tmpRoot`/`rmTree`/`faultOn` helpers; the whole file runs in 68 ms.
- [x] Optimize critical paths — no sleep, no retry, no polling, no child process, no server.
- [x] Simplify complex code — the claim-fetcher cache pair reuses one seam for both the hit and the corrupt case.

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — every fixture path is built with `path.join` under `os.tmpdir()`.
- [x] Sanitize outputs — a case feeds a terminal escape and a bell byte through the audit report and asserts neither survives into rendered output.
- [x] No secrets in code — no credential-shaped fixture anywhere in the file.
- [x] Safe file operations — NO NETWORK REQUEST is made (offline mode, or `globalThis.fetch` replaced at the transport boundary; no socket, no loopback server). Nothing is written under the repository's `.ctoc/streaming/`, `.ctoc/approvals/` or `.ctoc/state/verify/`, and nothing is deleted outside the temp tree. A tripwire case hashes those three directories AND `plans/` at load time and re-compares after the suite; the stale-cleanup case additionally asserts the repository `plans/` listing is unchanged.

### Step 14: VERIFY
- [x] Run lint + type check — `npx eslint tests/remainder-streaming-claims-coverage.test.js` clean; the full ESLint gate passes inside `npm test`.
- [x] Run ALL tests (TDD Green) — `npm test` from the repository root: `[CTOC test-gate] PASS`, tests 11867, pass 11867, fail 0.
- [x] Check coverage >= 80% — measured 99.57% against the enforced floor of 99 (up from 99.50% at baseline). Every module this slice owns is now at 100.00% line coverage: claim-fetcher, streaming-render, sufficiency-audit, increment-feed, areas/inbox, lib/inbox, continuation, stale-cleanup, state-manager, scripts/ledger-backfill, corpus-claims, streaming-precompute, tabs/vision.
- [x] 0 skipped, 0 flaky tests — skipped 0, todo 0; no conditional skip exists in the new file.

### Step 15: DOCUMENT
- [x] Update relevant documentation — `CLAUDE.md`'s test-file count moved 535 → 536 in both places that state it.
- [x] Add JSDoc comments to new functions — the three helpers carry doc comments; the file header classifies all 17 ranges and states plainly that the file makes no network request and writes into no protected directory.
- [x] Update CHANGELOG if needed — not needed; this slice adds no user-visible behaviour.

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed — the mutation run is the manual verification: 18/18 killed, sources byte-identical.
- [x] Ready for human review

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

### Drift found between the plan's table and the code (the code wins)

1. **`src/lib/ledger-backfill.js` does not exist.** The module is `src/scripts/ledger-backfill.js`;
   its range 218-219 is covered.
2. **`src/lib/inbox.js` 119-120 is the wrong file.** There are TWO modules named `inbox.js`, and
   `src/lib/inbox.js` is fully covered. The dark range belongs to `src/areas/inbox.js` — the inbox
   screen — whose activation is fail-open. Reading the coverage row's directory heading rather
   than its basename settles it. That range is covered.
3. No other drift: the ten remaining ranges were at the lines the table names.

### Coverage, before and after (measured by `npm test`, scoped to `src/**`)

| module | before | after |
|---|---|---|
| `src/lib/claim-fetcher.js` | 97.69 (233-237 · 254-257 · 531-533 · 553-554) | 100.00 |
| `src/lib/streaming-render.js` | 98.76 (297-303) | 100.00 |
| `src/lib/sufficiency-audit.js` | 97.85 (221-225) | 100.00 |
| `src/lib/increment-feed.js` | 96.80 (83-84 · 92-93) | 100.00 |
| `src/areas/inbox.js` | 98.43 (119-120) | 100.00 |
| `src/lib/inbox.js` | 100.00 (already closed) | 100.00 |
| `src/lib/continuation.js` | 99.17 (84-85) | 100.00 |
| `src/lib/stale-cleanup.js` | 99.56 (189-190) | 100.00 |
| `src/lib/state-manager.js` | 99.23 (51-52) | 100.00 |
| `src/scripts/ledger-backfill.js` | 99.43 (218-219) | 100.00 |
| `src/lib/corpus-claims.js` | 97.59 (44-45) | 100.00 |
| `src/lib/streaming-precompute.js` | 99.89 (687) | 100.00 |
| `src/tabs/vision.js` | 99.80 (182) | 100.00 |

Whole repository: 99.50% → **99.57%**, floor 99.

### Ranges left uncovered because covering them would have meant fetching

**None.** Every claim-fetcher range was reachable offline. Two used the module's own declared
`noNetwork` mode; one replaced `globalThis.fetch` at the transport boundary (the module calls the
bare global, so this is injection at the true seam, not a stub of the function under test); one is
a pure argument guard. No socket was opened and no loopback server was started.

### Mutation evidence (the red provenance for a characterisation slice)

Each mutant was compiled IN MEMORY and seeded into `require.cache` under the original filename, so
every dependent picked it up; no source file was written. A mutant counts as KILLED only if its own
named case failed. **18 of 18 killed**; the sha256 of all eight touched source files was byte-identical
after the run.

| # | range | mutation | killed by |
|---|---|---|---|
| 1 | claim-fetcher 233-237 | corrupt-cache `return null` → return a fabricated entry | a corrupt cache entry is "no cache" |
| 2 | claim-fetcher 254-257 | cache-write swallow → rethrow | a cache-write failure never changes a verdict |
| 3 | claim-fetcher 531-533 | default cache directory renamed | with no cache directory given |
| 4 | claim-fetcher 553-554 | argument guard → return an empty verdict set | verifyClaims refuses a non-array |
| 5 | streaming-render 297-301 | the demo key removed | `b` while the idea is being decomposed |
| 6 | streaming-render 302 | the no-op arm consumes the key | every other key while awaiting decomposition |
| 7 | sufficiency-audit 221 | the gap line replaced by the clean-history line | the undetermined report states how many entries could not be read |
| 8 | sufficiency-audit 222-224 | control-character stripping removed | a control character or terminal escape |
| 9 | increment-feed 83-84 | broken-install catch → rethrow | a broken install yields an empty feed |
| 10 | increment-feed 92-93 | faulting-stage catch → rethrow | one faulting stage never sinks the feed |
| 11 | continuation 84-85 | the catch removed | clear() on a project with no continuation state |
| 12 | stale-cleanup 188-190 | logging catch → rethrow | the revert reports its result even when the cleanup log |
| 13 | state-manager 51-52 | the directory creation removed | ensureStateDir creates the directory once |
| 14 | ledger-backfill 217-219 | count catch → rethrow | the migration marker still reports |
| 15 | corpus-claims 44-45 | walk catch → rethrow | a faulting subdirectory contributes no guides |
| 16 | streaming-precompute 687 | unparseable time → `Date.now()` | an answers-log entry whose recorded time cannot be parsed |
| 17 | tabs/vision 182 | unknown action consumed | a key the action list does not name |
| 18 | areas/inbox 119-120 | activation catch → rethrow | a working directory deleted under the human |

### Verification evidence

```
[CTOC test-gate] coverage 99.57% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```
tests 11867 · pass 11867 · fail 0 · skipped 0 · todo 0.
