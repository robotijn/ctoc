# Contract Obligations Tracker — output of `legal/clm-obligations` skill

> Cluster 7 control (Regulatory Operational Controls). Activated when the
> `clm_obligations_tracker` control is in effect (Health Insurance Portability
> and Accountability Act profile enables it by default).

## Purpose

This directory is the **persistent output** of the [[legal/clm-obligations]]
skill. Each counterparty has one file: `<counterparty-short-name>.yaml`. The
file aggregates every executed agreement with that counterparty, the timer-
bearing obligations extracted from each, and a `calendar:` block ordered by
due date.

## Output files

```
.ctoc/contracts/
  _README.md                        # this file
  obligations.yaml                  # top-level index — one entry per counterparty
  stripe.yaml                       # per-counterparty file
  resend.yaml
  posthog.yaml
  clerk.yaml
  ...
```

The skill writes `obligations.yaml` as a tiny manifest pointing at the per-
counterparty files. Tooling that reads obligations should consume the per-
counterparty file directly when the counterparty is known, and traverse the
manifest when computing portfolio-wide due dates.

## Schema — `obligations.yaml` (manifest)

```yaml
generated_at: "2026-05-19T14:23:00Z"
generator: "legal/clm-obligations skill version 1"
audit_hash: "<sha256 of the canonical YAML of all per-counterparty files combined>"
counterparties:
  - short_name: stripe
    legal_name: "Stripe Inc."
    file: ".ctoc/contracts/stripe.yaml"
    earliest_action_date: "2026-01-15"
  - short_name: resend
    legal_name: "Resend Inc."
    file: ".ctoc/contracts/resend.yaml"
    earliest_action_date: "2026-03-22"
```

## Schema — per-counterparty file

See [[legal/clm-obligations]] SKILL.md for the full schema and category list.
A worked example follows.

## Example obligation entry — `.ctoc/contracts/stripe.yaml`

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
  beyond:
    - obligation: "transfer_impact_assessment_due"
      agreement_id: "stripe-msa-2025-03"
      due_date: "2026-06-15"
    - obligation: "compliance.attestation_renewal_date"
      agreement_id: "stripe-msa-2025-03"
      due_date: "2026-08-31"
```

## Reading rules

1. **Every obligation entry carries either a calendar date or an `n/a:` reason.** The skill emits `missing-renewal-date` (severity: high) when an auto-renewing agreement lacks a `renewal_date`. Empty / null is not acceptable.
2. **`referenced_clause:` points to a file under `clause-library/`.** The clause body is never inline. If the file does not exist, that is `missing-approved-clause` (severity: critical).
3. **The `calendar:` block is sorted by date ascending** within each window.
4. **A counterparty without a Business Associate Agreement under Health Insurance Portability and Accountability Act** is `missing-baa` (severity: critical) — see [[legal/clm-obligations]] for the rule.

## Related skills

- [[legal/clm-obligations]] — produces and maintains these files.
- [[saas/legal-scaffold]] — generates the upstream contract drafts.
- [[legal/dsar-handler]] — cross-references the sub-processor list at deletion time.
- [[compliance/audit-log-checker]] — verifies the hash chain that authenticates each per-counterparty file.

## Citation

[HIPAA Journal — HIPAA Business Associate Agreement requirements](https://www.hipaajournal.com/hipaa-business-associate-agreement/) — for the Business Associate Agreement field set under Health Insurance Portability and Accountability Act.
