---
approved_by: human
approved_at: 2026-07-08T10:34:23.505Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T10:12:29.099Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T09:55:24.955Z
gate_crossed: functional → implementation
iron_loop: true
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

- [x] **Scenario: the planner decomposes into small cohesive-slice plans**
  Given an approved functional plan with multiple modules
  When the implementation-planner runs
  Then it writes N ≥ 2 separate implementation plan files (not one big blueprint)
  And each declares `parent_plan: <functional-slug>` and a focused `files:` (~1–3 files,
  a module + its test kept together)
  And each carries its own small `# Implementation Details` + canonical Step 8–16 checklist
  And the slices are dependency-ordered via `depends_on`

- [x] **Scenario: parent_plan is a recognized, validated frontmatter field**
  Given an implementation sub-plan with `parent_plan: <slug>`
  When `plan-validator` runs
  Then `parent_plan` is accepted (not flagged as unknown) and, if present, must name a
  real plan slug (a dangling parent is a validation warning)

- [x] **Scenario: batched Gate 2 approves all siblings of a parent at once**
  Given 4 implementation sub-plans sharing `parent_plan: X` in `implementation/`
  When the human approves the parent's Gate 2 (implementation→todo)
  Then a batched-approve helper crosses ALL 4 to `todo/` in one call (human marker on each),
  never auto-crossing without the human's single approval

- [x] **Scenario: batched Gate 3 ships all siblings of a parent at once**
  Given the parent's sub-plans all in `review/` (built + reviewed)
  When the human approves the parent's Gate 3 (review→done)
  Then all siblings cross review→done in one batched-approve call

- [x] **Scenario: sequential, dependency-ordered implementation preserved**
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

---

# Implementation Details

> Generated by the implementation-planner (2026-07-08). SIP1 is itself a **single
> cohesive slice** — it predates the decompose-into-N-plans feature it introduces,
> so it is NOT decomposed into sub-plans. Two code files (`actions.js`,
> `plan-validator.js`) plus one test file form one clean executor pass; the four
> prose files (`implementation-planner.md`, `IRON_LOOP.md`, `CLAUDE.md`, and the
> plan's own scope) are documentation edits carried in the same slice.
>
> Read-fresh mandate honored: every path, signature, and line reference below was
> read from disk on 2026-07-08 (actions.js @ 891 lines, plan-validator.js @ 889
> lines, state.js @ 421 lines, vision-decomposer.js @ 397 lines). Trust the code
> over this blueprint if they ever diverge.

## Architecture Decision (ADR)

**Context.** CTOC's `implementation-planner` currently emits ONE monolithic
`# Implementation Details` blueprint per functional plan (see the CURRENT agent
def, Phase 3–5). Empirically (this session: PI0/PI2/PI3) a whole-feature plan
exceeds one clean LLM executor pass; two executors crashed mid-build on transient
API errors and lost all in-flight work. The `vision-decomposer` already solves the
analogous problem one level up: it splits ONE vision into N functional stub FILES
(`createStub` / `decomposeVision`, each with `parent_vision:` + `depends_on:`), then
batches them through the Product Owner handoff.

**Decision.** Mirror the vision-decomposer pattern one level down.
1. Rewrite the `implementation-planner` agent PROMPT so that, given an approved
   functional plan, it EMITS N small implementation-plan FILES — one cohesive slice
   each (≈ one module + its test, or one integration point, ~1–3 files) — instead of
   one big blueprint. Each emitted file carries `parent_plan: <functional-slug>`, a
   focused `files:`, its own small `# Implementation Details` + canonical Step 8–16
   checklist, and `depends_on:` for slice ordering.
2. Add a batched-gate helper in `actions.js` — `approveSubplans(parentSlug,
   fromStage, projectPath)` — that reuses the EXISTING `approvePlan` per sibling.
   Batching is *iteration under one human decision*, NOT a new auto-cross path: each
   sibling still gets the `approved_by: human` marker via `addApprovalMarker` inside
   `approvePlan`. Plus a read accessor `listSubplans(parentSlug, projectPath)`.
3. Teach `plan-validator.js` that `parent_plan` is a KNOWN field; a dangling parent
   (names no plan slug anywhere under `plans/`) is a WARNING, never an error.

**Consequences.**
- (+) No single dispatch is too large; a crash loses one small slice, not a feature.
- (+) Each slice is independently reviewable; batching keeps the human to one gate
  decision per parent, so "more plans" ≠ "more prompts".
- (+) Zero new auto-cross surface — the human gate is untouched; `approveSubplans`
  is a thin loop over the existing gate-safe `approvePlan`.
- (−) Filesystem-linked parents (`parent_plan:` string in frontmatter) are eventually
  consistent, not referentially enforced — hence a dangling parent is a *warning*
  (D-VP-3), matching how `vision-decomposer` links stubs by `parent_vision` string.
- **Alternative rejected:** a NEW `implementation-decomposer` agent + a NEW
  `approveBatch` auto-cross. Rejected per D-SIP1-2 (no new agent) and to avoid a
  second gate-crossing code path that could drift from `approvePlan`'s safety.

## Dependency Graph

```
[agents/planning/implementation-planner.md]  (prose rewrite — decomposer role)
        │ documents the contract that produces sub-plan files carrying
        │ parent_plan / depends_on / focused files: / Step 8–16
        ▼
[src/lib/plan-validator.js]  (MODIFY: add validateParentPlan + wire into gates)
        │  uses: parseMetadata (state.js), readPlans (state.js), path, safe-fs
        │  reads parent_plan from frontmatter; resolves slug across all plans/ stages
        ▼
[src/lib/actions.js]  (MODIFY: add listSubplans + approveSubplans)
        │  listSubplans  ──uses──> readPlans, getPlansDir (state.js)
        │  approveSubplans ──uses──> listSubplans (same file)
        │                  ──calls──> approvePlan (EXISTING, same file; gate-safety)
        │                  ──consults──> depends_on ordering (topological)
        ▼
[tests/subplan-decomposition.test.js]  (CREATE — node:test, tmp fixtures)
        tests: listSubplans, approveSubplans (Gate 2 + Gate 3, human marker,
               no auto-cross), parent_plan validation (accepted; dangling→warn),
               dependency-order invariant.

[docs/IRON_LOOP.md] + [CLAUDE.md]  (prose — pipeline docs: 1 functional → N impl)
        stand-alone documentation edits; no code dependency.
```

**Cycle check:** none. `actions.js → state.js` and `plan-validator.js → state.js`
already exist (both `require('./state')` today); adding `listSubplans`/`approveSubplans`
to `actions.js` and `validateParentPlan` to `plan-validator.js` introduces no new
edge. `plan-validator.js` does NOT import `actions.js` and must not (layer: both are
lib peers; keep the dependency one-directional state ← {actions, validator}).
**Orphan check:** none. `approveSubplans` consumes `listSubplans`; both are exported
and called from the menu + tests. `validateParentPlan` is wired into `validateForQueue`
and `validateForReview`.

## Implementation Order

1. `agents/planning/implementation-planner.md` (MODIFY, prose) — rewrite the agent's
   role to DECOMPOSE. No code depends on it at runtime; done first so the contract
   the code enforces is written down.
2. `tests/subplan-decomposition.test.js` (CREATE) — TDD Red. Write the failing tests
   for `listSubplans`, `approveSubplans`, `validateParentPlan`, dependency ordering
   BEFORE the implementations (Iron Loop Step 8).
3. `src/lib/plan-validator.js` (MODIFY) — add `validateParentPlan()` + export + wire
   into `validateForQueue` (implementation→todo) and `validateForReview`.
4. `src/lib/actions.js` (MODIFY) — add `listSubplans()` then `approveSubplans()`
   (the latter depends on the former) + exports.
5. `docs/IRON_LOOP.md` (MODIFY, prose) — document Step 5–7 decomposition + batched gates.
6. `CLAUDE.md` (MODIFY, prose) — one-line pipeline note: 1 functional → N implementation.

TDD note (Step 8 first): tests are authored before steps 3–4 even though the
dependency ORDER lists the tested modules after. Order = "what must exist to
reference what"; TDD = "tests precede implementation."

---

## File Specifications

### File: `agents/planning/implementation-planner.md`
**Action:** MODIFY (prose rewrite of the agent's core job)
**Purpose:** Turn the planner from a monolithic-blueprint author into a DECOMPOSER
that emits N small cohesive-slice implementation plans, mirroring the
vision-decomposer's vision→N-functional-stubs pattern.
**Change Type:** modify-existing (agent prompt)

#### Changes (keep the existing frontmatter, v7 principles, Step-0 template
selection, codebase-analysis phases, security/quality checklists — only the OUTPUT
CONTRACT changes: from "append one blueprint to this plan" to "emit N sub-plan files"):

- **Retitle & re-scope the Role section.** Replace "you bridge the gap … by producing
  a precise, actionable implementation blueprint" with: the planner produces a
  **dependency-ordered set of N small implementation plans**, each a cohesive slice.
  State the mandate verbatim: *"You will typically emit MANY more implementation plans
  than there are functional plans. A functional plan spanning 6 modules becomes ~6
  small implementation plans, not one."*

- **Add a new phase `## Phase 4b: Decompose into cohesive slices`** (between the
  existing blueprint-assembly Phase 4 and the write Phase 5). Specify:

  **Slice-sizing rule (D-SIP1-1):** each slice is small enough that its full blueprint
  + build (Step 10) + test (Step 8) fits ONE focused executor pass. Concretely:
  - Target ~1–3 files per slice.
  - A module and its own test file ALWAYS ship in the SAME slice — never split a
    module from its test.
  - One integration point (wiring a new function into an existing caller) is a valid
    slice on its own.
  - If a candidate slice would need >~3 substantive files or two unrelated modules,
    split it; if a slice is a single trivial one-liner with no test, merge it into
    the slice it most naturally belongs to.
  - Slices are dependency-ordered: a slice that references another slice's exports
    declares that slice in `depends_on`. Max chain depth 3 (mirror the
    vision-decomposer's rule); a longer chain is a smell — restructure.

  **Slice-naming convention:** `<parent-slug>-s<N>-<slice-name>.md`, where
  `<parent-slug>` is the functional plan's slug (filename without stage prefix or
  `.md`), `<N>` is the 1-based slice index in dependency order (zero-padded is NOT
  required; `s1`, `s2`, …), and `<slice-name>` is a short kebab-case descriptor of
  the slice (e.g. `coverage-map`, `wire-verify`). Example: functional plan
  `SIP1-small-focused-implementation-plans` → `SIP1-s1-coverage-map.md`,
  `SIP1-s2-wire-verify.md`. Use `slugify()` conventions (lowercase, `[^a-z0-9]+`→`-`).

- **Specify each emitted sub-plan file's structure.** Each slice file is a COMPLETE
  small implementation plan written to `plans/implementation/`:
  - Frontmatter MUST include:
    - `title:` — the slice title.
    - `type: implementation`
    - `parent_plan: <parent-slug>` — the functional plan's slug (bare slug, matching
      how `parent_vision` stores a reference; the validator resolves it across stages).
    - `depends_on:` — comma-separated sibling slice slugs, or `none`.
    - `files:` — the FOCUSED file list for THIS slice only (~1–3 entries), so the
      PreToolUse coverage hook scopes edits to exactly this slice.
    - `priority:` inherited from the parent.
  - Body MUST include its own small `## Implementation Details` (the File
    Specifications + Test Plan for just this slice's 1–3 files) followed by the
    canonical `## Execution Plan` with **Steps 8–16 using the exact canonical labels**
    (TEST, PREPARE, IMPLEMENT, REVIEW, OPTIMIZE, SECURE, VERIFY, DOCUMENT,
    FINAL-REVIEW) — because each slice is independently executed through the Iron Loop
    and validated by `validateStepLabels`.

- **Update Phase 5 (Write Output).** Instead of appending one blueprint to the parent
  plan, the planner now: (a) writes N slice files to `plans/implementation/`; (b)
  leaves the PARENT functional-derived implementation plan as an INDEX that lists its
  slices with their `depends_on` order and a one-line scope each (so a human sees the
  set); (c) `markComplete` message reads `Decomposed <parent> into N slices
  (<s1>, <s2>, …)`.

- **Add a `## Batched Gates` note.** State that Gate 2 (implementation→todo) and Gate
  3 (review→done) are approved for ALL siblings of a parent AT ONCE via
  `approveSubplans(parentSlug, fromStage, projectPath)` in `src/lib/actions.js` — one
  human decision per parent-batch, each sibling still receiving the human marker.
  Implementation stays sequential + dependency-ordered (D-SIP1-4): batching applies
  only to gate APPROVAL, never to parallel building.

- **Preserve unchanged:** the `reads_ancestry`, `no-stub-rule`, `async_choice_protocol`,
  `effort: xhigh` discipline; Step-0 template selection; Phases 1–3 codebase analysis;
  the security + architecture + quality checklists (now applied PER SLICE).

#### Assertion for this prose file (not unit-testable behavior — asserted on text):
The file must contain, literally: the string `parent_plan`, the naming token
`-s<N>-` (or an unambiguous description of `<parent-slug>-s<N>-<slice-name>.md`), the
phrase establishing "more implementation plans than functional plans", and
"never split a module from its test". Step 5 of the test list asserts these substrings.

---

### File: `src/lib/actions.js`
**Action:** MODIFY
**Purpose:** Add the batched-gate helper `approveSubplans` (reusing the existing
`approvePlan` gate-safety) and the `listSubplans` accessor.
**Change Type:** new-function (two exports; no change to existing functions)

#### Exports (added)

- `listSubplans(parentSlug: string, projectPath?: string)` → `Array<{slug: string, stage: string, path: string, dependsOn: string[], bgStatus: string}>`
  - Description: Enumerate every plan under `plans/` (across the stages
    `functional`, `implementation`, `todo`, `in-progress`, `review`, `done`) whose
    frontmatter `parent_plan` equals `parentSlug`. Reuses `readPlans(stageDir)` +
    `getPlansDir(root)` from `state.js` (same pattern as `vision-decomposer.listStubs`,
    which scans `functional/` for `parent_vision`). Returns oldest-first per stage.
  - `dependsOn` is the plan's `depends_on` frontmatter split on commas into a trimmed
    string array (`[]` when `none`/absent).
  - Throws: `Error('parentSlug required')` when `parentSlug` is falsy/non-string.
  - Example: `listSubplans('SIP1', root)` → `[{slug:'SIP1-s1-coverage-map', stage:'implementation', path:'…', dependsOn:[], bgStatus:'none'}, {slug:'SIP1-s2-wire-verify', stage:'implementation', path:'…', dependsOn:['SIP1-s1-coverage-map'], bgStatus:'none'}]`

- `approveSubplans(parentSlug: string, fromStage: string, projectPath?: string)` → `{approved: string[], skipped: Array<{slug,reason}>, results: Array<{slug, newPath, humanGate}>}`
  - Description: Batch-approve ALL sub-plans of `parentSlug` that currently sit in
    `fromStage`, crossing each ONE gate via the EXISTING `approvePlan(planPath,
    projectPath)`. This is the single human decision expressed as a loop — NOT a new
    auto-cross path. Order the batch by `depends_on` topological order so a dependency
    crosses before its dependents (keeps the plan-serial invariant meaningful even
    though gate-crossing itself is not execution).
  - Fail-safe (D-SIP1-3 gate-safety): before crossing, validate each sub-plan for the
    transition using the matching validator
    (`fromStage==='implementation'` → `validateForQueue`; `fromStage==='review'` →
    `validateReviewToDone`). If a sub-plan FAILS validation, it is NOT crossed —
    push `{slug, reason}` to `skipped` and CONTINUE with the rest; never silently
    skip (the skip is reported to the caller). A validation failure of one sibling
    does not abort the batch, but the batch return makes every skip explicit so the
    menu can surface "3 of 4 approved, 1 blocked: <reason>".
  - Each successful cross goes through `approvePlan`, so each sibling receives the
    `approved_by: human` marker via `addApprovalMarker` (Gate 2 and Gate 3 are the
    human gates in `HUMAN_GATES`) — the human-marker + no-auto-cross safety is
    inherited verbatim, not re-implemented.
  - Throws: `Error('parentSlug required')`; `Error('fromStage must be a gate source stage (implementation|review)')`
    when `fromStage` is not a batched-gate source.
  - Example: `approveSubplans('SIP1','implementation',root)` crosses every SIP1 slice
    in `implementation/` → `todo/`, each stamped `approved_by: human`.

#### Changes
- **Add** `listSubplans` and `approveSubplans` after `cleanupStaleInProgress` (≈ line
  860, before `module.exports`).
- **Add** both names to `module.exports` (≈ line 862–890).
- **Do NOT modify** `approvePlan`, `movePlan`, `HUMAN_GATES`, `addApprovalMarker`,
  or `applyIronLoop` — `approveSubplans` composes them, it does not change them.
- **Ordering helper:** add a small private `topoOrderByDependsOn(subplans)` (Kahn or
  DFS) local to `actions.js`; on a cycle (should not happen — planner enforces max
  depth 3, no cycles) fall back to input order and record no error (the plan-serial
  build catches a genuine cycle later; a batch approval ordering is best-effort).

#### Dependencies (imports this file needs — mostly already present)
- `require('./state')` for `readPlans`, `getPlansDir` (ADD these two to the existing
  destructured import; `parseMetadata` is already imported at line 8).
- `path`, `./safe-fs`, `./plan-validator` (`validateForQueue`, `validateReviewToDone`)
  — `plan-validator` is already required at line 12 (`validateForReview`); extend the
  destructure to add `validateForQueue`, `validateReviewToDone`.

#### Called By
- `src/commands/menu.js` — the implementation and review tabs, when the human approves
  a parent's Gate 2 / Gate 3 batch (menu wiring is prose in the agent contract; the
  function is the testable unit).
- `tests/subplan-decomposition.test.js`.

#### Data Flow
```
approveSubplans(parentSlug, fromStage, root)
  → listSubplans(parentSlug, root)                     // all siblings, all stages
  → filter to fromStage                                // only the batch at the gate
  → topoOrderByDependsOn(batch)                         // dependency order
  → for each sibling:
        validateForQueue|validateReviewToDone(path,root)
        valid?  → approvePlan(path, root)  ─┐            // human marker + move (EXISTING)
                  push results               ├─ gate-safe, no new cross path
        invalid → push {slug, reason} to skipped ┘
  → return { approved, skipped, results }
```

#### Error Handling
- Missing `parentSlug` / bad `fromStage` → throw descriptive `Error` (fail loud;
  programmer error, not runtime data).
- A stage directory that does not exist → `readPlans` already returns `[]` (safe).
- `approvePlan` throwing on an individual sibling (e.g. `Unknown plan location`) →
  catch per-sibling, push `{slug, reason: err.message}` to `skipped`, continue; never
  let one bad sibling abort the whole batch (async-overnight resilience).

#### Cross-Platform Notes
- Use `getPlansDir`/`path.join` for every stage dir (already the norm in state.js).
- No new shell, no hardcoded separators. `depends_on` parsing is pure string split.

---

### File: `src/lib/plan-validator.js`
**Action:** MODIFY
**Purpose:** Recognize `parent_plan` as a valid frontmatter field and warn (not error)
on a dangling parent reference.
**Change Type:** new-function + wiring

#### Exports (added)
- `validateParentPlan(content: string, projectPath: string)` → `ValidationResult`
  - Description: If frontmatter has no `parent_plan`, return a clean pass (the field
    is optional — top-level plans have no parent). If present, resolve the referenced
    slug against every plan filename under `plans/` (all stages). If NO plan matches,
    push a WARNING `parent_plan "<slug>" names no existing plan (dangling reference)`
    — never an error (D-VP-3: filesystem links are eventually consistent).
  - Resolution rule: a match is any `plans/**/<file>.md` whose slug equals the
    `parent_plan` value. Slug = filename without `.md`, tolerant of a leading stage
    prefix if the value includes one (accept both `SIP1` and `implementation/SIP1`).
  - Throws: nothing (validator functions return results, they don't throw on data).

#### Changes
- **Add** `validateParentPlan(content, projectPath)` near the other stage validators
  (after `validateForQueue`, ≈ line 715).
- **Add** a private helper `planSlugExists(projectPath, slug)` that scans the stage
  dirs (`functional`, `implementation`, `todo`, `in-progress`, `review`, `done`,
  `canvas`, `vision`) with `safeFs.readdirSync` guarded by `existsSync`, comparing
  `path.basename(f, '.md')` to the (stage-prefix-stripped) slug. Reuse `readPlans` if
  convenient, but a bare `readdirSync` is cheaper and sufficient (only names needed).
- **Wire into `validateForQueue`** (implementation→todo gate; ≈ line 692): after the
  existing title/structure checks, call `validateParentPlan(content, projectPath)` and
  merge its warnings into the result (a dangling parent is a WARNING at the queue gate,
  so the batch can still cross; it just surfaces the dangling link).
- **Wire into `validateForReview`** (≈ line 35): add a 6th check block calling
  `validateParentPlan(content, projectPath)`; merge warnings only (never flip `valid`).
- **Add** `validateParentPlan` to `module.exports` (≈ line 875).
- **`parseMetadata` already parses `parent_plan`** as a plain string scalar (state.js
  line 58–80 handles any `key: value` line) — no parser change needed. "Recognition"
  = the validator no longer being silent about it AND not flagging it; since the
  validator has no unknown-field blocklist today, the deliverable is the positive
  `validateParentPlan` (accept + dangling-warn), which is exactly what the acceptance
  scenario requires.

#### Dependencies (already present)
- `safeFs`, `path`, `parseMetadata` (state.js), `findProjectRoot` — all already
  imported at the top of plan-validator.js (lines 7–12). No new import.

#### Called By
- `validateForQueue`, `validateForReview` (same file) — and transitively by
  `approveSubplans` (which calls `validateForQueue`/`validateReviewToDone`) and by the
  existing `completeExecution` → `validateForReview` path.
- `tests/subplan-decomposition.test.js`.

#### Data Flow
```
validateParentPlan(content, projectPath)
  → parseMetadata(content).parent_plan
  → absent?  → { valid:true, warnings:[], … }          // optional field, clean pass
  → present? → planSlugExists(projectPath, slug)
        exists → { valid:true, warnings:[] }            // accepted, recognized
        missing→ { valid:true, warnings:['… dangling reference'] }  // WARN, not error
```

#### Error Handling
- `plans/` or a stage dir missing → `existsSync` guard → treated as "no match"; a
  parent may legitimately be absent → still only a warning.
- Never throws on plan content; never flips `valid` to false for a parent_plan issue.

#### Cross-Platform Notes
- `path.join` + `path.basename` for every filename compare; `readdirSync` on guarded
  dirs. No separators hardcoded.

---

### File: `docs/IRON_LOOP.md`
**Action:** MODIFY (prose)
**Purpose:** Document that Steps 5–7 now DECOMPOSE a functional plan into N small
implementation plans, and that Gates 2 & 3 batch per parent.
**Change Type:** documentation

#### Changes
- In **"Pipeline sections (v7)"** (≈ line 32) annotate the Implementation row:
  "5–7 (PLAN, DESIGN, SPEC) — **decomposes 1 functional plan into N small,
  cohesive-slice implementation plans**."
- In **"The 16 Steps at a Glance"** (≈ lines 47–49) revise the one-liners:
  - Step 6 DESIGN → "Define the architecture and **slice the work into small,
    independently-buildable implementation plans**."
  - Step 7 SPEC → keep adversarial-review wording; add "**per slice**".
- In **PHASE 2: IMPLEMENTATION PLANNING** (≈ lines 93–100) add a paragraph: the
  implementation-planner emits **N** small implementation plans (typically many more
  than functional plans), each `parent_plan`-linked, `depends_on`-ordered, ~1–3 files
  (a module + its test), each with its own Step 8–16. Note the naming convention
  `<parent-slug>-s<N>-<slice-name>.md`.
- Near the Gate description, add: **Gate 2 and Gate 3 are approved per-parent-batch**
  via `approveSubplans` — one human decision crosses every sibling, each stamped
  `approved_by: human`; more plans does NOT mean more prompts. Build stays sequential
  + dependency-ordered.

#### Assertion (prose): file must contain "N small" (or equivalent "1 functional → many
implementation") and reference batched gates / `approveSubplans`.

---

### File: `CLAUDE.md`
**Action:** MODIFY (prose)
**Purpose:** One-line pipeline note that the implementation phase decomposes.
**Change Type:** documentation

#### Changes
- In the Iron Loop Summary table region (Steps 5–7 rows) or the Pipeline Philosophy
  section, add: "**1 functional plan → N small implementation plans.** Steps 5–7
  decompose the functional plan into cohesive slices (~1–3 files, a module + its
  test), each `parent_plan`-linked and `depends_on`-ordered. Gates 2 & 3 batch per
  parent via `approveSubplans` — one human decision per batch."
- Keep it terse (matches the existing summary density); do not duplicate the full
  IRON_LOOP prose.

#### Assertion (prose): file must reference "N small implementation plans" (or "1
functional → many implementation") and `parent_plan`.

---

## Test Plan

### Tests: `tests/subplan-decomposition.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`), tmp-project fixtures via
`fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-subplan-'))`. Each test builds a throwaway
`plans/{functional,implementation,todo,review,done}/` tree, writes fixture plan files
with known frontmatter, calls the real `actions.js` / `plan-validator.js` exports with
the tmp root as `projectPath`, asserts, then `rmSync(tmp, {recursive:true})` in teardown.

#### Test Cases

1. **listSubplans returns the parent's set (and only it).**
   - Setup: tmp project; write `plans/implementation/PARENT-s1-a.md` and
     `PARENT-s2-b.md` (both `parent_plan: PARENT`), plus a decoy
     `OTHER-s1-x.md` (`parent_plan: OTHER`) and a top-level `NOPARENT.md` (no
     `parent_plan`).
   - Action: `listSubplans('PARENT', tmp)`.
   - Assert: length 2; slugs exactly `{PARENT-s1-a, PARENT-s2-b}`; decoy + no-parent
     excluded; each result has `stage:'implementation'` and a real `path`.

2. **listSubplans reads depends_on into an array; spans stages.**
   - Setup: `PARENT-s1-a.md` in `implementation/` (`depends_on: none`), `PARENT-s2-b.md`
     in `todo/` (`depends_on: PARENT-s1-a`).
   - Action: `listSubplans('PARENT', tmp)`.
   - Assert: the `s1` entry `dependsOn` is `[]`; the `s2` entry `dependsOn` is
     `['PARENT-s1-a']`; stages are `implementation` and `todo` respectively.

3. **listSubplans throws on missing parentSlug.**
   - Action/Assert: `assert.throws(() => listSubplans('', tmp), /parentSlug required/)`.

4. **approveSubplans crosses ALL siblings Gate 2 (implementation→todo), human marker
   on each, no auto-cross without the call.**
   - Setup: 4 siblings `PARENT-s1..s4` in `plans/implementation/`, each a VALID
     queue-ready plan (title heading + `Implementation`/`Technical` section so
     `validateForQueue` passes), dependency chain s1←s2←s3←s4.
   - Pre-assert: none carry `approved_by: human` yet (no auto-cross before the call).
   - Action: `approveSubplans('PARENT','implementation', tmp)`.
   - Assert: all 4 now live in `plans/todo/`; `plans/implementation/` has none of them;
     each moved file's content contains `approved_by: human` and
     `gate_crossed: implementation → todo`; `result.approved` lists all 4;
     `result.skipped` is empty.

5. **approveSubplans crosses Gate 3 (review→done) for all siblings.**
   - Setup: siblings in `plans/review/`, each already carrying a prior
     `approved_by: human` marker (from Gate 2) and passing `validateReviewToDone`
     (no TODO/FIXME/unresolved).
   - Action: `approveSubplans('PARENT','review', tmp)`.
   - Assert: all in `plans/done/`; each stamped `gate_crossed: review → done`.

6. **approveSubplans fail-safe: a sibling failing validation is reported, not silently
   skipped, and does not abort the batch.**
   - Setup: 3 siblings in `implementation/`; make ONE invalid for `validateForQueue`
     (e.g. NO `#` title heading). The other two valid.
   - Action: `approveSubplans('PARENT','implementation', tmp)`.
   - Assert: the 2 valid crossed to `todo/`; the invalid one REMAINS in
     `implementation/`; `result.skipped` contains exactly the invalid slug WITH a
     non-empty `reason`; `result.approved` has the 2 valid slugs. (No silent skip.)

7. **approveSubplans crosses in dependency order.**
   - Setup: siblings with chain s1←s2←s3 written to `implementation/` in a SHUFFLED
     on-disk order.
   - Action: `approveSubplans('PARENT','implementation', tmp)`.
   - Assert: `result.results` (or a recorded order) has s1 before s2 before s3 — a
     dependency is approved before its dependents (dependency-order invariant).

8. **approveSubplans rejects a non-gate `fromStage`.**
   - Action/Assert: `assert.throws(() => approveSubplans('PARENT','functional', tmp),
     /gate source stage/)` (functional→implementation is Gate 1, not a batched
     sub-plan gate in this feature; only implementation & review batch).

9. **validateParentPlan accepts a resolvable parent.**
   - Setup: write `plans/functional/PARENT.md`; content with
     `parent_plan: PARENT` in frontmatter.
   - Action: `validateParentPlan(content, tmp)`.
   - Assert: `valid === true`; `warnings` has NO dangling message.

10. **validateParentPlan warns (does not error) on a dangling parent.**
    - Setup: content with `parent_plan: GHOST`; no `GHOST.md` anywhere under `plans/`.
    - Action: `validateParentPlan(content, tmp)`.
    - Assert: `valid === true` (NOT flipped false); `warnings` contains a message
      matching `/dangling|no existing plan/i` and mentioning `GHOST`.

11. **validateParentPlan clean-passes when parent_plan absent (optional field).**
    - Setup: content with no `parent_plan` line.
    - Action: `validateParentPlan(content, tmp)`.
    - Assert: `valid === true`; no dangling warning (field is optional for top-level
      plans; recognized, not required).

12. **Gate wiring: validateForQueue surfaces a dangling parent as a WARNING, not an
    ERROR (does not block the queue gate).**
    - Setup: a queue-ready plan (title + technical section) with
      `parent_plan: GHOST`.
    - Action: `validateForQueue(planPath, tmp)`.
    - Assert: `valid === true`; `warnings` includes the dangling-parent message;
      `errors` does NOT include it.

13. **Prose contract assertions (agent + docs).**
    - Read `agents/planning/implementation-planner.md`; assert it contains
      `parent_plan`, the "more implementation plans than functional plans" mandate
      (regex `/more implementation plans than.*functional/i`), a `depends_on` mention,
      and `never split a module from its test` (regex tolerant of wording).
    - Read `docs/IRON_LOOP.md`; assert it references batched gates / `approveSubplans`
      and "N small" (or "1 functional → many implementation").
    - Read `CLAUDE.md`; assert it references `parent_plan` and the 1→N decomposition.
    - Rationale: the planner's LLM decomposition QUALITY isn't unit-testable, but the
      CONTRACT text must be present — this is the plan's declared way to assert the
      prose (Scope "Out": prompt behavior asserted by prompt text).

#### Coverage Targets
- `listSubplans`, `approveSubplans`, `validateParentPlan`, `planSlugExists`,
  `topoOrderByDependsOn`: every branch (present/absent parent, valid/invalid sibling,
  cycle-fallback, missing-dir) exercised. Line + branch ≥ 80% on the new code.
- Every `throw` path (cases 3, 8) exercised. No test lacks an assertion; teardown
  removes tmp dirs so tests are order-independent.

---

## Acceptance Criteria Mapping

| Criterion (from CAPTURE) | Implemented In | Test Case |
|---|---|---|
| Planner decomposes into N ≥ 2 small cohesive-slice plans, each `parent_plan` + focused `files:`, module+test together, `depends_on`-ordered | `agents/planning/implementation-planner.md` Phase 4b (rewrite) | Case 13 (prose contract) |
| `parent_plan` recognized/validated; dangling parent → warning (not error) | `src/lib/plan-validator.js: validateParentPlan` + wiring into `validateForQueue`/`validateForReview` | Cases 9, 10, 11, 12 |
| Batched Gate 2 approves all siblings implementation→todo in one call, human marker on each, no auto-cross | `src/lib/actions.js: approveSubplans` (loops existing `approvePlan`) | Cases 4, 6, 7, 8 |
| Batched Gate 3 ships all siblings review→done in one call | `src/lib/actions.js: approveSubplans` | Case 5 |
| Sequential, dependency-ordered implementation preserved; a slice whose dependency is unbuilt isn't started | `depends_on` ordering in `approveSubplans` (`topoOrderByDependsOn`) + planner's `depends_on` contract; the existing plan-serial FIFO executor (`startAgent`/`advanceAgent`, unchanged) still builds one at a time | Case 7 (order invariant); `listSubplans` `dependsOn` (Case 2) |
| `listSubplans` returns the parent's set | `src/lib/actions.js: listSubplans` | Cases 1, 2, 3 |

Every acceptance criterion maps to at least one implementation action and one test
case. No gap.

---

## Security Review

| Check | Status |
|---|---|
| Path traversal | `listSubplans`/`planSlugExists` build paths only via `getPlansDir` + `path.join` under the project root; `parent_plan` is used only for a `path.basename` string COMPARE, never joined into a filesystem path (a malicious `parent_plan: ../../etc` cannot escape — it just fails to match any plan slug → dangling warning). SAFE. |
| Input validation | `parentSlug`/`fromStage` type-checked (throw on falsy/wrong); `fromStage` constrained to `implementation`/`review`. SAFE. |
| No secrets | None introduced. SAFE. |
| Safe file operations | Only `approvePlan`→`movePlan` (existing, plans/-scoped) writes; `approveSubplans` adds no new write target. `listSubplans`/`validateParentPlan` are read-only. SAFE. |
| Error messages | Errors surface slug + reason (already public plan data); no stack traces to users. SAFE. |
| Prototype pollution | `parent_plan`/`depends_on` parsed to a plain string array via split/trim; no dynamic object-key assignment from plan content. SAFE. |
| Command injection | No `exec`/`execSync`; pure fs + string ops. SAFE. |
| Gate integrity (CTOC-specific) | `approveSubplans` NEVER writes an approval marker itself — it calls `approvePlan`, which owns `HUMAN_GATES` + `addApprovalMarker`. No new code path can cross a human gate without the human marker. This is the load-bearing safety property; Cases 4–5 assert the marker is present post-cross, Case 4 pre-asserts it is ABSENT before the call. SAFE. |

---

## Risk Mitigations

| Risk | Mitigation | Where |
|---|---|---|
| A new batched-approve path could weaken the human gate | `approveSubplans` does NOT re-implement gate crossing — it loops the existing `approvePlan`; each sibling gets the marker via `addApprovalMarker`. Tests pre-assert no marker before the call, assert marker after. | `actions.js: approveSubplans`; Cases 4, 5, 6 |
| One invalid sibling aborts/rots the whole batch | Per-sibling validate + try/catch; invalid siblings are REPORTED in `skipped` with a reason and left in place, valid ones still cross (async-overnight resilience, no silent skip). | `actions.js: approveSubplans`; Case 6 |
| A dangling `parent_plan` blocks the pipeline | Dangling parent is a WARNING only; `validateParentPlan` never flips `valid` false; wired as warning into the queue/review gates. | `plan-validator.js`; Cases 10, 12 |
| `depends_on` cycle from a mis-authored planner | `topoOrderByDependsOn` falls back to input order on a cycle (no throw); the genuine cycle surfaces later at the serial executor. Planner prompt caps chain depth at 3, no cycles. | `actions.js`; planner Phase 4b |
| Slice too big / module split from its test | Slice-sizing rule + "never split a module from its test" in the planner prompt; ~1–3 files per slice; asserted in the prose contract test. | `implementation-planner.md`; Case 13 |
| `parent_plan` string form drifts from `parent_vision` convention | `validateParentPlan` accepts both bare slug and `stage/slug` forms; `listSubplans` matches on the stored string exactly as `listStubs` matches `parent_vision`. | `plan-validator.js`, `actions.js` |

---

## Iron Loop Execution Checklist (Steps 8–16, canonical labels)

> This is the execution plan for building SIP1 itself (single slice). The
> `iron-loop-integrator` may expand each into sub-items; the labels are MANDATORY and
> in this exact order (validated by `validateStepLabels` / `validate-plan-steps.js`).

## Execution Plan

### Step 8: TEST
- [x] Write `tests/subplan-decomposition.test.js` FIRST (TDD Red) with all 13 cases
      above: `listSubplans` (1–3), `approveSubplans` Gate 2/Gate 3/fail-safe/order/
      bad-stage (4–8), `validateParentPlan` accept/dangling/absent (9–11), gate
      wiring (12), prose contracts (13). Tests fail (functions not yet added).

### Step 9: PREPARE
- [x] Confirm `state.js` exports `readPlans`, `getPlansDir`, `parseMetadata` (they do).
- [x] Confirm `plan-validator.js` exports `validateForQueue`, `validateReviewToDone`
      (they do — lines 875–888).
- [x] No new npm deps; `node:test` + `node --test tests/*.test.js` is the runner.

### Step 10: IMPLEMENT
- [x] `src/lib/plan-validator.js`: add `validateParentPlan` + `planSlugExists`; wire
      into `validateForQueue` and `validateForReview`; export `validateParentPlan`.
- [x] `src/lib/actions.js`: extend the `state`/`plan-validator` destructured imports;
      add `topoOrderByDependsOn`, `listSubplans`, `approveSubplans`; export the two
      public functions.
- [x] `agents/planning/implementation-planner.md`: rewrite Role + add Phase 4b
      (decompose), the slice-sizing rule, naming convention, per-slice frontmatter
      contract, Phase 5 write change, Batched Gates note.
- [x] `docs/IRON_LOOP.md` + `CLAUDE.md`: prose edits (1 functional → N implementation;
      batched gates).

### Step 11: REVIEW
- [x] Self-review: `approveSubplans` composes `approvePlan` (no re-implemented gate);
      `validateParentPlan` warns-only; layering intact (validator ⟂ actions, both →
      state); no orphaned exports.

### Step 12: OPTIMIZE
- [x] `listSubplans` reads each stage dir once; `planSlugExists` uses `readdirSync`
      (names only), not full `readPlans`, to stay cheap. Confirm no redundant reads.

### Step 13: SECURE
- [x] Verify `parent_plan` is never joined into a filesystem path (basename compare
      only); path-traversal-safe; gate integrity property holds (Security Review).

### Step 14: VERIFY
- [x] `node --test tests/*.test.js` — all pass, `# fail 0`, 0 skipped, coverage ≥ 80%
      on the new code. Run `node src/scripts/release.js` if VERSION bumped.

### Step 15: DOCUMENT
- [x] JSDoc on `listSubplans`, `approveSubplans`, `validateParentPlan`,
      `planSlugExists`, `topoOrderByDependsOn`. Confirm IRON_LOOP.md + CLAUDE.md edits
      landed (they are also Step-10 deliverables; here confirm accuracy).

### Step 16: FINAL-REVIEW
- [x] Human reviews at Gate 3. Verify: batched gates preserve the human marker,
      dangling-parent is a warning, planner prompt mandates 1→N decomposition,
      all tests green.

---

## Decisions Taken Under Ambiguity

- **D-VP-1 (validator recognition mechanism):** `plan-validator.js` has no
  unknown-field blocklist today, so "recognize `parent_plan`" is delivered as a
  POSITIVE `validateParentPlan` (accept + dangling-warn) wired into the queue/review
  gates — not by editing a (non-existent) allowed-fields list. Chosen because it is
  the minimal change that satisfies the acceptance scenario ("accepted, not flagged;
  dangling → warn") and matches how `parent_vision` is handled (by convention, not by
  a schema).
- **D-VP-2 (which gates get the dangling-parent warning):** wired into BOTH
  `validateForQueue` (implementation→todo) and `validateForReview` (in-progress→review)
  as a WARNING. Not wired into `validateFunctionalToImpl` — functional plans are the
  PARENTS and legitimately have no `parent_plan`.
- **D-VP-3 (dangling = warning not error):** a `parent_plan` naming no existing plan is
  a WARNING, never an error — filesystem links are eventually consistent and a parent
  may be renamed/archived independently (mirrors `parent_vision`'s soft link). Matches
  the plan's explicit instruction.
- **D-AS-1 (batched-gate stages):** `approveSubplans` accepts only `implementation`
  and `review` as `fromStage` (the two human gates a sibling SET crosses together).
  `functional→implementation` (Gate 1) is per-parent already and produces the slices;
  it is not a sub-plan batch. `fromStage` outside {implementation, review} throws.
- **D-AS-2 (fail-safe = report, don't abort):** an invalid sibling is pushed to
  `skipped` with a reason and the batch CONTINUES; the valid siblings still cross.
  Chosen over abort-on-first-failure so one mis-authored slice can't block a whole
  parent's approval overnight, while the explicit `skipped` list prevents any silent
  loss (no-stub / honesty principles).
- **D-AS-3 (ordering is best-effort):** `topoOrderByDependsOn` falls back to input
  order on a cycle rather than throwing, because gate APPROVAL ordering is a
  convenience; a real dependency cycle is caught by the serial executor at build time.
- **D-SLICE-1 (SIP1 is not self-decomposed):** SIP1 predates the decompose feature and
  is small (2 code files + 1 test + prose = one clean pass), so this blueprint is a
  single-slice implementation plan, NOT a set of `parent_plan`-linked sub-plans. The
  feature applies to FUTURE functional plans processed by the rewritten planner.

### Decisions taken during execution (Steps 8–16, 2026-07-08)

- **D-EXEC-1 (test granularity — 13 scenarios expressed as 16 `it()` blocks):** the
  plan's 13 named cases are all present; three were split into their own `it()` for
  clean isolation — the case-13 prose contract became three separate assertions
  (`implementation-planner.md`, `IRON_LOOP.md`, `CLAUDE.md`), and an extra
  `approveSubplans` missing-`parentSlug` guard test was added alongside the bad-stage
  throw. Net: 16 test cases, all green, every required scenario covered plus two
  defensive extras.
- **D-EXEC-2 (`mergeParentPlanWarnings` private helper):** to wire the warning-only
  `validateParentPlan` into BOTH `validateForQueue` and `validateForReview` without
  duplicating the "push warnings, never errors, never flip valid" logic, a small
  private `mergeParentPlanWarnings(result, content, projectPath)` was added. It copies
  ONLY `warnings` (plus a `checklist.parentPlan` entry) — it structurally cannot flip
  a gate to invalid. This keeps the soft-link guarantee (D-VP-3) in one place.
- **D-EXEC-3 (`validateForQueue` now resolves `projectPath`):** `validateForQueue`
  previously ignored its `projectPath` arg; it now defaults it via `findProjectRoot()`
  (matching `validateForReview`) so the parent-plan scan has a root. No behavior change
  for existing callers (the actions.js gate path always passes an explicit root).
- **D-EXEC-4 (`parseDependsOn` local to actions.js):** `depends_on` parsing (comma
  split, `none`/absent → `[]`) lives as a private helper in actions.js, consumed by
  both `listSubplans` (to populate `dependsOn`) and `topoOrderByDependsOn`. Pure string
  ops, no regex on plan input (prototype-pollution-safe).
- **D-EXEC-5 (prose phrasing pinned to the contract test):** the "never split a module
  from its test" sentence is kept on a single line in `implementation-planner.md` so
  the prose-contract regex matches without being weakened — the assertion stays strict.

### Verification results (2026-07-08)

- RED→GREEN: new suite 16 tests → RED 0 pass / 16 fail (missing exports) → GREEN 16
  pass / 0 fail / 0 skipped.
- No-auto-cross proof: a `parent_plan` sub-plan with NO `approveSubplans` call stays in
  `implementation/` carrying no `approved_by: human`; the call crosses it to `todo/`
  and stamps `approved_by: human` (via the existing gate-safe `approvePlan` — no new
  cross path).
- Full suite: `node --test tests/*.test.js` → 2992 tests, 2992 pass, 0 fail, 0 skipped,
  0 todo (existing actions/validator/gate suites green — `approvePlan` unchanged).
- `npx eslint . --max-warnings 0` → exit 0. `npx tsc --noEmit` baseline-neutral (0 new
  error types on `actions.js`/`plan-validator.js`; same 4 pre-existing categories before
  and after). `readme-numbers.test.js` → 47/47 (no top-level lib module added).
- `parent_plan` validation confirmed warning-only: dangling parent never flips `valid`,
  never adds an error, at both the queue and review gates.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (`tests/subplan-decomposition.test.js`, 16 cases)
- [x] Test error conditions (missing parentSlug, bad fromStage, invalid sibling, dangling parent)
- [x] Run tests - expect RED (failing) — RED confirmed: 0 pass / 16 fail (missing exports)

### Step 9: PREPARE
- [x] Install dependencies if needed (none — node:test built-in)
- [x] Check prerequisites (state.js exports readPlans/getPlansDir/parseMetadata; plan-validator exports validateForQueue/validateReviewToDone)
- [x] Verify dev environment ready
- [x] Create directories/config if needed (tmp fixtures created per-test)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (validateParentPlan + planSlugExists + wiring; listSubplans + approveSubplans + topoOrderByDependsOn; planner rewrite; IRON_LOOP + CLAUDE docs)
- [x] Add error handling (throw on missing parentSlug / bad fromStage; per-sibling try/catch → skipped)
- [x] Wire up integration points (validateForQueue + validateForReview merge parent-plan warnings; approveSubplans loops approvePlan)

### Step 11: REVIEW
- [x] Self-review all new code (approveSubplans composes approvePlan — no re-implemented gate; validateParentPlan warns-only; validator ⟂ actions layering intact)
- [x] Verify integration points work together (gate-wiring test green)
- [x] Check error handling completeness (fail-safe reports-not-aborts test green)

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths (planSlugExists uses readdirSync — names only, not full readPlans)
- [x] Simplify complex code (single topo pass; parseDependsOn shared)

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — parent_plan basename-compared only, never joined into a path
- [x] Sanitize outputs (skipped reasons are plan-public data)
- [x] No secrets in code
- [x] Safe file operations (only approvePlan→movePlan writes; listSubplans/validateParentPlan read-only)

### Step 14: VERIFY
- [x] Run lint + type check — eslint exit 0; tsc baseline-neutral (0 new error types)
- [x] Run ALL tests (TDD Green) — 2992 pass / 0 fail; new suite 16/16
- [x] Check coverage >= 80% (every branch of the 5 new functions exercised)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation (IRON_LOOP.md 1→N + batched gates; CLAUDE.md terse note; implementation-planner.md Phase 4b)
- [x] Add JSDoc comments to new functions (listSubplans, approveSubplans, topoOrderByDependsOn, parseDependsOn, validateParentPlan, planSlugExists, mergeParentPlanWarnings)
- [x] Update CHANGELOG if needed (n/a — version bump handled at release)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed (no-auto-cross proof executed)
- [x] Ready for human review (Gate 2/Gate 3 — HUMAN GATE, not crossed by executor)
