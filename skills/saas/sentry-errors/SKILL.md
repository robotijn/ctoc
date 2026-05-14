---
name: sentry-errors
description: Error monitoring + performance via Sentry — source maps, environments, alerts, releases, session replay.
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
  - "sentry"
  - "error monitoring"
  - "error tracking"
  - "exception tracking"
  - "source maps"
  - "session replay"
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

> Production-grade error monitoring for Next.js / Node SaaS. Used by the `saas/b2c-subscription` template.

## Role

You set up Sentry so every production error is captured with stack trace, source map, user context, and breadcrumbs. Then you make sure the team actually sees the alerts.

## 2026 Best Practices

- **Sentry SDK for the runtime you use** — `@sentry/nextjs` for Next, `@sentry/node` for plain Node, `@sentry/react-native` for Expo.
- **Source maps uploaded on every deploy** — without them, stack traces are unreadable.
- **Environments split** (`production` / `preview` / `development`) so issues are isolated.
- **Releases tagged** with the git SHA so regressions point at a commit.
- **Performance monitoring at 10% sample rate** in production, 100% in preview.
- **User context attached** after auth (`Sentry.setUser({ id: userId })`) so per-customer errors are debuggable.
- **PII redaction on by default** — `sendDefaultPii: false`, scrub request bodies.
- **Slack/email alerts gated** — alert on new-issue-first-occurrence, not every duplicate.

## Implementation pattern

### 1. Install

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The wizard creates `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and a `instrumentation.ts`. Commit them.

### 2. Environment

```env
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...   # for source map upload during build
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
```

### 3. Tune the configs

```typescript
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  sendDefaultPii: false,
  beforeSend(event, hint) {
    // Scrub anything sensitive
    if (event.request?.cookies) delete event.request.cookies;
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }
    return event;
  },
});
```

### 4. Attach user context after auth

```typescript
// app/dashboard/layout.tsx (or middleware)
import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";

const { userId } = await auth();
if (userId) {
  Sentry.setUser({ id: userId });   // ID only — no email/name unless needed
}
```

### 5. Capture custom errors with context

```typescript
import * as Sentry from "@sentry/nextjs";

try {
  await processPayment(invoice);
} catch (err) {
  Sentry.captureException(err, {
    tags: { feature: "billing" },
    extra: { invoice_id: invoice.id },
  });
  throw err;   // re-throw so caller still knows
}
```

### 6. Source maps on every deploy (Vercel auto-uploads with auth token)

The Sentry wizard configures `next.config.ts` with `withSentryConfig`. Vercel's build picks up `SENTRY_AUTH_TOKEN` and uploads source maps automatically.

Verify post-deploy:
```bash
curl -sI https://your-app.com/some-route | grep sentry-release
```

### 7. Slack/email alerts

In Sentry Dashboard → Alerts → Create:
- **New issue alert** — trigger on `is:unresolved` + `first_seen:1h` → Slack #engineering
- **Regression alert** — trigger when previously-resolved issue reopens
- **Error rate alert** — trigger if errors/min > 10 for 5 min consecutive

Don't alert on every event — alert fatigue is real.

### 8. Session replay (optional, GDPR-aware)

```typescript
// sentry.client.config.ts
Sentry.init({
  // ... above settings ...
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,        // GDPR-friendly
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0.1,  // 10% of sessions
  replaysOnErrorSampleRate: 1.0,  // 100% when errors fire
});
```

Get consent for EU users before enabling replay.

## Critical pitfalls

1. **No source maps uploaded** — stack traces show minified `a.js:1:1234`. Useless. Verify with the wizard's check.
2. **PII in error events** — full request body sent to Sentry includes passwords. Always scrub.
3. **Same env across environments** — production errors mixed with preview. Set `environment` explicitly.
4. **Alert spam** — alert on every event = alert fatigue → ignored alerts → missed incidents.
5. **No release tag** — can't tell which commit broke prod. Set `release: VERCEL_GIT_COMMIT_SHA`.
6. **Replay without consent** — GDPR violation in EU. Get consent or disable for EU traffic.

## CI verification

```bash
# After deploy, verify Sentry is receiving events
curl -s "https://your-app.com/api/sentry-test-error"
# Then check Sentry dashboard within 60s for the test event
```

## Sources

- [Sentry Next.js Quickstart](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry source map upload](https://docs.sentry.io/platforms/javascript/sourcemaps/)
- [Sentry alerts best practices](https://docs.sentry.io/product/alerts/best-practices/)
