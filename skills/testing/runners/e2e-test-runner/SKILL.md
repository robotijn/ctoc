---
name: e2e-test-runner
description: Runs end-to-end tests simulating real user journeys via Playwright/Cypress.
type: skill
when_to_load:
  - "run e2e test"
  - "run e2e tests"
  - "e2e test run"
  - "playwright run"
  - "cypress run"
  - "browser test"
  - "user journey test"
related_skills:
  - testing/playwright-qa
  - testing/writers/e2e-test-writer
  - testing/quality-gate-runner
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# E2E Test Runner (skill)

> Converted from agents/testing/runners/e2e-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You execute end-to-end tests that simulate real user interactions through browsers. These are the slowest but most comprehensive tests in the Testing Trophy's thin top layer.

## 2026 Best Practices (Testing category)

Two patterns dominate this skill:

- **E2E ≤ 30 minutes** — the critical-path E2E suite MUST fit in CI's window. Shard with `--shard=N/M`, parallelize browsers (chromium/firefox/webkit run concurrently), mock third-party services, seed via API. If the suite exceeds 30 minutes, cut low-value tests before adding hardware.
- **Flaky test quarantine workflow** — E2E is the highest-flake layer by far. Retry up to 2x automatically; any test that needs the retry is *quarantined* in `.ctoc/quality-state/flaky-tests.json` with a 2-week fix SLA. After 2 weeks unfixed → delete. Never carry "known flaky" tests forever.

## Commands

### Playwright
```bash
# All E2E
npx playwright test

# Specific file
npx playwright test e2e/auth.spec.ts

# UI debugging mode
npx playwright test --ui

# Specific browser
npx playwright test --project=chromium

# HTML report
npx playwright test --reporter=html

# Sharded for CI (4 nodes)
npx playwright test --shard=1/4

# Only changed
npx playwright test --only-changed
```

### Cypress
```bash
# Headless
npx cypress run

# Interactive
npx cypress open

# Specific spec
npx cypress run --spec "cypress/e2e/auth.cy.ts"
```

## CI Configuration

```yaml
# .github/workflows/e2e.yml
jobs:
  playwright:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --shard=${{ matrix.shard }}/4
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report-${{ matrix.shard }}
          path: playwright-report/
```

## Output Format

```markdown
## E2E Test Report

**Status**: PASS | FAIL
**Duration**: 3m 24s

### Browser Coverage
| Browser | Passed | Failed |
|---------|--------|--------|
| Chromium | 12 | 0 |
| Firefox | 12 | 1 |
| WebKit | 11 | 2 |

### Results by Suite
| Suite | Tests | Status |
|-------|-------|--------|
| Authentication | 5 | PASS |
| Checkout | 4 | PASS |
| User Profile | 3 | WARN — 1 flaky |

### Failures (1)
1. `user can complete checkout` (Firefox)
   - Error: Element not visible within timeout
   - Screenshot: `test-results/checkout-failure.png`
   - Trace: `test-results/checkout-failure.zip`
   - Likely cause: Animation timing

### Flaky Tests (1)
- `test_profile_image_upload` — failed 1/3
  - Auto-quarantined; SLA: 2 weeks
  - Suggestion: Add explicit wait for upload completion

### Artifacts
- Report: `playwright-report/index.html`
- Screenshots, videos, traces in `test-results/`
```

## CRITICAL: Docker-Based E2E

If the project has Docker, **E2E tests MUST run against the containerized app**, not just source.

### Why
- Tests must verify what gets deployed
- Source passing ≠ container working
- Build issues, missing deps, env vars — caught only by container testing

### Setup

```yaml
# docker-compose.e2e.yml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgres://db/test
    depends_on: [db]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 5s
      retries: 5
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: test
      POSTGRES_PASSWORD: test
```

```bash
# Run against container
docker build -t app:e2e .
docker-compose -f docker-compose.e2e.yml up -d
./scripts/wait-for-health.sh http://localhost:3000/health
BASE_URL=http://localhost:3000 npx playwright test
docker-compose -f docker-compose.e2e.yml down -v
```

### Required Before Deploy
1. Docker image builds (`docker build` succeeds)
2. Container starts + health check passes
3. E2E passes against container

**No deploy without container E2E. Period.**

## CRITICAL: NO SILENT FAILURES

1. **Server not running = FAIL**
   ```javascript
   // BAD
   beforeAll(async () => {
     try { await fetch(BASE_URL); } catch { return; }
   });

   // GOOD
   beforeAll(async () => {
     const res = await fetch(BASE_URL + '/health');
     if (!res.ok) throw new Error('Server not healthy');
   });
   ```

2. **Missing element = FAIL, not skip**
   ```javascript
   // BAD
   if (!(await page.$('#login'))) return;

   // GOOD
   await expect(page.locator('#login')).toBeVisible({ timeout: 5000 });
   ```

3. **Flaky ≠ Silent**
   - Retry mechanisms log each attempt
   - After max retries → FAIL LOUDLY + quarantine entry

## Zero Tolerance

- **Flaky E2E tests**: retry 2x; still failing → BLOCK Step 14. Fix root cause; never mark "known flaky" indefinitely.
- **Skipped E2E**: fix or delete. "Will fix later" is not a valid skip reason. Platform-specific skips need explicit justification.
