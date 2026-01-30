# ScyllaDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name scylla -p 9042:9042 scylladb/scylla:5.4
# Uses same CQL as Cassandra
pip install scylla-driver  # Or cassandra-driver
```

## Claude's Common Mistakes
1. **Non-shard-aware drivers** - 2-4x latency penalty without token-aware routing
2. **All Cassandra anti-patterns apply** - Large partitions, wrong indexes, etc.
3. **Ignoring workload prioritization** - Mix of OLTP/OLAP needs different settings
4. **Missing shard monitoring** - Uneven shards cause hotspots
5. **Wrong compaction strategy** - Must match workload type

## Correct Patterns (2026)
```python
from cassandra.cluster import Cluster
from cassandra.policies import TokenAwarePolicy, DCAwareRoundRobinPolicy

# Shard-aware connection (CRITICAL for performance)
cluster = Cluster(
    ['scylla1', 'scylla2', 'scylla3'],
    load_balancing_policy=TokenAwarePolicy(
        DCAwareRoundRobinPolicy(local_dc='dc1')
    ),
)
session = cluster.connect('app')

# Prepared statement for optimal routing
insert_stmt = session.prepare("""
    INSERT INTO events (partition_id, event_time, event_id, data)
    VALUES (?, ?, ?, ?) USING TTL ?
""")

# Batch within SAME partition only
from cassandra.query import BatchStatement
batch = BatchStatement()
for event in events_same_partition:
    batch.add(insert_stmt, (partition_id, event.time, event.id, event.data, 86400))
session.execute(batch)
```

```sql
-- Workload prioritization
ALTER SERVICE LEVEL oltp WITH timeout = '50ms';
ALTER SERVICE LEVEL analytics WITH timeout = '30s';

-- Materialized view for secondary access
CREATE MATERIALIZED VIEW events_by_type AS
    SELECT * FROM events
    WHERE event_type IS NOT NULL
    PRIMARY KEY (event_type, partition_id, event_time);
```

## Version Gotchas
- **v5.4+**: Improved Alternator (DynamoDB compatibility)
- **vs Cassandra**: 10x better latency, same CQL
- **Shard-per-core**: Architecture requires shard-aware drivers
- **CDC**: Native change data capture to Kafka

## What NOT to Do
- Do NOT use non-shard-aware drivers (huge latency penalty)
- Do NOT batch across partitions (defeats purpose)
- Do NOT ignore shard balance monitoring
- Do NOT apply Cassandra patterns without considering shards
