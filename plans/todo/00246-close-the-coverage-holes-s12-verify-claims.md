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
approved_at: 2026-08-31T14:59:34.247Z
gate_crossed: implementation → todo
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
