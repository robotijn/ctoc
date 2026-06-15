---
title: "A3 — Menu Rethink: 5 Top-Level Areas + Inbox Surface"
created: "2026-05-14T00:00:00Z"
approved_by: human
approved_at: "2026-06-15T00:00:00Z"
gate_crossed: "functional → done (shipped in v6.3.1; archived 2026-06-15)"
priority: HIGH
type: feature
parent_vision: ctoc-v7-business-first-architecture
program: ctoc-v7
order: 2.5
depends_on:
  - A1-canvas-layer
related:
  - A2-three-section-dashboard
---

# Functional Plan: A3 — Menu Rethink: 5 Top-Level Areas + Inbox Surface

> Created: 2026-05-14
> Status: Draft (added after Gate 0 approval — user requested holistic menu rethink)
> Author: vision-decomposer + product-owner (dogfood)

---

## 1. ASSESS — Problem Understanding

### Business Context
A2 (3-section dashboard) reorganizes plan stages within the existing menu structure. But the menu structure itself is the bigger problem: 8 TUI tabs that duplicate each other, no first-class surface for async-overnight artifacts (morning questions, documented decisions), Tools as an everything-else bucket. The 3-section grouping is right; the surrounding navigation is wrong.

### Current State
- **TUI tabs (8)**: Overview, Vision, Functional, Implementation, Review, Todo, Progress, Tools
- **JSON dashboard**: 7-stage flat table + AGENT block
- Stage tabs duplicate Overview; both render plan stage lists
- "Progress" tab purpose unclear (overlaps with in-progress stage)
- "Tools" is mixed-bag: Doctor, Update, Settings
- No surface for: morning questions (post-async-overnight), implementer's documented decisions awaiting review, plans waiting at human gates
- TUI mental model differs from JSON mental model

### Impact
- **Primary**: New users face 8 tabs that don't map to mental tasks; learning curve high
- **Secondary**: The async-overnight model (B1/B2's load-bearing rationale) has nowhere to surface — questions/decisions get lost
- **Tertiary**: Claude in JSON mode sees a different structure than the user in TUI mode

---

## 2. ALIGN — Business Alignment

### Business Goals
1. Consolidate 8 tabs into **5 task-aligned areas** (Pipeline, Inbox, Agent, Library, System)
2. Add **Inbox** as the first-class async-overnight surface
3. Unify TUI and JSON mental models — both expose the same 5 areas
4. Make Pipeline the obvious default landing, with the 3-section layout from A2

### Success Metrics
- [ ] **M1**: TUI renders 5 top-level areas (not 8 tabs)
- [ ] **M2**: JSON dashboard mirrors the 5-area structure
- [ ] **M3**: Inbox surfaces 3 queue types: morning questions, decisions awaiting review, plans at gates
- [ ] **M4**: Pipeline area's content matches A2's 3-section layout
- [ ] **M5**: Existing keyboard shortcuts (arrow keys, q, b) continue to work
- [ ] **M6**: Migration is transparent — first launch on v7 shows new menu without user action

### Stakeholders
| Stakeholder | Role | Approval Needed |
|---|---|---|
| CTOC Chief | Primary navigator | Yes (Gate 1 — bundled with this plan) |
| Claude (JSON mode) | Renders JSON dashboard | Programmatic |
| Existing CTOC users | Affected by tab → area renaming | Implicit via transparent migration |

### Constraints
- Must coexist with A2 (3-section pipeline view lives INSIDE the Pipeline area)
- Cross-platform; Node.js + TUI (no new TUI library)
- Existing TUI tab modules (`src/tabs/*.js`) are reused inside the new areas where appropriate
- No new external dependencies
- Inbox is informational only — it points to plans/questions/decisions, doesn't create them. Creation is upstream (vision-decomposer, implementer, gate-check hook).

---

## 3. CAPTURE — Requirements

### Functional Requirements
| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-1 | 5 top-level areas | Must | TUI tab bar renders: Pipeline · Inbox · Agent · Library · System. Same 5 in JSON dashboard output |
| FR-2 | Pipeline area content | Must | Renders A2's 3-section view (Business · Implementation · Execution) with stage-level counts |
| FR-3 | Inbox area content | Must | Renders 3 queue counts: (a) morning questions from `.ctoc/inbox/questions/`, (b) decisions awaiting review from `.ctoc/inbox/decisions/`, (c) plans waiting at ALL gates (1/2/3) by default (per X3); tunable via `.ctoc/settings.yaml` `inbox.gates_shown: [1,2,3]` |
| FR-4 | Inbox queue drill-in | Must | Selecting a queue type shows list of items; selecting an item shows full content + actions (e.g., "accept", "kickback", "edit") |
| FR-5 | Agent area content | Must | Shows: agent status (idle/working), active plan, current step, token budget, schedule (if scheduled), Start/Stop controls |
| FR-6 | Library area content | Must | Browse agents (`agents/`), skills (`skills/`), slash commands (`src/commands/`). Filterable by category. Search by name |
| FR-7 | System area content | Must | Doctor, Update, Settings, Logs (enforcement.json, gate-violations.json) |
| FR-8 | Tab module migration | Must | Existing `src/tabs/*.js` modules: overview → folded into Pipeline; vision/functional/implementation/review/todo/progress → become drill-in views under Pipeline; tools → split into Library + System |
| FR-9 | JSON dashboard restructure | Must | `src/lib/menu-screens.js` `route()` returns the new 5-area structure as default |
| FR-10 | Keyboard shortcuts | Should | Arrow keys cycle areas (instead of tabs); existing `b`/`q`/`s` still work; new shortcut `i` for Inbox |
| FR-11 | Inbox empty state | Should | When all 3 queues are 0, show "Inbox clear — no async items waiting" |

### Non-Functional Requirements
| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Performance | Render time unchanged or improved (<100ms for 50 plans + 20 inbox items) |
| NFR-2 | Backward compatibility | All 12 existing plans surface correctly in the new Pipeline view |
| NFR-3 | Cross-platform | Tests pass on Darwin, Linux, Windows |
| NFR-4 | Test coverage | ≥80% on new code |

### User Stories
```
As a CTOC Chief waking up after an overnight agent run
I want to see the Inbox area light up with morning questions and decisions
So that my first action is reviewing what the agent did, not hunting through stage tabs

As a CTOC Chief navigating CTOC for the first time
I want to see 5 task-aligned areas (not 8 tabs)
So that I learn the system by purpose, not by stage taxonomy

As Claude in JSON mode
I want the same 5-area structure as the TUI
So that my dashboard output matches what the user sees interactively

As a CTOC Chief checking on a long-running agent
I want the Agent area to show step, plan, budget, schedule
So that I can decide whether to intervene or let it run
```

### Out of Scope
- Visual theming (colors/icons) for the 5 areas
- Custom area ordering (Pipeline is always first)
- Mobile / web TUI variants
- Inbox auto-clearing (items clear when user acts on them; no time-based clear)
- Library search-by-content (search by name only in v1)
- Replacing the `progress` and `tools` tab modules immediately — they can be folded incrementally

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
