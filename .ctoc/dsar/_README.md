# Data Subject Access Request (DSAR) — output of `legal/dsar-handler` skill

> Cluster 7 control. Activated when the `dsar_handler` control is in effect
> (Health Insurance Portability and Accountability Act profile enables it by
> default; General Data Protection Regulation projects should enable it
> explicitly).

## Purpose

This directory holds one **evidence file per request**, written by the
[[legal/dsar-handler]] skill. The evidence file is the regulator-facing
artifact: it documents the verified identity, the scope, the discovery pass,
the export, and the signed deletion attestation. Every closed request remains
in this directory for the full retention window of the active regime
(General Data Protection Regulation Article 17 log retention is typically
three years; Health Insurance Portability and Accountability Act 45 Code of
Federal Regulations §164.530(j) is six years).

## File naming

```
.ctoc/dsar/
  _README.md                                # this file
  dsar-2026-05-19-0001.yaml                 # one file per request
  dsar-2026-05-19-0002.yaml
  ...
```

Request identifiers are `dsar-<YYYY-MM-DD>-<NNNN>`, four-digit zero-padded
counter scoped to the date. The counter never resets globally — each calendar
date has its own counter starting at `0001`.

## Schema

```yaml
request_id: "dsar-2026-05-19-0001"

# ---------------------- Lifecycle ----------------------
lifecycle:
  received_at: "2026-05-19T08:14:00Z"           # first contact from the requester
  verified_at: "2026-05-19T10:32:00Z"           # identity verification complete (clock starts here)
  responded_at: null                            # set when the response is delivered
  closed_at: null                               # set on deletion attestation or response delivery
  applicable_clocks:
    gdpr_one_month_deadline: "2026-06-19T10:32:00Z"
    ccpa_45_day_deadline: "2026-07-03T10:32:00Z"
    quebec_law25_30_day_deadline: "2026-06-18T10:32:00Z"
    tightest: "quebec_law25_30_day_deadline"
  extension:
    invoked: false
    reason: null
    new_deadline: null

# ---------------------- Stage 1 — Identity verification ----------------------
identity_verification:
  tier: "profile_plus_transaction"             # see SKILL.md for tiers
  method:
    - email_confirmation_code: "ok"
    - transaction_reference: "$42.00 charge on 2026-04-12 — ok"
  verifier:
    name: "Jane Doe"
    role: "Data Protection Officer"
    email: "dpo@yourapp.com"
  verification_log:
    - at: "2026-05-19T08:14:30Z"
      action: "Sent email confirmation code to alex@example.com"
    - at: "2026-05-19T09:48:00Z"
      action: "Received code reply, code matched"
    - at: "2026-05-19T10:32:00Z"
      action: "Transaction reference matched, verification complete"

# ---------------------- Stage 2 — Scope assessment ----------------------
scope:
  rights_invoked:
    - access
    - portability
    - erasure
  scope_categories:
    - profile
    - transactional
    - behavioral
    - communications
    - ai_interactions
    - inferences
  date_range: "all-time"
  exceptions_asserted: []                       # narrow; each must cite clause + end date

# ---------------------- Stage 3 — Data discovery ----------------------
data_discovery:
  primary_database:
    system: "postgres"
    tables_scanned: [users, orders, payments, sessions, audit_log]
    rows_matched: 1
    foreign_key_cascade: [order_items, refunds, support_tickets]
  search_index:
    system: "meilisearch"
    docs_matched: 1
  cache:
    system: "redis"
    keys_matched: ["session:u_*", "rate-limit:u_*"]
  analytics_warehouse:
    system: "posthog"
    events_in_scope: 1247
    retention_after_deletion: "anonymized aggregate only"
  backups:
    system: "aws_backup"
    snapshots_in_window: 14
    retention_policy: ".ctoc/retention/baselines.yaml"
    deletion_strategy: "rolled forward — encrypted snapshots expire per schedule"
  third_party_processors:
    - name: "Stripe"
      data_class: ["payment_method", "billing_address"]
      deletion_api: "https://stripe.com/docs/api/customers/delete"
    - name: "Resend"
      data_class: ["email_address", "message_log"]
      deletion_api: "https://resend.com/docs/api-reference/contacts/delete-contact"
  legal_hold_flags: []

# ---------------------- Stage 4 — Export ----------------------
export:
  format: "JSON"
  schema_version: "1.0"
  file_uri: ".ctoc/dsar/exports/dsar-2026-05-19-0001-export.json"
  signature_sha256: "<hex of canonical JSON minus this field>"
  delivered_at: null
  delivery_channel: null                        # signed-URL link, secure portal, etc.

# ---------------------- Stage 5 — Deletion attestation ----------------------
deletion_attestation:
  attestation_id: "dsar-2026-05-19-0001-att-01"
  signed_by:
    name: "Jane Doe"
    role: "Data Protection Officer"
    email: "dpo@yourapp.com"
  signed_at: null
  signature_method: "internal HMAC over canonical YAML"
  signature: null
  attested_actions: []
  third_parties_notified: []
  next_audit_due: null

# ---------------------- Decisions taken under ambiguity ----------------------
decisions_under_ambiguity:
  - decision: "Treated 'all data' to include behavioral events older than 13 months"
    rationale: "California Consumer Privacy Act §1798.130 obligates 12 month look-back; we extended to all to satisfy General Data Protection Regulation simultaneously"
    timestamp: "2026-05-19T10:50:00Z"

# ---------------------- Audit ----------------------
audit:
  hash_chain_entry: null                        # SHA-256 written to .ctoc/audit/ on close
  signed_by_dispatch_id: null
```

## Status values

The `lifecycle.responded_at` and `lifecycle.closed_at` fields move through this
state graph:

```
received   →   verified   →   in_discovery   →   exported   →   attested   →   closed
                            ↘                 ↗
                              extended (with reason and new_deadline)
```

The skill never writes `"pending"` or `"in progress"` — fields that are not
done yet are `null`.

## Related skills

- [[legal/dsar-handler]] — produces and maintains these files.
- [[compliance/gdpr-compliance-checker]] — verifies the upstream consent and Records of Processing Activities.
- [[compliance/audit-log-checker]] — verifies the hash chain that authenticates each evidence file.

## Citations

- [Osano — Data Subject Access Request overview](https://www.osano.com/articles/data-subject-access-request).
- [Exabeam — General Data Protection Regulation Article 17 right of erasure](https://www.exabeam.com/explainers/gdpr-compliance/gdpr-article-17-right-of-erasure-how-it-works-and-7-steps-to-compliance/).
- [Cornell Legal Information Institute — Health Insurance Portability and Accountability Act 45 Code of Federal Regulations §164.524](https://www.law.cornell.edu/cfr/text/45/164.524).
