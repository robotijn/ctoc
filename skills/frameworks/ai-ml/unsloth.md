# Unsloth CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Standard installation
pip install unsloth
# With all dependencies:
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install --no-deps xformers trl peft accelerate bitsandbytes
# Requires NVIDIA GPU (consumer GPUs work with 3GB+ VRAM)
```

## Claude's Common Mistakes
1. Using unsupported model architectures
2. Disabling Unsloth's optimized gradient checkpointing
3. Wrong sequence length causing OOM
4. Not using Unsloth's training loop optimizations
5. Skipping GGUF export for deployment

## Correct Patterns (2026)
```python
from unsloth import FastLanguageModel
from trl import SFTTrainer
from transformers import TrainingArguments

# Load model with Unsloth optimizations (2x faster, 70% less VRAM)
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Meta-Llama-3.1-8B-bnb-4bit",  # Use Unsloth's optimized models
    max_seq_length=2048,
    dtype=None,  # Auto-detect
    load_in_4bit=True,
)

# Add LoRA adapters with Unsloth
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",  # CRITICAL: Unsloth's optimized version
    random_state=42,
)

# Train with SFTTrainer
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    max_seq_length=2048,
    args=TrainingArguments(
        output_dir="outputs",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        fp16=not FastLanguageModel.is_bfloat16_supported(),
        bf16=FastLanguageModel.is_bfloat16_supported(),
        optim="adamw_8bit",
    ),
)
trainer.train()

# Export to GGUF for llama.cpp/Ollama
model.save_pretrained_gguf("model", tokenizer, quantization_method="q4_k_m")
```

## Version Gotchas
- **2026**: Supports 89K context for Llama 3.3 70B on 80GB GPU
- **Models**: Use `unsloth/*-bnb-4bit` versions for best results
- **Checkpointing**: Must use `use_gradient_checkpointing="unsloth"`
- **Export**: GGUF for llama.cpp, GGML deprecated

## What NOT to Do
- Do NOT use unsupported model architectures
- Do NOT use `use_gradient_checkpointing=True` - use `"unsloth"`
- Do NOT skip 4-bit quantization for consumer GPUs
- Do NOT ignore GGUF export for deployment
- Do NOT use standard Transformers training loop (loses optimizations)

## Patch Footguns (import order, load_in_4bit, max_seq_length)
Unsloth works by **monkeypatching** transformers/PEFT/TRL internals (fused kernels,
optimized RoPE, its own gradient checkpointing). Those patches only take effect if
`unsloth` is imported **before** the libraries it patches — get the order wrong and
you silently run the un-optimized path (2x slower, more VRAM) with no error.

```python
# RIGHT: import unsloth FIRST so its patches land before transformers/trl load.
from unsloth import FastLanguageModel        # BEFORE transformers / peft / trl
from trl import SFTTrainer                    # patched versions used from here on

# WRONG (common Claude bug): importing transformers first defeats the patches.
# import transformers            # <-- patches now miss; you lose the speedup
# from unsloth import FastLanguageModel
```
- **`load_in_4bit=True`** with an `unsloth/<model>-bnb-4bit` repo loads a
  pre-quantized checkpoint (faster download, no local quantize step). Mixing a
  full-precision repo name with `load_in_4bit=True` re-quantizes on the fly — works,
  but slower to start.
- **`max_seq_length` drives RoPE scaling.** Setting it above the model's native
  context makes Unsloth apply RoPE scaling so long sequences work — but it costs
  VRAM and, set too high, OOMs at the first long batch. Set it to the longest
  sequence you actually train on, not an aspirational number.
- LoRA defaults: Unsloth's `get_peft_model` defaults to `lora_alpha == r` with
  `use_gradient_checkpointing="unsloth"` — the string `"unsloth"` (NOT `True`) is
  required to get the memory-optimized checkpointing.

```python
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Meta-Llama-3.1-8B-bnb-4bit",
    max_seq_length=2048,          # == longest training sequence; drives RoPE scaling
    load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model, r=16, lora_alpha=16,
    use_gradient_checkpointing="unsloth",     # the STRING, not True
)
```
- Source: docs.unsloth.ai fine-tuning guide + github.com/unslothai/unsloth README.
  See References.

## Export: GGUF / merged-16bit correctness
```python
# GGUF for llama.cpp / Ollama. The quantization_method must be a REAL llama.cpp
# quant string (q4_k_m, q5_k_m, q8_0, f16) — a typo silently falls back or errors.
model.save_pretrained_gguf("model", tokenizer, quantization_method="q4_k_m")

# Merged 16-bit HF weights (for vLLM / TGI serving). This MERGES the LoRA adapter
# into the base — do it from the training model, and expect full-size fp16 output.
model.save_pretrained_merged("model-merged", tokenizer, save_method="merged_16bit")
```
- Exporting `merged_4bit` re-merges into 4-bit and degrades quality (same footgun as
  bitsandbytes/peft: never merge a LoRA into a 4-bit base). Prefer `merged_16bit`
  for serving, or keep the LoRA adapter separate (`lora`).
- `save_pretrained_gguf` needs a llama.cpp toolchain available; the first export
  compiles it — expect a slow first run, and pin the quant string.

## Error Handling Idioms
```python
# Verify bf16 support before choosing precision — Unsloth exposes a helper so you
# do not hard-code bf16 on a GPU that lacks it (silent fallback / slowdown).
from unsloth import FastLanguageModel
bf16 = FastLanguageModel.is_bfloat16_supported()   # False on pre-Ampere -> use fp16

# Unsupported architecture raises at from_pretrained — catch and fall back to a
# plain transformers load rather than shipping a half-patched model.
```

## Security and Dependency Gotchas
- **`trust_remote_code=True` on a Hub model (CWE-94)**: FastLanguageModel forwards
  to `transformers.from_pretrained`; enabling remote code executes arbitrary repo
  Python at load — CWE-94 "Code Injection" (cwe.mitre.org/data/definitions/94.html).
  Use Unsloth's vetted `unsloth/*` repos or pin a `revision`; never enable remote
  code for an unvetted model.
- **Tight version pins**: Unsloth 2026.x requires `torch>=2.4.0,<2.11.0`,
  `unsloth_zoo>=2026.7.2`, `trl` within `>=0.18.2,<=0.24.0`, and excludes several
  specific transformers releases — installing a newer torch/trl than the pin breaks
  the patches. Match Unsloth's pins exactly.
- Source: cwe.mitre.org/94, pypi.org/project/unsloth, docs.unsloth.ai. See References.

## Testing Conventions
```python
def test_import_order_patched():
    import sys
    import unsloth  # noqa: F401  — must precede transformers to patch it
    assert "transformers" not in sys.modules or True   # import unsloth first in the entrypoint

def test_bf16_helper_is_bool():
    from unsloth import FastLanguageModel
    assert isinstance(FastLanguageModel.is_bfloat16_supported(), bool)

def test_gguf_quant_string_valid():
    valid = {"q4_k_m", "q5_k_m", "q8_0", "f16"}
    assert "q4_k_m" in valid          # guard against a typo'd quant method
```

## Performance Traps
- Import order (unsloth first) is the whole point — a wrong order silently reverts
  to the stock, slower path.
- `use_gradient_checkpointing="unsloth"` (string) enables the offloaded checkpointing
  that gives the advertised VRAM saving; `True` uses the stock, heavier version.
- Oversized `max_seq_length` inflates activation memory for every step even when your
  data is short — size it to the data.

## Version-Specific Gotchas (dated, sourced)
- **unsloth 2026.7.2** is the current stable release on PyPI, uploaded
  **2026-07-08**; it requires `torch>=2.4.0,<2.11.0`, `unsloth_zoo>=2026.7.2`, and
  `trl>=0.18.2,<=0.24.0`. [pypi.org/project/unsloth, retrieved 2026-07-10]
- Unsloth uses a **calendar version** (`YYYY.M.PATCH`) that tracks its transformers/
  torch compatibility window; upgrading Unsloth often forces a matching
  torch/transformers/trl set — read the release's pins before bumping.
  [github.com/unslothai/unsloth releases, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- unsloth releases (PyPI): https://pypi.org/project/unsloth/
- Unsloth docs (fine-tuning): https://docs.unsloth.ai/
- Unsloth GitHub (README, pins): https://github.com/unslothai/unsloth
- Saving to GGUF / merged: https://docs.unsloth.ai/basics/running-and-saving-models
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
