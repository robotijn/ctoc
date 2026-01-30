# Apache Spark CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install pyspark[sql,connect]==3.5.4
# Or for Spark 4.0 preview:
pip install pyspark[sql,connect,ml]==4.0.0
```

## Claude's Common Mistakes
1. **Using RDDs for structured data** - DataFrames are 10-100x faster (Catalyst optimizer)
2. **collect() on large datasets** - OOM on driver; use write() or take(n)
3. **Python UDFs** - 10-100x slower than native functions; avoid when possible
4. **Ignoring data skew** - Causes OOM on specific executors
5. **Not enabling AQE** - Adaptive Query Execution optimizes at runtime

## Correct Patterns (2026)
```python
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = SparkSession.builder \
    .appName("etl") \
    .config("spark.sql.adaptive.enabled", "true") \
    .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
    .config("spark.sql.shuffle.partitions", "auto") \
    .getOrCreate()

# Predicate pushdown + column pruning (automatic with Parquet)
df = spark.read.parquet("s3://bucket/data/") \
    .filter(F.col("date") >= "2025-01-01") \
    .select("id", "date", "value", "category")

# Broadcast small tables (<10MB) for efficient joins
dim_df = spark.read.parquet("s3://bucket/dims/")
result = df.join(F.broadcast(dim_df), "category")

# Handle skew with salting or AQE
result = df.groupBy("date").agg(F.sum("value").alias("total"))

# Write with optimized partitioning
result.write \
    .mode("overwrite") \
    .partitionBy("date") \
    .parquet("s3://bucket/output/")
```

## Version Gotchas
- **v3.5**: 150+ SQL functions in DataFrame API, AQE improvements
- **v4.0**: ANSI SQL compliance by default, Spark Connect GA
- **Spark Connect**: Remote execution mode for lightweight clients
- **Delta Lake 3.0+**: Liquid clustering replaces ZORDER for better perf

## What NOT to Do
- Do NOT use RDDs when DataFrames work (no Catalyst optimization)
- Do NOT call collect() on large data (driver OOM)
- Do NOT write Python UDFs when native functions exist
- Do NOT ignore shuffle partition tuning (default 200 often wrong)
