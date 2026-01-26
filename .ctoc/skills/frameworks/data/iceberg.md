# Apache Iceberg CTO
> Open table format for huge analytic tables with partition evolution and time travel.

## Commands
```bash
# Setup | Dev | Test
spark-sql --packages org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.4.2
spark-sql -e "DESCRIBE EXTENDED db.table"
spark-sql -e "SELECT * FROM db.table.history"
```

## Non-Negotiables
1. Partition evolution without rewriting data
2. Hidden partitioning for query transparency
3. Schema evolution with full compatibility
4. Snapshot management and expiration
5. Compaction strategy for small files
6. Catalog integration (Hive, Glue, Nessie)

## Red Lines
- Too many small files killing performance
- Missing snapshot expiration causing metadata bloat
- No compaction strategy
- Ignoring partition specs for queries
- Large manifest files slowing planning

## Pattern: Production Iceberg Table
```sql
-- Create table with hidden partitioning
CREATE TABLE events (
    id BIGINT,
    user_id BIGINT,
    event_type STRING,
    event_time TIMESTAMP,
    properties MAP<STRING, STRING>
)
USING iceberg
PARTITIONED BY (days(event_time), bucket(16, user_id));

-- Partition evolution (no rewrite needed)
ALTER TABLE events ADD PARTITION FIELD bucket(32, user_id);
ALTER TABLE events DROP PARTITION FIELD bucket(16, user_id);

-- Schema evolution
ALTER TABLE events ADD COLUMN source STRING AFTER event_type;
ALTER TABLE events ALTER COLUMN properties TYPE MAP<STRING, STRING>;

-- Snapshot management
CALL system.expire_snapshots('db.events', TIMESTAMP '2024-01-01 00:00:00');
CALL system.remove_orphan_files('db.events');

-- Compaction
CALL system.rewrite_data_files(
    table => 'db.events',
    options => map('target-file-size-bytes', '134217728')  -- 128MB
);

-- Time travel
SELECT * FROM events VERSION AS OF 12345;
SELECT * FROM events TIMESTAMP AS OF '2024-01-15 10:00:00';

-- Incremental read
SELECT * FROM events
WHERE snapshot_id > 12345;
```

```python
# PyIceberg for programmatic access
from pyiceberg.catalog import load_catalog

catalog = load_catalog("glue", **{"type": "glue"})
table = catalog.load_table("db.events")

# Append data
table.append(df)

# Read with row-level filtering
scan = table.scan(
    row_filter="event_time >= '2024-01-01'",
    selected_fields=["id", "user_id", "event_type"]
)
df = scan.to_pandas()
```

## Integrates With
- **Compute**: Spark, Trino, Flink, Dremio, Snowflake
- **Catalogs**: Hive Metastore, AWS Glue, Nessie
- **Storage**: S3, ADLS, GCS, HDFS

## Common Errors
| Error | Fix |
|-------|-----|
| `Too many open files` | Run compaction to reduce file count |
| `Metadata too large` | Expire old snapshots |
| `Partition not found` | Check partition spec evolution |
| `Commit conflict` | Retry with optimistic concurrency |

## Prod Ready
- [ ] Snapshot expiration policy
- [ ] Compaction scheduled
- [ ] Partition spec optimized
- [ ] Catalog configured (Glue/Hive/Nessie)
- [ ] Orphan file cleanup automated
