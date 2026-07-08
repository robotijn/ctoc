---
approved_by: human
approved_at: 2026-07-08T09:55:24.955Z
gate_crossed: functional → implementation
---

---
title: "SIP1 — Decompose functional plans into small, focused implementation plans"
type: functional
status: functional
created: 2026-07-08
program: ctoc-pipeline
priority: HIGH
files:
  - agents/planning/implementation-planner.md
  - src/lib/actions.js
  - src/lib/plan-validator.js
  - docs/IRON_LOOP.md
  - CLAUDE.md
  - tests/subplan-decomposition.test.js
---

# SIP1 — Decompose functional plans into small, focused implementation plans

> Direct user work order (Tijn, 2026-07-08): "the plans are too large to handle for
> the LLM; make it so the implementation plans become small focused plans, typically
> way more than the functional plans." Decisions taken in discussion:
> **(1) granularity = one cohesive slice per plan** (≈ one module + its test, or one
> integration point, ~1–3 files); **(2) the implementation-planner DECOMPOSES**
> (functional → N small implementation plans, mirroring vision-decomposer);
> **(3) Gate 2 + Gate 3 batch per parent functional plan** (more plans ≠ more prompts).

## 1. ASSESS — Problem Understanding

This session proved the problem empirically: the vector-chain implementation plans
(PI0/PI2/PI3) each carried ONE monolithic `# Implementation Details` blueprint (6+
modules). The executors ran 400–700s each and **two crashed mid-implementation on
transient API errors** because a single plan was too large for one clean LLM pass —
losing all in-flight work and forcing a full re-dispatch. The root cause is
structural: CTOC's implementation-planner produces **one big implementation plan per
functional plan**. A plan sized to a whole feature exceeds what one executor context
can build reliably.

## 2. ALIGN — Business Alignment

Goal: the implementation phase produces **many small, focused, independently-buildable
plans** — each sized to one clean executor pass — so no single dispatch is too large to
complete, a crash loses only one small slice, and each slice is independently reviewable.

- **Decomposer role:** the implementation-planner, given an approved functional plan,
  emits **N small implementation plans** (not one), each a cohesive slice — typically
  one module + its test, or one integration point (~1–3 files). A 6-module feature →
  ~6 small plans. Typically **way more implementation plans than functional plans**.
- **Slice sizing rule:** each slice is small enough that its full blueprint + build +
  test fits one focused executor pass; slices are dependency-ordered (`depends_on`)
  and never split a module from its own test (they ship together in one slice).
- **Parent linking:** each small plan declares `parent_plan: <functional-slug>` so the
  set is traceable and gate-able as a group.
- **Batched gates:** Gate 2 (implementation→todo) and Gate 3 (review→done) are approved
  for ALL sibling sub-plans of a parent functional plan in ONE human decision — so more
  plans does NOT mean more gate prompts. Implementation stays sequential + dependency-
  ordered; a human still approves each gate, just per-parent-batch.

## 3. CAPTURE — Acceptance Criteria (BDD)

- [ ] **Scenario: the planner decomposes into small cohesive-slice plans**
  Given an approved functional plan with multiple modules
  When the implementation-planner runs
  Then it writes N ≥ 2 separate implementation plan files (not one big blueprint)
  And each declares `parent_plan: <functional-slug>` and a focused `files:` (~1–3 files,
  a module + its test kept together)
  And each carries its own small `# Implementation Details` + canonical Step 8–16 checklist
  And the slices are dependency-ordered via `depends_on`

- [ ] **Scenario: parent_plan is a recognized, validated frontmatter field**
  Given an implementation sub-plan with `parent_plan: <slug>`
  When `plan-validator` runs
  Then `parent_plan` is accepted (not flagged as unknown) and, if present, must name a
  real plan slug (a dangling parent is a validation warning)

- [ ] **Scenario: batched Gate 2 approves all siblings of a parent at once**
  Given 4 implementation sub-plans sharing `parent_plan: X` in `implementation/`
  When the human approves the parent's Gate 2 (implementation→todo)
  Then a batched-approve helper crosses ALL 4 to `todo/` in one call (human marker on each),
  never auto-crossing without the human's single approval

- [ ] **Scenario: batched Gate 3 ships all siblings of a parent at once**
  Given the parent's sub-plans all in `review/` (built + reviewed)
  When the human approves the parent's Gate 3 (review→done)
  Then all siblings cross review→done in one batched-approve call

- [ ] **Scenario: sequential, dependency-ordered implementation preserved**
  Given sub-plans with a `depends_on` chain
  Then they are implemented one at a time in dependency order (the plan-serial rule holds);
  a slice whose dependency is unbuilt is not started

## Scope

**In:**
- `agents/planning/implementation-planner.md` — rewrite its job: DECOMPOSE the functional
  plan into N small cohesive-slice implementation plans (each a module+test or one
  integration point), each written as its own plan file with `parent_plan:`, a focused
  `files:`, a small blueprint, and `depends_on`. Replace the single-monolithic-blueprint
  instruction with the slice-sizing rule + the "way more plans than functional" mandate.
- `src/lib/actions.js` — a batched-gate helper: `approveSubplans(parentSlug, fromStage, projectPath)`
  that crosses ALL sub-plans of a parent through the gate together (human marker on each);
  reuses the existing `approvePlan` gate-safety (no auto-cross). A `listSubplans(parentSlug)`
  accessor.
- `src/lib/plan-validator.js` — recognize `parent_plan` as a valid frontmatter field;
  warn (not error) on a dangling parent reference.
- `docs/IRON_LOOP.md` + `CLAUDE.md` — document the pipeline change: Step 5–7 now
  decomposes functional → N small implementation plans; 1 functional → many implementation.
- `tests/subplan-decomposition.test.js` — the batched-gate helper (approve all siblings
  Gate 2 + Gate 3, human-marker present, no auto-cross), parent_plan validation
  (accepted, dangling→warn), listSubplans, and the plan-serial dependency-order invariant.

**Out:**
- The implementation-planner's actual LLM decomposition quality (prompt behavior — asserted
  by the prompt text + downstream use, not a unit test).
- Auto-generating slice boundaries algorithmically (the planner decides slices per feature).
- Changing the human gates themselves (they stay; batching is a convenience over the same
  approvePlan gate-safety — a human still approves each batch).
- Retroactively re-slicing already-shipped plans.

## Decisions Taken

- **D-SIP1-1 (granularity):** one cohesive slice per plan ≈ one module + its test (~1–3
  files); never split a module from its test.
- **D-SIP1-2 (mechanism):** the implementation-planner decomposes (no new agent);
  emits N plan files with `parent_plan:` linking + `depends_on` ordering.
- **D-SIP1-3 (gates):** Gate 2 + Gate 3 batch per parent functional plan via
  `approveSubplans`, reusing approvePlan's gate-safety (human marker, no auto-cross).
- **D-SIP1-4 (serial build):** implementation stays one-slice-at-a-time in dependency
  order (the existing plan-serial rule); batching applies only to gate APPROVAL, not to
  parallel implementation.
