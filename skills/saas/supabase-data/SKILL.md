---
name: supabase-data
description: Postgres + storage + realtime via Supabase — connection pooling, migrations, RLS, storage buckets, backups, edge functions.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 50000
  max_tool_calls: 30
  max_subagents: 0
when_to_load:
  - "supabase"
  - "postgres database"
  - "database setup"
  - "RLS policy"
  - "storage bucket"
  - "realtime subscriptions"
  - "drizzle migration"
related_skills:
  - saas/multi-tenancy-row-level
  - saas/clerk-auth
  - specialized/database-reviewer
effort_level: high
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Edit, Bash
---

# Supabase Data (saas skill)

> Postgres + Storage + Realtime via Supabase. Default DB host of `saas/b2c-subscription`.

## Role

You set up Supabase as the data layer of a SaaS: Postgres connection (pooled), Drizzle migrations, RLS policies, storage buckets, optional realtime, and backups.

## 2026 Best Practices

- **Use the Connection Pooler (port 6543)** for serverless deployments (Vercel). The direct port (5432) is for long-lived connections.
- **Use Drizzle (or Prisma) for migrations** — never edit prod schema by hand.
- **RLS enabled on every user-scoped table** — see `skills/saas/multi-tenancy-row-level` for the full pattern.
- **Storage buckets with policies** — public bucket for assets, private bucket for user uploads.
- **Database backups verified** — Supabase Pro+ has daily backups; test restore quarterly.
- **Separate Supabase projects per environment** — production, staging, preview share nothing.
- **Service-role key only on server** — never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

## Implementation pattern

### 1. Create project + grab connection info

```
1. supabase.com → New Project
2. Name: yourapp-prod (or yourapp-staging)
3. Database password: generate strong, store in 1Password
4. Region: closest to your Vercel deploy region
5. Wait ~2 min for provisioning
6. Grab: DATABASE_URL (pooled, port 6543), SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
```

### 2. Environment variables

```env
# Pooled — use this for Vercel functions
DATABASE_URL=postgres://postgres.PROJECT_REF:[email protected]:6543/postgres?pgbouncer=true

# Direct — use this for migrations (drizzle-kit)
DIRECT_DATABASE_URL=postgres://postgres.PROJECT_REF:[email protected]:5432/postgres

# Supabase JS client (browser-safe)
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # ANON key — limited by RLS

# Server-only — admin access, bypasses RLS
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 3. Drizzle ORM setup

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
```

```typescript
// drizzle/schema.ts
import { pgTable, uuid, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  amount: integer('amount').notNull(),  // cents
  status: text('status').notNull(),     // 'draft' | 'sent' | 'paid'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL! },
});
```

```bash
# Generate + apply migration
npx drizzle-kit generate
npx drizzle-kit push   # quick, dev
# OR
npx drizzle-kit migrate   # versioned, prod
```

### 4. Database client (Vercel-safe pooled connection)

```typescript
// db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const queryClient = postgres(process.env.DATABASE_URL!, {
  prepare: false,   // disable prepared statements with PgBouncer
});

export const db = drizzle(queryClient);
```

### 5. RLS policies (see also: skills/saas/multi-tenancy-row-level)

```sql
-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Policy: users see only their own invoices
CREATE POLICY invoices_user_isolation ON invoices
  FOR ALL
  USING (user_id IN (
    SELECT id FROM users WHERE clerk_id = current_setting('app.current_clerk_id', true)
  ));
```

Apply via migration so it's versioned.

### 6. Storage buckets

```typescript
// Server-side upload
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // server-only
);

await supabase.storage.from('avatars').upload(`${userId}/avatar.png`, file, {
  contentType: 'image/png',
  upsert: true,
});
```

Bucket policies (in Supabase Dashboard or SQL):
```sql
-- Public read
CREATE POLICY "Public avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Owner write
CREATE POLICY "User uploads own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

### 7. Realtime (optional)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(URL, ANON_KEY);

supabase
  .channel('invoices')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'invoices',
    filter: `user_id=eq.${userId}`,
  }, payload => {
    console.log('New invoice:', payload.new);
  })
  .subscribe();
```

Use sparingly — realtime ≠ free.

### 8. Backups

Supabase Pro: daily backups, 7-day retention.
Supabase Team+: PITR (point-in-time recovery), 14-day retention.

Quarterly restore drill:
```
1. Create a new Supabase project
2. Use Supabase's restore-from-backup flow
3. Verify schema + sample data
4. Document the time-to-restore
```

## Critical pitfalls

1. **Using direct port (5432) on Vercel** — connection pool exhaustion under load. Use pooled port (6543) with `?pgbouncer=true`.
2. **Prepared statements + PgBouncer** — incompatible. Set `prepare: false` in postgres-js.
3. **Service role key in browser bundle** — accidentally importing it client-side leaks admin access. Use `NEXT_PUBLIC_` prefix discipline; service-role key has NO public prefix.
4. **No RLS** — anon key + no RLS = anyone reads everything. Always RLS.
5. **Production = staging = preview** — bugs in staging affect real users. Separate Supabase projects.
6. **Migration drift** — schema changed in Supabase UI without a migration file. CI should fail on drift.
7. **Backup not tested** — backups exist but restore never tried. Quarterly drill mandatory.

## Drift detection in CI

```bash
npx drizzle-kit check
# Returns non-zero if generated migrations don't match the schema → CI fails
```

## Sources

- [Supabase Drizzle integration](https://orm.drizzle.team/docs/get-started/supabase-new)
- [Supabase connection pooler](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
