# PEFT CTO
> Parameter-efficient fine-tuning.

## Non-Negotiables
1. LoRA for most cases
2. Proper rank selection
3. Target module selection
4. Merging strategy
5. Quantization compatibility

## Red Lines
- Full fine-tuning when PEFT works
- Too high/low rank
- Wrong target modules
- Missing base model reference
- No adapter saving

## Pattern
```python
from peft import LoraConfig, get_peft_model

config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05
)
model = get_peft_model(base_model, config)
```
