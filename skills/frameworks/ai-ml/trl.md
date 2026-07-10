# TRL CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install trl transformers datasets peft accelerate
# Verify: python -c "from trl import SFTTrainer; print('OK')"
```

## Claude's Common Mistakes
1. Using PPO without validated reward model (unstable)
2. Missing beta (KL penalty) in DPO causing distribution collapse
3. Wrong data format for DPO (needs chosen/rejected pairs)
4. Not using PEFT integration for memory efficiency
5. Skipping SFT stage before alignment

## Correct Patterns (2026)
```python
from trl import SFTTrainer, SFTConfig, DPOTrainer, DPOConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from datasets import load_dataset

# Load model and tokenizer
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B")
tokenizer.pad_token = tokenizer.eos_token

# PEFT config for efficiency
peft_config = LoraConfig(r=16, lora_alpha=32, target_modules=["q_proj", "v_proj"])

# Stage 1: Supervised Fine-Tuning
sft_config = SFTConfig(
    output_dir="./sft",
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    num_train_epochs=1,
    fp16=True,
)

sft_trainer = SFTTrainer(
    model=model,
    args=sft_config,
    train_dataset=sft_dataset,
    tokenizer=tokenizer,
    peft_config=peft_config,
    max_seq_length=2048,
)
sft_trainer.train()

# Stage 2: DPO (simpler than PPO, no reward model needed)
# Dataset format: {"prompt": str, "chosen": str, "rejected": str}
dpo_config = DPOConfig(
    output_dir="./dpo",
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    beta=0.1,  # KL penalty - CRITICAL for stability
    loss_type="sigmoid",
    fp16=True,
)

dpo_trainer = DPOTrainer(
    model=sft_trainer.model,
    ref_model=None,  # Uses implicit reference
    args=dpo_config,
    train_dataset=preference_dataset,
    tokenizer=tokenizer,
)
dpo_trainer.train()
```

## Version Gotchas
- **DPO vs PPO**: DPO is simpler, no reward model needed
- **Beta**: 0.1-0.5 typical, higher = more conservative
- **SFT first**: Always do SFT before DPO/PPO
- **Data format**: DPO needs chosen/rejected, not just labels

## What NOT to Do
- Do NOT use PPO without a validated reward model
- Do NOT skip beta parameter in DPO (causes collapse)
- Do NOT skip SFT stage before alignment
- Do NOT use wrong data format for DPO
- Do NOT forget PEFT integration for memory efficiency

## Trainer Footguns (data format, chat template, DPO/GRPO)
Each trainer expects a **different dataset schema**, and the single most common
silent bug is a chat-template mismatch between training and inference.

```python
# SFTTrainer accepts EITHER a `text` column (raw strings) OR a `messages` column
# ([{role, content}, ...]). If you pass `messages`, SFT applies the tokenizer's
# chat template. That template MUST match the one you use at inference — training
# on the base tokenizer then serving with an -Instruct template yields garbage.
from trl import SFTTrainer, SFTConfig
trainer = SFTTrainer(
    model="meta-llama/Llama-3.1-8B",
    train_dataset=ds,                       # column "messages" -> chat template
    args=SFTConfig(max_length=2048, packing=True),
)
```
- **DPO** needs `{"prompt", "chosen", "rejected"}` preference pairs — NOT `{text}`.
  **GRPO** needs `{"prompt"}` plus a **reward function** (callable(s)) — it has no
  reward *model* and no chosen/rejected pairs. **PPO** needs a validated reward
  model. Feeding SFT-shaped data to DPO trains on nothing useful (no error).
- **`beta`** is the KL penalty toward the reference policy in DPO — omit it or set
  it to 0 and the policy drifts arbitrarily far and collapses. Typical `beta`
  0.1–0.5; higher = more conservative (stays near the reference).
- **`packing=True`** concatenates multiple short samples into one `max_length`
  sequence for throughput — but it needs example boundaries respected (EOS between
  samples) or the model learns to run examples together. Leave it off for
  short-context instruction data if quality matters more than speed.
- Source: huggingface.co/docs/trl SFT/DPO/GRPO trainer docs + dataset-format
  guide. See References.

## Memory: gradient checkpointing & sequence length
```python
from trl import SFTConfig
cfg = SFTConfig(
    max_length=2048,                    # TRUNCATES longer samples silently — set
                                        # to your real max or you drop tokens
    gradient_checkpointing=True,        # recompute activations -> big VRAM save
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,      # effective batch = 4*4*num_processes
    bf16=True,
)
```
- `max_length` (renamed from `max_seq_length` in recent TRL) truncates — samples
  longer than it lose their tail with no warning. Log the truncation rate.
- Pair TRL with a PEFT `LoraConfig` (`peft_config=...`) to fine-tune an 8B model on
  a single consumer GPU; without it the full-parameter optimizer state will OOM.

## Error Handling Idioms
```python
# Set a pad token or batching raises / mis-masks — decoder-only models often
# ship without one. Reuse EOS (and pad on the LEFT for generation-time DPO refs).
tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token

# DPO with ref_model=None uses the FROZEN initial policy as the implicit
# reference — correct ONLY when `model` starts equal to that reference (i.e. right
# after SFT). Reloading a mid-DPO checkpoint as `model` with ref_model=None makes
# the KL term reference the wrong policy. Pass an explicit ref_model to be safe.
dpo = DPOTrainer(model=sft_model, ref_model=None, args=DPOConfig(beta=0.1))
```

## Security and Dependency Gotchas
- **Untrusted dataset / model (`trust_remote_code`)**: loading a model or a
  dataset script with `trust_remote_code=True` executes arbitrary repo code at
  load time (CWE-94, cwe.mitre.org/data/definitions/94.html). Preference datasets
  are also an injection surface — a poisoned `chosen`/`rejected` pair steers the
  aligned policy. Vet the source and pin a `revision`.
- **transformers coupling**: TRL 1.x pins `transformers>=4.56.2`,
  `accelerate>=1.4.0`, and `datasets>=4.7.0`; a too-old transformers changes chat
  templates and breaks `SFTConfig`/`DPOConfig` argument names.
- Source: cwe.mitre.org/94, huggingface.co/docs/trl, pypi.org/project/trl. See References.

## Testing Conventions
```python
def test_dpo_dataset_schema():
    row = preference_dataset[0]
    assert {"prompt", "chosen", "rejected"} <= row.keys()   # not {"text"}

def test_chat_template_roundtrip():
    # the template used in training must equal the one served at inference.
    msgs = [{"role": "user", "content": "hi"}]
    train = tokenizer.apply_chat_template(msgs, tokenize=False)
    assert train == serve_tokenizer.apply_chat_template(msgs, tokenize=False)
```

## Performance Traps
- `packing=True` + `gradient_checkpointing=True` + a PEFT adapter is the standard
  "fit 8B on one 24GB GPU" recipe; dropping any one usually OOMs.
- PPO keeps a policy, a reference, a reward model, and a value head resident at
  once — prefer DPO/GRPO unless you specifically need online RL, to save ~2x VRAM.

## Version-Specific Gotchas (dated, sourced)
- **trl 1.8.0** is the current stable release on PyPI, uploaded **2026-07-09**,
  `requires_python >= 3.10`; it requires `transformers>=4.56.2`,
  `accelerate>=1.4.0`, `datasets>=4.7.0`. [pypi.org/project/trl, retrieved 2026-07-10]
- Recent TRL renamed `SFTTrainer`/`DPOTrainer` sequence arg to `max_length` (was
  `max_seq_length`) and moved trainer kwargs into the `*Config` objects — old
  tutorials passing them directly to the trainer will error.
  [huggingface.co/docs/trl, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- trl releases (PyPI): https://pypi.org/project/trl/
- SFTTrainer: https://huggingface.co/docs/trl/sft_trainer
- DPOTrainer: https://huggingface.co/docs/trl/dpo_trainer
- GRPOTrainer: https://huggingface.co/docs/trl/grpo_trainer
- Dataset formats: https://huggingface.co/docs/trl/dataset_formats
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
