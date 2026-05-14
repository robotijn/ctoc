---
name: smart-test-runner
description: Incremental test runner — only executes tests affected by code changes, using coverage maps for instant selection.
type: skill
when_to_load:
  - "run affected tests"
  - "smart test run"
  - "incremental test"
  - "only run changed tests"
  - "test what changed"
  - "fast test feedback"
related_skills:
  - testing/coverage-mapper
  - testing/quality-gate-runner
  - testing/runners/unit-test-runner
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Write, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 25000
  max_tool_calls: 20
  max_subagents: 0
---

# Smart Test Runner (skill)

> Converted from agents/testing/smart-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You run only the tests affected by code changes, maintaining a coverage map for instant test selection. Avoid full test suite runs when only a subset of files has changed.

**Core Principle**: If tests already passed on current code state, don't re-run them. Verify cache state (<100ms), only execute when necessary.

## 2026 Best Practices (Testing category)

Two patterns most relevant here:

- **E2E ≤ 30 minutes** — incremental selection is the main mechanism for fitting full validation in the CI window. When source files in a critical-path module change, escalate to a wider selection (include all integration tests for that module), not a narrower one.
- **Flaky test quarantine workflow** — a test that fails on retry once is a flake. Smart runner must persist flake counts per-test in `.ctoc/quality-state/flaky-tests.json` so the quarantine workflow at the gate level has data. Don't silently re-retry — emit a clear signal.

## Trigger

- After Write/Edit on source files
- Manual: `ctoc test` or `ctoc quality`
- Before stage transition: in-progress → review
- Post-commit hook (background agent)

## Algorithm

```
1. Get list of changed files (git diff + staged)
2. For each changed file:
   a. Compute current SHA256 hash
   b. Compare to cached hash in file-hashes.json
   c. If different → "needs testing"
3. For each file needing testing:
   a. Look up coverage-map.json
   b. Get list of tests covering it
   c. Add to "tests to run" set
4. If coverage map missing for a file:
   a. Try filename heuristics (state.js → state.test.js)
   b. If no match → flag for "full test suite needed"
5. Run only the tests in "tests to run" set
6. Update cache (hashes, results)
7. Report: "Ran 5 tests (3 files changed), all passed"
```

## Fallback Rules

| Situation | Action |
|-----------|--------|
| No coverage map | Run full suite, build map |
| Coverage map > 7 days old | Run full suite, rebuild map |
| File not in coverage map | Run full suite for safety |
| Test file changed | Run that test + dependents |
| Config file changed (.eslintrc, tsconfig) | Run full suite |
| Package.json/lock changed | Run full suite + security scan |
| Critical-path file changed | Run full integration tests for that module |

## Test Commands by Language

### TypeScript/JavaScript
```bash
# Jest — find related tests automatically
npx jest --findRelatedTests src/file1.ts src/file2.ts

# Vitest — related
npx vitest related src/file1.ts src/file2.ts
```

### Python
```bash
pytest tests/test_file1.py tests/test_file2.py
```

### Go
```bash
go test ./pkg/auth/... ./pkg/user/...
```

### Rust
```bash
cargo test test_auth test_user
```

## Flaky Test Detection

**Zero tolerance.** Persist flakes for quarantine workflow.

1. If a test fails, retry 2x to confirm
2. If passes on retry → flag as FLAKY (emit signal, don't swallow)
3. Flaky tests BLOCK until fixed
4. Append to `.ctoc/quality-state/flaky-tests.json` with timestamp

```bash
for i in 1 2 3; do
  npm test -- --testNamePattern="$TEST_NAME"
  RESULTS[$i]=$?
done

if [ "${RESULTS[1]}" != "${RESULTS[2]}" ] || [ "${RESULTS[2]}" != "${RESULTS[3]}" ]; then
  echo "FLAKY: $TEST_NAME results=${RESULTS[*]}"
  # Append to flaky-tests.json
  exit 1
fi
```

## Cache Structure

`.ctoc/quality-state/file-hashes.json`:
```json
{
  "src/lib/state.js": {
    "hash": "sha256:abc...",
    "lastTested": "2026-02-03T09:30:00Z",
    "testsPassed": true
  }
}
```

`.ctoc/quality-state/test-results.json`:
```json
{
  "tests/unit/state.test.js": {
    "status": "pass",
    "duration": 0.823,
    "lastRun": "2026-02-03T09:30:00Z",
    "coveredFiles": ["src/lib/state.js", "src/utils/helpers.js"]
  }
}
```

## Heuristic Test Discovery

When coverage map is missing:

| Source Pattern | Test Pattern |
|---------------|--------------|
| `src/auth.js` | `tests/auth.test.js`, `__tests__/auth.test.js` |
| `src/lib/state.ts` | `src/lib/state.test.ts`, `src/lib/__tests__/state.ts` |
| `pkg/auth/handler.go` | `pkg/auth/handler_test.go` |
| `src/utils/format.py` | `tests/test_format.py`, `tests/utils/test_format.py` |

```bash
find_test_for_source() {
  local src=$1
  local base=$(basename "$src" | sed 's/\.[^.]*$//')
  local dir=$(dirname "$src")
  for pattern in \
    "${dir}/${base}.test.ts" \
    "${dir}/${base}.spec.ts" \
    "${dir}/__tests__/${base}.ts" \
    "tests/${base}.test.ts" \
    "tests/unit/${base}.test.ts"; do
    [ -f "$pattern" ] && echo "$pattern" && return
  done
}
```

## Output Format

```markdown
## Smart Test Results

**Mode**: Incremental (3 files changed)
**Duration**: 2.3s (vs ~45s full suite)
**Tests Run**: 5 of 145

### Changed Files
| File | Hash Delta | Affected Tests |
|------|------------|----------------|
| `src/lib/state.js` | abc123 → def456 | 2 |
| `src/utils/format.js` | 111222 → 333444 | 2 |
| `src/api/auth.js` | (unchanged) | — |

### Test Results
| Test | Status | Duration |
|------|--------|----------|
| `state.test.js` | PASS | 0.8s |
| `workflow.test.js` | PASS | 1.2s |
| `format.test.js` | PASS | 0.3s |

### Time Saved: 95% (45s → 2.3s)
```

### Failure
```markdown
**Status**: FAIL
**Tests Run**: 5

### Failed Tests (1)
#### state.test.js::test_state_transition
**File**: `tests/unit/state.test.js:45`
**Error**: AssertionError: Expected "active", got "pending"
**Changed File**: `src/lib/state.js`
**Recommendation**: Check transitionTo() logic.

### Action Required
Fix the failing test before proceeding.
```

## Red Lines (NEVER Compromise)

- NEVER skip tests "for speed" — run all affected tests
- NEVER ignore flaky tests — emit signal so quarantine workflow can act
- NEVER cache test results across branches
- NEVER trust old cache when config files change
- NEVER allow silent test failures
