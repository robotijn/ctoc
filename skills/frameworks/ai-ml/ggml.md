# GGML/GGUF CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# GGML is typically used via llama-cpp-python
pip install llama-cpp-python
# For CUDA: CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python
# Models use GGUF format (successor to GGML)
```

## Claude's Common Mistakes
1. Using old GGML format instead of GGUF
2. Wrong quantization for hardware (Q4_K_M is usually best)
3. Not enabling memory mapping for large models
4. Missing `n_gpu_layers` when GPU available
5. Default context size too small

## Correct Patterns (2026)
```python
from llama_cpp import Llama

# Load GGUF model with optimizations
llm = Llama(
    model_path="llama-3.1-8b.Q4_K_M.gguf",  # GGUF format, not GGML
    n_ctx=4096,           # Context window
    n_threads=8,          # CPU threads
    n_gpu_layers=-1,      # -1 = offload all layers to GPU
    use_mmap=True,        # Memory map for efficiency
    use_mlock=False,      # Set True if you have permissions
    verbose=False,
)

# Basic inference
output = llm(
    "Explain quantum computing:",
    max_tokens=256,
    temperature=0.7,
    top_p=0.9,
    stop=["User:", "\n\n"],
)
print(output["choices"][0]["text"])

# Streaming
for chunk in llm("Write a poem:", max_tokens=256, stream=True):
    print(chunk["choices"][0]["text"], end="", flush=True)

# Chat completion (OpenAI-compatible)
response = llm.create_chat_completion(
    messages=[
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Hello!"}
    ],
    max_tokens=256,
)
```

## Version Gotchas
- **GGUF**: Current format, GGML is deprecated
- **Quantization**: Q4_K_M best balance, Q5_K_M for quality, Q4_0 for size
- **n_gpu_layers**: Use -1 for full GPU, reduce if OOM
- **Context**: Default 512, most models support 4096+

## What NOT to Do
- Do NOT use GGML format - convert to GGUF
- Do NOT skip `n_gpu_layers` when GPU available
- Do NOT use default context size (512) - set explicitly
- Do NOT forget `use_mmap=True` for large models

## Quantization Footguns
GGUF quant types trade file size for accuracy, and the loss is **not linear** —
the k-quants (`_K_`) keep per-block scales that low-bit legacy quants drop.

```python
# Size/quality ladder for a 7-8B model (weights only; runtime KV cache is extra):
#   Q8_0   ~8.0 GB  near-lossless, but ~2x the RAM of Q4 for little quality gain
#   Q6_K   ~6.0 GB  practically lossless for most tasks
#   Q5_K_M ~5.3 GB  strong default when RAM allows
#   Q4_K_M ~4.4 GB  best size/quality knee — the usual recommendation
#   Q3_K_M ~3.3 GB  visible perplexity rise; reasoning/code degrade first
#   Q2_K   ~2.6 GB  emergency-only; frequently incoherent on hard prompts
from llama_cpp import Llama
llm = Llama(model_path="llama-3.1-8b.Q4_K_M.gguf", n_ctx=4096)
```
- **FOOTGUN — GGUF metadata mismatch.** GGUF embeds the tokenizer, chat template,
  rope/context metadata and `general.architecture` in the file header. A model
  re-quantized with an old `convert_hf_to_gguf.py` can carry a **stale chat
  template or wrong `rope_freq_base`**, producing subtly wrong output with NO
  error. Re-convert with a current tool rather than patching metadata by hand.
- **Tensor alignment / block size.** k-quant blocks are 256 elements; a tensor
  dimension not divisible by the block size falls back to a legacy quant or fails
  to quantize. This is why some fine-tunes only ship `Q4_0`/`Q8_0`.
- Source: github.com/ggml-org/llama.cpp quantize README (retrieved 2026-07-10).

## Memory (mmap vs load, KV cache)
```python
# use_mmap=True (default) maps the GGUF file — pages load lazily and are shared
# across processes; RSS looks high but is mostly reclaimable page cache.
# use_mlock=True pins the whole model in RAM (needs RLIMIT_MEMLOCK / root) so the
# OS never evicts it — use only when you can afford the full resident footprint.
llm = Llama(model_path="m.Q4_K_M.gguf", use_mmap=True, use_mlock=False, n_ctx=8192)
```
- **KV-cache size scales with `n_ctx`**, not with model size, and is separate from
  the weights. For an 8B model at `n_ctx=8192` the KV cache alone is on the order
  of ~1 GB (f16); doubling context doubles it. OOM at long context is almost
  always the KV cache, not the weights.
- Source: github.com/ggml-org/llama.cpp README (retrieved 2026-07-10).

## Error Handling
```python
from llama_cpp import Llama
try:
    llm = Llama(model_path="model.Q4_K_M.gguf", n_ctx=4096, n_gpu_layers=-1)
except ValueError as e:
    # "failed to load model" — usually a truncated/corrupt GGUF download or a
    # GGUF version newer than this llama.cpp build can parse. Re-download and
    # verify the file size before assuming a code bug.
    raise SystemExit(f"GGUF load failed: {e}")

# Context overflow: prompt + max_tokens must fit in n_ctx or generation is
# silently truncated / the call errors depending on build. Count tokens first.
n = len(llm.tokenize(prompt.encode()))
assert n < llm.n_ctx(), f"prompt {n} tokens exceeds n_ctx {llm.n_ctx()}"
```

## Security and Dependency Gotchas
- **A crafted GGUF/tensor file is parsed in C (CWE-787 / CWE-125).** The GGUF
  reader walks attacker-controlled counts (`header.n_tensors`, `header.n_kv`,
  array/string lengths) and writes into heap buffers sized from those fields.
  Talos disclosed a cluster of **heap buffer overflows** in exactly this path —
  `gguf_fread_str`, `GGUF_TYPE_ARRAY`/`GGUF_TYPE_STRING`, `info->ne`,
  `header.n_tensors`, `header.n_kv` (**CVE-2024-21802, CVE-2024-21825,
  CVE-2024-21836, CVE-2024-23496, CVE-2024-23605**) — the "Out-of-bounds Write"
  class, **CWE-787** (and out-of-bounds read, **CWE-125**). Impact: memory
  corruption / potential code execution from merely *loading* a model file.
- **Only load GGUF files from a source you trust.** Treat a downloaded `.gguf`
  like an executable: verify the publisher and checksum, keep llama.cpp current
  so parser fixes are present, and never auto-load user-uploaded model files in a
  service without isolation.
- Source: cwe.mitre.org/data/definitions/787.html and
  services.nvd.nist.gov (CVE-2024-21802 … CVE-2024-23605), both retrieved
  2026-07-10.

## Testing Conventions
```python
def test_gguf_loads_and_generates():
    from llama_cpp import Llama
    llm = Llama(model_path="tiny.Q4_K_M.gguf", n_ctx=512, n_gpu_layers=0)
    out = llm("2+2=", max_tokens=4, temperature=0.0)   # temp=0 -> deterministic
    assert out["choices"][0]["text"].strip() != ""

def test_prompt_within_context():
    # Guard the n_ctx overflow footgun in CI rather than in production.
    from llama_cpp import Llama
    llm = Llama(model_path="tiny.Q4_K_M.gguf", n_ctx=256, n_gpu_layers=0)
    assert len(llm.tokenize(b"hello world")) < llm.n_ctx()
```

## Performance Traps
- `n_gpu_layers=-1` offloads all layers; if VRAM is tight, offload a fixed count
  (e.g. `n_gpu_layers=20`) so the rest runs on CPU rather than OOM-ing.
- k-quants (`Q4_K_M`) are slightly slower per token than legacy `Q4_0` but far
  more accurate — do not "optimize" to `Q4_0` for speed without measuring quality.
- Bigger `n_batch` speeds **prompt ingestion** (parallel), not per-token decode.

## Version-Specific Gotchas (dated, sourced)
- **llama.cpp** ships continuously; the current tagged build is **b9951**
  (published **2026-07-10**). GGUF is the current on-disk format; the legacy GGML
  format is removed — convert with `convert_hf_to_gguf.py`.
  [github.com/ggml-org/llama.cpp/releases, retrieved 2026-07-10]
- The repository moved from `ggerganov/llama.cpp` to **`ggml-org/llama.cpp`**;
  old `ggerganov` links redirect but new tooling references `ggml-org`.
  [github.com/ggml-org/llama.cpp, retrieved 2026-07-10]
- **llama-cpp-python 0.3.33** is the current wheel (uploaded **2026-07-05**),
  `requires_python >= 3.8`. [pypi.org/project/llama-cpp-python, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- llama.cpp releases: https://github.com/ggml-org/llama.cpp/releases
- GGUF format spec: https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
- Quantization / quantize tool: https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md
- llama-cpp-python (PyPI): https://pypi.org/project/llama-cpp-python/
- CWE-787 Out-of-bounds Write: https://cwe.mitre.org/data/definitions/787.html
- CWE-125 Out-of-bounds Read: https://cwe.mitre.org/data/definitions/125.html
- GGUF-parse heap overflows (NVD): https://nvd.nist.gov/vuln/detail/CVE-2024-21802
- Do NOT use Q8_0 unless quality critical (slow)
