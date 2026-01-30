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
