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

## VRAM Footguns
The two knobs that save the most memory — `variant="fp16"` and the offload
helpers — also have the sharpest edges. Getting them wrong wastes GPU or corrupts
output.

```python
import torch
from diffusers import StableDiffusionXLPipeline

# FOOTGUN: torch_dtype=fp16 WITHOUT variant="fp16" downloads full fp32 weights
# then casts — you pay the fp32 download + a transient fp32 spike. Pass BOTH so
# the fp16 weight *files* are fetched:
pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16,
    variant="fp16",                 # fetches the fp16 weight files, not fp32
    use_safetensors=True,
)

# Offload trades speed for VRAM — pick ONE, do not stack them, and do NOT call
# pipe.to("cuda") afterward (it undoes the offload hooks):
pipe.enable_model_cpu_offload()        # module-level: big VRAM win, small slowdown
# pipe.enable_sequential_cpu_offload() # layer-level: max saving, MUCH slower
pipe.enable_vae_tiling()               # tile the VAE decode → high-res without OOM
pipe.enable_attention_slicing()        # slice attention → less peak VRAM
```
- **SDXL fp16 VAE overflow**: the stock SDXL VAE **overflows in fp16 and yields
  black images**. Either load the fp16-fix VAE (`madebyollin/sdxl-vae-fp16-fix`)
  or run the VAE in fp32 (`pipe.upcast_vae()`). This is the #1 "all black output"
  bug on SDXL.
- `enable_model_cpu_offload()` requires `accelerate`; it moves whole submodules
  CPU↔GPU on demand, so the model's device is managed for you — do not manually
  `.to(device)` inputs against it.

## Quality vs Speed
```python
from diffusers import DPMSolverMultistepScheduler, EulerDiscreteScheduler

# DPM++ 2M SDE: strong quality at ~20–30 steps (use_karras_sigmas sharpens):
pipe.scheduler = DPMSolverMultistepScheduler.from_config(
    pipe.scheduler.config, algorithm_type="sde-dpmsolver++", use_karras_sigmas=True,
)
# Euler: fewer, faster steps, slightly softer — good for previews.
# pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config)
```
- **Steps × scheduler are coupled**: DPM++ is tuned for low step counts (20–30);
  forcing 50 steps buys little and doubles latency. Euler wants a few more steps.
- **Guidance scale**: ~5–8 for SDXL; too high (>12) over-saturates and burns
  detail. Guidance is the classic "why is my image fried" knob.
- **LoRA weights**: `set_adapters` scales each adapter; a weight of 1.0 can
  dominate the base model. Blend explicitly:

```python
pipe.load_lora_weights("path/to/lora", adapter_name="style")
pipe.set_adapters(["style"], adapter_weights=[0.8])   # 0.6–0.9 typical
pipe.fuse_lora()                                       # optional: bake in for speed
```

## Security & Dependency Gotchas
- **`from_pretrained` on an untrusted repo runs pickle (CWE-502)**: legacy
  `.bin`/`.ckpt` diffusion checkpoints are Python `pickle` — loading one executes
  arbitrary code (CWE-502 "Deserialization of Untrusted Data", cwe.mitre.org).
  Pass `use_safetensors=True` and prefer repos shipping `*.safetensors`:

```python
pipe = StableDiffusionXLPipeline.from_pretrained(
    "org/model",
    use_safetensors=True,            # refuse silent pickle fallback
    revision="a1b2c3d4e5f6",         # pin an immutable SHA (supply-chain lock)
)
# Some community pipelines require custom_pipeline=/trust_remote_code=True, which
# RUNS repo-shipped Python (CWE-94 code injection) — audit + pin, or avoid.
```
- **Safety checker for public apps**: SD/SDXL ship an optional NSFW
  `safety_checker`. It is disabled on some community checkpoints; a public-facing
  service MUST re-enable and enforce it (and log the block), or moderate outputs
  externally. Silently disabling it is a real content-liability footgun.
- Source: cwe.mitre.org/502, /94; huggingface.co/docs/diffusers loading + safe
  serialization docs. See References.

## Error Handling Idioms
```python
# CUDA OOM even after offload → drop resolution or enable more slicing, retry.
try:
    image = pipe(prompt, num_inference_steps=25, guidance_scale=6.0).images[0]
except torch.cuda.OutOfMemoryError:
    torch.cuda.empty_cache()
    pipe.enable_sequential_cpu_offload()      # slowest but lowest VRAM
    image = pipe(prompt, height=768, width=768).images[0]

# All-black SDXL output is almost always the fp16 VAE overflow, not a crash:
pipe.upcast_vae()                              # run VAE in fp32 to fix black images
```

## Testing Conventions
```python
def test_reproducible_seed():
    g = torch.Generator(device="cpu").manual_seed(0)   # CPU generator = portable
    a = pipe(P, num_inference_steps=2, generator=g).images[0]
    g = torch.Generator(device="cpu").manual_seed(0)
    b = pipe(P, num_inference_steps=2, generator=g).images[0]
    assert list(a.getdata()) == list(b.getdata())      # same seed → same pixels

def test_prefers_safetensors():
    # CI: pin a TINY pipeline + revision; assert no pickle .bin was loaded.
    ...
```

## Performance Traps
- **`enable_sequential_cpu_offload` is the slow offload** — it moves data
  layer-by-layer every step. Use `enable_model_cpu_offload` unless you truly can't
  fit; do not stack both.
- **First call compiles/warms**: `torch.compile(pipe.unet)` (or the first
  inference) is slow; measure steady-state throughput, not the cold call. Changing
  resolution mid-run forces a recompile (graph break), erasing the gain.
- **fp16 everywhere but the VAE**: keep the UNet/text-encoder in fp16 for speed but
  run the VAE in fp32 (`upcast_vae()`) only when it overflows — upcasting the whole
  pipeline throws away the fp16 win.
- **`num_inference_steps`** dominates latency linearly; DPM++ at 20–30 steps beats
  the default 50-step scheduler for near-identical quality.

## Version-Specific Gotchas (dated, sourced)
- **diffusers 0.39.0** is the current stable release, uploaded **2026-07-03**,
  `requires_python >= 3.10`. [pypi.org/project/diffusers, retrieved 2026-07-10]
- `use_safetensors=True` prefers the safe container; repos shipping only
  `.bin`/`.ckpt` carry the CWE-502 pickle risk — treat them as untrusted.
  [huggingface.co/docs/diffusers, retrieved 2026-07-10]
- The **stock SDXL VAE overflows in fp16** (black images) — use the fp16-fix VAE
  or `upcast_vae()`; this is a persistent, version-independent SDXL gotcha.
  [huggingface.co/docs/diffusers SDXL guide, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- diffusers releases (PyPI): https://pypi.org/project/diffusers/
- diffusers docs: https://huggingface.co/docs/diffusers
- Memory / offload optimizations: https://huggingface.co/docs/diffusers/optimization/memory
- Schedulers: https://huggingface.co/docs/diffusers/using-diffusers/schedulers
- Load safetensors / safe serialization: https://huggingface.co/docs/diffusers/using-diffusers/using_safetensors
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
