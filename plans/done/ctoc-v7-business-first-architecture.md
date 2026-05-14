---
title: "CTOC v7 — Business-First Architecture (Vision A)"
created: "2026-05-14T00:00:00Z"
priority: HIGH
type: vision
status: draft
program: ctoc-v7
order: 1
siblings:
  - ctoc-v7-mandatory-pipeline-enforcement
  - ctoc-v7-opus-47-modernization
approved_by: human
approved_at: 2026-05-14T00:00:00Z
gate_crossed: vision → done (decomposed)
dogfood_retro: true
status: decomposed
---

# CTOC v7 — Business-First Architecture (Vision A)

## The Load-Bearing Principle

**The pipeline IS the context. Everything before `todo` is context-building.**

| Section | Stage | Purpose |
|---|---|---|
| **Business** | Vision · Canvas · Functional | WHY + business model + product context |
| **Implementation** | Implementation · Todo | TECHNICAL context + ready-to-execute queue |
| **Execution** | In-Progress · Review · Done | Doing the work · verifying · shipped |

By the time work reaches `todo`, every contextual decision is locked. The implementer never guesses. If it would have to guess, it makes a **documented reasonable choice** (the no-stub rule), ships working code, and the morning review either approves the choice or kicks the plan back to implementation with a correction.

## Problem Statement

1. The current dashboard exposes 7 stages as a flat list. It doesn't reflect the **intent shift** between context-building, queueing, and execution. Users (and Claude) can't see at a glance which phase they're in.
2. There's no business-model layer between Vision (3–5 year direction) and Functional (features). Strategic context — *does this make money, who pays, what's the unfair advantage* — gets either skipped or buried inside the vision file. Cost: features ship that don't pass a "would this make money" check.
3. The functional plan currently jumps straight from "this is the direction" to "here are user stories." No bridge for business-model thinking.

## Vision

A CTOC dashboard organized into **three intent-aligned sections** that mirror how serious work actually flows: **Business** (the WHY and the WHO), **Implementation** (the HOW), **Execution** (the DOING).

Between Vision and Functional, an **optional Canvas layer** offers two interchangeable templates:

- **Lean Canvas** (Ash Maurya) — default; problem-first, startup-friendly, 9 blocks with Problem · Solution · Key Metrics · Unfair Advantage replacing BMC's relationship/infrastructure blocks
- **Business Model Canvas** (Osterwalder) — alternative for established orgs; classic 9 blocks with Key Partners · Activities · Resources · Customer Relationships

Both render as the same 9-block YAML+markdown shape, so the **vision-decomposer** reads either interchangeably. Users can skip the canvas entirely and go Vision → Functional — but the canvas exists for when the business viability question matters.

## Success Criteria

1. Dashboard renders 3 top-level sections: Business, Implementation, Execution — each collapsible, each showing per-stage counts
2. New `plans/canvas/` stage exists with Lean Canvas and BMC templates
3. Canvas is **optional** — vision-decomposer accepts a vision with or without a canvas
4. Existing 7-stage flow continues to work without breaking — pre-v7 plans flow through unmodified
5. The "pre-todo is context" principle is documented in CLAUDE.md and visible in agent prompts
6. Users can choose canvas type at canvas creation (Lean / BMC), no forced choice
7. Section names and stage groupings match the table above

## Target Users

- **CTOC Chiefs** (primary) — solo founders, technical leads, ICs who command virtual CTOs and need the WHY/HOW/DOING split to be visible at a glance
- **Teams using CTOC on existing products** — for whom the canvas is mostly skippable; they care about the 3-section UX and stage navigation
- **Agents in the Iron Loop** — read the structure to know which phase they're operating in

## Scope

**In scope:**
- Add `plans/canvas/` directory + Lean Canvas + BMC templates
- New stage navigation (3 sections) in the dashboard
- Update `src/commands/menu.js` and `src/tabs/overview.js` to render the new layout
- Update `src/lib/state.js` and plan-state machine to recognize the canvas stage
- Update vision-decomposer to accept optional canvas input
- Update CLAUDE.md to articulate the pre-todo-is-context principle
- Migration: existing pre-v7 plans surface in the right new section automatically (Vision/Functional → Business; Implementation/Todo → Implementation; In-Progress/Review/Done → Execution)

**Out of scope** (handled by sibling visions):
- Mandatory CTOC enforcement when in a CTOC project → [Vision C — mandatory-pipeline-enforcement]
- Agent and skill modernization for Opus 4.7 → [Vision B — opus-47-modernization]
- Wardley Maps support — too freeform for a 9-block template; not in v7
- Changes to the 16-step Iron Loop labels — unchanged

## Key Decisions Already Made

- **Lean Canvas is default, BMC is alternative** — both are 9-block, both auto-readable by the decomposer
- **Canvas is optional** — skipping is the fast path; canvas is for serious business-viability questions
- **3 sections, not 4 or 5** — Business / Implementation / Execution maps cleanly to WHY / WHAT / DOING
- **No new gate** — canvas → functional is not a 4th human gate; current 3 gates remain

## Risks

| Risk | Mitigation |
|---|---|
| Users get confused by yet another stage | Canvas is OPTIONAL and clearly labeled as such; skip path is one click |
| Pre-v7 plans look broken in the new layout | Migration: auto-group by current stage; no plan content changes |
| Two canvas types confuse users | Lean Canvas is default; BMC offered explicitly with one-line use-case hint |
| 3 sections obscure individual stages | Each section is collapsible and expands by default; counts visible at section header |

## Open Questions (To Resolve During Functional Planning)

- Does canvas live in its own directory `plans/canvas/` or as a sub-stage of vision (`plans/vision/canvas/`)?
- Should `claude:create-plan` from the dashboard prompt for canvas creation when no canvas exists for the vision?
- Section-collapse state — per-user preference, or always-expanded?
- Does the vision-decomposer treat canvas data as authoritative over the vision file when they conflict?

## Dependencies

- This vision MUST land before [Vision C — mandatory-pipeline-enforcement] (C enforces the new structure)
- This vision MUST land before [Vision B — opus-47-modernization] (B updates agents to know the new structure)
- No external dependencies; pure refactor + addition
