# Weights & Biases CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install wandb
wandb login  # Authenticate with API key
# Verify: python -c "import wandb; print(wandb.__version__)"
```

## Claude's Common Mistakes
1. Not passing config to `wandb.init()` - hyperparameters lost
2. Missing `wandb.finish()` causing zombie runs
3. Using manual logging when integration callbacks exist
4. Not using Artifacts for dataset/model versioning
5. Forgetting Tables for data visualization

## Correct Patterns (2026)
```python
import wandb
from wandb import AlertLevel

# Initialize with full config
run = wandb.init(
    project="production-model",
    name="experiment-v1",
    config={
        "learning_rate": 1e-4,
        "batch_size": 32,
        "epochs": 10,
        "architecture": "transformer",
    },
    tags=["production", "v1"],
)

# Access config (supports hyperparameter sweeps)
lr = wandb.config.learning_rate

# Training loop with logging
for epoch in range(wandb.config.epochs):
    train_loss = train_epoch(model, loader)
    val_loss, val_acc = validate(model, val_loader)

    wandb.log({
        "train/loss": train_loss,
        "val/loss": val_loss,
        "val/accuracy": val_acc,
        "epoch": epoch,
    })

# Save model as versioned artifact
artifact = wandb.Artifact("model", type="model", metadata={"accuracy": val_acc})
artifact.add_file("model.pt")
wandb.log_artifact(artifact)

# Alert on completion
wandb.alert(title="Training Complete", text=f"Accuracy: {val_acc:.4f}", level=AlertLevel.INFO)

wandb.finish()  # Always call finish
```

## Version Gotchas
- **Sweeps**: Use `wandb.config` for hyperparameter access
- **Artifacts**: Version datasets and models separately
- **Tables**: Use for data debugging and visualization
- **Integrations**: Use callbacks for PyTorch Lightning, Keras, etc.

## What NOT to Do
- Do NOT skip `wandb.init(config=...)` - loses hyperparameters
- Do NOT forget `wandb.finish()` at end of training
- Do NOT manually log when framework callbacks exist
- Do NOT skip Artifacts for reproducibility
- Do NOT ignore Tables for data debugging
