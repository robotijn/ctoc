# Apache Cassandra CTO
> Distributed wide-column store.

## Non-Negotiables
1. Partition key design
2. Clustering columns
3. Data modeling by query
4. Replication strategy
5. Compaction tuning

## Red Lines
- Secondary indexes on high cardinality
- Large partitions (>100MB)
- SELECT * without partition key
- Lightweight transactions overuse
- Missing TTL on time-series
