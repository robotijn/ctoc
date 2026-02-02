# quality

Manage quality configuration, checking, enforcement, and visualization for your project.

## Usage

```bash
ctoc quality init [--mode <mode>] [--lang <language>]
ctoc quality check
ctoc quality dashboard
ctoc quality report [--format json|html|md] [--output <file>]
ctoc quality trend
```

## Actions

### init

Initialize quality configuration for the project.

```bash
# Auto-detect language, use strict mode
ctoc quality init

# Specify mode
ctoc quality init --mode strictest

# Specify language
ctoc quality init --lang typescript

# Both
ctoc quality init --mode strict --lang python
```

**Modes:**
- `strict` (default) - 80% coverage, standard complexity limits
- `strictest` - 90% coverage, tight limits, no `any`
- `legacy` - 50% coverage, relaxed limits for migration

### check

Run comprehensive quality check against configured thresholds.

```bash
ctoc quality check
```

**Output includes:**
- Overall quality score (0-100)
- Letter grade (A-F)
- Component breakdown (coverage, lint, security, complexity, architecture, docs)
- Configuration validation
- Top recommendations for improvement

**Example output:**
```
Quality Check Results
=====================

Quality: [################----] 82/100 (B) + +3

+ [typescript] Configuration: PASS
+ Coverage: PASS
    Lines: 85%
    Branches: 82%
    Functions: 88%
+ Architecture (layered): PASS

Top Recommendations:
  [P2] COMPLEXITY: src/services/OrderService.ts has complexity 18
  [P3] DOCS: Consider adding JSDoc to exports
```

### dashboard

View beautiful interactive quality dashboard.

```bash
ctoc quality dashboard
```

**Dashboard shows:**
```
+==============================================================+
|                    CTOC QUALITY DASHBOARD                     |
+==============================================================+
|  Overall Score: 87/100 (B - Good)           Trend: + +3      |
+==============================================================+
|  Coverage     ████████░░  82%    Security    ██████████ 100% |
|  Lint         █████████░  94%    Complexity  ████████░░  78% |
|  Architecture ███████░░░  72%    Docs        ██████░░░░  65% |
+==============================================================+
|  Top Issues:                                                  |
|  1. [COMPLEXITY] src/services/OrderService.ts (CC: 25)       |
|  2. [COVERAGE] src/utils/parser.ts (45% coverage)            |
|  3. [SECURITY] 2 medium vulnerabilities in dependencies      |
+==============================================================+
|  Recommendations:                                             |
|  * Refactor OrderService.processOrder() - extract 3 methods  |
|  * Add tests for parser.ts edge cases                        |
|  * Update lodash to 4.17.21 (CVE-2021-23337)                |
+==============================================================+
```

### report

Generate quality report in various formats.

```bash
# Terminal output (default)
ctoc quality report

# JSON for CI integration
ctoc quality report --format json

# HTML for browsers
ctoc quality report --format html --output quality-report.html

# Markdown for PRs
ctoc quality report --format md --output QUALITY.md
```

**Formats:**
- `terminal` - Colored terminal dashboard (default)
- `json` - Machine-readable JSON for CI/CD pipelines
- `html` - Beautiful HTML report with charts
- `markdown` - GitHub-flavored markdown for PRs

### trend

Show historical quality score trend.

```bash
ctoc quality trend
```

**Output:**
```
Quality Score Trend (Last 30 days)
==================================

100 |            ###
 90 |      #########
 80 |    ###########
 70 |  #############
 60 |################
    +----------------

Current:  87/100
Average:  82/100
Change:   +5 points
Samples:  23
```

## Quality Score

The quality score is calculated from six components:

| Component | Weight | Description |
|-----------|--------|-------------|
| Coverage | 25% | Test coverage (line, branch, function, statement) |
| Lint | 20% | Static analysis compliance |
| Security | 20% | Vulnerability assessment |
| Complexity | 15% | Code complexity metrics |
| Architecture | 10% | Structure and dependency health |
| Documentation | 10% | Code documentation coverage |

### Grade Thresholds

| Grade | Score | Description |
|-------|-------|-------------|
| A | 90-100 | Excellent - Production ready |
| B | 80-89 | Good - Minor improvements needed |
| C | 70-79 | Acceptable - Notable issues exist |
| D | 60-69 | Needs Work - Significant issues |
| F | 0-59 | Critical - Major intervention required |

## Examples

```bash
# Initialize TypeScript project with strict mode
ctoc quality init --lang typescript --mode strict

# Check quality before commit
ctoc quality check

# View project health dashboard
ctoc quality dashboard

# Generate HTML report for team review
ctoc quality report --format html --output reports/quality.html

# Check quality trend over time
ctoc quality trend

# Generate JSON for CI pipeline
ctoc quality report --format json > quality.json
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Quality Check
  run: |
    ctoc quality report --format json > quality.json
    SCORE=$(jq '.summary.score' quality.json)
    if [ "$SCORE" -lt 80 ]; then
      echo "Quality score $SCORE is below threshold (80)"
      exit 1
    fi
```

### PR Comments

```yaml
- name: Post Quality Report
  run: |
    ctoc quality report --format md > quality.md
    gh pr comment --body-file quality.md
```

## Supported Languages

TypeScript, Python, Java, Go, Rust, C#, PHP, Ruby, Swift, Kotlin,
C++, C, Scala, Dart, Elixir, Clojure, Haskell, Lua, R, Julia

## Coverage Report Locations

The command auto-detects coverage reports from these locations:

| Format | Paths |
|--------|-------|
| Istanbul | `coverage/coverage-summary.json`, `coverage/coverage.json` |
| LCOV | `coverage/lcov.info` |
| Go | `coverage.out` |
| Cobertura | `coverage.xml` |
| Python | `htmlcov/coverage.json` |
| JaCoCo | `target/site/jacoco/jacoco.xml` |

## History Storage

Quality history is stored in `.ctoc/quality-history.json` and tracks:
- Last 100 measurements
- Score breakdown by component
- Timestamps for trend analysis

## See Also

- `ctoc coverage` - Detailed coverage analysis
- `ctoc security` - Security scanning
- `ctoc complexity` - Code complexity analysis
- `ctoc hooks init` - Set up git hooks for quality gates
- [Quality Scoring Methodology](../skills/quality/scoring.md)
- [Quality Metrics Reference](../skills/quality/metrics.md)
