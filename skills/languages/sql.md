# SQL CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude concatenates strings into queries — use parameterized queries
- Claude uses `SELECT *` — specify column names explicitly
- Claude forgets `LIMIT` on large tables — always bound queries
- Claude ignores `EXPLAIN ANALYZE` — verify query plans

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `sqlfluff` | Linting and formatting | Manual style |
| `flyway` / `liquibase` | Migration management | Manual DDL |
| `pgtap` / `utplsql` | Database testing | No tests |
| `pg_stat_statements` | Query analysis | Guessing perf |
| `dbeaver` / `datagrip` | SQL clients | Basic psql |

## Patterns Claude Should Use
```sql
-- Always parameterized (application code)
-- SELECT * FROM users WHERE id = $1

-- Specify columns, not SELECT *
SELECT id, name, email, created_at
FROM users
WHERE status = 'active'
LIMIT 100;

-- Index foreign keys
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Use EXPLAIN ANALYZE to verify plans
EXPLAIN ANALYZE
SELECT u.name, COUNT(o.id)
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id;

-- Proper pagination (keyset, not OFFSET)
SELECT * FROM posts
WHERE created_at < $1  -- last seen timestamp
ORDER BY created_at DESC
LIMIT 20;
```

## Anti-Patterns Claude Generates
- String concatenation for queries — SQL injection risk
- `SELECT *` — specify columns, avoid schema coupling
- `OFFSET` for pagination — use keyset pagination
- Missing indexes on FKs — causes slow joins
- Unbounded queries — always use `LIMIT`

## Version Gotchas
- **PostgreSQL 16+**: Improved JSON, parallel query
- **N+1 problem**: Use JOINs or batch fetching
- **Indexes**: Check `EXPLAIN` to verify usage
- **Locks**: Use row-level locks, small transactions
- **With ORMs**: Review generated SQL, don't trust blindly

## Query-Shape / Concurrency Footguns
SQL correctness under concurrency is governed by the **transaction isolation level**,
not by app-side locking. Name the level explicitly; the defaults differ by engine.

```sql
-- Isolation levels (SQL standard, ascending strictness):
--   READ UNCOMMITTED < READ COMMITTED < REPEATABLE READ < SERIALIZABLE
-- Default: PostgreSQL & Oracle = READ COMMITTED; MySQL/InnoDB = REPEATABLE READ.

-- Footgun: a "check-then-update" race under READ COMMITTED. Two sessions both read
-- balance=100, both subtract 100 -> lost update. Fix: take the row lock on read.
BEGIN;
SELECT balance FROM accounts WHERE id = $1 FOR UPDATE;   -- row lock, blocks writers
UPDATE accounts SET balance = balance - $2 WHERE id = $1;
COMMIT;

-- SERIALIZABLE (PostgreSQL uses SSI, not blocking) can abort with a
-- serialization_failure (SQLSTATE 40001) — you MUST retry the whole transaction.
```
- **Anomalies by level**: READ COMMITTED allows non-repeatable reads + phantoms;
  REPEATABLE READ still allows phantoms in the standard (InnoDB blocks most via
  next-key locks); only SERIALIZABLE forbids all three.
- **Deadlocks** come from inconsistent lock ordering — always acquire rows/tables in
  a stable order (e.g. by ascending primary key). The engine kills one victim
  (SQLSTATE 40P01 in PostgreSQL); the app must catch and retry.
- Keep transactions **short**; a long-held lock or an idle-in-transaction connection
  stalls every writer behind it and bloats MVCC (PostgreSQL `VACUUM` can't reclaim
  rows still visible to an old snapshot).

## Error Handling / Constraints Idioms
Push invariants into the schema — a constraint the database enforces cannot be
bypassed by a buggy code path, a second service, or a manual query.

```sql
-- Declare invariants as constraints, not app-side checks:
CREATE TABLE orders (
  id         bigint PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id),      -- FK: no orphans
  email      text   NOT NULL,
  qty        int    NOT NULL CHECK (qty > 0),            -- CHECK: domain rule
  UNIQUE (user_id, email)                                -- UNIQUE: dedupe
);

-- Idempotent upsert (PostgreSQL / SQLite ON CONFLICT; SQL Server / Oracle use MERGE):
INSERT INTO counters (key, n) VALUES ($1, 1)
ON CONFLICT (key) DO UPDATE SET n = counters.n + 1;

-- Wrap multi-statement writes in an explicit transaction; roll back on any error
-- so a partial write never persists:
BEGIN;
  INSERT INTO orders (...) VALUES (...);
  UPDATE inventory SET stock = stock - 1 WHERE sku = $1 AND stock > 0;
  -- if 0 rows updated, ROLLBACK — do not ship an oversold order
COMMIT;
```
- **NULL semantics**: `NULL = NULL` is `UNKNOWN`, not true — use `IS NULL` /
  `IS DISTINCT FROM`. `WHERE col <> 'x'` silently drops NULL rows. `COUNT(col)`
  ignores NULLs while `COUNT(*)` does not, and `NOT IN (subquery)` returns no rows
  if the subquery yields a single NULL. These are the most common SQL logic bugs.
- Prefer a UNIQUE constraint + `ON CONFLICT` over a `SELECT`-then-`INSERT`, which
  races (TOCTOU).

## Security and Dependency Gotchas
- **SQL Injection — CWE-89**: building a query by concatenating untrusted input lets
  an attacker alter the query's structure. ALWAYS use parameterized / prepared
  statements; the driver sends SQL and values on separate channels so input can
  never become code. (CWE-89 "Improper Neutralization of Special Elements used in an
  SQL Command ('SQL Injection')" — cwe.mitre.org.)

```sql
-- UNSAFE (application pseudocode): structure is attacker-controlled.
--   query = "SELECT * FROM users WHERE name = '" + name + "'"
--   name = "'; DROP TABLE users; --"   ->  injection

-- SAFE: parameter placeholders — the value is data, never parsed as SQL.
--   PostgreSQL/SQLite: WHERE name = $1        (or ?)
--   MySQL/SQL Server:  WHERE name = ?         (or @p1)
SELECT id, email FROM users WHERE name = $1;   -- bind: [name]
```
- **Identifiers can't be parameterized** — a table/column name chosen from user
  input must be validated against an allow-list, never interpolated. Dynamic SQL
  (PostgreSQL `format(..., %I)` / `quote_ident`) escapes identifiers safely.
- **Least privilege**: the app role should have only the DML it needs — no `DROP`,
  no superuser, no access to other schemas. A compromised query is then bounded.
- Never log full statements with bound secrets; never expose raw DB errors to
  clients (they leak schema).

## Testing Conventions
- **pgTAP** — assertion-based unit tests that run *inside* PostgreSQL (`SELECT
  has_index(...)`, `results_eq(...)`). Version-control the migrations they test.
- **dbt tests** — declarative `not_null` / `unique` / `relationships` schema tests
  for analytics models.
- **testcontainers** — spin up a real database in CI (not SQLite-as-a-stand-in) so
  dialect behavior matches production.
- **`EXPLAIN ANALYZE`** is a verification tool, not just a debugging one: assert the
  plan uses the index you expect and does not fall back to a `Seq Scan` on a large
  table. Run it in CI against representative data volumes.

## Performance Traps
- **Missing indexes** on filter and join columns → `Seq Scan`; FKs are NOT indexed
  automatically in PostgreSQL, so joins on them are slow until you add one.
- **Non-SARGable predicates**: wrapping the column in a function
  (`WHERE lower(email) = $1`, `WHERE date(created_at) = $1`) defeats a plain index —
  use a functional/expression index or restructure so the column is bare.
- **Implicit type casts** (`WHERE varchar_col = 123`) can force a cast that skips the
  index; match the parameter type to the column.
- **`SELECT *`** ships unused columns, prevents index-only scans, and couples code to
  schema order — name columns.
- **N+1** from an ORM: one query per row in a loop instead of a single join or batch
  `IN (...)` fetch. Log/count queries per request in tests to catch it.
- **`OFFSET` deep pagination** scans and discards every skipped row — use **keyset
  (seek) pagination** (`WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC,
  id DESC LIMIT n`).

## Version-Specific Gotchas (dated, sourced)
- **`MERGE`** (standard SQL upsert/merge) landed in **PostgreSQL 15** (2022); it is
  NOT available in PostgreSQL 14 or earlier — use `INSERT ... ON CONFLICT` there.
  SQL Server and Oracle have had `MERGE` for years. Name the engine before relying on
  it. [postgresql.org release notes 15.0, retrieved 2026-07-10]
- **SQL:2023** (ISO/IEC 9075:2023) is the current edition of the SQL standard; it
  adds the `JSON` data type and property-graph queries (SQL/PGQ). Engine support is
  partial and lags the standard — verify per dialect, never assume portability.
  [iso.org ISO/IEC 9075-1:2023, retrieved 2026-07-10]
- Window functions, CTEs, and `RETURNING` are widely available but differ in detail
  (MySQL got recursive CTEs in 8.0, window functions in 8.0) — pin the engine +
  version for any such claim.

## References (retrieved 2026-07-10)
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
- PostgreSQL 15 release notes (MERGE): https://www.postgresql.org/docs/release/15.0/
- PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html
- ISO/IEC 9075-1:2023 (SQL:2023): https://www.iso.org/standard/76583.html
- OWASP SQL Injection Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
