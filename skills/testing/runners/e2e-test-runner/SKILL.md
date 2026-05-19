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

You **execute** existing end-to-end tests that simulate real user interactions through browsers. You are the runner, not the author. When tests need to be written, refactored, or repaired, cross-link [[testing/writers/e2e-test-writer]]. For Playwright-specific debugging, locator strategy, and trace analysis depth, cross-link [[testing/playwright-qa]].

E2E is the slowest but most comprehensive layer of the Testing Trophy. Your job is to run the suite efficiently in CI, capture the right artifacts on failure, and surface flakiness without hiding it.

## 2026 Best Practices (E2E execution)

Five rules dominate the modern Playwright-on-CI runner.

- **Shard across CI workers (and tune workers first)** — Playwright has three parallelism layers: test-level (within a file), file-level (`fullyParallel: true`), and shard-level (across machines). Tune `workers` to the runner's CPU first; add `--shard=N/M` only when one machine is maxed out. The Playwright docs recommend limiting workers on CI versus defaults locally; sharding splits the suite across several runners in a GitHub Actions matrix so a single ~20-minute suite running on one box can drop to single-digit minutes across 4 shards (real-world impact, not a promise — depends on test mix and runner specs).
- **Capture trace on first retry, video + screenshot only on failure** — the canonical Playwright CI defaults are `trace: 'on-first-retry'`, `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'`. This is the right balance between debuggability and artifact storage. The new "trace every attempt, keep all on failure" mode is specifically for diagnosing flakes — use it when investigating, not as the default. Untriagable failures (no trace, no video, no screenshot) are unacceptable in CI.
- **Retry once in CI (cap at two), never infinitely** — start with `retries: 1` in CI; raise to `retries: 2` only if a measurably noisy infrastructure layer (e.g., shared staging DB) justifies it. Anything above two retries masks real failures, inflates suite time, and degrades signal quality. Retries must NOT be set in individual test files; they belong in the central `playwright.config.ts` so the team can dial them based on CI stability without touching test code. Every retry that "saved" a test is a quarantine event (see workflow below).
- **Separate prod-like environment per shard** — each shard needs an isolated environment (DB, auth state, seeded fixtures). Shards run in parallel across machines and assume tests can run out of order; shared state across shards causes cross-shard contamination flakiness that retries cannot fix. Docker-compose per shard, or namespaced cloud envs, are the two common patterns.
- **~30 minute suite budget, blob reports merged at the end** — the critical-path E2E suite MUST fit in CI's ~30-minute window. If it doesn't, cut low-value tests before adding hardware. Use Playwright's blob reporter to write per-shard reports, upload them as artifacts, and run a final merge job to produce one HTML report containing all traces and attachments. Flakiness review happens against the merged report, not per-shard noise.

## Anti-Patterns to Block (2026 categories)

These patterns must be flagged when the runner encounters them — they break the modern E2E execution contract.

- **No sharding / one big serial run** — slow CI, no parallelism budget, suite balloons past the 30-minute budget. Fix: introduce `--shard=N/M` and a GitHub Actions matrix.
- **No trace on failure** — undebugable failures. Engineers re-run locally to reproduce, lose hours. Fix: `trace: 'on-first-retry'` minimum.
- **Infinite or aggressive retries** — `retries: 5` or worse masks real bugs as "passed eventually". Fix: cap at `retries: 2` in CI, quarantine anything that needs the retry per the workflow below.
- **Shared environment across shards** — tests on shard 3 corrupt fixtures used by shard 5. Fix: per-shard env, per-shard DB schema or namespace, per-shard auth state file.
- **Carrying "known flaky" tests indefinitely** — flake quarantine without an SLA becomes a graveyard. Fix: 2-week fix SLA in `.ctoc/quality-state/flaky-tests.json`; after 2 weeks unfixed → delete.

## Flaky Test Quarantine Workflow

E2E is the highest-flake layer by far. Workflow:

1. Test fails. Playwright retries (cap at 2 retries; default in this skill is 1).
2. Test passes on retry → emit warning, append to `.ctoc/quality-state/flaky-tests.json` with `quarantined_at: <date>` and `sla_expires: <date+14d>`.
3. Quarantined tests continue to run but do not block Step 14 for 14 days while owner fixes the root cause.
4. SLA expires without fix → test is **deleted**, not extended. Never carry "known flaky" tests forever.
5. Test fails on all retries → BLOCK Step 14. Fix root cause; do not mark "known flaky".

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

# Sharded for CI (one of 4 shards)
npx playwright test --shard=1/4

# Blob reporter for sharded CI (merged later)
npx playwright test --shard=1/4 --reporter=blob

# Only changed (Git-aware)
npx playwright test --only-changed

# Workers tuned for CI (e.g., 2 on a 4-vCPU runner)
npx playwright test --workers=2

# Merge blob reports from all shards into one HTML report
npx playwright merge-reports --reporter=html ./all-blob-reports
```

### Cypress
```bash
# Headless
npx cypress run

# Interactive
npx cypress open

# Specific spec
npx cypress run --spec "cypress/e2e/auth.cy.ts"

# Parallel via Cypress Cloud / Currents
npx cypress run --record --parallel --key <key> --ci-build-id $GITHUB_RUN_ID
```

## CI Configuration

### GitHub Actions matrix sharding (Playwright, 4 shards)

```yaml
# .github/workflows/e2e.yml
name: e2e
on: [pull_request, push]

jobs:
  playwright:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        shardIndex: [1, 2, 3, 4]
        shardTotal: [4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps
      - name: Run shard ${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
        run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }} --reporter=blob
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: blob-report-${{ matrix.shardIndex }}
          path: blob-report/
          retention-days: 7

  merge-reports:
    if: always()
    needs: [playwright]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          path: all-blob-reports
          pattern: blob-report-*
          merge-multiple: true
      - run: npx playwright merge-reports --reporter=html ./all-blob-reports
      - uses: actions/upload-artifact@v4
        with:
          name: html-report
          path: playwright-report
          retention-days: 14
```

### `playwright.config.ts` — CI-aware defaults

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,           // raise to 2 only with a documented infra reason
  workers: process.env.CI ? 2 : undefined,   // tune to runner vCPU
  reporter: process.env.CI ? 'blob' : 'html',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
});
```

## Tool Integration (2026)

| Tool | Strength | Trade-off | When |
|------|----------|-----------|------|
| **Playwright `--shard=N/M`** | Built-in, free, works with any CI matrix | Manual shard count; rebalance if test count drifts | Default for any Playwright project on GH Actions / GitLab |
| **GitHub Actions matrix** | Native to GH, free for OSS, parallel runners | Concurrency caps on free tier | Default CI orchestrator |
| **Playwright blob + merge-reports** | Single HTML report across shards, traces aggregated | Extra merge job, artifact storage cost | Always — without it, sharded reports fragment |
| **Cypress Cloud / Currents** | Load-balanced parallelization without manual shard math | Paid, vendor lock-in | Cypress projects at scale |
| **Allure reporter** | Rich HTML report, history, trends, attachments | Extra dep + post-process step | Teams that want trend dashboards beyond per-run reports |

## Output Format

```markdown
## E2E Test Report

**Status**: PASS | FAIL
**Duration**: 3m 24s (4 shards × ~3m wall-clock; total CPU ~12m)
**Sharding**: 4 shards, 2 workers each, fullyParallel: true

### Browser Coverage
| Browser | Passed | Failed | Flaky |
|---------|--------|--------|-------|
| Chromium | 12 | 0 | 0 |
| Firefox  | 12 | 1 | 0 |
| WebKit   | 11 | 0 | 1 |

### Results by Suite
| Suite | Tests | Status |
|-------|-------|--------|
| Authentication | 5 | PASS |
| Checkout       | 4 | PASS |
| User Profile   | 3 | WARN — 1 flaky |

### Failures (1)
1. `user can complete checkout` (Firefox, shard 2)
   - Error: Element not visible within timeout (5000ms)
   - Screenshot: `test-results/checkout-failure-firefox.png`
   - Video: `test-results/checkout-failure-firefox.webm`
   - Trace: `test-results/checkout-failure-firefox.zip` (captured on retry)
   - Likely cause: Animation timing

### Flaky Tests (1)
- `test_profile_image_upload` (WebKit) — passed on retry 1/2
  - Auto-quarantined; SLA expires: <date+14d>
  - Suggestion: Add explicit wait for upload completion event

### Artifacts
- Merged HTML report: `playwright-report/index.html` (download from `html-report` artifact)
- Per-shard blob reports: `blob-report-{1..4}` artifacts
- Screenshots, videos, traces in `test-results/`
```

## CRITICAL: Docker-Based E2E

If the project has Docker, **E2E tests MUST run against the containerized app**, not just source.

### Why
- Tests must verify what gets deployed
- Source passing != container working
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
docker compose -f docker-compose.e2e.yml up -d
./scripts/wait-for-health.sh http://localhost:3000/health
BASE_URL=http://localhost:3000 npx playwright test
docker compose -f docker-compose.e2e.yml down -v
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

3. **Flaky != Silent**
   - Retry mechanisms log each attempt
   - After max retries → FAIL LOUDLY + quarantine entry with SLA

## Zero Tolerance

- **Flaky E2E tests**: retry up to 2x; still failing → BLOCK Step 14. Fix root cause; never mark "known flaky" indefinitely. Quarantine SLA: 2 weeks; expired → delete.
- **Skipped E2E**: fix or delete. "Will fix later" is not a valid skip reason. Platform-specific skips need explicit justification in the test annotation.
- **Untriagable failures**: any failure without trace + video + screenshot is treated as a runner-configuration bug, not a test bug. Fix the config, re-run.

## 7-Language Coverage (runner snippets)

Authoritative runners per language. C / C++ / SQL are intentionally **not covered** — they have no UI surface and therefore no E2E layer in the Testing Trophy sense. If a C/C++ project ships a UI (rare), it does so through a higher-level shell (Electron, Qt + WebView) whose E2E goes through that shell's runner (Playwright works against Electron).

### TypeScript / JavaScript — Playwright

```bash
# Already covered above as the canonical example
npx playwright test --shard=1/4 --reporter=blob
```

### TypeScript / JavaScript — Cypress

```bash
# Parallel via Cypress Cloud (or open-source alternative Currents)
npx cypress run --record --parallel \
  --key $CYPRESS_RECORD_KEY \
  --ci-build-id $GITHUB_RUN_ID \
  --browser chrome
```

### Python — pytest-playwright

```bash
# Install (Playwright Python + pytest plugin)
pip install pytest-playwright
playwright install --with-deps

# Run with retries via pytest-rerunfailures and tracing
pytest tests/e2e/ \
  --tracing=retain-on-failure \
  --video=retain-on-failure \
  --screenshot=only-on-failure \
  --reruns 2 \
  -n auto                          # pytest-xdist for in-process parallelism

# Sharding across CI runners: split by test node IDs
pytest tests/e2e/ --collect-only -q | split -n l/$SHARD_TOTAL --numeric-suffixes - shard_
pytest $(cat shard_$(printf "%02d" $((SHARD_INDEX-1))))
```

### C# / .NET 9 — Microsoft.Playwright

```bash
# Install browsers (one-time)
dotnet tool install --global Microsoft.Playwright.CLI
playwright install --with-deps

# Run E2E project — Microsoft.Playwright.NUnit / .MSTest / .Xunit packages
dotnet test tests/E2E.csproj \
  --logger "trx;LogFileName=e2e.trx" \
  --logger "console;verbosity=detailed" \
  -- NUnit.NumberOfTestWorkers=2

# Sharding: pass shard index via env var, partition test list in fixture setup
# (Microsoft.Playwright does not yet ship a --shard flag equivalent; use [TestCaseSource]
#  or runtime filtering based on PLAYWRIGHT_SHARD env var.)
PLAYWRIGHT_SHARD=1/4 dotnet test tests/E2E.csproj
```

In `playwright.config` for .NET (via `PlaywrightSettings` in test setup), set tracing/video/screenshot to `OnFirstRetry` / `RetainOnFailure` / `OnlyOnFailure` respectively.

### Java — Playwright for Java

```bash
# Maven
mvn test -Dgroups=e2e \
  -Dplaywright.tracing=retain-on-failure \
  -Dplaywright.video=retain-on-failure \
  -Dplaywright.screenshot=only-on-failure \
  -Dsurefire.rerunFailingTestsCount=2 \
  -Dsurefire.forkCount=2

# Gradle
./gradlew e2eTest \
  -Pplaywright.tracing=retain-on-failure \
  -Pplaywright.video=retain-on-failure

# Sharding: use Surefire/Failsafe groups, or run with -Dshard.index=N -Dshard.total=M
# and partition in @BeforeAll based on testInfo.
mvn test -Dshard.index=1 -Dshard.total=4
```

### C — N/A (no UI)

C has no E2E layer by construction. If a C component is exercised end-to-end, it is via a higher-level binding (Python / Node native module) — run E2E through that binding's runner.

### C++ — N/A (no UI)

Same as C. Qt/WebView-based C++ UIs can be driven by Playwright when the shell exposes a CDP-compatible browser surface (e.g., Electron, CEF); use the TypeScript runner snippet against the shell.

### SQL — N/A (no UI)

SQL is a data layer, not a user-facing layer. Database integration tests belong in the [[testing/integration-test-runner]] skill, not here. E2E exercises SQL transitively via the application UI.

## Letter schema (refinement-loop output contract)

The letter schema below is the wire format. **Every emitted letter has `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The internal triage tiers in the "Severity" section below stay in the human-readable report body for prioritization, but the letter's `severity` field is always `critical`. The `confidence` and `kind` fields carry the nuance: a single-shard flake emits as `severity: critical, confidence: low, kind: flake`; a reproducible cross-browser failure emits as `severity: critical, confidence: high, kind: failure`. The integrator weighs these together — `confidence: low` single-source flakes do not block phase advancement alone, but two browsers agreeing on the same failure always does.

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+target+kind)[:12]>   # fingerprint for dedup
severity: critical                              # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                 # high = reproduced; low = single-run flake
engine: playwright | cypress | pytest-playwright | dotnet-playwright | mvn-playwright | manual
kind: failure | flake | quarantine-sla-expired | config-violation | suite-budget-exceeded
target_file: tests/e2e/checkout.spec.ts
target_line: 42
browser: chromium | firefox | webkit | electron
shard: "2/4"
trace_path: test-results/checkout-failure-firefox.zip
video_path: test-results/checkout-failure-firefox.webm
screenshot_path: test-results/checkout-failure-firefox.png
attempts: 3                                     # 1 initial + 2 retries
message: "Element #checkout-submit not visible within 5000ms timeout"
suggested_fix: "Replace polling with explicit waitFor on 'networkidle' or a known UI event"
quarantine:
  sla_expires: <YYYY-MM-DD>                      # only if kind == quarantine-sla-expired
reference: https://playwright.dev/docs/trace-viewer
```

The integrator uses `confidence` and `attempts` to weight findings. A `confidence: low` single-shard flake doesn't block phase advancement on its own; a `confidence: high` reproducible failure across browsers always does. `kind: suite-budget-exceeded` is a runner-configuration finding, not a test bug — it blocks Step 14 with a kickback to the implementer to trim the suite or reshape sharding.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule.

| Triage tier | Examples | Internal action recommendation |
|-------|----------|--------|
| CRITICAL | Test failure reproduces across browsers; auth flow broken; checkout broken; deploy-blocker | BLOCK Step 14 |
| HIGH | Single-browser failure; flake on retry that quarantines; suite budget exceeded by >25% | BLOCK Step 14 unless quarantined |
| MEDIUM | Flake passing on first retry (within SLA); slow test (>2 min single-test) | Quarantine + fix within SLA |
| LOW | Visual snapshot drift; non-blocking warning in trace | Backlog |

On the wire: every letter is `severity: critical`. The triage tiers stay in the human-readable report body.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every test failure, every flake on retry, every quarantine SLA expiry, every suite-budget overrun, and every trace/video/screenshot configuration gap you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a flaky test today is a customer-visible failure after the next deploy. A suite that runs without traces is a suite that cannot be debugged when it eventually fails. Code that ships green-with-untriagable-failures ships with known latent risk.
