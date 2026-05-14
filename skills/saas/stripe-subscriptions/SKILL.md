---
name: stripe-subscriptions
description: Implement Stripe Subscriptions end-to-end — Checkout, Customer Portal, webhook handling, dunning, idempotency, proration.
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
related_skills:
  - saas/clerk-auth
  - saas/multi-tenancy-row-level
  - security/secrets-detector
effort_level: high
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Edit, Bash, Grep
---

# Stripe Subscriptions (saas skill)

> v8.3 SaaS skill — implementation guide for Stripe Subscriptions in a Next.js 15 + TypeScript SaaS. Used by the `saas/b2c-subscription` template.

## Role

You implement Stripe Subscriptions correctly the first time: checkout, webhooks with signature verification, idempotency, dunning, plan changes via Customer Portal. The 2026 pitfalls are all known — encode them in code.

## 2026 Best Practices (SaaS billing)

- **Stripe Checkout (hosted) for signup** — PCI scope minimized; less code to maintain.
- **Customer Portal for plan changes** — let Stripe handle the UI; don't rebuild it.
- **Webhooks are the source of truth** — never trust client-side state; webhook-driven DB updates.
- **Verify signatures** — `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET`.
- **Idempotency** — store `event.id` in `webhook_events` table; skip if seen.
- **Smart Retries + dunning** — Stripe handles retry cadence; you send the dunning emails.
- **Proration handled by Stripe** — when changing plans mid-cycle, Stripe computes the credit.
- **Tax**: if selling globally, use Paddle (Merchant of Record) OR Stripe Tax. Don't compute tax yourself.

## Implementation pattern

### 1. Stripe setup (Stripe Dashboard, before code)

```
1. Create Stripe account → activate live mode after legal+banking
2. Products → create one Product per tier (Free, Pro, Team)
3. Prices → create monthly + annual price per product
4. Webhooks → Add endpoint pointing to https://<domain>/api/stripe/webhook
   Events: customer.subscription.{created,updated,deleted},
           invoice.{paid,payment_failed,upcoming},
           checkout.session.completed
5. Customer Portal → Configure (enable plan changes, payment methods, invoices)
6. Copy: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PUBLISHABLE_KEY
```

### 2. Environment variables

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Price IDs per tier (use lookup_keys instead of raw IDs for portability)
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
```

### 3. Database schema (Drizzle example)

```typescript
// drizzle/schema.ts
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  planId: text('plan_id').notNull(),  // 'free' | 'pro' | 'team'
  status: text('status').notNull(),    // 'active' | 'past_due' | 'canceled' | 'incomplete'
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  stripeEventId: text('stripe_event_id').notNull().unique(),  // for idempotency
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at').defaultNow(),
});
```

### 4. Checkout (Next.js Route Handler)

```typescript
// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { priceId } = await req.json();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    client_reference_id: userId,
    customer_email: undefined,  // let Clerk's email pre-fill at Stripe side
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId },
    },
  });

  return NextResponse.json({ url: session.url });
}
```

### 5. Webhook handler (the critical path)

```typescript
// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { webhookEvents, subscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = (await headers()).get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err}` }, { status: 400 });
  }

  // Idempotency: skip if already processed
  const existing = await db.select().from(webhookEvents).where(eq(webhookEvents.stripeEventId, event.id));
  if (existing.length > 0) {
    return NextResponse.json({ received: true, status: 'already_processed' });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }

    await db.insert(webhookEvents).values({
      stripeEventId: event.id,
      type: event.type,
      payload: event.data.object,
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    // Return 500 — Stripe will retry
    return NextResponse.json({ error: 'webhook processing failed' }, { status: 500 });
  }
}

async function handleSubscriptionChange(sub: Stripe.Subscription) {
  const userId = sub.metadata.userId;
  if (!userId) {
    console.error('Subscription event missing userId metadata', sub.id);
    return;
  }
  const planId = sub.items.data[0].price.lookup_key || sub.items.data[0].price.id;

  await db.insert(subscriptions).values({
    userId,
    stripeCustomerId: sub.customer as string,
    stripeSubscriptionId: sub.id,
    planId,
    status: sub.status,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  }).onConflictDoUpdate({
    target: subscriptions.stripeSubscriptionId,
    set: {
      planId,
      status: sub.status,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Send dunning email via Resend (see saas/resend-email)
  // Mark subscription as past_due (Stripe already does this; we update local)
  const subId = invoice.subscription as string;
  if (!subId) return;
  await db.update(subscriptions)
    .set({ status: 'past_due', updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, subId));
  // Trigger dunning email — see resend-email skill
}
```

### 6. Customer Portal link

```typescript
// app/api/stripe/portal/route.ts
import { auth } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { subscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sub = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (sub.length === 0) return NextResponse.json({ error: 'no subscription' }, { status: 404 });

  const session = await stripe.billingPortal.sessions.create({
    customer: sub[0].stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/account`,
  });
  return NextResponse.json({ url: session.url });
}
```

## Critical pitfalls (the things that bite at launch)

1. **Webhook signature uses wrong env** — separate `STRIPE_WEBHOOK_SECRET` for test vs live.
2. **No idempotency table** — Stripe retries duplicate webhooks; without dedup, double-billed subscriptions.
3. **userId metadata missing** — set in `subscription_data.metadata` on Checkout creation.
4. **Failed payments silently churn** — implement `invoice.payment_failed` handler + dunning email.
5. **Local subscription state drifts** — webhook is source of truth; never trust the client.
6. **No cancel_at_period_end handling** — UI must show "Cancels on <date>" not "Active".
7. **Plan changes prorate but proration not communicated** — show estimated cost via `subscriptions.preview`.

## Test plan

```typescript
// tests/stripe-webhook.test.ts
describe('Stripe webhook', () => {
  it('rejects invalid signature', async () => { ... });
  it('processes subscription.created exactly once (idempotency)', async () => { ... });
  it('upserts subscription on subscription.updated', async () => { ... });
  it('marks past_due on invoice.payment_failed', async () => { ... });
  it('returns 500 on processing error (Stripe will retry)', async () => { ... });
});
```

## OWASP mapping

- A02 (Cryptographic Failures): webhook signature verification
- A04 (Insecure Design): idempotency table to prevent double-processing
- A07 (Identification and Authentication Failures): userId metadata bound to checkout session

## Sources

- [Stripe Subscriptions docs](https://stripe.com/docs/billing/subscriptions/overview)
- [Stripe webhooks best practices](https://stripe.com/docs/webhooks)
- [Stripe + Next.js sample](https://github.com/stripe-samples/checkout-one-time-payments)

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
