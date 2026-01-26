# Unsloth CTO
> Fast LLM fine-tuning.

## Non-Negotiables
1. Supported model selection
2. 4-bit quantization
3. Gradient checkpointing
4. Proper LoRA config
5. GGUF export

## Red Lines
- Unsupported models
- Missing gradient checkpointing
- Wrong sequence length
- No memory optimization
- Ignoring export format

## Pattern
```python
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/llama-3-8b-bnb-4bit",
    max_seq_length=2048,
    load_in_4bit=True
)
model = FastLanguageModel.get_peft_model(model, r=16)
```
