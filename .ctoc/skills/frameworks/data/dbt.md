# dbt CTO
> The analytics engineering standard for data transformation and modeling.

## Commands
```bash
# Setup | Dev | Test
pip install dbt-core dbt-postgres  # or dbt-snowflake, dbt-bigquery
dbt run --select staging+ --target dev
dbt test --select tag:critical
```

## Non-Negotiables
1. Layered architecture: staging -> intermediate -> marts
2. Tests on all critical models (unique, not_null, relationships)
3. Documentation for every model and column
4. Incremental models for tables > 1M rows
5. `ref()` and `source()` exclusively, never hardcoded tables
6. Version control all models with CI/CD

## Red Lines
- Hardcoded table names bypassing lineage
- Models without tests
- Undocumented columns in marts
- Full refresh on incremental-capable data
- Business logic in staging models

## Pattern: Layered Model Architecture
```sql
-- models/staging/stg_orders.sql
{{ config(materialized='view') }}

SELECT
    id AS order_id,
    customer_id,
    CAST(created_at AS TIMESTAMP) AS ordered_at,
    status,
    amount_cents / 100.0 AS amount
FROM {{ source('raw', 'orders') }}
WHERE _fivetran_deleted = FALSE

-- models/marts/fct_daily_revenue.sql
{{ config(
    materialized='incremental',
    unique_key='date_day',
    on_schema_change='sync_all_columns'
) }}

SELECT
    DATE_TRUNC('day', ordered_at) AS date_day,
    COUNT(DISTINCT order_id) AS total_orders,
    SUM(amount) AS revenue
FROM {{ ref('stg_orders') }}
WHERE status = 'completed'
{% if is_incremental() %}
    AND ordered_at > (SELECT MAX(date_day) FROM {{ this }})
{% endif %}
GROUP BY 1
```

## Integrates With
- **Warehouse**: Snowflake, BigQuery, Redshift, Postgres
- **Orchestration**: Airflow, Dagster, Prefect
- **Docs**: dbt docs generate and host

## Common Errors
| Error | Fix |
|-------|-----|
| `Compilation Error: ref not found` | Check model path and run `dbt deps` |
| `Database Error: permission denied` | Verify service account roles |
| `Incremental model full refresh` | Check `is_incremental()` logic |
| `Test failed: unique` | Add deduplication in staging |

## Prod Ready
- [ ] CI/CD with `dbt build` on PR
- [ ] Critical tests tagged and enforced
- [ ] Documentation hosted and current
- [ ] Incremental models for large tables
- [ ] Source freshness monitoring enabled
