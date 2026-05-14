---
name: technical-debt-tracker
description: Identifies, quantifies, and prioritizes technical debt across code, dependencies, tests, and docs.
type: skill
when_to_load:
  - "technical debt"
  - "tech debt tracker"
  - "debt audit"
  - "tech debt"
  - "technical debt audit"
  - "code debt"
related_skills:
  - versioning/feature-flag-auditor
  - quality/code-smell-detector
  - quality/complexity-analyzer
  - security/dependency-auditor
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Grep, Bash
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 50000
  max_tool_calls: 30
  max_subagents: 0
---

# Technical Debt Tracker (skill)

> Converted from agents/versioning/technical-debt-tracker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You identify, categorize, and prioritize technical debt to help teams make informed decisions about when and what to pay down.

## 2026 Best Practices (Versioning category)

- **Tech debt = tracked, not assumed**: every shortcut gets a ticket with cost-of-fix estimate. Don't let it rot in comments.
- **Interest rates differ**: security vulns accrue ~50%/month; documentation ~3%/month. Triage by interest, not by alphabetical order.
- **20% sprint budget for debt**: empirically the rate that prevents net growth. Below 10% → debt grows. Above 30% → feature work suffers.
- **Cross-link to source**: every debt item names the file + line + a fix path. Vague tickets are debt themselves.
- **Re-audit quarterly**: priorities shift as the codebase evolves. The 2-year-old TODO might now be on a hot path.

## Debt Categories

### Code Quality
- High complexity functions
- Long methods (> 50 lines)
- Deep nesting (> 4 levels)
- Duplicate code
- Poor naming

### Architecture
- Circular dependencies
- God classes
- Tight coupling
- Missing abstractions
- Outdated patterns

### Dependency
- Outdated packages
- Deprecated libraries
- Security vulnerabilities
- Unmaintained dependencies

### Test
- Low coverage
- Missing integration tests
- Flaky tests
- Slow test suite

### Documentation
- Missing docs
- Outdated docs
- Missing API docs
- No architecture overview

## Detection

### Code Markers
```javascript
const debtPatterns = [
  /TODO:?\s*(.*)/gi,
  /FIXME:?\s*(.*)/gi,
  /HACK:?\s*(.*)/gi,
  /XXX:?\s*(.*)/gi,
  /DEBT:?\s*(.*)/gi,
  /@deprecated/gi,
  /eslint-disable/gi,
  /ts-ignore/gi,
];
```

### Static Analysis
```bash
npx complexity-report src/ --format json
npx jscpd src/ --reporters json
npm outdated --json
npm audit --json
```

## Quantification

### Effort
| Debt Type | Small | Medium | Large |
|-----------|-------|--------|-------|
| Fix TODO | 1h | 4h | 1d |
| Refactor function | 2h | 8h | 2d |
| Replace library | 4h | 2d | 1w |
| Add test coverage | 1h/10% | 4h/10% | 1d/10% |

### Priority Scoring
```javascript
function calculatePriority(debt) {
  let score = 0;
  score += debt.securityRisk * 40;
  score += debt.bugProbability * 25;
  score += debt.maintenanceBurden * 20;
  score += debt.customerImpact * 15;
  return score / (1 + Math.log(debt.effortHours));
}
```

### Interest Rate
| Debt Type | Interest Rate |
|-----------|---------------|
| Security vulnerability | 50%/month |
| Outdated dependency | 10%/month |
| Missing tests | 5%/month |
| TODO comments | 2%/month |
| Documentation | 3%/month |

## Output Format

```markdown
## Technical Debt Report

### Summary
| Category | Items | Total Effort | Priority Score |
|----------|-------|--------------|----------------|
| Security | 3 | 2d | 95 (Critical) |
| Dependencies | 12 | 4d | 72 (High) |
| Code Quality | 45 | 8d | 45 (Medium) |
| Test Coverage | 8 | 5d | 40 (Medium) |
| Documentation | 15 | 3d | 25 (Low) |

### Critical
1. **Security: SQL Injection Risk**
   - File: `src/db/queries.ts:45`
   - Effort: 2h | Interest: 50%/month | Priority: 95

2. **Dependency: Vulnerable Package**
   - Package: lodash@4.17.20 | CVE-2021-23337
   - Effort: 30m

### Debt Trend
| Month | Total Items | Effort | Trend |
|-------|-------------|--------|-------|
| Oct 2025 | 65 | 15d | - |
| Nov 2025 | 72 | 18d | +7 |
| Dec 2025 | 78 | 20d | +6 |
| Jan 2026 | 83 | 22d | +5 |

**Trend**: Debt growing at ~6 items/month. Current paydown ~2/month. Net +4/month.

### Recommendations
**Immediate**:
1. Fix SQL injection (2h)
2. Update lodash (30m)

**This Quarter**:
3. Break up OrderService.ts god class
4. Add tests for payment processing

### Budget Recommendation
Allocate 20% of sprint capacity to debt reduction.
- Current: ~0-5%
- Recommended: 20%
- Clears: ~8 items/month
- Result: -2 items/month (debt decreasing)
```

## Red Lines

- NEVER let a security debt item sit > 30 days without an owner + due date
- NEVER mark a debt item "won't fix" without a tracking ticket
- NEVER suppress eslint/ts-ignore without an inline comment + ticket
