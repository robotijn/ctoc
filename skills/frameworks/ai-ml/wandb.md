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

## Logging Footguns
The two most common wandb bugs Claude generates are **step misalignment** and
**broken run resumption** — both silently corrupt the dashboard rather than crash.

```python
import wandb

# FOOTGUN: wandb.log auto-increments an INTERNAL step on every call. If you also
# pass your own `step=` sometimes and not others, or log two metrics in separate
# calls meaning the "same" step, the x-axis desyncs and charts interleave wrong.
# RIGHT: log everything for one step in ONE call, and pin the axis you care about.
wandb.log({"train/loss": tl, "val/loss": vl, "epoch": ep})     # one call per step

# You CANNOT log to an EARLIER step than one already committed: wandb.log with a
# step lower than the current internal step is dropped with a warning. Use a
# monotonic global step, or define a custom x-axis:
wandb.define_metric("val/loss", step_metric="epoch")           # chart vs epoch
```
- **`wandb.log` commit semantics**: by default each `log()` **commits** the current
  step and advances. To accumulate several partial logs into one step, use
  `wandb.log({...}, commit=False)` for the intermediate ones and commit on the last.
  Mixing committing and non-committing logs carelessly is the classic "half my
  metrics are one step ahead" bug. [docs.wandb.ai/guides/track/log/, retrieved 2026-07-10]
- **Run resumption / `id`**: to resume a crashed run you MUST reuse its `id` and pass
  `resume="allow"`; a fresh `wandb.init()` without the same `id` creates a NEW run and
  the old one stays `crashed`/`running` forever. `wandb.init(id="abc123",
  resume="must")` errors loudly if the run does not exist — prefer `must` in CI.
  [docs.wandb.ai/ref/python/init/, retrieved 2026-07-10]
- **Missing `wandb.finish()`**: in notebooks / multi-run scripts, not calling
  `finish()` leaves the process attached to the old run, and the next `init()` may
  log into it. Always `finish()` (or use `with wandb.init(...) as run:`).

## Artifacts, Lineage & Reproducibility
```python
import wandb

run = wandb.init(project="prod-model", job_type="train")

# Consuming an artifact with use_artifact RECORDS input lineage automatically —
# the produced model is linked to the exact dataset version it trained on.
dataset = run.use_artifact("dataset:v3")          # input edge in the lineage DAG
data_dir = dataset.download()

model_art = wandb.Artifact("model", type="model", metadata={"val_acc": val_acc})
model_art.add_file("model.pt")
run.log_artifact(model_art)                        # output edge; versioned :v0,:v1...
```
- **Lineage only exists if you go through `use_artifact` / `log_artifact`.** Reading
  a file straight off disk (bypassing `use_artifact`) breaks the graph — the model
  can no longer be traced to its training data version. Always route data through
  artifacts you can pin by `:vN` or alias (`:latest`, `:production`).
- **`add_file` vs `add_dir`**: `add_dir` on a large checkpoint tree re-hashes every
  file each version — expensive and slow. Add only what changed; use `add_reference`
  for data that already lives in S3/GCS to avoid duplicating bytes into wandb.

## Error Handling Idioms
```python
import wandb

# FOOTGUN: a training crash before wandb.finish() leaves the run in state
# "running"/"crashed". Wrap so the run is marked failed and flushed on error.
run = wandb.init(project="prod-model", resume="allow", id="run-42")
try:
    train(model)
except Exception as e:
    wandb.alert(title="Run failed", text=str(e))   # notify, then propagate
    raise
finally:
    wandb.finish()                                  # always flush + close the run

# Never let telemetry take down training: if the wandb backend is unreachable, do
# NOT crash the job — run offline and sync later (see below).
```

## Security and Dependency Gotchas
- **API key in code / CI logs is hardcoded credentials (CWE-798)**: putting your
  `WANDB_API_KEY` in source, a committed `.env`, or an echoed CI variable leaks a
  credential that grants full read/write to your team's projects and artifacts. This
  is CWE-798 "Use of Hard-coded Credentials". Inject it via a secret store / masked
  CI variable and read from the environment — never literal in code.

```python
import os, wandb

# WRONG — credential hardcoded, ends up in git history and CI logs:
#   wandb.login(key="wandb-abcd1234...")            # CWE-798
# RIGHT — read from an injected secret; wandb picks up WANDB_API_KEY automatically:
assert os.environ.get("WANDB_API_KEY"), "set WANDB_API_KEY via a secret, not code"
wandb.login()                                       # uses env var; nothing in source
```
- **Team / project access scope**: an artifact or run logged to a shared entity is
  visible to everyone in that team. Do not log PII, raw customer data, or secrets
  into configs, tables, or media — they are stored server-side and shared by scope.
  Use a private entity for sensitive work.
- **`WANDB_API_KEY` / env-var handling** is documented; keep the key in a secret
  manager. [docs.wandb.ai/guides/track/environment-variables/; cwe.mitre.org/798,
  retrieved 2026-07-10]

## Cost, Data & Offline Sync
```bash
# FOOTGUN: air-gapped or flaky-network training that logs online blocks/retries on
# every wandb.log. Run OFFLINE, then sync the whole run directory afterwards.
export WANDB_MODE=offline        # buffers to ./wandb/ locally, zero network calls
# ... run training ...
wandb sync ./wandb/latest-run    # upload once connectivity is back
```
- **Large-media logging cost**: logging full-resolution images/video/audio every
  step balloons storage and upload time. Log a sampled subset (every N steps), or
  downscale before `wandb.Image(...)`. Tables with tens of thousands of rows are slow
  to render and expensive to store — sample.
- **`WANDB_MODE=offline` vs `disabled`**: `offline` still records everything locally
  for later `wandb sync`; `disabled` drops all logging (use only for unit tests).
  [docs.wandb.ai/guides/track/environment-variables/, retrieved 2026-07-10]

## Testing / CI Conventions
```python
import os, wandb

def test_training_logs_metrics(monkeypatch):
    # Never hit the wandb backend in unit tests — disable logging entirely.
    monkeypatch.setenv("WANDB_MODE", "disabled")
    run = wandb.init(project="unit-test")
    wandb.log({"loss": 0.1})
    # In disabled mode calls are no-ops but must not raise — asserts the wiring holds.
    assert run is not None
    wandb.finish()
```
- For integration tests that DO exercise the backend, use `WANDB_MODE=offline` and
  assert the local `./wandb/` run directory was created, rather than asserting on a
  live server response.

## Version-Specific Gotchas (dated, sourced)
- **wandb 0.28.0** is the current stable release, uploaded **2026-06-23**,
  `requires_python >= 3.10`. [pypi.org/pypi/wandb/json, retrieved 2026-07-10]
- **Run resumption** requires the original run `id` + `resume="allow"|"must"`; a bare
  `init()` starts a new run. [docs.wandb.ai/ref/python/init/, retrieved 2026-07-10]
- **`wandb.log` step semantics**: internal step auto-increments and cannot go
  backwards; define a custom `step_metric` for non-monotonic x-axes.
  [docs.wandb.ai/guides/track/log/, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- wandb releases (PyPI): https://pypi.org/pypi/wandb/json
- wandb.init / run resumption: https://docs.wandb.ai/ref/python/init/
- wandb.log (step & commit semantics): https://docs.wandb.ai/guides/track/log/
- Artifacts (versioning & lineage): https://docs.wandb.ai/guides/artifacts/
- Environment variables (WANDB_API_KEY, WANDB_MODE offline): https://docs.wandb.ai/guides/track/environment-variables/
- CWE-798 (Use of Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
