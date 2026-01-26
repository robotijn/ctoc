# Snowflake CTO
> Cloud-native data warehouse with separation of storage and compute.

## Commands
```bash
# Setup | Dev | Test
pip install snowflake-connector-python snowflake-sqlalchemy
snowsql -c my_connection -q "SELECT CURRENT_VERSION()"
pytest tests/ -v
```

## Non-Negotiables
1. Right-size warehouses (start XS, scale up as needed)
2. Clustering keys on large tables (>1TB) by query patterns
3. Zero-copy cloning for dev/test environments
4. Resource monitors with spend alerts
5. Time travel configured appropriately (default 1 day)
6. Separate warehouses for ETL vs. analytics

## Red Lines
- Running ETL on same warehouse as user queries
- Oversized warehouses running idle
- Missing clustering on frequently filtered columns
- No cost monitoring or alerts
- Hardcoded credentials in connection strings

## Pattern: Optimized Data Loading
```sql
-- Staging with proper file format
CREATE OR REPLACE FILE FORMAT json_format
  TYPE = 'JSON'
  STRIP_OUTER_ARRAY = TRUE
  COMPRESSION = 'AUTO';

CREATE OR REPLACE STAGE raw_stage
  URL = 's3://bucket/raw/'
  CREDENTIALS = (AWS_KEY_ID = '...' AWS_SECRET_KEY = '...')
  FILE_FORMAT = json_format;

-- Efficient COPY with error handling
COPY INTO raw.events
FROM @raw_stage/events/
  FILE_FORMAT = json_format
  ON_ERROR = 'CONTINUE'
  PATTERN = '.*[.]json[.]gz'
  FORCE = FALSE;  -- Skip already loaded files

-- Materialized aggregation with clustering
CREATE OR REPLACE TABLE analytics.daily_metrics
  CLUSTER BY (date, region)
AS
SELECT
  DATE_TRUNC('day', event_time) AS date,
  region,
  COUNT(*) AS event_count,
  SUM(revenue) AS total_revenue
FROM raw.events
GROUP BY 1, 2;

-- Auto-suspend warehouse
ALTER WAREHOUSE etl_wh SET AUTO_SUSPEND = 60;
```

## Integrates With
- **ETL**: Fivetran, Airbyte, dbt for transformations
- **BI**: Tableau, Looker, Metabase direct connect
- **Orchestration**: Airflow, Prefect with Snowflake operator

## Common Errors
| Error | Fix |
|-------|-----|
| `Warehouse suspended` | Check AUTO_RESUME setting |
| `Query timeout` | Increase warehouse size or optimize query |
| `Credit usage spike` | Set resource monitors with alerts |
| `File format mismatch` | Verify format matches actual file structure |

## Prod Ready
- [ ] Resource monitors with spend alerts
- [ ] Separate warehouses for ETL and BI
- [ ] Clustering keys on large tables
- [ ] Zero-copy clones for dev/staging
- [ ] Network policies for IP allowlisting
