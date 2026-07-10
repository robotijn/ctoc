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

## Shuffle, Skew & Partition Footguns (Performance)
Wide transforms (`groupBy`, `join`, `distinct`, `repartition`, window without
partition) trigger a **shuffle** — a full re-distribution of rows across the
cluster by key. Shuffle is the single largest source of Spark slowness, OOMs,
and stragglers, and almost every one of Claude's Spark bugs lives here.

```python
from pyspark.sql import functions as F

# FOOTGUN: default spark.sql.shuffle.partitions=200 — fixed, key-blind.
# On 2 TB it makes 200 huge partitions (spill/OOM); on 50 MB it makes 200
# near-empty tasks (scheduler overhead dominates). It does NOT adapt to data.
big = df_a.join(df_b, "user_id").groupBy("user_id").count()

# RIGHT: let Adaptive Query Execution (AQE) coalesce/split shuffle partitions
# at runtime from real map-output statistics.
spark.conf.set("spark.sql.adaptive.enabled", True)                    # default ON in Spark 3.2+/4.x
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", True) # merge tiny post-shuffle partitions
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", True)           # split skewed partitions in a join
```

**Data skew** — a few hot keys (e.g. `null`, a default tenant, a whale account)
own most of the rows. One executor task gets a giant partition and OOMs or runs
10-100x longer than its peers while the cluster idles. AQE skew-join splits the
skewed side automatically; when AQE cannot (skew on the aggregation, not the
join), **salt** the hot key:

```python
# RIGHT: salt a skewed join key so hot keys spread across N reducer tasks
import random
salted = df_a.withColumn("salt", (F.rand() * 16).cast("int"))
dim_salted = dim.crossJoin(spark.range(16).withColumnRenamed("id", "salt"))
result = salted.join(dim_salted, ["user_id", "salt"]).drop("salt")
```

**Broadcast joins** — for a join where one side is small (default threshold
`spark.sql.autoBroadcastJoinThreshold=10MB`), Spark ships the small table to
every executor and skips the shuffle entirely. `F.broadcast(small)` forces it;
setting the threshold to `-1` disables it. Broadcasting a table that is *not*
actually small causes **driver + executor OOM** — the small side is collected to
the driver first. Watch `SortMergeJoin` vs `BroadcastHashJoin` in `df.explain()`.

- `cache()` / `persist()` without an eviction plan silently evicts under memory
  pressure (LRU), so a "cached" DataFrame is silently recomputed. Call
  `df.unpersist()` when done; prefer `StorageLevel.MEMORY_AND_DISK`.
- `collect()` / `toPandas()` pull the **entire** result to the driver JVM/Python
  heap — driver OOM on anything non-tiny. Use `take(n)`, `limit(n).collect()`,
  or write to storage.
[spark.apache.org SQL performance-tuning (AQE, skew, broadcast) docs, retrieved 2026-07-10; see References]

## Correctness Footguns
```python
# FOOTGUN: non-deterministic UDF re-evaluated per access → lazy eval means the
# "same" column yields DIFFERENT values across a filter and a select.
from pyspark.sql import functions as F
df2 = df.withColumn("r", F.rand())        # rand() is non-deterministic
df2.filter(F.col("r") > 0.5).select("r")  # the r you filtered on ≠ the r you select

# RIGHT: materialize non-determinism once so downstream ops see stable values
df2 = df.withColumn("r", F.rand()).persist()   # or write out and re-read
```

- **Lazy evaluation**: transforms build a plan; nothing runs until an *action*
  (`count`, `write`, `collect`, `show`). An exception surfaces at the action, not
  the line that "caused" it — read `df.explain()` to see what will actually run.
- **Small-file problem**: writing with high parallelism (or many tiny partitions)
  emits thousands of tiny files, crushing downstream read performance and object-
  store list latency. Coalesce before write: `df.coalesce(n).write...` or enable
  AQE coalescing. [spark.apache.org performance-tuning docs, retrieved 2026-07-10]

## Security (CWE-89, exposed services)
```python
# FOOTGUN (CWE-89 SQL Injection): interpolating untrusted input into spark.sql
user_id = request_arg           # attacker-controlled, e.g. "1 OR 1=1; DROP TABLE t"
spark.sql(f"SELECT * FROM events WHERE user_id = {user_id}")   # INJECTABLE

# RIGHT: bind via the DataFrame API (parameterized, no string SQL)
spark.read.table("events").filter(F.col("user_id") == user_id)

# RIGHT: parameterized spark.sql (Spark 3.4+ named/positional parameters)
spark.sql("SELECT * FROM events WHERE user_id = :uid", args={"uid": user_id})
```

- **CWE-89 (SQL Injection)** — building a `spark.sql(...)` string from user input
  is classic injection; use the DataFrame API or `spark.sql` **parameterized**
  arguments (`args=`), never f-strings. https://cwe.mitre.org/data/definitions/89.html
- **Exposed Spark UI / master / REST submission** — the standalone master REST
  endpoint (default port 6066) and the Spark UI (4040/8080) have historically
  allowed unauthenticated job submission / info disclosure. Bind them to a private
  network, enable `spark.authenticate` + `spark.ui.filters`, never expose to the
  public internet. [spark.apache.org security docs, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **pyspark 4.1.2** is the current release, uploaded **2026-05-21**; the
  Spark 4.0 maintenance line is at **4.0.3 (2026-06-11)**.
  [pypi.org/project/pyspark JSON API, retrieved 2026-07-10]
- **Spark 4.0**: **ANSI SQL mode is ON by default** — overflow and invalid casts
  now *raise* instead of returning `null`/wrapped values. Code that relied on
  silent `null` on a bad cast breaks; set `spark.sql.ansi.enabled=false` only as a
  temporary migration crutch. **Spark Connect** (decoupled client/server) is GA.
- **AQE** (`spark.sql.adaptive.enabled`) is **ON by default** since 3.2; do not
  disable it to "reproduce old plans" without measuring.
  [spark.apache.org 4.0 migration + SQL-migration-guide, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- pyspark releases (PyPI JSON): https://pypi.org/pypi/pyspark/json
- SQL performance tuning (AQE, skew, broadcast): https://spark.apache.org/docs/latest/sql-performance-tuning.html
- SQL migration guide (ANSI, 4.0): https://spark.apache.org/docs/latest/sql-migration-guide.html
- Spark security (auth, UI, REST): https://spark.apache.org/docs/latest/security.html
- CWE-89 SQL Injection: https://cwe.mitre.org/data/definitions/89.html
