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

## Materialization Footguns (Performance & Cost)
The `materialized` config decides whether a model becomes a `view`, a full
`table`, an `incremental` table, or a `snapshot` — and getting it wrong is the
most expensive dbt mistake Claude makes.

```sql
-- view: no storage, always fresh, but re-runs the query on every downstream read.
-- table: full rebuild every `dbt run` — cheap on small data, ruinous on big.
-- incremental: append/merge only new rows — the ONLY sane choice for large facts.
{{ config(
    materialized='incremental',
    unique_key='order_id',            -- REQUIRED for merge; missing → silent duplicate rows
    incremental_strategy='merge',     -- merge | append | delete+insert | insert_overwrite
    on_schema_change='append_new_columns'
) }}

SELECT order_id, ordered_at, amount
FROM {{ ref('stg_orders') }}
{% if is_incremental() %}
  -- FOOTGUN: a strict `>` on max(ts) drops rows that arrived late with an
  -- earlier event time. Use a lookback window so late-arriving data is caught.
  WHERE ordered_at >= (SELECT max(ordered_at) FROM {{ this }}) - INTERVAL '3 days'
{% endif %}
```

- **`is_incremental()` without a `unique_key`** on a `merge`/`delete+insert`
  strategy → **duplicate rows** every run. The key is what makes the merge idempotent.
- **`--full-refresh` on a large incremental model** rebuilds it from zero — the
  exact cost (and warehouse-credit spend) the incremental materialization exists
  to avoid. Guard it in CI; do not let it run casually on billion-row facts.
- **`ref()` / `source()`** build the DAG. Hardcoding a table name breaks lineage,
  breaks the `--defer`/state-based CI, and breaks environment (dev/prod) schema
  swapping. Always `{{ ref('model') }}`, never `analytics.model`.
- **Snapshots (SCD2)** — `dbt snapshot` tracks slowly-changing dimensions with
  `dbt_valid_from`/`dbt_valid_to`. Use `check` strategy when there is no reliable
  `updated_at`; a wrong `unique_key` here silently forks history.
- **Test severity** — a generic test (`unique`, `not_null`, `relationships`,
  `accepted_values`) defaults to `severity: error` (fails the build). Downgrade to
  `warn` deliberately, per test — never blanket-mute failing data quality.
[docs.getdbt.com incremental-models + materializations docs, retrieved 2026-07-10; see References]

## Correctness Footguns
```sql
-- FOOTGUN: max(ts) high-water mark + strict > drops late-arriving events forever.
-- FOOTGUN: comparing a naive timestamp against a TIMESTAMPTZ high-water mark
--          shifts the boundary by the session timezone → gaps or double-counts.
{% if is_incremental() %}
  WHERE event_at >= (SELECT max(event_at) FROM {{ this }}) - INTERVAL '3 days'
{% endif %}
```

- **Late-arriving data**: incremental high-water-mark logic MUST use a lookback
  window or a merge on `unique_key`, or rows that land after the watermark are
  never picked up — a silent, permanent data-loss bug.
- **Timezone**: mixing `TIMESTAMP` (naive) and `TIMESTAMPTZ` in the watermark
  comparison silently offsets the incremental boundary. Standardize on UTC
  `TIMESTAMPTZ` at the staging layer. [docs.getdbt.com incremental docs, retrieved 2026-07-10]

## Security (CWE-89 — Jinja-into-SQL injection)
dbt compiles Jinja `{{ }}`/`{% %}` into raw SQL. Interpolating an **untrusted**
variable (a `--vars` value, an env var, an API-sourced string) directly into SQL
is classic SQL injection — CWE-89 — because Jinja does no SQL escaping.

```sql
-- FOOTGUN (CWE-89): untrusted var interpolated straight into SQL text
SELECT * FROM events WHERE region = '{{ var("region") }}'     -- var = "x' OR '1'='1"
-- compiles to:  ... WHERE region = 'x' OR '1'='1'            -- injected

-- RIGHT: never build SQL from unquoted/untrusted input. Validate against an
-- allow-list, and quote via dbt's built-in helper rather than raw string concat.
{% set allowed = ['us', 'eu', 'apac'] %}
{% if var('region') not in allowed %}{{ exceptions.raise_compiler_error("bad region") }}{% endif %}
SELECT * FROM events WHERE region = {{ dbt.string_literal(var('region')) }}
```

- **CWE-89** — treat every `var()`, `env_var()`, and macro argument that reaches
  SQL as untrusted: allow-list it, or quote it via `dbt.string_literal` / an
  adapter quoting helper — never bare `'{{ ... }}'`. Model/column names from
  untrusted input must be validated against `adapter.get_relation` /an allow-list,
  never string-concatenated. https://cwe.mitre.org/data/definitions/89.html
- Keep warehouse credentials in `profiles.yml` via `env_var(...)`, never committed
  literals (CWE-798). [docs.getdbt.com Jinja + profiles docs, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **dbt-core 1.11.12** is the current stable release, uploaded **2026-07-01**;
  1.12 is at RC and dbt-core 2.0 is in alpha (do not pin a prerelease in prod).
  [pypi.org/project/dbt-core JSON API, retrieved 2026-07-10]
- **dbt Core vs Cloud**: Cloud adds the scheduler, CI, and hosted docs; Core is the
  CLI/engine. Cross-project refs (**dbt Mesh**) require dbt 1.6+.
- **Incremental `on_schema_change`**: defaults to `ignore` — a new upstream column
  is silently dropped from an incremental model until a full refresh. Set
  `append_new_columns` or `sync_all_columns` explicitly.
  [docs.getdbt.com incremental on_schema_change docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- dbt-core releases (PyPI JSON): https://pypi.org/pypi/dbt-core/json
- Incremental models: https://docs.getdbt.com/docs/build/incremental-models
- Materializations: https://docs.getdbt.com/docs/build/materializations
- Snapshots (SCD2): https://docs.getdbt.com/docs/build/snapshots
- Tests: https://docs.getdbt.com/docs/build/data-tests
- CWE-89 SQL Injection: https://cwe.mitre.org/data/definitions/89.html
- CWE-798 Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
