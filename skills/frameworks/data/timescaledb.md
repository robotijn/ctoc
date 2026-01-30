# TimescaleDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name timescale -p 5432:5432 \
  -e POSTGRES_PASSWORD=password \
  timescale/timescaledb:latest-pg16
# Enable extension
psql -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
```

## Claude's Common Mistakes
1. **Regular PostgreSQL tables for time-series** - Use hypertables
2. **Queries without time range** - Causes full scan; always filter by time
3. **Missing continuous aggregates** - Dashboards should hit pre-computed data
4. **No compression policy** - Historical data wastes storage
5. **Wrong chunk interval** - Should match query patterns (1 day to 1 week)

## Correct Patterns (2026)
```sql
-- Create hypertable (not regular table)
CREATE TABLE metrics (
    time TIMESTAMPTZ NOT NULL,
    device_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value DOUBLE PRECISION
);

SELECT create_hypertable('metrics', by_range('time', INTERVAL '1 day'));

-- Compound index for common queries
CREATE INDEX ON metrics (device_id, time DESC);

-- Continuous aggregate for dashboards (pre-computed)
CREATE MATERIALIZED VIEW metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    avg(value) AS avg_value,
    max(value) AS max_value
FROM metrics
GROUP BY bucket, device_id;

-- Refresh policy
SELECT add_continuous_aggregate_policy('metrics_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- Compression (90% storage reduction typical)
ALTER TABLE metrics SET (timescaledb.compress);
SELECT add_compression_policy('metrics', INTERVAL '7 days');

-- Retention
SELECT add_retention_policy('metrics', INTERVAL '90 days');
```

## Version Gotchas
- **v2.x**: New continuous aggregate syntax; hierarchical aggregates
- **Compression**: Huge savings (90%+); query compressed chunks transparently
- **PostgreSQL 16**: Latest TimescaleDB supports PG16 features
- **Chunks**: One chunk per interval; tune for your query patterns

## What NOT to Do
- Do NOT use regular tables for time-series (use hypertables)
- Do NOT query without time range filter (causes full scan)
- Do NOT let dashboards query raw data (use continuous aggregates)
- Do NOT skip compression for historical data (storage waste)
