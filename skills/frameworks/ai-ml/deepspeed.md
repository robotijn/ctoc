# DeepSpeed CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install deepspeed
# Verify system: ds_report
# Run: deepspeed --num_gpus=4 train.py --deepspeed_config ds_config.json
```

## Claude's Common Mistakes
1. Using ZeRO-3 for small models (overkill, use ZeRO-1/2)
2. Not enabling gradient checkpointing for large models
3. Missing CPU offloading when GPU OOM
4. Wrong ZeRO stage for model size
5. Not using DeepSpeed's fused optimizers

## Correct Patterns (2026)
```python
import deepspeed
from transformers import AutoModelForCausalLM

# ZeRO-3 config with offloading (for large models)
ds_config = {
    "train_batch_size": 32,
    "gradient_accumulation_steps": 8,
    "fp16": {"enabled": True, "loss_scale_window": 100},
    "zero_optimization": {
        "stage": 3,
        "offload_optimizer": {"device": "cpu", "pin_memory": True},
        "offload_param": {"device": "cpu", "pin_memory": True},
        "overlap_comm": True,
        "contiguous_gradients": True,
    },
    "gradient_clipping": 1.0,
    "activation_checkpointing": {
        "partition_activations": True,
        "cpu_checkpointing": True,
    },
    "optimizer": {
        "type": "AdamW",
        "params": {"lr": 1e-5, "betas": [0.9, 0.999]}
    }
}

# Initialize with DeepSpeed
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
model.gradient_checkpointing_enable()

model_engine, optimizer, _, _ = deepspeed.initialize(
    model=model, config=ds_config
)

# Training loop
for batch in dataloader:
    outputs = model_engine(batch["input_ids"], labels=batch["labels"])
    model_engine.backward(outputs.loss)
    model_engine.step()

model_engine.save_checkpoint("checkpoints/", tag="final")
```

## Version Gotchas
- **ZeRO Stage**: 1 for optimizer states, 2 for gradients, 3 for parameters
- **Model size guide**: <7B use ZeRO-1, 7-30B use ZeRO-2, >30B use ZeRO-3
- **CPU offload**: Enable only when GPU memory insufficient
- **Checkpoint**: Use same ZeRO stage for save and load

## What NOT to Do
- Do NOT use ZeRO-3 for models under 7B parameters
- Do NOT skip gradient checkpointing for large models
- Do NOT ignore CPU offloading when OOM
- Do NOT mix ZeRO stages between checkpoint save/load
- Do NOT skip `ds_report` to verify system compatibility

## ZeRO / Offload Footguns
**ZeRO** partitions training state across data-parallel ranks to cut per-GPU
memory: **stage 1** shards optimizer states, **stage 2** adds gradient sharding,
**stage 3** adds parameter sharding (each stage saves more memory but adds
communication). The most common Claude mistake is reaching for stage 3 (and
offload) reflexively — each step down the memory ladder costs bandwidth:

```python
# FOOTGUN: with ZeRO-3, parameters are SHARDED — a plain `model.weight` access
# outside DeepSpeed's context sees an EMPTY (0-numel) tensor because that shard
# lives on another rank. Use the gather context to touch full parameters:
import deepspeed
with deepspeed.zero.GatheredParameters(model.parameters(), modifier_rank=0):
    if torch.distributed.get_rank() == 0:
        full_weight = model.some_layer.weight   # materialized only inside here
```

- **`zero_init` (stage-3 param init under `deepspeed.zero.Init()`)** builds the
  model already sharded so it never materializes fully on one GPU — required for
  models too big to fit before sharding. Constructing the full model first
  defeats it and OOMs at init.
- **CPU / NVMe offload thrash**: `offload_optimizer`/`offload_param` move state to
  host RAM or NVMe. This trades GPU memory for **PCIe/NVMe bandwidth** — enable it
  only when you are actually GPU-OOM, else it silently slows training many-fold.
  NVMe offload needs a fast local SSD path (`nvme_path`), not a network mount.
- **`save_16bit_model`**: with stage 3 the parameters are sharded, so a plain
  save writes shards. Use `save_16bit_model(...)` (or `zero_to_fp32.py`) to
  consolidate a single loadable fp16/fp32 checkpoint.

## Concurrency (parallelism / accumulation)
- **`gradient_accumulation_steps` is coupled** to batch math:
  `train_batch_size == micro_batch_per_gpu × gradient_accumulation_steps ×
  world_size`. DeepSpeed validates this — a mismatch raises at init, but a *silent*
  wrong assumption gives you the wrong effective batch (and LR schedule).
- **Pipeline vs tensor parallelism**: pipeline parallel splits *layers* across
  GPUs (bubble overhead, needs micro-batches to fill the pipeline); tensor
  parallel splits *within* a layer (heavier communication, keep it intra-node).
  Combine with ZeRO carefully — ZeRO-3 + pipeline parallel interact and are not a
  free stack.
- **`overlap_comm: true`** overlaps gradient reduction with backward compute — a
  throughput win, but it raises peak memory; drop it first if you are near OOM.
- Checkpoint sharding writes per-rank state — load with the **same world size and
  ZeRO stage** or restore fails / silently drops shards.

## Error Handling
```python
# Batch-math mismatch surfaces at deepspeed.initialize(), not at step():
try:
    engine, opt, _, _ = deepspeed.initialize(model=model, config=ds_config)
except AssertionError as e:
    # e.g. train_batch_size != micro_batch * grad_accum * world_size
    raise RuntimeError(f"DeepSpeed batch-config mismatch: {e}")

# ds_report at build time reveals missing fused ops / NVMe (aio) support BEFORE
# a run fails hours in — run it in CI on the training image.
```

## Security and Dependency Gotchas
- **DeepSpeed checkpoints are Python `pickle` (CWE-502)**: `save_checkpoint`
  serializes with torch/pickle, so `load_checkpoint` on a crafted checkpoint
  **executes arbitrary code at load time**. This is CWE-502 "Deserialization of
  Untrusted Data" (cwe.mitre.org). Never load a checkpoint from an untrusted
  source; prefer **safetensors** for weight interchange (it cannot execute code):

```python
# SAFE: for sharing/serving WEIGHTS, consolidate to safetensors — no pickle,
# no code execution on load. Keep pickle checkpoints only for your own
# resume-training artifacts in storage you control.
from safetensors.torch import save_file, load_file
save_file(engine.module.state_dict(), "model.safetensors")
state = load_file("model.safetensors")     # no exec, unlike torch/pickle load
```
- **`torch.load` on a resume checkpoint** inherits torch's deserialization
  surface — on torch 2.6+ `weights_only=True` is the default; do not flip it to
  `False` on an untrusted file.
- Source: cwe.mitre.org/502, huggingface.co safetensors, deepspeed.ai. See References.

## Testing Conventions
```python
# Test config/batch math and checkpoint round-trip on a TINY model on 1 GPU (or
# CPU) so CI does not need a multi-GPU cluster:
def test_batch_math():
    assert train_batch_size == micro_bs * grad_accum * world_size

def test_checkpoint_roundtrip(tmp_path):
    engine.save_checkpoint(tmp_path, tag="t")
    engine.load_checkpoint(tmp_path, tag="t")   # same world_size + ZeRO stage
```
- Gate real multi-GPU / offload tests behind device count; never hard-require 4
  GPUs in a unit test.

## Performance Traps
- Offload (CPU/NVMe) enabled when you are NOT GPU-OOM is pure slowdown — profile
  memory first, offload last.
- `overlap_comm` and `contiguous_gradients` raise peak memory for speed; toggle
  them off before lowering the ZeRO stage when tight on memory.
- Over-large `gradient_accumulation_steps` inflates effective batch and can
  destabilize the LR schedule — it is not free "bigger batch".

## Version-Specific Gotchas (dated, sourced)
- **DeepSpeed 0.19.2** is the current stable release, uploaded **2026-06-16**.
  [pypi.org/project/deepspeed + github.com/deepspeedai/DeepSpeed release v0.19.2,
  retrieved 2026-07-10]
- DeepSpeed is **tightly coupled to the installed PyTorch/CUDA** (fused ops are
  JIT- or prebuilt-compiled against them) — run `ds_report` after any torch/CUDA
  change to confirm the ops still build. [deepspeed.ai, retrieved 2026-07-10]
- Use **`zero_to_fp32.py`** (shipped with a ZeRO-3 checkpoint) to reconstruct a
  single fp32 state dict from shards for downstream loading. [deepspeed.ai
  model-checkpointing, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- DeepSpeed releases (PyPI): https://pypi.org/project/deepspeed/
- DeepSpeed releases (GitHub): https://github.com/deepspeedai/DeepSpeed/releases
- ZeRO / offload configuration: https://www.deepspeed.ai/docs/config-json/
- Model checkpointing: https://www.deepspeed.ai/tutorials/zero/
- safetensors (safe serialization): https://huggingface.co/docs/safetensors
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
