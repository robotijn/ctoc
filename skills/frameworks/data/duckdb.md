# DuckDB CTO
> Claude Code correction guide. Updated January 2026.

<!-- ctoc:claims
- id: duckdb-python-version
  kind: registry-version
  source: https://pypi.org/pypi/duckdb/json
  select: info.version
  expect: 1.5.5
  retrieved: 2026-07-30
- id: duckdb-concurrency-doc
  kind: url-live
  source: https://duckdb.org/docs/stable/connect/concurrency
  retrieved: 2026-07-10
-->

## Installation (CURRENT - January 2026)
```bash
pip install duckdb>=1.0
# Python 3.9+ required
```

## Claude's Common Mistakes
1. **Loading data into memory first** - DuckDB queries files directly (Parquet, CSV)
2. **Using pandas for transformations** - DuckDB SQL is faster; query DataFrames in-place
3. **Not closing connections** - Causes lock issues in persistent mode
4. **Ignoring file format** - Parquet is 100-600x faster than CSV
5. **Missing extensions** - httpfs/aws needed for S3; load explicitly

## Correct Patterns (2026)
```python
import duckdb

# Persistent database with resource limits
con = duckdb.connect("analytics.duckdb")
con.execute("SET memory_limit='4GB'")
con.execute("SET threads=4")

# Query files directly (zero-copy, no pandas needed)
result = con.execute("""
    SELECT
        category,
        DATE_TRUNC('month', date) AS month,
        SUM(amount) AS revenue
    FROM read_parquet('s3://bucket/sales/*.parquet')
    WHERE date >= '2025-01-01'
    GROUP BY ALL
    ORDER BY month, revenue DESC
""").df()

# Query pandas DataFrame in-place (no copy)
import pandas as pd
df = pd.read_csv("local.csv")
summary = con.execute("SELECT category, AVG(value) FROM df GROUP BY 1").df()

# S3 access (load extension first)
con.execute("INSTALL httpfs; LOAD httpfs")
con.execute("SET s3_region='us-east-1'")

# Export optimized Parquet
con.execute("COPY (SELECT * FROM result) TO 'out.parquet' (FORMAT PARQUET)")
con.close()  # Always close persistent connections
```

## Version Gotchas
- **v1.0+**: Stable API; breaking changes rare
- **v1.0**: `GROUP BY ALL` for automatic grouping
- **Extensions**: httpfs, aws, postgres, spatial - install explicitly
- **With Polars/pandas**: Zero-copy interop via Apache Arrow

## What NOT to Do
- Do NOT load CSV into pandas then query (query directly)
- Do NOT forget to close persistent connections
- Do NOT use CSV when Parquet is available (huge perf diff)
- Do NOT skip memory_limit for large workloads (OOM)

## Embedded Footguns — single-writer, memory, extensions
DuckDB is an **in-process** engine: the database file is owned by **one process at a
time**. There is exactly **one read-write connection across processes** to a given
file; a second process opening it read-write fails with a lock error. Concurrency is
*within* one process (multiple threads/connections), not across processes.

```python
import duckdb

# FOOTGUN: two OS processes both opening the SAME file read-write → lock error.
# con = duckdb.connect("analytics.duckdb")   # fails if another process holds RW.

# RIGHT: single writer; other processes open READ-ONLY (many readers, one writer).
reader = duckdb.connect("analytics.duckdb", read_only=True)

# RIGHT: bound memory + explicit spill directory so a big join spills instead of OOM.
con = duckdb.connect("analytics.duckdb")
con.execute("SET memory_limit = '8GB'")        # hard cap; default is ~80% of RAM
con.execute("SET temp_directory = '/data/duck_spill'")  # WHERE larger-than-memory spills
con.execute("SET max_temp_directory_size = '100GB'")
con.execute("SET threads = 4")
```

- **`temp_directory` + spilling.** Persistent databases spill to `temp_directory`
  when a query exceeds `memory_limit`; an **in-memory** database (`:memory:`) has
  nowhere to spill unless you set `temp_directory` explicitly — a large aggregation
  then OOM-kills the host. Always set both `memory_limit` and `temp_directory` for
  heavy workloads.
- **`read_parquet` glob** reads files directly (no import step); it prunes
  row-groups by predicate and, with `hive_partitioning`, prunes whole directories.
  Zero-copy Arrow/Parquet is why DuckDB beats a load-then-query pandas flow.
- **In-process lifecycle:** a persistent connection holds the file lock and a WAL
  until closed — always `con.close()` (or use a context manager); a leaked
  connection blocks the next writer.
  [duckdb.org/docs concurrency + configuration, retrieved 2026-07-10; see References]

```python
# RIGHT: glob + partition pruning read many files as one relation, no pandas load.
con.execute("""
    SELECT category, sum(amount) AS revenue
    FROM read_parquet('s3://bucket/sales/year=2026/*.parquet', hive_partitioning = true)
    WHERE category = 'books'
    GROUP BY category
""").arrow()          # zero-copy Arrow out
```

## Correctness — implicit casts & larger-than-memory joins
```python
# FOOTGUN: implicit string↔number comparison can silently change results.
con.execute("SELECT '10' > 9")     # DuckDB casts by rule; don't rely on ad-hoc coercion
# RIGHT: cast explicitly at boundaries so intent (and failure) is visible.
con.execute("SELECT CAST(col AS BIGINT) FROM t WHERE TRY_CAST(col AS BIGINT) IS NOT NULL")

# Larger-than-memory JOIN: DuckDB will spill to temp_directory if it is set …
con.execute("SET memory_limit='4GB'; SET temp_directory='/data/spill'")
con.execute("SELECT * FROM big_left JOIN big_right USING (id)")   # spills, not OOM, when bounded
```
- Use `TRY_CAST` (returns `NULL` on failure) at ingestion boundaries so a bad value
  fails loudly/handled rather than aborting or silently coercing a whole column.
- A join whose build side exceeds RAM only succeeds if `temp_directory` is set;
  otherwise it OOMs. Bound it and give it disk. [duckdb.org/docs sql/data_types +
  configuration, retrieved 2026-07-10]

## Security — parameterized queries (CWE-89) & S3 credentials
```python
import duckdb
con = duckdb.connect()

# FOOTGUN: f-string interpolation of user input → SQL injection (CWE-89)
cat = user_input
con.execute(f"SELECT * FROM sales WHERE category = '{cat}'")     # NEVER

# RIGHT: parameter placeholders (? positional, or $name); values are bound, not spliced
con.execute("SELECT * FROM sales WHERE category = ?", [cat])
con.execute("SELECT * FROM sales WHERE category = $c", {"c": cat})
```
- **CWE-89 (SQL Injection):** pass user values as `?`/`$name` parameters; never
  build SQL by concatenating input. Table/column identifiers cannot be
  parameterized — allow-list them. [cwe.mitre.org/data/definitions/89.html, retrieved
  2026-07-10]
- **`httpfs`/S3 credentials:** load `httpfs`, then store credentials in a **SECRET**
  (`CREATE SECRET … (TYPE s3, PROVIDER credential_chain)`) so keys are not embedded
  in SQL text or query logs; prefer the credential chain (env/instance role) over
  literal keys. [duckdb.org/docs extensions/httpfs + sql/statements/create_secret,
  retrieved 2026-07-10]

```python
con.execute("INSTALL httpfs; LOAD httpfs")
con.execute("CREATE SECRET s3_ro (TYPE s3, PROVIDER credential_chain)")  # no literal keys
```

## Testing — assert on plan, spill and lock behavior
```python
# Confirm predicate/row-group pruning: EXPLAIN ANALYZE shows rows actually scanned.
plan = con.execute("EXPLAIN ANALYZE SELECT sum(amount) "
                    "FROM read_parquet('data/*.parquet') WHERE date >= '2026-01-01'").fetchall()
assert any('Filter' in row[-1] for row in plan)   # pushdown present, not a full scan
```
- Test heavy queries with a **small `memory_limit` + a real `temp_directory`** so the
  spill path is exercised in CI, not discovered in prod.
- Test the single-writer contract explicitly: assert a second read-write
  `duckdb.connect()` to a held file raises, and that `read_only=True` readers succeed
  concurrently.

## Performance
- **Query files directly** (`read_parquet`/`read_csv_auto`) — no load-into-pandas
  step; Parquet is dramatically faster than CSV (columnar + row-group pruning).
- **Arrow zero-copy** in/out (`.arrow()`, registering an Arrow table/DataFrame) avoids
  serialization between DuckDB and pandas/Polars.
- **Set `threads`** to physical cores and **`memory_limit`** to bound the working set;
  DuckDB parallelizes scans and joins across threads within the one process.
- **`GROUP BY ALL` / `SELECT * EXCLUDE(...)`** keep analytical SQL terse without
  hurting the plan.

## Version-Specific Gotchas (dated, sourced)
- **`duckdb` (Python) 1.5.4** is the current stable release, uploaded
  **2026-06-17**, `requires_python >= 3.10`. The engine 1.5.0 line is codenamed
  **"Variegata"** (2026-03-09); 1.5.4 is a bugfix. [pypi.org/pypi/duckdb JSON API +
  github.com/duckdb/duckdb/releases, retrieved 2026-07-10]
- **Storage format stability:** the on-disk format is forward/backward compatible
  within recent lines, but a database written by a newer minor may need that version
  to open — pin the DuckDB version alongside the `.duckdb` file it produced.
- **`memory_limit` default** is roughly 80% of system RAM; on shared/CI hosts set it
  explicitly and set `temp_directory` so spills have somewhere to go.
  [duckdb.org/docs configuration, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- duckdb (Python) releases (PyPI JSON): https://pypi.org/pypi/duckdb/json
- DuckDB engine releases: https://github.com/duckdb/duckdb/releases
- Concurrency (single writer / read-only): https://duckdb.org/docs/stable/connect/concurrency
- Configuration (memory_limit, temp_directory, threads): https://duckdb.org/docs/stable/configuration/overview
- read_parquet / partition pruning: https://duckdb.org/docs/stable/data/parquet/overview
- Prepared statements / parameters: https://duckdb.org/docs/stable/sql/query_syntax/prepared_statements
- httpfs / S3: https://duckdb.org/docs/stable/extensions/httpfs/s3api
- Secrets (CREATE SECRET): https://duckdb.org/docs/stable/sql/statements/create_secret
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
