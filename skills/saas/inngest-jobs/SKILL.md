---
name: inngest-jobs
description: Durable background jobs via Inngest — event-driven, retries with backoff, fan-out, scheduled cron, idempotency.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "background jobs"
  - "inngest"
  - "queue"
  - "scheduled task"
  - "cron job"
  - "async job"
  - "fan out"
  - "durable execution"
  - "workflow engine"
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

> Durable background execution for SaaS apps (Next.js / Hono / Bun / FastAPI / .NET / Spring / Express). Used for dunning emails, scheduled reports, async post-processing, AI agent pipelines.

## Role

You set up Inngest (or an equivalent durable-execution engine) as the background-job substrate: typed events, retries with backoff, fan-out across users, scheduled cron, idempotency, concurrency keys per tenant, dead-letter handling. You assume every step can crash, every external call can double-fire on retry, and every queue is at-least-once.

## 2026 Best Practices

These are the load-bearing rules for any durable-execution system in 2026. They apply whether the engine is Inngest, Temporal, Trigger.dev v3, QStash, AWS Step Functions, or Cloudflare Queues — the engine choices differ but the discipline does not.

- **Every side effect lives inside `step.run` (or the equivalent activity boundary).** A retry replays the function body from the top; only step results are memoised. Anything outside a step runs again on every retry — that is the single largest source of "duplicate email / duplicate charge / duplicate row" incidents.
- **Idempotency at the step boundary, not at the function boundary.** Each step should carry an idempotency key derived from the event id + step name (e.g. `welcome-${event.id}-send`). Use it to dedupe at the external service (Stripe `Idempotency-Key`, Resend custom header) AND in your own DB via a `processed_events` table.
- **Compose long workflows from many small steps.** Each `step.run` is a checkpoint. A 7-step pipeline that fails at step 6 resumes at step 6 — not at step 1. Per Inngest docs every step is retried independently up to its own policy (default 4 retries → 5 total attempts).
- **Filter errors before retrying.** Non-retryable errors (validation failures, 4xx other than 408/429) should throw `NonRetriableError`. Otherwise the engine wastes 5 attempts re-running deterministic failures and floods alert channels.
- **Event-first, not cron-first.** Emit business events (`user/created`, `invoice/paid`); let functions subscribe. Cron is a degenerate event source — use it for true periodic jobs (weekly reports), not for "every 5 min check if X" polling that should be event-driven.
- **Outbox pattern for at-least-once DB→queue handoff.** Write the event row inside the same DB transaction as the business mutation; a separate dispatcher publishes outbox rows to Inngest. Prevents the classic "DB committed, queue send failed → lost event" race.
- **Concurrency key per tenant.** `concurrency: { key: "event.data.tenantId", limit: 5 }` prevents one noisy tenant from starving every other tenant's jobs. Use the same pattern for "max N in-flight per external API key" rate-shaping.
- **Rate-limit fan-out.** Emitting 100K events in a `Promise.all` melts downstream APIs. Use `throttle`, `rateLimit`, and bounded concurrency at the consumer function. Fan-out at the event layer is cheap; the receiver must defend itself.
- **Dead-letter handling for poison messages.** After `retries` exhausted, route to a DLQ event (`*/failed`) — never silently drop. Hook this into Sentry / BetterStack for paging.
- **`step.sleep` not `setTimeout`/cron-for-delay.** Sleep is durable: the function unloads, the engine wakes it at the right wall-clock time. `setTimeout` dies with the serverless invocation.
- **Verify webhook signatures on ingress.** Production Inngest deployments validate `INNGEST_SIGNING_KEY` on the `/api/inngest` route. Treat it like a Stripe webhook secret.
- **Never log secrets inside `step.run` bodies.** Step inputs/outputs are persisted to the execution log — anything in a step argument is recoverable from the dashboard.
- **Hardcoded delays are smell.** `step.sleep("5m")` is fine for product-defined waits ("send dunning 24h after failed payment"). For "wait for external system" prefer `step.waitForEvent`.

### Engine choice (2026)

| Engine | When to pick | Trade-off |
|---|---|---|
| **Inngest** | Typed events, serverless-first, Next.js/Hono/Bun SaaS, minimal ops | Proprietary control plane; SDK open-source, orchestrator hosted |
| **Trigger.dev v3** | Long-running jobs (>15 min serverless cap), open-source self-host (Apache 2.0), TypeScript-first | Dedicated compute model — different mental model from event-driven |
| **Temporal** | Multi-language enterprise workflows (Java/Go/.NET/Python), strict exactly-once semantics, persistent workers | Steep learning curve (workflows / activities / task queues / signals); not native serverless |
| **QStash** | Simple "post message, retry on failure" — no workflow graph | 60s endpoint timeout; no fan-out / no step memoisation |
| **AWS Step Functions** | Already deep on AWS; visual state-machine flows | JSON ASL is verbose; debugging is rough vs. typed SDKs |
| **Cloudflare Queues** | Already on Cloudflare Workers; tight Workers integration | At-least-once, no built-in step memoisation, you build idempotency yourself |

Default recommendation for a typical Next.js / Hono / Bun B2C SaaS: **Inngest**. Default for compute-heavy AI agent pipelines that exceed serverless timeouts: **Trigger.dev v3**. Default for polyglot enterprise: **Temporal**.

## Critical pitfalls (categories)

These are the failure modes the critic looks for in any change touching background jobs.

1. **Side effect outside `step.run`** — causes duplicates on retry. Detect: any `await sendEmail`, `await stripe.*`, `await db.insert` not wrapped in `step.run`.
2. **Missing idempotency key in step** — re-running the step double-charges / double-emails. Detect: external mutation steps without an `Idempotency-Key` header or DB-level dedupe.
3. **No error type filtering on retry** — retries non-retryable validation errors. Detect: `throw new Error(...)` for 4xx-class failures; should be `NonRetriableError`.
4. **Missing concurrency key (storm)** — one tenant can saturate the worker pool. Detect: `concurrency: { limit: N }` without `key`.
5. **No DLQ for poison messages** — after max retries, failure is silent. Detect: no `onFailure` handler and no `*/failed` event route.
6. **Hardcoded delays vs `step.sleep`** — `await new Promise(r => setTimeout(r, 60000))` inside a function body; dies on retry / cold start.
7. **Secrets in step body** — API keys / tokens passed as step arguments end up in the execution log.
8. **Missing webhook signature verification on event ingress** — `/api/inngest` route without `INNGEST_SIGNING_KEY` validation in production.
9. **Infinite retry loops** — `retries: Infinity` or catching+rethrowing-and-incrementing a counter with no terminal condition.
10. **Fan-out without rate-limit** — emitting 100K events in one `Promise.all` overwhelms the consumer / downstream API.
11. **No outbox for DB→queue handoff** — emitting an event after the DB commit risks lost events on crash between the two operations.
12. **Cron used for "every N min poll"** — should be event-driven; cron is for true periodic schedules.

## Language coverage — BAD / SAFE for the durable-function pattern

The same idempotency + step + retry discipline applies across languages. C/C++ is out of scope (no production durable-execution SDK in the Inngest/Temporal ecosystem targets it). SQL appears as the outbox / dedupe layer.

### TypeScript (Inngest TS SDK on Next.js / Hono / Bun)

```typescript
// BAD: side effect outside step.run — retry double-sends the email
export const sendWelcomeBad = inngest.createFunction(
  { id: "send-welcome-bad", retries: 3 },
  { event: "user/created" },
  async ({ event }) => {
    await sendEmail({ to: event.data.email, template: "welcome" }); // duplicated on every retry
    await db.insert(welcomeSent).values({ userId: event.data.userId });
  }
);

// SAFE: every side effect inside step.run, idempotency at the external service,
// outbox-friendly dedupe row, non-retryable error filtering.
import { NonRetriableError } from "inngest";

export const sendWelcome = inngest.createFunction(
  {
    id: "send-welcome",
    retries: 4,                                       // default; explicit for clarity
    concurrency: { key: "event.data.tenantId", limit: 5 },
    rateLimit: { limit: 100, period: "1m" },          // protect Resend
    onFailure: async ({ event, error }) => {
      await inngest.send({ name: "welcome/failed", data: { event, error: error.message } });
    },
  },
  { event: "user/created" },
  async ({ event, step }) => {
    if (!event.data?.userId) throw new NonRetriableError("missing userId");

    const alreadySent = await step.run("check-dedupe", async () => {
      const row = await db.query.welcomeSent.findFirst({
        where: eq(welcomeSent.userId, event.data.userId),
      });
      return Boolean(row);
    });
    if (alreadySent) return { skipped: true };

    await step.run("send-email", async () => {
      await sendEmail({
        to: event.data.email,
        template: "welcome",
        idempotencyKey: `welcome-${event.id}`,        // Resend custom header
      });
    });

    await step.run("mark-sent", async () => {
      await db.insert(welcomeSent)
        .values({ userId: event.data.userId, eventId: event.id })
        .onConflictDoNothing();                       // outbox-style dedupe
    });
  }
);
```

### Python (inngest-py + FastAPI, Python 3.12+)

```python
# BAD: side effect outside step.run — retry double-charges
@inngest_client.create_function(
    fn_id="charge-bad", trigger=inngest.TriggerEvent(event="invoice/created"),
)
async def charge_bad(ctx: inngest.Context) -> None:
    await stripe.Charge.create_async(                 # duplicated on retry
        amount=ctx.event.data["amount"], customer=ctx.event.data["customer"],
    )

# SAFE: step.run + NonRetriableError + Stripe Idempotency-Key derived from event id.
from inngest import NonRetriableError

@inngest_client.create_function(
    fn_id="charge",
    trigger=inngest.TriggerEvent(event="invoice/created"),
    retries=4,
    concurrency=[inngest.Concurrency(key="event.data.tenant_id", limit=5)],
)
async def charge(ctx: inngest.Context) -> None:
    if "amount" not in ctx.event.data:
        raise NonRetriableError("missing amount")

    async def _charge():
        return await stripe.Charge.create_async(
            amount=ctx.event.data["amount"],
            customer=ctx.event.data["customer"],
            idempotency_key=f"charge-{ctx.event.id}",
        )

    await ctx.step.run("charge-stripe", _charge)

    async def _record():
        await db.execute(
            "INSERT INTO charges_processed (event_id) VALUES ($1) ON CONFLICT DO NOTHING",
            ctx.event.id,
        )
    await ctx.step.run("record-charge", _record)
```

### C# / .NET 9 (Temporal.io .NET SDK — Inngest's official SDKs are TS/Python/Go; .NET typically uses Temporal)

```csharp
// BAD: HTTP call lives in the workflow body — workflow replay re-issues the request.
[Workflow]
public class SendWelcomeBad
{
    [WorkflowRun]
    public async Task RunAsync(WelcomeInput input)
    {
        // Workflows must be deterministic — this is replayed on every history rebuild.
        await new HttpClient().PostAsJsonAsync("https://api.resend.com/emails", input);
    }
}

// SAFE: side effects in activities; workflow body is pure orchestration.
[Activity]
public static async Task SendWelcomeEmailAsync(WelcomeInput input)
{
    var http = ActivityServices.HttpClient;
    var req = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails")
    {
        Headers = { { "Idempotency-Key", $"welcome-{input.EventId}" } },
        Content = JsonContent.Create(input),
    };
    var resp = await http.SendAsync(req);
    resp.EnsureSuccessStatusCode();
}

[Workflow]
public class SendWelcome
{
    [WorkflowRun]
    public async Task RunAsync(WelcomeInput input)
    {
        if (string.IsNullOrEmpty(input.UserId))
            throw new ApplicationFailureException("missing userId", nonRetryable: true);

        var opts = new ActivityOptions
        {
            StartToCloseTimeout = TimeSpan.FromMinutes(2),
            RetryPolicy = new()
            {
                MaximumAttempts = 5,
                NonRetryableErrorTypes = { "ValidationException" },
            },
        };
        await Workflow.ExecuteActivityAsync(
            () => SendWelcomeEmailAsync(input), opts);
    }
}
```

### Java 21+ (Temporal Java SDK)

```java
// BAD: side effect in workflow method — replayed every history reconstruction.
public class SendWelcomeBadImpl implements SendWelcomeWorkflow {
    public void send(WelcomeInput input) {
        new EmailClient().sendWelcome(input.email());   // not in an activity → replayed
    }
}

// SAFE: side effects in activities; workflow is deterministic orchestration.
@ActivityInterface
public interface EmailActivities {
    void sendWelcome(WelcomeInput input, String idempotencyKey);
}

public class SendWelcomeImpl implements SendWelcomeWorkflow {
    private final EmailActivities emails = Workflow.newActivityStub(
        EmailActivities.class,
        ActivityOptions.newBuilder()
            .setStartToCloseTimeout(Duration.ofMinutes(2))
            .setRetryOptions(RetryOptions.newBuilder()
                .setMaximumAttempts(5)
                .setDoNotRetry(IllegalArgumentException.class.getName())
                .build())
            .build());

    public void send(WelcomeInput input) {
        if (input.userId() == null) {
            throw ApplicationFailure.newNonRetryableFailure(
                "missing userId", "ValidationException");
        }
        emails.sendWelcome(input, "welcome-" + Workflow.getInfo().getWorkflowId());
    }
}
```

### SQL — outbox pattern + per-event dedupe table

The single most reliable bridge between a DB transaction and an at-least-once queue. Write the outbox row inside the same transaction as the business change; a dispatcher process reads `pending=true` rows and publishes to Inngest, marking them sent.

```sql
-- Dedupe table: every processed event gets a row. UPSERT-on-conflict means
-- a step that runs twice does the same DB write, not a duplicate.
CREATE TABLE processed_events (
  event_id      TEXT        PRIMARY KEY,
  fn_id         TEXT        NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Outbox table: written inside the business transaction.
CREATE TABLE outbox_events (
  id            BIGSERIAL   PRIMARY KEY,
  event_name    TEXT        NOT NULL,
  payload       JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ NULL,
  attempts      INT         NOT NULL DEFAULT 0
);

CREATE INDEX outbox_pending_idx ON outbox_events (created_at)
  WHERE published_at IS NULL;

-- BAD: emit the event AFTER commit — process crashes between commit and send → event lost.
BEGIN;
  INSERT INTO orders (id, user_id, total) VALUES ($1, $2, $3);
COMMIT;
-- (crash here)
-- await inngest.send({ name: "order/created", ... });    -- never runs

-- SAFE: write to outbox inside the same transaction; a separate dispatcher publishes.
BEGIN;
  INSERT INTO orders (id, user_id, total) VALUES ($1, $2, $3);
  INSERT INTO outbox_events (event_name, payload)
    VALUES ('order/created', jsonb_build_object('orderId', $1, 'userId', $2));
COMMIT;
-- Dispatcher loop:
--   SELECT * FROM outbox_events WHERE published_at IS NULL ORDER BY id LIMIT 100;
--   inngest.send(...) → UPDATE outbox_events SET published_at = now() WHERE id = $1;
```

## Implementation pattern (Inngest TS, full picture)

### 1. Install + initialize

```bash
npm install inngest
```

```typescript
// inngest/client.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "yourapp",
  // Production: INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY in env.
});
```

### 2. Webhook handler (signature verification mandatory in prod)

```typescript
// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { sendWelcome } from "@/inngest/functions/welcome";
import { dunning } from "@/inngest/functions/dunning";
import { weeklyReport } from "@/inngest/functions/weekly-report";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendWelcome, dunning, weeklyReport],
  // signingKey is read from INNGEST_SIGNING_KEY — required in production.
});
```

### 3. Scheduled cron (true periodic, not polling)

```typescript
export const weeklyReport = inngest.createFunction(
  { id: "weekly-report" },
  { cron: "0 9 * * MON" },                            // Monday 09:00 UTC
  async ({ step }) => {
    const tenants = await step.run("list-tenants", () =>
      db.query.tenants.findMany({ where: eq(tenants.active, true) })
    );

    // Fan-out: one event per tenant. Each consumer has its own concurrency key.
    await step.run("dispatch", () =>
      Promise.all(tenants.map(t =>
        inngest.send({
          name: "report/send",
          data: { tenantId: t.id },
          // event-level dedupe key — same tenant in the same week = same event id.
          id: `report-${t.id}-${weekStamp(new Date())}`,
        })
      ))
    );
  }
);
```

### 4. Fan-out consumer with concurrency key + DLQ

```typescript
export const sendReport = inngest.createFunction(
  {
    id: "send-report",
    retries: 4,
    concurrency: { key: "event.data.tenantId", limit: 3 },  // per-tenant fairness
    onFailure: async ({ event, error }) => {
      await inngest.send({ name: "report/failed", data: { event, error: error.message } });
    },
  },
  { event: "report/send" },
  async ({ event, step }) => { /* per-tenant logic, all side effects in step.run */ }
);
```

### 5. Failed-payment dunning (Stripe webhook → Inngest with sleep)

```typescript
export const dunning = inngest.createFunction(
  {
    id: "dunning",
    retries: 0,                                       // Stripe Smart Retries handles billing
    onFailure: async ({ event, error }) => {
      await inngest.send({ name: "dunning/failed", data: { event, error: error.message } });
    },
  },
  { event: "billing/payment-failed" },
  async ({ event, step }) => {
    await step.sleep("wait-before-email", "10m");

    await step.run("send-dunning-email", async () => {
      await sendDunningEmail({
        userId: event.data.userId,
        attempt: event.data.retryCount,
        idempotencyKey: `dunning-${event.id}`,
      });
    });
  }
);
```

## CI / local verification

```bash
# Local dev server with signature verification disabled in dev mode.
npx inngest-cli@latest dev

# Test event in dev (placeholder data only — no real PII).
curl -X POST http://localhost:8288/e/test-event \
  -H "Content-Type: application/json" \
  -d '{"name":"user/created","data":{"userId":"placeholder","email":"test@example.invalid","firstName":"T"}}'

# Production health checks belong in your APM (BetterStack / Sentry) — see Tool Integration.
```

## Tool Integration (2026)

| Tool | Role | When |
|---|---|---|
| **Inngest Cloud Dashboard** | Function runs, step-level traces, replay, event browser | Production visibility |
| **Inngest CLI** (`inngest dev`) | Local dev server, function discovery, replay UI on localhost:8288 | Every dev session |
| **Temporal CLI** (`temporal server start-dev` + Temporal UI) | Alternative engine; visual workflow history, signal/query, replay | When choosing Temporal |
| **Trigger.dev CLI** (`npx trigger.dev@latest dev`) | Alternative engine; dedicated-compute job runner | When choosing Trigger.dev v3 |
| **BetterStack** (Logtail / Uptime) | Queue health, failed-job rate alerts, function latency SLOs | Production paging |
| **Sentry** | Failed-job alerts via `onFailure` handler → `Sentry.captureException` | Production paging |
| **PostHog** | Funnel analysis on event-driven flows (signup → activation) — see [[posthog-analytics]] | Product loop |

## Severity reconciliation

These tiers are the **internal triage view** for the human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Side effect outside `step.run` on a charge/email path · missing webhook signature in prod · infinite retry loop · secrets in step args · no outbox where ordering is required | BLOCK |
| HIGH | Missing concurrency key on a fan-out · no DLQ / `onFailure` for production paths · no idempotency key on external mutation · `setTimeout`/`sleep` instead of `step.sleep` | BLOCK |
| MEDIUM | Cron used for short-interval polling instead of event-driven · over-broad retry on validation errors (no `NonRetriableError`) · missing per-tenant concurrency on shared external API | Fix soon |
| LOW | Hardcoded magic delays without comment · function id collisions across env (dev/prod) · unscoped logging inside steps | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>      # fingerprint for dedup
severity: critical                                     # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                        # high = corroborated by another engine or test
engine: inngest-jobs | manual
kind: side_effect_outside_step | missing_idempotency_key | no_error_type_filtering
      | missing_concurrency_key | no_dlq | hardcoded_delay | secret_in_step
      | missing_webhook_signature | infinite_retry_loop | fan_out_unbounded
      | missing_outbox | cron_used_for_polling
target_file: src/inngest/functions/welcome.ts
target_line: 42
function_id: send-welcome                              # the function whose config / body triggers the finding
event_name: user/created                               # event being processed, if applicable
message: "External call outside step.run — duplicate on retry"
suggested_fix: "Wrap sendEmail() in step.run('send-email', async () => { ... }) with idempotencyKey derived from event.id."
reference: https://www.inngest.com/docs/learn/how-functions-are-executed
```

The integrator uses `confidence` to weight findings — a `confidence: low` single-source finding doesn't block phase advancement on its own. `kind` lets the integrator group related findings (e.g. all `missing_idempotency_key` rolls up to one remediation task).

## Sources

- [Inngest — How functions are executed (durable execution)](https://www.inngest.com/docs/learn/how-functions-are-executed)
- [Inngest — Errors & Retries](https://www.inngest.com/docs/guides/error-handling)
- [Inngest — Retries reference](https://www.inngest.com/docs/features/inngest-functions/error-retries/retries)
- [Inngest — Durable workflows use case](https://www.inngest.com/uses/durable-workflows)
- [Inngest — Concurrency](https://www.inngest.com/docs/functions/concurrency)
- [Inngest vs Temporal comparison](https://www.inngest.com/compare-to-temporal)
- [Trigger.dev v3 architecture overview](https://trigger.dev/docs)
- [Temporal — Durable execution concepts](https://docs.temporal.io/concepts)
- [Outbox pattern — practical at-least-once delivery](https://medium.com/@tpriyesh188/the-outbox-pattern-your-key-to-reliable-event-driven-systems-dd78a5c2690e)
- [Fan-out / Fan-in patterns (Dapr docs)](https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-patterns/)

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
