---
name: legal-scaffold
description: Generate Privacy Policy + Terms of Service + Cookie Policy + DPA templates from a small fact set (project name, domain, billing model, data collected).
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "privacy policy"
  - "terms of service"
  - "legal documents"
  - "DPA"
  - "cookie policy"
  - "GDPR documents"
  - "legal scaffolding"
  - "compliance documents"
related_skills:
  - compliance/gdpr-compliance-checker
  - compliance/license-scanner
effort_level: medium
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, WebFetch
---

# Legal Scaffold (saas skill)

> Generates the minimum legal documents needed before taking paying customers.

## Role

You produce drafts of Privacy Policy, Terms of Service, Cookie Policy, and DPA — using a small fact set as input. **You write drafts, not legal advice.** Every output declares clearly that a lawyer must review before going live.

## 2026 Best Practices

- **Privacy Policy** — required by GDPR, CCPA, LGPD. Cannot take EU/CA/BR traffic without it.
- **Terms of Service** — limits liability, sets governing law, defines acceptable use.
- **Cookie Policy** — required by GDPR. Often combined with Privacy.
- **DPA (Data Processing Agreement)** — required when you act as processor for a controller (B2B SaaS handling customer data).
- **AUP (Acceptable Use Policy)** — defines what customers can't do (spam, illegal content, etc.).
- **Audit trail of versions** — track when each doc was last updated. Email customers of material changes per Privacy Policy clause.
- **Get a lawyer to review** before launch. A few hundred dollars vs catastrophic liability exposure.

## Input fact set (collected from founder persona)

```yaml
project:
  name: YourApp
  legal_entity: "YourApp Inc."
  domain: yourapp.com
  contact_email: support@yourapp.com
  jurisdiction: Delaware, USA  # governing law

data_collected:
  - email
  - name (from Clerk)
  - billing_address (from Stripe)
  - payment_method_last4 (via Stripe — you never store full PAN)
  - user_content      # what the SaaS stores on the user's behalf
  - usage_analytics   # PostHog events
  - cookies: [session, posthog, csrf]

third_parties:
  - name: Stripe
    purpose: payment processing
    data_shared: [name, email, billing_address, payment_method]
    privacy_url: https://stripe.com/privacy
  - name: Clerk
    purpose: authentication
    data_shared: [email, name, ip_address]
    privacy_url: https://clerk.com/privacy
  - name: Resend
    purpose: transactional email
    data_shared: [email]
    privacy_url: https://resend.com/privacy
  - name: PostHog
    purpose: product analytics
    data_shared: [user_id, ip_address (truncated), event_metadata]
    privacy_url: https://posthog.com/privacy
  - name: Sentry
    purpose: error monitoring
    data_shared: [user_id, ip_address, error_metadata]
    privacy_url: https://sentry.io/privacy

billing_model: subscription   # subscription | one-time | usage | freemium
refund_policy: "30-day full refund on first subscription period"
data_retention_days: 30        # after account deletion
```

## Generation outputs

For each fact set, produce drafts to:

```
public/legal/
├── privacy.md           ← Privacy Policy (Markdown rendered at /legal/privacy)
├── terms.md             ← Terms of Service
├── cookies.md           ← Cookie Policy
├── dpa.md               ← Data Processing Agreement (for B2B downloads)
└── aup.md               ← Acceptable Use Policy
```

Each draft includes a **MUST-FIX-BEFORE-PUBLISHING** header listing items requiring legal review.

## Privacy Policy template structure

```markdown
# Privacy Policy
**Last updated**: {{LAST_UPDATED_DATE}}
**Effective date**: {{EFFECTIVE_DATE}}

> ⚠️ DRAFT — A lawyer must review this before publishing.
> Items needing legal review are marked with [REVIEW].

## 1. Who we are
{{LEGAL_ENTITY}} ("we", "us") operates {{DOMAIN}} (the "Service").
Contact: {{CONTACT_EMAIL}}

## 2. Data we collect
We collect:
- **Account data**: {{LIST_OF_ACCOUNT_DATA}}
- **Billing data**: {{LIST_OF_BILLING_DATA}} (processed by Stripe)
- **Usage data**: {{LIST_OF_USAGE_DATA}}
- **Cookies**: {{LIST_OF_COOKIES}}

## 3. Why we collect it
- Provide the Service
- Process billing
- Send transactional and (with consent) marketing emails
- Improve the Service via analytics
- Comply with legal obligations

## 4. Legal basis (GDPR Art. 6)
- **Contract**: account data, billing data (necessary to perform the Service)
- **Legitimate interest**: usage analytics (with cookie consent)
- **Consent**: marketing communications
- **Legal obligation**: tax records, fraud prevention

## 5. Third parties we share data with
{{THIRD_PARTIES_TABLE}}

We do not sell your data.

## 6. Data retention
- Active accounts: until account closure
- Closed accounts: {{DATA_RETENTION_DAYS}} days, then deleted (or anonymized for analytics)
- Billing records: 7 years (tax law)

## 7. Your rights (GDPR / CCPA)
- Access: download your data via /account/export
- Rectification: edit your profile or email {{CONTACT_EMAIL}}
- Erasure: delete your account at /account/delete
- Portability: download in JSON via /account/export
- Object: opt out of analytics in /account/privacy
- Lodge a complaint: with your supervisory authority

## 8. Cookies
See [Cookie Policy]({{COOKIES_URL}}).

## 9. Children
The Service is not directed to children under 13 (or 16 in EEA). [REVIEW: confirm age threshold per jurisdiction]

## 10. International transfers
{{IF_EU_TO_US: We rely on Standard Contractual Clauses for transfers to the US...}}

## 11. Security
- HTTPS in transit
- Encryption at rest (Postgres + S3 server-side)
- Row-level security per user
- Quarterly access reviews
- Security incidents notified within 72 hours per GDPR Art. 33

## 12. Changes
Material changes notified 30 days before effective date via email.

## 13. Contact
Data Protection Officer: {{DPO_EMAIL_OR_NONE}}
General: {{CONTACT_EMAIL}}
```

## Terms of Service template structure

```markdown
# Terms of Service
**Last updated**: {{LAST_UPDATED_DATE}}

> ⚠️ DRAFT — A lawyer must review this before publishing.

## 1. Acceptance
By using {{DOMAIN}}, you agree to these Terms.

## 2. The Service
{{ONE_LINE_DESCRIPTION_FROM_VISION}}

## 3. Accounts
You must be 18+ (or your jurisdiction's age of majority). You're responsible for your account.

## 4. Subscription and billing
- Billed {{BILLING_CYCLE}} via Stripe.
- Auto-renews unless canceled.
- Cancel anytime in /account; access continues until period end.
- Refunds: {{REFUND_POLICY}}.

## 5. Acceptable Use
You will NOT:
- Reverse engineer, scrape, or resell.
- Use for illegal purposes.
- Send spam or harmful content.
- Attempt to access other users' data.

See [AUP]({{AUP_URL}}) for full list.

## 6. Intellectual property
- Your content remains yours.
- You grant us a license to host/display it as needed to operate the Service.

## 7. Termination
We may suspend or terminate for violation. You may close your account anytime.

## 8. Warranty disclaimer
The Service is provided "AS IS". [REVIEW: jurisdiction-specific limits]

## 9. Limitation of liability
[REVIEW: cap at amount paid in last 12 months or $100, whichever greater]

## 10. Indemnification
You indemnify us against claims from your misuse.

## 11. Governing law
{{JURISDICTION}}.

## 12. Disputes
[REVIEW: arbitration clause or court jurisdiction]

## 13. Changes
Material changes notified 30 days before.

## 14. Contact
{{CONTACT_EMAIL}}
```

## Cookie Policy + DPA + AUP

Similar template structure — generated from same fact set.

## Production-readiness integration

The `production-readiness.yaml` for `saas/b2c-subscription` has:
- `legal/privacy_policy: severity: block`
- `legal/terms_of_service: severity: block`
- `legal/cookie_consent: severity: warn`

This skill generates the drafts; the founder persona reviews + posts them; the production-readiness checker verifies they're live at `/legal/*`.

## Critical pitfalls

1. **Generic-copy templates** — courts have invalidated copy-paste privacy policies. Customize per your data.
2. **Missing third-party disclosure** — every external service handling user data MUST be listed.
3. **Wrong jurisdiction** — pick one (your incorporation state + a fallback) and stick with it.
4. **No version history** — must be able to show what the ToS said when a user signed up.
5. **Posted without lawyer review** — for B2C with EU traffic, this is genuinely risky. Budget $500-2000 for a startup-lawyer review.

## Sources

- [GDPR full text](https://gdpr-info.eu/)
- [CCPA overview (CA AG)](https://oag.ca.gov/privacy/ccpa)
- [Privacy Policy generator references (TermsFeed)](https://www.termsfeed.com/) — for structure reference, NOT for the final output
- [Iubenda template structure (legal SaaS)](https://www.iubenda.com/)
