# TimescaleDB CTO
> Time-series superpowers for PostgreSQL.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name timescale -p 5432:5432 timescale/timescaledb:latest-pg15
psql -h localhost -U postgres -c "CREATE EXTENSION timescaledb;"
psql -f tests/queries.sql
```

## Non-Negotiables
1. Hypertables for all time-series data
2. Chunk intervals aligned with query patterns (1 day to 1 week)
3. Continuous aggregates for dashboard queries
4. Compression policies for older data
5. Retention policies for data lifecycle
6. Time column indexed and used in all queries

## Red Lines
- Regular PostgreSQL tables for time-series
- Queries without time range filters
- Missing compression on historical data
- Dashboard queries hitting raw data
- Chunk intervals mismatched with retention

## Pattern: Production Time-Series Schema
```sql
-- Create hypertable
CREATE TABLE metrics (
    time TIMESTAMPTZ NOT NULL,
    device_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value DOUBLE PRECISION,
    tags JSONB
);

SELECT create_hypertable('metrics', 'time',
    chunk_time_interval => INTERVAL '1 day'
);

-- Optimized indexes
CREATE INDEX idx_metrics_device_time ON metrics (device_id, time DESC);
CREATE INDEX idx_metrics_name ON metrics (metric_name, time DESC);

-- Continuous aggregate for dashboards
CREATE MATERIALIZED VIEW metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    metric_name,
    avg(value) AS avg_value,
    max(value) AS max_value,
    count(*) AS sample_count
FROM metrics
GROUP BY bucket, device_id, metric_name
WITH NO DATA;

-- Refresh policy
SELECT add_continuous_aggregate_policy('metrics_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Compression policy
SELECT add_compression_policy('metrics', INTERVAL '7 days');

-- Retention policy
SELECT add_retention_policy('metrics', INTERVAL '90 days');
```

## Integrates With
- **Ingest**: Prometheus remote write, Telegraf, direct INSERT
- **Viz**: Grafana native support, Tableau
- **PostgreSQL**: Full SQL compatibility, extensions

## Common Errors
| Error | Fix |
|-------|-----|
| `chunk not found` | Query includes time outside retention |
| `continuous aggregate refresh failed` | Check materialization hypertable |
| `compression job slow` | Reduce chunk size or increase resources |
| `query timeout` | Add time range filter or use cagg |

## Prod Ready
- [ ] Hypertables with appropriate chunk intervals
- [ ] Continuous aggregates for common queries
- [ ] Compression enabled for historical data
- [ ] Retention policies configured
- [ ] Monitoring for chunk count and size
