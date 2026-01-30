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
