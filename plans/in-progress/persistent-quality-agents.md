# Persistent Quality Agents

## Problem Statement

Quality enforcement is currently reactive - checks run only when triggered. There's no continuous monitoring to catch issues as they happen, fix CI failures automatically, or maintain coverage targets proactively.

## Proposed Solution

Implement a **single orchestrator** (CTO Chief) with **unified agents** (no separate "light" vs "full" checks):

```
┌─────┬─────────────────────┬─────────────────────────────┬───────────┐
│ #   │ Agent               │ Responsibility              │ Type      │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ ★   │ CTO CHIEF           │ Event monitor, dispatches   │ ALWAYS ON │
│     │ (Orchestrator)      │ Mode detection, gate track  │           │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│     │ UNIFIED AGENTS (merged, always strict)            │           │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 1   │ QUALITY AGENT       │ Lint + typecheck + format   │ On-demand │
│     │ (quality-checker    │ STRICT MODE ALWAYS          │ Step 8,10 │
│     │  + QA Engineer)     │ Zero warnings tolerated     │ + events  │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 2   │ TEST AGENT          │ Run tests + track coverage  │ On-demand │
│     │ (verifier +         │ Block if <95%, target 100%  │ Step 7,13 │
│     │  Coverage Engineer) │ TDD enforcement             │ + events  │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 3   │ SECURITY AGENT      │ SAST + secrets + deps       │ On-demand │
│     │ (security-scanner   │ Full scan, no shortcuts     │ Step 12   │
│     │  merged)            │ OWASP Top 10 + CVEs         │ + events  │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│     │ SPECIALIZED AGENTS (Iron Loop only)               │           │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 4   │ test-maker          │ Write tests (TDD Red)       │ Step 7    │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 5   │ implementer         │ Write code                  │ Step 9    │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 6   │ self-reviewer       │ Self-review implementation  │ Step 10   │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 7   │ optimizer           │ Performance + simplify      │ Step 11   │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 8   │ documenter          │ Update documentation        │ Step 14   │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 9   │ impl-reviewer       │ Final review + Gate 3       │ Step 15   │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│     │ MONITORING AGENTS (events only)                   │           │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 10  │ CI Watcher          │ Monitor CI, diagnose fails  │ On push   │
├─────┼─────────────────────┼─────────────────────────────┼───────────┤
│ 11  │ Release Manager     │ Auto-release when all green │ All pass  │
└─────┴─────────────────────┴─────────────────────────────┴───────────┘

Key: Unified agents serve BOTH Iron Loop steps AND continuous monitoring.
     Always strict. Block on failure. No "quick" shortcuts.
```

### Agent Definitions

#### 1. CI Watcher
**Trigger:** Git push / PR creation
**Responsibilities:**
- Watch GitHub Actions / GitLab CI status
- On failure: analyze logs, identify root cause
- Auto-create fix branch if confident
- Alert user if manual intervention needed

**Loop:**
```
while true:
  check CI status (every 30s)
  if failure:
    fetch logs
    analyze error
    if fixable: create PR with fix
    else: notify user with diagnosis
```

#### 2. QA Engineer
**Trigger:** File save / commit
**Responsibilities:**
- Run lint on changed files
- Check type errors
- Validate test coverage on changed code
- Run affected E2E tests
- Enforce code standards

**Loop:**
```
while true:
  watch for file changes
  on change:
    lint changed files
    type-check
    run related tests
    if E2E affected: queue E2E run
    report issues inline
```

#### 3. CI/CD Monitor
**Trigger:** Deployment failure
**Responsibilities:**
- Monitor deployment pipeline (Railway, Vercel, etc.)
- On failure: analyze build/deploy logs
- Fix configuration issues
- Retry until green

**Loop:**
```
while true:
  monitor deployment status
  if failed:
    analyze logs
    attempt fix (env vars, deps, config)
    trigger redeploy
    repeat until success or max retries
```

#### 4. Coverage Engineer
**Trigger:** Test completion
**Responsibilities:**
- Track coverage metrics (target: 100%, minimum: 95%)
- Identify uncovered critical paths
- Generate test stubs for low-coverage files
- Auto-write tests for uncovered code
- Never let coverage drop

**Loop:**
```
while true:
  after test runs:
    calculate coverage (target: 100%)
    if below 95%: BLOCK (critical)
    if below 100%:
      identify uncovered lines
      auto-generate tests
      run and verify
    report: "Coverage: 98% → 99% (+1%)"
```

**Coverage Tiers:**
- 100% = Gold (ready for release)
- 95-99% = Silver (acceptable, improving)
- <95% = BLOCKED (must fix before push)

#### 5. Security Scanner
**Trigger:** Commit / scheduled scan
**Responsibilities:**
- Run SAST on code changes
- Run DAST on deployed endpoints
- Detect hardcoded secrets
- Check for OWASP Top 10 violations
- Auto-fix when confident, alert otherwise

**Loop:**
```
while true:
  on commit: run SAST
  on deploy: run DAST
  scan for secrets continuously
  if vulnerability found:
    if auto-fixable: create fix PR
    else: create security issue
```

#### 6. Dependency Watcher
**Trigger:** Package file changes / CVE feed
**Responsibilities:**
- Monitor npm/pip/cargo for vulnerabilities
- Auto-update safe patches
- Alert on breaking changes
- Track license compliance

**Loop:**
```
while true:
  check CVE feeds (every hour)
  if new vulnerability affects deps:
    assess severity
    if patch available: create update PR
    else: alert with mitigation
```

#### 7. Tech Debt Monitor
**Trigger:** Code changes / weekly audit
**Responsibilities:**
- Track complexity metrics over time
- Identify AI-induced tech debt patterns
- Flag code duplication growth
- Suggest refactoring priorities

**Loop:**
```
while true:
  after each merge:
    calculate complexity delta
    if complexity increased:
      flag in debt tracker
      suggest simplification
  weekly: generate debt report
```

#### 8. Documentation Agent
**Trigger:** Code changes affecting public API
**Responsibilities:**
- Detect code/doc drift
- Auto-update API docs from code
- Generate missing function docs
- Keep README in sync

**Loop:**
```
while true:
  on API change:
    check if docs updated
    if not: generate doc update PR
  on new export: suggest documentation
```

#### 9. Performance Monitor
**Trigger:** Deploy / scheduled benchmark
**Responsibilities:**
- Run performance benchmarks
- Detect regressions
- Track bundle size
- Monitor runtime metrics

**Loop:**
```
while true:
  after deploy:
    run benchmarks
    compare to baseline
    if regression > 5%:
      alert with profiling data
  track: response times, memory, CPU
```

#### 10. API Contract Agent
**Trigger:** API schema changes
**Responsibilities:**
- Validate OpenAPI/GraphQL schema changes
- Detect breaking changes
- Check backward compatibility
- Verify client contract tests

**Loop:**
```
while true:
  on schema change:
    diff against previous version
    check for breaking changes
    if breaking: block merge, suggest fix
    run contract tests
```

#### 11. Release Manager
**Trigger:** All agents report "ready"
**Responsibilities:**
- Verify all quality gates pass
- Bump version appropriately
- Generate changelog
- Create release PR
- Tag and publish

**Activation:**
```
when:
  CI Watcher: all green
  QA Engineer: no issues
  CI/CD Monitor: deploys working
  Coverage Engineer: target met
  Security Scanner: no vulnerabilities
  Dependency Watcher: no CVEs
  Tech Debt Monitor: debt within budget
  Documentation Agent: docs in sync
  Performance Monitor: no regressions
  API Contract Agent: no breaking changes
then:
  bump version
  generate changelog
  create release
```

## Pre-Review Gate (Highest Standards)

### Core Principle: Tests Are Sacred

```
┌─────────────────────────────────────────────────────────────┐
│                    GOLDEN RULE                              │
│                                                             │
│   Tests fail?  →  FIX THE CODE, NOT THE TESTS              │
│                                                             │
│   Tests are the specification. Code must conform to tests.  │
│   Never weaken tests to make code pass.                     │
└─────────────────────────────────────────────────────────────┘
```

### Pre-Review Gate

**CRITICAL:** Before ANY plan moves to review, ALL checks must pass LOCALLY:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRE-REVIEW GATE                          │
├─────────────────────────────────────────────────────────────┤
│  ALL must pass LOCALLY before plan can enter review:        │
│                                                             │
│  ✓ TypeScript strict mode (zero errors)                     │
│  ✓ ESLint strict-type-checked (zero warnings)               │
│  ✓ Prettier formatting (no diff)                            │
│  ✓ Unit tests pass (100%)                                   │
│  ✓ Integration tests pass (100%)                            │
│  ✓ E2E tests pass (critical paths)                          │
│  ✓ Coverage ≥95% on changed code (target: 100%)             │
│  ✓ No security vulnerabilities (SAST)                       │
│  ✓ No secrets in code                                       │
│  ✓ No high/critical CVEs in deps                            │
│  ✓ Complexity within limits                                 │
│  ✓ Docs updated for API changes                             │
│  ✓ No performance regressions                               │
│  ✓ API contracts valid                                      │
│                                                             │
│  Result: CI WILL pass on push (guaranteed)                  │
└─────────────────────────────────────────────────────────────┘
```

### Correct Workflow (NOT the old way)

**OLD (WRONG):**
```
Execute plan → Move to review → Push → CI fails → Fix
                                         ↑
                                    Wastes time!
```

**NEW (CORRECT):**
```
Execute plan
     ↓
Run ALL tests locally (via subagent)
     ↓
Tests fail? ───YES───→ Fix CODE (not tests!)
     ↓                        ↓
     NO                  Rerun tests
     ↓                        ↓
     ←────────────────────────┘
     ↓
All 14 gates pass locally
     ↓
Push to GitHub (CI guaranteed to pass)
     ↓
Move to Review
```

### Test-Fixing Subagent Behavior

When tests fail, the agent MUST:

```
1. Analyze test failure
2. Identify root cause in CODE (not test)
3. Fix the CODE to satisfy the test
4. Rerun test
5. Repeat until pass

NEVER:
- Delete failing tests
- Weaken assertions
- Skip tests
- Mark tests as .skip()
- Change expected values to match wrong behavior
```

**Example - Correct Fix:**
```
Test: expect(calculateTotal(10, 0.1)).toBe(11)
Failure: Received 10

WRONG: Change test to expect(10)
RIGHT: Fix calculateTotal() to apply tax correctly
```

## Planning Agents (New)

### Phase 1: Functional Planning (Steps 1-3)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCT OWNER AGENT                          │
│                    (Functional Plan Writer)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RESPONSIBILITIES:                                              │
│  • Split problem into manageable sections                       │
│  • Provide concrete solutions for each section                  │
│  • Write BDD scenarios (Given/When/Then)                        │
│  • Define success criteria and acceptance tests                 │
│  • Identify edge cases and error scenarios                      │
│                                                                 │
│  OUTPUT FORMAT:                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  ## Problem Statement                                           │
│  [Clear, bounded problem definition]                            │
│                                                                 │
│  ## Solution Sections                                           │
│  ### Section 1: [Name]                                          │
│  - Problem: [What this section solves]                          │
│  - Solution: [Concrete approach]                                │
│  - Acceptance: [BDD scenarios]                                  │
│                                                                 │
│  ### Section 2: [Name]                                          │
│  ...                                                            │
│                                                                 │
│  ## Edge Cases                                                  │
│  - [Edge case 1]: [How handled]                                 │
│  - [Edge case 2]: [How handled]                                 │
│                                                                 │
│  ## Success Criteria                                            │
│  - [ ] Criterion 1                                              │
│  - [ ] Criterion 2                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│                  FUNCTIONAL REVIEWER AGENT                      │
│                  (Maximum Strictness)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STANCE: Assume the plan is WRONG until proven otherwise.       │
│                                                                 │
│  REJECTION CRITERIA (Any = Reject):                             │
│  ─────────────────────────────────────────────────────────────  │
│  ✗ Vague requirements ("should be fast", "user-friendly")       │
│  ✗ Missing edge cases                                           │
│  ✗ Unvalidated assumptions                                      │
│  ✗ Incomplete BDD scenarios                                     │
│  ✗ No error handling defined                                    │
│  ✗ Scope creep (solving problems not stated)                    │
│  ✗ Missing success criteria                                     │
│  ✗ Ambiguous acceptance tests                                   │
│                                                                 │
│  REVIEW CHECKLIST:                                              │
│  ─────────────────────────────────────────────────────────────  │
│  □ Is the problem statement falsifiable?                        │
│  □ Can each section be implemented independently?               │
│  □ Are ALL edge cases explicitly handled?                       │
│  □ Are assumptions stated and validated?                        │
│  □ Do BDD scenarios cover happy + error paths?                  │
│  □ Are success criteria measurable?                             │
│  □ Is scope clearly bounded (what's NOT included)?              │
│                                                                 │
│  OUTPUT: APPROVE or REJECT with specific issues                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Implementation Planning (Steps 4-6)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECT AGENT                              │
│                    (Senior, 20+ Years Experience)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  IDENTITY:                                                      │
│  Senior architect with 20+ years experience. Has seen every     │
│  failure mode. Designs for maintainability, not cleverness.     │
│                                                                 │
│  RESPONSIBILITIES:                                              │
│  • Design technical architecture                                │
│  • Break down into specific files and changes                   │
│  • Identify risks and mitigations                               │
│  • Choose appropriate patterns (justify each)                   │
│  • Define interfaces and contracts                              │
│  • Plan for testing at each layer                               │
│                                                                 │
│  OUTPUT FORMAT:                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  ## Architecture Overview                                       │
│  [Diagram or description of component relationships]            │
│                                                                 │
│  ## Files to Modify/Create                                      │
│  | File | Action | Changes | Tests Required |                   │
│  |------|--------|---------|----------------|                   │
│  | src/auth.ts | Modify | Add OAuth flow | unit, integration |  │
│                                                                 │
│  ## Risks & Mitigations                                         │
│  | Risk | Likelihood | Impact | Mitigation |                    │
│  |------|------------|--------|------------|                    │
│                                                                 │
│  ## Patterns Used                                               │
│  - [Pattern]: [Justification]                                   │
│                                                                 │
│  ## Interfaces/Contracts                                        │
│  ```typescript                                                  │
│  interface AuthService { ... }                                  │
│  ```                                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│              IMPLEMENTATION PLAN REVIEWER AGENT                 │
│              (Maximum Strictness)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STANCE: Assume the architecture will FAIL until proven safe.   │
│                                                                 │
│  REJECTION CRITERIA (Any = Reject):                             │
│  ─────────────────────────────────────────────────────────────  │
│  ✗ Security vulnerabilities in design                           │
│  ✗ Missing error handling paths                                 │
│  ✗ Scalability bottlenecks                                      │
│  ✗ Tight coupling between components                            │
│  ✗ Missing tests for critical paths                             │
│  ✗ Unjustified pattern choices                                  │
│  ✗ Incomplete risk assessment                                   │
│  ✗ Breaking existing contracts                                  │
│  ✗ Missing rollback plan                                        │
│                                                                 │
│  REVIEW DIMENSIONS (All must score 5/5):                        │
│  ─────────────────────────────────────────────────────────────  │
│  1. SECURITY: OWASP Top 10 addressed? Auth/authz correct?       │
│  2. SCALABILITY: Will this work at 10x load?                    │
│  3. MAINTAINABILITY: Can a junior understand this in 6 months?  │
│  4. TESTABILITY: Can every path be tested in isolation?         │
│  5. RELIABILITY: What happens when dependencies fail?           │
│                                                                 │
│  OUTPUT: APPROVE or REJECT with specific issues + required fix  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Planning Loop (Writer → Reviewer → Fix → Repeat)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLANNING REFINEMENT LOOP                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FUNCTIONAL PLANNING (Steps 1-3):                               │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Product Owner writes plan                                      │
│       ↓                                                         │
│  Functional Reviewer critiques (max strictness)                 │
│       ↓                                                         │
│  REJECT? ──YES──► Product Owner fixes ──► Reviewer again        │
│       ↓                                   (max 5 rounds)        │
│  APPROVE                                                        │
│       ↓                                                         │
│  [HUMAN GATE 1]                                                 │
│                                                                 │
│  IMPLEMENTATION PLANNING (Steps 4-6):                           │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Architect designs solution                                     │
│       ↓                                                         │
│  Impl Plan Reviewer critiques (max strictness)                  │
│       ↓                                                         │
│  REJECT? ──YES──► Architect fixes ──► Reviewer again            │
│       ↓                               (max 5 rounds)            │
│  APPROVE                                                        │
│       ↓                                                         │
│  [Integrator + Critic Loop] (existing)                          │
│       ↓                                                         │
│  [HUMAN GATE 2]                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## CTO Chief Self-Learning System

### Observation & Learning Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                CTO CHIEF SELF-LEARNING                          │
│                (Propose Only - Human Approves)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. OBSERVE: Track agent performance                            │
│  ─────────────────────────────────────────────────────────────  │
│  For each agent invocation, record:                             │
│  • Agent name                                                   │
│  • Input (what it was asked to do)                              │
│  • Output (what it produced)                                    │
│  • Outcome (did it catch issues? miss issues? false positives?) │
│  • CTO Chief intervention (did Chief have to fix/add?)          │
│                                                                 │
│  Store in: ~/.ctoc/learnings/observations.jsonl                 │
│                                                                 │
│  2. ANALYZE: Identify patterns                                  │
│  ─────────────────────────────────────────────────────────────  │
│  Weekly analysis:                                               │
│  • Which agents required most interventions?                    │
│  • What types of issues were missed?                            │
│  • What false positives occurred?                               │
│  • What new patterns emerged?                                   │
│                                                                 │
│  3. PROPOSE: Suggest agent improvements                         │
│  ─────────────────────────────────────────────────────────────  │
│  CTO Chief generates improvement proposals:                     │
│                                                                 │
│  ```yaml                                                        │
│  # ~/.ctoc/learnings/pending/2025-02-01-security-scanner.yaml   │
│  agent: security-scanner                                        │
│  issue: Missed SQL injection in parameterized queries           │
│  observations: 3 occurrences in last 7 days                     │
│  proposed_change: |                                             │
│    Add check for string concatenation in SQL contexts,          │
│    even when using parameterized query syntax                   │
│  affected_file: agents/security/security-scanner.md             │
│  diff: |                                                        │
│    + ## Additional SQL Injection Checks                         │
│    + - Check for string concat before parameterized queries     │
│    + - Flag: `query = "SELECT " + column + " FROM ..."`         │
│  status: pending_approval                                       │
│  ```                                                            │
│                                                                 │
│  4. HUMAN APPROVAL                                              │
│  ─────────────────────────────────────────────────────────────  │
│  User reviews proposals via:                                    │
│  `ctoc learnings review`                                        │
│                                                                 │
│  Options:                                                       │
│  [A] Approve - Apply change to agent                            │
│  [R] Reject - Discard proposal                                  │
│  [M] Modify - Edit before applying                              │
│                                                                 │
│  5. APPLY: Update agent definitions                             │
│  ─────────────────────────────────────────────────────────────  │
│  On approval:                                                   │
│  • Apply diff to agents/*.md file                               │
│  • Log change with rationale                                    │
│  • Track improvement metrics                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### CTO Chief Intervention Rules

```
┌─────────────────────────────────────────────────────────────────┐
│              CTO CHIEF INTERVENTION TRIGGERS                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CTO Chief INTERVENES when:                                     │
│                                                                 │
│  1. Agent misses critical issue (Security, Correctness)         │
│     → Chief adds the missing check                              │
│     → Logs: "Intervention: Added SQL injection check missed by  │
│              security-scanner in auth.ts:45"                    │
│                                                                 │
│  2. Agent produces false positive repeatedly                    │
│     → Chief overrides with correct assessment                   │
│     → Logs: "Intervention: Overrode type-checker false positive │
│              on generics pattern (3rd occurrence this week)"    │
│                                                                 │
│  3. Agent output doesn't meet Iron Loop standards               │
│     → Chief rejects and re-runs with stricter prompt            │
│     → Logs: "Intervention: Rejected weak test coverage (78%),   │
│              re-running with strict 95% requirement"            │
│                                                                 │
│  4. Agent takes too long (>5 min for simple task)               │
│     → Chief terminates and takes over                           │
│     → Logs: "Intervention: Timeout on complexity-analyzer,      │
│              Chief completed analysis directly"                 │
│                                                                 │
│  All interventions become learning opportunities.               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Learning Metrics Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                 LEARNING METRICS (ctoc learnings stats)         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent Performance (Last 30 Days)                               │
│  ─────────────────────────────────────────────────────────────  │
│  Agent                 │ Runs │ Interventions │ Rate │ Trend   │
│  ──────────────────────┼──────┼───────────────┼──────┼─────────│
│  security-scanner      │  47  │       2       │  4%  │   ↓     │
│  type-checker          │ 156  │       5       │  3%  │   ↓     │
│  code-reviewer         │  89  │       8       │  9%  │   →     │
│  functional-reviewer   │  23  │       1       │  4%  │   ↓     │
│  architect             │  12  │       0       │  0%  │   ✓     │
│                                                                 │
│  Improvement Proposals                                          │
│  ─────────────────────────────────────────────────────────────  │
│  Pending:  3                                                    │
│  Approved: 12 (applied)                                         │
│  Rejected: 2                                                    │
│                                                                 │
│  Impact: Intervention rate dropped 47% → 5% over 3 months       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Coordination Architecture

### CTO Chief Orchestrator (Single Point of Control)

```
┌──────────────────────────────────────────────────────────────────┐
│                     CTO CHIEF ORCHESTRATOR                       │
│                                                                  │
│                        ┌─────────────┐                           │
│                        │  CTO CHIEF  │ ◄── Only persistent agent │
│                        │             │                           │
│                        │ • Monitor   │                           │
│                        │ • Decide    │                           │
│                        │ • Dispatch  │                           │
│                        │ • Track     │                           │
│                        └──────┬──────┘                           │
│                               │                                  │
│                          DISPATCHES                              │
│                      (one at a time)                             │
│                               │                                  │
│    ┌──────────┬───────────┬───┴───┬───────────┬──────────┐      │
│    ▼          ▼           ▼       ▼           ▼          ▼      │
│ ┌──────┐ ┌────────┐ ┌──────────┐ ┌────┐ ┌────────┐ ┌────────┐  │
│ │  QA  │ │Coverage│ │ Security │ │ CI │ │  Deps  │ │Release │  │
│ └──┬───┘ └───┬────┘ └────┬─────┘ └─┬──┘ └───┬────┘ └───┬────┘  │
│    │         │           │         │        │          │        │
│    └─────────┴───────────┴─────────┴────────┴──────────┘        │
│                               │                                  │
│                          REPORTS BACK                            │
│                               │                                  │
│                        ┌──────▼──────┐                           │
│                        │  CTO CHIEF  │                           │
│                        │  (updates   │                           │
│                        │   gates)    │                           │
│                        └─────────────┘                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Event Flow (Simplified)

Agents communicate via events:

```typescript
interface AgentEvent {
  type: 'status' | 'alert' | 'fix' | 'request' | 'complete';
  source: AgentName;
  target?: AgentName | 'all';
  payload: any;
  timestamp: Date;
}

// Examples:
{ type: 'alert', source: 'security-scanner', target: 'all',
  payload: { severity: 'high', message: 'SQL injection in auth.ts:42' } }

{ type: 'fix', source: 'ci-watcher', target: 'qa-engineer',
  payload: { file: 'test.ts', action: 'rerun-after-fix' } }

{ type: 'complete', source: 'coverage-engineer', target: 'release-manager',
  payload: { coverage: 92, target: 90, status: 'pass' } }
```

### Shared State

All agents share state in `~/.ctoc/agents/state.json`:

```json
{
  "lastCommit": "abc123",
  "gates": {
    "typecheck": { "status": "pass", "updatedAt": "..." },
    "lint": { "status": "pass", "updatedAt": "..." },
    "tests": { "status": "pass", "updatedAt": "..." },
    "coverage": { "status": "pass", "value": 92, "updatedAt": "..." },
    "security": { "status": "pass", "updatedAt": "..." },
    "deps": { "status": "pass", "updatedAt": "..." },
    "debt": { "status": "pass", "score": 15, "updatedAt": "..." },
    "docs": { "status": "pass", "updatedAt": "..." },
    "perf": { "status": "pass", "updatedAt": "..." },
    "api": { "status": "pass", "updatedAt": "..." }
  },
  "readyForRelease": false,
  "blockers": []
}
```

## Architecture

### Agent Persistence (Hook-Based Revival)

Agents respawn automatically via SessionStart hook:

```javascript
// hooks/SessionStart.js
async function reviveAgents() {
  const config = loadAgentConfig();
  const state = loadAgentState();

  for (const agent of config.enabledAgents) {
    if (state.agents[agent.name]?.status !== 'paused') {
      spawnAgent(agent);
      log(`Revived: ${agent.name}`);
    }
  }
}
```

**Benefits:**
- No separate daemon process to manage
- Agents restart with each Claude Code session
- State persists in `~/.ctoc/agents/state.json`
- Paused agents stay paused until manually resumed

### Agent Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Spawned   │────▶│   Running   │────▶│   Stopped   │
└─────────────┘     └─────────────┘     └─────────────┘
       ▲                  │                    │
       │                  ▼                    │
       │            ┌─────────────┐            │
       │            │   Paused    │            │
       │            └─────────────┘            │
       │                  │                    │
       └──────────────────┴────────────────────┘
              (SessionStart revives)
```

### Conflict Resolution (Priority Queue)

When multiple agents want to modify the same file:

```
┌─────────────────────────────────────────────────────┐
│              AGENT PRIORITY QUEUE                   │
├─────┬─────────────────────┬─────────────────────────┤
│  P  │ Agent               │ Reason                  │
├─────┼─────────────────────┼─────────────────────────┤
│  1  │ Security Scanner    │ Security is paramount   │
│  2  │ Coverage Engineer   │ Tests before fixes      │
│  3  │ CI Watcher          │ Unblock pipeline        │
│  4  │ QA Engineer         │ Code standards          │
│  5  │ Dependency Watcher  │ Vulnerability patches   │
│  6  │ Tech Debt Monitor   │ Refactoring can wait    │
│  7  │ Documentation Agent │ Docs follow code        │
│  8  │ API Contract Agent  │ Schema validation       │
│  9  │ Performance Monitor │ Perf after correctness  │
│ 10  │ CI/CD Monitor       │ Deploy config           │
│ 11  │ Release Manager     │ Orchestration only      │
└─────┴─────────────────────┴─────────────────────────┘
```

**Resolution Flow:**
```
Agent A wants to edit file.ts
       ↓
Check: Is file.ts locked?
       ↓
YES → Check priority: A.priority > lock.holder.priority?
       ↓ YES                    ↓ NO
  Preempt lock              Queue A's change
  A edits file              Wait for lock release
       ↓
NO → Acquire lock
     A edits file
     Release lock
     Notify waiting agents
```

### Human Override (With Audit Log)

Humans can override agents, but actions are logged:

```bash
# Pause all agents for manual work
ctoc agents pause --reason "Manual refactoring"

# Override a specific check
ctoc agents override security --file "legacy.js" --reason "Known false positive"

# Skip pre-review gate (emergency)
ctoc push --force --reason "Hotfix for production"
```

**Audit Log (`~/.ctoc/agents/audit.log`):**
```
2025-01-31T13:45:00Z OVERRIDE security by user@host
  file: legacy.js
  reason: "Known false positive"
  expires: 2025-02-07T13:45:00Z

2025-01-31T14:00:00Z FORCE_PUSH by user@host
  commit: abc123
  reason: "Hotfix for production"
  gates_skipped: [lint, coverage]
```

**Override Rules:**
- All overrides logged with timestamp, user, reason
- Overrides can have expiry dates
- Weekly audit report shows all overrides
- Repeated overrides on same file trigger review

### Communication

Agents communicate via:
1. **Status files:** `~/.ctoc/agents/{agent-name}.status`
2. **Event queue:** `~/.ctoc/agents/events.json`
3. **Shared state:** `~/.ctoc/agents/state.json`

### Commands

```bash
ctoc chief start           # Start CTO Chief orchestrator
ctoc chief stop            # Stop CTO Chief gracefully
ctoc chief status          # Show CTO Chief + gate status
ctoc chief logs            # View CTO Chief activity log
ctoc chief queue           # Show pending events in queue

ctoc agents status         # Show all specialist agents
ctoc agents history        # Show recent specialist runs
ctoc agents config         # Configure autonomy level, thresholds
```

## Configuration

`.ctoc/settings.yaml`:
```yaml
agents:
  ci_watcher:
    enabled: true
    poll_interval: 30s
    auto_fix: true
    max_fix_attempts: 3

  qa_engineer:
    enabled: true
    watch_patterns: ["**/*.ts", "**/*.tsx", "**/*.py"]
    run_e2e_on_change: false  # expensive, opt-in

  cicd_monitor:
    enabled: true
    platforms: [github-actions, railway]
    auto_retry: true
    max_retries: 5

  coverage_engineer:
    enabled: true
    target: 90
    auto_generate_tests: false  # opt-in

  release_manager:
    enabled: true
    auto_release: false  # requires manual trigger
    version_strategy: semver
```

## Business Value

- **Shift-left quality** - Issues caught as they happen, not in PR review
- **Reduced CI time** - Failures fixed faster, less waiting
- **Consistent coverage** - Never drops below target
- **Automated releases** - When quality gates pass, ship automatically
- **Developer focus** - Agents handle quality, devs focus on features

## Success Criteria

### Planning Agents (New)
- [ ] Product Owner agent (functional plan writer, splits into sections)
- [ ] Functional Reviewer agent (maximum strictness, rejects weak plans)
- [ ] Architect agent (senior, 20+ years experience, technical design)
- [ ] Implementation Plan Reviewer agent (maximum strictness)
- [ ] Planning refinement loop (writer → reviewer → fix, max 5 rounds)

### CTO Chief Enhancements
- [ ] CTO Chief monitors ALL steps (1-15), can intervene
- [ ] Self-learning system (observe → analyze → propose → human approve)
- [ ] Intervention logging for all agent overrides
- [ ] Learning metrics dashboard (`ctoc learnings stats`)
- [ ] Proposal review system (`ctoc learnings review`)
- [ ] **Dispatch matrix** for programmatic agent selection
- [ ] **NL fallback dispatch** when programmatic fails
- [ ] **Capability index** for all 66 agents
- [ ] **Daily analysis** (session end stats)
- [ ] **Weekly analysis** (deep patterns, improvement proposals)

### Agent-Critic System
- [ ] **Agent-Critic** defined with 5 critique dimensions
- [ ] Agent-Critic **self-bootstrap** (10 rounds self-critique, must score 10)
- [ ] All 66 agents go through **10-round improvement loop**
- [ ] Acceptance threshold: **Score = 10 ONLY** (no early exit unless perfect)
- [ ] **0-10 grading system** for all agents (no letters)
- [ ] Score progression tracking per agent
- [ ] Agent grades stored in `~/.ctoc/agents/grades.yaml`

### Agent Rewrite (All 66 Agents)
- [ ] All agents rewritten with **concrete detection methods**
- [ ] All agents have **mandatory anti-scope** (what they don't check)
- [ ] All agents output **mandatory schema** (findings, self-assessment, escalation)
- [ ] **Quality agents specialized**: code-reviewer, complexity-analyzer, smell-detector, duplicate-detector
- [ ] **Security agents specialized**: scanner, secrets, validation, deps
- [ ] Overlap removed between agents

### Quality System
- [ ] CTO Chief orchestrates **66 agents** (62 existing + 4 new planning)
- [ ] CTO Chief status dashboard in terminal
- [ ] Single-agent concurrency (CTO Chief + 0-1 agent)
- [ ] Event debouncing (2 second window)
- [ ] Block on failure (retry with backoff, require resolution)

### Gates & Enforcement
- [ ] Pre-review gate blocks push until all 14 checks pass
- [ ] CI guaranteed to pass on push
- [ ] Coverage enforced at 95% minimum, targeting 100%
- [ ] Human gates ALWAYS required (Gates 1, 2, 3 never bypassed)

### System
- [ ] CTO Chief survives session restarts (hook-based revival)
- [ ] Resource-efficient (only 1 persistent agent)
- [ ] Configurable autonomy levels (Report → Safe Fix → Full)
- [ ] Configurable per-project
- [ ] Graceful degradation (works without CI access)

## Implementation Choices (User Approved)

### Model & Execution Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent-Critic model | **Opus** | Highest quality critique for foundation |
| Parallelization | **3 agents in parallel** | With Opus dependency orchestrator |
| Deploy threshold | **Score = 10.0 ONLY** | Maximum strictness, no compromise |
| Human review | **Auto-approve if score=10** | Trust the 10-round process |

### Parallel Execution with Dependency Management

Based on research from [Azure AI Agent Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns), [Agent-MCP](https://github.com/rinadelph/Agent-MCP), and [Google ADK Parallel Agents](https://google.github.io/adk-docs/agents/workflow-agents/parallel-agents/):

```
┌─────────────────────────────────────────────────────────────────┐
│           PARALLEL AGENT REWRITE ORCHESTRATION                  │
│                    (Opus Orchestrator)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OPUS ORCHESTRATOR responsibilities:                            │
│  ─────────────────────────────────────────────────────────────  │
│  1. DEPENDENCY ANALYSIS                                         │
│     • Identify which agents depend on each other                │
│     • Group independent agents for parallel execution           │
│     • Never run dependent agents simultaneously                 │
│                                                                 │
│  2. CONFLICT OF INTEREST DETECTION                              │
│     • Detect overlapping scopes between agents                  │
│     • Flag when parallel agents might produce contradictions    │
│     • Trigger adjudication when conflicts found                 │
│                                                                 │
│  3. FILE-LEVEL LOCKING                                          │
│     • Lock agents/*.md files during rewrite                     │
│     • Prevent simultaneous edits to same file                   │
│     • Release lock after commit                                 │
│                                                                 │
│  4. ADJUDICATION PASS                                           │
│     • When 2 agents conflict (e.g., overlapping scope)          │
│     • Opus reviews both and resolves                            │
│     • Re-run affected agent if needed                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Parallel Execution Groups

```
┌─────────────────────────────────────────────────────────────────┐
│           AGENT REWRITE BATCHES (3 parallel)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BATCH 1 (Independent - can run parallel):                      │
│  ─────────────────────────────────────────────────────────────  │
│  • complexity-analyzer    (no deps)                             │
│  • secrets-detector       (no deps)                             │
│  • duplicate-code-detector (no deps)                            │
│                                                                 │
│  BATCH 2 (Depends on Batch 1 for anti-scope):                   │
│  ─────────────────────────────────────────────────────────────  │
│  • code-reviewer         (anti-scope refs complexity-analyzer)  │
│  • security-scanner      (anti-scope refs secrets-detector)     │
│  • code-smell-detector   (anti-scope refs duplicate-detector)   │
│                                                                 │
│  BATCH 3 (Planning agents - independent):                       │
│  ─────────────────────────────────────────────────────────────  │
│  • product-owner          (no deps)                             │
│  • functional-reviewer    (no deps)                             │
│  • architect              (no deps)                             │
│                                                                 │
│  ... (Opus calculates remaining batches dynamically)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Conflict Resolution Protocol

```yaml
# When Opus Orchestrator detects conflict:
conflict_resolution:
  trigger: "Two agents claim overlapping responsibility"

  steps:
    1. pause_both_agents: true
    2. analyze_overlap:
        - Extract scope from both agents
        - Identify specific overlapping checks
    3. decide_ownership:
        - Assign each check to ONE agent only
        - Update anti-scope of the other
    4. adjudication_reasoning:
        - Document why ownership assigned
        - Store in ~/.ctoc/agents/adjudications.log
    5. resume_with_fixes:
        - Re-run affected agent with corrected scope
        - Verify no remaining overlap

  example:
    conflict: "code-reviewer and code-smell-detector both check 'long methods'"
    resolution: "Assign to complexity-analyzer (metrics owner)"
    update_code_reviewer: "Add to anti-scope: long methods"
    update_smell_detector: "Add to anti-scope: long methods"
```

## Scope Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Release | v6.1 (after v6.0 Local CI Gate) | Depends on v6.0 infrastructure |
| Architecture | **Enhanced CTO Chief** + unified agents | Single orchestrator |
| Total agents | **66** (62 existing + 4 new planning) | Full coverage |
| Planning agents | **4 new** (Product Owner, Func Reviewer, Architect, Impl Reviewer) | Dedicated planning |
| Reviewer strictness | **Maximum** | Reject any plan with gaps |
| Planning loop | **Max 5 rounds** per phase | Writer → Reviewer → Fix → Repeat |
| Self-learning | **Propose only** | CTO Chief proposes, human approves |
| Learning storage | `~/.ctoc/learnings/` | Observations, proposals, metrics |
| Intervention logging | **All interventions logged** | For learning analysis |
| Awareness model | **Hybrid** | Step-aware during plans, event-driven otherwise |
| Agent system | **Unified (merged)** | No separate "light" vs "full" - always strict |
| Human gates | **Always required** | Gates 1-3 never bypassed, even full autonomy |
| Persistent agents | **1** (CTO Chief only) | Minimal resource usage |
| Max concurrent | CTO Chief + 1 agent | Avoids conflicts |
| Event handling | **2s debounce** | Prevents rapid-fire overhead |
| Failure handling | **Block until resolved** | Retry with backoff, no skip |
| Autonomy | 3 levels (Report → Safe Fix → Full) | Full = auto-fix, not skip gates |
| Coverage target | 100% (minimum 95%) | Strict quality enforcement |
| Pre-review gate | All 14 checks must pass LOCALLY | CI guaranteed to pass |
| Test philosophy | Tests are sacred - fix CODE, never tests | Never weaken tests |
| Persistence | Hook-based revival (SessionStart) | No separate daemon |
| Implementation | Enhance existing cto-chief.md | Not a new agent |

## Research Sources

- [Qodo - AI Agents for Code Review](https://www.qodo.ai/) - Agentic workflows for quality
- [Codacy Guardrails](https://www.codacy.com) - AI-generated code scanning
- [arXiv: Autonomous Agents Study](https://arxiv.org/html/2601.13597) - Speed vs maintainability trade-offs
- [DevOps.com: AI & Code Quality](https://devops.com/ai-in-software-development-productivity-at-the-cost-of-code-quality-2/) - AI-induced tech debt
- [OX Security DAST Guide](https://www.ox.security/blog/dynamic-application-security-testing-dast/) - Runtime security scanning

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Persistence? | Hook-based revival via SessionStart |
| Conflicts? | Priority queue (Security highest) |
| Override? | Yes, with audit log |
| Test philosophy? | Tests are sacred - fix code, not tests |

## Resolved: Resource & Execution Model

### Single Orchestrator Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CTO CHIEF ORCHESTRATOR                       │
│                    (The ONLY persistent agent)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                         ┌─────────────┐                         │
│                         │  CTO CHIEF  │                         │
│                         │ Orchestrator│                         │
│                         └──────┬──────┘                         │
│                                │                                │
│              Monitors all events, dispatches specialists        │
│                                │                                │
│         ┌──────────┬───────────┼───────────┬──────────┐        │
│         ▼          ▼           ▼           ▼          ▼        │
│    ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌────────┐   │
│    │   QA   │ │Coverage│ │ Security │ │   CI   │ │Release │   │
│    │Engineer│ │Engineer│ │ Scanner  │ │Watcher │ │Manager │   │
│    └────────┘ └────────┘ └──────────┘ └────────┘ └────────┘   │
│         ▲          ▲           ▲           ▲          ▲        │
│         └──────────┴───────────┴───────────┴──────────┘        │
│                     Ephemeral: spawn → work → report → exit    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Change:** ONE persistent agent (CTO Chief) instead of multiple.

### CTO Chief Responsibilities

```javascript
// CTO Chief Orchestrator - the only always-active agent
const CTOChief = {
  name: 'cto-chief',
  role: 'Orchestrator',

  // Event detection matrix
  eventHandlers: {
    'file:save':      (file) => needsQA(file) ? spawn('qa-engineer', file) : null,
    'file:save':      (file) => isPackageFile(file) ? spawn('dependency-watcher', file) : null,
    'git:commit':     (commit) => spawn('security-scanner', commit),
    'git:push':       (ref) => spawn('ci-watcher', ref),
    'test:complete':  (result) => spawn('coverage-engineer', result),
    'deploy:fail':    (log) => spawn('cicd-monitor', log),
    'schema:change':  (file) => spawn('api-contract-agent', file),
    'api:change':     (file) => spawn('documentation-agent', file),
    'all:green':      () => spawn('release-manager'),
  },

  // Decision logic
  async onEvent(event) {
    const handler = this.eventHandlers[event.type];
    if (!handler) return;

    // Check if specialist already working on this
    if (this.activeSpecialist && this.activeSpecialist.type === event.type) {
      this.queue.push(event);
      return;
    }

    // Dispatch specialist
    const specialist = handler(event.payload);
    if (specialist) {
      this.activeSpecialist = specialist;
      await specialist.run();
      this.activeSpecialist = null;
      this.processQueue();
    }
  }
};
```

### Execution Model: Hybrid (Step-Aware + Event-Driven)

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID EXECUTION MODEL                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CTO Chief checks: Is there an active Iron Loop plan?           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ MODE A: STEP-AWARE (Active Plan, Steps 7-15)                ││
│  │─────────────────────────────────────────────────────────────││
│  │                                                             ││
│  │  • Reads iron-loop.state.json for currentStep               ││
│  │  • Dispatches Iron Loop agents IN SEQUENCE                  ││
│  │  • Events QUEUE until appropriate step                      ││
│  │                                                             ││
│  │  Example: Security issue at Step 8?                         ││
│  │    → Queue for Step 12 (SECURE), don't interrupt            ││
│  │    → Iron Loop discipline preserved                         ││
│  │                                                             ││
│  │  Step 7  → test-maker (TDD Red)                             ││
│  │  Step 8  → quality-checker (lint, format)                   ││
│  │  Step 9  → implementer (code)                               ││
│  │  Step 10 → self-reviewer                                    ││
│  │  Step 11 → optimizer                                        ││
│  │  Step 12 → security-scanner                                 ││
│  │  Step 13 → verifier (run ALL tests)                         ││
│  │  Step 14 → documenter                                       ││
│  │  Step 15 → implementation-reviewer → HUMAN GATE 3           ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ MODE B: EVENT-DRIVEN (No Active Plan)                       ││
│  │─────────────────────────────────────────────────────────────││
│  │                                                             ││
│  │  • Lightweight continuous quality monitoring                ││
│  │  • Reacts to events immediately                             ││
│  │  • Uses quality specialists (not Iron Loop agents)          ││
│  │                                                             ││
│  │  file:save    → QA Engineer (lint, typecheck)               ││
│  │  git:commit   → Security Scanner (SAST)                     ││
│  │  test:complete → Coverage Engineer (track %)                ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Mode Detection

```javascript
// CTO Chief mode detection
function getMode() {
  const state = loadIronLoopState();

  if (state.currentStep >= 7 && state.currentStep <= 15 &&
      state.sessionStatus === 'active') {
    return 'STEP_AWARE';  // Iron Loop in progress
  }

  return 'EVENT_DRIVEN';  // Maintenance/exploration mode
}
```

### Concurrency Model

```
┌─────────────────────────────────────────────────────────────────┐
│                  CONCURRENCY: 1 + 1                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ALWAYS ACTIVE:  CTO Chief (lightweight, event loop only)       │
│  MAX SPAWNED:    1 specialist at a time                         │
│                                                                 │
│  Why only 1 specialist?                                         │
│  • Avoids file conflicts entirely                               │
│  • Predictable resource usage                                   │
│  • Clear audit trail                                            │
│  • Specialists are fast (seconds, not minutes)                  │
│                                                                 │
│  Queue behavior:                                                │
│  • Events queue while specialist works                          │
│  • Security events jump to front of queue                       │
│  • Duplicate events are deduplicated                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Event Debouncing (2 Second Window)

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT DEBOUNCING                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Problem: Rapid saves = wasted work                             │
│                                                                 │
│  User saves auth.ts (t=0)      → Start 2s timer                 │
│  User saves auth.ts (t=0.5s)   → Reset timer to 2s              │
│  User saves auth.ts (t=1.0s)   → Reset timer to 2s              │
│  User stops typing...                                           │
│  Timer expires (t=3.0s)        → NOW trigger QA check           │
│                                                                 │
│  Result: 1 check instead of 3                                   │
│                                                                 │
│  Implementation:                                                │
│  ─────────────────────────────────────────────────────────────  │
│  const pendingEvents = new Map();  // file → timeout            │
│                                                                 │
│  function onFileSave(file) {                                    │
│    if (pendingEvents.has(file)) {                               │
│      clearTimeout(pendingEvents.get(file));                     │
│    }                                                            │
│    pendingEvents.set(file, setTimeout(() => {                   │
│      pendingEvents.delete(file);                                │
│      triggerQualityCheck(file);                                 │
│    }, 2000));  // 2 second debounce                             │
│  }                                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Failure Handling: Block Until Resolved

```
┌─────────────────────────────────────────────────────────────────┐
│                    STRICT FAILURE HANDLING                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  When a specialist fails, BLOCK PROGRESS until resolved:        │
│                                                                 │
│  Security Scanner fails (API rate limit)                        │
│    → CTO Chief sets: gateStatus.security = "BLOCKED"            │
│    → Pre-review gate: BLOCKED                                   │
│    → Push attempt: BLOCKED                                      │
│    → User notification: "Security scan failed. Retrying..."     │
│                                                                 │
│  Retry Strategy:                                                │
│  ─────────────────────────────────────────────────────────────  │
│  Attempt 1: Immediate                                           │
│  Attempt 2: After 30s                                           │
│  Attempt 3: After 60s                                           │
│  Attempt 4: After 120s                                          │
│  Attempt 5: After 300s (5 min)                                  │
│  After 5 failures: Require manual intervention                  │
│                                                                 │
│  User Options When Blocked:                                     │
│  ─────────────────────────────────────────────────────────────  │
│  [R] Retry now          - Manually trigger retry                │
│  [S] Skip (with audit)  - Override with logged reason           │
│  [D] Debug              - Show failure logs                     │
│                                                                 │
│  Skip requires explicit reason logged to audit:                 │
│  "Security scan skipped: API rate limit, will retry on CI"      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### CTO Chief State (Lightweight)

```json
// ~/.ctoc/agents/cto-chief.state.json
{
  "active": true,
  "lastHeartbeat": "2025-01-31T14:00:00Z",
  "currentSpecialist": null,
  "queue": [],
  "pendingEvents": {},
  "debounceMs": 2000,
  "recentEvents": [
    { "type": "file:save", "file": "src/auth.ts", "at": "..." },
    { "type": "test:complete", "coverage": 94, "at": "..." }
  ],
  "gateStatus": {
    "typecheck": "pass",
    "lint": "pass",
    "tests": "pass",
    "coverage": { "value": 94, "status": "pass" },
    "security": "pass"
  },
  "failures": {
    "security-scanner": {
      "attempts": 2,
      "lastError": "API rate limit",
      "nextRetry": "2025-01-31T14:05:00Z"
    }
  }
}
```

### Rate Limit Handling

```javascript
// Agent spawn with backoff
async function spawnAgent(name, trigger) {
  const state = loadState();

  // Check rate limit
  if (state.rateLimited) {
    const waitTime = state.rateLimitExpires - Date.now();
    if (waitTime > 0) {
      log(`Rate limited. ${name} queued for ${waitTime}ms`);
      queueAgent(name, trigger, waitTime);
      return;
    }
  }

  // Check concurrency
  if (state.activeAgents.length >= 3) {
    queueAgent(name, trigger);
    return;
  }

  // Spawn with exponential backoff on failure
  try {
    await Task({ subagent_type: 'general-purpose', ... });
  } catch (e) {
    if (e.code === 'RATE_LIMITED') {
      state.rateLimited = true;
      state.rateLimitExpires = Date.now() + (state.backoff || 60000);
      state.backoff = Math.min((state.backoff || 60000) * 2, 300000);
      saveState(state);
    }
  }
}
```

### Autonomy Modes (Safety First)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTONOMY LEVELS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LEVEL 0: REPORT ONLY (default for new projects)                │
│  • Agents analyze and report issues                             │
│  • No automatic fixes                                           │
│  • Human approves all changes                                   │
│                                                                 │
│  LEVEL 1: SAFE FIXES (recommended)                              │
│  • Auto-fix: formatting, simple lint errors                     │
│  • Prompt for: test changes, logic fixes                        │
│  • Block: anything touching security-sensitive files            │
│                                                                 │
│  LEVEL 2: FULL AUTONOMY (opt-in, experienced users)             │
│  • Agents can commit/push without confirmation                  │
│  • Still respects pre-review gate (all checks must pass)        │
│  • Audit log captures all autonomous actions                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Default: LEVEL 1 (safe fixes only)
```

### Human Gates: ALWAYS REQUIRED

```
┌─────────────────────────────────────────────────────────────────┐
│                    HUMAN GATES ARE SACRED                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Iron Loop's 3 human gates are NEVER bypassed, even at Level 2: │
│                                                                 │
│  GATE 1: Functional → Implementation                            │
│          "Approve functional plan?"                             │
│          ⚠️ ALWAYS requires human approval                      │
│                                                                 │
│  GATE 2: Implementation → Iron Loop Ready                       │
│          "Approve technical approach?"                          │
│          ⚠️ ALWAYS requires human approval                      │
│                                                                 │
│  GATE 3: Final Review → Done                                    │
│          "Commit/push or send back?"                            │
│          ⚠️ ALWAYS requires human approval                      │
│                                                                 │
│  What "Full Autonomy" DOES mean:                                │
│  • Auto-fix code issues between gates                           │
│  • Auto-run quality checks                                      │
│  • Auto-generate tests for uncovered code                       │
│                                                                 │
│  What "Full Autonomy" does NOT mean:                            │
│  • Skip human gates                                             │
│  • Push without Gate 3 approval                                 │
│  • Approve own plans                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Merged Agents: One System, Always Strict

```
┌─────────────────────────────────────────────────────────────────┐
│              UNIFIED AGENT SYSTEM (ALWAYS STRICT)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MERGED: No separate "light" vs "full" versions                 │
│  Every agent runs at MAXIMUM strictness, every time.            │
│                                                                 │
│  OLD (Two Systems):                 NEW (Unified):              │
│  ─────────────────────────────────────────────────────────────  │
│  quality-checker (Step 8)    ┐                                  │
│                              ├──► QUALITY AGENT (strict always) │
│  QA Engineer (specialist)    ┘                                  │
│                                                                 │
│  security-scanner (Step 12)  ┐                                  │
│                              ├──► SECURITY AGENT (strict always)│
│  Security Scanner (specialist)┘                                 │
│                                                                 │
│  verifier (Step 13)          ┐                                  │
│                              ├──► TEST AGENT (strict always)    │
│  Coverage Engineer (specialist)┘                                │
│                                                                 │
│  BENEFITS:                                                      │
│  ─────────────────────────────────────────────────────────────  │
│  • No confusion about which agent does what                     │
│  • Same strict checks in both modes                             │
│  • Less code to maintain                                        │
│  • Consistent quality, no "quick" shortcuts                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Unified Agent Registry

```
┌─────┬─────────────────────┬──────────────┬─────────────────────────┐
│ #   │ Agent               │ Iron Loop    │ Responsibilities        │
│     │                     │ Step         │                         │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ ★   │ CTO CHIEF           │ 1-15         │ Orchestration           │
│     │ (Orchestrator)      │ + learning   │ Mode detection          │
│     │                     │              │ Intervention            │
│     │                     │              │ Self-learning           │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│     │ PLANNING AGENTS (NEW)              │                         │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ P1  │ PRODUCT OWNER       │ Steps 1-3    │ Write functional plan   │
│     │ (plan writer)       │              │ Split into sections     │
│     │                     │              │ BDD scenarios           │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ P2  │ FUNCTIONAL REVIEWER │ Step 3       │ Maximum strictness      │
│     │ (very critical)     │              │ Reject weak plans       │
│     │                     │              │ Question assumptions    │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ P3  │ ARCHITECT           │ Steps 4-6    │ Technical design        │
│     │ (senior, 20+ yrs)   │              │ File breakdown          │
│     │                     │              │ Risk assessment         │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ P4  │ IMPL PLAN REVIEWER  │ Step 6       │ Maximum strictness      │
│     │ (very critical)     │              │ 5-dimension scoring     │
│     │                     │              │ Reject weak architecture│
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│     │ UNIFIED AGENTS (merged, always strict)                       │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 1   │ QUALITY AGENT       │ Step 8, 10   │ Lint (strict)           │
│     │ (merged)            │ + events     │ Typecheck (strict)      │
│     │                     │              │ Format check            │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 2   │ TEST AGENT          │ Step 7, 13   │ Run ALL tests           │
│     │ (merged)            │ + events     │ Coverage tracking       │
│     │                     │              │ Block if <95%           │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 3   │ SECURITY AGENT      │ Step 12      │ SAST (all rules)        │
│     │ (merged)            │ + events     │ Secret detection        │
│     │                     │              │ Dependency audit        │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│     │ SPECIALIZED AGENTS (Iron Loop only)                          │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 4   │ test-maker          │ Step 7       │ TDD Red (write tests)   │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 5   │ implementer         │ Step 9       │ Write code              │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 6   │ self-reviewer       │ Step 10      │ Self-review             │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 7   │ optimizer           │ Step 11      │ Performance, simplify   │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 8   │ documenter          │ Step 14      │ Update docs             │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 9   │ impl-reviewer       │ Step 15      │ Final review            │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│     │ MONITORING AGENTS (events only)                              │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 10  │ CI Watcher          │ events       │ Monitor CI status       │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│ 11  │ Release Manager     │ all green    │ Version bump, release   │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│     │ EXISTING 62 AGENTS (orchestrated by CTO Chief)               │
├─────┼─────────────────────┼──────────────┼─────────────────────────┤
│     │ See agents/ directory for full list:                         │
│     │ • 9 testing agents (writers + runners)                       │
│     │ • 8 quality agents                                           │
│     │ • 5 security agents                                          │
│     │ • 11 specialized agents                                      │
│     │ • 3 frontend agents                                          │
│     │ • 3 mobile agents                                            │
│     │ • 4 infrastructure agents                                    │
│     │ • 2 documentation agents                                     │
│     │ • 3 compliance agents                                        │
│     │ • 3 data/ML agents                                           │
│     │ • 1 cost agent                                               │
│     │ • 2 AI quality agents                                        │
│     │ • 2 devex agents                                             │
│     │ • 3 versioning agents                                        │
│     │ • 2 iron-loop agents                                         │
│     │ • 1 coordinator (CTO Chief)                                  │
└─────┴─────────────────────┴──────────────┴─────────────────────────┘

TOTAL: 66 agents (62 existing + 4 new planning agents)
All under CTO Chief orchestration with self-learning.
```

### Implementation: Enhance Existing cto-chief.md

This plan **enhances** the existing `agents/coordinator/cto-chief.md`, NOT creating a new agent:

```
CURRENT cto-chief.md capabilities:
  ✓ Coordinates Iron Loop steps 1-15
  ✓ Dispatches planning and implementation agents
  ✓ Manages state in iron-loop.state.json

NEW capabilities to ADD:
  + Event monitoring (file saves, commits, test runs)
  + Mode detection (step-aware vs event-driven)
  + Quality specialist dispatch
  + Gate status tracking
  + Pre-review enforcement
```

### Dependency Declaration

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPENDENCIES                                 │
├─────────────────────────────────────────────────────────────────┤
│  REQUIRES: local-ci-gate-enforcement (v6.0.x)                   │
│                                                                 │
│  This plan builds ON TOP of Local CI Gate:                      │
│  • Uses CI config parser from Local CI Gate                     │
│  • Uses Docker execution layer from Local CI Gate               │
│  • Pre-review gate defined here, executed by Local CI Gate      │
│                                                                 │
│  Implementation order:                                          │
│  1. local-ci-gate-enforcement.md (in progress)                  │
│  2. persistent-quality-agents.md (this plan)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Agent-Critic System (All 66 Agents)

### Research Foundation

Based on:
- [Self-Refine: Iterative Refinement](https://selfrefine.info/) - 5-40% improvement through iterative critique
- [OpenAI Self-Evolving Agents](https://cookbook.openai.com/examples/partners/self_evolving_agents/autonomous_agent_retraining)
- [Eric Jang: LLM Self-Reflection](https://evjang.com/2023/03/26/self-reflection.html) - LLMs critique better than generate
- [Multi-Agent Reflexion](https://arxiv.org/html/2512.20845) - Reduce blind spots through debate

### Agent-Critic Definition

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT-CRITIC                                 │
│            (The most critical agent in the system)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  IDENTITY:                                                      │
│  You are a ruthless critic with 30+ years of experience in      │
│  software quality, prompt engineering, and agent design.        │
│  You have seen every failure mode. You assume every agent is    │
│  FLAWED until proven otherwise. Your job is to find weaknesses. │
│  You almost NEVER give a score of 10.                           │
│                                                                 │
│  SCORING (0-10):                                                │
│  ─────────────────────────────────────────────────────────────  │
│  0-2: Fundamentally broken, must rewrite                        │
│  3-4: Major gaps, significant rework needed                     │
│  5-6: Functional but weak, needs improvement                    │
│  7-8: Good quality, still has issues                            │
│  9:   Excellent, only edge cases remain                         │
│  10:  Perfect (ALMOST NEVER GIVEN - requires flawless agent)    │
│                                                                 │
│  CRITIQUE DIMENSIONS (5):                                       │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  1. SPECIFICITY (0-10)                                          │
│     • Are detection methods concrete? (tools, regex, commands)  │
│     • Are thresholds exact numbers, not "reasonable"?           │
│     • Are examples provided (good code vs bad code)?            │
│     • Deduct: -2 for each vague instruction                     │
│                                                                 │
│  2. COMPLETENESS (0-10)                                         │
│     • Does agent cover its ENTIRE scope?                        │
│     • Any edge cases missed?                                    │
│     • Any scenarios unhandled?                                  │
│     • Deduct: -1 for each gap found                             │
│                                                                 │
│  3. BOUNDARIES (0-10)                                           │
│     • Is anti-scope explicit? (what agent does NOT check)       │
│     • Any overlap with other agents?                            │
│     • Any scope creep (doing too much)?                         │
│     • Deduct: -2 for each overlap, -1 for missing anti-scope    │
│                                                                 │
│  4. ACTIONABILITY (0-10)                                        │
│     • Are outputs actionable? Can user fix issues?              │
│     • Are fixes clear and implementable?                        │
│     • Are severity levels correct?                              │
│     • Deduct: -1 for each unclear action                        │
│                                                                 │
│  5. INTEGRATION (0-10)                                          │
│     • Does output schema match mandatory format?                │
│     • Is CTO Chief integration correct?                         │
│     • Are escalation paths defined?                             │
│     • Is confidence scoring implemented?                        │
│     • Deduct: -2 for schema mismatch, -1 for missing fields     │
│                                                                 │
│  OVERALL SCORE: Average of 5 dimensions                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Agent-Critic Output Format

```yaml
critique:
  agent: "security-scanner"
  round: 3

  scores:
    specificity: 7
    completeness: 6
    boundaries: 8
    actionability: 7
    integration: 5
    overall: 6.6

  issues:
    - dimension: "completeness"
      location: "## Detection Methods"
      problem: "Missing check for NoSQL injection (MongoDB, CouchDB)"
      severity: "high"
      fix: |
        Add under ### Injection section:
        ```
        # NoSQL Injection
        - Pattern: `\$where`, `\$regex`, `\$gt`, `\$lt` in user input
        - Tool: `nosqli-scan --target $URL`
        ```

    - dimension: "integration"
      location: "## Output Schema"
      problem: "Missing escalation.suggested_agent field"
      severity: "medium"
      fix: "Add escalation block per mandatory schema specification"

    - dimension: "specificity"
      location: "## SQL Injection"
      problem: "Says 'check for SQL injection' without concrete patterns"
      severity: "high"
      fix: |
        Replace with:
        ```
        Patterns to detect:
        - String concat in queries: `"SELECT.*" \+ .*`
        - f-string SQL: `f"SELECT.*{`
        - Format SQL: `"SELECT.*".format\(`
        ```

  strengths:
    - "Good OWASP Top 10 coverage structure"
    - "Clear severity levels"
    - "Language-specific examples included"

  verdict: "REFINE"  # Only "ACCEPT" if overall score = 10
```

### 10-Round Improvement Loop

```
┌─────────────────────────────────────────────────────────────────┐
│              AGENT IMPROVEMENT LOOP                             │
│              (Threshold: Score = 10 ONLY)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FOR EACH OF 66 AGENTS:                                         │
│                                                                 │
│  Round 1: Generate initial agent using template                 │
│           ↓                                                     │
│  Round 2: Agent-Critic scores (5 dimensions)                    │
│           Score = 10? ──YES──► ACCEPT (rare early exit)         │
│           ↓ NO                                                  │
│           Agent-Writer refines based on critique                │
│           ↓                                                     │
│  Round 3-9: Repeat critique → refine                            │
│           ↓                                                     │
│  Round 10: Final critique                                       │
│           Score = 10? ──YES──► ACCEPT                           │
│           ↓ NO                                                  │
│           ACCEPT WITH NOTES (document remaining issues)         │
│                                                                 │
│  CONTEXT: All rounds preserved in context                       │
│  HISTORY: Previous feedback prevents regression                 │
│  TRACKING: Score progression logged for each agent              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Agent-Critic Self-Bootstrap (First)

**Before reviewing ANY other agent, Agent-Critic must prove itself:**

```
┌─────────────────────────────────────────────────────────────────┐
│          AGENT-CRITIC SELF-BOOTSTRAP (10 ROUNDS)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Round 1:  Generate initial Agent-Critic definition             │
│  Round 2:  Self-critique: "Am I specific about scoring?"        │
│  Round 3:  Self-critique: "Do my dimensions cover all quality?" │
│  Round 4:  Self-critique: "Is my output format actionable?"     │
│  Round 5:  Self-critique: "Am I too harsh? Too lenient?"        │
│  Round 6:  Self-critique: "Do I have blind spots?"              │
│  Round 7:  Self-critique: "Can I be gamed or fooled?"           │
│  Round 8:  Self-critique: "Is my scoring consistent?"           │
│  Round 9:  Self-critique: "Are my fixes implementable?"         │
│  Round 10: Self-critique: "Am I the critic I would want?"       │
│                                                                 │
│  ONLY AFTER Agent-Critic reaches score 10 on ITSELF             │
│  can it begin reviewing other agents.                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Grading System (0-10)

```yaml
# ~/.ctoc/agents/grades.yaml (updated after each agent run)
agents:
  security-scanner:
    creation_score: 9.2          # Score when created (after 10 rounds)
    current_score: 9.4           # Updated based on performance
    last_updated: "2025-02-01"
    history:
      - date: "2025-01-25"
        score: 8.8
        reason: "Missed NoSQL injection in 2 cases"
      - date: "2025-02-01"
        score: 9.4
        reason: "Fixed NoSQL detection, improved"

  code-reviewer:
    creation_score: 8.7
    current_score: 8.9
    ...

  # Weekly analysis updates scores based on:
  # - True positive rate
  # - False positive rate
  # - CTO Chief intervention rate
  # - User feedback
```

### Pipeline Flow (Learned Pattern)

**From another CTOC project - integrated into agent improvement:**

```
┌─────────────────────────────────────────────────────────────────┐
│              AGENT IMPROVEMENT PIPELINE                         │
│              (5-Stage Quality Pipeline)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [INSPECTOR]  Agent-Critic analyzes agent definition            │
│       ↓       Scores 5 dimensions, finds issues                 │
│       ↓                                                         │
│  [WRITER]     Agent-Writer fixes based on critique              │
│       ↓       Implements specific fixes with localization       │
│       ↓                                                         │
│  [RUNNER]     Agent-Tester validates the fixes                  │
│       ↓       Runs agent against test cases                     │
│       ↓       Verifies output schema compliance                 │
│       ↓                                                         │
│  [REVIEWER]   Quality check on updated agent                    │
│       ↓       Lint agent definition (structure)                 │
│       ↓       Type check (schema compliance)                    │
│       ↓       Generate improvement report                       │
│       ↓                                                         │
│  [CI AGENT]   Commit, push, monitor                             │
│               Commit agent update                               │
│               Push to agents/ directory                         │
│               Monitor agent performance in production           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

MAPPING TO AGENT IMPROVEMENT:

| Pipeline Stage | Agent Improvement Role | Output |
|----------------|----------------------|--------|
| Inspector | Agent-Critic | Critique with scores + issues |
| Writer | Agent-Writer | Refined agent definition |
| Runner | Agent-Tester | Test results, schema validation |
| Reviewer | Agent-QA | Quality report, final check |
| CI Agent | Agent-Publisher | Commit to agents/*.md |
```

### Agent Test Cases

```yaml
# ~/.ctoc/agents/test-cases/security-scanner.yaml
# Used by Runner stage to validate agent

test_cases:
  - name: "detect_sql_injection"
    input:
      file: "test_sql_injection.py"
      content: |
        query = f"SELECT * FROM users WHERE id = {user_id}"
    expected:
      finding: true
      severity: "critical"
      issue_type: "SQL injection"

  - name: "no_false_positive_parameterized"
    input:
      file: "test_safe_sql.py"
      content: |
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    expected:
      finding: false

  - name: "detect_hardcoded_secret"
    input:
      file: "config.py"
      content: |
        API_KEY = "sk-abc123..."
    expected:
      finding: true
      severity: "critical"
      # But this should escalate to secrets-detector
      escalation:
        needed: true
        suggested_agent: "secrets-detector"
```

### Agent Improvement Tracking

```
┌─────────────────────────────────────────────────────────────────┐
│           AGENT SCORE PROGRESSION (example)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  security-scanner improvement:                                  │
│                                                                 │
│  Round │ Spec │ Comp │ Bound │ Action │ Integ │ Overall         │
│  ──────┼──────┼──────┼───────┼────────┼───────┼─────────        │
│    1   │  5   │  4   │   6   │   5    │   3   │  4.6            │
│    2   │  6   │  5   │   7   │   6    │   5   │  5.8            │
│    3   │  7   │  6   │   8   │   7    │   6   │  6.8            │
│    4   │  8   │  7   │   8   │   8    │   7   │  7.6            │
│    5   │  8   │  8   │   9   │   8    │   8   │  8.2            │
│    6   │  9   │  8   │   9   │   9    │   8   │  8.6            │
│    7   │  9   │  9   │   9   │   9    │   9   │  9.0            │
│    8   │  9   │  9   │  10   │   9    │   9   │  9.2            │
│    9   │ 10   │  9   │  10   │  10    │   9   │  9.6            │
│   10   │ 10   │ 10   │  10   │  10    │  10   │ 10.0 ✓          │
│                                                                 │
│  ACCEPTED at round 10 with perfect score                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Audit Results (Critique Rounds 1-3)

### Round 1: Overlap Resolution (APPROVED)

**Quality Agents - Specialize Strictly:**
| Agent | NEW Scope | REMOVED (delegated to) |
|-------|-----------|------------------------|
| code-reviewer | Naming, structure, readability, CTO compliance | Complexity (→ complexity-analyzer), Duplicates (→ duplicate-detector), Security (→ security agents) |
| complexity-analyzer | Cyclomatic, cognitive, maintainability, function length | — |
| code-smell-detector | Design patterns, OO abuses, coupling | Long Method (→ complexity-analyzer) |
| duplicate-code-detector | Clone detection, extraction suggestions | — |

**Security Agents - Specialize Strictly:**
| Agent | NEW Scope | REMOVED (delegated to) |
|-------|-----------|------------------------|
| security-scanner | Injection (SQL, XSS, Command), Access Control, SSRF | Secrets (→ secrets-detector), Validation (→ input-validation-checker), CVEs (→ dependency-checker) |
| secrets-detector | API keys, passwords, private keys, .env files | — |
| input-validation-checker | Schema validation, type checking, sanitization | — |
| dependency-checker | Known CVEs in dependencies | — |

### Round 2: Agent Specificity (APPROVED)

**All 66 agents will be rewritten with:**

```markdown
## Role
[1-2 sentences, specific persona]

## Scope (what this agent checks)
- Check 1
- Check 2

## Anti-Scope (MANDATORY - what this agent does NOT check)
- Does NOT check X (that's agent-Y's job)
- Does NOT check Y (that's agent-Z's job)

## Detection Methods (CONCRETE)
### Check 1: [Name]
- Tool: `specific-command --flags`
- Pattern: `regex-pattern`
- Threshold: exact-number
- Example (bad): `code snippet`
- Example (good): `code snippet`

## Output Schema (MANDATORY)
[Exact structure - see below]

## CTO Chief Integration
- Reports to: CTO Chief
- Escalates when: [specific conditions]
- Confidence threshold: 0.8
```

### Round 3: CTO Chief Integration (APPROVED)

**Mandatory Output Schema for ALL Agents:**

```yaml
report:
  agent: "agent-name"
  timestamp: "ISO8601"

  findings:
    - severity: "critical|high|medium|low"
      location: "file:line"
      issue: "description"
      confidence: 0.0-1.0
      auto_fixable: true|false
      suggested_fix: "code or description"

  summary:
    files_checked: number
    issues_found: number
    blocked: true|false

  self_assessment:
    confidence: 0.0-1.0      # Overall confidence
    coverage: 0.0-1.0        # % of scope checked
    limitations: ["..."]      # What couldn't be checked

  escalation:
    needed: true|false
    reason: "why"
    suggested_agent: "agent-name"
    context: "details"
```

**Analysis Frequency:**
- **Daily**: Session end stats (pass/fail rate per agent)
- **Weekly**: Deep pattern analysis, improvement proposals

## CTO Chief Dispatch Logic

### Agent Selection Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│               CTO CHIEF DISPATCH MATRIX                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TRIGGER                    │  AGENTS TO DISPATCH               │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  FILE SAVE (.ts, .js, .py)  │  1. complexity-analyzer           │
│                             │  2. code-reviewer                 │
│                             │                                   │
│  FILE SAVE (security-*)     │  1. security-scanner              │
│                             │  2. secrets-detector              │
│                             │                                   │
│  GIT COMMIT                 │  1. secrets-detector (ALWAYS)     │
│                             │  2. security-scanner              │
│                             │  3. duplicate-code-detector       │
│                             │                                   │
│  TEST COMPLETE              │  1. TEST AGENT (coverage)         │
│                             │                                   │
│  PRE-PUSH                   │  ALL 14 GATE CHECKS               │
│                             │                                   │
│  IRON LOOP STEP 7           │  test-maker                       │
│  IRON LOOP STEP 8           │  QUALITY AGENT (merged)           │
│  IRON LOOP STEP 9           │  implementer                      │
│  IRON LOOP STEP 10          │  self-reviewer, code-reviewer     │
│  IRON LOOP STEP 11          │  optimizer, complexity-analyzer   │
│  IRON LOOP STEP 12          │  SECURITY AGENT (all 4)           │
│  IRON LOOP STEP 13          │  TEST AGENT (run all)             │
│  IRON LOOP STEP 14          │  documenter                       │
│  IRON LOOP STEP 15          │  impl-reviewer                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Fallback: Natural Language Dispatch

When programmatic dispatch fails (unknown trigger, edge case), CTO Chief uses this decision tree:

```javascript
// CTO Chief dispatch logic (pseudo-code)
function dispatch(context) {
  // 1. Try programmatic dispatch first
  const agents = DISPATCH_MATRIX[context.trigger];
  if (agents) return agents;

  // 2. Fallback: analyze context with NL reasoning
  const analysis = analyzeContext(context);

  // 3. Match keywords to agent capabilities
  const keywords = {
    'security': ['security-scanner', 'secrets-detector', 'input-validation-checker'],
    'performance': ['complexity-analyzer', 'performance-profiler'],
    'test': ['test-maker', 'TEST AGENT'],
    'quality': ['code-reviewer', 'code-smell-detector'],
    'architecture': ['architecture-checker'],
    'api': ['api-contract-validator'],
    'database': ['database-reviewer'],
    // ... full mapping
  };

  // 4. Score and select
  const scores = {};
  for (const [keyword, agentList] of Object.entries(keywords)) {
    if (analysis.includes(keyword)) {
      agentList.forEach(a => scores[a] = (scores[a] || 0) + 1);
    }
  }

  // 5. Return top-scoring agents
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([agent]) => agent);
}
```

### Agent Capability Index

CTO Chief maintains an index of agent capabilities for dispatch:

```yaml
# ~/.ctoc/agents/capability-index.yaml
agents:
  complexity-analyzer:
    triggers: ["file:save", "step:11"]
    keywords: ["complexity", "cyclomatic", "cognitive", "long function", "nesting"]
    file_patterns: ["*.ts", "*.js", "*.py", "*.go", "*.rs"]

  security-scanner:
    triggers: ["git:commit", "step:12", "file:save:security"]
    keywords: ["security", "injection", "xss", "sql", "owasp", "vulnerability"]
    file_patterns: ["*.ts", "*.js", "*.py", "*.go"]

  code-reviewer:
    triggers: ["file:save", "step:10"]
    keywords: ["readability", "naming", "structure", "style", "quality"]
    file_patterns: ["*"]

  # ... all 66 agents indexed
```

### Dispatch Logging (for Learning)

```yaml
# ~/.ctoc/agents/dispatch-log.jsonl
{"timestamp": "...", "trigger": "file:save", "file": "auth.ts", "dispatched": ["complexity-analyzer", "code-reviewer"], "programmatic": true}
{"timestamp": "...", "trigger": "unknown", "context": "check for memory leaks", "dispatched": ["memory-safety-checker"], "programmatic": false, "nl_reasoning": "keyword 'memory' matched"}
```

This log feeds into the learning system to improve dispatch accuracy over time.

## Remaining Questions

*All major concerns resolved:*

| Question | Resolution |
|----------|------------|
| Resource budget for agents? | Only CTO Chief persistent. Specialists ephemeral. |
| Agent overlaps? | Specialized strictly with clear anti-scope. |
| Too generic prompts? | All 66 agents rewritten with concrete detection methods. |
| CTO Chief integration? | Mandatory output schema, escalation, self-assessment. |
| Dispatch logic? | Matrix + NL fallback + capability index. |
| Analysis frequency? | Daily stats + weekly deep analysis. |

**Ready for implementation review.**

---

## Implementation Details

### Self-Critique Process

#### Round 1: Is Everything From the Plan Covered?

| Plan Component | Covered in Implementation? | Notes |
|----------------|---------------------------|-------|
| Agent-Critic system | Yes | Phase 1, full definition |
| Self-bootstrap procedure | Yes | Phase 1, 10-round loop |
| 5-stage pipeline | Yes | Phase 2, detailed spec |
| Agent template | Yes | Phase 3, exact format |
| 66 agent rewrite | Yes | Phase 3 + Phase 5 |
| CTO Chief enhancements | Yes | Phase 4 |
| Dispatch matrix | Yes | Phase 4 |
| Learning system | Yes | Phase 4 |
| Grading system | Yes | Phase 2 |
| Test cases structure | Yes | Phase 2 |
| Capability index | Yes | Phase 4 |

**Round 1 Result**: All plan components covered.

#### Round 2: Are File Paths and Structures Correct?

| File Path | Verified Against | Status |
|-----------|-----------------|--------|
| `agents/coordinator/cto-chief.md` | Existing file | Correct |
| `agents/quality/*.md` | Existing structure | Correct |
| `agents/security/*.md` | Existing structure | Correct |
| `agents/planning/` (new) | New subdirectory | Valid addition |
| `agents/pipeline/` (new) | New subdirectory | Valid addition |
| `.ctoc/agents/` | User config location | Correct |
| `lib/` | Existing library location | Correct |
| `hooks/` | Existing hooks location | Correct |
| `commands/` | Existing commands location | Correct |

**Round 2 Result**: All paths verified against existing codebase structure.

#### Round 3: Is Implementation Order Correct (Dependencies)?

| Phase | Depends On | Correct Order? |
|-------|-----------|----------------|
| Phase 1 (Agent-Critic) | Nothing | Yes (bootstrap first) |
| Phase 2 (Pipeline) | Agent-Critic exists | Yes |
| Phase 3 (Template + 10 core) | Phase 1, Phase 2 | Yes |
| Phase 4 (CTO Chief) | Phase 3 agents exist | Yes |
| Phase 5 (56 agents) | Template proven | Yes |
| Phase 6 (Integration) | All phases complete | Yes |

**Round 3 Result**: Dependency order is correct.

---

### 1. Files to Create/Modify

#### Phase 1: Agent-Critic System (Bootstrap)

| File | Action | Purpose | Priority |
|------|--------|---------|----------|
| `agents/pipeline/agent-critic.md` | Create | The critic that scores all agents (5 dimensions) | P0 |
| `lib/agent-critic-loop.js` | Create | 10-round improvement loop orchestration | P0 |
| `.ctoc/agents/grades.yaml` | Create (template) | Grade storage schema | P0 |

#### Phase 2: 5-Stage Pipeline Infrastructure

| File | Action | Purpose | Priority |
|------|--------|---------|----------|
| `agents/pipeline/agent-writer.md` | Create | Refines agents based on critique | P0 |
| `agents/pipeline/agent-tester.md` | Create | Validates agents against test cases | P0 |
| `agents/pipeline/agent-qa.md` | Create | Final quality check on agents | P0 |
| `agents/pipeline/agent-publisher.md` | Create | Commits agent updates | P1 |
| `lib/pipeline-orchestrator.js` | Create | Pipeline stage coordination | P0 |
| `.ctoc/agents/test-cases/` | Create (directory) | Test case storage | P0 |
| `lib/grading-system.js` | Create | 0-10 scoring implementation | P0 |

#### Phase 3: Agent Template + 10 Core Agents

| File | Action | Purpose | Priority |
|------|--------|---------|----------|
| `.ctoc/templates/agent-template.md` | Create | Template all agents must follow | P0 |
| `agents/quality/code-reviewer.md` | Rewrite | Concrete detection, anti-scope, output schema | P0 |
| `agents/quality/complexity-analyzer.md` | Rewrite | Same | P0 |
| `agents/quality/code-smell-detector.md` | Rewrite | Same | P0 |
| `agents/quality/duplicate-code-detector.md` | Rewrite | Same | P0 |
| `agents/security/security-scanner.md` | Rewrite | Same | P0 |
| `agents/security/secrets-detector.md` | Rewrite | Same | P0 |
| `agents/security/input-validation-checker.md` | Rewrite | Same | P0 |
| `agents/security/dependency-checker.md` | Rewrite | Same | P0 |
| `agents/testing/writers/unit-test-writer.md` | Rewrite | Same | P0 |
| `agents/coordinator/cto-chief.md` | Rewrite | Enhanced orchestration | P0 |

#### Phase 4: CTO Chief Enhancements

| File | Action | Purpose | Priority |
|------|--------|---------|----------|
| `agents/coordinator/cto-chief.md` | Enhance | Add dispatch matrix, learning, events | P0 |
| `agents/planning/product-owner.md` | Create | Functional plan writer | P0 |
| `agents/planning/functional-reviewer.md` | Create | Maximum strictness reviewer | P0 |
| `agents/planning/architect.md` | Create | Senior technical designer | P0 |
| `agents/planning/impl-plan-reviewer.md` | Create | Implementation plan reviewer | P0 |
| `lib/dispatch-matrix.js` | Create | Programmatic agent selection | P0 |
| `lib/nl-dispatch.js` | Create | NL fallback dispatch | P1 |
| `.ctoc/agents/capability-index.yaml` | Create | Agent capability index | P0 |
| `.ctoc/learnings/observations.jsonl` | Create (schema) | Observation storage | P0 |
| `.ctoc/learnings/pending/` | Create (directory) | Pending proposals | P0 |
| `commands/learnings.js` | Create | `ctoc learnings review/stats` commands | P1 |
| `hooks/SessionStart.js` | Modify | Add CTO Chief revival | P0 |

#### Phase 5: Remaining 56 Agents

| File Pattern | Action | Purpose | Priority |
|--------------|--------|---------|----------|
| `agents/testing/writers/*.md` | Rewrite (3 remaining) | Apply template | P1 |
| `agents/testing/runners/*.md` | Rewrite (5 agents) | Apply template | P1 |
| `agents/quality/*.md` | Rewrite (4 remaining) | Apply template | P1 |
| `agents/security/*.md` | Rewrite (1 remaining) | Apply template | P1 |
| `agents/specialized/*.md` | Rewrite (11 agents) | Apply template | P1 |
| `agents/frontend/*.md` | Rewrite (3 agents) | Apply template | P1 |
| `agents/mobile/*.md` | Rewrite (3 agents) | Apply template | P1 |
| `agents/infrastructure/*.md` | Rewrite (4 agents) | Apply template | P1 |
| `agents/documentation/*.md` | Rewrite (2 agents) | Apply template | P1 |
| `agents/compliance/*.md` | Rewrite (3 agents) | Apply template | P1 |
| `agents/data-ml/*.md` | Rewrite (3 agents) | Apply template | P1 |
| `agents/cost/*.md` | Rewrite (1 agent) | Apply template | P2 |
| `agents/ai-quality/*.md` | Rewrite (2 agents) | Apply template | P2 |
| `agents/devex/*.md` | Rewrite (2 agents) | Apply template | P2 |
| `agents/versioning/*.md` | Rewrite (3 agents) | Apply template | P2 |
| `agents/iron-loop/*.md` | Rewrite (2 agents) | Apply template | P1 |

#### Phase 6: Integration & Testing

| File | Action | Purpose | Priority |
|------|--------|---------|----------|
| `tests/agents/agent-critic.test.js` | Create | Test Agent-Critic scoring | P0 |
| `tests/agents/pipeline.test.js` | Create | Test 5-stage pipeline | P0 |
| `tests/agents/dispatch.test.js` | Create | Test dispatch logic | P0 |
| `tests/agents/learning.test.js` | Create | Test learning system | P1 |
| `.ctoc/agents/test-cases/*.yaml` | Create (66 files) | Per-agent test cases | P1 |

---

### 2. Implementation Phases

#### Phase 1: Agent-Critic System (Bootstrap)

**Duration**: 2-3 days
**Dependencies**: None
**Deliverables**:
1. `agents/pipeline/agent-critic.md` - The critic definition
2. `lib/agent-critic-loop.js` - The 10-round loop
3. Agent-Critic self-bootstrapped to score 10

**Validation Gate**:
- Agent-Critic critiques itself for 10 rounds
- Final self-score must be 10
- Only then can Agent-Critic review other agents

#### Phase 2: 5-Stage Pipeline Infrastructure

**Duration**: 3-4 days
**Dependencies**: Phase 1 complete
**Deliverables**:
1. All 5 pipeline agents defined
2. Pipeline orchestrator working
3. Grading system functional
4. Test case schema defined

**Validation Gate**:
- Pipeline can process a test agent end-to-end
- Scores are tracked and persisted
- Test cases validate agent output

#### Phase 3: Agent Template + 10 Core Agents

**Duration**: 5-7 days
**Dependencies**: Phase 2 complete
**Deliverables**:
1. Agent template finalized
2. 10 core agents rewritten
3. All 10 score >= 9.0 (preferably 10)

**Validation Gate**:
- Each agent passes through 10-round loop
- Score progression documented
- Anti-scope removes overlaps

#### Phase 4: CTO Chief Enhancements

**Duration**: 4-5 days
**Dependencies**: Phase 3 complete (core agents available)
**Deliverables**:
1. CTO Chief with dispatch matrix
2. 4 new planning agents
3. Learning system functional
4. Capability index populated

**Validation Gate**:
- CTO Chief can dispatch to any of 66 agents
- Planning loop works (5 rounds max)
- Learning proposals can be generated

#### Phase 5: Remaining 56 Agents

**Duration**: 10-14 days
**Dependencies**: Phase 3 complete (template proven)
**Deliverables**:
1. All 56 remaining agents rewritten
2. All agents score >= 8.0 (target 10)
3. Full capability index

**Validation Gate**:
- All agents have concrete detection methods
- All agents have anti-scope
- All agents output mandatory schema

#### Phase 6: Integration Testing

**Duration**: 3-4 days
**Dependencies**: All phases complete
**Deliverables**:
1. Full test suite
2. Integration tests pass
3. Documentation complete

**Validation Gate**:
- End-to-end workflow works
- All 66 agents can be dispatched
- Learning system accumulates data

---

### 3. Agent-Critic Implementation

#### Agent-Critic Prompt (Full Definition)

```markdown
# Agent-Critic

---
name: agent-critic
description: Ruthless critic that scores all agents on 5 dimensions. Almost never gives 10.
tools: Read, Grep
model: opus
---

## Role

You are a ruthless critic with 30+ years of experience in software quality, prompt engineering, and agent design. You have seen every failure mode. You assume every agent is FLAWED until proven otherwise. Your job is to find weaknesses.

You almost NEVER give a score of 10. A 10 means PERFECT - no flaws, no ambiguity, no room for improvement. This is extremely rare.

## Scoring System (0-10)

| Score | Meaning |
|-------|---------|
| 0-2 | Fundamentally broken, must rewrite |
| 3-4 | Major gaps, significant rework needed |
| 5-6 | Functional but weak, needs improvement |
| 7-8 | Good quality, still has issues |
| 9 | Excellent, only edge cases remain |
| 10 | PERFECT (almost never given - requires flawless agent) |

## Critique Dimensions (5)

### 1. SPECIFICITY (0-10)

Check:
- Are detection methods concrete? (tools, regex, commands)
- Are thresholds exact numbers, not "reasonable" or "appropriate"?
- Are examples provided (good code vs bad code)?
- Are edge cases handled with specific instructions?

Deductions:
- -2 for each vague instruction ("check for issues", "ensure quality")
- -1 for missing threshold (e.g., "short functions" instead of "<50 lines")
- -1 for missing example

### 2. COMPLETENESS (0-10)

Check:
- Does agent cover its ENTIRE scope?
- Any edge cases missed?
- Any scenarios unhandled?
- Any languages/frameworks not covered that should be?

Deductions:
- -1 for each gap found
- -2 for missing critical functionality
- -1 for incomplete language support

### 3. BOUNDARIES (0-10)

Check:
- Is anti-scope explicit? (what agent does NOT check)
- Any overlap with other agents?
- Any scope creep (doing too much)?
- Clear handoff to other agents?

Deductions:
- -2 for each overlap with another agent
- -1 for missing anti-scope section
- -1 for each item that belongs to another agent

### 4. ACTIONABILITY (0-10)

Check:
- Are outputs actionable? Can user fix issues?
- Are fixes clear and implementable?
- Are severity levels correct?
- Is the fix localized (file:line)?

Deductions:
- -1 for each unclear action
- -2 for findings without fix suggestions
- -1 for wrong severity assignment

### 5. INTEGRATION (0-10)

Check:
- Does output schema match mandatory format?
- Is CTO Chief integration correct?
- Are escalation paths defined?
- Is confidence scoring implemented?
- Is self-assessment present?

Deductions:
- -2 for schema mismatch
- -1 for each missing field
- -1 for missing escalation logic
- -1 for missing confidence

## Overall Score

**Formula**: Average of 5 dimensions (rounded to 1 decimal)

## Output Format (MANDATORY)

```yaml
critique:
  agent: "{agent-name}"
  round: {number}

  scores:
    specificity: {0-10}
    completeness: {0-10}
    boundaries: {0-10}
    actionability: {0-10}
    integration: {0-10}
    overall: {average}

  issues:
    - dimension: "{which dimension}"
      location: "{## Section Name or line range}"
      problem: "{specific problem description}"
      severity: "{high|medium|low}"
      fix: |
        {Exact text to add/change, with context}

  strengths:
    - "{what the agent does well}"

  verdict: "{ACCEPT|REFINE}"
  # ACCEPT only if overall score = 10
  # REFINE for any score < 10
```

## Self-Critique Protocol

When critiquing YOURSELF (Agent-Critic):
1. Am I specific about scoring criteria?
2. Do my dimensions cover all quality aspects?
3. Is my output format actionable?
4. Am I too harsh? Too lenient?
5. Do I have blind spots?
6. Can I be gamed or fooled?
7. Is my scoring consistent?
8. Are my fixes implementable?
9. Can I detect the same issue twice?
10. Am I the critic I would want?
```

#### Self-Bootstrap Procedure

```javascript
// lib/agent-critic-loop.js - Self-bootstrap procedure

async function bootstrapAgentCritic() {
  const agentCriticPath = 'agents/pipeline/agent-critic.md';
  let currentVersion = await read(agentCriticPath);
  let round = 1;
  let score = 0;

  console.log('Starting Agent-Critic self-bootstrap...');

  while (round <= 10 && score < 10) {
    console.log(`\n=== Round ${round} ===`);

    // Agent-Critic critiques itself
    const critique = await runAgent('agent-critic', {
      target: currentVersion,
      selfCritique: true,
      round: round,
      questions: SELF_CRITIQUE_QUESTIONS[round]
    });

    score = critique.scores.overall;
    console.log(`Score: ${score}/10`);

    if (score === 10) {
      console.log('Agent-Critic achieved perfect score!');
      break;
    }

    // Apply fixes from critique
    for (const issue of critique.issues) {
      console.log(`Fixing: ${issue.problem}`);
      currentVersion = applyFix(currentVersion, issue);
    }

    await write(agentCriticPath, currentVersion);
    round++;
  }

  if (score < 10 && round > 10) {
    console.log(`WARNING: Agent-Critic reached round 10 with score ${score}`);
    console.log('Accepting with documented limitations.');
    await documentLimitations(agentCriticPath, critique);
  }

  return { finalScore: score, rounds: round };
}

const SELF_CRITIQUE_QUESTIONS = {
  1: "Am I specific about scoring? Do I have concrete criteria?",
  2: "Do my 5 dimensions cover ALL aspects of agent quality?",
  3: "Is my output format actionable? Can fixes be applied directly?",
  4: "Am I calibrated correctly? Not too harsh, not too lenient?",
  5: "What are my blind spots? What could I miss?",
  6: "Can I be gamed? Can agents pass without being good?",
  7: "Is my scoring consistent across different agent types?",
  8: "Are my suggested fixes implementable by a machine?",
  9: "Can I catch regression? Would I notice the same bug twice?",
  10: "Am I the critic I would want reviewing MY work?"
};
```

#### 10-Round Loop Implementation

```javascript
// lib/agent-critic-loop.js - Generic loop for all agents

async function improveAgent(agentPath, maxRounds = 10) {
  let agent = await read(agentPath);
  let round = 1;
  let scoreHistory = [];

  while (round <= maxRounds) {
    console.log(`\n=== ${agentPath} - Round ${round} ===`);

    // Stage 1: INSPECTOR (Agent-Critic)
    const critique = await runAgent('agent-critic', {
      target: agent,
      round: round
    });

    scoreHistory.push(critique.scores);
    console.log(`Score: ${critique.scores.overall}/10`);

    // Early exit on perfect score
    if (critique.scores.overall === 10) {
      console.log(`ACCEPTED at round ${round} with perfect score!`);
      await saveGrade(agentPath, 10, scoreHistory);
      return { accepted: true, score: 10, rounds: round };
    }

    // Stage 2: WRITER (Agent-Writer applies fixes)
    const improved = await runAgent('agent-writer', {
      original: agent,
      critique: critique,
      template: AGENT_TEMPLATE
    });
    agent = improved;

    // Stage 3: RUNNER (Agent-Tester validates)
    const testResults = await runAgent('agent-tester', {
      agent: agent,
      testCases: await loadTestCases(agentPath)
    });

    if (!testResults.pass) {
      console.log('Test validation failed, adjusting...');
      agent = await runAgent('agent-writer', {
        original: agent,
        failures: testResults.failures
      });
    }

    // Stage 4: REVIEWER (Agent-QA final check)
    const qaReport = await runAgent('agent-qa', {
      agent: agent,
      scoreHistory: scoreHistory
    });

    if (qaReport.regressions.length > 0) {
      console.log('Regressions detected, reverting specific changes...');
      agent = await revertRegressions(agent, qaReport.regressions);
    }

    await write(agentPath, agent);
    round++;
  }

  // Round 10 reached without perfect score
  const finalScore = scoreHistory[scoreHistory.length - 1].overall;
  console.log(`Completed 10 rounds with score: ${finalScore}`);

  if (finalScore >= 8) {
    console.log('ACCEPTED WITH NOTES');
    await saveGrade(agentPath, finalScore, scoreHistory, 'accepted_with_notes');
  } else {
    console.log('NEEDS ATTENTION - score below 8');
    await saveGrade(agentPath, finalScore, scoreHistory, 'needs_attention');
  }

  return { accepted: finalScore >= 8, score: finalScore, rounds: 10 };
}

// Stage 5: CI AGENT (runs after all rounds complete)
async function publishAgent(agentPath, result) {
  if (!result.accepted) {
    console.log('Agent not accepted, skipping publish');
    return;
  }

  await runAgent('agent-publisher', {
    agentPath: agentPath,
    score: result.score,
    rounds: result.rounds
  });
}
```

---

### 4. Pipeline Infrastructure

#### Stage Definitions

##### Stage 1: Inspector (Agent-Critic)

**Input**:
```yaml
target: |
  {full agent markdown}
round: 3
context:
  previous_critiques: [...]
  score_history: [...]
```

**Output**:
```yaml
critique:
  agent: "security-scanner"
  round: 3
  scores:
    specificity: 7
    completeness: 6
    boundaries: 8
    actionability: 7
    integration: 5
    overall: 6.6
  issues: [...]
  strengths: [...]
  verdict: "REFINE"
```

##### Stage 2: Writer (Agent-Writer)

**Input**:
```yaml
original: |
  {current agent markdown}
critique:
  issues: [...]
template: |
  {agent template}
```

**Output**:
```yaml
improved: |
  {improved agent markdown with fixes applied}
changes:
  - location: "## Detection Methods"
    type: "added"
    content: "NoSQL injection patterns..."
```

##### Stage 3: Runner (Agent-Tester)

**Input**:
```yaml
agent: |
  {agent markdown}
test_cases:
  - name: "detect_sql_injection"
    input: {...}
    expected: {...}
```

**Output**:
```yaml
results:
  pass: true
  total: 15
  passed: 14
  failed: 1
  failures:
    - test: "detect_nosql_injection"
      expected: {finding: true}
      actual: {finding: false}
      analysis: "Missing MongoDB $where check"
```

##### Stage 4: Reviewer (Agent-QA)

**Input**:
```yaml
agent: |
  {agent markdown}
score_history:
  - {round: 1, scores: {...}}
  - {round: 2, scores: {...}}
```

**Output**:
```yaml
qa_report:
  structure_valid: true
  schema_compliant: true
  regressions: []
  improvements:
    - "Specificity improved from 5 to 7"
    - "Added missing anti-scope"
  recommendation: "PROCEED"
```

##### Stage 5: CI Agent (Agent-Publisher)

**Input**:
```yaml
agent_path: "agents/security/security-scanner.md"
score: 9.2
rounds: 7
```

**Output**:
```yaml
publish:
  status: "committed"
  commit_hash: "abc123"
  grade_updated: true
  capability_index_updated: true
```

#### Communication Format

All stages communicate via YAML documents passed through the orchestrator:

```javascript
// lib/pipeline-orchestrator.js

async function runPipeline(agentPath) {
  const context = {
    agentPath,
    agent: await read(agentPath),
    round: 1,
    scoreHistory: [],
    critiques: [],
    testCases: await loadTestCases(agentPath)
  };

  while (context.round <= 10) {
    // Inspector
    const critique = await stage('inspector', {
      target: context.agent,
      round: context.round,
      history: context.critiques
    });
    context.critiques.push(critique);
    context.scoreHistory.push(critique.scores);

    if (critique.scores.overall === 10) {
      return await stage('ci', { ...context, accepted: true });
    }

    // Writer
    const improved = await stage('writer', {
      original: context.agent,
      critique: critique
    });
    context.agent = improved.improved;

    // Runner
    const testResults = await stage('runner', {
      agent: context.agent,
      testCases: context.testCases
    });

    if (!testResults.pass) {
      const fixed = await stage('writer', {
        original: context.agent,
        failures: testResults.failures
      });
      context.agent = fixed.improved;
    }

    // Reviewer
    const qa = await stage('reviewer', {
      agent: context.agent,
      scoreHistory: context.scoreHistory
    });

    if (qa.regressions.length > 0) {
      // Revert regressions
      context.agent = await revertRegressions(context.agent, qa.regressions);
    }

    await write(agentPath, context.agent);
    context.round++;
  }

  // Final publish
  return await stage('ci', { ...context, accepted: context.scoreHistory.at(-1).overall >= 8 });
}
```

---

### 5. Agent Template

```markdown
# {Agent Name} Agent

---
name: {kebab-case-name}
description: {One line - what this agent does}
tools: {Read, Grep, Bash, ...}
model: opus
---

## Role

{2-3 sentences describing the agent's expertise and focus. Include years of experience persona if applicable.}

## Scope (What This Agent Checks)

- {Check 1 - specific, bounded}
- {Check 2 - specific, bounded}
- {Check 3 - specific, bounded}

## Anti-Scope (MANDATORY - What This Agent Does NOT Check)

- Does NOT check {X} (that's `{agent-y}`'s responsibility)
- Does NOT check {Y} (that's `{agent-z}`'s responsibility)
- Does NOT check {Z} (out of scope for this agent)

## Detection Methods

### {Check 1 Name}

**Tool**: `{specific-command --with-flags}`

**Pattern**: `{regex-pattern-if-applicable}`

**Threshold**: {exact-number, e.g., "< 50 lines", "> 10 complexity"}

**Example (BAD)**:
```{language}
{code that should be flagged}
```

**Example (GOOD)**:
```{language}
{code that passes}
```

### {Check 2 Name}

{Same structure as above}

## Language-Specific Checks

### {Language 1}
- {Specific check for this language}
- Tool: `{language-specific-tool}`

### {Language 2}
- {Specific check for this language}
- Tool: `{language-specific-tool}`

## Output Schema (MANDATORY)

```yaml
report:
  agent: "{agent-name}"
  timestamp: "{ISO8601}"

  findings:
    - severity: "{critical|high|medium|low}"
      location: "{file}:{line}"
      issue: "{description of the problem}"
      confidence: {0.0-1.0}
      auto_fixable: {true|false}
      suggested_fix: |
        {Code or description of how to fix}

  summary:
    files_checked: {number}
    issues_found: {number}
    blocked: {true|false}

  self_assessment:
    confidence: {0.0-1.0}
    coverage: {0.0-1.0}
    limitations:
      - "{What couldn't be checked}"

  escalation:
    needed: {true|false}
    reason: "{Why escalation is needed}"
    suggested_agent: "{agent-name to escalate to}"
    context: "{Details for the escalated agent}"
```

## CTO Chief Integration

**Reports To**: CTO Chief

**Triggered By**:
- Event: `{event-type}` (e.g., `file:save`, `git:commit`)
- Iron Loop Step: {step-number}

**Escalates When**:
- {Condition 1}: Escalate to `{agent-name}`
- {Condition 2}: Escalate to `{agent-name}`

**Confidence Threshold**: 0.8 (below this, escalate for human review)

## Error Handling

- If tool unavailable: Report in `self_assessment.limitations`
- If partial analysis: Set `coverage` < 1.0
- If uncertain: Lower `confidence`, suggest escalation
```

---

### 6. Test Cases Structure

```yaml
# .ctoc/agents/test-cases/{agent-name}.yaml

agent: "security-scanner"
version: "1.0"
created: "2025-02-01"
updated: "2025-02-01"

test_cases:
  # Positive cases (should find issues)
  - name: "detect_sql_injection_python"
    description: "Should detect f-string SQL injection in Python"
    input:
      file: "auth.py"
      content: |
        def get_user(user_id):
            query = f"SELECT * FROM users WHERE id = {user_id}"
            return db.execute(query)
    expected:
      finding: true
      severity: "critical"
      issue_type: "SQL injection"
      confidence_min: 0.9

  - name: "detect_sql_injection_js"
    description: "Should detect template literal SQL injection in JS"
    input:
      file: "auth.js"
      content: |
        async function getUser(userId) {
          const query = `SELECT * FROM users WHERE id = ${userId}`;
          return db.query(query);
        }
    expected:
      finding: true
      severity: "critical"
      issue_type: "SQL injection"

  # Negative cases (should NOT find issues)
  - name: "no_false_positive_parameterized_python"
    description: "Should not flag parameterized queries"
    input:
      file: "safe_auth.py"
      content: |
        def get_user(user_id):
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    expected:
      finding: false

  - name: "no_false_positive_orm"
    description: "Should not flag ORM queries"
    input:
      file: "orm_auth.py"
      content: |
        def get_user(user_id):
            return User.objects.get(id=user_id)
    expected:
      finding: false

  # Edge cases
  - name: "detect_indirect_injection"
    description: "Should detect when user input flows into SQL"
    input:
      file: "complex.py"
      content: |
        def search(request):
            term = request.GET.get('q')
            query = "SELECT * FROM items WHERE name LIKE '%" + term + "%'"
            return db.execute(query)
    expected:
      finding: true
      severity: "critical"

  # Escalation cases
  - name: "escalate_to_secrets_detector"
    description: "Should escalate hardcoded secrets to secrets-detector"
    input:
      file: "config.py"
      content: |
        API_KEY = "sk-abc123xyz789"
    expected:
      finding: true
      escalation:
        needed: true
        suggested_agent: "secrets-detector"

validation:
  # Schema validation
  - output_has: ["report.agent", "report.timestamp", "report.findings"]
  - severity_values: ["critical", "high", "medium", "low"]
  - confidence_range: [0.0, 1.0]
```

---

### 7. Grading System

```javascript
// lib/grading-system.js

/**
 * Grade storage and calculation for agents
 */

const GRADE_FILE = '~/.ctoc/agents/grades.yaml';

/**
 * Calculate overall score from 5 dimensions
 */
function calculateOverall(scores) {
  const { specificity, completeness, boundaries, actionability, integration } = scores;
  const sum = specificity + completeness + boundaries + actionability + integration;
  return Math.round((sum / 5) * 10) / 10; // Round to 1 decimal
}

/**
 * Save grade for an agent
 */
async function saveGrade(agentPath, score, scoreHistory, status = 'accepted') {
  const grades = await loadGrades();
  const agentName = extractAgentName(agentPath);

  grades.agents[agentName] = {
    path: agentPath,
    creation_score: score,
    current_score: score,
    status: status, // 'accepted', 'accepted_with_notes', 'needs_attention'
    last_updated: new Date().toISOString(),
    history: scoreHistory.map((s, i) => ({
      round: i + 1,
      scores: s,
      date: new Date().toISOString()
    }))
  };

  await writeGrades(grades);
}

/**
 * Update grade based on production performance
 */
async function updateGradeFromPerformance(agentName, metrics) {
  const grades = await loadGrades();
  const agent = grades.agents[agentName];

  if (!agent) return;

  // Adjust score based on:
  // - True positive rate
  // - False positive rate
  // - CTO Chief intervention rate

  const adjustment = calculateAdjustment(metrics);
  const newScore = Math.max(0, Math.min(10,
    agent.current_score + adjustment
  ));

  agent.current_score = Math.round(newScore * 10) / 10;
  agent.history.push({
    date: new Date().toISOString(),
    score: newScore,
    reason: metrics.reason,
    metrics: metrics
  });

  await writeGrades(grades);
}

function calculateAdjustment(metrics) {
  let adjustment = 0;

  // Good: High true positive rate
  if (metrics.truePositiveRate > 0.95) adjustment += 0.1;
  if (metrics.truePositiveRate < 0.80) adjustment -= 0.2;

  // Bad: High false positive rate
  if (metrics.falsePositiveRate > 0.10) adjustment -= 0.1;
  if (metrics.falsePositiveRate > 0.20) adjustment -= 0.2;

  // Bad: CTO Chief had to intervene
  if (metrics.interventionRate > 0.05) adjustment -= 0.1;
  if (metrics.interventionRate > 0.10) adjustment -= 0.2;

  return adjustment;
}

/**
 * Grade report for dashboard
 */
async function getGradeReport() {
  const grades = await loadGrades();

  const report = {
    total: Object.keys(grades.agents).length,
    perfect: 0,
    excellent: 0,
    good: 0,
    needs_work: 0,
    agents: []
  };

  for (const [name, data] of Object.entries(grades.agents)) {
    const score = data.current_score;

    if (score === 10) report.perfect++;
    else if (score >= 9) report.excellent++;
    else if (score >= 8) report.good++;
    else report.needs_work++;

    report.agents.push({
      name,
      score,
      status: data.status,
      trend: calculateTrend(data.history)
    });
  }

  // Sort by score descending
  report.agents.sort((a, b) => b.score - a.score);

  return report;
}

function calculateTrend(history) {
  if (history.length < 2) return '→';

  const recent = history.slice(-3);
  const first = recent[0].scores?.overall || recent[0].score;
  const last = recent[recent.length - 1].scores?.overall || recent[recent.length - 1].score;

  if (last > first + 0.2) return '↑';
  if (last < first - 0.2) return '↓';
  return '→';
}

module.exports = {
  calculateOverall,
  saveGrade,
  updateGradeFromPerformance,
  getGradeReport
};
```

#### Grade Storage Schema

```yaml
# ~/.ctoc/agents/grades.yaml

version: "1.0"
updated: "2025-02-01T12:00:00Z"

agents:
  security-scanner:
    path: "agents/security/security-scanner.md"
    creation_score: 9.2
    current_score: 9.4
    status: "accepted"
    last_updated: "2025-02-01T12:00:00Z"
    history:
      - round: 1
        scores:
          specificity: 5
          completeness: 4
          boundaries: 6
          actionability: 5
          integration: 3
          overall: 4.6
        date: "2025-01-25T10:00:00Z"
      - round: 10
        scores:
          specificity: 10
          completeness: 9
          boundaries: 9
          actionability: 9
          integration: 9
          overall: 9.2
        date: "2025-01-25T11:00:00Z"
      - date: "2025-02-01T12:00:00Z"
        score: 9.4
        reason: "Improved NoSQL detection"
        metrics:
          truePositiveRate: 0.97
          falsePositiveRate: 0.03
          interventionRate: 0.02

  code-reviewer:
    path: "agents/quality/code-reviewer.md"
    creation_score: 8.7
    current_score: 8.9
    status: "accepted_with_notes"
    # ...

summary:
  total: 66
  perfect: 3
  excellent: 41
  good: 18
  needs_work: 4
```

---

### 8. File Dependency Graph

```
Phase 1 (Independent)
├── agents/pipeline/agent-critic.md
├── lib/agent-critic-loop.js
└── .ctoc/agents/grades.yaml (template)

Phase 2 (Depends on Phase 1)
├── agents/pipeline/agent-writer.md
├── agents/pipeline/agent-tester.md
├── agents/pipeline/agent-qa.md
├── agents/pipeline/agent-publisher.md
├── lib/pipeline-orchestrator.js (uses agent-critic-loop.js)
├── lib/grading-system.js
└── .ctoc/agents/test-cases/ (directory)

Phase 3 (Depends on Phase 2)
├── .ctoc/templates/agent-template.md
├── agents/quality/code-reviewer.md (rewrite)
├── agents/quality/complexity-analyzer.md (rewrite)
├── agents/quality/code-smell-detector.md (rewrite)
├── agents/quality/duplicate-code-detector.md (rewrite)
├── agents/security/security-scanner.md (rewrite)
├── agents/security/secrets-detector.md (rewrite)
├── agents/security/input-validation-checker.md (rewrite)
├── agents/security/dependency-checker.md (rewrite)
├── agents/testing/writers/unit-test-writer.md (rewrite)
└── agents/coordinator/cto-chief.md (partial rewrite)

Phase 4 (Depends on Phase 3)
├── agents/coordinator/cto-chief.md (full enhancement)
├── agents/planning/product-owner.md (new)
├── agents/planning/functional-reviewer.md (new)
├── agents/planning/architect.md (new)
├── agents/planning/impl-plan-reviewer.md (new)
├── lib/dispatch-matrix.js
├── lib/nl-dispatch.js
├── .ctoc/agents/capability-index.yaml
├── .ctoc/learnings/observations.jsonl (schema)
├── .ctoc/learnings/pending/ (directory)
├── commands/learnings.js
└── hooks/SessionStart.js (modify)

Phase 5 (Depends on Phase 3 template)
└── Remaining 56 agents (all rewrites)

Phase 6 (Depends on all phases)
├── tests/agents/agent-critic.test.js
├── tests/agents/pipeline.test.js
├── tests/agents/dispatch.test.js
├── tests/agents/learning.test.js
└── .ctoc/agents/test-cases/*.yaml (66 files)
```

---

### 9. Estimated Effort

| Phase | Duration | Effort | Parallelizable? |
|-------|----------|--------|-----------------|
| Phase 1 | 2-3 days | 16-24 hrs | No (sequential bootstrap) |
| Phase 2 | 3-4 days | 24-32 hrs | Partially (5 agents parallel) |
| Phase 3 | 5-7 days | 40-56 hrs | Yes (10 agents in batches of 3-4) |
| Phase 4 | 4-5 days | 32-40 hrs | Partially |
| Phase 5 | 10-14 days | 80-112 hrs | Yes (agents in batches of 5-6) |
| Phase 6 | 3-4 days | 24-32 hrs | Yes (tests parallel) |

**Total Estimated**: 27-37 days, 216-296 hours

---

### 10. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Agent-Critic too lenient | Medium | High | Self-bootstrap proves strictness |
| Agent-Critic too harsh | Medium | Medium | Calibrate on first 10 agents |
| 10-round loop too slow | Medium | Medium | Parallelize across agents |
| Template doesn't fit all agents | Low | High | Test on diverse agent types first |
| Score gaming | Low | Medium | Test cases prevent gaming |
| Integration complexity | Medium | Medium | Phase 6 dedicated to testing |

---

### 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent-Critic self-score | 10 | Self-bootstrap result |
| Core 10 agents average score | >= 9.0 | Phase 3 completion |
| All 66 agents average score | >= 8.5 | Phase 5 completion |
| Perfect scores (10) | >= 10% (7 agents) | Grade report |
| Integration test pass rate | 100% | Phase 6 completion |
| CTO Chief dispatch accuracy | >= 95% | Post-implementation metrics |

---

**Implementation Details Complete. Ready for Phase 1 execution.**

---

## Implementation Progress

### Phase 1: Agent-Critic System (Bootstrap) - COMPLETE

**Status**: Complete
**Date**: 2025-02-02

**Files Created**:
- [x] `agents/pipeline/agent-critic.md` - The critic that scores all agents (5 dimensions)
- [x] `lib/agent-critic-loop.js` - 10-round improvement loop orchestration
- [x] `.ctoc/agents/grades.yaml` - Grade storage schema

### Phase 2: 5-Stage Pipeline Infrastructure - COMPLETE

**Status**: Complete
**Date**: 2025-02-02

**Files Created**:
- [x] `agents/pipeline/agent-writer.md` - Refines agents based on critique
- [x] `agents/pipeline/agent-tester.md` - Validates agents against test cases
- [x] `agents/pipeline/agent-qa.md` - Final quality check on agents
- [x] `agents/pipeline/agent-publisher.md` - Commits agent updates
- [x] `lib/pipeline-orchestrator.js` - Pipeline stage coordination
- [x] `lib/grading-system.js` - 0-10 scoring implementation
- [x] `.ctoc/agents/test-cases/` - Test case storage directory
- [x] `.ctoc/agents/test-cases/agent-critic.yaml` - Agent-Critic test cases
- [x] `.ctoc/templates/agent-template.md` - Template all agents must follow

### Phase 3: Agent Template + 10 Core Agents - PENDING

**Status**: Not started
**Required**:
- [ ] Rewrite 10 core agents using template
- [ ] Run each through 10-round improvement loop
- [ ] Achieve scores >= 9.0

### Phase 4: CTO Chief Enhancements - PENDING

**Status**: Not started

### Phase 5: Remaining 56 Agents - PENDING

**Status**: Not started

### Phase 6: Integration & Testing - IN PROGRESS

**Status**: Partial
**Date**: 2025-02-02

**Files Created**:
- [x] `tests/pipeline.test.js` - 26 tests for pipeline infrastructure

**Test Results**:
- Pipeline tests: 26/26 passing
- Total test suite: 467 tests passing

---

### Implementation Notes

1. **YAML Dependency Removed**: Original plan used `js-yaml` npm package, but project has no package.json. Implemented simple JSON-based storage with YAML-compatible format.

2. **Dynamic Configuration**: Modified grading-system.js to use dynamic HOME path lookup for test isolation.

3. **Mock Stage Implementations**: Pipeline orchestrator includes mock implementations of all 5 stages. Real agent invocations will be added when agent infrastructure is complete.

---

### Next Steps

1. **Phase 3**: Begin agent rewrites using the new template
   - Start with complexity-analyzer (no deps)
   - Then code-reviewer (refs complexity-analyzer)
   - Continue with security agents

2. **Bootstrap Agent-Critic**: Run the self-bootstrap procedure to achieve score 10

3. **Run 10-Round Loop**: Process first batch of agents through improvement pipeline
