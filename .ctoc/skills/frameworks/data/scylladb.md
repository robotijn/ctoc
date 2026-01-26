# ScyllaDB CTO
> High-performance Cassandra-compatible database with shard-per-core architecture.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name scylla -p 9042:9042 scylladb/scylla
cqlsh -e "DESCRIBE KEYSPACES"
cqlsh -f tests/queries.cql
```

## Non-Negotiables
1. All Cassandra data modeling patterns apply
2. Shard-aware drivers for optimal routing
3. Workload prioritization (OLTP vs OLAP)
4. Materialized views for secondary queries
5. Change Data Capture (CDC) for streaming
6. Compaction tuning for workload type

## Red Lines
- Non-shard-aware clients (2-4x latency penalty)
- Large partitions exceeding 100MB
- Missing compaction tuning
- Ignoring workload types configuration
- No monitoring for shard imbalance

## Pattern: Shard-Aware Access
```python
from cassandra.cluster import Cluster
from cassandra.policies import TokenAwarePolicy, DCAwareRoundRobinPolicy

# Shard-aware connection for optimal performance
cluster = Cluster(
    ['scylla1', 'scylla2', 'scylla3'],
    load_balancing_policy=TokenAwarePolicy(
        DCAwareRoundRobinPolicy(local_dc='dc1')
    ),
    protocol_version=4,
)
session = cluster.connect('app')

# Prepared statement for shard routing
insert_stmt = session.prepare("""
    INSERT INTO events (partition_id, event_time, event_id, data)
    VALUES (?, ?, ?, ?)
    USING TTL ?
""")

# Batch within same partition (efficient)
from cassandra.query import BatchStatement
batch = BatchStatement()
for event in events:
    batch.add(insert_stmt, (partition_id, event.time, event.id, event.data, 86400))
session.execute(batch)
```

```sql
-- Workload prioritization
ALTER SERVICE LEVEL oltp WITH timeout = '50ms';
ALTER SERVICE LEVEL analytics WITH timeout = '30s';

-- Materialized view for secondary access pattern
CREATE MATERIALIZED VIEW events_by_type AS
    SELECT * FROM events
    WHERE event_type IS NOT NULL AND partition_id IS NOT NULL
    PRIMARY KEY (event_type, partition_id, event_time)
WITH compaction = {'class': 'LeveledCompactionStrategy'};
```

## Integrates With
- **CDC**: Native change data capture to Kafka
- **Drivers**: Shard-aware Python, Java, Go, Rust drivers
- **Monitoring**: Prometheus, Grafana dashboards

## Common Errors
| Error | Fix |
|-------|-----|
| `Timeout` on reads | Check shard balance, optimize partition |
| `Large partition` | Redesign partition key |
| `Compaction falling behind` | Tune compaction or add nodes |
| `Overloaded` shard | Check for hot partitions |

## Prod Ready
- [ ] Shard-aware drivers configured
- [ ] Workload prioritization set
- [ ] Partition sizes monitored
- [ ] CDC enabled for streaming needs
- [ ] Monitoring via ScyllaDB Monitoring Stack
