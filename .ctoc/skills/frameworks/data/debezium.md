# Debezium CTO
> Distributed change data capture platform for streaming database changes.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name debezium -p 8083:8083 debezium/connect
curl http://localhost:8083/connectors
curl -X POST http://localhost:8083/connectors -H "Content-Type: application/json" -d @connector.json
```

## Non-Negotiables
1. Connector configuration with proper serialization
2. Schema Registry integration for schema evolution
3. Offset management and backup strategy
4. Single Message Transforms (SMTs) for routing/filtering
5. Monitoring with JMX or Prometheus metrics
6. Heartbeat enabled to prevent slot growth

## Red Lines
- Missing heartbeat causing WAL/binlog growth
- No tombstone handling for deletes
- Ignoring schema evolution breaking consumers
- Large transactions without chunking
- No offset backup strategy

## Pattern: Production CDC Setup
```json
{
  "name": "postgres-cdc-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "${POSTGRES_PASSWORD}",
    "database.dbname": "production",
    "topic.prefix": "prod",
    "table.include.list": "public.orders,public.users",

    "plugin.name": "pgoutput",
    "slot.name": "debezium_slot",
    "publication.name": "debezium_publication",

    "key.converter": "io.confluent.connect.avro.AvroConverter",
    "key.converter.schema.registry.url": "http://schema-registry:8081",
    "value.converter": "io.confluent.connect.avro.AvroConverter",
    "value.converter.schema.registry.url": "http://schema-registry:8081",

    "heartbeat.interval.ms": "10000",
    "heartbeat.action.query": "UPDATE debezium_heartbeat SET ts = NOW()",

    "transforms": "route",
    "transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
    "transforms.route.regex": "prod\\.public\\.(.*)",
    "transforms.route.replacement": "cdc.$1",

    "snapshot.mode": "initial",
    "decimal.handling.mode": "string",
    "tombstones.on.delete": "true"
  }
}
```

## Integrates With
- **Databases**: PostgreSQL, MySQL, MongoDB, SQL Server, Oracle
- **Messaging**: Kafka, Pulsar, Kinesis
- **Processing**: Flink, Spark Streaming, ksqlDB

## Common Errors
| Error | Fix |
|-------|-----|
| `Replication slot inactive` | Enable heartbeat queries |
| `Schema change broke consumer` | Use Schema Registry compatibility |
| `WAL/binlog growing` | Check heartbeat, reduce retention |
| `Connector lag high` | Increase tasks, optimize queries |

## Prod Ready
- [ ] Heartbeat configured
- [ ] Schema Registry integrated
- [ ] Offset backup automated
- [ ] Monitoring dashboards deployed
- [ ] Tombstone handling configured
