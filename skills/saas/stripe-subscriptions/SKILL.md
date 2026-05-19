---
name: stripe-subscriptions
description: Implement Stripe Subscriptions end-to-end — Checkout, Customer Portal, webhook handling, dunning, idempotency, proration, SCA / 3DS, Tax.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "stripe subscriptions"
  - "subscription billing"
  - "stripe checkout"
  - "billing portal"
  - "stripe webhook"
  - "monthly billing"
  - "payment integration"
  - "freemium pricing"
  - "SCA"
  - "3DS"
  - "stripe tax"
related_skills:
  - saas/clerk-auth
  - saas/multi-tenancy-row-level
  - security/secrets-detector
  - security/sast-scanner
effort_level: high
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Edit, Bash, Grep
---

# Stripe Subscriptions (saas skill)

> v8.3 SaaS skill — implementation guide for Stripe Subscriptions across **TypeScript (Next.js 15)**, **C# (.NET 9)**, **Java 21 (Spring Boot)**, and **Python 3.12 (FastAPI/Django)**. Used by the `saas/b2c-subscription` template.

## Role

You implement Stripe Subscriptions correctly the first time: checkout, webhooks with signature verification, idempotency, dunning, plan changes via Customer Portal, SCA-ready 3DS flow, Tax handling. The 2026 pitfalls are all known — encode them in code.

## 2026 Best Practices (SaaS billing)

- **Pin the Stripe API version explicitly.** The current pinned version is **`2026-04-22.dahlia`**. Set it in code (`Stripe.apiVersion = '2026-04-22.dahlia'`) AND in the Dashboard "API version" setting AND on each webhook endpoint. Never let SDK upgrades silently change response shapes — pin and migrate deliberately. Verify the current version at `https://docs.stripe.com/upgrades` before pinning a new project.
- **Webhook signature verification is mandatory** — every webhook MUST go through `stripe.webhooks.constructEvent(body, sig, secret)` (or the SDK equivalent). The raw request body is required; any middleware that JSON-parses the body before signature check breaks verification. Stripe signs with HMAC-SHA256 over `timestamp.payload`; the SDK rejects timestamps older than 5 minutes by default (replay-attack mitigation).
- **Idempotency keys on every mutating API call.** Pass `Idempotency-Key: <uuid>` on `checkout.sessions.create`, `subscriptions.create/update`, `customers.create`, `paymentIntents.create`, refunds, transfers — anything that creates/mutates state. Stripe stores the response for 24h and returns it on retry. Without keys, a network retry after timeout creates a duplicate subscription.
- **Idempotency on webhook side too.** Stripe guarantees at-least-once delivery and retries with exponential backoff for up to 72 hours; the same `event.id` will arrive multiple times. Store `event.id` in a `webhook_events` table with a `UNIQUE` constraint, in the SAME transaction as the business work. If you record-then-fulfill in two transactions, a crash between them double-fulfills on retry.
- **Subscription state lives in your DB, not Stripe.** Recomputing on every request hits rate limits and adds latency. The webhook is the source of truth that keeps your `subscriptions` table in sync. Reads serve from your DB; the Stripe API is for mutations only.
- **Handle every relevant webhook event** — silent dropouts are the #1 cause of churn-by-accident. The minimum event set: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end` (3 days before trial ends — send a heads-up email), `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming` (renewal preview), `payment_intent.requires_action` (3DS challenge needed).
- **Stripe Checkout (hosted) for signup** — PCI scope minimized; less code to maintain; SCA-ready by construction.
- **Customer Portal for plan changes** — let Stripe handle the UI for plan upgrades, downgrades, payment-method updates, invoice history. Don't rebuild it.
- **Smart Retries + dunning emails** — Stripe handles retry cadence (3 attempts over 3 weeks by default); your job is the dunning email content via Resend / SendGrid. Test the full failed-payment path in test mode before launch.
- **Proration is handled by Stripe** — when changing plans mid-cycle, `proration_behavior: 'create_prorations'` (default) computes the credit. Preview via `invoices.retrieveUpcoming` so the UI shows the prorated amount before the user confirms.
- **SCA / 3DS (PSD2)** — Strong Customer Authentication is enforced in the EU/UK and increasingly elsewhere. Stripe Checkout, the Billing API, and PaymentIntents are SCA-ready. For off-session subscription charges, save the payment method with `setup_future_usage: 'off_session'` so the card is authenticated at setup; renewal charges then attempt frictionless 3DS2 first, fall back to challenge if the issuer requires it. Listen for `payment_intent.requires_action` and surface the authentication URL.
- **Tax**: if selling globally, use **Stripe Tax** (enable on Checkout sessions with `automatic_tax: { enabled: true }`) OR a Merchant-of-Record provider like Paddle. Don't compute VAT / GST / sales tax yourself — the rate tables change quarterly per jurisdiction.
- **Hardcoded price IDs are a smell** — use **lookup_keys** (`STRIPE_PRICE_PRO_MONTHLY=pro_monthly`) and resolve at runtime via `prices.list({ lookup_keys: [...] })`. Lets you swap price IDs between test/live without code changes.
- **Test with a real card before launch.** Test-mode cards never trigger real 3DS challenges from issuers, never trigger real declines from issuer risk engines, and never produce real bank statements. Run a $1 live charge end-to-end before flipping the marketing switch.

## Categories of issues this skill flags

| Kind | Why it bites |
|---|---|
| `sig-verification-missing` | Anyone can POST forged events; attacker grants themselves a Pro subscription |
| `sig-verification-after-parse` | Framework parsed JSON before signature check — raw body lost, verification fails OR silently passes on wrong bytes |
| `idempotency-missing-api` | Network retry after timeout creates duplicate subscription / double-charges |
| `idempotency-missing-webhook` | Stripe's at-least-once retry double-fulfills; user gets two "Welcome to Pro" emails and a duplicate row |
| `idempotency-split-transaction` | Event recorded in tx1, business work in tx2 — crash between leaves "fulfilled but not recorded"; next retry duplicates |
| `subscription-state-race` | API call returns stale state while webhook is still in flight; client reads "active" before DB updated |
| `unhandled-event` | `invoice.payment_failed` ignored → silent involuntary churn; `trial_will_end` ignored → users surprised by first charge |
| `test-mode-in-prod` | `sk_test_*` key shipped to prod; live charges silently fail or go to test ledger |
| `live-mode-in-test` | `sk_live_*` in CI — real charges from test runs |
| `hardcoded-price-id` | `price_1ABC...` in source; can't swap test/live; refactor required for every price change |
| `dunning-missing` | `invoice.payment_failed` handler updates DB but sends no email — user doesn't know payment failed |
| `sca-not-handled` | No listener for `payment_intent.requires_action` — EU/UK customers can't complete 3DS challenge → involuntary churn |
| `proration-not-previewed` | Plan change applied without showing user the prorated amount → support tickets |
| `cancel-at-period-end-mishandled` | UI shows "Active" when sub is actually canceling at period end → confused users |
| `metadata-userid-missing` | Subscription event arrives without `userId` metadata; webhook can't map to local user |
| `webhook-slow-handler` | Inline email/ERP sync; >10s response → Stripe marks failed and retries; cascading duplicates |
| `api-version-unpinned` | SDK upgrade silently changes response shape; production breaks at next `npm update` |
| `tax-self-computed` | Hardcoded VAT rate; out-of-date the day it ships |

## Implementation pattern (TypeScript / Next.js 15 — primary)

### 1. Stripe Dashboard setup (before any code)

```
1. Stripe account → activate live mode after legal + banking + tax registration
2. Set Dashboard API version to 2026-04-22.dahlia (Settings → Developers → API version)
3. Products → one Product per tier (Free, Pro, Team)
4. Prices → monthly + annual per product; assign lookup_keys (pro_monthly, pro_annual, team_monthly, ...)
5. Webhooks → Add endpoint https://<domain>/api/stripe/webhook, API version 2026-04-22.dahlia
   Events: checkout.session.completed,
           customer.subscription.{created,updated,deleted,trial_will_end},
           invoice.{paid,payment_failed,upcoming},
           payment_intent.requires_action
6. Customer Portal → Configure (enable plan changes, payment methods, invoice history)
7. Stripe Tax → enable if selling internationally (Settings → Tax)
8. Copy: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (per-endpoint), STRIPE_PUBLISHABLE_KEY
```

### 2. Environment variables (use lookup_keys, not raw price IDs)

```env
STRIPE_SECRET_KEY=sk_live_<REDACTED>
STRIPE_WEBHOOK_SECRET=whsec_<EXAMPLE-NOT-REAL>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_<REDACTED>
STRIPE_API_VERSION=2026-04-22.dahlia

# Use lookup_keys, not price IDs
STRIPE_LOOKUP_PRO_MONTHLY=pro_monthly
STRIPE_LOOKUP_PRO_ANNUAL=pro_annual
```

### 3. Stripe client (single source of truth, pinned version)

```typescript
// lib/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',   // PIN — do not let SDK upgrades change this
  typescript: true,
  appInfo: { name: 'my-saas', version: '1.0.0' },  // shows in Stripe logs for debugging
});
```

### 4. Database schema (Drizzle / Postgres — SQL companion below)

```typescript
// drizzle/schema.ts
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  planId: text('plan_id').notNull(),       // 'free' | 'pro' | 'team' (from lookup_key)
  status: text('status').notNull(),         // 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing'
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
  trialEnd: timestamp('trial_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  // Critical indexes — these are hit on every authenticated request
  userIdx: index('subs_user_idx').on(t.userId),
  customerIdx: index('subs_customer_idx').on(t.stripeCustomerId),
  statusIdx: index('subs_status_idx').on(t.status),
}));

export const webhookEvents = pgTable('webhook_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),    // PK = idempotency
  type: text('type').notNull(),
  apiVersion: text('api_version').notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
});
```

### 5. Checkout (TS — BAD then SAFE)

```typescript
// BAD: no idempotency key, no metadata, hardcoded price ID, no SCA prep, no tax
export async function POST(req: NextRequest) {
  const { priceId } = await req.json();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: 'price_1ABC123HARDCODED', quantity: 1 }],  // hardcoded
    success_url: 'https://example.com/welcome',
    cancel_url: 'https://example.com/pricing',
    // No client_reference_id, no metadata — webhook can't map back to user
  });
  return NextResponse.json({ url: session.url });
}

// SAFE: idempotency key, metadata, lookup_key, SCA-ready, tax enabled
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { lookupKey } = await req.json();   // e.g. 'pro_monthly'
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (prices.data.length === 0) return NextResponse.json({ error: 'invalid plan' }, { status: 400 });

  // Idempotency key — survives client retries
  const idempotencyKey = `checkout:${userId}:${lookupKey}:${crypto.randomUUID()}`;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: prices.data[0].id, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    client_reference_id: userId,
    allow_promotion_codes: true,
    automatic_tax: { enabled: true },          // Stripe Tax — VAT/GST/sales-tax auto
    tax_id_collection: { enabled: true },      // EU B2B VAT ID collection
    billing_address_collection: 'required',    // needed for tax + SCA
    payment_method_collection: 'always',
    subscription_data: {
      metadata: { userId },                    // CRITICAL — webhook uses this to map
      trial_period_days: 14,
      // For off-session renewals, payment method is authenticated now (SCA setup)
    },
    consent_collection: { terms_of_service: 'required' },
  }, { idempotencyKey });

  return NextResponse.json({ url: session.url });
}
```

### 6. Webhook handler (TS — BAD then SAFE — the critical path)

```typescript
// BAD: body parsed before signature check; no idempotency; missing events; inline slow work
export async function POST(req: NextRequest) {
  const body = await req.json();                    // BAD — destroys raw body
  // No signature verification at all
  if (body.type === 'customer.subscription.created') {
    await db.insert(subscriptions).values({ /* ... */ });
    await resend.emails.send({ /* slow — 800ms */ });   // BAD — inline
  }
  return NextResponse.json({ received: true });
}

// SAFE: raw body, signature verified, idempotency in same tx, queue slow work
export const config = { api: { bodyParser: false } };   // App Router: body is raw by default

export async function POST(req: NextRequest) {
  const body = await req.text();                                       // raw bytes
  const sig = (await headers()).get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'no signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    // Log to Sentry — repeated failures may indicate attack or key rotation
    return NextResponse.json({ error: 'signature verification failed' }, { status: 400 });
  }

  // Idempotency + business work in ONE transaction
  try {
    await db.transaction(async (tx) => {
      // INSERT ... ON CONFLICT DO NOTHING — atomic dedup
      const inserted = await tx.insert(webhookEvents).values({
        stripeEventId: event.id,
        type: event.type,
        apiVersion: event.api_version ?? 'unknown',
        payload: event.data.object as object,
      }).onConflictDoNothing().returning();

      if (inserted.length === 0) return;   // duplicate — skip

      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(tx, event.data.object as Stripe.Checkout.Session);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionChange(tx, event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(tx, event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.trial_will_end':
          await enqueueTrialEndingEmail(event.data.object as Stripe.Subscription);
          break;
        case 'invoice.payment_failed':
          await handlePaymentFailed(tx, event.data.object as Stripe.Invoice);
          break;
        case 'invoice.paid':
          await handleInvoicePaid(tx, event.data.object as Stripe.Invoice);
          break;
        case 'payment_intent.requires_action':
          await enqueue3dsChallengeEmail(event.data.object as Stripe.PaymentIntent);
          break;
        default:
          // Unhandled event — log for visibility, but DO NOT 500 (Stripe will retry forever)
          console.warn('Unhandled Stripe event:', event.type);
      }
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    // 500 — Stripe will retry. Log to Sentry/BetterStack.
    console.error('Webhook processing error:', err, 'event:', event.id);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}

async function handleSubscriptionChange(tx: any, sub: Stripe.Subscription) {
  const userId = sub.metadata.userId;
  if (!userId) throw new Error(`subscription ${sub.id} missing userId metadata`);
  const item = sub.items.data[0];
  const planId = item.price.lookup_key ?? item.price.id;

  await tx.insert(subscriptions).values({
    userId,
    stripeCustomerId: sub.customer as string,
    stripeSubscriptionId: sub.id,
    planId,
    status: sub.status,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
  }).onConflictDoUpdate({
    target: subscriptions.stripeSubscriptionId,
    set: {
      planId, status: sub.status,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      updatedAt: new Date(),
    },
  });
}

async function handlePaymentFailed(tx: any, invoice: Stripe.Invoice) {
  const subId = invoice.subscription as string | null;
  if (!subId) return;
  await tx.update(subscriptions)
    .set({ status: 'past_due', updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, subId));
  // Enqueue dunning email (BullMQ / Inngest / QStash) — DO NOT inline
  await enqueueDunningEmail(invoice);
}
```

### 7. Customer Portal (TS — self-serve plan changes)

```typescript
// app/api/stripe/portal/route.ts
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sub = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (sub.length === 0) return NextResponse.json({ error: 'no subscription' }, { status: 404 });

  const session = await stripe.billingPortal.sessions.create({
    customer: sub[0].stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/account`,
  }, { idempotencyKey: `portal:${userId}:${Date.now()}` });

  return NextResponse.json({ url: session.url });
}
```

### 8. Server Action (TS — plan-change preview with proration)

```typescript
// app/account/actions.ts
'use server';
export async function previewPlanChange(newLookupKey: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const sub = await getSubscription(userId);

  const prices = await stripe.prices.list({ lookup_keys: [newLookupKey], active: true, limit: 1 });
  if (!prices.data[0]) throw new Error('invalid plan');

  const upcoming = await stripe.invoices.retrieveUpcoming({
    customer: sub.stripeCustomerId,
    subscription: sub.stripeSubscriptionId,
    subscription_items: [{ id: sub.itemId, price: prices.data[0].id }],
    subscription_proration_behavior: 'create_prorations',
  });

  return {
    amountDue: upcoming.amount_due / 100,
    currency: upcoming.currency,
    prorationDate: upcoming.period_start,
  };
}
```

## Implementation pattern (C# / .NET 9 / ASP.NET Core minimal API)

```csharp
// Program.cs — Stripe client with pinned version
using Stripe;
StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];
StripeConfiguration.ApiVersion = "2026-04-22.dahlia";
```

```csharp
// BAD: no idempotency, no metadata, hardcoded price, body model-bound (raw body lost)
app.MapPost("/api/stripe/checkout", async (CheckoutReq req, IStripeClient stripe) =>
{
    var svc = new SessionService(stripe);
    var s = await svc.CreateAsync(new SessionCreateOptions {
        Mode = "subscription",
        LineItems = [new() { Price = "price_1ABC_HARDCODED", Quantity = 1 }],
        SuccessUrl = "https://example.com/ok",
        CancelUrl  = "https://example.com/no",
    });
    return Results.Ok(new { url = s.Url });
});

// BAD: webhook with no signature verification AND body model-bound destroys raw bytes
app.MapPost("/api/stripe/webhook", async (StripeEvent body, AppDb db) => {
    if (body.Type == "customer.subscription.created") { /* trust the world */ }
    return Results.Ok();
});
```

```csharp
// SAFE checkout: idempotency, metadata, lookup_key, automatic tax
app.MapPost("/api/stripe/checkout",
    [Authorize] async (CheckoutReq req, ClaimsPrincipal user, IStripeClient stripe) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;

    var prices = await new PriceService(stripe).ListAsync(new PriceListOptions {
        LookupKeys = [req.LookupKey], Active = true, Limit = 1,
    });
    if (prices.Data.Count == 0) return Results.BadRequest(new { error = "invalid plan" });

    var opts = new SessionCreateOptions {
        Mode = "subscription",
        LineItems = [new() { Price = prices.Data[0].Id, Quantity = 1 }],
        SuccessUrl = $"{cfg.AppUrl}/welcome?session_id={{CHECKOUT_SESSION_ID}}",
        CancelUrl  = $"{cfg.AppUrl}/pricing",
        ClientReferenceId = userId,
        AllowPromotionCodes = true,
        AutomaticTax = new() { Enabled = true },
        TaxIdCollection = new() { Enabled = true },
        BillingAddressCollection = "required",
        SubscriptionData = new() {
            Metadata = new Dictionary<string, string> { ["userId"] = userId },
            TrialPeriodDays = 14,
        },
    };
    var reqOpts = new RequestOptions {
        IdempotencyKey = $"checkout:{userId}:{req.LookupKey}:{Guid.NewGuid()}",
    };
    var session = await new SessionService(stripe).CreateAsync(opts, reqOpts);
    return Results.Ok(new { url = session.Url });
});
```

```csharp
// SAFE webhook: raw body via PipeReader, signature verified, idempotency + business in one tx
app.MapPost("/api/stripe/webhook", async (HttpContext ctx, AppDb db, IConfiguration cfg) =>
{
    // Read raw body — DO NOT bind to model, that consumes the stream
    using var reader = new StreamReader(ctx.Request.Body);
    var json = await reader.ReadToEndAsync();
    var sig  = ctx.Request.Headers["Stripe-Signature"].ToString();

    Stripe.Event evt;
    try {
        evt = EventUtility.ConstructEvent(json, sig, cfg["Stripe:WebhookSecret"]!,
                                          throwOnApiVersionMismatch: false);
    } catch (StripeException) {
        return Results.BadRequest(new { error = "signature verification failed" });
    }

    // Transaction: dedup + business work atomic
    using var tx = await db.Database.BeginTransactionAsync();
    var existed = await db.WebhookEvents.AnyAsync(w => w.StripeEventId == evt.Id);
    if (existed) { await tx.CommitAsync(); return Results.Ok(new { received = true, duplicate = true }); }

    db.WebhookEvents.Add(new WebhookEvent {
        StripeEventId = evt.Id, Type = evt.Type,
        ApiVersion = evt.ApiVersion, PayloadJson = json,
    });

    switch (evt.Type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
            await HandleSubChange(db, (Subscription)evt.Data.Object); break;
        case "customer.subscription.deleted":
            await HandleSubDeleted(db, (Subscription)evt.Data.Object); break;
        case "customer.subscription.trial_will_end":
            await EnqueueTrialEndingEmail((Subscription)evt.Data.Object); break;
        case "invoice.payment_failed":
            await HandlePaymentFailed(db, (Invoice)evt.Data.Object); break;
        case "invoice.paid":
            await HandleInvoicePaid(db, (Invoice)evt.Data.Object); break;
        case "payment_intent.requires_action":
            await Enqueue3dsChallengeEmail((PaymentIntent)evt.Data.Object); break;
        default:
            // Don't 500 on unknown — Stripe retries forever
            break;
    }
    await db.SaveChangesAsync();
    await tx.CommitAsync();
    return Results.Ok(new { received = true });
});
```

## Implementation pattern (Java 21 / Spring Boot / stripe-java)

```java
// StripeConfig.java
@Configuration
public class StripeConfig {
  @Value("${stripe.secret-key}") private String secretKey;
  @PostConstruct void init() {
    Stripe.apiKey = secretKey;
    Stripe.API_VERSION = "2026-04-22.dahlia";   // PIN
  }
}
```

```java
// BAD: @RequestBody parses JSON → raw body lost; no signature check; hardcoded price
@PostMapping("/api/stripe/webhook")
public ResponseEntity<?> webhookBad(@RequestBody Map<String, Object> payload) {
  // Trust the payload, no signature verification
  return ResponseEntity.ok().build();
}
```

```java
// SAFE checkout
@PostMapping("/api/stripe/checkout")
public ResponseEntity<?> checkout(@AuthenticationPrincipal Jwt jwt, @RequestBody CheckoutReq req)
        throws StripeException {
  String userId = jwt.getSubject();

  PriceListParams plp = PriceListParams.builder()
      .addLookupKey(req.lookupKey()).setActive(true).setLimit(1L).build();
  List<Price> prices = Price.list(plp).getData();
  if (prices.isEmpty()) return ResponseEntity.badRequest().body("invalid plan");

  SessionCreateParams params = SessionCreateParams.builder()
      .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
      .addLineItem(SessionCreateParams.LineItem.builder()
          .setPrice(prices.get(0).getId()).setQuantity(1L).build())
      .setSuccessUrl(appUrl + "/welcome?session_id={CHECKOUT_SESSION_ID}")
      .setCancelUrl(appUrl + "/pricing")
      .setClientReferenceId(userId)
      .setAllowPromotionCodes(true)
      .setAutomaticTax(SessionCreateParams.AutomaticTax.builder().setEnabled(true).build())
      .setBillingAddressCollection(SessionCreateParams.BillingAddressCollection.REQUIRED)
      .setSubscriptionData(SessionCreateParams.SubscriptionData.builder()
          .putMetadata("userId", userId)
          .setTrialPeriodDays(14L)
          .build())
      .build();

  RequestOptions opts = RequestOptions.builder()
      .setIdempotencyKey("checkout:" + userId + ":" + req.lookupKey() + ":" + UUID.randomUUID())
      .build();
  Session session = Session.create(params, opts);
  return ResponseEntity.ok(Map.of("url", session.getUrl()));
}
```

```java
// SAFE webhook — Spring: consume the raw body with @RequestBody String, NOT a POJO
@PostMapping(value = "/api/stripe/webhook", consumes = MediaType.APPLICATION_JSON_VALUE)
@Transactional
public ResponseEntity<?> webhook(
        @RequestBody String payload,
        @RequestHeader("Stripe-Signature") String sigHeader) {
  Event event;
  try {
    event = Webhook.constructEvent(payload, sigHeader, webhookSecret);
  } catch (SignatureVerificationException e) {
    return ResponseEntity.badRequest().body("signature verification failed");
  }

  // Idempotency: rely on UNIQUE constraint on stripe_event_id PK
  if (webhookEventRepo.existsByStripeEventId(event.getId())) {
    return ResponseEntity.ok(Map.of("received", true, "duplicate", true));
  }
  webhookEventRepo.save(new WebhookEventEntity(
      event.getId(), event.getType(), event.getApiVersion(), payload));

  StripeObject obj = event.getDataObjectDeserializer().getObject().orElseThrow();
  switch (event.getType()) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      subService.upsert((Subscription) obj); break;
    case "customer.subscription.deleted":
      subService.markDeleted((Subscription) obj); break;
    case "customer.subscription.trial_will_end":
      emailQueue.enqueueTrialEnding((Subscription) obj); break;
    case "invoice.payment_failed":
      subService.markPastDue((Invoice) obj);
      emailQueue.enqueueDunning((Invoice) obj); break;
    case "invoice.paid":
      subService.recordPayment((Invoice) obj); break;
    case "payment_intent.requires_action":
      emailQueue.enqueue3ds((PaymentIntent) obj); break;
    default: /* unhandled — log but don't 500 */
  }
  return ResponseEntity.ok(Map.of("received", true));
}
```

## Implementation pattern (Python 3.12 / FastAPI / stripe-python)

```python
# config.py
import stripe, os
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
stripe.api_version = "2026-04-22.dahlia"   # PIN
```

```python
# BAD: FastAPI consumes JSON via Pydantic → raw body lost; no signature; inline slow work
@app.post("/api/stripe/webhook")
async def webhook_bad(body: dict):
    if body["type"] == "customer.subscription.created":
        await send_welcome_email(body)        # 800ms inline
    return {"received": True}
```

```python
# SAFE checkout
@app.post("/api/stripe/checkout")
async def checkout(req: CheckoutReq, user=Depends(current_user)):
    prices = stripe.Price.list(lookup_keys=[req.lookup_key], active=True, limit=1)
    if not prices.data:
        raise HTTPException(400, "invalid plan")

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": prices.data[0].id, "quantity": 1}],
        success_url=f"{APP_URL}/welcome?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{APP_URL}/pricing",
        client_reference_id=user.id,
        allow_promotion_codes=True,
        automatic_tax={"enabled": True},
        tax_id_collection={"enabled": True},
        billing_address_collection="required",
        subscription_data={
            "metadata": {"userId": user.id},
            "trial_period_days": 14,
        },
        idempotency_key=f"checkout:{user.id}:{req.lookup_key}:{uuid4()}",
    )
    return {"url": session.url}
```

```python
# SAFE webhook — read raw bytes via Request, verify signature, dedup in DB
@app.post("/api/stripe/webhook")
async def webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()                    # raw bytes — critical
    sig = request.headers.get("stripe-signature")
    if not sig:
        raise HTTPException(400, "missing signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig, os.environ["STRIPE_WEBHOOK_SECRET"])
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "signature verification failed")

    async with db.begin():
        # INSERT ... ON CONFLICT DO NOTHING is the atomic dedup
        result = await db.execute(
            insert(WebhookEvent).values(
                stripe_event_id=event["id"], type=event["type"],
                api_version=event.get("api_version"), payload=dict(event),
            ).on_conflict_do_nothing(index_elements=["stripe_event_id"])
        )
        if result.rowcount == 0:
            return {"received": True, "duplicate": True}

        obj = event["data"]["object"]
        match event["type"]:
            case "customer.subscription.created" | "customer.subscription.updated":
                await upsert_subscription(db, obj)
            case "customer.subscription.deleted":
                await mark_canceled(db, obj)
            case "customer.subscription.trial_will_end":
                await enqueue_trial_ending(obj)            # queue, don't inline
            case "invoice.payment_failed":
                await mark_past_due(db, obj)
                await enqueue_dunning(obj)
            case "invoice.paid":
                await record_payment(db, obj)
            case "payment_intent.requires_action":
                await enqueue_3ds(obj)
            case _:
                pass   # unhandled — log but don't 500

    return {"received": True}
```

## SQL companion (DB schema + idempotency table)

```sql
-- Subscriptions table — denormalized projection of Stripe state, indexed for hot reads
CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id      TEXT NOT NULL,
  stripe_subscription_id  TEXT NOT NULL UNIQUE,
  plan_id                 TEXT NOT NULL,        -- 'free' | 'pro' | 'team' (from lookup_key)
  status                  TEXT NOT NULL,        -- active | past_due | canceled | incomplete | trialing
  current_period_end      TIMESTAMPTZ NOT NULL,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
  trial_end               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes: every authenticated request reads this table
CREATE INDEX subs_user_idx     ON subscriptions(user_id);
CREATE INDEX subs_customer_idx ON subscriptions(stripe_customer_id);
CREATE INDEX subs_status_idx   ON subscriptions(status) WHERE status IN ('past_due', 'incomplete');

-- Webhook event idempotency table — Stripe event.id is the PK
CREATE TABLE webhook_events (
  stripe_event_id  TEXT PRIMARY KEY,             -- PK = atomic dedup
  type             TEXT NOT NULL,
  api_version      TEXT NOT NULL,
  payload          JSONB NOT NULL,
  processed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX webhook_events_type_idx ON webhook_events(type, processed_at DESC);

-- Retention policy: webhook_events grows unbounded. Stripe retries for 72h.
-- Keep 90 days for audit / forensic, then drop.
-- Run nightly: DELETE FROM webhook_events WHERE processed_at < NOW() - INTERVAL '90 days';
```

```sql
-- BAD: no UNIQUE on stripe_subscription_id → upsert races, duplicate rows
CREATE TABLE subscriptions_bad (
  id UUID PRIMARY KEY,
  user_id TEXT,
  stripe_subscription_id TEXT      -- no UNIQUE = race-prone
);
-- BAD: webhook log without PK on event.id → idempotency relies on app-level check, race window
CREATE TABLE webhook_log_bad (
  id BIGSERIAL PRIMARY KEY,
  stripe_event_id TEXT             -- no UNIQUE, no PK on this column
);
```

## Self-critique (v1 → v2 reconciliation)

After drafting v1 the obvious gaps surfaced and were fixed in v2 above:

1. **v1 didn't pin the API version.** Added explicit `stripe.api_version = '2026-04-22.dahlia'` pinning in all four languages + frontmatter on webhook endpoints. Verified the version from `docs.stripe.com/upgrades` search.
2. **v1 conflated webhook idempotency with API idempotency.** Two separate problems with two separate fixes: `Idempotency-Key` header on outbound mutating calls, and `event.id` UNIQUE table for inbound webhooks. v2 covers both with dedicated `kind` values in the letter schema.
3. **v1's webhook handler did dedup-then-business in two transactions.** Race window: crash between insert-event and do-work leaves "fulfilled but not recorded" → next retry double-fulfills. v2 wraps both in one transaction (TS, .NET, Python use `ON CONFLICT DO NOTHING` in-tx; Java relies on JPA `@Transactional` + PK constraint).
4. **v1 didn't cover SCA / 3DS at all.** Added `payment_intent.requires_action` to the event list, `sca-not-handled` finding kind, and `setup_future_usage: 'off_session'` discussion for off-session renewals.
5. **v1 didn't address Stripe Tax.** Added `automatic_tax: { enabled: true }` to all Checkout examples and `tax-self-computed` finding kind.
6. **v1's webhook fell through on unhandled events without logging.** v2 logs unknown events to a warn channel but does NOT 500 — returning 500 makes Stripe retry the event forever, which is worse than dropping it. The right answer: 200 + log + alert if frequency >0.
7. **v1 had inline email send in webhook handler.** Stripe's 10-second timeout means inline `resend.send()` will eventually time out under load and Stripe will retry → duplicate emails. v2 always enqueues to a job system (BullMQ / Inngest / QStash / Sidekiq / SQS).
8. **v1 used hardcoded `price_1ABC...` IDs.** v2 resolves via `lookup_keys` everywhere, with the `hardcoded-price-id` finding kind to catch regressions.
9. **v1 didn't include SQL.** Added the SQL companion section with PK constraints, indexes, and retention policy — these are the things database reviewers ask about.
10. **v1 used a Stripe key in plaintext (`sk_live_...`).** v2 uses `sk_live_<REDACTED>` placeholders per the no-real-keys rule.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when producing a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | sig-verification-missing, idempotency-split-transaction (fulfillment race), test-mode-in-prod, live-mode-in-test, hardcoded `sk_live_*` in source | BLOCK release |
| HIGH | idempotency-missing-api, idempotency-missing-webhook, unhandled `invoice.payment_failed`, sca-not-handled (EU/UK traffic), webhook-slow-handler (>5s p95) | BLOCK release |
| MEDIUM | hardcoded-price-id, dunning-missing, proration-not-previewed, unhandled `trial_will_end`, tax-self-computed, api-version-unpinned | Fix within sprint |
| LOW | cancel-at-period-end UI not surfaced, metadata fields missing for non-critical analytics | Backlog |

## Tool Integration (2026)

| Tool | Use |
|---|---|
| **Stripe CLI** | `stripe listen --forward-to localhost:3000/api/stripe/webhook` for local dev; `stripe trigger customer.subscription.created` / `invoice.payment_failed` / `payment_intent.requires_action` to fire fixture events into your handler. Critical for testing the dedup + dunning + SCA paths without waiting for real card cycles. |
| **Stripe Workbench** | In-Dashboard log/event explorer (replaced the older Logs tab). Inspect every webhook delivery, redeliver from the UI, view request/response. First place to look on a production webhook failure. |
| **ngrok / Cloudflare Tunnel** | For exposing local dev to Stripe webhooks when you want the real Stripe → your-laptop path (not just `stripe listen`). Use ngrok's reserved domains so the URL is stable across restarts. |
| **dotenv-vault / Doppler / Infisical** | Encrypted secret sync. Never commit `sk_live_*` or `whsec_*` to git, even if "private". Rotate keys via the Dashboard, push to the vault, redeploy. |
| **BetterStack / Sentry** | Alert on: webhook signature failures (possible attack OR bad secret rotation), webhook 5xx rate, idempotency conflicts spiking (sign of replay), `invoice.payment_failed` rate spikes (issuer-side problem or your dunning is broken), `payment_intent.requires_action` count by country (EU/UK SCA visibility). |
| **Stripe Sigma / Data Pipeline** | SQL queries over your Stripe data for MRR, churn, cohort analysis. Cheaper than building it yourself; populates the Product Loop KPIs (`free_to_paid_conversion`, `monthly_churn`, `mrr` from `templates/product-kpis.yaml`). |
| **stripe-mock** | Local Stripe API mock for unit tests. Faster than test-mode round-trips, deterministic responses. |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>     # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = code-traced; low = pattern-only
engine: stripe-subscriptions | semgrep | manual
kind: sig-verification-missing                        # see enum below
endpoint: /api/stripe/webhook                         # or .../checkout, .../portal
event_type: customer.subscription.updated             # Stripe event involved (if any)
stripe_api_version: 2026-04-22.dahlia                 # version declared in code (or 'unpinned')
target_file: app/api/stripe/webhook/route.ts
line: 42
sink: stripe.webhooks.constructEvent | db.insert | resend.emails.send | ...
source: req.body | req.text() | req.json() | model-binding | ...
reachable: true | false | unknown
delta_to_baseline: new | unchanged | regressed
message: "Webhook handler parses body via req.json() before signature check; raw bytes lost."
suggested_fix: |
  Read raw body via req.text() (Next.js App Router) / @RequestBody String (Spring) /
  await request.body() (FastAPI) / StreamReader on HttpContext.Request.Body (.NET).
  Then call stripe.webhooks.constructEvent(rawBody, sig, secret).
reference: https://docs.stripe.com/webhooks#verify-events
```

**`kind` enum** (canonical):

```
sig-verification-missing
sig-verification-after-parse
idempotency-missing-api
idempotency-missing-webhook
idempotency-split-transaction
subscription-state-race
unhandled-event
test-mode-in-prod
live-mode-in-test
hardcoded-price-id
hardcoded-stripe-key
dunning-missing
sca-not-handled
proration-not-previewed
cancel-at-period-end-mishandled
metadata-userid-missing
webhook-slow-handler
api-version-unpinned
tax-self-computed
```

The integrator uses `confidence` to weight findings — a `confidence: low` pattern-only finding doesn't block phase advancement on its own, but two engines agreeing (or a manual trace confirming) escalates it.

## OWASP mapping

- **A02 (Cryptographic Failures)** — webhook signature verification (HMAC-SHA256 over timestamp.payload)
- **A04 (Insecure Design)** — idempotency table prevents double-processing under at-least-once delivery
- **A05 (Security Misconfiguration)** — test-mode key in prod, unpinned API version, missing webhook endpoint per env
- **A07 (Identification and Authentication Failures)** — userId metadata bound to checkout session; SCA / 3DS handling
- **A09 (Security Logging and Monitoring Failures)** — unhandled events without alerting; dropped failures invisible

## Sources

- [Stripe API versioning](https://docs.stripe.com/api/versioning) — pinned version is `2026-04-22.dahlia`
- [Stripe API upgrades changelog](https://docs.stripe.com/upgrades)
- [Stripe Webhooks docs](https://docs.stripe.com/webhooks) — signature verification, raw body requirement
- [Stripe Subscriptions webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) — event catalog
- [Stripe SCA readiness](https://docs.stripe.com/strong-customer-authentication) — PSD2 / 3DS2 flow
- [Stripe Customer Portal](https://docs.stripe.com/customer-management) — self-serve plan changes
- [Stripe Tax](https://docs.stripe.com/tax) — automatic tax calculation
- [stripe-node SDK changelog](https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md)

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
