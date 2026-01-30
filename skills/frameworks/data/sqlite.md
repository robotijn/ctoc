# SQLite CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Built into Python, no install needed
python -c "import sqlite3; print(sqlite3.sqlite_version)"
# Node.js
npm install better-sqlite3  # Synchronous, faster
```

## Claude's Common Mistakes
1. **Missing WAL mode** - Required for concurrent reads during writes
2. **String concatenation for SQL** - SQL injection vulnerability
3. **Foreign keys not enforced** - Disabled by default; must enable
4. **Large BLOBs in database** - Store files externally, reference in DB
5. **No busy timeout** - Causes "database is locked" errors

## Correct Patterns (2026)
```python
import sqlite3

def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    # Essential PRAGMAs
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA cache_size = -64000")  # 64MB
    conn.row_factory = sqlite3.Row
    return conn

conn = get_connection("app.db")

# Parameterized query (SAFE - prevents injection)
cursor = conn.execute(
    "SELECT * FROM users WHERE email = ?",
    (email,)
)

# NEVER do this (SQL injection):
# cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")

# Efficient upsert
conn.execute("""
    INSERT INTO users (email, name) VALUES (?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name
""", (email, name))
```

## Version Gotchas
- **v3.45+**: JSON functions improved, JSONB support
- **Litestream**: Streaming replication to S3/GCS
- **LiteFS**: Distributed SQLite for Fly.io
- **Turso/D1**: Serverless edge SQLite (libSQL)

## What NOT to Do
- Do NOT skip WAL mode (concurrent access issues)
- Do NOT concatenate strings for SQL (injection)
- Do NOT forget PRAGMA foreign_keys = ON
- Do NOT store large BLOBs (use external files)
