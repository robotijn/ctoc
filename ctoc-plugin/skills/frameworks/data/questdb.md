# QuestDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name questdb -p 9000:9000 -p 9009:9009 -p 8812:8812 questdb/questdb
# Web console at http://localhost:9000
# ILP ingestion on port 9009, PostgreSQL wire on 8812
```

## Claude's Common Mistakes
1. **String instead of Symbol** - Symbol is 10x faster for categorical data
2. **Missing designated timestamp** - Required for time-series optimizations
3. **No partition strategy** - Large tables need partitioning (DAY/MONTH)
4. **HTTP API for high-throughput** - Use ILP (InfluxDB Line Protocol) instead
5. **Missing SAMPLE BY** - Standard GROUP BY is slower for time aggregations

## Correct Patterns (2026)
```sql
-- Optimized schema with Symbol types
CREATE TABLE sensors (
    timestamp TIMESTAMP,
    device_id SYMBOL CAPACITY 100000,
    sensor_type SYMBOL,
    value DOUBLE,
    quality INT
) TIMESTAMP(timestamp) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(timestamp, device_id);

-- High-performance ingestion via ILP (port 9009)
-- sensors,device_id=d1,sensor_type=temp value=23.5 1609459200000000000

-- Efficient downsampling with SAMPLE BY
SELECT
    timestamp,
    device_id,
    avg(value) AS avg_value,
    max(value) AS max_value
FROM sensors
WHERE timestamp > dateadd('d', -7, now())
SAMPLE BY 1h
ALIGN TO CALENDAR;

-- Latest value per device (optimized)
SELECT * FROM sensors
WHERE timestamp > dateadd('h', -1, now())
LATEST ON timestamp PARTITION BY device_id;
```

## Version Gotchas
- **WAL mode**: Write-ahead log for durability; configure based on needs
- **DEDUP**: Built-in deduplication for idempotent ingestion
- **ILP vs SQL**: ILP for high-throughput writes; SQL for queries
- **vs InfluxDB**: QuestDB is faster for most time-series workloads

## What NOT to Do
- Do NOT use String for categorical data (use Symbol)
- Do NOT skip designated timestamp (breaks optimizations)
- Do NOT use HTTP API for high-throughput (use ILP)
- Do NOT use GROUP BY for time aggregations (use SAMPLE BY)
