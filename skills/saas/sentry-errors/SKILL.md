---
name: sentry-errors
description: Error monitoring + performance + profiling via Sentry — source maps, environments, alerts, releases, session replay, OTel.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "sentry"
  - "error monitoring"
  - "error tracking"
  - "exception tracking"
  - "source maps"
  - "session replay"
  - "performance monitoring"
  - "profiling"
  - "release tracking"
related_skills:
  - saas/posthog-analytics
  - saas/vercel-deploy
  - specialized/observability-checker
effort_level: medium
model_optimized_for: opus-4-7
model: sonnet
tools: Read, Write, Edit, Bash
---

# Sentry Errors (saas skill)

> Production-grade error monitoring, distributed tracing, and profiling for Next.js / Node / Python / Java / .NET / C++ SaaS. Used by the `saas/b2c-subscription` template and applicable to any backend the Iron Loop ships.

## Role

You set up Sentry so every production error is captured with stack trace, source map, user context, breadcrumbs, and (where licensed) a profile. You wire up release tracking, source-map upload, distributed tracing via OpenTelemetry, and session replay with privacy defaults. Then you make sure the team actually sees the alerts — and that PII never leaves the host.

## The Three Signals

Sentry treats observability as three correlated signals on a single event timeline:

| Signal | What it is | Where it lives | Default sample |
|---|---|---|---|
| **Errors** | Exceptions, unhandled rejections, panics | `Sentry.captureException` | 1.0 (always capture) |
| **Traces** | Distributed spans across services, DB queries, HTTP calls | `tracesSampleRate` | 0.1–0.3 in prod |
| **Profiles** | CPU / wall-clock samples tied to spans (continuous profiling on supported SDKs) | `profilesSampleRate` (legacy) or `profileLifecycle: 'trace'` (continuous) | 0.1–0.2 of traces |

Replays and logs (Sentry Logs, GA on the JS SDK in 2025) are correlated to all three via the same event id.

## 2026 Best Practices

- **One SDK per runtime, current major** — `@sentry/nextjs` (covers Node + edge + browser in a single install), `@sentry/node`, `@sentry/python` (`sentry-sdk[fastapi]`), `sentry-java` / `io.sentry:sentry-spring-boot-starter-jakarta`, `Sentry` (NuGet, .NET 9), `sentry-native` for C/C++. Pin minor; do not float a major.
- **DSN scoped per environment** — separate Sentry project (or at least separate DSN) for `production` / `preview` / `staging` / `development`. Never reuse a prod DSN in CI.
- **Release pinned to git SHA on every deploy** — `release: process.env.VERCEL_GIT_COMMIT_SHA` (or equivalent). Without this, regression alerts and "first seen in release" don't work.
- **Source maps uploaded by the bundler plugin** — `@sentry/nextjs` / `@sentry/vite-plugin` / `@sentry/webpack-plugin` / `@sentry/esbuild-plugin` / `@sentry/rollup-plugin`. The plugin auto-detects the release from CI env vars or `HEAD`. Verify the upload step in CI logs — silent failures are common.
- **`sendDefaultPii: false` until explicit opt-in** — the SDK default still ships some request data. Combine with a `beforeSend` / `beforeSendTransaction` that scrubs `Authorization`, `Cookie`, `Set-Cookie`, request bodies on auth/billing routes, and any custom header that carries a token. Server-side scrubbing in Sentry is the second line; never rely on it alone.
- **Sample rates appropriate to volume** — `tracesSampleRate: 0.1–0.3` in production for typical SaaS, lower (0.01–0.05) for high-volume APIs; **errors always 1.0**. Profiling has two APIs depending on SDK: legacy `profilesSampleRate` (still used by Sentry.NET, Sentry.Java, sentry-native), and the newer continuous-profiling API `profileSessionSampleRate` + `profileLifecycle: 'trace'` on the JS/Node and Python SDKs. Check the SDK's current docs before pinning either name.
- **Session replay opt-in with privacy masking** — `maskAllText: true`, `blockAllMedia: true`, `maskAllInputs: true`. `replaysSessionSampleRate: 0.0–0.1`, `replaysOnErrorSampleRate: 1.0`. Get consent banner approval before enabling for EU/UK/CH traffic.
- **OpenTelemetry-first** — the modern Node / Python / Java / .NET SDKs ship OTel under the hood and auto-instrument it. If you already have OTel instrumentation in the app, do NOT double-instrument: pass `skipOpenTelemetrySetup: true` (Node) / equivalent flag in other SDKs, then attach Sentry's `SentrySpanProcessor` + `SentryPropagator` to your existing tracer provider. Verify on the Sentry Performance tab that each span appears exactly once.
- **`beforeSend` filter for known noise** — drop `ChunkLoadError`, `ResizeObserver loop limit exceeded`, network aborts during navigation, expected 401/403 from auth flows. Filter at the SDK so they don't count against quota.
- **User context after auth, ID only** — `Sentry.setUser({ id: userId })`. No email or display name unless required for a specific debugging session; even then, scope it.
- **Breadcrumbs on important user actions** — `Sentry.addBreadcrumb({ category: 'billing', message: 'checkout_started', data: { plan_id } })`. Breadcrumbs are the difference between "error happened" and "error happened because…".
- **Cron monitoring on every scheduled job** — wrap cron handlers in `Sentry.withMonitor('job-name', fn, { schedule: { type: 'crontab', value: '0 * * * *' } })`. Missed-beat alerts catch the silent failures uptime checks don't.
- **Alerts gated**: new-issue-first-occurrence to Slack, regression to PagerDuty, error-rate-anomaly to email digest. Never alert on every event.

## Categories (instrumentation pitfalls)

The refinement loop emits `severity: critical` on the wire for every finding (per the warnings-are-critical rule). The triage tiers below stay in the report body for prioritization.

- **Missing release tag** — can't tie errors to deploys; regression detection silently broken. Triage: HIGH.
- **Source maps missing or unverified** — production stack traces show `chunk-abc.js:1:48273`. Triage: HIGH.
- **PII not scrubbed in `beforeSend`** — request bodies with passwords, tokens, payment data leave the host. Compliance failure (GDPR Art. 32, PCI DSS 3.4). Triage: CRITICAL.
- **DSN treated as a secret** — the public DSN (`https://<key>@oXXXX.ingest.sentry.io/<project>`) is meant for browser bundles; the auth token (`SENTRY_AUTH_TOKEN`) is the secret. We warn anyway if a DSN is committed to source: it discloses which project you're sending to and lets attackers send junk events. Triage: MEDIUM.
- **`tracesSampleRate: 1.0` in production** — quota exhaustion + bill shock. Default `next-sentry` wizard sets 1.0 in dev; the production override must be explicit. Triage: HIGH.
- **No `beforeSend` filter for known noise** — `ChunkLoadError`, `ResizeObserver`, navigation aborts, browser-extension errors drown signal. Triage: MEDIUM.
- **Missing breadcrumbs on critical flows** — billing, auth, data export errors arrive with no context. Triage: MEDIUM.
- **Session replay without masking** — captures keystrokes including passwords/cards. GDPR + PCI failure. Triage: CRITICAL.
- **Single DSN across environments** — production errors mixed with preview/CI noise. Triage: HIGH.
- **`captureException(err)` swallowing the error** — Sentry records it, but the caller doesn't see the failure. Always re-throw or return a typed error. Triage: HIGH.
- **`sendDefaultPii: true` without consent flow** — auto-captures IP, request headers, user context fields. Triage: HIGH.
- **OTel double-instrumentation** — both Sentry auto-instrument and a separate OTel SDK record spans; traces appear twice, parent-child relations break. Triage: MEDIUM.

## Implementation pattern — TypeScript (Next.js 15, App Router)

### 1. Install

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The wizard creates `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and `instrumentation.ts`. It also patches `next.config.ts` with `withSentryConfig`. Commit all of them.

### 2. Environment

```env
# Public — safe to ship to the client bundle
NEXT_PUBLIC_SENTRY_DSN=https://<public-key>@oXXXXX.ingest.sentry.io/<project-id>

# Secret — required only at build time for source map upload
SENTRY_AUTH_TOKEN=sntrys_xxxxxxxx
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
```

### 3. Server config (BAD / SAFE)

```typescript
// sentry.server.config.ts — BAD
import * as Sentry from "@sentry/nextjs";
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,         // BAD: 100% sampling in prod blows the quota
  sendDefaultPii: true,          // BAD: ships request bodies + IP without scrub
  // BAD: no release, no environment, no beforeSend
});
```

```typescript
// sentry.server.config.ts — SAFE
import * as Sentry from "@sentry/nextjs";

const isProd = process.env.VERCEL_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA,           // tie errors to a deploy
  tracesSampleRate: isProd ? 0.1 : 1.0,
  profileSessionSampleRate: isProd ? 0.1 : 1.0,         // continuous profiling
  profileLifecycle: "trace",
  sendDefaultPii: false,
  ignoreErrors: [
    "ChunkLoadError",
    /Loading chunk \d+ failed/,
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
  ],
  beforeSend(event) {
    // Strip auth + cookies from any captured request
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
      delete event.request.headers["x-api-key"];
    }
    if (event.request?.cookies) delete event.request.cookies;
    // Strip bodies on sensitive routes
    if (event.request?.url?.match(/\/(auth|billing|webhooks)\//)) {
      delete event.request.data;
    }
    return event;
  },
  beforeSendTransaction(transaction) {
    // Drop health-check traces
    if (transaction.transaction === "GET /api/health") return null;
    return transaction;
  },
});
```

### 4. Edge runtime config (Next.js middleware + edge routes)

```typescript
// sentry.edge.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  // Edge runtime: no Node APIs, no profiling, no fs-based integrations
});
```

### 5. Client config + Session Replay (BAD / SAFE)

```typescript
// sentry.client.config.ts — BAD
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations: [
    Sentry.replayIntegration(),     // BAD: default masking = none → captures keystrokes
  ],
  replaysSessionSampleRate: 1.0,    // BAD: replays every session, blows quota
});
```

```typescript
// sentry.client.config.ts — SAFE
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      networkDetailAllowUrls: [],    // do not capture request bodies
    }),
    Sentry.browserTracingIntegration(),
  ],
  replaysSessionSampleRate: 0.0,     // opt-in via consent flow
  replaysOnErrorSampleRate: 1.0,
});
```

### 6. Capture with context

```typescript
import * as Sentry from "@sentry/nextjs";

export async function processPayment(invoice: Invoice) {
  return await Sentry.startSpan(
    { name: "billing.process_payment", op: "billing" },
    async (span) => {
      span?.setAttribute("invoice.id", invoice.id);
      Sentry.addBreadcrumb({
        category: "billing",
        message: "process_payment.start",
        data: { plan_id: invoice.planId },
      });
      try {
        return await stripe.paymentIntents.create(/* ... */);
      } catch (err) {
        Sentry.captureException(err, {
          tags: { feature: "billing" },
          contexts: { invoice: { id: invoice.id, plan: invoice.planId } },
        });
        throw err;                   // re-throw — never swallow
      }
    },
  );
}
```

### 7. Source maps upload — verify it actually happened

`withSentryConfig` in `next.config.ts` injects the bundler plugin. The plugin reads `SENTRY_AUTH_TOKEN` from the build environment and uploads on `next build`. Verify:

```bash
# In your CI build log, look for:
#   [Sentry] Uploaded N artifacts to Sentry
# If you see "Skipped because no auth token", source maps are NOT being uploaded.

# Manual verification post-deploy:
curl -sI https://your-app.com/_next/static/chunks/main-*.js | grep -i sourcemap
# Then check Sentry → Settings → Source Maps for the release.
```

## Implementation pattern — Python (3.12+, FastAPI)

```python
# BAD: no integrations, no release, sendDefaultPii left at SDK default
import sentry_sdk
sentry_sdk.init(dsn=os.environ["SENTRY_DSN"])

# SAFE
import os
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

def _before_send(event, hint):
    # Strip Authorization header from any captured request
    headers = event.get("request", {}).get("headers", {})
    for k in ("authorization", "cookie", "x-api-key"):
        headers.pop(k, None)
    # Drop bodies on auth/billing routes
    url = event.get("request", {}).get("url", "")
    if any(p in url for p in ("/auth/", "/billing/", "/webhooks/")):
        event.get("request", {}).pop("data", None)
    return event

sentry_sdk.init(
    dsn=os.environ["SENTRY_DSN"],
    environment=os.environ.get("APP_ENV", "development"),
    release=os.environ.get("GIT_COMMIT_SHA"),
    traces_sample_rate=0.1 if os.environ.get("APP_ENV") == "production" else 1.0,
    profile_session_sample_rate=0.1,
    profile_lifecycle="trace",
    send_default_pii=False,
    before_send=_before_send,
    integrations=[
        StarletteIntegration(transaction_style="endpoint"),
        FastApiIntegration(transaction_style="endpoint"),
        SqlalchemyIntegration(),
    ],
    ignore_errors=["ClientDisconnect"],
)
```

## Implementation pattern — Java (21+, Spring Boot 3.x)

```yaml
# BAD: application.yml — DSN in repo, no env, no release, default sampling
sentry:
  dsn: https://public-key@oXXXX.ingest.sentry.io/123   # BAD: committed DSN
  traces-sample-rate: 1.0                              # BAD: 100% in prod
  send-default-pii: true                               # BAD: ships PII
```

```yaml
# SAFE: application.yml — env-driven, scoped
sentry:
  dsn: ${SENTRY_DSN}
  environment: ${APP_ENV:development}
  release: ${GIT_COMMIT_SHA:unknown}
  traces-sample-rate: ${SENTRY_TRACES:0.1}
  enable-tracing: true
  send-default-pii: false
  ignored-exceptions-for-type: org.springframework.web.context.request.async.AsyncRequestNotUsableException
  in-app-includes:
    - com.yourorg
```

```java
// SAFE: scrub via BeforeSendCallback
@Configuration
public class SentryConfig {
  @Bean
  public Sentry.OptionsConfiguration<SentryOptions> sentryOptions() {
    return options -> options.setBeforeSend((event, hint) -> {
      var req = event.getRequest();
      if (req != null && req.getHeaders() != null) {
        req.getHeaders().remove("Authorization");
        req.getHeaders().remove("Cookie");
      }
      return event;
    });
  }
}
```

## Implementation pattern — C# (.NET 9, ASP.NET Core)

```csharp
// BAD: Program.cs — defaults, no scrubbing, no release
builder.WebHost.UseSentry(o =>
{
    o.Dsn = "https://public-key@oXXXX.ingest.sentry.io/123";  // BAD: hardcoded
    o.TracesSampleRate = 1.0;                                  // BAD
    o.SendDefaultPii = true;                                   // BAD
});
```

```csharp
// SAFE: Program.cs — env-driven, scrubbed, release-tagged
using Sentry;
using Sentry.Extensibility;

builder.WebHost.UseSentry(o =>
{
    o.Dsn = builder.Configuration["Sentry:Dsn"];     // from env / KeyVault
    o.Environment = builder.Environment.EnvironmentName;
    o.Release = Environment.GetEnvironmentVariable("GIT_COMMIT_SHA");
    o.TracesSampleRate = builder.Environment.IsProduction() ? 0.1 : 1.0;
    o.ProfilesSampleRate = builder.Environment.IsProduction() ? 0.1 : 1.0;
    o.SendDefaultPii = false;
    o.MaxRequestBodySize = RequestSize.None;          // do not capture bodies
    o.AddExceptionFilterForType<OperationCanceledException>();
    o.SetBeforeSend((evt, hint) =>
    {
        if (evt.Request?.Headers != null)
        {
            evt.Request.Headers.Remove("Authorization");
            evt.Request.Headers.Remove("Cookie");
        }
        return evt;
    });
});

// ASP.NET Core middleware — Sentry.AspNetCore auto-registers tracing + breadcrumbs.
// For minimal APIs, attach user context after auth:
app.Use(async (ctx, next) =>
{
    if (ctx.User.Identity?.IsAuthenticated == true)
    {
        SentrySdk.ConfigureScope(s => s.User = new SentryUser
        {
            Id = ctx.User.FindFirst("sub")?.Value,    // ID only, never email
        });
    }
    await next();
});
```

## Implementation pattern — C / C++ (sentry-native)

```c
/* SAFE: sentry-native init for a C++ service */
#include <sentry.h>

int main(void) {
    sentry_options_t *opts = sentry_options_new();
    sentry_options_set_dsn(opts, getenv("SENTRY_DSN"));
    sentry_options_set_environment(opts, getenv("APP_ENV"));
    sentry_options_set_release(opts, getenv("GIT_COMMIT_SHA"));
    sentry_options_set_traces_sample_rate(opts, 0.1);
    sentry_options_set_max_breadcrumbs(opts, 100);
    /* PII off by default in sentry-native; do not enable. */
    sentry_init(opts);

    /* ... app code ... */

    sentry_close();
    return 0;
}
```

For C++ services, the same SDK works — wrap `sentry_capture_event` in your exception translator. Symbol upload (`sentry-cli debug-files upload`) is the equivalent of source-map upload: without it, native stack traces are useless.

## SQL — correlating queries to errors via spans

Sentry does not ingest raw SQL as a separate signal — queries appear as spans on traces. To make them debuggable:

```typescript
// BAD: opaque query, no span attributes
const rows = await db.query("SELECT * FROM invoices WHERE user_id = $1", [userId]);

// SAFE: wrap in a span with op="db.query" and structured attributes
await Sentry.startSpan(
  { name: "SELECT invoices by user", op: "db.query" },
  async (span) => {
    span?.setAttribute("db.system", "postgresql");
    span?.setAttribute("db.statement", "SELECT * FROM invoices WHERE user_id = $1");
    span?.setAttribute("db.user_id", userId);
    return await db.query("SELECT * FROM invoices WHERE user_id = $1", [userId]);
  },
);
```

Auto-instrumentation (Prisma, SQLAlchemy, EF Core, JDBC via OTel) captures `db.statement` automatically — verify the captured statement does not contain inlined PII. If it does, use the `beforeSendTransaction` hook to scrub span attributes or switch the ORM to parameterized-binding mode.

## Tool Integration (2026)

| Tool | Purpose | When |
|---|---|---|
| **`@sentry/cli`** | Release creation, deploy markers, source map / debug-file upload, monitor sync | CI pipeline, every deploy |
| **`@sentry/nextjs` (withSentryConfig)** | Bundles plugin behavior into Next.js build; uploads maps automatically | Next.js apps |
| **`@sentry/vite-plugin`** | Source map upload for Vite (Remix, SvelteKit, Astro) | Any Vite app |
| **`@sentry/webpack-plugin`** | Source map upload for Webpack (CRA legacy, custom builds) | Webpack apps |
| **`@sentry/esbuild-plugin`** / **`@sentry/rollup-plugin`** | Same, for esbuild / Rollup | esbuild / Rollup apps |
| **OTel exporter** (`@sentry/opentelemetry`, `sentry-opentelemetry-agent` for Java, `Sentry.OpenTelemetry` for .NET) | Reuse existing OTel instrumentation; send spans to Sentry | Polyglot stacks already on OTel |
| **Cron Monitoring** (`Sentry.withMonitor` / `sentry-cli monitors run`) | Detect missed scheduled jobs | Every cron / scheduled task |
| **Performance dashboard + Insights** (Sentry web UI) | p75/p95/p99 latency, Web Vitals, slow DB queries, AI module for LLM call traces | Continuous |
| **Release Health** (Sessions API, auto in JS SDK) | Crash-free sessions, adoption % per release | Every deploy |
| **GitHub integration** | Auto-link issues to PRs via commits in release; suspect-commit detection | Setup once |

CI snippet (GitHub Actions example):

```yaml
# .github/workflows/release.yml — uses sentry-cli for release + sourcemap + deploy marker
- uses: getsentry/action-release@v1
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
    SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
  with:
    environment: production
    version: ${{ github.sha }}
    sourcemaps: ./.next/static
    set_commits: auto
```

## Alerts — defaults that don't burn out the on-call

In Sentry Dashboard → Alerts → Create:

- **New issue alert** — `is:unresolved age:-1h` → Slack `#engineering`. First-occurrence only.
- **Regression alert** — previously-resolved issue reopens → Slack + PagerDuty.
- **Error-rate anomaly** — `events > 10/min for 5 min in production` → PagerDuty.
- **Performance regression** — p95 of a critical transaction `> 2× baseline for 10 min` → Slack.
- **Cron miss** — monitor missed beat → PagerDuty.

Mute aggressively. Triage weekly. Snooze noisy issues with an explicit reason.

## CI verification

```bash
# After deploy, fire a synthetic error and verify capture within 60s.
curl -sf "https://your-app.com/api/sentry-test-error" || true

# Verify the release exists on Sentry's side
sentry-cli releases info "$GIT_COMMIT_SHA"

# Verify source maps were uploaded for that release
sentry-cli sourcemaps list "$GIT_COMMIT_SHA"
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used in the human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire. The triage tiers stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | PII captured in events (passwords, payment data); session replay without masking; `sendDefaultPii: true` on auth/billing routes | BLOCK release |
| HIGH | No release tag; no source maps in prod; `tracesSampleRate: 1.0` in prod; single DSN across envs; `captureException` swallows error | BLOCK release |
| MEDIUM | DSN committed to repo; no `beforeSend` noise filter; missing breadcrumbs on critical flows; OTel double-instrumentation | Fix before next deploy |
| LOW | Missing user context after auth; `replaysSessionSampleRate` too high for plan tier; alert routes not configured | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
engine: sentry-errors
kind: missing-release-tag
      | source-maps-missing
      | pii-not-scrubbed
      | dsn-committed
      | sample-rate-too-high
      | no-before-send-filter
      | missing-breadcrumbs
      | replay-no-masking
      | shared-dsn-across-envs
      | exception-swallowed
      | send-default-pii-on
      | otel-double-instrumented
target_file: sentry.server.config.ts
line: 14
suggested_fix: |
  Set release: process.env.VERCEL_GIT_COMMIT_SHA in Sentry.init,
  and configure the bundler plugin's authToken so source maps upload
  on every deploy.
reference: https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/
```

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every Sentry-misconfiguration finding emits as `severity: critical` in the letter to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: missing source maps today is an unreadable post-mortem tomorrow. PII leaked through `beforeSend` today is the compliance incident next quarter.

## Sources

- [Sentry Next.js Manual Setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)
- [Sentry Source Maps (JS)](https://docs.sentry.io/platforms/javascript/sourcemaps/)
- [Sentry Source Maps for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/)
- [Sentry Scrubbing Sensitive Data (JavaScript)](https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/)
- [Sentry Scrubbing Sensitive Data (.NET)](https://docs.sentry.io/platforms/dotnet/data-management/sensitive-data/)
- [Sentry PII and Data Scrubbing (Developer Docs)](https://develop.sentry.dev/backend/application-domains/pii/)
- [Sentry OpenTelemetry Support (Developer Docs)](https://develop.sentry.dev/sdk/telemetry/traces/opentelemetry/)
- [Sentry GitHub Action — Release + Source Map Upload](https://github.com/marketplace/actions/sentry-release)
- [Sentry Vite Plugin](https://www.npmjs.com/package/@sentry/vite-plugin)
- [Sentry Release Automation — GitHub Actions](https://docs.sentry.io/product/releases/setup/release-automation/github-actions/)
