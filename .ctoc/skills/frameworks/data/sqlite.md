# SQLite CTO
> Embedded SQL database engine for local-first and edge applications.

## Commands
```bash
# Setup | Dev | Test
sqlite3 app.db ".databases"
sqlite3 app.db ".read schema.sql"
sqlite3 app.db "PRAGMA integrity_check"
```

## Non-Negotiables
1. WAL mode for concurrent reads during writes
2. Proper indexes on query predicates
3. PRAGMA optimizations for workload
4. Parameterized queries (never string concatenation)
5. Backup strategy with `.backup` command
6. Foreign key enforcement enabled

## Red Lines
- String concatenation for SQL (injection risk)
- Missing WAL mode for concurrent access
- Disabled foreign key enforcement
- Large BLOBs stored in database (use external files)
- Concurrent writers without proper handling

## Pattern: Production Configuration
```sql
-- Essential PRAGMAs for production
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA cache_size = -64000;  -- 64MB cache
PRAGMA temp_store = MEMORY;

-- Create table with proper constraints
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    CHECK (length(email) > 0)
);

CREATE INDEX idx_users_email ON users(email);

-- Efficient upsert
INSERT INTO users (email, name)
VALUES (?, ?)
ON CONFLICT(email) DO UPDATE SET name = excluded.name;

-- Backup to file
.backup main backup.db
```

```python
import sqlite3

def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.row_factory = sqlite3.Row
    return conn

# Parameterized query (safe)
cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
```

## Integrates With
- **Languages**: Native support in Python, Node.js, Ruby, Go
- **Sync**: Litestream for replication, LiteFS for distributed
- **Edge**: Cloudflare D1, Turso for serverless

## Common Errors
| Error | Fix |
|-------|-----|
| `database is locked` | Enable WAL mode, increase busy_timeout |
| `SQLITE_CONSTRAINT` | Check unique constraints, foreign keys |
| `disk I/O error` | Check disk space, file permissions |
| `database disk image is malformed` | Restore from backup |

## Prod Ready
- [ ] WAL mode enabled
- [ ] Foreign keys enforced
- [ ] Indexes on all query predicates
- [ ] Backup automation configured
- [ ] Integrity checks scheduled
