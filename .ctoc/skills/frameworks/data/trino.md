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
