# QuestDB CTO
> High-performance time-series database.

## Non-Negotiables
1. Designated timestamp column
2. Partitioning strategy
3. Symbol type for categories
4. SAMPLE BY for downsampling
5. WAL configuration

## Red Lines
- String instead of symbol for categories
- Missing designated timestamp
- No partition strategy
- Full table scans
- Sync writes in high-throughput scenarios
