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
