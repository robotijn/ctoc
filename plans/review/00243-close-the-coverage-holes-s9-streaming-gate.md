---
iron_loop_verdict: true
title: "A sufficiency predicate that could not run is IGNORANCE, not sufficiency"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/streaming-gate-coverage-holes.test.js
  - src/lib/streaming-gate.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.698Z
gate_crossed: implementation → todo
---

# A sufficiency predicate that could not run is IGNORANCE, not sufficiency

**Scope (one line):** cover the dark ranges of `src/lib/streaming-gate.js`, starting with the
fail-closed arm of `sufficiencyFor` — the predicate whose verdict decides whether a plan crosses
a pre-build moment without a human.

## Implementation Details

### Target and ranges

`src/lib/streaming-gate.js` — measured **98.71 %** on 2026-08-31. Uncovered:
`381-382` · `471-476` · `496-498` · `628-629` · `823` · `1297-1298` · `1610-1611` · `1632-1633` ·
`1658-1659`.

### What the planner verified (read this session: lines 465-502)

`sufficiencyFor(root, ref)` builds a `closed(reason)` result — **471-476** — carrying
`enough: false`, empty id lists, `computed: null` (never `0`, because a predicate that could not
run knows neither the denominator nor the answered set) and `unboundAnswers: 0`. It returns
`closed('unavailable')` when `root` is not a non-empty string (line 478) and again from its catch
at **496-498** when `require('./streaming-precompute')` or `hasEnoughInformation` throws.

`471-476` being dark means `closed(...)` is never invoked in any test today — so neither the
guard path nor the fault path is exercised, and the whole "could not run" verdict is unverified.

Every other range in this file is **unread by the planner**. Read the code at Step 9.

### Seams — exact

- **471-476 via the guard:** call `sufficiencyFor(null, 'implementation/x.md')` and
  `sufficiencyFor('', ref)`. Assert the FULL shape, and specifically `computed === null` — not
  `0`. `computed: 0` would mean "we counted, there were none", which is the false-green reading
  the evidence composer renders as `unknown`. This case needs no mock at all.
- **496-498 via the catch:** patch `Module._load` for the resolved
  `src/lib/streaming-precompute.js` so the in-function `require` throws, restore in `finally`
  (the pattern in `tests/pretooluse-write-coverage.test.js`). Assert the same closed shape with
  `reason: 'unavailable'`. A mutant returning `enough: true` here would auto-cross a plan on a
  read error — that is what this case kills.
- If `sufficiencyFor` is not exported, reach it through its live caller (the sufficiency-crossing
  path) and assert the composed evidence string instead; confirm at Step 9 and say in the header
  which surface the case drives.
- The remaining ranges: classify at Step 9 and prefer fixture-driven cases (a questions file with
  a known shape) over mocks.

### The evidence contract this module must keep

The crossing record states the DENOMINATOR, not just the numerator: `<N> question(s) computed,
<M> answered …`, where a count that could not be established renders `unknown` and a genuine zero
renders the explicit phrase `no questions were computed`. If any new case touches the evidence
composer, it must assert those three renderings stay distinct. Never assert a shape that
collapses `unknown` into `0`.

### Wiring — the live call sites

No module is added. `src/lib/streaming-gate.js` is live in the pre-build crossing path and in the
menu screens. The new test file is reached by the gated suite.

### Security review

- Question ids and reasons are producer-authored and untrusted; the module strips control
  characters before they reach a record. A case should feed an id containing a control character
  and a terminal escape and assert it does not survive into the output.
- Fixtures under `os.tmpdir()`, removed in `after`; no secret; no shell.

## Test Plan (TDD-Red first)

- `sufficiencyFor with an unusable root returns enough:false with computed:null (never 0 — "could not count" is not "counted none")`
- `sufficiencyFor whose predicate module fails to load returns enough:false, unavailable — a read error must never auto-cross a plan`
- one case per remaining reachable range, named for its behaviour.
- Every case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.

## Decisions Taken Under Ambiguity

1. **`src/lib/streaming-gate.js` is declared in `files:` but no source change is intended** — the
   declaration exists so a defect this slice exposes can be fixed here, recorded with what failed
   and why the code was wrong.
2. **`computed: null` is asserted explicitly in every closed case.** It is the single field that
   separates ignorance from a clean empty result, and an assertion that omitted it would let the
   two collapse.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

4. **`computed === null` on a closed verdict is asserted where it is observable, and nowhere faked.**
   The plan's Decision 2 asks every closed case to assert `computed === null` explicitly. That field
   is not observable through any live surface: `sufficiencyFor` is unexported, its caller publishes
   only `enough` / `sufficiencyReason` / the two id lists, and a closed verdict never reaches
   `composeSufficiencyEvidence` because a crossing requires `enough === true`. Asserting it would
   have meant exporting a function for a test or calling one nothing calls. Instead the cases assert
   the behaviour the field exists to produce — a predicate that could not run crosses nothing and is
   reported as `unavailable` — and the `unknown`-versus-`0` distinction the decision protects is
   already asserted at the composer itself by `tests/sufficiency-evidence.test.js` (the explicit
   "no questions were computed" phrase for a genuine zero, `unknown` for an unestablished count).
   The reasoning is written into the test file header so a later reader does not mistake the
   omission for an oversight.
5. **Mutation was applied in memory, never to the file on disk.** Sibling slices restored the source
   byte-for-byte after writing mutants to it; this one compiles the mutated text through a
   `Module._extensions['.js']` override in a preload, so the repository copy is never modified at
   all and its sha256 is identical before and after. Same evidence, one fewer way to leave a mutant
   behind.

## Execution Plan

### Step 8: TEST
Write `tests/streaming-gate-coverage-holes.test.js` with the named cases. Run it; record every
case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive this file's uncovered ranges. Read every range and classify it.
Confirm whether `sufficiencyFor` is exported and, if not, which live caller the cases drive.

### Step 10: IMPLEMENT
- Sub-item 1: the two `sufficiencyFor` cases (guard and loader fault).
- Sub-item 2: the remaining reachable cases, fixture-driven where possible.
- Sub-item 3: the control-character case for the untrusted-id path.
- Sub-item 4: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every loader patch restored. Account for every case GREEN before
implementation.

### Step 12: OPTIMIZE
One fixture builder; one loader-patch helper. No sleeps, no retries.

### Step 13: SECURE
No untrusted text reaches an assertion message unstripped; nothing written outside
`os.tmpdir()`; no shell.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header states why `computed: null` matters and what a mutation of it would cause.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any path found where a
predicate fault could read as sufficiency.


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

**What landed:** one new test file, `tests/streaming-gate-coverage-holes.test.js` (eight cases),
plus the two documented test-file count lines in `CLAUDE.md` (542 → 543).
**`src/lib/streaming-gate.js` was NOT changed** — its sha256 is
`f7827c6bdd1fb8a0094ef4256e6608bb4e1131ea8c7dffc7f01367765e1ffaed` before and after the whole run
(mutation was applied in memory at compile time, never written to disk), and `git status` reports it
unmodified. No test was weakened, no case deleted, no existing test file edited, no baseline,
exemption or coverage floor touched.

**Crossing tripwire.** Every file under `.ctoc/approvals`, `.ctoc/streaming`, `.ctoc/state/verify`
and `plans/` (1104 files) was sha256-hashed before the first test run and again after the final
`npm test`: **IDENTICAL**. No crossing function was ever pointed at this repository; every fixture
lived under `os.tmpdir()` and was removed in `afterEach`.

**Step 8 — TEST.** Eight cases written first and run. **One was genuinely RED on the first run, for
a reason that was mine, not the module's**: the control-character assertion used
`/[\x00-\x1f\x7f-\x9f]/`, which matches the newline (`\x0a`) the screen text is built from, so it
flagged every multi-line screen. The assertion — not the module — was wrong; it was corrected to
exclude `\n` and the reason is recorded in the test file header rather than quietly rewritten. The
other seven were GREEN on the first run, which is expected for a coverage slice over behaviour that
is already correct, and **none is banked**: red provenance for all eight comes from mutation. Each
mutant was applied as a single in-memory compile-time replacement of the source (the pristine source
sha256-verified before each run, the anchor required to match exactly once), the new test file
re-run, and the mutant counted dead only where **its own named case** failed. All eight died:

| mutation applied to `src/lib/streaming-gate.js` | case that went RED |
|---|---|
| `nextUnansweredQuestion`'s catch fabricates a question instead of returning `null` | 381-382: a broken question store falls back to the plain Approve screen |
| `sufficiencyFor`'s catch returns `enough: true` (a read error auto-crosses) | 471-476 + 496-498: a predicate that could not run crosses NOTHING |
| `crossBySufficiency`'s outer catch returns `true` | 628-629: a fault while crossing leaves the plan and the ledger untouched |
| `tokenBreakPoint`'s fallback returns `word.length` instead of `width` | 823: an unbreakable token wraps inside its column |
| `sufficiencyLine`'s YES branch fires on `enough === false` | 1297-1298: enough information at the last moment is shown, never crossed |
| the incomplete-answer guard becomes `!qid && !key` | 1610-1611: an all-control-character id is refused and recorded nowhere |
| the stamp-failure reason is dropped (`stampFailure = null`) | 1632-1633: an unstampable answer is kept, and the human is told why |
| a failed write reports "Recorded your answer" | 1658-1659: an answer that could not be written says so |

**Step 9 — PREPARE.** Ranges re-derived from the gate's own report, not from the plan: `npm test`
before the change reported `streaming-gate.js 98.71 % | 381-382 471-476 496-498 628-629 823
1297-1298 1610-1611 1632-1633 1658-1659` — identical to the plan's list. Every range was read and
classified, and **every one is reachable**; none is permission-gated, terminal-only or dead:

| range | classification | how it is met |
|---|---|---|
| 381-382 | reachable | `nextUnansweredQuestion`'s catch, via an unloadable question-store module |
| 471-476 | reachable via its fault path | the `closed(reason)` builder; see the note below on `computed` |
| 496-498 | reachable | `sufficiencyFor`'s catch, same loader fault |
| 628-629 | reachable | `crossBySufficiency`'s outer catch, via a guarded read fault on the plan file |
| 823 | reachable | `tokenBreakPoint`'s no-separator fallback, via a 210-character separator-free token |
| 1297-1298 | reachable | `sufficiencyLine`'s YES branch, at the last moment (whose destination is not pre-build, so a sufficient plan is displayed rather than crossed) |
| 1610-1611 | reachable | `streamAnswer`'s incomplete-answer guard |
| 1632-1633 | reachable | `streamAnswer`'s revision-stamp failure |
| 1658-1659 | reachable | `streamAnswer`'s write failure |

`sufficiencyFor` is **not exported**. Its only live caller is `pendingGateDecisions`, so all its
cases drive that function (and, for the render, `streamingGateScreen` / `planDecisionScreen`) rather
than the predicate directly. The guard arm at line 478 (`!isNonEmptyStr(root)`) is unreachable from
outside — `pendingGateDecisions` resolves the plans directory from `root` before it gets there — so
`closed(...)` is reached through its fault path at 496-498, which executes the same six lines.

**Step 10 — IMPLEMENT.** Eight cases in three groups: the checks that could not run (381-382,
471-476/496-498, 628-629, 1297-1298), the decision matrix (823), and recording an answer honestly
(1610-1611, 1632-1633, 1658-1659). Faults are injected only at true boundaries — `Module._load` for
one resolved filename, restored in a `finally`, and `safe-fs` via `t.mock.method`, guarded to a
single sentinel-bearing plan filename and to the one `answers.jsonl` write. No function under test
is mocked or stubbed.

**Step 11 — REVIEW.** No existing test file touched; no assertion weakened; no baseline, whitelist,
exemption or floor changed; no function under test mocked; every loader patch restored in a
`finally` and every `safe-fs` mock restored by the runner. Green-before-implementation accounted for
above (seven cases, all given red provenance by mutation; one genuine first-run red, whose cause was
a defect in my own assertion).

**Step 12 — OPTIMIZE.** One sandbox builder, one plan writer, one fork-question builder, one
loader-patch helper. No sleeps, no retries, no polling.

**Step 13 — SECURE.** Everything written lives under `os.tmpdir()` and is removed in `afterEach`; no
shell is spawned; no secret appears. The untrusted-producer-text path is asserted directly: a
question id consisting only of control characters and a terminal-escape introducer is refused, is
recorded nowhere, and leaves no control character in the text the human reads.

**Step 15 — DOCUMENT.** The test file header states the classification of every range, where each
fault is injected, the full red-provenance table, and — in plain words — why `computed: null` is the
field that separates ignorance from a clean empty result.

## Verification Evidence

`npm test` from the repository root, captured in full; last lines read verbatim:

```
[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

Exit status 0. Suite-wide line coverage **99.88 % → 99.90 %** (floor 99, untouched).

`src/lib/streaming-gate.js`: **98.71 % → 100.00 % line, 100.00 % function** (branch 86.50 % →
89.19 %). **No uncovered ranges remain in this file.**
