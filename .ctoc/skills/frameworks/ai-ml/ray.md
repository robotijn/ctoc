# Ray CTO
> Unified framework for distributed ML training, tuning, and serving.

## Commands
```bash
# Setup | Dev | Test
pip install "ray[default,train,tune,serve]"
ray start --head --port=6379
ray status && python -c "import ray; ray.init(); print(ray.cluster_resources())"
```

## Non-Negotiables
1. Ray Tune for hyperparameter optimization
2. Ray Train for distributed training
3. Ray Serve for model deployment
4. Ray Data for preprocessing at scale
5. Use resource specifications for GPU/CPU
6. Implement checkpointing for fault tolerance

## Red Lines
- Manual distributed training when Ray Train works
- Grid search instead of smarter HPO
- Not specifying resource requirements
- Ignoring fault tolerance
- Single-node when cluster available
- No checkpointing for long runs

## Pattern: Distributed Training Pipeline
```python
import ray
from ray import tune, train
from ray.train.torch import TorchTrainer
from ray.tune.schedulers import ASHAScheduler

ray.init()

# Distributed training function
def train_func(config):
    import torch
    from torch.nn.parallel import DistributedDataParallel

    model = MyModel(config["hidden_size"])
    model = train.torch.prepare_model(model)

    optimizer = torch.optim.AdamW(model.parameters(), lr=config["lr"])
    train_loader = train.torch.prepare_data_loader(get_dataloader())

    for epoch in range(config["epochs"]):
        for batch in train_loader:
            loss = model(batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        # Report metrics and checkpoint
        train.report({"loss": loss.item()}, checkpoint=train.Checkpoint.from_model(model))

# Configure distributed training
trainer = TorchTrainer(
    train_func,
    train_loop_config={"hidden_size": 256, "lr": 1e-4, "epochs": 10},
    scaling_config=train.ScalingConfig(num_workers=4, use_gpu=True),
)

# Hyperparameter tuning with Ray Tune
tuner = tune.Tuner(
    trainer,
    param_space={
        "train_loop_config": {
            "hidden_size": tune.choice([128, 256, 512]),
            "lr": tune.loguniform(1e-5, 1e-3),
        }
    },
    tune_config=tune.TuneConfig(
        metric="loss",
        mode="min",
        num_samples=20,
        scheduler=ASHAScheduler(),
    ),
)

results = tuner.fit()
best_result = results.get_best_result()
print(f"Best config: {best_result.config}")
```

## Integrates With
- **Training**: PyTorch, TensorFlow, JAX, XGBoost
- **HPO**: Optuna, HyperOpt via Ray Tune
- **Serving**: FastAPI, Gradio via Ray Serve
- **Orchestration**: Kubernetes, AWS, GCP

## Common Errors
| Error | Fix |
|-------|-----|
| `RayActorError` | Check resource availability, increase memory |
| `ObjectStoreFullError` | Increase object store size, use spilling |
| `GPU not found` | Set `use_gpu=True`, check CUDA installation |
| `Checkpoint not found` | Verify checkpoint path, check storage |

## Prod Ready
- [ ] Cluster configured and healthy
- [ ] Resources specified for all actors
- [ ] Checkpointing enabled for fault tolerance
- [ ] Hyperparameters tuned with Ray Tune
- [ ] Models deployed with Ray Serve
- [ ] Monitoring and logging configured
