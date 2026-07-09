# OpenAI SDK CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v2.15+ requires Python 3.9+
pip install openai
# Optional extras: pip install "openai[realtime,voice-helpers]"
# Set API key: export OPENAI_API_KEY="sk-..."
```

## Claude's Common Mistakes
1. Using deprecated `openai.ChatCompletion.create()` - use client instance
2. Missing `AsyncOpenAI` for async applications
3. Using `response_format={"type": "json_object"}` instead of Pydantic
4. Not using `client.beta.chat.completions.parse()` for structured output
5. Forgetting `max_retries` parameter for production reliability

## Correct Patterns (2026)
```python
from openai import OpenAI, AsyncOpenAI
from pydantic import BaseModel

# Sync client with retries
client = OpenAI(max_retries=3, timeout=30.0)

# Structured output with Pydantic (preferred method)
class Answer(BaseModel):
    response: str
    confidence: float
    sources: list[str]

response = client.beta.chat.completions.parse(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain RAG"}],
    response_format=Answer,
)
result = response.choices[0].message.parsed  # Typed Pydantic object

# Async for web applications
async_client = AsyncOpenAI(max_retries=3)

async def stream_response(prompt: str):
    async with async_client.chat.completions.stream(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
```

## Version Gotchas
- **v2.0+**: Must use `OpenAI()` client instance, not module-level calls
- **v2.15+**: New Responses API (`client.responses.create`) for simple use
- **Agents SDK**: Separate package `openai-agents` for multi-agent workflows
- **Structured output**: Use `client.beta.chat.completions.parse()` with Pydantic

## What NOT to Do
- Do NOT use `openai.ChatCompletion.create()` - deprecated v1 API
- Do NOT use sync client in async applications - use `AsyncOpenAI`
- Do NOT hardcode API keys - use environment variables
- Do NOT skip `max_retries` in production
- Do NOT use JSON mode when Pydantic structured output is available

## Current Model IDs (web-verified — never write one from memory)
Use ONLY real, current OpenAI model IDs. An invented model string returns a
`model_not_found` 404 and breaks in production, not at review.

| Family | Model ID |
|--------|----------|
| Flagship chat | `gpt-5.5` |
| Prior flagship | `gpt-5.4` |
| Pinned structured-output example | `gpt-4o-2024-08-06` |
| Realtime (voice/audio) | `gpt-realtime-2` |

- Prefer a **dated/pinned** snapshot (e.g. `gpt-4o-2024-08-06`) for reproducibility;
  an unpinned family alias can shift under you. Call `client.models.list()` to see
  the live catalog before hard-coding.
- Source: openai-python official README (v2.44.0, main) example models;
  platform.openai.com/docs/models. See References. [retrieved 2026-07-09]

## Client-Instance Migration (v0.x → v1+, still the #1 stale pattern)
```python
# DEPRECATED (openai < 1.0) — module-level calls. These no longer exist in v1+:
#   import openai
#   openai.api_key = "..."
#   openai.ChatCompletion.create(model=..., messages=...)   # AttributeError in v2

# CURRENT — a client instance you construct and reuse:
import os
from openai import OpenAI, AsyncOpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"],   # env var, never a literal
                max_retries=3, timeout=30.0)
resp = client.chat.completions.create(
    model="gpt-5.5",                                     # real, verified model id
    messages=[{"role": "user", "content": "hi"}],
)
```
- Reuse ONE client (it holds a pooled HTTP connection); do not construct a new
  `OpenAI()` per request.

## Structured Output: `parse()` vs JSON mode
`client.chat.completions.parse()` is the typed, schema-enforced path and is now a
**stable** method (it graduated out of `client.beta`). Prefer it over raw JSON mode.

```python
from pydantic import BaseModel

class MathResponse(BaseModel):
    steps: list[str]
    final_answer: str

completion = client.chat.completions.parse(
    model="gpt-4o-2024-08-06",              # pinned snapshot for reproducibility
    messages=[{"role": "user", "content": "solve 8x + 31 = 2"}],
    response_format=MathResponse,           # Pydantic → JSON Schema, enforced
)
msg = completion.choices[0].message
if msg.parsed:
    print(msg.parsed.final_answer)          # typed object
else:
    print(msg.refusal)                      # ALWAYS handle a model refusal
```
- **Footgun**: `.parse()` still refuses; a refusal leaves `message.parsed is None`
  and populates `message.refusal`. Branch on it — never assume `.parsed` is set.
- `response_format={"type": "json_object"}` (bare JSON mode) does NOT enforce your
  schema — the model can return valid JSON with wrong/missing fields. Use `parse()`.

## Async Client Selection
```python
import asyncio
from openai import AsyncOpenAI

aio = AsyncOpenAI(max_retries=3, timeout=30.0)

# FOOTGUN: a sync OpenAI() call inside an event loop blocks it and serializes
# every request. In FastAPI/asyncio use AsyncOpenAI + gather for concurrency.
async def fan_out(prompts: list[str]) -> list[str]:
    async def one(p: str) -> str:
        r = await aio.chat.completions.create(
            model="gpt-5.5", messages=[{"role": "user", "content": p}])
        return r.choices[0].message.content
    return await asyncio.gather(*(one(p) for p in prompts))

async def stream(prompt: str):
    async with aio.chat.completions.stream(
        model="gpt-5.5", messages=[{"role": "user", "content": prompt}],
    ) as s:
        async for event in s:
            if event.type == "content.delta":
                yield event.delta
```

## Retries, Rate Limits & Backoff
```python
import openai

client = OpenAI(max_retries=5, timeout=30.0)   # SDK retries 429/5xx w/ backoff
try:
    resp = client.chat.completions.create(model="gpt-5.5", messages=[...])
except openai.RateLimitError:        # 429 — SDK already retried max_retries times
    ...                              # shed load / queue; honor Retry-After header
except openai.APIStatusError as e:   # 5xx server-side
    ...
except openai.APITimeoutError:       # exceeded `timeout`
    ...
```
- `max_retries` defaults to 2; production APIs should raise it and set an explicit
  `timeout`. The SDK retries 408/409/429/5xx with exponential backoff automatically.
- Never build your own naive retry loop on top without a cap — you will amplify a
  provider outage into a self-inflicted rate-limit storm.

## Security & Prompt Injection
- Keys come from `OPENAI_API_KEY` / a secrets manager — **never a literal in code**,
  never committed. The SDK reads the env var by default.
- If the model can call tools/functions, its output drives actions: validate every
  function-call argument against a strict schema before executing, allow-list tool
  actions, and gate irreversible tools behind human approval — untrusted text in the
  context can carry injected instructions (OWASP LLM01 Prompt Injection).

## Performance & Token-Cost Traps
- **Stream for latency**: `client.chat.completions.stream(...)` (or `stream=True`)
  returns first tokens immediately — do not block a user request on the full
  completion. Async streaming (`AsyncOpenAI`) frees the event loop between chunks.
- **`max_tokens` caps the response, not the context**: setting it huge only lets
  the model ramble and burn budget; size it to the realistic answer and check
  `choices[0].finish_reason == "length"` (truncated) vs `"stop"` (complete).
- **Reuse one client**: it holds a pooled HTTP connection — constructing a new
  `OpenAI()` per request adds TLS-handshake latency on every call.
- **Batch/concurrency**: fan out with `AsyncOpenAI` + `asyncio.gather` rather than
  a serial loop; respect the account rate limit so you do not self-inflict 429s.

## Testing (no live API, no key required)
```python
def test_parse_branch_handles_refusal():
    # Unit tests must NOT hit the paid API or require OPENAI_API_KEY. Assert your
    # OWN refusal/None branching around a fabricated completion; do not test
    # OpenAI's server. Integration tests that hit the API are opt-in + gated.
    ...
```

## Version-Specific Gotchas (dated, sourced)
- **openai 2.44.0** is the current SDK release, uploaded **2026-06-24**,
  `requires_python >=3.9`. [pypi.org/project/openai, retrieved 2026-07-09]
- `client.chat.completions.parse()` is stable (moved out of `client.beta`); the
  Responses API (`client.responses.*`) is the newer unified surface.
  [github.com/openai/openai-python README v2.44.0, retrieved 2026-07-09]
- Multi-agent workflows live in the separate `openai-agents` package, not this SDK.

## References (retrieved 2026-07-09)
- OpenAI SDK (PyPI): https://pypi.org/project/openai/
- openai-python: https://github.com/openai/openai-python
- Models: https://platform.openai.com/docs/models
- Structured outputs: https://platform.openai.com/docs/guides/structured-outputs
- OWASP Top 10 for LLMs (Prompt Injection): https://owasp.org/www-project-top-10-for-large-language-model-applications/
