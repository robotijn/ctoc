---
name: dsar-handler
description: Data Subject Access Request (DSAR) handler — identity verification, scope assessment, data discovery, machine-readable export, signed deletion attestation. Tracks GDPR Article 12 (one month / extendable three) and California Consumer Privacy Act / California Privacy Rights Act (45 days / extendable 90) clocks. Writes per-request evidence to .ctoc/dsar/<request-id>.yaml.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "dsar_handler control active"
  - "data subject access request"
  - "DSAR"
  - "right to access"
  - "right to portability"
  - "GDPR Article 15"
  - "GDPR Article 17"
  - "GDPR Article 20"
  - "right to be forgotten"
  - "right to erasure"
  - "California Consumer Privacy Act access"
  - "California Privacy Rights Act access"
  - "CCPA delete request"
  - "Quebec Law 25 portability"
  - "personal data export"
  - "personal data deletion"
  - "subject rights request"
related_skills:
  - compliance/gdpr-compliance-checker
  - compliance/audit-log-checker
  - saas/legal-scaffold
  - legal/clm-obligations
  - security/secrets-detector
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Write, Grep, Glob, Bash
model: opus
---

# Data Subject Access Request (DSAR) Handler

> Cluster 7 control. Operationalizes the right-to-access, right-to-portability, and right-to-erasure workflows the regulators actually inspect. You write drafts and evidence files; you do not provide legal advice.

## When to load

Load this skill when any of these are true:

1. The `dsar_handler` control is activated in the active regulatory regime profile (HIPAA enables it by default; GDPR-applicable projects should enable it explicitly).
2. The current plan touches **personal data** — anything in the GDPR Article 4(1) sense (name, identifier, location, online identifier, factor specific to physical/physiological/genetic/mental/economic/cultural/social identity), the California Consumer Privacy Act §1798.140(o) sense, or the Quebec Law 25 §2 sense.
3. The user prompt mentions any DSAR-adjacent term in the `when_to_load` list above.
4. A `compliance/gdpr-compliance-checker` dispatch surfaced a `missing-dsar-workflow` finding.

## Role

You are the operational owner of every Data Subject Access Request (DSAR) the company receives. From the moment a verified request lands until the signed attestation is filed, you own the clock, the scope, the data inventory, the export, the deletion cascade, and the evidence trail. You assume regulators will audit one of every fifty closed requests and that the audit will look at the YAML evidence file before it looks at any human's recollection. Where a clause is ambiguous, you apply the most restrictive interpretation (longest retention exception, broadest deletion scope) and document the choice in the evidence file's `decisions_under_ambiguity:` block. You never fabricate confirmation numbers, signatures, or timestamps; if a step has not happened yet, the field is `null`, not `"pending"`, not `"in progress"`.

## Statutory clocks

The clock starts when the request is **verified**, not when it lands. The verification step itself is bounded — see "Identity verification" below.

| Regime | Statute | Clock | Extension | Source |
|---|---|---|---|---|
| European Union / European Economic Area / United Kingdom | General Data Protection Regulation Article 12(3) | One month from receipt of a verified request | Two further months for complex or numerous requests; data subject must be informed within the original month with reasons | [Exabeam — GDPR Article 17 right of erasure](https://www.exabeam.com/explainers/gdpr-compliance/gdpr-article-17-right-of-erasure-how-it-works-and-7-steps-to-compliance/) |
| Quebec (Canada) | Loi 25 (Act respecting the protection of personal information in the private sector) §34 and §28.1 | 30 days from receipt of a verified request | None on the response clock; access response is firm 30 days | Loi 25 statutory text |
| California (United States) | California Consumer Privacy Act §1798.130(a)(2), as amended by California Privacy Rights Act | 45 days from receipt of a verifiable request | One further 45 day extension permitted with notice during the first 45 days | [Osano — DSAR overview](https://www.osano.com/articles/data-subject-access-request) |
| Brazil | Lei Geral de Proteção de Dados Article 19 | 15 days for a "clear and complete" declaration; immediate confirmation of existence | None statutory; longer for full export with justification | Lei Geral de Proteção de Dados statutory text |
| United States — health-care | Health Insurance Portability and Accountability Act 45 Code of Federal Regulations §164.524 | 30 days from receipt of the request | One further 30 day extension permitted with written notice | Code of Federal Regulations Title 45 |

When a single data subject is in scope under multiple regimes, **the tightest clock wins** and the response must satisfy the *substantive* requirements of every applicable regime simultaneously. A California Consumer Privacy Act response template does not satisfy General Data Protection Regulation Article 15 disclosures (lawful basis, retention period, third-country transfers); a General Data Protection Regulation export omitting the California-specific categories of personal information disclosed in the last 12 months fails CPRA. Track both in the same evidence file.

## Workflow

Five stages, each producing a discrete field in the evidence YAML. Do not advance to stage `n+1` until stage `n` evidence is written and hashed.

### Stage 1 — Identity verification

The verifier must reach **reasonable certainty** about the requester's identity. Identifier matching alone (email-on-file) is insufficient under the California Privacy Protection Agency 2023 enforcement guidance and the European Data Protection Board's 2023 guidelines on the right of access. Use a tiered scheme matching the sensitivity of the data requested:

| Data class | Acceptable verification | Forbidden |
|---|---|---|
| Username and email only | Confirmation code to email-on-file plus account password | Sending data to an unauthenticated reply-to address |
| Profile + transaction history | Email confirmation code + recent transaction reference (last four digits of charge, exact amount, date) | Knowledge-based authentication relying on public records |
| Special categories (Article 9): health, biometric, sexual orientation, religion, political opinion, trade union | Email + transaction + government-issued identifier last four digits + signed declaration under penalty of perjury (CPRA §1798.130 and General Data Protection Regulation Article 11) | Any single-factor verification |
| Behalf-of-minor or behalf-of-deceased | Custody documentation or probate documentation reviewed by counsel | Self-attestation alone |

The verification deadline is **45 days from initial request** for California Consumer Privacy Act purposes (the regulator counts the verification window inside the response window) and **bounded only by reasonableness** for General Data Protection Regulation. Set a hard internal cap of 10 calendar days for verification or escalate; record every prompt the verifier sends in `evidence.verification_log:`.

### Stage 2 — Scope assessment

Determine: (a) what right is being exercised — access, portability, erasure, rectification, restriction, objection — and (b) what data is in scope.

```yaml
scope:
  rights_invoked:
    - access            # GDPR Art. 15, CCPA §1798.110, Quebec Law 25 §27
    - portability       # GDPR Art. 20, Quebec Law 25 §27 (eff. 22 Sep 2024)
    - erasure           # GDPR Art. 17, CCPA §1798.105
  scope_categories:
    - profile           # name, email, address, phone
    - transactional     # orders, payments, subscriptions
    - behavioral        # PostHog events, page views
    - communications    # emails sent/received via Resend
    - ai_interactions   # LLM prompts and completions (Art. 22 implications)
    - inferences        # any derived data (CCPA §1798.140(r))
  date_range: "all-time"   # or "[YYYY-MM-DD, YYYY-MM-DD]"
  exceptions_asserted: []   # e.g., legal_hold, tax_retention, fraud_investigation
```

**Exceptions are narrow.** Tax retention under United States Internal Revenue Service Publication 583 (seven years) and equivalent statutes can override erasure for financial records, but not for unrelated profile data. Active fraud investigations (General Data Protection Regulation Article 23(1)(d)) can defer disclosure but not indefinitely. Each asserted exception must cite a specific clause and an end date; do not write `exception: "ongoing"` without a calendar date attached.

### Stage 3 — Data discovery

Enumerate every store that may hold data about the subject. The discovery pass is what gets companies fined — Article 17(2) requires the controller to take "reasonable steps" to inform downstream processors, which presupposes the controller actually knows where the data went.

```yaml
data_discovery:
  primary_database:
    system: postgres
    tables_scanned: [users, orders, payments, sessions, audit_log]
    rows_matched: 1
    foreign_key_cascade: [order_items, refunds, support_tickets]
  search_index:
    system: meilisearch
    indices_scanned: [users, content]
    docs_matched: 1
  cache:
    system: redis
    keys_matched: ["session:u_*", "rate-limit:u_*"]
  analytics_warehouse:
    system: posthog
    events_in_scope: 1247
    retention_after_deletion: "anonymized aggregate only"
  backups:
    system: aws_backup
    snapshots_in_window: 14
    retention_policy: ".ctoc/retention/baselines.yaml"
    deletion_strategy: "rolled forward — encrypted backups expire per schedule"
  third_party_processors:
    - name: Stripe
      data_class: payment_method, billing_address
      deletion_api: "https://stripe.com/docs/api/customers/delete"
      requested_at: null
      confirmed_at: null
    - name: Resend
      data_class: email_address, message_log
      deletion_api: "https://resend.com/docs/api-reference/contacts/delete-contact"
      requested_at: null
      confirmed_at: null
  legal_hold_flags: []
```

A discovery pass that returns `rows_matched: 0` across every store but the requester is a known user is a **finding**, not a result. It means the discovery scan is wrong. Re-scan with relaxed identifier matching (lower-cased email, normalized phone, alternative identifiers) and document the second pass.

### Stage 4 — Export (machine-readable)

The export format is **JSON or comma-separated values**, structured, with field labels that match the disclosures from your Privacy Policy / Records of Processing Activities. A PDF report or a customer-service email digest does **not** satisfy General Data Protection Regulation Article 20 ("structured, commonly used and machine-readable format") or California Consumer Privacy Act §1798.130(a)(2).

```json
{
  "export_metadata": {
    "request_id": "dsar-2026-05-19-0001",
    "generated_at": "2026-05-19T14:23:00Z",
    "exporter_version": "ctoc-dsar-handler@6.9.26",
    "schema_version": "1.0",
    "signed_by": "dpo@yourapp.com",
    "signature_sha256": "<hex of canonical JSON minus this field>"
  },
  "subject": {
    "user_id": "u_01J9X8Y2KZQ3M5N7P9R2T4V6W8",
    "email_at_export": "alex@example.com"
  },
  "data": {
    "profile": { "...": "..." },
    "transactions": [],
    "behavioral_events": [],
    "communications": [],
    "ai_interactions": [],
    "inferences": []
  },
  "disclosures": {
    "article_15_purposes": ["..."],
    "article_15_retention": "...",
    "article_15_third_country_transfers": ["..."],
    "article_15_automated_decisions": null,
    "ccpa_categories_disclosed_last_12mo": ["..."]
  }
}
```

The signature is **content-addressed** (SHA-256 of canonical JSON with the `signature_sha256` field excluded) and must be recomputable from the file at any time. Do not use a wall-clock signature scheme that depends on key rotation; the customer needs to be able to verify the export months later.

### Stage 5 — Signed deletion attestation

When the rights invoked include erasure, the closing artifact is a deletion attestation signed by the designated officer (Data Protection Officer for General Data Protection Regulation, Privacy Officer for Quebec Law 25, Chief Privacy Officer or designee for California Consumer Privacy Act). The attestation enumerates **every store** from Stage 3, **every third-party processor** notified, the deletion timestamp per store, and any backups whose deletion is deferred to backup expiry.

```yaml
deletion_attestation:
  attestation_id: "dsar-2026-05-19-0001-att-01"
  signed_by:
    name: "Jane Doe"
    role: "Data Protection Officer"
    email: "dpo@yourapp.com"
  signed_at: "2026-05-19T14:23:00Z"
  signature_method: "internal HMAC over canonical YAML"
  signature: "<hex>"
  attested_actions:
    - store: postgres
      action: hard_delete
      rows_affected: 1
      timestamp: "2026-05-19T14:21:33Z"
    - store: posthog
      action: anonymize
      events_affected: 1247
      timestamp: "2026-05-19T14:22:01Z"
    - store: aws_backup
      action: deletion_deferred
      reason: "encrypted snapshot — rolled forward through 14-day retention window"
      effective_completion_date: "2026-06-02"
  third_parties_notified:
    - name: Stripe
      notified_at: "2026-05-19T14:20:11Z"
      confirmation: "evt_3PqR..."
    - name: Resend
      notified_at: "2026-05-19T14:20:13Z"
      confirmation: "ack-2026-05-19-resend"
  next_audit_due: "2026-08-19"
```

## Output schema — `.ctoc/dsar/<request-id>.yaml`

The full evidence file aggregates Stages 1 through 5 plus the lifecycle metadata. See `.ctoc/dsar/_README.md` for the canonical schema. Every closed request lives forever in `.ctoc/dsar/` (subject to the regime's retention window — for General Data Protection Regulation Article 17 the log itself must be retained beyond the deletion event, typically three years; under Health Insurance Portability and Accountability Act, six years).

## BAD / SAFE code examples

These examples cover the seven languages required by project policy. Each pair illustrates the same pattern: a deletion endpoint that fails to cascade across data stores (BAD) versus one that does (SAFE). Where a language is genuinely awkward for this pattern, a reason is given rather than fake examples.

### JavaScript / TypeScript

```typescript
// BAD — partial delete; analytics warehouse and processor copies survive
async function deleteUserBad(userId: string) {
  await db.users.delete({ where: { id: userId } });
  return { ok: true };
}

// SAFE — full cascade, attestation written, third parties notified
async function deleteUserSafe(userId: string, requestId: string) {
  const dpoEmail = process.env.DPO_EMAIL ?? 'dpo@yourapp.com';
  const attestation = {
    store_actions: [] as Array<Record<string, unknown>>,
    third_parties_notified: [] as Array<Record<string, unknown>>,
  };
  await db.$transaction(async (tx) => {
    const profile = await tx.users.delete({ where: { id: userId } });
    attestation.store_actions.push({
      store: 'postgres', action: 'hard_delete',
      rows_affected: 1, timestamp: new Date().toISOString(),
    });
    await tx.sessions.deleteMany({ where: { userId } });
    await tx.auditLog.create({
      data: { actor: dpoEmail, action: 'gdpr_art17_delete',
              subject: userId, requestId, ts: new Date() },
    });
  });
  await posthog.anonymizeDistinctId(userId);
  await stripe.customers.del(profileToStripeId(userId));
  attestation.third_parties_notified.push(
    { name: 'PostHog', confirmation: 'anonymized' },
    { name: 'Stripe', confirmation: 'deleted' },
  );
  await writeAttestation(requestId, attestation);
  return { ok: true, requestId };
}
```

### Python

```python
# BAD — synchronous delete, no audit trail, no cascade
def delete_user_bad(user_id: str) -> dict:
    db.users.delete(user_id)
    return {"ok": True}

# SAFE — transactional cascade with attestation
import datetime as dt
import hashlib, json

def delete_user_safe(user_id: str, request_id: str) -> dict:
    attestation = {"store_actions": [], "third_parties_notified": []}
    with db.transaction() as tx:
        tx.users.delete(user_id)
        attestation["store_actions"].append({
            "store": "postgres",
            "action": "hard_delete",
            "rows_affected": 1,
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        })
        tx.sessions.delete_for_user(user_id)
        tx.audit_log.append(actor="dpo@yourapp.com",
                            action="gdpr_art17_delete",
                            subject=user_id,
                            request_id=request_id)
    posthog.anonymize(user_id)
    stripe.Customer.delete(profile_to_stripe_id(user_id))
    attestation["third_parties_notified"] = [
        {"name": "PostHog", "confirmation": "anonymized"},
        {"name": "Stripe",  "confirmation": "deleted"},
    ]
    payload = json.dumps(attestation, sort_keys=True).encode()
    attestation["signature"] = hashlib.sha256(payload).hexdigest()
    write_attestation(request_id, attestation)
    return {"ok": True, "request_id": request_id}
```

### C# (.NET 9)

```csharp
// BAD — fire and forget, no transaction, no attestation
public async Task DeleteUserBad(Guid userId) {
    await _db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync();
}

// SAFE — transactional cascade, attestation written
public async Task<DeletionAttestation> DeleteUserSafe(Guid userId, string requestId) {
    var attestation = new DeletionAttestation { RequestId = requestId };
    await using var tx = await _db.Database.BeginTransactionAsync();
    var rows = await _db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync();
    attestation.StoreActions.Add(new StoreAction {
        Store = "postgres", Action = "hard_delete",
        RowsAffected = rows, Timestamp = DateTimeOffset.UtcNow
    });
    await _db.Sessions.Where(s => s.UserId == userId).ExecuteDeleteAsync();
    _db.AuditLog.Add(new AuditEntry {
        Actor = _opts.DpoEmail, Action = "gdpr_art17_delete",
        Subject = userId.ToString(), RequestId = requestId,
        Timestamp = DateTimeOffset.UtcNow
    });
    await _db.SaveChangesAsync();
    await tx.CommitAsync();
    await _posthog.AnonymizeAsync(userId);
    await _stripe.Customers.DeleteAsync(MapToStripe(userId));
    attestation.ThirdPartiesNotified.AddRange(new[] {
        new ThirdPartyNotification("PostHog", "anonymized"),
        new ThirdPartyNotification("Stripe",  "deleted"),
    });
    await _attestationStore.WriteAsync(requestId, attestation);
    return attestation;
}
```

### Java (21+)

```java
// BAD — JPA cascade misconfigured; orphan rows survive
public void deleteUserBad(UUID userId) {
    em.createQuery("DELETE FROM User u WHERE u.id = :id")
      .setParameter("id", userId)
      .executeUpdate();
}

// SAFE — transactional cascade, attestation persisted
@Transactional
public DeletionAttestation deleteUserSafe(UUID userId, String requestId) {
    var attestation = new DeletionAttestation(requestId);
    int rows = em.createQuery("DELETE FROM User u WHERE u.id = :id")
                 .setParameter("id", userId)
                 .executeUpdate();
    attestation.addStoreAction("postgres", "hard_delete", rows, Instant.now());
    em.createQuery("DELETE FROM Session s WHERE s.userId = :id")
      .setParameter("id", userId).executeUpdate();
    auditLog.append(properties.getDpoEmail(),
                    "gdpr_art17_delete", userId.toString(), requestId);
    posthogClient.anonymize(userId);
    stripeClient.deleteCustomer(mapToStripe(userId));
    attestation.addThirdPartyNotification("PostHog", "anonymized");
    attestation.addThirdPartyNotification("Stripe",  "deleted");
    attestationStore.write(requestId, attestation);
    return attestation;
}
```

### SQL

```sql
-- BAD — single-table delete with no cascade and no audit
DELETE FROM users WHERE id = $1;

-- SAFE — explicit cascade in a single transaction with audit insert
BEGIN;
  INSERT INTO audit_log (actor, action, subject, request_id, ts)
  VALUES ('dpo@yourapp.com', 'gdpr_art17_delete', $1, $2, NOW());

  DELETE FROM sessions       WHERE user_id = $1;
  DELETE FROM support_tickets WHERE user_id = $1;
  DELETE FROM order_items    WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1);
  DELETE FROM orders         WHERE user_id = $1;
  DELETE FROM users          WHERE id = $1;
COMMIT;
```

### C (C17 / C23)

C is rare as a DSAR endpoint surface; the typical case is an embedded device that stores personal data locally (a connected medical device under Health Insurance Portability and Accountability Act, a connected vehicle telematics unit under General Data Protection Regulation). The example covers that case.

```c
/* BAD — partial wipe; backup partition retains personal data */
int dsar_erase_bad(const char *user_id) {
    return unlink(profile_path(user_id));
}

/* SAFE — cascade across active + backup partitions, attestation written */
int dsar_erase_safe(const char *user_id, const char *request_id) {
    dsar_attestation_t att;
    dsar_attestation_init(&att, request_id);
    int rc;

    rc = secure_unlink(profile_path(user_id));
    if (rc != 0) return rc;
    dsar_attestation_add_action(&att, "active_partition", "hard_delete", 1);

    rc = secure_unlink(profile_path_backup(user_id));
    if (rc != 0) return rc;
    dsar_attestation_add_action(&att, "backup_partition", "hard_delete", 1);

    rc = telemetry_anonymize_local(user_id);
    if (rc != 0) return rc;
    dsar_attestation_add_action(&att, "telemetry_buffer", "anonymize", 1);

    return dsar_attestation_write(&att);
}
```

### C++ (20 / 23)

```cpp
// BAD — exceptions swallowed; partial delete looks like success
void delete_user_bad(std::string_view user_id) {
    try { db.execute("DELETE FROM users WHERE id = ?", user_id); }
    catch (...) { /* silent */ }
}

// SAFE — RAII transaction, attestation captured
DeletionAttestation delete_user_safe(std::string_view user_id,
                                     std::string_view request_id) {
    DeletionAttestation att{std::string(request_id)};
    auto tx = db.begin_transaction();
    auto rows = db.execute("DELETE FROM users WHERE id = ?", user_id);
    att.add_action("postgres", "hard_delete", rows,
                   std::chrono::system_clock::now());
    db.execute("DELETE FROM sessions WHERE user_id = ?", user_id);
    audit_log.append(opts.dpo_email, "gdpr_art17_delete",
                     user_id, request_id);
    tx.commit();
    posthog.anonymize(std::string(user_id));
    stripe.delete_customer(map_to_stripe(user_id));
    att.add_third_party("PostHog", "anonymized");
    att.add_third_party("Stripe",  "deleted");
    attestation_store.write(request_id, att);
    return att;
}
```

## Citations

- [Osano — Data Subject Access Request overview](https://www.osano.com/articles/data-subject-access-request) — the operational workflow stages, verification tiers, and clock-extension mechanics.
- [Exabeam — GDPR Article 17 right of erasure: how it works and 7 steps to compliance](https://www.exabeam.com/explainers/gdpr-compliance/gdpr-article-17-right-of-erasure-how-it-works-and-7-steps-to-compliance/) — cascade requirements, third-party notification, exception clauses.
- [Cornell Legal Information Institute — Health Insurance Portability and Accountability Act 45 Code of Federal Regulations §164.524](https://www.law.cornell.edu/cfr/text/45/164.524) — Health Insurance Portability and Accountability Act access rights, 30 day clock, 30 day extension.
- General Data Protection Regulation Article 12 (response clock), Article 15 (right of access), Article 17 (right to erasure), Article 20 (right to data portability), Article 28 (processor notification) — primary text at [eur-lex.europa.eu](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- California Consumer Privacy Act §1798.130 and §1798.105 as amended by California Privacy Rights Act — primary text at [oag.ca.gov](https://oag.ca.gov/privacy/ccpa).

## Skill boundaries

You **own** the per-request workflow, evidence file, deletion attestation, and statutory-clock tracking. You **defer**:

- Drafting the public-facing Privacy Policy or Data Processing Agreement language → [[saas/legal-scaffold]].
- Verifying the audit log itself is append-only and hash-chained → [[compliance/audit-log-checker]].
- Generic General Data Protection Regulation compliance review (Records of Processing Activities, Data Protection Impact Assessment, Article 28 processor due diligence) → [[compliance/gdpr-compliance-checker]].
- Drafting the engagement letter that names a Data Protection Officer or Privacy Officer → [[legal/clm-obligations]].
- The mechanics of erasing personal data from an encrypted backup (key destruction vs roll-forward expiry) → infrastructure team plus [[security/secrets-detector]] for any key material in scope.
