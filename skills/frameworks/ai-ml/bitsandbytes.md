# bitsandbytes CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install bitsandbytes
# Verify CUDA: python -c "import bitsandbytes as bnb; print(bnb.COMPILED_WITH_CUDA)"
# Requires NVIDIA GPU (Ampere or newer recommended)
```

## Claude's Common Mistakes
1. Missing `bnb_4bit_compute_dtype` causing slow inference
2. 4-bit training without QLoRA setup (unstable)
3. Wrong quant_type (use "nf4" for better quality)
4. Not enabling double quantization for memory savings
5. Using 8-bit when 4-bit would work

## Correct Patterns (2026)
```python
import torch
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
from peft import prepare_model_for_kbit_training

# 4-bit config for inference (most common)
bnb_config_4bit = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",            # Better than fp4
    bnb_4bit_compute_dtype=torch.bfloat16, # CRITICAL for speed
    bnb_4bit_use_double_quant=True,        # Extra memory savings
)

# 8-bit config for training stability (if 4-bit unstable)
bnb_config_8bit = BitsAndBytesConfig(
    load_in_8bit=True,
    llm_int8_threshold=6.0,
)

# Load model with quantization
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=bnb_config_4bit,
    device_map="auto",
    torch_dtype=torch.bfloat16,
)

# For training (QLoRA) - MUST prepare model
model = prepare_model_for_kbit_training(
    model,
    use_gradient_checkpointing=True,
)

# Check quantization worked
print(f"Model memory: {model.get_memory_footprint() / 1e9:.2f} GB")
```

## Version Gotchas
- **compute_dtype**: Must set for fast inference (bfloat16 or float16)
- **GPU requirement**: Ampere+ (RTX 30xx/40xx, A100) for best performance
- **double_quant**: Additional 0.4 bits/param savings
- **8-bit vs 4-bit**: Use 8-bit if training is unstable with 4-bit

## What NOT to Do
- Do NOT skip `bnb_4bit_compute_dtype` - causes slow inference
- Do NOT train with 4-bit without `prepare_model_for_kbit_training()`
- Do NOT use "fp4" - use "nf4" for better quality
- Do NOT skip double_quant for large models
- Do NOT use on non-NVIDIA GPUs

## Quantization Footguns (NF4 vs FP4, compute_dtype, double-quant)
The 4-bit path stores weights in a 4-bit format but **computes** in a higher
precision (`bnb_4bit_compute_dtype`) after an on-the-fly dequantize. Getting the
compute dtype wrong is the classic "why is my quantized model slow?" bug.

```python
from transformers import BitsAndBytesConfig
import torch

cfg = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",              # NF4 = NormalFloat4, info-theoretically
                                            # optimal for normally-distributed
                                            # weights; FP4 is worse for LLMs
    bnb_4bit_compute_dtype=torch.bfloat16,  # DEFAULT is float32 -> slow. Set
                                            # bf16 (Ampere+) or fp16 explicitly
    bnb_4bit_use_double_quant=True,         # quantizes the quant CONSTANTS too:
                                            # ~0.4 bits/param extra saving
)
```
- **NF4 vs FP4**: `nf4` is designed for the roughly-Gaussian weight distribution of
  a trained transformer and is the QLoRA default; `fp4` loses accuracy for the same
  bit budget. Use `nf4` unless you have a measured reason not to.
- **`bnb_4bit_compute_dtype` defaults to float32** if you omit it — every matmul
  then dequantizes to fp32, erasing the speedup. Always set bf16/fp16.
- **Double quantization** compresses the per-block quantization constants a second
  time. Free accuracy-neutral memory (~0.4 bits/param) — leave it on.
- Source: huggingface.co/docs/bitsandbytes 4-bit / QLoRA docs. See References.

## Numerical: outliers, 8-bit LLM.int8(), dequant loss
```python
from transformers import BitsAndBytesConfig
# 8-bit (LLM.int8()) keeps a small set of OUTLIER feature dimensions in fp16 and
# quantizes the rest to int8. The threshold decides what counts as an outlier —
# lowering it keeps more in fp16 (more accurate, more memory / slower).
cfg8 = BitsAndBytesConfig(load_in_8bit=True, llm_int8_threshold=6.0)
```
- 4-bit is smaller/faster; 8-bit (LLM.int8()) is more numerically stable for the
  rare model that degrades badly at 4-bit — try 4-bit NF4 first, fall back to 8-bit.
- **bitsandbytes 8-bit Adam/AdamW optimizers** (`optim="adamw_8bit"` / `bnb.optim.
  Adam8bit`) quantize the *optimizer state* (momentums), not the weights — that is
  where most of the training-time memory goes. Orthogonal to weight quantization;
  you can use both.
- Dequantization is lossy: a 4-bit-quantized model's logits will not bit-match the
  fp16 model. Do NOT assert exact equality in tests — compare task metrics.

## Error Handling Idioms
```python
# CUDA-ONLY: bitsandbytes has no CPU inference path for quantized matmul. On a
# CPU-only box `load_in_4bit=True` fails or silently mis-runs. Guard it:
import torch
assert torch.cuda.is_available(), "bitsandbytes 4/8-bit requires an NVIDIA GPU"

# Verify the build actually found CUDA (a mismatched CUDA runtime is the #1 install
# failure). Older bitsandbytes exposed COMPILED_WITH_CUDA:
import bitsandbytes as bnb
# Newer builds: run `python -m bitsandbytes` for a full diagnostic dump instead.

# You CANNOT merge a LoRA adapter into a 4-bit base (corrupts weights) — dequantize
# to fp16 first (see the peft guide's merge_and_unload footgun).
```

## Security and Dependency Gotchas
- **Quantized weights still come from an untrusted checkpoint (CWE-502)**:
  quantization does not sanitize provenance. Loading a `.bin`/`.pt` checkpoint (even
  to then quantize it) runs `pickle` and can execute arbitrary code — CWE-502
  "Deserialization of Untrusted Data" (cwe.mitre.org/data/definitions/502.html).
  Prefer `.safetensors` sources.
- **CUDA runtime coupling**: a bitsandbytes wheel must match the CUDA toolkit its
  binary was compiled against; a mismatch surfaces as "CUDA Setup failed" at import.
- Source: cwe.mitre.org/502, huggingface.co/docs/bitsandbytes install/troubleshoot. See References.

## Testing Conventions
```python
def test_quantized_footprint_shrinks():
    # assert MEMORY dropped, not that logits match (dequant is lossy).
    assert q_model.get_memory_footprint() < fp16_model.get_memory_footprint()

def test_metric_not_exact_logits():
    # compare a task metric within tolerance; never torch.equal on quantized logits.
    assert abs(accuracy(q_model) - accuracy(fp16_model)) < 0.02

def test_skips_without_gpu():
    import torch, pytest
    if not torch.cuda.is_available():
        pytest.skip("bitsandbytes needs CUDA")   # documented skip, not silent pass
```

## Performance Traps
- Omitting `bnb_4bit_compute_dtype` (defaulting to fp32) is the top perf regression.
- 8-bit is slower than 4-bit and than fp16 for small models where the int8 outlier
  path dominates — only quantize when the model does not otherwise fit.
- `device_map="auto"` offloading a quantized model to CPU/disk turns each token
  into a PCIe round-trip; size the GPU to hold the quantized weights.

## Version-Specific Gotchas (dated, sourced)
- **bitsandbytes 0.49.2** is the current stable release on PyPI, uploaded
  **2026-02-16**, `requires_python >= 3.10`.
  [pypi.org/project/bitsandbytes, retrieved 2026-07-10]
- The 0.4x line broadened backend support and multi-platform wheels, but the
  quantized-matmul fast path remains **NVIDIA-CUDA only** for practical LLM work —
  do not promise CPU/AMD 4-bit inference.
  [huggingface.co/docs/bitsandbytes, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- bitsandbytes releases (PyPI): https://pypi.org/project/bitsandbytes/
- bitsandbytes docs (HF): https://huggingface.co/docs/bitsandbytes
- 4-bit / NF4 & QLoRA: https://huggingface.co/docs/transformers/quantization/bitsandbytes
- Install / troubleshoot: https://huggingface.co/docs/bitsandbytes/installation
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
