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
