# Apache Iceberg CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install pyiceberg
# Or with Spark
spark-sql --packages org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.5.0
```

## Claude's Common Mistakes
1. **Too many small files** - Run compaction regularly
2. **Missing snapshot expiration** - Metadata bloat over time
3. **Ignoring hidden partitioning** - Use partition transforms, not explicit columns
4. **No catalog integration** - Hive/Glue/Nessie required for production
5. **Large manifest files** - Slow query planning

## Correct Patterns (2026)
```sql
-- Hidden partitioning (queries don't need to know partition structure)
CREATE TABLE events (
    id BIGINT,
    user_id BIGINT,
    event_type STRING,
    event_time TIMESTAMP
) USING iceberg
PARTITIONED BY (days(event_time), bucket(16, user_id));

-- Partition evolution (no data rewrite!)
ALTER TABLE events ADD PARTITION FIELD bucket(32, user_id);
ALTER TABLE events DROP PARTITION FIELD bucket(16, user_id);

-- Compaction (target 128-256MB files)
CALL system.rewrite_data_files(
    table => 'db.events',
    options => map('target-file-size-bytes', '134217728')
);

-- Snapshot expiration (keep 7 days)
CALL system.expire_snapshots('db.events', TIMESTAMP '2024-01-01 00:00:00');
CALL system.remove_orphan_files('db.events');

-- Time travel
SELECT * FROM events VERSION AS OF 12345;
SELECT * FROM events TIMESTAMP AS OF '2024-01-15 10:00:00';
```

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog("glue")
table = catalog.load_table("db.events")
scan = table.scan(row_filter="event_time >= '2024-01-01'")
df = scan.to_pandas()
```

## Version Gotchas
- **v1.5+**: Row-level deletes, improved merge-on-read
- **Partition evolution**: Change partitioning without rewriting data
- **Catalogs**: Hive Metastore, Glue, Nessie, REST catalog
- **vs Delta**: More open ecosystem; Delta has better Databricks integration

## What NOT to Do
- Do NOT let small files accumulate (run compaction)
- Do NOT skip snapshot expiration (metadata bloat)
- Do NOT ignore hidden partitioning (use transforms)
- Do NOT forget catalog integration for production
