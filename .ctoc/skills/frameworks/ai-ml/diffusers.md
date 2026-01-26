# Diffusers CTO
> State-of-the-art diffusion models for image, video, and audio generation.

## Commands
```bash
# Setup | Dev | Test
pip install diffusers[torch] transformers accelerate
python -c "from diffusers import DiffusionPipeline; print('OK')"
pytest tests/ -v
```

## Non-Negotiables
1. Use Pipeline abstraction for inference
2. Select appropriate scheduler for quality/speed
3. Enable memory optimizations (attention slicing, VAE tiling)
4. Use safety checker for content moderation
5. Proper dtype handling (fp16 for GPU)
6. LoRA/adapter support for customization

## Red Lines
- Full precision when half precision works
- Missing safety checks for NSFW content
- No attention slicing for memory efficiency
- Ignoring scheduler impact on quality
- Hardcoded model paths
- Not using CPU offloading when needed

## Pattern: Production Image Generation
```python
import torch
from diffusers import (
    StableDiffusionXLPipeline,
    DPMSolverMultistepScheduler,
    AutoencoderKL,
)

# Load optimized pipeline
vae = AutoencoderKL.from_pretrained(
    "madebyollin/sdxl-vae-fp16-fix",
    torch_dtype=torch.float16,
)

pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    vae=vae,
    torch_dtype=torch.float16,
    variant="fp16",
    use_safetensors=True,
)

# Memory optimizations
pipe.enable_attention_slicing()
pipe.enable_vae_tiling()
pipe.enable_model_cpu_offload()  # For limited VRAM

# Fast scheduler
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

    if result.nsfw_content_detected[0]:
        raise ValueError("NSFW content detected")

    return result.images[0]
```

## Integrates With
- **Models**: SDXL, SD3, Kandinsky, ControlNet
- **Fine-tuning**: LoRA, DreamBooth, Textual Inversion
- **Deployment**: Gradio, FastAPI, Triton
- **Hardware**: CUDA, MPS, CPU

## Common Errors
| Error | Fix |
|-------|-----|
| `CUDA out of memory` | Enable cpu_offload, attention_slicing, vae_tiling |
| `Black images` | Check VAE dtype, use fp16-fix VAE for SDXL |
| `Slow generation` | Use DPM++ scheduler, reduce steps |
| `Safety checker error` | Install transformers with clip |

## Prod Ready
- [ ] Memory optimizations enabled
- [ ] Safety checker active for content moderation
- [ ] Fast scheduler configured
- [ ] LoRA adapters loaded efficiently
- [ ] Inference mode used for generation
- [ ] NSFW filtering implemented
