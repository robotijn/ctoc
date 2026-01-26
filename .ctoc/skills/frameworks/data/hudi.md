# Apache Hudi CTO
> Streaming data lakehouse with incremental processing and ACID transactions.

## Commands
```bash
# Setup | Dev | Test
pip install pyspark hudi-spark-bundle
spark-submit --packages org.apache.hudi:hudi-spark3.4-bundle_2.12:0.14.0 job.py
hudi-cli --table-path s3://bucket/hudi_table
```

## Non-Negotiables
1. Table type selection: Copy-on-Write (CoW) vs Merge-on-Read (MoR)
2. Record key design for efficient upserts
3. Compaction scheduling for MoR tables
4. Clustering for query performance
5. Incremental queries for efficient downstream
6. Cleaning policies to manage storage

## Red Lines
- Wrong table type for access pattern
- Missing compaction causing read amplification
- Large file groups degrading performance
- No cleaning policy causing storage bloat
- Ignoring timeline for debugging

## Pattern: Production Hudi Table
```python
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.hudi.catalog.HoodieCatalog") \
    .getOrCreate()

# Write with Hudi (MoR for streaming, CoW for batch)
hudi_options = {
    "hoodie.table.name": "events",
    "hoodie.datasource.write.table.type": "MERGE_ON_READ",
    "hoodie.datasource.write.recordkey.field": "event_id",
    "hoodie.datasource.write.precombine.field": "event_time",
    "hoodie.datasource.write.partitionpath.field": "date",
    "hoodie.datasource.write.operation": "upsert",

    # Compaction settings
    "hoodie.compact.inline": "true",
    "hoodie.compact.inline.max.delta.commits": "5",

    # Clustering for read optimization
    "hoodie.clustering.inline": "true",
    "hoodie.clustering.inline.max.commits": "4",

    # Cleaning
    "hoodie.clean.automatic": "true",
    "hoodie.cleaner.commits.retained": "10",
}

df.write.format("hudi") \
    .options(**hudi_options) \
    .mode("append") \
    .save("s3://bucket/events")

# Incremental query (efficient for pipelines)
incremental_df = spark.read.format("hudi") \
    .option("hoodie.datasource.query.type", "incremental") \
    .option("hoodie.datasource.read.begin.instanttime", last_commit) \
    .load("s3://bucket/events")

# Time travel
historical_df = spark.read.format("hudi") \
    .option("as.of.instant", "20240115100000") \
    .load("s3://bucket/events")
```

## Integrates With
- **Compute**: Spark, Flink, Presto, Trino
- **Storage**: S3, ADLS, GCS, HDFS
- **Streaming**: Kafka via DeltaStreamer

## Common Errors
| Error | Fix |
|-------|-----|
| `Compaction not running` | Check inline or async compaction settings |
| `Duplicate records` | Verify recordkey uniqueness |
| `Slow reads on MoR` | Run compaction more frequently |
| `Storage growing` | Enable cleaning policy |

## Prod Ready
- [ ] Table type matched to access pattern
- [ ] Compaction schedule configured
- [ ] Clustering enabled for read performance
- [ ] Cleaning policy active
- [ ] Incremental queries for pipelines
