---
name: health-check-validator
description: Validates health endpoints and Kubernetes probes.
type: skill
when_to_load:
  - "health check"
  - "readiness probe"
  - "liveness probe"
  - "kubernetes probe"
  - "/health endpoint"
  - "k8s health"
related_skills:
  - specialized/resilience-checker
  - specialized/observability-checker
  - infrastructure/kubernetes-checker
effort_level: low
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
---

# Health Check Validator (skill)

> Converted from agents/specialized/health-check-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate that health check endpoints are properly implemented for monitoring and orchestration.

## 2026 Best Practices (Specialized category)

- **Health checks must be granular**: per-dependency health, not just "the service is up." Each dependency reports independently.
- **Resilience first**: liveness must NOT depend on external services (would cause cascading restarts). Readiness MUST.
- **Three-pillar observability** integration: health endpoint status should be a metric, an event log, AND a trace span.
- **Block deployments** if readiness doesn't validate critical dependencies.

## Health Check Types

### Liveness
- Is the app running?
- Should NOT check dependencies
- Fast (< 100ms)
- Failure → restart container

### Readiness
- Can the app handle traffic?
- SHOULD check dependencies
- Failure → remove from load balancer

### Startup
- Has the app finished starting?
- For slow-starting apps
- Failure during startup → restart

## Implementation

### Good Health Check
```python
@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/ready")
async def ready():
    db_ok = await check_database()
    cache_ok = await check_cache()
    if not all([db_ok, cache_ok]):
        raise HTTPException(503, detail="Not ready")
    return {
        "status": "ready",
        "checks": {
            "database": "ok" if db_ok else "failed",
            "cache": "ok" if cache_ok else "failed",
        }
    }
```

### Kubernetes Probes
```yaml
livenessProbe:
  httpGet: { path: /health, port: 8080 }
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet: { path: /ready, port: 8080 }
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2
```

## Output Format

```markdown
## Health Check Report

### Endpoints
| Endpoint | Type | Status |
|----------|------|--------|
| /health | Liveness | OK |
| /ready | Readiness | Warning |
| /metrics | Metrics | OK |

### Issues
1. **Heavy check in /health** — currently queries DB
   - Fix: move DB check to /ready
2. **Missing dependency check in /ready** — not checking Redis, external API
3. **Returns 200 when unhealthy** — /ready returns 200 even when DB down
   - Fix: 503 when deps fail

### Kubernetes Probes
| Probe | Status |
|-------|--------|
| Liveness | OK — /health, 10s |
| Readiness | Missing |
| Startup | Missing |

### Response Time
| Endpoint | Time | Target |
|----------|------|--------|
| /health | 5ms | < 100ms |
| /ready | 250ms | < 500ms |
```
