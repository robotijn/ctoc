---
title: "A1 — Canvas Layer (Lean + BMC) — Implementation"
created: "2026-05-14T00:00:00Z"
priority: HIGH
type: feature
parent_functional: A1-canvas-layer
program: ctoc-v7
order: 1
files:
  - .ctoc/templates/lean-canvas.md.template
  - .ctoc/templates/business-model-canvas.md.template
  - plans/canvas/.gitkeep
  - src/lib/state.js
  - src/lib/menu-screens.js
  - src/lib/actions.js
  - src/commands/menu.js
  - src/lib/vision-decomposer.js
  - agents/planning/vision-decomposer.md
  - tests/canvas-stage.test.js
approved_by: human
approved_at: 2026-05-14T00:00:00Z
gate_crossed: implementation → todo
dogfood_retro: true
---

# Implementation Plan: A1 — Canvas Layer

> Created: 2026-05-14
> Status: Draft
> Author: implementation-planner (dogfood)
> Based on: A1-canvas-layer.md

---

## 4. PLAN — Technical Approach

### Solution Overview
Add `canvas` as a new optional plan stage living between vision and functional. Two markdown templates (Lean Canvas + BMC) using identical YAML frontmatter + 9 H2 blocks. The vision-decomposer is extended to optionally read a sibling canvas file by slug match. Dashboard surfaces canvas count in the Business section (rendered by A2/A3).

### Technology Choices
| Component | Technology | Rationale |
|---|---|---|
| Canvas file format | Markdown + YAML frontmatter | Same as other plans; readable by humans and decomposer; no new dependency |
| Stage recognition | Plan-state machine in `src/lib/state.js` | Existing pattern; canvas joins the stage list |
| Template injection | `.ctoc/templates/` | Same as other stage templates |
| Canvas creation | New `createCanvas(visionSlug, type)` in `src/lib/actions.js` | Mirrors `createPlan()` pattern |

### Architecture Decision Records

#### ADR-1: Single `plans/canvas/` directory (not nested under vision)
- **Context**: Canvas relates to one vision but is a sibling stage
- **Decision**: Top-level `plans/canvas/` with `parent_vision` frontmatter linking back, mirroring how `functional` plans use `parent_vision`
- **Consequences**: + Consistent with existing pattern. + Easy to list "all canvases" regardless of parent. − Slight indirection when locating canvas-for-vision-X (one-step frontmatter lookup, not directory traversal)

#### ADR-2: Two interchangeable templates, NOT a generic canvas
- **Context**: Lean Canvas and BMC have different block names (Problem vs. Key Partners, etc.)
- **Decision**: Two distinct templates with `canvas_type: lean|bmc` frontmatter; user picks at creation time
- **Consequences**: + Each canvas type is authentic. + Decomposer can branch on type. − Maintaining two templates (acceptable cost)

#### ADR-3: Canvas is OPTIONAL — no gate added
- **Context**: Adding gates increases ceremony; user explicitly said canvas is optional
- **Decision**: No human gate between vision and canvas; no gate between canvas and functional. Existing 3 gates unchanged
- **Consequences**: + No new approval friction. + Skip path is one step (just don't create canvas). − No mechanism to enforce canvas creation (intentional — it's optional)

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| vision-decomposer breaks when canvas is absent | Medium | High | Decomposer reads canvas optionally; falls back to vision-only path if file absent. Test both paths |
| Canvas type detection wrong (Lean vs BMC) | Low | Medium | Type stored in frontmatter `canvas_type:`; decomposer reads frontmatter, not file shape |
| `plans/canvas/` directory not present in older clones | Medium | Low | `.gitkeep` ensures directory exists; init script creates it |
| Frontmatter shape diverges from other stage plans | Low | Medium | Reuse standard frontmatter fields (title, created, priority, type, parent_vision) |

---

## 5. DESIGN — Architecture

### System Architecture

```
plans/vision/{slug}.md
        │
        │ optional canvas authored
        ▼
plans/canvas/{slug}.md  (canvas_type: lean | bmc)
        │
        │ vision-decomposer reads vision + canvas
        ▼
plans/functional/{stub-N}.md  (references both vision and canvas in frontmatter)
```

### Data Model

**Canvas file frontmatter:**
```yaml
title: "Canvas: <name>"
created: "<iso8601>"
type: canvas
canvas_type: lean | bmc
parent_vision: <vision-slug>
```

**Lean Canvas 9 blocks (H2 headings):**
Problem · Customer Segments · Unique Value Proposition · Solution · Channels · Revenue Streams · Cost Structure · Key Metrics · Unfair Advantage

**BMC 9 blocks (H2 headings):**
Key Partners · Key Activities · Key Resources · Value Propositions · Customer Relationships · Channels · Customer Segments · Cost Structure · Revenue Streams

### API Design

| Function | Module | Purpose |
|---|---|---|
| `createCanvas(visionSlug, canvasType)` | `src/lib/actions.js` | Writes canvas file from template; returns path |
| `getCanvasForVision(visionSlug)` | `src/lib/state.js` | Returns canvas file path or null |
| `parseCanvas(path)` | `src/lib/vision-decomposer.js` | Reads canvas; returns `{type, blocks: {...}}` |
| `decomposeVision(visionPath)` | `src/lib/vision-decomposer.js` (extended) | Reads vision + optional canvas; extracts canvas-aware stubs |

### Security Design
- Canvas files are plain markdown; no executable content
- Path traversal: `parent_vision` slug validated against `/^[a-z0-9-]+$/` before file lookup
- No code execution from canvas contents (parser is YAML+markdown reader, no eval)

---

## 6. SPEC — Technical Specification

### File Changes

| File | Action | Description |
|---|---|---|
| `.ctoc/templates/lean-canvas.md.template` | Create | 9-block Lean Canvas template with frontmatter |
| `.ctoc/templates/business-model-canvas.md.template` | Create | 9-block BMC template with frontmatter |
| `plans/canvas/.gitkeep` | Create | Ensures directory exists in fresh clones |
| `src/lib/state.js` | Modify | Add `canvas` to STAGES array; add `getCanvasForVision()`, `getStageOf(path)` returns 'canvas' for `plans/canvas/` |
| `src/lib/menu-screens.js` | Modify | Add `browse canvas` route; canvas stage listed in dashboard table |
| `src/lib/actions.js` | Modify | Add `createCanvas(visionSlug, canvasType)`; renders template, writes file, returns ref |
| `src/commands/menu.js` | Modify | Recognize `create-canvas` action; pass through to actions.createCanvas |
| `src/lib/vision-decomposer.js` | Modify | `decomposeVision()` optionally reads canvas via `getCanvasForVision()`; `parseCanvas()` returns blocks |
| `agents/planning/vision-decomposer.md` | Modify | Update agent prompt: "If canvas exists for this vision, read it first; use Problem/Customer Segments/UVP blocks to inform stub generation" |
| `tests/canvas-stage.test.js` | Create | Tests: template renders, createCanvas writes file, getCanvasForVision finds it, decomposer reads both, skip-canvas path works |

### Implementation Steps

1. [ ] Create both canvas templates with 9 blocks + frontmatter
2. [ ] Add `plans/canvas/.gitkeep`
3. [ ] Extend `src/lib/state.js`: STAGES array, helpers, stage detection for `plans/canvas/`
4. [ ] Add `createCanvas()` to `src/lib/actions.js`
5. [ ] Extend `src/lib/menu-screens.js` browse and dashboard routes
6. [ ] Extend `src/lib/vision-decomposer.js` with optional canvas read
7. [ ] Update vision-decomposer agent prompt
8. [ ] Add `claude:create-canvas` action wiring in `src/commands/menu.js`
9. [ ] Write `tests/canvas-stage.test.js` covering all paths
10. [ ] Run full test suite; verify no regressions

### Test Plan

| Test Type | Coverage | Files |
|---|---|---|
| Unit | createCanvas, parseCanvas, getCanvasForVision | tests/canvas-stage.test.js |
| Integration | decomposeVision reads vision+canvas; decomposeVision falls back to vision-only | tests/canvas-stage.test.js |
| Regression | All existing 40 tests still pass | tests/*.test.js |

### Dependencies
- No external dependencies
- No new npm packages
- Cross-platform compatible (uses `path.join`, `fs.promises`)

### Rollback Plan
- Revert commits affecting state.js, menu-screens.js, actions.js, vision-decomposer.js, vision-decomposer.md
- Delete `.ctoc/templates/lean-canvas.md.template`, `business-model-canvas.md.template`, `plans/canvas/`, `tests/canvas-stage.test.js`
- Existing plans unaffected (no canvas files created yet means no migration needed)

---

## Implementation Checklist

- [x] Architecture documented
- [x] Data model designed
- [x] API contracts defined
- [x] Security considerations addressed
- [x] Test plan complete
- [x] Rollback strategy defined
- [x] Dependencies identified

---

## Approval

**Status**: Pending Approval (Gate 2: implementation → todo)

---

*Iron Loop Steps 5-6-7: PLAN, DESIGN, SPEC complete.*


---

## Execution Plan (Steps 8-16) — A1 STATUS

### Step 8: TEST ✓ COMPLETE
- [x] tests/canvas-stage.test.js — 22 tests written

### Step 9: PREPARE ✓ COMPLETE
- [x] No new dependencies needed; cross-platform fs.promises + path.join

### Step 10: IMPLEMENT ✓ COMPLETE
- [x] Templates: lean-canvas.md.template, business-model-canvas.md.template
- [x] plans/canvas/.gitkeep
- [x] actions.js: createCanvas (with I1 vision-exists warning, I2 overwrite protection)
- [x] vision-decomposer.js: getCanvasForVision, parseCanvas (with I3 edge-case handling)
- [x] state.js: canvas in getPlanCounts
- [x] menu-screens.js: canvas in STAGE_FOLDERS + dashboard row
- [x] agents/planning/vision-decomposer.md: Phase 0 (canvas context)

### Step 11: REVIEW ✓ COMPLETE
- [x] Self-review pass; ADRs verified; no-stub rule honored

### Step 12: OPTIMIZE ✓ N/A (no regressions; new feature)

### Step 13: SECURE ✓ COMPLETE
- [x] Path traversal: slug regex /^[a-z0-9][a-z0-9-]*$/
- [x] No code execution from canvas content (markdown parser only)

### Step 14: VERIFY ✓ COMPLETE
- [x] node --test tests/*.test.js → `# fail 0` (765 → 793 tests, all pass)

### Step 15: DOCUMENT ✓ COMPLETE
- [x] vision-decomposer agent prompt updated with Phase 0

### Step 16: FINAL-REVIEW — Gate 3 pending
- [ ] User approves at Gate 3 (review → done)

## Decisions Taken Under Ambiguity
1. **Display name format**: vision slug 'my-x' → 'My X' (title-cased). Chosen because it reads naturally as a canvas title. No user input lost.
2. **Canvas row placement in dashboard**: between Vision and Functional (single row addition). Chosen because A2/A3 will restructure the full dashboard later; this keeps A1 minimally invasive.
3. **Slug regex stricter than spec**: /^[a-z0-9][a-z0-9-]*$/ instead of /^[a-z0-9-]+$/. Chosen to prevent leading-hyphen slugs which look like CLI flags.
