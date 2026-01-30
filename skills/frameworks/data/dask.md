# Dask CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "dask[complete]" distributed
# For cluster: dask scheduler & dask worker tcp://localhost:8786
```

## Claude's Common Mistakes
1. **Using Dask for small data** - If it fits in memory, use pandas/Polars
2. **compute() in loops** - Builds new task graph each time; use persist()
3. **Wrong partition size** - Too small = overhead; too large = OOM
4. **Ignoring dashboard** - localhost:8787 shows task progress and memory
5. **Shuffles without repartition** - Causes memory explosion

## Correct Patterns (2026)
```python
import dask.dataframe as dd
from dask.distributed import Client

# Distributed client with memory limits
client = Client(n_workers=4, threads_per_worker=2, memory_limit='4GB')
print(client.dashboard_link)  # Monitor at localhost:8787

# Lazy load with partition optimization
df = dd.read_parquet(
    's3://bucket/data/*.parquet',
    columns=['id', 'date', 'value', 'category'],  # Column pruning
    engine='pyarrow',
)

# Build task graph (no computation yet)
result = (
    df[df['value'] > 0]
    .assign(year=df['date'].dt.year)
    .groupby(['year', 'category'])
    .agg({'value': ['sum', 'mean']})
    .repartition(npartitions=10)  # Optimize before shuffle
)

# Persist for reuse (keeps in cluster memory)
result = result.persist()

# Compute only at the end
final = result.compute()

# Write distributed (no compute() needed)
result.to_parquet('s3://bucket/output/', engine='pyarrow')
```

## Version Gotchas
- **Dask-expr**: New query optimizer in 2024+; faster planning
- **Partition size**: Target 100MB-1GB per partition
- **vs Polars**: Polars faster for single-machine; Dask for cluster
- **With Coiled**: Managed Dask clusters on AWS/GCP

## What NOT to Do
- Do NOT use Dask for data that fits in memory
- Do NOT call compute() in loops (persist + single compute)
- Do NOT ignore partition sizing (KilledWorker = too large)
- Do NOT skip the dashboard for debugging
