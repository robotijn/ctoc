# Accelerate CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install accelerate
accelerate config  # Interactive setup - run this first!
# Verify: accelerate test
```

## Claude's Common Mistakes
1. Manual `.to(device)` instead of using `accelerator.prepare()`
2. Missing `accelerator.accumulate()` context manager
3. Not using `accelerate config` for initial setup
4. Forgetting to unwrap model before saving
5. Using `loss.backward()` instead of `accelerator.backward()`

## Correct Patterns (2026)
```python
from accelerate import Accelerator, DeepSpeedPlugin
from accelerate.utils import set_seed
import torch

# Configure with DeepSpeed (optional)
deepspeed_plugin = DeepSpeedPlugin(zero_stage=2, gradient_accumulation_steps=4)

accelerator = Accelerator(
    mixed_precision="bf16",
    gradient_accumulation_steps=4,
    deepspeed_plugin=deepspeed_plugin,
    log_with="wandb",
)

set_seed(42)

# Prepare ALL training objects (no manual .to(device)!)
model, optimizer, train_loader, scheduler = accelerator.prepare(
    model, optimizer, train_loader, scheduler
)

# Training loop with gradient accumulation
for epoch in range(num_epochs):
    model.train()
    for batch in train_loader:
        with accelerator.accumulate(model):  # Handles accumulation
            outputs = model(**batch)
            loss = outputs.loss
            accelerator.backward(loss)  # Not loss.backward()!

            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()

        accelerator.log({"train_loss": loss.item()}, step=step)

    # Checkpoint
    accelerator.save_state(f"checkpoint-{epoch}")

# Save model - MUST unwrap first
unwrapped = accelerator.unwrap_model(model)
accelerator.save_model(unwrapped, "final_model")
```

## Version Gotchas
- **prepare()**: Must include ALL objects (model, optimizer, dataloader, scheduler)
- **accumulate()**: Required for gradient accumulation to work correctly
- **unwrap_model()**: Required before saving to get original model
- **DeepSpeed**: Use DeepSpeedPlugin for ZeRO integration

## What NOT to Do
- Do NOT use manual `.to(device)` - use `accelerator.prepare()`
- Do NOT use `loss.backward()` - use `accelerator.backward(loss)`
- Do NOT skip `accelerate config` initial setup
- Do NOT forget `accelerator.accumulate()` context
- Do NOT save without `accelerator.unwrap_model()`
