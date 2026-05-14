---
name: rate-limiting
description: Per-user / per-IP / per-endpoint rate limiting via Upstash Redis sliding window — DoS protection, abuse prevention, fair-share enforcement.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 25000
  max_tool_calls: 20
  max_subagents: 0
when_to_load:
  - "rate limit"
  - "rate limiting"
  - "upstash redis"
  - "DoS protection"
  - "abuse prevention"
  - "throttle"
  - "sliding window"
related_skills:
  - security/security-scanner
  - specialized/resilience-checker
  - saas/inngest-jobs
effort_level: medium
model_optimized_for: opus-4-7
model: sonnet
tools: Read, Write, Edit
---

# Rate Limiting (saas skill)

> Per-user / per-IP / per-endpoint sliding-window rate limits via Upstash Redis. Protects against abuse, bots, brute-force, and accidental DoS.

## Role

You add rate limiting to a SaaS so a runaway client (or a malicious one) can't take down the service. The right limit at the right granularity in the right place.

## 2026 Best Practices

- **Upstash Redis + `@upstash/ratelimit`** — serverless-friendly, sub-millisecond, no idle cost.
- **Sliding window** algorithm — smoother than fixed-window, no edge-of-window bursts.
- **Three granularities**: per-IP (anti-DoS), per-user (fair share), per-endpoint (sensitive routes).
- **Headers on every response**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (RFC standard).
- **429 with `Retry-After` header** when limited — clients can back off correctly.
- **Whitelist for trusted IPs/users** — internal monitoring, payment-webhook IPs.
- **Different limits for free vs paid** tiers — `getLimitForUser(plan)`.

## Implementation pattern

### 1. Install + configure

```bash
npm install @upstash/ratelimit @upstash/redis
```

```env
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

### 2. Create the rate limiter

```typescript
// lib/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Per-IP — DoS protection on signup endpoint
export const signupLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),   // 5 signups per IP per minute
  analytics: true,
  prefix: 'rl:signup',
});

// Per-user — API requests, fair share
export const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),  // 60 req/user/min
  analytics: true,
  prefix: 'rl:api',
});

// Per-endpoint — expensive operations (PDF export, ML calls)
export const expensiveLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),  // 10 per user per hour
  analytics: true,
  prefix: 'rl:expensive',
});

// Plan-tier-aware
export function getLimiterForUser(plan: 'free' | 'pro' | 'team') {
  const limits = {
    free: 30,    // 30 req/min
    pro: 300,   // 300 req/min
    team: 1000, // 1000 req/min
  };
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limits[plan], '1 m'),
    analytics: true,
    prefix: `rl:${plan}`,
  });
}
```

### 3. Apply to a route handler

```typescript
// app/api/expensive-thing/route.ts
import { expensiveLimiter } from '@/lib/ratelimit';
import { auth } from '@clerk/nextjs/server';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('unauthorized', { status: 401 });

  const { success, limit, remaining, reset } = await expensiveLimiter.limit(userId);

  // Always set standard headers
  const headers = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  };

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return new Response('rate limited', {
      status: 429,
      headers: { ...headers, 'Retry-After': String(retryAfter) },
    });
  }

  // ... do the actual work ...
  return Response.json({ ok: true }, { headers });
}
```

### 4. Apply per-IP for unauthenticated endpoints

```typescript
// app/api/signup/route.ts
import { signupLimiter } from '@/lib/ratelimit';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const { success, ...meta } = await signupLimiter.limit(ip);
  if (!success) return new Response('too many signups from this IP', { status: 429 });
  // ... rest ...
}
```

### 5. Plan-tier-aware middleware

```typescript
// middleware.ts (or per-route)
import { getLimiterForUser } from '@/lib/ratelimit';
import { getCurrentSubscription } from '@/lib/subscription';

export async function rateLimitMiddleware(req, userId) {
  const sub = await getCurrentSubscription(userId);
  const limiter = getLimiterForUser(sub?.plan || 'free');
  return limiter.limit(userId);
}
```

### 6. Whitelist for trusted sources

```typescript
const WHITELIST_IPS = new Set([
  // Stripe webhook IPs (from https://stripe.com/docs/ips)
  '54.187.174.169',
  '54.187.205.235',
  // Internal monitoring
  '10.0.0.0/8',
]);

if (WHITELIST_IPS.has(ip)) {
  return { success: true, limit: Infinity, remaining: Infinity, reset: 0 };
}
return signupLimiter.limit(ip);
```

### 7. Brute-force protection on login

```typescript
// app/api/sign-in/route.ts
const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),  // 5 attempts per IP per 15min
  prefix: 'rl:login',
});

// If exceeded, force CAPTCHA or block IP for 1h
```

## Critical pitfalls

1. **Rate-limit key from spoofable header** — using `X-Forwarded-For` directly is risky behind a proxy. Use `req.headers.get('x-vercel-forwarded-for')` on Vercel, or trusted proxy + first-hop IP.
2. **No headers on 429** — clients can't back off intelligently. Always set `Retry-After`.
3. **Same limit for free + paid** — paying customers get throttled like trial users. Plan-tier-aware.
4. **Forgot to whitelist webhooks** — Stripe webhook IP hits the limit and starts retrying → cascade failure.
5. **Fixed-window algorithm** — at window edge, double the burst slips through. Use sliding window.
6. **Limiter for write but not read** — DoS still possible via expensive reads. Limit BOTH.
7. **Rate limit before auth check** — IP-only limit then no per-user limit; cheaper to crack via many accounts. Both layers.

## CI verification

```typescript
describe('Rate limiting', () => {
  it('allows N requests, blocks N+1', async () => {
    for (let i = 0; i < 60; i++) {
      const res = await fetch('/api/test', { headers: authHeaders(user) });
      assert.equal(res.status, 200);
    }
    const blocked = await fetch('/api/test', { headers: authHeaders(user) });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('Retry-After'));
  });

  it('returns rate limit headers on every response', async () => {
    const res = await fetch('/api/test', { headers: authHeaders(user) });
    assert.ok(res.headers.get('X-RateLimit-Remaining'));
  });
});
```

## Sources

- [Upstash Ratelimit](https://github.com/upstash/ratelimit-js)
- [RFC 6585 (429)](https://datatracker.ietf.org/doc/html/rfc6585)
- [Stripe webhook IPs](https://stripe.com/docs/ips)
- [Sliding window rate limit explanation (Cloudflare)](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
