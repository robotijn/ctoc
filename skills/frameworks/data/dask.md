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

## Partition-Sizing Footguns (KilledWorker vs task overhead)
The single most common Dask failure Claude causes: **the wrong partition size**.
Too-large partitions blow a worker's memory (`KilledWorker`); too-many-tiny
partitions bury the scheduler under per-task overhead (each task ~1 ms of graph
bookkeeping, so 10M tasks is minutes of pure scheduling).

```python
import dask.dataframe as dd

# FOOTGUN: reading millions of tiny files gives millions of 1-row partitions
df = dd.read_parquet("s3://bucket/tiny-files/*.parquet")   # ~1 partition per file
print(df.npartitions)                                       # e.g. 2_000_000 — scheduler dies

# RIGHT: coalesce to ~100MB-1GB partitions AFTER load, before heavy ops
df = df.repartition(partition_size="256MB")
print(df.map_partitions(len).compute())                     # inspect real per-partition rows

# FOOTGUN: a filter that drops 99% of rows leaves partitions mostly empty (skew)
hot = df[df["value"] > 1e6]
# RIGHT: repartition after a selective filter so downstream tasks are balanced
hot = hot.repartition(partition_size="256MB")
```
- Target **100MB-1GB in-memory per partition** and keep total partition count in
  the low thousands, not millions. `repartition(partition_size=...)` coalesces;
  `set_index(...)` re-partitions AND sorts (expensive shuffle — see below).
  [docs.dask.org dataframe best-practices, retrieved 2026-07-10]

## persist vs compute (the two materialization verbs)
```python
from dask.distributed import Client
client = Client(n_workers=4, threads_per_worker=2, memory_limit="4GB")

# FOOTGUN: compute() in a loop rebuilds and re-executes the WHOLE graph each pass
for thr in thresholds:
    n = df[df["value"] > thr].shape[0].compute()   # full re-read every iteration

# RIGHT: persist() once to pin the shared upstream in cluster RAM, then compute
df = df.persist()                                  # materializes lazily, keeps in memory
for thr in thresholds:
    n = df[df["value"] > thr].shape[0].compute()   # reuses the persisted frame

# compute() returns a CONCRETE object to the client (pandas df / scalar) — never
# call it on something that doesn't fit in the driver's RAM
final = df.groupby("category").value.sum().compute()   # small result -> fine
```
- `persist()` triggers execution but **keeps the result distributed across worker
  memory** (returns a Dask collection); `compute()` triggers execution and
  **pulls the concrete result back to the client** (returns pandas/NumPy/scalar).
  Persist shared intermediates; compute final small results.
  [docs.dask.org managing-computation (persist vs compute), retrieved 2026-07-10]

## Shuffle, Task-Graph Blowup & Worker Spilling
```python
# FOOTGUN: groupby/merge/set_index on a non-index key triggers a full SHUFFLE —
# every partition exchanges data with every other (all-to-all, O(n) network + disk)
merged = big.merge(other, on="user_id")            # shuffle both sides
ranked = df.set_index("ts").rolling("1h").mean()   # set_index = sort + shuffle

# RIGHT: shrink data BEFORE the shuffle and shuffle on the smallest key possible
small = other[["user_id", "plan"]].drop_duplicates()
merged = big.merge(small, on="user_id", how="left")   # broadcast-friendly small side

# FOOTGUN: building a giant graph in Python (loop of appends) balloons the scheduler
parts = [dd.read_parquet(p) for p in thousands_of_paths]
df = dd.concat(parts)                              # graph with millions of nodes
# RIGHT: let the reader build ONE graph with a glob
df = dd.read_parquet("s3://bucket/data/*.parquet")
```
- A **shuffle** (from `groupby` on a non-index column, `merge`, `set_index`,
  `sort_values`) is the dominant cost: it spills to disk and saturates the
  network. Reduce/filter/select columns first. When a worker exceeds
  `memory_limit` it **spills to disk** (`~/dask-worker-space`) and, past the
  terminate fraction, is killed and its tasks retried (`KilledWorker`). Watch the
  dashboard at `localhost:8787`. Avoid constructing huge graphs in a Python loop —
  a graph with millions of nodes overwhelms the scheduler before any compute runs.
  [docs.dask.org shuffling + worker-memory docs, retrieved 2026-07-10]

## Correctness — index alignment & the lazy graph
```python
# FOOTGUN: operations across two frames with DIFFERENT divisions silently misalign
a = dd.read_parquet("a/*.parquet")          # divisions unknown
b = dd.read_parquet("b/*.parquet")
c = a["x"] + b["y"]                          # may align by position, not label

# RIGHT: set a common index so divisions are known and alignment is by label
a = a.set_index("id")
b = b.set_index("id")
c = (a["x"] + b["y"]).compute()

# The graph is LAZY: nothing above runs until compute()/persist(). An exception in
# a row you never .compute() will NOT surface — validate on a .head() sample first.
df.head(1000).pipe(validate_schema)
```
- Divisions (the known index boundaries per partition) are what let Dask align
  and merge cheaply; unknown divisions force a shuffle or misalign. Errors are
  deferred to compute time — test on `.head()`/`.sample()` before a full run.
  [docs.dask.org dataframe internals (divisions), retrieved 2026-07-10]

## Error Handling & Testing
```python
import dask.dataframe as dd
from dask.dataframe.utils import assert_eq

# assert_eq computes both sides and compares as pandas — the canonical Dask test
assert_eq(result, expected_pandas_df, check_index=True)

# Fail loudly: a KilledWorker means a partition exceeded memory — do not swallow it
from distributed.scheduler import KilledWorker
try:
    out = df.compute()
except KilledWorker as e:
    raise RuntimeError("partition too large — repartition to ~256MB") from e
```
- `dask.dataframe.utils.assert_eq` is the canonical helper: it computes the Dask
  collection and compares against the expected pandas object (index- and
  dtype-aware). Never swallow `KilledWorker` — it is the load-bearing signal that
  partitions are too large. [docs.dask.org testing utilities, retrieved 2026-07-10]

## Security — dashboard / scheduler exposure & cluster auth (CVE-2026-23528)
```python
from dask.distributed import Client

# FOOTGUN: binding the scheduler/dashboard to 0.0.0.0 on an untrusted network
# exposes an unauthenticated control plane — anyone who reaches it can submit code
client = Client("tcp://0.0.0.0:8786")              # UNSAFE on a shared/public host

# RIGHT: bind to localhost (or a private interface), tunnel the dashboard over SSH,
# and enable TLS for scheduler<->worker traffic on real clusters
client = Client("tcp://127.0.0.1:8786")
# dask.distributed supports TLS via `distributed.comm.tls.*` config keys
```
- **CVE-2026-23528** (GHSA-c336-7962-wfj2, published **2026-01-16**): a stored-XSS
  bug (**CWE-79**) in the Dask **dashboard** could lead to remote code execution
  when Dask distributed runs behind `jupyter-server-proxy` in JupyterLab — a
  crafted URL executes code in the Jupyter session. **Fixed in `distributed`
  `2026.1.0`; upgrade off any earlier release.** The dashboard/scheduler are an
  unauthenticated control plane by default — never expose them on an untrusted
  network (bind to localhost, tunnel over SSH, enable TLS). The older
  **CVE-2021-42343** (CWE-668) is the historical case where local-cluster workers
  bound to public interfaces. [github.com/dask/distributed advisory
  GHSA-c336-7962-wfj2 + nvd.nist.gov/vuln/detail/CVE-2026-23528, retrieved 2026-07-10]

## Performance Traps
- **Right-size partitions to ~100MB-1GB** and keep total count in the low
  thousands — the dominant Dask cost is either per-task scheduler overhead (too
  many tiny tasks) or `KilledWorker` from too-large partitions.
- **Minimize shuffles.** `groupby` on a non-index key, `merge`, `set_index`, and
  `sort_values` are all-to-all exchanges that spill to disk and saturate the
  network; filter and select columns *before* shuffling, and broadcast the small
  side of a join.
- **`persist()` shared intermediates** so the graph runs once, then `compute()`
  only the final small result back to the client.
- **Column pruning at read** (`columns=[...]`, `engine="pyarrow"`) plus the
  built-in query planner cut I/O before any compute. Watch `localhost:8787` for
  the real bottleneck. [docs.dask.org dataframe best-practices, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **Dask 2026.7.0** is the current stable release, published **2026-07-06**,
  `requires_python >= 3.10`; **`distributed` 2026.7.0** ships alongside it.
  [pypi.org/project/dask + pypi.org/project/distributed JSON APIs +
  github.com/dask/dask release 2026.7.0, retrieved 2026-07-10]
- **Query planner (dask-expr)**: the expression-based optimizer is now folded into
  `dask.dataframe` and on by default — it improves column pruning and predicate
  pushdown for parquet reads. [docs.dask.org dataframe query-planning, retrieved 2026-07-10]
- **Security floor**: run `distributed >= 2026.1.0` to clear CVE-2026-23528.
  [github advisory GHSA-c336-7962-wfj2, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Dask releases (PyPI JSON): https://pypi.org/pypi/dask/json
- distributed releases (PyPI JSON): https://pypi.org/pypi/distributed/json
- Dask 2026.7.0 GitHub release: https://github.com/dask/dask/releases/tag/2026.7.0
- DataFrame best practices (partitions): https://docs.dask.org/en/stable/dataframe-best-practices.html
- Managing computation (persist vs compute): https://docs.dask.org/en/stable/dataframe-best-practices.html#persist-intelligently
- Shuffling: https://docs.dask.org/en/stable/dataframe-groupby.html
- Worker memory & spilling: https://distributed.dask.org/en/stable/worker-memory.html
- CVE-2026-23528 (dashboard XSS -> RCE): https://nvd.nist.gov/vuln/detail/CVE-2026-23528
- GitHub advisory GHSA-c336-7962-wfj2: https://github.com/dask/distributed/security/advisories/GHSA-c336-7962-wfj2
- CWE-79 (cross-site scripting): https://cwe.mitre.org/data/definitions/79.html
- CWE-668 (exposure to wrong sphere): https://cwe.mitre.org/data/definitions/668.html
