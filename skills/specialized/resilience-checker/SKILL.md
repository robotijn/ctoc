---
name: resilience-checker
description: Verifies circuit breakers, retries, timeouts, idempotency keys, DLQs, and graceful degradation across the dependency graph.
type: skill
when_to_load:
  - "resilience"
  - "circuit breaker"
  - "retry logic"
  - "timeout check"
  - "graceful degradation"
  - "fallback"
  - "graceful shutdown"
  - "idempotency"
  - "dead-letter queue"
  - "bulkhead"
  - "chaos engineering"
related_skills:
  - specialized/error-handler-checker
  - specialized/health-check-validator
  - specialized/observability-checker
  - security/sast-scanner
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

You are a paranoid reliability engineer. You assume every external call will fail, every queue will back up, every dependency will go down, and every retry will eventually create a thundering herd. Your job is to find resilience gaps BEFORE production traffic does. Every external boundary must declare its timeout, retry policy, circuit breaker, idempotency contract, and degradation path.

## 2026 Best Practices (Specialized category)

- **Every external call has a timeout** — no default-infinite waits. An unbounded call is a resource leak waiting to fire. Distinguish *attempt timeout* (one try) from *overall timeout* (full pipeline including retries). Polly v8 made this distinction explicit; treat both as required.
- **Retry only idempotent operations** — retrying a non-idempotent write doubles charges, double-sends emails, double-creates orders. Either the operation is idempotent by construction (PUT, DELETE-by-id) or it carries an idempotency key the server deduplicates against. **No idempotency key = no retry.**
- **Never retry on 4xx** — client errors are caller bugs; retrying makes the bug louder, not fixed. Retry only on 5xx, 408, 429 (respect Retry-After), and transport-level failures (connection refused, DNS, TLS timeout).
- **Backoff MUST have jitter** — exponential backoff without jitter synchronizes retries from N clients into thundering herds at t, 2t, 4t. Full jitter (random in `[0, cap]`) or decorrelated jitter is the modern default. 3–5 retries is the standard envelope.
- **Circuit breaker per dependency, not per process** — one slow downstream should not exhaust the calling service. Each dependency gets its own breaker with state (closed/open/half-open), failure threshold, and recovery window. State transitions emit metrics + logs + spans (three-pillar observability).
- **Bulkhead by tenant / dependency / criticality** — isolate thread pools, connection pools, and queue workers so one noisy tenant or one slow dependency cannot starve the rest. Virtual threads (JVM 21+, Resilience4j v3+) collapse the thread-cost argument against fine-grained bulkheads.
- **Idempotency keys on every write** — clients send a UUID per logical request; server stores `(key, response)` for ≥24h and returns the cached response on replay. Foundation for safe retries, webhooks, and replays.
- **DLQ for unprocessable messages** — bounded retry attempts on the main queue, then route to dead-letter for human inspection. Never delete poisonous messages silently. Provide a rate-limited replay tool — releasing 100k DLQ messages at once recreates the outage that filled the DLQ.
- **Graceful shutdown drains in-flight work** — SIGTERM → stop accepting new requests → finish in-flight (bounded by `terminationGracePeriodSeconds`) → close DB / queue / cache → exit. Kubernetes default is 30s; verify your drain fits.
- **Chaos-test before prod** — inject latency, drop packets, kill pods, partition the network in staging. Toxiproxy, Chaos Mesh, Litmus, Gremlin. If you have not tested the failure mode, you do not handle the failure mode.
- **Three-pillar observability tie-in** — every retry attempt, every circuit trip, every DLQ deposit emits a metric (counter / histogram), a structured log line, and a span attribute. Otherwise the system is opaque under stress.
- **Decorator order matters** — `Retry → CircuitBreaker → Timeout → operation` (Polly v8) so retries exhaust within the breaker's failure window, breaker records final outcome, and timeout caps each attempt. Wrong order produces silent misbehavior.
- **Service-mesh resilience is complementary, not a replacement** — Envoy / Istio sidecars give you retry, timeout, circuit breaker, and outlier detection at the network layer. Use them, but the application layer still owns idempotency, DLQs, and business-aware fallbacks. Mesh retries on a non-idempotent write is the same bug, one layer up.

## What to Check

### External Calls
For every external dependency (HTTP API, DB, queue, cache, blob storage, third-party SDK):
- Attempt timeout configured (no infinite waits)?
- Overall timeout configured (caps total retry budget)?
- Retry policy with exponential backoff + jitter?
- Retry confined to idempotent operations / requests carrying idempotency keys?
- Retry excludes 4xx?
- Circuit breaker (per dependency) with failure threshold and recovery window?
- Bulkhead (connection / thread pool isolation)?
- Fallback / cache / degraded path defined when the breaker is open?
- Telemetry emitted on every retry, trip, fallback?

### Async / Queue Boundaries
- Idempotency key on every consumer handler?
- Bounded retry count before DLQ routing?
- DLQ configured AND monitored AND has a replay tool?
- Poison-message detection (parse failure, schema mismatch) → straight to DLQ, not retried?
- Visibility-timeout / lock-renewal correct so long jobs are not redelivered?

### Graceful Shutdown
- SIGTERM / SIGINT handler installed?
- New-request gate flipped on signal?
- In-flight requests drained?
- DB / queue / cache connections closed cleanly?
- Drain budget ≤ orchestrator's terminationGracePeriodSeconds?

### Health Checks
- Liveness (am I deadlocked) and readiness (can I serve) are *separate* endpoints?
- Readiness flips to NOT-READY during shutdown drain so the load balancer stops sending traffic?
- Health checks do NOT cascade dependency health into liveness (one downstream blip should not kill the pod)?

### Chaos Readiness
- Failure injection harness in staging (Toxiproxy / Chaos Mesh / Litmus / Gremlin)?
- Documented experiments: latency injection, dependency kill, network partition, pod kill, disk fill?

## Categories (canonical findings)

| Category | What | Why critical |
|---|---|---|
| `timeout-missing` | External call with no timeout / infinite default | Single slow dependency hangs every worker thread |
| `retry-missing` | No retry on a transient-failure-prone call | One blip = one user-visible 5xx |
| `retry-on-4xx` | Retry policy catches 4xx | Hammers a broken contract; doubles the bug |
| `retry-non-idempotent` | Retry wrapping a non-idempotent write with no idempotency key | Double charges / double sends |
| `backoff-missing` | Retry with fixed delay or none | Tight retry loop, immediate herd |
| `jitter-missing` | Exponential backoff without jitter | Thundering herd at retry boundaries |
| `circuit-missing` | No circuit breaker per dependency | Cascading failures |
| `idempotency-key-missing` | Write endpoint accepts no idempotency key | Cannot safely retry / replay |
| `dlq-missing` | Queue consumer with no DLQ destination | Poison messages either retry forever or vanish |
| `dlq-no-replay` | DLQ exists but no replay tool | Operator dumps messages back unbounded → re-creates outage |
| `bulkhead-missing` | Shared thread / connection pool across tenants or dependencies | One noisy tenant starves everyone |
| `healthcheck-missing` | No liveness or no readiness endpoint | Orchestrator cannot detect bad pods |
| `healthcheck-cascades` | Liveness fails when downstream is unhealthy | Downstream blip kills upstream pod |
| `shutdown-not-graceful` | No SIGTERM handler / no drain | In-flight requests killed mid-flight, queue acks lost |
| `chaos-untested` | No documented failure-injection coverage for this path | Untested failure = unhandled failure |
| `mesh-only-resilience` | Resilience exists only in sidecar; app layer has no idempotency / DLQ / fallback | Mesh retry on non-idempotent op = same bug, network layer |

## Resilience Patterns — BAD / SAFE across 7 languages

### Python 3.12+ (tenacity, httpx-retries, asyncio)

```python
# BAD: infinite hang, no retry, no jitter, no circuit
import requests
def get_user(uid):
    return requests.get(f"https://api.example.com/users/{uid}").json()

# BAD: retry with no jitter, retries 4xx, no idempotency
from tenacity import retry, stop_after_attempt
@retry(stop=stop_after_attempt(5))                # no wait, no jitter, retries on *any* exception
def charge(card_id, amount):
    return requests.post("/charges", json={"card": card_id, "amount": amount}, timeout=5)

# SAFE: attempt+overall timeout, exp backoff with full jitter, retry only on 5xx/transport, idempotency key
import httpx, uuid, random
from tenacity import retry, stop_after_attempt, wait_exponential_jitter, retry_if_exception

def is_retryable(exc):
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {408, 429, 500, 502, 503, 504}
    return isinstance(exc, (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError))

@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential_jitter(initial=0.2, max=5.0, jitter=2.0),
    retry=retry_if_exception(is_retryable),
    reraise=True,
)
def charge(client: httpx.Client, card_id: str, amount: int, idem_key: str):
    r = client.post(
        "/charges",
        json={"card": card_id, "amount": amount},
        headers={"Idempotency-Key": idem_key},
        timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0),
    )
    r.raise_for_status()
    return r.json()
```

### TypeScript / Node 22 (cockatiel, p-retry, AbortSignal.timeout, fetch)

```typescript
// BAD: no timeout, no retry, no circuit
const res = await fetch(`https://api.example.com/users/${id}`);

// BAD: setTimeout race for "timeout" but no abort — request continues in background, leaks
const res = await Promise.race([fetch(url), new Promise((_, r) => setTimeout(() => r("t"), 5000))]);

// SAFE: AbortSignal.timeout + cockatiel pipeline (retry → breaker → timeout) + idempotency key
import { retry, circuitBreaker, ExponentialBackoff, handleWhen, wrap, ConsecutiveBreaker, timeout, TimeoutStrategy } from "cockatiel";
import { randomUUID } from "node:crypto";

// Only retry on errors that are NOT marked nonRetryable (i.e. 5xx / transport)
const handleTransient = handleWhen((e: any) => !e?.nonRetryable);

// wrap() order: first arg is outermost. Retry -> CircuitBreaker -> Timeout (per attempt).
const policy = wrap(
  retry(handleTransient, {
    maxAttempts: 4,
    backoff: new ExponentialBackoff({ initialDelay: 200, maxDelay: 5_000 }),  // cockatiel adds decorrelated jitter
  }),
  circuitBreaker(handleTransient, {
    halfOpenAfter: 30_000,
    breaker: new ConsecutiveBreaker(5),
  }),
  timeout(5_000, TimeoutStrategy.Aggressive),                                 // per attempt
);

export async function charge(cardId: string, amount: number) {
  const idempotencyKey = randomUUID();
  return policy.execute(async ({ signal }) => {
    const res = await fetch("https://api.example.com/charges", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ cardId, amount }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),         // belt + suspenders
    });
    if (res.status >= 500 || res.status === 408 || res.status === 429) {
      throw new Error(`retryable: ${res.status}`);                            // cockatiel retries
    }
    if (!res.ok) {
      const err: any = new Error(`client error: ${res.status}`);
      err.nonRetryable = true;                                                // 4xx, do not retry
      throw err;
    }
    return res.json();
  });
}
```

### C# / .NET 9 (Polly v8 ResiliencePipeline, IHttpClientFactory)

```csharp
// BAD: no timeout, no retry, no circuit, HttpClient new'd up per call (socket exhaustion)
var http = new HttpClient();
var resp = await http.GetAsync($"https://api.example.com/users/{id}");

// BAD: retry policy that catches everything including 4xx, no jitter
services.AddHttpClient("api").AddTransientHttpErrorPolicy(p =>
    p.OrResult(r => !r.IsSuccessStatusCode).WaitAndRetryAsync(5, _ => TimeSpan.FromSeconds(2)));

// SAFE: Microsoft.Extensions.Http.Resilience + Polly v8 pipeline (retry → breaker → timeout)
// dotnet add package Microsoft.Extensions.Http.Resilience
builder.Services.AddHttpClient<PaymentsClient>(c =>
{
    c.BaseAddress = new Uri("https://api.example.com");
    c.Timeout = TimeSpan.FromSeconds(30);   // overall ceiling
})
.AddResilienceHandler("payments", pipeline =>
{
    pipeline
        .AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true,                                              // 2026 default: ON
            Delay = TimeSpan.FromMilliseconds(200),
            ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
                .Handle<HttpRequestException>()
                .HandleResult(r => r.StatusCode is HttpStatusCode.RequestTimeout
                                                or HttpStatusCode.TooManyRequests
                                                or (>= HttpStatusCode.InternalServerError)),
        })
        .AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            SamplingDuration = TimeSpan.FromSeconds(30),
            MinimumThroughput = 10,
            BreakDuration = TimeSpan.FromSeconds(30),
        })
        .AddTimeout(TimeSpan.FromSeconds(5));                              // per attempt
});

public class PaymentsClient(HttpClient http)
{
    public async Task<ChargeResult> ChargeAsync(string cardId, long amount, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "/charges")
        {
            Content = JsonContent.Create(new { cardId, amount }),
        };
        req.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());     // safe to retry
        var resp = await http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<ChargeResult>(ct))!;
    }
}

// SAFE: graceful shutdown drains in-flight (IHostApplicationLifetime)
builder.Services.AddHostedService<DrainHostedService>();
public sealed class DrainHostedService(IHostApplicationLifetime life, ILogger<DrainHostedService> log) : IHostedService
{
    public Task StartAsync(CancellationToken _) {
        life.ApplicationStopping.Register(() => log.LogInformation("SIGTERM — draining"));
        return Task.CompletedTask;
    }
    public Task StopAsync(CancellationToken _) => Task.CompletedTask;
}
// And in csproj or appsettings: ShutdownTimeout fits inside Kubernetes terminationGracePeriodSeconds.
```

### Java 21+ (Resilience4j v3 with virtual threads)

```java
// BAD: blocking call, no timeout, no retry, no breaker, platform thread per request
String body = new URL("https://api.example.com/users/" + id).openConnection().getInputStream()
    .readAllBytes() instanceof byte[] b ? new String(b) : "";

// SAFE: Resilience4j v3 (virtual-thread-aware) — retry → breaker → timeout → call
// Maven: io.github.resilience4j:resilience4j-all:3.x
RetryConfig retryCfg = RetryConfig.custom()
    .maxAttempts(4)
    .intervalFunction(IntervalFunction.ofExponentialRandomBackoff(            // exponential + jitter
        Duration.ofMillis(200), 2.0, 0.5))
    .retryOnException(e -> e instanceof IOException || e instanceof TimeoutException)
    .retryOnResult(r -> r instanceof HttpResponse<?> h
        && (h.statusCode() == 408 || h.statusCode() == 429 || h.statusCode() >= 500))
    .build();

CircuitBreakerConfig breakerCfg = CircuitBreakerConfig.custom()
    .failureRateThreshold(50f)
    .slidingWindow(20, 20, CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
    .waitDurationInOpenState(Duration.ofSeconds(30))
    .build();

TimeLimiterConfig timeoutCfg = TimeLimiterConfig.custom()
    .timeoutDuration(Duration.ofSeconds(5))
    .cancelRunningFuture(true)
    .build();

var registry = CircuitBreakerRegistry.of(breakerCfg);
var breaker  = registry.circuitBreaker("payments-api");
var retry    = Retry.of("payments-api", retryCfg);
var limiter  = TimeLimiter.of(timeoutCfg);

// Virtual-thread executor: cheap to spawn one per request
var vexec = Executors.newVirtualThreadPerTaskExecutor();

public ChargeResult charge(String cardId, long amount) throws Exception {
    String idem = UUID.randomUUID().toString();
    Supplier<ChargeResult> call = () -> httpPost("/charges",
        Map.of("cardId", cardId, "amount", amount),
        Map.of("Idempotency-Key", idem));

    // Decorators applies last-call-outermost: CircuitBreaker is inner, Retry is outer.
    // Retry exhausts attempts; breaker only records the final outcome — the recommended order.
    Supplier<ChargeResult> guarded = Decorators.ofSupplier(call)
        .withCircuitBreaker(breaker)
        .withRetry(retry)                                                     // outermost
        .decorate();

    return limiter.executeFutureSupplier(() ->
        CompletableFuture.supplyAsync(guarded, vexec));
}

// Graceful shutdown: register a JVM hook that drains executor.
Runtime.getRuntime().addShutdownHook(new Thread(() -> {
    vexec.shutdown();
    try { vexec.awaitTermination(25, TimeUnit.SECONDS); }                     // < pod grace period
    catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
}));
```

### C (C17/C23, manual loop with backoff + jitter)

```c
/* BAD: blocking with no timeout, no retry, no backoff */
ssize_t n = recv(fd, buf, sizeof buf, 0);   /* hangs forever on stalled peer */

/* SAFE: socket-level timeout + exponential backoff with full jitter, bounded attempts,
 * retry only on transient errno (EAGAIN, EWOULDBLOCK, ETIMEDOUT, ECONNRESET, EHOSTUNREACH) */
#include <errno.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

static int is_transient(int e) {
    return e == EAGAIN || e == EWOULDBLOCK || e == ETIMEDOUT
        || e == ECONNRESET || e == EHOSTUNREACH || e == ENETUNREACH;
}

static void sleep_ms(unsigned ms) {
    struct timespec ts = { ms / 1000u, (long)(ms % 1000u) * 1000000L };
    nanosleep(&ts, NULL);
}

/* call_remote returns 0 on success, -1 on permanent failure; sets errno */
int call_remote_with_retry(int fd, void *buf, size_t len) {
    /* SO_RCVTIMEO so recv() cannot hang forever */
    struct timeval tv = {.tv_sec = 5, .tv_usec = 0};
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof tv);

    const int max_attempts = 4;
    unsigned base_ms = 200;
    unsigned cap_ms  = 5000;

    for (int attempt = 0; attempt < max_attempts; ++attempt) {
        ssize_t n = recv(fd, buf, len, 0);
        if (n >= 0) return 0;
        if (!is_transient(errno)) return -1;          /* permanent: do not retry */
        unsigned exp = base_ms << attempt;
        if (exp > cap_ms) exp = cap_ms;
        /* full jitter: random in [0, exp] */
        unsigned jittered = (unsigned)((double)exp * ((double)rand() / (double)RAND_MAX));
        sleep_ms(jittered);
    }
    errno = ETIMEDOUT;
    return -1;
}

/* SAFE: SIGTERM handler flips a flag so the accept loop drains */
#include <signal.h>
static volatile sig_atomic_t g_draining = 0;
static void on_sigterm(int sig) { (void)sig; g_draining = 1; }
/* in main(): signal(SIGTERM, on_sigterm); while (!g_draining) { accept_one(); } close_all(); */
```

### C++20/23 (coroutine retry, Boost.Outcome, std::stop_token, std::jthread)

```cpp
// BAD: blocking call, no timeout, no retry — std::future::get hangs
auto r = remote_call();   // returns std::future<Resp>
auto v = r.get();         // forever if peer stalls

// SAFE: coroutine retry helper with exponential + jitter; Outcome models retryable vs permanent
#include <boost/outcome.hpp>
#include <chrono>
#include <coroutine>
#include <random>
#include <stop_token>

namespace outcome = BOOST_OUTCOME_V2_NAMESPACE;
using namespace std::chrono_literals;

enum class Err { Transient, Permanent };
using Result = outcome::result<Response, Err>;

template <class Fn>
task<Result> retry_with_jitter(Fn op, std::stop_token stop) {
    constexpr int kMaxAttempts = 4;
    auto base = 200ms;
    auto cap  = 5s;
    std::mt19937 rng{std::random_device{}()};
    for (int attempt = 0; attempt < kMaxAttempts; ++attempt) {
        if (stop.stop_requested()) co_return Err::Permanent;        // graceful shutdown
        auto r = co_await op();                                     // op has its own per-attempt timeout
        if (r.has_value()) co_return r;
        if (r.error() == Err::Permanent) co_return r;               // do not retry permanent
        auto delay_cap = std::min<std::chrono::milliseconds>(base * (1 << attempt), cap);
        std::uniform_int_distribution<int> dist(0, (int)delay_cap.count());
        co_await async_sleep(std::chrono::milliseconds{dist(rng)}, stop);
    }
    co_return Err::Transient;
}

// SAFE: graceful shutdown via std::jthread + std::stop_source — joins on destruction, no detached threads
class Server {
    std::stop_source stop_src;
    std::jthread acceptor;
public:
    Server() : acceptor([this](std::stop_token st) { accept_loop(st); }) {}
    ~Server() { stop_src.request_stop(); }                          // drains in destructor
    void accept_loop(std::stop_token st) {
        while (!st.stop_requested()) { /* accept, dispatch with per-attempt deadline */ }
    }
};
```

### SQL (NOWAIT, statement_timeout, SAVEPOINT, advisory locks)

```sql
-- BAD: blocking lock with no timeout — one stuck transaction stalls every other
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 42;        -- waits forever
COMMIT;

-- BAD: retrying a non-idempotent UPDATE on serialization failure with no idempotency anchor
-- (PostgreSQL SQLSTATE 40001) — risk of double-debit if the original DID commit but client missed the ack
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE accounts SET balance = balance - 100 WHERE id = 42;
COMMIT;
-- caller blindly retries on 40001 → potential double-debit if commit raced

-- SAFE: statement_timeout + lock_timeout, NOWAIT for opportunistic locks
SET statement_timeout = '5s';
SET lock_timeout      = '2s';
SET idle_in_transaction_session_timeout = '10s';

BEGIN;
SELECT 1 FROM accounts WHERE id = 42 FOR UPDATE NOWAIT;           -- fail fast if locked
UPDATE accounts SET balance = balance - 100 WHERE id = 42;
COMMIT;

-- SAFE: idempotency key column + ON CONFLICT for replayable writes
CREATE TABLE charges (
    id            BIGSERIAL PRIMARY KEY,
    idempotency_key UUID NOT NULL UNIQUE,                          -- the dedupe anchor
    account_id    BIGINT NOT NULL,
    amount        BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Retry-safe insert: second attempt with same key is a no-op returning the original row
INSERT INTO charges (idempotency_key, account_id, amount)
VALUES ($1, $2, $3)
ON CONFLICT (idempotency_key) DO UPDATE
    SET idempotency_key = EXCLUDED.idempotency_key                 -- noop; lets us RETURNING the original
RETURNING id, created_at;

-- SAFE: SAVEPOINT inside a long transaction so a partial failure does not lose the whole tx
BEGIN;
SAVEPOINT before_optional_step;
UPDATE inventory SET qty = qty - 1 WHERE sku = $1 AND qty > 0;
-- if zero rows, roll back to savepoint, continue with other work
COMMIT;

-- SAFE: SKIP LOCKED for queue-style work distribution — bulkhead by row, no thundering herd
SELECT id, payload
FROM job_queue
WHERE state = 'ready'
ORDER BY scheduled_at
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

## Graceful Shutdown (cross-language pattern)

```javascript
// Node.js — drain HTTP server, close DB, finish queue workers, then exit
let draining = false;
function shutdown(signal) {
  if (draining) return;
  draining = true;
  console.log(`[shutdown] received ${signal}, draining...`);
  server.close(async () => {
    try {
      await Promise.race([
        Promise.all([db.end(), queue.close(), redis.quit()]),
        new Promise((_, rej) => setTimeout(() => rej(new Error("drain timeout")), 25_000)),
      ]);
      process.exit(0);
    } catch (e) {
      console.error("[shutdown] forced exit:", e);
      process.exit(1);
    }
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
```

Verify the drain budget is **strictly less than** the orchestrator's `terminationGracePeriodSeconds` (Kubernetes default 30s) so the orchestrator does not SIGKILL mid-drain.

## Output Format

```markdown
## Resilience Report

### External Dependencies
| Dependency | Timeout (attempt / overall) | Retry | Backoff+Jitter | Circuit | Bulkhead | Idempotency | Fallback |
|-----------|-----------------------------|-------|----------------|---------|----------|-------------|----------|
| Payment API   | 5s / 30s | 3x on 5xx/408/429 | exp + full jitter | 50% over 30s | dedicated pool | Idempotency-Key | cache-30s |
| User Service  | none / none | NONE | n/a | NONE | shared | n/a | NONE |
| Postgres      | statement_timeout 5s | retry on 40001 only | exp + jitter | n/a | conn pool 10 | row-version | read replica |
| Redis Cache   | 1s / 1s | 1x | none | per-host | n/a | n/a | stale-served |

### Async Boundaries
| Queue / Topic | Idempotency | Max attempts | DLQ | Replay tool | Poison detection |
|---------------|-------------|--------------|-----|-------------|------------------|
| orders.created | message_id dedupe | 5 | orders.dlq | yes (rate 100/min) | yes (schema reject) |
| webhooks.in    | none           | 10 | none      | n/a               | no               |

### Critical Gaps
1. `timeout-missing` on User Service — calls can hang every worker thread (CWE-400)
2. `circuit-missing` on Payment API — failure cascades to checkout
3. `dlq-missing` on webhooks.in — poison message blocks the whole partition forever
4. `idempotency-key-missing` on POST /charges — retries risk double-charge
5. `jitter-missing` on Payment API retry — synchronized retries from N replicas

### Graceful Shutdown
| Check | Status |
|-------|--------|
| SIGTERM handler | Missing |
| Readiness flip on drain | Missing |
| In-flight drain | Partial — HTTP yes, queue workers no |
| Drain budget ≤ pod grace period | Unknown (drain unbounded) |

### Chaos Readiness
| Experiment | Coverage |
|-----------|----------|
| Latency injection on Payment API | NO |
| Pod kill mid-charge | NO |
| Network partition to Postgres | NO |
| DLQ replay rehearsal | NO |

### Recommendations (priority order)
1. Add timeouts to every external call (start with User Service)
2. Add Polly v8 / Resilience4j / cockatiel pipeline (retry → breaker → timeout) per dependency
3. Add idempotency keys to all POST/PATCH/PUT writes and the consumer-side dedupe table
4. Configure DLQ + replay tool for webhooks.in
5. Add SIGTERM handler with bounded drain (< pod grace period)
6. Stand up a Toxiproxy / Chaos Mesh experiment in staging before next release
```

## Tool Integration (2026)

| Tool | Language / Layer | What it gives you |
|------|------------------|-------------------|
| **Polly v8** (`Microsoft.Extensions.Http.Resilience`) | .NET 8/9 | `ResiliencePipelineBuilder`: retry, circuit breaker, timeout, hedging, fallback, rate-limiter; native IHttpClientFactory + OpenTelemetry; jitter on by default |
| **Resilience4j v3** | JVM 21+ | Retry / CircuitBreaker / Bulkhead / RateLimiter / TimeLimiter; virtual-thread-aware schedulers; per-dependency registries |
| **Hystrix** | JVM (legacy) | Predecessor to Resilience4j; in maintenance mode — do not start new projects on Hystrix |
| **tenacity** | Python 3.12+ | Decorator-based retry with exponential + jitter (`wait_exponential_jitter`), predicates for retryable exceptions |
| **httpx-retries** / `httpx.Timeout(connect, read, write, pool)` | Python | Per-phase timeouts; transport-level retry |
| **cockatiel** | TypeScript / Node | Polly-style policy composition (`wrap(retry, circuitBreaker, timeout)`) — most ergonomic JS option |
| **p-retry** | TypeScript / Node | Lighter retry-only library; pair with `AbortSignal.timeout()` |
| **AbortSignal.timeout() / AbortSignal.any()** | Node 22+ / browsers | Native per-attempt timeouts; replaces the `Promise.race(setTimeout)` anti-pattern |
| **Envoy / Istio** | Service mesh | L7 retry, timeout, circuit breaker, outlier detection at the sidecar — complement, not substitute for app-layer idempotency/DLQ |
| **Linkerd** | Service mesh | Lighter mesh option; similar L7 resilience primitives |
| **Toxiproxy** | Chaos (test) | TCP proxy that injects latency, bandwidth limits, slow close, timeouts — scriptable in CI |
| **Chaos Mesh** | Chaos (k8s) | CRD-driven pod-kill, network partition, IO chaos, time skew |
| **Litmus** | Chaos (k8s) | CNCF chaos framework; experiment catalog and chaos hub |
| **Gremlin** | Chaos (SaaS) | Managed chaos platform — agent-driven attacks across hosts, containers, k8s |
| **OpenTelemetry semconv** | Observability | Standard span attributes for retry counts, breaker state, timeout reasons |

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | `timeout-missing` on synchronous external call; `retry-non-idempotent` on payment write; `dlq-missing` on inbound webhook; `shutdown-not-graceful` losing queue acks | BLOCK release |
| HIGH | `circuit-missing` on a critical dependency; `idempotency-key-missing` on a POST/PATCH write; `jitter-missing` with ≥3 replicas; `healthcheck-cascades` causing pod flapping | BLOCK release |
| MEDIUM | `backoff-missing` (fixed delay used); `bulkhead-missing` (shared pool); `dlq-no-replay` (DLQ exists but no tool) | Fix soon |
| LOW | `chaos-untested` for a non-critical path; mesh-only resilience on an internal-only RPC | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = pattern verified by source read; low = surface match only
engine: resilience-checker
kind: timeout-missing | retry-missing | retry-on-4xx | retry-non-idempotent | backoff-missing | jitter-missing | circuit-missing | idempotency-key-missing | dlq-missing | dlq-no-replay | bulkhead-missing | healthcheck-missing | healthcheck-cascades | shutdown-not-graceful | chaos-untested | mesh-only-resilience
target_file: src/services/payments_client.py
line: 47
dependency_called: "payments-api (POST /charges)"   # the external dep this call addresses
language: python | typescript | csharp | java | c | cpp | sql
suggested_fix: "Wrap in tenacity @retry with wait_exponential_jitter, add Idempotency-Key header, add httpx.Timeout(connect=2,read=5)"
reference: https://learn.microsoft.com/dotnet/core/resilience/http-resilience
```

The integrator uses `confidence` and `kind` to weight findings — a `confidence: low` surface-only match doesn't block phase advancement on its own, but `kind: timeout-missing` on a confirmed external-call site always blocks. Findings tagged `mesh-only-resilience` are informational unless the dep is a write path, in which case they escalate.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
