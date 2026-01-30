# TRL CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install trl transformers datasets peft accelerate
# Verify: python -c "from trl import SFTTrainer; print('OK')"
```

## Claude's Common Mistakes
1. Using PPO without validated reward model (unstable)
2. Missing beta (KL penalty) in DPO causing distribution collapse
3. Wrong data format for DPO (needs chosen/rejected pairs)
4. Not using PEFT integration for memory efficiency
5. Skipping SFT stage before alignment

## Correct Patterns (2026)
```python
from trl import SFTTrainer, SFTConfig, DPOTrainer, DPOConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from datasets import load_dataset

# Load model and tokenizer
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B")
tokenizer.pad_token = tokenizer.eos_token

# PEFT config for efficiency
peft_config = LoraConfig(r=16, lora_alpha=32, target_modules=["q_proj", "v_proj"])

# Stage 1: Supervised Fine-Tuning
sft_config = SFTConfig(
    output_dir="./sft",
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    num_train_epochs=1,
    fp16=True,
)

sft_trainer = SFTTrainer(
    model=model,
    args=sft_config,
    train_dataset=sft_dataset,
    tokenizer=tokenizer,
    peft_config=peft_config,
    max_seq_length=2048,
)
sft_trainer.train()

# Stage 2: DPO (simpler than PPO, no reward model needed)
# Dataset format: {"prompt": str, "chosen": str, "rejected": str}
dpo_config = DPOConfig(
    output_dir="./dpo",
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    beta=0.1,  # KL penalty - CRITICAL for stability
    loss_type="sigmoid",
    fp16=True,
)

dpo_trainer = DPOTrainer(
    model=sft_trainer.model,
    ref_model=None,  # Uses implicit reference
    args=dpo_config,
    train_dataset=preference_dataset,
    tokenizer=tokenizer,
)
dpo_trainer.train()
```

## Version Gotchas
- **DPO vs PPO**: DPO is simpler, no reward model needed
- **Beta**: 0.1-0.5 typical, higher = more conservative
- **SFT first**: Always do SFT before DPO/PPO
- **Data format**: DPO needs chosen/rejected, not just labels

## What NOT to Do
- Do NOT use PPO without a validated reward model
- Do NOT skip beta parameter in DPO (causes collapse)
- Do NOT skip SFT stage before alignment
- Do NOT use wrong data format for DPO
- Do NOT forget PEFT integration for memory efficiency
