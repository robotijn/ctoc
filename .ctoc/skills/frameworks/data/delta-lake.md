# Delta Lake CTO
> Open-source lakehouse storage.

## Non-Negotiables
1. ACID transactions
2. Time travel queries
3. Schema enforcement
4. Z-ordering for queries
5. Vacuum policies

## Red Lines
- No schema enforcement
- Missing VACUUM
- Large file sizes (>1GB)
- No partitioning strategy
- Ignoring table statistics

## Pattern
```python
df.write.format("delta") \
  .partitionBy("date") \
  .option("overwriteSchema", "true") \
  .save("/path/to/table")
```
