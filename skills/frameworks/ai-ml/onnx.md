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

## Runtime Footguns
```python
import onnxruntime as ort

# FOOTGUN — silent CPU fallback. You LIST providers in preference order, but if
# the GPU provider fails to initialize (missing CUDA/cuDNN, version mismatch) ORT
# quietly falls back to the next one. Your "GPU" inference silently runs on CPU.
sess = ort.InferenceSession(
    "model.onnx",
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
)
assert sess.get_providers()[0] == "CUDAExecutionProvider", \
    f"GPU EP did not load; running on {sess.get_providers()}"   # verify, don't assume
```
- **Opset mismatch.** A model exported at `opset_version=17` needs an ORT build
  new enough to implement those ops; too-new an opset on an old runtime errors,
  too-old drops newer PyTorch ops. Pin opset and runtime together.
- **Dynamic-axis shape errors.** If you export a fixed batch dim, feeding a
  different batch size raises `INVALID_ARGUMENT: Got invalid dimensions`. Declare
  `dynamic_axes` for every dimension that varies at inference time.
- **IOBinding for zero-copy.** By default ORT copies inputs host->device and
  outputs back each call. On GPU, bind pre-placed device tensors with `IOBinding`
  to skip the copies for latency-critical paths.
- Source: onnxruntime.ai/docs/execution-providers (retrieved 2026-07-10).

## Precision (quantization, graph optimization)
```python
from onnxruntime.quantization import quantize_dynamic, QuantType
import onnxruntime as ort

# Dynamic INT8 (QDQ) — weights quantized, activations quantized at runtime.
quantize_dynamic("model.onnx", "model.int8.onnx", weight_type=QuantType.QInt8)

# Graph optimization levels: ORT_ENABLE_ALL fuses ops (Conv+BN, attention) and is
# the production default; disable only to debug a numerical discrepancy.
so = ort.SessionOptions()
so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
sess = ort.InferenceSession("model.int8.onnx", so)
```
- Dynamic INT8 needs no calibration data but recovers less accuracy than static
  QDQ; **static INT8 requires a representative calibration set** or accuracy drops
  sharply on out-of-distribution inputs. Always measure post-quant accuracy.
- Source: onnxruntime.ai/docs/performance/model-optimizations/quantization
  (retrieved 2026-07-10).

## Error Handling
```python
import onnxruntime as ort
import onnx
try:
    m = onnx.load("model.onnx")
    onnx.checker.check_model(m)          # structural validation before running
    sess = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])
except onnx.checker.ValidationError as e:
    raise SystemExit(f"malformed ONNX graph: {e}")
except ort.capi.onnxruntime_pybind11_state.InvalidArgument as e:
    # Shape/type mismatch at run(): the feed dict dims disagree with the graph.
    raise SystemExit(f"input shape/type error: {e}")
```

## Security and Dependency Gotchas
- **An ONNX model is untrusted data, not just weights (CWE-502).** A `.onnx` file
  can reference **external data files** (`external_data` tensors point at paths on
  disk) and can carry **custom operators**. Loading a crafted model can read
  attacker-chosen paths or run custom-op code — the "Deserialization of Untrusted
  Data" class, **CWE-502**. Real advisories: **CVE-2026-34445** (ONNX
  `ExternalDataInfo` used `setattr` to load file paths/lengths straight from the
  model, prior to 1.21.0) and **CVE-2026-28500** (trust-verification bypass in
  `onnx.hub.load()`, ≤ 1.20.1). A malformed graph can also trigger out-of-bounds
  reads in shape inference (**CVE-2026-14647**).
- **Validate before `InferenceSession`.** Run `onnx.checker.check_model()`, keep
  external-data files inside a directory you control (never follow model-supplied
  absolute paths), and do not register untrusted custom-op libraries.
- Source: cwe.mitre.org/data/definitions/502.html and services.nvd.nist.gov
  (CVE-2026-34445, CVE-2026-28500, CVE-2026-14647), both retrieved 2026-07-10.

## Testing Conventions
```python
import numpy as np, onnxruntime as ort

def test_parity_with_source_model(torch_out, sample):
    # Guard export correctness: ONNX output must match the source model.
    sess = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])
    onnx_out = sess.run(None, {"input": sample.astype(np.float32)})[0]
    np.testing.assert_allclose(onnx_out, torch_out, rtol=1e-3, atol=1e-5)

def test_dynamic_batch():
    sess = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])
    for b in (1, 4, 8):                 # dynamic_axes must accept each batch size
        x = np.random.randn(b, 3, 224, 224).astype(np.float32)
        assert sess.run(None, {"input": x})[0].shape[0] == b
```

## Performance Traps
- Always assert `sess.get_providers()[0]` is the accelerator you expect — silent
  CPU fallback is the most common "why is ORT slow" bug.
- `ORT_ENABLE_ALL` graph fusion is essential for production latency; leaving it at
  the default in some builds forgoes large speedups.
- Reuse ONE `InferenceSession` across requests (thread-safe for `run`); creating a
  session per call re-optimizes the graph every time.

## Version-Specific Gotchas (dated, sourced)
- **ONNX Runtime 1.27.0** is the current release (`v1.27.0`, published
  **2026-06-19**; PyPI `onnxruntime` 1.27.0 uploaded **2026-06-15**). The GPU
  build is `onnxruntime-gpu` and must match the CUDA/cuDNN toolkit it was built
  against. [github.com/microsoft/onnxruntime/releases and
  pypi.org/project/onnxruntime, retrieved 2026-07-10]
- **opset 17+** is required for modern exported ops; pin the exporter opset and
  the runtime version together to avoid unimplemented-op errors.
  [onnxruntime.ai/docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- ONNX Runtime releases: https://github.com/microsoft/onnxruntime/releases
- onnxruntime (PyPI): https://pypi.org/project/onnxruntime/
- Execution providers: https://onnxruntime.ai/docs/execution-providers/
- Quantization: https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html
- CWE-502 Deserialization of Untrusted Data: https://cwe.mitre.org/data/definitions/502.html
- ONNX external-data / hub advisories (NVD): https://nvd.nist.gov/vuln/detail/CVE-2026-34445
