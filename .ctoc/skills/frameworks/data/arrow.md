# Apache Arrow CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install pyarrow>=15.0
# Includes Parquet, IPC, compute kernels
```

## Claude's Common Mistakes
1. **Row-by-row processing** - Arrow is columnar; process columns, not rows
2. **Unnecessary serialization** - Use zero-copy when possible
3. **Ignoring schema evolution** - Define schemas explicitly for pipelines
4. **Memory copies on conversion** - pandas/Polars can share Arrow memory
5. **Wrong compression for use case** - zstd for storage, lz4 for speed

## Correct Patterns (2026)
```python
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.compute as pc

# Explicit schema (required for robust pipelines)
schema = pa.schema([
    ('id', pa.int64()),
    ('timestamp', pa.timestamp('us')),
    ('value', pa.float64()),
    ('category', pa.dictionary(pa.int32(), pa.string())),  # Dict encoding
])

# Memory-mapped reading (larger than RAM)
mmap = pa.memory_map('large_data.arrow')
table = pa.ipc.open_file(mmap).read_all()

# Zero-copy slice
subset = table.slice(0, 1000)  # No memory allocation

# Vectorized compute with Arrow kernels
filtered = table.filter(pc.greater(table['value'], 100))
total = pc.sum(filtered['value'])

# Write optimized Parquet
pq.write_table(
    table, 'output.parquet',
    compression='zstd',
    row_group_size=100_000,
    use_dictionary=['category'],
)

# Zero-copy to pandas (pyarrow backend)
df = table.to_pandas(types_mapper=pd.ArrowDtype)
```

## Version Gotchas
- **v15+**: Improved pandas StringDtype integration
- **Schema evolution**: Use union_by_name for reading mixed schemas
- **IPC vs Parquet**: IPC for streaming/memory; Parquet for storage
- **With pandas 2.x**: Use dtype_backend="pyarrow" for zero-copy

## What NOT to Do
- Do NOT process rows one at a time (use columnar operations)
- Do NOT convert to pandas without types_mapper (copies data)
- Do NOT ignore schema mismatches across files
- Do NOT use gzip compression (zstd is faster and smaller)
