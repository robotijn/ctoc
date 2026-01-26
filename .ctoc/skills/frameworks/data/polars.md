# polars CTO
> 10-100x faster than pandas.

## Non-Negotiables
1. Lazy mode for optimization
2. Expressions, not apply()
3. scan_csv/parquet for large files
4. Let polars optimize

## Pattern
```python
result = (
    pl.scan_csv("large.csv")
    .filter(pl.col("age") > 25)
    .group_by("category")
    .agg(pl.col("value").mean())
    .collect()
)
```
