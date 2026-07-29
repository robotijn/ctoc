# ClickHouse CTO
> Claude Code correction guide. Updated January 2026.

<!-- ctoc:claims
- id: clickhouse-connect-version
  kind: registry-version
  source: https://pypi.org/pypi/clickhouse-connect/json
  select: info.version
  expect: 1.6.0
  retrieved: 2026-07-30
-->

## Installation (CURRENT - January 2026)
```bash
docker run -d --name clickhouse -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server
# Client
pip install clickhouse-connect  # Python
```

## Claude's Common Mistakes
1. **Row-by-row inserts** - Batch 1000+ rows minimum; kills performance otherwise
2. **SELECT * on large tables** - Only select needed columns
3. **Wrong ORDER BY** - ORDER BY must match query filter patterns
4. **String instead of LowCardinality** - Huge memory waste for categorical data
5. **Missing partition pruning** - Always filter by partition key (date)

## Correct Patterns (2026)
```sql
-- Optimized MergeTree table
CREATE TABLE events (
    event_id UUID,
    user_id UInt64,
    event_type LowCardinality(String),  -- NOT String
    properties String,
    event_time DateTime64(3),
    date Date DEFAULT toDate(event_time)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (user_id, event_time)  -- Match query patterns
TTL date + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Materialized view for pre-aggregation
CREATE MATERIALIZED VIEW daily_stats
ENGINE = SummingMergeTree()
ORDER BY (date, event_type)
AS SELECT
    toDate(event_time) AS date,
    event_type,
    count() AS event_count,
    uniqExact(user_id) AS unique_users
FROM events
GROUP BY date, event_type;

-- Query with partition pruning (CRITICAL)
SELECT event_type, count()
FROM events
WHERE date >= today() - 7  -- Prunes partitions
  AND user_id = 12345
GROUP BY event_type;
```

## Version Gotchas
- **v24+**: Improved JOIN performance, better compression
- **Async inserts**: Use for high-throughput with eventual consistency
- **LowCardinality**: Required for string columns with <10K unique values
- **Keeper vs ZooKeeper**: ClickHouse Keeper is native and recommended

## What NOT to Do
- Do NOT insert row-by-row (batch 1000+ rows)
- Do NOT use SELECT * (select only needed columns)
- Do NOT use String for categorical data (use LowCardinality)
- Do NOT query without partition key filter (full scan)

## Engine Footguns — MergeTree choices you cannot undo cheaply
In `MergeTree`, **`ORDER BY` IS the primary (sparse) index** — it decides both
on-disk sort order and which granules can be skipped. Get it wrong and every query
does a near-full scan; changing it later means rewriting the whole table.

```sql
-- FOOTGUN: ORDER BY that does not lead with the columns you filter on → no skipping
CREATE TABLE bad (user_id UInt64, event_time DateTime, ...)
ENGINE = MergeTree ORDER BY (event_time);   -- filtering by user_id scans everything

-- RIGHT: lead ORDER BY with the highest-selectivity equality filter, then time
CREATE TABLE events (
    user_id UInt64,
    event_type LowCardinality(String),
    event_time DateTime64(3),
    date Date DEFAULT toDate(event_time)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(date)         -- MONTHLY, not daily → keep part count sane
ORDER BY (user_id, event_time)      -- = the primary index: filter prefix first
SETTINGS index_granularity = 8192;
```

- **`PARTITION BY` cardinality explosion.** Partitions are a coarse
  data-management unit (drop/TTL/merge boundary), **not** a query index. Partition by
  month (`toYYYYMM`), not by a high-cardinality key or by day-times-tenant — thousands
  of tiny parts wreck merges, inflate open file handles, and trigger the
  `too_many_parts` error. The `ORDER BY` key does the intra-partition skipping.
- **`ReplacingMergeTree` dedup is ASYNCHRONOUS.** Duplicates are collapsed only when
  background merges eventually run — there is **no** point at which a plain
  `SELECT` is guaranteed deduplicated. `SELECT … FINAL` forces the merge-on-read but
  is expensive (reads and merges all matching parts per query); prefer aggregating
  with `argMax`/`GROUP BY` or accept eventual dedup rather than sprinkling `FINAL`.
- **Mutations (`ALTER TABLE … UPDATE/DELETE`) are async and rewrite whole parts.**
  They are heavyweight background operations, not OLTP row edits — track them in
  `system.mutations` and design for append-only + `ReplacingMergeTree`/TTL instead of
  frequent mutations. Lightweight `DELETE` masks rows but the data is reclaimed only
  on merge.
- **Async vs sync inserts.** `async_insert=1` batches many small server-side inserts
  (great for many concurrent tiny writers) but acknowledgement is *eventual* unless
  `wait_for_async_insert=1`; a client that assumes durable-on-return can lose the last
  buffer on crash. For your own pipeline, batch 10k–100k rows per sync insert instead.
  [clickhouse.com/docs MergeTree + async-inserts, retrieved 2026-07-10; see References]

## Correctness — eventual merges & memory limits
```sql
-- Eventual consistency: counts can transiently exceed reality until merges collapse dups.
-- Force a correct read at query time (costly) …
SELECT count() FROM events FINAL WHERE date = today();
-- … or model idempotently so you never need FINAL:
SELECT user_id, argMax(status, event_time) AS latest_status
FROM events GROUP BY user_id;               -- deterministic without FINAL

-- Memory: a heavy GROUP BY / JOIN can blow the server without a cap.
SELECT event_type, uniqExact(user_id)
FROM events GROUP BY event_type
SETTINGS max_memory_usage = 8000000000,     -- 8 GB hard cap for THIS query
         max_bytes_before_external_group_by = 4000000000;  -- spill to disk past 4 GB
```
- Set `max_memory_usage` (per-query) and `max_bytes_before_external_group_by` so a
  runaway aggregation spills to disk instead of OOM-killing the server. Large JOINs
  benefit from `join_algorithm='grace_hash'` to bound memory.
- Merges are eventual: any invariant that depends on "no duplicates / final value"
  must use `FINAL`, an aggregating engine, or `argMax`-style query-time resolution.
  [clickhouse.com/docs settings/query-complexity, retrieved 2026-07-10]

## Security — parameterized queries (CWE-89) & quotas
```python
import clickhouse_connect
client = clickhouse_connect.get_client(host="…", username="ro_user")

# FOOTGUN: f-string interpolation → SQL injection (CWE-89)
etype = user_input
client.query(f"SELECT count() FROM events WHERE event_type = '{etype}'")   # NEVER

# RIGHT: server-side parameter binding ({name:Type} placeholders)
client.query(
    "SELECT count() FROM events WHERE event_type = {etype:String}",
    parameters={"etype": etype},
)
```
- **CWE-89 (SQL Injection):** use `clickhouse-connect`'s `{name:Type}` bound
  parameters (or the HTTP `param_*` interface) — never build SQL by string
  concatenation of user input. [cwe.mitre.org/data/definitions/89.html, retrieved
  2026-07-10]
- **RBAC + quotas:** create least-privilege users with `GRANT SELECT ON db.* TO
  ro_user`; bound each user with a **quota** (`CREATE QUOTA … FOR INTERVAL 1 hour
  MAX queries = 1000, result_rows = 1e9`) and per-user `max_memory_usage` /
  `max_execution_time` settings-profiles so one client cannot exhaust the cluster.
  [clickhouse.com/docs access-rights + quotas, retrieved 2026-07-10]

## Testing — assert on parts, pruning and dedup
```sql
-- Confirm partitioning didn't explode into thousands of tiny parts.
SELECT table, count() AS parts, sum(rows) AS rows
FROM system.parts WHERE active AND table = 'events' GROUP BY table;  -- parts should be small

-- Confirm a filter actually prunes granules (read_rows << total rows).
EXPLAIN indexes = 1
SELECT count() FROM events WHERE user_id = 12345 AND date = today();
```
- Assert the **active part count** stays bounded (partition/`ORDER BY` sanity) and
  that `EXPLAIN indexes = 1` shows granules being skipped — a structural regression
  (wrong `ORDER BY`/partition) is invisible in row-level result tests.
- For `ReplacingMergeTree`, test dedup via `OPTIMIZE TABLE … FINAL` in the test
  harness (forces the merge) rather than assuming background merges ran.

## Performance
- **Batch inserts (10k–100k rows)**; row-by-row inserts create a part per insert and
  overwhelm the merge scheduler (`too_many_parts`).
- **`LowCardinality(String)`** for categorical columns (<~10k distinct) cuts memory
  and speeds `GROUP BY`; plain `String` for the same data is a large waste.
- **Materialized views** (`SummingMergeTree`/`AggregatingMergeTree`) pre-aggregate on
  insert so dashboards read small tables.
- **Projections** give a table an alternate sort order for a different query pattern
  without a second table.

## Version-Specific Gotchas (dated, sourced)
- **`clickhouse-connect` 1.4.2** is the current stable Python driver, uploaded
  **2026-07-06**, `requires_python >=3.10,<3.15`. [pypi.org/pypi/clickhouse-connect
  JSON API, retrieved 2026-07-10]
- **ClickHouse server**: the current **LTS** line is **`v25.8.x-lts`** (latest tag
  `v25.8.28.1-lts`, 2026-07-05) and the current fast **stable** line is **`v26.5/26.6`**
  — pin to an LTS for production stability; `-stable` moves fast.
  [github.com/ClickHouse/ClickHouse/releases, retrieved 2026-07-10]
- **ClickHouse Keeper** (native, replacing ZooKeeper) is the recommended coordinator
  for replicated tables; **async inserts** and **grace-hash JOINs** are mature but
  keep the eventual-ack / memory caveats above. [clickhouse.com/docs, retrieved
  2026-07-10]

## References (retrieved 2026-07-10)
- clickhouse-connect releases (PyPI JSON): https://pypi.org/pypi/clickhouse-connect/json
- ClickHouse server releases: https://github.com/ClickHouse/ClickHouse/releases
- MergeTree engine & primary key: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree
- ReplacingMergeTree / FINAL: https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree
- Mutations (ALTER UPDATE/DELETE): https://clickhouse.com/docs/sql-reference/statements/alter#mutations
- Asynchronous inserts: https://clickhouse.com/docs/optimize/asynchronous-inserts
- Query complexity / memory settings: https://clickhouse.com/docs/operations/settings/query-complexity
- Parameterized queries (clickhouse-connect): https://clickhouse.com/docs/integrations/python#querying-data
- Access rights & quotas: https://clickhouse.com/docs/operations/access-rights
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
