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

## Snapshot vs Streaming Footguns (the two phases that trip everyone)
Debezium runs in two phases: an initial **consistent snapshot** of existing rows,
then continuous **streaming** from the transaction log (Postgres WAL via a
replication slot, MySQL binlog, etc.). Most CDC bugs come from misunderstanding
the boundary between them.

```json
{
  "name": "postgres-cdc",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "plugin.name": "pgoutput",
    "slot.name": "debezium_slot",
    "publication.name": "debezium_pub",

    "snapshot.mode": "initial",              // snapshot once, then stream (DEFAULT)
    "heartbeat.interval.ms": "10000",        // advance the slot on idle tables
    "heartbeat.action.query": "UPDATE cdc_heartbeat SET ts = now()",
    "tombstones.on.delete": "true",          // emit null-value tombstone after a delete
    "signal.data.collection": "public.debezium_signal"  // for incremental snapshots
  }
}
```
- **`snapshot.mode` chooses correctness vs cost:** `initial` (snapshot then
  stream — the safe default), `never` (stream only; you MISS all pre-existing rows
  and any change before the slot existed), `schema_only`/`no_data` (capture the
  schema, stream new changes but do NOT backfill history), `always` (re-snapshot
  every restart — expensive). Picking `never` on a fresh connector silently loses
  the entire existing table. Use **incremental snapshots** (signal-triggered) to
  backfill large tables without blocking streaming.
- **Snapshot holds locks / a long read** on some DBs — on a huge table this can
  stall or bloat; incremental snapshot avoids the stop-the-world read.
  [debezium.io connector docs: snapshots / snapshot.mode, retrieved 2026-07-10]

## Replication-Slot / WAL Retention Blowup (the disk-fill outage)
- **A Postgres replication slot pins the WAL.** Postgres will NOT recycle WAL that
  the slot hasn't confirmed — so if the connector is **down, lagging, or watching
  only low-traffic tables while the DB is busy elsewhere**, WAL accumulates and
  eventually **fills the disk and takes down the primary**. This is the single
  most dangerous Debezium production failure.
- **Mitigations:** (1) **heartbeat** (`heartbeat.interval.ms` +
  `heartbeat.action.query`) so the slot's confirmed LSN advances even when the
  captured tables are idle; (2) monitor `pg_replication_slots.confirmed_flush_lsn`
  lag and alert; (3) set `max_slot_wal_keep_size` (Postgres 13+) as a safety cap so
  a dead slot is invalidated instead of filling the disk (you then need a re-snapshot,
  but the DB survives); (4) **drop orphaned slots** when a connector is removed — a
  forgotten slot silently retains WAL forever.
  [debezium.io postgresql connector: WAL disk consumption, retrieved 2026-07-10]

## Ordering, Schema-Change & Offset Correctness
- **Per-table topic, ordered within a partition.** Debezium keys change events by
  primary key, so all changes to one row land in one partition and stay ordered.
  Cross-table transactional ordering is NOT preserved unless you use the
  transaction-metadata topic.
- **Schema-change events:** DDL (e.g. `ALTER TABLE`) emits a schema-change event;
  consumers using a naive fixed schema break. Register with a Schema Registry using
  a compatibility mode so an added column is backward-compatible instead of a
  poison message.
- **Exactly-once:** Debezium on Kafka Connect supports **exactly-once delivery**
  (`exactly.once.support=required` on a source connector, Connect 3.3+); without it
  a Connect restart can re-emit the last events (at-least-once) — make consumers
  idempotent on the change key + LSN/SCN.
- **Offsets are the connector's memory.** They live in Kafka Connect's offset topic;
  lose them and the connector re-snapshots (or, worse with `snapshot.mode=never`,
  resumes from "now" and loses the gap). Back up the offset/config/status topics.

## Security
- **Least-privilege replication user.** The DB user needs only `REPLICATION` +
  `SELECT` on captured tables (Postgres) / `REPLICATION SLAVE, REPLICATION CLIENT,
  SELECT` (MySQL) — NOT a superuser. A superuser CDC account is a lateral-movement
  prize.
- **Never inline DB credentials** in the connector JSON; use Kafka Connect
  `config.providers` (file/vault) so secrets are referenced, not stored in the
  config topic / REST responses. Hard-coded connector credentials are CWE-798
  (Use of Hard-coded Credentials); a readable config topic exposing them is CWE-522
  (Insufficiently Protected Credentials).
  [cwe.mitre.org/data/definitions/798.html; cwe.mitre.org/data/definitions/522.html, retrieved 2026-07-10]
- **Kafka Connect REST API is unauthenticated by default** and can create/delete
  connectors (and thus read your database) — put it behind auth / localhost; an
  exposed endpoint is a CWE-200 exposure. [cwe.mitre.org/data/definitions/200.html, retrieved 2026-07-10]

## Error Handling & Testing
```json
{
  "errors.tolerance": "all",
  "errors.deadletterqueue.topic.name": "cdc.dlq",
  "errors.deadletterqueue.context.headers.enable": "true",
  "errors.log.enable": "true"
}
```
- **Route conversion/serialization failures to a DLQ** (`errors.tolerance=all` +
  `errors.deadletterqueue.topic.name`) so one bad record does not halt the connector
  task; the default `errors.tolerance=none` fails the task on the first bad event.
- **Test with Testcontainers** (real Postgres/MySQL + Kafka Connect + Debezium
  image) so snapshot→stream transition, tombstones, and schema-change events are
  exercised end-to-end — a mocked source tests nothing about CDC semantics.
- Assert a **tombstone** is emitted on delete and that your sink honors it (a sink
  that ignores tombstones leaves ghost rows / stale compacted-topic state).

## Performance
- **`max.batch.size` / `max.queue.size`** tune throughput vs memory; large source
  transactions buffer in memory, so cap them and watch heap.
- **Incremental snapshots** backfill big tables in chunks (`incremental.snapshot.
  chunk.size`) without blocking streaming or holding long locks.
- **Filter early** with `table.include.list` / column filters so you don't ship and
  store change events you'll never consume (and don't hold WAL for idle noise).

## Version-Specific Gotchas (dated, sourced)
- **Debezium 3.6.0.Final** is a current stable release (published to Maven Central
  **2026-07-01**). [repo1.maven.org/maven2/io/debezium/debezium-core/, retrieved
  2026-07-10; debezium.io releases]
- The **3.x line** requires Kafka Connect 3.x and a modern JDK; older 1.x/2.x
  connector configs and `database.server.name` (now `topic.prefix`) naming differ —
  check the 3.x connector docs before copying an old config.
- **Postgres logical decoding** needs `wal_level=logical` and a plugin
  (`pgoutput` is built in from PG10+; the old `wal2json`/`decoderbufs` are legacy).
- **`max_slot_wal_keep_size`** (Postgres 13+) is the safety valve against the
  disk-fill outage above — set it even though it means a re-snapshot if the slot is
  invalidated.

## References (retrieved 2026-07-10)
- Debezium releases (Maven Central): https://repo1.maven.org/maven2/io/debezium/debezium-core/
- Debezium documentation: https://debezium.io/documentation/
- PostgreSQL connector (WAL / snapshot / slots): https://debezium.io/documentation/reference/stable/connectors/postgresql.html
- Kafka Connect exactly-once source support: https://kafka.apache.org/documentation/#connect
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
- CWE-522 Insufficiently Protected Credentials: https://cwe.mitre.org/data/definitions/522.html
- CWE-200 Exposure of Sensitive Information: https://cwe.mitre.org/data/definitions/200.html
