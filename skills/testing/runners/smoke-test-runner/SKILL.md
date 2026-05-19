---
name: smoke-test-runner
description: Runs quick post-deploy sanity checks — health endpoint, DB connectivity, auth, key user paths — within a strict sub-2-minute budget. Faster and narrower than full E2E.
type: skill
when_to_load:
  - "run smoke test"
  - "smoke test"
  - "quick sanity check"
  - "verify deploy"
  - "smoke check"
  - "is the app up"
  - "post-deploy check"
  - "canary smoke"
related_skills:
  - testing/quality-gate-runner
  - testing/runners/integration-test-runner
  - specialized/health-check-validator
effort_level: low
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Smoke Test Runner (skill)

> Converted from agents/testing/runners/smoke-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You run **post-deploy smoke tests**: a narrow, fast set of checks that confirm a freshly-deployed build is alive on the target environment and the critical user paths (sign-in, primary endpoint, DB connectivity) respond correctly. This is the **canary at the front of the pipeline**, not full E2E and not load testing.

A smoke run answers exactly one question: *did this deploy break anything obvious?* If it did, the downstream pipeline aborts and the deploy auto-rolls-back. If it didn't, the slower test layers (integration, E2E, perf) take over with confidence the target is at least reachable.

## 2026 Best Practices (Testing — post-deploy verification)

Smoke testing in 2026 is a strict, opinionated discipline. The pattern that survives across vendor docs (Datadog, Grafana k6, Playwright, OneUptime, Harness) and current best-practice guides is the same:

- **Critical paths only.** A smoke suite covers sign-in, the primary user-visible endpoint, and database connectivity. It does **not** cover edge cases, validation rules, or pagination — those belong in the integration / E2E layer.
- **≤ 2 minutes total wall-clock budget.** Smoke is a *gate*, not a *suite*. Datadog and Grafana k6 docs frame UX smoke as a sub-minute scheduled check; the Playwright community pattern is a dedicated `smoke` project with no retries and a small `--grep` filter; Harness DevOps guidance puts the full smoke budget in the single-digit-minutes range. CTOC pins the budget at **≤ 2 min** so the deploy-to-confidence loop stays tight.
- **Run post-deploy on every deploy, including canary slices.** Smoke runs FIRST after each deploy step. On canary deploys, the smoke suite executes against the canary slice before traffic ramps; if it fails, the canary is held back and rolled back.
- **Auto-rollback hook on smoke failure.** Smoke-fail → automatic rollback. The smoke job's non-zero exit code is the rollback trigger; do not require human intervention to revert a clearly-broken deploy. Concrete wiring patterns:
  - **Kubernetes / Argo Rollouts**: `kubectl rollout undo deployment/<name>` (or Argo Rollouts' built-in `AnalysisTemplate` that consumes the smoke exit code).
  - **ArgoCD**: a `PostSync` hook resource runs the smoke job; on failure, the parent Application's `syncPolicy.automated.selfHeal` (or a manual rollback via `argocd app rollback`) reverts.
  - **Vercel**: `vercel rollback <previous-deployment-url>` from a CI step gated on smoke exit code.
  - **Cloud Run**: swap the live revision tag (`gcloud run services update-traffic <svc> --to-revisions <prev>=100`).
  - **GitHub Actions**: a job-level `if: failure()` step that calls the platform-specific rollback CLI above.
- **Parallel-safe by construction.** Smoke tests must not depend on shared mutable state. Use ephemeral test accounts, read-only assertions where possible, and namespaced test data. Two smoke runs hitting the same environment must not interfere.
- **Synthetic monitoring is smoke's continuous twin.** Datadog Synthetics and Grafana k6 (running on a schedule via Grafana Cloud) re-execute the smoke set every 1–5 minutes in production. The same script powers both: post-deploy gate + continuous synthetic monitor.
- **Self-healing selectors and AI-assisted maintenance** are emerging (Datadog Synthetics auto-detects UI changes; vendor-side AI agents propose updates). Treat AI-proposed smoke changes the same as any AI-generated code — verify before merging.
- **No retries.** Playwright's canonical smoke project sets `retries: 0`. A flaky smoke is a broken smoke — fix the test or fix the system, do not paper over with retries that hide real regressions.

## Anti-patterns (severity reconciliation)

These categories all emit `severity: critical` on the wire per the warnings-are-bugs rule (see footer + [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)). The triage tier in the report body is shown for prioritization.

| Anti-pattern | Why it's critical | Triage tier |
|---|---|---|
| Smoke suite > 2 min wall-clock | Defeats the fast-fail premise; pipeline blockers stack up; rollback latency exceeds outage tolerance | HIGH |
| Smoke duplicates full E2E | Smoke is no longer a gate, it's a re-run of the suite — wastes budget, doubles flake surface | HIGH |
| No rollback hook on smoke failure | Manual rollback adds minutes-to-hours of customer-facing outage; defeats the entire post-deploy verification chain | CRITICAL |
| Retries on smoke tests | Hides flake and real regressions behind a green check | HIGH |
| Smoke depends on shared mutable state | Two concurrent smoke runs interfere; intermittent false-fails poison rollback signal | HIGH |
| Smoke runs only in CI, not post-deploy | The deploy itself is the highest-risk moment; smoking only in CI verifies the build, not the deploy | CRITICAL |
| Smoke uses real prod credentials / PII | Test accounts must be ephemeral and clearly tagged; never run smoke as a real user | CRITICAL |
| Hard-coded environment URLs in smoke | Smoke can't run against staging vs prod vs canary slice — wire URL via env var | MEDIUM |
| No assertion content checks (only HTTP 200) | A 200 OK from a broken cache or stale CDN still says "200"; assert on response body, version header, or critical text | HIGH |
| Smoke without auth path coverage | Sign-in is the single highest-revenue path; an auth regression is invisible to health-endpoint-only smoke | CRITICAL |

### Severity on the wire vs. in the report

The triage tier column above is the **report view** — what a human reads in the markdown summary so they can prioritize fixes. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see footer + [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)). There is no soft tier on the wire. The triage tiers stay in the report for ordering; the letter's `severity` field is always `critical`. The integrator uses `confidence` and `kind` (e.g. `flake_suspected` vs `version_mismatch`) to weight findings — not severity.

## What Smoke Tests Check (the canonical 5)

1. **Health endpoint** — returns 200 with expected JSON shape (e.g. `{"status":"ok"}`).
2. **Database connectivity** — a trivial read against a known table returns rows or a known-empty response (not a 500).
3. **Auth path** — sign-in endpoint reachable, accepts a valid ephemeral test credential, returns a session token.
4. **Primary critical path** — the single most important user-visible page or API endpoint returns 200 with expected content.
5. **Version / build identifier** — response includes the build SHA or version the deploy was supposed to ship (catches "deploy didn't actually update").

That's it. Five checks, under two minutes, every deploy.

## Tool Integration (2026)

| Tool | Role | When |
|---|---|---|
| **Playwright** — dedicated `smoke` project | Browser-level critical-path smoke (sign-in, primary page render) — minimal subset, `retries: 0`, `--grep @smoke` filter | Every web deploy |
| **k6 smoke test** (`stages: [{duration:'30s', target:1}]`) | API-level smoke + can promote to synthetic monitor via Grafana Cloud scheduling | Every API deploy |
| **Datadog Synthetics** | Continuous synthetic re-execution of the same smoke set every 1–5 min in production | Production monitoring |
| **Better Stack synthetic checks** | Lightweight uptime + endpoint synthetics; alerting integration | Production monitoring |
| **Custom curl / sqlcmd / psql probes** | Minimal language-free smoke for edge environments (cron, kubernetes job, runbook) | Fallback / shell environments |
| **pytest `-m smoke`** | Python projects — marker filter on the existing test corpus | Every Python deploy |
| **dotnet test --filter Category=Smoke** | .NET projects — Trait filter for the smoke subset | Every .NET deploy |
| **Spring Boot Actuator** `/actuator/health` | Java/Spring smoke target — built-in liveness + readiness + DB + custom probes | Every Spring deploy |

The pattern across all of them: **one tagged subset, no retries, ≤ 2 min budget, exit code drives rollback.**

## 7-Language Coverage

### TypeScript — Playwright smoke project

```ts
// playwright.config.ts — dedicated smoke project, no retries, 2-min budget
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'smoke',
      testMatch: /.*\.smoke\.spec\.ts/,
      retries: 0,
      timeout: 30_000,          // per test
    },
    {
      name: 'e2e',
      testMatch: /.*\.e2e\.spec\.ts/,
      retries: 2,
    },
  ],
  globalTimeout: 120_000,       // smoke run total budget: 2 min
});

// tests/critical.smoke.spec.ts
import { test, expect } from '@playwright/test';

const BASE = process.env.SMOKE_BASE_URL!;
const TEST_EMAIL = process.env.SMOKE_TEST_EMAIL!;
const TEST_TOKEN = process.env.SMOKE_TEST_TOKEN!;   // ephemeral magic-link / passwordless token, CI-issued — NEVER a real password

test('@smoke health endpoint returns ok', async ({ request }) => {
  const r = await request.get(`${BASE}/api/health`);
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.status).toBe('ok');
  expect(body.version).toBeTruthy();   // catches "deploy didn't actually update"
});

test('@smoke sign-in reaches dashboard', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.fill('[name=email]', TEST_EMAIL);
  await page.fill('[name=token]', TEST_TOKEN);
  await page.click('button[type=submit]');
  await expect(page.locator('h1')).toContainText('Dashboard');
});
```

```bash
# Run only smoke, no retries, fail fast
npx playwright test --project=smoke --reporter=line
echo "exit=$?"   # non-zero triggers rollback
```

### TypeScript — k6 smoke test

```ts
// smoke.k6.ts — k6 smoke profile, single virtual user, 30s
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed:   ['rate<0.01'],     // <1% errors
    http_req_duration: ['max<2000'],      // smoke is not perf testing — assert worst-case ceiling, not percentiles (vus:1 produces too few samples for p95)
  },
};

const BASE       = __ENV.SMOKE_BASE_URL;
const DEPLOY_SHA = __ENV.BUILD_SHA;       // SHA that was just deployed

export default function () {
  const health = http.get(`${BASE}/api/health`);
  check(health, {
    'health 200':        (r) => r.status === 200,
    'health status ok':  (r) => r.json('status') === 'ok',
    'version present':   (r) => !!r.json('version'),
    'version matches deployed SHA': (r) => r.json('version') === DEPLOY_SHA,
  });
}
```

### Python — pytest smoke marker

```python
# conftest.py
import os, pytest, requests

@pytest.fixture(scope="session")
def base_url():
    url = os.environ["SMOKE_BASE_URL"]
    return url.rstrip("/")

# pyproject.toml
# [tool.pytest.ini_options]
# markers = ["smoke: post-deploy critical path checks"]

# tests/test_smoke.py
import pytest, requests

pytestmark = pytest.mark.smoke

def test_health(base_url):
    r = requests.get(f"{base_url}/api/health", timeout=5)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body.get("version"), "missing build version — deploy may not have updated"

def test_db_connectivity(base_url):
    # cheap read-only endpoint that hits the DB
    r = requests.get(f"{base_url}/api/v1/ping-db", timeout=5)
    assert r.status_code == 200

def test_auth_endpoint_exists(base_url):
    # empty body → 400/401/422, NOT 404
    r = requests.post(f"{base_url}/api/auth/login", json={}, timeout=5)
    assert r.status_code in (400, 401, 422), f"auth endpoint returned {r.status_code}"
```

```bash
# Run only smoke, abort everything on first fail, 2-min wall-clock max
pytest -m smoke --maxfail=1 --timeout=120 -x
```

### C# / .NET — quick HTTP probe set

```csharp
// SmokeTests.cs — xUnit trait-filtered subset; run with: dotnet test --filter Category=Smoke
using System.Net;
using System.Net.Http.Json;
using Xunit;

[Trait("Category", "Smoke")]
public class SmokeTests
{
    private static readonly string Base =
        Environment.GetEnvironmentVariable("SMOKE_BASE_URL")
        ?? throw new InvalidOperationException("SMOKE_BASE_URL unset");

    private static readonly HttpClient Http = new() {
        BaseAddress = new Uri(Base),
        Timeout    = TimeSpan.FromSeconds(5),
    };

    [Fact]
    public async Task Health_Returns_200_With_Version()
    {
        var r = await Http.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var body = await r.Content.ReadFromJsonAsync<Health>();
        Assert.Equal("ok", body!.Status);
        Assert.False(string.IsNullOrWhiteSpace(body.Version),
            "missing build version — deploy may not have updated");
    }

    [Fact]
    public async Task Auth_Endpoint_Exists()
    {
        var r = await Http.PostAsJsonAsync("/api/auth/login", new { });
        Assert.True(
            r.StatusCode is HttpStatusCode.BadRequest
                       or HttpStatusCode.Unauthorized
                       or HttpStatusCode.UnprocessableEntity,
            $"auth endpoint returned {(int)r.StatusCode}");
    }

    private record Health(string Status, string Version);
}
```

```bash
dotnet test --filter Category=Smoke --logger "console;verbosity=minimal"
```

### Java — Spring Boot Actuator health curl

Spring Boot Actuator exposes `/actuator/health` with built-in liveness, readiness, and DB indicators when `spring-boot-starter-actuator` is on the classpath. Configure `management.endpoint.health.show-components=always` (or `when-authorized`) to surface DB / disk / custom indicators.

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      show-components: when-authorized
      probes:
        enabled: true        # /actuator/health/liveness + /readiness
```

```bash
#!/usr/bin/env bash
# smoke.sh — Spring Boot post-deploy smoke; non-zero exit triggers rollback
set -euo pipefail
: "${SMOKE_BASE_URL:?SMOKE_BASE_URL unset}"

# 1. Liveness — container/process is up
curl -fsS --max-time 5 "$SMOKE_BASE_URL/actuator/health/liveness" \
  | jq -e '.status == "UP"' > /dev/null \
  || { echo "smoke: liveness FAIL"; exit 1; }

# 2. Readiness — DB + downstream deps reachable
curl -fsS --max-time 5 "$SMOKE_BASE_URL/actuator/health/readiness" \
  | jq -e '.status == "UP"' > /dev/null \
  || { echo "smoke: readiness FAIL"; exit 1; }

# 3. Build version matches what we just deployed
DEPLOYED_SHA="${BUILD_SHA:?BUILD_SHA unset}"
ACTUAL=$(curl -fsS --max-time 5 "$SMOKE_BASE_URL/actuator/info" | jq -r '.build.commit // empty')
[[ "$ACTUAL" == "$DEPLOYED_SHA" ]] \
  || { echo "smoke: deployed SHA=$ACTUAL expected=$DEPLOYED_SHA"; exit 1; }

echo "smoke: PASS"
```

> **C / C++ skipped** — not typical for post-deploy HTTP smoke; backend services in C/C++ surface a health endpoint that the Bash/curl, Python, or k6 probes above already cover.

### SQL — connectivity smoke

A 5-second probe that the database server is reachable, accepts a connection on the deploy-supplied credentials, and answers a trivial read. Run as a separate smoke step *before* the application-level smoke — if the DB is down, app smoke will fail more confusingly.

```bash
# PostgreSQL — psql connectivity smoke
# Prefer a connection-service file (~/.pg_service.conf) or ~/.pgpass over
# PGPASSWORD env vars where possible; env vars are visible via /proc/<pid>/environ
# on Linux. PGPASSWORD, if used, must be an ephemeral CI-issued secret — NEVER a
# real production credential.
psql --no-psqlrc --quiet --tuples-only \
     --command="SELECT 1;" \
     --command="SELECT current_database(), version();" \
  > /tmp/smoke-pg.out 2> /tmp/smoke-pg.err
status=$?
[[ $status -eq 0 ]] || { cat /tmp/smoke-pg.err; exit 1; }
grep -q '^ 1$' /tmp/smoke-pg.out || { echo "psql smoke: unexpected output"; exit 1; }
echo "smoke: postgres OK"
```

```bash
# SQL Server — sqlcmd connectivity smoke
# Pass the password via the SQLCMDPASSWORD env var, NOT the -P flag — process-listing
# tools (ps, top) expose command-line args; env vars are at least one step less visible.
# SQLCMDPASSWORD must be an ephemeral CI-issued secret.
SQLCMDPASSWORD="$MSSQL_PASSWORD" \
  sqlcmd -S "$MSSQL_HOST" -U "$MSSQL_USER" \
         -d "$MSSQL_DB" -l 5 -b \
         -Q "SET NOCOUNT ON; SELECT 1 AS smoke_ok;" \
  | grep -q "smoke_ok" \
  || { echo "smoke: mssql FAIL"; exit 1; }
echo "smoke: mssql OK"
```

The `SELECT 1` pattern is the canonical liveness probe across PostgreSQL, MySQL, SQL Server, and Oracle. It does not lock, does not touch data, and runs in single-digit milliseconds.

## When to Run

- **Immediately post-deploy** — the deploy step's success criterion. Smoke exit code drives rollback.
- **Pre-traffic-ramp on canary** — before promoting a canary slice from 1% → 10% → 100%, smoke must pass.
- **As a scheduled synthetic** — every 1–5 minutes in production via Datadog Synthetics, Grafana k6 (Grafana Cloud), Better Stack synthetic checks, or a simple cron job hitting the same script.
- **First step in any CI pipeline that touches an environment** — gate everything else.
- **NOT during development inner-loop** — that's what unit tests are for.

## Output Format

```markdown
## Smoke Test Report

**Status**: PASS | FAIL
**Environment**: production-canary
**Build SHA**: 7f3a8b1
**Duration**: 47s / 120s budget

### Checks
| Check                 | Status | Time   |
|-----------------------|--------|--------|
| Health endpoint       | PASS   | 45ms   |
| Build version match   | PASS   | 12ms   |
| Database connectivity | PASS   | 120ms  |
| Auth endpoint         | PASS   | 89ms   |
| Primary critical path | PASS   | 340ms  |

### Summary
All 5 smoke checks passed in 47 seconds (39% of 2-min budget).
Canary slice is healthy. Safe to ramp traffic.
```

On FAIL, the report includes the exact assertion that fired, the response body excerpt, the build SHA that just deployed, and the rollback command that the pipeline is now invoking.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+target+kind)[:12]>     # fingerprint for dedup
severity: critical                                 # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                    # high = reproduced; low = single-run flake suspected
engine: playwright | k6 | pytest | dotnet-test | curl-probe | psql | sqlcmd | manual
kind: health_fail | db_unreachable | auth_fail | version_mismatch | timeout | flake_suspected | budget_exceeded
target_file: tests/critical.smoke.spec.ts          # or smoke.sh, or test_smoke.py
target_line: 22                                    # assertion that fired (when traceable)
environment: production | production-canary | staging
build_sha: 7f3a8b1                                 # what was deployed
duration_ms: 47312
budget_ms: 120000
message: "Health endpoint returned 200 but body.version='6f2c9aa' != deployed SHA '7f3a8b1' — deploy may not have updated"
suggested_fix: "Re-run deploy; verify CI step publishing build.commit to /actuator/info or /api/health; rollback to previous revision via 'kubectl rollout undo deployment/api'"
rollback_action: "kubectl rollout undo deployment/api"     # what the pipeline did or should do
```

The integrator treats `kind: flake_suspected` as `confidence: low` and may request one re-run; everything else is `confidence: high` and blocks phase advancement until resolved. `kind: budget_exceeded` (smoke > 2 min) is treated as a design defect in the smoke suite itself, not a deploy regression — kick back to the test author, not to ops.

## Red Lines

- Never let smoke exceed 2 minutes — split or simplify the suite.
- Never silently pass when the server is unreachable — fail loudly with a non-zero exit code.
- Never skip smoke "because the unit tests pass" — they test different things; unit tests verify the build, smoke verifies the deploy.
- Never use real production credentials or PII in smoke — ephemeral CI-issued test accounts only.
- Never add retries to smoke tests — a flaky smoke is a broken smoke.
- Never run smoke without a rollback hook wired up — a smoke failure with no automated response is just a louder bug report.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
