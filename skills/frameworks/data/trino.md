# Trino CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name trino -p 8080:8080 trinodb/trino:440
# CLI
trino --server localhost:8080 --catalog hive
```

## Claude's Common Mistakes
1. **Missing table statistics** - Cost-based optimizer needs ANALYZE
2. **Large broadcast joins** - Causes OOM; use distributed joins
3. **No resource groups** - Workloads compete without isolation
4. **Ignoring EXPLAIN** - Essential for query optimization
5. **Cross-catalog joins without planning** - Can be extremely slow

## Correct Patterns (2026)
```sql
-- Collect statistics for optimizer
ANALYZE events;
ANALYZE events SHOW STATS;

-- Set session properties for optimization
SET SESSION query_max_memory = '4GB';
SET SESSION join_distribution_type = 'AUTOMATIC';

-- Efficient query with predicate pushdown
SELECT
    date_trunc('hour', event_time) AS hour,
    event_type,
    count(*) AS event_count
FROM hive.default.events
WHERE date >= DATE '2024-01-01'  -- Partition pruning
GROUP BY 1, 2
ORDER BY 1, event_count DESC;

-- EXPLAIN ANALYZE for profiling
EXPLAIN ANALYZE
SELECT * FROM hive.default.events WHERE user_id = 12345;

-- Federated query across catalogs
SELECT o.*, c.name
FROM postgresql.public.orders o
JOIN hive.default.customers c ON o.customer_id = c.id;
```

```properties
# Catalog config: etc/catalog/hive.properties
connector.name=hive
hive.metastore.uri=thrift://metastore:9083
```

## Version Gotchas
- **v440+**: Improved query planning, better Iceberg support
- **vs Presto**: Trino is the community fork; more active development
- **Fault-tolerant execution**: Enable for long-running queries
- **Resource groups**: Essential for multi-tenant deployments

## What NOT to Do
- Do NOT query without table statistics (ANALYZE first)
- Do NOT use large broadcast joins (distributed join instead)
- Do NOT skip resource groups for production
- Do NOT ignore EXPLAIN output for slow queries

## Memory & Spill Footguns (the OOM-a-worker traps)
Trino runs queries in RAM across worker nodes; the single most common production
failure Claude writes is a query that exceeds a **per-node** memory ceiling and is
killed with `EXCEEDED_LOCAL_MEMORY_LIMIT` / `EXCEEDED_GLOBAL_MEMORY_LIMIT`. The
knobs are cluster (`config.properties`) settings, NOT session-only — Claude
frequently invents a `SET SESSION query_max_memory_per_node` that does not exist.

```properties
# etc/config.properties — cluster-wide memory ceilings (per worker JVM)
query.max-memory=50GB                 # sum across ALL workers for one query
query.max-memory-per-node=8GB         # per-worker cap; must be < JVM -Xmx headroom
memory.heap-headroom-per-node=2GB     # reserved for non-query allocations
# Spill lets a query survive when it exceeds RAM — hash aggregations, joins, sorts
spill-enabled=true
spiller-spill-path=/data0/trino/spill,/data1/trino/spill   # spread across disks
```
- **`query.max-memory-per-node` is a cluster property, not a session property.**
  The session knob is `query_max_memory` (total); you cannot raise the per-node
  cap at query time. If a single node OOMs, the fix is spill or a bigger node.
- **Spill is not free and not universal.** It covers hash joins, aggregations, and
  sorts — but NOT window functions or `DISTINCT` on high-cardinality inputs. Spill
  trades memory for disk I/O and can 10× a query's wall time; it is a safety net,
  not a performance feature. [trino.io/docs/current/admin/spill.html, retrieved
  2026-07-10]
- **Broadcast vs partitioned join distribution.** `join_distribution_type` =
  `BROADCAST` replicates the *right* table to every worker (fast only when the
  right side is genuinely small); `PARTITIONED` shuffles both sides by join key
  (survives large-vs-large). `AUTOMATIC` (the default) uses table statistics to
  choose — which is exactly why **missing `ANALYZE` stats silently force bad
  broadcast joins that OOM**. Broadcasting a table larger than
  `join_max_broadcast_table_size` (default 100MB) falls back to partitioned.

```sql
-- Force partitioned when you KNOW both sides are large and stats are stale
SET SESSION join_distribution_type = 'PARTITIONED';
SET SESSION join_reordering_strategy = 'AUTOMATIC';   -- needs ANALYZE stats
-- Dynamic filtering prunes the probe side using build-side values at runtime;
-- it is the difference between scanning a partition and scanning the whole table
SET SESSION enable_dynamic_filtering = true;
```

## Connector Pushdown & Correctness (silent full-scan and wrong-type traps)
Predicate, projection, aggregation, and `LIMIT` **pushdown** move work down into the
underlying connector (PostgreSQL, Iceberg, Hive) so Trino scans less data. When
pushdown does *not* fire, Trino pulls the whole table over the wire and filters
locally — the query is correct but catastrophically slow, with no error.

```sql
-- EXPLAIN reveals whether the filter reached the connector (look for the
-- predicate inside TableScan, not a separate ScanFilterProject above it)
EXPLAIN
SELECT * FROM postgresql.public.orders WHERE status = 'OPEN';
-- If the WHERE is NOT pushed down, wrap non-pushable expressions minimally and
-- push the sargable part; a function on the column (e.g. lower(status)) usually
-- BLOCKS pushdown — filter on the raw column instead.
```
- **Cross-catalog type coercion is a correctness footgun.** Joining a
  `postgresql` `numeric(38,0)` against a `hive` `bigint`, or a timestamp with vs
  without time zone across catalogs, can silently coerce and lose precision or
  shift by the session zone. Cast explicitly at the join boundary and pin
  `SET SESSION legacy_timestamp = false`-era semantics by using
  `timestamp(6) with time zone` deliberately.
- **`approx_distinct` is an estimate, not `COUNT(DISTINCT)`.** It uses HyperLogLog
  with a default standard error ~2.3%; never use it where an exact count is a
  business fact (billing, dedup). Its speed is the whole point — just label it.
  [trino.io/docs/current/functions/aggregate.html, retrieved 2026-07-10]

## Security — Access Control, Credentials & SQL Injection (CWE-89)
- **Parameterize every query built from user input (CWE-89).** Trino JDBC/Python
  clients support prepared statements — never string-concatenate identifiers or
  literals into SQL. [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

```python
# FOOTGUN (CWE-89): user value concatenated straight into SQL
cur.execute(f"SELECT * FROM tenant.orders WHERE user_id = {user_id}")  # injectable

# RIGHT: parameterized prepared statement — the driver escapes/binds the value
cur.execute("SELECT * FROM tenant.orders WHERE user_id = ?", (user_id,))
```
- **CVE-2026-34214 — Iceberg REST catalog credential exposure (CWE-312), fixed in
  Trino 480.** In Trino 439–479, static access keys or vended temporary
  credentials configured on an Iceberg REST catalog were readable by any user with
  SQL-level *write* privilege on that catalog. Upgrade to **≥ 480** and rotate any
  exposed keys; do not embed long-lived credentials in catalog properties — use
  vended/temporary credentials with least privilege.
  [nvd.nist.gov/vuln/detail/CVE-2026-34214, retrieved 2026-07-10]
- **Enforce access control.** Use file-based rules or Open Policy Agent (OPA) so
  catalog/schema/table grants are checked; the default `allow-all` system access
  control gives every authenticated user everything. Isolate per-catalog
  credentials so a read-only analyst catalog cannot reach a write-capable one.

## Error Handling & Query Queueing
- **Resource groups queue, they do not autoscale.** A misconfigured
  `resource-groups.json` with a low `maxQueued` / `hardConcurrencyLimit` silently
  rejects queries with `QUERY_QUEUE_FULL` under load; too-high limits let one
  tenant's query OOM the shared cluster. Size concurrency against
  `query.max-memory-per-node × workers`, not against user count.
- **Distinguish the failure classes:** `EXCEEDED_*_MEMORY_LIMIT` (raise spill or
  node size, or partition the join), `EXCEEDED_TIME_LIMIT` (`query_max_run_time`),
  `NO_NODES_AVAILABLE` (worker fell out of the cluster), and `PAGE_TRANSPORT_*`
  (network/exchange). Retry only the transient transport/node classes; memory and
  time limits are deterministic and must be re-planned, not retried.

## Testing
```sql
-- Validate pushdown & join distribution as a regression gate, not by eyeballing
EXPLAIN (TYPE DISTRIBUTED, FORMAT TEXT)
SELECT o.id, c.name
FROM postgresql.public.orders o
JOIN hive.default.customers c ON o.customer_id = c.id
WHERE o.status = 'OPEN';
-- Assert in CI: the plan contains "dynamicFilter" and the orders predicate is
-- inside the connector TableScan (pushed down), not a top-level Filter node.
```
- Keep a golden `EXPLAIN` snapshot for hot queries; a plan regression (broadcast
  where you expected partitioned, or a dropped pushdown after a stats change) is
  the earliest signal a query is about to OOM or slow down in production.

## Performance
- **`ANALYZE` first, always** — the cost-based optimizer, join reordering, and
  `AUTOMATIC` join distribution all depend on table/column stats. Stale or absent
  stats are the root cause of most "Trino picked a terrible plan" reports.
- **Partition pruning** requires the `WHERE` to reference the partition column
  directly (`date >= DATE '2026-01-01'`), not a function of it.
- **Dynamic filtering + spill + partitioned joins** are the three levers that turn
  an OOM into a slow-but-completing query; reach for them before scaling nodes.

## Version-Specific Gotchas (dated, sourced)
- **Trino 482** is the current release (published **2026-06-25**); Trino ships
  frequent numbered releases (no dotted minor). Requires **Java 24** on both
  coordinator and workers as of recent releases — pin the JDK or the coordinator
  will refuse to start. [github.com/trinodb/trino/releases/tag/482, retrieved
  2026-07-10]
- **CVE-2026-34214 fixed in 480** (see Security) — do not run 439–479 with an
  Iceberg REST catalog holding static credentials.
- **Trino is the community fork of PrestoSQL (renamed 2020).** Its SQL dialect,
  connector configs, and function library have **diverged from PrestoDB** — do not
  copy PrestoDB (`prestodb.io`) docs into a Trino deployment or vice-versa.

## References (retrieved 2026-07-10)
- Trino releases: https://github.com/trinodb/trino/releases
- Spill to disk: https://trino.io/docs/current/admin/spill.html
- Properties reference (memory/join): https://trino.io/docs/current/admin/properties.html
- Dynamic filtering: https://trino.io/docs/current/admin/dynamic-filtering.html
- Aggregate functions (approx_distinct): https://trino.io/docs/current/functions/aggregate.html
- Access control (file/OPA): https://trino.io/docs/current/security/built-in-system-access-control.html
- CVE-2026-34214 (Iceberg REST cred exposure): https://nvd.nist.gov/vuln/detail/CVE-2026-34214
- CWE-89 (SQL injection): https://cwe.mitre.org/data/definitions/89.html
- CWE-312 (cleartext storage of credentials): https://cwe.mitre.org/data/definitions/312.html
