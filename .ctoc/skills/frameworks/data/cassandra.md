# Apache Cassandra CTO
> Distributed wide-column store for massive scale with no single point of failure.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name cassandra -p 9042:9042 cassandra:4
cqlsh -e "DESCRIBE KEYSPACES"
cqlsh -f tests/queries.cql
```

## Non-Negotiables
1. Partition key design for even data distribution
2. Clustering columns for sorted data within partition
3. Data model driven by query patterns (denormalize)
4. Replication strategy: NetworkTopologyStrategy for production
5. Compaction strategy matched to workload (STCS, LCS, TWCS)
6. TTL on time-series and ephemeral data

## Red Lines
- Secondary indexes on high-cardinality columns
- Large partitions exceeding 100MB
- `SELECT *` without partition key filter
- Overuse of lightweight transactions (LWT)
- Missing TTL on time-series data

## Pattern: Query-Driven Data Modeling
```sql
-- Keyspace with proper replication
CREATE KEYSPACE app WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'dc1': 3,
  'dc2': 3
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
  AND compaction = {'class': 'TimeWindowCompactionStrategy',
                    'compaction_window_unit': 'DAYS',
                    'compaction_window_size': 1}
  AND default_time_to_live = 7776000;  -- 90 days

-- Table designed for query: "Get order by ID"
CREATE TABLE orders_by_id (
    order_id UUID PRIMARY KEY,
    user_id UUID,
    order_date TIMESTAMP,
    total DECIMAL,
    status TEXT,
    items LIST<FROZEN<item>>
);

-- Query with partition key (efficient)
SELECT * FROM orders_by_user
WHERE user_id = ? AND order_date > ?
LIMIT 20;
```

## Integrates With
- **Drivers**: DataStax drivers for Java, Python, Node.js
- **Streaming**: Kafka Connect, CDC
- **Management**: DataStax OpsCenter, Medusa for backups

## Common Errors
| Error | Fix |
|-------|-----|
| `ReadTimeout` | Check partition size, add caching |
| `WriteTimeout` | Reduce batch size, check cluster health |
| `TombstoneOverwhelmingException` | Reduce deletes, increase gc_grace_seconds |
| `Large partition warning` | Redesign partition key |

## Prod Ready
- [ ] Partition sizes under 100MB
- [ ] Replication factor >= 3
- [ ] Compaction strategy configured
- [ ] TTL on time-series tables
- [ ] Monitoring via JMX or metrics
