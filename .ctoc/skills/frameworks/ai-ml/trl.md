# TRL CTO
> Transformer reinforcement learning.

## Non-Negotiables
1. SFTTrainer for supervised
2. DPOTrainer for preference
3. Proper reward modeling
4. PPO configuration
5. PEFT integration

## Red Lines
- PPO without reward model validation
- Missing KL penalty
- No reference model
- Ignoring batch size impact
- Skipping evaluation

## Pattern
```python
from trl import SFTTrainer, SFTConfig

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    args=SFTConfig(output_dir="./output"),
    peft_config=lora_config,
)
trainer.train()
```
