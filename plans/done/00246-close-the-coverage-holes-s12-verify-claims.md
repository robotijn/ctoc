---
iron_loop_verdict: true
title: "Run the claim-verification command under a test — without ever touching the network"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/verify-claims-coverage-holes.test.js
  - src/scripts/verify-claims.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-09-03T10:22:51.585Z
gate_crossed: review → done
---

# Run the claim-verification command under a test — without ever touching the network

**Scope (one line):** cover the four dark ranges of `src/scripts/verify-claims.js`, including its
`main()` and its top-level failure handler, under the absolute constraint that the gated suite
performs no network access.

## Implementation Details

### Target and ranges

`src/scripts/verify-claims.js` — measured **89.27 %** on 2026-08-31. Uncovered:
`104-107` · `156-159` · `163-168` · `171-175`. The planner read this file **in full** (178 lines).

| lines | site | behaviour |
|---|---|---|
| 103-107 | `runVerification` — the gate-ledger merge catch | a ledger-write failure must not crash the human's verification run; the report is already built |
| 155-159 | `writeLedger`'s catch | same, for the verification ledger |
| 163-168 | `main()` | `runVerification(process.cwd(), { gate: true })` then `requestExit(result.exitCode)` |
| 170-175 | the `require.main === module` entry and its `.catch` | prints `[CTOC claims] verification run failed: <message>` and requests exit 1 |

`main()` is the human-run path: it folds the offline gate's verdict into the exit code, so a
refuted, stale or drifted ledger exits non-zero.

### The hard constraint

**`npm test` performs NO network access.** `main()` calls `runVerification(process.cwd())` with
no fetcher options, and `runVerification` calls `verifyClaims(claims, {})`. Therefore the ONLY
safe way to execute `main()` under the suite is to run it in a working directory whose corpus
yields **zero claims**, so `verifyClaims([])` has nothing to fetch. Verify that at Step 9 by
reading `src/lib/claim-fetcher.js`'s `verifyClaims` and confirming an empty claim list performs
no request; if it does not, use the `noNetwork` fetcher option through `runVerification` for the
in-process cases and do NOT spawn `main()` at all — report that as the reason the range stays
uncovered rather than making the suite fetch. **Under no circumstance may this slice put a
network call in the gate.**

### Seams — exact

- **163-168 (`main`)** — spawn the real script as a child so the coverage is attributed to the
  real path:
  ```
  spawnSync(process.execPath, [VERIFY_CLAIMS], { cwd: emptyFixtureDir, encoding: 'utf8' })
  ```
  where `emptyFixtureDir` is a temp directory with no `skills/` corpus. Assert the report's first
  line matches
  `[CTOC claims] verified 0  refuted 0  unverifiable 0  (registry-version 0, url-live 0)` — all
  three counts always render, zeros included, which is the documented property that makes
  `unverifiable` impossible to hide. Then assert the exit code against the gate's real verdict
  for a project with no ledger: read `claimLedger.gateLedger`'s behaviour at Step 9 and assert
  the value it actually produces (do not assume 0 or 1). Assert also that
  `<fixture>/.ctoc/verification/ledger.json` was written — proving `writeLedger`'s happy path ran
  in that child.
- **170-175 (the entry catch)** — same spawn with a `--require` preload that seeds
  `require.cache` for `src/lib/corpus-claims.js` (or whichever module `runVerification` reaches
  first) with a function that throws, so the promise rejects. Assert exit code 1 and stderr
  containing `verification run failed:`.
- **155-159 (`writeLedger` catch)** — in-process: call the exported `runVerification(root, {
  claims: [], fetcher: { noNetwork: true }, print: false })` with the fixture's
  `.ctoc/verification` path made unwritable by planting a **FILE** where the directory belongs
  (the precedent is `tests/pretooluse-write-coverage.test.js`'s "`.ctoc` is a FILE" case). Assert
  the call still resolves with a complete result — the report survives a ledger-write failure.
  This needs no permission bits, so it runs everywhere.
- **103-107 (the gate-ledger merge catch)** — same in-process shape, with
  `t.mock.method(require('../src/lib/claim-ledger'), 'writeLedgerFile', () => { throw … })`.
  Assert the run still resolves and the lines are intact.

### Wiring — the live call sites

No module is added. `src/scripts/verify-claims.js` is a declared execution root
(`.ctoc/reachability-roots.json`, with a written reason) run by a human. The new test file is
reached by the gated suite.

### Security review

- **No network.** Every case runs with an empty claim set or `noNetwork`, and the child's working
  directory is an empty temp fixture. If any case is found to make a request, delete the case and
  report the range as uncovered — a fetching suite is a worse outcome than a dark line.
- No fixture carries a credential; the ledger written is a fixture ledger under `os.tmpdir()`.
- The repository's own `.ctoc/verification/ledger.json` is never written or deleted.
- Argument arrays, no shell.

## Test Plan (TDD-Red first)

- `the command runs end to end with an empty corpus and prints all three counts including the zeros`
- `a failure inside the verification run exits 1 and names it on stderr`
- `a ledger-write failure does not crash the run — the report is already built`
- `a gate-ledger merge failure does not crash the run`
- Every case RED before the change (all four ranges are dark today). A case GREEN on the first
  run means the map is stale — account for it at Step 11, never bank it.

## Decisions Taken Under Ambiguity

1. **The empty-corpus fixture is the network guard.** Rather than mocking the fetcher — which
   would mean the command's own network path is not what ran — the child is pointed at a project
   with nothing to verify. That exercises `main()` for real and cannot reach the network because
   there is no claim to fetch.
2. **If an empty claim list still performs a request, the `main()` case is not written**, and the
   range is reported as uncovered with that reason. The suite's no-network property outranks a
   coverage point.
3. **`src/scripts/verify-claims.js` is declared in `files:` but no source change is intended** —
   the declaration exists so a defect this slice exposes can be fixed here.

## Execution Plan

### Step 8: TEST
Write `tests/verify-claims-coverage-holes.test.js` with the four named cases. Run it; record every
case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive this file's uncovered ranges. Read `src/lib/claim-fetcher.js`'s
`verifyClaims` and confirm an empty claim list performs no request. Read
`src/lib/claim-ledger.js`'s `gateLedger` and determine the real verdict for a project with no
ledger, so the exit-code assertion is derived rather than guessed.

### Step 10: IMPLEMENT
- Sub-item 1: the empty-corpus temp fixture and the spawn helper.
- Sub-item 2: the two spawned cases (`main`, and the entry catch via a preload).
- Sub-item 3: the two in-process ledger-failure cases.
- Sub-item 4: the header — every range covered, every range left, each with its reason, plus an
  explicit statement that this file performs no network access.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every mock restored; **no case reaches the network**. Account for every case
GREEN before implementation.

### Step 12: OPTIMIZE
One fixture builder; one spawn helper. No sleeps, no retries.

### Step 13: SECURE
Confirm by inspection that no case can issue a request; confirm the repository's ledger is
untouched; no shell; nothing written outside `os.tmpdir()`.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header states, in the first lines, that this file drives the only network path in the
repository **offline**, and how.

### Step 16: FINAL-REVIEW
Report: coverage before and after; whether the empty-corpus route held; any range left uncovered
because covering it would have meant fetching (named, with the reason).


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

**What landed:** one new test file, `tests/verify-claims-coverage-holes.test.js` (five cases), plus
the two test-file count lines in `CLAUDE.md` (527 → 528). **`src/scripts/verify-claims.js` was NOT
changed** — it was restored byte-for-byte after mutation testing and verified against its sha256
(`7866703c13c5d6fe8831ae48d10556cedc557533901c2bc90ad9497473cb48d4`); `git status` reports it
unmodified. No test was weakened, no case deleted, no baseline or exemption touched, no existing
test file edited.

**Step 8 — TEST.** Five cases written first and run: all five GREEN on the first run. That is
expected and is a finding, not a pass to bank — this slice adds coverage over behaviour that is
already correct, so there is no source change for a case to be red against. Red provenance was
taken from mutation instead: each mutation was applied to the source, the suite re-run, the named
case observed failing, and the source restored byte-for-byte with a sha256 check.

| mutation applied to `src/scripts/verify-claims.js` | case that went RED |
|---|---|
| `main()` drops `{ gate: true }` | both ledger writes failing … (exit 0, not 1) |
| the gate-ledger merge catch rethrows instead of absorbing | both ledger writes failing … ; a gate-ledger merge failure is absorbed … |
| `writeLedger`'s catch rethrows instead of absorbing | both ledger writes failing … ; a verification-ledger write failure is absorbed … |
| the `unverifiable` count is dropped from the report line | all four report-asserting cases |
| the entry `.catch` requests exit 0 instead of 1 | a failure inside the verification run … |
| the entry `.catch` stops naming the failure on stderr | a failure inside the verification run … |

Two earlier attempts at the catch-arm mutations deleted the `catch` block outright, which left a
dangling `try` and a syntax error — that is a broken file, not a mutant, so it proves nothing. They
were redone as rethrows, which is the semantic change the arm exists to prevent.

**Step 9 — PREPARE.** Re-derived from the gate and from reading the code, not assumed:
- `verifyClaims([], {})` issues no request — the single worker's cursor is already past the end
  of an empty claim list (`src/lib/claim-fetcher.js`), and `collectCorpusClaims` returns early when
  `skills/` is absent (`src/lib/corpus-claims.js`). The empty-corpus fixture is therefore a real
  network guard, not a hope.
- The exit code for the clean fixture was DERIVED, not guessed: `runVerification` writes the gate
  ledger (line 102) *before* it reads it (line 114), so `gateLedger` finds the file this very run
  wrote, an empty corpus produces no failures, `pass` is true, and the run exits 0.
- Measured before: `verify-claims.js` 89.27 %, uncovered `104-107 · 156-159 · 163-168 · 171-175` —
  matching the plan's ranges.

**Step 10 — IMPLEMENT.** No production module added or changed. The fixture builder, the
argument-array spawn helper, the five cases and the header all live in the one new test file.

**Step 11 — REVIEW.** Every case GREEN before implementation is accounted for above (there is no
implementation to precede — this is a coverage slice over correct behaviour, and each case is
anchored by a mutation that breaks it). Nothing under test is mocked: the two in-process faults are
injected at true boundaries (`safeFs.writeFileSync`, guarded to this fixture's `ledger.json` only,
and `claimLedger.writeLedgerFile`), both restored automatically by `node:test`'s mock tracker.

**Step 12 — OPTIMIZE.** One root builder, one spawn helper, one shared expected-report constant.
No sleeps, no retries, no warm-up run.

**Step 13 — SECURE.** No case can reach the network: three cases run the real command against a
temp root with no corpus, and the two in-process cases pass `claims: []`. Every path is under
`os.tmpdir()`; the repository's own `.ctoc/verification/` ledgers are unmodified (`git status`
confirms). Argument arrays throughout, no shell, no credential in any fixture, no permission bits
(the ledger-directory fault is a plain file planted where a directory belongs, so it behaves
identically under root and on Windows).

**Step 14 — VERIFY.** `npm test` from the repository root, captured in full, exit 0:
`[CTOC test-gate] coverage 99.23% (threshold 99%), skipped 0, failed 0` then
`[CTOC test-gate] PASS`. `src/scripts/verify-claims.js` moved **89.27 % → 100.00 %** line coverage
with **no uncovered ranges left**; the whole repository moved 99.04 % → 99.23 %.

**Step 15 — DOCUMENT.** The test file's header states in its first lines that it drives the only
network path in the repository offline, why the empty-corpus fixture makes that true, which ranges
it covers, and that none is left uncovered.

**Step 16 — FINAL-REVIEW.** The empty-corpus route held exactly as the plan predicted. No range was
left uncovered for network reasons, so there is nothing to name under that heading.

### Decisions Taken Under Ambiguity (taken during execution)

4. **One spawned case covers three of the four ranges together.** Planting a plain FILE where
   `.ctoc/verification/` belongs makes *both* ledger writes fail in the same child, which exercises
   the `writeLedger` catch, the gate-ledger merge catch, and `main()`'s gate-fold in one run — and
   it does so while asserting the property that matters to a human: the report still prints and the
   unwritten ledger is reported rather than hidden. The two in-process cases were kept anyway, each
   isolating one catch, because the combined case cannot tell the two arms apart.
5. **The entry-point failure is injected by seeding `require.cache`, not by throwing at load
   time.** `corpus-claims` is required at the top of the script, so a load-time throw would abort
   before `main()` ever ran and would prove nothing about the `.catch` handler. The preload installs
   a collector that throws *when called*, so the rejection travels the real path.
