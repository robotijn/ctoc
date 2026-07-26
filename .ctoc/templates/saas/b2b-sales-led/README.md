# SaaS Template: B2B Sales-Led

**Default for**: B2B SaaS with sales-assisted GTM (mid-market and up), SSO required, organization-scoped data, contract billing.

**Recommended when**:
- Target customer is a company (SMB → enterprise)
- Buyer ≠ user (IT admin signs the contract; team members use the product)
- SSO (SAML / OIDC) is a hard requirement
- Compliance scope: SOC2 likely; HIPAA/GDPR sometimes
- Pricing is per-seat or annual contracts (not self-serve monthly)
- Use [`b2c-subscription`](../b2c-subscription/) instead if: self-serve signup, individual buyer, monthly billing

**Differs from b2c-subscription in five structural ways**:

1. **Auth**: WorkOS for SSO (SAML/OIDC + Directory Sync) instead of Clerk's email/social
2. **Data model**: every row scoped to `organization_id`, not just `user_id`
3. **Audit log**: customer-facing audit log required for SOC2
4. **Billing**: contract-based (Stripe invoices/checkout, not self-serve subscriptions)
5. **Authorization**: RBAC (admin / member roles) per organization

## Skill prerequisites

All in `skills/saas/` and `skills/security/` and `skills/compliance/`:

- `workos-sso` — B2B authentication + Directory Sync
- `multi-tenancy-row-level` — RLS by organization_id (NOT user_id)
- `stripe-subscriptions` — used for invoice-based billing (one-off + scheduled)
- `resend-email` — transactional email (invites, billing)
- `sentry-errors` — error monitoring
- `posthog-analytics` — product analytics (account-level events)
- `supabase-data` — Postgres + RLS
- `vercel-deploy` — deployment
- `inngest-jobs` — background jobs (invoice generation, SCIM events)
- `rate-limiting` — per-organization rate limits
- `legal-scaffold` — DPA + MSA + Privacy Policy + ToS
- `audit-log-checker` — SOC2-compliant audit trail
- `gdpr-compliance-checker` — for EU/UK customers

## Files

- [`manifest.yaml`](./manifest.yaml) — tech stack, RBAC model, contract billing pattern, required skills
- [`production-readiness.yaml`](./production-readiness.yaml) — pre-launch checklist for B2B (SSO tested, audit log working, DPA signed-with-buyer-ready)

## What B2B means structurally

```
B2C (b2c-subscription)             B2B (this template)
─────────────────────              ───────────────────
1 user = 1 account                  Many users → 1 organization
Email signup                        Email + corporate domain → IdP routing
Self-serve checkout                 Sales-assisted → contract → invoice billing
Per-user data                       Per-organization data (RLS by org_id)
Email/social auth                   SAML/OIDC SSO via WorkOS
"Settings" page                     "Org Settings" + "User Settings" split
Personal Stripe subscription        Org-level contract with seat-based pricing
Standard Privacy + ToS              + DPA + MSA + InfoSec questionnaire
```

## RBAC default model

```yaml
roles:
  - owner          # Created the org; can delete it; only one
  - admin          # Full access except delete org
  - member         # Standard user, scoped to assigned projects
  - billing_only   # Can view + modify billing, no product access
```

Stored in `users.role`. Enforced both in app middleware AND at DB level via RLS policies.

## Sales-led billing pattern

Unlike B2C self-serve subscriptions, B2B billing is typically:

1. **Sales conversation** → quote
2. **Signed order form** (DocuSign / PandaDoc) → terms
3. **Stripe Invoice** created server-side with negotiated price
4. **Customer pays** by ACH or wire (not self-serve credit card usually)
5. **Subscription activated** with custom MRR per the order form

The template's `stripe-subscriptions` usage is **invoice-based**, not Checkout:

```typescript
// Server-side invoice creation
const invoice = await stripe.invoices.create({
  customer: org.stripeCustomerId,
  collection_method: 'send_invoice',
  days_until_due: 30,
  custom_fields: [{ name: 'PO Number', value: order.poNumber }],
});
await stripe.invoiceItems.create({
  customer: org.stripeCustomerId,
  invoice: invoice.id,
  amount: order.annualPriceCents,
  description: `Annual subscription - ${order.seats} seats`,
});
await stripe.invoices.sendInvoice(invoice.id);
```

## SOC2 readiness

Building this template = on the path to SOC2 Type II if you:

1. Run audit log on every sensitive action ✓ (template includes)
2. Enforce RLS on every table ✓
3. Have a Privacy Policy + DPA ✓ (legal-scaffold generates)
4. Use SSO + MFA ✓ (WorkOS handles)
5. Monitor errors + alerting ✓ (Sentry)
6. Encrypted at rest + in transit ✓ (Supabase + Vercel default)
7. Backup + disaster recovery ✓ (Supabase Pro auto-backups)

You still need a SOC2 auditor (Vanta, Drata, or direct firm). But the template gets you 60%+ technical foundation.

## Estimated effort (MVP to first paying enterprise)

| Profile | Time |
|---|---|
| Technical founder | 80-160 hours (2-4 weeks full-time) |
| Founder + hired programmer | 120-240 hours of programmer + 40-60 founder |
| Solo programmer with template + skills familiar | 80-120 hours |

Longer than B2C because: SSO setup, SCIM testing, audit log instrumentation, contract billing implementation, RBAC enforcement, more rigorous security review.
