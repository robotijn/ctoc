# DuckDB CTO
> In-process OLAP database for blazing-fast analytical queries.

## Commands
```bash
# Setup | Dev | Test
pip install duckdb duckdb-engine
duckdb mydb.duckdb -c "SELECT * FROM data.parquet LIMIT 10"
pytest tests/ -v
```

## Non-Negotiables
1. SQL-first for all transformations
2. Direct query on Parquet/CSV/JSON without loading
3. Use persistent database for complex workflows
4. Leverage automatic parallelization
5. Memory limits configured for production
6. Extensions loaded explicitly (`INSTALL httpfs; LOAD httpfs`)

## Red Lines
- Loading entire datasets into memory unnecessarily
- Ignoring query explain plans
- Missing indexes on join columns for persistent tables
- Not using prepared statements for repeated queries
- Skipping schema validation on external files

## Pattern: Analytics Pipeline
```python
import duckdb

con = duckdb.connect("analytics.duckdb")
con.execute("SET memory_limit='4GB'")
con.execute("SET threads=4")

# Query external files directly with schema inference
result = con.execute("""
    WITH sales AS (
        SELECT * FROM read_parquet('s3://bucket/sales/*.parquet')
        WHERE date >= '2024-01-01'
    ),
    products AS (
        SELECT * FROM read_csv('products.csv', auto_detect=true)
    )
    SELECT
        p.category,
        DATE_TRUNC('month', s.date) as month,
        SUM(s.amount) as revenue
    FROM sales s
    JOIN products p ON s.product_id = p.id
    GROUP BY ALL
    ORDER BY month, revenue DESC
""").fetchdf()

# Export optimized Parquet
con.execute("COPY (SELECT * FROM result) TO 'output.parquet' (FORMAT PARQUET)")
```

## Integrates With
- **Python**: Native pandas/Polars DataFrame integration
- **Cloud**: S3/GCS/Azure via httpfs extension
- **BI**: DBeaver, Metabase, Superset connections

## Common Errors
| Error | Fix |
|-------|-----|
| `Out of Memory` | Set `memory_limit` or use streaming with COPY |
| `Invalid Input Error: Parquet` | Check file corruption or use `union_by_name` |
| `HTTP error` on S3 | Load httpfs extension and set credentials |
| `Binder Error: column not found` | Use `union_by_name=true` for schema evolution |

## Prod Ready
- [ ] Memory limits configured appropriately
- [ ] Thread count tuned for workload
- [ ] Extensions pre-installed in deployment
- [ ] Query logging enabled for debugging
- [ ] Persistent mode for multi-query workflows
