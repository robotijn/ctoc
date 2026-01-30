# Apache Hudi CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install pyspark
# With Spark
spark-submit --packages org.apache.hudi:hudi-spark3.5-bundle_2.12:0.15.0 job.py
```

## Claude's Common Mistakes
1. **Wrong table type** - CoW for read-heavy, MoR for write-heavy
2. **Missing compaction for MoR** - Causes read amplification
3. **Bad record key design** - Affects upsert performance
4. **No cleaning policy** - Storage bloat over time
5. **Ignoring clustering** - Important for read performance

## Correct Patterns (2026)
```python
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.hudi.catalog.HoodieCatalog") \
    .getOrCreate()

hudi_options = {
    "hoodie.table.name": "events",
    "hoodie.datasource.write.table.type": "MERGE_ON_READ",  # Or COPY_ON_WRITE
    "hoodie.datasource.write.recordkey.field": "event_id",
    "hoodie.datasource.write.precombine.field": "event_time",
    "hoodie.datasource.write.partitionpath.field": "date",
    "hoodie.datasource.write.operation": "upsert",

    # Compaction (CRITICAL for MoR)
    "hoodie.compact.inline": "true",
    "hoodie.compact.inline.max.delta.commits": "5",

    # Clustering for read optimization
    "hoodie.clustering.inline": "true",
    "hoodie.clustering.inline.max.commits": "4",

    # Cleaning
    "hoodie.clean.automatic": "true",
    "hoodie.cleaner.commits.retained": "10",
}

df.write.format("hudi").options(**hudi_options).mode("append").save("s3://bucket/events")

# Incremental query (efficient for pipelines)
incremental_df = spark.read.format("hudi") \
    .option("hoodie.datasource.query.type", "incremental") \
    .option("hoodie.datasource.read.begin.instanttime", last_commit) \
    .load("s3://bucket/events")
```

## Version Gotchas
- **v0.15+**: Improved performance, record-level indexing
- **CoW vs MoR**: CoW = simple reads, slow writes; MoR = fast writes, need compaction
- **Incremental queries**: Key feature for efficient ETL pipelines
- **Timeline**: Debug issues via .hoodie folder metadata

## What NOT to Do
- Do NOT use wrong table type for access pattern
- Do NOT skip compaction for MoR tables (slow reads)
- Do NOT ignore cleaning policy (storage bloat)
- Do NOT forget clustering for read performance
