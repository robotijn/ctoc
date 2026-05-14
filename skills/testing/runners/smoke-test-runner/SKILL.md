---
name: smoke-test-runner
description: Runs quick sanity checks (under 30s) — app starts, health endpoint, DB connection, auth works.
type: skill
when_to_load:
  - "run smoke test"
  - "smoke test"
  - "quick sanity check"
  - "verify deploy"
  - "smoke check"
  - "is the app up"
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

You run fast smoke tests to verify the application starts and basic functionality works. This is a quick sanity check, not comprehensive testing. Target: < 30 seconds.

## 2026 Best Practices (Testing category)

Two patterns most relevant here:

- **E2E ≤ 30 minutes — smoke is the canary at < 30 seconds.** Smoke runs FIRST in any pipeline. If smoke fails, abort everything else; no point running a 20-minute E2E suite against a dead server. The smoke budget is sub-minute, the full E2E budget is sub-30-minutes — they form a fast-fail funnel.
- **Intent-based test authoring** — smoke tests should encode the most user-visible "is it alive" signals (health endpoint returns 200, login page renders, primary feature reachable) — not implementation-level health (random internal service responds).

## What Smoke Tests Check

1. **App Starts** — no crash on startup
2. **Health Endpoint** — returns 200
3. **Database Connected** — can query
4. **Auth Works** — can log in (or auth endpoint returns 401 for unauthenticated, not 404)
5. **Critical Path** — main feature page accessible

## Example Bash Smoke

```bash
#!/bin/bash
set -e
echo "Starting smoke tests..."

# 1. Start the app
npm start &
APP_PID=$!
sleep 5

# 2. Health check
echo "Checking health endpoint..."
curl -f http://localhost:3000/health || { kill $APP_PID; exit 1; }

# 3. API responds
echo "Checking API..."
curl -f http://localhost:3000/api/version || { kill $APP_PID; exit 1; }

# 4. Auth endpoint exists (401 acceptable; 404 not)
echo "Checking auth..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/login)
case "$STATUS" in
  200|401) ;;
  *) echo "auth endpoint returned $STATUS"; kill $APP_PID; exit 1 ;;
esac

# 5. Cleanup
kill $APP_PID
echo "Smoke tests passed"
```

## Python Smoke

```python
import pytest

@pytest.mark.smoke
class TestSmoke:
    def test_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200

    def test_api_version(self, client):
        r = client.get("/api/version")
        assert r.status_code == 200
        assert "version" in r.json()

    def test_auth_endpoint_exists(self, client):
        r = client.post("/api/auth/login", json={})
        assert r.status_code in [400, 401, 422]  # not 404
```

## Output Format

```markdown
## Smoke Test Report

**Status**: PASS | FAIL
**Duration**: 8.5s

### Checks
| Check | Status | Time |
|-------|--------|------|
| App starts | PASS | 3.2s |
| Health endpoint | PASS | 45ms |
| Database connection | PASS | 120ms |
| Auth endpoint | PASS | 89ms |
| API responds | PASS | 67ms |

### Summary
All 5 smoke tests passed in 8.5 seconds.
Application is ready for further testing.
```

## When to Run

- **Before full test suite** — fail fast, abort the rest if smoke fails
- **After deployment** — verify deploy worked
- **First step in CI** — gate everything else
- **During development** — quick feedback loop

## Red Lines

- Never let smoke exceed 30 seconds — split or simplify
- Never silently pass when the server is unreachable — fail loudly
- Never skip smoke "because the unit tests pass" — they test different things
