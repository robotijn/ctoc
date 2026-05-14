---
iron_loop: true
approved_by: human
approved_at: 2026-05-14T16:37:44.268Z
gate_crossed: implementation → todo
approved_by: human
approved_at: 2026-05-14T16:20:27.827Z
gate_crossed: functional → implementation
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
files:
  - "agents/_shared/no-stub-rule.md"
  - "agents/_shared/async-choice-protocol.md"
  - "agents/_shared/ancestry-read.md"
  - "agents/_shared/**"
  - "agents/planning/**"
  - "agents/iron-loop/**"
  - "agents/coordinator/cto-chief.md"
  - "CLAUDE.md"
  - "docs/IRON_LOOP.md"
  - "src/lib/init-project.js"
  - "tests/agent-modernization.test.js"
  - ".ctoc/audit/agent-modernization/**"
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


---

## 4. PLAN — Technical Approach

### Solution Overview
Modernize orchestrator agents in two layers:
1. **Shared prompt fragments** under `agents/_shared/`: `no-stub-rule.md`, `async-choice-protocol.md`, `ancestry-read.md`. Each is a short reusable snippet that orchestrator prompts can reference.
2. **Per-agent updates**: each orchestrator gets frontmatter additions (`effort`, `reads_ancestry`, `async_choice_protocol`, `model_optimized_for`) and prompt-body additions referencing the shared fragments. 10-round integrator+critic per agent, diff captured under `.ctoc/audit/agent-modernization/<agent>.diff.md`.

### Technology Choices
| Component | Technology | Rationale |
|---|---|---|
| Shared prompt fragments | Markdown files | Loaded by reference; no exec; trivial to update |
| Per-agent modernization | Direct file edit | One commit per agent (or per agent-cluster) so each is reviewable |
| 10-round critic | Manual orchestration via Claude | Mirrors the existing iron-loop integrator pattern |
| Diff capture | Plain markdown diff files | Human-auditable; not a system requirement, but useful for future review |

### Architecture Decision Records

#### ADR-1: agents/_shared/ for cross-agent prompt fragments
- **Context**: Multiple agents need the same no-stub / async-choice / ancestry-read instructions
- **Decision**: New directory `agents/_shared/` with three foundational snippets; each agent imports by reference (string include in prompt)
- **Consequences**: + Single source of truth per principle. + Update once, all agents benefit. − One indirection (small)

#### ADR-2: Modernization is incremental, not big-bang
- **Context**: 12 orchestrators × 10 rounds is a lot of work
- **Decision**: Modernize in batches of 3-4 agents per commit. Each batch is independently reviewable and revertible
- **Consequences**: + Smaller PRs, lower review burden. + Failures isolated to one batch. − Modernization takes longer (acceptable)

#### ADR-3: Conservative frontmatter (4 new fields, not 10)
- **Context**: Could add many declared properties (token budgets, retry counts, etc.)
- **Decision**: Add only `effort`, `reads_ancestry`, `async_choice_protocol`, `model_optimized_for`. Other declarations stay implicit
- **Consequences**: + Easier to maintain. + Lower cognitive load on contributors. − Some advanced features (task budgets) need adding later if needed

#### ADR-4: 10-round critic is human-orchestrated, not automated
- **Context**: An automated 10-round loop is possible but expensive
- **Decision**: Claude (with help from the integrator pattern) runs the 10 rounds per agent on demand, captures diffs to `.ctoc/audit/agent-modernization/`. Not run in CI
- **Consequences**: + Lower compute cost. + Each pass benefits from fresh context. − Cannot run all 12 agents in one batch; sequential

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Modernization breaks existing agent behavior | Medium | High | Per-batch tests; revert per batch if regression detected |
| Shared fragments diverge from cited principles | Low | Medium | Tests in `tests/agent-modernization.test.js` verify each agent imports the right snippet IDs |
| 10-round critic produces low-quality output | Medium | Medium | Capture diffs to audit/, manual review at end of each batch |
| init-project.js fails to create agents/_shared/ on existing projects | Medium | Medium | SessionStart hook creates it lazily if missing |

---

## 5. DESIGN — Architecture

### Orchestrator List (12 agents to modernize)

| Agent | Path | Role |
|---|---|---|
| vision-advisor | `agents/planning/vision-advisor.md` | Step 1 — IDEATE |
| vision-decomposer | `agents/planning/vision-decomposer.md` | Step 2 — ASSESS |
| product-owner | `agents/planning/product-owner.md` | Step 3 — ALIGN |
| implementation-planner | `agents/planning/implementation-planner.md` | Steps 5-7 |
| iron-loop-executor | `agents/iron-loop/iron-loop-executor.md` | Drives Steps 8-15 |
| iron-loop-critic | `agents/iron-loop/iron-loop-critic.md` | Critique loop |
| iron-loop-integrator | `agents/iron-loop/iron-loop-integrator.md` | Integration loop |
| cto-chief | `agents/coordinator/cto-chief.md` | Top-level coordinator |

(Additional agents per category may need modernization; final list locked during execution as the audit progresses.)

### Shared Fragment Format

`agents/_shared/no-stub-rule.md`:
```
## No-stub rule (v7)
When you hit ambiguity, make a documented reasonable choice and continue with
working code. Never write stubs, TODOs, or "to be filled in" markers. Document
each choice in the plan's `## Decisions Taken Under Ambiguity` section. Wrong
choices are caught at review and kicked back; stubs are not caught and rot.
```

`agents/_shared/async-choice-protocol.md`:
```
## Async overnight protocol (v7)
Do not synchronously block on ambiguity. The user is asleep. Make a documented
choice and continue. Kickback handles wrong calls. Applies to every step
(Steps 1-15), not just the implementer.
```

`agents/_shared/ancestry-read.md`:
```
## Ancestry read (v7)
First action: read the full plan ancestry — vision → canvas (if exists) →
functional → implementation. Use exact step labels (TEST, PREPARE, IMPLEMENT,
REVIEW, OPTIMIZE, SECURE, VERIFY, DOCUMENT, FINAL-REVIEW). The plan-validator
rejects non-matching labels.
```

### Per-Agent Frontmatter Additions

```yaml
effort: xhigh|high|medium|low      # xhigh for design/migration/review
reads_ancestry: true               # mandatory for step-N agents N>=5
async_choice_protocol: enabled
model_optimized_for: opus-4-7
```

### init-project.js Updates

Add `agents/_shared/` to the list of CTOC directories created during init (per I13). On existing projects, SessionStart hook detects missing directory and creates it lazily.

---

## 6. SPEC — Technical Specification

### File Changes

| File | Action | Description |
|---|---|---|
| `agents/_shared/no-stub-rule.md` | Create | No-stub rule snippet |
| `agents/_shared/async-choice-protocol.md` | Create | Async-choice protocol snippet |
| `agents/_shared/ancestry-read.md` | Create | Ancestry-read mandate snippet |
| `agents/planning/vision-advisor.md` | Modify | Add v7 frontmatter + reference shared fragments |
| `agents/planning/vision-decomposer.md` | Modify | Same (already partly modernized for canvas in A1) |
| `agents/planning/product-owner.md` | Modify | Same |
| `agents/planning/implementation-planner.md` | Modify | Same |
| `agents/iron-loop/iron-loop-executor.md` | Modify | Same |
| `agents/iron-loop/iron-loop-critic.md` | Modify | Same |
| `agents/iron-loop/iron-loop-integrator.md` | Modify | Same |
| `agents/coordinator/cto-chief.md` | Modify | Same |
| `src/lib/init-project.js` | Modify | Add `agents/_shared` to CTOC_DIRS |
| `tests/agent-modernization.test.js` | Create | Tests: each modernized agent declares required frontmatter + includes shared-fragment references |
| `.ctoc/audit/agent-modernization/*.diff.md` | Create per agent | Captures the 10-round modernization diff |

### Implementation Steps

1. [ ] Create `agents/_shared/` with the 3 foundational snippets
2. [ ] Update `src/lib/init-project.js` to include `agents/_shared` in CTOC_DIRS
3. [ ] Write `tests/agent-modernization.test.js` (TDD red — assert frontmatter present for each agent)
4. [ ] Batch 1: modernize planning agents (vision-advisor, vision-decomposer, product-owner, implementation-planner) — 4 agents
5. [ ] Batch 2: modernize iron-loop agents (executor, critic, integrator) — 3 agents
6. [ ] Batch 3: modernize cto-chief — 1 agent
7. [ ] Per batch: run 10 rounds of integrator+critic, capture diff, run full test suite
8. [ ] Each batch commits independently (one or more agents per commit)

### Test Plan

| Test Type | Coverage | Files |
|---|---|---|
| Unit | Each modernized agent file: frontmatter complete, shared-fragment refs present | tests/agent-modernization.test.js |
| Integration | Existing planning workflow tests still pass | tests/iron-loop.test.js, tests/pipeline.test.js |
| Regression | Pre-v7 plans process correctly through modernized agents | tests/plan-validator.test.js |

### Dependencies

- A1 (canvas layer) — vision-decomposer agent already references it
- A2 (sections) — modernized agents' prompts reference Pipeline Philosophy
- C1 (enforcement hook) — modernized agents are written knowing the hook is active

### Rollback Plan

- Modernization is per-agent — revert affected agent's commit to restore prior behavior
- `agents/_shared/` is purely additive; can be deleted without breaking pre-v7 agents
- init-project.js change is forward-compatible (new directory)

---

## Approval

**Status**: Pending Approval (Gate 2: implementation → todo)


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


---

## Execution Status — B1 PHASE 1 STATUS (v6.3.3)

### Step 8: TEST ✓ — tests/agent-modernization.test.js (13 tests)
### Step 10 IMPLEMENT (Phase 1 of 2)
- [x] agents/_shared/no-stub-rule.md
- [x] agents/_shared/async-choice-protocol.md
- [x] agents/_shared/ancestry-read.md
- [x] src/lib/init-project.js — CTOC_DIRS includes agents/_shared, .ctoc/inbox/{questions,decisions}, .ctoc/audit/{agent-modernization,skill-conversion}; PLAN_DIRS includes plans/canvas, plans/in-progress
- [x] agents/planning/vision-advisor.md — modernized
- [x] agents/planning/product-owner.md — modernized
- [x] agents/planning/implementation-planner.md — modernized

### B1 Phase 2 — DEFERRED to follow-up commit(s)
- [ ] agents/planning/vision-decomposer.md (already has partial v7 from A1)
- [ ] agents/iron-loop/iron-loop-executor.md
- [ ] agents/iron-loop/iron-loop-critic.md
- [ ] agents/iron-loop/iron-loop-integrator.md
- [ ] agents/coordinator/cto-chief.md
- [ ] 10-round integrator+critic per agent (deferred; not gated on by Phase 1)
- [ ] .ctoc/audit/agent-modernization/<agent>.diff.md (captured during Phase 2)

### Step 14: VERIFY ✓ — 870 tests pass, 0 fails (was 857 before B1 Phase 1)

## Decisions Taken Under Ambiguity (B1 Phase 1)
1. **Effort level for all 3 orchestrators = xhigh**: they're design/review heavy steps (1, 3-4, 5-6). Matches Opus 4.7 best-practice guidance.
2. **10-round integrator+critic per agent DEFERRED**: Phase 1 is the foundation (snippets + init + 3 agents). The 10-round critic is high-cost; running it on 12 agents in one session is unrealistic. Phase 2 commits run the critic per-agent and capture diffs.
3. **Shared snippet refs use markdown links not include directives**: agents are read by Claude as plain markdown; there's no include mechanism. The reader resolves the link semantically.
4. **agents/_shared/ added at top of CTOC_DIRS but NOT inside agents-prefixed namespace**: still in agents/ tree but isolated by underscore prefix. Distinguishes from real agent files.
