---
approved_by: human
approved_at: 2026-06-15T09:45:22.721Z
gate_crossed: review → done
---

---
title: "A2 — 3-Section Dashboard + Migration + Principle Docs — Implementation"
created: "2026-05-14T00:00:00Z"
priority: HIGH
type: feature
parent_functional: A2-three-section-dashboard
program: ctoc-v7
order: 2
depends_on:
  - A1-canvas-layer-impl
files:
  - src/commands/menu.js
  - src/tabs/overview.js
  - src/lib/menu-screens.js
  - src/lib/state.js
  - src/lib/sections.js
  - CLAUDE.md
  - docs/IRON_LOOP.md
  - .ctoc/state/dashboard-prefs.json
  - tests/sections.test.js
approved_by: human
approved_at: 2026-05-14T00:00:00Z
gate_crossed: implementation → todo
dogfood_retro: true
---

# Implementation Plan: A2 — 3-Section Dashboard

> Created: 2026-05-14
> Status: Draft
> Author: implementation-planner (dogfood)
> Based on: A2-three-section-dashboard.md
> Note: This plan ships the section concept and migration. A3 layers the 5-area menu on top of this foundation.

---

## 4. PLAN — Technical Approach

### Solution Overview
Introduce a **section abstraction** in `src/lib/sections.js` that groups existing stages into 3 task-aligned buckets (Business, Implementation, Execution). Update menu-screens.js dashboard rendering to display sections with collapsible per-stage counts. Persist collapse state in `.ctoc/state/dashboard-prefs.json`. Update CLAUDE.md and IRON_LOOP.md with the "pre-todo is context-building" principle.

### Technology Choices
| Component | Technology | Rationale |
|---|---|---|
| Section grouping | Pure JS module `src/lib/sections.js` | No new dependency; thin abstraction over existing STAGES |
| Collapse persistence | JSON file in `.ctoc/state/` | Matches existing state-file pattern |
| Doc updates | Markdown edits | Simple, version-controlled |

### Architecture Decision Records

#### ADR-1: Sections as a separate concept from stages
- **Context**: Need to group stages without changing them
- **Decision**: New `src/lib/sections.js` module exports `SECTIONS`, `getSectionForStage(stage)`, `getStagesInSection(section)`. Stages remain canonical
- **Consequences**: + Stages and sections decoupled. + Easy to change groupings later. − Indirection cost (negligible)

#### ADR-2: Collapse state session-only (per-process)
- **Context**: Per-functional-plan said session-only is enough
- **Decision**: Persist in `.ctoc/state/dashboard-prefs.json`, read on dashboard load, write on collapse-toggle
- **Consequences**: + Survives in-session refreshes. + No cross-machine sync complexity. − User must re-set after machine change (acceptable)

#### ADR-3: CLAUDE.md principle section placement
- **Context**: Where to put "pre-todo is context" principle
- **Decision**: New top-level section "Pipeline Philosophy" before "Critical Rules"
- **Consequences**: + High visibility. − Pushes existing top-of-file content down (acceptable)

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Section grouping breaks existing tab navigation | Medium | High | Sections and tabs co-exist initially; A3 replaces tabs with areas later |
| `dashboard-prefs.json` corruption breaks dashboard | Low | Medium | Try/catch on read; missing/corrupt file falls back to all-expanded |
| Pre-v7 plans don't surface in new sections | Medium | High | Section grouping is path-based (`plans/<stage>/...`), works on any conforming plan file |
| CLAUDE.md edits break existing references | Medium | Medium | Add new section; don't delete or rename existing ones |

---

## 5. DESIGN — Architecture

### System Architecture

```
┌──────────────────────┐
│  STAGES (canonical)  │  ['vision','canvas','functional','implementation','todo','in-progress','review','done']
└──────────┬───────────┘
           │
           │ getSectionForStage()
           ▼
┌──────────────────────┐
│  SECTIONS (grouping) │  Business | Implementation | Execution
└──────────┬───────────┘
           │
           │ render()
           ▼
   Dashboard output (TUI + JSON)
```

### Data Model

**`src/lib/sections.js`:**
```js
const SECTIONS = {
  business: ['vision', 'canvas', 'functional'],
  implementation: ['implementation', 'todo'],
  execution: ['in-progress', 'review', 'done']
};

function getSectionForStage(stage) { /* returns 'business'|'implementation'|'execution' */ }
function getStagesInSection(section) { /* returns array of stage names */ }
function getSectionLabel(section) { /* returns 'Business'|'Implementation'|'Execution' */ }
```

**`.ctoc/state/dashboard-prefs.json`:**
```json
{
  "collapsed": { "business": false, "implementation": false, "execution": false },
  "lastModified": "<iso8601>"
}
```

### API Design

| Function | Module | Purpose |
|---|---|---|
| `getSectionForStage(stage)` | `src/lib/sections.js` | Stage → Section mapping |
| `getStagesInSection(section)` | `src/lib/sections.js` | Section → Stages list |
| `loadDashboardPrefs()` | `src/lib/menu-screens.js` | Read collapse state |
| `saveDashboardPrefs(prefs)` | `src/lib/menu-screens.js` | Persist collapse state |
| `renderSectionedDashboard(prefs)` | `src/lib/menu-screens.js` | Build dashboard text with sections |

### Security Design
- `dashboard-prefs.json` reads/writes only collapse booleans; no code execution path
- File path resolved via `path.join(projectRoot, '.ctoc', 'state', 'dashboard-prefs.json')`

---

## 6. SPEC — Technical Specification

### File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/sections.js` | Create | New module exporting SECTIONS, getSectionForStage, getStagesInSection, getSectionLabel |
| `src/lib/menu-screens.js` | Modify | Rewrite `dashboard()` to render 3 sections; add `loadDashboardPrefs()`, `saveDashboardPrefs()`; new action `toggle-section {section}` |
| `src/tabs/overview.js` | Modify | Render sectioned view in TUI overview tab |
| `src/commands/menu.js` | Modify | Handle `toggle-section` action |
| `src/lib/state.js` | Modify | Already extended for canvas in A1; no further changes required |
| `CLAUDE.md` | Modify | Add new top-level section "Pipeline Philosophy: Context Building vs. Execution" before "Critical Rules". Document all 4 load-bearing principles now (per X2 decision): (1) pre-todo is context-building, (2) no-stub rule, (3) async overnight (documented choices + kickback), (4) literal interpretation. Principles 2–4 are statements of intent here; their enforcement lands with B1 |
| `docs/IRON_LOOP.md` | Modify | Step descriptions reference section assignment (e.g., "Step 1 IDEATE — Business section") |
| `.ctoc/state/dashboard-prefs.json` | Create on first toggle | Auto-created when user first collapses a section |
| `tests/sections.test.js` | Create | Tests for SECTIONS, getSectionForStage, getStagesInSection, dashboard renders 3 sections, collapse persists |

### Implementation Steps

1. [ ] Create `src/lib/sections.js` with SECTIONS map + helpers
2. [ ] Write `tests/sections.test.js` covering mapping and helpers
3. [ ] Refactor `src/lib/menu-screens.js` dashboard() to use sections + collapse prefs
4. [ ] Update `src/tabs/overview.js` to render sectioned view in TUI
5. [ ] Add `toggle-section` action wiring in `src/commands/menu.js`
6. [ ] Test: 12 existing plans surface in correct sections
7. [ ] Update CLAUDE.md with "Pipeline Philosophy" section (pre-todo is context principle)
8. [ ] Update docs/IRON_LOOP.md to reference section assignments
9. [ ] Run full test suite; verify no regressions

### Test Plan

| Test Type | Coverage | Files |
|---|---|---|
| Unit | getSectionForStage, getStagesInSection, prefs load/save | tests/sections.test.js |
| Integration | Dashboard renders sections with correct counts; collapse persists across renders | tests/sections.test.js |
| Migration | 12 existing plans surface in correct sections (snapshot test) | tests/sections.test.js |
| Regression | All 40 existing tests pass | tests/*.test.js |

### Dependencies
- A1-canvas-layer-impl must land first (sections.js references `canvas` stage in `business` group)
- No external dependencies

### Rollback Plan
- Revert commits affecting menu-screens.js, overview.js, sections.js, dashboard-prefs.json
- Delete `src/lib/sections.js` and `tests/sections.test.js`
- CLAUDE.md and IRON_LOOP.md edits are additive; can be reverted via git
- Existing dashboard rendering falls back to flat 7-stage layout

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

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write failing tests covering all FRs and ADRs from this plan

### Step 9: PREPARE
- [ ] **Pre-flight (K3):** Implementer simulates the plan and confirms every file touched is in the `files:` declaration. Adds any missing files before starting.
- [ ] Install dependencies if needed; verify dev environment

### Step 10: IMPLEMENT
- [ ] Implement to make tests pass. Make documented choices under ambiguity (no-stub rule). Log decisions to `# Decisions Taken Under Ambiguity`

### Step 11: REVIEW
- [ ] Self-review against this plan's FRs and ADRs

### Step 12: OPTIMIZE
- [ ] Performance pass (only if regressions vs baseline)

### Step 13: SECURE
- [ ] Security audit: input validation, path traversal, code injection paths

### Step 14: VERIFY
- [ ] Run `node --test tests/*.test.js` — must show `# fail 0`
- [ ] Coverage ≥ 80% on new code

### Step 15: DOCUMENT
- [ ] Update CLAUDE.md, README, IRON_LOOP.md as needed
- [ ] Update agent prompts if behavior changes

### Step 16: FINAL-REVIEW
- [ ] Gate 3 human review

## Decisions Taken Under Ambiguity
<!-- Implementer fills in here. Each decision: what was ambiguous, what was chosen, why. -->



---

## Implementation Refinements (Critic Round 1)

### I4 — A2 / A3 transition window
During the period A2 ships but A3 has not landed, the TUI still has 8 tabs while JSON dashboard renders 3 sections. **Resolution**: A2's overview.js renders the 3-section view ONLY in JSON mode (`process.stdin.isTTY === false`). In TUI mode, the existing 8-tab layout is unchanged. When A3 ships, TUI switches to areas.

### I5 — dashboard-prefs.json corruption fallback
`loadDashboardPrefs()` wraps JSON.parse in try/catch. On error: log to stderr, return defaults `{collapsed:{business:false,implementation:false,execution:false}}`, do NOT delete the corrupt file (user can inspect). On next successful save, the corrupt file is overwritten.


---

## Execution Status — A2 COMPLETE

### Step 8: TEST ✓ — tests/sections.test.js (16 tests)
### Step 9: PREPARE ✓ — no new deps; pre-flight: all touched files were declared
### Step 10: IMPLEMENT ✓
- src/lib/sections.js (SECTIONS, getSectionForStage, getStagesInSection, getSectionLabel, loadDashboardPrefs, saveDashboardPrefs)
- src/lib/menu-screens.js refactored to render 3-section view in JSON mode (per I4)
- CLAUDE.md gained 'Pipeline Philosophy' section with all 4 load-bearing principles (per X2)
- docs/IRON_LOOP.md gained 'Pipeline sections (v7)' section mapping steps to sections

### Step 11: REVIEW ✓ — sections.js is a thin grouping layer; stages remain canonical
### Step 12: OPTIMIZE ✓ N/A — no performance regression
### Step 13: SECURE ✓ — prefs JSON parsed with try/catch (I5); no code execution path
### Step 14: VERIFY ✓ — 795 tests pass, 0 fails
### Step 15: DOCUMENT ✓ — CLAUDE.md + IRON_LOOP.md updated
### Step 16: FINAL-REVIEW — Gate 3 pending (commit-cadence implicit approval)

## Decisions Taken Under Ambiguity
1. **Section render symbols**: ▼ (expanded) / ▶ (collapsed). Unicode chevrons are visually clear; ASCII alternatives less so.
2. **Per-stage label format**: title-case with spaces (e.g., 'In progress'). Matches existing Vision/Functional capitalization in the prior dashboard.
3. **I4 split**: JSON mode renders sections; TUI overview.js untouched until A3 lands. Documented in the impl plan's I4 refinement.
4. **TUI overview.js NOT updated in A2**: Per I4 transition strategy. Will be updated when A3 rewrites the menu structure into 5 areas. Documented in this Decisions section.
