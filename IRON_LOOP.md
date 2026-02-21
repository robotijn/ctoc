# CTOC -- Iron Loop

> **Iron Loop is CTOC's methodology for quality software delivery.**
> From ideation to working implementation, every feature follows 15 steps.
>
> **You do not need to memorize this.** CTO Chief guides you through each step automatically. This document is a reference for when you want to understand why CTO Chief asks a particular question, or when you want to customize the process.

---

## Why Iron Loop Exists

AI coding assistants write code fast. Too fast. Without discipline, they produce code that solves the wrong problem, breaks existing features, ships vulnerabilities, and is unmaintainable.

Iron Loop is the discipline. It forces AI to plan before coding, test before implementing, and verify before shipping. The methodology is enforced by hooks, not honor — if an agent tries to write code before planning, the hook blocks it; if it skips verification, the quality gate fails.

Three checkpoints give the human final authority:
1. **You approve what to build** (after functional planning)
2. **You approve how to build it** (after technical planning)
3. **You approve the result** (after implementation and verification)

Nothing ships without your explicit approval.

---

## The 15 Steps at a Glance

| Step | Name | One-Liner |
|------|------|-----------|
| 1 | ASSESS | Understand the problem before proposing solutions |
| 2 | ALIGN | Connect the solution to user goals and business value |
| 3 | CAPTURE | Write requirements as testable BDD scenarios |
| 4 | PLAN | Choose the technical approach with tradeoffs documented |
| 5 | DESIGN | Define the architecture: components, interfaces, data flow |
| 6 | SPEC | Refine until the plan survives 10 rounds of adversarial review |
| 7 | TEST | Write failing tests first — code does not exist yet |
| 8 | PREPARE | Set up the environment and scan existing code for risks |
| 9 | IMPLEMENT | Write all the code in one step, sub-items for each file |
| 10 | REVIEW | Self-review: does this code do what the plan said? |
| 11 | OPTIMIZE | Simplify, remove redundancy, improve performance |
| 12 | SECURE | Scan for vulnerabilities: OWASP Top 10, input validation, secrets |
| 13 | VERIFY | Automated gate: lint + typecheck + ALL tests + coverage >= 80% |
| 14 | DOCUMENT | Update docs to match the code that was actually written |
| 15 | FINAL-REVIEW | Human reviews the result and decides: ship, fix, or scrap |

---

## Iron Loop Overview

```
IDEATION (Optional) - Vision Phase
-------------------------------------------------------------
User dumps an idea → product-owner + vision agents explore it
  |-- What problem are we solving?
  |-- Who benefits and how?
  |-- What are the constraints?
  |-- Decompose into actionable plans
  |-> Skip if the user already has a clear, specific request
  |-> Output: one or more plans ready for Phase 1

PHASE 1: FUNCTIONAL PLANNING (Steps 1-3) - Product Owner Role
-------------------------------------------------------------
1. ASSESS        Problem understanding              [product-owner]
2. ALIGN         User goals & business objectives   [product-owner]
3. CAPTURE       Requirements as BDD specs          [functional-reviewer] <--|
   |-> Reject? Back to Step 1 ------------------------------------------|
   |-> HUMAN GATE: User approves functional plan

PHASE 2: IMPLEMENTATION PLANNING (Steps 4-6) - Technical Role
-------------------------------------------------------------
4. PLAN          Technical approach                 [implementation-planner]
5. DESIGN        Architecture design                [implementation-planner]
6. SPEC          Detailed specifications            [implementation-plan-reviewer] <--|
   |-> Reject? Back to Step 4 ---------------------------------------------------|
   |-> Approve -> [iron-loop-plan-integrator] + [iron-loop-plan-critic] refine
       |-- 10 rounds max refinement (6-dimension rubric)
       |-- All 5/5? -> Iron-solid execution plan
       |-- Max rounds? -> Auto-approve + Deferred Questions for Step 15
   |-> HUMAN GATE: User approves technical approach

PHASE 3: IMPLEMENTATION (Steps 7-15) - Execution
-------------------------------------------------------------
7.  TEST         Write tests FIRST (TDD Red)        [test-maker]
8.  PREPARE      Prepare environment + shift-left   [quality-checker]
9.  IMPLEMENT    ALL code changes (single step)     [implementer]
10. REVIEW       Self-review checkpoint             [self-reviewer] <---|
    |-> TDD Loop: Need more tests? -> Back to Step 7 ------------------|

11. OPTIMIZE     Performance + code simplification  [optimizer]
12. SECURE       Security vulnerability check       [security-scanner]
13. VERIFY       Run ALL quality checks (gate)      [verifier]
14. DOCUMENT     Update documentation               [documenter]
15. FINAL-REVIEW Verify steps 7-14, human gate      [implementation-reviewer]
    |-> Issues? Smart kickback to affected step
    |-> HUMAN GATE: User approves commit/push
```

### Why Ideation Matters

Without ideation, Claude Code tends to jump straight to writing code — bypassing hooks and gates by treating requests as "trivial." The ideation phase gives the AI a structured entry point: explore the idea first, shape it with the product-owner agent, then flow naturally into the 15-step loop.

**When to use ideation:**
- You have a vague idea ("I want better error handling")
- You want to explore before committing to a direction
- You want the product-owner agent to ask the right questions

**When to skip ideation:**
- You have a precise, specific request ("Add a /health endpoint returning 200 OK")
- You're fixing a known bug with clear reproduction steps
- You say any escape phrase ("quick fix", "trivial change", etc.)

---

## Definitions of Ready

Each phase has entry criteria. Work cannot proceed until these are met.

### Phase 1 Entry (Steps 1-3)
- Problem statement exists (even if informal)
- User is available for clarification
- No duplicate plan already in progress

### Phase 2 Entry (Steps 4-6)
- Functional plan approved by user (Gate 1 passed)
- BDD scenarios defined with Given/When/Then
- Definition of Done is testable and measurable

### Phase 3 Entry (Steps 7-15)
- Implementation plan approved by user (Gate 2 passed)
- Integrator+Critic loop completed (all 5/5 or max rounds)
- Execution plan has concrete file paths and actions
- No blocking dependencies on other in-progress plans
- *Guideline*: plan touches <= 15 files (if more, consider splitting into multiple plans)

---

## MANDATORY Step Labels (Steps 7-15)

These step labels are MANDATORY and must NOT be modified, replaced, or reordered. They define the quality process.

```
TEST -> PREPARE -> IMPLEMENT -> REVIEW -> OPTIMIZE -> SECURE -> VERIFY -> DOCUMENT -> FINAL-REVIEW
  7       8          9           10        11         12        13        14          15
```

| Step | Label | Purpose | NEVER Replace With |
|------|-------|---------|-------------------|
| 7 | TEST | Write tests FIRST (TDD Red) | "Identify coverage" |
| 8 | PREPARE | Prepare environment, install deps, shift-left scans | "QUALITY", "SETUP" |
| 9 | IMPLEMENT | ALL code changes (single step with sub-items) | Multiple IMPLEMENT steps |
| 10 | REVIEW | Self-review checkpoint (logic only) | IMPLEMENT |
| 11 | OPTIMIZE | Performance and simplification | IMPLEMENT |
| 12 | SECURE | Security vulnerability check | IMPLEMENT |
| 13 | VERIFY | Run ALL quality checks (lint, type, tests, coverage) | Manual verification |
| 14 | DOCUMENT | Update documentation | VERIFY |
| 15 | FINAL-REVIEW | Verify steps 7-14, ready for human gate | VERIFY, COMMIT |

### Key Rules

1. **Step 7 is TDD** - Must WRITE tests, not just "identify existing coverage"
2. **Step 8 is PREPARE** (not QUALITY) - Prepare environment AND run shift-left scans (SAST/SCA on existing code)
3. **Step 9 is ONE step** - Multiple files = sub-items under Step 9, NOT separate IMPLEMENT steps
4. **Step 13 is automated VERIFY** - Lint, type check, ALL tests, coverage >= 80%, 0 skipped, 0 flaky
5. **Step 15 is FINAL-REVIEW** (not COMMIT) - Manual verification belongs here, not in Step 13
6. **Order matters** - OPTIMIZE and SECURE may change code, so VERIFY must come AFTER them

### Step 8 PREPARE: Shift-Left Security

Step 8 now includes shift-left security scanning (research: catching defects early costs 10-100x less):

```
Step 8: PREPARE
  - Install/verify dependencies
  - Verify build tools are available
  - Run SAST on existing code touching the same modules
  - Run SCA to check for known vulnerable dependencies
  - Establish performance baselines for affected areas
  - Report findings (info only, does not block - code doesn't exist yet)
```

### Step 13 VERIFY: Quality Gate

Step 13 is the single quality gate. ALL checks must pass before proceeding:

```
Step 13: VERIFY
  - Run lint (eslint, ruff, golangci-lint)
  - Run type check (tsc, mypy, go vet)
  - Run ALL tests (not just affected - full regression)
  - Check coverage >= 80% on new code
  - 0 skipped tests
  - 0 flaky tests (retry 2x, then block)
  - Run SAST on new/changed code
  - Run SCA on updated dependencies

  If ANY check fails -> SMART KICKBACK:
  - Lint errors      -> Step 9 (IMPLEMENT)
  - Type errors      -> Step 9 (IMPLEMENT)
  - Tests fail       -> Step 9 (IMPLEMENT)
  - Security issue   -> Step 12 (SECURE)
  - Perf regression  -> Step 11 (OPTIMIZE)
  - Coverage < 80%   -> Step 7 (TEST)
```

### Idempotent Steps

Every step MUST be safe to re-run. If a kickback sends execution back to a previous step, all subsequent steps re-execute cleanly. This means:
- Step 7 (TEST): Check for existing tests before creating duplicates
- Step 8 (PREPARE): Verify state before installing (don't re-install what exists)
- Step 9 (IMPLEMENT): Check git diff before making changes already applied
- Step 13 (VERIFY): Always runs fresh (no cached results)

### Proportional Loop Depth

Not every change needs the full 15-step ceremony. Match rigor to risk:

| Change Type | Example | Steps to Run | Steps Skipped |
|-------------|---------|-------------|---------------|
| **Typo/config** | Fix spelling, update timeout | 9, 13 | All others |
| **Bug fix (obvious)** | Off-by-one in loop | 7, 9, 13, 15 | 1-6, 8, 10-12, 14 |
| **Standard feature** | Add copy-to-clipboard button | All 15 | None |
| **Architecture change** | Replace REST with GraphQL | All 15 + extended I+C (15 rounds) | None |

**The rule**: You can skip PREPARE, REVIEW, OPTIMIZE, SECURE, DOCUMENT. You can NEVER skip TEST (7) or VERIFY (13).

Escape phrases to enter micro mode: "skip planning", "skip iron loop", "quick fix", "trivial fix", "trivial change", "hotfix", "urgent".

### Circuit Breaker

Kickbacks are normal — they mean the quality gate is working. But infinite loops are not.

| Limit | Threshold | Action |
|-------|-----------|--------|
| Same-step kickbacks | 3 | Stop. Escalate to user with diagnosis. |
| Total kickbacks per plan | 5 | Stop. Present full kickback history + root cause analysis. |

When the circuit breaker trips, present:
1. Which steps keep failing and why
2. What was tried each time
3. Recommended path forward (fix approach vs. descope vs. manual intervention)

### Roadmap

Future enhancements (not yet implemented):

- **Step Timing** — Record duration per step to identify bottlenecks and optimize the loop
- **Failure Budgets** — Track quality failures across plans monthly; alert when threshold exceeded
- **Retrospective Feedback Loop** — Auto-generate retrospective every 5 completed plans (what worked, what didn't, improvement actions)

### Validation

Step labels are validated programmatically by `lib/plan-validator.js` and enforced by `hooks/validate-plan-steps.js`. Plans with wrong labels are REJECTED before execution.

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
4. **Acceptance Criteria** - Measurable success conditions

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

  Definition of Done:
    - All scenarios pass as automated tests
    - Login attempt rate limiting is implemented
    - Session management follows OWASP guidelines
    - Error messages don't leak user existence
```

### Escape Hatch
Even trivial requests get a mini-plan with test. User can override with any escape phrase:
"skip planning", "skip iron loop", "quick fix", "trivial fix", "trivial change", "hotfix", "urgent"

---

## Hook Enforcement

The Iron Loop is enforced by hooks that run before every Edit/Write operation.

### How It Works

```
On Edit/Write tool call:
|-- Load Iron Loop state
|-- Check enforcement mode (strict/soft/off)
|-- Check if file is whitelisted (*.md, *.yaml, .ctoc/**)
|   |-- If whitelisted -> ALLOW
|-- Check for escape phrase in user message
|   |-- If found -> ALLOW
|-- Check currentStep
|   |-- If step >= 7 -> ALLOW
|   |-- If step < 7 -> BLOCK (exit 1)
```

### Enforcement Modes

Currently only `strict` mode is implemented. `soft` and `off` are planned.

| Mode | Behavior | Status |
|------|----------|--------|
| `strict` | Block Edit/Write if planning incomplete (default) | Implemented |
| `soft` | Warn but allow Edit/Write | Planned |
| `off` | No enforcement | Planned |

### Whitelisted Files

These files bypass enforcement (hooks allow them regardless of step):
- `.ctoc/**` - CTOC configuration
- `.local/**` - Local state
- `plans/*.md` - Plan files
- `.gitignore`, `.gitattributes` - Git configuration

### Escape Phrases

User can bypass enforcement by including these phrases in their message. Claude interprets them and adjusts behavior accordingly:
- "skip planning" / "skip iron loop"
- "quick fix" / "trivial fix" / "trivial change"
- "hotfix" / "urgent"

Note: Escape phrases are interpreted by Claude via CLAUDE.md instructions, not enforced programmatically by hooks.

---

## Crash Recovery

When an implementation session (Steps 7-15) is interrupted, CTOC automatically detects and offers recovery. Detection is implemented in `hooks/SessionStart.js` with state managed by `lib/state-manager.js`.

### Detection Criteria

A session is considered interrupted if:
1. `sessionStatus` is "active" (not cleanly ended)
2. `currentStep` is between 7 and 15 (implementation phase)
3. `lastActivity` is within the last 24 hours

### Recovery Options

| Option | What It Does |
|--------|-------------|
| Resume | Continue from the last completed step |
| Restart | Start implementation fresh from Step 7 (tests preserved) |
| Discard | Abandon this implementation entirely |

### Session Lifecycle

- **Session Start**: Sets `sessionStatus: "active"`, updates `lastActivity`
- **Every Step Completion**: Updates `lastActivity` and `lastCompletedStep`
- **Clean Exit**: Sets `sessionStatus: "ended"`

---

## Integrator + Critic Loop

When an implementation plan is approved at Step 6, the **Integrator** and **Critic** agents refine it into an iron-solid execution plan.

### How It Works

```
Input: Approved Implementation Plan

  Round N:
    [Integrator] -> Creates/refines execution plan (Steps 7-15)
    [Critic]     -> Scores 6 dimensions (all must be 5/5)

  If any < 5:
    Critic provides: reason + suggested fix
    Integrator refines, loop continues...

  Termination:
    - All 5/5: Iron-solid plan ready
    - Max rounds (10): Auto-approve + Deferred Questions

  Output: Execution plan appended to the plan file in plans/implementation/
```

### 6-Dimension Rubric

Each dimension scored 1-5. All must reach 5/5 for auto-approval.

| Dimension | Score 5/5 Means | Common Failure Modes |
|-----------|-----------------|---------------------|
| **Completeness** | All steps have actions, all modules covered, 80% coverage baseline | Missing edge case handling, incomplete rollback plan |
| **Clarity** | Unambiguous instructions, single responsibility, self-documenting | Vague "update as needed", multi-purpose steps |
| **Edge Cases** | Error handling, fallback behavior, rollback plan, timeout handling | Happy path only, no error recovery |
| **Efficiency** | Minimal steps, no redundancy, parallelizable, token budget reasonable | Redundant checks, over-engineered steps |
| **Security** | OWASP Top 10, input validation, no secrets, protected endpoints | Missing auth checks, unvalidated input |
| **Observability** | Logging at key points, metrics for monitoring, error tracing, health checks | Silent failures, no monitoring hooks |

### Example Critic Response

```
Round 3 of 10:

  Completeness:   5/5
  Clarity:        5/5
  Edge Cases:     3/5 — Step 9 does not specify behavior when database
                         is unreachable. Add: "If DB down, /health
                         returns 503 with { status: 'degraded' }."
  Efficiency:     5/5
  Security:       5/5
  Observability:  4/5 — No logging on health check failure.
                         Add: "Log warning on 503 response."

  Result: NOT APPROVED — 2 dimensions below 5/5.
  Integrator will refine and re-submit.
```

### Deferred Questions

When max rounds (10) is reached and some dimensions still score < 5, unresolved issues become **Deferred Questions** presented at Step 15 (FINAL-REVIEW) with context, options, and pros/cons.

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `integration.max_rounds` | 10 | Maximum refinement rounds |
| `integration.quality_threshold` | 5 | All dimensions must meet this |
| `integration.auto_approve_after_max` | true | Auto-approve after max rounds |
| `integration.defer_unresolved` | true | Store unresolved as Deferred Questions |

### Implementation

Implemented in `lib/iron-loop.js`. Triggered automatically when an implementation plan is approved via `approvePlan()` in `lib/actions.js`. Plan status is tracked in YAML frontmatter, not subdirectories.

---

## 3 Human Gates

| Gate | Transition | User Decision |
|------|------------|---------------|
| Gate 1 | Functional -> Implementation | "Approve functional plan?" |
| Gate 2 | Implementation -> Todo | "Approve technical approach?" |
| Gate 3 | Final Review -> Done | "Commit/push or send back?" |

---

## Kanban Board (7 Columns)

```
+----------+ +----------+ +----------+ +----------+ +-----------+ +----------+ +----------+
|  vision  | |functional| |implement.| |   todo   | |in-progress| |  review  | |   done   |
+----------+ +----------+ +----------+ +----------+ +-----------+ +----------+ +----------+
| Ideas    | | Steps 1-3| | Steps 4-6| | Backlog  | | Steps 7-14| | Step 15  | |Completed |
|          | | BDD specs| | Technical| | Ready to | | Active    | | Human    | |          |
|          | |          | | approach | | start    | | work      | | gate     | |          |
+----------+ +----------+ +----------+ +----------+ +-----------+ +----------+ +----------+
               |             |                                        |
            [HUMAN]       [HUMAN]                                  [HUMAN]
```

Column order follows the plan lifecycle left-to-right. `in-progress` is a logical state tracked in plan YAML frontmatter; plans physically remain in `todo/` until moved to `review/`.

---

## 14 Quality Dimensions (ISO 25010 aligned)

| # | Dimension | Key Checks | Evaluated At |
|---|-----------|------------|-------------|
| 1 | Correctness | Tests meaningful, edge cases, business logic | Step 10 (REVIEW), Step 13 (VERIFY) |
| 2 | Completeness | All criteria met, implicit requirements | Step 10 (REVIEW), Step 15 (FINAL-REVIEW) |
| 3 | Maintainability | Patterns, no smells, readable by junior | Step 10 (REVIEW), Step 11 (OPTIMIZE) |
| 4 | Security | OWASP, validation, auth/authz | Step 8 (PREPARE), Step 12 (SECURE) |
| 5 | Performance | No N+1, caching, response time | Step 11 (OPTIMIZE), Step 13 (VERIFY) |
| 6 | Reliability | Error handling, retries, fault tolerance | Step 10 (REVIEW), Step 15 (FINAL-REVIEW) |
| 7 | Compatibility | API backwards compat, integrations | Step 10 (REVIEW) |
| 8 | Usability | Error messages, clear output, docs | Step 14 (DOCUMENT), Step 15 (FINAL-REVIEW) |
| 9 | Portability | No hardcoded paths, cross-platform | Step 10 (REVIEW), Step 13 (VERIFY) |
| 10 | Testing | 80%+ coverage on new code, isolation, happy+error paths | Step 7 (TEST), Step 13 (VERIFY) |
| 11 | Accessibility | WCAG 2.2, screen reader, keyboard | Step 10 (REVIEW), Step 15 (FINAL-REVIEW) |
| 12 | Observability | Logging, metrics, tracing, alerts | Step 10 (REVIEW), Step 15 (FINAL-REVIEW) |
| 13 | Safety | No harm, graceful degradation | Step 12 (SECURE), Step 15 (FINAL-REVIEW) |
| 14 | Ethics/AI | Bias, fairness, explainability | Step 15 (FINAL-REVIEW) |

---

## Agent Registry

Model assignments indicate recommended complexity tier. Actual model depends on user configuration.

| Agent | Model | Steps | Role |
|-------|-------|-------|------|
| cto-chief | opus | 1-15 | Coordinator |
| product-owner | sonnet | 1-3 | BDD Specs (Product Owner) |
| functional-reviewer | opus | 3 | Review Gate |
| implementation-planner | opus | 4-6 | Technical Planning |
| implementation-plan-reviewer | opus | 6 | Review Gate |
| iron-loop-plan-integrator | opus | 6 | Creates execution plans |
| iron-loop-plan-critic | opus | 6 | Reviews execution plans (6-dim rubric) |
| test-maker | opus | 7 | TDD Red (write tests FIRST) |
| quality-checker | sonnet | 8 | Prepare environment + shift-left |
| implementer | sonnet | 9 | ALL code changes |
| self-reviewer | opus | 10 | Self-review checkpoint |
| optimizer | sonnet | 11 | Performance + Simplification |
| security-scanner | opus | 12 | Security vulnerability check |
| verifier | sonnet | 13 | Quality gate (lint, type, tests, SAST) |
| documenter | sonnet | 14 | Documentation |
| implementation-reviewer | opus | 15 | Final review + human gate |

---

## Quality Non-Negotiables

### 1. NO SILENT TEST FAILURES

**Tests must NEVER silently fail.** This is the #1 quality rule.

| Pattern | Status | Why |
|---------|--------|-----|
| Empty catch blocks | BLOCK | Hides failures |
| Early return without assertion | BLOCK | Test passes without testing |
| Tests without assertions | BLOCK | Always passes |
| Fixture errors swallowed | BLOCK | Setup failures hidden |
| Skip without reason | BLOCK | Unclear why skipped |

**If a test cannot run, it must FAIL LOUDLY. Period.**

### 2. Docker Projects Must Test Containers

If the project has `Dockerfile` or `docker-compose.yml`: build, health-check, and test against the container before deploy.

### 3. Tests Run Exactly As CI

Local tests must use the same commands, flags, and environment as CI. If it passes locally but fails in CI, local setup is wrong.

### 4. Zero Tolerance for Flaky Tests

Flaky tests erode trust in the entire quality system. A flaky test is retried 2x. If it still flickers, it is marked as a blocking issue that must be fixed before any new features proceed.

---

## Plans Directory

```
plans/
|-- vision/                 # Ideas and explorations (pre-planning)
|-- functional/             # Steps 1-3 plans (BDD specs)
|-- implementation/         # Steps 4-6 plans (technical approach)
|-- todo/                   # Backlog (ready for execution)
|-- review/                 # Awaiting final human review (Step 15)
|-- done/                   # Completed
```

Plan state (draft vs. approved, in-progress tracking) is managed via YAML frontmatter inside each plan file, not via subdirectories. The `execution/` output from the Integrator+Critic loop is embedded in the plan file itself.

---

## Expected Step Duration

These are guidelines, not hard limits. If a step takes significantly longer, the plan may need splitting.

| Step | Expected Duration | If Longer, Consider |
|------|-------------------|---------------------|
| 1-3 (Functional) | 5-15 minutes | Problem may be poorly defined |
| 4-5 (Technical) | 10-30 minutes | Plan may need splitting |
| 6 (Integrator+Critic) | 5-20 minutes | Max 10 rounds, auto-approve if stuck |
| 7 (TEST) | 5-15 minutes | Too many test cases; focus on critical paths |
| 8 (PREPARE) | 2-5 minutes | Environment issues; fix before proceeding |
| 9 (IMPLEMENT) | 10-60 minutes | Plan touches too many files (>15 = split) |
| 10-12 (Review cycle) | 5-10 minutes each | Findings may require kickback |
| 13 (VERIFY) | 2-5 minutes | Failures trigger smart kickback |
| 14-15 (Finalize) | 5-10 minutes | Should be fast if earlier steps were thorough |

---

*Last updated: 2026-02-21*
