# Apache Beam CTO
> Unified programming model for batch and streaming data processing.

## Commands
```bash
# Setup | Dev | Test
pip install apache-beam[gcp]
python pipeline.py --runner=DirectRunner
python pipeline.py --runner=DataflowRunner --project=myproject --region=us-central1
```

## Non-Negotiables
1. Pipeline design with PTransforms and PCollections
2. Windowing strategy matched to use case
3. Triggers for early/late firing configuration
4. Side inputs for enrichment patterns
5. Runner selection based on deployment target
6. Error handling with dead letter queues

## Red Lines
- Global windows without triggers (unbounded accumulation)
- Missing watermarks causing late data issues
- Unbounded side inputs causing memory issues
- No error handling for poison messages
- Ignoring runner-specific capabilities and limitations

## Pattern: Production Streaming Pipeline
```python
import apache_beam as beam
from apache_beam import window
from apache_beam.transforms.trigger import AfterWatermark, AfterProcessingTime, AccumulationMode

def run_pipeline():
    options = beam.options.pipeline_options.PipelineOptions([
        '--runner=DataflowRunner',
        '--project=myproject',
        '--region=us-central1',
        '--streaming',
        '--autoscaling_algorithm=THROUGHPUT_BASED',
    ])

    with beam.Pipeline(options=options) as p:
        # Read from Kafka
        events = (
            p
            | 'ReadKafka' >> beam.io.ReadFromKafka(
                consumer_config={'bootstrap.servers': 'kafka:9092'},
                topics=['events'],
                with_metadata=True,
            )
            | 'ParseJSON' >> beam.Map(parse_event)
            | 'AddTimestamp' >> beam.Map(
                lambda x: beam.window.TimestampedValue(x, x['event_time'])
            )
        )

        # Window and aggregate
        windowed = (
            events
            | 'Window' >> beam.WindowInto(
                window.FixedWindows(60),  # 1-minute windows
                trigger=AfterWatermark(
                    early=AfterProcessingTime(30),  # Early firing every 30s
                    late=AfterProcessingTime(60),   # Late firing
                ),
                accumulation_mode=AccumulationMode.ACCUMULATING,
                allowed_lateness=beam.Duration(seconds=3600),
            )
            | 'CountByType' >> beam.CombinePerKey(beam.combiners.CountCombineFn())
        )

        # Output to BigQuery
        windowed | 'WriteBQ' >> beam.io.WriteToBigQuery(
            'project:dataset.event_counts',
            schema='event_type:STRING,count:INTEGER,window_start:TIMESTAMP',
            write_disposition=beam.io.BigQueryDisposition.WRITE_APPEND,
        )

        # Dead letter queue for errors
        errors | 'WriteDLQ' >> beam.io.WriteToText('gs://bucket/dlq/')
```

## Integrates With
- **Runners**: Dataflow, Flink, Spark, Direct
- **Sources**: Kafka, Pub/Sub, Kinesis, files
- **Sinks**: BigQuery, Bigtable, Elasticsearch, files

## Common Errors
| Error | Fix |
|-------|-----|
| `Watermark stuck` | Check source for idle partitions |
| `OutOfMemory` | Reduce window size or use incremental combine |
| `Late data dropped` | Increase allowed_lateness |
| `Pipeline stuck` | Check for blocking operations |

## Prod Ready
- [ ] Windowing and triggers configured
- [ ] Dead letter queue for errors
- [ ] Autoscaling enabled for runner
- [ ] Watermark strategy defined
- [ ] Monitoring via runner dashboards
