# vLLM CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v0.14+ requires Python 3.10-3.13, CUDA 12.9
pip install vllm
# Verify: python -c "from vllm import LLM; print('OK')"
# CPU requires glibc >= 2.35 (Ubuntu 22.04+)
```

## Claude's Common Mistakes
1. Using deprecated `VLLM_ATTENTION_BACKEND` env var - use AttentionConfig
2. Running large models without quantization (AWQ/GPTQ)
3. Missing `tensor_parallel_size` for multi-GPU
4. Not using OpenAI-compatible API for existing integrations
5. Ignoring `gpu_memory_utilization` causing OOM

## Correct Patterns (2026)
```python
from vllm import LLM, SamplingParams

# Load with quantization and multi-GPU
llm = LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    quantization="awq",  # or "gptq"
    tensor_parallel_size=2,  # Multi-GPU
    gpu_memory_utilization=0.9,
    max_model_len=8192,
)

# Sampling params
sampling_params = SamplingParams(
    temperature=0.7,
    top_p=0.9,
    max_tokens=512,
)

# Batch inference
prompts = ["Explain AI:", "What is ML?"]
outputs = llm.generate(prompts, sampling_params)

for output in outputs:
    print(output.outputs[0].text)

# Production: Use OpenAI-compatible server
# python -m vllm.entrypoints.openai.api_server \
#     --model meta-llama/Llama-3.1-8B-Instruct \
#     --quantization awq --tensor-parallel-size 2

# Client (OpenAI SDK compatible)
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="dummy")
response = client.chat.completions.create(
    model="meta-llama/Llama-3.1-8B-Instruct",
    messages=[{"role": "user", "content": "Hello"}],
)
```

## Version Gotchas
- **v0.14+**: Removed AQLM quantization, original Marlin format
- **v0.10+**: Python 3.12 recommended
- **v0.9.x**: Requires transformers < 4.54.0
- **Breaking**: `AttentionConfig` replaces `VLLM_ATTENTION_BACKEND` env var

## What NOT to Do
- Do NOT skip quantization for models > 7B
- Do NOT use single GPU for models requiring parallelism
- Do NOT ignore `gpu_memory_utilization` setting
- Do NOT use deprecated attention backend env vars
- Do NOT forget OpenAI-compatible API for drop-in replacement

## Memory / KV-cache Footguns
vLLM pre-allocates a **KV-cache** at startup: after loading weights it grabs the
fraction of *total* GPU memory set by `gpu_memory_utilization` (default `0.9`)
and carves the leftover into **PagedAttention blocks** (`block_size` tokens
each). The single most common Claude-generated crash is an OOM at engine init or
first request because the three knobs are set in isolation:

```python
from vllm import LLM

# FOOTGUN: gpu_memory_utilization is a fraction of TOTAL device memory, not
# free memory. On a shared GPU (a notebook, another process, a second model)
# 0.90 double-books memory already in use → CUDA OOM at KV-cache allocation.
# max_model_len sizes the PER-SEQUENCE KV-cache: doubling context length
# roughly halves how many sequences fit. If (weights + max_model_len KV for
# max_num_seqs) exceeds the utilization budget, init fails or throughput
# collapses to 1 sequence.
llm = LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    gpu_memory_utilization=0.85,   # leave headroom on a shared card
    max_model_len=8192,            # KV-cache scales with this — do not over-set
    tensor_parallel_size=2,        # MUST divide the model's attention heads
)
```

- **`tensor_parallel_size`** shards weights AND the KV-cache across GPUs; it must
  evenly divide the number of attention heads or engine init raises. Prefer TP
  within a node (fast NVLink) and pipeline parallel (`pipeline_parallel_size`)
  across nodes.
- **`max_num_seqs`** caps concurrent sequences; the KV-cache must hold
  `max_num_seqs × max_model_len` tokens or requests queue/preempt.
- Symptom "engine loads then first long prompt OOMs" = KV budget too small for
  `max_model_len`; lower `max_model_len` or raise `gpu_memory_utilization`.
- Source: docs.vllm.ai conserving-memory / optimization. See References.

## Concurrency (continuous batching)
vLLM uses **continuous (in-flight) batching**: it schedules new requests into
the running batch every step instead of waiting for a fixed batch to finish.
Under memory pressure it **preempts** the longest-running sequences and either
**recomputes** or **swaps** their KV-cache — silently multiplying latency, not
erroring. Do not treat a slow tail as a hang.

```python
# The server-side scheduler owns batching — a client should NOT batch prompts
# into one request to "help". Send concurrent independent requests and let the
# engine pack them; manual client batching defeats continuous batching and
# serializes the tail.
```
- Raising `max_num_seqs` increases throughput until the KV-cache saturates, then
  preemption thrash *lowers* it — tune against your `max_model_len`, do not max it.

## Error Handling
```python
# FOOTGUN: passing an OpenAI request whose prompt+max_tokens exceeds
# max_model_len returns HTTP 400 (BadRequestError), not a silent truncation.
# Validate token budget client-side or catch it:
from openai import OpenAI, BadRequestError
client = OpenAI(base_url="http://localhost:8000/v1", api_key="dummy")
try:
    client.completions.create(model="m", prompt=huge, max_tokens=4096)
except BadRequestError as e:
    ...  # reduce prompt or max_tokens; do not retry unchanged

# CUDA OOM at load is a hard failure, not retryable in-process — the cache is
# already sized. Restart with a lower gpu_memory_utilization / max_model_len.
```

## Security and Dependency Gotchas
- **`trust_remote_code=True` executes arbitrary repo code (CWE-94)**: many
  models ship custom modeling files; loading them with `trust_remote_code=True`
  runs the repo's Python at load time. A malicious or compromised Hub repo owns
  your process. This is CWE-94 "Improper Control of Generation of Code / Code
  Injection" (cwe.mitre.org). Only enable it for repos you have vetted and
  pinned by commit revision:

```python
from vllm import LLM
# SAFE: default is trust_remote_code=False. If a model REQUIRES custom code,
# vet the repo and pin the exact revision so the code can't change under you.
llm = LLM(model="org/model", trust_remote_code=False)          # default: refuse
llm = LLM(model="org/vetted", trust_remote_code=True,           # only if vetted
          revision="a1b2c3d")                                   # pin the commit
```
- **The OpenAI-compatible server is unauthenticated by default**: `--api-key` is
  opt-in and it binds `0.0.0.0`. Exposed on a public interface it is an open,
  free LLM endpoint (and a prompt-injection / cost-exhaustion target). Put it
  behind an auth proxy and bind to a private interface; set `--api-key`.
- Source: docs.vllm.ai openai-compatible-server, cwe.mitre.org/94. See References.

## Testing Conventions
```python
# Unit-test prompt/response shaping WITHOUT a GPU by asserting on request
# construction and mocking the endpoint; reserve real generate() for a
# GPU-gated integration test so CI without CUDA still runs.
def test_token_budget_guard():
    # a request over max_model_len must be rejected before it hits the engine
    assert prompt_tokens + max_tokens <= MAX_MODEL_LEN
```
- Pin `seed` in `SamplingParams` and use `temperature=0` for deterministic
  regression assertions; sampling output is otherwise non-reproducible.

## Performance Traps
- Setting `gpu_memory_utilization` too *low* wastes KV-cache and caps concurrency
  — it is not "safer", it is slower. Size it to leave only real headroom.
- `enforce_eager=True` disables CUDA graph capture (useful for debugging) but
  costs throughput — do not leave it on in production.
- Quantization (AWQ/GPTQ/FP8) shrinks weights so more memory goes to KV-cache
  (more concurrency), at some accuracy cost — measure, don't assume.

## Version-Specific Gotchas (dated, sourced)
- **vLLM 0.24.0** is the current stable release, uploaded **2026-06-30**,
  `requires_python <3.15,>=3.10`. [pypi.org/project/vllm +
  github.com/vllm-project/vllm release v0.24.0, retrieved 2026-07-10]
- The **V1 engine** is the default execution path in current vLLM; legacy V0
  flags and the old `VLLM_ATTENTION_BACKEND` env toggle are superseded — do not
  copy V0-era snippets. [docs.vllm.ai, retrieved 2026-07-10]
- CPU builds require **glibc ≥ 2.35** (Ubuntu 22.04+). [docs.vllm.ai installation,
  retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- vLLM releases (PyPI): https://pypi.org/project/vllm/
- vLLM releases (GitHub): https://github.com/vllm-project/vllm/releases
- Conserving memory / KV-cache: https://docs.vllm.ai/en/latest/configuration/conserving_memory.html
- OpenAI-compatible server: https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
