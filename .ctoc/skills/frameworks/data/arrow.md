# Apache Arrow CTO
> Language-agnostic columnar memory format for high-performance analytics.

## Commands
```bash
# Setup | Dev | Test
pip install pyarrow
python -c "import pyarrow as pa; print(pa.__version__)"
pytest tests/ -v
```

## Non-Negotiables
1. Zero-copy data sharing between processes/languages
2. Columnar format for analytical workloads
3. Explicit schema definition for interoperability
4. Memory mapping for files larger than RAM
5. Use Arrow IPC for cross-language communication
6. Parquet for persistent storage, Arrow for compute

## Red Lines
- Row-by-row processing of columnar data
- Ignoring schema evolution in data pipelines
- Unnecessary serialization/deserialization cycles
- Memory copies when zero-copy is possible
- Mixing incompatible Arrow versions across systems

## Pattern: High-Performance Data Pipeline
```python
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.compute as pc

# Define explicit schema
schema = pa.schema([
    ('id', pa.int64()),
    ('timestamp', pa.timestamp('us')),
    ('value', pa.float64()),
    ('category', pa.dictionary(pa.int32(), pa.string())),
])

# Memory-mapped reading for large files
mmap = pa.memory_map('large_data.arrow')
table = pa.ipc.open_file(mmap).read_all()

# Zero-copy slice (no memory allocation)
subset = table.slice(0, 1000)

# Compute with Arrow kernels (vectorized)
filtered = table.filter(pc.greater(table['value'], 100))
aggregated = pc.sum(filtered['value'])

# Write optimized Parquet with compression
pq.write_table(
    table,
    'output.parquet',
    compression='zstd',
    row_group_size=100_000,
    use_dictionary=['category'],
)
```

## Integrates With
- **DataFrames**: pandas, Polars, DuckDB native support
- **Distributed**: Spark, Dask, Ray via Arrow exchange
- **Languages**: R, Julia, Rust, C++ with zero-copy

## Common Errors
| Error | Fix |
|-------|-----|
| `ArrowInvalid: schema mismatch` | Ensure consistent schemas across sources |
| `ArrowMemoryError` | Use memory mapping or streaming reads |
| `ArrowNotImplementedError` | Check Arrow version for feature support |
| `Parquet read slow` | Use `columns` param to read only needed fields |

## Prod Ready
- [ ] Schema versioning for data evolution
- [ ] Memory mapping for large datasets
- [ ] Parquet with appropriate compression
- [ ] Dictionary encoding for categorical columns
- [ ] Arrow version pinned across systems
