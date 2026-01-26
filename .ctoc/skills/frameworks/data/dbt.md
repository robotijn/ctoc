# dbt CTO
> Analytics engineering standard.

## Non-Negotiables
1. staging → intermediate → marts
2. Tests on critical data
3. Document all models
4. Incremental for large tables
5. refs, never hardcoded tables

## Model Naming
- stg_* - Staging (1:1 source)
- int_* - Intermediate
- fct_* - Facts (events)
- dim_* - Dimensions (entities)
