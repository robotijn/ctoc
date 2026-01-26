# ClickHouse CTO
> Real-time analytics at scale.

## Non-Negotiables
1. Proper table engines (MergeTree family)
2. Partition by time
3. ORDER BY for queries
4. Materialized views for aggregations
5. Batch inserts (1000+ rows)

## Red Lines
- Row-by-row inserts
- Missing ORDER BY clause
- No partitioning strategy
- SELECT * on large tables
- Joins on non-distributed tables
