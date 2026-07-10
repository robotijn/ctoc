# QuestDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name questdb -p 9000:9000 -p 9009:9009 -p 8812:8812 questdb/questdb
# Web console at http://localhost:9000
# ILP ingestion on port 9009, PostgreSQL wire on 8812
```

## Claude's Common Mistakes
1. **String instead of Symbol** - Symbol is 10x faster for categorical data
2. **Missing designated timestamp** - Required for time-series optimizations
3. **No partition strategy** - Large tables need partitioning (DAY/MONTH)
4. **HTTP API for high-throughput** - Use ILP (InfluxDB Line Protocol) instead
5. **Missing SAMPLE BY** - Standard GROUP BY is slower for time aggregations

## Correct Patterns (2026)
```sql
-- Optimized schema with Symbol types
CREATE TABLE sensors (
    timestamp TIMESTAMP,
    device_id SYMBOL CAPACITY 100000,
    sensor_type SYMBOL,
    value DOUBLE,
    quality INT
) TIMESTAMP(timestamp) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(timestamp, device_id);

-- High-performance ingestion via ILP (port 9009)
-- sensors,device_id=d1,sensor_type=temp value=23.5 1609459200000000000

-- Efficient downsampling with SAMPLE BY
SELECT
    timestamp,
    device_id,
    avg(value) AS avg_value,
    max(value) AS max_value
FROM sensors
WHERE timestamp > dateadd('d', -7, now())
SAMPLE BY 1h
ALIGN TO CALENDAR;

-- Latest value per device (optimized)
SELECT * FROM sensors
WHERE timestamp > dateadd('h', -1, now())
LATEST ON timestamp PARTITION BY device_id;
```

## Version Gotchas
- **WAL mode**: Write-ahead log for durability; configure based on needs
- **DEDUP**: Built-in deduplication for idempotent ingestion
- **ILP vs SQL**: ILP for high-throughput writes; SQL for queries
- **vs InfluxDB**: QuestDB is faster for most time-series workloads

## What NOT to Do
- Do NOT use String for categorical data (use Symbol)
- Do NOT skip designated timestamp (breaks optimizations)
- Do NOT use HTTP API for high-throughput (use ILP)
- Do NOT use GROUP BY for time aggregations (use SAMPLE BY)

## Time-Series Ingestion Footguns (designated timestamp, O3 & ordering)
QuestDB is a columnar time-series store partitioned by time; its performance model
hinges on the **designated timestamp** and how ingested rows are ordered relative
to it. Get this wrong and writes silently amplify or rows land in the wrong
partition.

```sql
-- Designated timestamp is DECLARED at table creation; it drives partitioning,
-- SAMPLE BY, LATEST ON, ASOF JOIN and the O3 write path
CREATE TABLE sensors (
    ts TIMESTAMP,
    device_id SYMBOL CAPACITY 100000,
    value DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(ts, device_id);   -- idempotent ingestion: same (ts,device) upserts
```
- **Out-of-order (O3) ingestion has a real cost.** Rows arriving with a timestamp
  *older* than the last committed row trigger the O3 path: QuestDB must copy and
  re-merge the affected time partition to keep it sorted. A stream that is mostly
  in-order with occasional late rows is fine; a badly-ordered feed can multiply
  write amplification and I/O. Keep producers roughly time-ordered, and size
  `commitLag` / WAL settings so late data merges in batches, not per-row.
  [questdb.io/docs/concept/designated-timestamp/, retrieved 2026-07-10]
- **`PARTITION BY` unit is a footgun, not a formality.** Too coarse (`YEAR`) and
  every O3 write rewrites a huge partition; too fine (`HOUR` on low-volume data)
  and you drown in tiny partitions and open file descriptors. Match the unit to
  ingest rate and query range — `DAY` is the sane default for most feeds.
- **`SYMBOL` vs `STRING`:** `SYMBOL` interns categorical values (dictionary-encoded,
  ~10× faster filters/joins, less storage); reserve `STRING`/`VARCHAR` for
  free-text. `SYMBOL CAPACITY` should approximate the distinct cardinality —
  undersizing rehashes, oversizing wastes memory.

## ILP vs PGWire Ingestion (pick the right write path)
QuestDB exposes two write paths with very different semantics. Claude routinely
sends high-throughput writes over the SQL/HTTP path and then reports "slow
ingestion."
- **ILP (InfluxDB Line Protocol, port 9009 / HTTP `/write`)** is the
  high-throughput append path — batched, schema-on-write (auto-creates
  columns), and the ONLY sane choice for streaming millions of rows/sec. Use an
  official ILP client (Python/Java/Go/Rust) with the `http::addr=` transport and
  auto-flush on batch size.
- **PGWire (port 8812, PostgreSQL wire protocol)** is for queries and low-rate,
  transactional/parameterized writes — NOT for bulk ingest. Use it for `SELECT`,
  DDL, and parameterized statements from a Postgres driver.

```python
# High-throughput ingest via the official ILP client (auto-batched)
from questdb.ingress import Sender, TimestampNanos
conf = "http::addr=localhost:9000;"          # HTTP ILP transport (recommended)
with Sender.from_conf(conf) as sender:
    sender.row(
        "sensors",
        symbols={"device_id": "d1"},         # SYMBOL columns
        columns={"value": 23.5},
        at=TimestampNanos.now(),             # feeds the designated timestamp
    )
    sender.flush()                            # batch-commit; do NOT flush per row
```

## Correctness — SAMPLE BY / ASOF Alignment
- **`SAMPLE BY` buckets by the designated timestamp**; without `ALIGN TO CALENDAR`
  the buckets align to the first row's timestamp (a moving origin), which makes
  results shift between runs. Always state the alignment explicitly:
  `SAMPLE BY 1h ALIGN TO CALENDAR TIME ZONE 'UTC'` for reproducible windows, and
  use `FILL(NULL|PREV|LINEAR)` deliberately or gaps silently vanish.
- **`ASOF JOIN` matches each left row to the most recent right row at-or-before its
  timestamp** — both tables must have a designated timestamp and be time-ordered,
  or the join is wrong (not just slow). Use `LT ASOF JOIN` for strictly-before.

```sql
-- Reproducible downsample: calendar-aligned buckets, explicit fill
SELECT ts, device_id, avg(value)
FROM sensors
WHERE ts > dateadd('d', -7, now())
SAMPLE BY 1h ALIGN TO CALENDAR TIME ZONE 'UTC' FILL(PREV);

-- ASOF: attach the latest price at-or-before each trade's timestamp
SELECT t.ts, t.symbol, t.qty, q.price
FROM trades t ASOF JOIN quotes q ON (symbol);
```

## Security — Auth, TLS & SQL Injection (CWE-89)
- **Parameterize PGWire queries (CWE-89).** Build user-facing SQL with bound
  parameters via the Postgres driver — never string-concatenate user input.
  [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

```python
# FOOTGUN (CWE-89): interpolated user input over PGWire
cur.execute(f"SELECT * FROM sensors WHERE device_id = '{dev}'")   # injectable
# RIGHT: parameterized (psycopg)
cur.execute("SELECT * FROM sensors WHERE device_id = %s", (dev,))
```
- **CVE-2026-0824 — QuestDB Web Console stored XSS (CWE-79), Web Console ≤ 1.11.9,
  patched 1.1.10-series.** A crafted value rendered by the Web Console executed as
  script. Do NOT expose the Web Console (port 9000) to untrusted networks; put it
  behind auth/VPN and upgrade to a patched build.
  [nvd.nist.gov/vuln/detail/CVE-2026-0824, retrieved 2026-07-10]
- **Authenticate and TLS-wrap the wire protocols.** ILP and PGWire are unencrypted
  and unauthenticated by default in open-source builds — bind them to localhost or
  a private network, enable token/user auth where supported, and terminate TLS at a
  reverse proxy if the build lacks native TLS. Never expose 9009/8812/9000 to the
  public internet.

## Error Handling & DEDUP
- **DEDUP UPSERT KEYS makes ingestion idempotent** — replaying the same
  `(designated_ts, key...)` upserts instead of duplicating, which is essential for
  at-least-once producers (Kafka, retries). DEDUP requires **WAL** tables; adding
  it after the fact is `ALTER TABLE ... DEDUP ENABLE UPSERT KEYS(...)`.
- Watch for **WAL apply lag**: writes commit to the WAL and are applied
  asynchronously; a query can briefly not see the very latest rows. Monitor
  `wal_tables()` for sequencer/writer lag rather than assuming read-your-write.

## Testing
```sql
-- Determinism gate: a calendar-aligned SAMPLE BY must be stable across runs
SELECT count(*) FROM (
  SELECT ts, avg(value) FROM sensors
  SAMPLE BY 1h ALIGN TO CALENDAR TIME ZONE 'UTC'
);
-- Assert bucket count matches the expected calendar hours for the fixture window;
-- a moving-origin (unaligned) SAMPLE BY would drift and fail this.
```

## Performance
- Keep producers **time-ordered** to stay off the O3 rewrite path; batch ILP
  flushes; size `SYMBOL CAPACITY` to real cardinality.
- Choose the **`PARTITION BY`** unit for your query range and ingest rate; `DAY`
  suits most workloads.
- Use **`LATEST ON ... PARTITION BY`** for last-value-per-key queries — it is
  index-accelerated versus a `GROUP BY` + `max(ts)` self-join.

## Version-Specific Gotchas (dated, sourced)
- **QuestDB 9.4.3** is the current release (published **2026-06-15**). QuestDB moved
  to a **`9.x` semantic-version line** (the older `6.x/7.x/1.x` numbering is
  historical) — pin the exact tag, not `latest`, so an O3/WAL behavior change is
  visible at upgrade time.
  [github.com/questdb/questdb/releases/tag/9.4.3, retrieved 2026-07-10]
- **CVE-2026-0824** (Web Console XSS, see Security) affects the older Web Console
  line — keep the console off untrusted networks regardless of version.
- **WAL is required for DEDUP and per-table concurrent writers**; non-WAL tables
  lack idempotent dedup and out-of-order commit batching.

## References (retrieved 2026-07-10)
- QuestDB releases: https://github.com/questdb/questdb/releases
- Designated timestamp: https://questdb.io/docs/concept/designated-timestamp/
- Out-of-order (O3) ingestion: https://questdb.io/docs/guides/out-of-order-commit-lag/
- ILP overview: https://questdb.io/docs/reference/api/ilp/overview/
- SAMPLE BY: https://questdb.io/docs/reference/sql/sample-by/
- ASOF JOIN: https://questdb.io/docs/reference/sql/join/
- DEDUP: https://questdb.io/docs/concept/deduplication/
- CVE-2026-0824 (Web Console XSS): https://nvd.nist.gov/vuln/detail/CVE-2026-0824
- CWE-89 (SQL injection): https://cwe.mitre.org/data/definitions/89.html
- CWE-79 (cross-site scripting): https://cwe.mitre.org/data/definitions/79.html
