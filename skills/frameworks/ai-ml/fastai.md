# fastai CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install fastai
# Verify: python -c "from fastai.vision.all import *; print('OK')"
```

## Claude's Common Mistakes
1. Skipping `lr_find()` before training
2. Not using `fine_tune()` for transfer learning
3. Manual training loops when `Learner.fit()` works
4. Missing DataBlock validation with `show_batch()`
5. Using `learn.save()` instead of `learn.export()` for deployment

## Correct Patterns (2026)
```python
from fastai.vision.all import *

# DataBlock with proper transforms
dblock = DataBlock(
    blocks=(ImageBlock, CategoryBlock),
    get_items=get_image_files,
    splitter=RandomSplitter(valid_pct=0.2, seed=42),
    get_y=parent_label,
    item_tfms=Resize(460),
    batch_tfms=[
        *aug_transforms(size=224, min_scale=0.75),
        Normalize.from_stats(*imagenet_stats)
    ]
)

dls = dblock.dataloaders(path, bs=64)
dls.show_batch(max_n=9)  # Always validate DataBlock

# Create learner with pretrained model
learn = vision_learner(dls, resnet50, metrics=[accuracy, F1Score()])

# ALWAYS find learning rate first
learn.lr_find()

# Fine-tune with discriminative learning rates
learn.fine_tune(10, base_lr=1e-3, freeze_epochs=3)

# Interpret results
interp = ClassificationInterpretation.from_learner(learn)
interp.plot_confusion_matrix()
interp.plot_top_losses(9)

# Export for production (not save!)
learn.export("model.pkl")

# Load and predict
learn_inf = load_learner("model.pkl")
pred, idx, probs = learn_inf.predict(img)
```

## Version Gotchas
- **export vs save**: `export()` for deployment, `save()` for training checkpoints
- **lr_find()**: New `valley` suggestion - use `learn.lr_find().valley`
- **fine_tune()**: Automatically freezes then unfreezes layers
- **timm models**: Use `timm.create_model()` for more architectures

## What NOT to Do
- Do NOT skip `lr_find()` before training
- Do NOT use `learn.save()` for deployment - use `learn.export()`
- Do NOT skip `show_batch()` to validate DataBlock
- Do NOT write manual training loops
- Do NOT forget to use transfer learning when applicable

## Learner & DataBlock Footguns
fastai's power (and its trap) is the `DataBlock` → `DataLoaders` → `Learner`
pipeline: transforms run at two different times, and the wrong slot silently
corrupts training.

```python
from fastai.vision.all import *

# FOOTGUN — item_tfms run on CPU per-item (BEFORE batching); batch_tfms run on
# GPU per-batch (AFTER). Putting Resize in batch_tfms fails because items in a
# batch have different sizes and cannot be collated → RuntimeError at first batch.
dblock = DataBlock(
    blocks=(ImageBlock, CategoryBlock),
    get_items=get_image_files,
    splitter=RandomSplitter(valid_pct=0.2, seed=42),   # seed → reproducible split
    get_y=parent_label,
    item_tfms=Resize(460),                              # CPU, per-item (size FIRST)
    batch_tfms=aug_transforms(size=224),                # GPU, per-batch (aug AFTER)
)
dls = dblock.dataloaders(path, bs=64)
dls.show_batch(max_n=9)          # ALWAYS eyeball — silently mislabeled data is common

# fine_tune vs fit_one_cycle — they are NOT interchangeable:
learn = vision_learner(dls, resnet50, metrics=accuracy)
learn.fine_tune(5, base_lr=1e-3, freeze_epochs=1)   # TRANSFER: freeze→train head,
                                                    # then unfreeze→train all
# learn.fit_one_cycle(5, 1e-3)                      # FROM SCRATCH: trains ALL layers
                                                    # from the start (no freeze)
```
- `lr_find()` returns suggestions — use `learn.lr_find().valley` for a concrete lr
  rather than eyeballing the plot.
- Source: docs.fast.ai DataBlock + Learner. See References.

## Reproducibility & Leakage
```python
from fastai.vision.all import set_seed

set_seed(42, reproducible=True)   # seeds torch/numpy/random + cudnn determinism

# LEAKAGE TRAP — normalization stats or a scaler computed over the WHOLE dataset
# leak validation info into training. fastai's Normalize.from_stats with the
# built-in DataBlock computes stats correctly per-split; do not precompute stats
# on the full set. Likewise a RandomSplitter WITHOUT a fixed seed reshuffles the
# valid set every run, so your "improvement" is just a different split.
```
- Near-duplicate images across the train/valid boundary inflate accuracy — dedup
  before splitting; a per-group `splitter` keeps a subject in one split only.

## Error Handling Idioms
```python
# "Your generator/transform gave ... expected ..." → an item_tfm returns the wrong
#   type; run dblock.summary(path) to see exactly where the pipeline breaks.
# CUDA OOM in fit → lower bs, or use learn.to_fp16() (mixed precision) to halve
#   activation memory.
dblock.summary(path)          # prints each transform's output — the debug tool
learn = learn.to_fp16()       # mixed precision; learn.to_fp32() to revert
```

## Security & Dependency Gotchas
- **`load_learner` / `torch.load` untrusted-pickle boundary (CWE-502)**:
  `learn.export()` writes a **pickled** full pipeline (model + transforms +
  Python callables), and `load_learner(...)` unpickles it — executing
  **arbitrary code the moment you load it**. This is CWE-502 "Deserialization of
  Untrusted Data" (cwe.mitre.org). fastai's `load_learner` calls `torch.load`
  under the hood; PyTorch 2.6+ defaults `torch.load(weights_only=True)`, but a
  full Learner export needs the FULL unpickler, so `load_learner` cannot benefit
  from that guard. **Never `load_learner` a `.pkl` from an untrusted source.**

```python
# TRUSTED source only — this unpickles arbitrary Python:
learn = load_learner("my_own_trusted_model.pkl")

# For weight interchange across a trust boundary, export just the state_dict and
# reload it into an identically-built model (or use safetensors), not the pickle:
import torch
torch.save(learn.model.state_dict(), "weights.pth")     # weights only
learn.model.load_state_dict(torch.load("weights.pth", weights_only=True))
```
- **torch coupling**: fastai pins `torch<3,>=1.10` and `torchvision>=0.11`. A
  torch/torchvision skew is the most common install break — match them per the
  PyTorch index.
- Source: cwe.mitre.org/502, docs.fast.ai learner export, pytorch.org torch.load
  weights_only. See References.

## Testing Conventions
```python
from fastai.vision.all import *

def test_dls_shapes():
    dls = get_test_dls()                      # a tiny fixture DataBlock
    xb, yb = dls.one_batch()
    assert xb.shape[0] == dls.bs              # batch collation works

def test_reproducible_split():
    set_seed(0, reproducible=True)
    a = RandomSplitter(0.2, seed=42)(range(100))
    set_seed(0, reproducible=True)
    b = RandomSplitter(0.2, seed=42)(range(100))
    assert list(a[1]) == list(b[1])           # seeded split is stable
```

## Performance Traps
- `num_workers` on the `DataLoaders` follows torch's spawn/fork OS split — on
  macOS/Windows guard the entry point with `if __name__ == "__main__":`.
- `learn.to_fp16()` (mixed precision) roughly halves memory and speeds training on
  modern GPUs; combine with a larger `bs`.
- `dls.show_batch()` decodes on CPU — do not leave it in a training loop.

## Version-Specific Gotchas (dated, sourced)
- **fastai 2.8.7** is the current stable release, `requires_python >= 3.10`,
  uploaded **2026-02-14**. [pypi.org/pypi/fastai JSON API, retrieved 2026-07-10]
- fastai depends on **`torch<3,>=1.10`** and **`torchvision>=0.11`** — a
  torch/torchvision version skew is the most common install failure.
  [pypi.org/pypi/fastai requires_dist, retrieved 2026-07-10]
- `learn.export()` produces a **pickle**; `load_learner` runs the full unpickler,
  so it does not get PyTorch 2.6's `weights_only=True` protection.
  [docs.fast.ai learner, pytorch.org torch.load, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- fastai releases (PyPI): https://pypi.org/pypi/fastai/json
- fastai docs (DataBlock / Learner / export): https://docs.fast.ai/
- torch.load / weights_only: https://pytorch.org/docs/stable/generated/torch.load.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
