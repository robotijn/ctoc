# Quality Scoring Methodology

> **Comprehensive scoring system for code quality assessment**

## Overview

The CTOC Quality Scoring system provides a unified 0-100 score that aggregates multiple quality dimensions into a single, actionable metric. This score enables teams to track quality improvements, set benchmarks, and identify areas needing attention.

---

## Score Components and Weights

| Component | Weight | Description |
|-----------|--------|-------------|
| **Test Coverage** | 25% | Line, branch, function, and statement coverage |
| **Lint Compliance** | 20% | Static analysis violations, warnings, and style issues |
| **Security** | 20% | Vulnerabilities by severity (critical, high, medium, low) |
| **Complexity** | 15% | Cyclomatic complexity, cognitive load, nesting depth |
| **Architecture** | 10% | Layer violations, circular dependencies, coupling |
| **Documentation** | 10% | API docs, README completeness, inline comments |

**Total: 100%**

---

## Component Scoring Details

### Test Coverage (25 points max)

Coverage is weighted by importance:

| Metric | Sub-weight | Rationale |
|--------|-----------|-----------|
| Branch Coverage | 40% | Most critical - tests decision paths |
| Line Coverage | 30% | Basic execution coverage |
| Function Coverage | 20% | API surface coverage |
| Statement Coverage | 10% | Granular execution tracking |

**Calculation:**
```
coverage_score = (
  (branch_pct * 0.40) +
  (line_pct * 0.30) +
  (function_pct * 0.20) +
  (statement_pct * 0.10)
) / 100 * 25
```

**Example:**
- Branch: 80%, Line: 85%, Function: 90%, Statement: 88%
- Score: ((80 * 0.4) + (85 * 0.3) + (90 * 0.2) + (88 * 0.1)) / 100 * 25 = **21.3/25**

### Lint Compliance (20 points max)

Scoring based on issue severity and density:

| Issue Type | Deduction per Occurrence |
|------------|-------------------------|
| Error | -2.0 points |
| Warning | -0.5 points |
| Info/Hint | -0.1 points |

**Calculation:**
```
lint_score = max(0, 20 - (errors * 2.0) - (warnings * 0.5) - (info * 0.1))
```

**Density Bonus:** If issues per 1000 LOC < 1, add 2 bonus points (max 20 total).

### Security (20 points max)

Vulnerabilities scored by severity with exponential impact:

| Severity | Deduction | Rationale |
|----------|-----------|-----------|
| Critical | -20 points (all) | Zero tolerance for critical vulns |
| High | -5 points each | Significant risk |
| Medium | -2 points each | Moderate concern |
| Low | -0.5 points each | Minor issues |

**Calculation:**
```
security_score = max(0, 20 - (critical > 0 ? 20 : 0) - (high * 5) - (medium * 2) - (low * 0.5))
```

**Note:** A single critical vulnerability sets the security score to 0.

### Complexity (15 points max)

Based on cyclomatic complexity distribution:

| Metric | Threshold | Scoring |
|--------|-----------|---------|
| Average CC | <= 5 | Full points (5) |
| Average CC | 6-10 | Partial (3) |
| Average CC | > 10 | Minimal (1) |
| Max CC | <= 10 | Full points (5) |
| Max CC | 11-20 | Partial (3) |
| Max CC | > 20 | Minimal (1) |
| Hotspots (CC > 15) | 0 | Full points (5) |
| Hotspots | 1-3 | Partial (3) |
| Hotspots | > 3 | Minimal (1) |

**Calculation:**
```
complexity_score = avg_cc_points + max_cc_points + hotspot_points
```

### Architecture (10 points max)

| Metric | Points Available | Scoring |
|--------|-----------------|---------|
| Pattern Detected | 3 | Has clear architecture pattern |
| No Violations | 4 | Zero layer violations |
| No Cycles | 3 | Zero circular dependencies |

**Deductions:**
- Each violation: -0.5 points (from violations pool)
- Each cycle: -1.0 point (from cycles pool)

### Documentation (10 points max)

| Metric | Points | Requirement |
|--------|--------|-------------|
| Public API Docs | 4 | >= 80% of exports documented |
| README Exists | 2 | Has README.md with sections |
| Inline Comments | 2 | >= 10% comment ratio in complex files |
| Type Definitions | 2 | TypeScript types or JSDoc annotations |

---

## Grade Thresholds

| Grade | Score Range | Description | Badge Color |
|-------|-------------|-------------|-------------|
| **A** | 90-100 | Excellent - Production ready | Green |
| **B** | 80-89 | Good - Minor improvements needed | Blue |
| **C** | 70-79 | Acceptable - Notable issues exist | Yellow |
| **D** | 60-69 | Needs Work - Significant issues | Orange |
| **F** | 0-59 | Critical - Major intervention required | Red |

### Grade Requirements by Mode

| Mode | Minimum Grade | Enforcement |
|------|---------------|-------------|
| `strictest` | A (90+) | Block merges below threshold |
| `strict` | B (80+) | Warn on B, block below |
| `legacy` | D (60+) | Allow gradual improvement |

---

## Trend Analysis

### Trend Indicators

| Symbol | Meaning | Threshold |
|--------|---------|-----------|
| `++` | Strong Improvement | +5 or more from last |
| `+` | Improving | +1 to +4 from last |
| `=` | Stable | -1 to +1 from last |
| `-` | Declining | -2 to -4 from last |
| `--` | Rapid Decline | -5 or more from last |

### Historical Tracking

The system maintains a rolling window of:
- Last 30 measurements
- Daily averages for last 90 days
- Weekly averages for last year

---

## Score Modifiers

### Context Adjustments

| Context | Modifier | Rationale |
|---------|----------|-----------|
| New Project (< 30 days) | +5 grace | Allow ramp-up time |
| Legacy Migration | Custom baseline | Measure from starting point |
| Active Refactoring | Suspended | Don't penalize during improvement |

### Team Size Factors

| Team Size | Documentation Weight | Rationale |
|-----------|---------------------|-----------|
| Solo | 5% (reduced) | Self-documenting acceptable |
| 2-5 | 10% (standard) | Team needs docs |
| 6+ | 15% (increased) | Critical for coordination |

---

## Integration Points

### CI/CD Gates

```yaml
# Example CI configuration
quality:
  minimum_score: 80
  required_grade: B
  fail_on_decline: true
  decline_threshold: 5
```

### PR Requirements

| Check | Requirement |
|-------|-------------|
| Score Change | Must not decrease by > 3 points |
| New Coverage | New code must have >= 80% coverage |
| New Complexity | New functions must have CC <= 10 |
| Security | Zero new vulnerabilities |

---

## Recommendations Engine

Based on the score breakdown, the system generates prioritized recommendations:

### Priority Levels

| Priority | Criteria | Example |
|----------|----------|---------|
| **P0 - Critical** | Security critical, blocks release | "Fix CVE-2024-XXXX in lodash" |
| **P1 - High** | Major quality gap | "Coverage at 45%, below 80% threshold" |
| **P2 - Medium** | Notable improvement area | "3 functions exceed CC limit" |
| **P3 - Low** | Nice to have | "Consider adding JSDoc to exports" |

### Recommendation Format

```
[PRIORITY] Category: Brief description
  -> Action: Specific steps to resolve
  -> Impact: Expected score improvement
```

---

## Best Practices

### Improving Your Score

1. **Quick Wins** (1-2 days)
   - Add missing tests for uncovered branches
   - Fix auto-fixable lint issues
   - Update vulnerable dependencies

2. **Medium Term** (1-2 weeks)
   - Refactor high-complexity functions
   - Add documentation for public APIs
   - Resolve architecture violations

3. **Long Term** (1+ month)
   - Implement comprehensive test strategy
   - Migrate to stricter lint rules
   - Redesign tightly-coupled modules

### Avoiding Score Gaming

The scoring system is designed to resist manipulation:
- Branch coverage weighted highest (prevents trivial test inflation)
- Security has zero-tolerance for critical issues
- Complexity hotspots tracked (prevents averaging tricks)
- Trend monitoring catches temporary fixes

---

## See Also

- [Quality Metrics Reference](./metrics.md)
- [Quality Dashboard](../../commands/quality.md)
- [CI Integration Guide](../../docs/ci-integration.md)
