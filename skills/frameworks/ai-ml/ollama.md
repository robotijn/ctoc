# Ollama CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
# Pull model: ollama pull llama3.2:3b
# Python client:
pip install ollama
# Verify: ollama list
```

## Claude's Common Mistakes
1. Using unquantized models on consumer hardware (OOM)
2. Missing `stream=True` for interactive applications
3. Not specifying `num_ctx` causing context truncation
4. Using synchronous client in async applications
5. Not checking if Ollama server is running

## Correct Patterns (2026)
```python
import ollama
from ollama import AsyncClient

# Check if model is available
models = ollama.list()
if "llama3.2:3b" not in [m["name"] for m in models["models"]]:
    ollama.pull("llama3.2:3b")

# Synchronous chat with options
response = ollama.chat(
    model="llama3.2:3b",
    messages=[{"role": "user", "content": "Explain quantum computing"}],
    options={"temperature": 0.7, "num_ctx": 4096}
)
print(response["message"]["content"])

# Async streaming for production
async def stream_response(prompt: str):
    client = AsyncClient()
    async for chunk in await client.chat(
        model="llama3.2:3b",
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    ):
        yield chunk["message"]["content"]

# Embeddings for RAG
embeddings = ollama.embeddings(model="nomic-embed-text", prompt="Text to embed")
vector = embeddings["embedding"]

# Cloud models (new in 2026)
# ollama.chat(model="deepseek-v3.1:671b-cloud", ...)
```

## Version Gotchas
- **2026**: Cloud models available (deepseek-v3.1, gpt-oss, kimi-k2)
- **Quantization**: Use Q4_K_M for best quality/size balance
- **Context**: Default is 2048 - set `num_ctx` explicitly
- **OpenAI compat**: `http://localhost:11434/v1/` for OpenAI SDK

## What NOT to Do
- Do NOT run large unquantized models on limited VRAM
- Do NOT skip streaming for chat applications
- Do NOT ignore context length limits
- Do NOT use sync client in async web apps
- Do NOT forget to start `ollama serve` before API calls

## Modelfile and Quant Footguns
```dockerfile
# Modelfile — the FROM line pulls a GGUF; PARAMETER sets runtime defaults.
FROM llama3.2:3b
PARAMETER num_ctx 8192          # default is small; long prompts truncate silently
PARAMETER temperature 0.7
PARAMETER keep_alive 5m         # how long the model stays resident after a call
SYSTEM "You are concise."
```
```bash
ollama create mymodel -f Modelfile
```
- **`num_ctx` truncation.** Ollama's default context is small; if a prompt exceeds
  `num_ctx`, the **oldest tokens are dropped with no error** and the model
  "forgets" the start. Set `num_ctx` per model to the real window you need (and
  note larger `num_ctx` grows the KV cache and VRAM use).
- **Quantization tag mismatch.** `llama3.2:3b` and `llama3.2:3b-instruct-q4_K_M`
  are different artifacts; pulling a tag without the quant suffix can land a
  larger/slower default than you intended. Pin the explicit quant tag.
- **`keep_alive` unload thrash.** With a short `keep_alive`, each request that
  arrives after the timeout **reloads the whole model from disk** (multi-second
  stall). Set `keep_alive` (or `OLLAMA_KEEP_ALIVE`) to keep hot models resident.
- Source: ollama.readthedocs.io/en/modelfile (retrieved 2026-07-10).

## Concurrency (parallel requests, loaded models)
```bash
# Server-level concurrency is controlled by environment variables, not per-call.
OLLAMA_NUM_PARALLEL=4 \        # concurrent requests served per loaded model
OLLAMA_MAX_LOADED_MODELS=2 \   # distinct models kept in VRAM at once
ollama serve
```
- `OLLAMA_NUM_PARALLEL` splits a model's context across in-flight requests, so
  higher parallelism means **less context per request** and more VRAM.
- `OLLAMA_MAX_LOADED_MODELS > 1` keeps several models resident — convenient, but
  each one holds VRAM; over-provisioning causes eviction thrash or OOM.
- Source: ollama.readthedocs.io/en/faq (retrieved 2026-07-10).

## Error Handling
```python
import ollama

try:
    ollama.chat(model="llama3.2:3b",
                messages=[{"role": "user", "content": "hi"}])
except ollama.ResponseError as e:
    if e.status_code == 404:
        ollama.pull("llama3.2:3b")      # model not present -> pull, then retry
    else:
        raise
except ConnectionError:
    raise SystemExit("ollama serve is not running on :11434")
```

## Security and Dependency Gotchas
- **The local API is unauthenticated (CWE-306).** Ollama listens on
  **`127.0.0.1:11434`** by default with **no authentication**. Setting
  `OLLAMA_HOST=0.0.0.0` (or binding a public interface) exposes model management
  and generation to anyone on the network — the "Missing Authentication for
  Critical Function" class, **CWE-306**. Ollama has a documented history here:
  **CVE-2024-28224** (DNS-rebinding gave remote access to the full API before
  0.1.29). Keep it on loopback and front it with an authenticating proxy; never
  bind `0.0.0.0` on an untrusted network.
- **Modelfile `FROM` on an untrusted GGUF is a parser trust boundary.** Importing
  a crafted GGUF via `FROM ./model.gguf` has produced memory-safety and DoS bugs
  (**CVE-2025-0312, CVE-2025-0315, CVE-2025-0317** — malicious GGUF import,
  ≤ 0.3.14). Only `FROM` GGUF files you trust and keep Ollama current.
- Source: cwe.mitre.org/data/definitions/306.html and services.nvd.nist.gov
  (CVE-2024-28224, CVE-2025-0312/0315/0317), both retrieved 2026-07-10.

## Testing Conventions
```python
import ollama

def test_model_present_or_pulled():
    names = [m["name"] for m in ollama.list()["models"]]
    if "llama3.2:3b" not in names:
        ollama.pull("llama3.2:3b")       # make CI self-provision the model
    assert "llama3.2:3b" in [m["name"] for m in ollama.list()["models"]]

def test_deterministic_chat():
    r = ollama.chat(
        model="llama3.2:3b",
        messages=[{"role": "user", "content": "Reply with OK"}],
        options={"temperature": 0.0, "num_ctx": 2048},   # temp=0 -> reproducible
    )
    assert r["message"]["content"].strip() != ""
```

## Performance Traps
- Short `keep_alive` -> per-request cold reloads; keep hot models resident.
- High `OLLAMA_NUM_PARALLEL` shrinks per-request context and raises VRAM use.
- Unquantized models on limited VRAM OOM; prefer `q4_K_M`-tagged builds.
- Use `stream=True` for interactive UIs so first-token latency is visible.

## Version-Specific Gotchas (dated, sourced)
- **Ollama** current release is **v0.31.2** (published **2026-07-06**).
  [github.com/ollama/ollama/releases, retrieved 2026-07-10]
- **Python client `ollama` 0.6.2** is the current PyPI release (uploaded
  **2026-04-29**). [pypi.org/project/ollama, retrieved 2026-07-10]
- OpenAI-compatible endpoint lives at `http://localhost:11434/v1/`; default
  context is small — set `num_ctx` per model.
  [ollama.com and ollama.readthedocs.io, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Ollama releases: https://github.com/ollama/ollama/releases
- Ollama site / download: https://ollama.com/download
- Modelfile reference: https://ollama.readthedocs.io/en/modelfile/
- FAQ (network exposure, concurrency): https://ollama.readthedocs.io/en/faq/
- ollama (PyPI): https://pypi.org/project/ollama/
- CWE-306 Missing Authentication for Critical Function: https://cwe.mitre.org/data/definitions/306.html
- Ollama advisories (NVD): https://nvd.nist.gov/vuln/detail/CVE-2024-28224
