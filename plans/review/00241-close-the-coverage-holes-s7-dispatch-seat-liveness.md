---
iron_loop_verdict: true
title: "The seat-liveness instruments report unreadable when they cannot be read"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/dispatch-seat-liveness-coverage-holes.test.js
  - src/lib/dispatch-seat-liveness.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.641Z
gate_crossed: implementation → todo
---

# The seat-liveness instruments report unreadable when they cannot be read

**Scope (one line):** cover the eleven dark ranges of `src/lib/dispatch-seat-liveness.js` — the
lowest-coverage module in the long tail at 89.23 % — where nine are filesystem-fault arms that
must report `unreadable` rather than `absent`, and the rest are the human-readable description.

## Implementation Details

### Target and ranges

`src/lib/dispatch-seat-liveness.js` — measured **89.23 %** on 2026-08-31. Uncovered:
`82-83` · `102-103` · `110-111` · `118-119` · `134-137` · `175-176` · `183-184` · `192-193` ·
`275-283` · `303-308` · `321-322`.

### What the planner verified (read this session: lines 70-139, 154-209, 262-326)

| lines | site | behaviour that must be pinned |
|---|---|---|
| 82-83 | `usableRoot` catch | a bad path is unusable → `false`, not a crash |
| 102-103 | `inspectSlotStore` — `existsSync` throws | `{ status: 'unreadable', evidence: null }` |
| 110-111 | `inspectSlotStore` — `statSync` throws | `unreadable` |
| 118-119 | `inspectSlotStore` — `readFileSync` throws | `unreadable` |
| 134-137 | `inspectSlotStore` — `JSON.parse` throws | still `present`; only `detail` degrades to `slot store present (unparseable contents)` |
| 175-176 | `scanLogForTask` — `existsSync` throws | `unreadable` |
| 183-184 | `scanLogForTask` — `statSync` throws | `unreadable` |
| 192-193 | `scanLogForTask` — `readFileSync` throws | `unreadable` |
| 275-283 | `formatAge` | `<60s` → `Ns`; `<60m` → `Nm`; `<24h` → `Nh`; else `Nd` |
| 303-308 | `describeLiveness` — the `live` branch | names the source and the age, and says a dispatch-seated claim CAN be relied upon |
| 321-322 | `describeLiveness` — unrecognised result | "could not be described … treated as not established" |

The module exports `seatLiveness` and `describeLiveness` only; the helpers above are internal and
are reached through those two.

The distinction the whole module exists for: **`unreadable` is not `absent`.** A missing slot
store is `absent` (a successful observation), a store that cannot be read is `unreadable` (the
check could not look). A mutant collapsing the two is the false-green shape this repository
fences, and every fault case below must fail if that collapse happens.

### Seams — exact

Nine of the eleven ranges need only `t.mock.method` on the shared `safe-fs` module object, which
the module calls by property (`safeFs.existsSync(file)`), guarded by a path sentinel so only the
instrument under test throws:

```js
const safeFs = require('../src/lib/safe-fs');
const realExists = safeFs.existsSync;
t.mock.method(safeFs, 'existsSync', (p) => {
  if (String(p).endsWith('enforcement.json')) throw new Error('injected');
  return realExists(p);
});
```

- 134-137 needs **no mock at all**: write a slot-store file containing invalid JSON and assert
  `status: 'present'` with `detail` naming the unparseable contents. A mutant that downgraded the
  VERDICT on a parse failure reds here — the parse only enriches the detail.
- 82-83: pass a root that makes `safeFs.existsSync`/`statSync` throw (a sentinel mock, or a path
  containing a NUL byte, which `safe-fs`'s `validatePath` rejects with a `TypeError` — the
  simplest real fault, and it needs no mock).
- 275-283 and 303-308 and 321-322: pure, no mock. Call `describeLiveness` with hand-built result
  objects: a `live` result with `evidence.ageMs` set to 30 000 / 90 000 / 5 400 000 /
  200 000 000 milliseconds to walk all four `formatAge` arms, and a result whose `state` is a
  value the function does not recognise for 321-322.

### Wiring — the live call sites

No module is added. `src/lib/dispatch-seat-liveness.js` is live through `seatLiveness` /
`describeLiveness`; confirm its current call site at Step 9 and name it in the header. The new
test file is reached by the gated suite.

### Security review

- The description function is documented as never interpolating log content, a path or a stack
  trace. **Add a case that proves it:** put a terminal escape sequence and an absolute-looking
  path into a fixture log line, and assert the described output contains neither. That converts a
  security comment into a checked invariant.
- No secret in a fixture; fixtures under `os.tmpdir()`, removed in `after`; no shell.

## Test Plan (TDD-Red first)

One `it` per range, named for the behaviour, for example:
`inspectSlotStore reports unreadable (not absent) when the slot store cannot be read — "could not look" is not "found nothing"`.

Eleven cases, all RED before the change. Plus the security case above (which may be GREEN
already — if so, say so at Step 11 and keep it: it pins a documented invariant).

Mutation intent: every fault case reds if `unreadable` becomes `absent` or `no-task`; the
`formatAge` cases red on any unit-boundary change; the `live` case reds if the description stops
naming the source or the age; the unrecognised-state case reds if the fallback starts claiming
liveness.

## Decisions Taken Under Ambiguity

1. **`src/lib/dispatch-seat-liveness.js` is declared in `files:` but no source change is
   intended** — the declaration exists so a defect this slice exposes can be fixed here, recorded
   with what failed and why the code was wrong.
2. **The NUL-byte path is used as a real fault where it works** (`safe-fs` rejects it by
   contract), in preference to a mock: a real fault is stronger evidence than an injected one.
3. **A dead range is reported, never deleted** (parent plan, Decision 2). None of the eleven
   ranges looks dead from the read above; if one turns out to be, report it.

## Execution Plan

### Step 8: TEST
Write `tests/dispatch-seat-liveness-coverage-holes.test.js` with the eleven named cases plus the
no-interpolation security case. Run it and record every case RED with its reason.

### Step 9: PREPARE
Run the gate and confirm the eleven ranges still map to the sites in the table (the line numbers
are from 2026-08-31). Identify and name the module's live call site for the header.

### Step 10: IMPLEMENT
- Sub-item 1: the fixture builder (a temp project with `.ctoc/logs/` and an agent-slots store).
- Sub-item 2: the nine instrument cases and the parse-degradation case.
- Sub-item 3: the pure `describeLiveness` / `formatAge` cases and the no-interpolation case.
- Sub-item 4: the header, naming every range and its disposition.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every mock restored. Account for any case GREEN before implementation.

### Step 12: OPTIMIZE
One sentinel-mock helper. No sleeps, no retries.

### Step 13: SECURE
Confirm the no-interpolation case passes and that no fixture carries a secret; nothing written
outside `os.tmpdir()`; no shell.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage; at 89.23 % today it should be
the single largest improvement in the long tail.

### Step 15: DOCUMENT
The header states the `unreadable` versus `absent` distinction the cases exist to protect.

### Step 16: FINAL-REVIEW
Report: coverage before and after; whether the no-interpolation invariant held; any range left,
with its reason.


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

**Step 8 — TEST (the file did not exist; the runner said so).** The first act of this slice was
`node --test tests/dispatch-seat-liveness-coverage-holes.test.js`, which answered
`Could not find 'tests/dispatch-seat-liveness-coverage-holes.test.js'` — RED for the only reason a
not-yet-written file can be red. The file was then written with thirteen cases (the eleven named
ranges, one of them split into a live-branch case and its fallback case, plus the security case).

**Step 9 — PREPARE (the ranges re-derived, not trusted).** A full gated run (`npm test`) taken
before any change printed the module's own row:

```
dispatch-seat-liveness.js | 89.23 | 81.54 | 87.50 | 82-83 102-103 110-111 118-119 134-137 175-176 183-184 192-193 275-283 303-308 321-322
```

Identical to the plan's eleven ranges and to its 89.23 %, so the plan's map was current. The whole
suite was green at that point (coverage 99.81 %, failed 0, skipped 0), which is what makes the
after-measurement attributable to this slice. The module's live call site was confirmed on disk:
`src/lib/iron-loop-enforcer.js` registers `dispatch-seat-liveness` as a thorough-mode system check
(line 714) and requires both exports (line 753), so `checkAllInvariants` reaches it. Nothing new is
wired; this slice adds tests only.

**Step 10 — IMPLEMENT.** Four sub-items, all in the one new test file. The fixture builder mints
real `os.tmpdir()` roots and writes a slot store and an enforcement log through real `fs`, removed
in `afterEach`. The eight throw arms are driven by a sentinel-guarded `t.mock.method` on the shared
`safe-fs` module object — a true boundary, never the function under test — so only the one
instrument under test throws while every other read in the process stays real. The parse-
degradation case needs no mock (a real file of invalid JSON), and neither does the unusable-root
case (a NUL byte in the path, which `safe-fs`'s `validatePath` rejects by contract — Decision 2 of
this plan, a real fault in preference to an injected one). The description cases are pure. The file
header names every one of the eleven ranges, the case that pins it, and its classification.

**`src/lib/dispatch-seat-liveness.js` was NOT changed.** It was mutated and restored during the
provenance run below, and `git status` confirms it as unmodified. Decision 1 of this plan holds: no
defect was exposed, so the declared source file carries no edit.

**Step 11 — REVIEW (every case was green before any change, and every one earned its red).** All
thirteen cases passed on their first run, which is expected for a slice whose subject is existing
behaviour and is a finding to account for, never to bank. Each was therefore given red provenance
by mutation: the pristine source was hashed (sha256
`6e8f7d467fa9490e5ad044cb3d066402802bd828c3927adcbf9fae8eef6bb4e3`), fourteen mutations were
applied one at a time to the named arm, the one test file was run, and the source was restored and
re-hashed to the same digest after every single one. All fourteen mutants were KILLED by the case
named for that arm:

| mutation applied | case that failed |
|---|---|
| `usableRoot` catch removed (rethrows) | (1) |
| slot-store `existsSync` arm returns `absent` instead of `unreadable` | (2) |
| slot-store `statSync` arm returns `absent` | (3) |
| slot-store `readFileSync` arm returns `absent` | (4) |
| parse catch returns `unreadable` instead of degrading `detail` | (5) |
| log `existsSync` arm returns `no-task` instead of `unreadable` | (6) |
| log `statSync` arm returns `no-task` | (7) |
| log `readFileSync` arm returns `no-task` | (8) |
| `formatAge` negative clamp removed | (9) |
| `formatAge` minute boundary moved to 61 | (9) |
| live description stops naming the instrument and the age | (10) |
| unrecognised-source fallback echoes the raw source instead of the fixed words | (10b) |
| unrecognised-result fallback claims the seat is live | (11) |
| live description interpolates the evidence timestamp | (12) |

The last one is the security case doing real work: with the mutation in place the hostile bytes
planted in the log line reached the human-readable output and case 12 failed, so the module's
no-interpolation comment is now a checked invariant rather than a promise.

No existing test file was opened for editing, no assertion anywhere was weakened, no baseline,
whitelist, exemption or debt entry was added, no file was excluded from the coverage scope, and no
function under test was mocked. Every mock is a `t.mock.method` that the runner restores at the end
of its own test.

**Step 12 — OPTIMIZE.** One `faultOn` helper serves all eight injected-fault cases. No sleeps, no
retries, no polling; the whole file runs in about 40 milliseconds.

**Step 13 — SECURE.** Fixtures live only under `os.tmpdir()` and are removed in `afterEach`; no
shell is spawned; no fixture carries a secret (the hostile string is a terminal colour escape and
an invented path, and the escape byte is written as the six characters of a Unicode escape in the
source rather than as a raw control byte). Case 12 passes on the real code and fails on the mutant,
as recorded above.

**Step 15 — DOCUMENT.** The test file header states the distinction the whole file defends —
`unreadable` is not `absent` and is not `no-task`, because "could not look" is not "found nothing"
— names all eleven ranges with the case that pins each, records the live call site, and states the
seam and its guard.

## Verification Evidence

**Step 14 — `npm test` from the repository root**, captured to a file and read from its last lines
(never piped through anything that could hide the exit status):

```
[CTOC test-gate] coverage 99.85% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
EXIT=0
```

`tests 11937 · pass 11937 · fail 0 · cancelled 0 · skipped 0 · todo 0`.

`npm run lint` exit 0 (eslint, `--max-warnings 0`). `npm run typecheck` exit 0.

**The module's row, before and after:**

| | line | branch | function | uncovered ranges |
|---|---|---|---|---|
| before | 89.23 % | 81.54 % | 87.50 % | the eleven named ranges |
| after | **100.00 %** | **97.67 %** | **100.00 %** | none |

Whole-repository line coverage rose from 99.81 % to 99.85 %. All eleven ranges are closed; the
module now reports no uncovered line at all.

**Stated honestly:** branch coverage is 97.67 %, not 100 %. Every uncovered LINE is gone, so the
remaining unpinned branch arm sits on a line that does execute, and node's report does not name
which one — it prints uncovered lines only. This slice was scoped to the eleven line ranges the
measurement named, and it closed all eleven; the residual branch arm is reported here rather than
chased, and no baseline was touched to accommodate it.

## Decisions Taken Under Ambiguity (execution)

4. **Range 303-308 is pinned by two cases, not one.** The `live` branch contains the sentence a
   human reads plus two internal fallbacks (an unrecognised evidence source, a non-finite age). One
   case asserting the sentence would have left both fallbacks free to change, so the branch is split
   across case 10 (the sentence) and case 10b (the fallbacks), each with its own killed mutant. This
   is thirteen cases for eleven ranges, not a renumbering of the plan's map.
5. **`formatAge` is pinned at both sides of every unit boundary, not at one value per arm.** The
   plan asked for four values; four values leave a boundary shift alive. Twelve values are asserted
   (59 999 and 60 000 milliseconds, 59 minutes and 60, 23 hours and 24, plus the negative-clock
   clamp), and the boundary mutation above confirms the difference is load-bearing.
6. **No source change, and therefore no defect claimed.** Every case passed against the untouched
   module. Reporting a defect here would be an invention; the honest statement is that the eleven
   arms already behaved correctly and were simply unpinned, which is exactly what the parent plan
   predicted for this slice.
