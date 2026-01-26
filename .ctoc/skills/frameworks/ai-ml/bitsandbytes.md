# bitsandbytes CTO
> 8-bit and 4-bit quantization.

## Non-Negotiables
1. 4-bit for inference
2. 8-bit for training
3. NF4 for better quality
4. Proper compute dtype
5. Double quantization

## Red Lines
- 4-bit training (unstable)
- Missing compute dtype
- Ignoring memory savings
- No double quant for large models
- Wrong quantization for use case

## Pattern
```python
from transformers import BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True
)
```
