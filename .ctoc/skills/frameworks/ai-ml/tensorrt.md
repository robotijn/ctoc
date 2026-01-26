# TensorRT CTO
> NVIDIA deep learning inference optimizer.

## Non-Negotiables
1. Precision selection (FP16/INT8)
2. Calibration for INT8
3. Dynamic shapes handling
4. Engine serialization
5. Layer fusion awareness

## Red Lines
- INT8 without calibration
- Ignoring dynamic shapes
- No engine caching
- Missing optimization profiles
- Wrong workspace size
