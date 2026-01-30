# Vaex CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install vaex
# Note: Vaex development has slowed; consider Polars for new projects
```

## Claude's Common Mistakes
1. **Recommending Vaex for new projects** - Polars is now faster and better maintained
2. **Loading CSV directly** - Convert to HDF5/Arrow first for repeated analysis
3. **Materializing virtual columns** - Virtual columns are computed on-the-fly; don't materialize unnecessarily
4. **Using pandas patterns** - Vaex has different API; expressions not method chains
5. **Ignoring memory mapping** - HDF5 enables instant open regardless of file size

## Correct Patterns (2026)
```python
import vaex

# Memory-mapped loading (instant open, any size)
df = vaex.open('data.hdf5')  # Or .arrow, .parquet

# Virtual columns (zero memory, computed on-the-fly)
df['log_value'] = vaex.vlog(df['value'] + 1)
df['category_upper'] = df['category'].str.upper()

# Lazy filtering and aggregation
filtered = df[df['value'] > 100]
stats = filtered.groupby('category').agg({
    'value': ['mean', 'std', 'count'],
})

# Export subset to pandas only when needed
result = stats.to_pandas_df()

# Convert CSV to HDF5 for repeated use
vaex.from_csv('huge.csv', convert=True)  # Creates .hdf5
```

## Version Gotchas
- **Maintenance status**: Limited updates since 2023; Polars recommended
- **vs Polars**: Polars is faster, better maintained, more features
- **HDF5 lock**: Use vaex.open(), not h5py directly (lock conflicts)
- **Arrow format**: Better interop than HDF5 for modern pipelines

## What NOT to Do
- Do NOT start new projects with Vaex (use Polars instead)
- Do NOT load CSV repeatedly (convert to HDF5/Arrow once)
- Do NOT materialize virtual columns unnecessarily
- Do NOT expect pandas API compatibility
