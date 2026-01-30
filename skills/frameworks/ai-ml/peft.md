# PEFT CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install peft transformers accelerate bitsandbytes
# Verify: python -c "from peft import LoraConfig, get_peft_model; print('OK')"
```

## Claude's Common Mistakes
1. Wrong target_modules for model architecture
2. LoRA rank too high (wasting resources) or too low (losing capacity)
3. Not using `prepare_model_for_kbit_training()` with quantization
4. Saving merged model when adapter should be separate
5. Missing `modules_to_save` for task-specific heads

## Correct Patterns (2026)
```python
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, PeftModel
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
import torch

# Quantization config for QLoRA
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

# Load quantized model
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=bnb_config,
    device_map="auto",
)

# CRITICAL: Prepare for k-bit training
model = prepare_model_for_kbit_training(model)

# LoRA config (target_modules vary by architecture!)
lora_config = LoraConfig(
    r=16,              # Rank - start with 8-16, increase if underfitting
    lora_alpha=32,     # Usually 2x rank
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],  # LLaMA
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()  # Should be < 1%

# After training - save adapter ONLY
model.save_pretrained("./lora-adapter")

# For inference - load adapter onto base model
base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
model = PeftModel.from_pretrained(base_model, "./lora-adapter")

# Optional: merge for faster inference (loses flexibility)
merged = model.merge_and_unload()
```

## Version Gotchas
- **target_modules**: LLaMA uses q/k/v/o_proj, BERT uses query/key/value
- **QLoRA**: Always use `prepare_model_for_kbit_training()` first
- **Rank**: 8-16 for most tasks, 32-64 for complex tasks
- **Merge**: Only merge for deployment, keep separate for flexibility

## What NOT to Do
- Do NOT skip `prepare_model_for_kbit_training()` with quantization
- Do NOT use wrong target_modules for architecture
- Do NOT set rank too high (>64) without justification
- Do NOT merge adapters unless deploying to production
- Do NOT forget to check `print_trainable_parameters()`
