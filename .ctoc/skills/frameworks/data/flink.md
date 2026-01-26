# Apache Flink CTO
> Unified stream and batch processing for real-time analytics at scale.

## Commands
```bash
# Setup | Dev | Test
./bin/start-cluster.sh
./bin/flink run -c com.example.Job target/job.jar
mvn test -Dtest=JobTest
```

## Non-Negotiables
1. Event time processing with watermarks for correctness
2. Proper windowing (tumbling, sliding, session) for aggregations
3. Checkpointing enabled for fault tolerance
4. State backends configured (RocksDB for large state)
5. Backpressure monitoring and handling
6. Exactly-once semantics for critical data

## Red Lines
- Processing time when event time ordering matters
- Missing checkpoints in production
- Unbounded state without TTL
- Ignoring watermarks causing late data loss
- Synchronous I/O in operators

## Pattern: Streaming Event Processing
```java
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
env.enableCheckpointing(60000);
env.setStateBackend(new EmbeddedRocksDBStateBackend());

DataStream<Event> events = env
    .fromSource(kafkaSource, WatermarkStrategy
        .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(30))
        .withTimestampAssigner((event, ts) -> event.getTimestamp()),
        "Kafka Source");

events
    .keyBy(Event::getUserId)
    .window(TumblingEventTimeWindows.of(Time.minutes(5)))
    .aggregate(new EventAggregator())
    .addSink(new JdbcSink<>(...));

env.execute("Event Processor");
```

## Integrates With
- **Sources**: Kafka, Kinesis, Pulsar, files
- **Sinks**: Kafka, JDBC, Elasticsearch, S3
- **State**: RocksDB, HashMapStateBackend

## Common Errors
| Error | Fix |
|-------|-----|
| `Checkpoint timeout` | Reduce state size or increase timeout |
| `OutOfMemoryError` | Configure managed memory, use RocksDB |
| `Watermark stuck` | Check source for idle partitions |
| `Backpressure high` | Scale parallelism or optimize operators |

## Prod Ready
- [ ] Checkpointing with appropriate interval
- [ ] RocksDB state backend for large state
- [ ] Watermark strategy configured
- [ ] Monitoring via Flink Dashboard/Prometheus
- [ ] Savepoint strategy for upgrades
