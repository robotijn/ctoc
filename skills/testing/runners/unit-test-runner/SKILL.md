---
name: unit-test-runner
description: Executes unit tests and reports results + coverage — Step 14 VERIFY quality gate.
type: skill
when_to_load:
  - "run unit test"
  - "run unit tests"
  - "unit test run"
  - "run tests"
  - "execute tests"
  - "test suite"
  - "jest run"
  - "pytest run"
related_skills:
  - testing/writers/unit-test-writer
  - testing/coverage-enforcer
  - testing/quality-gate-runner
  - testing/smart-test-runner
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
---

# Unit Test Runner (skill)

> Converted from agents/testing/runners/unit-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You run the unit test suite and report results. This is part of Step 14 (VERIFY) — the quality gate that must pass before documentation and final review.

## 2026 Best Practices (Testing category)

Two patterns most relevant here:

- **Testing Trophy, not pyramid** — unit tests are the bottom-but-thin layer in the Trophy (static analysis below, integration above). The runner should NOT push for inflated unit coverage at the cost of integration coverage. A 95% unit / 30% integration suite catches fewer real bugs than 70% unit / 80% integration. Report both, weight integration higher.
- **Flaky test quarantine workflow** — every flake gets logged to `.ctoc/quality-state/flaky-tests.json` with first-seen, last-seen, retry-count. 3 flakes in 7 days → auto-quarantine. 2-week SLA. After SLA: delete or fix.

## Test Commands by Language

### Python
```bash
# pytest with coverage
pytest -v --cov=src --cov-report=term-missing

# HTML report
pytest -v --cov=src --cov-report=html
```

### TypeScript/JavaScript
```bash
# Vitest
npm run test -- --coverage

# Jest
npm test -- --coverage
```

### Go
```bash
go test -v -cover ./...

# Coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Rust
```bash
cargo test
cargo test -- --nocapture  # with output
```

## What to Report

1. **Test Results**: total / passed / failed / skipped + failure details with stack traces
2. **Coverage Metrics**: line %, branch %, uncovered files/functions
3. **Performance**: total execution time, slow tests (> 1s)

## Coverage Thresholds

| Metric | Minimum | Target |
|--------|---------|--------|
| Line Coverage | 70% | 85% |
| Branch Coverage | 60% | 75% |
| New Code | 80% | 90% |

## Output Format

```markdown
## Test Results

**Status**: PASS | FAIL
**Duration**: 12.5s

### Summary
| Metric | Value |
|--------|-------|
| Total Tests | 145 |
| Passed | 143 |
| Failed | 2 |
| Skipped | 0 |

### Coverage
| Metric | Value | Threshold |
|--------|-------|-----------|
| Line | 87% | 70% PASS |
| Branch | 72% | 60% PASS |
| New Code | 94% | 80% PASS |

### Failed Tests (2)
1. `test_user_authentication`
   - File: `tests/test_auth.py:45`
   - Error: AssertionError: Expected 200, got 401

2. `test_order_validation`
   - File: `tests/test_order.py:78`
   - Error: ValueError: Invalid order state

### Slow Tests (> 1s)
- `test_bulk_import`: 2.3s
- `test_full_sync`: 1.8s
```

## Zero Tolerance: Skipped Tests

**0 skipped tests allowed.** BLOCKING at Step 14.

| Situation | Action |
|-----------|--------|
| Test can't run | FIX (make it runnable) |
| Test is obsolete | DELETE |
| Platform-specific | Conditional skip with explicit reason ONLY |

Valid (the ONLY exception):
```javascript
test.skip(os !== 'linux', 'Linux-only feature');
```

Invalid (BLOCKING):
```javascript
test.skip('TODO: fix later');        // NO
test.skip();                          // NO
it.skip('some test', () => { ... });  // NO (without platform reason)
```

## Zero Tolerance: Flaky Tests

**0 flaky tests allowed.** BLOCKING at Step 14.

If a test fails intermittently:
1. Retry up to 2 times automatically
2. If still fails → report as flaky and BLOCK
3. Append to `.ctoc/quality-state/flaky-tests.json`
4. Fix root cause (async, timing, shared state)
5. NEVER mark "pre-existing" or ignore

## CRITICAL: NO SILENT FAILURES

Anti-patterns that BLOCK:

```javascript
// BAD: silent failure
let db;
try { db = await connectDB(); } catch { db = null; }
if (!db) return; // test "passes" silently

// GOOD: explicit failure
const db = await connectDB(); // throws if unavailable

// BAD
if (!process.env.DB_URL) return;
// GOOD
test.skip(!process.env.DB_URL, 'Requires DB_URL environment variable');

// BAD: fixture swallows error
beforeEach(async () => {
  try { await setupDB(); } catch { /* ignore */ }
});
// GOOD
beforeEach(async () => {
  await setupDB(); // fails test if setup fails
});

// BAD: no assertion
test('user exists', () => {
  const user = getUser();
});
// GOOD
test('user exists', () => {
  const user = getUser();
  assert(user, 'user should exist');
  assert.equal(user.name, 'expected');
});
```

**If a test cannot run, it must FAIL. Period.**

## CI Integration

- Run on every push
- Block merge on failure
- Report coverage to PR
