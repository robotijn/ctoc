# Accelerate CTO
> Distributed training made easy.

## Non-Negotiables
1. accelerate config setup
2. Proper device placement
3. Gradient accumulation
4. Mixed precision
5. DeepSpeed/FSDP integration

## Red Lines
- Manual device management
- Missing gradient accumulation
- No mixed precision
- Ignoring accelerate config
- Hardcoded world size

## Pattern
```python
from accelerate import Accelerator

accelerator = Accelerator(mixed_precision="fp16")
model, optimizer, dataloader = accelerator.prepare(
    model, optimizer, dataloader
)
```
