# ClickHouse CTO
> Claude Code correction guide. Updated January 2026.

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
