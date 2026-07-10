# NVIDIA Triton CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Pull Triton server
docker pull nvcr.io/nvidia/tritonserver:25.01-py3
# Run: docker run --gpus all -p 8000:8000 -p 8001:8001 -p 8002:8002 \
#      -v /models:/models nvcr.io/nvidia/tritonserver:25.01-py3 \
#      tritonserver --model-repository=/models
# Python client: pip install tritonclient[all]
```

## Claude's Common Mistakes
1. Missing config.pbtxt in model directory
2. No dynamic batching for production
3. Wrong platform string for model format
4. Not specifying instance groups for GPU allocation
5. Missing input/output shape specifications

## Correct Patterns (2026)
```
# Model repository structure
model_repository/
  text_encoder/
    config.pbtxt
    1/
      model.onnx
```

```protobuf
# config.pbtxt
name: "text_encoder"
platform: "onnxruntime_onnx"
max_batch_size: 64

input [
  {
    name: "input_ids"
    data_type: TYPE_INT64
    dims: [-1]  # Dynamic sequence length
  }
]

output [
  {
    name: "embeddings"
    data_type: TYPE_FP32
    dims: [768]
  }
]

dynamic_batching {
  preferred_batch_size: [8, 16, 32]
  max_queue_delay_microseconds: 100
}

instance_group [
  {
    count: 2
    kind: KIND_GPU
    gpus: [0, 1]
  }
]

optimization {
  cuda { graphs: true }
}
```

```python
# Python client
import tritonclient.grpc as grpcclient
import numpy as np

client = grpcclient.InferenceServerClient(url="localhost:8001")

# Check model ready
assert client.is_model_ready("text_encoder")

# Prepare input
inputs = [grpcclient.InferInput("input_ids", [1, 128], "INT64")]
inputs[0].set_data_from_numpy(np.array([[101, 2023, ...]], dtype=np.int64))

# Inference
result = client.infer("text_encoder", inputs)
embeddings = result.as_numpy("embeddings")
```

## Version Gotchas
- **Platform strings**: onnxruntime_onnx, tensorrt_plan, pytorch_libtorch
- **Dynamic batching**: Required for production throughput
- **Instance groups**: Allocate GPUs explicitly
- **Metrics**: Prometheus on port 8002

## What NOT to Do
- Do NOT forget config.pbtxt in each model directory
- Do NOT skip dynamic_batching for production
- Do NOT use wrong platform string for model format
- Do NOT ignore instance_group GPU allocation
- Do NOT skip health check endpoints monitoring

## Model-repo / Batching Footguns
`max_batch_size` in `config.pbtxt` is the contract that makes batching legal, and
it silently reshapes your tensors. The single most common Claude mistake is
mismatching `max_batch_size` with the declared `dims`:

```protobuf
# FOOTGUN: when max_batch_size > 0, Triton PREPENDS an implicit batch dim.
# So dims here describe a SINGLE sample (no leading batch). Writing dims:[N,768]
# with max_batch_size:64 declares a 3-D [batch,N,768] tensor and your client
# shapes will not match → "unexpected shape" at inference.
name: "text_encoder"
platform: "onnxruntime_onnx"
max_batch_size: 64          # 0 disables batching AND the implicit batch dim
input  [ { name: "input_ids", data_type: TYPE_INT64, dims: [-1] } ]   # per-sample
output [ { name: "embeddings", data_type: TYPE_FP32, dims: [768] } ]

dynamic_batching {          # server-side request coalescing (throughput)
  preferred_batch_size: [8, 16, 32]
  max_queue_delay_microseconds: 100   # latency you trade for larger batches
}
instance_group [ { count: 2, kind: KIND_GPU, gpus: [0, 1] } ]         # explicit GPUs
```

- **Dynamic batching** coalesces *independent* requests server-side. `max_queue_
  delay_microseconds` is a direct latency/throughput dial — larger delay fills
  bigger batches but adds tail latency. It only helps if the model is actually
  batchable (stateless per request).
- **Instance groups** control concurrency: `count` copies per device run in
  parallel and consume `count ×` the model's memory — over-provisioning OOMs the
  GPU. Pin `gpus:` explicitly; the default may not land where you expect.
- **Ensemble / BLS scheduling**: an ensemble wires model outputs to inputs inside
  Triton (no client round-trips); BLS (Business Logic Scripting) runs a Python
  model that *calls other models* via `pb_utils.InferenceRequest`. Both add
  scheduling depth — a slow sub-model stalls the whole pipeline.

## Concurrency (sequence batching / cache)
- **Stateful models** (that carry state across requests, e.g. a decoder) MUST use
  `sequence_batching`, not `dynamic_batching`. Batching a stateful model as if it
  were stateless corrupts per-sequence state — a silent correctness bug, not an
  error.
- **Response cache** (`response_cache { enable: true }`) keys on the exact input
  bytes. Enabling it on a non-deterministic or time-sensitive model serves
  **stale** responses. Only cache pure, deterministic models.

## Error Handling
```python
import tritonclient.grpc as grpcclient
from tritonclient.utils import InferenceServerException

client = grpcclient.InferenceServerClient(url="localhost:8001")
# Check readiness BEFORE inferring — a loading/unavailable model raises, not 200:
if not client.is_model_ready("text_encoder"):
    raise RuntimeError("model not ready — check load status / config.pbtxt")
try:
    result = client.infer("text_encoder", inputs)
except InferenceServerException as e:
    # shape/dtype mismatches and OOM surface here — do not blind-retry a
    # deterministic shape error; fix the client tensor shape.
    ...
```

## Security and Dependency Gotchas
- **The Python / BLS backend `execute()` runs arbitrary code — the model
  repository is a trust boundary (CWE-94)**: a `model.py` (python backend) or a
  BLS model is executed by the server. Anyone who can write to the
  `--model-repository` (or trigger a poll-based reload of it) achieves remote
  code execution in your serving process. This is CWE-94 "Improper Control of
  Generation of Code / Code Injection" (cwe.mitre.org). Treat the model repo like
  source code:

```python
# model.py (python backend) — this class is INSTANTIATED AND RUN by Triton.
# Whoever controls the repo controls this code. Lock down write access to the
# --model-repository; disable --model-control-mode=poll on untrusted mounts so
# a dropped-in model.py cannot be hot-loaded.
class TritonPythonModel:
    def execute(self, requests):
        ...   # arbitrary Python — runs with the server's privileges
```
- **gRPC (8001) / HTTP (8000) endpoints are unauthenticated by default**: Triton
  ships no auth. Do not expose 8000/8001 publicly; put an authenticating proxy in
  front and keep the model-repo mount read-only to the server.
- Source: docs.nvidia.com Triton python-backend / BLS, cwe.mitre.org/94. See References.

## Testing Conventions
```python
# Validate config.pbtxt shape contract WITHOUT a GPU by asserting client/server
# shapes agree, then gate real infer() on server availability:
def test_batch_dim_contract():
    # with max_batch_size>0 the client sends [batch, *dims]; assert the client
    # request shape prepends the batch dim that the config implies.
    assert client_input_shape == [batch] + per_sample_dims
```
- Use `perf_analyzer` for throughput/latency regression at known concurrency; do
  not eyeball a single request.

## Performance Traps
- `max_queue_delay_microseconds` too high adds tail latency for marginal batch
  gains; tune it against your SLA, do not copy an example value.
- Too many `instance_group` copies contend for the same GPU and can *lower*
  throughput while raising memory — measure per-model.
- Enable `optimization { cuda { graphs: true } }` only for fixed-shape models;
  CUDA graphs pin shapes and break on variable inputs.

## Version-Specific Gotchas (dated, sourced)
- **Triton Inference Server 2.70.0** is the current release (**2026-06-26**),
  corresponding to **NGC container 26.06**. [github.com/triton-inference-server/
  server release v2.70.0, retrieved 2026-07-10]
- The matching **`tritonclient` PyPI wheel is 2.70.0** (uploaded 2026-06-26) —
  keep client and server minor versions aligned. [pypi.org/project/tritonclient,
  retrieved 2026-07-10]
- Backends are ABI-coupled to the server container: a backend built for one
  `YY.MM` container is not guaranteed to load in another — use the matching NGC
  tag. [github.com/triton-inference-server/server, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Triton server releases (GitHub): https://github.com/triton-inference-server/server/releases
- tritonclient (PyPI): https://pypi.org/project/tritonclient/
- Model configuration (config.pbtxt): https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/model_configuration.html
- Python backend / BLS: https://github.com/triton-inference-server/python_backend
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
