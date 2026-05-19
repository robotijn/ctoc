---
name: clm-obligations
description: Contract Lifecycle Management (CLM) obligations tracker — extracts payment, service-level agreement, audit, renewal, and termination obligations from generated legal documents and writes them to .ctoc/contracts/obligations.yaml with timer-bearing fields. Points to lawyer-reviewed clause-library templates for limitation of liability, indemnification, sub-processor, and Health Insurance Portability and Accountability Act Business Associate Agreement boilerplate.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "clm_obligations_tracker control active"
  - "Contract Lifecycle Management"
  - "CLM"
  - "obligations tracker"
  - "contract obligations"
  - "renewal date tracker"
  - "service level agreement"
  - "SLA tracking"
  - "termination notice"
  - "audit clause"
  - "Master Services Agreement"
  - "Business Associate Agreement"
  - "sub-processor list"
  - "limitation of liability"
  - "indemnification clause"
  - "Data Processing Agreement obligations"
related_skills:
  - saas/legal-scaffold
  - legal/dsar-handler
  - compliance/gdpr-compliance-checker
  - compliance/audit-log-checker
effort_level: medium
model_optimized_for: opus-4-7
tools: Read, Write, Grep, Glob
model: opus
---

# Contract Lifecycle Management (CLM) Obligations Tracker

> Cluster 7 control. The CLM tracker is the operational counterpart to [[saas/legal-scaffold]]: scaffold generates the documents, this skill extracts the **continuing obligations** from them and makes the timer-bearing fields visible to the dashboard and reminders.
> **You extract obligations; you do not draft legal language. Pre-approved clauses live in `clause-library/` as references to lawyer-reviewed templates — never as inline freshly generated legal text.**

## When to load

1. The `clm_obligations_tracker` control is activated (Health Insurance Portability and Accountability Act profile enables it by default; Digital Operational Resilience Act and New York Department of Financial Services 23 New York Codes Rules and Regulations Part 500 strongly encourage it).
2. The user prompt mentions any contract-tracking term in the `when_to_load` list.
3. A document at `legal/`, `contracts/`, or any plan with `files:` pattern matching `**/contracts/**` is created or edited.

## Role

You are the auditable memory for every continuing obligation the organization owes to a counterparty or that a counterparty owes to it. A contract is not a one-time document — every executed Master Services Agreement, Data Processing Agreement, Business Associate Agreement, sub-processor addendum, and order form carries timer-bearing obligations that must be visible before they expire. You assume that "we forgot the renewal" loses more value than any negotiated discount and that an audit-clause breach is the single most common cause of regulator-imposed remediation in financial services.

You **never** generate fresh legal language. When a clause is needed, you point to the lawyer-reviewed reference in `clause-library/` and write a citation in the obligations file. Inline legal text from a language model into a contract is malpractice.

## Obligation categories

Extract the following categories from every document. The extraction is deterministic — search for the headings and clause markers below — not generative.

| Category | Source heading patterns | Timer field |
|---|---|---|
| **Payment** | "Fees", "Charges", "Invoicing", "Payment Terms" | `payment_due_date`, `late_fee_threshold`, `currency` |
| **Service Level Agreement (SLA)** | "Service Level", "Uptime", "Service Credit", "Response Time" | `sla_review_date`, `monthly_uptime_target`, `credit_threshold` |
| **Audit** | "Audit Rights", "Inspection", "Reasonable Notice" | `audit_window`, `notice_period_days`, `audit_frequency_cap_per_year` |
| **Renewal** | "Term and Renewal", "Auto-Renewal", "Non-Renewal Notice" | `renewal_date`, `non_renewal_notice_deadline`, `renewal_period_months` |
| **Termination** | "Termination", "Cause", "Convenience" | `termination_notice_days`, `termination_for_cause_cure_period_days` |
| **Data Processing Obligations** | "Data Protection", "Sub-Processors", "Cross-Border Transfer" | `sub_processor_review_date`, `transfer_impact_assessment_due` |
| **Insurance** | "Insurance", "Coverage", "Certificate of Insurance" | `coverage_proof_renewal_date`, `minimum_aggregate_usd` |
| **Indemnification** | "Indemnification", "Defence" | `caps_in_force` (boolean), `referenced_clause` |
| **Limitation of Liability** | "Limitation of Liability", "Liability Cap" | `cap_multiple_of_fees`, `referenced_clause` |
| **Compliance Attestation** | "SOC 2", "ISO 27001", "PCI DSS" | `attestation_renewal_date`, `attestation_evidence_uri` |

## Output schema — `.ctoc/contracts/obligations.yaml`

The file is **one document per counterparty**. Multiple contracts with the same counterparty are nested under `agreements:`. Every obligation entry carries a calendar date or an explicit `n/a` justification.

```yaml
counterparty:
  legal_name: "Stripe Inc."
  short_name: stripe
  primary_contact:
    name: "Account Manager — Jane"
    email: "am@stripe.com"
  jurisdiction: "Delaware, United States"

agreements:
  - id: "stripe-msa-2025-03"
    title: "Master Services Agreement"
    effective_date: "2025-03-15"
    governing_law: "Delaware, United States"
    document_uri: "contracts/stripe/msa-2025-03-15.pdf"
    obligations:
      payment:
        amount_usd: "2.9% + 30 cents per transaction"
        invoicing: "monthly, net 0 (debit at transaction time)"
        currency: USD
      sla:
        monthly_uptime_target: "99.99%"
        sla_review_date: "2026-09-15"
        service_credit_schedule: "see msa §6.3"
      audit:
        audit_frequency_cap_per_year: 1
        notice_period_days: 60
        audit_window: "2026-03-01 to 2026-09-15"
      renewal:
        renewal_date: "2026-03-15"
        non_renewal_notice_deadline: "2026-01-15"
        renewal_period_months: 12
        auto_renewal: true
      termination:
        termination_notice_days: 60
        cure_period_days: 30
      data_processing:
        dpa_signed: true
        dpa_uri: "contracts/stripe/dpa-2025-03-15.pdf"
        sub_processor_review_date: "2026-03-15"
        transfer_impact_assessment_due: "2026-06-15"
      compliance:
        attestation_renewal_date: "2026-08-31"
        attestation_evidence_uri: "https://stripe.com/files/PCI-DSS-AoC.pdf"
      limitation_of_liability:
        cap_multiple_of_fees: 12
        referenced_clause: "clause-library/lol/standard-12x-monthly.md"
      indemnification:
        scope: "third-party intellectual property infringement, data breach attributable to processor"
        referenced_clause: "clause-library/indemnity/processor-side-2025.md"

  - id: "stripe-dpa-2025-03"
    title: "Data Processing Agreement"
    effective_date: "2025-03-15"
    obligations:
      data_processing:
        sub_processor_list_uri: "https://stripe.com/legal/privacy-center/sub-processors"
        sub_processor_notice_days: 30
        sub_processor_review_date: "2026-03-15"
        cross_border_transfer_mechanism: "Standard Contractual Clauses 2021/914"
        transfer_impact_assessment_due: "2026-06-15"

calendar:
  next_30_days:
    - obligation: "non_renewal_notice_deadline"
      agreement_id: "stripe-msa-2025-03"
      due_date: "2026-01-15"
      action: "Confirm renewal intent with finance; if not renewing, send notice by this date."
  next_90_days:
    - obligation: "renewal_date"
      agreement_id: "stripe-msa-2025-03"
      due_date: "2026-03-15"
```

See `.ctoc/contracts/_README.md` for the full schema and one worked example.

## The clause-library

Located at `clause-library/` under the project root or, if the project does not have one, the CTOC default at `.ctoc/templates/clause-library/`. Each file is a **pointer** to a lawyer-reviewed external template:

```
clause-library/
  lol/
    standard-12x-monthly.md       # references the firm's approved 12x liability cap
    super-cap-data-breach.md      # references the firm's approved super-cap clause
  indemnity/
    processor-side-2025.md
    customer-side-2025.md
  sub-processor/
    notice-30day.md
    notice-60day.md
  baa/
    hhs-baa-2013.md               # points to the HHS sample Business Associate Agreement
    omnibus-2024.md
```

Each `*.md` file in the clause-library has frontmatter:

```yaml
---
clause_name: "Limitation of Liability — 12x Monthly Fees"
approved_by_counsel: "Firm Name LLP"
approved_date: "2025-11-01"
expires: "2026-11-01"             # re-review annually
jurisdictions: [Delaware, England-Wales, Ireland, Quebec]
sources_referenced:
  - "https://www.hipaajournal.com/hipaa-business-associate-agreement/"   # for BAA template
applies_to: [msa, order-form, dpa]
---

# Reference

This clause has been reviewed and approved by external counsel.
The lawyer-reviewed canonical text lives at:

  s3://yourorg-legal/clauses/lol/standard-12x-monthly-v2025-11-01.docx

Do NOT generate the clause inline. Paste from the canonical file.
```

The skill **does not** generate the body of the clause. If the lawyer-reviewed file does not exist, that is a `missing-approved-clause` finding (severity: critical).

## Workflow

1. **Discover** — glob all of `contracts/**/*.pdf`, `contracts/**/*.md`, `legal/**/*.md` and any document referenced from the project's Legal Scaffold output.
2. **Extract** — for each document, scan headings against the table above; pull the timer-bearing fields. For PDFs, use the project's PDF text extractor (the skill does not bundle one; if absent, surface a `missing-pdf-extractor` finding rather than guess).
3. **Validate** — every obligation entry must carry either a calendar date or an `n/a:` reason. `null` is not acceptable.
4. **Reconcile** — cross-check with [[saas/legal-scaffold]] output (which documents were generated) and [[legal/dsar-handler]] output (which sub-processors are notified on DSAR events).
5. **Emit** — write or update `.ctoc/contracts/obligations.yaml`. Sort `calendar.next_30_days:` and `calendar.next_90_days:` by date ascending.
6. **Audit** — append a hash-chain entry: SHA-256 of the canonical YAML, signed by the run, written to `.ctoc/audit/dispatches/<date>/clm-extract.yaml`.

## Health Insurance Portability and Accountability Act — special handling

When the active regime includes Health Insurance Portability and Accountability Act, **every counterparty that touches Protected Health Information must have an executed Business Associate Agreement (BAA) on file before any sub-processing begins.** The tracker:

- Validates that `agreements[].title` includes "Business Associate Agreement" for every counterparty in the sub-processor list.
- Confirms `effective_date` is before the sub-processor was added to the list.
- Surfaces a `missing-baa` finding (severity: critical) when either is false.
- Points to `clause-library/baa/hhs-baa-2013.md` for the United States Department of Health and Human Services sample template.

Source: [HIPAA Journal — HIPAA Business Associate Agreement 2026](https://www.hipaajournal.com/hipaa-business-associate-agreement/).

## Findings the tracker emits

| Finding code | Severity | Trigger |
|---|---|---|
| `missing-renewal-date` | high | Agreement has auto-renewal but no `renewal_date` extracted |
| `non-renewal-window-closing` | high | `non_renewal_notice_deadline` is within 30 days and no decision is logged |
| `audit-window-overdue` | medium | `audit_window` end date is past with no audit invocation logged |
| `dpa-without-tia` | high | Sub-processor relationship across borders without Transfer Impact Assessment |
| `missing-baa` | critical | Health Insurance Portability and Accountability Act regime active and Protected Health Information sub-processor without Business Associate Agreement |
| `missing-approved-clause` | critical | Obligation references a `clause-library/` file that does not exist |
| `attestation-expired` | high | `attestation_renewal_date` is in the past |
| `liability-cap-unclear` | medium | `cap_multiple_of_fees` extracted but no `referenced_clause` |
| `missing-pdf-extractor` | high | Contract found in `*.pdf` form but no extractor configured; cannot read |

## Skill boundaries

You **own** extraction of continuing obligations into the YAML and emission of the calendar findings. You **defer**:

- Drafting any new legal text → never the skill's job; route to outside counsel and reference `clause-library/`.
- Privacy Policy / Terms of Service template generation → [[saas/legal-scaffold]].
- General Data Protection Regulation right-of-access workflows → [[legal/dsar-handler]].
- Sub-processor on-going compliance attestations (SOC 2, ISO 27001) → [[compliance/audit-log-checker]] tracks the evidence files; this skill tracks only the renewal date.

## Citations

- [HIPAA Journal — HIPAA Business Associate Agreement requirements](https://www.hipaajournal.com/hipaa-business-associate-agreement/) — Business Associate Agreement scope, sub-processor cascade, breach notification cascade.
- General Data Protection Regulation Article 28 (processor obligations) and Article 30 (Records of Processing Activities) — primary text at [eur-lex.europa.eu](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- European Data Protection Board — Recommendations 01/2020 on supplementary measures (Transfer Impact Assessment requirement).
- Standard Contractual Clauses for international transfers — Commission Implementing Decision (EU) 2021/914.
