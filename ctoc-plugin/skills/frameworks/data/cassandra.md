# Apache Cassandra CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name cassandra -p 9042:9042 cassandra:5
# Python driver
pip install cassandra-driver
```

## Claude's Common Mistakes
1. **Relational data modeling** - Model for queries, not entities (denormalize)
2. **Large partitions (>100MB)** - Causes read timeouts and memory issues
3. **Secondary indexes on high-cardinality** - Extremely slow; redesign schema
4. **SELECT * without partition key** - Full cluster scan
5. **Missing TTL on time-series** - Tombstones accumulate, kill performance

## Correct Patterns (2026)
```sql
-- Keyspace with proper replication
CREATE KEYSPACE app WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'dc1': 3
};

-- Table designed for query: "Get user's recent orders"
CREATE TABLE orders_by_user (
    user_id UUID,
    order_date TIMESTAMP,
    order_id UUID,
    total DECIMAL,
    status TEXT,
    PRIMARY KEY ((user_id), order_date, order_id)
) WITH CLUSTERING ORDER BY (order_date DESC)
  AND compaction = {
    'class': 'TimeWindowCompactionStrategy',
    'compaction_window_unit': 'DAYS',
    'compaction_window_size': 1
  }
  AND default_time_to_live = 7776000;  -- 90 days TTL

-- Denormalized table for different query pattern
CREATE TABLE orders_by_id (
    order_id UUID PRIMARY KEY,
    user_id UUID,
    order_date TIMESTAMP,
    total DECIMAL,
    status TEXT
);

-- Query WITH partition key (efficient)
SELECT * FROM orders_by_user
WHERE user_id = ? AND order_date > ?
LIMIT 20;
```

## Version Gotchas
- **v5**: Vector search support, unified nodes (no separate roles)
- **TWCS**: TimeWindowCompactionStrategy for time-series
- **Tombstones**: Delete operations create tombstones; use TTL instead
- **Astra**: DataStax managed Cassandra (serverless)

## What NOT to Do
- Do NOT model data like relational DB (model for queries)
- Do NOT create partitions >100MB (redesign partition key)
- Do NOT use secondary indexes on high-cardinality columns
- Do NOT SELECT without partition key filter (cluster scan)
