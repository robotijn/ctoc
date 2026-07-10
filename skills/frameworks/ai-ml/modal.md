# Modal CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install modal
modal token new  # Authenticate
# Run: modal run app.py
# Deploy: modal deploy app.py
```

## Claude's Common Mistakes
1. Hardcoded secrets in code (use Modal secrets)
2. Wrong GPU type for model size
3. Missing image dependencies causing import failures
4. No volume for large model weights
5. Loading model in `@method` instead of `@enter`

## Correct Patterns (2026)
```python
import modal

app = modal.App("ml-inference")

# Define image with all dependencies
image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch", "transformers", "accelerate"
).run_commands("pip install flash-attn --no-build-isolation")

# Volume for model weights (persists across runs)
volume = modal.Volume.from_name("model-weights", create_if_missing=True)

@app.cls(
    gpu=modal.gpu.A100(count=1, memory=40),  # Match GPU to model
    image=image,
    volumes={"/models": volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
    container_idle_timeout=300,
    allow_concurrent_inputs=10,
)
class Inference:
    @modal.enter()  # Load model ONCE at container start
    def load_model(self):
        from transformers import AutoModelForCausalLM, AutoTokenizer
        import torch

        self.tokenizer = AutoTokenizer.from_pretrained(
            "meta-llama/Llama-3.1-8B-Instruct",
            cache_dir="/models"
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            "meta-llama/Llama-3.1-8B-Instruct",
            torch_dtype=torch.float16,
            device_map="auto",
            cache_dir="/models"
        )

    @modal.method()
    def generate(self, prompt: str, max_tokens: int = 256) -> str:
        inputs = self.tokenizer(prompt, return_tensors="pt").to("cuda")
        outputs = self.model.generate(**inputs, max_new_tokens=max_tokens)
        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)

@app.local_entrypoint()
def main():
    inference = Inference()
    print(inference.generate.remote("Hello, world!"))
```

## Version Gotchas
- **GPU selection**: A100-40GB for 8B models, A100-80GB/H100 for 70B
- **@modal.enter()**: Runs once when container starts (for model loading)
- **Volumes**: Required for large model weights to avoid re-download
- **Secrets**: Use `modal secret create` for API keys

## What NOT to Do
- Do NOT hardcode secrets - use Modal secrets
- Do NOT load model in `@method` - use `@modal.enter()`
- Do NOT skip volumes for large models (slow cold starts)
- Do NOT use wrong GPU for model size
- Do NOT forget `container_idle_timeout` (wastes money)

## App / Function Footguns (image, GPU, cold-start)
Modal's serverless model bills for container *wall-clock*, so the expensive
mistakes are about image layers, cold starts, and idle time — not correctness.

```python
import modal

app = modal.App("ml-inference")

# FOOTGUN: pip_install AFTER an app-code mount invalidates the image cache on every
# code edit → a full multi-minute rebuild each deploy. Order layers slow→fast:
# base deps first (rarely change), your source last (changes constantly).
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch", "transformers")   # heavy, stable layer — cached
    .add_local_python_source("app")          # your code LAST — cheap to rebuild
)

# FOOTGUN: loading the model in the request handler pays cold-start cost on EVERY
# call. Load once at container start with @modal.enter (a warm container reuses it).
@app.cls(gpu="A100-40GB", image=image, scaledown_window=300)
class Model:
    @modal.enter()                 # runs ONCE when the container boots
    def load(self):
        self.pipe = load_pipeline()
    @modal.method()
    def infer(self, x):            # runs per request against the warm model
        return self.pipe(x)
```

- **`gpu=`**: match the accelerator to the model. Requesting `"H100"` for a model that
  fits an `"A10G"` multiplies cost with no speedup; under-provisioning OOMs at load.
  Use a string like `"A100-40GB"` / `"A100-80GB"` / `"H100"`.
- **Cold start**: a scaled-to-zero class must pull the image, boot the container, and
  run `@modal.enter` before the first response. For large weights, bake them into the
  image or a `modal.Volume` so the cold path is boot-only, not download-and-boot.
- **Mounts vs Volumes**: mounts ship local files into the image (immutable, versioned
  with the deploy); `modal.Volume` is mutable shared storage for weights/caches that
  outlive a container. Do not confuse them — a mount for a 30 GB checkpoint bloats
  every image build.

## Concurrency & Cost Knobs
```python
# Serve many concurrent requests from ONE warm container (great for I/O-bound or
# batched GPU inference) instead of cold-starting a container per request.
@app.cls(gpu="A100-40GB")
@modal.concurrent(max_inputs=10)   # current API; supersedes allow_concurrent_inputs=
class Model: ...

# keep_warm / min_containers pins N containers alive to kill cold starts for latency-
# critical endpoints — but you pay for them 24/7 even at zero traffic. Cost trade-off,
# not a free win.
@app.function(min_containers=1)    # was keep_warm=1 in older clients
def hot_path(): ...
```
- `scaledown_window` (older name: `container_idle_timeout`) is how long a container
  lingers idle before scaling to zero. Too short = constant cold starts; too long =
  paying for idle GPUs. Tune to your traffic burstiness.

## Security — Secrets & Web Endpoints (CWE-798)
**Never embed API keys / tokens in function code or the image.** A literal credential
in source is **CWE-798 Use of Hard-coded Credentials**
(cwe.mitre.org/data/definitions/798.html) — it leaks into logs, image layers, and
version control.

```python
# FOOTGUN (CWE-798): the key is baked into the image and printed in tracebacks.
@app.function()
def bad():
    key = "sk-live-abcd1234"                       # hard-coded credential — NEVER

# RIGHT: inject at runtime from a Modal Secret; nothing sensitive in the image.
@app.function(secrets=[modal.Secret.from_name("openai-secret")])
def good():
    import os
    key = os.environ["OPENAI_API_KEY"]             # provided by the Secret at runtime
```

- **Web endpoints are PUBLIC by default.** A `@modal.fastapi_endpoint` / `@modal.web_endpoint`
  is reachable by anyone with the URL. Add authentication (a shared-secret header, a
  proxy-auth token, or your own auth check) before exposing anything that costs money
  or touches data — an open GPU endpoint is a wallet-drain and abuse vector.
  [modal.com/docs/guide/webhooks, retrieved 2026-07-10]

## Error Handling Idioms
```python
import modal

# Retries: transient container/infra failures should retry; app bugs should not.
@app.function(retries=modal.Retries(max_retries=3, backoff_coefficient=2.0))
def flaky(x): ...

@app.function(timeout=600)         # bound runtime — an un-timed hung call bills forever
def bounded(x): ...

# .map() surfaces per-input exceptions; use return_exceptions to keep the batch alive.
@app.local_entrypoint()
def main():
    for r in bounded.map(inputs, return_exceptions=True):
        if isinstance(r, Exception): handle(r)
```

## Testing Conventions
```python
# Modal functions are ordinary Python — test the pure logic LOCALLY without the cloud.
# Factor inference into a plain function so unit tests never spin up a container/GPU.
def _infer(pipe, x): return pipe(x)          # pure, unit-testable

@app.cls(gpu="A100-40GB")
class Model:
    @modal.enter()
    def load(self): self.pipe = load_pipeline()
    @modal.method()
    def infer(self, x): return _infer(self.pipe, x)

def test_infer_logic():
    assert _infer(fake_pipe, "hi") == "HI"   # no Modal runtime needed
```
- Use `modal run` / a staging app for true integration; keep unit tests off the GPU
  path so CI is fast and free.

## Performance Traps
- **Cold start dominates** short requests — batch, `@modal.concurrent`, or `min_containers`
  for latency-critical paths.
- **Re-downloading weights** every cold start (no Volume/baked image) is the top
  latency killer.
- **Layer-cache busting** (unstable image layer order) turns every deploy into a full
  rebuild — order layers slow→fast.
- **Idle GPUs** from a too-long `scaledown_window` or stray `min_containers` quietly
  burn budget at zero traffic.

## Version-Specific Gotchas (dated, sourced)
- **Modal 1.5.1** (the `modal` client) is the current release, uploaded **2026-06-23**.
  [pypi.org/project/modal/, retrieved 2026-07-10]
- **1.x API renames**: `allow_concurrent_inputs=` → `@modal.concurrent(max_inputs=)`;
  `container_idle_timeout=` → `scaledown_window=`; `keep_warm=` → `min_containers=`.
  Older snippets using the pre-1.0 names emit deprecation warnings or break.
  [modal.com/docs/guide/concurrent-inputs, retrieved 2026-07-10]
- **GPU sizing**: `"A100-40GB"` for ~8B models, `"A100-80GB"`/`"H100"` for ~70B.
  [modal.com/docs/guide/gpu, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Modal releases (PyPI): https://pypi.org/project/modal/
- Modal images & layer caching: https://modal.com/docs/guide/images
- Modal GPU selection: https://modal.com/docs/guide/gpu
- Modal concurrency (input concurrency): https://modal.com/docs/guide/concurrent-inputs
- Modal cold start & scaledown: https://modal.com/docs/guide/cold-start
- Modal secrets: https://modal.com/docs/guide/secrets
- Modal web endpoints / webhooks: https://modal.com/docs/guide/webhooks
- CWE-798 (Use of Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
