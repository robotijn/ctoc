# Presto CTO
> Interactive distributed SQL query engine for big data analytics.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name presto -p 8080:8080 prestodb/presto
presto --server localhost:8080 --catalog hive --schema default
presto --execute "SHOW CATALOGS"
```

## Non-Negotiables
1. Connector setup with proper properties
2. Query scheduling and prioritization
3. Spill to disk for memory-intensive queries
4. Session properties tuned per workload
5. Coordinator/worker sizing balanced
6. Query profiling with EXPLAIN

## Red Lines
- Cartesian joins without explicit CROSS JOIN
- Missing connector properties for optimization
- No memory limits causing cluster instability
- Large unbounded result sets to client
- Ignoring EXPLAIN output

## Pattern: Production Query Optimization
```sql
-- Session configuration for large queries
SET SESSION query_max_memory_per_node = '2GB';
SET SESSION spill_enabled = true;
SET SESSION task_concurrency = 8;

-- Efficient aggregation with proper grouping
SELECT
    date_trunc('day', created_at) AS date,
    status,
    count(*) AS order_count,
    sum(total) AS revenue
FROM hive.analytics.orders
WHERE created_at >= DATE '2024-01-01'
GROUP BY 1, 2
ORDER BY 1, 2;

-- Use EXPLAIN for query planning
EXPLAIN (TYPE DISTRIBUTED)
SELECT * FROM hive.analytics.events
WHERE event_date = '2024-01-15';

-- Approximate aggregation for large datasets
SELECT
    approx_distinct(user_id) AS unique_users,
    approx_percentile(latency, 0.99) AS p99_latency
FROM hive.analytics.requests
WHERE request_date >= DATE '2024-01-01';

-- Efficient join with partition pruning
SELECT o.id, o.total, c.name
FROM hive.analytics.orders o
JOIN hive.analytics.customers c ON o.customer_id = c.id
WHERE o.order_date >= DATE '2024-01-01'  -- Pushes filter to scan
  AND o.status = 'completed';
```

```properties
# config.properties for worker
query.max-memory=50GB
query.max-memory-per-node=4GB
query.max-total-memory-per-node=6GB
spill-enabled=true
spiller-spill-path=/tmp/presto/spill
```

## Integrates With
- **Data Lakes**: Hive, Iceberg, Delta Lake
- **Databases**: MySQL, PostgreSQL, MongoDB
- **Storage**: S3, HDFS, GCS

## Common Errors
| Error | Fix |
|-------|-----|
| `Query exceeded per-node memory limit` | Enable spill or increase limit |
| `Insufficient resources` | Check worker availability |
| `Task failed` | Review query complexity, add limits |
| `Connector error` | Verify connector configuration |

## Prod Ready
- [ ] Connectors configured for all sources
- [ ] Memory limits per node set
- [ ] Spill to disk enabled
- [ ] Resource groups for isolation
- [ ] Monitoring via JMX/Prometheus
