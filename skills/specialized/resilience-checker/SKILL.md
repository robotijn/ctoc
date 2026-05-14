---
name: resilience-checker
description: Verifies circuit breakers, retries, timeouts, and graceful degradation.
type: skill
when_to_load:
  - "resilience"
  - "circuit breaker"
  - "retry logic"
  - "timeout check"
  - "graceful degradation"
  - "fallback"
  - "graceful shutdown"
related_skills:
  - specialized/error-handler-checker
  - specialized/health-check-validator
  - specialized/observability-checker
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Grep
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Resilience Checker (skill)

> Converted from agents/specialized/resilience-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You verify that the application handles failures gracefully — with timeouts, retries, circuit breakers, and fallbacks.

## 2026 Best Practices (Specialized category)

- **Resilience IS the primary measure in 2026**. This skill is the gate-keeper for it.
- **Look for**: graceful degradation, circuit breakers, retries with backoff, timeouts everywhere, fallback paths.
- **Granular per-dependency**: each external call must have its own timeout/retry/circuit config.
- **Three-pillar observability tie-in**: every retry/circuit-trip emits a metric AND log AND span.
- **Manual review**: tooling flags missing patterns; humans approve which dependencies can tolerate degradation.

## What to Check

### External Calls
For every external dependency (API, DB, queue):
- Timeout configured?
- Retry with backoff?
- Circuit breaker?
- Fallback / cache?

### Graceful Shutdown
- Signal handlers (SIGTERM, SIGINT)
- Connection draining
- In-flight request completion
- Resource cleanup

## Resilience Patterns

### Timeout
```python
# BAD
response = requests.get(url)

# GOOD
response = requests.get(url, timeout=5)
```

### Retry with Backoff
```python
from tenacity import retry, wait_exponential, stop_after_attempt

@retry(wait=wait_exponential(min=1, max=10), stop=stop_after_attempt(3))
def call_external_api():
    return requests.get(url, timeout=5)
```

### Circuit Breaker
```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=30)
def call_payment_api():
    return requests.post(payment_url, timeout=5)
```

### Graceful Shutdown
```javascript
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await server.close();
  await db.close();
  process.exit(0);
});
```

## Output Format

```markdown
## Resilience Report

### External Dependencies
| Dependency | Timeout | Retry | Circuit | Fallback |
|------------|---------|-------|---------|----------|
| Payment API | 5s | 3x | No | No |
| User Service | No | No | No | No |
| Database | 30s | Yes | N/A | No |
| Redis Cache | 1s | No | No | Yes |

### Critical Gaps
1. **No timeout** on User Service — hanging requests, resource exhaustion
2. **No circuit breaker** on Payment API — cascading failures
3. **No retry** on transient DB errors — spurious failures

### Graceful Shutdown
| Check | Status |
|-------|--------|
| SIGTERM handler | Missing |
| SIGINT handler | Missing |
| Connection draining | Missing |
| Cleanup on exit | Partial |

### Recommendations
1. Add timeouts to all external calls
2. Implement circuit breaker for Payment API
3. Add graceful shutdown handlers
4. Consider fallback cache for User Service
```

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
