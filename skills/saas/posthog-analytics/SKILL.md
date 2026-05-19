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
  - "group analytics"
  - "session replay"
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

> Implementation guide for PostHog in a SaaS — product events, funnels, feature flags, multivariate experiments, session replay, and group analytics in one tool.

## Role

You instrument the SaaS to answer: are users activating? where do they drop off? does feature X correlate with retention? Without disciplined instrumentation, founders fly blind, PMs guess, and engineers ship features no one uses.

You also enforce the privacy boundary: events leave the user's browser or your server with no PII in their property bags, session replays redact form fields and elements marked sensitive, and EU customers route to PostHog Cloud EU.

## 2026 Best Practices

- **Server-side capture for source-of-truth events**. `signup_completed`, `subscription_started`, `subscription_canceled`, `payment_failed`, and `churned` MUST emit from the server (Stripe webhook, auth callback, billing job). Browsers lose events to ad-blockers, network failures, and tab-closes mid-flush — PostHog's [own best-practices doc states backend analytics are more reliable than frontend analytics](https://posthog.com/docs/product-analytics/best-practices) because many users have tracking disabled or blocked. Server-side capture is the canonical record. Client-side capture is reserved for UX events (page views, button clicks, scroll, autocapture-style interactions) where directional truth is enough.
- **Group analytics for B2B is non-optional**. If the product is sold to organizations, every server-side `capture()` MUST attach a `groups: { organization: org_id }` payload. Without it, the funnel cannot answer "how many organizations activated?" — only "how many users." PostHog [includes group analytics on all paid plans](https://posthog.com/docs/product-analytics/group-analytics); a missing group call is a B2B reporting bug, not a "nice to have."
- **identify on auth — merges the anonymous session automatically**. Before sign-in, PostHog assigns an anonymous `distinct_id`. On signup completion, call `posthog.identify(userId, traits)`; current `posthog-js` merges the anonymous distinct_id into the new identified user automatically when called from the same browser session. Use `posthog.alias(otherId)` only for joining two already-identified IDs (e.g. linking a logged-in customer to an admin-impersonation session). Calling `identify()` BEFORE any post-auth `capture()` is mandatory — otherwise the post-auth event lands on the anonymous profile and the user's journey splits across two profiles forever.
- **Event naming convention is locked at v1**. PostHog's house convention is `object_verb` in snake_case with present-tense verbs: `project_created`, `invoice_sent`, `subscription_canceled`. Maintain an allowlist file (`lib/analytics/events.ts`) and a CI check that fails the build on any `capture()` with an event string not in the allowlist. Without this, you get `Signup Complete`, `signup-complete`, `signupComplete`, `signup_completed`, and `userSignedUp` all in the same dashboard within six weeks.
- **`$process_person_profile: false` for high-volume non-person events**. Events that don't need to update a person profile (background jobs, system events, cron pings, anonymous marketing-site page views, per-render telemetry) should set this flag. Person-profile updates are the expensive processing path. Forgetting this on an event fired per component-render is how a small product's event volume explodes well past its plan tier in a single deploy.
- **Autocapture OFF on sensitive forms**. The default `autocapture: true` captures every click, input blur, and form submit. On signup, login, billing, password-change, and any HIPAA/PCI-adjacent form, EITHER set `autocapture: false` on init OR add `ph-no-capture` CSS class to the form root. Default-on autocapture is how passwords end up in PostHog. (Element text is masked client-side by default for password input types, but custom password inputs, payment inputs, and SSN inputs are NOT auto-detected.)
- **Session Replay with explicit redaction**. Enable replay only after the redaction config is in place. The minimum: `session_recording: { maskTextSelector: '[data-sensitive], input[type="password"], input[type="email"], .ph-no-capture', maskAllInputs: true, maskInputOptions: { password: true, email: true } }`. The iOS SDK [makes a best effort to mask passwords / credit cards / OTP / PII](https://posthog.com/docs/session-replay/privacy) but custom inputs are not auto-detected. Recording a customer's checkout flow without redaction is a card-data-leak waiting for the next dispute.
- **EU customers route to PostHog Cloud EU (Frankfurt, AWS eu-central-1)**. [PostHog Cloud EU](https://posthog.com/blog/posthog-cloud-eu) keeps data inside the EU; US Cloud routes through the US. For GDPR Art. 44+ transfers, choose Cloud EU at project creation — you cannot migrate a project between clouds without a full re-instrumentation. EU organizations [default to IP capture disabled](https://posthog.com/docs/privacy/gdpr-compliance) and ship privacy-safe defaults.
- **Multivariate experiments use the same feature-flag SDK call**. A/B and A/B/n are feature flags with payload variants. Read once per session, log the variant as an event property on every event for that user during the experiment window, and analyze in the Experiments tab. Reading the flag on every component render produces a flag-evaluation event storm and skews the variant-exposure metric.
- **Reverse-proxy the SDK to defeat ad-blockers**. uBlock Origin, Brave Shields, and DuckDuckGo Privacy Essentials block requests to `*.posthog.com` and `*.i.posthog.com`. Reverse-proxy the JS bundle and ingest endpoint through your own domain (`/ph/*` -> `https://us.i.posthog.com/*`). Without the proxy a meaningful slice of client events vanish silently, and the loss skews toward the privacy-conscious cohort — biasing every funnel against the segment most likely to convert on a privacy-pitch product.

## Implementation pattern

### 1. Install + configure

```bash
npm install posthog-js posthog-node
# Python (server)
pip install posthog
# Other SDKs: Go (posthog-go), Ruby (posthog-ruby), PHP (posthog-php), iOS, Android,
# React Native, Flutter. .NET (posthog-dotnet) and Java (posthog-java) exist; verify
# version maturity on https://posthog.com/docs/libraries before pinning a major version
# for production. Surface differs between SDKs — feature-flag local evaluation, batching,
# and group-analytics support land at different cadences.
```

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_PROJECT_API_KEY_PLACEHOLDER
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # or https://eu.i.posthog.com for EU
POSTHOG_PROJECT_API_KEY=phc_PROJECT_API_KEY_PLACEHOLDER   # server-side uses the SAME project key, not personal
# NEVER ship a personal_api_key (phx_*) to the browser or any client binary.
```

### 2. Client-side provider (Next.js / React, with redaction defaults)

```tsx
// app/providers.tsx
'use client';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: '/ph',                                // reverse-proxied — see next.config.mjs below
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',             // GDPR-friendly: profile only after identify()
    capture_pageview: 'history_change',
    persistence: 'localStorage+cookie',
    autocapture: {
      css_selector_allowlist: ['[data-attr]'],      // tight allowlist; never blanket autocapture
      element_attribute_ignorelist: ['data-email', 'data-phone'],
    },
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true, email: true },
      maskTextSelector: '[data-sensitive], .ph-no-capture, input[type="password"], input[type="email"]',
    },
    loaded: (ph) => {
      if (process.env.NODE_ENV !== 'production') ph.debug();
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
```

### 3. Identify + alias on auth (anonymous -> authed transition)

```typescript
// Called from the client immediately after the auth callback resolves,
// BEFORE any post-auth posthog.capture() call.
import posthog from 'posthog-js';

export function identifyAfterAuth(
  userId: string,
  orgId: string | null,
  traits: { email_domain: string; created_at: string; plan: string },
) {
  // identify() in the same browser session as the pre-signup pageviews automatically
  // merges the anonymous distinct_id into the new userId. The top-of-funnel events
  // are NOT lost.
  posthog.identify(userId, traits);                 // never pass raw email — domain/hash only
  if (orgId) posthog.group('organization', orgId);  // B2B: attach the org for group analytics

  // alias() is reserved for joining two already-identified IDs (e.g. admin impersonation,
  // server-generated id ↔ client-generated id). Not needed for the anonymous→authed flow.
}
```

```typescript
// Server-side identify on signup webhook (Clerk / Supabase Auth / custom)
import { PostHog } from 'posthog-node';

const ph = new PostHog(process.env.POSTHOG_PROJECT_API_KEY!, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 20,                                       // batch
  flushInterval: 10000,
});

ph.identify({
  distinctId: userId,
  properties: {
    email_domain: email.split('@')[1],               // domain only — never raw email
    plan: 'free',
    created_at: new Date().toISOString(),
  },
});
await ph.shutdown();                                 // flush before lambda/edge function exits
```

### 4. The canonical SaaS event allowlist (event-naming convention enforced)

```typescript
// lib/analytics/events.ts — single source of truth, imported everywhere.
// object_verb in snake_case, present-tense verbs.
export const Events = {
  // acquisition
  LANDING_VIEWED:        'landing_viewed',
  PRICING_VIEWED:        'pricing_viewed',
  SIGNUP_STARTED:        'signup_started',
  SIGNUP_COMPLETED:      'signup_completed',         // server-side, email verified
  // activation
  ONBOARDING_STEP_VIEWED:'onboarding_step_viewed',   // properties: step_index, step_name
  ACTIVATION_REACHED:    'activation_reached',       // user produced first valuable artifact
  // engagement
  FEATURE_USED:          'feature_used',             // properties: feature_name, context
  // revenue (server-side only — Stripe webhook)
  SUBSCRIPTION_STARTED:  'subscription_started',
  SUBSCRIPTION_UPDATED:  'subscription_updated',
  SUBSCRIPTION_CANCELED: 'subscription_canceled',
  PAYMENT_FAILED:        'payment_failed',
  // support
  SUPPORT_CONTACTED:     'support_contacted',
} as const;

export type EventName = (typeof Events)[keyof typeof Events];

// ESLint / Semgrep rule should reject capture(<string-literal-not-in-Events>).
```

### 5. Server-side capture (Stripe webhook — the canonical revenue path)

```typescript
// app/api/webhooks/stripe/route.ts
import { PostHog } from 'posthog-node';
import { Events } from '@/lib/analytics/events';

const ph = new PostHog(process.env.POSTHOG_PROJECT_API_KEY!, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST });

ph.capture({
  distinctId: userId,
  event: Events.SUBSCRIPTION_STARTED,
  properties: { plan: 'pro', mrr_cents: 2900, billing_cycle: 'monthly' },
  groups: { organization: orgId },                   // B2B: attach the org
});
await ph.shutdown();
```

### 6. Feature flags + multivariate experiments

```typescript
// Client-side — read once per session, store the variant.
import { useFeatureFlagVariantKey } from 'posthog-js/react';

function CheckoutFlow() {
  const variant = useFeatureFlagVariantKey('checkout_redesign_2026_q2'); // 'control' | 'variant_a' | 'variant_b'
  return variant === 'control' ? <OldCheckout /> : <NewCheckout variant={variant} />;
}
```

```typescript
// Server-side — for SSR pages or feature-gated APIs.
import { PostHog } from 'posthog-node';
const ph = new PostHog(process.env.POSTHOG_PROJECT_API_KEY!, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST });

const variant = await ph.getFeatureFlag('checkout_redesign_2026_q2', userId, {
  groups: { organization: orgId },
});
```

### 7. Funnels (defined in PostHog UI)

The canonical SaaS-b2c funnel:
```
landing_viewed -> signup_started -> signup_completed -> onboarding_step_viewed (step 1)
  -> activation_reached -> subscription_started
```

Drop-off at each step tells you where to focus. The B2B variant filters on the `organization` group.

### 8. Retention cohorts

In PostHog UI, define cohorts on the **first activation_reached** event:
- D1 retention: returned within 24h
- W1: returned within 7 days
- M1: returned within 30 days

Targets vary by category; do not hardcode magic numbers in the dashboard description.

## Categories (BAD / SAFE patterns)

### 1. Missing identify() call

```typescript
// BAD — capture() fires before identify(); the event lands on the anonymous profile,
// and after the next identify() the user has two split profiles.
posthog.capture('signup_completed');
posthog.identify(userId, { email_domain: 'example.com' });   // too late

// SAFE — identify FIRST (same-session merge stitches the anonymous pageviews automatically),
// then group for B2B, then capture.
posthog.identify(userId, { email_domain: 'example.com' });
posthog.group('organization', orgId);
posthog.capture('signup_completed');
```

### 2. Missing group call for B2B

```typescript
// BAD — B2B funnel cannot count "organizations activated"
posthog.capture('feature_used', { feature_name: 'export_csv' });

// SAFE — every event attached to the org group
posthog.group('organization', orgId, { plan: 'team', seat_count: 12 });
posthog.capture('feature_used', { feature_name: 'export_csv' });
// Server-side equivalent passes groups: { organization: orgId } on the capture call.
```

### 3. Sending PII in event properties

```typescript
// BAD — raw email, full name, IP, postal address leak to PostHog
posthog.capture('signup_completed', {
  email: 'alice@example.com',
  full_name: 'Alice Liddell',
  ip: '203.0.113.42',
});

// SAFE — hash or domain-only; never raw PII
posthog.capture('signup_completed', {
  email_domain: 'example.com',
  email_hash: sha256('alice@example.com'),           // optional, for join keys
  plan: 'free',
});
```

### 4. Autocapture on sensitive forms

```tsx
// BAD — default autocapture: true records keystrokes/clicks on the password input's siblings
<form id="signup">
  <input name="email" />
  <input name="password" type="password" />
  <input name="ssn" />                               {/* custom input — NOT auto-redacted */}
</form>

// SAFE — opt-out on the form root + redact the recording
<form id="signup" className="ph-no-capture" data-sensitive>
  <input name="email" data-sensitive />
  <input name="password" type="password" />
  <input name="ssn" data-sensitive />
</form>
```

### 5. Session recording without redaction

```typescript
// BAD — recording enabled with default config, captures every input
posthog.init(KEY, { session_recording: {} });

// SAFE — explicit masking config
posthog.init(KEY, {
  session_recording: {
    maskAllInputs: true,
    maskInputOptions: { password: true, email: true },
    maskTextSelector: '[data-sensitive], .ph-no-capture, input[type="password"], input[type="email"]',
    blockSelector: '[data-block-recording]',         // entire element + children dropped from recording
  },
});
```

### 6. Hardcoded API key client-side (wrong key class)

```typescript
// BAD — personal_api_key (phx_*) shipped to the browser; full account access leaked
posthog.init('phx_PERSONAL_API_KEY_HUGE_BLAST_RADIUS', { ... });

// SAFE — project API key (phc_*) only; this is the public, write-only ingest key
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, { ... });
// personal_api_key (phx_*) is for SERVER-SIDE management API calls only (e.g. CI scripts that create flags).
// It MUST live in a server-only env var and NEVER appear in NEXT_PUBLIC_*, in any client bundle,
// or in any binary shipped to users.
```

### 7. No event-naming convention (taxonomy drift)

```typescript
// BAD — every developer invents a name
posthog.capture('Signup Complete');
posthog.capture('signup-complete');
posthog.capture('signupComplete');
posthog.capture('user_signed_up');
posthog.capture('SIGNUP_COMPLETED');

// SAFE — single allowlist import, ESLint rule rejects string literals
import { Events } from '@/lib/analytics/events';
posthog.capture(Events.SIGNUP_COMPLETED);
```

### 8. Event volume explosion (per-render capture)

```tsx
// BAD — fires on every React render; 1 user-session = 1000s of events
function ProductCard({ id }: { id: string }) {
  posthog.capture('product_card_rendered', { product_id: id });
  return <Card>...</Card>;
}

// SAFE — fire once per visibility, mark as cheap (no person-profile update)
function ProductCard({ id }: { id: string }) {
  const seenRef = useRef(false);
  useIntersectionObserver(({ isIntersecting }) => {
    if (isIntersecting && !seenRef.current) {
      seenRef.current = true;
      posthog.capture('product_card_viewed', {
        product_id: id,
        $process_person_profile: false,              // cheap event, do not update profile
      });
    }
  });
  return <Card>...</Card>;
}
```

## 7-language coverage (event tracking BAD / SAFE)

### C# (.NET 9, posthog-dotnet)

```csharp
// BAD: hardcoded personal key, sync capture per request, no group, raw email property
var ph = new PostHogClient("phx_PERSONAL_KEY_DO_NOT_SHIP");
ph.Capture("Signup Complete", distinctId: userId, new Dictionary<string, object> {
    ["email"] = user.Email,
});

// SAFE: project key from env, batched client as singleton, group + hashed PII
builder.Services.AddSingleton<IPostHogClient>(_ => new PostHogClient(
    apiKey: Environment.GetEnvironmentVariable("POSTHOG_PROJECT_API_KEY")!,
    options: new PostHogClientOptions {
        Host = new Uri(Environment.GetEnvironmentVariable("POSTHOG_HOST")!),
        FlushAt = 20,
        FlushInterval = TimeSpan.FromSeconds(10),
    }));

app.MapPost("/webhook/stripe", async (StripeEvent e, IPostHogClient ph) => {
    await ph.CaptureAsync(
        eventName: "subscription_started",
        distinctId: e.Customer.Metadata["userId"],
        properties: new() {
            ["plan"] = e.Plan,
            ["mrr_cents"] = e.MrrCents,
        },
        groups: new() { ["organization"] = e.Customer.Metadata["orgId"] });
});
```

### Java 21+ (posthog-java)

```java
// BAD: per-request client construction, raw email, no group, no shutdown -> events dropped
PostHog ph = new PostHog.Builder("phx_PERSONAL_KEY").build();
ph.capture(userId, "Signup Complete", Map.of("email", user.getEmail()));

// SAFE: singleton, project key, batched, hashed PII, group attached
@Configuration
class PostHogConfig {
    @Bean(destroyMethod = "shutdown")
    PostHog postHog(@Value("${posthog.project-api-key}") String key,
                    @Value("${posthog.host}") String host) {
        return new PostHog.Builder(key).host(host).build();
    }
}

@Service
class BillingEvents {
    private final PostHog ph;
    BillingEvents(PostHog ph) { this.ph = ph; }

    void subscriptionStarted(String userId, String orgId, String plan, int mrrCents) {
        ph.capture(userId, "subscription_started",
            Map.of("plan", plan, "mrr_cents", mrrCents),
            Map.of("$groups", Map.of("organization", orgId)));
    }
}
```

### Python 3.12+ (posthog-python)

```python
# BAD: import-time eager client, raw email property, per-render capture, no group
from posthog import Posthog
ph = Posthog("phx_PERSONAL_KEY_LEAKED", host="https://us.i.posthog.com")

def signup(user):
    ph.capture(user.id, "Signup Complete", {"email": user.email})  # PII + bad name

# SAFE: settings-driven singleton, project key, group attached, hashed PII
import hashlib, os
from posthog import Posthog

ph = Posthog(
    project_api_key=os.environ["POSTHOG_PROJECT_API_KEY"],
    host=os.environ["POSTHOG_HOST"],
    flush_at=20, flush_interval=10,
)

def signup_completed(user, org_id: str) -> None:
    ph.capture(
        distinct_id=user.id,
        event="signup_completed",
        properties={
            "email_domain": user.email.split("@")[1],
            "email_hash": hashlib.sha256(user.email.encode()).hexdigest(),
            "plan": "free",
        },
        groups={"organization": org_id},
    )
```

### C / C++

Skipped — PostHog has no first-party C/C++ SDK as of 2026. If embedded code needs telemetry, route through a small HTTPS POST to the `/capture/` endpoint using the project API key in the JSON body, with TLS pinning and retry/backoff. Do not embed the personal API key.

### TypeScript — browser (posthog-js)

```typescript
// BAD: missing identify, raw email, autocapture default-on for sensitive form
import posthog from 'posthog-js';
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {});
posthog.capture('Signup Complete', { email: 'alice@example.com' });

// SAFE: identify FIRST (auto-merges anonymous session), group for B2B, then capture
import posthog from 'posthog-js';
import { Events } from '@/lib/analytics/events';

posthog.identify(userId, { email_domain: 'example.com', plan: 'free' });
posthog.group('organization', orgId);
posthog.capture(Events.SIGNUP_COMPLETED, { plan: 'free' });
```

### TypeScript — server (posthog-node)

```typescript
// BAD: client constructed per request, no shutdown, no group, sync wait blocks event loop
import { PostHog } from 'posthog-node';
export async function POST(req: Request) {
  const ph = new PostHog('phx_PERSONAL_KEY');
  ph.capture({ distinctId: '...', event: 'Signup' });
  // process exits — events lost
}

// SAFE: module-singleton, project key, group attached, await shutdown on serverless exit
import { PostHog } from 'posthog-node';

const ph = new PostHog(process.env.POSTHOG_PROJECT_API_KEY!, {
  host: process.env.POSTHOG_HOST,
  flushAt: 20,
  flushInterval: 10000,
});

export async function POST(req: Request) {
  const { userId, orgId, plan } = await req.json();
  ph.capture({
    distinctId: userId,
    event: 'subscription_started',
    properties: { plan, mrr_cents: 2900 },
    groups: { organization: orgId },
  });
  await ph.shutdown();                               // flush before edge/lambda terminates
  return new Response('ok');
}
```

### SQL (warehouse / DB schema for distinct_id mapping)

```sql
-- BAD: app DB has no link to PostHog distinct_id; cohort joins impossible
CREATE TABLE users (
  id           uuid PRIMARY KEY,
  email        text NOT NULL,
  created_at   timestamptz NOT NULL
);

-- SAFE: store posthog_distinct_id alongside the user; store the canonical event
-- log in a warehouse table so finance/RevOps can join Stripe + PostHog.
CREATE TABLE users (
  id                    uuid PRIMARY KEY,
  email                 text NOT NULL,
  posthog_distinct_id   text UNIQUE NOT NULL,        -- == users.id by convention; keep explicit for migrations
  org_id                uuid REFERENCES organizations(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_posthog_distinct_id_idx ON users(posthog_distinct_id);

-- Canonical analytics_events table, populated from PostHog's batch-export to S3/Snowflake/BigQuery.
CREATE TABLE analytics_events (
  event_id           uuid PRIMARY KEY,
  distinct_id        text NOT NULL,                  -- joins to users.posthog_distinct_id
  event              text NOT NULL,                  -- e.g. 'subscription_started'
  properties         jsonb NOT NULL DEFAULT '{}'::jsonb,
  groups             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- e.g. {"organization": "org_123"}
  org_id             uuid,                            -- denormalized from groups.organization for join speed
  occurred_at        timestamptz NOT NULL,
  ingested_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_distinct_id_idx ON analytics_events(distinct_id, occurred_at DESC);
CREATE INDEX analytics_events_event_idx        ON analytics_events(event, occurred_at DESC);
CREATE INDEX analytics_events_org_idx          ON analytics_events(org_id, occurred_at DESC);
```

## Tool Integration (2026)

| Tool | Purpose | When |
|------|---------|------|
| **PostHog Toolbar** | In-page overlay shows event-emitting elements live, lets you tag autocapture selectors without code | During instrumentation review; never in production user sessions |
| **Live Events view** | Streams events as they arrive; verifies that an instrumentation change actually fires | Smoke-test after every event-shipping PR |
| **Feature Flag Dashboard** | Source of truth for active flags; shows rollout %, variant payloads, target cohorts, kill-switch | Every feature behind a flag; review monthly to retire stale flags (see [[feature-flag-auditor]]) |
| **Experiments tab** | Runs A/B/n on top of feature flags; computes statistical significance with the variant-exposure log | Every shipped UX change worth measuring |
| **Group Analytics view** | Org-level funnels, retention, and feature adoption for B2B | Default view for B2B PMs; not optional |
| **Session Replay (with redaction config)** | Records DOM mutations + network for support / UX debugging | Only after `maskTextSelector` + `maskAllInputs` are verified on a staging session |
| **Insights / SQL** | Ad-hoc HogQL queries against the events table for custom funnels and cohorts | Weekly product review (see [[product-reviewer]]) |
| **CDP Transformations** | Server-side rewrite of incoming events (drop PII, anonymize IP, derive properties) | One transformation per event-class; never use to "fix" client-side bugs |
| **Batch Export to warehouse** | Mirrors events to S3 / Snowflake / BigQuery for finance + RevOps joins | Always on once monetization starts |

## Severity (internal triage vs. refinement-loop output)

These tiers are the internal triage view used in scan reports. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|-------|----------|--------|
| CRITICAL | personal_api_key (phx_*) shipped to client; session recording with no redaction config; raw PII (email, full name, SSN, card) in event properties; autocapture on signup/billing forms | BLOCK release |
| HIGH | Capture before identify (events orphaned to anonymous profile); missing identify on auth; missing group call in a B2B product; client-side-only capture of revenue events (subscription_started); EU customers on US Cloud | BLOCK before launch |
| MEDIUM | No event-naming allowlist; missing reverse proxy (ad-blocker losses); $process_person_profile=true on high-volume cheap events; per-render capture | Fix this sprint |
| LOW | Stale feature flags not retired; no warehouse batch export; missing in-page Toolbar tagging | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
engine: posthog-analytics
kind: |
  missing_identify | capture_before_identify | missing_group | pii_in_properties |
  autocapture_on_sensitive_form | session_recording_unredacted |
  personal_api_key_client_side | no_event_naming_convention |
  per_render_capture | client_only_revenue_event | wrong_cloud_region |
target_file: src/app/providers.tsx
line: 14
event_name: signup_completed                        # or '*' if applies to all captures in file
message: "session_recording enabled with no maskTextSelector — passwords and emails will be recorded"
suggested_fix: |
  Add to posthog.init options:
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true, email: true },
      maskTextSelector: '[data-sensitive], .ph-no-capture, input[type="password"], input[type="email"]',
    }
reference: https://posthog.com/docs/session-replay/privacy
```

The integrator uses `confidence` to weight findings: `high` blocks phase advancement, `medium` requires a documented decision in `## Decisions Taken Under Ambiguity`, `low` is informational.

## Test plan

```typescript
describe('PostHog instrumentation', () => {
  it('identify() fires before any post-auth capture() in the auth-callback handler', () => { /* ... */ });
  it('every server-side capture includes groups.organization in B2B mode', () => { /* ... */ });
  it('no capture() call uses a string literal not in the Events allowlist', () => { /* ESLint/Semgrep rule */ });
  it('session_recording config includes maskTextSelector and maskAllInputs', () => { /* ... */ });
  it('client init uses the project key (phc_*), never the personal key (phx_*)', () => { /* greps the bundle */ });
  it('EU project routes to https://eu.i.posthog.com', () => { /* env validation */ });
  it('subscription_started fires from the Stripe webhook, not the client', () => { /* ... */ });
  it('$process_person_profile: false on high-volume non-person events', () => { /* ... */ });
});
```

## Reverse-proxy setup (adblock-resistant)

```typescript
// next.config.mjs
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const ASSETS = POSTHOG_HOST.replace('://us.', '://us-assets.').replace('://eu.', '://eu-assets.');

const nextConfig = {
  async rewrites() {
    return [
      { source: '/ph/static/:path*', destination: `${ASSETS}/static/:path*` },
      { source: '/ph/:path*',        destination: `${POSTHOG_HOST}/:path*` },
    ];
  },
  skipTrailingSlashRedirect: true,
};
export default nextConfig;
```

Init the client with `api_host: '/ph'`. Ad-blockers see only a same-origin request.

## Sources

- [PostHog product analytics best practices](https://posthog.com/docs/product-analytics/best-practices)
- [PostHog group analytics for B2B](https://posthog.com/docs/product-analytics/group-analytics)
- [PostHog session replay privacy controls](https://posthog.com/docs/session-replay/privacy)
- [PostHog Cloud EU announcement](https://posthog.com/blog/posthog-cloud-eu)
- [PostHog & GDPR compliance](https://posthog.com/docs/privacy/gdpr-compliance)
- [PostHog Next.js integration](https://posthog.com/docs/libraries/next-js)
- [PostHog data collection controls](https://posthog.com/docs/privacy/data-collection)

---

## Refinement Loop — critic mode (v6.9.15-aligned)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every analytics defect — missing identify, missing group, PII leakage, unredacted recording, wrong-key-class, taxonomy drift, per-render capture — emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a missing identify call today is a six-month-later "why is our funnel broken since launch?" with no path to recover the lost events. Code that ships green-with-warnings ships with known latent failures.
