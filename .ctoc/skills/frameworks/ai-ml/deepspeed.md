# DeepSpeed CTO
> Train massive models efficiently with ZeRO optimization and mixed precision.

## Commands
```bash
# Setup | Dev | Test
pip install deepspeed
ds_report  # Check system compatibility
deepspeed --num_gpus=4 train.py --deepspeed_config ds_config.json
```

## Non-Negotiables
1. Choose appropriate ZeRO stage (1/2/3) for model size
2. Enable gradient checkpointing for large models
3. Use mixed precision (fp16/bf16) training
4. Configure proper deepspeed config JSON
5. Use DeepSpeed's optimizers for efficiency
6. Enable CPU offloading when GPU memory limited

## Red Lines
- ZeRO-3 for small models (use ZeRO-1/2)
- Not enabling gradient checkpointing for large models
- Ignoring CPU offloading when OOM
- Manual distributed setup when DeepSpeed handles it
- Not using fused optimizers
- Skipping proper config tuning

## Pattern: Large Model Training
```python
import deepspeed
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# DeepSpeed config (ds_config.json)
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
        "reduce_bucket_size": 5e7,
        "stage3_prefetch_bucket_size": 5e7,
        "stage3_param_persistence_threshold": 1e5,
    },
    "gradient_clipping": 1.0,
    "activation_checkpointing": {
        "partition_activations": True,
        "cpu_checkpointing": True,
        "contiguous_memory_optimization": True,
    },
    "optimizer": {
        "type": "AdamW",
        "params": {"lr": 1e-5, "betas": [0.9, 0.999], "weight_decay": 0.01}
    },
    "scheduler": {
        "type": "WarmupDecayLR",
        "params": {"warmup_num_steps": 100, "total_num_steps": 10000}
    }
}

# Initialize model with DeepSpeed
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
model.gradient_checkpointing_enable()

model_engine, optimizer, _, lr_scheduler = deepspeed.initialize(
    model=model,
    config=ds_config,
)

# Training loop
for batch in dataloader:
    outputs = model_engine(batch["input_ids"], labels=batch["labels"])
    loss = outputs.loss

    model_engine.backward(loss)
    model_engine.step()

# Save checkpoint
model_engine.save_checkpoint("checkpoints/", tag="final")
```

## Integrates With
- **Frameworks**: PyTorch, HuggingFace Transformers
- **Training**: Trainer, Accelerate
- **Models**: LLaMA, GPT, BERT variants
- **Hardware**: NVIDIA GPUs, AMD ROCm

## Common Errors
| Error | Fix |
|-------|-----|
| `CUDA out of memory` | Enable ZeRO-3 offloading, reduce batch size |
| `Communication timeout` | Increase NCCL timeout, check network |
| `Checkpoint mismatch` | Use same ZeRO stage for save/load |
| `Loss scale overflow` | Increase loss_scale_window, check gradients |

## Prod Ready
- [ ] ZeRO stage appropriate for model size
- [ ] Gradient checkpointing enabled
- [ ] Mixed precision configured
- [ ] CPU offloading enabled if needed
- [ ] Checkpointing saves full state
- [ ] Config tested with ds_report
