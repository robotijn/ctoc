# Apache Kafka CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# KRaft mode (no ZooKeeper required since Kafka 3.3+)
docker run -d --name kafka -p 9092:9092 \
  -e KAFKA_CFG_NODE_ID=1 \
  -e KAFKA_CFG_PROCESS_ROLES=broker,controller \
  -e KAFKA_CFG_CONTROLLER_LISTENER_NAMES=CONTROLLER \
  bitnami/kafka:3.7

# Client
pip install confluent-kafka  # Recommended over kafka-python
```

## Claude's Common Mistakes
1. **Using ZooKeeper setup** - KRaft mode is default since 3.3+, ZK deprecated
2. **acks=1 for critical data** - Use acks=all with idempotence for durability
3. **Auto-commit without processing** - Leads to data loss on crash
4. **No schema registry** - Deserialization errors cascade through pipeline
5. **Restarting all consumers at once** - Causes rebalance storms

## Correct Patterns (2026)
```python
from confluent_kafka import Producer, Consumer

# Idempotent producer (exactly-once semantics)
producer = Producer({
    'bootstrap.servers': 'localhost:9092',
    'enable.idempotence': True,
    'acks': 'all',
    'linger.ms': 5,        # Batch for throughput (min 5ms recommended)
    'compression.type': 'zstd',
})

def delivery_report(err, msg):
    if err:
        logger.error(f"Delivery failed: {err}")

producer.produce('events', key='user-123', value=data, callback=delivery_report)
producer.flush()

# Consumer with manual commit (at-least-once)
consumer = Consumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'processors',
    'auto.offset.reset': 'earliest',
    'enable.auto.commit': False,
    'partition.assignment.strategy': 'cooperative-sticky',
    'group.instance.id': 'processor-1',  # Static membership
})

consumer.subscribe(['events'])
while True:
    msg = consumer.poll(1.0)
    if msg and not msg.error():
        process(msg)
        consumer.commit(msg)  # Commit AFTER processing
```

## Version Gotchas
- **v3.3+**: KRaft mode GA; ZooKeeper deprecated
- **v3.7**: Improved consumer rebalance, tiered storage GA
- **confluent-kafka vs kafka-python**: confluent-kafka is faster, maintained
- **Schema Registry**: Required for Avro/Protobuf; prevents breaking changes

## What NOT to Do
- Do NOT use ZooKeeper mode for new deployments
- Do NOT use acks=0 or acks=1 for critical data
- Do NOT restart all consumers simultaneously (rebalance storm)
- Do NOT skip schema registry (silent data corruption)
