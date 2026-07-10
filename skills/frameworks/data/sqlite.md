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

## Concurrency Footguns (single-writer, SQLITE_BUSY, WAL)
SQLite allows many concurrent readers but **exactly one writer at a time**, database-wide.
A second writer that cannot immediately acquire the write lock gets `SQLITE_BUSY`
("database is locked") — not a queue, an *error* — unless you have set a busy timeout.

```python
# FOOTGUN: default rollback journal + no busy_timeout -> writers collide with SQLITE_BUSY
conn = sqlite3.connect("app.db")          # journal_mode=DELETE, busy_timeout=0
conn.execute("BEGIN")                      # a concurrent writer now raises:
# sqlite3.OperationalError: database is locked   (SQLITE_BUSY)

# RIGHT: WAL lets readers proceed during a write; busy_timeout blocks-then-retries
conn = sqlite3.connect("app.db", timeout=5.0)   # Python maps timeout -> busy_timeout
conn.execute("PRAGMA journal_mode = WAL")       # readers don't block the single writer
conn.execute("PRAGMA busy_timeout = 5000")      # wait up to 5s for the write lock
conn.execute("PRAGMA synchronous = NORMAL")     # safe with WAL; fewer fsyncs
```
- **One writer, period.** WAL removes reader/writer *blocking*, but two concurrent
  writers still serialize — the loser gets `SQLITE_BUSY` when `busy_timeout` expires.
  Keep write transactions short; do not hold a `BEGIN` open across slow work.
- **WAL is not free**: the `-wal` and `-shm` sidecar files must live on the SAME
  filesystem as the DB, and WAL **does not work over a network filesystem** (NFS/SMB)
  — the shared-memory index breaks. Local disk only.
- **`BEGIN IMMEDIATE`** for a read-then-write transaction: a deferred `BEGIN` takes the
  write lock only at the first write, so it can hit `SQLITE_BUSY` *mid-transaction*
  after you've already read. `BEGIN IMMEDIATE` grabs the write lock up front.
  [sqlite.org/wal.html + sqlite.org/lang_transaction.html, retrieved 2026-07-10]

## Correctness — type affinity, STRICT tables, AUTOINCREMENT
SQLite is **dynamically typed**: a column's declared type is only an *affinity*, a
hint — you can store a string in an `INTEGER` column and it stays a string. This is
the single most surprising SQLite behavior for people coming from Postgres/MySQL.

```sql
-- FOOTGUN: type affinity does NOT enforce types
CREATE TABLE t (n INTEGER, amount REAL);
INSERT INTO t VALUES ('not a number', 'oops');   -- succeeds; stored as TEXT
SELECT typeof(n) FROM t;                          -- 'text', not 'integer'

-- RIGHT: STRICT tables enforce the declared type (SQLite 3.37+, 2021-11-27)
CREATE TABLE t (n INTEGER, amount REAL) STRICT;
INSERT INTO t VALUES ('not a number', 1.0);       -- ERROR: cannot store TEXT in INTEGER

-- AUTOINCREMENT footgun: rarely needed and it costs. A plain INTEGER PRIMARY KEY is
-- ALREADY an auto-assigning rowid alias. AUTOINCREMENT only adds a monotonic-never-
-- reuse guarantee (a sqlite_sequence lookup on every insert) -- omit it unless you
-- specifically need rowids to never be reused after a delete.
CREATE TABLE u (id INTEGER PRIMARY KEY, email TEXT);       -- RIGHT: auto rowid, no cost
CREATE TABLE u (id INTEGER PRIMARY KEY AUTOINCREMENT, ...); -- only if reuse must not happen
```
- **`PRAGMA foreign_keys = ON` is per-connection and defaults OFF** — a FK constraint
  in your schema is silently NOT enforced unless every connection turns it on. STRICT
  tables do not change this; it is a separate pragma.
  [sqlite.org/stricttables.html + sqlite.org/autoinc.html + sqlite.org/foreignkeys.html,
  retrieved 2026-07-10]

## Security — SQL injection (CWE-89)
Building SQL by concatenating user input is **CWE-89 "Improper Neutralization of
Special Elements used in an SQL Command ('SQL Injection')"** (cwe.mitre.org/89).
`sqlite3` supports `?` positional and `:name` named parameters — always use them.

```python
# VULNERABLE (CWE-89): f-string interpolates raw input into the SQL text
email = "x' OR '1'='1"
conn.execute(f"SELECT * FROM users WHERE email = '{email}'")   # returns EVERY row

# SAFE: ? placeholder — the value is bound, never parsed as SQL
conn.execute("SELECT * FROM users WHERE email = ?", (email,))

# SAFE named form
conn.execute("SELECT * FROM users WHERE email = :email", {"email": email})

# NOTE: placeholders bind VALUES, not identifiers. A dynamic table/column name cannot
# be a "?"; validate it against an allow-list, never interpolate user input into DDL.
```
- The stdlib `executescript()` runs multiple statements and does **not** accept
  parameters — never feed it user input. `execute()` also rejects multiple statements,
  which is itself a defense against classic stacked-query injection.
  [docs.python.org/3/library/sqlite3.html#sqlite3-placeholders +
  cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

## Testing
```python
# FOOTGUN: sharing one file DB (or one connection) across threads -> lock contention
#          and "SQLite objects created in a thread can only be used in that same thread".
# RIGHT: an in-memory database per test is fast, isolated, and thrown away.
import sqlite3

def make_test_db():
    conn = sqlite3.connect(":memory:")          # fresh, isolated per test
    conn.execute("PRAGMA foreign_keys = ON")     # FKs are OFF by default -- turn ON to test them
    conn.executescript(open("schema.sql").read())
    return conn

def test_unique_email_rejected():
    conn = make_test_db()
    conn.execute("INSERT INTO users(email) VALUES (?)", ("a@b.com",))
    # assert the constraint fires, not a message string
    try:
        conn.execute("INSERT INTO users(email) VALUES (?)", ("a@b.com",))
        assert False, "expected UNIQUE violation"
    except sqlite3.IntegrityError:
        pass
```
- A `:memory:` DB is per-connection; to share one across connections in a test use
  `file::memory:?cache=shared` with `uri=True`. Assert on `sqlite3.IntegrityError` /
  `OperationalError`, never on the human-readable message.
  [docs.python.org/3/library/sqlite3.html, retrieved 2026-07-10]

## Performance
- **WAL checkpointing**: the `-wal` file grows until a checkpoint folds it back into
  the main DB. Under sustained writes it can grow unbounded; tune
  `PRAGMA wal_autocheckpoint` (pages) or run `PRAGMA wal_checkpoint(TRUNCATE)`.
- **`synchronous = NORMAL`** is safe *with WAL* and far faster than `FULL` (fewer
  fsyncs); with the default rollback journal, `NORMAL` risks corruption on power loss.
- **Index the columns you filter/join on** — SQLite has no auto-indexing; a missing
  index turns into a full table scan (check with `EXPLAIN QUERY PLAN`). A negative
  `PRAGMA cache_size` sets the page cache in KiB (e.g. `-64000` = 64 MiB).
  [sqlite.org/wal.html + sqlite.org/pragma.html, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **SQLite 3.53.3** is the current release, dated **2026-06-26**. SQLite is famously
  backward-compatible; the file format has been stable since 3.0.0 (2004).
  [sqlite.org/releaselog/3_53_3.html, retrieved 2026-07-10]
- **STRICT tables** (type enforcement) require **SQLite 3.37.0** (released
  2021-11-27) or newer. [sqlite.org/stricttables.html, retrieved 2026-07-10]
- **JSONB** functions and the improved JSON suite arrived in **3.45.0** (2024-01-15);
  earlier versions only have the text `json_*` functions.
  [sqlite.org/json1.html, retrieved 2026-07-10]
- Injection behavior is stable: parameter placeholders (`?`, `:name`) bind values;
  string-built SQL is CWE-89 regardless of version.
  [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- SQLite release log 3.53.3: https://www.sqlite.org/releaselog/3_53_3.html
- Write-Ahead Logging (WAL): https://www.sqlite.org/wal.html
- STRICT tables: https://www.sqlite.org/stricttables.html
- Datatypes / type affinity: https://www.sqlite.org/datatype3.html
- AUTOINCREMENT: https://www.sqlite.org/autoinc.html
- Foreign key support: https://www.sqlite.org/foreignkeys.html
- Transactions (BEGIN IMMEDIATE): https://www.sqlite.org/lang_transaction.html
- PRAGMA reference: https://www.sqlite.org/pragma.html
- Python sqlite3 placeholders: https://docs.python.org/3/library/sqlite3.html#sqlite3-placeholders
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
