# Dask CTO
> Parallel computing for analytics: pandas and NumPy at scale.

## Commands
```bash
# Setup | Dev | Test
pip install dask[complete] distributed
dask scheduler & dask worker tcp://localhost:8786
pytest tests/ -v
```

## Non-Negotiables
1. Appropriate partition sizes (100MB-1GB per partition)
2. Persist intermediate results for reuse
3. Monitor via distributed dashboard (localhost:8787)
4. Prefer Dask DataFrame for pandas-like workflows
5. Use `compute()` only when results needed
6. Set memory limits per worker

## Red Lines
- Partitions too small (task overhead) or too large (memory issues)
- Calling `compute()` in loops
- Ignoring the dashboard during debugging
- Operations requiring full shuffle without repartitioning
- Using Dask when data fits in memory

## Pattern: Scalable ETL Pipeline
```python
import dask.dataframe as dd
from dask.distributed import Client

# Initialize distributed client
client = Client(n_workers=4, threads_per_worker=2, memory_limit='4GB')

# Lazy load with optimized partitions
df = dd.read_parquet(
    's3://bucket/data/*.parquet',
    columns=['id', 'date', 'value', 'category'],
    engine='pyarrow',
)

# Chain transformations (builds task graph)
result = (
    df[df['value'] > 0]
    .assign(year=df['date'].dt.year)
    .groupby(['year', 'category'])
    .agg({'value': ['sum', 'mean', 'count']})
    .reset_index()
    .repartition(npartitions=10)  # Optimize for output
)

# Persist for reuse, then compute
result = result.persist()
print(f"Partitions: {result.npartitions}")
final = result.compute()

# Write distributed output
result.to_parquet('s3://bucket/output/', engine='pyarrow')
```

## Integrates With
- **Compute**: Local threads, distributed cluster, Kubernetes
- **Storage**: S3, GCS, HDFS via fsspec
- **ML**: Dask-ML for scalable preprocessing

## Common Errors
| Error | Fix |
|-------|-----|
| `KilledWorker` | Reduce partition size or increase worker memory |
| `MemoryError` on compute | Persist intermediate results first |
| `Scheduler timeout` | Check network connectivity, increase timeout |
| `Task graph too large` | Repartition or persist before further ops |

## Prod Ready
- [ ] Distributed cluster for production workloads
- [ ] Memory limits configured per worker
- [ ] Dashboard monitoring enabled
- [ ] Partition sizes optimized (100MB-1GB)
- [ ] Retry logic for transient failures
