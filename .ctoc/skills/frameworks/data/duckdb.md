# DuckDB CTO
> Claude Code correction guide. Updated January 2026.

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
