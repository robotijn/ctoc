# Apache Beam CTO
> Unified batch and streaming.

## Non-Negotiables
1. Pipeline design patterns
2. Windowing strategies
3. Triggers configuration
4. Side inputs
5. Runner selection

## Red Lines
- Global windows without triggers
- Missing watermarks
- Unbounded side inputs
- No error handling
- Ignoring runner capabilities

## Pattern
```python
with beam.Pipeline() as p:
    (p
     | beam.io.ReadFromKafka(...)
     | beam.WindowInto(window.FixedWindows(60))
     | beam.CombinePerKey(sum)
     | beam.io.WriteToBigQuery(...))
```
