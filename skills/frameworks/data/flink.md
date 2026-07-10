# Apache Flink CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# PyFlink
pip install apache-flink

# Or Java/Scala with Maven
# Use Flink 1.18+ for latest features
```

## Claude's Common Mistakes
1. **Processing time for event ordering** - Use event time with watermarks
2. **Missing checkpoints** - Production needs fault tolerance
3. **Unbounded state** - Configure state TTL to prevent memory growth
4. **Synchronous I/O in operators** - Use async I/O for external calls
5. **HashMapStateBackend for large state** - Use RocksDB

## Correct Patterns (2026)
```python
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.datastream.connectors.kafka import KafkaSource
from pyflink.common.watermark_strategy import WatermarkStrategy
from pyflink.common import Duration

env = StreamExecutionEnvironment.get_execution_environment()
env.enable_checkpointing(60000)  # 60 second intervals

# Kafka source with event time
kafka_source = KafkaSource.builder() \
    .set_bootstrap_servers("localhost:9092") \
    .set_topics("events") \
    .set_group_id("flink-processor") \
    .build()

# Watermark strategy for out-of-order events
watermark_strategy = WatermarkStrategy \
    .for_bounded_out_of_orderness(Duration.of_seconds(30))

ds = env.from_source(kafka_source, watermark_strategy, "Kafka Source")

# Keyed stream with tumbling window
result = ds \
    .key_by(lambda x: x['user_id']) \
    .window(TumblingEventTimeWindows.of(Time.minutes(5))) \
    .reduce(lambda a, b: {'count': a['count'] + b['count']})

env.execute("Event Processor")
```

## Version Gotchas
- **v1.18+**: Improved Python API, better Kafka connector
- **State backends**: RocksDB for >1GB state; heap for small state
- **Watermarks**: Configure based on expected out-of-orderness
- **Savepoints**: Required for job upgrades; checkpoints for recovery

## What NOT to Do
- Do NOT use processing time when event order matters
- Do NOT skip checkpointing in production (data loss on failure)
- Do NOT let state grow unbounded (configure TTL)
- Do NOT use synchronous I/O in operators (blocks processing)

## State & Checkpoint Footguns (the correctness core)
Flink's fault tolerance is *checkpointing* — a periodic, consistent snapshot of
all operator state taken via **barriers** that flow with the stream. Getting the
checkpoint wrong is how you lose or duplicate results after a failure.

```python
from pyflink.datastream import StreamExecutionEnvironment, CheckpointingMode
from pyflink.datastream.state_backend import EmbeddedRocksDBStateBackend

env = StreamExecutionEnvironment.get_execution_environment()

# FOOTGUN: no checkpointing -> a task failure restarts from ZERO state (or from the
# source's default offset) = silent data loss / reprocessing on every crash.
env.enable_checkpointing(60000, CheckpointingMode.EXACTLY_ONCE)  # 60s, EXACTLY_ONCE

cfg = env.get_checkpoint_config()
cfg.set_min_pause_between_checkpoints(30000)   # don't back-to-back checkpoints
cfg.set_checkpoint_timeout(120000)             # fail slow checkpoints instead of hanging
cfg.enable_unaligned_checkpoints(True)         # unblock barriers under backpressure
cfg.set_externalized_checkpoints_retention(   # keep the last checkpoint after cancel
    'RETAIN_ON_CANCELLATION')

# RocksDB backend for large keyed state (spills to disk); heap backend OOMs at scale.
env.set_state_backend(EmbeddedRocksDBStateBackend(enable_incremental_checkpointing=True))
```
- **Aligned vs unaligned barriers:** with aligned checkpoints a slow/backpressured
  operator holds up the barrier and the checkpoint stalls (or times out) —
  `enableUnalignedCheckpoints` lets barriers overtake buffered records so the
  snapshot completes under load, at the cost of larger checkpoint state.
- **Exactly-once end-to-end needs a transactional sink.** `CheckpointingMode.
  EXACTLY_ONCE` only covers *internal* state. To not duplicate on the output you
  need a **two-phase-commit sink** (`TwoPhaseCommitSinkFunction` / Kafka sink with
  `DeliveryGuarantee.EXACTLY_ONCE` + `transactional.id`), which commits on
  checkpoint completion. A plain sink is at-least-once and re-emits on recovery.
- **State TTL:** keyed state with an unbounded key space (e.g. one entry per
  user/session forever) grows without limit and eventually OOMs or blows the
  checkpoint size — set `StateTtlConfig` so idle state expires.
  [flink.apache.org checkpointing / state-backends / fault-tolerance docs, retrieved 2026-07-10]

## Event-Time, Watermarks & Allowed Lateness
- **Watermark = "no event older than T will arrive."** It advances event-time and
  fires windows. Too aggressive (small bounded-out-of-orderness) and late events
  are dropped; too lax and windows fire late and hold state longer.
- **A single idle partition stalls the whole watermark** (the min across sources).
  Use `WatermarkStrategy.with_idleness(...)` so an idle source doesn't freeze
  event-time for everyone.
- **Allowed lateness re-fires windows** for late data up to a bound; beyond it,
  events go to a side output (dead-letter) instead of being silently dropped.
- Watermarks are about *event-time correctness*; wall-clock/processing-time gives
  non-deterministic results on replay. [flink.apache.org event-time / generating-watermarks, retrieved 2026-07-10]

## Backpressure & Performance
- **Backpressure** propagates upstream: a slow sink slows sources. Diagnose with
  the web-UI backpressure tab; do NOT "fix" it by raising parallelism blindly —
  find the slow operator (often a synchronous external call).
- **Async I/O** (`AsyncDataStream`/`RichAsyncFunction`) for external lookups so a
  per-record RPC doesn't block the operator thread.
- **Buffer debloating** (`taskmanager.network.memory.buffer-debloat.enabled`)
  auto-sizes network buffers to cut in-flight data, which shrinks aligned
  checkpoint time under backpressure. [flink.apache.org network-buffer-tuning, retrieved 2026-07-10]

## Security
- **REST API / Web UI:** the JobManager REST endpoint and Flink UI have **no
  authentication** built in and can *submit and cancel jobs and upload JARs* — an
  exposed endpoint is remote code execution. Bind to localhost / put it behind an
  authenticating reverse proxy or SSL with mutual auth; never expose it publicly.
  This is a CWE-1188 (Initialization of a Resource with an Insecure Default) /
  CWE-200 exposure class. [cwe.mitre.org/data/definitions/1188.html; cwe.mitre.org/data/definitions/200.html, retrieved 2026-07-10]
- **Savepoints/checkpoints are your data at rest** — they contain full operator
  state (possibly PII). Encrypt the state backend storage and restrict the
  savepoint bucket; a readable savepoint dir is a data breach.
- Enable TLS for internal (`taskmanager`) + external (REST) communication in any
  multi-tenant/networked cluster.

## Error Handling & Testing
```python
# Route un-parseable / late records to a side output instead of throwing (which
# fails the whole job and forces a checkpoint restore).
late_tag = OutputTag("late-events")
# ... .side_output_late_data(late_tag) on the windowed stream; write it to a DLQ.
```
- **A thrown exception in an operator fails the job** and restarts from the last
  checkpoint — for bad data, use side outputs / try-catch-and-DLQ so one poison
  record doesn't trigger a restart loop.
- **Test with `MiniClusterWithClientResource`** (Java) / the PyFlink test harness
  and a real Kafka Testcontainer so checkpointing, watermarks, and restore are
  exercised — mocking the environment tests the mock, not recovery semantics.
- Verify a **savepoint → restore** round-trip in CI before every state-schema
  change; an incompatible state migration blocks the upgrade at runtime.

## Version-Specific Gotchas (dated, sourced)
- **Apache Flink 2.3.0** is a current stable release (archived on the Apache
  mirror **2026-06-22**; listed as the latest stable on the Flink downloads page).
  [archive.apache.org/dist/flink/flink-2.3.0/, retrieved 2026-07-10;
  flink.apache.org/downloads/, retrieved 2026-07-10]
- The **2.x line** modernizes the DataStream API and disaggregated state; older
  1.x tutorials (`Time.minutes`, legacy state backends `HashMapStateBackend`/
  `EmbeddedRocksDBStateBackend` naming) may not map 1:1 — check the 2.x API.
- **PyFlink** (`apache-flink` on PyPI) tracks the Java releases; pin the PyFlink
  version to the cluster's Flink version or connectors mismatch at submit time.
- Prefer **`EmbeddedRocksDBStateBackend` + incremental checkpoints** for large
  state; the heap backend is only for small, bounded state.

## References (retrieved 2026-07-10)
- Flink downloads (latest stable): https://flink.apache.org/downloads/
- Flink 2.3.0 archive listing (release date): https://archive.apache.org/dist/flink/flink-2.3.0/
- Checkpointing: https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/datastream/fault-tolerance/checkpointing/
- State backends: https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/state_backends/
- Generating watermarks (event time): https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/datastream/event-time/generating_watermarks/
- CWE-1188 Insecure Default Initialization: https://cwe.mitre.org/data/definitions/1188.html
- CWE-200 Exposure of Sensitive Information: https://cwe.mitre.org/data/definitions/200.html
