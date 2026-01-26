# Vaex CTO
> Out-of-core DataFrame library for billion-row datasets on a laptop.

## Commands
```bash
# Setup | Dev | Test
pip install vaex
python -c "import vaex; print(vaex.__version__)"
pytest tests/ -v
```

## Non-Negotiables
1. Memory-mapped file formats (HDF5, Arrow) for lazy loading
2. Virtual columns for derived data without memory allocation
3. Lazy evaluation until explicit export or aggregation
4. Expression system for vectorized operations
5. Convert CSV/Parquet to HDF5 for repeated analysis
6. Use `export_hdf5()` for optimized storage

## Red Lines
- Loading entire dataset into memory
- Using pandas for billion-row exploration
- Ignoring expression-based filtering
- Skipping HDF5 conversion for repeated workloads
- Materializing virtual columns unnecessarily

## Pattern: Interactive Large Data Analysis
```python
import vaex

# Memory-mapped loading (instant, regardless of size)
df = vaex.open('large_data.hdf5')  # Or Arrow, Parquet

# Virtual columns (no memory, computed on-the-fly)
df['log_value'] = vaex.vlog(df['value'] + 1)
df['category_upper'] = df['category'].str.upper()

# Lazy filtering and aggregation
filtered = df[df['value'] > 100]
stats = filtered.groupby('category').agg({
    'value': ['mean', 'std', 'count'],
    'log_value': 'sum'
})

# Export subset to pandas for final analysis
result = stats.to_pandas_df()

# Convert from CSV for repeated use
vaex.from_csv('huge.csv', convert=True)  # Creates .hdf5
```

## Integrates With
- **Storage**: HDF5, Arrow, Parquet native support
- **Viz**: Built-in plotting with matplotlib backend
- **ML**: Vaex-ML for scalable preprocessing

## Common Errors
| Error | Fix |
|-------|-----|
| `MemoryError` on open | Use HDF5/Arrow format, not CSV |
| `Virtual column slow` | Materialize frequently used columns |
| `Expression evaluation error` | Check column dtypes match operation |
| `HDF5 lock error` | Use `vaex.open()` not `h5py` directly |

## Prod Ready
- [ ] Data converted to HDF5/Arrow format
- [ ] Virtual columns for derived fields
- [ ] Memory profiling validated
- [ ] Chunked exports for large outputs
- [ ] Expression-based filtering for all queries
