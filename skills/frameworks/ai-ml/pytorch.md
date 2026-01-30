# PyTorch CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Requires Python 3.10-3.14. CUDA 12.6 recommended for GPU.
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
# Verify: python -c "import torch; print(torch.cuda.is_available())"
```

## Claude's Common Mistakes
1. Using deprecated `pip install torch` without CUDA index URL
2. Suggesting `.cuda()` instead of portable `.to(device)`
3. Missing `torch.inference_mode()` for evaluation (faster than `no_grad`)
4. Using old `torch.distributed.launch` instead of `torchrun`
5. Not enabling `torch.compile()` for 2x speedup (PyTorch 2.0+)

## Correct Patterns (2026)
```python
import torch
import lightning as L

# Device-agnostic code
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Production model with compile
model = torch.compile(MyModel()).to(device)

# Inference with proper context
model.eval()
with torch.inference_mode():
    output = model(input.to(device))

# DataLoader best practices
loader = DataLoader(dataset, batch_size=32, num_workers=4,
                    pin_memory=True, persistent_workers=True)
```

## Version Gotchas
- **v2.6**: `torch.load` now defaults to `weights_only=True` (breaking change)
- **v2.6**: Conda no longer supported - use pip only
- **v2.5+**: `torch.compile` supports Python 3.13
- **With CUDA**: Must match driver version - use `nvidia-smi` to check

## What NOT to Do
- Do NOT use `model.cuda()` - use `model.to(device)` for portability
- Do NOT use `torch.no_grad()` for inference - use `torch.inference_mode()`
- Do NOT skip `model.eval()` before inference
- Do NOT use `pickle` for saving - use `torch.save` with safetensors
- Do NOT ignore gradient accumulation for large batch training
