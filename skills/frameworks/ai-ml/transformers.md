# Hugging Face Transformers CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v4.57+ requires Python 3.9+, PyTorch 2.1+
pip install "transformers[torch]" datasets accelerate
# Or with uv (10x faster):
uv pip install "transformers[torch]"
# Login for gated models: huggingface-cli login
```

## Claude's Common Mistakes
1. Not setting `pad_token = eos_token` for decoder-only models
2. Using `pipeline()` in production without batching
3. Missing `device_map="auto"` for large model distribution
4. Forgetting `trust_remote_code=True` for custom architectures
5. Using fp32 when fp16/bf16 is available

## Correct Patterns (2026)
```python
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
import torch

# Quantized loading for memory efficiency
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B-Instruct",
    quantization_config=bnb_config,
    device_map="auto",
    torch_dtype=torch.bfloat16,
)

tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B-Instruct")
tokenizer.pad_token = tokenizer.eos_token  # Required for batch inference

# Proper generation
inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True)
outputs = model.generate(**inputs.to(model.device), max_new_tokens=256)
```

## Version Gotchas
- **v4.57+**: New cache format - clear `~/.cache/huggingface` if issues
- **Llama 3.1+**: Requires `trust_remote_code=True` for some features
- **With PEFT**: Use `prepare_model_for_kbit_training()` before LoRA
- **Batch inference**: Always set `padding=True` and `truncation=True`

## What NOT to Do
- Do NOT use `pipeline()` without batching in production
- Do NOT skip `device_map="auto"` for models > 7B
- Do NOT forget pad_token for decoder-only models
- Do NOT use fp32 for inference (wastes memory)
- Do NOT ignore `gradient_checkpointing_enable()` for fine-tuning

## Tokenizer ↔ Model Version Coupling
The tokenizer and the model are a **matched pair keyed to a checkpoint**. Loading
them from different checkpoints does NOT error — it silently corrupts inputs
(wrong vocab → token ids the model never trained on → garbage outputs).

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

CKPT = "meta-llama/Llama-3.1-8B-Instruct"
# RIGHT: same checkpoint for both, pinned to an immutable revision.
tok = AutoTokenizer.from_pretrained(CKPT, revision="a1b2c3d")
model = AutoModelForCausalLM.from_pretrained(CKPT, revision="a1b2c3d")

# FOOTGUN: tokenizer from one checkpoint, weights from another —
# no exception, just wrong ids and silently degraded output:
# tok = AutoTokenizer.from_pretrained("gpt2")          # different vocab!
```
- `AutoModel...` inspects the checkpoint `config.json` and picks the class, which
  is robust to the exact architecture; an **explicit class** (`LlamaForCausalLM`)
  is a hard assertion that fails loudly if the checkpoint isn't that architecture.
  Use Auto for generic pipelines, explicit for a code path that must not drift.
- Source: huggingface.co transformers auto/tokenizer docs. See References.

## Device Placement & Concurrency Footguns
Getting tensors and the model onto the same device — and choosing the right
placement strategy — is the most common transformers runtime crash.

```python
# FOOTGUN: inputs on CPU, model on GPU → RuntimeError (device mismatch).
enc = tok(text, return_tensors="pt")
out = model.generate(**enc.to(model.device))     # RIGHT: follow model.device

# device_map="auto" SHARDS a big model across GPUs/CPU/disk via accelerate —
# then model.device is ambiguous (layers live on different devices). Send inputs
# to the FIRST device / an embeddings device, not a hard-coded "cuda:0":
first = next(iter(model.hf_device_map.values()))  # e.g. 0, "cpu", "disk"
```
- **Thread safety**: a single model is fine for concurrent *reads* (inference),
  but generation mutates KV-cache state per call — do NOT share one
  `model.generate` call across threads; batch requests instead, or give each
  worker its own pipeline. The GIL plus CUDA streams make naive threading a
  false-parallelism trap (see the Python guide's concurrency section).
- Source: huggingface.co accelerate / big-model-inference docs. See References.

## Attention Mask & Padding Footguns
Batched inputs of unequal length are padded; **omitting the attention mask makes
the model attend to pad tokens**, silently producing wrong outputs (and, for
left-padded decoder generation, off-by-one position ids).

```python
tok.pad_token = tok.eos_token
tok.padding_side = "left"                 # decoder-only generation pads LEFT
enc = tok(texts, return_tensors="pt", padding=True, truncation=True)
out = model.generate(**enc.to(model.device),   # passes input_ids AND attention_mask
                     max_new_tokens=256)
# FOOTGUN: passing only enc["input_ids"] drops the mask → attends to <pad>.
```

## Serialization Security: safetensors vs pickle `.bin` (CWE-502)
- Legacy `pytorch_model.bin` files are **Python pickle** — loading one executes
  arbitrary code (CWE-502 "Deserialization of Untrusted Data", cwe.mitre.org).
- **safetensors** (`model.safetensors`) is a pure tensor container that **cannot
  execute code**; it is the default `from_pretrained` prefers when present, and
  `save_pretrained` writes it by default in current `transformers`.

```python
# Force the safe format explicitly; refuse silent pickle fallback on save:
model.save_pretrained("out/", safe_serialization=True)   # writes .safetensors
# Loading still prefers .safetensors when both exist. Prefer repos that ship it.
```
- **`trust_remote_code=True` is remote code execution by design.** It runs
  `modeling_*.py` shipped *in the model repo* on your machine. Only enable it for a
  repo you trust, and **always pin `revision=<commit-sha>`** so a later push to the
  repo's `main` cannot swap in new code you never reviewed:

```python
model = AutoModelForCausalLM.from_pretrained(
    "some-org/custom-arch",
    trust_remote_code=True,        # runs repo-shipped Python — audit + pin!
    revision="a1b2c3d",            # immutable commit, never a moving branch
)
```
- Source: huggingface.co safetensors + custom-models docs, cwe.mitre.org/502.
  See References.

## Hub Download, Caching & Offline Determinism
- `from_pretrained("org/model")` with **no `revision`** resolves the repo's moving
  `main` — a re-download can silently change your model between runs. Pin
  `revision=<sha>` for reproducibility.
- Cache lives at `HF_HOME` (default `~/.cache/huggingface`); set it to a fast disk
  in CI and pre-warm it. Set `HF_HUB_OFFLINE=1` (and `TRANSFORMERS_OFFLINE=1`) to
  fail fast instead of hitting the network on a cache miss — critical in air-gapped
  or reproducible builds.
- Gated models (Llama, etc.) require `huggingface-cli login`; a 401 in CI is a
  missing `HF_TOKEN`, not a code bug.

## Error Handling Idioms
```python
from huggingface_hub.errors import GatedRepoError, RepositoryNotFoundError

try:
    model = AutoModelForCausalLM.from_pretrained(CKPT, revision=REV)
except GatedRepoError:
    raise SystemExit("accept the model license + set HF_TOKEN")   # 401/403
except RepositoryNotFoundError:
    raise SystemExit(f"no such repo/revision: {CKPT}@{REV}")       # 404
except torch.cuda.OutOfMemoryError:
    # retry with 4-bit quantization or device_map="auto" offload
    ...
```

## Testing Conventions
```python
def test_tokenizer_roundtrip():
    ids = tok("hello world", return_tensors="pt").input_ids
    assert tok.decode(ids[0], skip_special_tokens=True) == "hello world"

def test_uses_safetensors(tmp_path):
    model.save_pretrained(tmp_path, safe_serialization=True)
    assert (tmp_path / "model.safetensors").exists()        # no pickle .bin

def test_cpu_ci():
    # pin a TINY model + revision so CI is fast and reproducible, no GPU needed
    m = AutoModelForCausalLM.from_pretrained("hf-internal-testing/tiny-random-gpt2")
    assert m.generate(tok("hi", return_tensors="pt").input_ids).shape[0] == 1
```

## Performance Traps
- **`pipeline()` one-at-a-time**: calling a pipeline per input runs unbatched — the
  GPU sits idle between short prompts. Pass a list (or a `Dataset`) and set
  `batch_size=` so inputs are padded and run together.
- **fp32 by default**: load with `torch_dtype=torch.bfloat16` (or fp16) — fp32
  doubles memory and halves throughput for no accuracy gain in inference.
- **KV-cache**: `generate` reuses `use_cache=True` by default; turning it off (or
  fine-tuning with `gradient_checkpointing_enable()`, which disables the cache)
  makes generation O(n²) in sequence length. Keep the cache on for inference.
- **Quantization** (`load_in_4bit` / `BitsAndBytesConfig`) trades a small accuracy
  hit for a large VRAM win — needed to fit >7B models on one consumer GPU.
- **Left vs right padding**: padding to the longest sequence in a huge batch wastes
  compute — bucket similar-length inputs to shrink the pad tail.

## Version-Specific Gotchas (dated, sourced)
- **transformers 5.13.0** is the current stable release, uploaded **2026-07-03**,
  `requires_python >= 3.10`. [pypi.org/project/transformers, retrieved 2026-07-09]
- **safetensors 0.8.0** is current; safetensors is the preferred/default weight
  format — repos still shipping only `pytorch_model.bin` carry the CWE-502 pickle
  risk. [pypi.org/project/safetensors, retrieved 2026-07-09]
- `transformers` version-couples to a **PyTorch (or TF) backend** — a checkpoint's
  ops may require a minimum torch; mismatches surface as import/kernel errors, not
  clear messages. Pin both in the lockfile.
  [huggingface.co installation, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- transformers releases (PyPI): https://pypi.org/project/transformers/
- safetensors releases (PyPI): https://pypi.org/project/safetensors/
- safetensors (safe serialization): https://huggingface.co/docs/safetensors
- Custom models / trust_remote_code: https://huggingface.co/docs/transformers/custom_models
- Padding & attention masks: https://huggingface.co/docs/transformers/pad_truncation
- Hub caching / offline: https://huggingface.co/docs/huggingface_hub/guides/manage-cache
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
