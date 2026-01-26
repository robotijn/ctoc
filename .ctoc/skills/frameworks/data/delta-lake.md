# Delta Lake CTO
> Open-source lakehouse storage layer with ACID transactions on data lakes.

## Commands
```bash
# Setup | Dev | Test
pip install delta-spark
pyspark --packages io.delta:delta-spark_2.12:3.0.0
spark-sql --conf spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension
```

## Non-Negotiables
1. ACID transactions for reliable writes
2. Time travel for data versioning and recovery
3. Schema enforcement and evolution
4. Z-ordering for query optimization
5. VACUUM policies to manage storage
6. Partitioning strategy aligned with queries

## Red Lines
- Schema enforcement disabled (`mergeSchema` without validation)
- Missing VACUUM causing storage bloat
- File sizes too large (>1GB) or too small (<100MB)
- No partitioning strategy for large tables
- Ignoring table statistics for optimization

## Pattern: Production Delta Table
```python
from delta import DeltaTable
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

# Write with partitioning and optimization
(df.write
    .format("delta")
    .mode("overwrite")
    .partitionBy("date")
    .option("overwriteSchema", "true")
    .option("dataChange", "true")
    .save("s3://bucket/events"))

# Optimize with Z-ordering for query patterns
spark.sql("""
    OPTIMIZE delta.`s3://bucket/events`
    ZORDER BY (user_id, event_type)
""")

# VACUUM to remove old files (retain 7 days)
spark.sql("""
    VACUUM delta.`s3://bucket/events` RETAIN 168 HOURS
""")

# Time travel query
df_yesterday = spark.read.format("delta") \
    .option("versionAsOf", 5) \
    .load("s3://bucket/events")

# Merge (upsert) pattern
deltaTable = DeltaTable.forPath(spark, "s3://bucket/events")
deltaTable.alias("target").merge(
    updates.alias("source"),
    "target.id = source.id"
).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
```

## Integrates With
- **Compute**: Spark, Trino, Presto, DuckDB
- **Storage**: S3, ADLS, GCS, HDFS
- **Catalog**: Unity Catalog, Hive Metastore, AWS Glue

## Common Errors
| Error | Fix |
|-------|-----|
| `ConcurrentModificationException` | Use Delta's optimistic concurrency |
| `Too many small files` | Run OPTIMIZE with bin-packing |
| `Schema mismatch` | Enable schema evolution or fix source |
| `VACUUM failed` | Check retention period > 7 days default |

## Prod Ready
- [ ] Partitioning aligned with query patterns
- [ ] OPTIMIZE scheduled (daily/weekly)
- [ ] VACUUM policy configured
- [ ] Z-ordering on frequent filter columns
- [ ] Time travel retention set
