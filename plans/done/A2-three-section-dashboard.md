---
title: "A2 — 3-Section Dashboard + Migration + Principle Docs"
created: "2026-05-14T00:00:00Z"
approved_by: human
approved_at: "2026-06-15T00:00:00Z"
gate_crossed: "functional → done (shipped in v6.2.1; archived 2026-06-15)"
priority: HIGH
type: feature
parent_vision: ctoc-v7-business-first-architecture
program: ctoc-v7
order: 2
depends_on:
  - A1-canvas-layer
---

# Functional Plan: A2 — 3-Section Dashboard + Migration + Principle Docs

> Created: 2026-05-14
> Status: Draft
> Author: vision-decomposer + product-owner (dogfood)

---

## 1. ASSESS — Problem Understanding

### Business Context
The current 7-stage flat dashboard doesn't reveal **intent shifts** between phases. A user can't tell at a glance whether they're in context-building, queueing, or execution. The dashboard treats all stages equally, even though their cognitive purposes differ radically.

### Current State
- `src/commands/menu.js` renders 7 stages flat: Vision, Functional, Implementation, Todo, In-Progress, Review, Done
- `src/tabs/overview.js` mirrors the same flat layout
- Pre-todo (context-building) and post-todo (execution) are visually indistinguishable
- No surfacing of the "pre-todo is context" principle anywhere

### Impact
- **Primary**: Users navigate by stage name, not by intent — slower mental model
- **Secondary**: Claude itself has no signal which phase it should be operating in when invoked
- **Tertiary**: CLAUDE.md mentions phases but they're invisible in the UI

---

## 2. ALIGN — Business Alignment

### Business Goals
1. Make the 3 intent-aligned sections visible in the dashboard so users and Claude both see the WHY/WHAT/DOING split
2. Migrate existing plans into the new sections without modifying plan content
3. Document the "pre-todo is context" principle as the load-bearing rationale

### Success Metrics
- [ ] **M1**: Dashboard renders 3 collapsible sections (Business / Implementation / Execution) with correct per-stage counts at section header
- [ ] **M2**: 100% of pre-v7 plans surface in the correct section automatically — zero plan-file modifications during migration
- [ ] **M3**: CLAUDE.md and IRON_LOOP.md both contain the "pre-todo is context-building" principle as a named section
- [ ] **M4**: Section names exactly match: "Business", "Implementation", "Execution"

### Stakeholders
| Stakeholder | Role | Approval Needed |
|---|---|---|
| CTOC Chief (user) | Primary dashboard user | Yes (Gate 1) |
| Existing CTOC users | Migration affects them | Implicit via zero-modification migration |
| Agents | Read CLAUDE.md to determine phase | Programmatic only |

### Constraints
- No changes to plan file contents during migration
- No changes to existing 16-step Iron Loop labels
- No changes to 3 existing human gates
- Cross-platform; Node.js only
- Section grouping locked at: Business = Vision+Canvas+Functional, Implementation = Implementation+Todo, Execution = In-Progress+Review+Done

---

## 3. CAPTURE — Requirements

### Functional Requirements
| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-1 | Section grouping in dashboard | Must | `src/commands/menu.js` renders 3 sections: Business (Vision+Canvas+Functional), Implementation (Implementation+Todo), Execution (In-Progress+Review+Done) |
| FR-2 | Section headers show counts | Must | Each section header shows aggregate count and per-stage breakdown (e.g., "Business (5): Vision 1, Canvas 1, Functional 3") |
| FR-3 | Sections collapsible | Must | Each section can be collapsed; collapsed-state persists per session via `.ctoc/state/dashboard-prefs.json` |
| FR-4 | Per-stage browse still works | Must | Clicking a stage within a section still navigates to that stage's browse view |
| FR-5 | Migration is automatic | Must | First dashboard load on v7 surfaces existing plans in correct sections without modification |
| FR-6 | CLAUDE.md update | Must | New section "Pipeline Philosophy: Context Building vs. Execution" articulates pre-todo-is-context principle |
| FR-7 | IRON_LOOP.md update | Must | Step descriptions reference which section (Business/Implementation/Execution) each step belongs to |
| FR-8 | overview.js tab updated | Must | Dashboard overview tab matches the 3-section layout |
| FR-9 | state.js recognizes section concept | Should | Optional: helper functions `getSectionForStage(stage)` and `getStagesInSection(section)` |

### Non-Functional Requirements
| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Performance | Dashboard render time unchanged or improved (target: <100ms for 50 plans) |
| NFR-2 | Backward compatibility | All 12 existing plans surface correctly in new layout |
| NFR-3 | Cross-platform | Tests pass on Darwin, Linux, Windows |
| NFR-4 | Test coverage | ≥80% on new code |

### User Stories
```
As a CTOC Chief opening the dashboard
I want to see 3 sections (Business / Implementation / Execution)
So that I immediately know which phase any plan is in by where I see it

As a CTOC Chief who collapsed Execution because Done is full
I want my collapse state to persist this session
So that I don't have to re-collapse every refresh

As Claude (agent) reading CLAUDE.md
I want to see the pre-todo-is-context principle named explicitly
So that I treat pre-todo work as context-building, not premature execution
```

### Out of Scope
- A 4th section (no Strategy/Reporting/Archive section added in v7)
- Persistent collapse state across machines (session-only is enough)
- Visual theming / colors / icons for sections
- Changes to the 16 Iron Loop step labels
- Changes to the 3 human gates
- Changes to plan file YAML frontmatter

---

## Approval Checklist

- [ ] Business problem clearly defined
- [ ] Success metrics measurable
- [ ] Requirements complete and prioritized
- [ ] Stakeholders identified
- [ ] Constraints documented
- [ ] Scope boundaries clear

---

## Approval

**Status**: Pending Approval (Gate 1: functional → implementation)

---

*Iron Loop Steps 2-3-4: ASSESS, ALIGN, CAPTURE complete.*
