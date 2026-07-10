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

## Table Footguns (CoW vs MoR · record key · compaction · timeline)
Every Hudi correctness bug traces back to two required config keys and the table
type. Get `recordkey.field` / `precombine.field` / `table.type` right first.

```python
hudi_options = {
    "hoodie.table.name": "events",
    "hoodie.datasource.write.table.type": "MERGE_ON_READ",   # or COPY_ON_WRITE
    # RECORDKEY defines identity for upsert dedup. Change it later and Hudi can no
    # longer match existing records -> silent duplicates, not an error.
    "hoodie.datasource.write.recordkey.field": "event_id",
    # PRECOMBINE breaks ties when two records share a key in one batch: the row with
    # the LARGER precombine value wins. Pick a monotonic field (event_time / version).
    # Omit it and "last write wins" is non-deterministic across a shuffle.
    "hoodie.datasource.write.precombine.field": "event_time",
    "hoodie.datasource.write.operation": "upsert",
}
```

- **Copy-on-Write (CoW)**: each write rewrites the affected base (Parquet) files —
  reads are a plain Parquet scan (fast), writes amplify. **Merge-on-Read (MoR)**:
  writes append row-based **log files** (`.log`) next to base files — writes are
  fast, but a `_rt` (real-time) read must merge base + logs on the fly. Choosing MoR
  and skipping compaction is the #1 "reads got slow" incident.
- **Compaction** (MoR only) merges log files back into base files. Inline compaction
  (`hoodie.compact.inline=true`, `...inline.max.delta.commits=5`) blocks the writer;
  async/offline compaction keeps ingest latency low but needs a separate job. A `_ro`
  (read-optimized) query ignores un-compacted logs — so it can return STALE data
  until compaction runs. Know which query type you're issuing.
- **Cleaner retention** (`hoodie.cleaner.commits.retained`) bounds how many old file
  versions survive — it is what caps storage and also **what limits how far back
  time-travel / incremental queries can reach**. Set it too low and an incremental
  reader that lags behind the cleaner gets an "instant no longer available" failure.
- **Timeline** (`.hoodie/`): every action is an instant (`requested`→`inflight`→
  `completed`). A stuck `inflight` instant from a crashed writer blocks new commits
  until rolled back — don't hand-delete timeline files; use `HoodieCLI` rollback.
- **Clustering** (`hoodie.clustering.inline`) re-sorts/co-locates data for pruning;
  it is orthogonal to compaction (layout vs. log-merge). Don't conflate them.

## Concurrency (OCC + external lock provider)
Multi-writer to one Hudi table requires **optimistic concurrency control with an
external lock provider** — the default single-writer model will corrupt the timeline
under concurrent writers.

```python
concurrency = {
    "hoodie.write.concurrency.mode": "optimistic_concurrency_control",
    "hoodie.write.lock.provider":
        "org.apache.hudi.client.transaction.lock.ZookeeperBasedLockProvider",
    "hoodie.write.lock.zookeeper.url": "zk-host:2181",
    "hoodie.write.lock.zookeeper.base_path": "/hudi/locks",
    "hoodie.cleaner.policy.failed.writes": "LAZY",   # required with OCC multi-writer
}
```

- Providers: Zookeeper, Hive Metastore, DynamoDB, or a filesystem lock. Conflicting
  writers to overlapping files: one commit succeeds, the other aborts and must retry.
- Run **table services (compaction/clustering/cleaning) from a single owner** or via
  an async table-service pipeline; two writers each doing inline compaction fight
  over the same file groups.

## Security (writer credentials · table-service isolation)
- Storage credentials (`fs.s3a.*` keys) belong in the cluster's secret store /
  instance profile, not inline in `hudi_options` that lands in Spark event logs.
- Isolate the async **table-service** job's credentials from the ingest job so a
  compromised ingest path can't also rewrite historical base files.
- Restrict who can alter `recordkey`/`precombine`/`table.type` — silently changing the
  record key on a live table is a data-integrity attack (unmatched upserts →
  duplicate identities), not just a config typo.

## Testing
```python
def test_mor_upsert_precombine_wins(spark, table_path):
    # Two rows, same recordkey, different precombine -> the LARGER precombine wins.
    _write(spark, table_path, [(1, ts="2026-06-01", v="old")], op="upsert")
    _write(spark, table_path, [(1, ts="2026-06-02", v="new")], op="upsert")
    ro = spark.read.format("hudi").load(table_path)   # after compaction
    assert ro.where("event_id = 1").collect()[0]["v"] == "new"
```
- Assert dedup by writing conflicting-key batches and checking the surviving row —
  that catches a missing/wrong `precombine.field`. For MoR, test both `_ro` (stale
  until compaction) and `_rt` (merged) read paths so a "reader saw old data" bug
  surfaces in CI, not prod.

## Performance
- **Small-file handling**: Hudi auto-sizes files toward
  `hoodie.parquet.max.file.size` (~120 MB) on write — don't defeat it with tiny
  micro-batches. Enable clustering to fix layout after the fact.
- Prefer **incremental queries** (`hoodie.datasource.query.type=incremental` +
  `begin.instanttime`) over full re-scans for downstream ETL; that's Hudi's core win.
- Tune the **index** (`hoodie.index.type` — BLOOM, SIMPLE, or record-level index) to
  match key cardinality; a wrong index makes upsert lookups the bottleneck.

## Version-Specific Gotchas (dated, sourced)
- **Apache Hudi 1.2.0** is the current release, published **2026-05-23**; the 1.x
  line reworked the timeline (LSM) and record-level index vs. 0.x.
  [github.com/apache/hudi/releases (release-1.2.0), retrieved 2026-07-10]
- Bundle jars are **engine-pinned**: `hudi-spark3.5-bundle_2.12` matches Spark 3.5 /
  Scala 2.12. A mismatched Spark/Scala bundle fails at class-load or read time —
  verify the exact bundle for your Spark line before upgrading.
- The 0.x → 1.x table-version upgrade is one-way per table; test on a copy first, as
  older readers cannot read a 1.x-upgraded table.
  [hudi.apache.org/releases/release-1.2.0, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Apache Hudi releases: https://github.com/apache/hudi/releases
- Hudi 1.2.0 release notes: https://hudi.apache.org/releases/release-1.2.0
- Table types (CoW vs MoR): https://hudi.apache.org/docs/table_types
- Concurrency control (OCC + lock providers): https://hudi.apache.org/docs/concurrency_control
- Compaction & cleaning: https://hudi.apache.org/docs/compaction
- Configuration reference (recordkey/precombine/index): https://hudi.apache.org/docs/configurations
