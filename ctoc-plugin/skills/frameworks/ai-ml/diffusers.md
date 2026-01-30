# Diffusers CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install diffusers[torch] transformers accelerate
# Verify: python -c "from diffusers import DiffusionPipeline; print('OK')"
```

## Claude's Common Mistakes
1. Using fp32 when fp16 works (wastes VRAM)
2. Missing memory optimizations (attention slicing, VAE tiling)
3. Not using safety checker for public-facing apps
4. Wrong scheduler for quality/speed tradeoff
5. Not enabling cpu_offload for limited VRAM

## Correct Patterns (2026)
```python
import torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler

# Load with fp16 and optimizations
pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16,
    variant="fp16",
    use_safetensors=True,
)

# Memory optimizations (enable all for consumer GPUs)
pipe.enable_attention_slicing()
pipe.enable_vae_tiling()
pipe.enable_model_cpu_offload()  # For limited VRAM

# Fast scheduler (25 steps instead of 50)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(
    pipe.scheduler.config,
    algorithm_type="sde-dpmsolver++",
)

# Load LoRA adapter
pipe.load_lora_weights("path/to/lora", adapter_name="style")
pipe.set_adapters(["style"], adapter_weights=[0.8])

# Generate with safety check
def generate(prompt: str, negative_prompt: str = ""):
    with torch.inference_mode():
        result = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=25,
            guidance_scale=7.5,
            generator=torch.Generator().manual_seed(42),
        )

    if hasattr(result, 'nsfw_content_detected') and result.nsfw_content_detected[0]:
        raise ValueError("NSFW content detected")

    return result.images[0]
```

## Version Gotchas
- **SDXL**: Requires fp16-fix VAE for best results
- **Schedulers**: DPM++ SDE for quality, Euler for speed
- **LoRA**: Use `set_adapters()` to control strength
- **Memory**: Stack optimizations for consumer GPUs

## What NOT to Do
- Do NOT use fp32 for inference - use torch.float16
- Do NOT skip memory optimizations on consumer GPUs
- Do NOT forget safety checker for public apps
- Do NOT use default scheduler (50 steps) when DPM++ works
- Do NOT load LoRA without managing adapter weights
