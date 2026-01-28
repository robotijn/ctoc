# CTOC — Iron Loop v2.0

> **Iron Loop is CTOC's methodology for quality software delivery.**
> This file tracks the current work in progress.

---

## Iron Loop v2.0 Overview

```
PLANNING PHASE (Steps 1-6) - Opus model
────────────────────────────────────────
1. ASSESS        Problem understanding           [functional-planner]
2. ALIGN         User goals & business objectives [functional-planner]
3. CAPTURE       Requirements & success criteria  [functional-reviewer] ◄─┐
   └─► Reject? Back to Step 1 ────────────────────────────────────────────┘

4. PLAN          Technical approach              [impl-planner]
5. DESIGN        Architecture design             [impl-planner]
6. SPEC          Detailed specifications         [impl-plan-reviewer] ◄─┐
   └─► Reject? Back to Step 4 ────────────────────────────────────────┘
   └─► Approve → [iron-loop-integrator] injects 7-15

IMPLEMENTATION PHASE (Steps 7-15)
────────────────────────────────────────
7.  TEST         Write tests first (TDD Red)     [test-maker]
8.  QUALITY      Lint, format, type-check        [quality-checker]
9.  IMPLEMENT    Setup + Code + Error handling   [implementer]
10. REVIEW       Self-review + quality re-check  [self-reviewer] ◄───────┐
    └─► TDD Loop: Need more tests? → Back to Step 7 ─────────────────────┘

11. OPTIMIZE     Performance improvements        [optimizer]
12. SECURE       Security vulnerability check    [security-scanner]
13. VERIFY       Run ALL tests                   [verifier]
14. DOCUMENT     Update documentation            [documenter]
15. FINAL-REVIEW Reviews 7-14, highest standards [impl-reviewer]
    └─► Issues? Smart loop to affected step
    └─► Satisfied? COMMIT & PUSH
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

**Feature:** CTOC v2.0 — Agent System Transformation
**Status:** Implementation Complete
**Started:** 2026-01-28

### Progress

```
[ ✓ ] Phase 1: Foundation
      ├── [x] Delete old bash scripts
      ├── [x] Create operations-registry.yaml v2.0
      ├── [x] Create settings.yaml.template
      ├── [x] Create codebase-index template
      ├── [x] Fix hooks.json paths (${CLAUDE_PROJECT_DIR})
      ├── [x] Add Node.js detection to install.sh
      ├── [x] Add hooks setup to install.sh
      └── [x] Create continuation.yaml state template

[ ✓ ] Phase 2: Management Agents
      ├── [x] cto-chief
      ├── [x] functional-planner
      ├── [x] functional-reviewer
      ├── [x] impl-planner
      ├── [x] impl-plan-reviewer
      └── [x] iron-loop-integrator

[ ✓ ] Phase 3: Implementation Agents
      ├── [x] test-maker
      ├── [x] quality-checker
      ├── [x] implementer
      ├── [x] self-reviewer
      ├── [x] optimizer
      ├── [x] security-scanner
      ├── [x] verifier
      ├── [x] documenter
      └── [x] impl-reviewer

[ ✓ ] Phase 4: Learning System
      ├── [x] Learning file structure
      ├── [x] Learning template
      └── [x] README documentation

[ ✓ ] Phase 5: Hooks Installation Fix
      ├── [x] Update hooks.json with cross-platform paths
      ├── [x] Add Node.js check to install.sh
      ├── [x] Add Node.js check to install.ps1
      ├── [x] Add hooks setup to installers
      └── [x] Enhanced pre-compact.js with continuation.yaml

[ ✓ ] Phase 6: Documentation
      ├── [x] IRON_LOOP.md v2.0
      ├── [x] Update README with Iron Loop explanation
      └── [x] Create state management README
```

---

## Agent Registry

| Agent | Model | Steps | Role |
|-------|-------|-------|------|
| cto-chief | opus | 1-15 | Coordinator |
| functional-planner | opus | 1-3 | Planning |
| functional-reviewer | opus | 3 | Review Gate |
| impl-planner | opus | 4-6 | Planning |
| impl-plan-reviewer | opus | 6 | Review Gate |
| iron-loop-integrator | sonnet | 6 | Transition |
| test-maker | opus | 7 | TDD Red |
| quality-checker | sonnet | 8,10 | Quality |
| implementer | sonnet | 9 | Code |
| self-reviewer | opus | 10 | Review |
| optimizer | sonnet | 11 | Performance |
| security-scanner | opus | 12 | Security |
| verifier | sonnet | 13 | Testing |
| documenter | sonnet | 14 | Docs |
| impl-reviewer | opus | 15 | Final Gate |

---

## Files Created

### Agents
```
.ctoc/agents/
├── coordinator/
│   └── cto-chief.md
├── planning/
│   ├── functional-planner.md
│   ├── functional-reviewer.md
│   ├── impl-planner.md
│   ├── impl-plan-reviewer.md
│   └── iron-loop-integrator.md
└── implementation/
    ├── test-maker.md
    ├── quality-checker.md
    ├── implementer.md
    ├── self-reviewer.md
    ├── optimizer.md
    ├── security-scanner.md
    ├── verifier.md
    ├── documenter.md
    └── impl-reviewer.md
```

### Configuration
```
.ctoc/
├── operations-registry.yaml    # v2.0.0 — Single source of truth
├── settings.yaml.template      # Configuration template
├── cache/
│   └── codebase-index.yaml.template
└── learnings/
    ├── README.md
    ├── learning.yaml.template
    ├── pending/
    ├── approved/
    ├── applied/
    └── rejected/
```

### Deleted
```
.ctoc/bin/                      # All bash scripts removed
├── ctoc.sh                     # Replaced by agents
├── ctoc-slim.sh
├── plan.sh
├── progress.sh
├── git-workflow.sh
├── git-atomic.sh
├── update-check.sh
└── upgrade-agent.sh
```

---

## Next Steps

1. Test hooks installation on fresh project
2. Verify continuation.yaml saves correctly on compaction
3. Final testing of agent invocation flow
4. Commit and push v2.0

---

## Notes

- Claude Code IS the runtime — no separate runtime needed
- Everything is an agent (tiered by complexity)
- Model minimum: Haiku (configurable to sonnet/opus)
- Learning system: per-project, git-tracked

---

*Last updated: 2026-01-28*
