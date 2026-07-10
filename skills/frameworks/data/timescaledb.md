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

## Hypertable Footguns (chunk sizing, compression mutability, aggregates)
A hypertable is partitioned into **chunks** by a time interval. The `chunk_time_interval`
is the single most consequential tuning knob and it is easy to get wrong in both
directions.

```sql
-- FOOTGUN: too-small chunks (e.g. 1 hour on a 5-year dataset) -> tens of thousands of
-- chunks -> the planner must consider them all -> slow planning, bloated catalog.
SELECT create_hypertable('metrics', by_range('time', INTERVAL '1 hour'));  -- usually too small

-- RIGHT: size so that the chunks for the most recent interval fit in ~25% of RAM.
-- A day-to-week interval is the common sweet spot for typical ingest rates.
SELECT create_hypertable('metrics', by_range('time', INTERVAL '1 day'));

-- Change it later for FUTURE chunks (existing chunks keep their old interval):
SELECT set_chunk_time_interval('metrics', INTERVAL '7 days');
```
- **Chunk sizing rule of thumb** (docs.timescale.com): the uncompressed chunks for the
  most-recently-written interval should fit in roughly 25% of main memory, so ingest
  and index updates stay in cache. Too large hurts memory + retention granularity; too
  small hurts planning. Query `chunks_detailed_size('metrics')` to inspect.
- **Compressed chunks are (mostly) immutable.** Historically an `UPDATE`/`DELETE`
  against a compressed chunk failed or forced a full decompress. Modern TimescaleDB
  supports DML on compressed chunks, but it is far more expensive than on uncompressed
  data — do not design a workload that mutates old, compressed history row-by-row.
- **`time_bucket` alignment**: `time_bucket('1 week', time)` aligns to a fixed epoch
  (buckets do NOT start on Monday by default). Pass an `origin` argument to align to a
  calendar boundary, and never mix bucket width with a mismatched refresh window on a
  continuous aggregate. [docs.timescale.com/use-timescale/latest/hypertables/ +
  docs.timescale.com/api/latest/hyperfunctions/time_bucket/, retrieved 2026-07-10]

## Correctness — continuous aggregates, upserts, retention ordering
```sql
-- FOOTGUN: a continuous aggregate's refresh window overlaps the retention window, so
-- rows are dropped by retention BEFORE the aggregate has materialized them.
-- Ordering matters: refresh must cover data still present in the hypertable.
SELECT add_continuous_aggregate_policy('metrics_hourly',
    start_offset => INTERVAL '3 hours',   -- must be < retention interval on the source
    end_offset   => INTERVAL '1 hour',    -- exclude the still-arriving newest bucket
    schedule_interval => INTERVAL '1 hour');
SELECT add_retention_policy('metrics', INTERVAL '90 days');  -- longer than refresh window

-- Upsert on a hypertable REQUIRES the unique/PK constraint to include the partitioning
-- (time) column -- a UNIQUE index that omits `time` is rejected on a hypertable.
CREATE TABLE metrics (time TIMESTAMPTZ NOT NULL, device_id TEXT, value DOUBLE PRECISION,
                      UNIQUE (device_id, time));            -- time MUST be in the key
INSERT INTO metrics VALUES (now(), 'd1', 1.0)
  ON CONFLICT (device_id, time) DO UPDATE SET value = excluded.value;
```
- **`end_offset` should exclude the newest, still-arriving bucket** so you don't
  materialize a half-written interval. Real-time aggregation then serves the freshest
  data from the raw hypertable transparently.
- Inserting a row whose `time` is far outside existing chunks silently creates a new
  chunk — a stray bad timestamp can spawn a chunk in the year 2099.
  [docs.timescale.com/use-timescale/latest/continuous-aggregates/, retrieved 2026-07-10]

## Security — SQL injection (CWE-89) and Postgres roles
TimescaleDB is a Postgres extension, so injection is **CWE-89** exactly as in vanilla
Postgres — use bound parameters (`$1`, driver placeholders), never string interpolation
(cwe.mitre.org/89).

```python
# VULNERABLE (CWE-89): f-string builds the SQL text from user input
import psycopg
device = "d1'; DROP TABLE metrics; --"
cur.execute(f"SELECT * FROM metrics WHERE device_id = '{device}'")   # injection

# SAFE: %s placeholder — psycopg binds the value server-side, never as SQL
cur.execute("SELECT * FROM metrics WHERE device_id = %s AND time > %s", (device, since))
```
- **Least privilege**: the ingest role needs only INSERT on the hypertable; background
  jobs (compression/retention/refresh policies) run as the job owner — do not grant the
  app role superuser. Continuous-aggregate and policy DDL should run as a migration
  role, not the runtime app role.
  [docs.timescale.com/ + cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

## Testing
```sql
-- FOOTGUN: testing against a plain table hides hypertable-specific behavior (chunk
-- routing, compression, the time-in-unique-key rule).
-- RIGHT: spin up timescale/timescaledb in a throwaway container, CREATE EXTENSION,
-- create the real hypertable, and assert on catalog views.
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('metrics', by_range('time', INTERVAL '1 day'));

-- Assert chunks actually formed for spread-out timestamps:
INSERT INTO metrics SELECT g, 'd1', 1.0 FROM generate_series(
  now() - INTERVAL '5 days', now(), INTERVAL '1 day') g;
SELECT count(*) FROM timescaledb_information.chunks WHERE hypertable_name = 'metrics';
-- expect >= 5 chunks
```
- Inspect `timescaledb_information.chunks`, `.compression_settings`,
  `.continuous_aggregates`, and `.jobs` to verify policies exist and ran. Use the real
  extension in CI — a mock hides every footgun above.
  [docs.timescale.com/api/latest/informational-views/, retrieved 2026-07-10]

## Performance
- **Always filter by the time column** so the planner can do *chunk exclusion* — a
  query without a time predicate scans every chunk. Put `time` in your compound
  indexes: `(device_id, time DESC)` is the canonical shape.
- **Compression** typically yields large storage reductions and speeds up analytical
  scans, but compressed chunks are columnar — point lookups and row-level DML on them
  are slower. Compress data only once it's past the "hot mutable" window.
- **Continuous aggregates** pre-materialize rollups; point dashboards at them, not raw
  chunks. Real-time aggregation tops up the newest bucket from the raw hypertable.
  [docs.timescale.com/use-timescale/latest/compression/, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **TimescaleDB 2.28.2** is the current release, dated **2026-06-30**.
  [github.com/timescale/timescaledb/releases, retrieved 2026-07-10]
- The **`by_range()` / `by_hash()` dimension builders** are the current
  `create_hypertable` API; the old positional `create_hypertable('t','time', ...)`
  signature is deprecated — use the dimension-builder form shown above.
  [docs.timescale.com/api/latest/hypertable/create_hypertable/, retrieved 2026-07-10]
- Injection behavior is unchanged from Postgres: bound parameters bind values;
  string-built SQL is CWE-89 in every version.
  [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- TimescaleDB releases (GitHub): https://github.com/timescale/timescaledb/releases
- Hypertables: https://docs.timescale.com/use-timescale/latest/hypertables/
- create_hypertable API: https://docs.timescale.com/api/latest/hypertable/create_hypertable/
- Continuous aggregates: https://docs.timescale.com/use-timescale/latest/continuous-aggregates/
- Compression: https://docs.timescale.com/use-timescale/latest/compression/
- time_bucket: https://docs.timescale.com/api/latest/hyperfunctions/time_bucket/
- Informational views: https://docs.timescale.com/api/latest/informational-views/
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
