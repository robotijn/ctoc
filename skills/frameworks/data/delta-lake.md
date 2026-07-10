# Delta Lake CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install delta-spark
# Or with Spark
pyspark --packages io.delta:delta-spark_2.12:3.1.0
```

## Claude's Common Mistakes
1. **No VACUUM policy** - Old files accumulate, storage bloats
2. **Missing OPTIMIZE** - Small files kill read performance
3. **Wrong Z-ORDER columns** - Should match common filter patterns
4. **Schema enforcement disabled** - Causes silent data corruption
5. **No partitioning strategy** - Large tables need partitioning

## Correct Patterns (2026)
```python
from delta import DeltaTable
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

# Write with partitioning
df.write.format("delta") \
    .mode("overwrite") \
    .partitionBy("date") \
    .save("s3://bucket/events")

# OPTIMIZE + Z-ORDER (run periodically)
spark.sql("""
    OPTIMIZE delta.`s3://bucket/events`
    ZORDER BY (user_id, event_type)
""")

# VACUUM old files (retain 7 days minimum)
spark.sql("VACUUM delta.`s3://bucket/events` RETAIN 168 HOURS")

# Merge (upsert) pattern
deltaTable = DeltaTable.forPath(spark, "s3://bucket/events")
deltaTable.alias("target").merge(
    updates.alias("source"),
    "target.id = source.id"
).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()

# Time travel
df_v5 = spark.read.format("delta").option("versionAsOf", 5).load("s3://bucket/events")
```

## Version Gotchas
- **v3.0+**: Liquid clustering (replaces Z-ORDER), deletion vectors
- **UniForm**: Cross-compatibility with Iceberg and Hudi readers
- **Photon**: Databricks-only vectorized engine
- **Unity Catalog**: Managed governance for Delta tables

## What NOT to Do
- Do NOT skip VACUUM (storage bloat)
- Do NOT forget OPTIMIZE (small file problem)
- Do NOT Z-ORDER on high-cardinality columns only
- Do NOT disable schema enforcement in production

## Table Footguns (transaction log · VACUUM retention · OPTIMIZE · MERGE)
Every Delta table is a set of Parquet files plus a **`_delta_log/`** directory of
ordered JSON commits (+ periodic `.checkpoint.parquet`). Reads reconstruct state from
that log — so anything that deletes files the log still references breaks readers.

```python
# THE DATA-LOSS FOOTGUN: VACUUM below the retention window.
# VACUUM physically deletes data files no longer referenced by the CURRENT version.
# Files needed for TIME-TRAVEL / in-flight readers are only protected within the
# retention window (default 168h = 7 days). RETAIN 0 HOURS permanently destroys
# every older version AND can delete files a concurrent long reader is still using.
spark.sql("VACUUM delta.`s3://bucket/events` RETAIN 168 HOURS")   # >= retention floor

# Delta REFUSES RETAIN below the configured minimum unless you deliberately disable
# the guard — treat this override as the loaded gun it is:
#   SET spark.databricks.delta.retentionDurationCheck.enabled = false   # DO NOT do this casually
# The retention floor itself is a table property:
spark.sql("""
  ALTER TABLE delta.`s3://bucket/events`
  SET TBLPROPERTIES ('delta.deletedFileRetentionDuration' = 'interval 7 days',
                     'delta.logRetentionDuration'         = 'interval 30 days')
""")

# OPTIMIZE bin-packs small files; ZORDER co-locates by common filter columns.
# Run periodically — after OPTIMIZE the OLD small files become vacuum candidates.
spark.sql("OPTIMIZE delta.`s3://bucket/events` ZORDER BY (user_id, event_type)")
```

- **`_delta_log` + checkpoints**: never hand-edit or delete log JSON. `logRetentionDuration`
  controls how long the log (and thus time-travel) is kept; a checkpoint every 10
  commits lets readers skip replaying the whole log. Deleting checkpoints forces full
  log replay and can corrupt time-travel.
- **VACUUM vs. time-travel invariant**: you can only time-travel back as far as *both*
  the log is retained *and* the data files survive VACUUM. Vacuuming with a short
  retention silently amputates your history — a classic "the auditor asked for last
  quarter and it's gone" incident.
- **Schema evolution**: `mergeSchema=true` on write ADDS new columns automatically —
  convenient, but it also lets a typo'd column name silently create a new column
  instead of failing. Use `overwriteSchema` deliberately; keep enforcement on so a
  wrong-type write raises instead of corrupting.
- **MERGE dedup**: an unqualified `whenMatchedUpdateAll` with a non-unique source key
  raises or non-deterministically picks a row — dedup the source (window + row_number)
  before MERGE, and add a partition predicate to the ON clause to prune files.

## Concurrency (optimistic conflict detection on the log)
Delta uses **optimistic concurrency**: each writer reads a snapshot version, does its
work, then atomically appends the next log commit. If another writer committed first,
Delta checks for a real conflict and throws if the two changes are incompatible.

```python
from delta.exceptions import ConcurrentAppendException, ConcurrentDeleteReadException

for attempt in range(5):
    try:
        deltaTable.merge(source, "t.id = s.id AND t.date = s.date") \
            .whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
        break
    except ConcurrentAppendException:
        continue          # re-read snapshot and retry; do NOT swallow silently forever
```

- Two blind appends to disjoint files succeed; two writers touching the same files, or
  a MERGE + concurrent DELETE, raise `ConcurrentAppendException` /
  `ConcurrentDeleteReadException`. **Add partition predicates to your ON clause** so
  Delta scopes the conflict check to touched partitions — otherwise every writer
  conflicts with every other.
- The transaction log gives serializable/write-serializable isolation *on a single
  table*; there are no cross-table transactions.

## Security (storage credentials · column-level controls)
- Prefer **credential passthrough / instance profiles** (or Unity Catalog storage
  credentials) over embedding cloud keys in the SparkSession — those keys leak into
  event logs and the Spark UI.
- Column masking / row filtering are **governance-layer** features (Unity Catalog),
  not part of the open Delta protocol — do not assume `_delta_log` enforces access
  control; the storage ACLs and catalog do.
- Restrict who can flip `retentionDurationCheck.enabled` or run `VACUUM RETAIN 0` —
  it is an irreversible-delete privilege.

## Testing
```python
def test_vacuum_respects_time_travel(spark, table_path):
    _overwrite(spark, table_path, v="a")     # version 0
    _overwrite(spark, table_path, v="b")     # version 1
    # A vacuum WITHIN retention must NOT destroy version 0 time-travel:
    spark.sql(f"VACUUM delta.`{table_path}` RETAIN 168 HOURS")
    v0 = spark.read.format("delta").option("versionAsOf", 0).load(table_path)
    assert v0.collect()[0]["v"] == "a"       # history intact
```
- Test the **retention invariant** explicitly (time-travel survives a legal VACUUM),
  and test that a concurrent-write path retries rather than swallowing the conflict.
  Assert on `versionAsOf` reads, not just the latest snapshot.

## Performance
- Run **OPTIMIZE** to bin-pack small files (the MERGE/streaming small-file problem),
  then VACUUM the orphaned smalls after the retention window. ZORDER only on the
  columns you actually filter on; ZORDER on high-cardinality-only columns wastes work.
- **Deletion vectors** (`delta.enableDeletionVectors`) turn deletes/updates into
  merge-on-read (mark rows deleted instead of rewriting files) — big write speedup,
  but reads must apply the vectors, so schedule OPTIMIZE to reclaim.

## Version-Specific Gotchas (dated, sourced)
- **delta-spark 4.3.1** is the current stable Python release, uploaded
  **2026-07-08**, `requires_python >=3.10`; it targets Spark 4.x. Pin the
  `io.delta:delta-spark_2.13:4.3.1` package to your Spark line (Delta 3.x for Spark
  3.5, Delta 4.x for Spark 4.x) — a mismatch fails at session init.
  [pypi.org/pypi/delta-spark/json, retrieved 2026-07-10]
- **Delta Lake 4.3.1** (delta-io/delta) was published **2026-07-08**.
  [github.com/delta-io/delta/releases (v4.3.1), retrieved 2026-07-10]
- v3.0+ introduced **deletion vectors** and **liquid clustering** (an alternative to
  static ZORDER); **UniForm** exposes a Delta table to Iceberg/Hudi readers. These are
  opt-in table properties, not automatic.
  [delta.io/blog + docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- delta-spark releases (PyPI JSON): https://pypi.org/pypi/delta-spark/json
- Delta Lake releases: https://github.com/delta-io/delta/releases
- VACUUM & retention: https://docs.delta.io/latest/delta-utility.html
- OPTIMIZE / Z-ORDER / clustering: https://docs.delta.io/latest/optimizations-oss.html
- Concurrency control & conflict exceptions: https://docs.delta.io/latest/concurrency-control.html
- Transaction log protocol: https://github.com/delta-io/delta/blob/master/PROTOCOL.md
