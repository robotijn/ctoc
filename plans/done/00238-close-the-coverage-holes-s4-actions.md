---
iron_loop_verdict: true
title: "Close the dark ranges in the plan-operations module (actions.js)"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: medium
files:
  - tests/actions-coverage-holes.test.js
  - src/lib/actions.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-09-03T10:22:50.969Z
gate_crossed: review → done
---

# Close the dark ranges in the plan-operations module

**Scope (one line):** classify every uncovered range in `src/lib/actions.js` and write a
behavioural test for each reachable one — the module that creates, moves and approves plans is
the largest single hole in the long tail (63 lines).

## Implementation Details

### Target

`src/lib/actions.js` — measured **97.47 %** on 2026-08-31. Uncovered ranges as reported by the
gate on that date:

`56-58` · `150-151` · `185-187` · `202-203` · `236-252` · `514-515` · `562` · `596-598` ·
`762-763` · `777-778` · `1069-1073` · `1138` and beyond.

**The tail beyond 1138 was not enumerated in the measurement handed to the planner and the
planner did not read it.** Step 9 PREPARE re-derives the complete list from the gate's own
report; the list above is a starting map, not the specification.

### What the planner verified

Read this session: `src/lib/actions.js` lines 225-264 only. In that window, **236-252 is
`logPlanIndexError(root, source, err)`** — a best-effort writer to
`.ctoc/logs/plan-index-sync.json` that never throws: it creates the log directory, reads and
re-parses an existing log (with its own inner catch resetting to `[]`), pushes a timestamped
entry, caps the log at 500 entries, and writes it back. Its own outer catch (249-251) swallows
everything.

Every other range in this file is **unread by the planner**. Do not treat the parent plan's
prose or this file as knowledge about them: read the code.

### The classification rule (from the approved parent plan, section 4)

For each uncovered range, classify it as exactly one of:

- **(a) reachable behaviour** → write a behavioural test that a mutation would break.
- **(b) permission-gated or terminal-only** → leave it, and NAME it in the test file's header
  with the reason. A permission-gated case that cannot run must announce a LOUD skip with a
  printed reason, never a silent no-op.
- **(c) dead** → report it in this plan's `## Decisions Taken Under Ambiguity` and at Step 16.
  **Do not delete it.** Deletion needs its own plan and a reachability-baseline update.

### The dominant seam in this module

`actions.js` uses `safeFs` for its filesystem work and `require`s siblings for plan indexing.
Two boundaries, both real, both already used elsewhere in this suite:

```js
// filesystem fault, guarded by a sentinel so only this case's path throws
const real = safeFs.writeFileSync;
t.mock.method(safeFs, 'writeFileSync', (p, d, o) => {
  if (String(p).includes('CTOC-FAULT-SENTINEL')) throw new Error('injected');
  return real(p, d, o);
});

// module-load fault (the pattern in tests/pretooluse-write-coverage.test.js)
const origLoad = Module._load; /* patch for one resolved filename; restore in finally */
```

For `logPlanIndexError` specifically: it is internal, so drive it through the caller that logs a
plan-index sync failure (find that caller at PREPARE by reading the call sites of
`logPlanIndexError` in the module). Assert the log FILE's content — a timestamped entry naming
the source and the message — not the return value; the function returns nothing. Also cover the
inner reset arm at 243 by planting an unparseable `plan-index-sync.json` first and asserting the
new log is a one-entry array (a mutant that keeps the corrupt value reds).

**Never mock the function under test.** Every fault is injected at `safeFs`, at the module
loader, or by the fixture's own on-disk state.

### Fixtures

A real project tree under `os.tmpdir()` (`fs.mkdtempSync`) with `plans/<stage>/` directories and
`.ctoc/`, removed in `after`. Never operate on the repository's own `plans/` tree — a test that
moves a real plan would cross a human gate.

### Wiring — the live call sites

No module is added. `src/lib/actions.js` is already live: `src/commands/start.js` and the tab
modules call its plan operations. The new test file is reached by the gated suite (`npm test` →
`src/scripts/test-gate.js`).

### Security review

- No plan is moved or approved outside the temp fixture; no approval marker or ledger entry is
  written anywhere real.
- No secret in a fixture; no absolute path or error text from the host in an assertion message.
- All paths via `path.join`; no shell.

## Test Plan (TDD-Red first)

- One `it` per reachable range, named for the behaviour and the mutation it kills — never
  "covers line N".
- `logPlanIndexError` gets at least three: the happy append, the corrupt-log reset, and the
  500-entry cap boundary (a mutant widening the slice reds it).
- Every case is RED before the change (every range is uncovered today). A case GREEN on the
  first run means the map is stale: account for it at Step 11 and say so.
- Ranges classified (b) or (c) get no test — they get a header line each, with the reason.

## Decisions Taken Under Ambiguity

1. **`src/lib/actions.js` is declared in `files:` but no source change is intended.** The
   declaration exists so that a defect this slice exposes can be fixed in the same unit of work
   rather than through a quiet edit elsewhere. Any fix must be recorded here with what failed
   and why the code — not the test — was wrong.
2. **The unenumerated tail beyond line 1138 is re-derived, not guessed.** The planner did not
   read it and does not pretend to have.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/actions-coverage-holes.test.js` with one named case per reachable range. Run
`node --test tests/actions-coverage-holes.test.js` and record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive `src/lib/actions.js`'s complete uncovered-line list (including the
tail beyond 1138). Read every range in the current code, note the enclosing function, and write
the (a)/(b)/(c) classification into the test file's header before writing any assertion.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builder.
- Sub-item 2: the reachable cases, boundary-injected.
- Sub-item 3: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every mock restored. Account for every case that was GREEN before
implementation.

### Step 12: OPTIMIZE
One fixture builder, one mock helper. No sleeps, no retries.

### Step 13: SECURE
Nothing written outside the temp fixture; no shell; no secret; no host path in a message.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record `src/lib/actions.js`'s new percentage.

### Step 15: DOCUMENT
The header lists every previously-uncovered range and its disposition, so the next reader can
tell "tested" from "deliberately left" from "unreachable" without re-deriving it.

### Step 16: FINAL-REVIEW
Report: the file's coverage before and after; every range left as permission-gated or dead, with
its reason; and any real defect the new tests exposed.


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

**Step 9 PREPARE — the re-derived range list.** The planner's map was a starting
point; the complete uncovered list was re-derived from the gate's own printed table
(`npm test`, 2026-09-03, before any change): `src/lib/actions.js` **97.47 % line,
85.47 % branch, 96.10 % function**, uncovered at

`56-58` · `150-151` · `185-187` · `202-203` · `236-252` · `514-515` · `562` ·
`596-598` · `762-763` · `777-778` · `1069-1073` · `1138-1139` · `1469-1470` ·
`1508-1509` · `1566-1567` · `1587-1588` · `1612-1613` · `1712-1713` · `2391-2394` ·
`2446-2448`.

The planner's list stopped at "1138 and beyond". The tail it had not read is the
eight ranges from `1469-1470` onward. Every range was read in the current code before
an assertion was written; the classification and the enclosing function for each are
in the header of `tests/actions-coverage-holes.test.js`.

**Step 10 IMPLEMENT.** One new file, `tests/actions-coverage-holes.test.js` — 23
behavioural cases plus a repository tripwire. **`src/lib/actions.js` was NOT changed**
(no defect was exposed that required one), so nothing here can conflict with the
queued sidecar plan that also declares it. `CLAUDE.md` changed on its two test-file
count lines only (537 → 538), the same two lines `src/scripts/release.js` syncs.

**Ranges left uncovered: none.** No range was classified permission-gated,
terminal-only or dead. One range needed an argument for why it is reachable at all
and it is stated in the test header and again under Decisions below: `514-515`.

## Verification Evidence

**Step 8 TEST — provenance.** A coverage slice writes no production code, so
"red before the change" cannot mean "red before an implementation that does not
exist". The honest equivalent is a mutation run, and it was performed: 24 mutants
were applied to `src/lib/actions.js` **in memory only** (compiled into
`require.cache` through a `--require` preload, one anchored source substitution
each), and each mutant counts as killed only when the case named for that range
FAILED.

Result: **24 of 24 mutants KILLED**, and the on-disk sources were sha256-verified
untouched by the harness before and after (`sourceUntouched: true`).

| mutant | range | mutation | killed by |
|---|---|---|---|
| M01 | 56 | drop the temp unlink | atomic-commit rollback case (temp litter) |
| M02 | 57 | `throw err` → `return` | atomic-commit rollback case (no throw) |
| M03 | 150 | drop `logPlanIndexError` call | store-fault case (no log) |
| M04 | 185-187 | wiring-load catch rethrows | wiring-load case (a log appears) |
| M05 | 202-203 | `canonicalizeRoot` rethrows | realpath-fallback case (no re-path) |
| M06 | 243 | corrupt-log reset removed | corrupt plan-index log case |
| M07 | 246 | entry loses its source/error | store-fault case |
| M08 | 247 | `slice(-500)` → `slice(0, 500)` | 500-entry cap case |
| M09 | 249-251 | best-effort catch rethrows | log-write-fault case |
| M10 | 514-515 | non-gate branch stamps | non-gate fallback case (a marker appears) |
| M11 | 562 | deployment rejection unreported | deployment-rejection case |
| M12 | 596-598 | transition-log fault unreported | transition-log case |
| M13 | 762-763 | inline `files:` string ignored | inline-files case (`run:false`) |
| M14 | 777-778 | refinement catch rethrows | refinement-write-fault case |
| M15 | 1069-1073 | fabricate a passing verify | verify-throws case |
| M16 | 1138-1139 | coupling fault unreported | registry-coupling case |
| M17 | 1469-1470 | default step 14 → 8 | default-failing-step case |
| M18 | 1508-1509 | second failure unreported | doubly-broken-breaker case |
| M19 | 1566-1567 | corrupt deploy-ready reset removed | corrupt deploy-ready case |
| M20 | 1587-1588 | notice fault unreported | deploy-notice-fault case |
| M21 | 1612-1613 | frontmatter catch rethrows | unreadable-frontmatter case |
| M22 | 1712-1713 | `TypeError` → `Error` | malformed-plan-object case |
| M23 | 2391-2394 | cycle fallback removed | dependency-cycle case |
| M24 | 2446-2448 | skip reason discarded | batch-sibling-throws case |

Two mutants SURVIVED on the first pass and both were real defects in the test file,
fixed rather than excused:

1. **M02 survived** because the fault sentinel (`.tmp-` in the rename source) also
   hit the approval ledger's own atomic write, so the case passed on the LEDGER's
   rollback and proved nothing about `atomicWriteFileSync`'s rethrow. The sentinel now
   additionally requires the rename TARGET to be the plan file.
2. **M08 could not be anchored** — `if (log.length > 500) log = log.slice(-500);`
   appears twice in the module (the plan-index log and the deploy-ready log). The
   harness refuses a non-unique anchor rather than mutating the wrong site; the anchor
   was widened to include the preceding push.

**Step 14 VERIFY — `npm test` from the repository root**, captured to a file and read
from its last lines:

```
[CTOC test-gate] coverage 99.68% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

`tests 11896 · pass 11896 · fail 0 · skipped 0 · todo 0`.

| measure | before | after |
|---|---|---|
| `src/lib/actions.js` line | 97.47 % | **100.00 %** |
| `src/lib/actions.js` branch | 85.47 % | 90.85 % |
| `src/lib/actions.js` function | 96.10 % | **100.00 %** |
| whole-repository line (scoped to `src/**`) | 99.58 % | **99.68 %** |

The coverage floor was NOT touched: `.ctoc/coverage-baseline.json` `minPct` is still
99. Raising it belongs to the final slice of this set and to the human.

**Step 13 SECURE.** Every fixture is a real project tree under `os.tmpdir()`, removed
after its case. No repository plan, ledger entry or verify artifact is read for
mutation or written: the suite's last case is a TRIPWIRE that recomputes a sha256 tree
digest of this repository's `plans/`, `.ctoc/approvals/` and `.ctoc/state/verify/` and
asserts each is byte-identical to the digest taken before the first case ran. No
secret, no shell, no host path in an assertion message; all paths via `path.join`.

**Step 11 REVIEW — every case that was green before the change is accounted for.** All
23 were, and that is the expected shape for a slice that adds only tests to code that
already behaves correctly: none was banked. Each is instead paid for by a named mutant
above, and the two that were NOT paid for (M02, M08) were found by that accounting and
fixed. No existing test was modified, no assertion weakened, no baseline, whitelist or
exemption entry added, no file excluded from `--test-coverage-include`, and no function
under test was stubbed — every fault is injected at the shared `safe-fs`, `gate-order`,
`circuit-breaker`, `task-registry`, `deployment`, `stale-detector` or
`plan-index/wiring` module object, at `fs.realpathSync.native`, at the module loader
(restored in a `finally`), or by the fixture's own on-disk state.

## Decisions Taken Under Ambiguity

4. **`514-515` is reached by injecting at the `gate-order` boundary, not left as
   dead.** Every edge in `gate-order.GATE_EDGES` IS a human gate, so no input to
   `approvePlan` reaches its `else` branch — the branch's own comment says as much.
   It could have been reported as dead. It is not dead in the sense the parent plan
   means: `gate-order` is the single external encoding of which edges are gates, and
   the branch exists precisely so that adding a non-gate edge there behaves safely.
   The case therefore mocks `gateOrder.isHumanGate` — a sibling module object, the
   same class of boundary used everywhere else in this file — and asserts the property
   that makes the fallback safe: a non-gate move stamps NO approval marker and mints
   NO ledger entry. Mutant M10 (make both branches stamp) is killed by it. Nothing was
   deleted and no code was reshaped to make a line reachable.

5. **The two corrupt-log reset arms (`243`, `1566-1567`) are defence in depth, and
   the mutation had to be a pair.** In both `logPlanIndexError` and
   `recordDeployReadyNotice` the reset sits under `let log = []`, and the assignment
   it guards (`log = JSON.parse(...)`) throws BEFORE it assigns — so `log` is already
   `[]` when the catch runs, and no single-line mutation of the reset alone is
   observable. That is a genuine redundancy in the source, not a gap in the test: the
   observable contract (a corrupt log yields a fresh one-entry array, never an
   appended-to corpse) IS asserted, and mutants M06/M19 prove the reset is
   load-bearing by changing the initialiser and removing the reset together. Nothing
   was changed in `src/lib/actions.js`; this is recorded so a future reader does not
   mistake the redundancy for an untested line.

6. **`src/lib/actions.js` was not modified.** The declaration in `files:` existed so a
   defect exposed by these tests could be fixed in the same unit of work. No test
   exposed one — the module behaved exactly as its comments claim at all twenty dark
   ranges. The two defects this slice DID find were in the new test file and were
   fixed there.

7. **`CLAUDE.md` was edited only on its two test-file count lines** (537 → 538),
   which is the sole reason it is declared. Those are the two lines
   `src/scripts/release.js` rewrites on a version bump; no version bump, commit or
   push was performed by this slice.
