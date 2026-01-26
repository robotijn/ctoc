# Trino CTO
> Distributed SQL query engine for interactive analytics across data sources.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name trino -p 8080:8080 trinodb/trino
trino --server localhost:8080 --catalog hive --schema default
trino --execute "SHOW CATALOGS"
```

## Non-Negotiables
1. Connector configuration per data source
2. Memory management with JVM and query limits
3. Cost-based optimizer with table statistics
4. Resource groups for workload isolation
5. Query profiling with EXPLAIN ANALYZE
6. Spill to disk for large queries

## Red Lines
- Cross-catalog joins at scale without optimization
- Missing table/column statistics
- Large broadcast joins causing OOM
- No resource limits for queries
- Ignoring EXPLAIN output

## Pattern: Optimized Query Configuration
```sql
-- Catalog configuration (etc/catalog/hive.properties)
-- connector.name=hive
-- hive.metastore.uri=thrift://metastore:9083
-- hive.s3.path-style-access=true
-- hive.s3.endpoint=s3.amazonaws.com

-- Set session properties for query optimization
SET SESSION query_max_memory = '4GB';
SET SESSION query_max_execution_time = '30m';
SET SESSION join_distribution_type = 'AUTOMATIC';

-- Analyze tables for cost-based optimization
ANALYZE events;
ANALYZE events SHOW STATS;

-- Efficient query with predicate pushdown
SELECT
    date_trunc('hour', event_time) AS hour,
    event_type,
    count(*) AS event_count
FROM hive.default.events
WHERE date >= DATE '2024-01-01'  -- Partition pruning
  AND event_type IN ('click', 'view')
GROUP BY 1, 2
ORDER BY 1, event_count DESC;

-- EXPLAIN ANALYZE for profiling
EXPLAIN ANALYZE
SELECT * FROM hive.default.events
WHERE user_id = 12345;

-- Federated query across catalogs
SELECT o.*, c.name
FROM postgresql.public.orders o
JOIN hive.default.customers c ON o.customer_id = c.id
WHERE o.created_at > DATE '2024-01-01';
```

## Integrates With
- **Data Lakes**: Hive, Iceberg, Delta Lake, Hudi
- **Databases**: PostgreSQL, MySQL, MongoDB, Redis
- **Cloud**: S3, GCS, ADLS via connectors

## Common Errors
| Error | Fix |
|-------|-----|
| `Query exceeded memory limit` | Increase limit or enable spill |
| `No statistics for table` | Run ANALYZE on table |
| `Connector not found` | Check catalog configuration |
| `Query killed` | Review resource group limits |

## Prod Ready
- [ ] Catalogs configured for all sources
- [ ] Table statistics collected
- [ ] Resource groups for workload isolation
- [ ] Memory limits configured
- [ ] Query profiling for optimization
