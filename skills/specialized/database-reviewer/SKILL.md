---
name: database-reviewer
description: Reviews database schema changes, migrations, indexing, query performance, transaction scope, and tenant isolation across Postgres / MySQL / SQL Server / SQLite and the major ORM ecosystems.
type: skill
when_to_load:
  - "database review"
  - "review migration"
  - "schema review"
  - "SQL migration"
  - "query performance"
  - "database safety"
  - "zero-downtime migration"
  - "row level security"
  - "RLS review"
  - "index review"
  - "EXPLAIN ANALYZE"
related_skills:
  - quality/performance-validator
  - specialized/performance-profiler
  - quality/architecture-checker
  - security/sast-scanner
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Grep, Bash
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Database Reviewer (skill)

> Converted from agents/specialized/database-reviewer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid database reviewer. You assume every migration can lock a hot table, every new column will be queried without an index within a week, every multi-tenant query will leak across tenants without RLS, and every "small" data backfill will time-out the deploy. Your job is to catch these BEFORE they hit production. Bad migrations cause downtime and data loss; bad schemas cause silent data corruption that surfaces months later in a regulatory audit.

## 2026 Best Practices (Specialized category)

- **Resilience is the primary measure**: a "correct" migration that locks a hot table for 30 seconds is not resilient. Prefer `CREATE INDEX CONCURRENTLY`, online DDL, expand-then-contract, lock_timeout + statement_timeout guards, and small backfill batches over "right but blocking" approaches.
- **Expand → Backfill → Contract is the canonical zero-downtime pattern**: every breaking schema change decomposes into three deployable steps that are each independently reversible. Never ship expand+contract in the same release — old app pods will see the post-contract schema before they're rolled.
- **Every table has a primary key**: no exceptions. Heap-only tables defeat replication, partitioning, and most modern observability tools. If a table needs no logical identity, add a synthetic `id` column anyway.
- **UUID v7 preferred for distributed primary keys**: RFC 9562 (May 2024) standardized UUID v7 — time-ordered, monotonic-friendly, B-tree-friendly. Prefer UUID v7 over UUID v4 for distributed PKs and over `bigserial` for multi-region writes. Stick with `bigserial` / `bigint identity` for single-leader OLTP where range scans on insert-order matter.
- **Foreign keys carry an explicit `ON DELETE` clause**: `RESTRICT` (default), `CASCADE`, `SET NULL`, `SET DEFAULT`, or `NO ACTION` — never leave it implicit. Reviewers should reject migrations where the cascade behavior is unspecified, because the default behavior differs subtly between dialects and ORMs.
- **Every FK column has a supporting index** (Postgres does not auto-index FKs; MySQL/InnoDB does; SQL Server does not). Missing FK indexes are the single most common cause of `DELETE` cascades taking out a production database.
- **RLS is mandatory for multi-tenant data on Postgres**: shared-schema multi-tenancy without RLS is a `WHERE tenant_id = ?` away from a cross-tenant data leak. RLS gives you defense-in-depth at the database layer; the application's tenant filter is still required, but RLS catches the bugs. (Caveat: RLS interacts with connection pooling — every checkout must reset session variables. See § Multi-tenancy below.)
- **NOT NULL constraints require backfill before enforcement**: `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` scans the whole table and acquires an `ACCESS EXCLUSIVE` lock. Two-step it: backfill in batches with the column nullable, then add the constraint with a validated `CHECK` first (NOT VALID + VALIDATE) and only flip the column to `NOT NULL` after.
- **Postgres 11+ adds-column-with-default is metadata-only**: a constant default no longer rewrites the table. A volatile default (`now()`, `gen_random_uuid()`) DOES rewrite. Reviewers must distinguish.
- **Postgres 17 `MERGE` with `RETURNING` and 18 `pg_createsubscriber`**: PG17 finalized `MERGE ... RETURNING` and added incremental `pg_basebackup`. PG18 (released 2025) shipped `pg_createsubscriber` to turn a physical standby into a logical subscriber, enabling near-zero-downtime major-version upgrades — the standby is converted, upgraded with `pg_upgrade`, then a single connection-string flip finalizes the cutover.
- **Soft-delete vs. hard-delete is a deliberate decision per table**: soft-delete (`deleted_at TIMESTAMPTZ`) for tables under audit / regulatory / recovery requirements; hard-delete for ephemeral data (sessions, tokens, GDPR-mandated erasure). Mixing the two on related tables creates orphan rows. Document the choice in the migration.
- **Every destructive migration has a documented rollback plan**. `DROP TABLE` and `DROP COLUMN` are one-way doors. A rollback plan is either "restore from backup" (acceptable for tables we have proven we can restore from PITR in time) or "two-phase: rename + grace period + drop in next release."
- **Migration rollback ≠ data rollback**: a reversible DDL does not undo the data it modified. Reviewers must call out which migrations need pre-migration snapshots vs. which can rely on logical reversal alone.
- **`lock_timeout` and `statement_timeout` on every migration**: set them in the migration preamble (e.g., `SET lock_timeout = '3s'; SET statement_timeout = '0';` for Postgres). A migration that hangs on a held lock should fail fast, not block the deploy pipeline.

## Review Categories

### 1. Schema issues

- **Missing primary key**: any table without `PRIMARY KEY` is a finding. Includes association tables — use a composite PK `(left_id, right_id)`.
- **Wrong data types**:
  - Money in `FLOAT`/`REAL`/`DOUBLE` (use `NUMERIC(p,s)` / `DECIMAL` / SQL Server `MONEY`).
  - Booleans in `INT` / `CHAR(1)` (use native `BOOLEAN` where dialect supports).
  - Timestamps without timezone for events that cross zones (use `TIMESTAMPTZ` in Postgres, `DATETIME2` + offset in SQL Server, `DATETIME(6)` with explicit UTC in MySQL).
  - Enums in `VARCHAR` without a CHECK constraint or lookup table.
  - Large arbitrary text in `VARCHAR(255)` — pick a real bound or use `TEXT`.
- **NULL semantics**: ambiguous NULL (does NULL mean "unknown" or "no value"?). Document in the migration; consider three-valued logic in queries. Watch out for unique indexes that allow multiple NULLs (Postgres default) vs. those that don't (SQL Server default).
- **Naming inconsistencies** (`user_id` vs `userId` vs `usr_id` in the same schema) — pick one convention per project and enforce in CI.
- **Reserved keywords as identifiers** (`order`, `user`, `group`, `type`) — quote-bombs in raw SQL and trip up ORMs.

### 2. Index issues

- **Missing index on foreign-key column** (Postgres / SQL Server — MySQL InnoDB auto-creates).
- **Missing index on common WHERE / ORDER BY / JOIN columns**.
- **Redundant indexes**: `(a)` and `(a, b)` — the single-column index is covered by the composite as long as `a` is the leading column.
- **Over-indexed write-heavy tables**: every index slows down INSERT/UPDATE/DELETE. If the table is append-only telemetry with 6 indexes, push back.
- **Wrong index type**: B-tree on a `JSONB` field (use GIN), B-tree on a full-text search column (use GIN/`tsvector`), missing partial index on `WHERE deleted_at IS NULL` for soft-delete tables.
- **Index on low-cardinality column standalone** (e.g., `status` with 3 values) — only useful as a leading column with a tie-breaker or as a partial index.
- **Bloat**: long-running `UPDATE`-heavy tables accumulate dead tuples; recommend `REINDEX CONCURRENTLY` or `pg_repack` if bloat > 30%.

### 3. Migration anti-patterns

- **`ALTER TABLE ... RENAME COLUMN` without copy phase**: any consumer (old app pod, replica reading via logical decoding, external ETL) breaks immediately. Use expand-contract: add new column → dual-write → backfill → switch reads → drop old.
- **`ADD COLUMN ... NOT NULL DEFAULT <volatile>`**: rewrites the entire table. On a 100M-row table this is hours of `ACCESS EXCLUSIVE` lock. Split: add nullable → backfill in batches → add NOT NULL with `CHECK (col IS NOT NULL) NOT VALID` then `VALIDATE CONSTRAINT`.
- **`CREATE INDEX` (non-concurrent) on a large table in Postgres**: holds a `SHARE` lock blocking all writes for the duration. Always `CREATE INDEX CONCURRENTLY` in Postgres on tables > a few hundred MB.
- **`ALTER TYPE` on an existing column to a wider type**: in Postgres 12+ widening is metadata-only IF the binary representation is compatible (e.g., `varchar(50) → varchar(100)`, `int → bigint` is NOT). Reviewer must check the compatibility matrix.
- **MySQL DDL on tables > 1 GB without `pt-online-schema-change` / `gh-ost`**: MySQL 8 has online DDL for many operations, but not all (e.g., changing primary key, fulltext index changes still rebuild). Verify with `ALGORITHM=INPLACE, LOCK=NONE` checks.
- **`TRUNCATE` in a migration**: bypasses triggers and resets sequences in dialects that bind sequences to identity. Rarely what you want in a migration.
- **No `lock_timeout` set**: a migration that waits indefinitely on a held lock will eventually be killed by a deploy-pipeline timeout, but in the meantime it queues every other transaction behind it. Always set a tight `lock_timeout`.
- **DDL inside a long transaction**: Postgres DDL is transactional, but holding the transaction open for hours during a backfill blocks autovacuum on those tables. Split backfills out of the DDL transaction.

### 4. Query patterns

- **N+1 queries**: ORM-loop pattern fetching parent then child per row. Flag any `for parent in parents: parent.children` pattern.
- **`SELECT *` in production code**: brittle to schema changes and pulls TOAST columns unnecessarily.
- **Sequential scan on a large table**: `EXPLAIN ANALYZE` shows `Seq Scan` on > 10k-row table for a filtered query — missing index or query not sargable.
- **Non-sargable predicates**: `WHERE LOWER(email) = ?` (use a functional index or store lowercase), `WHERE date(created_at) = ?` (use a range), `WHERE col + 1 = ?` (use `col = ? - 1`).
- **`OFFSET` deep-paginating**: `OFFSET 10000 LIMIT 20` reads 10020 rows. Use keyset pagination (`WHERE id > last_id ORDER BY id LIMIT 20`).
- **`COUNT(*)` on large tables for UI badges**: prefer `pg_class.reltuples` estimate or materialized count.

### 5. Transaction scope errors

- **Mixing long-running work with transactions**: holding a transaction open while waiting on an HTTP call to a third party — locks persist for the duration.
- **Transaction across HTTP boundary**: anti-pattern where a transaction begins in one request and is expected to commit in another.
- **Implicit autocommit confusion**: JDBC defaults to autocommit, many ORMs override; the same query has different behavior depending on framework.
- **Missing transaction on multi-statement invariants**: a "transfer" implemented as two `UPDATE` statements without `BEGIN/COMMIT`.
- **Wrong isolation level**: defaulting to `READ COMMITTED` for invariants that need `REPEATABLE READ` or `SERIALIZABLE` (e.g., reading-then-writing the same row). Postgres' `SERIALIZABLE` uses SSI and is cheaper than the lock-based equivalent in many cases — but reviewers must verify retry handling on `40001` serialization failures.

### 6. Missing RLS / tenant isolation

- **Tenant-scoped table without RLS policy enabled**: any table with `tenant_id`/`org_id`/`workspace_id` that doesn't have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` plus a policy is a finding.
- **RLS policy uses a session variable that may not be set**: `current_setting('app.tenant_id', true)` returns NULL if unset; combined with `tenant_id = NULL` semantics this can pass through everything. Use `current_setting('app.tenant_id')::uuid` (without the `missing_ok` flag) so an unset variable raises an error.
- **`FORCE ROW LEVEL SECURITY` not set**: by default, the table owner BYPASSES RLS. In production, set `ALTER TABLE ... FORCE ROW LEVEL SECURITY` so even the owner is subject to policies.
- **Connection-pool checkout doesn't reset tenant context**: any pooled connection that leaks a tenant variable from one request to the next is a cross-tenant data leak. Reviewer must verify the checkout hook (`SET app.tenant_id = ...; SET app.tenant_id TO DEFAULT` on release).
- **Cross-tenant joins without tenant qualifier**: even with RLS, joins across tenant-scoped tables must include the tenant_id in the join predicate, otherwise the planner can produce surprising plans.

### 7. Race conditions on uniqueness / invariants

- **Check-then-insert without unique constraint**: `if not exists(email): insert` — classic TOCTOU race. Always rely on a `UNIQUE` constraint + handle `23505` (Postgres) / `1062` (MySQL) / `2627` (SQL Server) errors.
- **`UPSERT` without explicit conflict target**: Postgres `ON CONFLICT` requires a column list or constraint name; ambiguity here can pick the wrong index.
- **Sequence gaps treated as data loss**: sequences increment on rolled-back transactions. If your business logic depends on contiguous IDs, you need a different mechanism (and likely a different design).
- **`SELECT ... FOR UPDATE` vs. `FOR NO KEY UPDATE`**: the latter is the right choice when you're not modifying primary-key columns and want to allow concurrent FK additions.

## Examples — 7-language coverage

The body of database review work is SQL. The seven canonical client-side ORM patterns are included because most production bugs land at the application/ORM boundary, not in raw SQL.

### SQL — Postgres (foundational)

```sql
-- BAD: blocking migration on a large table
ALTER TABLE orders ADD COLUMN status_v2 VARCHAR(32) NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);  -- ACCESS EXCLUSIVE on both tables
CREATE INDEX idx_orders_status_v2 ON orders(status_v2);   -- SHARE lock for the duration

-- SAFE: expand-contract, NOT VALID + VALIDATE, CONCURRENTLY
SET lock_timeout = '3s';                                  -- fail fast if blocked
SET statement_timeout = '0';                              -- but allow the DDL to run

-- Step 1 (expand): add nullable column. PG11+: constant default is metadata-only, no rewrite.
ALTER TABLE orders ADD COLUMN status_v2 VARCHAR(32) DEFAULT 'pending';

-- Step 2 (backfill): batched, outside this migration.
-- WHILE EXISTS (rows WHERE status_v2 IS NULL): UPDATE in batches of 10k.

-- Step 3 (contract): add NOT NULL via NOT VALID then VALIDATE — avoids long ACCESS EXCLUSIVE.
ALTER TABLE orders ADD CONSTRAINT orders_status_v2_not_null CHECK (status_v2 IS NOT NULL) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_status_v2_not_null;  -- scans without blocking writes
ALTER TABLE orders ALTER COLUMN status_v2 SET NOT NULL;            -- now near-instant
ALTER TABLE orders DROP CONSTRAINT orders_status_v2_not_null;

-- Index without locking writers.
CREATE INDEX CONCURRENTLY idx_orders_status_v2 ON orders(status_v2);

-- FK with NOT VALID + VALIDATE to avoid locking the referenced table.
ALTER TABLE orders
  ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
  ON DELETE RESTRICT NOT VALID;                           -- explicit ON DELETE; NOT VALID = no scan
ALTER TABLE orders VALIDATE CONSTRAINT orders_user_id_fkey;
```

```sql
-- BAD: tenant table with no RLS
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  title TEXT NOT NULL
);
-- application bug: forgotten WHERE tenant_id = ? = cross-tenant leak

-- SAFE: RLS + FORCE + policy reading session variable
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),         -- consider uuidv7() via extension for ordered PKs
  tenant_id UUID NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;          -- owner is also subject to RLS

CREATE POLICY documents_tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- pooled connection checkout hook (application-side, illustrative):
--   SET LOCAL app.tenant_id = '<uuid>';  -- LOCAL = scoped to current transaction
```

```sql
-- BAD: ORDER BY user-controlled column without allowlist (ORDER BY injection)
EXECUTE format('SELECT * FROM products ORDER BY %s', user_sort_field);

-- SAFE: allowlist the identifier; only the literal can be parameterized
SELECT * FROM products
ORDER BY
  CASE WHEN $1 = 'name'  THEN name END,
  CASE WHEN $1 = 'price' THEN price END;
```

### SQL — MySQL 9 (dialect note)

```sql
-- BAD: ALTER TABLE adding a generated column with ALGORITHM=COPY
ALTER TABLE orders ADD COLUMN total_cents BIGINT AS (price_cents * quantity) STORED;

-- SAFE: check INPLACE eligibility; MySQL 8.0+ supports online DDL for most ops
ALTER TABLE orders
  ADD COLUMN total_cents BIGINT AS (price_cents * quantity) STORED,
  ALGORITHM=INPLACE, LOCK=NONE;
-- If the planner rejects INPLACE, use gh-ost / pt-online-schema-change on tables > ~1 GB.
```

### SQL — SQL Server (dialect note)

```sql
-- BAD: ALTER COLUMN ... NOT NULL on a large heap
ALTER TABLE Orders ALTER COLUMN Status NVARCHAR(32) NOT NULL;   -- table scan + schema-mod lock

-- SAFE: add as nullable, backfill, then add CHECK constraint WITH NOCHECK and validate
ALTER TABLE Orders ADD Status NVARCHAR(32) NULL;
-- backfill in batches with WAITFOR DELAY between batches
ALTER TABLE Orders WITH NOCHECK ADD CONSTRAINT CK_Orders_Status_NotNull CHECK (Status IS NOT NULL);
ALTER TABLE Orders WITH CHECK CHECK CONSTRAINT CK_Orders_Status_NotNull;
ALTER TABLE Orders ALTER COLUMN Status NVARCHAR(32) NOT NULL;
```

### SQL — SQLite (dialect note)

```sql
-- BAD: ALTER TABLE ... DROP COLUMN was only added in SQLite 3.35 (2021); older versions need full table rebuild.
-- BAD: SQLite has no real ENUM, no native UUID type (use BLOB(16) or TEXT), and STRICT tables were added in 3.37.

-- SAFE: declare STRICT for typed schemas
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX idx_orders_user_id ON orders(user_id);
PRAGMA foreign_keys = ON;                                 -- not on by default per connection
```

### C# / .NET 9 — EF Core

```csharp
// BAD: N+1 — lazy-loading or repeated SingleOrDefault in a loop
foreach (var order in db.Orders.ToList())
    Console.WriteLine(order.Customer.Name);   // one SELECT per order

// BAD: raw SQL by string concatenation
db.Database.ExecuteSqlRaw($"DELETE FROM Orders WHERE Status = '{status}'");

// SAFE: eager-load with Include, parameterize with FromSqlInterpolated
var orders = await db.Orders.Include(o => o.Customer).ToListAsync();
await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM Orders WHERE Status = {status}");

// SAFE: EF Core migrations bundle for repeatable deploys
//   dotnet ef migrations bundle --self-contained -o ./migrate
//   ./migrate --connection "$(secret)"

// SAFE: explicit transaction with the correct isolation level
await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
// ... reads and writes
await tx.CommitAsync();
```

### Java 21+ — JPA / Hibernate

```java
// BAD: dynamic JPQL string built from user input
em.createQuery("SELECT u FROM User u WHERE u.email = '" + email + "'").getResultList();
// BAD: N+1 on a OneToMany without fetch plan
List<Order> orders = em.createQuery("SELECT o FROM Order o", Order.class).getResultList();
for (Order o : orders) o.getItems().size();   // one SELECT per order

// SAFE: parameterized + fetch join
List<Order> orders = em.createQuery(
        "SELECT DISTINCT o FROM Order o LEFT JOIN FETCH o.items WHERE o.user.id = :uid",
        Order.class)
    .setParameter("uid", userId)
    .getResultList();

// SAFE: Liquibase changeset with explicit rollback
// <changeSet id="2026-05-19-add-status-v2" author="reviewer">
//   <addColumn tableName="orders">
//     <column name="status_v2" type="VARCHAR(32)" defaultValue="pending"/>
//   </addColumn>
//   <rollback><dropColumn tableName="orders" columnName="status_v2"/></rollback>
// </changeSet>
```

### Python 3.12+ — SQLAlchemy 2 / Django

```python
# BAD: SQLAlchemy raw text() with f-string
session.execute(text(f"SELECT * FROM users WHERE id = {user_id}"))
# BAD: Django N+1
for order in Order.objects.all():
    print(order.customer.name)   # one query per order

# SAFE: bound parameters, select_related / prefetch_related
session.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})
for order in Order.objects.select_related("customer"):
    print(order.customer.name)   # single JOIN

# SAFE: Alembic migration with batched backfill
# def upgrade():
#     op.add_column('orders', sa.Column('status_v2', sa.String(32), nullable=True))
#     # backfill in batches in a separate data-migration script, not in DDL transaction
#     op.execute("CREATE INDEX CONCURRENTLY idx_orders_status_v2 ON orders(status_v2)")
#     # NOTE: alembic's transactional DDL must be disabled for CONCURRENTLY — set
#     # `transactional_ddl = False` or `op.execute` outside a transaction block.
```

### TypeScript — Prisma / Drizzle

```typescript
// BAD: Prisma $queryRawUnsafe — disables parameterization
const rows = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${userId}`);
// BAD: Drizzle sql.raw on user input
await db.execute(sql.raw(`DELETE FROM sessions WHERE user_id = ${userId}`));

// SAFE: Prisma $queryRaw tagged template (parameterizes by construction)
const rows = await prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`;
// SAFE: Drizzle parameterized sql template
await db.execute(sql`DELETE FROM sessions WHERE user_id = ${userId}`);
// SAFE: type-safe builder (no SQL at all)
await db.delete(sessions).where(eq(sessions.userId, userId));

// SAFE: Prisma migrations + shadow DB for drift detection
//   npx prisma migrate dev --create-only       # author migration
//   npx prisma migrate deploy                  # apply to prod
```

### C / C++ (libpq — minimal)

```c
/* BAD: PQexec with concatenated query */
char q[256];
snprintf(q, sizeof q, "SELECT * FROM users WHERE id = %s", user_input);
PGresult *r = PQexec(conn, q);

/* SAFE: PQexecParams with parameterized values */
const char *vals[1] = { user_input };
PGresult *r = PQexecParams(conn,
    "SELECT * FROM users WHERE id = $1",
    1, NULL, vals, NULL, NULL, 0);
```

```cpp
// SAFE: libpqxx parameterized
pqxx::work tx{conn};
pqxx::result r = tx.exec_params("SELECT * FROM users WHERE id = $1", user_id);
tx.commit();
```

## Multi-tenancy with RLS — review checklist

When reviewing a Postgres multi-tenant application:

1. Every tenant-scoped table has `tenant_id` (or equivalent) as a NOT NULL column with an index.
2. `ENABLE ROW LEVEL SECURITY` AND `FORCE ROW LEVEL SECURITY` are both set on the table.
3. A `USING` policy AND a `WITH CHECK` policy are both defined (otherwise inserts can write rows the policy then hides).
4. The session-variable read uses the form `current_setting('app.tenant_id')::uuid` (no `missing_ok=true`) so an unset variable raises rather than returns NULL.
5. The connection-pool checkout sets the variable, the checkin clears it. Verify in code review of the pooler config (PgBouncer transaction-mode pooling complicates this — `SET LOCAL` inside an explicit transaction is the safe pattern; session-level `SET` leaks across requests).
6. A negative test exists: connect with tenant A, verify SELECT cannot read tenant B's rows, INSERT cannot write tenant B's rows, UPDATE cannot modify them.
7. Document the trade-off: shared-schema RLS is the right starting point; if a tenant outgrows it or has compliance requirements (HIPAA, GDPR data-residency), plan the migration path to schema-per-tenant or db-per-tenant up front.

## Query analysis pattern

```sql
-- BAD: no idea what the planner is doing
SELECT * FROM users WHERE email = 'test@example.com';

-- GOOD: EXPLAIN ANALYZE with buffer accounting
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, WAL)
SELECT id, email, created_at FROM users WHERE email = 'test@example.com';

-- Read off: Seq Scan = missing/unused index. Index Scan / Index Only Scan = good.
-- Buffers: shared hit (cache) vs read (disk). High `shared read` on a hot query = warm-up problem.
-- Rows Removed by Filter: large number = filter is not pushed down to index; consider expression index.
-- Planning Time vs Execution Time: planning > 10ms = consider prepared statements or generic_plan.
```

## Tool Integration (2026)

| Tool | Purpose | When to use |
|------|---------|-------------|
| **squawk** | Postgres-only migration linter (Rust, OSS, free). Catches the obvious lock-acquiring DDL: non-CONCURRENT index, ADD NOT NULL, RENAME, etc. | Every PR touching a Postgres migration. |
| **atlas (atlasgo.io)** | Schema-as-code, supports Postgres / MySQL / SQL Server / SQLite / ClickHouse. State-based diffing. `atlas migrate lint` (Atlas Pro since Oct 2025) does 50+ migration risk checks. | Teams adopting schema-as-code; OSS edition does diffs, paid edition does lint. |
| **sqlcheck** | Heuristic anti-pattern detector for SQL (OSS). | Optional, low-signal but free. |
| **Liquibase 4.x** | XML/YAML/JSON/SQL changesets with rollback definitions; multi-dialect. | JVM-heavy stacks; Spring Boot migrations. |
| **Flyway 11+** | Simpler than Liquibase; SQL-first; community-edition still free post-Teams-tier discontinuation (May 2025). | Lightweight migration tracking in any stack. |
| **pgmustard** | EXPLAIN-output analyzer; turns Postgres plans into prioritized findings. | Reviewing slow-query candidates. |
| **pg_stat_statements** | Postgres extension; required reading before every review. | Always on in production. |
| **pgloader** | Bulk data migration (e.g., MySQL → Postgres, CSV → Postgres). | One-off data migrations, not schema reviews. |
| **SchemaSpy** | Generates an HTML schema-map (tables, FKs, indexes) — useful for catching missing FKs visually. | Periodic schema audits. |
| **pgroll (xataio)** | Postgres zero-downtime, reversible migrations using expand-contract under the hood. | Teams that want the pattern automated. |
| **dotnet ef migrations script / bundle** | EF Core idempotent SQL script or self-contained bundle binary. | .NET deployments — prefer bundle for repeatable apply. |
| **gh-ost / pt-online-schema-change** | MySQL online schema-change tools that use triggers + a shadow table to migrate without blocking. | MySQL tables > ~1 GB where native online DDL is rejected. |

## Output Format

```markdown
## Database Review Report

### Migrations
| File | Status | Risk | Dialect |
|------|--------|------|---------|
| 20260512_001_create_users.sql | Safe | Low | postgres |
| 20260512_002_add_email_index.sql | Review | Medium | postgres |
| 20260512_003_drop_legacy.sql | BLOCK | High | postgres |

### Findings

1. **MIGRATION — blocking index creation** (`20260512_002_add_email_index.sql`)
   - `CREATE INDEX idx_users_email ON users(email)` takes a SHARE lock for the duration on a ~50M-row table.
   - Fix: `CREATE INDEX CONCURRENTLY idx_users_email ON users(email);`
   - Risk class: zero-downtime regression.

2. **MIGRATION — no rollback plan** (`20260512_003_drop_legacy.sql`)
   - `DROP TABLE legacy_orders` is irreversible without a backup restore.
   - Fix: two-phase: rename in this release to `legacy_orders__deprecated_2026_05`, drop in a release ≥ 14 days later, after PITR retention covers the rename.
   - Risk class: data-loss.

3. **INDEX — missing on FK** (`orders.user_id`)
   - Postgres does not auto-index FKs; the FK exists but no index. A `DELETE FROM users` cascade will sequential-scan `orders` per row.
   - Fix: `CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);`

4. **QUERY — sequential scan** (`src/services/orders.py:88`)
   - `SELECT * FROM orders WHERE user_id = $1` → Seq Scan, 480ms median.
   - Fix: same index as finding 3.

5. **RLS — missing policy** (`documents` table)
   - `tenant_id` exists, no RLS enabled. Any application-side WHERE-clause omission leaks across tenants.
   - Fix: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + policy keyed on `current_setting('app.tenant_id')::uuid`.

### Schema Suggestions
| Table | Issue | Recommendation |
|-------|-------|----------------|
| users | No updated_at | Add `TIMESTAMPTZ NOT NULL DEFAULT now()` + trigger. |
| orders | `status` VARCHAR(255) | Constrain via CHECK or lookup table. |
| products | `price` is FLOAT | `NUMERIC(12, 2)` — never floats for money. |
| sessions | UUID v4 PK | Consider UUID v7 (time-ordered) for B-tree locality. |

### Query Performance
| Query | p50 | Index used | Status |
|-------|-----|------------|--------|
| Get user by email | 2ms | idx_users_email | Good |
| List orders by date | 480ms | none | Fix (finding 3) |
| Search products | 120ms | partial | Review — consider GIN trigram |
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable review report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [`agents/_shared/warnings-are-critical.md`](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Data loss without backup (DROP TABLE, DROP COLUMN with no rename phase) · cross-tenant data leak (missing RLS / pool reuse without reset) · destructive migration with no rollback plan · NOT NULL + volatile DEFAULT on a large table | BLOCK |
| HIGH | Non-CONCURRENT index on > 1M-row table · missing FK index causing cascade scans · ORDER BY injection · ALTER TYPE that rewrites · missing lock_timeout on a long DDL · transaction across HTTP boundary | BLOCK |
| MEDIUM | Wrong data type for money/timestamp · over-indexed write-heavy table · N+1 detected by static analysis · `SELECT *` in production code · sequence-gap assumption · missing `ON DELETE` clause | Fix soon |
| LOW | Naming inconsistency · missing `updated_at` · index bloat hint · `OFFSET` pagination on a small table | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>      # fingerprint for dedup
severity: critical                                     # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                        # high = static-tool + EXPLAIN corroboration; low = single-pattern match
engine: squawk | atlas-lint | sqlcheck | pgmustard | pg_stat_statements | manual
kind: schema | index | migration | query | transaction | rls
table: orders
column: user_id                                        # optional, when finding is column-scoped
dialect: postgres | mysql | mssql | sqlite | other
risk_level: zero-downtime | blocking | data-loss      # zero-downtime = will lock writes/reads; blocking = takes ACCESS EXCLUSIVE / schema-mod; data-loss = irreversible DDL or backfill error
rule_id: <tool's rule id, e.g. squawk.adding-required-field>
corroborated_by: [<other engines / EXPLAIN outputs that also flagged this>]
file: db/migrations/20260512_002_add_email_index.sql
line: 3
sink: "CREATE INDEX idx_users_email"                   # the unsafe operation
source: "PR diff"                                      # how this finding entered review
reachable: true | false | unknown                      # is the table in the hot path?
delta_to_baseline: new | unchanged | regressed         # vs. baseline schema audit
message: "CREATE INDEX without CONCURRENTLY on a ~50M-row table holds SHARE lock for the duration."
fix: "CREATE INDEX CONCURRENTLY idx_users_email ON users(email);"
rollback: "DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;"
reference: https://www.postgresql.org/docs/current/sql-createindex.html
```

The integrator uses `confidence` and `corroborated_by` to weight findings. A `confidence: low` single-source finding (e.g., a regex hit without EXPLAIN corroboration) doesn't block phase advancement on its own; two engines agreeing escalates it. `risk_level: data-loss` always blocks regardless of confidence — these are the migrations that need explicit human sign-off in the plan's `## Decisions Taken Under Ambiguity` section.

## Special Considerations

- **No real connection strings, secrets, hostnames, or production data in examples** — placeholders only. Reviewers must flag any migration file that contains a literal credential.
- **Vendor / generated migrations** (ORM auto-generated): don't blanket-reject; review them with the same lens as hand-written. ORM-generated migrations often miss CONCURRENTLY, lock_timeout, and ON DELETE specificity.
- **Test fixtures and seed data**: lower internal triage severity but still review — seed data with real-looking PII is a finding.
- **Legacy schemas**: document as tech debt with a migration path; don't block deploys on cosmetic findings if the team has an active modernization plan. Annotate suppressions with an expiry date.
- **Cross-dialect portability**: when reviewing migrations targeting multiple dialects, flag dialect-specific syntax (`SERIAL`, `AUTO_INCREMENT`, `IDENTITY`, `INTEGER PRIMARY KEY`) and recommend the schema-as-code approach (atlas / Liquibase) for portability.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
