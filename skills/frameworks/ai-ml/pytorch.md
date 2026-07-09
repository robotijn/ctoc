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

## Async / Concurrency Footguns
The `DataLoader` `num_workers` start method differs by OS and is the single most
common training-loop crash Claude generates.

```python
from torch.utils.data import DataLoader

# FOOTGUN: on Windows and macOS the default start method is 'spawn', which
# re-imports the entry module in every worker. Without the guard, worker
# processes re-run your top-level training code recursively and the run
# deadlocks / RuntimeErrors. On Linux the default is 'fork' (no re-import),
# so the same code "works on my machine" then breaks on a colleague's Mac.
if __name__ == "__main__":                 # REQUIRED on spawn (Win/macOS)
    loader = DataLoader(ds, batch_size=32, num_workers=4,
                        pin_memory=True, persistent_workers=True)
```
- `num_workers=0` runs loading in the main process (slow but deadlock-proof for
  debugging). `persistent_workers=True` keeps workers alive across epochs — but
  they will NOT see changes to the dataset object between epochs (a stale-state
  trap).
- **Gradient accumulation** must scale the loss, or the effective batch is wrong:

```python
accum = 4
for i, (x, y) in enumerate(loader):
    loss = criterion(model(x.to(device)), y.to(device)) / accum   # divide!
    loss.backward()
    if (i + 1) % accum == 0:
        optimizer.step(); optimizer.zero_grad(set_to_none=True)
```
- **Mixed precision** — `autocast` + `GradScaler` is required together for fp16.
  Skipping the scaler lets tiny gradients underflow to zero (silent NaN/stall):

```python
scaler = torch.amp.GradScaler("cuda")
with torch.autocast("cuda", dtype=torch.float16):
    loss = criterion(model(x), y)
scaler.scale(loss).backward()
scaler.step(optimizer); scaler.update()   # bf16 needs no scaler; fp16 does
```
- **`torch.compile`**: the first call *traces and compiles* — that call is slow
  and any Python-side control flow that changes shape/dtype forces a **recompile
  (graph break)**, silently erasing the speedup. Compile once, then feed
  fixed-shape batches. `mode="reduce-overhead"` uses CUDA graphs and pins input
  buffers — do not free/realloc the input tensor between steps.
- Source: pytorch.org DataLoader / AMP / torch.compile docs. See References.

## Error Handling Idioms
```python
# FOOTGUN: device mismatch — inputs on CPU, model on CUDA (or vice versa):
#   RuntimeError: Expected all tensors to be on the same device
out = model(x)                 # x still on CPU
out = model(x.to(device))      # RIGHT — move inputs to the model's device

# CUDA OOM: catch, free the cache, and retry with a smaller batch. CUDA errors
# are ASYNC — the traceback often points at the wrong line; set
# CUDA_LAUNCH_BLOCKING=1 to get an accurate stack while debugging.
try:
    out = model(batch.to(device))
except torch.cuda.OutOfMemoryError:
    torch.cuda.empty_cache()
    out = model(batch[: len(batch) // 2].to(device))

# NaN loss debugging — localize the op that produced the NaN:
with torch.autograd.set_detect_anomaly(True):   # DEV ONLY: slow, do not ship
    loss.backward()
```

## Security and Dependency Gotchas
- **Deserialization — `.pt`/`.pth` files (CWE-502)**: `torch.save` uses Python
  `pickle`, so a crafted checkpoint executes **arbitrary code the moment you
  `torch.load` it**. This is CWE-502 "Deserialization of Untrusted Data"
  (cwe.mitre.org). PyTorch **2.6 flipped `torch.load(...)` to
  `weights_only=True` by default**, restricting the unpickler to tensors/plain
  types. Do NOT flip it back to `weights_only=False` on an untrusted file:

```python
# SAFE: default on 2.6+ restricts to weights; never load untrusted with False.
state = torch.load("ckpt.pt", weights_only=True)     # explicit for < 2.6
model.load_state_dict(state)

# SAFEST for weights interchange: the safetensors format cannot execute code.
from safetensors.torch import load_file, save_file
save_file(model.state_dict(), "model.safetensors")
state = load_file("model.safetensors")               # no pickle, no exec
```
- **CUDA / driver supply coupling**: a wheel built for CUDA 12.x needs a driver
  new enough for that toolkit. Check `nvidia-smi` (driver) against
  `torch.version.cuda` (build) before filing a "CUDA not available" bug.
- Source: cwe.mitre.org/502, pytorch.org 2.6 release notes, huggingface.co
  safetensors. See References.

## Testing Conventions
```python
import torch

def test_deterministic():
    torch.manual_seed(0)                              # seed RNG for reproducibility
    torch.use_deterministic_algorithms(True)          # error on nondeterministic ops
    # ... run, assert on a fixed expected value

def test_gradients():
    # gradcheck compares analytic vs numerical gradients (needs float64 input)
    x = torch.randn(4, 4, dtype=torch.double, requires_grad=True)
    assert torch.autograd.gradcheck(my_fn, (x,))

def test_cpu_fallback():
    # CI without a GPU must still run — never hard-require CUDA in unit tests.
    device = "cuda" if torch.cuda.is_available() else "cpu"
    assert model.to(device)(sample.to(device)).shape == (1, 10)
```

## Performance Traps
- `.cuda()` hard-codes device 0 and breaks on CPU-only CI — always `.to(device)`.
- `torch.inference_mode()` is faster than `torch.no_grad()` (it also disables
  version counters / view tracking) — use it for eval; do NOT mutate its outputs
  in place afterward.
- `pin_memory=True` + `.to(device, non_blocking=True)` overlaps host→device copy
  with compute — but `non_blocking` only helps from pinned memory.
- The classic silent killer: a per-step `.item()` / `.cpu()` / `print(loss)` forces
  a device sync every iteration, serializing the whole GPU pipeline. Accumulate on
  device; sync once per log interval.

## Version-Specific Gotchas (dated, sourced)
- **PyTorch 2.13.0** is the current stable release, uploaded **2026-07-08**,
  `requires_python >= 3.10`. [pypi.org/project/torch + github.com/pytorch/pytorch
  release v2.13.0, retrieved 2026-07-09]
- **2.6**: `torch.load` default changed to `weights_only=True` (a breaking, and
  security-motivated, change) and conda distribution was dropped — install via
  pip only. [pytorch.org release notes, retrieved 2026-07-09]
- **CUDA match**: a `cuXYZ` wheel requires a driver supporting that toolkit;
  verify with `nvidia-smi` vs `torch.version.cuda`.
  [pytorch.org get-started, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- PyTorch releases (PyPI): https://pypi.org/project/torch/
- PyTorch release notes: https://github.com/pytorch/pytorch/releases
- DataLoader / multiprocessing: https://pytorch.org/docs/stable/data.html
- Automatic Mixed Precision: https://pytorch.org/docs/stable/amp.html
- torch.compile: https://pytorch.org/docs/stable/torch.compiler.html
- torch.load / weights_only: https://pytorch.org/docs/stable/generated/torch.load.html
- safetensors (safe serialization): https://huggingface.co/docs/safetensors
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
