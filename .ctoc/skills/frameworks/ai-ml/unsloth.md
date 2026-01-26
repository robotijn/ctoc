# Unsloth CTO
> 2x faster LLM fine-tuning with 80% less memory.

## Commands
```bash
# Setup | Dev | Test
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install --no-deps xformers trl peft accelerate bitsandbytes
python -c "from unsloth import FastLanguageModel; print('OK')"
```

## Non-Negotiables
1. Use only supported model architectures
2. Enable 4-bit quantization for memory efficiency
3. Enable gradient checkpointing for large models
4. Configure LoRA properly for fine-tuning
5. Export to GGUF for deployment
6. Use appropriate sequence length

## Red Lines
- Using unsupported model architectures
- Disabling gradient checkpointing for large models
- Wrong sequence length causing memory issues
- Not using Unsloth's optimized training loop
- Ignoring export format for deployment
- Skipping validation after training

## Pattern: Production Fine-Tuning
```python
from unsloth import FastLanguageModel
from trl import SFTTrainer
from transformers import TrainingArguments
from datasets import load_dataset

# Load model with Unsloth optimizations
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Meta-Llama-3.1-8B-bnb-4bit",
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
    use_gradient_checkpointing="unsloth",  # Optimized checkpointing
    random_state=42,
)

# Prepare dataset
def formatting_func(examples):
    return [f"### Instruction:\n{inst}\n### Response:\n{resp}"
            for inst, resp in zip(examples["instruction"], examples["response"])]

dataset = load_dataset("your-dataset", split="train")

# Training with Unsloth optimizations
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    formatting_func=formatting_func,
    max_seq_length=2048,
    dataset_num_proc=2,
    args=TrainingArguments(
        output_dir="outputs",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        num_train_epochs=1,
        learning_rate=2e-4,
        fp16=not FastLanguageModel.is_bfloat16_supported(),
        bf16=FastLanguageModel.is_bfloat16_supported(),
        logging_steps=1,
        optim="adamw_8bit",
        seed=42,
    ),
)

trainer.train()

# Save LoRA adapter
model.save_pretrained("lora_model")
tokenizer.save_pretrained("lora_model")

# Export to GGUF for llama.cpp
model.save_pretrained_gguf("model", tokenizer, quantization_method="q4_k_m")
```

## Integrates With
- **Training**: TRL, Transformers
- **Models**: LLaMA, Mistral, Phi, Gemma
- **Export**: GGUF, vLLM, Ollama
- **Quantization**: bitsandbytes 4-bit

## Common Errors
| Error | Fix |
|-------|-----|
| `Model not supported` | Check Unsloth supported models list |
| `CUDA out of memory` | Reduce max_seq_length, batch size |
| `Slow training` | Ensure using Unsloth's FastLanguageModel |
| `GGUF export failed` | Install llama.cpp dependencies |

## Prod Ready
- [ ] Model is Unsloth-supported
- [ ] 4-bit quantization enabled
- [ ] Gradient checkpointing set to "unsloth"
- [ ] LoRA configured properly
- [ ] GGUF exported for deployment
- [ ] Training validated on test set
