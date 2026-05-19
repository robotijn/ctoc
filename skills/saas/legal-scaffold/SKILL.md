---
name: legal-scaffold
description: Generate Privacy Policy + Terms of Service + Cookie Policy + DPA + AUP templates from a small fact set (project name, domain, billing model, data collected, AI usage, jurisdictions).
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
  - "Quebec Law 25"
  - "CCPA"
  - "CPRA"
  - "EU AI Act"
  - "DSA"
  - "subprocessor list"
  - "AUP"
  - "data retention"
  - "right to delete"
  - "data portability"
related_skills:
  - compliance/gdpr-compliance-checker
  - compliance/license-scanner
  - quality/accessibility-checker
effort_level: medium
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, WebFetch
---

# Legal Scaffold (saas skill)

> Generates the minimum legal documents needed before taking paying customers — across EU/UK/CA/QC/US.
> **You write drafts, not legal advice.** Every output declares clearly that a lawyer must review before going live.

## Role

You produce drafts of Privacy Policy, Terms of Service, Cookie Policy, DPA, and AUP — using a small fact set as input. You also produce the operational artifacts the regulations actually require (public subprocessor list, data-retention schedule, DSAR workflow notes, AI-disclosure block when the app uses an LLM). You never claim to provide legal advice.

## 2026 Best Practices

The legal surface for a SaaS in 2026 is wider than it was even in 2024. Quebec Law 25's portability right took effect 22 September 2024, the EU AI Act's Article 50 transparency obligations and Annex III high-risk requirements apply from 2 August 2026, and the EU Digital Services Act has been in full effect since 17 February 2024. A privacy policy alone is no longer the floor.

**Mandatory documents (B2C SaaS with EU/UK/CA/QC/US traffic):**

| Document | Required by | Notes |
|---|---|---|
| Privacy Policy | GDPR Art. 13–14, CCPA/CPRA §1798.130, Quebec Law 25 §8, LGPD Art. 9 | Cannot take regulated-region traffic without it |
| Terms of Service | Practical necessity for limitation of liability, governing law, arbitration | Courts have invalidated clickwrap with no clear assent |
| Cookie Policy + Consent Banner | GDPR/ePrivacy Art. 5(3), Quebec Law 25 (explicit opt-in for tracking tech) | Must allow granular reject; reject must be as easy as accept |
| DPA (Data Processing Agreement) | GDPR Art. 28 | Required when you process customer data on their behalf (B2B); customers expect to sign one before they sign up |
| AUP (Acceptable Use Policy) | Practical / DSA Art. 14 (T&Cs clarity for online intermediaries) | Defines what customers can't do |
| Subprocessor list (public) | GDPR Art. 28(2), customer contractual right | Public URL; 30-day advance notice of changes; objection mechanism |
| Data retention schedule | GDPR Art. 5(1)(e), CCPA §1798.105, Quebec Law 25 §23 | Documented per data category |
| Right-to-delete workflow | GDPR Art. 17, CCPA §1798.105, Quebec Law 25 §28.1 | Self-serve UI at `/account/delete`; verification step |
| Data-portability export | GDPR Art. 20, Quebec Law 25 §27 (effective 22 Sep 2024), CCPA §1798.130 | Machine-readable (JSON / CSV); self-serve at `/account/export` |
| Age gate | COPPA (under 13 US), GDPR Art. 8 (under 16 EU default; member-state floor 13) | Verifiable consent above floor; account block below |
| Accessibility statement | EU EAA (28 Jun 2025), ADA (US web cases) | Cross-link [[accessibility-checker]]; WCAG 2.2 AA target |
| AI disclosure | EU AI Act Art. 50 (from 2 Aug 2026) | Required if the app uses an LLM, generates synthetic media, performs emotion recognition, or biometric categorization |

**Operational practices the regulators actually inspect:**

- **Privacy Officer / DPO** — Quebec Law 25 requires a "person in charge of the protection of personal information" whose title and contact details are publicly listed (the modernized Quebec Act, Chapter P-39.1). GDPR Art. 37 requires a DPO for large-scale processing of special categories or systematic monitoring. Name a real person; an `@yourapp.com` alias alone is not enough where the role is mandatory.
- **DSAR (Data Subject Access Request) SLA** — GDPR Art. 12(3) gives 1 month (extendable by 2 further months for complexity, with notice). Quebec Law 25: 30 days. CCPA/CPRA §1798.130(a)(2): 45 days (one 45-day extension permitted). Track and meet whichever is tightest for your user base.
- **Transfer Impact Assessment (TIA)** — Quebec Law 25 requires a privacy impact assessment before disclosing personal information outside Quebec. EU Standard Contractual Clauses (SCCs) require a documented TIA per Schrems II (CJEU C-311/18). Listing SCCs in your DPA without a TIA is non-compliant.
- **Subprocessor change notice** — 30 days advance with objection mechanism is the SaaS-industry norm and aligns with what enterprise customers will demand in negotiated DPAs.
- **Breach notification** — 72 hours to supervisory authority per GDPR Art. 33. Quebec Law 25 requires prompt notice to the Commission d'accès à l'information (CAI) and affected individuals when the breach presents a risk of serious injury. Document the runbook in the DPA's security annex.
- **Audit trail of policy versions** — must show which version was in force on a given date (for any subscriber sign-up dispute). Store in git with effective-date frontmatter; cross-link from /legal/* with a "previous versions" footer.
- **AI-system disclosure (EU AI Act Art. 50)** — chatbots must disclose AI; deepfake/synthetic content must be labeled; AI-generated text on matters of public interest must be disclosed; emotion-recognition and biometric-categorization systems must inform exposed individuals. Applies extraterritorially to non-EU SaaS with EU users. Penalty tiers: up to €35M or 7% of worldwide annual turnover for prohibited practices (Art. 5); up to €15M or 3% for other obligations (incl. high-risk and transparency); up to €7.5M or 1% for supplying incorrect information.

**Lawyer review is still required.** Generated drafts are a starting point; jurisdictional clauses (limitation of liability, arbitration, age gate, special-category data) require a licensed attorney in the relevant jurisdiction.

## Input fact set (collected from founder persona)

```yaml
project:
  name: YourApp
  legal_entity: "YourApp Inc."
  domain: yourapp.com
  contact_email: support@yourapp.com
  privacy_email: privacy@yourapp.com
  dpo_or_privacy_officer:
    name: "Jane Doe"
    email: "dpo@yourapp.com"
  jurisdiction: Delaware, USA           # governing law for ToS
  target_regions: [US, EU, UK, CA, QC]  # drives which docs / clauses

data_collected:
  - email
  - name (from Clerk)
  - billing_address (from Stripe)
  - payment_method_last4 (via Stripe — you never store full PAN)
  - user_content      # what the SaaS stores on the user's behalf
  - usage_analytics   # PostHog events
  - ip_address (truncated to /24 for IPv4, /48 for IPv6 in analytics)
  - cookies: [session, posthog, csrf]

uses_ai: true                            # triggers EU AI Act Art. 50 disclosure block
ai_systems:
  - kind: chatbot
    purpose: customer support
    model_family: claude-opus-4-7
    user_facing: true
  - kind: content_generation
    purpose: draft writing assistance
    user_facing: true

third_parties:                           # source of truth for the public subprocessor list
  - name: Stripe
    purpose: payment processing
    data_shared: [name, email, billing_address, payment_method]
    location: USA, Ireland
    privacy_url: https://stripe.com/privacy
    dpa_url: https://stripe.com/legal/dpa
  - name: Clerk
    purpose: authentication
    data_shared: [email, name, ip_address]
    location: USA
    privacy_url: https://clerk.com/privacy
    dpa_url: https://clerk.com/legal/dpa
  - name: Resend
    purpose: transactional email
    data_shared: [email]
    location: USA
    privacy_url: https://resend.com/privacy
  - name: PostHog
    purpose: product analytics
    data_shared: [user_id, ip_address (truncated), event_metadata]
    location: USA, EU (configurable)
    privacy_url: https://posthog.com/privacy
  - name: Sentry
    purpose: error monitoring
    data_shared: [user_id, ip_address, error_metadata]
    location: USA
    privacy_url: https://sentry.io/privacy
  - name: Anthropic
    purpose: AI inference (Claude API)
    data_shared: [prompt_text, may_include_user_content]
    location: USA
    privacy_url: https://www.anthropic.com/legal/privacy

billing_model: subscription           # subscription | one-time | usage | freemium
refund_policy: "30-day full refund on first subscription period"
data_retention:
  active_account: "until account closure"
  closed_account_days: 30             # then permanent deletion (analytics anonymized)
  billing_records_years: 7            # tax-law minimum
  logs_days: 90                       # operational logs
  backups_days: 35                    # rolling backups
age_floor: 16                         # EEA default; 13 for US-only
```

## Generation outputs

For each fact set, produce drafts to:

```
public/legal/
├── privacy.md            ← Privacy Policy (Markdown, rendered at /legal/privacy)
├── terms.md              ← Terms of Service
├── cookies.md            ← Cookie Policy
├── dpa.md                ← Data Processing Agreement (downloadable PDF for B2B)
├── aup.md                ← Acceptable Use Policy
├── subprocessors.md      ← Public subprocessor list (RSS feed of changes recommended)
├── retention.md          ← Data retention schedule
├── ai-disclosure.md      ← EU AI Act Art. 50 disclosures (if uses_ai: true)
└── accessibility.md      ← Accessibility statement (cross-link [[accessibility-checker]])
```

Each draft includes a **MUST-FIX-BEFORE-PUBLISHING** header listing items requiring legal review.

## Foundational code example — serving and linking policy URLs

Legal documents only protect you if every user actually sees them and every footer/signup links to the version in force. This is the minimum code surface that ties the markdown drafts above to the running app. Three runtimes, one shape: route `/legal/{slug}`, render the matching markdown, log the version served (for any future dispute).

```typescript
// app/legal/[slug]/page.tsx — Next.js 15 App Router (TypeScript)
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const VALID = new Set([
  "privacy", "terms", "cookies", "dpa", "aup",
  "subprocessors", "retention", "ai-disclosure", "accessibility",
]);

export const dynamicParams = false;
export async function generateStaticParams() {
  return [...VALID].map((slug) => ({ slug }));
}

export default async function LegalPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!VALID.has(slug)) notFound();
  const file = path.join(process.cwd(), "public", "legal", `${slug}.md`);
  const md = await readFile(file, "utf8");
  return (
    <article
      className="prose mx-auto p-6"
      dangerouslySetInnerHTML={{ __html: marked.parse(md) }}
    />
  );
}
// Footer (app/components/Footer.tsx): always link policy URLs from every page.
// <Link href="/legal/privacy">Privacy</Link> · <Link href="/legal/terms">Terms</Link>
// <Link href="/legal/cookies">Cookies</Link> · <Link href="/legal/subprocessors">Subprocessors</Link>
// <Link href="/legal/accessibility">Accessibility</Link>
```

```python
# main.py — FastAPI route serving /legal/{policy}
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
import markdown

app = FastAPI()
LEGAL_DIR = Path(__file__).parent / "public" / "legal"
VALID = {
    "privacy", "terms", "cookies", "dpa", "aup",
    "subprocessors", "retention", "ai-disclosure", "accessibility",
}

@app.get("/legal/{policy}", response_class=HTMLResponse)
def get_policy(policy: str) -> HTMLResponse:
    if policy not in VALID:
        raise HTTPException(status_code=404, detail="unknown policy")
    src = LEGAL_DIR / f"{policy}.md"
    if not src.is_file():
        raise HTTPException(status_code=404, detail="policy missing")
    html = markdown.markdown(src.read_text(encoding="utf-8"))
    # Optional: log policy_id + version_hash served, for audit trail.
    return HTMLResponse(f"<article>{html}</article>")
```

```csharp
// Program.cs — .NET 9 minimal API serving /legal/{policy}
using Markdig;

var app = WebApplication.CreateBuilder(args).Build();
var legalDir = Path.Combine(app.Environment.ContentRootPath, "public", "legal");
var valid = new HashSet<string>(StringComparer.Ordinal) {
    "privacy", "terms", "cookies", "dpa", "aup",
    "subprocessors", "retention", "ai-disclosure", "accessibility",
};
var pipeline = new MarkdownPipelineBuilder().UseAdvancedExtensions().Build();

app.MapGet("/legal/{policy}", (string policy) =>
{
    if (!valid.Contains(policy)) return Results.NotFound();
    var src = Path.Combine(legalDir, $"{policy}.md");
    if (!File.Exists(src)) return Results.NotFound();
    var html = Markdown.ToHtml(File.ReadAllText(src), pipeline);
    // Audit-log policy + version hash on each render for dispute reconstruction.
    return Results.Content($"<article>{html}</article>", "text/html");
});

app.Run();
```

**Skipped languages (with rationale):**
- **C / C++** — legal-document serving is a high-level web concern. Native code is the wrong runtime tier; we do not encourage SaaS founders to write a Markdown-rendering HTTP server in C. If a CLI binary needs to point at policies, it can ship a `--privacy-policy-url` flag, not embed the rendering.
- **SQL** — a database is the wrong rendering surface for human-readable legal text. Store *audit metadata* (version_id, served_at, user_id) in SQL; store the document text on disk under version control.

## Privacy Policy template structure

```markdown
# Privacy Policy
**Last updated**: {{LAST_UPDATED_DATE}}
**Effective date**: {{EFFECTIVE_DATE}}
**Version**: {{VERSION_ID}}     (see /legal/privacy/history for previous versions)

> DRAFT — A licensed attorney must review this before publishing.
> Items needing legal review are marked with [REVIEW].

## 1. Who we are
{{LEGAL_ENTITY}} ("we", "us") operates {{DOMAIN}} (the "Service").
Contact: {{CONTACT_EMAIL}} · Privacy: {{PRIVACY_EMAIL}}
{{IF_DPO: Data Protection Officer / Privacy Officer (Quebec Law 25 §3.1): {{DPO_NAME}}, {{DPO_EMAIL}}}}

## 2. Data we collect
- **Account data**: {{LIST_OF_ACCOUNT_DATA}}
- **Billing data**: {{LIST_OF_BILLING_DATA}} (processed by Stripe; we store only last4 + token)
- **Usage data**: {{LIST_OF_USAGE_DATA}}
- **Cookies and similar technologies**: {{LIST_OF_COOKIES}} — see Cookie Policy

## 3. Why we collect it
- Provide the Service · Process billing · Send transactional and (with consent) marketing emails · Improve the Service via analytics · Comply with legal obligations

## 4. Legal basis (GDPR Art. 6)
- **Contract** (Art. 6(1)(b)): account data, billing data
- **Legitimate interest** (Art. 6(1)(f)): security, fraud prevention, aggregated analytics
- **Consent** (Art. 6(1)(a)): marketing communications, non-essential cookies, optional AI features
- **Legal obligation** (Art. 6(1)(c)): tax records (7 years), legal hold

## 5. Third parties we share data with
{{THIRD_PARTIES_TABLE}}  (see live list at /legal/subprocessors)
We do not sell your data. (CCPA/CPRA §1798.140(t): no sale or sharing for cross-context behavioral advertising.)

## 6. Data retention
See /legal/retention for the per-category schedule.
- Active accounts: until account closure
- Closed accounts: {{CLOSED_ACCOUNT_DAYS}} days, then permanently deleted (analytics anonymized)
- Billing records: 7 years (tax law) · Backups: rolling {{BACKUPS_DAYS}} days · Logs: {{LOGS_DAYS}} days

## 7. Your rights
You may exercise these rights via /account/privacy or by emailing {{PRIVACY_EMAIL}}.

- **Access** (GDPR Art. 15, CCPA §1798.110, Quebec Law 25 §27): download your data via /account/export
- **Rectification** (GDPR Art. 16, Quebec Law 25 §28): edit your profile
- **Erasure** (GDPR Art. 17, CCPA §1798.105, Quebec Law 25 §28.1): /account/delete
- **Portability** (GDPR Art. 20, Quebec Law 25 §27 effective 22 Sep 2024, CCPA §1798.130): JSON export via /account/export
- **Object / opt-out** (GDPR Art. 21, CCPA §1798.120, Quebec Law 25 §12.1): /account/privacy
- **Withdraw consent** (GDPR Art. 7(3)): /account/privacy
- **Automated decision-making** (GDPR Art. 22, Quebec Law 25 §12.1): if applicable, see §13 below
- **Lodge a complaint**: with your supervisory authority — for EU, your national DPA · for Quebec, the Commission d'accès à l'information (CAI) · for California, the CPPA

We respond to requests within: 30 days (GDPR / Quebec Law 25) or 45 days (CCPA), extendable with notice.

## 8. Cookies
See [Cookie Policy]({{COOKIES_URL}}). For users in Quebec and the EU, tracking technologies require explicit opt-in (Quebec Law 25, GDPR/ePrivacy Art. 5(3)).

## 9. Children
The Service is not directed to children under {{AGE_FLOOR}}. [REVIEW: COPPA verifiable parental consent under 13 (US); GDPR Art. 8 member-state floor 13–16 (EU); confirm Quebec Law 25 age-of-consent specifics with counsel.]

## 10. International transfers
{{IF_EU_TO_US: We rely on Standard Contractual Clauses (Commission Decision 2021/914) for transfers to the US, with a Transfer Impact Assessment per Schrems II (CJEU C-311/18). Where the EU-US Data Privacy Framework applies, we list our certification status in /legal/subprocessors.}}
{{IF_QC_OUTBOUND: We conduct a Privacy Impact Assessment before transferring personal information outside Quebec, as required by Quebec Law 25.}}

## 11. Security
- HTTPS in transit · Encryption at rest (Postgres + S3 server-side, AES-256)
- Row-level security per tenant · Quarterly access reviews
- Security incidents notified within 72 hours per GDPR Art. 33; prompt notice to the CAI under Quebec Law 25 when a breach presents a risk of serious injury

## 12. AI / automated processing
{{IF_USES_AI: This Service uses AI systems for {{AI_PURPOSES}}. See /legal/ai-disclosure for EU AI Act Art. 50 transparency information. No solely automated decisions producing legal or similarly significant effects are made about you without human review.}}

## 13. Changes
Material changes notified 30 days before effective date via email. Previous versions archived at /legal/privacy/history.

## 14. Contact
Privacy / DPO: {{DPO_EMAIL_OR_PRIVACY_EMAIL}} · General: {{CONTACT_EMAIL}}
```

## Terms of Service template structure

```markdown
# Terms of Service
**Last updated**: {{LAST_UPDATED_DATE}}
**Version**: {{VERSION_ID}}

> DRAFT — A licensed attorney must review this before publishing.

## 1. Acceptance
By creating an account or using {{DOMAIN}}, you agree to these Terms.
{{CLICKWRAP_ASSENT_NOTE: signup form must have a separate "I agree to the Terms and Privacy Policy" checkbox with linked text; bundled assent has been invalidated by courts (e.g., Berkson v. Gogo).}}

## 2. The Service
{{ONE_LINE_DESCRIPTION_FROM_VISION}}

## 3. Accounts
You must be {{AGE_FLOOR}}+ to create an account. You are responsible for your account credentials and activity.

## 4. Subscription and billing
- Billed {{BILLING_CYCLE}} via Stripe.
- Auto-renews unless canceled.
- Cancel anytime in /account; access continues until the end of the paid period.
- Refunds: {{REFUND_POLICY}}.
- Price changes notified ≥30 days in advance.

## 5. Acceptable Use
See [AUP]({{AUP_URL}}) for the full list. You will NOT use the Service to: reverse engineer, scrape, or resell · violate law · send spam · access other users' data · generate or distribute illegal content · circumvent rate limits.

## 6. Intellectual property
- Your content remains yours.
- You grant us a non-exclusive, worldwide, royalty-free license to host, display, transmit, and back up your content solely to operate the Service.
- {{IF_USES_AI: AI outputs you generate using the Service are yours, subject to the Service AUP and any usage limits on the underlying model.}}

## 7. Termination
We may suspend or terminate for material breach or unlawful use. You may close your account anytime; on closure, we follow the retention schedule at /legal/retention.

## 8. Warranty disclaimer
The Service is provided "AS IS". [REVIEW: jurisdiction-specific consumer protection limits — UCTA in UK, consumer rights in EU member states, implied warranties in some US states.]

## 9. Limitation of liability
[REVIEW: cap at amount paid in last 12 months OR $100 (whichever greater); carve-outs required for gross negligence / willful misconduct / death or personal injury / consumer rights that cannot be waived in some jurisdictions.]

## 10. Indemnification
You indemnify us against third-party claims arising from your misuse or your content.

## 11. Governing law
{{JURISDICTION}}. [REVIEW: consumer protection laws of customer's residence may apply notwithstanding the choice of law; e.g., EU consumer-rights directive, Quebec C.c.Q.]

## 12. Disputes
[REVIEW: binding arbitration with class-action waiver (US-style) OR exclusive court jurisdiction (EU/CA/UK preferred). US arbitration must comply with FAA + provide an opt-out window. For EU consumers, mandatory arbitration is generally unenforceable for B2C — use ODR per Regulation 524/2013.]

## 13. Changes
Material changes notified 30 days before. Continued use after the effective date constitutes acceptance.

## 14. Contact
{{CONTACT_EMAIL}}
```

## Cookie Policy + DPA + AUP + Subprocessors + Retention + AI Disclosure

Same template approach — generated from the same fact set. Key constraints per document:

**Cookie Policy** — list every cookie by name, purpose, duration, and category (strictly-necessary / functional / analytics / marketing). Quebec Law 25 and GDPR/ePrivacy Art. 5(3) both require **explicit opt-in** for non-essential cookies; "by continuing to browse you consent" banners are not compliant. Reject-All must be as easy as Accept-All (CNIL, EDPB).

**DPA** — bind to GDPR Art. 28 sub-clauses (a)–(h): processor acts only on documented instructions; confidentiality; security (Art. 32); subprocessor authorization (Art. 28(2) — general written authorization plus 30-day change notice); assistance with DSAR; assistance with Art. 32–36 (security, breach, DPIA); deletion/return at end of term; audit/inspection right. Include SCC module 2 (controller-to-processor) as Annex if you transfer EU data to the US, with Transfer Impact Assessment text.

**AUP** — restrict: spam, malware distribution, scraping, illegal content, IP infringement, harassment, CSAM (mandatory NCMEC reporting in US), election interference (DSA Art. 35 for VLOPs), AI-generated synthetic media without disclosure (EU AI Act Art. 50(4)).

**Subprocessor list (public)** — name, purpose, location (country), data categories shared, link to their privacy/DPA. RSS or email-subscription mechanism for changes; 30-day advance notice; customer objection right.

**Retention schedule** — per data category: legal basis, retention period, deletion mechanism, backup-rotation horizon. GDPR Art. 5(1)(e) requires "no longer than necessary"; "indefinite" is not a valid period.

**AI Disclosure (only if `uses_ai: true`)** — per EU AI Act Art. 50, effective 2 August 2026:
- Chatbots / conversational AI must disclose AI nature at first interaction.
- AI-generated or manipulated audio/image/video/text (deepfakes / synthetic media) must be labeled in a machine-readable manner.
- AI-generated text published to inform the public on matters of public interest must be disclosed.
- Emotion-recognition and biometric-categorization systems must inform exposed individuals.
- Penalties: up to €35M or 7% of global annual turnover.

## Production-readiness integration

The `production-readiness.yaml` for `saas/b2c-subscription` includes:
- `legal/privacy_policy: severity: block`
- `legal/terms_of_service: severity: block`
- `legal/cookie_consent: severity: block` (was `warn`; tightened given Quebec Law 25 enforcement + EU Cookie Sweeps)
- `legal/subprocessor_list_public: severity: block`
- `legal/data_retention_schedule: severity: block`
- `legal/right_to_delete_ui: severity: block` (at `/account/delete`)
- `legal/data_export_endpoint: severity: block` (at `/account/export`)
- `legal/dpa_downloadable: severity: warn` (block for B2B)
- `legal/ai_disclosure: severity: block` (if `uses_ai: true`)
- `legal/accessibility_statement: severity: warn` (cross-link [[accessibility-checker]])

This skill generates the drafts; the founder persona reviews + posts them; production-readiness verifies they're live at `/legal/*` with current effective-date frontmatter.

## Critical pitfalls (audit categories)

The categories below are exactly the `kind` values this skill emits in its letter to CTO Chief.

1. **missing-policy** — no Privacy Policy, ToS, Cookie Policy, DPA, AUP, or AI Disclosure on a live SaaS that accepts payments / EU traffic.
2. **outdated-policy** — `last_updated` > 12 months ago, or refers to deprecated regulations (Safe Harbor, Privacy Shield), or missing post-2024 obligations (Quebec Law 25 portability, EU AI Act Art. 50).
3. **regulatory-gap** — references GDPR but not CCPA when serving California users (or vice versa); missing Quebec Law 25 disclosures; no DSA Art. 14 clear T&Cs notice for relevant intermediaries.
4. **generic-boilerplate** — copy-pasted template without app-specific data categories, third parties, or retention. Courts have invalidated generic policies (e.g., FTC settlements requiring specific disclosure).
5. **missing-subprocessor-list** — public list absent, stale, or missing third parties documented in code (e.g., Sentry referenced in code but not listed).
6. **no-data-retention-schedule** — policy says "retained as long as needed" without per-category period.
7. **no-right-to-delete-ui** — policy promises deletion but no self-serve endpoint; only an email address (slow, fails DSAR SLA).
8. **no-data-export-endpoint** — Art. 20 / Quebec §27 portability right not operationalized.
9. **missing-ai-disclosure** — `uses_ai: true` but no Art. 50 disclosure block, no chatbot AI-notice, no synthetic-media labeling.
10. **missing-cookie-banner-or-reject-all-asymmetric** — banner accepts by default, or Reject-All is hidden behind a settings page (CNIL fines: Google €150M, Facebook €60M).
11. **missing-dpa-template** — B2B SaaS without a downloadable DPA blocks enterprise procurement.
12. **missing-dpo-or-privacy-officer** — Quebec Law 25 §3.1 / GDPR Art. 37 require a named person, not a generic alias.
13. **no-version-history** — cannot show which ToS version a user agreed to on signup date.
14. **wrong-jurisdiction-or-missing-tia** — SCCs listed without Transfer Impact Assessment; Quebec outbound transfer without §17 PIA.
15. **broken-clickwrap** — signup bundles assent without a separate checkbox; courts have invalidated.

## Tool Integration (2026)

| Tool | Use | Caveat |
|---|---|---|
| **Termly** | Policy generators (Privacy, ToS, Cookie, DPA), free tier + paid | Generated policies need legal review; templates lean US-centric |
| **iubenda** | Multi-jurisdiction policy generator, cookie consent banner (TCF v2.2), DPA library | Strong on EU; sells per-policy; suitable for solo founders |
| **Termageddon** | Policy generator, US/EU/CA/QC coverage, attorney-drafted base | Subscription model; updates pushed as laws change |
| **OneTrust** | Cookie consent + DSAR automation + privacy program management (enterprise) | Heavy; overkill for early-stage; required at scale |
| **Didomi** | CMP (Consent Management Platform) — TCF v2.2 certified, EU-first | Recommended for EU traffic > 10k DAU |
| **Vanta / Drata** | SOC 2 / ISO 27001 / GDPR / HIPAA readiness automation; some legal-doc templating | Compliance, not legal advice; pair with attorney |
| **Transcend** | DSAR automation, consent management, data mapping | Strong for cross-vendor data discovery |
| **GDPR Article 30 record-of-processing template** | Required by Art. 30 for any processor/controller with ≥250 employees OR high-risk processing; recommended for all | Free templates from EU DPAs (CNIL, ICO) |
| **CNIL / ICO / EDPB guidance** | Authoritative EU regulator guidance | Often more practical than the regulation text |

**Recommendation by stage:**
- Pre-revenue (≤10 customers): Termly or Termageddon free/cheap tier + a 1-hour attorney review.
- $10k–$100k MRR: Termageddon or iubenda paid + cookie consent CMP + initial DPA reviewed by attorney + Vanta/Drata for SOC 2 readiness.
- $100k+ MRR with EU traffic: OneTrust or Didomi for consent + Transcend for DSAR + dedicated DPO if processing falls under GDPR Art. 37 + ongoing privacy counsel.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when this skill produces a human-readable audit report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Missing Privacy Policy on a paid SaaS; no cookie banner with EU traffic; AI chatbot without Art. 50 disclosure after 2 Aug 2026; selling user data without CCPA opt-out link | BLOCK launch / pause acquisition |
| HIGH | Missing DPA on B2B; no right-to-delete UI; subprocessor list missing third parties present in code; ToS without limitation of liability or arbitration; outdated policy >12 months | Fix before next enterprise deal / before EU expansion |
| MEDIUM | Generic boilerplate sections; missing version history; missing data-retention table; accessibility statement absent | Fix this quarter |
| LOW | DPO listed as a generic alias; cookie policy combined into Privacy (allowed but less defensible); missing Article 30 record-of-processing | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = direct regulation citation; low = best-practice inference
engine: legal-scaffold                              # this skill
kind: missing-policy | outdated-policy | regulatory-gap | generic-boilerplate | missing-subprocessor-list | no-data-retention-schedule | no-right-to-delete-ui | no-data-export-endpoint | missing-ai-disclosure | missing-cookie-banner-or-reject-all-asymmetric | missing-dpa-template | missing-dpo-or-privacy-officer | no-version-history | wrong-jurisdiction-or-missing-tia | broken-clickwrap
policy_name: privacy | terms | cookies | dpa | aup | subprocessors | retention | ai-disclosure | accessibility
jurisdiction: EU | UK | US-CA | US-federal | QC | CA-federal | BR | global
regulation: GDPR Art. 13 | CCPA §1798.130 | Quebec Law 25 §27 | EU AI Act Art. 50 | DSA Art. 14 | ePrivacy Art. 5(3) | COPPA | ...
target_file: public/legal/privacy.md                # or 'MISSING' if file doesn't exist
target_line: 0                                       # 0 if whole-document
message: "Privacy Policy missing Quebec Law 25 §27 data-portability disclosure (required since 22 Sep 2024)."
suggested_fix: "Add §7 Portability subsection: 'You may request a machine-readable export of your personal information via /account/export, per Quebec Law 25 §27.'"
reference_url: https://www.legisquebec.gouv.qc.ca/en/document/cs/p-39.1     # canonical regulation source
delta_to_baseline: new | unchanged | regressed       # vs. previous audit
```

The integrator uses `confidence` and `regulation` to weight findings — a direct regulation citation is `confidence: high` and blocks phase advancement; a best-practice inference (e.g., "consider adding an arbitration clause") is `confidence: medium` and is informational. Per the warnings-are-bugs rule, every wire-level severity is `critical`.

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing-policy, outdated-policy, regulatory-gap, or operational gap (missing DPA, missing subprocessor list, no DSAR endpoint) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a regulatory gap today is a fine or class action tomorrow. EU AI Act top-tier penalties reach €35M or 7% of worldwide annual turnover (Art. 5 prohibited practices); CCPA §1798.150 provides a private right of action of $100–$750 per consumer per incident for breaches of nonencrypted/nonredacted personal information; Quebec Law 25 administrative monetary penalties reach the greater of CAD $10M or 2% of worldwide turnover, with penal sanctions up to CAD $25M or 4% for the most serious offences. Code that ships with green CI but a stale or missing policy ships with a known financial-exposure latent failure.

**Hard limits on this skill's output:**
- No legal advice. Drafts only. Every output declares "lawyer review required".
- No PII in examples. Use `YourApp Inc.`, `support@yourapp.com`, generic placeholders only.
- No invented regulator statistics. Every regulatory claim cites the regulation by name and article.

## Sources

- [GDPR full text](https://gdpr-info.eu/)
- [CCPA / CPRA — California AG](https://oag.ca.gov/privacy/ccpa)
- [Quebec Law 25 — official text (LégisQuébec)](https://www.legisquebec.gouv.qc.ca/en/document/cs/p-39.1)
- [EU AI Act — official text (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [EU Digital Services Act (DSA)](https://eur-lex.europa.eu/eli/reg/2022/2065/oj)
- [EDPB Guidelines on cookie consent and deceptive design](https://www.edpb.europa.eu/our-work-tools/general-guidance/guidelines-recommendations-best-practices_en)
- [CNIL — cookies and trackers](https://www.cnil.fr/en/cookies-and-other-trackers)
- [Commission d'accès à l'information du Québec (CAI)](https://www.cai.gouv.qc.ca/)
- [California Privacy Protection Agency (CPPA)](https://cppa.ca.gov/)
- [Standard Contractual Clauses — Commission Decision 2021/914](https://eur-lex.europa.eu/eli/dec_impl/2021/914)
