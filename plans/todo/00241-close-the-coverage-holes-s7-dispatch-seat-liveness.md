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
