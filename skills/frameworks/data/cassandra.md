# Apache Cassandra CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name cassandra -p 9042:9042 cassandra:5
# Python driver
pip install cassandra-driver
```

## Claude's Common Mistakes
1. **Relational data modeling** - Model for queries, not entities (denormalize)
2. **Large partitions (>100MB)** - Causes read timeouts and memory issues
3. **Secondary indexes on high-cardinality** - Extremely slow; redesign schema
4. **SELECT * without partition key** - Full cluster scan
5. **Missing TTL on time-series** - Tombstones accumulate, kill performance

## Correct Patterns (2026)
```sql
-- Keyspace with proper replication
CREATE KEYSPACE app WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'dc1': 3
};

-- Table designed for query: "Get user's recent orders"
CREATE TABLE orders_by_user (
    user_id UUID,
    order_date TIMESTAMP,
    order_id UUID,
    total DECIMAL,
    status TEXT,
    PRIMARY KEY ((user_id), order_date, order_id)
) WITH CLUSTERING ORDER BY (order_date DESC)
  AND compaction = {
    'class': 'TimeWindowCompactionStrategy',
    'compaction_window_unit': 'DAYS',
    'compaction_window_size': 1
  }
  AND default_time_to_live = 7776000;  -- 90 days TTL

-- Denormalized table for different query pattern
CREATE TABLE orders_by_id (
    order_id UUID PRIMARY KEY,
    user_id UUID,
    order_date TIMESTAMP,
    total DECIMAL,
    status TEXT
);

-- Query WITH partition key (efficient)
SELECT * FROM orders_by_user
WHERE user_id = ? AND order_date > ?
LIMIT 20;
```

## Version Gotchas
- **v5**: Vector search support, unified nodes (no separate roles)
- **TWCS**: TimeWindowCompactionStrategy for time-series
- **Tombstones**: Delete operations create tombstones; use TTL instead
- **Astra**: DataStax managed Cassandra (serverless)

## What NOT to Do
- Do NOT model data like relational DB (model for queries)
- Do NOT create partitions >100MB (redesign partition key)
- Do NOT use secondary indexes on high-cardinality columns
- Do NOT SELECT without partition key filter (cluster scan)

## Data-Model Footguns (partition key drives everything)
The **partition key** is the single most consequential design decision — it fixes
data placement, request routing, and the hard ceiling on scalability. Two failure
modes dominate what Claude writes:

```sql
-- FOOTGUN 1: HOT PARTITION — a low-cardinality partition key funnels all traffic
-- onto one replica set. Every write for "US" lands on the same coordinator.
CREATE TABLE events_by_country (
    country TEXT,          -- ~200 values → a handful of enormous partitions
    event_time TIMESTAMP,
    event_id TIMEUUID,
    PRIMARY KEY ((country), event_time, event_id)
);

-- RIGHT: bucket the partition key so load spreads and partitions stay bounded.
CREATE TABLE events_by_country (
    country TEXT,
    day DATE,             -- composite partition key: (country, day) bounds size
    event_time TIMESTAMP,
    event_id TIMEUUID,
    PRIMARY KEY ((country, day), event_time, event_id)
) WITH CLUSTERING ORDER BY (event_time DESC);
```

- **Unbounded partition growth** is the same footgun over time: a partition keyed
  only on `user_id` grows forever as that user acts. Keep partitions under ~100MB /
  ~100k rows — add a time bucket (`(user_id, month)`) to the partition key.
- **Query-first modeling, one table per query.** Cassandra has no server-side joins
  and no ad-hoc `WHERE`; you denormalize into a table shaped for each read path.
  Writing a relational schema and hoping to query it flexibly is the top mistake.
- **`ALLOW FILTERING` is a full-cluster scan.** It reads and discards rows on every
  node. It compiles and "works" on a laptop, then melts a production cluster. Never
  ship it — design a table (or a properly-scoped secondary/SASI index) whose
  partition key answers the query. [Apache Cassandra CQL SELECT docs, retrieved
  2026-07-10; see References]

## Tombstones & gc_grace_seconds (the tombstone graveyard)
Deletes and TTL expiries do NOT remove data — they write **tombstones** (deletion
markers) that persist for `gc_grace_seconds` (default **864000 = 10 days**) so
deletes propagate before compaction reclaims them. A read that crosses many
tombstones does O(tombstones) work:

```sql
-- FOOTGUN: queue/inbox pattern — insert then delete rows in the SAME partition.
-- Reading the "head" scans thousands of tombstones first → read timeouts.
SELECT * FROM job_queue WHERE shard = ? LIMIT 10;   -- may scan 100k tombstones

-- Guardrails: warn/fail thresholds live in cassandra.yaml
--   tombstone_warn_threshold: 1000
--   tombstone_failure_threshold: 100000   -- query is ABORTED past this
```

- **Prefer TTL over explicit deletes** for time-series, and use
  `TimeWindowCompactionStrategy` so whole SSTables drop at once instead of leaving
  tombstones interleaved with live data.
- Do NOT drop `gc_grace_seconds` to 0 to "avoid tombstones" — that risks deleted
  data resurrecting if a replica missed the delete and no repair ran within the
  window. Run regular `nodetool repair` instead. [Apache Cassandra compaction /
  operating docs, retrieved 2026-07-10; see References]

## Consistency (tunable, per-query)
Consistency is set **per statement**, not per cluster. The correctness rule is
`R + W > RF` for strong consistency (read + write replicas overlap):

```python
from cassandra import ConsistencyLevel
from cassandra.query import SimpleStatement

# RF=3 per DC. LOCAL_QUORUM (=2) on BOTH read and write → 2+2 > 3 → strong,
# and LOCAL_ keeps it in-DC (no cross-region latency on the request path).
stmt = SimpleStatement(
    "SELECT * FROM orders_by_user WHERE user_id = %s",
    consistency_level=ConsistencyLevel.LOCAL_QUORUM,
)

# Lightweight transaction (Paxos) — linearizable, but 4 round-trips. Use SPARINGLY.
session.execute(
    "INSERT INTO users (email, id) VALUES (%s, %s) IF NOT EXISTS",
    (email, user_id),
)
```

- **`LOCAL_QUORUM` is the workhorse** for multi-DC: strong within a datacenter,
  no synchronous cross-region hop. `QUORUM` (global) adds WAN latency to every request.
- **Lightweight transactions (LWT / `IF NOT EXISTS` / `IF ... =`)** use Paxos and
  cost ~4x a normal write. They are for genuine compare-and-set (uniqueness, guards)
  — never as a default write path. `SERIAL`/`LOCAL_SERIAL` reads pair with them.
  [Apache Cassandra consistency + LWT docs, retrieved 2026-07-10; see References]

## Security — parameterized CQL & RBAC (CWE-89)
CQL is injectable exactly like SQL: string-building a query with user input is
**CWE-89** (Improper Neutralization of Special Elements used in an SQL Command).

```python
# FOOTGUN (CWE-89): user input concatenated into CQL
q = f"SELECT * FROM users WHERE email = '{email}'"   # ' OR '1'='1 → data leak
session.execute(q)

# RIGHT: bind parameters — prepared once, executed with a values tuple
prepared = session.prepare("SELECT * FROM users WHERE email = ?")
session.execute(prepared, (email,))   # driver escapes/serializes; injection-proof
```

- Prepared statements also cache the query plan cluster-wide — correctness AND
  performance in one move.
- Enable `PasswordAuthenticator` + `CassandraAuthorizer` and grant least-privilege
  per role (`GRANT SELECT ON keyspace.table TO app_ro`); never ship the default
  `cassandra`/`cassandra` superuser. Enable client-to-node and node-to-node TLS.
  [cwe.mitre.org/data/definitions/89.html + Cassandra security docs, retrieved
  2026-07-10; see References]

## Testing
```python
# Test against a REAL Cassandra (testcontainers) — not a mock. CQL semantics
# (partition routing, tombstones, LWT) cannot be faithfully mocked.
import pytest
from testcontainers.cassandra import CassandraContainer
from cassandra.cluster import Cluster

@pytest.fixture(scope="session")
def session():
    with CassandraContainer("cassandra:5.0") as c:
        cluster = Cluster(c.get_contact_points(), port=c.get_exposed_port(9042))
        yield cluster.connect()
        cluster.shutdown()

def test_lwt_rejects_duplicate(session):
    session.execute("CREATE KEYSPACE IF NOT EXISTS t WITH replication="
                    "{'class':'SimpleStrategy','replication_factor':1}")
    session.execute("CREATE TABLE IF NOT EXISTS t.u (email text PRIMARY KEY)")
    r1 = session.execute("INSERT INTO t.u (email) VALUES ('a') IF NOT EXISTS")
    r2 = session.execute("INSERT INTO t.u (email) VALUES ('a') IF NOT EXISTS")
    assert r1.one().applied is True
    assert r2.one().applied is False   # LWT enforced uniqueness
```
- Assert `applied` on LWT results — a `False` there is a real business outcome, not
  an error. Test the partition-key access path you designed for, and assert reads
  never require `ALLOW FILTERING`.

## Performance
- **Route to the owning replica** with `TokenAwarePolicy` wrapping a DC-aware policy
  so requests skip the coordinator hop.
- **Prepared statements** avoid re-parsing and enable token-aware routing by
  partition key. Reuse the `PreparedStatement`; don't re-prepare per call.
- **Batch only within one partition.** A multi-partition `BatchStatement` makes the
  coordinator fan out and is an anti-pattern (unlogged batches across partitions can
  overload a node). Batches are for atomicity within a partition, not throughput.
- Pick compaction by workload: `TimeWindowCompactionStrategy` (time-series/TTL),
  `LeveledCompactionStrategy` (read-heavy, low duplication), `SizeTiered` (write-heavy).

## Version-Specific Gotchas (dated, sourced)
- **Apache Cassandra 5.0.8** is the current stable server release on the 5.0 line.
  5.0 adds **Storage-Attached Indexes (SAI)** and native **vector search** (`VECTOR`
  type + ANN), and Unified Compaction Strategy. [dlcdn.apache.org/cassandra listing,
  retrieved 2026-07-10; see References]
- **cassandra-driver (Python) 3.30.1**, uploaded **2026-07-06**, supports CPython
  3.10–3.14. Prefer it over the abandoned per-vendor forks. [pypi.org/project/cassandra-driver
  JSON API, retrieved 2026-07-10]
- **SAI vs legacy secondary index**: SAI (5.0) is far cheaper than the old
  `2i`/SASI indexes but still queries within partitions efficiently only — it is not
  a license to run unbounded `ALLOW FILTERING`.
- `gc_grace_seconds` default is **10 days**; changing it has correctness
  implications (see Tombstones) — pair any reduction with a repair schedule inside
  the window.

## References (retrieved 2026-07-10)
- Cassandra server releases (Apache mirror): https://dlcdn.apache.org/cassandra/
- cassandra-driver releases (PyPI JSON): https://pypi.org/pypi/cassandra-driver/json
- CQL SELECT (ALLOW FILTERING): https://cassandra.apache.org/doc/latest/cassandra/developing/cql/dml.html
- Compaction & tombstones / gc_grace_seconds: https://cassandra.apache.org/doc/latest/cassandra/managing/operating/compaction/
- Consistency levels & LWT: https://cassandra.apache.org/doc/latest/cassandra/developing/cql/dml.html#consistency-levels
- Security (auth/RBAC/TLS): https://cassandra.apache.org/doc/latest/cassandra/managing/security/
- CWE-89 (SQL/CQL injection): https://cwe.mitre.org/data/definitions/89.html
