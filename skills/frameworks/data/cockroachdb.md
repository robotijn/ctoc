# CockroachDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name cockroach -p 26257:26257 -p 8080:8080 \
  cockroachdb/cockroach:v24.1 start-single-node --insecure
# PostgreSQL wire protocol
pip install psycopg  # Standard PostgreSQL driver works
```

## Claude's Common Mistakes
1. **No transaction retry logic** - Serializable isolation requires retries
2. **Sequential primary keys** - Causes hot ranges; use UUID
3. **Large transactions** - Spanning many ranges causes contention
4. **Missing locality config** - Multi-region needs explicit setup
5. **Expecting PostgreSQL behavior** - Distributed semantics differ

## Correct Patterns (2026)
```python
import psycopg
from tenacity import retry, retry_if_exception_type, stop_after_attempt

# Transaction retry decorator (REQUIRED for production)
@retry(
    retry=retry_if_exception_type(psycopg.errors.SerializationFailure),
    stop=stop_after_attempt(3)
)
def transfer_funds(conn, from_id: str, to_id: str, amount: float):
    with conn.transaction():
        conn.execute(
            "UPDATE accounts SET balance = balance - %s WHERE id = %s",
            (amount, from_id)
        )
        conn.execute(
            "UPDATE accounts SET balance = balance + %s WHERE id = %s",
            (amount, to_id)
        )
```

```sql
-- UUID primary keys (avoid hot ranges)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    region STRING NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    INDEX idx_orders_user (user_id, created_at DESC)
);

-- Multi-region locality
ALTER TABLE orders SET LOCALITY REGIONAL BY ROW AS region;

-- Changefeed for CDC
CREATE CHANGEFEED FOR TABLE orders INTO 'kafka://broker:9092';
```

## Version Gotchas
- **v24+**: Improved query optimizer, better PostgreSQL compatibility
- **Serializable**: Default isolation; requires retry handling
- **Changefeeds**: Built-in CDC to Kafka/cloud storage
- **Serverless**: CockroachDB Serverless for auto-scaling

## What NOT to Do
- Do NOT skip transaction retry logic (serialization failures)
- Do NOT use sequential primary keys (hot ranges)
- Do NOT create large transactions (span many ranges)
- Do NOT assume PostgreSQL semantics (distributed is different)

## Transaction Footguns — the 40001 retry error
CockroachDB runs **SERIALIZABLE** isolation by default. Under contention it aborts
the *loser* of a conflict with SQLSTATE **`40001` (`serialization_failure`,
class "40" — Transaction Rollback)**, surfaced as the `RETRY_*` /
`TransactionRetryWithProtoRefreshError` family. This is **not** an error — it is a
signal to **retry the whole transaction from the top**. Client code that treats
`40001` as fatal will drop writes under load.

```python
# FOOTGUN: no retry loop — under contention this 500s and loses the write
def transfer(conn, src, dst, amt):
    with conn.transaction():
        conn.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s", (amt, src))
        conn.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", (amt, dst))

# RIGHT: client-side retry loop keyed on SQLSTATE 40001, with backoff + a cap.
# The ENTIRE transaction re-runs; never retry just one statement inside an aborted txn.
import time, psycopg
def transfer(conn, src, dst, amt, max_retries=5):
    for attempt in range(max_retries):
        try:
            with conn.transaction():
                conn.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s", (amt, src))
                conn.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", (amt, dst))
            return
        except psycopg.errors.SerializationFailure:      # SQLSTATE 40001
            if attempt == max_retries - 1:
                raise
            time.sleep((2 ** attempt) * 0.1)             # exponential backoff
```
- The loser is chosen by CockroachDB's contention handling; you cannot predict it,
  so **every** SERIALIZABLE transaction needs the retry wrapper (or use a savepoint /
  `SET autocommit_before_ddl`-style helper, or the driver's built-in retry helper).
- Keep transactions **short and small** — long-running or wide-range transactions
  widen the contention window and multiply `40001` aborts.
  [cockroachlabs.com transaction-retry-error-reference, retrieved 2026-07-10]

## Performance — hot ranges & follower reads
Sequential keys (`SERIAL`, monotonically increasing timestamps) funnel every insert
to the **last range**, creating a write hotspot that no amount of nodes can shard.

```sql
-- FOOTGUN: monotonically increasing PK -> single hot range on the last split
CREATE TABLE events (id SERIAL PRIMARY KEY, ts TIMESTAMPTZ DEFAULT now());

-- RIGHT (option A): UUID PK distributes inserts across ranges
CREATE TABLE events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ts TIMESTAMPTZ DEFAULT now());

-- RIGHT (option B): keep an ordered key but HASH-SHARD it to spread the load
CREATE TABLE events (
    id INT8 PRIMARY KEY DEFAULT unique_rowid(),
    ts TIMESTAMPTZ DEFAULT now(),
    INDEX idx_ts (ts) USING HASH WITH (bucket_count = 8)   -- spreads a sequential index
);

-- Stale-but-fast reads: follower reads dodge cross-region latency + contention.
SELECT * FROM events AS OF SYSTEM TIME follower_read_timestamp() WHERE ts > now() - INTERVAL '1h';
-- or an explicit bounded-staleness read:
SELECT count(*) FROM events AS OF SYSTEM TIME '-10s';
```
- **`AS OF SYSTEM TIME`** serves reads from the nearest replica and **never blocks on
  contention** (it reads a consistent past snapshot) — ideal for dashboards/analytics
  that tolerate seconds-stale data. It does NOT reduce write contention.
- Hash-sharded indexes trade a slightly larger index for eliminating the hotspot.
  [cockroachlabs.com as-of-system-time + hash-sharded-indexes, retrieved 2026-07-10]

## Security — parameterized SQL (CWE-89) & auth
CockroachDB speaks the PostgreSQL wire protocol, so it inherits the same injection
surface: **CWE-89 "Improper Neutralization of Special Elements used in an SQL Command
('SQL Injection')"** (cwe.mitre.org/data/definitions/89.html).

```python
# VULNERABLE (CWE-89): user input interpolated into the SQL string
conn.execute(f"SELECT * FROM users WHERE email = '{email}'")   # ' OR '1'='1

# SAFE: bound parameters (%s placeholders) — value is never parsed as SQL
conn.execute("SELECT * FROM users WHERE email = %s", (email,))
```
- Always bind values via placeholders; never build SQL by concatenation. The typed
  query APIs of your driver/ORM parameterize by construction.
- Run production clusters in **secure mode** (never `--insecure` off localhost): TLS
  client-cert or password auth + `GRANT`-based RBAC on databases/tables. The
  `--insecure` flag in the Installation block above is for local single-node dev ONLY.
  [cockroachlabs.com authentication + cwe.mitre.org/89, retrieved 2026-07-10]

## Error Handling
```python
import psycopg
try:
    conn.execute("INSERT INTO users (email) VALUES (%s)", (email,))
except psycopg.errors.SerializationFailure:   # SQLSTATE 40001 -> retry the txn
    raise
except psycopg.errors.UniqueViolation:        # SQLSTATE 23505 -> handle, don't 500
    handle_duplicate(email)
```
- Branch on the **stable SQLSTATE** (`40001` retryable, `23505` unique violation,
  `40003` statement completion unknown) — never string-match the message text.
  `40001` and `40003` mean *retry the transaction*; `23xxx` are constraint errors.
  [cockroachlabs.com common-errors / transaction-retry-error-reference, retrieved 2026-07-10]

## Testing
```python
# FOOTGUN: tests against a shared cluster are slow and hide contention behavior.
# RIGHT: run integration tests against `cockroach demo` / a throwaway single-node,
#        and ASSERT the retry path actually fires on 40001.
import psycopg
def test_transfer_retries_on_40001(monkeypatch):
    calls = {"n": 0}
    def flaky_execute(*a, **k):
        calls["n"] += 1
        if calls["n"] == 1:
            raise psycopg.errors.SerializationFailure("restart transaction")  # 40001
        return None
    # ... assert transfer() retried and ultimately committed
```
- Test the **retry loop itself** (inject a `SerializationFailure`, assert it re-runs
  and commits) — the retry path is the part most likely to be wrong, and it never
  fires in low-contention unit runs unless you force it.
  [cockroachlabs.com error-handling-and-troubleshooting, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **CockroachDB v26.2.3** is the current stable release, tagged **2026-06-24** on
  GitHub (the v25.4.x line is the current LTS series). [github.com/cockroachdb/cockroach
  releases, retrieved 2026-07-10]
- **SERIALIZABLE is the default isolation**; `READ COMMITTED` is available since v23.2
  but SERIALIZABLE remains the default — the `40001` retry contract applies whenever
  SERIALIZABLE is in effect. [cockroachlabs.com transaction-retry-error-reference,
  retrieved 2026-07-10]
- **`AS OF SYSTEM TIME` / follower reads** and **hash-sharded indexes** are stable,
  production features on current releases. [cockroachlabs.com docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- CockroachDB releases (GitHub): https://github.com/cockroachdb/cockroach/releases
- Transaction retry error reference (40001): https://www.cockroachlabs.com/docs/stable/transaction-retry-error-reference
- AS OF SYSTEM TIME: https://www.cockroachlabs.com/docs/stable/as-of-system-time
- Hash-sharded indexes: https://www.cockroachlabs.com/docs/stable/hash-sharded-indexes
- Authentication: https://www.cockroachlabs.com/docs/stable/authentication
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
