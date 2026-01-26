# pandas CTO
> The foundation of Python data analysis and manipulation.

## Commands
```bash
# Setup | Dev | Test
pip install pandas[performance,excel,parquet]
python -c "import pandas as pd; pd.show_versions()"
pytest tests/ -v --tb=short
```

## Non-Negotiables
1. Use `.loc[]` / `.iloc[]` for selection, never chained indexing
2. Vectorized operations over iteration (100x faster)
3. Explicit dtypes: `category` for strings, `Int64` for nullable ints
4. Method chaining with `.pipe()` for readability
5. Copy-on-Write mode enabled (`pd.options.mode.copy_on_write = True`)
6. Use PyArrow backend for 2-10x memory reduction

## Red Lines
- `for` loops iterating over DataFrame rows
- Ignoring `SettingWithCopyWarning`
- Loading files without specifying dtypes
- Using `apply()` when vectorized alternatives exist
- Mixing inplace operations with chaining

## Pattern: Production Data Pipeline
```python
import pandas as pd

pd.options.mode.copy_on_write = True

def load_and_clean(path: str) -> pd.DataFrame:
    return (
        pd.read_parquet(path, dtype_backend="pyarrow")
        .pipe(validate_schema)
        .assign(
            date=lambda df: pd.to_datetime(df["date"]),
            category=lambda df: df["category"].astype("category"),
        )
        .loc[lambda df: df["value"].notna()]
        .pipe(add_derived_columns)
    )

def validate_schema(df: pd.DataFrame) -> pd.DataFrame:
    required = {"id", "date", "value", "category"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {missing}")
    return df
```

## Integrates With
- **Larger Data**: Polars, DuckDB, or Dask for >5GB datasets
- **Viz**: Matplotlib, Seaborn, Plotly for analysis
- **ML**: scikit-learn, XGBoost with `.values` arrays

## Common Errors
| Error | Fix |
|-------|-----|
| `SettingWithCopyWarning` | Use `.loc[]` or enable Copy-on-Write |
| `MemoryError` on read | Use `chunksize` param or switch to Polars |
| `TypeError: unhashable` | Convert list columns to tuples before groupby |
| `DtypeWarning: mixed types` | Specify `dtype` dict in read function |

## Prod Ready
- [ ] Copy-on-Write enabled for memory safety
- [ ] PyArrow backend for production workloads
- [ ] Schema validation on data ingestion
- [ ] Explicit dtype declarations
- [ ] Memory profiling for large operations
