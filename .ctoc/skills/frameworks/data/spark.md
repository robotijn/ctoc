# Apache Spark CTO
> Distributed computing for petabyte-scale data processing and analytics.

## Commands
```bash
# Setup | Dev | Test
pip install pyspark[sql,ml,pandas_on_spark]
spark-submit --master local[*] app.py
pytest tests/ --spark-local
```

## Non-Negotiables
1. DataFrame API over RDDs for structured data
2. Partition by high-cardinality columns wisely (target 100-200MB/partition)
3. Broadcast joins for tables < 10MB
4. Use predicate pushdown and column pruning
5. Cache only reused DataFrames with correct storage level
6. Avoid UDFs when native functions exist (10-100x slower)

## Red Lines
- RDDs for structured data processing
- Collecting large datasets to driver
- Ignoring data skew causing OOM
- Hardcoded paths instead of parameterized configs
- Not monitoring Spark UI for bottlenecks

## Pattern: Optimized ETL Pipeline
```python
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = SparkSession.builder \
    .appName("etl_pipeline") \
    .config("spark.sql.adaptive.enabled", "true") \
    .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
    .getOrCreate()

# Efficient read with schema and partition pruning
df = spark.read.parquet("s3://bucket/data/") \
    .filter(F.col("date") >= "2024-01-01") \
    .select("id", "date", "value", "category")

# Broadcast small dimension table
dim_df = spark.read.parquet("s3://bucket/dims/").hint("broadcast")
result = df.join(dim_df, "category") \
    .groupBy("date") \
    .agg(F.sum("value").alias("total"))

# Write with optimized partitioning
result.repartition(10).write \
    .mode("overwrite") \
    .partitionBy("date") \
    .parquet("s3://bucket/output/")
```

## Integrates With
- **Storage**: S3/ADLS/GCS with Delta Lake or Iceberg format
- **Orchestration**: Airflow, Dagster, or Databricks Workflows
- **Catalog**: Unity Catalog, Hive Metastore, AWS Glue

## Common Errors
| Error | Fix |
|-------|-----|
| `OutOfMemoryError` on driver | Avoid collect(), use write() or take(n) |
| `SpillToDisk` frequent | Increase executor memory or partition count |
| `FetchFailedException` | Data skew—salting keys or adaptive repartition |
| `Task serialization error` | Broadcast non-serializable objects or use mapPartitions |

## Prod Ready
- [ ] Adaptive Query Execution enabled
- [ ] Data skew handled with salting or AQE
- [ ] Cluster autoscaling configured
- [ ] Delta Lake/Iceberg for ACID transactions
- [ ] Monitoring via Spark UI and metrics sink
