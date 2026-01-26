# Accelerate CTO
> Distributed training made simple with automatic device management.

## Commands
```bash
# Setup | Dev | Test
pip install accelerate
accelerate config  # Interactive setup
accelerate launch --multi_gpu train.py
accelerate test  # Verify configuration
```

## Non-Negotiables
1. Run `accelerate config` for initial setup
2. Proper device placement with prepare()
3. Gradient accumulation for large batches
4. Mixed precision (fp16/bf16) for efficiency
5. DeepSpeed/FSDP integration for large models
6. Checkpointing with save_state/load_state

## Red Lines
- Manual device management with .to(device)
- Missing gradient accumulation steps
- No mixed precision when GPU available
- Ignoring accelerate config file
- Hardcoded world size or rank
- Not using prepare() for all objects

## Pattern: Production Distributed Training
```python
from accelerate import Accelerator, DeepSpeedPlugin
from accelerate.utils import set_seed
import torch

# Configure with DeepSpeed
deepspeed_plugin = DeepSpeedPlugin(
    zero_stage=2,
    gradient_accumulation_steps=4,
)

accelerator = Accelerator(
    mixed_precision="bf16",
    gradient_accumulation_steps=4,
    deepspeed_plugin=deepspeed_plugin,
    log_with="wandb",
)

set_seed(42)

# Prepare all training objects
model, optimizer, train_dataloader, lr_scheduler = accelerator.prepare(
    model, optimizer, train_dataloader, lr_scheduler
)

# Training loop
for epoch in range(num_epochs):
    model.train()
    for batch in train_dataloader:
        with accelerator.accumulate(model):
            outputs = model(**batch)
            loss = outputs.loss
            accelerator.backward(loss)

            optimizer.step()
            lr_scheduler.step()
            optimizer.zero_grad()

        # Log metrics
        accelerator.log({"train_loss": loss.item()}, step=step)

    # Save checkpoint
    accelerator.save_state(f"checkpoint-{epoch}")

# Unwrap for saving
unwrapped_model = accelerator.unwrap_model(model)
accelerator.save_model(unwrapped_model, "final_model")
```

## Integrates With
- **Distributed**: DeepSpeed, FSDP, DDP
- **Training**: Transformers Trainer, PyTorch
- **Tracking**: W&B, TensorBoard, MLflow
- **Hardware**: Multi-GPU, TPU, Apple Silicon

## Common Errors
| Error | Fix |
|-------|-----|
| `NCCL error` | Check network, increase timeout |
| `OOM with gradient accumulation` | Reduce per-device batch size |
| `Device mismatch` | Use accelerator.prepare() for all objects |
| `Checkpoint loading fails` | Use accelerator.load_state() |

## Prod Ready
- [ ] accelerate config completed
- [ ] All objects passed through prepare()
- [ ] Gradient accumulation configured
- [ ] Mixed precision enabled
- [ ] Checkpointing with save_state
- [ ] Logging integrated
