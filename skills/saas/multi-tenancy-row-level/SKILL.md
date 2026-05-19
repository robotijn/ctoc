---
name: multi-tenancy-row-level
description: Implement multi-tenant data isolation via Postgres Row-Level Security (RLS) — every query is scoped to the current user/tenant automatically.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "multi-tenancy"
  - "multi tenant"
  - "row level security"
  - "RLS"
  - "tenant isolation"
  - "user data isolation"
  - "data leak prevention"
related_skills:
  - saas/clerk-auth
  - security/sast-scanner
  - specialized/database-reviewer
effort_level: high
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Edit, Bash, Grep
---

# Multi-Tenancy via Postgres RLS (saas skill)

> Implementation guide for tenant isolation in a B2C / B2B SaaS. The default model for `saas/b2c-subscription`.
> Auto-loaded when the user prompt matches a `when_to_load` trigger.

## Role

You make sure tenant A can NEVER read tenant B's data — even if an API endpoint forgets to filter by `org_id` / `user_id`, even if a developer connects with the table-owner role, and even if a `SECURITY DEFINER` function is reachable from a user path. Postgres RLS (Row-Level Security) is the safety net. **The application filter is defense in depth; the database is the wall.**

## 2026 Best Practices (Multi-tenancy)

The non-negotiables — every one of these maps to a finding category below.

- **Three isolation models — pick deliberately and document the choice in the plan:**
  - **Row-level (RLS)** — single DB, all tenants share tables, RLS policies filter rows. **Default for B2C SaaS and most B2B.** Cheapest to operate, hardest to leak if policies are right.
  - **Schema-per-tenant** — one Postgres schema per tenant, same DB. Migrations multiply. Picked for B2B mid-market where customers want logical isolation but not separate DB cost.
  - **Database-per-tenant** — separate DB per tenant. Enterprise / regulated (healthcare, finance, gov). Highest cost, hardest noisy-neighbor protection, easiest "we will delete your DB" answer to a deletion request.
- **RLS enabled AND forced on every tenant-scoped table.** `ENABLE ROW LEVEL SECURITY` alone is bypassed by the **table owner** and any superuser-equivalent role. Without `FORCE ROW LEVEL SECURITY`, a migration script, a `psql` admin session, or any code that authenticated as the owner sees everything. The pair is mandatory: `ENABLE` + `FORCE`.
- **`USING` clause for read; `WITH CHECK` clause for write.** A policy with only `USING` lets a tenant **insert or update a row with someone else's `org_id`**. `USING` filters what you can read; `WITH CHECK` filters what you are allowed to write. Use both. For `FOR ALL` policies, declare both explicitly — do not rely on `WITH CHECK` defaulting from `USING` if your intent differs.
- **Claims-based current tenant via session config or a JWT-claim helper.** Set the tenant context once per connection / request. Two patterns:
  - `SELECT set_config('app.current_org', $1, true)` at request start, then policies read `current_setting('app.current_org', true)`.
  - Supabase / PostgREST: read directly from `auth.jwt() ->> 'org_id'` (Supabase) or `current_setting('request.jwt.claims', true)::json ->> 'org_id'` (PostgREST).
  - **Never trust `user_metadata`** on Supabase JWTs — it is end-user mutable. Use `app_metadata` (admin-set) or a dedicated `org_id` claim stamped by an auth hook.
- **Defense in depth — application filter AND database policy.** App code SHOULD `WHERE org_id = ?`. RLS catches the bug when the dev forgets. Neither alone is acceptable.
- **The RLS policy must match how the app authenticates.** If the app connects as a single shared pooled role and sets `app.current_org` per request, the policy reads `current_setting('app.current_org')`. If the app uses one Postgres role per tenant, the policy uses `current_user`. **Mismatch = silent allow-all or silent deny-all.** Pick one model and lock it in.
- **Integration test every tenant boundary.** For every tenant-scoped table, write a test: seed data as tenant B, set context to tenant A, run `SELECT *`, assert `0 rows`. Run it in CI. A category that has no isolation test is a leak waiting to happen.
- **Migrations preserve RLS.** New tables default to `rowsecurity = false`. A CI check that lists tables in `public` with `rowsecurity = false` and fails the build is non-negotiable. Use **pgroll** (`xataio/pgroll`) for zero-downtime expand/contract migrations when adding columns the policy depends on — pgroll lets the old and new schema versions coexist so the policy can be updated before the old shape is removed.
- **No `SECURITY DEFINER` function on a user-reachable path without an explicit allowlist.** `SECURITY DEFINER` functions run with the **definer's** privileges, which usually means they bypass RLS. Either mark them `SECURITY INVOKER` or audit every caller.
- **`org_id` is immutable post-insert.** If a row's tenant column can be `UPDATE`d, an attacker who finds an update endpoint can move their row into another tenant or hijack one. Add a trigger or `WITH CHECK (org_id = OLD.org_id)`.

## Implementation pattern (RLS for B2B org-scoped SaaS)

> The B2C single-user variant is identical with `user_id` substituted for `org_id`.

### 1. Enable AND force RLS on every tenant-scoped table

```sql
-- Migration: enable AND force RLS on tenant-scoped tables
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;   -- so even the table owner respects the policy

ALTER TABLE clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients  FORCE  ROW LEVEL SECURITY;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE  ROW LEVEL SECURITY;

-- Policies: USING for read, WITH CHECK for write. Both explicit.
CREATE POLICY tenant_isolation_select ON invoices
  FOR SELECT
  USING (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY tenant_isolation_insert ON invoices
  FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY tenant_isolation_update ON invoices
  FOR UPDATE
  USING      (org_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org', true)::uuid);   -- prevent org_id change

CREATE POLICY tenant_isolation_delete ON invoices
  FOR DELETE
  USING (org_id = current_setting('app.current_org', true)::uuid);
```

### 2. Set the tenant context on every request

```typescript
// db/with-tenant.ts — Postgres / Drizzle
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const sql = postgres(process.env.DATABASE_URL!, { max: 10 });

export async function withTenant<T>(orgId: string, fn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {                                  // transaction-scoped local setting
    await tx`SELECT set_config('app.current_org', ${orgId}, true)`; // true = LOCAL to this tx
    return fn(drizzle(tx));
  });
}
```

`set_config(..., true)` makes the setting **transaction-local** — it does not leak across pooled connections.

### 3. Use it in a route handler

```typescript
// app/api/invoices/route.ts
import { auth } from '@clerk/nextjs/server';
import { withTenant } from '@/db/with-tenant';
import { invoicesTable } from '@/db/schema';

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return new Response('unauthorized', { status: 401 });

  return withTenant(orgId, async (db) => {
    // Even without WHERE org_id = ..., RLS guarantees only this org's rows return.
    const invoices = await db.select().from(invoicesTable);
    return Response.json(invoices);
  });
}
```

### 4. Test cross-tenant isolation in CI

```typescript
// tests/multi-tenant-isolation.test.ts — node:test
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('tenant A cannot read tenant B invoices via direct DB query', async () => {
  const orgA = await createOrg();
  const orgB = await createOrg();
  await createInvoice({ orgId: orgB, amount: 100 });

  const visibleToA = await withTenant(orgA, (db) =>
    db.select().from(invoicesTable));
  assert.equal(visibleToA.length, 0);
});

test('tenant A cannot INSERT a row with orgId=B (WITH CHECK enforced)', async () => {
  const orgA = await createOrg();
  const orgB = await createOrg();
  await assert.rejects(
    withTenant(orgA, (db) =>
      db.insert(invoicesTable).values({ orgId: orgB, amount: 1 })),
    /row-level security/i,
  );
});

test('tenant A cannot UPDATE its row to orgId=B (WITH CHECK on UPDATE)', async () => {
  const orgA = await createOrg();
  const orgB = await createOrg();
  const row = await withTenant(orgA, (db) =>
    db.insert(invoicesTable).values({ orgId: orgA, amount: 1 }).returning());

  await assert.rejects(
    withTenant(orgA, (db) =>
      db.update(invoicesTable).set({ orgId: orgB }).where(eq(invoicesTable.id, row[0].id))),
    /row-level security/i,
  );
});

test('missing tenant context → policy denies everything (safe default)', async () => {
  await createInvoice({ orgId: await createOrg(), amount: 100 });
  const rows = await sql`SELECT * FROM invoices`;   // no set_config called
  assert.equal(rows.length, 0);
});
```

`assert_no_cross_tenant_leak()` (test-framework helper) wraps the first three tests for every tenant-scoped table.

## 7-language coverage — tenant scoping BAD / SAFE

Each pair shows the same vulnerability and fix across one ORM/data layer per language. The **SQL block is foundational** — every other language layers on top of it.

### SQL (foundational — the database is the wall)

```sql
-- BAD: RLS not enabled — every authenticated user sees every row.
CREATE TABLE invoices (id uuid PRIMARY KEY, org_id uuid NOT NULL, amount numeric);
-- (no ENABLE ROW LEVEL SECURITY) → SELECT * FROM invoices returns every tenant's data.

-- BAD: ENABLE only, no FORCE — the table owner role and any role with BYPASSRLS still sees all rows.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY p ON invoices FOR ALL USING (org_id = current_setting('app.current_org', true)::uuid);
-- → A migration script running as the owner sees every tenant. A connection-pool bug that ends up as the owner role leaks everything.

-- BAD: USING without WITH CHECK on FOR ALL — read is filtered, but INSERT/UPDATE can write rows belonging to another tenant.
CREATE POLICY p_bad ON invoices
  FOR ALL
  USING (org_id = current_setting('app.current_org', true)::uuid);
INSERT INTO invoices (org_id, amount) VALUES ('<other-tenant-uuid>', 999); -- accepted, data is now owned by another tenant.

-- BAD: SECURITY DEFINER function that bypasses RLS, reachable from the app.
CREATE FUNCTION total_revenue() RETURNS numeric LANGUAGE sql SECURITY DEFINER AS $$
  SELECT sum(amount) FROM invoices;   -- runs as definer, ignores RLS, returns ALL tenants' revenue.
$$;

-- SAFE: enable + force, separate policies per command, USING + WITH CHECK, org_id immutable.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;

CREATE POLICY p_select ON invoices FOR SELECT
  USING      (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY p_insert ON invoices FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY p_update ON invoices FOR UPDATE
  USING      (org_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY p_delete ON invoices FOR DELETE
  USING      (org_id = current_setting('app.current_org', true)::uuid);

-- SAFE: per-request context, transaction-local.
BEGIN;
SELECT set_config('app.current_org', '11111111-1111-1111-1111-111111111111', true);
SELECT * FROM invoices;   -- only this org
COMMIT;

-- SAFE: SECURITY INVOKER (default), so RLS applies to callers.
CREATE FUNCTION my_revenue() RETURNS numeric LANGUAGE sql SECURITY INVOKER AS $$
  SELECT sum(amount) FROM invoices;
$$;

-- CI check: every public table has rowsecurity = true and forcerowsecurity = true (except allowlist).
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT IN ('schema_migrations', 'webhook_events', 'audit_log')   -- allowlist
  AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);
-- Expected: 0 rows. Fail CI if any returned.
```

### TypeScript — Prisma + Supabase RLS

```typescript
// BAD: a shared Prisma client whose connection string uses the service_role / postgres owner role.
//   service_role bypasses RLS in Supabase — every query in the app sees every tenant.
const prisma = new PrismaClient({ datasources: { db: { url: process.env.SUPABASE_SERVICE_ROLE_URL } } });
await prisma.invoice.findMany();   // returns every tenant's invoices.

// BAD: per-request tenant filter only, no RLS — one missing WHERE leaks everything.
await prisma.invoice.findMany({ where: { orgId: ctx.orgId } });           // safe today
await prisma.invoice.findMany();                                          // ← future bug, full leak

// SAFE: connect with the anon / authenticated role, set RLS context per transaction.
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

export async function withTenant<T>(orgId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`;
    return fn(tx);
  });
}
// Use:
await withTenant(ctx.orgId, (tx) => tx.invoice.findMany());   // RLS-enforced, even without WHERE
```

### Python — SQLAlchemy 2.x + RLS

```python
# BAD: shared engine, no per-request RLS context. App code MUST remember to filter.
engine = create_engine(os.environ["DATABASE_URL"])
with Session(engine) as s:
    s.execute(select(Invoice)).all()   # returns all tenants when the WHERE is forgotten.

# SAFE: a context manager that sets app.current_org per transaction.
from contextlib import contextmanager
from sqlalchemy import text

@contextmanager
def tenant_session(engine, org_id: str):
    with Session(engine) as s, s.begin():
        s.execute(text("SELECT set_config('app.current_org', :org, true)"), {"org": org_id})
        yield s

# Use:
with tenant_session(engine, org_id) as s:
    s.execute(select(Invoice)).all()   # RLS-enforced
```

### C# — .NET 9, EF Core 9 global query filter + RLS

```csharp
// BAD: no global query filter, no RLS context — every LINQ query must remember .Where(...).
var invoices = await db.Invoices.ToListAsync();   // returns all tenants when filter forgotten.

// SAFE: global query filter (defense in depth) AND RLS via session config.
public class AppDb(DbContextOptions<AppDb> opts, ITenantContext tenant) : DbContext(opts)
{
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Invoice>().HasQueryFilter(i => i.OrgId == tenant.OrgId);   // app-level filter
    }

    public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        // SaveChanges runs inside an EF transaction by default — set the RLS context there.
        await Database.ExecuteSqlInterpolatedAsync(
            $"SELECT set_config('app.current_org', {tenant.OrgId.ToString()}, true)", ct);
        return await base.SaveChangesAsync(ct);
    }
}

// Per-request: open a connection, set the RLS context, then run reads in the same transaction.
public async Task<List<Invoice>> ListAsync(Guid orgId, AppDb db)
{
    await using var tx = await db.Database.BeginTransactionAsync();
    await db.Database.ExecuteSqlInterpolatedAsync(
        $"SELECT set_config('app.current_org', {orgId.ToString()}, true)");
    var rows = await db.Invoices.ToListAsync();    // RLS + global filter
    await tx.CommitAsync();
    return rows;
}
```

### Java — 21+, Hibernate `@Filter` + RLS

```java
// BAD: no filter, no RLS — every Criteria query leaks across tenants when WHERE is forgotten.
em.createQuery("SELECT i FROM Invoice i", Invoice.class).getResultList();

// SAFE: Hibernate @Filter (defense in depth) AND RLS via Postgres set_config.
@Entity
@FilterDef(name = "tenantFilter", parameters = @ParamDef(name = "orgId", type = UUID.class))
@Filter(name = "tenantFilter", condition = "org_id = :orgId")
public class Invoice { /* ... */ }

@Component
public class TenantInterceptor implements HandlerInterceptor {
    @Override public boolean preHandle(HttpServletRequest req, HttpServletResponse resp, Object h) {
        UUID orgId = SecurityContext.currentOrg();
        Session s = em.unwrap(Session.class);
        s.enableFilter("tenantFilter").setParameter("orgId", orgId);
        s.doWork(conn -> {
            try (var ps = conn.prepareStatement("SELECT set_config('app.current_org', ?, true)")) {
                ps.setString(1, orgId.toString());
                ps.execute();
            }
        });
        return true;
    }
}
```

### C / C++

**Skip.** Multi-tenant SaaS deployments are written in higher-level stacks. If a C/C++ service touches the same Postgres, it must connect with the non-owner role and call `set_config('app.current_org', ...)` exactly like every other client; the SQL section covers that contract.

## Categories — what the critic looks for

> Every category below is a finding the critic emits as a letter. Per warnings-are-bugs, every one is `severity: critical` on the wire.

1. **rls-disabled** — a tenant-scoped table where `pg_class.relrowsecurity = false`. Worst case: full cross-tenant read.
2. **rls-not-forced** — `relrowsecurity = true` but `relforcerowsecurity = false`. Owner / `BYPASSRLS` roles see all rows. Migration scripts, admin scripts, and any code that ends up on the owner role leaks everything.
3. **using-without-with-check** — a `FOR ALL` / `FOR INSERT` / `FOR UPDATE` policy with `USING` but no `WITH CHECK`. Read is filtered; **write is not.** A tenant can `INSERT` or `UPDATE` rows with another tenant's id.
4. **missing-tenant-id-in-where** — application code that performs DML against a tenant-scoped table without an `org_id` / `user_id` predicate. RLS will catch it, but the missing filter signals the app does not have defense in depth, and reads against non-tenant-scoped joins (e.g. report views) may still leak.
5. **missing-cross-tenant-isolation-test** — no integration test that seeds data as tenant B, queries as tenant A, asserts 0 rows. Categories with no test are categories that will leak.
6. **security-definer-on-user-path** — a `SECURITY DEFINER` function reachable from a user-facing route. Definer functions run with the definer's privileges and typically bypass RLS. Either mark `SECURITY INVOKER` or document an explicit allowlist with input validation.
7. **tenant-id-mutable** — no `WITH CHECK` on `UPDATE` for the tenant column, and no trigger enforcing immutability. A `PATCH /invoices/:id { org_id: ... }` endpoint can move a row into another tenant.
8. **wrong-claim-source** — RLS policy reads from `user_metadata` (end-user-mutable on Supabase) or from a JWT claim that is not signature-verified before reaching the DB. Authorization data must come from `app_metadata` or a server-stamped claim.
9. **policy-app-auth-mismatch** — the policy reads `current_user` but the app authenticates as a shared pooled role; or the policy reads `current_setting('app.current_org')` but the app never sets it. Result: silent allow-all or silent deny-all.
10. **bypassrls-leak** — application path connects as a role with `BYPASSRLS` (Supabase `service_role`, custom `service_admin`, or the table owner). Even if RLS is enabled and forced, `BYPASSRLS` short-circuits.
11. **pool-context-leak** — `set_config(..., false)` (session-scoped, not transaction-local) on a pooled connection. The next request on the same physical connection inherits the prior tenant's context. Use `set_config(..., true)` inside a transaction.
12. **schema-migration-loses-rls** — a new table added by a migration without `ENABLE ROW LEVEL SECURITY` / `FORCE ROW LEVEL SECURITY` / policies. Use **pgroll** expand/contract so policies are in place on the new schema version before the old one is removed.

## Tool Integration (2026)

| Tool / Surface | Purpose | When |
|---|---|---|
| **`pg_policies`** (system view) | List every policy: schema, table, name, roles, USING, WITH CHECK. Diff against expected set in CI. | Every PR — CI script |
| **`pg_class.relrowsecurity` / `relforcerowsecurity`** | Confirm RLS is both enabled AND forced. Both must be `true` on tenant-scoped tables. | Every PR — CI script |
| **Supabase Studio policy editor** | Visual policy builder; shows USING / WITH CHECK side by side; warns on `user_metadata` reference. | During design, not as the source of truth |
| **pgroll** (`xataio/pgroll`) | Zero-downtime expand/contract schema migrations. Old and new schema versions coexist so RLS policies can be updated before the old shape is dropped. Single Go binary, Postgres 14+. | Any migration touching a tenant-scoped table |
| **pgTAP** | Postgres-native test framework. Write RLS tests that run inside the DB with `set_config` + `SELECT count(*)` assertions. | CI suite for every tenant-scoped table |
| **`assert_no_cross_tenant_leak()`** (test helper, write once) | Wraps the seed-B / read-as-A / assert-0 pattern. Call from every isolation test. | Every CI run |
| **Snowflake row access policies / BigQuery row-level access policies** | If a tenant-scoped Postgres table is replicated to a warehouse, the same isolation must apply there. Snowflake `ROW ACCESS POLICY` and BigQuery `CREATE ROW ACCESS POLICY` are the equivalents. | Any time data leaves Postgres for analytics |
| **`pg_stat_statements`** | Detect queries that read tenant-scoped tables without an `org_id` predicate; correlate with RLS-bypass roles. | Periodic audit |

```sql
-- pg_policies: list every policy and confirm WITH CHECK is set where it should be.
SELECT schemaname, tablename, policyname, cmd, qual AS using_clause, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

```bash
# pgroll workflow for adding org_id to an existing table without downtime.
pgroll start migrations/2026-05-add-org-id-to-clients.json   # expand
# app deploys to use new column
pgroll complete                                              # contract — drops old shape
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when this skill produces a human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization.

| Triage tier | Examples | Internal action |
|-------|----------|--------|
| CRITICAL | `rls-disabled` on tenant table, `bypassrls-leak` on user route, `security-definer-on-user-path` aggregating all tenants, `wrong-claim-source` reading mutable `user_metadata` | BLOCK |
| HIGH | `rls-not-forced`, `using-without-with-check`, `tenant-id-mutable`, `policy-app-auth-mismatch`, `pool-context-leak` | BLOCK |
| MEDIUM | `missing-tenant-id-in-where` (defense-in-depth gap), `schema-migration-loses-rls` on a non-PII table | Fix this sprint |
| LOW | `missing-cross-tenant-isolation-test` for a table that already has RLS + FORCE + WITH CHECK | Backlog with deadline |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+table+kind+file+line)[:12]>   # fingerprint for dedup
severity: critical                                        # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                           # high = corroborated by pg_policies + test; low = static-only
engine: pg_policies | pg_class | pgtap | semgrep | manual | pgroll-lint
kind: rls-disabled
      | rls-not-forced
      | using-without-with-check
      | missing-tenant-id-in-where
      | missing-cross-tenant-isolation-test
      | security-definer-on-user-path
      | tenant-id-mutable
      | wrong-claim-source
      | policy-app-auth-mismatch
      | bypassrls-leak
      | pool-context-leak
      | schema-migration-loses-rls
table_name: public.invoices                               # the tenant-scoped table affected (null if app-only)
target_file: db/migrations/2026-05-15-add-invoices.sql    # or the application file for app-side findings
line: 42
suggested_fix: |
  ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.invoices FORCE  ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_select ON public.invoices
    FOR SELECT USING (org_id = current_setting('app.current_org', true)::uuid);
  CREATE POLICY tenant_isolation_insert ON public.invoices
    FOR INSERT WITH CHECK (org_id = current_setting('app.current_org', true)::uuid);
  CREATE POLICY tenant_isolation_update ON public.invoices
    FOR UPDATE USING      (org_id = current_setting('app.current_org', true)::uuid)
               WITH CHECK (org_id = current_setting('app.current_org', true)::uuid);
  CREATE POLICY tenant_isolation_delete ON public.invoices
    FOR DELETE USING (org_id = current_setting('app.current_org', true)::uuid);
owasp: A01       # Broken Access Control
cwe: CWE-284     # Improper Access Control (or CWE-639 for IDOR-style)
reachable: true | false | unknown
delta_to_baseline: new | unchanged | regressed
message: "invoices: RLS enabled but not FORCED — owner/BYPASSRLS roles see all tenants"
reference: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
```

The integrator uses `confidence` and `corroborated_by` (e.g. `pg_policies` says no policy, and a pgTAP test confirms cross-tenant reads return rows) to weight findings. `reachable: false` makes the finding informational. `delta_to_baseline: unchanged` lets the integrator skip already-accepted findings.

## Sources

- [Postgres RLS docs (USING vs WITH CHECK, FORCE)](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase Row Level Security guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Custom Claims & RBAC (`app_metadata` vs `user_metadata`)](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)
- [Supabase RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [AWS — Multi-tenant data isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Crunchy Data — Row Level Security for Tenants in Postgres](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)
- [pgroll — zero-downtime, reversible schema migrations](https://github.com/xataio/pgroll)
- [pgTAP — Postgres unit testing](https://pgtap.org/)
- [Snowflake Row Access Policies](https://docs.snowflake.com/en/user-guide/security-row-intro)
- [BigQuery Row-Level Access Policies](https://cloud.google.com/bigquery/docs/row-level-security-intro)

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
