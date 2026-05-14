---
name: inngest-jobs
description: Durable background jobs via Inngest — event-driven, retries with backoff, fan-out, scheduled cron, idempotency.
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
  - "background jobs"
  - "inngest"
  - "queue"
  - "scheduled task"
  - "cron job"
  - "async job"
  - "fan out"
related_skills:
  - saas/stripe-subscriptions
  - saas/resend-email
  - specialized/resilience-checker
effort_level: medium
model_optimized_for: opus-4-7
model: sonnet
tools: Read, Write, Edit, Bash
---

# Inngest Jobs (saas skill)

> Durable background execution for Next.js SaaS. Used for dunning emails, scheduled reports, async post-processing.

## Role

You set up Inngest as the background-job system: typed events, retries with backoff, fan-out across users, scheduled cron, idempotency keys. No more lost jobs from a redis crash.

## 2026 Best Practices

- **Inngest** for typed, durable, event-driven jobs. Alternative: Trigger.dev.
- **BullMQ** only if you must self-host with Redis.
- **Event-first design** — emit events; functions react. Decouples producers from consumers.
- **Idempotency keys mandatory** for any external-side-effect job (email send, payment).
- **Exponential backoff for retries** — default 3 retries with backoff is fine for most cases.
- **Step pattern for multi-step jobs** — each step is a checkpoint; retries resume from last completed step.
- **Cron at the function level** — don't use OS cron; let Inngest schedule.

## Implementation pattern

### 1. Install + initialize

```bash
npm install inngest
```

```typescript
// inngest/client.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "yourapp",
  // For production: INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY env vars
});
```

### 2. Webhook handler

```typescript
// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { sendWelcomeEmail } from "@/inngest/functions/welcome";
import { sendDunningEmail } from "@/inngest/functions/dunning";
import { weeklyReportCron } from "@/inngest/functions/weekly-report";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendWelcomeEmail, sendDunningEmail, weeklyReportCron],
});
```

### 3. Define a function (event-triggered)

```typescript
// inngest/functions/welcome.ts
import { inngest } from "../client";
import { sendEmail } from "@/lib/email/send";

export const sendWelcomeEmail = inngest.createFunction(
  {
    id: "send-welcome-email",
    retries: 3,
    rateLimit: { limit: 100, period: "1m" },   // protect Resend rate limits
  },
  { event: "user/created" },
  async ({ event, step }) => {
    // Step 1: persist a "welcome_email_sent" flag so we don't double-send on retry
    await step.run("check-not-sent", async () => {
      const sent = await db.query.welcomeEmailSent.findFirst({
        where: eq(welcomeEmailSent.userId, event.data.userId),
      });
      if (sent) throw new Error("Already sent — skip");
    });

    // Step 2: send via Resend
    await step.run("send", async () => {
      await sendEmail({
        to: event.data.email,
        template: "welcome",
        firstName: event.data.firstName,
      });
    });

    // Step 3: mark sent
    await step.run("mark-sent", async () => {
      await db.insert(welcomeEmailSent).values({ userId: event.data.userId });
    });
  }
);
```

### 4. Emit an event

```typescript
// In your signup webhook (Clerk user.created handler)
import { inngest } from "@/inngest/client";

await inngest.send({
  name: "user/created",
  data: { userId, email, firstName },
});
```

### 5. Scheduled cron (no OS cron needed)

```typescript
// inngest/functions/weekly-report.ts
export const weeklyReportCron = inngest.createFunction(
  { id: "weekly-report" },
  { cron: "0 9 * * MON" },   // every Monday at 9 AM UTC
  async ({ step }) => {
    const activeUsers = await step.run("fetch-active-users", () =>
      db.query.users.findMany({ where: eq(users.active, true) })
    );

    // Fan-out: trigger an email per user
    await step.run("dispatch-reports", () =>
      Promise.all(activeUsers.map(u =>
        inngest.send({ name: "report/send", data: { userId: u.id } })
      ))
    );
  }
);
```

### 6. Fan-out pattern

```typescript
// Emit one event per user
await Promise.all(users.map(u =>
  inngest.send({ name: "report/send", data: { userId: u.id } })
));

// Per-user function picks up and processes
export const sendReport = inngest.createFunction(
  { id: "send-report", concurrency: { limit: 10 } },   // max 10 in parallel
  { event: "report/send" },
  async ({ event, step }) => { /* per-user logic */ }
);
```

### 7. Failed-payment dunning (Stripe webhook → Inngest)

```typescript
// In Stripe webhook handler
case 'invoice.payment_failed':
  await inngest.send({
    name: "billing/payment-failed",
    data: { subscriptionId: sub.id, userId, retryCount: invoice.attempt_count },
  });
  break;
```

```typescript
// Function with delay-then-retry
export const dunning = inngest.createFunction(
  { id: "dunning", retries: 0 },   // Stripe Smart Retries handles billing retries; we just email
  { event: "billing/payment-failed" },
  async ({ event, step }) => {
    await step.sleep("wait-before-email", "10m");   // give Stripe a moment

    await step.run("send-dunning-email", () =>
      sendDunningEmail({
        userId: event.data.userId,
        attempt: event.data.retryCount,
      })
    );
  }
);
```

### 8. Idempotency

Inngest doesn't dedupe automatically. Wrap external side effects in a step that checks "already done":

```typescript
await step.run("ensure-once", async () => {
  const idempotencyKey = `welcome-${event.data.userId}`;
  const exists = await redis.get(idempotencyKey);
  if (exists) throw new Error("Already processed");
  await redis.setex(idempotencyKey, 86400, "1");  // 24h
});
```

## Critical pitfalls

1. **External side effect in non-step code** — if your function retries, the email sends twice. Always wrap in `step.run()` + idempotency.
2. **OS cron instead of Inngest cron** — OS cron doesn't survive serverless cold starts and has no retry. Use Inngest.
3. **Unbounded concurrency on fan-out** — fan-out to 100K users without `concurrency: { limit: N }` melts Resend's rate limit.
4. **No retry config** — Inngest defaults to 3 retries; for critical jobs (payment-related), bump higher.
5. **Logging inside step.run** — logs are captured per step; outside, they vanish on retry.
6. **No signing key verification** — production must validate `INNGEST_SIGNING_KEY` on the webhook handler.

## CI verification

```bash
# Local dev: Inngest Dev Server
npx inngest-cli@latest dev

# Test event in dev
curl -X POST http://localhost:8288/e/test-event \
  -H "Content-Type: application/json" \
  -d '{"name":"user/created","data":{"userId":"x","email":"t@e.com","firstName":"T"}}'
```

## Sources

- [Inngest Next.js docs](https://www.inngest.com/docs/sdk/serve)
- [Inngest cron functions](https://www.inngest.com/docs/functions/cron)
- [Inngest concurrency control](https://www.inngest.com/docs/functions/concurrency)
- [Inngest step.run patterns](https://www.inngest.com/docs/functions/steps)
