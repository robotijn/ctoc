# Weights & Biases CTO
> ML experiment tracking, visualization, and collaboration platform.

## Commands
```bash
# Setup | Dev | Test
pip install wandb
wandb login
wandb sweep sweep.yaml && wandb agent SWEEP_ID
```

## Non-Negotiables
1. Track all experiments with wandb.init()
2. Log hyperparameters with wandb.config
3. Use Sweeps for hyperparameter search
4. Artifacts for dataset and model versioning
5. Tables for data visualization
6. Alerts for run failures

## Red Lines
- Training without experiment tracking
- Manual hyperparameter search
- No artifact versioning for datasets
- Ignoring run comparisons
- Missing config logging
- Not using Tables for data debugging

## Pattern: Production Experiment Tracking
```python
import wandb
from wandb import AlertLevel

# Initialize run with config
wandb.init(
    project="production-model",
    name="transformer-v2",
    config={
        "learning_rate": 1e-4,
        "batch_size": 32,
        "epochs": 10,
        "architecture": "transformer",
    },
    tags=["production", "transformer"],
)

# Track training
for epoch in range(wandb.config.epochs):
    train_loss = train_epoch(model, train_loader)
    val_loss, val_acc = validate(model, val_loader)

    wandb.log({
        "train/loss": train_loss,
        "val/loss": val_loss,
        "val/accuracy": val_acc,
        "epoch": epoch,
    })

    # Log sample predictions as Table
    if epoch % 5 == 0:
        table = wandb.Table(columns=["input", "prediction", "label"])
        for inp, pred, label in samples:
            table.add_data(inp, pred, label)
        wandb.log({"predictions": table})

# Save model as artifact
artifact = wandb.Artifact("model", type="model", metadata={"accuracy": val_acc})
artifact.add_file("model.pt")
wandb.log_artifact(artifact)

# Alert on completion
wandb.alert(
    title="Training Complete",
    text=f"Final accuracy: {val_acc:.4f}",
    level=AlertLevel.INFO,
)

wandb.finish()
```

## Integrates With
- **Training**: PyTorch, TensorFlow, Keras, JAX
- **HPO**: Sweeps, Optuna, Ray Tune
- **Deployment**: Model Registry, CI/CD
- **Collaboration**: Reports, Teams

## Common Errors
| Error | Fix |
|-------|-----|
| `wandb.errors.CommError` | Check internet connection, verify API key |
| `Run already finished` | Call wandb.init() for new run |
| `Artifact not found` | Check artifact name and version, verify project |
| `Config not logged` | Pass config to wandb.init() or use wandb.config |

## Prod Ready
- [ ] All runs tracked with wandb.init()
- [ ] Hyperparameters logged via config
- [ ] Sweeps configured for HPO
- [ ] Models saved as versioned artifacts
- [ ] Tables used for data debugging
- [ ] Alerts configured for failures
