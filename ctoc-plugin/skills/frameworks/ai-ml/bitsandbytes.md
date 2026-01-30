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
