# Ray CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "ray[default,train,tune,serve]"
# Start cluster: ray start --head
# Verify: python -c "import ray; ray.init(); print(ray.cluster_resources())"
```

## Claude's Common Mistakes
1. Not specifying resource requirements for actors/tasks
2. Using grid search instead of smarter HPO (ASHA, PBT)
3. Missing `train.torch.prepare_model()` for distributed training
4. Not using `train.report()` for checkpointing
5. Ignoring Ray Data for large-scale preprocessing

## Correct Patterns (2026)
```python
import ray
from ray import tune, train
from ray.train.torch import TorchTrainer
from ray.tune.schedulers import ASHAScheduler

ray.init()

# Distributed training function
def train_func(config):
    import torch
    model = MyModel(config["hidden_size"])
    model = train.torch.prepare_model(model)  # Required for DDP

    optimizer = torch.optim.AdamW(model.parameters(), lr=config["lr"])
    train_loader = train.torch.prepare_data_loader(get_dataloader())

    for epoch in range(config["epochs"]):
        for batch in train_loader:
            loss = model(batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        # Report metrics and checkpoint
        train.report({"loss": loss.item()},
                     checkpoint=train.Checkpoint.from_model(model))

# Distributed trainer
trainer = TorchTrainer(
    train_func,
    train_loop_config={"hidden_size": 256, "lr": 1e-4, "epochs": 10},
    scaling_config=train.ScalingConfig(num_workers=4, use_gpu=True),
)

# HPO with ASHA scheduler (early stopping)
tuner = tune.Tuner(
    trainer,
    param_space={"train_loop_config": {"lr": tune.loguniform(1e-5, 1e-3)}},
    tune_config=tune.TuneConfig(metric="loss", mode="min", num_samples=20,
                                 scheduler=ASHAScheduler()),
)
results = tuner.fit()
```

## Version Gotchas
- **Ray 2.x**: Use `train.torch.prepare_model()` not `ray.train.torch.prepare`
- **Tune**: ASHA scheduler for early stopping, PBT for adaptive HPO
- **Serve**: Use `@serve.deployment` decorator for model serving
- **Data**: Use `ray.data` for preprocessing at scale

## What NOT to Do
- Do NOT skip resource specifications (CPU/GPU)
- Do NOT use grid search - use ASHA or Bayesian optimization
- Do NOT forget `train.torch.prepare_model()` for distributed
- Do NOT skip checkpointing with `train.report()`
- Do NOT ignore Ray Data for large datasets
