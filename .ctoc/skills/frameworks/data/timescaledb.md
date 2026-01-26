# TimescaleDB CTO
> Time-series on PostgreSQL.

## Non-Negotiables
1. Hypertables for time-series
2. Proper chunk intervals
3. Continuous aggregates
4. Compression policies
5. Retention policies

## Red Lines
- Regular tables for time-series
- Missing time column index
- No compression on old data
- Unbounded queries without time range
- Missing continuous aggregates for dashboards
