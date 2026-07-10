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

## Memory Footguns (zero-copy vs copy · pools · chunking · RecordBatch vs Table)
"Zero-copy" is conditional. The moment a conversion needs a different memory layout,
Arrow silently *copies*, and your "efficient" pipeline doubles its RAM.

```python
import pyarrow as pa

# FOOTGUN: to_pandas() copies by default, and holds BOTH the Arrow buffers AND the
# pandas result alive at peak -> ~2x memory for the duration of the conversion.
df = table.to_pandas()                       # full copy; peak = Arrow + pandas

# Reduce peak: free each Arrow column as it is converted, and split into blocks.
df = table.to_pandas(self_destruct=True, split_blocks=True)  # frees Arrow buffers as it goes
# NB: after self_destruct=True the `table` is INVALID — touching it is undefined.

# Truly zero-copy back to pandas only for pyarrow-backed dtypes (no numpy conversion):
df = table.to_pandas(types_mapper=pd.ArrowDtype)   # shares buffers; immutable strings

# Numeric columns with NO nulls are zero-copy to numpy; a single null forces a copy
# (numpy has no null bitmap) — a nullable int column becomes float64 or object.
arr = table.column("value").combine_chunks().to_numpy(zero_copy_only=True)  # raises if it can't
```

- **Memory pool**: Arrow allocates through a `MemoryPool`
  (`pa.total_allocated_bytes()` shows live usage). Building with **jemalloc/mimalloc**
  matters because the default system allocator often does NOT return freed pages to
  the OS, so RSS stays high after a big `to_pandas`. Watch `pool.bytes_allocated()`
  vs. process RSS to distinguish a leak from allocator retention.
- **ChunkedArray vs Array**: a `Table` column is a **ChunkedArray** (a list of
  contiguous chunks). Many kernels and `to_numpy(zero_copy_only=True)` require a
  single contiguous buffer — call `.combine_chunks()` first, but know that
  materializes a copy. Blindly `combine_chunks()` on a huge table is itself a memory
  spike.
- **RecordBatch vs Table**: a `RecordBatch` is one contiguous columnar batch; a
  `Table` is a logical concat of many batches (zero-copy, no single buffer). Stream
  `RecordBatch`es (`RecordBatchReader`) for bounded memory; only build a `Table` when
  you need the whole thing at once.

## Correctness (null bitmap · dictionary encoding · type mapping)
- Every Arrow array carries a separate **null (validity) bitmap**; "0" and "null" are
  distinct. Converting to a numpy dtype that can't represent null (plain `int64`)
  either raises or upcasts — assert the dtype after conversion.
- **Dictionary encoding** (`pa.dictionary(pa.int32(), pa.string())`) stores indices +
  a values dictionary. Concatenating batches with *different* dictionaries requires
  unification (`unify_dictionaries`) or you get wrong decoded values — don't assume
  dictionaries are shared across files.
- **Type mapping to pandas**: without `types_mapper`, Arrow strings become numpy
  `object`, timestamps may lose timezone/unit, and nullable ints upcast to float.
  Pass `types_mapper=pd.ArrowDtype` (pandas 2.x+) to preserve types and share buffers.

## Security (untrusted IPC / Parquet deserialization boundary)
Treat any Arrow IPC/Feather/Parquet stream from an untrusted source as hostile input.

- **CVE-2023-47248** (CWE-502, published 2023-11-09): deserialization of untrusted
  data in the **PyArrow** IPC and Parquet readers (versions 0.14.0–14.0.0) allowed
  arbitrary code execution when reading attacker-supplied files. Fixed in 14.0.1 /
  mitigable via the `pyarrow-hotfix` shim on old pins — **never read untrusted Arrow
  data on a vulnerable PyArrow**.
  [nvd.nist.gov/vuln/detail/CVE-2023-47248, retrieved 2026-07-10]
- **CVE-2026-25087** (CWE-416 use-after-free, published 2026-02-17): affects **Apache
  Arrow C++ 15.0.0–23.0.0**, triggered when reading an Arrow **IPC file** (not a
  stream) with pre-buffering enabled that contains variadic buffers (Binary/String
  View). Upgrade past the fixed version and disable pre-buffering when parsing
  untrusted IPC files.
  [nvd.nist.gov/vuln/detail/CVE-2026-25087, retrieved 2026-07-10]
- Validate the schema of an incoming stream against an EXPECTED schema before
  processing; bound message sizes; do not deserialize IPC from an origin you don't
  control without an up-to-date pyarrow.

## Testing
```python
import pyarrow as pa

def test_zero_copy_only_raises_on_nulls():
    # A column with a null CANNOT be zero-copy to numpy int64 — assert it fails loud.
    col = pa.chunked_array([pa.array([1, 2, None], type=pa.int64())])
    try:
        col.combine_chunks().to_numpy(zero_copy_only=True)
        assert False, "expected zero_copy_only to raise on a null-bearing column"
    except pa.lib.ArrowInvalid:
        pass

def test_allocation_released(pool=pa.default_memory_pool()):
    before = pool.bytes_allocated()
    t = pa.table({"x": pa.array(range(1_000_000))})
    del t
    assert pool.bytes_allocated() <= before + 8  # buffers freed back to the pool
```
- Test the **zero-copy boundary** (`zero_copy_only=True` must raise, not silently
  copy) and **pool accounting** (`bytes_allocated` returns to baseline) so a
  copy-regression or a retained-buffer leak fails in CI.

## Performance
- Prefer **`RecordBatchReader` streaming** over materializing a `Table` for
  larger-than-memory data; bound memory by processing batch-by-batch.
- `to_pandas(self_destruct=True, split_blocks=True)` roughly halves peak RSS on big
  conversions (frees Arrow buffers incrementally) — at the cost of invalidating the
  source table. Use `zstd` for storage, `lz4` for hot-path speed (per install notes).
- Keep dictionary-encoded low-cardinality columns dictionary-encoded end-to-end;
  decoding to plain strings inflates memory and defeats the encoding.

## Version-Specific Gotchas (dated, sourced)
- **pyarrow 25.0.0** is the current stable release, uploaded **2026-07-10**,
  `requires_python >=3.10`; it tracks the Apache Arrow 25.0.0 C++ core.
  [pypi.org/pypi/pyarrow/json, retrieved 2026-07-10]
- **Apache Arrow 25.0.0** was published **2026-07-10**.
  [github.com/apache/arrow/releases (apache-arrow-25.0.0), retrieved 2026-07-10]
- With **pandas 2.x+**, `types_mapper=pd.ArrowDtype` / `dtype_backend="pyarrow"` gives
  the zero-copy, type-preserving conversion; older pyarrow lacked `ArrowDtype`
  round-tripping. Do not pin pyarrow below 14.0.1 — that band carries CVE-2023-47248.
  [arrow.apache.org/docs/python/pandas.html, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- pyarrow releases (PyPI JSON): https://pypi.org/pypi/pyarrow/json
- Apache Arrow releases: https://github.com/apache/arrow/releases
- Pandas integration (zero-copy / self_destruct / types_mapper): https://arrow.apache.org/docs/python/pandas.html
- Memory & IO (pools, jemalloc, IPC): https://arrow.apache.org/docs/python/memory.html
- CVE-2023-47248 (PyArrow IPC/Parquet RCE): https://nvd.nist.gov/vuln/detail/CVE-2023-47248
- CVE-2026-25087 (Arrow C++ IPC use-after-free): https://nvd.nist.gov/vuln/detail/CVE-2026-25087
- CWE-502 (deserialization of untrusted data): https://cwe.mitre.org/data/definitions/502.html
