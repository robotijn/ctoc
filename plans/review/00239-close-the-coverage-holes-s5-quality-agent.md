---
iron_loop_verdict: true
title: "Close the dark ranges in the quality agent"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: medium
files:
  - tests/quality-agent-coverage-holes.test.js
  - src/lib/quality-agent.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.581Z
gate_crossed: implementation → todo
---

# Close the dark ranges in the quality agent

**Scope (one line):** classify every uncovered range in `src/lib/quality-agent.js` — the module
that runs lint, typecheck and the test selection on every push — and write a behavioural test
for each reachable one.

## Implementation Details

### Target

`src/lib/quality-agent.js` — measured **96.59 %** on 2026-08-31. Uncovered ranges as reported by
the gate on that date:

`250-251` · `263-264` · `769-770` · `951-970` · `1062-1063` · `1208-1211` · `1502-1505` ·
`1697-1699` · `1714-1731` · `1749` and beyond.

**The tail beyond 1749 was not enumerated in the measurement handed to the planner.** Step 9
PREPARE re-derives the complete list from the gate's own report.

### What the planner verified

Read this session: lines 940-979 only. In that window, **951-970 is the incremental
test-selection path**: when the affected-test set is empty it logs "No tests affected by
changes.", updates the file-hash cache and returns
`{ passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0 }`; otherwise it runs only the
affected tests via `runSpecificTests(tools, affected.tests)` and updates the hash cache when the
run passed. The full-suite branch immediately above (940-949) is already covered.

Every other range in this file is **unread by the planner**. Read the code; do not plan from
this file's prose.

### Two constraints specific to this module

1. **This module is where "a check with zero detected tools reports NOT VERIFIED and FAILS its
   tier" lives** (`runLint` / `runTypecheck` carry a `ran` count; a zero-tool detection returns
   `{ passed: false, undetermined: true, ran: 0, errors: null }`, and `errors` is `null` — never
   `0` — because nothing was measured). Any new test in this area must assert that distinction,
   never blur it. `tests/vacuous-verification.test.js` already holds that contract: **do not
   modify it, and do not write an assertion that contradicts it.**
2. **The command tables are an obeyed surface, not a believed one.** `quality-agent` runs the
   lint/typecheck/test commands from `.ctoc/quality-config.yaml` as an argv program with
   `shell: false`. Every test here must keep that shape: fixtures may declare a command, but it
   must be a real argv array, never a shell string, and the fixture command must be inert (for
   example `process.execPath -e ""`), never something that touches the repository.

### The classification rule (from the approved parent plan, section 4)

Each uncovered range is exactly one of: **(a)** reachable behaviour → test it; **(b)**
permission-gated or terminal-only → leave it and NAME it in the header with the reason (a
permission-gated case that cannot run announces a LOUD skip with a printed reason); **(c)** dead
→ report it, never delete it.

### Seams

- **Tool detection:** the module resolves tools through `src/lib/tool-detector.js`. Inject a
  detection result through the fixture project's own configuration where possible; where the
  boundary must be faked, fake `tool-detector`'s exported method with `t.mock.method`, never the
  quality-agent function under test.
- **Test selection (951-970):** drive the real selection path with a fixture project whose
  changed-file set maps to zero affected tests, then to one. Assert the RETURNED result object
  (`passCount: 0` and `passed: true` for the empty case) and that the hash cache was updated —
  a mutant skipping `updateFileHashes` would make every subsequent run re-select everything.
- **Child processes:** where the module spawns, inject at `child_process` with
  `t.mock.method(require('node:child_process'), 'spawnSync'|'execFileSync', …)` guarded by a
  sentinel argument, so only the case's own invocation is intercepted. Assert the module's
  verdict, not the spawn.
- **Filesystem faults:** `t.mock.method(safeFs, …)` with a path sentinel.

### Fixtures

A temp project under `os.tmpdir()` with `.ctoc/` and a minimal `.ctoc/quality-config.yaml`,
removed in `after`. Never run a real lint or test command against the repository from inside a
test — that would nest a suite inside the suite.

### Wiring — the live call sites

No module is added. `src/lib/quality-agent.js` is live: `src/commands/push.js` and the detached
git post-commit hook run it. The new test file is reached by the gated suite.

### Security review

- No fixture command is a shell string; every one is an argv array with `shell: false`.
- No secret in a fixture; no host path or command string in an assertion message.
- Nothing written outside the temp fixture.

## Test Plan (TDD-Red first)

- One `it` per reachable range, named for the behaviour and the mutation it kills.
- The 951-970 pair gets two cases: zero affected tests (assert the exact zeroed result and the
  hash-cache update) and a non-empty affected set (assert only the selected tests ran).
- Every case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Ranges classified (b) or (c) get a header line each, with the reason.

## Decisions Taken Under Ambiguity

1. **`src/lib/quality-agent.js` is declared in `files:` but no source change is intended** — the
   declaration exists so a defect this slice exposes can be fixed in the same unit of work,
   recorded here with what failed and why the code was wrong.
2. **No existing quality test is modified**, above all `tests/vacuous-verification.test.js`,
   whose contract this slice must reinforce rather than touch.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).
4. **No source change was made.** `src/lib/quality-agent.js` was declared so a defect this
   slice exposed could be fixed in the same unit of work. No case exposed a defect: every
   one of the nine ranges is correct behaviour that had never been driven. The file is
   byte-for-byte identical to its pre-slice content (sha256
   `183dc41cf016674d2ae00b44ff54d15c3c1eb48ea9995f4c604ed579e4f51e5b`), verified after the
   mutation run restored it.
5. **The spawned agent runs with an EMPTY PATH.** Driving `main()` for real is the only way
   to reach lines 1697-1699, 1714-1731 and 1749-1752 (they are not on the export surface),
   and a real run reaches out to npm, npx and git. Pointing the child's PATH at an empty
   directory makes every external scanner take its own documented "tool not installed" skip:
   the case becomes offline, deterministic and ~20x faster, and no assertion depends on
   which tools happen to be installed on the machine. The environment is a boundary, not a
   mock of the code under test.
6. **Lines 952-959 are driven at the module boundary, not deleted.** Reading
   `findAffectedTests` in `src/lib/coverage-map.js` shows that a non-empty changed set always
   yields either at least one test or `requiresFullSuite`, and `runSmartTests` has already
   returned when the changed set is empty — so `tests: []` with `requiresFullSuite: false`
   cannot arise from today's implementation. It is nonetheless inside coverage-map's
   documented return contract, so quality-agent is right to handle it. It is defensive
   coupling code, not dead code: the test produces that shape at the coverage-map boundary
   (sentinel-guarded, delegating to the real function otherwise). Reported here per the
   parent plan's Decision 2; nothing is removed.

## Execution Plan

### Step 8: TEST
Write `tests/quality-agent-coverage-holes.test.js` with one named case per reachable range. Run
`node --test tests/quality-agent-coverage-holes.test.js`; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the complete uncovered-line list for this file, including the tail
beyond 1749. Read every range, note its enclosing function, and write the (a)/(b)/(c)
classification into the header before asserting anything. Re-read
`tests/vacuous-verification.test.js` so no new assertion contradicts it.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture with an inert argv command table.
- Sub-item 2: the reachable cases, boundary-injected.
- Sub-item 3: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every mock restored; the not-verified-versus-passed distinction preserved
exactly. Account for every case GREEN before implementation.

### Step 12: OPTIMIZE
One fixture builder, one mock helper. No sleeps, no retries.

### Step 13: SECURE
No shell; no real lint/test command run against the repository; no secret; no command string in
a message.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header lists every previously-uncovered range and its disposition.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any real defect exposed —
in particular any place where a zero-tool detection could still read as a pass.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — `tests/quality-agent-coverage-holes.test.js`, 12 cases, one per uncovered range
- [x] Test error conditions — every case IS an error/refusal/degradation path (refused command, illegible instrument, unreadable blob, failed verifier, held lock, red gate)
- [x] Run tests - expect RED (failing) — all 12 were GREEN on the first run (no source change is intended by a coverage slice), so RED provenance was earned by MUTATION instead: 12 mutants of `src/lib/quality-agent.js`, each applied on disk, the suite run, the file restored and the restore verified by sha256 (`183dc41cf016674d2ae00b44ff54d15c3c1eb48ea9995f4c604ed579e4f51e5b` before and after). Every mutant was KILLED by its own named case. Full table under "## Verification Evidence".

### Step 9: PREPARE
- [x] Install dependencies if needed — none added
- [x] Check prerequisites — ranges re-derived from the gate's own report (`npm test`, 2026-09-03): `250-251 263-264 769-770 951-970 1062-1063 1208-1211 1697-1699 1714-1731 1749-1752`, file at 96.82 %. The plan's `1502-1505` was already covered — its list was stale, as the plan itself warned.
- [x] Verify dev environment ready — baseline `npm test` PASS, coverage 99.68 %
- [x] Create directories/config if needed — every fixture is created under `os.tmpdir()` by the test and removed after; nothing created in the repository. `tests/vacuous-verification.test.js` re-read: no new assertion contradicts it (the green fixture DECLARES lint/typecheck commands, so `ran` is 1, never a zero-tool pass).

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — one test file; NO source change (see Decision 4)
- [x] Add error handling — every boundary fake is sentinel-guarded and restored in a `finally`
- [x] Wire up integration points — the new file is reached by the gated suite; `CLAUDE.md`'s documented test-file count moved 538 → 539 (both occurrences), which `tests/doc-counts.test.js` enforces

### Step 11: REVIEW
- [x] Self-review all new code — no existing test touched, no assertion weakened, no baseline or exemption added, no function under test mocked
- [x] Verify integration points work together — full suite green (11908 tests)
- [x] Check error handling completeness — all 12 green-before-implementation cases accounted for by mutation, none banked

### Step 12: OPTIMIZE
- [x] Remove redundant operations — one fixture builder, one reload seam, one quiet() helper; no sleeps, no retries
- [x] Optimize critical paths — the spawned agent runs with PATH pointing at an EMPTY directory so no external scanner, package manager or git binary resolves: each full `main()` run costs ~0.13 s instead of ~2.6 s, and never touches the network
- [x] Simplify complex code — the shipped reload seam from `tests/quality-agent-coverage.test.js` is reused rather than reinvented

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — every path is built with `path.join` under `os.tmpdir()`
- [x] Sanitize outputs — no host path or command string in any assertion message
- [x] No secrets in code — the planted value is a generic high-entropy AWS-shaped string, not a real credential
- [x] Safe file operations — no shell anywhere (argv vectors, `shell:false`); a tripwire hashes `.ctoc/approvals`, `.ctoc/state/verify`, `.ctoc/streaming` and `plans/` before and after and fails on any change

### Step 14: VERIFY
- [x] Run lint + type check — `npx eslint tests/quality-agent-coverage-holes.test.js --max-warnings 0` exit 0; `tests/` is excluded from `jsconfig.json`, and the suite's own typecheck test passes inside the full run
- [x] Run ALL tests (TDD Green) — `npm test`: `[CTOC test-gate] PASS`, tests 11908, fail 0
- [x] Check coverage >= 80% — measured 99.75 % against the enforced floor of 99 (up from 99.68 %); `src/lib/quality-agent.js` itself went 96.82 % → **100.00 %** line, 100 % function, branch 90.09 % → 92.35 %
- [x] 0 skipped, 0 flaky tests — `skipped 0`, `todo 0`; two consecutive full runs agreed

### Step 15: DOCUMENT
- [x] Update relevant documentation — `CLAUDE.md` test-file count 538 → 539
- [x] Add JSDoc comments to new functions — every helper in the test file carries one; the file header classifies all nine ranges and records both findings
- [x] Update CHANGELOG if needed — no CHANGELOG in this repository; the version bump is the human's call at release

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed — gate PASS, coverage above the floor
- [x] Manual verification if needed — the agent was driven end to end as the post-commit hook runs it, and the ship gate held (green checks, no push)
- [x] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

**What landed:** one new test file, `tests/quality-agent-coverage-holes.test.js` (12 cases),
and the documented test-file count in `CLAUDE.md` moved 538 → 539. No source file changed.

**How each range was reached** — every one is class (a), reachable behaviour. None is
permission-gated, terminal-only, or dead, so no range is left named-but-untested.

| Range | What it is | How the case drives it |
|---|---|---|
| 250-251 | a configured command carrying a NEWLINE is refused | `parseConfiguredCommand` / `runConfiguredCommand` with a real two-line command whose first line would write a proof file; the proof must not exist |
| 263-264 | an UNTERMINATED QUOTE is refused | same shape, a dangling quote |
| 769-770 | `runSpecificTests`: exit 0 with an illegible fail counter is UNCERTIFIED | a real inert node runner printing a `pass` counter and no `fail` counter, plus the contrast case that adds `fail 0` and passes |
| 951-970 | the affected-test selection and its hash cache | `coverage-map.findAffectedTests` faked at the module boundary (sentinel-guarded, delegating otherwise) + a faked `child_process` through the shipped reload seam: empty set, selected set, failing selected set |
| 1062-1063 | an unreadable committed blob returns null so the delta scan continues | a faked `git show` that throws for one blob while the next carries a planted credential the scan must still find |
| 1208-1211 | an external secrets verifier that throws is a loud skip | `SecretsScanner.prototype.isToolAvailable` / `runTruffleHog` faked at the class boundary |
| 1697-1699 | `main()` refuses to run while the lock is held | the agent spawned as a real child against a fixture project whose lock names this live process |
| 1714-1731 | `main()`: languages, missing tools, the tiered checks, the summary | the agent spawned against a fixture whose `.ctoc/quality-config.yaml` declares three inert argv commands |
| 1749 | green checks do NOT push — the ship gate is the human's | the same green run, with `--on-success=push`, asserting the refusal line and that no push is attempted |
| 1750-1752 | a red run reports and never reaches the ship gate | the same fixture with a failing runner |

**Findings for the human (neither fixed here):**

1. The plan named `1502-1505` (the framework-security error loop) as uncovered. On the
   2026-09-03 measurement it is already covered — the plan's range list had drifted, exactly
   as the plan warned it might. The gate's report was used instead.
2. `tests/quality-agent-coverage.test.js` carries a header claiming that `main()` "cannot be
   driven in-process; a subprocess run would not be captured by --experimental-test-coverage".
   That claim is now measurably WRONG: the three spawned cases in this slice took
   `quality-agent.js` from 96.82 % to 100.00 % line coverage, and the lines they cover are
   exactly the `main()` lines that header called uncoverable. This matches the parent plan's
   finding 4 about the same misconception in `tests/pretooluse-write-coverage.test.js`. The
   stale header is NOT edited here (no existing test file is touched by this slice); it is
   reported so the human can schedule the correction.

## Verification Evidence

**Step 14 — `npm test` from the repository root, 2026-09-03.** Last lines read from the
captured run, not summarised from memory:

```
[CTOC test-gate] coverage 99.75% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

`tests 11908`, `pass 11908`, `fail 0`, `skipped 0`, `todo 0`, exit 0.

**The measured move.** `src/lib/quality-agent.js` in the gate's own coverage table:

| | before (2026-09-03 baseline) | after |
|---|---|---|
| line | 96.82 % | **100.00 %** |
| branch | 90.09 % | 92.35 % |
| function | 100.00 % | 100.00 % |
| uncovered ranges | `250-251 263-264 769-770 951-970 1062-1063 1208-1211 1697-1699 1714-1731 1749-1752` | none |

Whole-repository line coverage moved 99.68 % → 99.75 % against the floor of 99. The floor
itself is untouched: raising it is the human's decision and belongs to the last slice of
this set.

**RED provenance by mutation.** Every case was green before any change, so each earned its
red separately: one mutant per case was written to `src/lib/quality-agent.js`, the whole test
file was run, and the file was restored (sha256 identical before and after,
`183dc41c…4f51e5b`). A mutant counts as killed only when its OWN named case failed.

| Mutant | Named case that went RED | Verdict |
|---|---|---|
| the newline refusal removed | refuses a NEWLINE and never spawns the command | KILLED |
| the unterminated-quote refusal removed | refuses an UNTERMINATED QUOTE and never spawns the command | KILLED |
| an illegible fail counter treated as a pass | reports UNCERTIFIED when the runner exits 0 with a summary it cannot read | KILLED (and the contrast case stayed green, which is its whole purpose) |
| the hash cache not refreshed on an empty affected set | an empty affected set is a zeroed PASS that still refreshes the hash cache | KILLED |
| the selection falls back to the full suite | a non-empty affected set runs ONLY those tests and refreshes the cache | KILLED |
| the hash cache refreshed after a FAILING run | a FAILING affected run must NOT refresh the hash cache | KILLED |
| an unreadable committed blob throws instead of returning null | skips the blob it cannot read and still finds the secret in the next one | KILLED |
| a failed external verifier swallowed silently | names the failed tool in the skip list and finishes the scan | KILLED |
| the lock ignored | refuses to run while a live process holds the lock, and exits 0 | KILLED |
| the missing-tool list never printed | runs the whole gate green and STILL does not push | KILLED |
| the ship gate never consulted on a green run | runs the whole gate green and STILL does not push | KILLED |
| a red run says nothing | reports a failing gate and never reaches the ship gate | KILLED |

**Nothing was written into the gate's own inputs.** The test file hashes
`.ctoc/approvals`, `.ctoc/state/verify`, `.ctoc/streaming` and `plans/` before its first
case and compares after its last; the run is green, so not one byte of them changed.

