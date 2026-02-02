# Coverage Command

Test coverage checking, enforcement, and reporting.

## Usage

```bash
ctoc coverage check [--mode <mode>]
ctoc coverage report [--format <format>]
ctoc coverage enforce [--threshold <n>]
ctoc coverage trend
ctoc coverage files [--below <threshold>]
```

## Actions

### check

Check coverage against thresholds for the current mode.

```bash
# Check with strict mode (default)
ctoc coverage check

# Check with strictest mode (90% threshold)
ctoc coverage check --mode strictest

# Check with legacy mode (50% threshold)
ctoc coverage check --mode legacy
```

**Output:**
```
=== Coverage Report ===

Mode: strict

+ lines     : 85% (threshold: 80%) [PASS]
+ branches  : 78% (threshold: 80%) [FAIL]
+ functions : 90% (threshold: 80%) [PASS]
+ statements: 85% (threshold: 80%) [PASS]

Overall: FAIL - Coverage below thresholds

Failures:
  - branches: 78% < 80% threshold
```

### report

Generate coverage report in various formats.

```bash
# Text format (default)
ctoc coverage report

# JSON format
ctoc coverage report --format json

# Markdown format
ctoc coverage report --format markdown
```

### enforce

Enforce coverage with exit code for CI pipelines.

```bash
# Enforce default thresholds
ctoc coverage enforce

# Enforce custom threshold
ctoc coverage enforce --threshold 85
```

Returns exit code 1 if coverage is below threshold (for CI).

### trend

Show coverage trend over time.

```bash
ctoc coverage trend
```

**Output:**
```
Coverage Trend
==============

100% |
 90% |          ###
 80% |     #####
 70% |  ###
 60% | #
     +------------------

Current:  88%
Average:  82%
Change:   +12.5%
Samples:  15

Coverage is trending UP - keep it up!
```

### files

Show per-file coverage, highlighting files below threshold.

```bash
# Show files below mode threshold
ctoc coverage files

# Show files below custom threshold
ctoc coverage files --below 90
```

**Output:**
```
Per-File Coverage
=================

Showing files below 80% coverage

| File                                     | Lines | Branches | Gap  |
|------------------------------------------|-------|----------|------|
| src/utils/complex-logic.ts               |  45%  |  30%     | -35% |
| src/services/payment.ts                  |  62%  |  55%     | -18% |
| src/api/handlers.ts                      |  71%  |  68%     | -9%  |

Total files below threshold: 3
```

## Coverage Modes

| Mode | Lines | Branches | Functions | Statements |
|------|-------|----------|-----------|------------|
| strict | 80% | 80% | 80% | 80% |
| strictest | 90% | 90% | 90% | 90% |
| legacy | 50% | 50% | 50% | 50% |

## Supported Formats

The coverage command auto-detects reports from these locations:

| Location | Format | Tool |
|----------|--------|------|
| `coverage/coverage-summary.json` | Istanbul | Jest, Vitest |
| `coverage/lcov.info` | LCOV | Most JS tools |
| `coverage.out` | Go | go test |
| `coverage.xml` | Cobertura | Python, Java |
| `htmlcov/coverage.json` | coverage.py | pytest-cov |
| `target/site/jacoco/jacoco.xml` | JaCoCo | Maven |
| `build/reports/jacoco/*/jacocoTestReport.xml` | JaCoCo | Gradle |

## Running Tests with Coverage

### JavaScript/TypeScript

**Jest:**
```bash
npm test -- --coverage
```

**Vitest:**
```bash
npx vitest run --coverage
```

### Python

```bash
pytest --cov=src --cov-report=json
```

### Go

```bash
go test -coverprofile=coverage.out ./...
```

### Java (Maven)

```bash
mvn test jacoco:report
```

### Java (Gradle)

```bash
./gradlew test jacocoTestReport
```

## CI Integration

### GitHub Actions

```yaml
- name: Run tests with coverage
  run: npm test -- --coverage

- name: Check coverage
  run: npx ctoc coverage enforce --threshold 80
```

### GitLab CI

```yaml
test:
  script:
    - npm test -- --coverage
    - npx ctoc coverage enforce
  coverage: '/Lines\s*:\s*(\d+\.?\d*)%/'
```

## Coverage History

Coverage history is automatically saved to `.ctoc/coverage-history.json` on each check. This enables:

- Trend analysis over time
- Regression detection
- Team accountability

Add to `.gitignore` if you don't want to track:
```
.ctoc/coverage-history.json
```

## Best Practices

1. **Run coverage in CI** - Local coverage means nothing if not enforced
2. **Set realistic thresholds** - Start with 60%, increase over time
3. **Focus on critical paths** - Payment, auth, data validation should be 100%
4. **Track trends** - Consistent improvement matters more than absolute numbers
5. **Review uncovered code** - Use `ctoc coverage files` to find gaps

## Common Issues

### No coverage report found

Run tests with coverage enabled first:
```bash
npm test -- --coverage
```

### Coverage format not detected

Ensure you're using a supported format. For custom locations:
```bash
# Generate LCOV (widely supported)
npm test -- --coverage --coverageReporters=lcov
```

### Coverage not improving

1. Check for excluded files in config
2. Look for `/* istanbul ignore */` comments
3. Review test quality, not just quantity

## Related Commands

- `ctoc quality check` - Full quality check including coverage
- `ctoc playwright init` - Set up E2E tests
- `ctoc quality dashboard` - Visual quality overview

## Related Skills

- [Coverage Enforcement](/skills/testing/coverage-enforcement.md)
- [Test Pyramid Strategy](/skills/testing/test-pyramid.md)
- [Istanbul Guide](/skills/testing/coverage-tools/istanbul.md)
