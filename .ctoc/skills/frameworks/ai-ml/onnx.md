# ONNX CTO
> Universal model interchange format for cross-framework deployment.

## Commands
```bash
# Setup | Dev | Test
pip install onnx onnxruntime onnxruntime-gpu
python -c "import onnxruntime as ort; print(ort.get_available_providers())"
pytest tests/ -v
```

## Non-Negotiables
1. Export models to ONNX format for portability
2. ONNX Runtime for production inference
3. Graph optimization for performance
4. Validate models with ONNX checker
5. Use appropriate execution providers
6. Quantize for edge deployment

## Red Lines
- Skipping model validation after export
- Not optimizing graph for production
- Using CPU provider when GPU available
- Missing dynamic axes for variable batch sizes
- Ignoring opset version compatibility
- No benchmarking before deployment

## Pattern: Production Export and Inference
```python
import torch
import onnx
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType

# Export PyTorch model to ONNX
model = MyModel().eval()
dummy_input = torch.randn(1, 3, 224, 224)

torch.onnx.export(
    model,
    dummy_input,
    "model.onnx",
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
    opset_version=17,
)

# Validate exported model
onnx_model = onnx.load("model.onnx")
onnx.checker.check_model(onnx_model)

# Optimize graph
from onnxruntime.transformers import optimizer
optimized = optimizer.optimize_model("model.onnx", model_type="bert")
optimized.save_model_to_file("model_optimized.onnx")

# Quantize for deployment
quantize_dynamic("model_optimized.onnx", "model_quantized.onnx", weight_type=QuantType.QInt8)

# Production inference
session = ort.InferenceSession(
    "model_quantized.onnx",
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
)

def predict(inputs):
    return session.run(None, {"input": inputs})[0]
```

## Integrates With
- **Frameworks**: PyTorch, TensorFlow, JAX, scikit-learn
- **Runtimes**: ONNX Runtime, TensorRT, OpenVINO
- **Deployment**: Triton, TF Serving, edge devices
- **Optimization**: Neural compressor, ONNX Optimizer

## Common Errors
| Error | Fix |
|-------|-----|
| `Unsupported operator` | Upgrade opset version, use custom ops |
| `Shape inference failed` | Add explicit shape hints, check dynamic axes |
| `CUDA out of memory` | Reduce batch size, use quantization |
| `Model validation failed` | Check ONNX checker output, fix graph issues |

## Prod Ready
- [ ] Model validated with onnx.checker
- [ ] Graph optimized for target hardware
- [ ] Dynamic axes configured for batching
- [ ] Appropriate execution provider selected
- [ ] Quantization applied for latency targets
- [ ] Benchmarked against original framework
