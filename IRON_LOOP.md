# CTOC — Iron Loop

> **Iron Loop is CTOC's methodology for quality software delivery.**
> This file tracks the current work in progress.

---

## Iron Loop Overview

```
PHASE 1: FUNCTIONAL PLANNING (Steps 1-3) - Product Owner Role
─────────────────────────────────────────────────────────────
1. ASSESS        Problem understanding              [product-owner]
2. ALIGN         User goals & business objectives   [product-owner]
3. CAPTURE       Requirements as BDD specs          [functional-reviewer] ◄──┐
   └─► Reject? Back to Step 1 ─────────────────────────────────────────────────┘
   └─► HUMAN GATE: User approves functional plan

PHASE 2: IMPLEMENTATION PLANNING (Steps 4-6) - Technical Role
─────────────────────────────────────────────────────────────
4. PLAN          Technical approach                 [implementation-planner]
5. DESIGN        Architecture design                [implementation-planner]
6. SPEC          Detailed specifications            [implementation-plan-reviewer] ◄──┐
   └─► Reject? Back to Step 4 ─────────────────────────────────────────────────────────┘
   └─► Approve → [iron-loop-plan-integrator] + [iron-loop-plan-critic] refine
       ├── 10 rounds max refinement (5-dimension rubric)
       ├── All 5/5? → Iron-solid execution plan
       └── Max rounds? → Auto-approve + Deferred Questions for Step 15
   └─► HUMAN GATE: User approves technical approach

PHASE 3: IMPLEMENTATION (Steps 7-15) - Autonomous
─────────────────────────────────────────────────────────────
7.  TEST         Write tests first (TDD Red)        [test-maker]
8.  QUALITY      Lint, format, type-check           [quality-checker]
9.  IMPLEMENT    Setup + Code + Error handling      [implementer]
10. REVIEW       Self-review + quality re-check     [self-reviewer] ◄───────────┐
    └─► TDD Loop: Need more tests? → Back to Step 7 ────────────────────────────┘

11. OPTIMIZE     Performance + code simplification  [optimizer]
12. SECURE       Security vulnerability check       [security-scanner]
13. VERIFY       Run ALL tests                      [verifier]
14. DOCUMENT     Update documentation               [documenter]
15. FINAL-REVIEW Reviews 7-14, highest standards    [implementation-reviewer]
    └─► Issues? Smart loop to affected step
    └─► HUMAN GATE: User approves commit/push
```

---

## Phase 1: Product Owner Role (BDD Methodology)

Phase 1 acts as **Product Owner** for the project:

### What It Does
- Understands what user needs (ASSESS)
- Aligns with business goals (ALIGN)
- Captures requirements as implementable specs (CAPTURE)

### BDD Output Format
All features are captured as:
1. **User Stories** - "As a [user], I can [action] so that [benefit]"
2. **Behavior Scenarios** - Given/When/Then (Gherkin format)
3. **Definition of Done** - Automated test conditions

```gherkin
Feature: User Login

  User Story: As a registered user, I can log in so that I access my account

  Scenario: Successful login
    Given I am on the login page
    And I have a valid account
    When I enter my email and password
    And I click "Log In"
    Then I should see my dashboard
    And I should see a welcome message

  Scenario: Invalid password
    Given I am on the login page
    When I enter wrong password
    Then I should see "Invalid credentials"
    And I should remain on login page
```

### Escape Hatch
Even trivial requests get a mini-plan with test. User can override with:
- "skip planning"
- "quick fix"
- "trivial fix"

---

## Hook Enforcement

The Iron Loop is enforced by the `edit-write-gate.js` hook, which runs before every Edit/Write operation.

### How It Works

```
On Edit/Write tool call:
├── Load Iron Loop state
├── Check enforcement mode (strict/soft/off)
├── Check if file is whitelisted (*.md, *.yaml, .ctoc/**)
│   └── If whitelisted → ALLOW
├── Check for escape phrase in user message
│   └── If found → ALLOW
├── Check currentStep
│   ├── If step >= 7 → ALLOW
│   └── If step < 7 → BLOCK (exit 1)
```

### Enforcement Modes

| Mode | Behavior |
|------|----------|
| `strict` | Block Edit/Write if planning incomplete (default) |
| `soft` | Warn but allow Edit/Write |
| `off` | No enforcement |

Configure in `.ctoc/settings.yaml`:
```yaml
enforcement:
  mode: strict
```

### Whitelisted Files

These file types bypass enforcement (config/docs that don't need Iron Loop):
- `*.md` - Markdown files
- `*.yaml`, `*.yml` - Config files
- `*.json` - Config files
- `.ctoc/**` - CTOC configuration
- `.local/**` - Local state

### Escape Phrases

User can bypass enforcement by saying:
- "skip planning"
- "skip iron loop"
- "quick fix"
- "trivial fix"
- "trivial change"
- "hotfix"
- "urgent"

---

## Crash Recovery

When an implementation session (Steps 7-15) is interrupted (crash, terminal close, etc.), CTOC automatically detects this on the next session start and offers recovery options.

### Detection Criteria

A session is considered interrupted if:
1. `sessionStatus` is "active" (not cleanly ended)
2. `currentStep` is between 7 and 15 (implementation phase)
3. `lastActivity` is within the last 24 hours

### Recovery Menu

When an interrupted session is detected, the user sees:

```
+------------------------------------------------------------+
|  INTERRUPTED IMPLEMENTATION DETECTED                       |
+------------------------------------------------------------+
|  Plan: [feature-name]                                      |
|  Step: 9 (IMPLEMENT)                                       |
|  Last activity: 2 hours ago                                |
|                                                            |
|  [R] Resume - Continue from where it stopped               |
|  [S] Restart - Start implementation fresh from Step 7      |
|  [D] Discard - Abandon this implementation                 |
+------------------------------------------------------------+
```

### Session Lifecycle

- **Session Start**: Sets `sessionStatus: "active"`, updates `lastActivity`
- **Every Response**: Updates `lastActivity` timestamp
- **Clean Exit**: Sets `sessionStatus: "ended"`

This ensures crashed sessions are distinguishable from cleanly ended ones.

---

## Integrator + Critic Loop

When an implementation plan is approved at Step 6, the **Integrator** and **Critic** agents work together to create an iron-solid execution plan through iterative refinement.

### How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│              INTEGRATOR + CRITIC REFINEMENT LOOP                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Input: Approved Implementation Plan                              │
│                                                                   │
│  Round 1:                                                         │
│    [Integrator] → Creates detailed execution plan (Steps 7-15)   │
│    [Critic]     → Scores 5 dimensions (all must be 5/5)          │
│                                                                   │
│  If any < 5:                                                      │
│    Critic provides: reason + suggested fix                        │
│    Integrator refines plan                                        │
│    Loop continues...                                              │
│                                                                   │
│  Termination:                                                     │
│    - All 5/5: Iron-solid plan ready                              │
│    - Max rounds (10): Auto-approve + Deferred Questions          │
│                                                                   │
│  Output: plans/execution/{plan-name}.md                          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 5-Dimension Rubric

| Dimension | Key Checks |
|-----------|------------|
| **Completeness** | All steps have actions? All modules covered? 80% test coverage baseline? |
| **Clarity** | Unambiguous instructions? Single responsibility? Self-documenting? |
| **Edge Cases** | Error handling? Fallback behavior? Rollback plan? Timeout handling? |
| **Efficiency** | Minimal steps? No redundancy? Parallelizable? Token budget reasonable? |
| **Security** | OWASP Top 10? Input validation? No secrets? Protected endpoints? |

### Deferred Questions

When max rounds (10) is reached and some dimensions still score < 5, unresolved issues become **Deferred Questions**. These are:

1. Stored with the execution plan
2. Presented to the user at Step 15 (FINAL-REVIEW)
3. Formatted with context, options, and pros/cons

Example:
```
╔══════════════════════════════════════════════════════════════════════╗
║  DEFERRED QUESTION 1 of 2                                            ║
╠══════════════════════════════════════════════════════════════════════╣
║  Context: Round 7 - edge_cases scored 4/5                            ║
║  Issue:   Network timeout handling not specified                     ║
║  Step:    9 (IMPLEMENT)                                              ║
╠══════════════════════════════════════════════════════════════════════╣
║  How should network timeouts be handled?                             ║
║                                                                      ║
║  [A] Retry 3 times with exponential backoff                          ║
║  [B] Fail immediately with clear error message                       ║
║  [C] Make retry count a user setting — *Recommended*                 ║
╚══════════════════════════════════════════════════════════════════════╝
```

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `integration.max_rounds` | 10 | Maximum refinement rounds |
| `integration.quality_threshold` | 5 | All dimensions must meet this |
| `integration.auto_approve_after_max` | true | Auto-approve after max rounds |
| `integration.defer_unresolved` | true | Store unresolved as Deferred Questions |

### Implementation

The Integrator + Critic loop is implemented in `lib/iron-loop.js`:

| Function | Purpose |
|----------|---------|
| `integrate(planPath)` | Generates Steps 7-15 from plan requirements |
| `critique(planPath)` | Scores execution plan on 5 dimensions |
| `refineLoop(planPath, maxRounds)` | Orchestrates the loop until all 5/5 or max rounds |
| `appendDeferredQuestions(planPath, questions)` | Appends unresolved issues to plan |

The loop is triggered automatically when a plan moves from `implementation/draft/` to `implementation/approved/` (todo queue) via the `approvePlan()` function in `lib/actions.js`.

---

## 3 Human Gates

| Gate | Transition | User Decision |
|------|------------|---------------|
| Gate 1 | Functional → Implementation | "Approve functional plan?" |
| Gate 2 | Implementation → Iron Loop Ready | "Approve technical approach?" |
| Gate 3 | Final Review → Done | "Commit/push or send back?" |

---

## Kanban Board (5 Columns)

```
+------------+ +------------+ +------------+ +------------+ +------------+
| FUNCTIONAL | |IMPLEMENTAT.| | IRON LOOP  | |    IN      | |   FINAL    |
|  PLANNING  | |  PLANNING  | |   READY    | | DEVELOPMENT| |  REVIEW    |
+------------+ +------------+ +------------+ +------------+ +------------+
| Steps 1-3  | | Steps 4-6  | | Awaiting   | | Steps 7-14 | |  Step 15   |
| Product    | | Technical  | | execution  | | Shows      | | Human gate |
| Owner BDD  | | approach   | | start      | | action:    | | Commit or  |
|            | | architect. | |            | | "Testing"  | | send back  |
+------------+ +------------+ +------------+ +------------+ +------------+
      |              |                                             |
   [HUMAN]        [HUMAN]                                       [HUMAN]
```

---

## 14 Quality Dimensions (ISO 25010 aligned)

| # | Dimension | Key Checks |
|---|-----------|------------|
| 1 | Correctness | Tests meaningful, edge cases, business logic |
| 2 | Completeness | All criteria met, implicit requirements |
| 3 | Maintainability | Patterns, no smells, readable by junior |
| 4 | Security | OWASP, validation, auth/authz |
| 5 | Performance | No N+1, caching, response time |
| 6 | Reliability | Error handling, retries, fault tolerance |
| 7 | Compatibility | API backwards compat, integrations |
| 8 | Usability | Error messages, clear output, docs |
| 9 | Portability | No hardcoded paths, configurable |
| 10 | Testing | 90% coverage, isolation, happy+error paths |
| 11 | Accessibility | WCAG 2.2, screen reader, keyboard |
| 12 | Observability | Logging, metrics, tracing, alerts |
| 13 | Safety | No harm, graceful degradation |
| 14 | Ethics/AI | Bias, fairness, explainability |

---

## Current Work

**Feature:** Product Owner Role Redesign
**Status:** Implementation In Progress
**Started:** 2026-01-29

### Progress

```
[ ✓ ] Phase 1: Agent Renaming
      ├── [x] Create product-owner.md (replaces functional-planner.md)
      ├── [x] Rename impl-planner → implementation-planner
      ├── [x] Rename impl-plan-reviewer → implementation-plan-reviewer
      ├── [x] Rename impl-reviewer → implementation-reviewer
      └── [x] Delete old functional-planner.md

[ ✓ ] Phase 2: Core File Updates
      ├── [x] Update cto-chief.md with new patterns
      ├── [x] Update operations-registry.yaml
      ├── [x] Update IRON_LOOP.md (this file)
      └── [x] Update settings.yaml (keyboard_layout)

[   ] Phase 3: Kanban Board
      ├── [ ] Create ctoc/kanban/board.yaml
      └── [ ] Update dashboard.md agent
```

---

## Agent Registry

| Agent | Model | Steps | Role |
|-------|-------|-------|------|
| cto-chief | opus | 1-15 | Coordinator |
| product-owner | opus | 1-3 | BDD Specs (Product Owner) |
| functional-reviewer | opus | 3 | Review Gate |
| implementation-planner | opus | 4-6 | Technical Planning |
| implementation-plan-reviewer | opus | 6 | Review Gate |
| iron-loop-plan-integrator | opus | 6 | Creates execution plans |
| iron-loop-plan-critic | opus | 6 | Reviews execution plans (5-dim rubric) |
| test-maker | opus | 7 | TDD Red |
| quality-checker | sonnet | 8,10 | Quality |
| implementer | sonnet | 9 | Code |
| self-reviewer | opus | 10 | Review |
| optimizer | sonnet | 11 | Performance + Simplification |
| security-scanner | opus | 12 | Security |
| verifier | sonnet | 13 | Testing |
| documenter | sonnet | 14 | Docs |
| implementation-reviewer | opus | 15 | Final Gate |

---

## Files Structure

### Agents
```
.ctoc/agents/
├── coordinator/
│   └── cto-chief.md
├── planning/
│   ├── product-owner.md            # NEW - BDD specs
│   ├── functional-reviewer.md
│   ├── implementation-planner.md   # RENAMED from impl-planner
│   ├── implementation-plan-reviewer.md  # RENAMED from impl-plan-reviewer
│   ├── iron-loop-plan-integrator.md     # NEW - Creates execution plans
│   └── iron-loop-plan-critic.md         # NEW - 5-dimension rubric review
├── implementation/
│   ├── test-maker.md
│   ├── quality-checker.md
│   ├── implementer.md
│   ├── self-reviewer.md
│   ├── optimizer.md
│   ├── security-scanner.md
│   ├── verifier.md
│   ├── documenter.md
│   └── implementation-reviewer.md  # RENAMED from impl-reviewer
├── admin/
│   ├── dashboard.md
│   ├── learning-applier.md
│   └── learning-suggester.md
└── writing/
    ├── document-planner.md
    ├── pdf-writer.md
    ├── docx-writer.md
    ├── pptx-writer.md
    └── document-reader.md
```

### Configuration
```
.ctoc/
├── operations-registry.yaml    # v2.1.0 — Single source of truth
├── settings.yaml               # Configuration (with keyboard_layout)
├── cache/
│   └── codebase-index.yaml
└── learnings/
    ├── README.md
    ├── learning.yaml.template
    ├── pending/
    ├── approved/
    ├── applied/
    └── rejected/
```

---

## Notes

- Claude Code IS the runtime — no separate runtime needed
- Everything is an agent (tiered by complexity)
- Model minimum: Haiku (configurable to sonnet/opus)
- Learning system: per-project, git-tracked
- Phase 1 uses BDD methodology (user stories + scenarios)
- 3 human gates ensure user control at key transitions

---

### Plans Directory
```
plans/
├── functional/
│   ├── draft/              # Functional plans being written
│   └── approved/           # Approved functional plans
├── implementation/
│   ├── draft/              # Implementation plans being written
│   └── approved/           # Approved implementation plans
├── execution/              # NEW - Iron-solid execution plans
│   └── {date}-{name}.md    # Generated by Integrator+Critic loop
├── todo/                   # Backlog
├── in_progress/            # Currently being worked on
├── review/                 # Awaiting review
└── done/                   # Completed
```

---

*Last updated: 2026-01-29*
