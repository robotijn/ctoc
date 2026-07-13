---
title: "W02-s4 — Block multi-hop moves that skip a human gate"
type: feature
parent_plan: "ctoc-audit-w02-gate-integrity"
depends_on: none
files:
  - src/lib/gate-order.js
  - src/scripts/move-plan.js
  - tests/ctoc-audit-w02-s4-multihop-gate-block.test.js
priority: HIGH
created: "2026-07-13T00:00:00Z"
---

# W02-s4 — Block multi-hop moves that skip a human gate

**Parent:** `ctoc-audit-w02-gate-integrity` (finding **H2**). **Slice scope:** replace
`move-plan.js`'s single adjacent-pair gate check with a stage-ORDER check that blocks
ANY forward move crossing one or more gate edges — while leaving non-gate and backward
(revert) moves untouched. Independent of the ledger, hence `depends_on: none`.

### The bug this closes
`move-plan.js:60` — `if (HUMAN_GATES[sourceStage] === destination)` — only matches the
three exact adjacent pairs. `in-progress → done` is not a `HUMAN_GATES` key, so the
check passes and `movePlan()` relocates the file, SKIPPING the `review → done` gate.
Same hole for `functional → todo` (skips `implementation→todo`) and any pair spanning
>1 gate edge.

### Why the guard lives in `move-plan.js`, not in `movePlan()`
`movePlan()` (`actions.js`) is the low-level mover that `approvePlan()` itself calls to
LEGITIMATELY cross a gate after stamping. A block inside `movePlan()` would break
`approvePlan`. `move-plan.js` is the untrusted CLI entry executor agents invoke from
Bash (the H2 attack surface). The guard belongs there; the new pure helper is unit-
tested directly over the full stage-pair matrix.

## Implementation Details

### Design decision (ADR) — order-based gate-edge crossing

Stage order: `functional`(0) < `implementation`(1) < `todo`(2) < `in-progress`(3) <
`review`(4) < `done`(5). Gate edges (by order): `functional→implementation`,
`implementation→todo`, `review→done`. A move `from → to` **crosses a gate** iff it is
FORWARD (`order[from] < order[to]`) and some gate edge `(g0 → g1)` satisfies
`order[from] <= order[g0]` AND `order[to] >= order[g1]`. Forward-only means backward
reverts (`review→functional` reject, `todo→implementation` dequeue,
`in-progress→review` cleanup) are always allowed. Worked cases:
- `in-progress(3)→done(5)`: `review→done` edge (4→5): `3<=4` and `5>=5`, forward →
  **BLOCK**.
- `functional(0)→todo(2)`: `functional→implementation` edge (0→1): `0<=0` and `2>=1`,
  forward → **BLOCK**.
- `review(4)→done(5)`: adjacent gate → **BLOCK** (unchanged behavior).
- `todo(2)→in-progress(3)`: no gate edge spanned → **ALLOW**.
- `in-progress(3)→review(4)`: no gate edge spanned → **ALLOW**.
- `review(4)→functional(0)` / `todo(2)→implementation(1)`: backward → **ALLOW**.

### File Specification — `src/lib/gate-order.js` (CREATE)

New leaf module. Exports:
- `STAGE_ORDER` — `['functional','implementation','todo','in-progress','review',
  'done']` (index = order).
- `GATE_EDGES` — `[['functional','implementation'],['implementation','todo'],
  ['review','done']]`.
- `crossesHumanGate(from, to)` → `boolean` per the ADR. Unknown stage → `false`
  (fail-open on ordering; `move-plan.js` already validates stages against
  `VALID_STAGES` before calling, so an unknown stage never reaches a real move).

### File Specification — `src/scripts/move-plan.js` (MODIFY)

- **Import** `const { crossesHumanGate } = require('../lib/gate-order');` (top, next to
  the other requires).
- **Replace** the line-60 check `if (HUMAN_GATES[sourceStage] === destination)` with
  `if (crossesHumanGate(sourceStage, destination))`, keeping the same error message
  shape and `process.exit(1)`. The local `HUMAN_GATES` const may be removed (now
  superseded) or left unused; prefer removing it to avoid a stale second source of
  truth.

### Test Plan — `tests/ctoc-audit-w02-s4-multihop-gate-block.test.js` (CREATE)

- **Matrix layer** (pure): import `crossesHumanGate`; assert over the FULL 6×6 ordered
  stage-pair set that each pair is BLOCKED (crosses a gate) or ALLOWED, per the ADR.
  Explicitly assert the three multi-hop blocks (`in-progress→done`, `functional→todo`,
  `functional→done`), the three adjacent gate blocks, every backward pair ALLOWED, and
  the non-gate forward pairs (`todo→in-progress`, `in-progress→review`) ALLOWED.
- **Behavior layer** (real CLI, subprocess): `spawnSync(process.execPath,
  [MOVE_PLAN], ['in-progress/x.md','done'], { cwd: sandbox })` with a real plan file at
  `plans/in-progress/x.md`; assert non-zero exit AND the file is STILL at
  `plans/in-progress/x.md` (not moved) — the move was PREVENTED. Then a control:
  `todo/x.md → in-progress` SUCCEEDS (file moved), proving the fix does not regress a
  legitimate non-gate move.

## Execution Plan

### Step 8: TEST (TDD Red)
- [ ] Write `tests/ctoc-audit-w02-s4-multihop-gate-block.test.js`. The multi-hop cases
      MUST fail today (the current check lets `in-progress→done` and `functional→todo`
      through). Assert BEHAVIOR: a multi-hop gate-skipping move leaves the plan file in
      its source folder; a legitimate non-gate move still relocates it.

### Step 9: PREPARE
- [ ] Confirm `move-plan.js`'s existing `VALID_STAGES` validation runs before the gate
      check (so `crossesHumanGate` only ever sees known stages).

### Step 10: IMPLEMENT
- [ ] Create `src/lib/gate-order.js` exporting `STAGE_ORDER`, `GATE_EDGES`,
      `crossesHumanGate` per the ADR.
- [ ] In `src/scripts/move-plan.js`: import `crossesHumanGate`, replace the line-60
      adjacent-pair check with it, remove the now-superseded local `HUMAN_GATES`.

### Step 11: REVIEW
- [ ] Confirm backward/revert moves and non-gate forward moves are all still allowed;
      confirm no other caller relied on the removed local `HUMAN_GATES`.

### Step 12: OPTIMIZE
- [ ] `crossesHumanGate` is O(#gate edges) with a precomputed index map; no allocation
      in the hot path.

### Step 13: SECURE
- [ ] The existing `plans/`-confinement traversal guard (lines 69–76) is preserved and
      still runs; the gate check adds no new path handling.

### Step 14: VERIFY
- [ ] `node --test tests/ctoc-audit-w02-s4-multihop-gate-block.test.js` → `# fail 0`.
- [ ] `node --test tests/*.test.js` green — existing move/gate tests still pass
      (adjacent gates still blocked, non-gate moves still allowed).

### Step 15: DOCUMENT
- [ ] JSDoc `crossesHumanGate` with the order-based rule + worked multi-hop examples;
      update the `move-plan.js` header comment (lines 9–14) to say "any gate-crossing
      move, including multi-hop, is blocked".

### Step 16: FINAL-REVIEW
- [ ] Verify against H2: `in-progress→done` and `functional→todo` PREVENTED;
      `todo→in-progress` still SUCCEEDS.
