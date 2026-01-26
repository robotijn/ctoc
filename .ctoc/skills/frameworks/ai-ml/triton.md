# NVIDIA Triton CTO
> ML model serving at scale.

## Non-Negotiables
1. Model repository structure
2. Backend selection
3. Dynamic batching
4. Model ensembles
5. Metrics configuration

## Red Lines
- Missing config.pbtxt
- No dynamic batching
- Wrong backend
- No health checks
- Ignoring instance groups

## Pattern
```
name: "my_model"
platform: "onnxruntime_onnx"
max_batch_size: 32
dynamic_batching {
  preferred_batch_size: [8, 16]
  max_queue_delay_microseconds: 100
}
```
