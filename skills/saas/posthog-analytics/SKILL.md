---
name: posthog-analytics
description: Product analytics, funnel tracking, feature flags, and A/B testing via PostHog — instrumentation of activation, retention, and revenue events.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "posthog"
  - "product analytics"
  - "funnel analysis"
  - "feature flags"
  - "a/b testing"
  - "event tracking"
  - "activation funnel"
related_skills:
  - saas/clerk-auth
  - saas/stripe-subscriptions
  - versioning/feature-flag-auditor
effort_level: medium
model_optimized_for: opus-4-7
model: sonnet
tools: Read, Write, Edit
---

# PostHog Analytics (saas skill)

> Implementation guide for PostHog in a SaaS — product events, funnels, feature flags, and A/B testing in one tool.

## Role

You instrument the SaaS to answer: are users activating? where do they drop off? does feature X correlate with retention? Without this, you're flying blind.

## 2026 Best Practices

- **PostHog for product** (events, funnels, retention, feature flags, A/B tests, session recording). One tool.
- **Plausible for marketing site** (privacy-friendly, GDPR-default, simple page-view tracking).
- **The canonical SaaS event set**: `signup_started · signup_completed · onboarding_step_N · activation_event · feature_X_used · subscription_started · subscription_canceled`. Tracking these gives you a funnel from day 1.
- **Identify users on auth** — `posthog.identify(userId, traits)` after sign-in.
- **Group analytics for B2B** — `posthog.group('organization', orgId)`.
- **Feature flags from same SDK** — same dashboard for analytics + experimentation.
- **Cookie consent for EU** — PostHog has built-in consent management.

## Implementation pattern

### 1. Install + configure

```bash
npm install posthog-js posthog-node
```

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=phx_...  # server-side only
```

### 2. Client-side provider

```tsx
// app/providers.tsx
'use client';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',  // GDPR-friendly: only profile after identify()
    capture_pageview: 'history_change',
    persistence: 'localStorage+cookie',
    autocapture: true,  // captures clicks, form submits automatically
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
```

### 3. Identify on signin (server-side)

```typescript
// app/api/auth/identify/route.ts
import { auth, currentUser } from '@clerk/nextjs/server';
import { PostHog } from 'posthog-node';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('unauthorized', { status: 401 });
  const user = await currentUser();

  const ph = new PostHog(process.env.POSTHOG_API_KEY!, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST });
  ph.identify({
    distinctId: userId,
    properties: {
      email: user?.emailAddresses[0]?.emailAddress,
      created_at: user?.createdAt,
      // ... plan, signup_source, etc.
    },
  });
  await ph.shutdown();
  return new Response('ok');
}
```

### 4. The canonical SaaS event set

```typescript
// lib/analytics/events.ts
export const Events = {
  SIGNUP_STARTED:        'signup_started',
  SIGNUP_COMPLETED:      'signup_completed',          // email verified
  ONBOARDING_STEP:       'onboarding_step',           // properties: step, total
  ACTIVATION:            'activation',                 // user reached value
  FEATURE_USED:          'feature_used',              // properties: feature, context
  SUBSCRIPTION_STARTED:  'subscription_started',      // properties: plan, mrr
  SUBSCRIPTION_UPDATED:  'subscription_updated',      // plan changes
  SUBSCRIPTION_CANCELED: 'subscription_canceled',     // properties: reason if available
  PAYMENT_FAILED:        'payment_failed',
  SUPPORT_CONTACTED:     'support_contacted',
} as const;
```

```typescript
// Usage
import posthog from 'posthog-js';
import { Events } from '@/lib/analytics/events';

posthog.capture(Events.ACTIVATION, {
  // Activation event = first time user produced their first valuable artifact.
  // Define per product: created first invoice, sent first message, etc.
  artifact_type: 'invoice',
  artifact_id: invoice.id,
});

posthog.capture(Events.SUBSCRIPTION_STARTED, {
  plan: 'pro',
  mrr: 29,
  billing_cycle: 'monthly',
});
```

### 5. Server-side capture (for webhook-driven events)

```typescript
// In Stripe webhook handler
import { PostHog } from 'posthog-node';

const ph = new PostHog(process.env.POSTHOG_API_KEY!, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST });

ph.capture({
  distinctId: userId,
  event: 'subscription_started',
  properties: { plan, mrr, billing_cycle: 'monthly' },
});
await ph.shutdownAsync();
```

### 6. Feature flags

```typescript
// Client-side
import { useFeatureFlagEnabled } from 'posthog-js/react';

function NewFeatureGate() {
  const enabled = useFeatureFlagEnabled('new-dashboard');
  if (!enabled) return <OldDashboard />;
  return <NewDashboard />;
}

// Server-side
import { PostHog } from 'posthog-node';
const ph = new PostHog(...);
const enabled = await ph.isFeatureEnabled('new-dashboard', userId);
```

### 7. Funnels (in PostHog UI)

Create the canonical SaaS funnel:
```
signup_started → signup_completed → onboarding_step (step=1) → onboarding_step (step=N)
  → activation → subscription_started
```

Drop-off at each step tells you where to focus.

### 8. Retention cohorts

In PostHog UI, define:
- **Day-1 retention**: users who return on day 1 after signup
- **Week-1**: returned within 7 days
- **Month-1**: returned within 30 days

Aim for D1 > 40%, W1 > 25%, M1 > 15% for a B2C SaaS (varies by category).

## Critical pitfalls

1. **No identify() call** — events have no `distinctId`, can't connect to user → useless funnels.
2. **Identify on every page load** — wasteful; identify once after signin.
3. **Capturing PII in event properties** — passwords, full names, addresses leak to PostHog. Whitelist properties.
4. **No cookie consent for EU** — GDPR violation. Use `person_profiles: 'identified_only'` AND consent banner.
5. **Tracking dropping in production** — adblockers. Use a reverse proxy through your domain (e.g., `/ph/static/array.js` → PostHog CDN).
6. **Forgetting server-side events** — Stripe webhooks fire server-side; client never sees them. Use `posthog-node` from webhook.

## Test plan

```typescript
describe('PostHog instrumentation', () => {
  it('signup_started fires on signup form submit', async () => { ... });
  it('signup_completed fires after email verification', async () => { ... });
  it('subscription_started fires on Stripe webhook', async () => { ... });
  it('identify() called once per session', async () => { ... });
  it('feature flag returns correct value for user', async () => { ... });
});
```

## Reverse-proxy setup (adblock-resistant)

```typescript
// next.config.mjs
const nextConfig = {
  async rewrites() {
    return [
      { source: '/ph/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ph/:path*', destination: 'https://us.i.posthog.com/:path*' },
    ];
  },
  skipTrailingSlashRedirect: true,
};
```

Then init with `api_host: '/ph'` instead of `https://us.i.posthog.com`.

## Sources

- [PostHog SaaS guide](https://posthog.com/tutorials/saas-analytics)
- [PostHog Next.js](https://posthog.com/docs/libraries/next-js)
- [PostHog GDPR / consent](https://posthog.com/docs/privacy/gdpr-compliance)
