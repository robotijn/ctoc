# SaaS Template: B2C Subscription

**Default for**: consumer-facing SaaS with self-serve subscription billing.

**Recommended when**:
- Target customer is an individual or small team (B2C / prosumer)
- Pricing model is freemium or paid tiers with monthly/annual billing
- No enterprise SSO required (use [`b2b-sales-led`](../b2b-sales-led/) if SSO needed)
- Self-serve signup → activation → paid conversion is the primary funnel

**Skill prerequisites** (all in `skills/saas/`):
- `stripe-subscriptions` — checkout, webhooks, plan changes, dunning, proration
- `clerk-auth` — signup, login, email verification, session management
- `resend-email` — transactional email with verified domain
- `posthog-analytics` — product event tracking + funnel analysis
- `multi-tenancy-row-level` — per-user data isolation via Postgres RLS
- `legal-scaffold` — Privacy Policy + ToS + DPA + Cookie Policy generators

## Files

- [`manifest.yaml`](./manifest.yaml) — tech stack defaults, required skills, setup steps
- [`production-readiness.yaml`](./production-readiness.yaml) — pre-launch checklist for paying customers

## Quick start (if you trust the defaults)

```
1. Run /ctoc:menu and start a new vision with project type "saas-b2c"
2. CTO Chief consults this template
3. Vision-advisor + product-owner ask founder-facing questions (per persona routing)
4. Implementation-planner generates the impl plan against this template's stack
5. Iron Loop builds it
6. Production-readiness gate blocks ship until the checklist passes
```

## What this template assumes you'll need

A successful B2C SaaS needs all of these working together at launch:

- Authenticated signup with email verification
- Subscription checkout (Stripe Checkout or Embedded)
- Customer Billing Portal (Stripe-hosted) for self-serve plan changes
- Webhook handler for `customer.subscription.{created,updated,deleted}` and `invoice.payment_failed`
- Email: welcome, password reset, subscription receipts, dunning
- Product analytics: signup → activation → first value → conversion funnel
- Error monitoring (Sentry)
- Privacy Policy + ToS + Cookie banner (especially for EU traffic)
- Status page (optional but recommended for $$$ tiers)

The template's `production-readiness.yaml` lists every one of these as a gate.

## What's NOT in this template (and why)

- **SSO** — that's `b2b-sales-led`. B2C users use email+password or social.
- **Multi-org tenancy** — single-user accounts. `b2b-sales-led` has organizations.
- **Audit logging** — overkill for B2C. Compliance scope `none` or `GDPR` only.
- **Sales pipeline / CRM** — self-serve product; no sales required.
- **Quotes / contracts** — flat pricing only; custom enterprise comes via separate template.

## Customizations the user can override

When a `technical-founder` or `programmer` accepts this template, they can override:
- Auth provider (Clerk → Supabase Auth, Auth.js, Lucia)
- Payments provider (Stripe → Paddle for MoR / tax handling)
- Database (Postgres-Supabase → Postgres-Neon, PlanetScale)
- Email (Resend → Postmark, SendGrid)
- Analytics (PostHog → Mixpanel, Amplitude)

When a `founder` (non-technical) accepts this template, overrides are deferred to a `programmer` persona via the deferral queue.
