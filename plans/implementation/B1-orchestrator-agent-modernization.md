---
approved_by: human
approved_at: 2026-05-14T16:20:27.827Z
gate_crossed: functional → implementation
---

---
title: "B1 — Orchestrator Agent Modernization + Protocols"
created: "2026-05-14T00:00:00Z"
priority: HIGH
type: feature
parent_vision: ctoc-v7-opus-47-modernization
program: ctoc-v7
order: 4
depends_on:
  - A1-canvas-layer
  - A2-three-section-dashboard
  - C1-pretooluse-enforcement-hook
---

# Functional Plan: B1 — Orchestrator Agent Modernization + Protocols

> Created: 2026-05-14
> Status: Draft
> Author: vision-decomposer + product-owner (dogfood)

---

## 1. ASSESS — Problem Understanding

### Business Context
Opus 4.7 interprets instructions literally. Agents written for older Claude versions drift silently on 4.7 when their prompts are vague or assume non-literal interpretation. CTOC's orchestrator agents (vision-advisor, product-owner, planners, integrator+critic, implementer, reviewers, cto-chief, iron-loop-*) are the pipeline's load-bearing components. If they drift, the pipeline drifts.

Additionally, there's no async-overnight protocol — agents synchronously block on ambiguity, which prevents genuine autonomous-overnight mode (the core value proposition of CTOC).

### Current State
- 86 agents in `agents/` across 19 categories
- Effort level declarations: mostly absent
- Acceptance criteria: uneven
- "Read full plan ancestry first" mandate: absent — agents read current plan only
- Async-choice protocol: not implemented anywhere
- No-stub rule: stated in CLAUDE.md, not enforced in agent prompts
- Some agents written for Claude 3.5/4.5; none audited against 4.7 best practices

### Impact
- **Primary**: Agents drift on 4.7, producing inconsistent output and missed context
- **Secondary**: Overnight autonomous mode doesn't work — synchronous blocking breaks the loop
- **Tertiary**: New users see CTOC's agent library as inconsistent — some agents excellent, some thin

---

## 2. ALIGN — Business Alignment

### Business Goals
1. Bring every orchestrator agent up to Opus 4.7 best practices (literal-instruction patterns, declared effort, adaptive thinking awareness)
2. Add the async-choice protocol so agents never synchronously block on ambiguity
3. Add mandatory ancestry-reading so every agent has full WHY/WHAT context
4. Make the no-stub rule a load-bearing prompt-level constraint, not just documentation

### Success Metrics
- [ ] **M1**: Every orchestrator agent's frontmatter declares: `effort: xhigh|high|medium|low`, `reads_ancestry: true|false`, `async_choice_protocol: enabled`
- [ ] **M2**: Every orchestrator agent prompt includes the no-stub rule and async-choice instructions
- [ ] **M3**: 10-round integrator+critic diff captured per agent under `.ctoc/audit/agent-modernization/<agent>.diff.md`
- [ ] **M4**: CLAUDE.md and IRON_LOOP.md updated with the 4 load-bearing principles (context-building, no-stub, async-overnight, literal-interpretation)
- [ ] **M5**: Test suite continues to pass (`node --test tests/*.test.js` → `# fail 0`)
- [ ] **M6**: Backward compatibility — pre-v7 plans process correctly through modernized agents

### Stakeholders
| Stakeholder | Role | Approval Needed |
|---|---|---|
| CTOC Chief | Approves final agent set | Yes (Gate 1) |
| Orchestrator agents | Subject of modernization | Programmatic |
| Implementer agent | Primary beneficiary of async-choice protocol | Programmatic |
| Existing CTOC users | Backward-compat constraint | Implicit via no-regression tests |

### Constraints
- Cross-platform agent prompts (no shell-specific assumptions)
- No changes to the 16 Iron Loop step labels (those are validated by `src/lib/plan-validator.js`)
- No changes to the 3 human gates
- 10 rounds of integrator+critic per agent — diff captured, not "edit and pray"
- Backward-compat: pre-v7 plans (without `# Decisions Taken Under Ambiguity` section) still process correctly

---

## 3. CAPTURE — Requirements

### Functional Requirements
| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-1 | Orchestrator list locked | Must | Final orchestrator list defined (estimate ~12-15 agents): vision-advisor, product-owner, vision-decomposer, functional-reviewer, implementation-planner, implementation-plan-reviewer, integrator, critic, implementer, self-reviewer, optimizer, verifier, cto-chief, iron-loop-executor, iron-loop-critic, iron-loop-integrator |
| FR-2 | Frontmatter additions | Must | Every orchestrator agent file gains: `effort`, `reads_ancestry`, `async_choice_protocol`, `model_optimized_for: opus-4-7` |
| FR-3 | No-stub prompt fragment | Must | Reusable prompt snippet (`agents/_shared/no-stub-rule.md`) injected into every orchestrator. Articulates: "When ambiguous, make a documented reasonable choice. Never write stubs. Document the choice in `# Decisions Taken Under Ambiguity` section of the plan you're working on." |
| FR-4 | Async-choice prompt fragment | Must | Reusable snippet (`agents/_shared/async-choice-protocol.md`) injected into every orchestrator. Articulates: "Do not synchronously block on ambiguity. Make a documented choice and continue. Plan kickback handles wrong choices." |
| FR-5 | Ancestry-read prompt fragment | Must | Reusable snippet (`agents/_shared/ancestry-read.md`). For step-N agent (N ≥ 5), require: "First action: read the chain vision → canvas (if exists) → functional → implementation plan. Note the full WHY before doing anything." |
| FR-6 | 10-round integrator+critic per agent | Must | Each orchestrator gets 10 rounds. Diff captured under `.ctoc/audit/agent-modernization/<agent>.diff.md`. Final state committed only if tests still pass |
| FR-7 | CLAUDE.md "Pipeline Philosophy" section | Must | New top-level section in CLAUDE.md naming the 4 load-bearing principles: (1) Pre-todo is context, (2) No-stub rule, (3) Async overnight, (4) Literal interpretation |
| FR-8 | IRON_LOOP.md updates | Must | Each step description references which load-bearing principle drives it |
| FR-9 | `# Decisions Taken Under Ambiguity` section in plan templates | Must | Functional + implementation plan templates gain this section; agents write into it when making documented choices |
| FR-10 | Effort-level recommendations | Must | Document in IRON_LOOP.md: xhigh for design/migration/review (Steps 5, 6, 7, 11, 13, 16); medium for classification/formatting (Steps 9, 12, 15); low for trivial extraction |
| FR-11 | Task budgets for long-running agents | Should | Implementer, integrator+critic loops declare token budgets in frontmatter (suggested: 200k for implementer, 50k per integrator+critic round) |

### Non-Functional Requirements
| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Test stability | All 40 test files pass after modernization (`# fail 0`) |
| NFR-2 | Backward compatibility | Pre-v7 plans process correctly through modernized agents |
| NFR-3 | Prompt size | Each agent prompt < 8k tokens after modernization |
| NFR-4 | Cross-platform | Agent prompts contain no OS-specific assumptions |

### User Stories
```
As Claude orchestrating the Iron Loop on Opus 4.7
I want each agent's prompt to be literal and explicit
So that I don't have to infer intent and drift in interpretation

As the implementer agent hitting ambiguity at 3 AM
I want a documented "make a reasonable choice, continue, kickback handles it" protocol
So that the pipeline doesn't stall waiting for the sleeping user

As a CTOC Chief reading CLAUDE.md
I want the 4 load-bearing principles named as a numbered section
So that I can point new contributors at them in one link

As any step-N agent (N ≥ 5)
I want the ancestry-read mandate
So that I always have full WHY context before executing
```

### Out of Scope
- Leaf-node agents → skills conversion (handled in B2)
- Modernizing the 360 skill files (handled in B2)
- New agent categories
- Wholesale rewrite of any single agent — modernization, not redesign
- Changes to step labels or gates
- Changes to marketplace install flow

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


---

## Implementation Refinements (Critic Round 1)

### I13 — agents/_shared/ directory must be created at init time
`src/lib/init-project.js` updates: add `agents/_shared/` to the list of CTOC dirs created on init. Contains `no-stub-rule.md`, `async-choice-protocol.md`, `ancestry-read.md` snippets used by orchestrator agents. Existing projects on upgrade detect missing `agents/_shared/` via SessionStart hook and create it lazily.

### K2 reference - Step labels must match plan-validator
All modernized agent prompts must produce plans/sections labeled exactly: TEST, PREPARE, IMPLEMENT, REVIEW, OPTIMIZE, SECURE, VERIFY, DOCUMENT, FINAL-REVIEW. Add to `agents/_shared/ancestry-read.md`: "Use exact step labels. The plan-validator (src/lib/plan-validator.js) rejects plans with non-matching labels."
