# Quality Metrics Reference

> **Complete reference for all tracked quality metrics**

## Overview

CTOC tracks a comprehensive set of quality metrics across six dimensions. This document provides detailed explanations, measurement methods, and interpretation guidance for each metric.

---

## Coverage Metrics

### Line Coverage

**Definition:** Percentage of executable source lines executed during testing.

**Measurement:**
```
line_coverage = (executed_lines / total_executable_lines) * 100
```

**Interpretation:**
| Range | Assessment | Action |
|-------|------------|--------|
| 90-100% | Excellent | Maintain |
| 80-89% | Good | Target for new code |
| 70-79% | Acceptable | Improve critical paths |
| 50-69% | Low | Prioritize test writing |
| < 50% | Critical | Immediate attention needed |

**Caveats:**
- Does not guarantee logic correctness
- Can be inflated by testing simple code
- Should be combined with branch coverage

### Branch Coverage

**Definition:** Percentage of decision branches (if/else, switch, ternary) with both outcomes tested.

**Measurement:**
```
branch_coverage = (covered_branches / total_branches) * 100
```

**Interpretation:**
| Range | Assessment | Notes |
|-------|------------|-------|
| 90-100% | Excellent | All decision paths tested |
| 80-89% | Good | Most paths covered |
| 70-79% | Acceptable | Major paths covered |
| < 70% | Insufficient | Missing edge cases |

**Why Most Important:**
- Catches untested edge cases
- Validates error handling paths
- Reveals dead code branches

### Function Coverage

**Definition:** Percentage of functions/methods called during testing.

**Measurement:**
```
function_coverage = (called_functions / total_functions) * 100
```

**Use Cases:**
- Identifies completely untested functions
- API surface coverage indicator
- Quick health check metric

### Statement Coverage

**Definition:** Percentage of individual statements executed during testing.

**Measurement:**
```
statement_coverage = (executed_statements / total_statements) * 100
```

**Relation to Line Coverage:**
- More granular than line coverage
- Single line may contain multiple statements
- Generally tracks closely with line coverage

### Coverage Gaps Analysis

**File-Level Metrics:**
- Uncovered files list
- Files with coverage < threshold
- Coverage by directory/module

**Function-Level Metrics:**
- Uncovered functions list
- Partially covered functions (< 50%)
- Complex functions with low coverage (CC > 5 && coverage < 80%)

---

## Lint Metrics

### Error Count

**Definition:** Number of lint rule violations classified as errors.

**Categories:**
| Category | Examples |
|----------|----------|
| Syntax | Parsing errors, invalid constructs |
| Type | Type mismatches, null reference risks |
| Logic | Unreachable code, assignment in condition |
| Security | Eval usage, unsafe patterns |

**Threshold by Mode:**
| Mode | Allowed Errors |
|------|---------------|
| strictest | 0 |
| strict | 0 |
| legacy | 5 per 1000 LOC |

### Warning Count

**Definition:** Non-critical issues that may indicate problems.

**Categories:**
| Category | Examples |
|----------|----------|
| Style | Inconsistent naming, formatting |
| Maintainability | Long functions, high complexity |
| Best Practice | Missing return types, unused vars |
| Performance | Inefficient patterns |

**Density Calculation:**
```
warning_density = warnings / (lines_of_code / 1000)
```

| Density | Assessment |
|---------|------------|
| < 1 | Excellent |
| 1-5 | Good |
| 5-10 | Needs attention |
| > 10 | Poor |

### Fixable Issues

**Definition:** Issues that can be automatically resolved by the linter.

**Metrics:**
- Total fixable count
- Fixable percentage: `(fixable / total_issues) * 100`
- Time to auto-fix estimate

**Action:** Run `lint --fix` to resolve automatically.

### Rule Breakdown

**Per-Rule Analysis:**
- Most violated rules (top 10)
- Rules by severity distribution
- Rules by category

**Example Output:**
```
Top Violated Rules:
1. no-unused-vars: 23 occurrences
2. prefer-const: 18 occurrences
3. @typescript-eslint/explicit-function-return-type: 15 occurrences
```

---

## Security Metrics

### Vulnerability Count by Severity

**Definition:** Number of known security vulnerabilities in dependencies and code.

**Severity Levels:**

| Severity | CVSS Score | Response Time |
|----------|-----------|---------------|
| Critical | 9.0-10.0 | Immediate (same day) |
| High | 7.0-8.9 | 24-48 hours |
| Medium | 4.0-6.9 | 1 week |
| Low | 0.1-3.9 | 2 weeks |

### Vulnerability Sources

**Dependency Vulnerabilities:**
- Direct dependencies
- Transitive dependencies
- Development dependencies

**Code Vulnerabilities:**
- SQL injection patterns
- XSS vulnerabilities
- Path traversal risks
- Hardcoded secrets

### Security Score Calculation

```
security_score = 20 - deductions

Where deductions:
- Critical: 20 (instant zero)
- High: 5 each
- Medium: 2 each
- Low: 0.5 each
```

**Minimum: 0 (cannot go negative)**

### SBOM (Software Bill of Materials)

**Tracked Information:**
- Total dependencies
- Direct vs transitive ratio
- License distribution
- Age of dependencies
- Maintainer activity

---

## Complexity Metrics

### Cyclomatic Complexity (CC)

**Definition:** Number of linearly independent paths through code.

**Calculation:**
```
CC = E - N + 2P

Where:
  E = edges in control flow graph
  N = nodes in control flow graph
  P = connected components (usually 1)
```

**Simplified:** Count decision points (if, while, for, case, catch, &&, ||, ?:) + 1

**Thresholds:**
| CC | Risk Level | Recommendation |
|----|-----------|----------------|
| 1-5 | Low | Simple, easy to test |
| 6-10 | Moderate | Acceptable complexity |
| 11-20 | High | Consider refactoring |
| 21-50 | Very High | Refactor required |
| 51+ | Extreme | Immediate refactor |

### Cognitive Complexity

**Definition:** Measures how difficult code is to understand (Sonar metric).

**Differs from CC:**
- Penalizes nested structures more
- Considers breaks in linear flow
- Weights language constructs differently

**Thresholds:**
| Score | Assessment |
|-------|------------|
| 0-5 | Excellent |
| 6-15 | Acceptable |
| 16-30 | Needs simplification |
| 31+ | Urgent refactor |

### Complexity Distribution

**Metrics Tracked:**
- Average CC across codebase
- Maximum CC (single function)
- CC standard deviation
- Complexity hotspots (CC > 15)

**Visualization:**
```
CC Distribution:
  1-5:   ████████████████████ 65%
  6-10:  ██████████ 25%
  11-20: ████ 8%
  21+:   █ 2%
```

### Nesting Depth

**Definition:** Maximum level of nested control structures.

**Thresholds:**
| Depth | Assessment |
|-------|------------|
| 1-2 | Good |
| 3-4 | Acceptable |
| 5+ | Refactor needed |

### Function Length

**Definition:** Lines of code per function.

**Thresholds by Mode:**
| Mode | Max Lines | Target |
|------|-----------|--------|
| strictest | 30 | 15 |
| strict | 50 | 25 |
| legacy | 100 | 50 |

### Parameter Count

**Definition:** Number of parameters per function.

**Thresholds:**
| Count | Assessment | Action |
|-------|------------|--------|
| 0-3 | Good | None |
| 4-5 | Acceptable | Consider object parameter |
| 6+ | Too many | Use object/builder pattern |

---

## Architecture Metrics

### Layer Violations

**Definition:** Import/dependency that crosses architectural boundaries incorrectly.

**Example Violations:**
```
Layered Architecture:
- Controller imports Repository (should go through Service)
- Model imports Controller (wrong direction)

Hexagonal Architecture:
- Adapter imports Domain directly (should use Port)
- Domain imports Infrastructure
```

**Tracking:**
- Total violation count
- Violations by type
- Most violating files
- Violation trend

### Circular Dependencies

**Definition:** Dependency cycles where A depends on B depends on A.

**Types:**
| Type | Example | Severity |
|------|---------|----------|
| Direct | A -> B -> A | High |
| Indirect | A -> B -> C -> A | Medium |
| Deep | 4+ nodes in cycle | High (hard to untangle) |

**Impact:**
- Build ordering issues
- Testing difficulties
- Mental model complexity

### Coupling Metrics

**Afferent Coupling (Ca):**
- Number of modules that depend on this module
- High Ca = widely used (stable interface needed)

**Efferent Coupling (Ce):**
- Number of modules this module depends on
- High Ce = many dependencies (fragile)

**Instability (I):**
```
I = Ce / (Ca + Ce)

Where:
  I = 0: Maximally stable (many dependents, few dependencies)
  I = 1: Maximally unstable (few dependents, many dependencies)
```

### Module Cohesion

**Definition:** How related are the elements within a module.

**LCOM (Lack of Cohesion in Methods):**
- Lower is better
- High LCOM suggests module should be split

---

## Documentation Metrics

### Coverage Percentage

**Definition:** Percentage of public API elements with documentation.

**Elements Tracked:**
- Exported functions
- Exported classes/interfaces
- Public methods
- Exported constants

**Calculation:**
```
doc_coverage = (documented_elements / total_public_elements) * 100
```

### Completeness Score

**Definition:** Quality of existing documentation.

**Criteria:**
| Element | Requirements |
|---------|-------------|
| Function | Description, params, returns, throws |
| Class | Description, constructor, public methods |
| Interface | Description, properties |
| Module | Overview, examples |

**Scoring:**
- Full documentation: 1.0
- Partial (missing params): 0.7
- Minimal (description only): 0.4
- None: 0.0

### README Assessment

**Required Sections:**
| Section | Weight |
|---------|--------|
| Title/Description | 10% |
| Installation | 20% |
| Usage/Examples | 30% |
| API Reference | 20% |
| Contributing | 10% |
| License | 10% |

### Comment Ratio

**Definition:** Ratio of comment lines to code lines.

**Calculation:**
```
comment_ratio = comment_lines / code_lines
```

**Targets:**
| Type | Target Ratio |
|------|-------------|
| Complex functions (CC > 10) | >= 20% |
| Regular functions | >= 10% |
| Simple utilities | >= 5% |

---

## Trend Analysis

### Trend Indicators

| Symbol | Name | Change |
|--------|------|--------|
| `++` | Strong Up | >= +5 points |
| `+` | Up | +2 to +4 points |
| `~` | Stable | -1 to +1 points |
| `-` | Down | -2 to -4 points |
| `--` | Strong Down | <= -5 points |

### Moving Averages

**Tracked Periods:**
- 7-day moving average
- 30-day moving average
- 90-day moving average

**Trend Detection:**
```
if (7day_avg > 30day_avg && 30day_avg > 90day_avg):
  trend = "improving"
elif (7day_avg < 30day_avg && 30day_avg < 90day_avg):
  trend = "declining"
else:
  trend = "stable"
```

### Velocity Metrics

**Improvement Velocity:**
- Points gained per week
- Time to next grade

**Degradation Alerts:**
- Score drop > 5 in 24 hours
- Grade downgrade
- New critical vulnerability

---

## Metric Collection

### Supported Tools

| Metric Type | Tools |
|-------------|-------|
| Coverage | Istanbul, NYC, c8, coverage.py, JaCoCo, llvm-cov |
| Lint | ESLint, Ruff, Clippy, golangci-lint |
| Security | npm audit, Snyk, OWASP, Semgrep |
| Complexity | ESLint rules, SonarQube, CodeClimate |
| Architecture | Dependency-cruiser, NX, Madge |

### Data Storage

**Metrics History:**
- SQLite local database
- JSON export for CI
- Optional remote sync

**Retention:**
- Raw data: 90 days
- Daily aggregates: 1 year
- Monthly aggregates: Forever

---

## See Also

- [Quality Scoring Methodology](./scoring.md)
- [Quality Dashboard Command](../../commands/quality.md)
- [CI Integration](../../docs/ci-integration.md)
