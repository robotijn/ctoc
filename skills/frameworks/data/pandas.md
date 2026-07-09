# pandas CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "pandas[performance,parquet]>=2.2"
# PyArrow required for modern string handling and performance
pip install pyarrow
```

## Claude's Common Mistakes
1. **Chained indexing** - `df[col][row]` causes SettingWithCopyWarning; use `.loc[]`
2. **Iterating with for loops** - 100x slower than vectorized operations
3. **Not using Copy-on-Write** - Default in pandas 3.0; enable now for safety
4. **Ignoring PyArrow backend** - 5-10x faster strings, 50% less memory
5. **apply() when vectorized exists** - apply() is slow; use native methods

## Correct Patterns (2026)
```python
import pandas as pd

# Enable future defaults (pandas 3.0 behavior)
pd.options.mode.copy_on_write = True
pd.options.future.infer_string = True  # PyArrow-backed strings

# Load with PyArrow backend (faster, less memory)
df = pd.read_parquet("data.parquet", dtype_backend="pyarrow")

# Method chaining with pipe (readable, maintainable)
result = (
    df
    .pipe(validate_schema)
    .assign(
        date=lambda d: pd.to_datetime(d["date"]),
        category=lambda d: d["category"].astype("category"),
    )
    .loc[lambda d: d["value"].notna()]
    .groupby("category", observed=True)
    .agg({"value": ["sum", "mean"]})
)

# Vectorized operations (not apply)
df["discount"] = df["price"] * 0.1  # Good
# df["discount"] = df["price"].apply(lambda x: x * 0.1)  # Bad

# Explicit .loc for assignment
df.loc[df["status"] == "active", "flag"] = True
```

## Version Gotchas
- **v2.2->v3.0**: Copy-on-Write becomes default and only mode
- **v3.0**: PyArrow-backed strings default; `pd.options.future.infer_string`
- **v3.0**: `pd.col` expressions for cleaner column selection
- **PyArrow strings**: Immutable; zero-copy to NumPy not always possible

## What NOT to Do
- Do NOT use chained indexing `df["a"]["b"]` (unpredictable)
- Do NOT iterate rows with `for i, row in df.iterrows()` (use vectorized)
- Do NOT use apply() when vectorized alternative exists
- Do NOT ignore SettingWithCopyWarning (real bugs)

## SettingWithCopyWarning / Chained Indexing (the silent-write footgun)
The single most common pandas data-correctness bug Claude writes: **chained
indexing on the left of an assignment**. `df[mask]["col"] = x` selects `df[mask]`
first (which may return a *copy*, not a view), then assigns into that throwaway
copy — the original `df` is **never modified**, and pandas can only *warn* because
it cannot know at parse time whether the intermediate was a view or a copy.

```python
import pandas as pd

# FOOTGUN: two-step "chained" indexing — the write may hit a temporary copy
df[df["status"] == "active"]["flag"] = True     # SettingWithCopyWarning; df unchanged

# FOOTGUN: same trap in the other order
df["flag"][df["status"] == "active"] = True     # also chained; unreliable

# RIGHT: a SINGLE .loc[] call — row selector AND column in one indexing op
df.loc[df["status"] == "active", "flag"] = True # one step, always writes through
```
- The rule: **one `.loc[]` / `.iloc[]` call**, never `[...][...]`. If you took a
  boolean/label slice and want an independent object, call `.copy()` explicitly so
  intent is unambiguous — otherwise you are gambling on view-vs-copy.
- In **pandas 3.0** Copy-on-Write is the default (see Version-Specific Gotchas):
  chained *assignment* now reliably raises `ChainedAssignmentError` instead of a
  soft warning, so the "it silently did nothing" trap becomes a loud failure — but
  the fix is identical: use a single `.loc[]`. [pandas.pydata.org indexing +
  copy_on_write user guides, retrieved 2026-07-09; see References]

## Copy-vs-View & dtype/NA Gotchas
```python
# FOOTGUN: slice-then-mutate assumes a view; under CoW it is decoupled from parent
sub = df.iloc[:100]
sub["x"] = 0            # does NOT propagate to df under pandas 3.0 CoW — by design

# RIGHT: mutate the parent through .loc, or take an explicit .copy() to work isolated
df.loc[:99, "x"] = 0                 # write through to the real frame
sub = df.iloc[:100].copy()           # explicit, isolated working set

# NA / dtype footgun: an int column with ONE missing value silently upcasts to float64
s = pd.Series([1, 2, None])          # dtype float64 -> 1.0, 2.0, NaN (precision/identity loss)
s = pd.Series([1, 2, None], dtype="Int64")   # RIGHT: nullable integer keeps <NA>, stays integer

# object dtype hides the problem: comparisons and groupby keys behave inconsistently
df["id"] = df["id"].astype("Int64")  # nullable int, not float; not object
```
- `NaN != NaN`, so `==` never matches missing values — use `.isna()` / `.fillna()`.
  Mixing `np.nan` (float) and `pd.NA` (nullable/`NaType`) in one column produces
  inconsistent comparison results; pick one NA model per column.
- Nullable extension dtypes (`Int64`, `boolean`, `Float64`, `string`) preserve
  integer/boolean identity through missing data; the classic numpy-backed dtypes
  cannot represent NA without upcasting to `float64`/`object`.
  [pandas.pydata.org missing-data + integer-NA user guides, retrieved 2026-07-09]

## groupby / merge Pitfalls
```python
# FOOTGUN: categorical groupby emits EVERY category (incl. empty ones) by default
df.groupby("cat").size()                    # includes unobserved categories as 0
df.groupby("cat", observed=True).size()     # RIGHT: only groups actually present

# FOOTGUN: transform vs apply have different shapes
df.groupby("k")["v"].apply(lambda s: s - s.mean())      # may return a reduced/relabeled shape
df.groupby("k")["v"].transform(lambda s: s - s.mean())  # RIGHT: aligned to the ORIGINAL index

# FOOTGUN: silent row multiplication from a non-unique merge key (fan-out)
merged = orders.merge(customers, on="customer_id", how="left",
                      validate="many_to_one")   # raises if the key is NOT unique on the right
```
- `groupby(..., dropna=True)` is the default — **rows with NA keys vanish from the
  result**; pass `dropna=False` to keep them. `transform` returns a like-indexed
  series (safe to assign back as a column); `apply` may reshape.
- Always pass `validate=` on a `merge` when you believe a key is unique — it turns a
  silent row-count explosion into an immediate error.
  [pandas.pydata.org groupby + merge user guides, retrieved 2026-07-09]

## Error Handling & Testing
```python
import pandas as pd
from pandas.testing import assert_frame_equal, assert_series_equal

# Compare frames in tests — never `df1 == df2` (elementwise, NaN-unsafe, wrong shape on mismatch)
assert_frame_equal(result, expected, check_dtype=True)   # dtype-aware, NA-aware, clear diff

# Guard dtype at boundaries so a float-upcast bug fails loudly, not silently
assert result["id"].dtype == "Int64", result["id"].dtype

# Parsing errors: coerce vs raise — decide explicitly, do not let bad rows become NaT/NaN silently
df["ts"] = pd.to_datetime(df["ts"], errors="raise")      # loud on bad input
```
- `assert_frame_equal` / `assert_series_equal` are the canonical test helpers:
  they compare dtypes and NA positions and print a readable diff. A bare `==`
  returns an elementwise boolean frame (truth-value ambiguous, `NaN`-blind).
- `check_dtype=True` (default) catches the int→float NA upcast regression above.

## Performance Traps
- **Vectorize** — `df["p"] * 0.1` is orders of magnitude faster than
  `df["p"].apply(lambda x: x * 0.1)`; `.apply(axis=1)` is a Python loop in disguise.
- **`iterrows()` is the slowest path** and boxes each row to a `Series` (dtype
  coerced to a common type per row). Prefer vectorized ops, `.itertuples()` if you
  must iterate, or a groupby/merge that expresses the same intent.
- **PyArrow-backed strings** (`dtype_backend="pyarrow"` / `future.infer_string`)
  cut string memory ~50% and speed up string ops, but are immutable and not always
  zero-copy back to numpy. [pandas.pydata.org PyArrow + enhancingperf, 2026-07-09]

## Version-Specific Gotchas (dated, sourced)
- **pandas 3.0.3** is the current stable release, uploaded **2026-05-11**,
  `requires_python >= 3.11`. [pypi.org/project/pandas JSON API, retrieved 2026-07-09]
- **pandas 3.0**: **Copy-on-Write (CoW) is the default and only mode.** Chained
  assignment (`df[mask]["c"] = v`) now raises `ChainedAssignmentError` rather than a
  soft `SettingWithCopyWarning`; a slice never silently mutates its parent. On the
  latest **2.x line (2.3.3, 2025-09-29)** CoW is *opt-in* via
  `pd.options.mode.copy_on_write = True` — enable it there to get 3.0 semantics
  early. [pandas.pydata.org v3.0 whatsnew + copy_on_write user guide, retrieved
  2026-07-09]
- **pandas 3.0**: PyArrow-backed strings are the default inferred string dtype
  (`pd.options.future.infer_string` was the 2.x opt-in). [pandas.pydata.org v3.0
  whatsnew, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- pandas releases (PyPI JSON): https://pypi.org/pypi/pandas/json
- pandas 3.0 what's new: https://pandas.pydata.org/docs/whatsnew/v3.0.0.html
- Copy-on-Write user guide: https://pandas.pydata.org/docs/user_guide/copy_on_write.html
- Indexing / SettingWithCopy: https://pandas.pydata.org/docs/user_guide/indexing.html
- Missing data (nullable / NA): https://pandas.pydata.org/docs/user_guide/missing_data.html
- groupby: https://pandas.pydata.org/docs/user_guide/groupby.html
- merge/join/concat: https://pandas.pydata.org/docs/user_guide/merging.html
- Testing utilities: https://pandas.pydata.org/docs/reference/testing.html
