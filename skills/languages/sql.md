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
