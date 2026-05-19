---
name: audit-log-checker
description: Validates audit logging for compliance, security, and operational visibility.
type: skill
when_to_load:
  - "audit log review"
  - "audit trail check"
  - "compliance logging"
  - "audit logging audit"
  - "audit log compliance"
  - "log compliance"
related_skills:
  - compliance/gdpr-compliance-checker
  - specialized/observability-checker
  - security/secrets-detector
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

# Audit Log Checker (skill)

> Converted from agents/compliance/audit-log-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You verify that proper audit logging is implemented for security events, compliance requirements, and operational visibility. You assume that an attacker (or a regulator) will eventually read these logs — so they must be complete, append-only, tamper-evident, free of PII payloads, and reconstructible into a clean before/after timeline of every state change.

## 2026 Best Practices

These are the non-negotiables. Each one becomes a category below and a `critical` letter when violated.

- **Log every state change with the full 6-tuple**: `(actor, action, target, before, after, timestamp_utc, ip + user_agent)`. Missing any element below `actor + action + target + timestamp` is a critical finding. `before/after` is required for mutations; auth events instead include `result` (success/failure) and `auth_method`.
- **Append-only enforced at the database level, not just in code**. Application-level "no UPDATE method on the logger class" is necessary but not sufficient — an attacker with DB credentials bypasses it. Revoke `UPDATE` and `DELETE` on the audit table from every role except a sealed retention job. Postgres: `REVOKE UPDATE, DELETE ON audit_log FROM app_user;` plus a `BEFORE UPDATE OR DELETE` trigger that raises. For cloud: S3 Object Lock (compliance mode), Azure Immutable Blob, or GCS retention policies for the cold tier.
- **Hash chain or signed batches for tamper-evidence**. Each row stores `prev_hash` + `row_hash = HMAC-SHA256(canonical_json(row) || prev_hash, key)`. Any UPDATE/DELETE breaks the chain for every subsequent row. The HMAC key lives in KMS / Vault, never in the same DB. Threat model: this defeats an attacker with table-write access but not the HMAC key; it does NOT defeat an attacker who owns the application at runtime — pair with periodic anchored roots in immutable storage for that case.
- **Org-scoped — every row carries `tenant_id`**. The audit table is a cross-tenant beam: an admin querying without a `WHERE tenant_id = ?` predicate (or worse, a non-admin reading the table at all) is a data-leak path. RLS policies on the table are mandatory in multi-tenant systems.
- **Structured JSON, never string concatenation**. Use the language's structured-logging API. Concatenating untrusted input into the log message enables log injection (CRLF can fake new entries) and breaks downstream parsers. Canonical field set: `event_id, occurred_at, actor_id, actor_type, action, target_type, target_id, tenant_id, ip, user_agent, request_id, result, before, after, prev_hash, row_hash`.
- **Retention per the strictest regulation that applies**:
  - **PCI-DSS 4.0**: 12 months retained, 3 months immediately searchable. This is the most concrete bar; many shops apply it universally.
  - **HIPAA**: 6 years (covered-entity documentation retention applies to audit logs).
  - **SOC 2**: no fixed period; ≥12 months is the common interpretation.
  - **SOX**: 7 years.
  - **GDPR**: per-purpose; the audit log itself is a legitimate-interest record and is typically retained for the regulation that drove the underlying processing.
  - **Default if uncertain**: 2 years hot + cold-archive to the longest applicable horizon.
- **Compliance export endpoint** for auditors — a signed, append-only export (CSV or NDJSON) bounded by a date range, with the hash chain validated and the export itself logged as an audit event.
- **PII minimization**: the audit log records *that* something happened and *who did it*, not the secret payload. Never log passwords, MFA codes, full PANs (last-4 + BIN at most, or a hash), full SSNs, session tokens, API keys, or the body of an encrypted PHI field. For "show me what changed" on a sensitive field, store a hash of the value, or `"redacted"`, not the value itself. Right to erasure under GDPR/CCPA must reach the audit table's PII surface — design for this from day one.
- **Auth event coverage is mandatory**: sign-in (success + failure), sign-out, password change, password-reset request + completion, MFA enroll/disable/verify, session creation/termination, account lockout, role change, permission grant/revoke, impersonation start/stop, API-key create/rotate/revoke, SSO/SAML/OIDC handshake events.
- **Query access to the audit table is itself audited**, and unprivileged users cannot read it. A non-admin reading the audit log is an information-disclosure vector (it leaks who-did-what across the org).
- **Continuous compliance > point-in-time audits**: audit logging is verified on every PR, not at audit-time. Pair with [[gdpr-compliance-checker]] and [[secrets-detector]].

## Categories

Each category below maps to a finding kind the skill emits. Ordering reflects severity: a missing append-only enforcement leaks the entire history; a missing tenant scope leaks across customers; a PII-in-payload is a regulator-visible breach.

### 1. Missing audit on mutation

Any code path that performs `INSERT/UPDATE/DELETE` or equivalent on a business entity without writing a corresponding audit row is a finding. The audit write must be in the same transaction as the mutation (or use outbox + idempotent consumer) so a partial commit doesn't lose either side.

### 2. Missing audit on auth events

Sign-in/out, MFA, password change, role change — covered above. Sign-in *failures* must be logged with enough context to detect credential-stuffing without logging the attempted password.

### 3. Audit log table allows UPDATE/DELETE (tamper risk)

Schema-level finding. Inspect DDL: if no `REVOKE` is present, or no trigger raises on UPDATE/DELETE, or no Object-Lock / immutable-blob equivalent for the persisted store, emit a critical. "We trust our application code" is not a defense; the threat model includes a compromised replica and an insider with SQL credentials.

### 4. No hash chain (silent tamper undetectable)

Without a per-row hash chain (or signed batches), an attacker who *does* reach the table can rewrite history and you will never know. Emit a finding whenever the schema has no `prev_hash`/`row_hash` columns and no equivalent (e.g., AWS QLDB, an external append-only ledger, or anchored Merkle roots).

### 5. Missing actor

Any audit row written with `actor_id = NULL` (or a placeholder like `system` without a chain back to a real principal) is a finding. System-initiated jobs must record the job's principal identity (service account, scheduler, queue worker) and the originating user if any.

### 6. Missing tenant_id (cross-tenant leak)

In multi-tenant systems, an audit row without `tenant_id` makes admin queries leak data across customers and breaks data-subject-access export. Emit a finding for any audit insert that doesn't include `tenant_id`, and for any audit-log query without a `tenant_id` predicate.

### 7. PII in audit payload (compliance violation)

Scan `before`/`after`/`metadata` shapes for: `password`, `password_hash` (the *value*, not the column name; the hash itself is moderately sensitive), `pan`, `card_number`, `ssn`, `tax_id`, `mfa_code`, `otp`, `session_token`, `bearer`, `api_key`, `private_key`, `secret`, `phi`, free-form `email_body` / `message_body` where regulated.

### 8. Missing retention policy

Schema, CI, or infrastructure should declare the retention horizon. If you can't find one in `terraform/*.tf`, `migrations/`, `.ctoc/settings.yaml`, or an explicit `retention_days` column in a config table, emit a finding.

### 9. Audit log queryable by non-admins (information leak)

Inspect RLS policies, ORM scopes, and API routes that read `audit_log` / `audit_event` / similar tables. A `GET /audit-events` without role-gated authorization is critical: it leaks the entire org's behavior to any authenticated user.

### 10. Audit write outside the entity's transaction

If the mutation commits but the audit insert is best-effort / fire-and-forget / on a different connection, you lose the row on partial failure. Either co-transactional or use an outbox table with an idempotent consumer; anything else is a finding.

## Required Audit Events

### Authentication
- Login success / failure (failures: include `reason` enum, never the attempted password)
- Logout
- Password change / reset request / reset completion
- MFA enroll / disable / verify
- Session create / terminate / forced-logout
- Account lockout / unlock
- SSO/SAML/OIDC assertion accepted / rejected

### Authorization
- Permission granted / revoked
- Role assigned / removed
- Access denied (with `policy_id` that denied it)
- Privilege escalation attempts
- Impersonation start / stop (record both `actor_id` and `impersonating_user_id`)

### Data Access
- Read of sensitive data (PHI, PII fields flagged in the data classification)
- Export / download (CSV, PDF, API bulk)
- Bulk data access (over a configurable threshold)
- API access to PII endpoints

### Data Modification
- Create / Update / Delete of business entities (with `before` / `after` shapes minus PII)
- Bulk modifications
- Data imports
- Configuration changes (feature flags, env vars surfaced via admin UI)

### Administrative
- User create / delete / suspend
- System configuration changes
- Security setting changes (password policy, MFA enforcement, IP allowlist)
- Backup / restore operations
- API-key create / rotate / revoke

## Canonical Audit Schema

```typescript
interface AuditLogEntry {
  // Identity
  event_id: string;            // UUID v7 (time-ordered)
  occurred_at: string;         // ISO-8601 UTC, RFC 3339
  request_id: string;          // correlate across services

  // Who
  actor_id: string;            // principal id; never null
  actor_type: "user" | "service" | "system";
  actor_role?: string;
  impersonating_user_id?: string;

  // What
  action: string;              // verb in past tense, e.g. "order.refunded"
  target_type: string;         // "order", "user", "api_key"
  target_id: string;
  tenant_id: string;           // mandatory in multi-tenant systems

  // Where
  ip: string;                  // remote IP, may be redacted to /24 for GDPR
  user_agent: string;

  // Result
  result: "success" | "failure";
  reason_code?: string;        // never a free-form attacker-controlled string

  // Change set (for mutations only; redacted for sensitive fields)
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;

  // Tamper-evidence (set by the storage layer, not the caller)
  prev_hash: string;           // hex sha256
  row_hash: string;            // HMAC-SHA256(canonical_json(row_without_hash) || prev_hash, key)
}
```

## 7-Language Coverage — Audit Log Emission (BAD / SAFE)

### SQL (foundational — table schema + triggers + permissions)

```sql
-- SAFE: append-only audit table with hash chain columns
CREATE TABLE audit_log (
    event_id           UUID PRIMARY KEY,
    occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id          UUID NOT NULL,
    actor_id           TEXT NOT NULL,
    actor_type         TEXT NOT NULL CHECK (actor_type IN ('user','service','system')),
    action             TEXT NOT NULL,
    target_type        TEXT NOT NULL,
    target_id          TEXT NOT NULL,
    ip                 INET,
    user_agent         TEXT,
    request_id         TEXT,
    result             TEXT NOT NULL CHECK (result IN ('success','failure')),
    before_state       JSONB,
    after_state        JSONB,
    prev_hash          BYTEA NOT NULL,
    row_hash           BYTEA NOT NULL
);
CREATE INDEX audit_log_tenant_time_idx ON audit_log (tenant_id, occurred_at DESC);
CREATE INDEX audit_log_actor_idx       ON audit_log (tenant_id, actor_id, occurred_at DESC);
CREATE INDEX audit_log_target_idx      ON audit_log (tenant_id, target_type, target_id, occurred_at DESC);

-- SAFE: DB-level append-only enforcement (defense beyond application code)
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_user;

CREATE OR REPLACE FUNCTION audit_log_deny_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_deny_mutation();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_deny_mutation();

-- SAFE: row-level security so non-admins can't read across tenants
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_tenant_isolation ON audit_log
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- SAFE: declarative audit trigger that fires on any mutation to `orders`
CREATE OR REPLACE FUNCTION audit_orders_changes() RETURNS trigger AS $$
DECLARE prev BYTEA;
BEGIN
    SELECT row_hash INTO prev FROM audit_log
      WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
      ORDER BY occurred_at DESC LIMIT 1;
    INSERT INTO audit_log (event_id, tenant_id, actor_id, actor_type, action,
                           target_type, target_id, result,
                           before_state, after_state, prev_hash, row_hash)
    VALUES (
        gen_random_uuid(),
        COALESCE(NEW.tenant_id, OLD.tenant_id),
        current_setting('app.current_actor'),
        'user',
        TG_OP || '.orders',
        'order',
        COALESCE(NEW.id::TEXT, OLD.id::TEXT),
        'success',
        CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
        COALESCE(prev, decode('00','hex')),
        -- row_hash computed by an app-side worker that re-reads + HMACs;
        -- omitted from trigger to avoid putting the HMAC key in the DB.
        decode('00','hex')
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_audit
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION audit_orders_changes();
```

```sql
-- BAD: audit table with no constraints, no tenant_id, no hash, app role can DELETE
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    message TEXT,                     -- string concat, no structure
    created_at TIMESTAMP
);
-- app_user retains UPDATE + DELETE: an attacker rewrites history silently
```

### TypeScript (Express / Next.js middleware + Drizzle/Prisma hooks)

```typescript
// SAFE: Express middleware that audits every mutating request
import { Request, Response, NextFunction } from "express";
import { randomUUID, createHmac } from "node:crypto";
import { db } from "./db";
import { auditLog } from "./schema";
import { sql } from "drizzle-orm";

const HMAC_KEY = Buffer.from(process.env.AUDIT_HMAC_KEY!, "hex");

function canonical(row: Record<string, unknown>): string {
    return JSON.stringify(row, Object.keys(row).sort());
}

export async function auditMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

    res.on("finish", async () => {
        const prev = await db.select({ row_hash: auditLog.row_hash })
            .from(auditLog)
            .where(sql`tenant_id = ${req.user!.tenantId}`)
            .orderBy(sql`occurred_at DESC`).limit(1);

        const row = {
            event_id:    randomUUID(),
            occurred_at: new Date().toISOString(),
            tenant_id:   req.user!.tenantId,
            actor_id:    req.user!.id,
            actor_type:  "user",
            action:      `${req.method.toLowerCase()}.${req.route?.path ?? req.path}`,
            target_type: req.params.resource ?? "unknown",
            target_id:   req.params.id ?? "n/a",
            ip:          req.ip,
            user_agent:  req.get("user-agent") ?? "",
            request_id:  req.headers["x-request-id"] as string,
            result:      res.statusCode < 400 ? "success" : "failure",
            prev_hash:   prev[0]?.row_hash ?? Buffer.alloc(32),
        };
        const rowHash = createHmac("sha256", HMAC_KEY)
            .update(canonical(row) + row.prev_hash.toString("hex"))
            .digest();
        await db.insert(auditLog).values({ ...row, row_hash: rowHash });
    });
    next();
}

// SAFE: Prisma middleware emits audit rows for every mutation, in the same transaction
prisma.$use(async (params, next) => {
    const isMutation = ["create", "update", "delete", "upsert"].includes(params.action);
    if (!isMutation) return next(params);

    const before = params.action !== "create"
        ? await (prisma as any)[params.model].findUnique({ where: params.args.where })
        : null;
    const result = await next(params);
    await prisma.auditLog.create({ data: {
        event_id:    crypto.randomUUID(),
        tenant_id:   asyncStore.get("tenant_id"),
        actor_id:    asyncStore.get("actor_id"),
        action:      `${params.model}.${params.action}`,
        target_type: params.model,
        target_id:   String(result?.id ?? "n/a"),
        before:      sanitize(before),     // strips password, token, pan, ssn, etc.
        after:       sanitize(result),
        result:      "success",
    }});
    return result;
});
```

```typescript
// BAD: string-concat message, no tenant, no actor, no hash, fire-and-forget
app.post("/api/orders/:id/refund", async (req, res) => {
    await refundOrder(req.params.id);
    console.log(`Order ${req.params.id} refunded by ${req.body.user}`);   // log injection
    res.json({ ok: true });
});

// BAD: writes audit AFTER res.json — if the process dies, audit row is lost
// and there is no transactional guarantee
```

### Python (FastAPI middleware + SQLAlchemy `after_insert`/`after_update`/`after_delete` events)

```python
# SAFE: FastAPI middleware that records mutating requests
from fastapi import FastAPI, Request
from sqlalchemy import event
from hmac import new as hmac_new
from hashlib import sha256
import json, os, uuid, datetime

HMAC_KEY = bytes.fromhex(os.environ["AUDIT_HMAC_KEY"])

def canonical(row: dict) -> bytes:
    return json.dumps(row, sort_keys=True, separators=(",", ":")).encode()

@app.middleware("http")
async def audit_mw(request: Request, call_next):
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return await call_next(request)

    response = await call_next(request)
    actor = request.state.user
    prev = await db.fetch_one(
        "SELECT row_hash FROM audit_log WHERE tenant_id = :t "
        "ORDER BY occurred_at DESC LIMIT 1", {"t": actor.tenant_id})
    prev_hash = prev["row_hash"] if prev else b"\x00" * 32

    row = {
        "event_id":    str(uuid.uuid4()),
        "occurred_at": datetime.datetime.utcnow().isoformat() + "Z",
        "tenant_id":   actor.tenant_id,
        "actor_id":    actor.id,
        "actor_type":  "user",
        "action":      f"{request.method.lower()}.{request.url.path}",
        "ip":          request.client.host,
        "user_agent":  request.headers.get("user-agent", ""),
        "request_id":  request.headers.get("x-request-id", ""),
        "result":      "success" if response.status_code < 400 else "failure",
    }
    row["row_hash"] = hmac_new(HMAC_KEY, canonical(row) + prev_hash, sha256).digest()
    row["prev_hash"] = prev_hash
    await db.execute("INSERT INTO audit_log ...", row)
    return response

# SAFE: SQLAlchemy ORM-level audit so model mutations cannot bypass the trail
@event.listens_for(Order, "after_update")
def audit_order_update(mapper, connection, target):
    connection.execute(audit_log.insert().values(
        event_id=uuid.uuid4(),
        tenant_id=target.tenant_id,
        actor_id=current_actor_var.get(),
        action="orders.update",
        target_type="order", target_id=str(target.id),
        before=sanitize(target.__history__["before"]),
        after=sanitize(target.__history__["after"]),
        result="success",
    ))
```

```python
# BAD: print/logger.info as audit, no actor context, attacker-controlled string in format
@app.post("/refund/{order_id}")
async def refund(order_id: str, body: dict):
    await refund_order(order_id)
    logger.info(f"refund {order_id} by {body['user']}")   # log injection; not an audit row
```

### C# / .NET 9 (ASP.NET Core middleware writing to `audit_log` table)

```csharp
// SAFE: middleware that records every mutating request with HMAC-chained hash
public sealed class AuditMiddleware(RequestDelegate next, AppDb db, IOptions<AuditOptions> opt)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        await next(ctx);

        if (ctx.Request.Method is "GET" or "HEAD" or "OPTIONS") return;

        var actor = ctx.User;
        var tenantId = Guid.Parse(actor.FindFirstValue("tenant_id")!);
        var actorId  = actor.FindFirstValue(ClaimTypes.NameIdentifier)!;

        var prev = await db.AuditLog
            .Where(a => a.TenantId == tenantId)
            .OrderByDescending(a => a.OccurredAt)
            .Select(a => a.RowHash)
            .FirstOrDefaultAsync() ?? new byte[32];

        var row = new AuditRow
        {
            EventId    = Guid.NewGuid(),
            OccurredAt = DateTime.UtcNow,
            TenantId   = tenantId,
            ActorId    = actorId,
            ActorType  = "user",
            Action     = $"{ctx.Request.Method.ToLower()}.{ctx.Request.Path}",
            Ip         = ctx.Connection.RemoteIpAddress?.ToString() ?? "",
            UserAgent  = ctx.Request.Headers.UserAgent.ToString(),
            RequestId  = ctx.TraceIdentifier,
            Result     = ctx.Response.StatusCode < 400 ? "success" : "failure",
            PrevHash   = prev,
        };
        using var hmac = new HMACSHA256(opt.Value.HmacKey);
        var canonical = JsonSerializer.SerializeToUtf8Bytes(row, AuditJson.Canonical);
        row.RowHash = hmac.ComputeHash([..canonical, ..prev]);

        db.AuditLog.Add(row);
        await db.SaveChangesAsync();
    }
}

// SAFE: EF Core SaveChanges interceptor catches every entity mutation automatically
public sealed class AuditInterceptor(IHttpContextAccessor http) : SaveChangesInterceptor
{
    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData e, InterceptionResult<int> r, CancellationToken ct = default)
    {
        var ctx = e.Context!;
        foreach (var entry in ctx.ChangeTracker.Entries()
                                 .Where(x => x.State is EntityState.Added
                                                     or EntityState.Modified
                                                     or EntityState.Deleted))
        {
            ctx.Add(new AuditRow {
                EventId    = Guid.NewGuid(),
                TenantId   = (Guid)entry.CurrentValues["TenantId"]!,
                ActorId    = http.HttpContext!.User.FindFirstValue(ClaimTypes.NameIdentifier)!,
                Action     = $"{entry.Entity.GetType().Name}.{entry.State}".ToLowerInvariant(),
                TargetType = entry.Entity.GetType().Name,
                TargetId   = entry.Properties.First(p => p.Metadata.IsPrimaryKey()).CurrentValue!.ToString()!,
                BeforeJson = entry.State == EntityState.Added ? null : Sanitize(entry.OriginalValues.ToObject()),
                AfterJson  = entry.State == EntityState.Deleted ? null : Sanitize(entry.CurrentValues.ToObject()),
                Result     = "success",
            });
        }
        return await base.SavingChangesAsync(e, r, ct);
    }
}
```

```csharp
// BAD: ILogger as audit, untrusted input concatenated, no actor or tenant
public IActionResult Refund(string orderId, [FromBody] RefundReq req) {
    _repo.Refund(orderId);
    _logger.LogInformation($"refund {orderId} by {req.User}");   // log injection
    return Ok();
}

// BAD: audit row written on a different connection — not in the mutation's transaction
public async Task Refund(string id) {
    await _ordersDb.RefundAsync(id);
    _ = Task.Run(() => _auditDb.WriteAsync(new AuditRow { ... }));   // fire-and-forget; lost on crash
}
```

### Java 21+ (Spring AOP `@Audited` + Spring Data lifecycle callbacks)

```java
// SAFE: declarative @Audited annotation + aspect that records the call
@Target(ElementType.METHOD) @Retention(RetentionPolicy.RUNTIME)
public @interface Audited { String action(); String targetType(); }

@Aspect @Component
public class AuditAspect {
    private final AuditLogRepository repo;
    private final Mac mac;                 // initialized with HMAC-SHA256 + KMS-fetched key

    @Around("@annotation(audited)")
    public Object around(ProceedingJoinPoint pjp, Audited audited) throws Throwable {
        var auth      = SecurityContextHolder.getContext().getAuthentication();
        var tenantId  = TenantContext.current();
        var requestId = MDC.get("requestId");

        var before = captureBefore(pjp);    // re-reads the entity if present
        Object result;
        String outcome;
        try { result = pjp.proceed(); outcome = "success"; }
        catch (Throwable t) { outcome = "failure"; throw t; }
        finally {
            var prev = repo.lastRowHash(tenantId).orElse(new byte[32]);
            var row  = AuditRow.builder()
                .eventId(UUID.randomUUID())
                .occurredAt(Instant.now())
                .tenantId(tenantId)
                .actorId(auth.getName())
                .actorType("user")
                .action(audited.action())
                .targetType(audited.targetType())
                .ip(RequestContext.ip())
                .userAgent(RequestContext.userAgent())
                .requestId(requestId)
                .result(outcome)
                .beforeJson(Sanitizer.scrub(before))
                .afterJson(Sanitizer.scrub(captureAfter(pjp)))
                .prevHash(prev)
                .build();
            row.setRowHash(mac.doFinal(Canonical.bytes(row, prev)));
            repo.save(row);
        }
        return result;
    }
}

// SAFE: Spring Data JPA entity-level callback so every Order mutation is audited
@Entity
public class Order {
    @PrePersist void onCreate() { AuditQueue.enqueue("order.created", this, null, this); }
    @PreUpdate  void onUpdate() { AuditQueue.enqueue("order.updated", this,
                                       OrderHistory.beforeOf(this), this); }
    @PreRemove  void onRemove() { AuditQueue.enqueue("order.deleted", this, this, null); }
}
```

```java
// BAD: SLF4J log line treated as audit; no actor/tenant; format placeholder argument is user-controlled
@RestController
public class OrderController {
    Logger log = LoggerFactory.getLogger(OrderController.class);
    @PostMapping("/refund/{id}")
    public ResponseEntity<?> refund(@PathVariable String id, @RequestBody RefundReq req) {
        orderService.refund(id);
        log.info("refund {} by {}", id, req.user());   // not durable, not append-only, no chain
        return ResponseEntity.ok().build();
    }
}
```

### C / C++

Skip — audit logging in these languages typically delegates to a system-level facility (syslog, journald, Windows Event Log) or an out-of-process aggregator. The skill should still flag direct writes to a writable file as the "audit store" (it isn't append-only without OS-level enforcement) and any use of `printf`-family functions with untrusted format strings in the audit path. There is no idiomatic in-process audit framework worth modelling here.

## Tool Integration (2026)

| Layer | Tools | Use |
|---|---|---|
| **DB-level append-only** | Postgres `REVOKE` + triggers, MySQL `BLACKHOLE`+binlog ingest, Postgres temporal tables, Oracle Flashback Data Archive | Make UPDATE/DELETE impossible from the app principal |
| **Ledger / immutable store** | AWS QLDB (legacy, EOL July 2025 — migrate to Aurora PostgreSQL with QLDB-style ledger gem), Amazon S3 Object Lock (compliance mode), Azure Immutable Blob, GCS Bucket Lock | Cold tier / regulator-grade archive |
| **Audit-log monitoring SaaS** | Datadog Audit Trail, Vanta, Drata, Tugboat Logic | Continuous-compliance dashboards, evidence for SOC 2 |
| **Per-language hash-chain libs** | Node: `immutable-log`, `chained-merkle`; Python: `audit-python`, `hash-chain`; Java: `audit-java`; .NET: `Microsoft.AspNetCore.DataProtection` for keyed HMAC | Drop-in row-hash + verify-chain helpers |
| **Pipeline** | OpenTelemetry audit-event semantic conventions, Fluent Bit with the `redact` filter, Vector with `parse_logfmt` + `redact` transforms | Structured ingest, PII redaction in transit |
| **Search / hot tier** | OpenSearch / Elasticsearch with index-lifecycle policies, ClickHouse, Postgres + `pg_partman` | 3-month hot, then roll to cold |
| **Verification** | `auditctl verify`, custom HMAC walk job that re-derives each `row_hash` and compares against stored value | Nightly cron + on-demand for incident response |

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when this skill produces a human-readable report. When it emits a letter via the refinement loop, **every finding is `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire.

| Triage tier | Examples | Internal recommendation |
|---|---|---|
| CRITICAL | UPDATE/DELETE allowed on audit table; PII (password, PAN, MFA code) in audit payload; missing audit on data-export / data-deletion; non-admin can read audit log | BLOCK |
| HIGH | No hash chain; missing tenant_id; missing audit on auth events; audit write outside the entity transaction | BLOCK |
| MEDIUM | Missing retention policy; unstructured (string-concat) log messages; missing `request_id` correlation; UTC not enforced | Fix soon |
| LOW | Verbose `metadata` blob without schema; missing index on `(tenant_id, occurred_at)`; no documented export endpoint | Backlog |

## Output Format

```markdown
## Audit Log Compliance Report

### Coverage
| Category | Required Events | Logged | Coverage |
|----------|-----------------|--------|----------|
| Authentication | 8 | 6 | 75% |
| Authorization | 5 | 3 | 60% |
| Data Access | 6 | 2 | 33% |
| Data Modification | 6 | 4 | 67% |
| Administrative | 6 | 3 | 50% |

### Critical Missing
1. User deletion not logged
2. Permission changes not logged
3. Data export not logged (GDPR-blocking)
4. Audit table grants UPDATE/DELETE to app_user (tamper risk)

### Audit Log Quality
| Check | Status |
|-------|--------|
| Append-only enforced at DB | NO — REVOKE absent, no triggers |
| Hash chain (prev_hash + row_hash) | NO |
| tenant_id present | YES |
| RLS on audit_log | NO — non-admins can SELECT |
| Required fields (actor/action/target/ts) | partial — actor_id null on system jobs |
| Timestamps UTC | YES |
| Request correlation (request_id) | NO |
| Retention policy declared | NO |
| Audit write in same transaction | NO — fire-and-forget |

### Sensitive Data in Logs
| File | Issue |
|------|-------|
| src/auth/login.ts:45 | Password value in before/after of audit row |
| src/payment/charge.ts:89 | Full card number in `after.card_number` |
| src/users/reset.py:22 | MFA code logged in `metadata.code` |

### Recommendations
1. Add audit logging to missing critical events
2. Enforce append-only at DB level: REVOKE + triggers (DDL above)
3. Add `prev_hash` / `row_hash` columns and HMAC chain
4. Add `tenant_id` column + RLS policy
5. Co-locate audit writes in the mutation's transaction (or outbox)
6. Configure retention: PCI 12mo hot, HIPAA 6y cold archive
7. Scrub PII payloads: strip password, PAN, SSN, MFA codes, tokens
```

## Red Lines

- NEVER allow audit logs to be mutable at the application *or* database level (no UPDATE/DELETE method, no DB role with those grants)
- NEVER log full passwords, full credit-card numbers (last-4 + BIN at most), MFA codes, session tokens, API keys, or unhashed PHI values
- NEVER skip audit logging on data-export, data-deletion, role-change, or impersonation paths
- NEVER write the audit row outside the mutation's transaction (or without an outbox guarantee)
- NEVER allow non-admin roles to read the audit table
- NEVER concatenate untrusted input into a log message (use structured logging; the value is a *parameter*, never the *format string*)
- NEVER deploy with retention shorter than the strictest regulation that applies; PCI-DSS 4.0's 12-month bar is the safe universal minimum

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
engine: audit-log-checker | manual
kind: missing_audit_on_mutation
       | missing_audit_on_auth_event
       | audit_table_mutable
       | no_hash_chain
       | missing_actor
       | missing_tenant_id
       | pii_in_audit_payload
       | missing_retention_policy
       | audit_log_readable_by_non_admin
       | audit_write_outside_transaction
target_file: src/api/orders.ts
target_line: 142
suggested_fix: "Wrap the refund in a transaction and emit the audit row via the
                Prisma middleware, including tenant_id from the request context.
                Strip card_number from `after` — store BIN + last-4 only."
reference: https://owasp.org/www-project-top-ten/
```

The integrator uses `confidence` to weight findings — a `confidence: low` single-source finding doesn't block phase advancement on its own, but two corroborating signals (e.g., grep pattern + manual review) escalate it.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
