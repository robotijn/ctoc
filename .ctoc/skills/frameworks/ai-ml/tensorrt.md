# TensorRT CTO
> NVIDIA's high-performance deep learning inference optimizer.

## Commands
```bash
# Setup | Dev | Test
pip install tensorrt
# Or use NVIDIA container
docker pull nvcr.io/nvidia/tensorrt:24.01-py3
trtexec --onnx=model.onnx --saveEngine=model.plan --fp16
```

## Non-Negotiables
1. Precision selection (FP16/INT8) based on accuracy needs
2. Calibration dataset for INT8 quantization
3. Dynamic shapes with optimization profiles
4. Engine serialization for deployment
5. Layer fusion awareness for custom ops
6. Workspace size configuration

## Red Lines
- INT8 without proper calibration
- Ignoring dynamic shape requirements
- No engine caching (rebuilding every time)
- Missing optimization profiles for variable inputs
- Wrong workspace size causing failures
- Not validating accuracy after conversion

## Pattern: Production Model Optimization
```python
import tensorrt as trt
import numpy as np

# Logger
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
            for error in range(parser.num_errors):
                print(parser.get_error(error))
            raise RuntimeError("Failed to parse ONNX")

    # Build config
    config = builder.create_builder_config()
    config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 1 << 30)  # 1GB

    # Precision
    if fp16:
        config.set_flag(trt.BuilderFlag.FP16)
    if int8:
        config.set_flag(trt.BuilderFlag.INT8)
        config.int8_calibrator = MyCalibrator(calibration_data)

    # Dynamic shapes
    profile = builder.create_optimization_profile()
    profile.set_shape(
        "input",
        min=(1, 3, 224, 224),
        opt=(8, 3, 224, 224),
        max=(32, 3, 224, 224)
    )
    config.add_optimization_profile(profile)

    # Build engine
    serialized_engine = builder.build_serialized_network(network, config)

    # Save engine
    with open("model.plan", "wb") as f:
        f.write(serialized_engine)

    return serialized_engine

# Inference
def inference(engine_path: str, input_data: np.ndarray):
    runtime = trt.Runtime(TRT_LOGGER)

    with open(engine_path, "rb") as f:
        engine = runtime.deserialize_cuda_engine(f.read())

    context = engine.create_execution_context()
    context.set_input_shape("input", input_data.shape)

    # Allocate buffers and run
    # ... (buffer allocation code)

    return output
```

## Integrates With
- **Frameworks**: PyTorch, TensorFlow, ONNX
- **Serving**: Triton, TensorRT-LLM
- **Hardware**: NVIDIA GPUs (Volta+)
- **Deployment**: CUDA, cuDNN

## Common Errors
| Error | Fix |
|-------|-----|
| `Unsupported layer` | Use custom plugin or modify network |
| `Calibration failed` | Ensure calibration data is representative |
| `Engine rebuild required` | Different GPU architecture, rebuild engine |
| `OOM during build` | Reduce workspace size, simplify network |

## Prod Ready
- [ ] Precision validated for accuracy
- [ ] INT8 calibrated with representative data
- [ ] Dynamic shapes profiled
- [ ] Engine serialized for deployment
- [ ] Latency benchmarked with trtexec
- [ ] GPU architecture matched to engine
