---
title: "A3 — Menu Rethink: 5 Top-Level Areas — Implementation"
created: "2026-05-14T00:00:00Z"
priority: HIGH
type: feature
parent_functional: A3-menu-rethink-five-areas
program: ctoc-v7
order: 3
depends_on:
  - A2-three-section-dashboard-impl
files:
  - src/lib/areas.js
  - src/lib/tabs.js
  - src/lib/menu-screens.js
  - src/lib/inbox.js
  - src/commands/menu.js
  - src/areas/pipeline.js
  - src/areas/inbox.js
  - src/areas/agent.js
  - src/areas/library.js
  - src/areas/system.js
  - .ctoc/inbox/questions/.gitkeep
  - .ctoc/inbox/decisions/.gitkeep
  - tests/areas.test.js
  - tests/inbox.test.js
approved_by: human
approved_at: 2026-05-14T00:00:00Z
gate_crossed: implementation → todo
dogfood_retro: true
---

# Implementation Plan: A3 — Menu Rethink: 5 Top-Level Areas

> Created: 2026-05-14
> Status: Draft
> Author: implementation-planner (dogfood)
> Based on: A3-menu-rethink-five-areas.md

---

## 4. PLAN — Technical Approach

### Solution Overview
Introduce an **area abstraction** parallel to the existing tab system. 5 areas: Pipeline, Inbox, Agent, Library, System. Each area is a module under `src/areas/` that renders its content. Existing `src/tabs/*.js` modules are folded into areas (overview → pipeline; tools → library+system; vision/functional/etc → drill-in views under pipeline). The `tabs.js` module is renamed/replaced by `areas.js` but kept as a compatibility shim during rollout. The Inbox introduces a new `.ctoc/inbox/` directory for async-overnight artifacts.

### Technology Choices
| Component | Technology | Rationale |
|---|---|---|
| Area abstraction | `src/lib/areas.js` | Mirrors current tabs.js but with the new 5-area model |
| Area modules | `src/areas/*.js` | One file per area, render+handleKey contract identical to tabs |
| Inbox storage | `.ctoc/inbox/questions/`, `.ctoc/inbox/decisions/` | Filesystem queue; each item is one markdown file |
| Tabs compatibility shim | Keep `src/lib/tabs.js` exporting AREAS as TABS during transition | Avoid touching every reference in one PR |

### Architecture Decision Records

#### ADR-1: Areas, not tabs, as the new abstraction
- **Context**: 8 tabs flat is too many; 5 task-aligned areas mirror mental model
- **Decision**: New `src/lib/areas.js` with `AREAS` array; deprecate `tabs.js` as compatibility shim
- **Consequences**: + Cleaner mental model. − Migration touches many references (mitigated by shim)

#### ADR-2: Inbox as filesystem queue, not DB
- **Context**: Need a place for async-overnight artifacts (questions, decisions)
- **Decision**: `.ctoc/inbox/questions/<slug>.md` and `.ctoc/inbox/decisions/<slug>.md` — one file per item
- **Consequences**: + Git-trackable, human-editable. + No DB dependency. − Listing requires directory scan (fast for <1000 items)

#### ADR-3: Inbox is read-only at the area surface; writes come from upstream
- **Context**: Inbox is a queue, not a creator
- **Decision**: Inbox area lists + renders + offers per-item actions (accept/kickback). Items created by: vision-decomposer (questions), implementer (decisions), gate-check hook (plans-at-gates)
- **Consequences**: + Clear ownership. + Inbox stays a thin lens. − Requires upstream agents to write to it (planned in B1)

#### ADR-5: Plans-at-gates queue shows ALL gates (1, 2, 3), tunable via settings (per X3)
- **Context**: Inbox's third queue — which gates surface here?
- **Decision (per X3)**: Surface plans pending at Gate 1, Gate 2, and Gate 3 by default. Single attention surface. `.ctoc/settings.yaml` supports `inbox.gates_shown: [1,2,3]` for per-user filtering
- **Consequences**: + Inbox = single source of "what needs my attention". + Users can opt out per-gate via settings. − Inbox can be busy if many plans pending (mitigation: collapse-by-default for queues with 0 items)

#### ADR-4: Library area is browse-only
- **Context**: Library shows agents/skills/commands
- **Decision**: List + open-in-pager; no edit-in-place
- **Consequences**: + Simple. + Avoids editor integration complexity. − Users edit files in their own editor (acceptable)

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tab → area migration breaks existing keyboard nav | High | High | Compatibility shim keeps existing arrow-key nav working; new shortcut `i` for Inbox layered on top |
| Inbox files conflict with .gitignore | Low | Medium | `.gitkeep` files; `.ctoc/inbox/` explicitly tracked |
| 5 areas don't fit terminal width | Medium | Low | Render area names + first-letter shortcuts; truncate to first letter at narrow widths |
| Library scans skills/ slowly (360 files) | Medium | Medium | Lazy-load; cache file list in memory per session |
| Inbox empty-state UX feels sparse | Low | Low | "Inbox clear" message + suggestion to start an agent |

---

## 5. DESIGN — Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CTOC v7 Menu                        │
├──────────┬──────────┬─────────┬──────────┬──────────────┤
│ Pipeline │  Inbox   │  Agent  │ Library  │   System     │
└────┬─────┴────┬─────┴────┬────┴────┬─────┴──────┬───────┘
     │          │          │         │            │
     ▼          ▼          ▼         ▼            ▼
   3 sections   3 queues   status   browse      tools
   (A2)         qs/dec/gt  +ctrls   ag/sk/cmd   doctor/etc
```

### Data Model

**`src/lib/areas.js`:**
```js
const AREAS = [
  { id: 'pipeline', name: 'Pipeline', shortcut: '1' },
  { id: 'inbox',    name: 'Inbox',    shortcut: '2' },
  { id: 'agent',    name: 'Agent',    shortcut: '3' },
  { id: 'library',  name: 'Library',  shortcut: '4' },
  { id: 'system',   name: 'System',   shortcut: '5' }
];
```

**Inbox question file (`.ctoc/inbox/questions/<slug>.md`):**
```yaml
---
id: <slug>
created: <iso8601>
source_plan: <plan-ref>
source_step: <step-N>
question: <one-line>
context: <multi-line>
status: open | answered | superseded
---
<question body and context>
```

**Inbox decision file (`.ctoc/inbox/decisions/<slug>.md`):**
```yaml
---
id: <slug>
created: <iso8601>
plan: <plan-ref>
step: <step-N>
ambiguity: <what was unclear>
choice: <what the implementer chose>
rationale: <why>
status: pending-review | accepted | kicked-back
---
```

### API Design

| Function | Module | Purpose |
|---|---|---|
| `listAreas()` | `src/lib/areas.js` | Returns AREAS array |
| `getInboxCounts()` | `src/lib/inbox.js` | `{questions, decisions, gatesWaiting}` |
| `listQuestions(filter)` | `src/lib/inbox.js` | Returns list of open questions |
| `listDecisions(filter)` | `src/lib/inbox.js` | Returns pending-review decisions |
| `actOnDecision(id, action)` | `src/lib/inbox.js` | `action: 'accept' | 'kickback'` — moves decision through state |

### Security Design
- Inbox files are plain markdown; no code execution path
- Slug validation `/^[a-z0-9-]+$/` on all `id` fields before file operations
- Acceptance actions trigger plan state changes via existing actions.js — no new privileged operations

---

## 6. SPEC — Technical Specification

### File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/areas.js` | Create | New AREAS array + helpers (getAreaByIndex, nextArea, prevArea) |
| `src/lib/tabs.js` | Modify | Re-export AREAS as TABS for compatibility; mark deprecated |
| `src/areas/pipeline.js` | Create | Renders 3 sections (from A2); drill into stage browse |
| `src/areas/inbox.js` | Create | Renders 3 queues; drill into items; act on decisions |
| `src/areas/agent.js` | Create | Renders agent status + controls (consumes existing agent state) |
| `src/areas/library.js` | Create | Browse agents/, skills/, src/commands/; search by name |
| `src/areas/system.js` | Create | Doctor, Update, Settings, Logs (folds existing tools tab) |
| `src/lib/inbox.js` | Create | Inbox queue logic (list, count, act) |
| `src/lib/menu-screens.js` | Modify | Route() returns 5-area structure as default; route("area inbox") etc. |
| `src/commands/menu.js` | Modify | Render uses areas; keyboard shortcuts 1-5 + arrows; `i` shortcut to Inbox |
| `.ctoc/inbox/questions/.gitkeep` | Create | Directory tracking |
| `.ctoc/inbox/decisions/.gitkeep` | Create | Directory tracking |
| `tests/areas.test.js` | Create | AREAS list, helpers, area module render contracts |
| `tests/inbox.test.js` | Create | Inbox queue: list, count, act, file format validation |

### Implementation Steps

1. [ ] Create `src/lib/areas.js` + tabs.js compatibility shim
2. [ ] Write `tests/areas.test.js`
3. [ ] Create `src/areas/pipeline.js` (folds overview tab content)
4. [ ] Create `src/areas/inbox.js` + `src/lib/inbox.js`
5. [ ] Create `.ctoc/inbox/questions/`, `.ctoc/inbox/decisions/` with `.gitkeep`
6. [ ] Write `tests/inbox.test.js`
7. [ ] Create `src/areas/agent.js` (folds progress tab + parts of tools)
8. [ ] Create `src/areas/library.js` (browse agents/skills/commands)
9. [ ] Create `src/areas/system.js` (folds tools tab)
10. [ ] Update `src/lib/menu-screens.js` route() for 5-area structure
11. [ ] Update `src/commands/menu.js` rendering + keyboard handling
12. [ ] Run full test suite; verify no regressions

### Test Plan

| Test Type | Coverage | Files |
|---|---|---|
| Unit | listAreas, getInboxCounts, listQuestions, listDecisions, actOnDecision | tests/areas.test.js, tests/inbox.test.js |
| Integration | Dashboard renders 5 areas; Inbox surfaces 3 queue counts; existing nav keys still work | tests/areas.test.js |
| Migration | TUI launches with new menu; existing tab references resolve via shim | tests/areas.test.js |
| Regression | All 40 existing tests + tests/sections.test.js (A2) pass | tests/*.test.js |

### Dependencies
- A1-canvas-layer-impl (canvas stage exists)
- A2-three-section-dashboard-impl (sections concept exists; Pipeline area uses sections)
- No external dependencies

### Rollback Plan
- Revert commits affecting areas.js, areas/*.js, inbox.js
- tabs.js shim already re-exports old structure — original tab UI continues working
- Delete `.ctoc/inbox/` (empty directory; no user data lost)
- A2's sectioned dashboard remains functional independent of A3

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

### I6 — tabs.js compatibility shim must enumerate all 8 old IDs
The shim re-exports an array where each old tab ID maps to its new area:
- `overview` -> `pipeline`, `vision` -> `pipeline`, `functional` -> `pipeline`, `implementation` -> `pipeline`, `review` -> `pipeline`, `todo` -> `pipeline`, `progress` -> `agent`, `tools` -> `system`

Plus a `getTabIndex` shim returning the area's index when called with an old tab ID. Audit all callers (especially `TABS.findIndex(t => t.id === 'tools')` in menu.js line 174) and confirm none break.

### I7 — AskUserQuestion 4-option limit for 5 areas
JSON dashboard shows top-4: Pipeline, Inbox, Agent, More. The "More" expansion includes Library and System. Keyboard shortcut `l` jumps directly to Library; `s` to System. TUI shows all 5 areas in the tab bar (no AskUserQuestion limit applies there).

### I8 — Inbox slug collision strategy
Slugs use `<timestamp>-<6char-random>.md` format (e.g. `1715634000000-a3f9k2.md`). Atomic via fs.writeFileSync (POSIX) + retry-once on Windows EBUSY. Tests cover the 1-in-a-million collision case via deterministic-clock injection.

### I9 — Plans-at-gates cache
Cache `{plansAtGates: [...], computedAt: ts}` in module-level memo. Invalidate when: (a) cache age >60s, (b) any plan file in plans/* mtime newer than computedAt. `fs.statSync` on each plan dir cheap (~few ms for 50 plans).


---

## A3 Phased Execution

### A3.1 — Foundation: areas + inbox + JSON dashboard (v6.2.2 — shipped)
- [x] src/lib/areas.js — AREAS list + listAreas/getAreaById/getAreaByIndex/getAreaIndex/nextArea/prevArea
- [x] src/lib/inbox.js — getInboxCounts, listQuestions, listDecisions, listPlansAtGates, createQuestion, createDecision
- [x] src/lib/tabs.js — compatibility shim re-exporting areas (per I6)
- [x] menu-screens.js — INBOX block in JSON dashboard
- [x] .ctoc/inbox/{questions,decisions}/ created with .gitkeep
- [x] tests/areas.test.js (10 tests) + tests/inbox.test.js (6 tests)
- [x] tests/tabs.test.js rewritten for shim contract
- [x] Step 8 TEST, Step 10 IMPLEMENT, Step 14 VERIFY (822 tests, 0 fails)

### A3.2 — TUI areas (follow-up commit)
- [ ] src/areas/pipeline.js (TUI rendering)
- [ ] src/areas/inbox.js (drill-in views, accept/kickback actions)
- [ ] src/areas/agent.js (folds progress tab)
- [ ] src/areas/library.js (browse agents/skills/commands)
- [ ] src/areas/system.js (folds tools tab)
- [ ] src/commands/menu.js — keyboard shortcuts 1-5 + l, s; handleKey routes to area modules
- [ ] Per I7 (4-option AskUserQuestion limit), Pipeline/Inbox/Agent + More menu

## Decisions Taken Under Ambiguity (A3.1)
1. **Slug random suffix**: 6 chars from base36. Provides ~2 billion combinations, sufficient for I8's collision protection over the lifetime of any project.
2. **Plans-at-gates marker**: `approved_by: human` substring match. Same heuristic as src/hooks/human-gate-check.js. Catches both new commits and retroactive markers.
3. **Inbox dashboard format**: 3-line summary always shown when any item is non-zero. "Inbox clear" when all zero. Avoids visual clutter on empty days.
4. **TUI deferred**: Per I4 transition strategy, JSON dashboard ships first; TUI updates land in A3.2. Existing 8-tab TUI keeps working unchanged via the tabs.js shim.
