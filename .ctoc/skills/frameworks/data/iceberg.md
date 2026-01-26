# Apache Iceberg CTO
> Open table format for analytics.

## Non-Negotiables
1. Partition evolution
2. Hidden partitioning
3. Schema evolution
4. Snapshot management
5. Compaction strategy

## Red Lines
- Too many small files
- Missing expiration
- No compaction
- Ignoring partition specs
- Large manifests

## Pattern
```sql
ALTER TABLE db.table
ADD PARTITION FIELD bucket(16, user_id);

CALL system.expire_snapshots('db.table', TIMESTAMP '2024-01-01');
```
