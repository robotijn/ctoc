# ClickHouse CTO
> Real-time analytics database for sub-second queries on billions of rows.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name clickhouse -p 8123:8123 clickhouse/clickhouse-server
clickhouse-client -q "SELECT version()"
clickhouse-client --queries-file tests/queries.sql
```

## Non-Negotiables
1. MergeTree family engines for analytics tables
2. Partition by time (day/month) for efficient pruning
3. ORDER BY aligned with query filter patterns
4. Batch inserts (1000+ rows minimum)
5. Materialized views for pre-aggregated data
6. Appropriate data types (LowCardinality for strings)

## Red Lines
- Row-by-row inserts (kills performance)
- SELECT * on large tables
- Missing ORDER BY causing full scans
- Joins without distributed table awareness
- No partition pruning in queries

## Pattern: Optimized Analytics Table
```sql
-- Main events table with proper engine
CREATE TABLE events (
    event_id UUID,
    user_id UInt64,
    event_type LowCardinality(String),
    properties String,  -- JSON
    event_time DateTime64(3),
    date Date DEFAULT toDate(event_time)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (user_id, event_time)
TTL date + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Materialized view for real-time aggregation
CREATE MATERIALIZED VIEW daily_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, event_type)
AS SELECT
    toDate(event_time) AS date,
    event_type,
    count() AS event_count,
    uniqExact(user_id) AS unique_users
FROM events
GROUP BY date, event_type;

-- Efficient query with partition pruning
SELECT event_type, count()
FROM events
WHERE date >= today() - 7
  AND user_id = 12345
GROUP BY event_type;
```

## Integrates With
- **Ingestion**: Kafka, S3, HTTP interface
- **BI**: Grafana, Metabase, Superset
- **Replication**: ClickHouse Keeper, ZooKeeper

## Common Errors
| Error | Fix |
|-------|-----|
| `Memory limit exceeded` | Add `max_memory_usage` setting |
| `Too many parts` | Increase merge settings or batch larger |
| `Distributed query slow` | Check `distributed_product_mode` |
| `Insert timeout` | Use async inserts or batch larger |

## Prod Ready
- [ ] MergeTree with proper ORDER BY
- [ ] Partitioning aligned with query patterns
- [ ] Batch inserts configured
- [ ] Materialized views for dashboards
- [ ] TTL and compression policies
