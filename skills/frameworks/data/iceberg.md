# Apache Iceberg CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install pyiceberg
# Or with Spark
spark-sql --packages org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.5.0
```

## Claude's Common Mistakes
1. **Too many small files** - Run compaction regularly
2. **Missing snapshot expiration** - Metadata bloat over time
3. **Ignoring hidden partitioning** - Use partition transforms, not explicit columns
4. **No catalog integration** - Hive/Glue/Nessie required for production
5. **Large manifest files** - Slow query planning

## Correct Patterns (2026)
```sql
-- Hidden partitioning (queries don't need to know partition structure)
CREATE TABLE events (
    id BIGINT,
    user_id BIGINT,
    event_type STRING,
    event_time TIMESTAMP
) USING iceberg
PARTITIONED BY (days(event_time), bucket(16, user_id));

-- Partition evolution (no data rewrite!)
ALTER TABLE events ADD PARTITION FIELD bucket(32, user_id);
ALTER TABLE events DROP PARTITION FIELD bucket(16, user_id);

-- Compaction (target 128-256MB files)
CALL system.rewrite_data_files(
    table => 'db.events',
    options => map('target-file-size-bytes', '134217728')
);

-- Snapshot expiration (keep 7 days)
CALL system.expire_snapshots('db.events', TIMESTAMP '2024-01-01 00:00:00');
CALL system.remove_orphan_files('db.events');

-- Time travel
SELECT * FROM events VERSION AS OF 12345;
SELECT * FROM events TIMESTAMP AS OF '2024-01-15 10:00:00';
```

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog("glue")
table = catalog.load_table("db.events")
scan = table.scan(row_filter="event_time >= '2024-01-01'")
df = scan.to_pandas()
```

## Version Gotchas
- **v1.5+**: Row-level deletes, improved merge-on-read
- **Partition evolution**: Change partitioning without rewriting data
- **Catalogs**: Hive Metastore, Glue, Nessie, REST catalog
- **vs Delta**: More open ecosystem; Delta has better Databricks integration

## What NOT to Do
- Do NOT let small files accumulate (run compaction)
- Do NOT skip snapshot expiration (metadata bloat)
- Do NOT ignore hidden partitioning (use transforms)
- Do NOT forget catalog integration for production

## Table Footguns (snapshots · compaction · schema/partition evolution)
The Iceberg footguns Claude reproduces are all consequences of the same fact:
**an Iceberg table is a chain of immutable snapshots plus manifest metadata**, and
every "cheap" operation actually appends a new snapshot.

```sql
-- FOOTGUN: expire_snapshots is what actually deletes old data + metadata files.
-- If you never run it, every rewrite/upsert leaves the OLD files on storage
-- forever — the "table" is 20 GB but the object store bill is 2 TB.
CALL system.expire_snapshots(
  table => 'db.events',
  older_than => TIMESTAMP '2026-06-01 00:00:00',
  retain_last => 5            -- ALWAYS keep a floor of snapshots for rollback
);

-- FOOTGUN: expire_snapshots does NOT remove data files orphaned by a failed
-- write or a partial compaction — those need a SEPARATE, deliberately-lagged call.
-- remove_orphan_files with a too-recent cutoff can delete files an IN-FLIGHT
-- writer is still committing. Keep older_than well behind wall-clock (>= 3 days).
CALL system.remove_orphan_files(
  table => 'db.events',
  older_than => TIMESTAMP '2026-06-25 00:00:00'
);

-- Compaction: bin-pack small files. Target 128–256 MB; too small = query-planning
-- overhead, too large = poor pruning. rewrite_manifests separately trims manifest bloat.
CALL system.rewrite_data_files(
  table => 'db.events',
  options => map('target-file-size-bytes', '134217728', 'min-input-files', '5')
);
CALL system.rewrite_manifests('db.events');
```

- **Copy-on-write vs merge-on-read** is a per-operation write-mode
  (`write.delete.mode`, `write.update.mode`, `write.merge.mode` =
  `copy-on-write` | `merge-on-read`). CoW rewrites whole data files on delete/update
  (read-cheap, write-expensive); MoR writes position/equality delete files
  (write-cheap, read-expensive until compaction merges them). Choosing MoR and then
  never compacting is the classic "reads got 10× slower over a month" bug.
- **Hidden partitioning + partition evolution** — partition on a *transform*
  (`days(ts)`, `bucket(16, id)`), never a derived column. Evolving the partition spec
  (`ADD/DROP PARTITION FIELD`) rewrites NO data; old files keep the old spec and new
  files use the new one, so a query spanning the change reads both layouts. Do not
  assume a uniform layout after evolution.
- **Schema evolution** is by field-**ID**, not by position: rename is safe, but
  re-adding a dropped column name creates a *new* field ID — old data reads back
  `NULL`, not the old values. Widening (`int`→`long`, `float`→`double`) is allowed;
  narrowing is not.

## Concurrency (optimistic commits + retries)
Iceberg uses **optimistic concurrency**: a commit that discovers the table's current
snapshot changed underneath it must re-base and retry. Tune, don't disable.

```sql
ALTER TABLE db.events SET TBLPROPERTIES (
  'commit.retry.num-retries'          = '10',    -- default 4; raise for hot tables
  'commit.retry.min-wait-ms'          = '100',
  'commit.retry.max-wait-ms'          = '60000'
);
```

- Two writers can commit concurrently only if their changes don't conflict at the
  data-file / partition level; otherwise the loser retries against the winner's new
  snapshot. Long-running MERGE jobs on a hot table exhaust retries and fail —
  serialize heavy writers or shrink their scope.
- The **catalog** provides commit atomicity (compare-and-swap on the metadata
  pointer). A filesystem-only "catalog" (`hadoop` tables) has weaker atomicity on
  object stores — use a real catalog (REST, Glue, Nessie, Hive) for concurrent writers.

## Security (catalog credentials · table ACLs · metadata as control files)
- **Table metadata files are control files**: they list which data files belong to
  the table. A principal that can rewrite table properties (e.g. an S3 metadata
  location) can redirect readers to attacker-controlled files. **CVE-2026-42812**
  (CWE-732/284/20/863, published 2026-05-04) covers exactly this class — restrict who
  can `ALTER TABLE ... SET TBLPROPERTIES` on metadata-location properties.
  [nvd.nist.gov/vuln/detail/CVE-2026-42812, retrieved 2026-07-10]
- Scope warehouse **storage credentials** through the catalog's vended-credential /
  `LoadTable` credential path rather than handing every engine long-lived S3 keys;
  enforce table-level authorization at the catalog (REST/Polaris/Glue), not in
  client code.
- Never commit catalog URIs, warehouse keys, or REST catalog bearer tokens into the
  table properties or SparkSession config that ends up in logs.

## Testing
```python
from pyiceberg.catalog import load_catalog

def test_snapshot_isolation_and_expiry(tmp_catalog):
    # A read pinned to a snapshot must NOT see a later append (snapshot isolation).
    table = tmp_catalog.load_table("db.events")
    pinned = table.current_snapshot().snapshot_id
    _append_rows(table, rows=100)
    scan = table.scan(snapshot_id=pinned)              # time-travel read
    assert scan.to_arrow().num_rows == BASELINE_ROWS   # unaffected by the append
```
- Assert on **snapshot IDs / row counts before and after** an operation rather than
  trusting a query — that catches "expire ran too aggressively" and "MoR deletes
  weren't applied" regressions. Test partition-evolution reads across the change.

## Performance
- Keep data files at 128–256 MB (`rewrite_data_files`) and **manifests** trimmed
  (`rewrite_manifests`); metadata bloat slows planning more than data volume does.
- Prefer **hidden partition transforms** so predicate pushdown prunes files without
  the query naming partition columns. For MoR, schedule compaction so delete-file
  merge cost stays bounded.

## Version-Specific Gotchas (dated, sourced)
- **PyIceberg 0.11.1** is the current stable Python release, uploaded
  **2026-03-03**, `requires_python >=3.10,<4.0`.
  [pypi.org/pypi/pyiceberg/json, retrieved 2026-07-10]
- **Apache Iceberg (Java/table spec) 1.11.0** is the current release, published
  **2026-05-20**; use a matching `iceberg-spark-runtime` bundle for your Spark line.
  [github.com/apache/iceberg/releases (apache-iceberg-1.11.0), retrieved 2026-07-10]
- v1.4+ formalized **position/equality delete files** (merge-on-read); v1.5+ improved
  row-level deletes. Pin the runtime jar to your engine version — a mismatched
  `iceberg-spark-runtime-3.5` on Spark 3.4 fails at read time.

## References (retrieved 2026-07-10)
- PyIceberg releases (PyPI JSON): https://pypi.org/pypi/pyiceberg/json
- Apache Iceberg releases: https://github.com/apache/iceberg/releases
- Iceberg maintenance (expire/compact/orphans): https://iceberg.apache.org/docs/latest/maintenance/
- Iceberg table spec (snapshots, schema/partition evolution): https://iceberg.apache.org/spec/
- CVE-2026-42812 (metadata control-file authorization): https://nvd.nist.gov/vuln/detail/CVE-2026-42812
- CWE-732 (incorrect permission assignment): https://cwe.mitre.org/data/definitions/732.html
