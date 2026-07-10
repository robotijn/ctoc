# PEFT CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install peft transformers accelerate bitsandbytes
# Verify: python -c "from peft import LoraConfig, get_peft_model; print('OK')"
```

## Claude's Common Mistakes
1. Wrong target_modules for model architecture
2. LoRA rank too high (wasting resources) or too low (losing capacity)
3. Not using `prepare_model_for_kbit_training()` with quantization
4. Saving merged model when adapter should be separate
5. Missing `modules_to_save` for task-specific heads

## Correct Patterns (2026)
```python
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, PeftModel
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
import torch

# Quantization config for QLoRA
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

# Load quantized model
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=bnb_config,
    device_map="auto",
)

# CRITICAL: Prepare for k-bit training
model = prepare_model_for_kbit_training(model)

# LoRA config (target_modules vary by architecture!)
lora_config = LoraConfig(
    r=16,              # Rank - start with 8-16, increase if underfitting
    lora_alpha=32,     # Usually 2x rank
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],  # LLaMA
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()  # Should be < 1%

# After training - save adapter ONLY
model.save_pretrained("./lora-adapter")

# For inference - load adapter onto base model
base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
model = PeftModel.from_pretrained(base_model, "./lora-adapter")

# Optional: merge for faster inference (loses flexibility)
merged = model.merge_and_unload()
```

## Version Gotchas
- **target_modules**: LLaMA uses q/k/v/o_proj, BERT uses query/key/value
- **QLoRA**: Always use `prepare_model_for_kbit_training()` first
- **Rank**: 8-16 for most tasks, 32-64 for complex tasks
- **Merge**: Only merge for deployment, keep separate for flexibility

## What NOT to Do
- Do NOT skip `prepare_model_for_kbit_training()` with quantization
- Do NOT use wrong target_modules for architecture
- Do NOT set rank too high (>64) without justification
- Do NOT merge adapters unless deploying to production
- Do NOT forget to check `print_trainable_parameters()`

## Adapter Footguns (rank, alpha, merge, dtype)
The LoRA update is `W + (lora_alpha / r) * B @ A`. The **effective scale is
`lora_alpha / r`**, NOT `lora_alpha` alone — so if you double `r` to add capacity
but leave `lora_alpha` fixed you *halve* the update magnitude and the adapter
under-trains. The common convention is `lora_alpha = 2 * r` (or `alpha == r` with
`use_rslora=True`, which rescales by `alpha / sqrt(r)` for stability at high rank).

```python
from peft import LoraConfig
# r and lora_alpha are COUPLED. Changing r without alpha changes the learning scale.
cfg = LoraConfig(r=16, lora_alpha=32,          # scale = 32/16 = 2.0
                 target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
                 lora_dropout=0.05, bias="none", task_type="CAUSAL_LM")
```
- **`target_modules` is architecture-specific.** LLaMA/Mistral use
  `q_proj,k_proj,v_proj,o_proj` (+ MLP `gate_proj,up_proj,down_proj`); BERT uses
  `query,key,value`. Passing `target_modules="all-linear"` adapts every linear
  layer and is the safe default when you do not know the names.
- **`merge_and_unload()` vs keep-adapter**: merging folds the adapter into the
  base weights for zero-overhead inference — but it is one-way (you lose the
  ability to swap/disable adapters) and **you must NOT merge a QLoRA (4-bit)
  model**: merging into 4-bit weights corrupts them. Dequantize to fp16 first, or
  keep the adapter separate.

```python
# FOOTGUN: merging into a 4-bit base silently degrades quality. Load fp16 to merge.
base = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B",
                                            torch_dtype=torch.float16)  # NOT 4-bit
merged = PeftModel.from_pretrained(base, "./lora-adapter").merge_and_unload()
```
- **Same base + same dtype at load time.** An adapter is a *delta* — it must load
  onto the exact base repo/revision and dtype it was trained on. Loading a
  Llama-3.1 adapter onto Llama-3.2, or an fp16-trained adapter onto a bf16 base,
  produces plausible-looking-but-wrong outputs (no error).
- Source: huggingface.co/docs/peft LoRA conceptual guide + `merge_and_unload`
  API. See References.

## Correctness: modules_to_save & multiple adapters
```python
from peft import LoraConfig, PeftModel
# A new classification/LM head that was randomly initialized will NOT be trained
# by LoRA alone — LoRA only wraps the target_modules. List new heads in
# modules_to_save so they are fully trained AND saved with the adapter.
cfg = LoraConfig(target_modules=["q_proj", "v_proj"],
                 modules_to_save=["classifier", "score"])   # trained in full

# Multiple adapters on ONE base: load, then activate exactly one (or combine).
model = PeftModel.from_pretrained(base, "./adapter_math", adapter_name="math")
model.load_adapter("./adapter_code", adapter_name="code")
model.set_adapter("math")          # only "math" is active now
```
- Forgetting `modules_to_save` for a fresh head is a silent accuracy bug: the head
  stays at its random init because its gradients are never applied.

## Error Handling Idioms
```python
# get_peft_model on an ALREADY-peft model double-wraps it — check first.
from peft import PeftModel
if not isinstance(model, PeftModel):
    model = get_peft_model(model, cfg)

# Verify the adapter actually attached — trainable % should be < 1%, not 0% and
# not 100%. 0% means target_modules matched nothing (typo in module names).
model.print_trainable_parameters()   # e.g. "trainable: 0.09%" — sanity check

# Loading an adapter whose base differs raises or mis-shapes — pin the revision.
PeftModel.from_pretrained(base, "repo/adapter", revision="<commit-sha>")
```

## Security and Dependency Gotchas
- **Untrusted adapter or base from the Hub (CWE-94)**: `from_pretrained(...,
  trust_remote_code=True)` executes arbitrary Python shipped in the repo at load
  time — CWE-94 "Improper Control of Generation of Code / Code Injection"
  (cwe.mitre.org/data/definitions/94.html). An adapter repo can also carry a
  pickled `adapter_model.bin`; prefer the `.safetensors` adapter format and pin a
  commit `revision`. Never set `trust_remote_code=True` on an unvetted repo.
- **peft depends on `accelerate>=0.21.0` and `transformers`** — a mismatched
  transformers can change module names and break `target_modules` matching.
- Source: cwe.mitre.org/94, huggingface.co/docs/peft. See References.

## Testing Conventions
```python
from peft import LoraConfig, get_peft_model

def test_adapter_is_small():
    m = get_peft_model(base, LoraConfig(r=8, target_modules=["q_proj", "v_proj"]))
    trainable = sum(p.numel() for p in m.parameters() if p.requires_grad)
    total = sum(p.numel() for p in m.parameters())
    assert 0 < trainable / total < 0.05        # attached AND parameter-efficient

def test_roundtrip_merge_matches():
    # merged output must match adapter-active output (within tolerance) in fp16.
    import torch
    with torch.no_grad():
        a = model(**batch).logits
        b = model.merge_and_unload()(**batch).logits
    assert torch.allclose(a, b, atol=1e-3)
```

## Performance Traps
- Keep the adapter separate during experimentation (swap/disable is free); only
  `merge_and_unload()` for the final fp16 deployment artifact.
- Too-high `r` (>64) rarely helps and inflates the adapter + optimizer state; start
  at `r=8..16` and raise only on measured underfitting.
- `prepare_model_for_kbit_training(..., use_gradient_checkpointing=True)` trades
  compute for memory — expect ~20-30% slower steps in exchange for fitting.

## Version-Specific Gotchas (dated, sourced)
- **peft 0.19.1** is the current stable release on PyPI, uploaded **2026-04-16**,
  `requires_python >= 3.10.0`; it depends on `accelerate>=0.21.0`, `torch>=1.13.0`,
  and `transformers`. [pypi.org/project/peft, retrieved 2026-07-10]
- `use_rslora=True` (rank-stabilized LoRA, scale `alpha/sqrt(r)`) and DoRA
  (`use_dora=True`) are the current knobs for high-rank stability — documented in
  the LoRA config reference. [huggingface.co/docs/peft, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- peft releases (PyPI): https://pypi.org/project/peft/
- LoRA conceptual guide: https://huggingface.co/docs/peft/conceptual_guides/lora
- LoraConfig / merge_and_unload API: https://huggingface.co/docs/peft/package_reference/lora
- QLoRA (k-bit training): https://huggingface.co/docs/peft/developer_guides/quantization
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
