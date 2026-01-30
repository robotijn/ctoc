# ONNX CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install onnx onnxruntime  # CPU
pip install onnx onnxruntime-gpu  # NVIDIA GPU
# Verify: python -c "import onnxruntime as ort; print(ort.get_available_providers())"
```

## Claude's Common Mistakes
1. Not validating model after export with `onnx.checker`
2. Missing dynamic axes for variable batch sizes
3. Using CPU provider when CUDA is available
4. Skipping graph optimization for production
5. Wrong opset version causing operator issues

## Correct Patterns (2026)
```python
import torch
import onnx
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType

# Export with dynamic axes
model = MyModel().eval()
dummy_input = torch.randn(1, 3, 224, 224)

torch.onnx.export(
    model, dummy_input, "model.onnx",
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
    opset_version=17,
)

# Validate exported model
onnx_model = onnx.load("model.onnx")
onnx.checker.check_model(onnx_model)

# Quantize for deployment
quantize_dynamic("model.onnx", "model_quant.onnx", weight_type=QuantType.QInt8)

# Production inference with GPU
session = ort.InferenceSession(
    "model_quant.onnx",
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
)

def predict(inputs):
    return session.run(None, {"input": inputs})[0]
```

## Version Gotchas
- **opset 17+**: Required for modern PyTorch ops
- **CUDA EP**: Requires matching CUDA toolkit version
- **Quantization**: INT8 requires calibration data for accuracy
- **TensorRT**: Use `onnxruntime-gpu` with TensorRT EP for best perf

## What NOT to Do
- Do NOT skip `onnx.checker.check_model()` after export
- Do NOT hardcode batch size - use dynamic_axes
- Do NOT use CPUExecutionProvider when GPU available
- Do NOT deploy without graph optimization
- Do NOT ignore opset version compatibility
