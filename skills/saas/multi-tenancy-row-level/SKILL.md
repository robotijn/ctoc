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

> Implementation guide for tenant isolation in a B2C SaaS. The default model for `saas/b2c-subscription`.

## Role

You make sure user A can NEVER read user B's data — even if an API endpoint forgets to filter by user_id. Postgres RLS (Row-Level Security) is the safety net.

## 2026 Best Practices (Multi-tenancy)

- **Three isolation models**, pick the right one:
  - **Row-level (RLS)** — single DB, all tenants share tables, RLS policies filter rows. **Default for B2C SaaS.** Easiest to operate.
  - **Schema-per-tenant** — one Postgres schema per tenant, same DB. For B2B SaaS where customers want hard isolation.
  - **DB-per-tenant** — separate DB per tenant. Enterprise / regulated. Highest cost.
- **Defense in depth** — application code filters by user_id AND database enforces via RLS. Either alone is insufficient.
- **JWT claims drive RLS** — set `app.current_user_id` from the JWT on every connection.
- **Test the isolation** — every PR must include a multi-tenant test: log in as A, attempt to access B's resources, expect 403.

## Implementation pattern (RLS for B2C)

### 1. Enable RLS on every user-scoped table

```sql
-- Migration: enable RLS on user-scoped tables
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- For each, create a policy: "user can only see their own rows"
CREATE POLICY user_isolation ON invoices
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::text);

CREATE POLICY user_isolation ON clients
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::text);

CREATE POLICY user_isolation ON projects
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::text);
```

### 2. Set the session variable on every connection

```typescript
// db/connection.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export function getDb(userId: string) {
  const sql = postgres(process.env.DATABASE_URL!, {
    connection: {
      application_name: 'saas-app',
    },
  });

  // Set the session variable BEFORE any query
  return {
    db: drizzle(sql),
    async setContext() {
      await sql`SELECT set_config('app.current_user_id', ${userId}, true)`;
    },
  };
}
```

Or via a Drizzle middleware that sets the var per query.

### 3. Use it in route handlers

```typescript
// app/api/invoices/route.ts
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db/connection';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('unauthorized', { status: 401 });

  const { db, setContext } = getDb(userId);
  await setContext();

  // This query CANNOT return another user's invoices,
  // even if we forgot the WHERE clause:
  const invoices = await db.select().from(invoicesTable);

  return Response.json(invoices);
}
```

### 4. Test the isolation

```typescript
// tests/multi-tenant-isolation.test.ts
describe('Multi-tenant isolation (RLS)', () => {
  it('user A cannot read user B invoices via direct DB query', async () => {
    const userA = await createUser();
    const userB = await createUser();
    await createInvoice({ userId: userB.id, amount: 100 });

    const { db, setContext } = getDb(userA.id);
    await setContext();

    const invoicesVisibleToA = await db.select().from(invoicesTable);
    expect(invoicesVisibleToA.length).toBe(0);
  });

  it('user A cannot read user B invoices via API even if forgetting WHERE', async () => {
    const userA = await createUser();
    const userB = await createUser();
    await createInvoice({ userId: userB.id });

    const res = await fetch('/api/invoices', { headers: authHeaders(userA) });
    const data = await res.json();
    expect(data.length).toBe(0);
  });

  it('rejects request without session', async () => {
    const res = await fetch('/api/invoices');
    expect(res.status).toBe(401);
  });
});
```

## Bypass for admin / internal queries

```sql
-- Service-role connection uses bypassrls
CREATE ROLE service_admin BYPASSRLS;
```

```typescript
// Internal scripts use a separate connection with service_admin role
const adminDb = postgres(process.env.ADMIN_DATABASE_URL!);  // uses service_admin
```

Never expose the admin URL to the web app.

## Choosing the isolation model

| Model | Best for | Operational cost |
|---|---|---|
| **Row-level (RLS)** | B2C, simple SaaS, fast launch | Low |
| **Schema-per-tenant** | B2B with hard isolation requirement | Medium (migrations per tenant) |
| **DB-per-tenant** | Regulated industries (healthcare, finance) | High |

For `saas/b2c-subscription` template: **RLS**.
For `saas/b2b-sales-led` template: **RLS by organization** (different policy: org_id instead of user_id).

## Critical pitfalls

1. **Forgot to enable RLS on a table** — `pg_tables` query in CI should fail if any user-scoped table has rowsecurity=false.
2. **Forgot to set `app.current_user_id`** — query runs with empty session var; policy denies everything. Confusing but safe.
3. **Used wrong column name** — policy compares `user_id` but table has `userId`. Migration fails to apply or silently allows nothing.
4. **Service connection used for user request** — `BYPASSRLS` role on a user-facing endpoint leaks all data.
5. **Connection pool reuse** — session var persists across requests on a pooled connection if you don't RESET. Use connection-per-request or reset on checkout.

## CI check

```sql
-- Run in CI to catch un-RLS'd tables
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('users', 'webhook_events', 'audit_log')  -- allowlist
  AND rowsecurity = false;
-- Expected: 0 rows
```

Fail CI if rows returned.

## Sources

- [Postgres RLS docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase RLS guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Multi-tenancy patterns (Datastax)](https://www.datastax.com/blog/2017/02/most-database-features-still-rough-spots-multi-tenant)
