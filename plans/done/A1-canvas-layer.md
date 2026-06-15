---
title: "A1 — Canvas Layer (Lean Canvas + BMC)"
created: "2026-05-14T00:00:00Z"
approved_by: human
approved_at: "2026-06-15T00:00:00Z"
gate_crossed: "functional → done (shipped in v6.2.0; archived 2026-06-15)"
priority: HIGH
type: feature
parent_vision: ctoc-v7-business-first-architecture
program: ctoc-v7
order: 1
---

# Functional Plan: A1 — Canvas Layer (Lean Canvas + BMC)

> Created: 2026-05-14
> Status: Draft
> Author: vision-decomposer + product-owner (dogfood)

---

## 1. ASSESS — Problem Understanding

### Business Context
Strategic context — *does this make money, who pays, what's the unfair advantage* — currently gets skipped or buried inside vision files. The pipeline jumps from "3–5 year direction" (vision) to "user stories" (functional) with no business-model bridge. Result: features ship without passing a basic business-viability check.

### Current State
- `plans/vision/` holds long-form direction documents
- `plans/functional/` holds user-stories-and-requirements documents
- Nothing in between
- vision-decomposer reads only the vision file when generating stubs

### Impact
- **Primary**: CTOC Chiefs evaluating new initiatives lack a fast-iteration canvas to test business viability before committing engineering effort
- **Secondary**: vision-decomposer can't differentiate "this validates as a business" from "this is a feature idea with no clear customer or revenue logic"
- **Tertiary**: established teams using CTOC for known products don't need this — must be **optional**

---

## 2. ALIGN — Business Alignment

### Business Goals
1. Add a strategic business-model layer between Vision and Functional that fast-tests viability
2. Keep it optional — pre-v7 flow (Vision → Functional direct) remains supported
3. Two canvas types covering both startup and established-business cases, interchangeable from the decomposer's perspective

### Success Metrics
- [ ] **M1**: Users can create a canvas from the dashboard in ≤2 clicks (one to enter canvas stage, one to pick template)
- [ ] **M2**: vision-decomposer produces stubs that reference canvas blocks (problem, customer segment, value prop) when a canvas exists
- [ ] **M3**: Skipping canvas works — `Vision → Functional` flow unchanged for users who don't want it
- [ ] **M4**: Both canvas types render correctly with all 9 blocks visible

### Stakeholders
| Stakeholder | Role | Approval Needed |
|---|---|---|
| CTOC Chief (user) | Primary user of canvas | Yes (Gate 1) |
| vision-decomposer agent | Consumer of canvas data | No — programmatic |
| Existing CTOC users (pre-v7) | Backward-compat constraint | Implicit via no regression |

### Constraints
- Cross-platform (Windows / macOS / Linux), Node.js only
- No new external dependencies (no canvas-renderer library — markdown + YAML)
- Canvas templates must be readable by humans AND by the vision-decomposer
- Must not introduce a 4th human gate

---

## 3. CAPTURE — Requirements

### Functional Requirements
| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-1 | Lean Canvas template | Must | `.ctoc/templates/lean-canvas.md.template` exists with 9 blocks: Problem, Customer Segments, UVP, Solution, Channels, Revenue Streams, Cost Structure, Key Metrics, Unfair Advantage |
| FR-2 | BMC template | Must | `.ctoc/templates/business-model-canvas.md.template` exists with 9 blocks: Key Partners, Key Activities, Key Resources, Value Propositions, Customer Relationships, Channels, Customer Segments, Cost Structure, Revenue Streams |
| FR-3 | `plans/canvas/` stage directory | Must | Directory created during init; recognized by plan-state machine |
| FR-4 | Canvas creation from menu | Must | `claude:create-canvas {vision-slug}` action; user picks Lean or BMC; file written to `plans/canvas/` with parent_vision frontmatter |
| FR-5 | vision-decomposer reads canvas | Must | When canvas exists for vision, decomposer reads both; stubs reference canvas blocks where applicable |
| FR-6 | Canvas is optional | Must | Vision can move through pipeline without a canvas; decomposer falls back to vision-only behavior |
| FR-7 | Plan-state machine recognizes canvas | Must | `src/lib/state.js` includes `canvas` as a valid stage; transitions: vision → canvas (optional) → functional |
| FR-8 | Dashboard shows canvas count | Should | Business section displays "Canvas (N)" between Vision and Functional |

### Non-Functional Requirements
| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Performance | Canvas creation completes in <500ms (just file write) |
| NFR-2 | Cross-platform | Tests pass on Darwin, Linux, Windows runners |
| NFR-3 | Backward compatibility | Pre-v7 visions process correctly with canvas skipped |
| NFR-4 | Test coverage | ≥80% on new code |

### User Stories
```
As a CTOC Chief evaluating a new product idea
I want to fill in a Lean Canvas after writing the vision
So that I validate problem-solution fit and revenue logic before committing to features

As a CTOC Chief working on an established product
I want to skip the canvas stage entirely
So that I'm not forced through ceremony that doesn't apply to my work

As the vision-decomposer agent
I want to read both vision and canvas (when present)
So that my functional stubs reflect customer segments and value props, not just the vision narrative
```

### Out of Scope
- Wardley Maps support (vision-level decision: too freeform for 9-block templating)
- Visual rendering of canvas as a 9-block grid (markdown is sufficient)
- Auto-generating canvas from vision (canvas is intentionally a separate authoring step)
- A 4th human gate (canvas → functional is NOT gated)
- Canvas editing UI (vim/IDE is the editor)

---

## Approval Checklist

- [ ] Business problem clearly defined
- [ ] Success metrics are measurable
- [ ] Requirements are complete and prioritized
- [ ] Stakeholders identified
- [ ] Constraints documented
- [ ] Scope boundaries clear

---

## Approval

**Status**: Pending Approval (Gate 1: functional → implementation)

---

*Iron Loop Steps 2-3-4: ASSESS, ALIGN, CAPTURE complete.*
