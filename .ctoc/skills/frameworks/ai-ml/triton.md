# NVIDIA Triton CTO
> High-performance ML model serving at enterprise scale.

## Commands
```bash
# Setup | Dev | Test
docker pull nvcr.io/nvidia/tritonserver:24.01-py3
docker run --gpus all -p 8000:8000 -p 8001:8001 -p 8002:8002 -v /models:/models nvcr.io/nvidia/tritonserver:24.01-py3 tritonserver --model-repository=/models
curl localhost:8000/v2/health/ready
```

## Non-Negotiables
1. Proper model repository structure
2. Correct backend selection for model format
3. Dynamic batching for throughput
4. Model ensembles for pipelines
5. Metrics and health check configuration
6. Instance groups for GPU allocation

## Red Lines
- Missing config.pbtxt in model directory
- No dynamic batching for production
- Wrong backend for model format
- No health check endpoints
- Ignoring instance groups configuration
- Missing input/output specifications

## Pattern: Production Model Serving
```
# Model repository structure
model_repository/
  text_encoder/
    config.pbtxt
    1/
      model.onnx
  classifier/
    config.pbtxt
    1/
      model.pt
  ensemble/
    config.pbtxt
    1/
```

```protobuf
# config.pbtxt for ONNX model
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
  cuda {
    graphs: true
  }
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

## Integrates With
- **Backends**: ONNX, TensorRT, PyTorch, TensorFlow
- **Formats**: SavedModel, TorchScript, ONNX, Plan
- **Monitoring**: Prometheus, Grafana
- **Deployment**: Kubernetes, Docker, cloud

## Common Errors
| Error | Fix |
|-------|-----|
| `Model not ready` | Check config.pbtxt, verify model path |
| `Backend not found` | Use correct platform string |
| `Shape mismatch` | Verify input dims match model |
| `OOM error` | Reduce batch size, configure instance groups |

## Prod Ready
- [ ] Model repository structured correctly
- [ ] Dynamic batching configured
- [ ] Instance groups allocate GPUs
- [ ] Health endpoints monitored
- [ ] Metrics exported to Prometheus
- [ ] Input/output shapes validated
