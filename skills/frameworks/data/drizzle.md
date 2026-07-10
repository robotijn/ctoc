# Drizzle ORM CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install drizzle-orm
npm install -D drizzle-kit
# Plus your database driver: pg, mysql2, better-sqlite3, @libsql/client
```

## Claude's Common Mistakes
1. **Using serial instead of identity** - PostgreSQL recommends identity columns now
2. **Forgetting drizzle-kit migrate** - Schema changes need migration
3. **Client-side code generation** - Drizzle has no codegen; types are inferred
4. **Missing connection pooling** - Essential for serverless/production
5. **Prisma-style includes** - Drizzle uses explicit joins, not magic relations

## Correct Patterns (2026)
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, text, timestamp, integer, primaryKey } from 'drizzle-orm/pg-core';
import { eq, and, desc } from 'drizzle-orm';
import { Pool } from 'pg';

// Schema with identity (not serial)
export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orders = pgTable('orders', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id),
  total: integer('total').notNull(),
});

// Connection pool (essential for production)
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
const db = drizzle(pool);

// Type-safe query with explicit join
const userOrders = await db
  .select({ userName: users.name, orderTotal: orders.total })
  .from(users)
  .leftJoin(orders, eq(users.id, orders.userId))
  .where(and(eq(users.email, email), orders.total > 100))
  .orderBy(desc(orders.total));

// Safe delete with where clause (prevent accidental full delete)
await db.delete(orders).where(eq(orders.id, orderId));
```

## Version Gotchas
- **No codegen**: Types inferred at compile time; no generate step
- **Migrations**: drizzle-kit generate + migrate; review generated SQL
- **Serverless**: Works with Neon, PlanetScale, Turso, D1, Vercel Postgres
- **vs Prisma**: SQL-like syntax; no implicit includes; explicit joins

## What NOT to Do
- Do NOT expect Prisma-style `include` (use explicit joins)
- Do NOT use serial columns (use identity for PostgreSQL)
- Do NOT delete without where clause (full table delete risk)
- Do NOT skip connection pooling in production

## Query Footguns — sql.raw injection (CWE-89), relational vs core
Drizzle's `sql` tagged template **parameterizes** every `${}` interpolation. Its
`sql.raw()` escape hatch does the OPPOSITE — it splices text verbatim. Putting user
input through `sql.raw` is **CWE-89 "Improper Neutralization of Special Elements used in
an SQL Command ('SQL Injection')"** (cwe.mitre.org/89).

```typescript
import { sql } from 'drizzle-orm';

// SAFE: the `sql` tagged template binds ${email} as a parameter ($1), not text
const rows = await db.execute(
  sql`SELECT * FROM users WHERE email = ${email}`   // email is a bound parameter
);

// VULNERABLE (CWE-89): sql.raw splices the string verbatim -> classic injection
const rows2 = await db.execute(
  sql.raw(`SELECT * FROM users WHERE email = '${email}'`)   // ' OR '1'='1  -> full table
);

// SAFE dynamic building: use sql.join / placeholders, reserve sql.raw for STATIC,
// trusted fragments only (e.g. a validated column name from an allow-list).
const col = allowList.includes(userCol) ? userCol : 'created_at';   // validated
const q = sql`SELECT * FROM users ORDER BY ${sql.raw(col)} DESC`;    // value still bound
```
- The typed query builder (`db.select().from(users).where(eq(users.email, email))`) is
  parameterized by construction — prefer it. Use the `sql` **tagged template** when you
  need raw SQL; reserve `sql.raw()` for static/allow-listed identifiers, NEVER user
  values.
- **Relational queries vs core**: `db.query.users.findMany({ with: { orders: true } })`
  (the relational API) is a convenience layer over the core query builder; it still
  compiles to parameterized SQL. Don't reach for `sql.raw` just to fetch relations.
  [orm.drizzle.team/docs/sql + cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

## Correctness — type inference, transactions, prepared statements
```typescript
// Type inference: the row TYPE is derived from the schema + the select shape. A .select()
// with a projection narrows the result type -- there is no codegen step to stay in sync.
type UserRow = typeof users.$inferSelect;   // full row type
type NewUser = typeof users.$inferInsert;   // insert type (optionals for defaults)

// FOOTGUN: doing multi-statement work without a transaction -> partial writes on error.
// RIGHT: db.transaction wraps the callback; a thrown error rolls the whole thing back.
await db.transaction(async (tx) => {
  const [u] = await tx.insert(users).values({ email }).returning();
  await tx.insert(orders).values({ userId: u.id, total });
  // throw here -> both inserts roll back
});

// Prepared statements: compile once, execute many with bound placeholders.
const byEmail = db.select().from(users)
  .where(eq(users.email, sql.placeholder('email'))).prepare('by_email');
const rows = await byEmail.execute({ email });   // reuses the compiled plan
```
- Use `db.transaction(async (tx) => ...)` for read-then-write logic; use the `tx` handle
  inside, not the outer `db`. Prepared statements with `sql.placeholder(...)` avoid
  recompiling hot queries and keep values bound.
  [orm.drizzle.team/docs/transactions + orm.drizzle.team/docs/perf-queries,
  retrieved 2026-07-10]

## Security — never sql.raw with user input (CWE-89)
- **`sql.raw(userInput)` is a direct CWE-89 vulnerability** — treat any `sql.raw` call
  in a review as a red flag and confirm its argument is a static/allow-listed constant.
- Identifiers cannot be bound as parameters (SQL binds values, not table/column names);
  validate a dynamic column/table name against an explicit allow-list before it reaches
  `sql.raw`. [orm.drizzle.team/docs/sql + cwe.mitre.org/data/definitions/89.html,
  retrieved 2026-07-10]

## Migrations — drizzle-kit generate/migrate, not push in prod
```bash
# Development: generate a SQL migration from schema changes, then apply it.
npx drizzle-kit generate      # writes ./drizzle/NNNN_*.sql (REVIEW the SQL)
npx drizzle-kit migrate       # applies pending migrations, tracked in __drizzle_migrations

# FOOTGUN: `drizzle-kit push` diffs schema -> DB and applies directly with NO migration
# file. Great for prototyping, DANGEROUS in prod: no reviewable artifact, and a rename
# can be emitted as drop+add (data loss).
npx drizzle-kit push          # prototyping ONLY -- never the production deploy path
```
```typescript
// Apply migrations from code at startup (e.g. serverless) with the migrator:
import { migrate } from 'drizzle-orm/node-postgres/migrator';
await migrate(db, { migrationsFolder: './drizzle' });   // idempotent; tracks applied set
```
- **Prod uses `generate` + `migrate`** (reviewable SQL artifacts, ordered, tracked in
  `__drizzle_migrations`). `push` has no artifact and can silently drop columns — keep
  it to local prototyping. Review every generated file; a column rename may surface as
  drop-old + add-new. [orm.drizzle.team/docs/migrations, retrieved 2026-07-10]

## Testing
```typescript
// FOOTGUN: tests against a shared/prod DB are slow, flaky, and destructive.
// RIGHT: an embedded/throwaway DB (better-sqlite3 in memory, or a disposable Postgres),
// migrated fresh, per suite.
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const sqlite = new Database(':memory:');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: './drizzle' });   // real schema, isolated

// Assert on the thrown constraint error, not a message string
await assert.rejects(
  db.insert(users).values({ email: existing }),    // duplicate unique email
);
```
- Migrate a fresh in-memory / disposable DB per suite so tests are isolated and
  deterministic. Assert on the rejection, not the driver's message text.
  [orm.drizzle.team/docs/migrations, retrieved 2026-07-10]

## Performance
- **Prepared statements** (`.prepare()` + `sql.placeholder`) skip query recompilation on
  hot paths and keep values bound.
- **Connection pooling is mandatory in serverless/prod** — a new `Pool` per invocation
  exhausts DB connections. Use a module-level pool (or an HTTP driver like Neon
  serverless / a pooler such as PgBouncer) and cap `max`.
- **Explicit joins over N round-trips**: Drizzle has no lazy relations, so fetch related
  rows with a single `leftJoin`/`innerJoin` or the relational `with:` — never loop and
  query per row. [orm.drizzle.team/docs/perf-queries, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **drizzle-orm 0.45.2** (published to npm **2026-03-27**) and **drizzle-kit 0.31.10**
  (published **2026-03-17**) are the current releases. Drizzle is pre-1.0; minor
  versions can carry breaking changes — pin exact versions and read the changelog.
  [registry.npmjs.org/drizzle-orm + registry.npmjs.org/drizzle-kit, retrieved 2026-07-10]
- **No codegen step**: types are inferred at compile time (`$inferSelect`/`$inferInsert`);
  there is nothing to regenerate after a schema edit, unlike Prisma.
  [orm.drizzle.team/docs/goodies, retrieved 2026-07-10]
- **`push` vs `generate`/`migrate`** behavior is stable: `push` applies with no artifact
  (prototyping); `generate`+`migrate` produce reviewable, tracked migrations (prod).
  [orm.drizzle.team/docs/migrations, retrieved 2026-07-10]
- Injection behavior is stable: the `sql` tagged template binds values; `sql.raw` does
  not — CWE-89. [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- drizzle-orm releases (npm): https://registry.npmjs.org/drizzle-orm
- drizzle-kit releases (npm): https://registry.npmjs.org/drizzle-kit
- Magic sql`` operator + sql.raw: https://orm.drizzle.team/docs/sql
- Migrations (generate/migrate vs push): https://orm.drizzle.team/docs/migrations
- Transactions: https://orm.drizzle.team/docs/transactions
- Query performance / prepared statements: https://orm.drizzle.team/docs/perf-queries
- Type inference goodies: https://orm.drizzle.team/docs/goodies
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
