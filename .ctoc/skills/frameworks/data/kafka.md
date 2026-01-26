# Apache Kafka CTO
> Distributed event streaming platform for real-time data pipelines.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name kafka -p 9092:9092 apache/kafka:latest
kafka-topics.sh --create --topic events --bootstrap-server localhost:9092
kafka-console-producer.sh --topic events --bootstrap-server localhost:9092
```

## Non-Negotiables
1. Topic design aligned with access patterns and retention
2. Partition keys for ordering guarantees within partition
3. Schema Registry for producer/consumer contracts
4. Idempotent producers (`enable.idempotence=true`)
5. Consumer group offsets committed after processing
6. Dead letter queues for failed message handling

## Red Lines
- Unbounded consumer lag without alerting
- Missing schema validation causing deserialization errors
- At-most-once delivery for critical data
- No dead letter queue for poison messages
- Hardcoded bootstrap servers in code

## Pattern: Reliable Event Processing
```python
from confluent_kafka import Producer, Consumer
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.avro import AvroSerializer, AvroDeserializer

# Producer with idempotence
producer_config = {
    'bootstrap.servers': 'localhost:9092',
    'enable.idempotence': True,
    'acks': 'all',
    'retries': 5,
}
producer = Producer(producer_config)

def delivery_callback(err, msg):
    if err:
        print(f"Delivery failed: {err}")
    else:
        print(f"Delivered to {msg.topic()}[{msg.partition()}]")

producer.produce('events', key='user-123', value=event_bytes, callback=delivery_callback)
producer.flush()

# Consumer with manual commit
consumer_config = {
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'event-processors',
    'auto.offset.reset': 'earliest',
    'enable.auto.commit': False,
}
consumer = Consumer(consumer_config)
consumer.subscribe(['events'])

while True:
    msg = consumer.poll(1.0)
    if msg and not msg.error():
        process(msg)
        consumer.commit(msg)  # Commit after successful processing
```

## Integrates With
- **Processing**: Flink, Spark Streaming, ksqlDB
- **Schema**: Confluent Schema Registry, Apicurio
- **Monitoring**: Kafka Manager, Confluent Control Center

## Common Errors
| Error | Fix |
|-------|-----|
| `LEADER_NOT_AVAILABLE` | Wait for topic creation or check broker health |
| `OffsetOutOfRange` | Reset consumer offset or check retention |
| `SerializationError` | Verify schema compatibility in registry |
| `ConsumerGroupRebalance` frequent | Increase `session.timeout.ms` |

## Prod Ready
- [ ] Schema Registry for all topics
- [ ] Consumer lag monitoring and alerting
- [ ] Dead letter queue configured
- [ ] Idempotent producers enabled
- [ ] Partition count matched to parallelism
