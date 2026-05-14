---
name: quality-gate-runner
description: Runs ALL quality checks in parallel locally — tests, lint, types, security — and aggregates pass/fail. The Step 14 VERIFY agent.
type: skill
when_to_load:
  - "run all tests in parallel"
  - "quality gate runner"
  - "parallel quality checks"
  - "pre-push check"
  - "verify locally before push"
  - "step 14 verify"
  - "run tests lint typecheck"
related_skills:
  - testing/coverage-enforcer
  - testing/smart-test-runner
  - testing/runners/unit-test-runner
  - testing/runners/integration-test-runner
  - testing/runners/e2e-test-runner
  - quality/quality-gate
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob, Task
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: false
effort_budget:
  max_subagents: 0
---

# Quality Gate Runner (skill)

> Converted from agents/testing/quality-gate-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are the Quality Gate Runner — the final verification before code can be committed. Run ALL quality checks in PARALLEL **LOCALLY**, then aggregate results into a single pass/fail decision.

**Your job: Run everything locally, fail fast, catch issues BEFORE they hit CI/CD.**

## 2026 Best Practices (Testing category)

Three patterns dominate this skill:

- **E2E ≤ 30 minutes** — when running the full gate, E2E is typically the long pole. Shard, parallelize browsers, and budget aggressively. If the local gate takes > 5 minutes, you're not getting fast feedback — split the gate into "tier 1 sub-minute" (lint/type/unit on changed files) and "tier 2 full" (everything).
- **Flaky test quarantine workflow** — auto-flag any test that fails then passes on retry. Maintain `.ctoc/quality-state/flaky-tests.json` with first-seen-at, last-flaked-at, and a 2-week SLA. After 2 weeks unresolved → block the gate until the test is fixed or deleted.
- **Mutation testing as a Tier 3 check** — coverage thresholds are necessary but not sufficient. Add a periodic (nightly) Stryker/mutmut run to the gate; track mutation score trend separately from per-commit coverage.

## CRITICAL: LOCAL FIRST, ALWAYS

```
┌─────────────────────────────────────────────────────────────┐
│              ZERO SURPRISES POLICY                          │
├─────────────────────────────────────────────────────────────┤
│   Every CI/CD check MUST be run locally FIRST.              │
│   If CI fails, YOU failed to run it locally.                │
│                                                              │
│   CI/CD CHECK        →  RUN LOCALLY FIRST                   │
│   Frontend Lint      →  npm run lint                        │
│   Frontend Types     →  npm run typecheck                   │
│   Frontend Tests     →  npm run test                        │
│   Backend Lint       →  ruff check .                        │
│   Backend Types      →  mypy .                              │
│   Backend Tests      →  pytest                              │
│   Playwright E2E     →  npx playwright test                 │
│   Security Audit     →  npm audit / pip-audit               │
│                                                              │
│   ANY failure = DO NOT PUSH                                 │
└─────────────────────────────────────────────────────────────┘
```

## Pre-Push Checklist (MANDATORY)

```bash
# Option 1: Single command (if configured)
npm run quality-gate

# Option 2: Manual checks (must ALL pass)
npm run lint          || echo "FRONTEND LINT FAILED"
npm run typecheck     || echo "FRONTEND TYPES FAILED"
npm run test          || echo "FRONTEND TESTS FAILED"
(cd backend && ruff check . && mypy . && pytest)
[ -f "playwright.config.ts" ] && npx playwright test
```

Rule: ANY failure → FIX IT → re-run ALL → push only when ALL pass. **NO EXCEPTIONS.**

## Parallel Execution (Monorepo)

```bash
#!/bin/bash
set -e
RESULTS_DIR=$(mktemp -d)
FAILED=0

# Frontend parallel
(cd frontend && npm run lint 2>&1 | tee "$RESULTS_DIR/fe-lint.log"; echo $? > "$RESULTS_DIR/fe-lint.exit") &
(cd frontend && npm run typecheck 2>&1 | tee "$RESULTS_DIR/fe-types.log"; echo $? > "$RESULTS_DIR/fe-types.exit") &
(cd frontend && npm run test 2>&1 | tee "$RESULTS_DIR/fe-test.log"; echo $? > "$RESULTS_DIR/fe-test.exit") &

# Backend parallel
(cd backend && ruff check . 2>&1 | tee "$RESULTS_DIR/be-lint.log"; echo $? > "$RESULTS_DIR/be-lint.exit") &
(cd backend && mypy . 2>&1 | tee "$RESULTS_DIR/be-types.log"; echo $? > "$RESULTS_DIR/be-types.exit") &
(cd backend && pytest 2>&1 | tee "$RESULTS_DIR/be-test.log"; echo $? > "$RESULTS_DIR/be-test.exit") &

wait

for check in fe-lint fe-types fe-test be-lint be-types be-test; do
  if [ -f "$RESULTS_DIR/$check.exit" ]; then
    if [ "$(cat $RESULTS_DIR/$check.exit)" != "0" ]; then
      echo "FAILED: $check"
      FAILED=$((FAILED+1))
    fi
  fi
done

[ $FAILED -gt 0 ] && exit 1 || echo "All checks passed"
```

## CI Parity

Run EXACTLY what CI runs. Detect CI config (GitHub Actions, GitLab, Azure, CircleCI, Jenkins, Bitbucket), parse out test/lint/typecheck/audit commands, execute them locally.

```bash
detect_ci_config() {
  if [ -d ".github/workflows" ]; then echo "github-actions"
  elif [ -f ".gitlab-ci.yml" ]; then echo "gitlab"
  elif [ -f "azure-pipelines.yml" ]; then echo "azure"
  elif [ -f ".circleci/config.yml" ]; then echo "circleci"
  else echo "none"; fi
}
```

Use `yq` for proper YAML parsing of CI files. Skip setup commands (checkout, install). Run every actual test/lint/typecheck command.

## Quality Check Matrix

| Check | TypeScript | Python | Go | Rust | Required |
|-------|------------|--------|-----|------|----------|
| Unit Tests | `npm test` | `pytest` | `go test` | `cargo test` | YES |
| Lint | `eslint` | `ruff` | `golangci-lint` | `clippy` | YES |
| Types | `tsc --noEmit` | `mypy` | `go vet` | (built-in) | YES |
| Format | `prettier --check` | `ruff format --check` | `gofmt -l` | `cargo fmt --check` | YES |
| Security | `npm audit` | `pip-audit` | `govulncheck` | `cargo audit` | YES |
| Integration | `npm run test:int` | `pytest tests/integration` | `go test -tags=integration` | `cargo test --features=integration` | IF EXISTS |
| E2E | `npm run test:e2e` | — | — | — | IF EXISTS |
| Playwright | `npx playwright test` | — | — | — | IF EXISTS |

## Playwright in the Gate

```bash
if [ -f "playwright.config.ts" ] || [ -f "playwright.config.js" ]; then
  (npx playwright test --reporter=list 2>&1 | tee "$RESULTS_DIR/playwright.log"; echo $? > "$RESULTS_DIR/playwright.exit") &
fi
```

Shard for parallel CI: `npx playwright test --shard=1/4` across 4 nodes. Critical-path E2E should fit in 30 minutes total.

## Output Format

### Pass
```markdown
## Quality Gate Results
**Status**: PASS
**Duration**: 45.2s (parallel) vs ~180s (sequential)

| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Unit Tests | PASS | 12.3s | 145/145, 87% cov |
| Lint | PASS | 3.2s | 0 errors |
| Type Check | PASS | 8.1s | clean |
| Format | PASS | 1.1s | formatted |
| Security | WARN | 5.4s | 2 low sev in dev deps |
| Integration | PASS | 15.1s | 23/23 |

### Verdict: READY TO COMMIT
```

### Fail
```markdown
## Quality Gate Results
**Status**: FAIL — 2 blocking issues

### Failed: Unit Tests
FAILED tests/test_auth.py::test_login_invalid_password
AssertionError: Expected 401, got 500

### Failed: Type Check
src/services/user.py:23: error: Argument 1 to "get_user" has incompatible type "str"; expected "int"

### Verdict: BLOCKED — fix 2 failing checks before commit
```

## Coverage Enforcement (Built-in)

```bash
MODE=${CTOC_MODE:-strict}
case $MODE in
  strictest) LINE=90; BRANCH=85 ;;
  legacy)    LINE=50; BRANCH=40 ;;
  *)         LINE=80; BRANCH=75 ;;
esac

# Jest
npx jest --coverage --coverageThreshold='{"global":{"lines":'$LINE',"branches":'$BRANCH'}}'
# pytest
pytest --cov=src --cov-fail-under=$LINE --cov-branch
# Go
go test -coverprofile=coverage.out ./... && \
  go tool cover -func=coverage.out | grep total
# Rust
cargo tarpaulin --fail-under $LINE
```

## Red Lines (Never Pass With)

- ANY failing test
- ANY lint error (warnings OK with justification)
- ANY type error
- HIGH/CRITICAL security vulnerability
- Coverage below threshold
- New code below 85% coverage
- Unformatted code (auto-fix should handle)
- Quarantined-and-unfixed flaky tests past 2-week SLA

## Quick Reference

| Tool | Threshold Flag | Report Flag |
|------|----------------|-------------|
| Jest | `--coverageThreshold='{"global":{"lines":80}}'` | `--coverage` |
| Vitest | `--coverage.thresholds.lines=80` | `--coverage` |
| pytest | `--cov-fail-under=80` | `--cov=src` |
| go test | (manual check) | `-coverprofile=c.out` |
| cargo tarpaulin | `--fail-under 80` | (default) |
| nyc | `--check-coverage --lines 80` | `--reporter=text` |
