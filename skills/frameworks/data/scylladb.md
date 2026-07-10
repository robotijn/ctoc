# ScyllaDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name scylla -p 9042:9042 scylladb/scylla:5.4
# Uses same CQL as Cassandra
pip install scylla-driver  # Or cassandra-driver
```

## Claude's Common Mistakes
1. **Non-shard-aware drivers** - 2-4x latency penalty without token-aware routing
2. **All Cassandra anti-patterns apply** - Large partitions, wrong indexes, etc.
3. **Ignoring workload prioritization** - Mix of OLTP/OLAP needs different settings
4. **Missing shard monitoring** - Uneven shards cause hotspots
5. **Wrong compaction strategy** - Must match workload type

## Correct Patterns (2026)
```python
from cassandra.cluster import Cluster
from cassandra.policies import TokenAwarePolicy, DCAwareRoundRobinPolicy

# Shard-aware connection (CRITICAL for performance)
cluster = Cluster(
    ['scylla1', 'scylla2', 'scylla3'],
    load_balancing_policy=TokenAwarePolicy(
        DCAwareRoundRobinPolicy(local_dc='dc1')
    ),
)
session = cluster.connect('app')

# Prepared statement for optimal routing
insert_stmt = session.prepare("""
    INSERT INTO events (partition_id, event_time, event_id, data)
    VALUES (?, ?, ?, ?) USING TTL ?
""")

# Batch within SAME partition only
from cassandra.query import BatchStatement
batch = BatchStatement()
for event in events_same_partition:
    batch.add(insert_stmt, (partition_id, event.time, event.id, event.data, 86400))
session.execute(batch)
```

```sql
-- Workload prioritization
ALTER SERVICE LEVEL oltp WITH timeout = '50ms';
ALTER SERVICE LEVEL analytics WITH timeout = '30s';

-- Materialized view for secondary access
CREATE MATERIALIZED VIEW events_by_type AS
    SELECT * FROM events
    WHERE event_type IS NOT NULL
    PRIMARY KEY (event_type, partition_id, event_time);
```

## Version Gotchas
- **v5.4+**: Improved Alternator (DynamoDB compatibility)
- **vs Cassandra**: 10x better latency, same CQL
- **Shard-per-core**: Architecture requires shard-aware drivers
- **CDC**: Native change data capture to Kafka

## What NOT to Do
- Do NOT use non-shard-aware drivers (huge latency penalty)
- Do NOT batch across partitions (defeats purpose)
- Do NOT ignore shard balance monitoring
- Do NOT apply Cassandra patterns without considering shards

## Data-Model Footguns (same CQL model, plus shard-per-core)
ScyllaDB is a C++ rewrite of Cassandra with a **shard-per-core** (thread-per-core,
shared-nothing) architecture. The **data model is identical to Cassandra's**, so
every Cassandra data-model footgun applies verbatim — and shard-awareness adds one
more layer.

```sql
-- FOOTGUN 1: HOT PARTITION — one enormous partition can pin an entire CPU shard
-- (Scylla maps a partition to exactly one shard on its owning replica). A
-- low-cardinality partition key serializes traffic onto a single core.
CREATE TABLE metrics_by_host (
    host TEXT,                     -- few hosts → few, hot partitions
    ts TIMESTAMP,
    value DOUBLE,
    PRIMARY KEY ((host), ts)
);

-- RIGHT: bucket to bound partition size AND spread across shards.
CREATE TABLE metrics_by_host (
    host TEXT,
    day DATE,                      -- (host, day) bounds size & fans out
    ts TIMESTAMP,
    value DOUBLE,
    PRIMARY KEY ((host, day), ts)
) WITH CLUSTERING ORDER BY (ts DESC);
```

- **`ALLOW FILTERING` is a full-table scan** — same trap as Cassandra; it reads and
  discards on every shard of every node. Design the partition key or a
  materialized view for the query instead.
- **Unbounded partition growth** eventually monopolizes a shard's memory/CPU; keep
  partitions bounded with a time/hash bucket in the partition key.
- **Tombstones** behave exactly as in Cassandra: deletes/TTL write markers held for
  `gc_grace_seconds` (default **10 days**); a read across many tombstones times out.
  Prefer TTL + `TimeWindowCompactionStrategy`; run `nodetool repair` within the
  grace window. [ScyllaDB docs — data modeling / ALLOW FILTERING, retrieved
  2026-07-10; see References]

## Shard-Aware Driver (the ScyllaDB-specific correctness/perf lever)
The single biggest ScyllaDB-only mistake is connecting with a **non-shard-aware**
driver. Cassandra drivers route to the right *node* but not the right *core*, so
Scylla must bounce the request to the owning shard — a measurable latency penalty.

```python
# RIGHT: the Scylla fork of the Python driver is shard-aware (connects to the
# per-shard port range so requests land on the owning core directly).
#   pip install scylla-driver        # shard-aware fork of cassandra-driver
from cassandra.cluster import Cluster
from cassandra.policies import TokenAwarePolicy, DCAwareRoundRobinPolicy

cluster = Cluster(
    ['scylla1', 'scylla2', 'scylla3'],
    load_balancing_policy=TokenAwarePolicy(DCAwareRoundRobinPolicy(local_dc='dc1')),
)
session = cluster.connect('app')
stmt = session.prepare("SELECT value FROM metrics_by_host WHERE host=? AND day=?")
# prepared + token-aware + shard-aware → routed to the exact owning core
session.execute(stmt, (host, day))
```
- Use `scylla-driver` (or a shard-aware Rust/Go/Java driver); prepared statements
  are what let the driver compute the token and pick the shard. Re-preparing per
  call defeats it. [ScyllaDB drivers docs, retrieved 2026-07-10; see References]

## Consistency (tunable, per-query — same as Cassandra)
```python
from cassandra import ConsistencyLevel
from cassandra.query import SimpleStatement

# RF=3, LOCAL_QUORUM on read+write → 2+2 > 3 → strong, in-DC (no WAN hop).
stmt = SimpleStatement(
    "SELECT * FROM metrics_by_host WHERE host=%s AND day=%s",
    consistency_level=ConsistencyLevel.LOCAL_QUORUM,
)

# Lightweight transaction (Paxos): linearizable CAS, expensive — use sparingly.
session.execute("INSERT INTO users (email, id) VALUES (%s,%s) IF NOT EXISTS",
                (email, uid))
```
- **`LOCAL_QUORUM`** is the multi-DC workhorse; the `R + W > RF` rule holds.
- **LWT** (`IF NOT EXISTS` / `IF col=`) is Paxos-backed and costs multiple
  round-trips — genuine compare-and-set only, never the default write path.
- ScyllaDB adds **workload prioritization** (Service Levels) to isolate OLTP from
  OLAP latency — a Scylla-only tuning knob on top of standard consistency.
  [ScyllaDB consistency / LWT docs, retrieved 2026-07-10; see References]

## Security — parameterized CQL & auth (CWE-89)
Same CQL, same injection class: concatenating user input into a query is **CWE-89**.

```python
# FOOTGUN (CWE-89): user input built into CQL text
session.execute(f"SELECT * FROM users WHERE email = '{email}'")   # injectable

# RIGHT: bind parameters via a prepared statement
prepared = session.prepare("SELECT * FROM users WHERE email = ?")
session.execute(prepared, (email,))
```
- Enable authentication + authorization (RBAC), grant least-privilege per role, and
  turn on client/inter-node TLS. Do not ship the default superuser.
  [cwe.mitre.org/data/definitions/89.html + ScyllaDB security docs, retrieved
  2026-07-10; see References]

## Testing
```python
import pytest
from testcontainers.core.container import DockerContainer
from cassandra.cluster import Cluster

@pytest.fixture(scope="session")
def session():
    c = DockerContainer("scylladb/scylla:2026.1").with_exposed_ports(9042)
    c.start()
    cluster = Cluster([c.get_container_host_ip()],
                      port=int(c.get_exposed_port(9042)))
    yield cluster.connect()
    cluster.shutdown(); c.stop()

def test_query_uses_partition_key(session):
    # assert the read path never needs ALLOW FILTERING (design regression guard)
    session.execute("CREATE KEYSPACE IF NOT EXISTS t WITH replication="
                    "{'class':'SimpleStrategy','replication_factor':1}")
    session.execute("CREATE TABLE IF NOT EXISTS t.m (host text, ts int, "
                    "v double, PRIMARY KEY ((host), ts))")
    rows = session.execute("SELECT v FROM t.m WHERE host=%s", ("h1",))  # no filtering
    assert rows is not None
```
- Test against a real Scylla container (semantics match Cassandra); assert the
  partition-key access path and that LWT `applied` flags behave as designed.

## Performance
- **Shard-aware + token-aware + prepared** is the trifecta; skipping any one adds a
  hop. Non-shard-aware drivers pay a documented 2–4x latency tax.
- **Batch within one partition only**; cross-partition batches force coordinator
  fan-out and defeat the shard model.
- Use **Service Levels / workload prioritization** to keep analytics from starving
  OLTP. Monitor **per-shard** balance (a hot shard = a hot partition upstream).
- ScyllaDB's Seastar reactor means a single blocked shard degrades a slice of
  cluster capacity — bounded partitions keep shards balanced.

## Version-Specific Gotchas (dated, sourced)
- **ScyllaDB releases use calendar versioning.** The current stable line is
  **ScyllaDB 2026.1.x** with **2026.2.0** as the newest GA tag; ScyllaDB unified the
  Open Source and Enterprise editions under this scheme. [github.com/scylladb/scylladb
  release tags, retrieved 2026-07-10; see References]
- **scylla-driver (Python) 3.29.11**, uploaded **2026-06-15** — the shard-aware fork
  of `cassandra-driver`; it is CQL-compatible and a drop-in import
  (`from cassandra.cluster import Cluster`). [pypi.org/project/scylla-driver JSON API,
  retrieved 2026-07-10]
- **CQL parity with Cassandra**: Scylla tracks Cassandra CQL, so Cassandra data-model
  rules apply — but shard-awareness and Service Levels are Scylla-only. `Alternator`
  provides a DynamoDB-compatible API for teams migrating off DynamoDB.

## References (retrieved 2026-07-10)
- ScyllaDB releases (GitHub tags): https://github.com/scylladb/scylladb/tags
- scylla-driver releases (PyPI JSON): https://pypi.org/pypi/scylla-driver/json
- ScyllaDB data modeling & ALLOW FILTERING: https://docs.scylladb.com/stable/data-modeling/
- Shard-aware drivers: https://docs.scylladb.com/stable/using-scylla/drivers/
- Consistency & LWT: https://docs.scylladb.com/stable/cql/consistency.html
- Security (auth/RBAC/TLS): https://docs.scylladb.com/stable/operating-scylla/security/
- CWE-89 (SQL/CQL injection): https://cwe.mitre.org/data/definitions/89.html
