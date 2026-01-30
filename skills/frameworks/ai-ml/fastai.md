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
