# Unsloth CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Standard installation
pip install unsloth
# With all dependencies:
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install --no-deps xformers trl peft accelerate bitsandbytes
# Requires NVIDIA GPU (consumer GPUs work with 3GB+ VRAM)
```

## Claude's Common Mistakes
1. Using unsupported model architectures
2. Disabling Unsloth's optimized gradient checkpointing
3. Wrong sequence length causing OOM
4. Not using Unsloth's training loop optimizations
5. Skipping GGUF export for deployment

## Correct Patterns (2026)
```python
from unsloth import FastLanguageModel
from trl import SFTTrainer
from transformers import TrainingArguments

# Load model with Unsloth optimizations (2x faster, 70% less VRAM)
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Meta-Llama-3.1-8B-bnb-4bit",  # Use Unsloth's optimized models
    max_seq_length=2048,
    dtype=None,  # Auto-detect
    load_in_4bit=True,
)

# Add LoRA adapters with Unsloth
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",  # CRITICAL: Unsloth's optimized version
    random_state=42,
)

# Train with SFTTrainer
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    max_seq_length=2048,
    args=TrainingArguments(
        output_dir="outputs",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        fp16=not FastLanguageModel.is_bfloat16_supported(),
        bf16=FastLanguageModel.is_bfloat16_supported(),
        optim="adamw_8bit",
    ),
)
trainer.train()

# Export to GGUF for llama.cpp/Ollama
model.save_pretrained_gguf("model", tokenizer, quantization_method="q4_k_m")
```

## Version Gotchas
- **2026**: Supports 89K context for Llama 3.3 70B on 80GB GPU
- **Models**: Use `unsloth/*-bnb-4bit` versions for best results
- **Checkpointing**: Must use `use_gradient_checkpointing="unsloth"`
- **Export**: GGUF for llama.cpp, GGML deprecated

## What NOT to Do
- Do NOT use unsupported model architectures
- Do NOT use `use_gradient_checkpointing=True` - use `"unsloth"`
- Do NOT skip 4-bit quantization for consumer GPUs
- Do NOT ignore GGUF export for deployment
- Do NOT use standard Transformers training loop (loses optimizations)
