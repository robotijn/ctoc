# Hugging Face Transformers CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v4.57+ requires Python 3.9+, PyTorch 2.1+
pip install "transformers[torch]" datasets accelerate
# Or with uv (10x faster):
uv pip install "transformers[torch]"
# Login for gated models: huggingface-cli login
```

## Claude's Common Mistakes
1. Not setting `pad_token = eos_token` for decoder-only models
2. Using `pipeline()` in production without batching
3. Missing `device_map="auto"` for large model distribution
4. Forgetting `trust_remote_code=True` for custom architectures
5. Using fp32 when fp16/bf16 is available

## Correct Patterns (2026)
```python
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
import torch

# Quantized loading for memory efficiency
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B-Instruct",
    quantization_config=bnb_config,
    device_map="auto",
    torch_dtype=torch.bfloat16,
)

tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B-Instruct")
tokenizer.pad_token = tokenizer.eos_token  # Required for batch inference

# Proper generation
inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True)
outputs = model.generate(**inputs.to(model.device), max_new_tokens=256)
```

## Version Gotchas
- **v4.57+**: New cache format - clear `~/.cache/huggingface` if issues
- **Llama 3.1+**: Requires `trust_remote_code=True` for some features
- **With PEFT**: Use `prepare_model_for_kbit_training()` before LoRA
- **Batch inference**: Always set `padding=True` and `truncation=True`

## What NOT to Do
- Do NOT use `pipeline()` without batching in production
- Do NOT skip `device_map="auto"` for models > 7B
- Do NOT forget pad_token for decoder-only models
- Do NOT use fp32 for inference (wastes memory)
- Do NOT ignore `gradient_checkpointing_enable()` for fine-tuning
