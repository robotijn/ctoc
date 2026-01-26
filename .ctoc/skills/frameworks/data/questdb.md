# QuestDB CTO
> High-performance time-series database with SQL and InfluxDB line protocol.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name questdb -p 9000:9000 -p 9009:9009 questdb/questdb
curl -G "http://localhost:9000/exec" --data-urlencode "query=SELECT * FROM sys.tables"
curl -X POST "http://localhost:9000/exec" -d "query=SELECT 1"
```

## Non-Negotiables
1. Designated timestamp column for time-series optimizations
2. Symbol type for categorical string columns
3. Partitioning strategy (DAY, MONTH, YEAR)
4. SAMPLE BY for time-based aggregations
5. WAL configuration for durability requirements
6. Deduplication enabled for idempotent ingestion

## Red Lines
- String type instead of Symbol for categories
- Missing designated timestamp
- No partition strategy on large tables
- Full table scans without time filters
- Synchronous writes in high-throughput paths

## Pattern: Optimized Time-Series Schema
```sql
-- Create table with proper types
CREATE TABLE sensors (
    timestamp TIMESTAMP,
    device_id SYMBOL CAPACITY 100000,
    sensor_type SYMBOL,
    value DOUBLE,
    quality INT
) TIMESTAMP(timestamp) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(timestamp, device_id);

-- High-performance ingestion via ILP
-- telegraf/sensors,device_id=d1,sensor_type=temp value=23.5 1609459200000000000

-- Efficient downsampling query
SELECT
    timestamp,
    device_id,
    avg(value) AS avg_value,
    max(value) AS max_value,
    count() AS samples
FROM sensors
WHERE timestamp > dateadd('d', -7, now())
SAMPLE BY 1h
ALIGN TO CALENDAR;

-- Latest value per device
SELECT * FROM sensors
WHERE timestamp > dateadd('h', -1, now())
LATEST ON timestamp PARTITION BY device_id;
```

## Integrates With
- **Ingest**: InfluxDB Line Protocol, PostgreSQL wire, REST
- **Viz**: Grafana with PostgreSQL datasource
- **Streaming**: Kafka Connect, direct from producers

## Common Errors
| Error | Fix |
|-------|-----|
| `designated timestamp required` | Add TIMESTAMP(column) to CREATE |
| `symbol capacity exceeded` | Increase CAPACITY or redesign |
| `out of order data` | Enable O3 (out-of-order) or pre-sort |
| `WAL apply lag` | Tune WAL settings or increase resources |

## Prod Ready
- [ ] Designated timestamp on all tables
- [ ] Symbol types for categorical data
- [ ] Partitioning aligned with retention
- [ ] WAL configured for durability needs
- [ ] Monitoring for ingestion lag
