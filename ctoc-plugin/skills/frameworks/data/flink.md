# Apache Flink CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# PyFlink
pip install apache-flink

# Or Java/Scala with Maven
# Use Flink 1.18+ for latest features
```

## Claude's Common Mistakes
1. **Processing time for event ordering** - Use event time with watermarks
2. **Missing checkpoints** - Production needs fault tolerance
3. **Unbounded state** - Configure state TTL to prevent memory growth
4. **Synchronous I/O in operators** - Use async I/O for external calls
5. **HashMapStateBackend for large state** - Use RocksDB

## Correct Patterns (2026)
```python
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.datastream.connectors.kafka import KafkaSource
from pyflink.common.watermark_strategy import WatermarkStrategy
from pyflink.common import Duration

env = StreamExecutionEnvironment.get_execution_environment()
env.enable_checkpointing(60000)  # 60 second intervals

# Kafka source with event time
kafka_source = KafkaSource.builder() \
    .set_bootstrap_servers("localhost:9092") \
    .set_topics("events") \
    .set_group_id("flink-processor") \
    .build()

# Watermark strategy for out-of-order events
watermark_strategy = WatermarkStrategy \
    .for_bounded_out_of_orderness(Duration.of_seconds(30))

ds = env.from_source(kafka_source, watermark_strategy, "Kafka Source")

# Keyed stream with tumbling window
result = ds \
    .key_by(lambda x: x['user_id']) \
    .window(TumblingEventTimeWindows.of(Time.minutes(5))) \
    .reduce(lambda a, b: {'count': a['count'] + b['count']})

env.execute("Event Processor")
```

## Version Gotchas
- **v1.18+**: Improved Python API, better Kafka connector
- **State backends**: RocksDB for >1GB state; heap for small state
- **Watermarks**: Configure based on expected out-of-orderness
- **Savepoints**: Required for job upgrades; checkpoints for recovery

## What NOT to Do
- Do NOT use processing time when event order matters
- Do NOT skip checkpointing in production (data loss on failure)
- Do NOT let state grow unbounded (configure TTL)
- Do NOT use synchronous I/O in operators (blocks processing)
