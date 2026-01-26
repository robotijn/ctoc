# SQLite CTO
> Embedded relational database.

## Non-Negotiables
1. WAL mode for concurrency
2. Proper indexes
3. PRAGMA optimizations
4. Parameterized queries
5. Backup strategy

## Red Lines
- String concatenation for SQL
- Missing WAL mode
- No foreign key enforcement
- Large BLOBs in database
- Concurrent writers without handling

## Pattern
```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```
