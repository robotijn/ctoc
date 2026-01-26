# Polars CTO
> Lightning-fast DataFrame library: 10-100x faster than pandas with lazy evaluation.

## Commands
```bash
# Setup | Dev | Test
pip install polars[all]
python -c "import polars as pl; print(pl.__version__)"
pytest tests/ -v
```

## Non-Negotiables
1. Lazy mode by default for query optimization
2. Expressions over `apply()` (vectorized, parallelized)
3. `scan_*` functions for large files (streaming reads)
4. Let the query optimizer reorder operations
5. Explicit schema definitions for production
6. Use `collect()` only at pipeline end

## Red Lines
- Eager mode for large datasets
- Python `apply()` functions killing parallelism
- Ignoring lazy evaluation's optimization benefits
- Converting to pandas unnecessarily
- Missing null handling in critical columns

## Pattern: Optimized Data Pipeline
```python
import polars as pl

# Lazy pipeline with full optimization
result = (
    pl.scan_parquet("s3://bucket/events/*.parquet")
    .filter(pl.col("timestamp") >= pl.lit("2024-01-01").str.to_datetime())
    .with_columns([
        pl.col("amount").cast(pl.Float64),
        pl.col("category").cast(pl.Categorical),
    ])
    .group_by(["category", pl.col("timestamp").dt.truncate("1d").alias("date")])
    .agg([
        pl.col("amount").sum().alias("total"),
        pl.col("amount").mean().alias("avg"),
        pl.len().alias("count"),
    ])
    .sort(["date", "total"], descending=[False, True])
    .collect(streaming=True)  # Memory-efficient for large data
)

# Sink directly to Parquet without loading to memory
(
    pl.scan_csv("large.csv")
    .filter(pl.col("status") == "active")
    .sink_parquet("output.parquet")
)
```

## Integrates With
- **DuckDB**: Seamless interop via Arrow
- **Cloud**: Native S3/GCS/Azure support
- **ML**: Direct NumPy array export for models

## Common Errors
| Error | Fix |
|-------|-----|
| `SchemaError: column not found` | Check column names and lazy schema |
| `ComputeError: strict cast failed` | Use `strict=False` or handle nulls first |
| `OutOfMemory` on collect | Use `streaming=True` or `sink_*` methods |
| `InvalidOperationError` | Check expression compatibility in context |

## Prod Ready
- [ ] Lazy evaluation for all pipelines
- [ ] Streaming mode for large datasets
- [ ] Schema validation at boundaries
- [ ] Categorical types for string columns
- [ ] Memory profiling with `estimate_size()`
