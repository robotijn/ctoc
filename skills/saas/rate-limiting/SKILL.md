---
name: rate-limiting
description: Per-user / per-IP / per-endpoint / per-tenant rate limiting — sliding window, token bucket, IETF RateLimit headers — DoS protection, brute-force defense, fair-share enforcement, noisy-neighbor mitigation.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "rate limit"
  - "rate limiting"
  - "throttle"
  - "throttling"
  - "upstash redis"
  - "bucket4j"
  - "slowapi"
  - "rate-limiter-flexible"
  - "DoS protection"
  - "abuse prevention"
  - "brute force"
  - "sliding window"
  - "token bucket"
  - "leaky bucket"
  - "429"
  - "Retry-After"
  - "noisy neighbor"
related_skills:
  - security/security-scanner
  - security/sast-scanner
  - specialized/resilience-checker
  - saas/inngest-jobs
  - saas/multi-tenancy-row-level
effort_level: medium
model_optimized_for: opus-4-7
model: sonnet
tools: Read, Write, Edit, Grep, Glob
---

# Rate Limiting (saas skill)

> Per-user / per-IP / per-endpoint / per-tenant rate limits. Protects against abuse, bots, brute-force credential attacks, accidental DoS, and noisy-neighbor failure modes on multi-tenant SaaS.
> Auto-loaded when the user prompt matches a `when_to_load` trigger.

## Role

You are a paranoid traffic-shaping engineer. You assume every endpoint can be abused, every client can become hostile, every tenant can become noisy, and every NAT can hide thousands of users behind one IP. Your job is to put the right limit at the right granularity in the right place — and emit the right headers so well-behaved clients can self-throttle.

## 2026 Best Practices

- **Hierarchical limits, not just per-IP.** Layer four scopes: `global` (cluster-wide ceiling) > `per-tenant` (noisy-neighbor cap) > `per-user` (fair share) > `per-IP` (anti-DoS, anti-enumeration). A request fails closed on the first scope it exceeds. Per-IP alone is broken because (a) corporate NAT hides thousands of users behind one IP, and (b) per-IP cannot stop a tenant with valid credentials from starving siblings.
- **IETF `RateLimit` header field on every response** — the IETF httpapi WG draft (`draft-ietf-httpapi-ratelimit-headers`) standardises a single structured `RateLimit` field paired with `RateLimit-Policy`. Implementations during the transition still emit the legacy triple `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` (no `X-` prefix in modern stacks). Emit both during the migration window; clients can self-throttle without ever hitting 429.
- **429 Too Many Requests with `Retry-After`** when rejecting — never 503. 503 means the service is down and triggers cascading retries from clients that assume transient failure. 429 + `Retry-After` (seconds or HTTP-date) means "back off, I'm intentionally refusing you." Per the IETF draft, when both `RateLimit` and `Retry-After` are present, `Retry-After` takes precedence.
- **Sliding window for accurate burst tolerance.** Fixed-window causes thundering-herd at the window boundary (a client gets 2× the limit straddling the edge). Sliding-window log is exact but O(N) memory. Sliding-window counter (the Cloudflare/Upstash variant) approximates with O(1) memory and bounded error; use it as the default.
- **Token bucket when you want controlled burstiness.** Token bucket is better than sliding window for developer-facing APIs where occasional bursts are legitimate (batch jobs, paginated scrapes). Refill rate = sustained throughput; bucket capacity = burst size. Leaky bucket is for **shaping** (queue + drain at fixed rate), not policing.
- **Algorithm selection rule.** Sliding window for public web traffic and abuse mitigation. Token bucket for authenticated developer APIs and SDKs. Leaky bucket for outbound traffic shaping to a downstream you don't want to overrun. Fixed window only if your storage layer cannot do better — its only virtue is implementation cost.
- **Separate read and write limits.** Writes are typically more expensive than reads (DB transaction, cache invalidation, downstream fanout, search-index update). A single limit treats them as equal and either over-throttles reads or under-throttles writes. Define `read_rate` and `write_rate` independently; size each from your own measured per-endpoint cost.
- **Aggressive limits on auth endpoints.** `/login`, `/signup`, `/reset-password`, `/verify-email`, `/oauth/token` — these are brute-force surfaces. Per-IP and per-account limits both, with exponential lockout. CWE-307 (improper restriction of authentication attempts) is one of the most exploited weaknesses on the internet; treat missing rate limits here as `severity: critical`.
- **Per-endpoint limits for expensive operations.** PDF export, ML inference, full-text search across large corpora, transcoding, AI completions, mass-email send. Each gets its own bucket sized to actual cost. A single user kicking off ten concurrent PDF exports must not be permitted because their global per-user limit is 60 req/min.
- **Distributed state via Redis or equivalent — never in-memory on multi-instance.** A `Map<userId, count>` in process memory on three Kubernetes pods enforces 3× the intended limit because each pod counts independently. Use Redis (with Lua scripts for atomic INCR + EXPIRE), Upstash for serverless, or a sticky-session load balancer (last-resort and fragile).
- **Atomic increment + TTL or it's wrong.** Naive `INCR + EXPIRE` has a race: if INCR returns 1 and the process dies before EXPIRE, the key never expires. Either use Redis 7+'s `SET ... EX` semantics or a Lua script that does both atomically. `redis-cell` exposes `CL.THROTTLE` which does the right thing in one round trip.
- **TTL on every rate-limit key.** A user who hits the endpoint once and never returns must not occupy RAM forever. TTL = window size (sliding/fixed) or `bucket_capacity / refill_rate` (token bucket).
- **Exemption for trusted internal traffic.** Webhook IPs from your payment provider (Stripe publishes theirs), monitoring probes, internal mTLS-authenticated services, JWT-claim-based bypass (`{"rl_bypass": true}` signed by an internal CA only). NOT a static IP allowlist editable by web devs — that becomes a backdoor.
- **Exemption for legitimate retries.** A client doing exponential backoff after a 429 must not be re-penalised. Use idempotency keys to deduplicate retried requests so they don't double-count against the limit. Honor `X-Idempotency-Key` headers per RFC standard idempotency patterns.
- **Distinct error semantics.** 429 from rate limit ≠ 503 from outage ≠ 402 from quota exhaustion (paid plan limit hit). A client library cannot recover correctly if you conflate them. Reserve 429 for "back off and retry," and 402 / structured error for "you've used your monthly allotment, upgrade."
- **Fail open on rate-limit infra failure — except for security endpoints.** If Redis is down, a public read endpoint should serve traffic (degraded) rather than reject everything. But `/login` must fail closed: a missing rate limiter on auth = unlimited brute force. Configure `fail_strategy` per endpoint.
- **Observability is non-negotiable.** Emit a metric on every limited request: `rate_limit_hits{scope, endpoint, tenant_id}`. Alert when any single tenant or IP hits sustained limit. This is also the signal that catches integration partners about to break the API.
- **Cost-based limiting for AI endpoints.** A request that triggers a long-context LLM call (e.g. 4K tokens) costs proportionally more than a short one (e.g. 40 tokens) — both for compute and for vendor billing. Charge tokens/cost against the bucket, not request count. Per-tenant token budget per minute is the right unit; request count is the wrong unit.

## Algorithm choice (decision matrix)

| Algorithm | Memory | Accuracy | Burst handling | When to use |
|---|---|---|---|---|
| **Fixed window** | O(1) per key | Poor (2× boundary burst) | None | Storage cannot do better; non-security limits |
| **Sliding window log** | O(N) per key, N=window count | Exact | Exact | Hard limits where exactness matters; low-volume keys |
| **Sliding window counter** | O(1) per key | Bounded error (<0.003%) | Smooth | **Default for web traffic.** Cloudflare / Upstash use this |
| **Token bucket** | O(1) per key | Exact | Configurable burst | Developer APIs, SDK clients, controlled burstiness |
| **Leaky bucket (queue)** | O(capacity) per key | Exact | Smoothing, not policing | Outbound shaping, downstream protection |

Source: see Sources section — Cloudflare, Arcjet, Upstash, redis.io rate-limiter tutorials.

## Common vulnerabilities & patterns (BAD / SAFE)

### 1. Missing rate limit on auth endpoint — CWE-307 — `severity: critical`

```python
# BAD (FastAPI): no limiter — unlimited password-spray brute force
@app.post("/login")
async def login(creds: LoginIn):
    user = await authenticate(creds.email, creds.password)
    if not user: raise HTTPException(401)
    return {"token": issue_jwt(user)}

# SAFE (FastAPI + slowapi): per-IP AND per-account, aggressive
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address,
                  storage_uri="redis://redis:6379")

@app.post("/login")
@limiter.limit("5/minute", key_func=lambda r: f"login_ip:{get_remote_address(r)}")
@limiter.limit("10/hour",  key_func=lambda r, body=Body(...): f"login_acct:{body.email.lower()}")
async def login(request: Request, body: LoginIn):
    user = await authenticate(body.email, body.password)
    if not user: raise HTTPException(401)
    return {"token": issue_jwt(user)}
```

### 2. Per-IP only — NAT / corporate proxy abuse — `severity: high`

```typescript
// BAD: a single corporate NAT (10k employees behind one egress IP) gets throttled to 60 req/min total
const { success } = await ratelimit.limit(req.headers['x-forwarded-for']);

// SAFE: layered scopes — per-IP for anonymous, per-user for authenticated, per-tenant for B2B SaaS
const ip   = getTrustedClientIp(req);          // see "trusted IP extraction" below
const user = await auth(req);                   // null for anonymous

const scopes = user
  ? [`user:${user.id}`, `tenant:${user.tenantId}`]
  : [`ip:${ip}`];

for (const scope of scopes) {
  const { success, limit, remaining, reset } = await rl(scope).limit(scope);
  if (!success) return rateLimited(reset, limit, remaining);
}
```

### 3. No per-tenant limit — noisy neighbor — `severity: high`

```typescript
// BAD: tenant A's runaway script consumes the entire global limit; tenants B–Z see 429s
await globalLimiter.limit('global');

// SAFE: per-tenant cap below the global ceiling — one tenant can never starve siblings
const tenantBudget = await tenantLimiter.limit(`tenant:${user.tenantId}`);
if (!tenantBudget.success) return rateLimited(...);
const globalBudget = await globalLimiter.limit('global');
if (!globalBudget.success) return rateLimited(...);
```

### 4. Wrong status code — 503 instead of 429 — `severity: medium`

```python
# BAD: 503 triggers client retry storms (clients assume transient outage)
if hit_limit:
    return Response(status_code=503, content="Service Unavailable")

# SAFE: 429 with Retry-After — well-behaved clients back off
if hit_limit:
    retry_after = math.ceil((reset_at - time.time()))
    return Response(
        status_code=429,
        headers={
            "Retry-After": str(retry_after),
            "RateLimit": f"\"default\";r={remaining};t={retry_after}",   # IETF draft
            "RateLimit-Policy": f"\"default\";q={limit};w={window_seconds}",
            "RateLimit-Limit": str(limit),         # legacy compat
            "RateLimit-Remaining": str(remaining),
            "RateLimit-Reset": str(retry_after),
        },
    )
```

### 5. Missing rate-limit headers — clients can't back off — `severity: medium`

```csharp
// BAD: .NET 9 minimal API — no headers on 429
app.UseRateLimiter();   // default RejectionStatusCode = 429, no headers populated

// SAFE: configure OnRejected to populate IETF + legacy headers
builder.Services.AddRateLimiter(opts => {
    opts.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    opts.OnRejected = async (ctx, ct) => {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry)) {
            var s = (int)retry.TotalSeconds;
            ctx.HttpContext.Response.Headers.RetryAfter = s.ToString();
            ctx.HttpContext.Response.Headers["RateLimit"] = $"\"default\";r=0;t={s}";
        }
        await ctx.HttpContext.Response.WriteAsync("Rate limit exceeded.", ct);
    };
    opts.AddSlidingWindowLimiter("api", o => {
        o.PermitLimit = 60; o.Window = TimeSpan.FromMinutes(1); o.SegmentsPerWindow = 6;
    });
});
```

### 6. In-memory limiter on multi-instance deployment — `severity: high`

```javascript
// BAD: Map<userId, count> in process memory. With 3 pods, real limit = 3 × configured.
const counts = new Map();
function check(userId) {
  const n = (counts.get(userId) ?? 0) + 1;
  counts.set(userId, n);
  return n <= 60;
}

// SAFE: rate-limiter-flexible + Redis (works across pods; atomic via Lua)
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';

const redis = new Redis({ enableOfflineQueue: false });
const rl = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:api',
  points: 60,
  duration: 60,
  blockDuration: 60,
  // CRITICAL: fail-open or fail-closed by endpoint sensitivity
  insuranceLimiter: new RateLimiterMemory({ points: 60, duration: 60 }), // fallback if Redis down
});

try {
  await rl.consume(userId);
} catch (rej) {
  res.set('Retry-After', String(Math.ceil(rej.msBeforeNext / 1000)));
  return res.status(429).send('Too Many Requests');
}
```

### 7. Fixed window — thundering herd at window edge — `severity: medium`

```java
// BAD (Bucket4j): "60 per minute" with refillIntervally at the top of each minute
//   At 11:59:30 a client uses all 60 tokens. At 12:00:00 the bucket refills.
//   In a 1-second span (11:59:59 → 12:00:01) the client sends 120 requests — 2× burst.
Bandwidth limit = Bandwidth.classic(60, Refill.intervally(60, Duration.ofMinutes(1)));

// SAFE: greedy refill — tokens are added continuously, smoothing bursts
Bandwidth limit = Bandwidth.classic(60, Refill.greedy(60, Duration.ofMinutes(1)));
Bucket bucket = Bucket.builder().addLimit(limit).build();

if (!bucket.tryConsume(1)) {
    response.setStatus(429);
    response.setHeader("Retry-After",
        String.valueOf(bucket.estimateAbilityToConsume(1).getNanosToWaitForRefill() / 1_000_000_000));
}
```

### 8. Trusting `X-Forwarded-For` blindly — IP spoofing — `severity: high`

```typescript
// BAD: attacker sends "X-Forwarded-For: 1.1.1.1" — gets a fresh bucket on every request
const ip = req.headers['x-forwarded-for'];

// SAFE: trust only the immediate proxy hop you control
//   Vercel: x-vercel-forwarded-for (signed by Vercel edge)
//   Cloudflare: cf-connecting-ip (set by CF, others stripped)
//   Behind your own LB: take the LAST IP from X-Forwarded-For (the one your LB added)
function getTrustedClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',').pop()!.trim();  // last hop = your LB; trust it
  return 'unknown';
}
```

### 9. No exemption for legitimate retries — `severity: medium`

```typescript
// BAD: client retries with exponential backoff after 429; each retry counts again, deepening the rate-limit hole
await rl.consume(userId);

// SAFE: deduplicate idempotent retries by idempotency key (last 5 min)
const idem = req.headers.get('x-idempotency-key');
if (idem) {
  const seen = await redis.set(`idem:${userId}:${idem}`, '1', 'NX', 'EX', 300);
  if (seen === null) {
    // duplicate retry of an earlier request — don't double-charge
    return replayCachedResponse(idem);
  }
}
await rl.consume(userId);
```

### 10. Missing observability — `severity: low` (but compounds every other issue)

```typescript
// BAD: silently rate-limits with no signal
if (!success) return res.status(429).end();

// SAFE: emit a metric, log the partition, sample on sustained pressure
if (!success) {
  metrics.increment('rate_limit_hits', { scope, endpoint: req.url, tenant_id: user?.tenantId });
  if (await redis.incr(`rl:burn:${scope}`) > 100) {
    logger.warn({ scope, endpoint: req.url }, 'sustained rate-limit burn — investigate');
  }
  return res.status(429)
    .set('Retry-After', String(retryAfter))
    .end();
}
```

## Language coverage — BAD / SAFE patterns

### TypeScript / Node — Upstash Ratelimit (Next.js middleware)

```typescript
// SAFE: Next.js 15 middleware — layered per-IP + per-user + per-tenant
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const ipLimiter = new Ratelimit({
  redis, prefix: 'rl:ip',
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  analytics: true,
});
const userLimiter = new Ratelimit({
  redis, prefix: 'rl:user',
  limiter: Ratelimit.slidingWindow(600, '1 m'),
  analytics: true,
});
const tenantLimiter = new Ratelimit({
  redis, prefix: 'rl:tenant',
  // tenant cap below the cluster ceiling — noisy neighbor protection
  limiter: Ratelimit.tokenBucket(3000, '1 m', 6000),
  analytics: true,
});

export async function middleware(req: NextRequest) {
  const ip = req.headers.get('cf-connecting-ip')
          ?? req.headers.get('x-vercel-forwarded-for')
          ?? 'unknown';
  const userId   = req.headers.get('x-user-id');   // populated by upstream auth
  const tenantId = req.headers.get('x-tenant-id');

  const checks = [['ip', ip, ipLimiter]] as const;
  // ... add user / tenant checks when present ...

  for (const [scope, key, limiter] of checks) {
    const r = await limiter.limit(key);
    if (!r.success) {
      const retryAfter = Math.ceil((r.reset - Date.now()) / 1000);
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'RateLimit': `"${scope}";r=${r.remaining};t=${retryAfter}`,
          'RateLimit-Policy': `"${scope}";q=${r.limit};w=60`,
          'RateLimit-Limit': String(r.limit),
          'RateLimit-Remaining': String(r.remaining),
          'RateLimit-Reset': String(retryAfter),
        },
      });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
```

```typescript
// SAFE alt: rate-limiter-flexible (long-running Node server, not edge)
import { RateLimiterRedis, RateLimiterUnion } from 'rate-limiter-flexible';
import Redis from 'ioredis';
const redis = new Redis({ enableOfflineQueue: false });

const perIp     = new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl:ip',     points: 100,  duration: 60 });
const perUser   = new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl:user',   points: 600,  duration: 60 });
const perTenant = new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl:tenant', points: 3000, duration: 60 });

app.use(async (req, res, next) => {
  try {
    await Promise.all([
      perIp.consume(req.trustedIp),
      req.user     ? perUser.consume(req.user.id)         : Promise.resolve(),
      req.tenantId ? perTenant.consume(req.tenantId)      : Promise.resolve(),
    ]);
    next();
  } catch (rej: any) {
    res.set('Retry-After', String(Math.ceil(rej.msBeforeNext / 1000)));
    res.status(429).json({ error: 'rate_limit_exceeded' });
  }
});
```

### Python — slowapi (FastAPI) + django-ratelimit (Django)

```python
# BAD (FastAPI): no limiter at all
@app.post("/api/expensive")
async def run(payload: Payload):
    return await heavy_compute(payload)

# SAFE (FastAPI + slowapi, Redis-backed): per-user + per-tenant, IETF headers
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

def key_user_or_ip(request):
    return f"user:{request.state.user_id}" if getattr(request.state, "user_id", None) \
        else f"ip:{request.client.host}"

limiter = Limiter(
    key_func=key_user_or_ip,
    storage_uri="redis://redis:6379/0",
    strategy="moving-window",       # sliding-window log
    headers_enabled=True,           # emits RateLimit-* headers
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

@app.post("/api/expensive")
@limiter.limit("10/hour")             # per user
@limiter.limit("100/minute",          # per tenant — fair share across users
               key_func=lambda r: f"tenant:{r.state.tenant_id}")
async def run(request: Request, payload: Payload):
    return await heavy_compute(payload)
```

```python
# SAFE (Django): per-account brute-force lockout on login
from django_ratelimit.decorators import ratelimit
from django.http import HttpResponse

@ratelimit(key='ip',                          block=False, rate='5/m')
@ratelimit(key='post:email', method='POST',   block=False, rate='10/h')
def login_view(request):
    if getattr(request, 'limited', False):
        resp = HttpResponse('Too Many Requests', status=429)
        resp['Retry-After'] = '60'
        return resp
    return _do_login(request)
```

### Java (Spring Boot 3.x, Java 21) — Bucket4j + Redisson

```java
// BAD: in-memory bucket on multi-instance deployment
private final Bucket bucket = Bucket.builder()
    .addLimit(Bandwidth.classic(60, Refill.greedy(60, Duration.ofMinutes(1))))
    .build();
// → 3 pods enforce 3 × 60 = 180/min

// SAFE: distributed bucket via Redisson, per-tenant + per-user, with IETF headers
@Configuration
class RateLimitConfig {
    @Bean
    ProxyManager<String> proxyManager(RedissonClient redisson) {
        return Bucket4jRedisson.casBasedBuilder(redisson).build();
    }
}

@Component
@RequiredArgsConstructor
class RateLimitFilter extends OncePerRequestFilter {
    private final ProxyManager<String> buckets;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        var userId   = (String) req.getAttribute("userId");
        var tenantId = (String) req.getAttribute("tenantId");

        for (var scope : List.of(
            new Scope("user:"   + userId,   60,   Duration.ofMinutes(1)),
            new Scope("tenant:" + tenantId, 3000, Duration.ofMinutes(1)))) {

            var bucket = buckets.builder().build(scope.key, () ->
                BucketConfiguration.builder()
                    .addLimit(Bandwidth.classic(scope.cap, Refill.greedy(scope.cap, scope.window)))
                    .build());

            ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
            res.setHeader("RateLimit-Limit",     String.valueOf(scope.cap));
            res.setHeader("RateLimit-Remaining", String.valueOf(probe.getRemainingTokens()));

            if (!probe.isConsumed()) {
                long retry = TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill());
                res.setStatus(429);
                res.setHeader("Retry-After", String.valueOf(retry));
                res.setHeader("RateLimit",   "\"" + scope.key + "\";r=0;t=" + retry);
                return;
            }
        }
        chain.doFilter(req, res);
    }
    record Scope(String key, long cap, Duration window) {}
}
```

### C# / .NET 9 — built-in `RateLimiter` API (partitioned)

```csharp
// SAFE: built-in RateLimiter, partitioned per-tenant + per-user; sliding window
// Microsoft.AspNetCore.RateLimiting (.NET 9)
builder.Services.AddRateLimiter(opts => {
    opts.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    opts.OnRejected = async (ctx, ct) => {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry)) {
            var s = (int)retry.TotalSeconds;
            ctx.HttpContext.Response.Headers.RetryAfter = s.ToString();
            ctx.HttpContext.Response.Headers["RateLimit"] = $"\"default\";r=0;t={s}";
            ctx.HttpContext.Response.Headers["RateLimit-Policy"] = $"\"default\";q=60;w=60";
        }
        await ctx.HttpContext.Response.WriteAsync("Rate limit exceeded.", ct);
    };

    // Per-user (authenticated) / per-IP (anonymous)
    opts.AddPolicy("user-or-ip", ctx => {
        var key = ctx.User.Identity?.IsAuthenticated == true
            ? $"user:{ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)}"
            : $"ip:{ctx.Connection.RemoteIpAddress}";
        return RateLimitPartition.GetSlidingWindowLimiter(key, _ => new SlidingWindowRateLimiterOptions {
            PermitLimit = 60, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6,
            QueueLimit = 0,
        });
    });

    // Per-tenant — noisy-neighbor cap
    opts.AddPolicy("tenant", ctx => {
        var tid = ctx.Request.Headers["X-Tenant-Id"].ToString();
        return RateLimitPartition.GetTokenBucketLimiter($"tenant:{tid}", _ => new TokenBucketRateLimiterOptions {
            TokenLimit = 6000, ReplenishmentPeriod = TimeSpan.FromSeconds(10), TokensPerPeriod = 1000,
            AutoReplenishment = true, QueueLimit = 0,
        });
    });
});

app.UseRateLimiter();
app.MapPost("/api/expensive", () => ProcessAsync())
   .RequireRateLimiting("user-or-ip")
   .RequireRateLimiting("tenant");

// Distributed cross-instance: RateLimiter is in-process. For multi-pod, either pin
// sessions or use AspNetCoreRateLimit with Redis (Microsoft does not yet ship a
// distributed RateLimiter implementation).
```

### SQL — transactional counters with `ON CONFLICT` (Postgres)

When you have no Redis and your traffic is low-to-medium, a Postgres-backed limiter is correct, atomic, and durable.

```sql
-- BAD: read-then-write race — two concurrent requests both see count=59, both increment to 60, both pass
SELECT count FROM rate_limits WHERE key = 'user:42' AND window_start = date_trunc('minute', now());
UPDATE rate_limits SET count = count + 1 WHERE key = 'user:42' AND window_start = date_trunc('minute', now());
-- (Real limit silently doubled under contention.)

-- SAFE: atomic UPSERT — single statement, no race
INSERT INTO rate_limits (key, window_start, count)
VALUES ('user:42', date_trunc('minute', now()), 1)
ON CONFLICT (key, window_start)
DO UPDATE SET count = rate_limits.count + 1
RETURNING count;
-- Application: reject if RETURNING count > limit.

-- SAFE: schema with TTL via partitioning or pg_cron sweep
CREATE TABLE rate_limits (
    key          TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count        BIGINT      NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
);
-- Sweep stale rows hourly (pg_cron):
--   DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
```

```sql
-- SAFE: sliding-window-log via append + count (more accurate, more storage)
CREATE TABLE rate_events (
    key        TEXT        NOT NULL,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON rate_events (key, ts);

-- On request:
WITH inserted AS (
    INSERT INTO rate_events (key) VALUES ('user:42') RETURNING ts
)
SELECT count(*) FROM rate_events
 WHERE key = 'user:42' AND ts > now() - interval '1 minute';
-- Reject if count > limit. Periodically: DELETE FROM rate_events WHERE ts < now() - '1 hour'.
```

### C / C++

**Skip.** Rate limiting at the application layer of typical C/C++ services (game servers, embedded brokers, native gateways) is dominated by upstream infrastructure (NGINX `limit_req`, Envoy `rate-limit-service`, OS-level `iptables -m limit`). A C/C++ application that genuinely needs in-process limiting should embed redis-cell or `libhiredis` + a Lua script — neither produces a stable, copy-paste-safe BAD/SAFE pair under our protocol's verifiability rule. Defer to the infrastructure section below.

## Tool integration (2026)

| Tool | Language / runtime | Strengths | When |
|---|---|---|---|
| **Upstash Ratelimit** (`@upstash/ratelimit`) | TS/JS, Python | Serverless-first, HTTP-based (no connection pool), sliding-window + token-bucket built in, multi-region | Vercel / Cloudflare / Netlify / edge runtimes |
| **rate-limiter-flexible** | Node.js | Pluggable backends (Redis/Valkey/Memcached/Postgres/Mongo/Memory), atomic Lua, insurance limiter | Long-running Node servers (Express, Fastify, NestJS) |
| **Bucket4j** + Redisson / `bucket4j-redis` | Java/Kotlin | Token bucket, distributed via Redis-CAS, Spring Boot starter, JCache integration | Spring Boot / Quarkus / Micronaut |
| **.NET `Microsoft.AspNetCore.RateLimiting`** | C# / .NET 9 | Built-in, partitioned, four algorithms (fixed, sliding, token bucket, concurrency), in-process only | ASP.NET Core 7+; single-instance or sticky-session deployments |
| **AspNetCoreRateLimit** + Redis | C# / .NET | Distributed across pods (the .NET built-in is in-process) | Multi-instance ASP.NET Core |
| **slowapi** | Python | FastAPI / Starlette, Redis-backed, sliding-window-log, IETF headers built in | Python web APIs |
| **django-ratelimit** | Python / Django | Per-view decorator, Redis or memcache backend, group-key support | Django apps |
| **Redis + redis-cell** | Any (Redis module) | `CL.THROTTLE` — GCRA (generic cell rate algorithm), atomic, one round trip | Any backend that can speak Redis |
| **NGINX `limit_req`** | Edge / reverse proxy | Leaky bucket at the edge, kernel-fast, zero app cost | First line of defence, anti-DoS |
| **Envoy `rate-limit-service` (gRPC)** | Service mesh | Global rate limiting via separate RLS service, hierarchical descriptors | Istio / Envoy service mesh |
| **Cloudflare Rate Limiting Rules** | CDN / edge | Off your origin entirely, per-cookie / per-IP / per-fingerprint, free tier exists | Public web traffic, anti-bot |
| **AWS WAF / API Gateway throttling** | AWS edge | Per-key, per-method, account-level burst | AWS-native APIs |

**Layering recommendation.** Use edge (Cloudflare / NGINX / WAF) to absorb anonymous DoS *before* your app sees it. Use app-layer (Upstash / Bucket4j / .NET / slowapi) for per-user / per-tenant fairness that requires auth context the edge doesn't have. Don't replace one with the other — the edge layer cannot tell users apart, the app layer cannot afford to see DoS volumes.

## Severity reconciliation

Internal triage tiers for this skill's human-readable scan reports:

| Triage tier | Examples | Action |
|---|---|---|
| CRITICAL | No rate limit on `/login` / `/signup` / `/oauth/token` (brute force); in-memory limiter on multi-instance auth endpoint; rate-limit key from spoofable header on security-sensitive path | BLOCK |
| HIGH | Per-IP only on multi-tenant SaaS (NAT abuse + noisy neighbour); missing per-tenant cap on B2B; trusting `X-Forwarded-For` without proxy chain validation; expensive endpoint shares global user bucket | BLOCK |
| MEDIUM | Wrong status code (503 instead of 429); missing IETF/legacy headers on 429; fixed window where sliding would smooth boundary bursts; no idempotency dedup on retries | Fix soon |
| LOW | No observability metric on limit hits; TTL not set on rate-limit keys (memory leak risk); no cost-based limiting on AI endpoints | Backlog |

**On the wire, every finding emitted to CTO Chief via the refinement loop is `severity: critical`** per the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md). The triage tiers above survive in the report body for prioritisation; the letter's `severity` field is always `critical`.

## Letter schema (refinement-loop output contract)

```yaml
finding_id: <sha256(critic+file+line+kind+endpoint)[:12]>
severity: critical                          # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low             # high = path proven exploitable; low = pattern match only
engine: rate-limiting | manual | semgrep | other
kind:                                       # enumerated
  - missing_limit_on_auth                   # /login, /signup, /reset, /verify, /oauth/token
  - per_ip_only_multi_tenant
  - no_per_tenant_cap
  - in_memory_limiter_multi_instance
  - wrong_status_code                       # 503 instead of 429, 401 instead of 429, etc.
  - missing_rate_limit_headers
  - spoofable_ip_source                     # raw X-Forwarded-For on a security path
  - fixed_window_thundering_herd
  - no_idempotency_dedup
  - no_observability
  - no_ttl_on_key                           # memory leak
  - cost_based_limit_missing                # AI / LLM / expensive endpoint
target_file: src/api/login.ts
target_line: 24
endpoint: POST /api/auth/login              # if route-bound
dimension: per-ip | per-user | per-tenant | per-endpoint | global   # the scope that's missing or wrong
algorithm_observed: none | fixed | sliding_log | sliding_counter | token_bucket | leaky_bucket
algorithm_recommended: sliding_counter | token_bucket | ...
storage_observed: none | in_memory | redis | postgres | upstash | other
storage_recommended: redis | upstash | postgres | redis_cell
suggested_fix: "Apply slowapi @limiter.limit('5/minute') keyed by IP AND 10/hour keyed by email; storage_uri=redis://..."
reference: https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
owasp: A04                                  # Insecure Design (lack of rate limiting)
cwe: CWE-307                                # Improper Restriction of Excessive Authentication Attempts
                                            # also CWE-799, CWE-770 depending on kind
reachable: true | false | unknown           # is there a real request path that hits the endpoint?
delta_to_baseline: new | unchanged | regressed
```

The integrator weights `confidence` × `reachable` to decide blocking: a `confidence: high`, `reachable: true` finding on `/login` blocks Gate 3 unambiguously. A `confidence: low` finding on a deprecated endpoint with `reachable: false` is logged but does not block.

## Sources

- IETF httpapi WG — [`draft-ietf-httpapi-ratelimit-headers`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) (the `RateLimit` + `RateLimit-Policy` structured fields; `Retry-After` precedence rule).
- [Upstash Ratelimit](https://github.com/upstash/ratelimit-js) and [Upstash algorithms reference](https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms) (sliding-window counter, multi-region considerations).
- [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible) (Redis cluster v5+ support, insurance limiter, Lua-atomic).
- [Bucket4j on Redis (INNOQ)](https://www.innoq.com/en/blog/2024/03/distributed-rate-limiting-with-spring-boot-and-redis/), [bucket4j-redis](https://github.com/bucket4j/bucket4j) (token bucket, CAS-based distributed proxy).
- [.NET rate limiting middleware](https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit) (partitioned `RateLimitPartition`, four built-in algorithms).
- [slowapi](https://github.com/laurentS/slowapi) (FastAPI/Starlette, Redis storage URI, `headers_enabled`).
- [django-ratelimit](https://django-ratelimit.readthedocs.io/) (per-key decorator, group-key composition).
- [Cloudflare — counting things, a lot of different things](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/) (sliding-window counter math).
- [Arcjet — Token Bucket vs Sliding Window vs Fixed Window](https://blog.arcjet.com/rate-limiting-algorithms-token-bucket-vs-sliding-window-vs-fixed-window/) (algorithm trade-offs).
- [redis.io — Build 5 Rate Limiters with Redis](https://redis.io/tutorials/howtos/ratelimiting/) (Lua scripts, atomicity).
- [RFC 6585](https://datatracker.ietf.org/doc/html/rfc6585) (429 status code).
- Stripe webhook source IPs — verify the current list at `https://stripe.com/docs/ips` before pinning in an allowlist; the list changes.

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing rate limit on a security-sensitive endpoint, every per-IP-only limit on a multi-tenant API, every in-memory limiter on a multi-instance deployment, and every 503-where-429-was-needed emits as `severity: critical` in the letter to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a missing rate limit today is a credential-stuffing attack, a noisy-neighbor outage, or a runaway-bill incident tomorrow. Code that ships green-without-limits ships with known latent failures.
