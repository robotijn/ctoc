# Replicate CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v2 SDK in beta - use --pre flag for latest
pip install replicate --pre
pip install cog  # For model packaging
# Set API key: export REPLICATE_API_TOKEN="r8_..."
```

## Claude's Common Mistakes
1. Loading model in `predict()` instead of `setup()`
2. Missing input validation with `Input()` constraints
3. Using sync client for long-running predictions
4. Not pinning model versions in production
5. Ignoring FileOutput for file responses (v2 change)

## Correct Patterns (2026)
```python
# predict.py for Cog
from cog import BasePredictor, Input, Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

class Predictor(BasePredictor):
    def setup(self):
        """Load model ONCE during container start."""
        self.tokenizer = AutoTokenizer.from_pretrained(
            "meta-llama/Llama-3.1-8B-Instruct",
            cache_dir="./model_cache"
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            "meta-llama/Llama-3.1-8B-Instruct",
            torch_dtype=torch.float16,
            device_map="auto",
            cache_dir="./model_cache"
        )

    def predict(
        self,
        prompt: str = Input(description="Input prompt"),
        max_tokens: int = Input(default=256, ge=1, le=4096),
        temperature: float = Input(default=0.7, ge=0, le=2),
    ) -> str:
        """Run inference."""
        inputs = self.tokenizer(prompt, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            outputs = self.model.generate(**inputs, max_new_tokens=max_tokens, temperature=temperature)
        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)
```

```python
# Client usage
import replicate

# Sync prediction (v2 returns FileOutput for files)
output = replicate.run(
    "username/model:version",  # ALWAYS pin version in production
    input={"prompt": "Hello", "max_tokens": 256}
)
print(output)

# Async prediction with webhook (for long tasks)
prediction = replicate.predictions.create(
    model="username/model",
    version="abc123",
    input={"prompt": "Long task..."},
    webhook="https://your-server.com/webhook",
    webhook_events_filter=["completed"]
)
```

## Version Gotchas
- **v2 SDK**: Returns `FileOutput` for files, not URL strings
- **v2 migration**: Check migration guide for breaking changes
- **Version pinning**: Always use `model:version` in production
- **Webhooks**: Required for predictions > 60 seconds

## What NOT to Do
- Do NOT load model in `predict()` - use `setup()`
- Do NOT skip `Input()` validation constraints
- Do NOT use sync client for long predictions - use webhooks
- Do NOT skip version pinning in production
- Do NOT ignore v2 FileOutput changes

## Prediction Footguns (sync vs async, version pinning, cold boot)
Replicate runs models as remote predictions billed per second of compute — the
traps are blocking the wrong way, pinning the wrong thing, and eating cold boots.

```python
import replicate

# FOOTGUN: replicate.run() BLOCKS the calling thread/request until the prediction
# finishes. For a 3-minute video model this ties up a web worker for 3 minutes and
# times out behind most load balancers.
out = replicate.run("owner/model:abc123def", input={"prompt": "hi"})   # blocking

# RIGHT for long jobs: create async, return immediately, get the result via webhook.
prediction = replicate.predictions.create(
    model="owner/model",
    version="abc123def",                 # immutable version id — reproducible
    input={"prompt": "long task"},
    webhook="https://api.example.com/hooks/replicate",
    webhook_events_filter=["completed"], # only the terminal event you care about
)
# ... your webhook handler receives the result; do NOT poll in a request thread.
```

- **Version pinning (mutable vs immutable)**: `"owner/model"` resolves to *whatever
  version is latest right now* — it can change under you and silently alter outputs,
  latency, and price. `"owner/model:<version-hash>"` (or `version=` on
  `predictions.create`) is **immutable and reproducible**. Always pin the version hash
  in production; only use the bare name for exploration.
- **Cold boot**: an idle or scale-to-zero model must boot the container and run
  `setup()` before your first prediction (tens of seconds for large weights). Keep the
  model warm (steady traffic) or budget for the cold-boot tail on the first request.
- **Streaming**: for token-streaming models iterate the prediction stream instead of
  waiting for the full output — otherwise you buffer the whole response and pay latency
  you did not need to.

```python
# Streaming: consume incrementally instead of blocking for the full output.
for event in replicate.stream("owner/llm:abc123def", input={"prompt": "hi"}):
    print(str(event), end="")
```

## Cost & Polling
- Billing is **per second of prediction compute** — a model left running (an
  un-terminated stuck prediction, or an over-large batch) bills the whole time.
  `replicate.predictions.cancel(id)` stops a runaway job.
- **Do NOT hand-roll a tight polling loop** on `predictions.get(id)` — it hammers the
  API and burns your rate limit. Use `prediction.wait()` (SDK long-poll) for scripts,
  or a **webhook** for services, so you are notified on completion instead of polling.

## Security — API Token & Webhook Verification (CWE-798)
```python
# FOOTGUN (CWE-798): a hard-coded token leaks via source control, logs, and images.
client = replicate.Client(api_token="r8_live_hardcoded")   # NEVER

# RIGHT: read REPLICATE_API_TOKEN from the environment / a secrets manager.
import os
client = replicate.Client(api_token=os.environ["REPLICATE_API_TOKEN"])
```

- Embedding the `r8_...` token in code is **CWE-798 Use of Hard-coded Credentials**
  (cwe.mitre.org/data/definitions/798.html). Keep it in env/secret storage, rotate on
  leak, and scope it to the least privilege needed.
- **Verify webhook signatures.** A webhook URL is public; anyone who learns it can POST
  fake "completed" events. Replicate signs each delivery with an **HMAC-SHA256**
  signature over the payload using your **webhook signing secret** — recompute it and
  compare in constant time before trusting the body. Rejecting unsigned/mismatched
  requests stops forged results from poisoning your pipeline.
  [replicate.com/docs/topics/webhooks/verify-webhook, retrieved 2026-07-10]

## Error Handling Idioms
```python
import replicate
from replicate.exceptions import ReplicateError, ModelError

try:
    out = replicate.run("owner/model:abc123def", input={"prompt": "hi"})
except ModelError as e:
    # the MODEL raised during prediction — inspect the failed prediction for logs.
    logs = e.prediction.logs
except ReplicateError as e:
    # API-level failure (auth, rate limit, invalid version). e.status carries the code;
    # back off + retry on 429/5xx, fail fast on 4xx auth/validation.
    raise
```
- A prediction can also finish with `prediction.status == "failed"` (check `.error`)
  rather than raising — handle the failed terminal state explicitly in async flows.

## Testing Conventions
```python
# Test your Cog predict logic LOCALLY without spending Replicate compute:
#   cog predict -i prompt="hello"      # runs predict() in the built container
# Unit-test the pure inference logic by factoring it out of predict().
def _run(model, prompt): return model.generate(prompt)   # pure, unit-testable

def test_run_logic():
    assert _run(FakeModel(), "hi").startswith("HI")       # no network, no billing
```
- Keep unit tests off the Replicate API (no live predictions in CI); use `cog predict`
  or a fake for the model, and reserve real predictions for a gated integration job.

## Performance Traps
- **Blocking `replicate.run` in a request path** ties up a worker for the whole
  prediction — go async + webhook for anything slow.
- **Cold boots** on scaled-to-zero models add a large first-request tail — keep warm
  or absorb it.
- **Not streaming** token output buffers the whole response before you see anything.
- **Polling loops** waste rate limit and add latency vs `wait()`/webhooks.

## Version-Specific Gotchas (dated, sourced)
- **replicate 1.0.7** (the Python client) is the current release, uploaded **2025-05-27**.
  The 1.x client returns `FileOutput` objects for file outputs (not bare URL strings).
  [pypi.org/project/replicate/, retrieved 2026-07-10]
- **Cog 0.21.0** is the current model-packaging release, published **2026-06-16**.
  [github.com/replicate/cog/releases, retrieved 2026-07-10]
- **Version pinning**: prefer `model:version` (immutable hash) in production; the bare
  `owner/model` resolves to the latest version and is not reproducible.
  [replicate.com/docs/topics/models/versions, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Replicate Python client (PyPI): https://pypi.org/project/replicate/
- Cog releases (GitHub): https://github.com/replicate/cog/releases
- Replicate predictions (sync/async): https://replicate.com/docs/reference/http
- Model versions & pinning: https://replicate.com/docs/topics/models/versions
- Webhooks: https://replicate.com/docs/topics/webhooks
- Verify webhook signatures (HMAC-SHA256): https://replicate.com/docs/topics/webhooks/verify-webhook
- Streaming output: https://replicate.com/docs/topics/predictions/streaming
- CWE-798 (Use of Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
