# TRL CTO
> Train LLMs with reinforcement learning from human feedback (RLHF).

## Commands
```bash
# Setup | Dev | Test
pip install trl transformers datasets peft accelerate
python -c "from trl import SFTTrainer; print('OK')"
pytest tests/ -v
```

## Non-Negotiables
1. SFTTrainer for supervised fine-tuning
2. DPOTrainer for direct preference optimization
3. Proper reward model validation for PPO
4. KL penalty to prevent distribution collapse
5. PEFT integration for efficiency
6. Evaluation at every stage

## Red Lines
- PPO without validated reward model
- Missing KL divergence penalty
- No reference model for regularization
- Ignoring batch size impact on stability
- Skipping evaluation checkpoints
- Training without proper data formatting

## Pattern: Production RLHF Pipeline
```python
from trl import SFTTrainer, SFTConfig, DPOTrainer, DPOConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from datasets import load_dataset

# Load base model and tokenizer
model_id = "meta-llama/Llama-3.1-8B"
model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype="auto")
tokenizer = AutoTokenizer.from_pretrained(model_id)
tokenizer.pad_token = tokenizer.eos_token

# LoRA for efficiency
peft_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
)

# Stage 1: Supervised Fine-Tuning
sft_config = SFTConfig(
    output_dir="./sft-output",
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    num_train_epochs=1,
    logging_steps=10,
    save_strategy="epoch",
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

# Stage 2: Direct Preference Optimization (simpler than PPO)
# Dataset format: {"prompt": str, "chosen": str, "rejected": str}
dpo_config = DPOConfig(
    output_dir="./dpo-output",
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    num_train_epochs=1,
    beta=0.1,  # KL penalty coefficient
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

# Save final model
dpo_trainer.model.save_pretrained("./final-model")
```

## Integrates With
- **Training**: Transformers, PEFT, Accelerate
- **Data**: Datasets, preference data formats
- **Models**: LLaMA, Mistral, GPT variants
- **Evaluation**: lm-eval-harness

## Common Errors
| Error | Fix |
|-------|-----|
| `Reward model collapse` | Increase beta (KL penalty), validate reward model |
| `Training instability` | Reduce learning rate, increase batch size |
| `OOM error` | Use gradient checkpointing, reduce seq length |
| `Data format error` | Verify chosen/rejected format for DPO |

## Prod Ready
- [ ] SFT completed before alignment
- [ ] DPO/PPO beta tuned for stability
- [ ] Reference model used for regularization
- [ ] Evaluation metrics tracked
- [ ] Adapter saved for deployment
- [ ] Training data properly formatted
