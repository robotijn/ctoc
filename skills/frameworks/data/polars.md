# Polars CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "polars[all]>=1.0"
# Or minimal: pip install polars
```

## Claude's Common Mistakes
1. **Using eager mode for large data** - Lazy mode enables query optimization
2. **Python apply() functions** - Kills parallelism; use expressions
3. **read_csv instead of scan_csv** - scan_* enables lazy optimization
4. **Converting to pandas unnecessarily** - Loses performance benefits
5. **Not using streaming for large data** - OOM when collecting large results

## Correct Patterns (2026)
```python
import polars as pl

# ALWAYS use lazy mode for optimization
result = (
    pl.scan_parquet("s3://bucket/data/*.parquet")
    .filter(pl.col("date") >= "2025-01-01")
    .with_columns([
        pl.col("amount").cast(pl.Float64),
        pl.col("category").cast(pl.Categorical),
    ])
    .group_by(["category", pl.col("date").dt.truncate("1d")])
    .agg([
        pl.col("amount").sum().alias("total"),
        pl.col("amount").mean().alias("avg"),
        pl.len().alias("count"),
    ])
    .sort(["date", "total"], descending=[False, True])
    .collect(streaming=True)  # Streaming for large results
)

# Sink directly without loading to memory
(
    pl.scan_csv("large.csv")
    .filter(pl.col("status") == "active")
    .sink_parquet("output.parquet")
)

# Use expressions, not apply
df = df.with_columns(
    (pl.col("price") * 0.1).alias("discount"),  # Good
    # pl.col("price").apply(lambda x: x * 0.1)  # Bad - kills parallelism
)
```

## Version Gotchas
- **v1.0**: Stable API; lazy mode is the recommended default
- **v1.0**: GPU acceleration via CUDA (cudf-polars)
- **Streaming**: Use `collect(streaming=True)` or `sink_*` for large data
- **With DuckDB**: Zero-copy interop via Apache Arrow

## What NOT to Do
- Do NOT use `read_*` for large files (use `scan_*` for lazy)
- Do NOT use Python `apply()` or `map_elements` (breaks parallelism)
- Do NOT convert to pandas unless interfacing with pandas-only libraries
- Do NOT call `collect()` without streaming for large results

## Lazy-vs-Eager Footguns (the collect boundary)
The single most common Polars mistake Claude writes: **mixing eager `DataFrame`
and lazy `LazyFrame` APIs, or calling `.collect()` too early** — which materializes
the whole result into RAM and throws away the query optimizer's pushdown/pruning.

```python
import polars as pl

# FOOTGUN: eager read pulls the ENTIRE file into RAM before any filter runs
df = pl.read_parquet("huge.parquet")          # full materialization, then filter
df = df.filter(pl.col("date") >= "2025-01-01")

# RIGHT: scan_* returns a LazyFrame; the predicate is PUSHED DOWN into the scan,
# so only matching row-groups are read. Nothing executes until .collect().
lf = (
    pl.scan_parquet("huge.parquet")
    .filter(pl.col("date") >= "2025-01-01")    # predicate pushdown
    .select("id", "amount")                    # projection pushdown (fewer columns read)
)
out = lf.collect()                             # ONE execution of the optimized plan

# FOOTGUN: collect() inside a loop re-plans and re-executes the whole graph each pass
for k in keys:
    lf.filter(pl.col("k") == k).collect()      # N full scans

# RIGHT: express the intent once and let the engine group it
out = lf.filter(pl.col("k").is_in(keys)).collect()
```
- `scan_csv` / `scan_parquet` / `scan_ndjson` produce a `LazyFrame`; `read_*`
  produce an eager `DataFrame`. Keep the pipeline lazy end-to-end and call
  `.collect()` **exactly once** at the sink. Inspect the plan with
  `lf.explain()` before running it. [pola.rs lazy-api user guide, retrieved 2026-07-10]
- `with_columns` / `select` return a NEW frame — Polars frames are immutable;
  there is no in-place mutation to "forget". Reassign or chain.

## Expression API vs Python UDFs (parallelism kill switch)
```python
# FOOTGUN: a Python callable per row serializes execution onto ONE core and
# defeats Polars' SIMD/multi-thread engine entirely
df = df.with_columns(
    pl.col("price").map_elements(lambda x: x * 0.1, return_dtype=pl.Float64)
)

# RIGHT: a native expression stays in Rust, vectorized and parallel across threads
df = df.with_columns((pl.col("price") * 0.1).alias("discount"))

# RIGHT: conditional logic as an expression, not an if/else in Python
df = df.with_columns(
    pl.when(pl.col("qty") > 100).then(pl.lit("bulk"))
      .otherwise(pl.lit("retail")).alias("tier")
)
```
- `map_elements` (formerly `apply`) and `map_batches` drop to Python and break
  parallelism; reach for them only when no expression exists. Prefer
  `pl.when/then/otherwise`, `.str.*`, `.dt.*`, `.list.*` namespaces.
  [pola.rs expressions/user-defined-functions guide, retrieved 2026-07-10]

## Streaming Engine (larger-than-RAM correctness)
```python
# RIGHT: streaming executes the plan in chunks so a result bigger than RAM
# never fully materializes. Use engine="streaming" (1.x) on collect, or sink_*.
out = (
    pl.scan_csv("100gb.csv")
    .group_by("category").agg(pl.col("amount").sum())
    .collect(engine="streaming")      # chunked execution
)

# RIGHT: sink straight to disk — never holds the full frame in memory at once
(
    pl.scan_csv("100gb.csv")
    .filter(pl.col("status") == "active")
    .sink_parquet("out.parquet")      # streaming write
)
```
- The streaming engine is selected via `collect(engine="streaming")` on Polars
  1.x (the older `collect(streaming=True)` keyword is deprecated); `sink_parquet`
  / `sink_csv` / `sink_ndjson` always stream. Not every operation supports
  streaming — check `explain(engine="streaming")`; unsupported nodes fall back to
  in-memory. [pola.rs 1.42.1 release notes + streaming docs, retrieved 2026-07-10]

## Correctness — strict typing, null vs NaN, join validation
```python
# FOOTGUN: null (missing) and NaN (float not-a-number) are DIFFERENT in Polars
df.filter(pl.col("x").is_null())      # missing values
df.filter(pl.col("x").is_nan())       # float NaN — a real f64 value, not null
df = df.with_columns(pl.col("x").fill_nan(None))   # normalize NaN -> null first

# FOOTGUN: a duplicate right-side key silently multiplies rows on join (fan-out)
joined = orders.join(customers, on="cust_id", how="left", validate="m:1")
# validate raises if the relationship is NOT many-to-one, turning a silent
# row-count explosion into an immediate error

# RIGHT: cast strictly so a bad value fails loudly instead of becoming null
df = df.with_columns(pl.col("id").cast(pl.Int64, strict=True))
```
- Polars distinguishes `null` (absence) from `NaN` (a float value); `==` never
  matches `null` — use `.is_null()` / `.fill_null()`. Pass `validate=` on joins
  when a key should be unique. [pola.rs missing-data + joins docs, retrieved 2026-07-10]

## Error Handling & Testing
```python
import polars as pl
from polars.testing import assert_frame_equal, assert_series_equal

# Compare frames in tests — never `df1 == df2` (elementwise, shape-fragile)
assert_frame_equal(result, expected, check_dtypes=True)   # dtype- and null-aware diff

# Fail loudly at boundaries: strict cast raises instead of coercing to null
try:
    df.with_columns(pl.col("amount").cast(pl.Float64, strict=True))
except pl.exceptions.ComputeError as e:
    raise ValueError(f"unparseable amount column: {e}") from e
```
- `polars.testing.assert_frame_equal` / `assert_series_equal` are the canonical
  dtype- and null-aware test helpers. A bare `==` returns an elementwise boolean
  frame (truth-value ambiguous, null-blind). Exceptions live under
  `polars.exceptions` (`ComputeError`, `SchemaError`, `ColumnNotFoundError`).
  [pola.rs testing API reference, retrieved 2026-07-10]

## Security — parameterized SQL when reading databases (CWE-89)
```python
import polars as pl

# FOOTGUN: string-formatting user input into read_database is SQL injection (CWE-89)
user_id = request.args["id"]
df = pl.read_database(f"SELECT * FROM orders WHERE user_id = {user_id}", conn)  # UNSAFE

# RIGHT: pass parameters through the DBAPI/connectorx binding, never f-strings
df = pl.read_database(
    "SELECT * FROM orders WHERE user_id = ?",
    connection=conn,
    execute_options={"parameters": [user_id]},
)
```
- Polars' `read_database` / `read_database_uri` delegate the query to the
  underlying driver (ADBC, connectorx, or a DBAPI cursor); interpolating
  untrusted input into the SQL string is classic SQL injection
  (**CWE-89**, https://cwe.mitre.org/data/definitions/89.html). Always bind
  parameters. No Polars CVE is published on OSV/PyPI as of 2026-07-10; the risk
  here is the SQL you hand to the driver, not Polars itself.
  [pola.rs io.database docs + OSV.dev polars query (empty), retrieved 2026-07-10]

## Performance Traps
- **Stay lazy, collect once.** Predicate + projection pushdown only fire on a
  `LazyFrame`; a `read_* -> filter` pipeline reads every column of every row first.
  Chain `scan_* -> filter -> select -> collect()` so the optimizer prunes I/O.
- **Never `map_elements`/`map_batches` on a hot path** — a Python callback drops
  off the multithreaded Rust engine onto one core (see Expression API section).
- **`Categorical`/`Enum` for low-cardinality strings** cuts memory and speeds
  joins/group-bys; string dtype is fine but heavier.
- **`engine="streaming"` for larger-than-RAM**, and prefer `sink_parquet` over
  `collect()` when the output itself is large. Read `explain()` to confirm
  pushdown actually happened before blaming the engine.
  [pola.rs performance / optimizations user guide, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **Polars 1.42.1** is the current stable release, published **2026-06-30**,
  `requires_python >= 3.10`. [pypi.org/project/polars JSON API +
  github.com/pola-rs/polars release py-1.42.1, retrieved 2026-07-10]
- **1.x streaming API**: use `collect(engine="streaming")`; the older
  `collect(streaming=True)` keyword is deprecated. `apply` on expressions was
  renamed `map_elements`; `map` on frames is `map_batches`. [pola.rs 1.x
  migration notes, retrieved 2026-07-10]
- **GPU engine**: `collect(engine="gpu")` runs the plan on NVIDIA GPUs via the
  cudf-polars backend (opt-in, extra install). [pola.rs GPU support docs,
  retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Polars releases (PyPI JSON): https://pypi.org/pypi/polars/json
- Polars 1.42.1 GitHub release: https://github.com/pola-rs/polars/releases/tag/py-1.42.1
- Lazy API user guide: https://docs.pola.rs/user-guide/lazy/
- Streaming / larger-than-RAM: https://docs.pola.rs/user-guide/concepts/streaming/
- Expressions & user-defined functions: https://docs.pola.rs/user-guide/expressions/user-defined-python-functions/
- Reading databases (SQL): https://docs.pola.rs/user-guide/io/database/
- Testing utilities: https://docs.pola.rs/api/python/stable/reference/testing.html
- CWE-89 (SQL injection): https://cwe.mitre.org/data/definitions/89.html
- OSV advisories for polars (empty as of 2026-07-10): https://osv.dev/list?ecosystem=PyPI&q=polars
