---
name: health-check-validator
description: Validates health endpoints and Kubernetes probes — distinct /livez, /readyz, /startupz, graceful shutdown, RFC 9457 unhealthy responses.
type: skill
when_to_load:
  - "health check"
  - "readiness probe"
  - "liveness probe"
  - "startup probe"
  - "kubernetes probe"
  - "/health endpoint"
  - "/healthz"
  - "/livez"
  - "/readyz"
  - "k8s health"
  - "graceful shutdown"
related_skills:
  - specialized/resilience-checker
  - specialized/observability-checker
  - infrastructure/kubernetes-checker
effort_level: low
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Health Check Validator (skill)

> Converted from agents/specialized/health-check-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate that health-check endpoints and orchestrator probes are correctly partitioned. You enforce a strict separation between liveness (am I alive?), readiness (can I accept traffic?), and startup (am I done initializing?) — and you treat conflation as a critical defect. You assume every shared health endpoint is a latent cascade-failure.

## 2026 Best Practices (Specialized category)

- **Three distinct probes, three distinct semantics.** Kubernetes documents `livenessProbe` / `readinessProbe` / `startupProbe` as three independent controllers — Spring Boot 4 ships liveness and readiness enabled by default and exposes them at `/actuator/health/liveness` and `/actuator/health/readiness`; the same `/livez` and `/readyz` convention is now first-class via `management.endpoint.health.probes.add-additional-paths=true`. A single `/health` endpoint that conflates the three is an anti-pattern.
  - **/livez (liveness)** — "is the process alive enough to be worth keeping?" Shallow. No I/O, no DB, no downstream calls. Failure → kubelet restarts the container.
  - **/readyz (readiness)** — "can I serve a request right now?" Deeper. May check critical dependencies (DB, cache, queue) the request path requires. Failure → kubelet removes the pod from the Service endpoints; **no restart**.
  - **/startupz (startup)** — "have I finished initializing?" Runs once at boot. Liveness and readiness do not execute until the startup probe succeeds, so slow-starting JVM / .NET apps are not killed mid-warmup. Required for any app whose cold-start exceeds `initialDelaySeconds` of the liveness probe.
- **Never put a DB / external-service check in liveness.** This is the most common and most dangerous health-check bug. When the DB blips, every replica fails liveness simultaneously, kubelet restarts them all, the restart storm prevents recovery, and the outage extends. The DB check belongs in readiness — failed readiness pulls the pod from the LB but does not restart it; when the DB recovers, traffic resumes automatically. (Kubernetes docs explicitly warn: "Incorrect implementation of liveness probes can lead to cascading failures.")
- **Graceful shutdown with `preStop` + `terminationGracePeriodSeconds`.** SIGTERM and endpoint deregistration are not synchronous — kube-proxy/iptables may still route traffic to a Pod for several seconds after termination begins. The fix: a `preStop` hook (`sleep 10` or a deregister script) so the Pod stops appearing in Service endpoints **before** the application starts shutting down. Set `terminationGracePeriodSeconds` ≥ (preStop sleep + max in-flight request duration + drain time). Default is 30s; raise it if your preStop sleep is long. JVM `server.shutdown=graceful` + `spring.lifecycle.timeout-per-shutdown-phase` must be **shorter than** `terminationGracePeriodSeconds`, or SIGKILL fires before drain completes.
- **Idempotent and unauthenticated.** Probes are called every `periodSeconds` (default 10s) forever. The handler MUST be idempotent (no side effects), MUST NOT require auth (kubelet has no credentials), and MUST be cheap (< 100ms for liveness, < 500ms for readiness). Auth on a k8s probe endpoint is an anti-pattern — kubelet will receive 401, mark unhealthy, restart-loop. Use network policy / authorization webhooks to restrict probe paths, not in-app auth.
- **RFC 9457 problem-detail body on unhealthy responses.** When the endpoint returns non-2xx, emit `Content-Type: application/problem+json` with `{type, title, status, detail, instance}` per RFC 9457 (successor to RFC 7807, backward compatible, mandated baseline in 2026). The kubelet only reads the status code, but humans, dashboards, and aggregators read the body — a structured problem-detail body is now the expected shape. **Never include stack traces, internal hostnames, or dependency credentials** in the `detail` field.
- **Circuit-break dependency checks.** Readiness probes that call dependencies must wrap them with a circuit breaker (Polly / Resilience4j / opossum) and a tight timeout (≤ 1s). A slow dependency must not make the probe time out — kubelet treats probe timeout as failure. When the breaker is open, return a documented `dependency_unavailable` problem-detail with `status: 503` rather than hanging.
- **Independent dependency reporting.** Readiness should report **each** dependency's status (db, cache, queue, downstream APIs) — not collapse to a single boolean. Spring Boot Actuator's composite `HealthIndicator` model is the reference shape; FastAPI / Express implementations should mirror it.
- **Block deployments on readiness regressions.** If a previous deploy's readiness validated db+cache+queue and the new deploy only validates db, that's a regression — gate the rollout.

## Health-Check Anti-Patterns (severity: critical on the wire)

| Anti-pattern | Why it's critical | Detection |
|---|---|---|
| **No health endpoint at all** | Kubelet has no signal — must rely on TCP probe, which only proves the socket is open, not that the app is functional. | Grep for `/health\|/livez\|/readyz\|HealthCheck\|actuator/health`. Zero hits in a containerized service = finding. |
| **Single `/health` endpoint used for both liveness and readiness** | Either it's too deep (cascade restart on DB blip) or too shallow (LB never pulls a sick pod). Cannot be correct simultaneously. | One handler matched by both `livenessProbe.httpGet.path` and `readinessProbe.httpGet.path`. |
| **DB / cache / downstream check inside liveness** | Cascade-restart on dependency blip. The reference example of this killed production for hours at multiple FAANG-scale orgs (see Kubernetes docs warning). | Trace handler → look for `db.ping`, `redis.PING`, `http.get(downstream)` reachable from the liveness path. |
| **Missing startup probe on slow-starting app** | Cold-start > `initialDelaySeconds` of liveness → kubelet kills the pod mid-boot, infinite restart loop. | App with measured startup ≥ 30s and no `startupProbe`. |
| **Returns 200 unconditionally** | Endpoint exists, kubelet always sees green, sick pods stay in rotation forever. | Handler with no conditional path producing non-200; only `return 200` / `return {"status":"ok"}`. |
| **Internal info leaked in response body** | Stack traces, internal hostnames, connection strings, dependency credentials visible to anyone who can reach the probe URL — including unauthenticated traffic if the path leaks past ingress. | Response body contains `Exception`, `Traceback`, hostname patterns, `password=`, `Server=`, file paths. |
| **No graceful shutdown / no `preStop`** | 5xx errors during every rolling deploy because kube-proxy still routes to the terminating pod. | Deployment YAML with no `lifecycle.preStop`, or app with no SIGTERM handler. |
| **Probe endpoint requires auth** | Kubelet has no creds → 401 → mark unhealthy → restart loop or LB never marks ready. | Probe path matched by an auth middleware / `[Authorize]` attribute / `@PreAuthorize`. |
| **terminationGracePeriodSeconds too short for preStop + drain** | SIGKILL fires before in-flight requests drain → client-visible errors. | `terminationGracePeriodSeconds` < (preStop duration + app shutdown timeout). |
| **Probe handler does heavy work** | Timeout treated as failure. A 5-second JOIN on liveness will restart-loop under load. | Handler with measurable I/O on liveness; readiness > 500ms p99. |

## Implementation patterns by language (BAD / SAFE)

### Python — FastAPI 0.115+ with async dependency checks

```python
# BAD: single /health endpoint, DB check inside (used for liveness)
@app.get("/health")
async def health():
    await db.execute("SELECT 1")                 # liveness probe will cascade-restart on DB blip
    return {"status": "ok"}

# SAFE: three endpoints, RFC 9457 problem-detail on failure
from fastapi import FastAPI, Response, status
from fastapi.responses import JSONResponse

PROBLEM_JSON = "application/problem+json"

@app.get("/livez", status_code=200, include_in_schema=False)
async def livez():
    # SHALLOW — process is up, event loop is responsive. No I/O.
    return {"status": "alive"}

@app.get("/readyz", include_in_schema=False)
async def readyz():
    checks = {}
    async def check(name, coro, timeout=1.0):
        try:
            await asyncio.wait_for(coro, timeout=timeout)
            checks[name] = "ok"
        except Exception as e:
            checks[name] = "fail"
    await asyncio.gather(
        check("db",    db.execute("SELECT 1")),
        check("cache", cache.ping()),
        check("queue", queue.health()),
    )
    if any(v != "ok" for v in checks.values()):
        return JSONResponse(
            status_code=503,
            media_type=PROBLEM_JSON,
            content={
                "type": "https://example.com/probs/dependency-unavailable",
                "title": "Dependency unavailable",
                "status": 503,
                "detail": "One or more critical dependencies failed health check",
                "instance": "/readyz",
                "checks": checks,            # per-dep, no internal info
            },
        )
    return {"status": "ready", "checks": checks}

@app.get("/startupz", include_in_schema=False)
async def startupz():
    if not app.state.startup_complete:
        return JSONResponse(status_code=503, media_type=PROBLEM_JSON, content={
            "type": "about:blank", "title": "Starting", "status": 503,
            "detail": "Migrations / cache warmup not finished", "instance": "/startupz",
        })
    return {"status": "started"}
```

### TypeScript — Express + fastify-healthcheck

```typescript
// BAD: one endpoint, DB ping inside, used for liveness
app.get("/health", async (_req, res) => {
  await db.query("SELECT 1");                    // cascade-restart risk
  res.json({ status: "ok" });
});

// SAFE: split endpoints, RFC 9457 body, circuit-broken dependency check
import { problemDetail } from "./problem-json";  // helper that sets application/problem+json
import CircuitBreaker from "opossum";

const dbBreaker = new CircuitBreaker(() => db.query("SELECT 1"), { timeout: 1000, errorThresholdPercentage: 50 });

app.get("/livez", (_req, res) => res.json({ status: "alive" }));         // shallow

app.get("/readyz", async (_req, res) => {
  const checks: Record<string, "ok" | "fail"> = {};
  await Promise.all([
    dbBreaker.fire().then(() => (checks.db = "ok")).catch(() => (checks.db = "fail")),
    cache.ping().then(() => (checks.cache = "ok")).catch(() => (checks.cache = "fail")),
  ]);
  const ok = Object.values(checks).every(v => v === "ok");
  if (!ok) return problemDetail(res, 503, "dependency-unavailable", "Dependency unavailable", "/readyz", { checks });
  res.json({ status: "ready", checks });
});

app.get("/startupz", (_req, res) =>
  global.__startupComplete ? res.json({ status: "started" })
                           : problemDetail(res, 503, "starting", "Starting", "/startupz")
);
```

### C# — .NET 9 with `AddHealthChecks` + tags

```csharp
// BAD: single MapHealthChecks at /health, includes "db" check used for liveness
builder.Services.AddHealthChecks().AddSqlServer(connString, name: "db");
app.MapHealthChecks("/health");                            // kubelet probes /health for BOTH live + ready -> cascade-restart

// SAFE: tag checks, expose distinct endpoints, problem-detail body on failure
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: new[] { "live" })
    .AddSqlServer(connString, name: "db",      tags: new[] { "ready" })
    .AddRedis(redisConn,      name: "cache",   tags: new[] { "ready" })
    .AddCheck<MigrationsCompleteCheck>("migrations", tags: new[] { "startup" });

app.MapHealthChecks("/livez",    new HealthCheckOptions { Predicate = r => r.Tags.Contains("live") });
app.MapHealthChecks("/readyz",   new HealthCheckOptions {
    Predicate = r => r.Tags.Contains("ready"),
    ResponseWriter = ProblemDetailsWriter.WriteAsync,    // emits application/problem+json
});
app.MapHealthChecks("/startupz", new HealthCheckOptions { Predicate = r => r.Tags.Contains("startup") });

// Allow anonymous explicitly — kubelet has no creds
app.MapHealthChecks("/livez").AllowAnonymous();
app.MapHealthChecks("/readyz").AllowAnonymous();
app.MapHealthChecks("/startupz").AllowAnonymous();
```

### Java — Spring Boot 4 (Actuator + composite indicators)

**BAD** — legacy single `/actuator/health` is mapped for both liveness and readiness; a DB-down event triggers a cascade-restart. This was the default before Spring Boot 4 / when `management.health.probes.enabled` was off.

**SAFE** — Spring Boot 4 ships liveness + readiness as Health Groups, enabled by default. Configure additional paths to expose the kube-native `/livez` and `/readyz`:

```yaml
# application.yaml
management:
  endpoint:
    health:
      probes:
        enabled: true
        add-additional-paths: true   # exposes /livez and /readyz on the MAIN port
      group:
        live:
          include: livenessState
        ready:
          include: readinessState, db, redis, kafka
        startup:
          include: migrations
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 25s   # must be < terminationGracePeriodSeconds (default 30s)
```

```java
// Custom readiness indicator (composite pattern). Spring Boot aggregates all
// HealthIndicator beans in the configured group; each reports independently.
@Component
public class DatabaseHealthIndicator extends AbstractHealthIndicator {
    private final DataSource ds;
    public DatabaseHealthIndicator(DataSource ds) { this.ds = ds; }

    @Override
    protected void doHealthCheck(Health.Builder b) throws Exception {
        try (var c = ds.getConnection(); var s = c.createStatement()) {
            s.setQueryTimeout(1);                              // <= 1s, see probe-timeout rule
            s.execute("SELECT 1");
            b.up().withDetail("check", "select_one_ok");
        } catch (SQLException e) {
            // No stack trace, no credentials, no internal hostnames.
            b.down().withDetail("reason", "connection_failed");
        }
    }
}
```

### C (C17/C23) — minimal kube-style probe HTTP server

```c
/* BAD: single endpoint, opens a DB connection on every probe */
void handle_health(int fd) {
    if (db_open() != 0) { write_response(fd, 500, "fail"); return; }   /* liveness -> cascade restart */
    write_response(fd, 200, "ok");
}

/* SAFE: split endpoints, shallow liveness, deep readiness with timeout */
#include <time.h>

static atomic_bool g_started = false;

static void respond_problem(int fd, int status, const char *title, const char *detail) {
    char body[512];
    int n = snprintf(body, sizeof(body),
        "{\"type\":\"about:blank\",\"title\":\"%s\",\"status\":%d,"
        "\"detail\":\"%s\",\"instance\":\"/readyz\"}", title, status, detail);
    dprintf(fd,
        "HTTP/1.1 %d %s\r\nContent-Type: application/problem+json\r\n"
        "Content-Length: %d\r\nConnection: close\r\n\r\n%s",
        status, title, n, body);
}

void handle_livez(int fd) {
    /* SHALLOW — no I/O, no locks held for long */
    dprintf(fd, "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nalive");
}

void handle_readyz(int fd) {
    /* DEEP — call dependencies with explicit timeout */
    int db_ok = db_ping_with_timeout_ms(1000);
    if (!db_ok) { respond_problem(fd, 503, "Dependency unavailable", "db check failed"); return; }
    dprintf(fd, "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nready");
}

void handle_startupz(int fd) {
    if (!atomic_load(&g_started)) { respond_problem(fd, 503, "Starting", "init not complete"); return; }
    dprintf(fd, "HTTP/1.1 200 OK\r\nContent-Length: 7\r\n\r\nstarted");
}
```

### C++ (20/23) — same shape, RAII + std::chrono timeouts

```cpp
// BAD: one /health that opens a TCP connection to a downstream on every probe
void handle_health(http::response& r) {
    asio::ip::tcp::socket s(io_ctx);
    s.connect(downstream_ep);                   // liveness with network I/O -> cascade-restart
    r.result(200);
}

// SAFE: distinct endpoints, std::future + wait_for for hard timeout
#include <future>
#include <chrono>

static std::atomic<bool> g_started{false};

void handle_livez(http::response& r) {
    r.result(http::status::ok);
    r.body() = "alive";
}

void handle_readyz(http::response& r) {
    auto fut = std::async(std::launch::async, []{ return db_select_one(); });
    if (fut.wait_for(std::chrono::milliseconds(1000)) != std::future_status::ready) {
        r.result(http::status::service_unavailable);
        r.set(http::field::content_type, "application/problem+json");
        r.body() = R"({"type":"about:blank","title":"Dependency unavailable","status":503,"detail":"db timed out","instance":"/readyz"})";
        return;
    }
    if (!fut.get()) { /* same shape, db failed */ }
    r.result(http::status::ok);
    r.body() = R"({"status":"ready"})";
}

void handle_startupz(http::response& r) {
    if (!g_started.load()) {
        r.result(http::status::service_unavailable);
        return;
    }
    r.result(http::status::ok);
}
```

### SQL — the canonical deep-check query

```sql
-- The standard "is the database actually serving" query, used inside readyz dependency checks.
-- Cheap, server-confirmed, no business semantics.
SELECT 1;

-- BAD: deep business query inside readyz (heavy, locks)
SELECT COUNT(*) FROM orders WHERE status = 'pending';   -- table-scan under load on every probe

-- BAD: SELECT 1 against a replica when the primary is what the app writes to
--      ("ready" reports OK while writes are actually failing)
-- Connect string MUST point to the same role the app uses.

-- SAFE: tight statement timeout so a slow DB doesn't hang the probe
SET statement_timeout = '1s';            -- Postgres
SELECT 1;
-- MySQL:  SET SESSION MAX_EXECUTION_TIME=1000; SELECT 1;
-- MSSQL:  SET LOCK_TIMEOUT 1000; SELECT 1;
```

### Kubernetes — probe + lifecycle YAML

```yaml
# SAFE — three distinct probes, graceful shutdown, sane timeouts
spec:
  terminationGracePeriodSeconds: 60          # >= preStop sleep + app shutdown timeout
  containers:
  - name: api
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sh","-c","sleep 10"]   # let kube-proxy update endpoints before app shuts down
    startupProbe:
      httpGet: { path: /startupz, port: 8080 }
      periodSeconds: 5
      failureThreshold: 30                    # allow 150s for cold start
    livenessProbe:
      httpGet: { path: /livez, port: 8080 }
      periodSeconds: 10
      timeoutSeconds: 2
      failureThreshold: 3                     # restart only after 30s of sustained failure
    readinessProbe:
      httpGet: { path: /readyz, port: 8080 }
      periodSeconds: 5
      timeoutSeconds: 2
      failureThreshold: 2
```

## Scan Methodology

### Phase 1: Discovery
- Find probe endpoints: `rg -i "/healthz?|/livez|/readyz|/startupz|actuator/health" .`
- Find probe declarations in YAML: `rg "livenessProbe|readinessProbe|startupProbe" --type yaml`
- Find handler implementations: trace from `app.get("/livez")` / `MapHealthChecks` / `@GetMapping("/livez")` to the function body.

### Phase 2: Conflation check
- For each probe path in the YAML, locate the handler. If the **same** handler is mapped from both liveness and readiness, emit `kind: conflated`.
- For the liveness handler, walk the call graph. If it reaches `db.*`, `redis.*`, an HTTP client to an external host, or any blocking I/O > the probe timeout, emit `kind: deep-in-liveness`.

### Phase 3: Shutdown drain check
- Inspect Deployment / Pod spec for `lifecycle.preStop` and `terminationGracePeriodSeconds`.
- Inspect app code for SIGTERM handler. Missing either → emit `kind: no-graceful-shutdown`.

### Phase 4: Auth check
- For each probe path, check if it's behind an auth middleware (`@PreAuthorize`, `[Authorize]`, `app.use(authMiddleware)`, ingress auth). If yes → `kind: probe-requires-auth`.

### Phase 5: Body leakage check
- Curl each probe under failure conditions (mock dependency down). Inspect body for stack traces, hostnames, connection strings.

## Tool Integration (2026)

| Tool | Use | Output |
|---|---|---|
| **Microsoft.Extensions.Diagnostics.HealthChecks** | .NET 9 first-class — `AddHealthChecks().AddSqlServer().AddRedis()` with tags driving distinct endpoints. | JSON; pair with `AspNetCore.HealthChecks.UI` package for dashboard. |
| **AspNetCore.HealthChecks.UI** | Dashboard surfacing tagged checks per environment. | HTML + JSON `/healthchecks-api`. |
| **Spring Boot Actuator + Micrometer** | Spring Boot 4 ships liveness/readiness enabled by default at `/actuator/health/{liveness,readiness}`; `add-additional-paths` exposes `/livez` and `/readyz` on the main port. Composite `HealthIndicator` for per-dependency reporting. | JSON; Micrometer exports the rollup as `health` gauge. |
| **Terminus (Node)** | Express/Fastify graceful-shutdown + health package: registers SIGTERM handler, drains the server, exposes health endpoints. | Default JSON, easy to override to RFC 9457. |
| **fastify-healthcheck** | Fastify plugin — registers `/health` and `/live`; configure `exposeUptime` + custom under-pressure checks. | JSON. |
| **FastAPI (Python)** | No built-in — implement per the BAD/SAFE pattern above. Pair with `tenacity` for retry + `pybreaker` for circuit breaking. | Custom RFC 9457. |
| **kubectl** | `kubectl describe pod` shows current probe results and recent failure events. `kubectl get events --field-selector reason=Unhealthy` surfaces probe failures cluster-wide. | Text. |
| **kube-state-metrics** | Exposes `kube_pod_container_status_ready` / `kube_pod_status_phase` — alert on `ready != 1` for > N minutes. | Prometheus metrics. |
| **K6 + endpoint smoke tests** | Synthetic check: every probe URL responds in expected SLA. Catches drift (e.g. someone slipped a DB query into /livez). | JSON / Prometheus. |
| **Polly (.NET) / Resilience4j (JVM) / opossum (Node) / tenacity (Py)** | Circuit-break dependency checks inside readyz so a slow dep doesn't hang the probe. | n/a — library. |

## Severity (internal triage vs. refinement-loop output)

The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical` per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)). There is no soft tier on the wire.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | DB check in liveness (cascade-restart), missing health endpoint on user-facing service, probe behind auth (restart loop), 200-always endpoint | BLOCK |
| HIGH | Single `/health` for both liveness + readiness, missing startup probe on slow-starting app, no `preStop`/no graceful shutdown, leaked internal info in body | BLOCK |
| MEDIUM | Readiness > 500ms p99, no per-dependency reporting, `terminationGracePeriodSeconds` only marginally above shutdown timeout | Fix soon |
| LOW | Probe path inconsistent with `/livez` `/readyz` convention, missing RFC 9457 problem-detail body (returns plain text 503), no smoke test | Backlog |

Reconciliation rule: any finding emitted to CTO Chief via the refinement loop sets `severity: critical` regardless of triage tier. The triage tier is preserved in the message body for human prioritization.

## Output Format

```markdown
## Health Check Report

### Endpoints
| Path | Probe type | Status | Latency p99 | Notes |
|------|------------|--------|-------------|-------|
| /livez    | liveness  | OK    | 3ms    | shallow, no I/O |
| /readyz   | readiness | WARN  | 620ms  | exceeds 500ms target; cache check slow |
| /startupz | startup   | OK    | 8ms    | migrations gate |

### Findings
1. **deep-in-liveness** — `/livez` calls `db.execute("SELECT 1")` (src/app.py:42). CRITICAL — cascade-restart on DB blip.
2. **no-graceful-shutdown** — Deployment has no `lifecycle.preStop` and no SIGTERM handler in app. HIGH — 5xx during every rolling deploy.
3. **leaks-info** — `/readyz` body includes `Traceback (most recent call last):` on dependency failure. HIGH.

### Kubernetes Probes
| Probe | Path | Status |
|-------|------|--------|
| Liveness  | /livez   | configured (10s period, 3 failures) |
| Readiness | /readyz  | configured (5s period, 2 failures) |
| Startup   | /startupz | MISSING — app cold-start is ~45s |

### Graceful Shutdown
- preStop: MISSING
- terminationGracePeriodSeconds: 30 (default)
- App SIGTERM handler: MISSING
```

## Letter schema (refinement-loop output contract)

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
engine: manual | kubectl | semgrep | spring-actuator-introspection
kind: missing-endpoint | conflated | deep-in-liveness | no-startup-probe | always-200 | leaks-info | no-graceful-shutdown | probe-requires-auth | grace-period-too-short | heavy-handler
target_file: deploy/api-deployment.yaml | src/app/health.py | ...
endpoint_path: /livez | /readyz | /startupz | /health
probe_type: live | ready | startup | conflated
owasp_or_ref: K8s probes docs (kubernetes.io) | RFC 9457
message: "DB SELECT 1 inside liveness handler — cascade-restart risk on DB blip"
fix: "Move DB check to /readyz; keep /livez shallow (no I/O)"
reference: https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/
```

The integrator uses `confidence` to weight findings. A `kind: deep-in-liveness` finding is always `confidence: high` once the call path to a dependency is verified — there is no benign reading of "I put a DB query in the liveness handler."

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every health-check anti-pattern, missing probe, missing graceful-shutdown hook, and probe-auth misconfiguration emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a missing readiness probe today is a customer-visible outage during the next rolling deploy. Code that ships green-with-bad-health-checks ships with known latent failures.
