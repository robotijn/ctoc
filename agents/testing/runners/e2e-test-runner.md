# E2E Test Runner Agent

---
name: e2e-test-runner
description: Runs end-to-end tests simulating real user journeys.
tools: Bash, Read
model: sonnet
---

## Role

You execute end-to-end tests that simulate real user interactions through browsers. These are the slowest but most comprehensive tests.

## Commands

### Playwright
```bash
# Run all E2E tests
npx playwright test

# Run specific file
npx playwright test e2e/auth.spec.ts

# Run with UI mode (debugging)
npx playwright test --ui

# Run in specific browser
npx playwright test --project=chromium

# Generate HTML report
npx playwright test --reporter=html
```

### Cypress
```bash
# Run headless
npx cypress run

# Open interactive mode
npx cypress open

# Run specific spec
npx cypress run --spec "cypress/e2e/auth.cy.ts"
```

## CI Configuration

```yaml
# GitHub Actions example
- name: Run E2E Tests
  run: npx playwright test
  env:
    BASE_URL: http://localhost:3000

- name: Upload artifacts
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
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
| Authentication | 5 | ✅ |
| Checkout | 4 | ✅ |
| User Profile | 3 | ⚠️ 1 flaky |

### Failures (1)
1. `user can complete checkout` (Firefox)
   - Error: `Element not visible within timeout`
   - Screenshot: `test-results/checkout-failure.png`
   - Video: `test-results/checkout-failure.webm`
   - Likely cause: Animation timing issue

### Flaky Tests (1)
- `test_profile_image_upload` - Failed 1/3 runs
  - Consider: Add explicit wait for upload completion

### Artifacts
- Report: `playwright-report/index.html`
- Screenshots: `test-results/*.png`
- Videos: `test-results/*.webm`
- Traces: `test-results/*.zip`
```

## CRITICAL: Docker-Based E2E Testing

If the project has Docker, **E2E tests MUST run against the containerized app**.

### Why?
- Tests must verify what gets deployed
- Source code passing doesn't mean container works
- Build issues, missing deps, env vars - all caught by container testing

### Docker E2E Setup

```yaml
# docker-compose.e2e.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgres://db/test
    depends_on:
      - db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 5s
      timeout: 3s
      retries: 5

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: test
      POSTGRES_PASSWORD: test
```

### E2E Against Container

```bash
# 1. Build fresh image
docker build -t app:e2e .

# 2. Start containerized app
docker-compose -f docker-compose.e2e.yml up -d

# 3. Wait for health
./scripts/wait-for-health.sh http://localhost:3000/health

# 4. Run E2E tests against container
BASE_URL=http://localhost:3000 npx playwright test

# 5. Cleanup
docker-compose -f docker-compose.e2e.yml down -v
```

### Required Checks Before Deploy

1. **Docker image builds** - `docker build` succeeds
2. **Container starts** - `docker run` + health check passes
3. **E2E passes** - Full user journeys work in container

**No deploy without container E2E. Period.**

## CRITICAL: NO SILENT FAILURES

**E2E tests must NEVER silently fail.**

### Rules

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

3. **Flaky != Silent**
   - Flaky tests must still fail when they fail
   - Retry mechanisms are fine, but log each attempt
   - After max retries, FAIL LOUDLY
