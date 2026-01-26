# Diffusers CTO
> State-of-the-art diffusion models.

## Non-Negotiables
1. Pipeline abstraction
2. Scheduler selection
3. Memory optimization
4. Safety checker usage
5. Proper dtype handling

## Red Lines
- Full precision when half works
- Missing safety checks for NSFW
- No attention slicing for memory
- Ignoring scheduler impact
- Hardcoded model paths

## Pattern
```python
from diffusers import StableDiffusionPipeline
import torch

pipe = StableDiffusionPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16
)
pipe.enable_attention_slicing()
```
