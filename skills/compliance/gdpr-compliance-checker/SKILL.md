---
name: gdpr-compliance-checker
description: Validates GDPR/privacy compliance in code, data flows, consent, and right-to-erasure implementation.
type: skill
when_to_load:
  - "GDPR check"
  - "GDPR compliance"
  - "data protection audit"
  - "privacy review"
  - "right to be forgotten"
  - "data privacy compliance"
related_skills:
  - compliance/audit-log-checker
  - compliance/license-scanner
  - security/secrets-detector
  - specialized/database-reviewer
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Grep
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# GDPR Compliance Checker (skill)

> Converted from agents/compliance/gdpr-compliance-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate GDPR and privacy compliance by analyzing how personal data is collected, processed, stored, and deleted.

## 2026 Best Practices (Compliance category)

- **Continuous compliance > point-in-time audits**: high-risk systems scanned daily, lower-risk monthly. Records of Processing Activities updated continuously, not annually.
- **Consent + audit logging are dual obligations**: timestamped, immutable, queryable. Every consent grant + revoke must be retrievable. Pair with [[audit-log-checker]].
- **Right of erasure is end-to-end**: deleting a user means deleting them everywhere — primary DB, search index, cache, analytics, backups (per retention policy), and third-party processors.
- **Portability is machine-readable**: JSON export with the user's full data graph, not a PDF report.
- **Records of Processing Activities (RoPA)**: a living artifact. Every new endpoint that touches PII updates the RoPA.
- **Data minimization at ingestion**: don't collect what you don't need. Question every PII field.

## GDPR Requirements

### Article 5 — Data Principles
1. Lawfulness, fairness, transparency
2. Purpose limitation
3. Data minimization
4. Accuracy
5. Storage limitation
6. Integrity and confidentiality
7. Accountability

### Key Rights
- Right of access (Art. 15)
- Right to rectification (Art. 16)
- Right to erasure (Art. 17)
- Right to portability (Art. 20)
- Right to object (Art. 21)

## What to Check

### Personal Data Identification
```javascript
const piiFields = [
  'email', 'phone', 'address', 'name', 'firstName', 'lastName',
  'ssn', 'nationalId', 'passport', 'drivingLicense',
  'dateOfBirth', 'dob', 'birthDate', 'age',
  'ipAddress', 'ip', 'location', 'geoLocation',
  'creditCard', 'cardNumber', 'bankAccount',
  'password', 'secret', 'token'
];
```

### Consent Mechanisms
```typescript
// GOOD - Explicit consent
interface ConsentRecord {
  userId: string;
  purpose: 'marketing' | 'analytics' | 'personalization';
  granted: boolean;
  timestamp: Date;
  ipAddress: string;
  method: 'checkbox' | 'button' | 'form';
}

// BAD - Pre-checked consent
<input type="checkbox" checked /> I agree to marketing emails
```

### Right to Deletion
```typescript
// GOOD - Complete deletion
async function deleteUser(userId: string): Promise<void> {
  await db.users.delete({ id: userId });
  await db.orders.anonymize({ userId });
  await db.logs.delete({ userId });
  await cache.invalidate(`user:${userId}`);
  await searchIndex.remove(userId);
  await auditLog.recordDeletion(userId);
}
```

### Data Export (Portability)
```typescript
async function exportUserData(userId: string): Promise<UserExport> {
  return {
    format: 'JSON',
    data: {
      profile: await db.users.findOne({ id: userId }),
      orders: await db.orders.find({ userId }),
      preferences: await db.preferences.find({ userId })
    }
  };
}
```

## Output Format

```markdown
## GDPR Compliance Report

### Personal Data Inventory
| Data Type | Location | Encrypted | Retention |
|-----------|----------|-----------|-----------|
| email | users table | Yes | 365 days |
| ip_address | logs table | No | Undefined |

### Rights Implementation
| Right | Implemented | Endpoint |
|-------|-------------|----------|
| Access (Art. 15) | Yes | GET /api/users/me/data |
| Erasure (Art. 17) | Partial | DELETE /api/users/me |
| Portability (Art. 20) | Missing | - |

### Critical Issues
1. **No data export endpoint** (Art. 20)
2. **Incomplete deletion** (Art. 17) — logs not deleted with user
3. **IP addresses stored without consent**

### Recommendations
1. Implement data export endpoint for portability
2. Add retention policies to all tables with PII
3. Create consent management system
4. Add anonymization for analytics data
5. Document data processing activities (Art. 30 — RoPA)
```

## Red Lines

- NEVER ship a system that collects PII without consent records
- NEVER use pre-checked consent boxes
- NEVER log full credentials or full credit card numbers (mask to last4)
- NEVER skip the cascade-delete check on user erasure

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
