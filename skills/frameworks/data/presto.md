# Presto CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name presto -p 8080:8080 prestodb/presto:0.287
# CLI
presto --server localhost:8080 --catalog hive
```

## Claude's Common Mistakes
1. **Confusing Presto and Trino** - Different projects since 2020 fork
2. **No spill to disk** - Large queries fail without spill enabled
3. **Missing memory limits** - Causes cluster instability
4. **Ignoring EXPLAIN** - Essential for understanding query plan
5. **Unbounded result sets** - Always use LIMIT for exploratory queries

## Correct Patterns (2026)
```sql
-- Session configuration for large queries
SET SESSION query_max_memory_per_node = '2GB';
SET SESSION spill_enabled = true;

-- Efficient aggregation with partition pruning
SELECT
    date_trunc('day', created_at) AS date,
    status,
    count(*) AS order_count,
    sum(total) AS revenue
FROM hive.analytics.orders
WHERE created_at >= DATE '2024-01-01'
GROUP BY 1, 2;

-- Use EXPLAIN for query planning
EXPLAIN (TYPE DISTRIBUTED)
SELECT * FROM hive.analytics.events WHERE event_date = '2024-01-15';

-- Approximate aggregation for large datasets
SELECT
    approx_distinct(user_id) AS unique_users,
    approx_percentile(latency, 0.99) AS p99_latency
FROM hive.analytics.requests;

-- Always LIMIT exploratory queries
SELECT * FROM large_table LIMIT 100;
```

```properties
# config.properties
query.max-memory=50GB
query.max-memory-per-node=4GB
spill-enabled=true
spiller-spill-path=/tmp/presto/spill
```

## Version Gotchas
- **Presto vs Trino**: Presto is Facebook/Meta fork; Trino is community fork
- **PrestoDB vs PrestoSQL**: PrestoSQL renamed to Trino in 2020
- **Spill to disk**: Required for queries exceeding memory
- **Velox**: Meta's new vectorized execution engine for Presto

## What NOT to Do
- Do NOT confuse Presto with Trino (different projects)
- Do NOT run without spill enabled (large query failures)
- Do NOT skip memory limits (cluster instability)
- Do NOT query without LIMIT for exploration

## PrestoDB vs Trino — DO NOT MIX DOCS (the #1 correctness trap)
PrestoDB (this guide, `prestodb.io`, Meta/Linux-Foundation) and Trino
(`trino.io`, the 2020 rename of PrestoSQL) are **separate engines with diverged
SQL, connector configs, session properties, and function libraries.** Copying a
Trino snippet into PrestoDB — or the reverse — is the most common failure Claude
produces here. Concrete divergences to watch:
- Session/property names differ (e.g. Trino's `enable_dynamic_filtering`,
  `join_max_broadcast_table_size` are Trino spellings; verify each against
  `prestodb.io/docs/current`).
- Function coverage differs; some Trino functions do not exist in PrestoDB and
  vice-versa. Type semantics (timestamp-with-time-zone handling, decimal
  coercions) have drifted between the two engines.
- **Rule:** pin the docs domain to the engine you actually run and never
  cross-reference. [prestodb.io/docs/current/overview/concepts.html, retrieved
  2026-07-10]

## Memory, Resource Groups & Join Distribution
PrestoDB executes in RAM across workers; queries die with
`EXCEEDED_LOCAL_MEMORY_LIMIT` / `EXCEEDED_GLOBAL_MEMORY_LIMIT` when they blow a
ceiling. The limits are cluster `config.properties`, not session-editable.

```properties
# etc/config.properties — cluster memory ceilings
query.max-memory=50GB                 # total across all workers per query
query.max-memory-per-node=4GB         # per-worker cap (must fit under JVM -Xmx)
query.max-total-memory-per-node=6GB   # user + system memory per worker
# Spill hash aggregations / joins / order-by to disk instead of OOMing
experimental.spill-enabled=true
experimental.spiller-spill-path=/data0/presto/spill,/data1/presto/spill
```
- **Resource groups** (`etc/resource-groups.json`) queue and cap concurrency per
  tenant. A `hardConcurrencyLimit` set too low silently queues/rejects
  (`QUERY_QUEUE_FULL`); too high lets one group OOM the shared cluster. Size
  against `query.max-memory-per-node × workers`, not user count. `softMemoryLimit`
  throttles a group before it starves others.
- **Join distribution.** `join_distribution_type` = `BROADCAST` replicates the
  right table to every worker (small right side only); `PARTITIONED` shuffles both
  sides by key (large-vs-large). `AUTOMATIC` needs table statistics — so a missing
  `ANALYZE` silently forces a broadcast that OOMs. Force `PARTITIONED` when both
  sides are large and stats are stale.

```sql
-- Session knobs are the total/broadcast controls (per-node cap is NOT session)
SET SESSION query_max_memory_per_node = '2GB';   -- guardrail only; cluster cap wins
SET SESSION join_distribution_type = 'PARTITIONED';
SET SESSION spill_enabled = true;
```

## Connector Pushdown & Correctness
- **Predicate/projection/aggregation pushdown** move filtering into the connector
  (Hive, Iceberg, MySQL) so PrestoDB scans less. When pushdown does not fire, the
  whole table streams over the wire and is filtered locally — correct but slow,
  with no error. `EXPLAIN` is the only way to see it: a filter inside `TableScan`
  is pushed down; a separate `ScanFilterProject` above it is not.
- **Wrapping a column in a function usually blocks pushdown** (`WHERE
  lower(status) = 'open'`). Filter on the raw column; normalize on the client or at
  ingest.
- **`approx_distinct` / `approx_percentile` are HyperLogLog/quantile estimates**,
  not exact — the default `approx_distinct` standard error is ~2.3%. Never use them
  where an exact value is a business fact.
  [prestodb.io/docs/current/functions/aggregate.html, retrieved 2026-07-10]

```sql
EXPLAIN (TYPE DISTRIBUTED)
SELECT * FROM hive.analytics.events WHERE event_date = DATE '2026-01-15';
-- Confirm event_date predicate reached the Hive TableScan (partition pruning),
-- not a top-level Filter node.
```

## Security — Access Control, Credentials & SQL Injection (CWE-89)
- **Parameterize all user-derived SQL (CWE-89).** Use the JDBC/Python driver's
  prepared statements; never concatenate user input into a query string.
  [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

```python
# FOOTGUN (CWE-89): interpolated user input
cur.execute(f"SELECT * FROM hive.analytics.orders WHERE user_id = {uid}")  # injectable
# RIGHT: bound parameter
cur.execute("SELECT * FROM hive.analytics.orders WHERE user_id = ?", (uid,))
```
- **Enable a real system access control** (file-based or a plugin) — the default
  allow-all authorizer grants every authenticated user full access. Isolate
  per-catalog credentials so a read-only catalog cannot reach a write-capable
  store, and keep connector credentials out of world-readable
  `catalog/*.properties`.

## Error Handling & Query Failure Classes
- `EXCEEDED_*_MEMORY_LIMIT` → raise spill or node size, or force a partitioned
  join; do NOT blind-retry (deterministic). `EXCEEDED_TIME_LIMIT` → re-plan.
  `QUERY_QUEUE_FULL` → resource-group concurrency, not a query bug.
  `NO_NODES_AVAILABLE` / `REMOTE_TASK_ERROR` → transient cluster/transport; retry
  with backoff. Always match the retry policy to the error class.
- Always `LIMIT` exploratory queries — an unbounded `SELECT *` can materialize an
  unbounded result set on the coordinator and destabilize the cluster.

## Testing
```sql
-- Golden-plan regression: snapshot the distributed plan for hot queries
EXPLAIN (TYPE DISTRIBUTED, FORMAT TEXT)
SELECT status, count(*) FROM hive.analytics.orders
WHERE created_at >= DATE '2026-01-01' GROUP BY status;
-- Assert the partition predicate is pushed to the scan and the aggregation is
-- distributed; a change to broadcast/local filtering flags a regression in CI.
```

## Performance
- `ANALYZE` tables so the cost-based optimizer and `AUTOMATIC` join distribution
  have statistics — the root cause of most bad plans.
- **Velox** is Meta's C++ vectorized execution engine (Prestissimo native
  workers); it can materially speed up scans/aggregations but is a separate
  deployment mode — benchmark before assuming a Java-worker plan transfers.
  [prestodb.io/blog + github.com/facebookincubator/velox, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **PrestoDB 0.298.1** is the current release (published **2026-06-17**); PrestoDB
  uses the `0.NNN` version line (distinct from Trino's numbered releases). Pin the
  exact `0.298.x` in your Docker tag rather than `latest`.
  [github.com/prestodb/presto/releases/tag/0.298.1, retrieved 2026-07-10]
- **PrestoSQL → Trino rename happened in 2020.** Any doc, image, or Stack Overflow
  answer referencing "PrestoSQL" after 2020 is Trino. Match your docs to the engine
  you deploy (see the "DO NOT MIX DOCS" section).

## References (retrieved 2026-07-10)
- PrestoDB releases: https://github.com/prestodb/presto/releases
- PrestoDB docs (concepts/properties): https://prestodb.io/docs/current/
- Aggregate functions (approx_distinct): https://prestodb.io/docs/current/functions/aggregate.html
- Resource groups: https://prestodb.io/docs/current/admin/resource-groups.html
- Spill to disk: https://prestodb.io/docs/current/admin/spill.html
- Velox / Prestissimo: https://github.com/facebookincubator/velox
- CWE-89 (SQL injection): https://cwe.mitre.org/data/definitions/89.html
