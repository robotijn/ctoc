# Debezium CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name debezium -p 8083:8083 \
  -e BOOTSTRAP_SERVERS=kafka:9092 \
  debezium/connect:2.5
# Register connector via REST API
```

## Claude's Common Mistakes
1. **Missing heartbeat** - Causes WAL/binlog growth on idle tables
2. **No Schema Registry** - Schema changes break consumers silently
3. **Ignoring tombstones** - Needed for proper delete handling in sinks
4. **Large transactions without tuning** - Causes lag and memory issues
5. **No offset backup** - Losing offsets means full resync

## Correct Patterns (2026)
```json
{
  "name": "postgres-cdc",
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
    "publication.name": "debezium_pub",

    "key.converter": "io.confluent.connect.avro.AvroConverter",
    "key.converter.schema.registry.url": "http://schema-registry:8081",
    "value.converter": "io.confluent.connect.avro.AvroConverter",
    "value.converter.schema.registry.url": "http://schema-registry:8081",

    "heartbeat.interval.ms": "10000",
    "heartbeat.action.query": "UPDATE heartbeat SET ts = NOW()",

    "tombstones.on.delete": "true",
    "snapshot.mode": "initial"
  }
}
```

## Version Gotchas
- **v2.5+**: Improved incremental snapshots, better MongoDB support
- **Heartbeat**: Required to prevent slot/binlog growth on idle tables
- **Schema Registry**: Essential for schema evolution without breaking consumers
- **Snapshot modes**: initial, schema_only, never - choose based on needs

## What NOT to Do
- Do NOT skip heartbeat configuration (causes WAL growth)
- Do NOT ignore Schema Registry (schema changes break consumers)
- Do NOT forget tombstones for delete handling
- Do NOT run without offset backup strategy
