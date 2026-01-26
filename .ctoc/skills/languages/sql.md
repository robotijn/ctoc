# SQL CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
sqlfluff lint .                        # Lint
sqlfluff fix .                         # Format
pg_prove -d testdb tests/              # Test (PostgreSQL)
flyway migrate                         # Apply migrations
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **sqlfluff** - SQL linter and formatter
- **Flyway/Liquibase** - Migration management
- **pgTAP/utPLSQL** - Database testing
- **DBeaver/DataGrip** - SQL clients
- **pg_stat_statements** - Query analysis

## Project Structure
```
project/
├── migrations/        # Versioned migrations
├── functions/         # Stored procedures
├── views/             # View definitions
├── tests/             # Database tests
└── seed/              # Test/dev seed data
```

## Non-Negotiables
1. Parameterized queries always (no string concat)
2. Proper indexing on foreign keys and WHERE columns
3. Transaction boundaries for data integrity
4. Normalized unless denormalized for performance

## Red Lines (Reject PR)
- String concatenation for queries (SQL injection)
- Missing indexes on foreign keys
- SELECT * in production queries
- Unbounded queries without LIMIT
- Missing NOT NULL constraints where required
- Secrets in migration files

## Testing Strategy
- **Unit**: pgTAP/utPLSQL for functions
- **Integration**: Full query tests with test data
- **Performance**: EXPLAIN ANALYZE on critical queries

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| N+1 query problem | Use JOINs or batch fetching |
| Index not used | Check EXPLAIN, fix column order |
| Lock contention | Smaller transactions, row-level locks |
| Data type mismatch | Explicit casts, proper types |

## Performance Red Lines
- No full table scans on large tables
- No correlated subqueries in SELECT
- No functions on indexed columns in WHERE

## Security Checklist
- [ ] All queries parameterized
- [ ] Least privilege for app user
- [ ] Sensitive columns encrypted
- [ ] Audit logging on sensitive tables
