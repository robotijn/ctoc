# Prisma CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install prisma @prisma/client
npx prisma init  # Creates prisma.config.ts (required in v7)
```

## Claude's Common Mistakes
1. **Missing prisma.config.ts** - v7 requires config file, not just schema.prisma
2. **No driver adapter** - v7 requires explicit driver adapters (pg, mysql2, etc.)
3. **Auto-loading env vars** - v7 doesn't auto-load .env; use dotenv explicitly
4. **Old client import** - Generator is now `prisma-client`, not `prisma-client-js`
5. **node_modules output** - v7 generates to project source, not node_modules

## Correct Patterns (2026)
```typescript
// prisma.config.ts (REQUIRED in v7)
import { defineConfig } from 'prisma'
import { PrismaPg } from '@prisma/adapter-pg'

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
})

// Client setup with driver adapter (v7 pattern)
import { PrismaClient } from './prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Type-safe query with explicit select
const orders = await prisma.order.findMany({
  where: { customerId, status: { in: ['pending', 'processing'] } },
  select: { id: true, total: true, items: { select: { productId: true } } },
  take: 20,
})
```

## Version Gotchas
- **v6->v7**: Driver adapters required, prisma.config.ts mandatory
- **v7 enums**: @map with enums has breaking behavior change
- **v7 SSL**: node-pg used instead of Rust engine; SSL defaults changed
- **With Next.js 16**: Turbopack has module resolution issues with prisma-client

## What NOT to Do
- Do NOT expect DATABASE_URL to auto-load from .env
- Do NOT use `prisma-client-js` generator (use `prisma-client`)
- Do NOT skip the driver adapter setup in v7
- Do NOT import from `@prisma/client` (import from generated location)

## N+1 Queries (the ORM performance footgun)
The classic ORM trap: fetch a list, then loop and lazily fetch each row's relation
— one query for the list plus one per row (**1 + N**). Prisma has no lazy relation
loading, so the N+1 appears as an explicit `await` inside a loop.

```typescript
// FOOTGUN: 1 query for orders + 1 query PER order for its customer = N+1
const orders = await prisma.order.findMany({ take: 100 })
for (const o of orders) {
  const customer = await prisma.customer.findUnique({ where: { id: o.customerId } })
  // ... 100 orders -> 101 round trips to the database
}

// RIGHT: a single query with `include`/`select` — the relation is JOINed/batched
const orders = await prisma.order.findMany({
  take: 100,
  include: { customer: true },              // one query, relation loaded with it
})

// RIGHT for the reverse (parent -> many children): still ONE round trip
const customers = await prisma.customer.findMany({
  select: { id: true, orders: { select: { id: true, total: true } } },
})
```
- The tell is a Prisma `await` inside a `for`/`map`. Replace it with a single
  `findMany` using `include`/`select`, or a `where: { id: { in: ids } }` batch.
  Enable query logging (`new PrismaClient({ log: ['query'] })`) to *see* the N+1.
  [prisma.io relation-queries + select-fields docs, retrieved 2026-07-09]

## Raw-Query SQL Injection — CWE-89
`$queryRaw` (tagged template) parameterizes interpolations; `$queryRawUnsafe` and
any **string-built** SQL do not. Concatenating user input into SQL is
**CWE-89 "Improper Neutralization of Special Elements used in an SQL Command
('SQL Injection')"** (cwe.mitre.org/89).

```typescript
// VULNERABLE (CWE-89): user input concatenated into the SQL string
const rows = await prisma.$queryRawUnsafe(
  `SELECT * FROM "User" WHERE email = '${email}'`   // ' OR '1'='1  -> full table
)
// ALSO VULNERABLE: $queryRaw used with a manually built string is NOT parameterized
const q = `SELECT * FROM "User" WHERE email = '${email}'`
await prisma.$queryRaw`${Prisma.raw(q)}`             // Prisma.raw() bypasses escaping

// SAFE: the $queryRaw TAGGED TEMPLATE binds ${email} as a parameter ($1), not text
const rows = await prisma.$queryRaw<User[]>`
  SELECT * FROM "User" WHERE email = ${email}
`                                                     // email is a bound parameter

// SAFE when you must build dynamic SQL: parameterize placeholders, pass values array
await prisma.$queryRawUnsafe(
  'SELECT * FROM "User" WHERE email = $1', email      // value is bound, not interpolated
)
```
- Prefer the typed Query API (`findMany`, etc.) — it is parameterized by
  construction. When raw SQL is unavoidable, use the **`$queryRaw` tagged template**
  so `${x}` becomes a bound parameter; reserve `$queryRawUnsafe` for
  static/trusted SQL and pass user values through its positional args, never via
  string concatenation. `Prisma.raw()` disables escaping — never wrap user input in
  it. [prisma.io raw-queries docs + cwe.mitre.org/data/definitions/89.html,
  retrieved 2026-07-09]
- **Type-safety gap**: `$queryRaw` returns `unknown[]` without an explicit type
  parameter (`$queryRaw<User[]>`); the compiler cannot check raw-SQL shape, so a
  column rename becomes a silent runtime bug.

## Migration Safety in Production
```bash
# FOOTGUN: `prisma migrate dev` is for DEVELOPMENT — it can RESET the database and
# generate migrations; never run it against production.
npx prisma migrate dev            # dev only: may drop + recreate data on drift

# RIGHT: production applies already-reviewed migrations, non-interactively
npx prisma migrate deploy         # applies pending migrations only; no reset, no prompt
```
- **Destructive changes are silent data loss**: dropping/renaming a column, or a
  `NOT NULL` add without a default, is emitted by `migrate` and *applied* — review
  every generated SQL file before it reaches prod. A rename is modeled as
  drop-old + add-new (data loss) unless you hand-edit the migration.
- **Lock waits**: an `ALTER TABLE` takes a table lock; on a large/hot table it can
  block writes for the duration. Split risky migrations (add nullable column →
  backfill → add constraint) and run them in a low-traffic window.
  [prisma.io migrate development-and-production workflow, retrieved 2026-07-09]

## Connection Pool & Transactions (serverless)
```typescript
// FOOTGUN: a new PrismaClient per request/lambda invocation exhausts DB connections
export function handler() {
  const prisma = new PrismaClient()      // each cold+warm call opens a fresh pool
  // ... under load -> "too many connections" / "Timed out fetching a connection"
}

// RIGHT: a module-level SINGLETON reused across warm invocations
const prisma = globalThis.__prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma

// Cap the pool per instance in serverless via the connection string
// DATABASE_URL="postgresql://.../db?connection_limit=5&pool_timeout=10"
```
- Prisma's default pool size is `num_physical_cpus * 2 + 1`; multiply that by every
  concurrent serverless instance and you blow past Postgres `max_connections`. Set
  `?connection_limit=` per instance and/or front the DB with a pooler (PgBouncer /
  Prisma Accelerate). `pool_timeout` turns a hung request into a fast error.
- **Transactions**: `prisma.$transaction([...])` runs the batch atomically. Use an
  interactive `$transaction(async (tx) => { ... })` for read-then-write logic, and
  set `isolationLevel: 'Serializable'` where you must prevent write skew — but then
  **handle the serialization-failure retry**, or a conflicting commit throws.
  [prisma.io connection-pool + transactions docs, retrieved 2026-07-09]

## Error Handling
```typescript
import { Prisma } from './prisma/client'

try {
  await prisma.user.create({ data: { email } })
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') { /* unique constraint violation — handle, don't 500 */ }
    if (e.code === 'P2025') { /* record not found for the operation */ }
  }
  throw e
}
```
- Match on the **stable `e.code`** (`P2002` unique violation, `P2025` not-found,
  `P2003` FK violation) via `PrismaClientKnownRequestError` — never string-match the
  message. Let unexpected errors propagate; do not swallow them.
  [prisma.io error-reference docs, retrieved 2026-07-09]

## Testing
```typescript
// FOOTGUN: unit tests that hit a shared/prod database are slow, flaky, and destructive.
// RIGHT: run integration tests against a THROWAWAY database, migrated fresh, per suite.
import { PrismaClient } from './prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },   // isolated test DB
})

beforeEach(async () => {
  // Reset to a known state inside a transaction / truncate — never against prod data
  await prisma.$executeRaw`TRUNCATE TABLE "Order", "Customer" RESTART IDENTITY CASCADE`
})

// Assert on the mapped Prisma error CODE, not the message string (stable across versions)
await assert.rejects(
  prisma.user.create({ data: { email: existing } }),
  (e: any) => e.code === 'P2002',                                // unique-violation
)
```
- Point tests at a dedicated `TEST_DATABASE_URL`, apply migrations with
  `prisma migrate deploy` in CI setup, and reset state between cases (truncate or a
  rolled-back transaction). Assert on stable `e.code` values, never on human-readable
  messages. [prisma.io testing / integration-testing docs, retrieved 2026-07-09]

## Version-Specific Gotchas (dated, sourced)
- **prisma / @prisma/client 7.8.0** is the current stable release, published
  **2026-04-22** to npm. [registry.npmjs.org/prisma + /@prisma/client, retrieved
  2026-07-09]
- **v6 → v7**: an explicit **driver adapter** (`@prisma/adapter-pg`, etc.) and a
  `prisma.config.ts` are required; the client generator is `prisma-client` (not
  `prisma-client-js`) and `.env` is no longer auto-loaded. [prisma.io v7 upgrade
  docs, retrieved 2026-07-09]
- Raw-query injection behavior is stable across v6/v7: **`$queryRaw` tagged template
  parameterizes; `$queryRawUnsafe` / `Prisma.raw()` do not** (CWE-89). [prisma.io
  raw-queries docs, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- prisma releases (npm): https://registry.npmjs.org/prisma
- @prisma/client releases (npm): https://registry.npmjs.org/@prisma/client
- Relation queries (N+1 / include): https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries
- Raw SQL queries: https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries
- Migrate (dev vs deploy): https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production
- Connection pool: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
- Transactions: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- Error reference: https://www.prisma.io/docs/orm/reference/error-reference
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
