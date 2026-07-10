# TensorRT CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install tensorrt
# Or use NVIDIA container:
docker pull nvcr.io/nvidia/tensorrt:25.01-py3
# Build engine: trtexec --onnx=model.onnx --saveEngine=model.plan --fp16
```

## Claude's Common Mistakes
1. INT8 quantization without calibration data
2. Missing optimization profiles for dynamic shapes
3. Rebuilding engine on every run (slow startup)
4. Not validating accuracy after conversion
5. Wrong workspace size causing build failures

## Correct Patterns (2026)
```python
import tensorrt as trt
import numpy as np

TRT_LOGGER = trt.Logger(trt.Logger.WARNING)

def build_engine(onnx_path: str, fp16: bool = True, int8: bool = False):
    builder = trt.Builder(TRT_LOGGER)
    network = builder.create_network(
        1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)
    )
    parser = trt.OnnxParser(network, TRT_LOGGER)

    # Parse ONNX
    with open(onnx_path, "rb") as f:
        if not parser.parse(f.read()):
            for i in range(parser.num_errors):
                print(parser.get_error(i))
            raise RuntimeError("ONNX parse failed")

    # Build config
    config = builder.create_builder_config()
    config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 1 << 30)  # 1GB

    # Precision
    if fp16:
        config.set_flag(trt.BuilderFlag.FP16)
    if int8:
        config.set_flag(trt.BuilderFlag.INT8)
        config.int8_calibrator = MyCalibrator(calibration_data)

    # Dynamic shapes with optimization profile
    profile = builder.create_optimization_profile()
    profile.set_shape(
        "input",
        min=(1, 3, 224, 224),
        opt=(8, 3, 224, 224),
        max=(32, 3, 224, 224)
    )
    config.add_optimization_profile(profile)

    # Build and serialize engine
    serialized = builder.build_serialized_network(network, config)
    with open("model.plan", "wb") as f:
        f.write(serialized)
    return serialized

# Load and run engine
runtime = trt.Runtime(TRT_LOGGER)
with open("model.plan", "rb") as f:
    engine = runtime.deserialize_cuda_engine(f.read())
context = engine.create_execution_context()
```

## Version Gotchas
- **Engine caching**: ALWAYS serialize to .plan file
- **GPU architecture**: Engine tied to GPU - rebuild for different card
- **INT8 calibration**: Requires representative data samples
- **Dynamic shapes**: Use optimization profiles for variable inputs

## What NOT to Do
- Do NOT use INT8 without calibration data
- Do NOT skip optimization profiles for dynamic inputs
- Do NOT rebuild engine on every run - cache .plan file
- Do NOT skip accuracy validation after conversion
- Do NOT ignore workspace size errors (increase memory)

## Build / Runtime Footguns
A serialized **engine plan (`.plan`/`.engine`) is NOT portable**. It is
specialized to the exact GPU architecture (SM/compute capability), the TensorRT
version, and often the CUDA/cuDNN versions used to build it. The single most
common Claude mistake is shipping one `.plan` and expecting it to load on a
different card or after a TRT upgrade:

```python
import tensorrt as trt
runtime = trt.Runtime(trt.Logger(trt.Logger.WARNING))

# FOOTGUN: deserialize_cuda_engine returns None (does NOT throw a clean error)
# when the plan was built for a different SM/TRT version. Always null-check.
with open("model.plan", "rb") as f:
    engine = runtime.deserialize_cuda_engine(f.read())
if engine is None:
    raise RuntimeError(
        "engine load failed — plan is GPU-arch/TRT-version specific; rebuild "
        "on THIS card with THIS TensorRT version"
    )
```

- **Rebuild the plan per (GPU arch × TensorRT version)** in your deploy pipeline;
  do not treat `.plan` as a portable artifact like ONNX.
- **Workspace OOM**: `set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, ...)`
  caps the scratch the builder may use for tactic selection. Too small and the
  builder silently skips faster tactics (slower engine) or fails; too large and
  the *build* OOMs on a busy GPU. Size it to available free memory, not total.
- **Dynamic shapes require an optimization profile**: every dynamic input needs
  `profile.set_shape(name, min, opt, max)`. Requests outside `[min, max]` fail at
  `set_input_shape`; `opt` is what the builder tunes for — set it to your common
  case, not the max.

## Precision (FP16 / INT8)
```python
config = builder.create_builder_config()
config.set_flag(trt.BuilderFlag.FP16)   # ~2x throughput, small accuracy delta
config.set_flag(trt.BuilderFlag.INT8)   # biggest speedup, LARGEST accuracy risk
```
- **FP16** overflow: activations can exceed fp16 range and produce Inf/NaN
  silently. Validate output against the fp32 baseline; keep sensitive layers in
  higher precision if accuracy drops.
- **INT8** requires a representative **calibration dataset** (or explicit
  quantization / QAT). Calibrating on unrepresentative data bakes in accuracy
  loss you only discover in production.
- **Strongly typed networks** (`NetworkDefinitionCreationFlag.STRONGLY_TYPED`)
  fix each tensor's type from the ONNX graph and disable TRT's automatic
  precision mixing — use them when you need deterministic dtypes, not blanket.
- Always compare converted-engine accuracy against the source-framework output
  on a held-out set before shipping.

## Error Handling
```python
# ONNX parse failures accumulate — read ALL of them, not just the first:
if not parser.parse(onnx_bytes):
    msgs = [parser.get_error(i) for i in range(parser.num_errors)]
    raise RuntimeError("ONNX parse failed:\n" + "\n".join(map(str, msgs)))

# build_serialized_network returns None on failure (does not throw):
serialized = builder.build_serialized_network(network, config)
if serialized is None:
    raise RuntimeError("engine build failed — check workspace size / unsupported op")
```

## Security and Dependency Gotchas
- **A serialized engine plan is deserialized on load — treat it as an untrusted
  input boundary (CWE-502)**: `deserialize_cuda_engine` reads a binary blob and
  reconstructs executable GPU state. Loading a plan from an untrusted source (a
  download, a user upload, a shared bucket without integrity controls) is
  **Deserialization of Untrusted Data**, CWE-502 (cwe.mitre.org). Only load
  plans your own pipeline built, from storage you control, with an integrity
  check:

```python
import hashlib
# SAFE: verify the plan's hash against a value your build pipeline recorded
# before deserializing. Never load a .plan handed to you by an end user.
blob = open("model.plan", "rb").read()
assert hashlib.sha256(blob).hexdigest() == KNOWN_GOOD_SHA256
engine = runtime.deserialize_cuda_engine(blob)
```
- **CUDA / driver coupling**: a TensorRT release targets specific CUDA and driver
  ranges. A plan built against one CUDA toolkit may refuse to load under a
  mismatched driver — verify with `nvidia-smi` before filing a load bug.
- Source: cwe.mitre.org/502, docs.nvidia.com TensorRT developer guide. See References.

## Testing Conventions
```python
# CI usually has no matching GPU — gate engine-load tests on availability and
# assert accuracy parity, not just "it ran":
def test_engine_parity(trt_output, torch_reference):
    import numpy as np
    np.testing.assert_allclose(trt_output, torch_reference, rtol=1e-2, atol=1e-2)
```
- Keep the ONNX (portable) as the test artifact and rebuild the `.plan` in the
  test environment; do not commit a `.plan` and assert on a different card.

## Performance Traps
- Rebuilding the engine on every process start (no `.plan` cache) adds minutes to
  cold start — build once, cache the plan keyed by (model, GPU arch, TRT version).
- An `opt` shape far from real traffic makes the builder tune for the wrong case;
  set `opt` to your median batch/sequence, not the max.
- Excess dynamic-shape range forces more generic kernels — narrow `[min, max]` to
  what you actually serve.

## Version-Specific Gotchas (dated, sourced)
- The **`tensorrt` PyPI wheel is 11.1.0.106**, uploaded **2026-06-16**
  (`requires_python >=3.8`). Pin the exact version so a rebuilt plan stays load-
  compatible. [pypi.org/project/tensorrt, retrieved 2026-07-10]
- Engine plans are **NOT forward/backward compatible across TensorRT major
  versions** without the version-compatible build flags — rebuild after any TRT
  upgrade. [docs.nvidia.com TensorRT developer guide, retrieved 2026-07-10]
- The NVIDIA `nvcr.io/nvidia/tensorrt` container is versioned by NGC tag
  (`YY.MM-py3`) that couples TRT + CUDA + driver — match it to your runtime.
  [catalog.ngc.nvidia.com, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- TensorRT releases (PyPI): https://pypi.org/project/tensorrt/
- TensorRT developer guide: https://docs.nvidia.com/deeplearning/tensorrt/latest/index.html
- NGC TensorRT container: https://catalog.ngc.nvidia.com/orgs/nvidia/containers/tensorrt
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
