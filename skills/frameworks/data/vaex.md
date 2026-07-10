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

## Out-of-Core Footguns (memory-mapped, not in-RAM)
The core misunderstanding Claude has about Vaex: **`vaex.open()` memory-maps the
file — it does NOT read it into RAM.** The OS pages data in on demand, so opening
a 1TB HDF5/Arrow file is instant and near-zero-memory. The footgun is any
operation that breaks memory-mapping and forces a full in-RAM materialization.

```python
import vaex

# RIGHT: memory-mapped open — instant, near-zero RAM, out-of-core from here on
df = vaex.open("data.hdf5")        # or .arrow, .parquet (columnar, mmap-able)

# FOOTGUN: from_csv without convert reads the WHOLE csv into RAM (CSV is row-oriented,
# not memory-mappable) — defeats the entire point of Vaex on a large file
df = vaex.from_csv("100gb.csv")                    # OOM

# RIGHT: convert once to HDF5/Arrow; subsequent opens are memory-mapped
vaex.from_csv("100gb.csv", convert="100gb.hdf5", chunk_size=5_000_000)
df = vaex.open("100gb.hdf5")                       # mmap, out-of-core

# FOOTGUN: to_pandas_df() / values pulls the full column set into RAM at once
big = df.to_pandas_df()                            # materializes everything
# RIGHT: export only the reduced result you actually need
summary = df.groupby("category", agg=vaex.agg.sum("amount")).to_pandas_df()
```
- Memory-mapping only works on columnar, mmap-friendly formats (**HDF5, Arrow,
  Parquet**) — never on CSV/JSON. `to_pandas_df()`, `.values`, and materializing a
  virtual column all break out-of-core execution by forcing an in-RAM copy; apply
  them only to already-reduced results. [vaex.io out-of-core dataframe docs,
  retrieved 2026-07-10]

## Virtual Columns & Expressions (lazy, zero-copy)
```python
# RIGHT: a virtual column stores the EXPRESSION, not data — zero memory, computed
# on-the-fly per chunk during evaluation
df["log_amount"] = np.log(df["amount"] + 1)        # virtual, lazy
df["upper_cat"] = df["category"].str.upper()       # virtual, lazy
print(df["log_amount"].expression)                 # inspect the stored expression

# FOOTGUN: materializing a virtual column allocates a full in-RAM array
df = df.materialize("log_amount")                  # now it costs len(df) * 8 bytes

# FOOTGUN: .apply() drops to a per-row PYTHON callback — no vectorization, single core
df["x"] = df.apply(lambda a, b: a * b, arguments=[df.a, df.b])   # slow Python loop
# RIGHT: express it as a vectorized column expression (stays in C/NumPy)
df["x"] = df.a * df.b
```
- Virtual columns are **lazy expressions** evaluated in chunks — they cost no
  memory until materialized. Only `materialize()` when the same expensive
  expression is reused many times AND fits in RAM. `df.apply()` is a Python
  fallback that serializes onto one core; prefer expression arithmetic and the
  `.str.*` / `np.*` vectorized functions. [vaex.io expressions + virtual-columns
  docs, retrieved 2026-07-10]

## Selection vs Filter, and string-heavy memory
```python
# selection: a named boolean mask kept WITH the frame, reused across aggregations
# without copying rows (out-of-core friendly)
df.select(df["value"] > 100, name="hot")
df.mean(df["amount"], selection="hot")
df.count(selection="hot")

# filter: returns a shallow-copied view with the predicate applied lazily
hot = df[df["value"] > 100]                        # lazy filtered view, no row copy

# FOOTGUN: string columns are the memory hog in Vaex — a wide string column
# materialized into pandas can dwarf the numeric footprint
# RIGHT: keep strings out-of-core; reduce/aggregate before to_pandas_df()
```
- A **selection** is a named mask you compute statistics against repeatedly
  without materializing subsets; a **filter** (`df[bool_expr]`) yields a lazy view.
  Both stay out-of-core. String columns dominate memory once materialized — keep
  them memory-mapped and export only aggregates. [vaex.io selections + strings
  docs, retrieved 2026-07-10]

## Correctness — lazy evaluation caching & groupby binning
```python
# FOOTGUN: histogram/statistics on a continuous key without binning is meaningless
# or explodes cardinality
df.groupby("price", agg=vaex.agg.count())          # one group per distinct float!

# RIGHT: bin continuous values, then aggregate (Vaex's core out-of-core strength)
df.groupby(vaex.BinnerScalar("price", limits=[0, 1000], bins=50),
           agg=vaex.agg.count())

# Lazy evaluation: statistics are computed on demand; identical repeated aggregations
# hit Vaex's internal cache, but changing a virtual column invalidates dependents
df["z"] = (df["x"] - df.mean(df["x"])) / df.std(df["x"])   # two passes, then virtual
```
- Vaex evaluates aggregations lazily and caches passes; `groupby`/`binby` on a
  **continuous** column must be **binned** (`vaex.BinnerScalar` / `binby`) or you
  get one group per distinct float. Redefining an upstream virtual column
  invalidates cached results that depend on it. [vaex.io binning + statistics
  docs, retrieved 2026-07-10]

## Error Handling & Testing
```python
import vaex
import numpy as np

# Build a deterministic in-memory frame for tests (no external file needed)
df = vaex.from_arrays(x=np.arange(5), y=np.arange(5) * 2.0)

# Assert on evaluated scalars/arrays — evaluate() forces the lazy expression to run
assert df["y"].sum() == 20.0
np.testing.assert_allclose(df.evaluate(df["y"]), [0, 2, 4, 6, 8])

# Fail loudly on a missing/locked HDF5 rather than silently proceeding
try:
    df = vaex.open("data.hdf5")
except (OSError, ValueError) as e:
    raise RuntimeError(f"cannot memory-map data.hdf5: {e}") from e
```
- `vaex.from_arrays` / `from_pandas` build deterministic test frames with no file
  I/O; `.evaluate(expr)` forces a lazy expression so you can assert on concrete
  arrays. Catch `OSError`/`ValueError` from `vaex.open` (a locked or corrupt HDF5)
  instead of letting it surface later. [vaex.io api reference, retrieved 2026-07-10]

## Security — file-path handling
```python
import os, vaex

# FOOTGUN: opening a user-supplied path lets a request read arbitrary files
path = request.args["dataset"]
df = vaex.open(path)                               # path traversal risk

# RIGHT: resolve against a fixed data root and reject anything that escapes it
root = "/srv/datasets"
full = os.path.realpath(os.path.join(root, path))
if not full.startswith(root + os.sep):
    raise ValueError("dataset path escapes the data root")
df = vaex.open(full)
```
- `vaex.open` / `from_csv` take a filesystem (or remote) path; passing untrusted
  input unchecked is a path-traversal surface. Canonicalize with
  `os.path.realpath` and confine to a data root. No Vaex CVE is published on
  OSV/PyPI as of 2026-07-10; the exposure is in the paths and formats you feed it.
  [OSV.dev vaex query (empty) + vaex.io i/o docs, retrieved 2026-07-10]

## Performance Traps
- **Keep it memory-mapped.** Open HDF5/Arrow/Parquet with `vaex.open()` and never
  materialize a full column or call `to_pandas_df()` on the whole frame — that
  breaks out-of-core execution and pulls everything into RAM.
- **Virtual columns are free until materialized.** Only `materialize()` an
  expression that is reused many times AND fits in RAM; otherwise leave it lazy.
- **Avoid `df.apply()`** — it is a per-row Python callback on a single core; use
  vectorized column arithmetic and the `.str.*` / `np.*` functions instead.
- **Bin continuous keys** (`vaex.BinnerScalar` / `binby`) rather than grouping on a
  raw float, and use named **selections** to compute many statistics over the same
  mask without copying rows. [vaex.io out-of-core + statistics docs, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **Vaex 4.19.0** is the current release (meta-package uploaded **2026-02-03**,
  `vaex-core` 4.19.0 uploaded 2025-09-03). Release cadence is slow — 4.17.0 (2023)
  → 4.18.0 (2024) → 4.19.0 — confirming Vaex is **in maintenance, not active
  feature development**; for new larger-than-RAM work prefer **Polars 1.42.1**
  (streaming engine) or **Dask 2026.7.0**. [pypi.org/project/vaex +
  pypi.org/project/vaex-core JSON APIs, retrieved 2026-07-10]
- **HDF5 vs Arrow**: prefer **Arrow/Parquet** for new files — better interop with
  the modern columnar ecosystem than HDF5, and still memory-mappable. Use
  `vaex.open()` (never raw `h5py`) so Vaex manages the memory-map/lock.
  [vaex.io i/o docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Vaex releases (PyPI JSON): https://pypi.org/pypi/vaex/json
- vaex-core releases (PyPI JSON): https://pypi.org/pypi/vaex-core/json
- Vaex out-of-core dataframe docs: https://vaex.io/docs/index.html
- Expressions & virtual columns: https://vaex.io/docs/tutorial.html#Virtual-columns
- Binning & statistics: https://vaex.io/docs/tutorial.html#Binning
- I/O & file formats: https://vaex.io/docs/guides/io.html
- OSV advisories for vaex (empty as of 2026-07-10): https://osv.dev/list?ecosystem=PyPI&q=vaex
- CWE-22 (path traversal): https://cwe.mitre.org/data/definitions/22.html
