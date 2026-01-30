# dbt CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install dbt-core dbt-postgres  # or dbt-snowflake, dbt-bigquery, dbt-duckdb
dbt init my_project && cd my_project
dbt debug  # Verify connection
```

## Claude's Common Mistakes
1. **Hardcoding table names** - Always use ref() and source(), never raw table names
2. **Business logic in staging** - Staging is for renaming/casting only
3. **Full refresh on large tables** - Use incremental for tables >1M rows
4. **Missing tests on marts** - Every mart column needs at least unique/not_null
5. **Monolithic models** - Split into staging -> intermediate -> marts layers

## Correct Patterns (2026)
```sql
-- models/staging/stg_orders.sql (light transformation only)
{{ config(materialized='view') }}

SELECT
    id AS order_id,
    customer_id,
    CAST(created_at AS TIMESTAMP) AS ordered_at,
    status,
    amount_cents / 100.0 AS amount
FROM {{ source('raw', 'orders') }}
WHERE NOT _fivetran_deleted

-- models/marts/fct_daily_revenue.sql (incremental for large data)
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

## Version Gotchas
- **dbt Core vs Cloud**: Cloud has scheduler, CI, docs hosting; Core is CLI only
- **Incremental models**: Must handle late-arriving data with lookback window
- **Macros**: Use for DRY code; test macros separately
- **dbt Mesh**: Multi-project refs with dbt 1.6+ cross-project dependencies

## What NOT to Do
- Do NOT hardcode table/schema names (use ref/source)
- Do NOT put business logic in staging models
- Do NOT skip tests on mart/fact tables
- Do NOT use full refresh for large incremental-capable tables
