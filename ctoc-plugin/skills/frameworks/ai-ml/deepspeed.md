# DeepSpeed CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install deepspeed
# Verify system: ds_report
# Run: deepspeed --num_gpus=4 train.py --deepspeed_config ds_config.json
```

## Claude's Common Mistakes
1. Using ZeRO-3 for small models (overkill, use ZeRO-1/2)
2. Not enabling gradient checkpointing for large models
3. Missing CPU offloading when GPU OOM
4. Wrong ZeRO stage for model size
5. Not using DeepSpeed's fused optimizers

## Correct Patterns (2026)
```python
import deepspeed
from transformers import AutoModelForCausalLM

# ZeRO-3 config with offloading (for large models)
ds_config = {
    "train_batch_size": 32,
    "gradient_accumulation_steps": 8,
    "fp16": {"enabled": True, "loss_scale_window": 100},
    "zero_optimization": {
        "stage": 3,
        "offload_optimizer": {"device": "cpu", "pin_memory": True},
        "offload_param": {"device": "cpu", "pin_memory": True},
        "overlap_comm": True,
        "contiguous_gradients": True,
    },
    "gradient_clipping": 1.0,
    "activation_checkpointing": {
        "partition_activations": True,
        "cpu_checkpointing": True,
    },
    "optimizer": {
        "type": "AdamW",
        "params": {"lr": 1e-5, "betas": [0.9, 0.999]}
    }
}

# Initialize with DeepSpeed
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
model.gradient_checkpointing_enable()

model_engine, optimizer, _, _ = deepspeed.initialize(
    model=model, config=ds_config
)

# Training loop
for batch in dataloader:
    outputs = model_engine(batch["input_ids"], labels=batch["labels"])
    model_engine.backward(outputs.loss)
    model_engine.step()

model_engine.save_checkpoint("checkpoints/", tag="final")
```

## Version Gotchas
- **ZeRO Stage**: 1 for optimizer states, 2 for gradients, 3 for parameters
- **Model size guide**: <7B use ZeRO-1, 7-30B use ZeRO-2, >30B use ZeRO-3
- **CPU offload**: Enable only when GPU memory insufficient
- **Checkpoint**: Use same ZeRO stage for save and load

## What NOT to Do
- Do NOT use ZeRO-3 for models under 7B parameters
- Do NOT skip gradient checkpointing for large models
- Do NOT ignore CPU offloading when OOM
- Do NOT mix ZeRO stages between checkpoint save/load
- Do NOT skip `ds_report` to verify system compatibility
