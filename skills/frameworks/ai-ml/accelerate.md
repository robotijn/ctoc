# Accelerate CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install accelerate
accelerate config  # Interactive setup - run this first!
# Verify: accelerate test
```

## Claude's Common Mistakes
1. Manual `.to(device)` instead of using `accelerator.prepare()`
2. Missing `accelerator.accumulate()` context manager
3. Not using `accelerate config` for initial setup
4. Forgetting to unwrap model before saving
5. Using `loss.backward()` instead of `accelerator.backward()`

## Correct Patterns (2026)
```python
from accelerate import Accelerator, DeepSpeedPlugin
from accelerate.utils import set_seed
import torch

# Configure with DeepSpeed (optional)
deepspeed_plugin = DeepSpeedPlugin(zero_stage=2, gradient_accumulation_steps=4)

accelerator = Accelerator(
    mixed_precision="bf16",
    gradient_accumulation_steps=4,
    deepspeed_plugin=deepspeed_plugin,
    log_with="wandb",
)

set_seed(42)

# Prepare ALL training objects (no manual .to(device)!)
model, optimizer, train_loader, scheduler = accelerator.prepare(
    model, optimizer, train_loader, scheduler
)

# Training loop with gradient accumulation
for epoch in range(num_epochs):
    model.train()
    for batch in train_loader:
        with accelerator.accumulate(model):  # Handles accumulation
            outputs = model(**batch)
            loss = outputs.loss
            accelerator.backward(loss)  # Not loss.backward()!

            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()

        accelerator.log({"train_loss": loss.item()}, step=step)

    # Checkpoint
    accelerator.save_state(f"checkpoint-{epoch}")

# Save model - MUST unwrap first
unwrapped = accelerator.unwrap_model(model)
accelerator.save_model(unwrapped, "final_model")
```

## Version Gotchas
- **prepare()**: Must include ALL objects (model, optimizer, dataloader, scheduler)
- **accumulate()**: Required for gradient accumulation to work correctly
- **unwrap_model()**: Required before saving to get original model
- **DeepSpeed**: Use DeepSpeedPlugin for ZeRO integration

## What NOT to Do
- Do NOT use manual `.to(device)` - use `accelerator.prepare()`
- Do NOT use `loss.backward()` - use `accelerator.backward(loss)`
- Do NOT skip `accelerate config` initial setup
- Do NOT forget `accelerator.accumulate()` context
- Do NOT save without `accelerator.unwrap_model()`

## Launch & Gradient-Accumulation Footguns
The two most common Claude mistakes are (a) running a distributed script with
`python train.py` instead of `accelerate launch`, and (b) hand-rolling gradient
accumulation while `Accelerator(gradient_accumulation_steps=...)` is *also* set —
which double-divides the loss and silently halves the effective batch.

```bash
# FOOTGUN: `python train.py` spawns ONE process — your 8-GPU / FSDP / DeepSpeed
# config in ~/.cache/huggingface/accelerate/default_config.yaml is IGNORED.
python train.py                                   # single process, no distribution

# RIGHT: accelerate launch reads the config and spawns the right topology.
accelerate launch --num_processes 8 train.py      # or: accelerate launch train.py
accelerate config                                 # write the config once, first
```

```python
from accelerate import Accelerator

# EFFECTIVE BATCH = per_device_batch * gradient_accumulation_steps * num_processes.
# If you set gradient_accumulation_steps here you MUST drive the loop with
# accelerator.accumulate(model) — it gates backward()/step() to every Nth micro
# batch AND scales the loss. Do NOT also divide the loss by N yourself.
accelerator = Accelerator(gradient_accumulation_steps=4)
model, optimizer, loader = accelerator.prepare(model, optimizer, loader)

for batch in loader:
    with accelerator.accumulate(model):           # scaling + sync handled here
        loss = model(**batch).loss                # do NOT do loss / 4 as well
        accelerator.backward(loss)                # not loss.backward()
        optimizer.step(); optimizer.zero_grad()
```
- `accelerator.accumulate()` also disables cross-process gradient sync on the
  non-boundary micro-steps (via `no_sync`), which is where its speedup comes
  from — a manual accumulation loop loses that and syncs every micro-step.
- Ordering-sensitive I/O (downloading a dataset, building a tokenizer cache)
  must run under `with accelerator.main_process_first():` so rank 0 does the
  work once and the others wait — otherwise N processes race the same file.
- Source: huggingface.co/docs/accelerate gradient-accumulation & launch docs.
  See References.

## Distributed: FSDP / DeepSpeed / device_map
```python
from accelerate import Accelerator, FullyShardedDataParallelPlugin, DeepSpeedPlugin

# FSDP shards params/grads/optimizer-state across ranks (fits a model that does
# not fit on one GPU). DeepSpeed ZeRO-3 is the equivalent on the DeepSpeed side.
# Pick ONE — configuring both fights over the same parameters.
accelerator = Accelerator(
    fsdp_plugin=FullyShardedDataParallelPlugin(),   # OR deepspeed_plugin=...
    mixed_precision="bf16",                          # bf16 needs no loss scaler
)
```
- `device_map="auto"` (a `transformers`/`accelerate` inference feature) spreads a
  model across GPUs **and CPU/disk** when it does not fit — great for inference,
  but it is INCOMPATIBLE with launching the same model under DDP/FSDP for
  training. Use `device_map` for inference OR a distributed plugin for training,
  never both on the same model.
- `mixed_precision="fp16"` needs a gradient scaler (Accelerate wires it in
  automatically once you use `accelerator.backward`); `bf16` does not.
- Source: huggingface.co/docs/accelerate FSDP / DeepSpeed usage guides. See References.

## Error Handling Idioms
```python
# FOOTGUN: unwrap the model before saving, or you serialize the DDP/FSDP wrapper
# and the checkpoint fails to load into a plain nn.Module later.
unwrapped = accelerator.unwrap_model(model)
accelerator.save_model(unwrapped, "out")

# Gather metrics ACROSS processes before logging, or rank 0 reports only its
# own shard of the batch (a silently wrong number, not a crash):
losses = accelerator.gather_for_metrics(loss.detach())   # not just loss.item()
if accelerator.is_main_process:
    print(losses.mean().item())

# Guard file writes to rank 0 only — every rank writing the same path corrupts it:
if accelerator.is_main_process:
    tokenizer.save_pretrained("out")
accelerator.wait_for_everyone()                          # barrier before proceeding
```

## Security and Dependency Gotchas
- **Checkpoint / state deserialization (CWE-502)**: `accelerator.save_state`/
  `load_state` and any `torch.load` under the hood use Python `pickle`; loading
  an untrusted checkpoint executes arbitrary code. This is CWE-502
  "Deserialization of Untrusted Data" (cwe.mitre.org/data/definitions/502.html).
  Only `load_state` from checkpoints you produced; prefer safetensors for weight
  interchange.
- **`trust_remote_code=True`** on a model pulled through `device_map="auto"` runs
  arbitrary repo code at load time — never enable it for an unvetted hub repo
  (this is the CWE-94 code-injection surface the peft/unsloth guides also flag).
- Source: cwe.mitre.org/502, huggingface.co/docs/accelerate checkpointing. See References.

## Testing Conventions
```python
# CI usually has no multi-GPU box — test the SINGLE-process path and assert the
# accumulation math, not the distributed topology.
from accelerate import Accelerator

def test_effective_batch_math():
    acc = Accelerator(gradient_accumulation_steps=4)
    # effective batch = per_device(2) * accum(4) * num_processes(1) == 8
    assert acc.gradient_accumulation_steps == 4
    assert acc.num_processes == 1

def test_cpu_fallback():
    # never hard-require CUDA in unit tests; Accelerate runs on CPU for logic tests.
    acc = Accelerator(cpu=True)
    assert acc.device.type == "cpu"
```

## Performance Traps
- A per-step `loss.item()` / `print(loss)` forces a device sync every iteration
  and serializes the pipeline — accumulate on device, gather once per log interval.
- `find_unused_parameters=True` (DDP) is a correctness crutch that costs a full
  extra backward pass; fix the model graph instead of leaving it on.
- Reusing `device_map="auto"` for training silently offloads layers to CPU/disk,
  turning each step into a PCIe round-trip — use it only for inference.

## Version-Specific Gotchas (dated, sourced)
- **accelerate 1.14.0** is the current stable release on PyPI, uploaded
  **2026-06-11**, `requires_python >= 3.10.0`.
  [pypi.org/project/accelerate, retrieved 2026-07-10]
- The 1.x line stabilized `accelerate launch`, the FSDP/DeepSpeed plugins, and
  `gather_for_metrics`; older 0.x tutorials that call `accelerator.gather` for
  logging under-report on the last (padded) batch — use `gather_for_metrics`.
  [huggingface.co/docs/accelerate, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- accelerate releases (PyPI): https://pypi.org/project/accelerate/
- accelerate docs (launch, config): https://huggingface.co/docs/accelerate/basic_tutorials/launch
- Gradient accumulation: https://huggingface.co/docs/accelerate/usage_guides/gradient_accumulation
- FSDP usage: https://huggingface.co/docs/accelerate/usage_guides/fsdp
- DeepSpeed usage: https://huggingface.co/docs/accelerate/usage_guides/deepspeed
- Checkpointing: https://huggingface.co/docs/accelerate/usage_guides/checkpoint
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
