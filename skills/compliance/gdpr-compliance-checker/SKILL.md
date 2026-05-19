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
  - quality/accessibility-checker
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

You validate GDPR and privacy compliance by analyzing how personal data is collected, processed, stored, exported, and deleted. You assume every PII field is regulated, every form is an Article 13 surface, and every "delete user" call is an Article 17 obligation that must cascade across the data graph. Your job is to surface gaps BEFORE a DPA does — and before a customer files a complaint with their supervisory authority.

## 2026 Best Practices (Compliance category)

- **Explicit consent for tracking/marketing (Article 7)** — opt-in, granular per purpose, withdrawable as easily as it was granted, timestamped, immutable in audit log. Pre-checked boxes, "continue browsing = consent," and bundled consent for incompatible purposes are all invalid. Tied to Recital 32 ("clear affirmative action").
- **Info-at-collection (Article 13) on every form** — at the point PII is collected directly from the data subject, the controller, purposes, legal basis, retention, third-country transfers, recipients, and rights must be disclosed in clear and plain language. The EDPB's 2026 coordinated enforcement action explicitly targets transparency obligations under Articles 12–14, so missing or buried notices are now a top-of-list supervisory finding.
- **Info-at-secondary-collection (Article 14)** — when PII is obtained from a source other than the data subject (data broker, public scrape, partner enrichment), the same disclosures must reach the data subject within a reasonable period, and at the latest within one month.
- **Data export endpoint (Article 20)** — machine-readable structured output (JSON / CSV) covering the user's full data graph: profile + transactional history + preferences + uploads + consent history. Not a PDF report, not a CSR-mediated email. Must be requestable by the data subject through an authenticated self-service endpoint.
- **Deletion endpoint with audit (Article 17)** — "right to be forgotten" is end-to-end: primary DB, search index, cache, analytics warehouse, backups (per documented retention schedule), and every third-party processor. The deletion event must be logged immutably so the controller can prove fulfilment to a regulator months later.
- **Records of Processing Activities (Article 30)** — a living document. Every new endpoint that touches PII updates the RoPA. Required for any controller with ≥250 employees, and for smaller controllers whose processing is not occasional, includes special categories, or is likely to result in a risk to rights and freedoms.
- **DPO appointment threshold (Article 37)** — mandatory when the core activities consist of large-scale systematic monitoring of data subjects (e.g., behavioural advertising platforms, IoT trackers, ad-tech) or large-scale processing of special categories. Even when not mandatory, naming a privacy lead with documented authority is the 2026 norm.
- **Breach notification readiness (Article 33) — 72-hour clock** — the clock starts from the moment of "awareness," not from the moment of the incident. The notification must include: nature of breach, categories and approximate number of data subjects, DPO/contact point, likely consequences, and mitigation measures. The EU Digital Omnibus proposal under consultation may extend this to 96 hours, but until adopted, 72 hours is the binding rule. Where breach is likely to result in **high risk** to rights and freedoms, the data subjects themselves must also be informed (Article 34) without undue delay.
- **Subprocessor list public** — Article 28 requires the controller to know, document, and authorize every processor. Published subprocessor lists with notification of changes are the 2026 norm and align with SOC2 / ISO 27001 vendor management.
- **EU-US data flows under DPF or SCCs** — the EU-US Data Privacy Framework remains active but legally contested (a fresh Schrems-style challenge is ongoing). For new architectures in 2026, prefer EU-region data residency where feasible, fall back to DPF-certified US processors with Standard Contractual Clauses + Transfer Impact Assessment as the legally durable choice.
- **Continuous compliance > point-in-time audits** — high-risk systems scanned daily, lower-risk monthly. RoPA updated continuously. Pair with [[audit-log-checker]] for the dual-obligation chain: consent grants/revokes AND DSAR fulfilment AND erasure events all need immutable audit trail.
- **Genuine consent UX (not dark patterns)** — reject-all must be as visually prominent as accept-all (CNIL, ICO, BfDI consistent guidance). Cross-link to [[accessibility-checker]] — a consent banner that fails WCAG fails genuine-informed-consent for screen-reader users by definition.

## What to Check

### Personal Data Identification (the PII surface)

```javascript
const piiFields = [
  // Identity
  'email', 'phone', 'address', 'name', 'firstName', 'lastName',
  // Government-issued
  'ssn', 'nationalId', 'passport', 'drivingLicense', 'taxId', 'vatNumber',
  // Demographic
  'dateOfBirth', 'dob', 'birthDate', 'age', 'gender',
  // Online identifiers (Recital 30 — IP and cookie IDs ARE personal data)
  'ipAddress', 'ip', 'cookieId', 'deviceId', 'fingerprint',
  // Location
  'location', 'geoLocation', 'gps', 'coordinates',
  // Financial
  'creditCard', 'cardNumber', 'bankAccount', 'iban',
  // Authentication artefacts
  'password', 'secret', 'token', 'sessionId',
  // Special categories (Article 9 — extra-strict)
  'health', 'medical', 'ethnicity', 'religion', 'politicalView', 'sexualOrientation', 'biometric'
];
```

Special categories (Article 9) require an additional lawful basis beyond Article 6 — almost always explicit consent or a statutory exemption. Flag every collection point that touches them.

## Compliance Categories (BAD / SAFE patterns)

### 0. Missing Consent Banner (Article 7) — TOP PRIORITY

```typescript
// BAD: tracking/analytics fires on every page load with no consent gate
import posthog from 'posthog-js';
posthog.init(PROCESS_ENV_POSTHOG_KEY, { api_host: '...' });
// — fires before user has accepted, before consent UI is even rendered

// BAD: pre-checked marketing opt-in
<input type="checkbox" name="marketing" defaultChecked />
<label>Send me product updates</label>

// SAFE: granular opt-in per purpose, default unchecked, equally prominent reject
interface ConsentRecord {
  userId: string;
  purpose: 'essential' | 'analytics' | 'marketing' | 'personalization';
  granted: boolean;
  timestamp: Date;       // immutable
  ipAddress: string;     // for audit
  userAgent: string;
  method: 'banner' | 'preferences-page' | 'signup-form';
  policyVersion: string; // pin the privacy policy the user saw
}

// SAFE: analytics gated until consent granted
if (await consent.has(userId, 'analytics')) {
  posthog.init(KEY, { api_host: '...' });
}
```

Edge cases: bundled consent (one checkbox for "marketing AND analytics AND profiling" — invalid), nudged consent (accept-all coloured green, reject-all coloured grey/hidden — invalid per CNIL/EDPB), consent walls ("you must accept tracking to use this site" — invalid for non-essential cookies), no withdraw-consent endpoint (Article 7(3) requires withdrawal as easy as grant).

### 1. Info-at-Collection (Article 13) Missing or Buried

```csharp
// BAD (ASP.NET Core minimal API): form posts PII with no privacy notice
app.MapPost("/api/signup", async (SignupDto dto, AppDb db) => {
    var user = new User { Email = dto.Email, Name = dto.Name };
    db.Users.Add(user);
    await db.SaveChangesAsync();
    return Results.Ok();
});
// — user never sees: who's the controller, why we collect, retention, their rights

// SAFE: pin policy version + link to notice + assert acceptance was logged
app.MapPost("/api/signup", async (SignupDto dto, ClaimsPrincipal _,
    AppDb db, IConsentLogger consent) =>
{
    if (string.IsNullOrEmpty(dto.PrivacyPolicyVersion))
        return Results.BadRequest("privacy policy acceptance required");

    var user = new User { Email = dto.Email, Name = dto.Name };
    db.Users.Add(user);
    await db.SaveChangesAsync();

    await consent.RecordAsync(new ConsentEvent(
        UserId: user.Id,
        Purpose: "service-provision",
        PolicyVersion: dto.PrivacyPolicyVersion,
        LegalBasis: "contract",  // Article 6(1)(b)
        IpAddress: _.GetIp(),
        Timestamp: DateTimeOffset.UtcNow));

    return Results.Ok(user);
});
```

Every form must link to a privacy notice that covers Article 13(1)/(2): controller identity, DPO contact, purposes, legal basis, recipients, retention, transfer destinations, automated decision-making, rights, and right to complain to a supervisory authority.

### 2. No Data-Export Endpoint (Article 20)

```csharp
// BAD: no portability endpoint — users can't get their data
// (silent gap — nothing to flag in source, but the absence IS the finding)

// SAFE (C# .NET 9): authenticated self-service export
app.MapGet("/api/data-export/{userId:guid}",
    [Authorize] async (Guid userId, ClaimsPrincipal caller,
        AppDb db, IAuditLog audit) =>
{
    var callerId = Guid.Parse(caller.FindFirstValue(ClaimTypes.NameIdentifier)!);
    if (callerId != userId && !caller.IsInRole("DPO"))
        return Results.Forbid();

    var bundle = new DataExportBundle {
        Profile     = await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId),
        Orders      = await db.Orders.AsNoTracking().Where(o => o.UserId == userId).ToListAsync(),
        Preferences = await db.Preferences.AsNoTracking().Where(p => p.UserId == userId).ToListAsync(),
        ConsentHistory = await db.ConsentEvents.AsNoTracking()
            .Where(c => c.UserId == userId).OrderBy(c => c.Timestamp).ToListAsync(),
        GeneratedAt = DateTimeOffset.UtcNow,
        Format      = "application/json"
    };

    await audit.RecordAsync(new DsarEvent(
        Kind: "data-export",
        SubjectUserId: userId,
        ActorUserId: callerId,
        Article: "GDPR-20",
        Timestamp: DateTimeOffset.UtcNow));

    return Results.Json(bundle);
});
```

```java
// SAFE (Java 21+ / Spring Boot): equivalent Article 20 endpoint
@RestController
@RequestMapping("/api/data-export")
public class DataExportController {

    private final UserRepository users;
    private final OrderRepository orders;
    private final ConsentRepository consents;
    private final AuditLogService audit;

    @GetMapping("/{userId}")
    @PreAuthorize("hasRole('DPO') or #userId == authentication.principal.id")
    public ResponseEntity<DataExportBundle> export(@PathVariable UUID userId,
                                                   Authentication auth) {
        var bundle = new DataExportBundle(
            users.findById(userId).orElseThrow(),
            orders.findByUserId(userId),
            consents.findByUserIdOrderByTimestamp(userId),
            Instant.now(),
            MediaType.APPLICATION_JSON_VALUE);
        audit.recordDsar("data-export", userId,
            ((UserPrincipal) auth.getPrincipal()).id(), "GDPR-20");
        return ResponseEntity.ok(bundle);
    }
}
```

```python
# SAFE (Python 3.12+ / FastAPI): equivalent Article 20 endpoint
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, UTC
from uuid import UUID

router = APIRouter()

@router.get("/api/data-export/{user_id}")
async def export_user_data(
    user_id: UUID,
    caller: User = Depends(get_current_user),
    db=Depends(get_db),
    audit=Depends(get_audit_log),
):
    if caller.id != user_id and "dpo" not in caller.roles:
        raise HTTPException(status_code=403)

    bundle = {
        "profile":         await db.users.find_one(user_id),
        "orders":          await db.orders.find_all_by_user(user_id),
        "preferences":     await db.preferences.find_all_by_user(user_id),
        "consent_history": await db.consent_events.find_all_by_user(user_id),
        "generated_at":    datetime.now(UTC).isoformat(),
        "format":          "application/json",
    }
    await audit.record_dsar(
        kind="data-export", subject_user_id=user_id,
        actor_user_id=caller.id, article="GDPR-20",
    )
    return bundle
```

```typescript
// SAFE (Next.js 15 — Server Action + Edge API for streaming large exports)
'use server';
import { auth } from '@/auth';
import { db } from '@/db';
import { recordDsar } from '@/lib/audit';

export async function exportUserData(targetUserId: string) {
  const session = await auth();
  if (!session) throw new Error('unauthenticated');
  if (session.user.id !== targetUserId && !session.user.roles.includes('dpo'))
    throw new Error('forbidden');

  const bundle = {
    profile:        await db.user.findUnique({ where: { id: targetUserId } }),
    orders:         await db.order.findMany({ where: { userId: targetUserId } }),
    preferences:    await db.preference.findMany({ where: { userId: targetUserId } }),
    consentHistory: await db.consentEvent.findMany({
                      where: { userId: targetUserId },
                      orderBy: { timestamp: 'asc' } }),
    generatedAt:    new Date().toISOString(),
    format:         'application/json',
  };

  await recordDsar({
    kind: 'data-export',
    subjectUserId: targetUserId,
    actorUserId: session.user.id,
    article: 'GDPR-20',
  });

  return bundle;
}
```

### 3. No Delete-Account Endpoint (Article 17) — and Soft-Delete with No Purge

```csharp
// BAD: soft-delete only — row stays forever, no purge schedule
app.MapDelete("/api/users/{userId:guid}",
    [Authorize] async (Guid userId, AppDb db) => {
        var u = await db.Users.FindAsync(userId);
        u.IsDeleted = true;          // tombstone — data still there
        await db.SaveChangesAsync();
        return Results.NoContent();
});

// SAFE (C# .NET 9): cascading erasure + audit + scheduled hard purge
app.MapDelete("/api/delete-account/{userId:guid}",
    [Authorize] async (Guid userId, ClaimsPrincipal caller, AppDb db,
        ISearchIndex search, ICache cache, IProcessorNotifier processors,
        IAuditLog audit) =>
{
    var callerId = Guid.Parse(caller.FindFirstValue(ClaimTypes.NameIdentifier)!);
    if (callerId != userId && !caller.IsInRole("DPO"))
        return Results.Forbid();

    using var tx = await db.Database.BeginTransactionAsync();

    // 1. Anonymize transactional rows (tax/accounting retention may require keeping)
    await db.Orders.Where(o => o.UserId == userId)
        .ExecuteUpdateAsync(s => s.SetProperty(o => o.UserId, (Guid?)null)
                                  .SetProperty(o => o.UserEmailHash, "[anonymized]"));

    // 2. Hard-delete PII-only rows
    await db.Preferences.Where(p => p.UserId == userId).ExecuteDeleteAsync();
    await db.Logs.Where(l => l.UserId == userId).ExecuteDeleteAsync();

    // 3. Tombstone the user record itself, schedule hard purge after legal hold (30 days)
    var user = await db.Users.FindAsync(userId);
    user!.Email = $"[erased-{userId}]";
    user.Name   = "[erased]";
    user.ErasureScheduledForHardDeleteAt = DateTimeOffset.UtcNow.AddDays(30);

    await db.SaveChangesAsync();

    // 4. Fan-out: search index, cache, downstream processors
    await search.RemoveAsync(userId);
    await cache.InvalidateAsync($"user:{userId}");
    await processors.NotifyErasureAsync(userId);   // Stripe / Resend / PostHog / etc

    // 5. Immutable audit — DPO must be able to prove fulfilment to regulator
    await audit.RecordAsync(new DsarEvent(
        Kind: "erasure",
        SubjectUserId: userId,
        ActorUserId: callerId,
        Article: "GDPR-17",
        HardPurgeScheduledAt: user.ErasureScheduledForHardDeleteAt,
        Timestamp: DateTimeOffset.UtcNow));

    await tx.CommitAsync();
    return Results.NoContent();
});
```

```java
// SAFE (Java 21+ / Spring Boot): equivalent erasure endpoint
@RestController
public class AccountController {

    @DeleteMapping("/api/delete-account/{userId}")
    @PreAuthorize("hasRole('DPO') or #userId == authentication.principal.id")
    @Transactional
    public ResponseEntity<Void> deleteAccount(@PathVariable UUID userId,
                                              Authentication auth) {
        orderRepo.anonymizeByUserId(userId);
        preferenceRepo.deleteByUserId(userId);
        logRepo.deleteByUserId(userId);

        var user = userRepo.findById(userId).orElseThrow();
        user.setEmail("[erased-" + userId + "]");
        user.setName("[erased]");
        user.setHardPurgeScheduledFor(Instant.now().plus(Duration.ofDays(30)));
        userRepo.save(user);

        searchIndex.remove(userId);
        cache.invalidate("user:" + userId);
        processorNotifier.notifyErasure(userId);

        auditLog.recordDsar("erasure", userId,
            ((UserPrincipal) auth.getPrincipal()).id(), "GDPR-17");
        return ResponseEntity.noContent().build();
    }
}
```

```python
# SAFE (Python 3.12+ / FastAPI): equivalent erasure endpoint
@router.delete("/api/delete-account/{user_id}", status_code=204)
async def delete_account(
    user_id: UUID,
    caller: User = Depends(get_current_user),
    db=Depends(get_db),
    search=Depends(get_search_index),
    cache=Depends(get_cache),
    processors=Depends(get_processor_notifier),
    audit=Depends(get_audit_log),
):
    if caller.id != user_id and "dpo" not in caller.roles:
        raise HTTPException(status_code=403)

    async with db.transaction():
        await db.orders.anonymize_by_user(user_id)
        await db.preferences.delete_by_user(user_id)
        await db.logs.delete_by_user(user_id)
        await db.users.tombstone(
            user_id,
            hard_purge_at=datetime.now(UTC) + timedelta(days=30),
        )

    await search.remove(user_id)
    await cache.invalidate(f"user:{user_id}")
    await processors.notify_erasure(user_id)
    await audit.record_dsar(
        kind="erasure", subject_user_id=user_id,
        actor_user_id=caller.id, article="GDPR-17",
    )
```

```typescript
// SAFE (Next.js 15 — Edge API route for erasure)
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/db';
import { recordDsar } from '@/lib/audit';

export const runtime = 'edge';

export async function DELETE(req: NextRequest,
                             { params }: { params: { userId: string } }) {
  const session = await auth();
  if (!session) return new NextResponse('unauthenticated', { status: 401 });
  if (session.user.id !== params.userId && !session.user.roles.includes('dpo'))
    return new NextResponse('forbidden', { status: 403 });

  await db.$transaction(async (tx) => {
    await tx.order.updateMany({ where: { userId: params.userId },
                                data: { userId: null, userEmailHash: '[anonymized]' } });
    await tx.preference.deleteMany({ where: { userId: params.userId } });
    await tx.log.deleteMany({ where: { userId: params.userId } });
    await tx.user.update({
      where: { id: params.userId },
      data:  { email: `[erased-${params.userId}]`, name: '[erased]',
               hardPurgeScheduledFor: new Date(Date.now() + 30*24*60*60*1000) },
    });
  });

  await recordDsar({ kind: 'erasure', subjectUserId: params.userId,
                     actorUserId: session.user.id, article: 'GDPR-17' });
  return new NextResponse(null, { status: 204 });
}
```

```sql
-- BAD: soft-delete with no purge schedule, no audit, no anonymization
UPDATE users SET is_deleted = TRUE WHERE id = $1;
-- Row stays forever. PII remains queryable. Indistinguishable from "never deleted."

-- SAFE: foundational tables for Article 17 + Article 30 fulfilment
CREATE TABLE audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    event_kind          TEXT NOT NULL CHECK (event_kind IN
                          ('consent-granted','consent-revoked',
                           'data-export','erasure','rectification')),
    subject_user_id     UUID NOT NULL,
    actor_user_id       UUID NOT NULL,
    gdpr_article        TEXT NOT NULL,   -- e.g. 'GDPR-17', 'GDPR-20', 'GDPR-7'
    payload_hash        TEXT,            -- sha256 of fulfilment artefact
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_log_immutable CHECK (occurred_at <= now())
);
-- Append-only — never UPDATE or DELETE this table.
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;

CREATE TABLE data_export_job (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_user_id     UUID NOT NULL,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    artefact_url        TEXT,            -- signed URL, short-lived
    status              TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','running','complete','failed'))
);

-- SAFE: anonymize an order row (preserve aggregate, drop the link to the human)
UPDATE orders
SET    user_id        = NULL,
       user_email     = '[anonymized]',
       user_email_hash = encode(digest(user_email, 'sha256'), 'hex')  -- prove uniqueness without identifying
WHERE  user_id = $1;

-- SAFE: tombstone the user and schedule hard purge after legal hold
UPDATE users
SET    email                          = '[erased-' || id::text || ']',
       name                           = '[erased]',
       hard_purge_scheduled_for       = now() + interval '30 days',
       erasure_requested_at           = now()
WHERE  id = $1;

-- SAFE: scheduled purge job (run daily) — Article 17 end-state
DELETE FROM users
WHERE  hard_purge_scheduled_for IS NOT NULL
  AND  hard_purge_scheduled_for < now();

-- SAFE: query for "did we fulfil this DSAR?" — proves compliance to regulator
SELECT event_kind, gdpr_article, occurred_at, actor_user_id
FROM   audit_log
WHERE  subject_user_id = $1
  AND  event_kind IN ('data-export','erasure','rectification')
ORDER  BY occurred_at;
```

Edge cases: tax/accounting law may *require* keeping anonymized transactional rows for 7–10 years (Article 17(3)(b) — legal obligation overrides erasure). Backup retention windows are negotiable but must be documented and survive an audit. Free-text fields (notes, comments) often contain unstructured PII the cascading delete misses — pair with [[database-reviewer]].

### 4. No Audit on DSAR Fulfilment

Without an immutable audit trail, the DPO cannot prove to a supervisory authority that an Article 15 / 17 / 20 request was fulfilled within the one-month statutory window. The DSAR may have been completed perfectly — but if it can't be evidenced, it counts as non-compliance. See the `audit_log` and `data_export_job` tables above and pair with [[audit-log-checker]].

### 5. No Breach Response Runbook (Article 33 / 34)

The 72-hour clock starts the moment the controller becomes aware of a personal data breach. A team that has never rehearsed will not detect, scope, classify risk, contact the DPO, and draft the supervisory-authority notification in that window. Required artefacts in the repo:

- `docs/breach-response-runbook.md` — roles, on-call rotation, decision tree (notify / don't notify), template notification to supervisory authority, template communication to data subjects.
- Tabletop exercise log — at least one per year, ideally quarterly.
- Detection signals wired to alerting: unauthorized PII reads, anomalous bulk exports, ransomware indicators, credential dumps surfacing on dark web.

Flag any production system with PII processing that has no runbook in the repo.

### 6. Missing Subprocessor List

Article 28 requires the controller to document, authorize, and disclose every processor that handles PII on the controller's behalf. The 2026 norm is a public subprocessor page (`/legal/subprocessors`) with name, purpose, location, transfer mechanism (SCC / DPF / adequacy decision), and a notification mailing list for changes. Missing this surfaces during enterprise procurement and may block sales to EU customers.

### 7. Non-EU Data Transfer Without SCCs/DPF

```typescript
// BAD: shipping EU user data to a US analytics processor with no transfer mechanism documented
posthog.capture('signup', { email: euUser.email, ip: euUser.ip });
// — fine if PostHog EU region; not fine if US-region without DPF certification or SCCs

// SAFE: pin EU region, or verify the processor's DPF active certification + sign SCCs as fallback
posthog.init(KEY, { api_host: 'https://eu.i.posthog.com' });
```

Flag any third-party SDK / API call shipping PII to a region whose adequacy status isn't documented. Use the European Commission's adequacy decision list (UK, Switzerland, Japan, South Korea, Israel, NZ, Argentina, Canada-commercial, Uruguay, Faroe Islands, Guernsey, Isle of Man, Jersey, Andorra) as the allowlist. The EU-US DPF is active but under live challenge — annotate transfers under DPF with a fallback-SCC plan.

### 8. Dark Patterns in Consent UI

```html
<!-- BAD: accept-all is a giant green button, reject-all is a small grey link buried below -->
<button class="btn-primary btn-xl">Accept All Cookies</button>
<a href="#" class="text-xs text-grey-400">Manage preferences</a>

<!-- SAFE: visually equal weight, equally accessible -->
<button class="btn-primary">Accept All</button>
<button class="btn-primary">Reject All</button>
<button class="btn-secondary">Manage Preferences</button>
```

Cross-link [[accessibility-checker]] — a consent banner that fails WCAG 2.2 AA (color contrast, keyboard focus, screen-reader labels, no-keyboard-trap) cannot collect *genuine, informed* consent from disabled users. The two regulations interlock: GDPR Article 7 requires consent be unambiguous and freely given; the European Accessibility Act (EAA, in force June 2025) makes inaccessible consent UI a separate violation.

## Output Format (human-readable scan report)

```markdown
## GDPR Compliance Report

### Personal Data Inventory
| Data Type   | Location       | Encrypted | Retention   | Legal Basis     |
|-------------|----------------|-----------|-------------|-----------------|
| email       | users          | Yes (rest)| 365 days    | contract        |
| ip_address  | request_logs   | No        | undefined   | UNCLEAR — FLAG  |
| health_note | patient_notes  | Yes       | 7 years     | explicit consent|

### Rights Implementation
| Right                      | Implemented | Endpoint                            |
|----------------------------|-------------|-------------------------------------|
| Access (Art. 15)           | Yes         | GET  /api/data-export/{userId}       |
| Erasure (Art. 17)          | Partial     | DELETE /api/delete-account/{userId}  |
| Portability (Art. 20)      | Yes         | GET  /api/data-export/{userId}       |
| Rectification (Art. 16)    | Missing     | —                                    |
| Object (Art. 21)           | Missing     | —                                    |

### Critical Findings
1. **Missing rectification endpoint** (Art. 16) — `severity: critical`
2. **Soft-delete with no hard-purge schedule** (Art. 17) — `severity: critical`
3. **IP addresses logged without consent record or retention policy** (Art. 5(1)(e), Art. 7)
4. **PostHog calls US region with no DPF / SCC documentation** (Chapter V)
5. **No `/legal/subprocessors` page; no notification mailing list** (Art. 28)

### Recommendations (ordered by Article)
1. Add rectification endpoint and wire to audit log
2. Add scheduled `purge_after_hold` job; document retention policy per table
3. Document IP-address retention or stop collecting
4. Pin PostHog EU region OR document DPF + SCC fallback in `/docs/transfers.md`
5. Publish subprocessor list and changes notification
```

## Tool Integration (2026)

| Tool / Suite | Strengths | When to use |
|---|---|---|
| **OneTrust** | Enterprise CMP + DSAR workflow + RoPA + vendor risk; broadest regulator coverage | Enterprise / regulated industries; multi-jurisdiction |
| **Cookiebot (Usercentrics)** | Automated cookie scanner, CMP, consent log; integrates with GTM | Mid-market / EU-first SaaS |
| **Termly** | CMP + auto-generated policies (Privacy / ToS / Cookies / DPA); SMB pricing | Startups; SMB SaaS |
| **iubenda** | CMP + policy generator + DPA repository; strong for ad-tech compliance | EU-Italy-origin SaaS; ad-tech |
| **Vanta** | SOC 2 / ISO 27001 / **GDPR** continuous-control mapping; auto-collected evidence | SaaS chasing SOC2 alongside GDPR |
| **Drata** | Same space as Vanta; strong GRC workflow + auditor handoff | Same |
| **Secureframe** | SOC2 + ISO + GDPR + HIPAA, comparable to Vanta/Drata | Same |
| **Privado.ai** | Code-scan privacy analysis (static); maps PII flows from source → sink → processor; emits RoPA | Engineering-led GDPR programs |
| **Transcend** | DSAR automation across SaaS estate; consent management; deep API integrations | Mature programs with many SaaS processors |

**Article 30 RoPA templates** — start from the EDPB's published template or use the ICO's RoPA workbook; both ship as Excel/CSV and import into all the suites above. Pair generated RoPA with [[audit-log-checker]] so changes to RoPA are themselves audited.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Missing deletion endpoint, no consent records, PII transferred to non-adequate country without SCC/DPF, no breach runbook, soft-delete with no purge | BLOCK release |
| HIGH | Missing rectification, pre-checked consent boxes, dark-pattern consent UI, missing Article 13 notice on a PII-collecting form | BLOCK release |
| MEDIUM | Incomplete cascade-delete (e.g. logs not anonymized), undefined retention for one table, missing subprocessor list | Fix in sprint |
| LOW | Stale RoPA, missing DPO contact in privacy policy footer, audit-log query slow | Backlog |

## Red Lines

- NEVER ship a system that collects PII without consent records linked to the user, the purpose, and the policy version.
- NEVER use pre-checked consent boxes, bundled consent, or consent walls for non-essential processing.
- NEVER log full credentials or full credit card numbers (mask to last4; PAN belongs in a PCI-DSS-scoped vault, not your DB).
- NEVER skip the cascade-delete check on user erasure (primary DB + search + cache + analytics + processors + backups).
- NEVER ship an Article 20 data export as a PDF — must be JSON/CSV machine-readable.
- NEVER soft-delete with no documented hard-purge schedule.
- NEVER ship PII to a non-adequate country without SCC + DPIA-quality transfer-impact assessment, or without an active DPF certification on the receiving processor.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = code-evidenced; low = inferred from absence
engine: gdpr-compliance-checker | privado | onetrust | manual
kind: missing-consent-banner
       | opt-out-not-opt-in
       | missing-data-export-endpoint
       | missing-delete-account-endpoint
       | soft-delete-no-purge-schedule
       | no-dsar-audit
       | no-breach-runbook
       | missing-subprocessor-list
       | non-eu-transfer-without-sccs-dpf
       | dark-pattern-consent-ui
       | missing-article-13-notice
       | missing-article-14-notice
       | special-category-without-explicit-consent
gdpr_article: "GDPR-7" | "GDPR-13" | "GDPR-14" | "GDPR-15" | "GDPR-17" | "GDPR-20"
             | "GDPR-28" | "GDPR-30" | "GDPR-33" | "GDPR-34" | "GDPR-37" | "GDPR-Chapter-V"
target_file: src/api/users/route.ts
target_line: 42
sink: "db.user.update({ data: { isDeleted: true } })"   # the offending operation
source: "DELETE /api/users/[id]"                         # the endpoint or surface
reachable: true | false | unknown                        # is this endpoint actually wired up?
delta_to_baseline: new | unchanged | regressed           # vs. previous GDPR scan
message: "Soft-delete tombstones row but no hard-purge job scheduled — Art. 17 unfulfilled"
suggested_fix: "Add hard_purge_scheduled_for timestamp + daily DELETE job after legal hold expires"
reference: https://gdpr-info.eu/art-17-gdpr/
```

The integrator uses `confidence` and `reachable` to weight findings — a `confidence: low` "endpoint may be missing" doesn't block phase advancement on its own, but a code-evidenced soft-delete-with-no-purge does. `delta_to_baseline: unchanged` lets the integrator skip already-accepted findings (e.g. legacy tables with documented migration plan).

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
