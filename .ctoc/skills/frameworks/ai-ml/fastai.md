# fastai CTO
> Practical deep learning that makes state-of-the-art accessible.

## Commands
```bash
# Setup | Dev | Test
pip install fastai
python -c "from fastai.vision.all import *; print('OK')"
pytest tests/ -v
```

## Non-Negotiables
1. DataBlock API for flexible data loading
2. Use `lr_find()` before training
3. Use `fine_tune()` for transfer learning
4. Mixed precision enabled by default
5. Use callbacks for training control
6. Export with `learn.export()` for deployment

## Red Lines
- Manual training loops when Learner works
- Skipping learning rate finder
- Not using transfer learning when applicable
- Training from scratch for standard tasks
- Ignoring data augmentation
- Not using fastai's built-in transforms

## Pattern: Production Training Pipeline
```python
from fastai.vision.all import *
from fastai.callback.wandb import WandbCallback

# DataBlock for flexible data loading
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
dls.show_batch(max_n=9)

# Create learner with pretrained model
learn = vision_learner(
    dls,
    resnet50,
    metrics=[accuracy, F1Score()],
    cbs=[WandbCallback(), SaveModelCallback()]
)

# Find optimal learning rate
learn.lr_find()

# Fine-tune with discriminative learning rates
learn.fine_tune(10, base_lr=1e-3, freeze_epochs=3)

# Evaluate
interp = ClassificationInterpretation.from_learner(learn)
interp.plot_confusion_matrix()
interp.plot_top_losses(9)

# Export for production
learn.export("model.pkl")

# Load and predict
learn_inf = load_learner("model.pkl")
pred, pred_idx, probs = learn_inf.predict(img)
```

## Integrates With
- **Data**: PIL, OpenCV, pandas
- **Training**: PyTorch, timm models
- **Tracking**: W&B, TensorBoard
- **Deployment**: ONNX, TorchScript, Gradio

## Common Errors
| Error | Fix |
|-------|-----|
| `DataBlock error` | Verify get_items returns valid paths |
| `CUDA out of memory` | Reduce batch size, use mixed precision |
| `Label mismatch` | Check get_y returns correct labels |
| `Transform error` | Ensure transforms match data type |

## Prod Ready
- [ ] DataBlock tested with show_batch()
- [ ] Learning rate found with lr_find()
- [ ] Fine-tuning used for transfer learning
- [ ] Interpretation plots reviewed
- [ ] Model exported with learn.export()
- [ ] Inference tested with load_learner()
