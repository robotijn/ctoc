# llama.cpp CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# CPU only
pip install llama-cpp-python
# With CUDA (recommended)
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python --force-reinstall --no-cache-dir
# With Metal (macOS)
CMAKE_ARGS="-DGGML_METAL=on" pip install llama-cpp-python
```

## Claude's Common Mistakes
1. Using deprecated GGML format instead of GGUF
2. Missing `n_gpu_layers` for GPU acceleration
3. Not setting `chat_format` for instruct models
4. Ignoring `n_batch` for prompt processing speed
5. Using sync API in async applications

## Correct Patterns (2026)
```python
from llama_cpp import Llama

# Load with full optimizations
llm = Llama(
    model_path="llama-3.1-8b-instruct.Q4_K_M.gguf",
    n_ctx=8192,           # Context window
    n_gpu_layers=-1,      # Offload all to GPU
    n_batch=512,          # Batch size for prompt processing
    n_threads=8,          # CPU threads for non-GPU ops
    use_mmap=True,
    chat_format="llama-3", # CRITICAL for instruct models
    verbose=False,
)

# Chat completion (OpenAI-compatible)
response = llm.create_chat_completion(
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain quantum computing."}
    ],
    max_tokens=512,
    temperature=0.7,
)
print(response["choices"][0]["message"]["content"])

# Streaming chat
for chunk in llm.create_chat_completion(
    messages=[{"role": "user", "content": "Write a story."}],
    stream=True,
):
    delta = chunk["choices"][0]["delta"]
    if "content" in delta:
        print(delta["content"], end="", flush=True)

# Grammar-constrained generation (JSON output)
grammar = '''
root ::= object
object ::= "{" pair ("," pair)* "}"
pair ::= string ":" value
string ::= "\"" [a-z]+ "\""
value ::= string | "true" | "false"
'''
constrained = llm("Generate JSON:", grammar=grammar)
```

## Version Gotchas
- **chat_format**: Must match model (llama-3, chatml, alpaca, etc.)
- **GGUF only**: GGML deprecated, convert with `convert_hf_to_gguf.py`
- **n_batch**: Higher = faster prompt processing, uses more VRAM
- **Rebuild**: Need `--force-reinstall` when changing CUDA/Metal flags

## What NOT to Do
- Do NOT use GGML format - use GGUF only
- Do NOT skip `chat_format` for instruct models
- Do NOT forget `n_gpu_layers` when GPU available
- Do NOT use default `n_batch` (512) for long prompts
- Do NOT forget `--force-reinstall` when changing build flags

## Context and Sampling Footguns
```python
from llama_cpp import Llama
llm = Llama(
    model_path="llama-3.1-8b-instruct.Q4_K_M.gguf",
    n_ctx=8192,          # HARD cap: prompt + generated tokens must fit here
    n_gpu_layers=-1,     # -1 = all layers on GPU; a fixed count avoids VRAM OOM
    n_batch=512,         # prompt-ingest batch (parallel); not per-token speed
    n_threads=8,
)
out = llm.create_chat_completion(
    messages=[{"role": "user", "content": "..."}],
    max_tokens=512,
    temperature=0.7,     # 0.0 = greedy/deterministic; > 1.0 gets incoherent
    top_p=0.9,
    repeat_penalty=1.1,  # > ~1.3 starts dropping natural repetition (lists, code)
)
```
- **`n_ctx` overflow is the #1 footgun.** When the KV cache fills, the server
  either errors or, with `--ctx-shift`, *evicts the oldest tokens* — the model
  then "forgets" the start of the conversation with no error. Set `n_ctx` to the
  real max you need and count prompt tokens before sending.
- **`n_gpu_layers` OOM.** `-1` offloads every layer; on a GPU that cannot hold
  them all you get a hard CUDA/Metal OOM at load. Offload a fixed number and let
  the remainder run on CPU.
- **Sampler defaults are not neutral.** `temperature` scales randomness,
  `top_p`/`top_k` truncate the tail, `repeat_penalty` discourages repetition.
  For deterministic/structured output set `temperature=0.0`; do not stack a high
  `repeat_penalty` on code generation (it deletes legitimate repeated tokens).
- Source: github.com/ggml-org/llama.cpp server README (retrieved 2026-07-10).

## Concurrency (threads, batch, server slots)
```bash
# The bundled OpenAI-compatible server. --parallel N creates N generation slots;
# n_ctx is DIVIDED across slots, so 8192 ctx with --parallel 4 = 2048 ctx each.
llama-server -m model.Q4_K_M.gguf \
  --host 127.0.0.1 --port 8080 \
  --ctx-size 8192 --parallel 4 --n-gpu-layers -1 --batch-size 512
```
- `n_threads` matters only for CPU-resident layers; oversubscribing past physical
  cores hurts throughput. `n_batch` trades VRAM for faster prompt processing.
- **Per-slot context split:** `--parallel N` splits `--ctx-size` N ways; size
  context for the *per-slot* budget, not the total, or long prompts truncate.
- Source: github.com/ggml-org/llama.cpp server README (retrieved 2026-07-10).

## Error Handling
```python
from llama_cpp import Llama
try:
    llm = Llama(model_path="model.Q4_K_M.gguf", n_ctx=8192, n_gpu_layers=-1)
except ValueError as e:
    # Corrupt/truncated GGUF, or a GGUF version newer than this build. Re-download,
    # verify size/checksum, and upgrade llama-cpp-python before assuming a bug.
    raise SystemExit(f"model load failed: {e}")

n = len(llm.tokenize(prompt.encode()))
if n + max_tokens > llm.n_ctx():
    raise ValueError(f"{n}+{max_tokens} tokens exceed n_ctx {llm.n_ctx()}")
```

## Security and Dependency Gotchas
- **GGUF parsing is a trust boundary (CWE-787).** llama.cpp parses the GGUF file
  in C using attacker-controlled length/count fields; Talos disclosed a cluster
  of heap buffer overflows in this path (**CVE-2024-21802, CVE-2024-21825,
  CVE-2024-23496, CVE-2024-23605** — CWE-787 "Out-of-bounds Write"). Loading a
  malicious `.gguf` can corrupt memory. Treat model files like executables:
  verify publisher + checksum, keep llama.cpp current, isolate untrusted loads.
- **Server endpoint exposure.** `llama-server` has **no authentication**. Bind to
  `--host 127.0.0.1` (loopback) and put it behind an authenticating reverse proxy
  before exposing it — never bind `0.0.0.0` on an untrusted network.
- Source: cwe.mitre.org/data/definitions/787.html and services.nvd.nist.gov
  (CVE-2024-21802 … CVE-2024-23605), both retrieved 2026-07-10.

## Testing Conventions
```python
def test_chat_deterministic():
    from llama_cpp import Llama
    llm = Llama(model_path="tiny.Q4_K_M.gguf", n_ctx=512, n_gpu_layers=0)
    r = llm.create_chat_completion(
        messages=[{"role": "user", "content": "Say OK"}],
        max_tokens=4, temperature=0.0,      # temp=0 -> reproducible in CI
    )
    assert r["choices"][0]["message"]["content"].strip() != ""

def test_cpu_only_in_ci():
    # CI has no GPU: n_gpu_layers=0 must still load and run.
    from llama_cpp import Llama
    assert Llama(model_path="tiny.Q4_K_M.gguf", n_gpu_layers=0, n_ctx=256)
```

## Performance Traps
- `n_batch` speeds prompt ingest, not decode; raising it costs VRAM.
- Rebuilding with `CMAKE_ARGS="-DGGML_CUDA=on" ... --force-reinstall` is required
  after changing accelerator flags, or you silently keep the CPU-only build.
- `--parallel` raises throughput for concurrent requests but shrinks per-slot
  context — do not crank it past what your `--ctx-size` can afford.

## Version-Specific Gotchas (dated, sourced)
- **llama.cpp** current tagged build is **b9951** (published **2026-07-10**); GGUF
  is the only supported on-disk format (legacy GGML removed).
  [github.com/ggml-org/llama.cpp/releases, retrieved 2026-07-10]
- **llama-cpp-python 0.3.33** is the current wheel (uploaded **2026-07-05**),
  `requires_python >= 3.8`. Match `chat_format` to the model
  (`llama-3`, `chatml`, `gemma`, …) or instruct models produce garbage.
  [pypi.org/project/llama-cpp-python, retrieved 2026-07-10]
- Repo moved to **`ggml-org/llama.cpp`** (old `ggerganov` links redirect).
  [github.com/ggml-org/llama.cpp, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- llama.cpp releases: https://github.com/ggml-org/llama.cpp/releases
- llama-server README: https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- llama-cpp-python (PyPI): https://pypi.org/project/llama-cpp-python/
- GGUF format spec: https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
- CWE-787 Out-of-bounds Write: https://cwe.mitre.org/data/definitions/787.html
- GGUF-parse heap overflows (NVD): https://nvd.nist.gov/vuln/detail/CVE-2024-21802
