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

## Delivery-Semantics Footguns (the ones that lose or duplicate data)
The core Kafka correctness question is *delivery semantics*: at-most-once,
at-least-once, or exactly-once. The default client config is at-least-once at
best and **silently at-most-once** the moment auto-commit is on.

```python
from confluent_kafka import Producer, Consumer

# FOOTGUN: enable.auto.commit=True (the DEFAULT) commits offsets on a 5s timer,
# BEFORE your handler has finished. Crash after the commit but before the write
# = the record is skipped forever (at-most-once, silent data loss).
c = Consumer({'group.id': 'g', 'bootstrap.servers': 'localhost:9092'})  # auto-commit ON

# RIGHT: commit AFTER the side effect is durable, so a crash re-delivers (at-least-once).
c = Consumer({
    'group.id': 'g',
    'bootstrap.servers': 'localhost:9092',
    'enable.auto.commit': False,          # you own the offset lifecycle
    'auto.offset.reset': 'earliest',      # DEFAULT is 'latest' -> new group SKIPS backlog
})
while True:
    msg = c.poll(1.0)
    if msg and not msg.error():
        process(msg)                      # make the side effect idempotent (dedup key)
        c.commit(msg, asynchronous=False) # commit ONLY after process() succeeds

# RIGHT: durable producer. Without enable.idempotence a retry can WRITE A DUPLICATE
# or REORDER; without acks=all a leader crash after ack loses the record.
p = Producer({
    'bootstrap.servers': 'localhost:9092',
    'enable.idempotence': True,   # dedup + ordering on retry (requires acks=all)
    'acks': 'all',                # wait for all in-sync replicas
    'max.in.flight.requests.per.connection': 5,  # >5 breaks idempotent ordering
})
```
- **At-least-once is the safe default; exactly-once needs work.** True
  exactly-once requires either an idempotent consumer (dedup by a business key) or
  Kafka transactions (`transactional.id` + `send_offsets_to_transaction` +
  `read_committed` isolation on the consumer). An idempotent *producer* alone is
  NOT end-to-end exactly-once — it only dedups producer-side retries.
- **`acks=all` needs `min.insync.replicas >= 2`** on the topic/broker, or "all"
  means "all one replica" and a single broker loss still loses data.
  [kafka.apache.org design/semantics + producer configs, retrieved 2026-07-10]

## Consumer-Group Rebalance & Partition-Key Skew
- **Rebalance storms:** the legacy `range`/`RoundRobin` assignors do a
  *stop-the-world* rebalance — every consumer stops on any membership change.
  Use `cooperative-sticky` (incremental cooperative rebalancing) so only the
  moved partitions pause. Combine with **static membership** (`group.instance.id`
  + a `session.timeout.ms` larger than your rolling-restart gap) so a quick
  bounce does NOT trigger a rebalance at all.
- **Partition-key skew:** the partition is `hash(key) % num_partitions`. A
  low-cardinality or hot key (e.g. one big tenant) sends most traffic to one
  partition, so one consumer is the bottleneck and lag piles up there while
  others idle — throughput is capped by the hottest partition, not the total.
  Choose a high-cardinality key, or add a salt/composite key when a single value
  dominates. Ordering is **only** guaranteed *within* a partition, so any
  re-keying trades ordering for balance.
- A `null` key gives round-robin (sticky-batching) distribution and **no ordering
  guarantee at all**. [kafka.apache.org consumer / producer docs, retrieved 2026-07-10]

## Security & Schema-Evolution
- **Authn/authz:** brokers accept **PLAINTEXT** and allow anyone by default. Set
  `security.protocol=SASL_SSL` (SASL/SCRAM or OAuth) + TLS, and turn on the ACL
  authorizer with `allow.everyone.if.no.acl.found=false` — otherwise a reachable
  broker is world-readable/writable. Exposure of an unauthenticated broker is a
  CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor) class
  problem. [cwe.mitre.org/data/definitions/200.html, retrieved 2026-07-10]
- **Deserialization:** never wire a Java deserializer that instantiates arbitrary
  classes from topic bytes — untrusted-data deserialization is **CWE-502**
  (Deserialization of Untrusted Data). Prefer Avro/Protobuf/JSON-Schema through a
  Schema Registry with an explicit reader schema.
  [cwe.mitre.org/data/definitions/502.html, retrieved 2026-07-10]
- **Schema compatibility:** register a compatibility mode (`BACKWARD` is the
  common default) so a producer cannot publish a breaking schema that silently
  poisons every downstream consumer. `BACKWARD` = new schema can read old data
  (safe to add optional/default fields, unsafe to remove required ones).

## Error Handling & Testing
```python
# Dead-letter the poison record instead of blocking the partition forever.
try:
    process(msg)
    consumer.commit(msg, asynchronous=False)
except PoisonRecord:
    dlq_producer.produce('events.DLQ', key=msg.key(), value=msg.value())
    dlq_producer.flush()
    consumer.commit(msg, asynchronous=False)   # advance past the poison record
```
- **Never let a single bad record halt the partition.** A synchronous re-throw
  with auto-commit off stalls the whole partition (head-of-line blocking); route
  to a DLQ topic and commit past it.
- **Test with a real broker, not a mock.** Use Testcontainers-Kafka or the
  embedded `kafka` test cluster so partitioning, rebalancing, and commit timing
  are exercised for real — mocking `poll()` tests your mock, not Kafka's semantics.
- Assert **consumer lag** (`kafka-consumer-groups --describe`) stays bounded in a
  load test; growing lag is the early signal of skew or a slow handler.

## Performance & Throughput
- **Batch on the producer:** `linger.ms` (5–100ms) + `batch.size` (e.g. 64–256KB)
  + `compression.type=zstd|lz4` trade a little latency for large throughput gains;
  the default `linger.ms=0` sends tiny batches.
- **Consumer parallelism is capped by partitions** — you cannot have more active
  consumers in a group than partitions, so size partitions for peak fan-out up
  front (repartitioning rewrites key→partition mapping).
- **Tiered storage** (GA in the 4.x line) offloads cold segments to object storage
  so retention no longer bounds local disk.

## Version-Specific Gotchas (dated, sourced)
- **Kafka 4.3.1** is a current stable release (uploaded to the Apache archive
  **2026-06-23**). The 4.x line is **KRaft-only — ZooKeeper mode has been removed**,
  so any ZooKeeper-based config is dead on 4.x. [archive.apache.org/dist/kafka/4.3.1/,
  retrieved 2026-07-10; kafka.apache.org/downloads, retrieved 2026-07-10]
- **`max.in.flight.requests.per.connection` > 5** disables idempotent-producer
  ordering guarantees; keep it ≤ 5 whenever `enable.idempotence=true`.
- **`enable.auto.commit` defaults to `true`** and **`auto.offset.reset` defaults
  to `latest`** — both are data-loss footguns for a fresh consumer group; set them
  explicitly. [kafka.apache.org consumer configs, retrieved 2026-07-10]
- Prefer the **`confluent-kafka`** client (librdkafka) over `kafka-python` for
  throughput and up-to-date protocol/feature support.

## References (retrieved 2026-07-10)
- Kafka downloads (latest stable): https://kafka.apache.org/downloads
- Kafka 4.3.1 archive listing (release date): https://archive.apache.org/dist/kafka/4.3.1/
- Design / delivery semantics: https://kafka.apache.org/documentation/#semantics
- Consumer configuration reference: https://kafka.apache.org/documentation/#consumerconfigs
- Producer configuration reference: https://kafka.apache.org/documentation/#producerconfigs
- CWE-502 Deserialization of Untrusted Data: https://cwe.mitre.org/data/definitions/502.html
- CWE-200 Exposure of Sensitive Information: https://cwe.mitre.org/data/definitions/200.html
