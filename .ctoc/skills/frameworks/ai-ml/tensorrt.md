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
