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
