# Apache Beam CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "apache-beam[gcp]"
# Run locally
python pipeline.py --runner=DirectRunner
# Run on Dataflow
python pipeline.py --runner=DataflowRunner --project=myproject
```

## Claude's Common Mistakes
1. **Global windows without triggers** - Unbounded accumulation in streaming
2. **Missing watermarks** - Late data handling breaks
3. **Unbounded side inputs** - Causes memory issues
4. **No dead letter queue** - Poison messages kill pipeline
5. **Runner-agnostic assumptions** - Each runner has different capabilities

## Correct Patterns (2026)
```python
import apache_beam as beam
from apache_beam import window
from apache_beam.transforms.trigger import AfterWatermark, AfterProcessingTime, AccumulationMode

def run():
    options = beam.options.pipeline_options.PipelineOptions([
        '--runner=DataflowRunner',
        '--project=myproject',
        '--streaming',
        '--autoscaling_algorithm=THROUGHPUT_BASED',
    ])

    with beam.Pipeline(options=options) as p:
        # Read from Kafka
        events = (
            p
            | 'Read' >> beam.io.ReadFromKafka(
                consumer_config={'bootstrap.servers': 'kafka:9092'},
                topics=['events']
            )
            | 'Parse' >> beam.Map(parse_json)
            | 'Timestamp' >> beam.Map(
                lambda x: beam.window.TimestampedValue(x, x['ts'])
            )
        )

        # Window with triggers (CRITICAL for streaming)
        windowed = (
            events
            | 'Window' >> beam.WindowInto(
                window.FixedWindows(60),
                trigger=AfterWatermark(
                    early=AfterProcessingTime(30),
                    late=AfterProcessingTime(60),
                ),
                accumulation_mode=AccumulationMode.ACCUMULATING,
                allowed_lateness=beam.Duration(seconds=3600),
            )
            | 'Count' >> beam.CombinePerKey(sum)
        )

        # Output with error handling
        windowed | 'Write' >> beam.io.WriteToBigQuery('project:dataset.table')
        errors | 'DLQ' >> beam.io.WriteToText('gs://bucket/dlq/')
```

## Version Gotchas
- **Runners**: Dataflow, Flink, Spark - each has different features
- **Windowing**: Fixed, Sliding, Session - choose based on use case
- **Triggers**: Control when results emit; critical for streaming
- **Watermarks**: Track event time progress; configure per source

## What NOT to Do
- Do NOT use global windows in streaming (infinite accumulation)
- Do NOT skip triggers configuration (unbounded buffering)
- Do NOT forget dead letter queue (poison messages)
- Do NOT assume all runners behave identically

## Windowing & Trigger Footguns (when results emit — and how many times)
Beam's model is `Window` (which event goes in which bucket) × `Trigger` (when a
bucket emits) × `AccumulationMode` (does a re-fire replace or add to the prior
pane). Get the combination wrong and you either never emit, or emit duplicates.

```python
import apache_beam as beam
from apache_beam.transforms import window
from apache_beam.transforms.trigger import (
    AfterWatermark, AfterProcessingTime, AccumulationMode)

# FOOTGUN: default GlobalWindows + default trigger on an UNBOUNDED source never
# closes -> state grows forever, nothing is emitted until the pipeline drains.
# RIGHT: event-time window + explicit trigger + allowed lateness + accumulation mode.
windowed = (
    events
    | 'Window' >> beam.WindowInto(
        window.FixedWindows(60),                       # 60s event-time buckets
        trigger=AfterWatermark(                        # fire when watermark passes end
            early=AfterProcessingTime(30),             # + speculative early panes
            late=AfterProcessingTime(60)),             # + on-time-late updates
        allowed_lateness=window.Duration(seconds=3600),
        accumulation_mode=AccumulationMode.DISCARDING) # DISCARDING: each pane is a delta
    | 'Count' >> beam.CombinePerKey(sum))
```
- **ACCUMULATING vs DISCARDING is the double-count trap.** With `ACCUMULATING`,
  every re-fire (early/late pane) re-emits the *full running total* — a downstream
  sink that sums panes double-counts. Use `DISCARDING` (emit only the delta since
  the last pane) unless the sink overwrites by window key.
- **`allowed_lateness` unbounded (or huge)** keeps window state alive that long —
  it directly bounds how much state you hold. Late data past the bound is dropped;
  route it to a side output if you cannot lose it.
  [beam.apache.org programming-guide: windowing / triggers, retrieved 2026-07-10]

## GroupByKey Hot Keys, Side Inputs & Determinism
- **`GroupByKey` on a skewed/hot key** funnels all values for that key to one
  worker — the classic straggler. Prefer `CombinePerKey` with an associative,
  commutative combiner so Beam can do partial combines (like a map-side combine)
  and fan the key out; only fall back to `GroupByKey` when you truly need all
  values materialized.
- **Side inputs are re-materialized per window** and must fit in worker memory —
  an unbounded or large side input causes memory blowups / recompute storms.
- **Non-deterministic `DoFn` + retries = duplicates.** Runners retry bundles on
  failure; if a `DoFn` calls `uuid4()`, `now()`, or a non-idempotent external
  write, a retry produces a *different* output or a duplicate side effect. Make
  writes idempotent (dedup key) or use Beam's `@RequiresStableInput`. Because Beam
  guarantees at-least-once bundle execution, treat every `DoFn` output as
  potentially replayed. [beam.apache.org programming-guide: GroupByKey / CombinePerKey / side inputs, retrieved 2026-07-10]

## Runner-Specific Semantics
- **The runner changes behavior.** `DirectRunner` runs in-process (great for tests,
  and it deliberately shuffles/duplicates to surface non-determinism bugs) but is
  NOT a scale model. `DataflowRunner`, `FlinkRunner`, `SparkRunner` differ in
  autoscaling, streaming triggers, and state — a pipeline that passes on Direct can
  behave differently on Dataflow.
- **Do NOT rely on execution order across a `GroupByKey`/shuffle** — Beam gives no
  ordering guarantee; anything order-dependent must carry an explicit timestamp/
  sequence field. Test the SAME pipeline on the target runner before shipping.

## Security
- **Pipeline options carry credentials.** Do not hard-code service-account keys,
  DB passwords, or tokens in `PipelineOptions` or in the pipeline graph — they are
  serialized into the job template and visible in the runner UI/logs. This is
  CWE-798 (Use of Hard-coded Credentials); use workload identity / a secret
  manager and reference secrets at runtime.
  [cwe.mitre.org/data/definitions/798.html, retrieved 2026-07-10]
- **Logs leak PII:** a `beam.Map(print)` / verbose `DoFn` logging of raw records
  ships sensitive fields to worker logs (CWE-200). Log keys/counts, not payloads.
  [cwe.mitre.org/data/definitions/200.html, retrieved 2026-07-10]

## Error Handling & Testing
```python
# Split good/bad records so a poison message goes to a DLQ instead of failing
# the bundle repeatedly (retry -> fail -> retry loop).
class Parse(beam.DoFn):
    def process(self, e):
        try:
            yield beam.pvalue.TaggedOutput('ok', parse(e))
        except Exception:
            yield beam.pvalue.TaggedOutput('dlq', e)

results = events | beam.ParDo(Parse()).with_outputs('ok', 'dlq')
results.dlq | 'DLQ' >> beam.io.WriteToText('gs://bucket/dlq/')
```
- **Test with `TestPipeline` + `assert_that`/`equal_to`** on the `DirectRunner`;
  its intentional record duplication catches non-deterministic `DoFn`s that a
  single-shot mock would miss. Use `TestStream` to drive watermarks and late data
  deterministically in unit tests. [beam.apache.org testing / TestStream, retrieved 2026-07-10]
- A poison record must go to a **tagged side output / DLQ**, never an un-caught
  throw (which retries the whole bundle until the runner gives up).

## Performance
- **Prefer `CombinePerKey` / `Combine.globally` over `GroupByKey`** for
  aggregations — partial combining cuts shuffle volume massively.
- **Fuse-friendly graphs:** avoid needless reshuffles; `Reshuffle` is a deliberate
  fusion break to rebalance work after a skewed source — use it to fix stragglers,
  not everywhere.
- Batch external calls in `DoFn` `start_bundle`/`finish_bundle` rather than one RPC
  per element.

## Version-Specific Gotchas (dated, sourced)
- **Apache Beam SDK 2.75.0** is the current release on PyPI (uploaded
  **2026-07-08**), `requires_python >= 3.10`. Pin `apache-beam==2.75.0` and match
  the SDK to the runner's supported range. [pypi.org/pypi/apache-beam/json,
  retrieved 2026-07-10]
- **`apache-beam[gcp]`** pulls the Google Cloud extras (Dataflow, BigQuery, GCS);
  install the runner-specific extra you actually use to avoid a heavy dependency
  tree and version conflicts.
- Cross-language transforms (`ReadFromKafka`, some IOs) spin up an **expansion
  service** and require a compatible Java environment — a mismatch fails at
  pipeline construction, not at import.

## References (retrieved 2026-07-10)
- Apache Beam releases (PyPI JSON): https://pypi.org/pypi/apache-beam/json
- Beam programming guide (windowing/triggers/GroupByKey): https://beam.apache.org/documentation/programming-guide/
- Beam runners overview: https://beam.apache.org/documentation/runners/capability-matrix/
- Testing / TestStream: https://beam.apache.org/documentation/pipelines/test-your-pipeline/
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
- CWE-200 Exposure of Sensitive Information: https://cwe.mitre.org/data/definitions/200.html
