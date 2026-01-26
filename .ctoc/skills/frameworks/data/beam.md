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
