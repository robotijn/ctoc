# Snowflake CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install snowflake-connector-python snowflake-sqlalchemy
# Or for pandas integration:
pip install "snowflake-connector-python[pandas]"
```

## Claude's Common Mistakes
1. **Oversized warehouses** - Start XS, scale up only if needed
2. **ETL on BI warehouse** - Separate warehouses for ETL vs analytics
3. **48-hour query timeout** - Set STATEMENT_TIMEOUT_IN_SECONDS
4. **Missing auto-suspend** - Idle warehouses burn credits
5. **No resource monitors** - Unexpected costs without spend alerts

## Correct Patterns (2026)
```sql
-- Right-size warehouse with auto-suspend
CREATE WAREHOUSE etl_wh
  WAREHOUSE_SIZE = 'X-SMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  STATEMENT_TIMEOUT_IN_SECONDS = 3600;

-- Resource monitor with alerts
CREATE RESOURCE MONITOR monthly_budget
  WITH CREDIT_QUOTA = 1000
  TRIGGERS
    ON 75 PERCENT DO NOTIFY
    ON 90 PERCENT DO NOTIFY
    ON 100 PERCENT DO SUSPEND;

-- Efficient data loading (100-250MB files optimal)
COPY INTO raw.events
FROM @raw_stage/events/
  FILE_FORMAT = (TYPE = 'PARQUET')
  PATTERN = '.*[.]parquet'
  ON_ERROR = 'CONTINUE';

-- Clustering for large tables (>1TB)
ALTER TABLE analytics.facts CLUSTER BY (date, region);

-- Zero-copy clone for dev/test (instant, no storage cost)
CREATE DATABASE dev_db CLONE prod_db;
```

## Version Gotchas
- **Gen2 warehouses**: 67% faster DML, 56% cost reduction
- **Dynamic tables**: Auto-refreshing materialized views
- **Iceberg tables**: Native support for open table format
- **Cortex AI**: Built-in LLM functions (COMPLETE, EXTRACT, etc.)

## What NOT to Do
- Do NOT use oversized warehouses by default (start XS)
- Do NOT run ETL and BI on same warehouse
- Do NOT skip resource monitors (surprise bills)
- Do NOT forget AUTO_SUSPEND (idle credits burn)
