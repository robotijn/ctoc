---
title: Menu — Critique First & Brutal
type: feature
priority: HIGH
files:
  - src/lib/menu-screens.js
  - src/commands/menu.md
  - tests/menu-critique-first.test.js
---

# Menu — Critique First & Brutal

CTO Chief directive: the plan menu's critique action (the `Discuss` verb) must be
the **FIRST and MOST IMPORTANT** item on **every** plan screen — both the generic
plan actions menu (`planActions`) and the review-stage menu (`reviewActions`). It
must convey an **EXTREME, no-holds-barred adversarial critique** — nothing held
back, no praise, no hedging. It remains advisory WORK: it never edits the plan and
never crosses a gate.

## Scope

- `src/lib/menu-screens.js` — `planActions()`: move `Discuss` to index 0; brutal description.
- `src/lib/menu-screens.js` — `reviewActions()`: add/ensure `Discuss` (critique) FIRST, mapped to `claude:discuss`, brutal description.
- `src/commands/menu.md` — upgrade the `claude:discuss` handler to specify a maximally harsh, no-holds-barred adversarial critique; still advisory-only (no plan edits, no gate crossing).

## Decisions Taken Under Ambiguity

- Kept the label `Discuss` (per directive) rather than renaming to `Critique`, so
  the existing `claude:discuss` action wiring and downstream handlers are untouched.
- In `reviewActions` the critique is inserted as a new first option ahead of the
  existing View/Edit + three gate transitions; the gate transitions are preserved.
- **Plan placement (over-constrained directive).** The directive asked for this
  file in `plans/implementation/` with NO `parent_plan` and NO gate marker, while
  also requiring the full suite green. The live-repo self-check
  (`checkGateDestinationsApproved`) flags ANY plan in a gate-destination stage
  (implementation/todo/done) that lacks `parent_plan` or `approved_by: human`.
  Faking `approved_by: human` is a forbidden false gate marker; inventing a
  `parent_plan` is forbidden by the directive. The honest, gate-neutral resolution
  is the executor's own active-work state: `plans/in-progress/` is NOT a gate
  destination, so a plan being executed there needs no approval marker. The file
  was therefore moved to `plans/in-progress/` (no gate crossed, no false marker).
  CTO Chief can move it back to `plans/implementation/` in one step if preferred —
  the trade-off is that doing so re-reddens the two advisory self-check tests until
  the plan is gated or given a parent.

## Iron Loop

### Step 8: TEST
- [ ] Write `tests/menu-critique-first.test.js` calling the REAL `planActions`/`reviewActions` (zero doubles).
- [ ] Assert `planActions` (non-review stage) returns critique/Discuss as `options[0]`, mapped to `claude:discuss`.
- [ ] Assert `reviewActions` returns critique/Discuss as `options[0]`, mapped to `claude:discuss`.
- [ ] Confirm RED against current code (Discuss currently 3rd in planActions, absent in reviewActions).

### Step 9: PREPARE
- [ ] No new dependencies; existing `node --test` harness.

### Step 10: IMPLEMENT
- [ ] `menu-screens.js` `planActions()`: `Discuss` to index 0 with brutal description.
- [ ] `menu-screens.js` `reviewActions()`: `Discuss` FIRST, mapped to `claude:discuss`, brutal description.
- [ ] `src/commands/menu.md`: harden `claude:discuss` handler wording (maximally harsh, advisory-only).

### Step 11: REVIEW
- [ ] Self-review: label/action wiring intact; gate transitions preserved in reviewActions.

### Step 12: OPTIMIZE
- [ ] No redundant work introduced; single option array construction.

### Step 13: SECURE
- [ ] No new inputs; advisory action never edits plan or crosses a gate.

### Step 14: VERIFY
- [ ] `node --test tests/*.test.js` → `# fail 0`, `# skipped 0`.
- [ ] Update any existing menu test that pinned old option order (order change only, no weakening).

### Step 15: DOCUMENT
- [ ] menu.md handler text documents the brutal-critique behavior.

### Step 16: FINAL-REVIEW
- [ ] All steps complete; ready for human review.
