# pandas CTO
> DataFrame manipulation mastery.

## Non-Negotiables
1. .loc[]/.iloc[] not chained indexing
2. Vectorized operations, never iterate
3. Proper dtypes (category for strings)
4. Method chaining with .pipe()

## Red Lines
- For loops over rows
- SettingWithCopyWarning ignored
- Memory issues (use polars/dask)
