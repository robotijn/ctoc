# Snowflake CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install snowflake-connector-python snowflake-sqlalchemy
# Or for pandas integration:
pip install "snowflake-connector-python[pandas]"
```

## Claude's Common Mistakes
1. **Oversized warehouses** - Start XS, scale up only if needed
2. **ETL on BI warehouse** - Separate warehouses for ETL vs analytics
3. **48-hour query timeout** - Set STATEMENT_TIMEOUT_IN_SECONDS
4. **Missing auto-suspend** - Idle warehouses burn credits
5. **No resource monitors** - Unexpected costs without spend alerts

## Correct Patterns (2026)
```sql
-- Right-size warehouse with auto-suspend
CREATE WAREHOUSE etl_wh
  WAREHOUSE_SIZE = 'X-SMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  STATEMENT_TIMEOUT_IN_SECONDS = 3600;

-- Resource monitor with alerts
CREATE RESOURCE MONITOR monthly_budget
  WITH CREDIT_QUOTA = 1000
  TRIGGERS
    ON 75 PERCENT DO NOTIFY
    ON 90 PERCENT DO NOTIFY
    ON 100 PERCENT DO SUSPEND;

-- Efficient data loading (100-250MB files optimal)
COPY INTO raw.events
FROM @raw_stage/events/
  FILE_FORMAT = (TYPE = 'PARQUET')
  PATTERN = '.*[.]parquet'
  ON_ERROR = 'CONTINUE';

-- Clustering for large tables (>1TB)
ALTER TABLE analytics.facts CLUSTER BY (date, region);

-- Zero-copy clone for dev/test (instant, no storage cost)
CREATE DATABASE dev_db CLONE prod_db;
```

## Version Gotchas
- **Gen2 warehouses**: 67% faster DML, 56% cost reduction
- **Dynamic tables**: Auto-refreshing materialized views
- **Iceberg tables**: Native support for open table format
- **Cortex AI**: Built-in LLM functions (COMPLETE, EXTRACT, etc.)

## What NOT to Do
- Do NOT use oversized warehouses by default (start XS)
- Do NOT run ETL and BI on same warehouse
- Do NOT skip resource monitors (surprise bills)
- Do NOT forget AUTO_SUSPEND (idle credits burn)

## Cost Footguns — where credits silently burn
Snowflake bills **per-second of active warehouse time** (60-second minimum on
each resume), so idle-but-running compute and oversized warehouses are the
number-one blowup. Sizing doubles credits-per-hour at each step (XS=1, S=2, M=4,
L=8 …) — a query that finishes in half the time on the next size up costs the
**same**, but a query that does *not* halve is pure waste.

```sql
-- FOOTGUN: no AUTO_SUSPEND + no minimum → a warehouse left ON burns credits 24/7
CREATE WAREHOUSE bad_wh WAREHOUSE_SIZE = 'LARGE';   -- 8 credits/hr, forever

-- RIGHT: suspend fast, resume on demand, cap concurrency scale-out
CREATE WAREHOUSE etl_wh
  WAREHOUSE_SIZE = 'X-SMALL'         -- start small; scale UP only if profiling shows spill
  AUTO_SUSPEND = 60                  -- seconds idle before parking (min sensible value)
  AUTO_RESUME = TRUE
  MIN_CLUSTER_COUNT = 1
  MAX_CLUSTER_COUNT = 3              -- multi-cluster = concurrency, NOT single-query speed
  SCALING_POLICY = 'ECONOMY';        -- 'ECONOMY' packs queries; 'STANDARD' spins up eagerly
```

- **`SELECT *` on wide/columnar tables** defeats micro-partition column pruning and
  forces every column's blocks to be scanned — name only the columns you need.
- **Clustering keys are NOT free.** `ALTER TABLE … CLUSTER BY` enables *automatic
  clustering*, a background **serverless** service billed in credits that re-sorts
  micro-partitions continuously. On a high-churn table it can cost more than the
  queries it accelerates. Cluster only large (>1 TB), low-cardinality-prefix tables
  that are filtered/joined on the clustering key, and monitor
  `AUTOMATIC_CLUSTERING_HISTORY`.
- **Result cache vs warehouse.** The 24-hour **query result cache** returns a
  byte-identical prior result with **zero warehouse credits** — but only when the
  SQL text, underlying data, and role context match exactly; a trailing
  `current_timestamp()`, a changed role, or any base-table DML **invalidates** it.
  Do not defeat it with non-deterministic functions in otherwise-cacheable queries.
- **Spilling** to local then remote storage (visible as `BYTES_SPILLED_TO_*` in
  `QUERY_HISTORY`) means the warehouse ran out of memory — that is the real signal to
  size *up*, not a blanket default of a bigger warehouse.
  [docs.snowflake.com warehouse-considerations + cost-optimization, retrieved 2026-07-10; see References]

## Correctness — pruning, cache invalidation, time travel
```sql
-- Micro-partition pruning depends on the filter column correlating with load order.
-- FOOTGUN: filtering on a column with no natural clustering scans every partition.
SELECT * FROM events WHERE user_id = 12345;          -- no pruning if unsorted by user_id

-- RIGHT: filter on the clustered/naturally-ordered dimension (usually time) first.
SELECT amount FROM events
WHERE event_date BETWEEN '2026-06-01' AND '2026-06-30'  -- prunes to one month of partitions
  AND user_id = 12345;

-- Time Travel: default retention is 1 day (Standard); Enterprise can raise to 90.
-- Dropped/overwritten data is recoverable ONLY within DATA_RETENTION_TIME_IN_DAYS.
CREATE TABLE facts (...) DATA_RETENTION_TIME_IN_DAYS = 7;
SELECT * FROM facts AT (OFFSET => -3600);            -- state 1 hour ago
UNDROP TABLE facts;                                  -- only inside the retention window
```
- Micro-partitions are **immutable**: an `UPDATE`/`DELETE` rewrites whole
  partitions, so churny row-level DML fragments pruning and inflates storage +
  Time-Travel/Fail-safe retention. Prefer `MERGE`/batch rewrites over trickle DML.
- Retention beyond the account default is a **storage cost** (each changed
  micro-partition is retained); Fail-safe adds a further non-configurable 7 days.
  [docs.snowflake.com micro-partitions + data-time-travel, retrieved 2026-07-10]

## Security — RBAC, bind variables (CWE-89), masking
```python
import snowflake.connector

con = snowflake.connector.connect(account="…", user="…", role="ANALYST_RO")
cur = con.cursor()

# FOOTGUN: string-formatted SQL → SQL injection (CWE-89)
region = user_input
cur.execute(f"SELECT * FROM sales WHERE region = '{region}'")   # NEVER

# RIGHT: bind variables (server-side parameter binding, values never spliced into SQL)
cur.execute("SELECT * FROM sales WHERE region = %s", (region,))

# RIGHT: bind an IDENTIFIER when the *object name* itself is dynamic (not a value)
cur.execute("SELECT * FROM IDENTIFIER(%s) WHERE region = %s", (table_name, region))
```
- **CWE-89 (SQL Injection):** every user-supplied *value* goes through a
  parameter/bind (`%s` with the connector's `paramstyle`); a user-supplied
  *identifier* (table/column) goes through `IDENTIFIER(?)` or an allow-list — never
  f-string/`.format()` interpolation. [cwe.mitre.org/data/definitions/89.html,
  retrieved 2026-07-10]
- **RBAC:** privileges attach to **roles**, not users; grant the least-privilege
  role (`ANALYST_RO`) and build a role hierarchy — never operate as `ACCOUNTADMIN`
  for routine work. Future grants (`GRANT SELECT ON FUTURE TABLES IN SCHEMA …`)
  keep new objects governed.
- **Dynamic Data Masking / Row Access Policies** enforce column- and row-level
  visibility at query time by role — apply masking policies to PII columns instead
  of maintaining redacted copies. [docs.snowflake.com access-control +
  dynamic-data-masking, retrieved 2026-07-10]

## Testing — assert cost & correctness, not just rows
```sql
-- Guard against a plan regression: confirm partition pruning actually happens.
-- QUERY_HISTORY exposes partitions_scanned vs partitions_total after a run.
SELECT query_id, partitions_scanned, partitions_total, bytes_spilled_to_local_storage
FROM TABLE(information_schema.query_history_by_session())
WHERE query_text ILIKE '%events%'
ORDER BY start_time DESC LIMIT 5;   -- assert scanned << total, spilled = 0
```
- Test on a **cloned** database (`CREATE DATABASE test_db CLONE prod_db;`) —
  zero-copy, instant, no storage cost until you mutate — so tests run on real
  data shapes without touching prod.
- Assert on `partitions_scanned / partitions_total` (pruning ratio) and
  `bytes_spilled_to_*` (memory pressure), not only on result correctness — a query
  can be *right* and still be a cost regression.

## Performance
- **Right-size by profiling**, not by default: raise warehouse size only when
  `QUERY_HISTORY` shows spilling; a bigger warehouse that does not reduce wall-time
  is linear waste (credits scale with size).
- **Multi-cluster ≠ faster single query.** `MAX_CLUSTER_COUNT` adds *concurrency*
  (more queries in parallel), not speed for one heavy query — use warehouse *size*
  for that.
- **Cluster on the filter/join prefix** of your largest tables so micro-partition
  pruning does the work; verify with `SYSTEM$CLUSTERING_INFORMATION`.
- Prefer the **result cache** and **materialized/dynamic tables** for repeated
  aggregations over re-scanning base tables.

## Version-Specific Gotchas (dated, sourced)
- **`snowflake-connector-python` 4.6.0** is the current stable release, uploaded
  **2026-05-28**, `requires_python >= 3.10`. [pypi.org/pypi/snowflake-connector-python
  JSON API, retrieved 2026-07-10]
- **Gen2 standard warehouses** deliver materially faster DML/analytics at lower
  effective cost than Gen1 for many workloads — but sizing/auto-suspend economics
  are unchanged; profile before assuming a win.
- **Dynamic Tables** replace hand-rolled task+stream refresh pipelines with a
  declarative `TARGET_LAG`; **Iceberg tables** give native open-table-format storage;
  **Cortex** exposes in-warehouse LLM functions — all billed as compute, so the cost
  footguns above still apply. [docs.snowflake.com release-notes, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- snowflake-connector-python releases (PyPI JSON): https://pypi.org/pypi/snowflake-connector-python/json
- Warehouse considerations & sizing: https://docs.snowflake.com/en/user-guide/warehouses-considerations
- Cost optimization / understanding compute cost: https://docs.snowflake.com/en/user-guide/cost-understanding-compute
- Automatic clustering: https://docs.snowflake.com/en/user-guide/tables-auto-reclustering
- Micro-partitions & data clustering: https://docs.snowflake.com/en/user-guide/tables-clustering-micropartitions
- Query result cache / using persisted results: https://docs.snowflake.com/en/user-guide/querying-persisted-results
- Time Travel: https://docs.snowflake.com/en/user-guide/data-time-travel
- Access control (RBAC): https://docs.snowflake.com/en/user-guide/security-access-control-overview
- Binding data / avoiding SQL injection (connector): https://docs.snowflake.com/en/developer-guide/python-connector/python-connector-example
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
