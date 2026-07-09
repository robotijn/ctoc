# Anthropic SDK CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v0.76+ requires Python 3.8+
pip install anthropic
# For AWS Bedrock: pip install "anthropic[bedrock]"
# For Google Vertex: pip install "anthropic[vertex]"
# Set API key: export ANTHROPIC_API_KEY="sk-ant-..."
```

## Claude's Common Mistakes
1. Not using tool_use for structured outputs (Claude's native approach)
2. Missing `cache_control` for prompt caching on repeated prefixes
3. Using sync client in async applications
4. Setting `max_tokens` too high (wastes budget)
5. Not using XML tags for structured prompts

## Correct Patterns (2026)
```python
from anthropic import Anthropic, AsyncAnthropic

client = Anthropic()
async_client = AsyncAnthropic()

# Tool-based structured output (Claude's native approach)
tools = [{
    "name": "extract_data",
    "description": "Extract structured information",
    "input_schema": {
        "type": "object",
        "properties": {
            "entities": {"type": "array", "items": {"type": "string"}},
            "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
        },
        "required": ["entities", "sentiment"]
    }
}]

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "<document>Text here</document>\nExtract data."}]
)

# Get tool result
for block in response.content:
    if block.type == "tool_use":
        result = block.input  # Structured data

# Streaming with prompt caching
async with async_client.messages.stream(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    system=[{"type": "text", "text": long_system_prompt,
             "cache_control": {"type": "ephemeral"}}],  # Cache this
    messages=[{"role": "user", "content": user_input}]
) as stream:
    async for text in stream.text_stream:
        yield text
```

## Version Gotchas
- **Current models**: Use `claude-sonnet-4-6` or `claude-opus-4-8` (see the
  web-verified Current Model IDs table below — do not paste a stale dated alias)
- **Caching**: Use `cache_control: {"type": "ephemeral"}` on system prompts
- **Bedrock/Vertex**: Different auth - use extras packages
- **Tool use**: Claude prefers tools over JSON mode for structured output

## What NOT to Do
- Do NOT use JSON mode when tool_use is cleaner
- Do NOT skip prompt caching for repeated system prompts
- Do NOT set max_tokens higher than needed
- Do NOT forget XML tags for document/context sections
- Do NOT use sync client in async applications

## Current Model IDs (web-verified — never write one from memory)
Use ONLY these real, current Claude model IDs. Writing an invented / half-remembered
model string is the top failure mode here — the API returns a 404
`not_found_error` and the app breaks in production, not at review.

| Model | Model ID |
|-------|----------|
| Claude Fable 5 | `claude-fable-5` |
| Claude Opus 4.8 | `claude-opus-4-8` |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` |

- Prefer the **dated/pinned** alias for reproducibility where one exists (e.g.
  `claude-haiku-4-5-20251001`); an unpinned alias can silently shift when a new
  point release lands. List live IDs with `client.models.list()` before hard-coding.
- Source: docs.anthropic.com model overview; anthropic-sdk-python README example.
  See References. [retrieved 2026-07-09]

## Async vs Sync Client Selection
```python
import os, asyncio
from anthropic import Anthropic, AsyncAnthropic

# Key comes from the environment — NEVER a literal in code.
sync = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=3, timeout=30)
aio  = AsyncAnthropic(max_retries=3, timeout=30)   # reads ANTHROPIC_API_KEY too

# FOOTGUN: a sync client inside an event loop blocks it — every concurrent
# request serializes behind one HTTP call. In FastAPI/asyncio, use AsyncAnthropic.
async def fan_out(prompts: list[str]) -> list[str]:
    async def one(p: str) -> str:
        msg = await aio.messages.create(
            model="claude-sonnet-4-6",           # real, verified model id
            max_tokens=512,
            messages=[{"role": "user", "content": p}],
        )
        return msg.content[0].text
    return await asyncio.gather(*(one(p) for p in prompts))
```
- `max_retries` (default retries with exponential backoff) + `timeout` are required
  for production — a transient 429/529 otherwise surfaces as an unhandled exception.

## Prompt Caching Footguns (`cache_control` placement)
Prompt caching bills cached-prefix reads at a large discount but has sharp edges:

```python
resp = client.messages.create(
    model="claude-opus-4-8",                     # real, verified model id
    max_tokens=1024,
    system=[{
        "type": "text",
        "text": long_static_context,             # big, STABLE prefix
        "cache_control": {"type": "ephemeral"},  # cache breakpoint HERE
    }],
    messages=[{"role": "user", "content": volatile_user_input}],
)
```
- **Placement is prefix-exact**: the cache matches from the start of the prompt up
  to the `cache_control` breakpoint. Put the breakpoint AFTER the large stable
  content (system prompt, tool defs, long document) and BEFORE the volatile user
  turn. A single changed byte before the breakpoint invalidates the whole cache.
- **`ephemeral` caches are short-lived** (a few minutes idle TTL), not persistent —
  they pay off for burst/repeated calls sharing a prefix, not for once-a-day calls.
- **Cache invalidation triggers**: changing the model ID, the system text, tool
  definitions, or anything before the breakpoint busts the cache and you pay full
  write cost again. Order your prompt static-first, volatile-last.
- Source: docs.anthropic.com prompt caching. See References. [retrieved 2026-07-09]

## Token-Budget & Context Management
```python
# Count BEFORE sending — do not guess and get truncated mid-generation.
count = client.messages.count_tokens(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": big_document}],
)
# FOOTGUN: max_tokens caps the RESPONSE, not the context window. Setting it huge
# does not raise the input limit; it only lets the model ramble and burn budget.
# Set max_tokens to the realistic response size; watch response.stop_reason ==
# "max_tokens" (truncated) vs "end_turn" (complete).
```
- Prompt (input) + `max_tokens` (output) together must fit the model's context
  window; a request exceeding it is rejected. Trim/paginate long documents; cache
  the stable part (see above) so you re-send tokens cheaply.

## Security: `tool_use` Schema Validation & Prompt Injection
Claude's native structured output is a tool call, and the returned `input` is
**model-generated JSON — validate it before use**, exactly like untrusted input:

```python
from pydantic import BaseModel, ValidationError

class Extracted(BaseModel):
    entities: list[str]
    sentiment: str

for block in response.content:
    if block.type == "tool_use":
        try:
            data = Extracted.model_validate(block.input)   # VALIDATE, don't trust
        except ValidationError:
            ...  # re-prompt or fail loudly — never pass raw block.input downstream
```
- A tool-enabled Claude flow that executes actions has the same prompt-injection
  exposure as any agent: sanitize retrieved/user text, allow-list tool actions,
  and gate irreversible tools with a human approval step.

## Error Handling, Retries & Rate Limits
```python
import anthropic

try:
    msg = client.messages.create(model="claude-haiku-4-5-20251001",
                                 max_tokens=256, messages=[...])
except anthropic.RateLimitError:      # HTTP 429 — honor Retry-After, back off
    ...
except anthropic.APIStatusError as e: # 5xx incl. 529 overloaded_error
    if e.status_code == 529:
        ...  # transient overload — retry with backoff
except anthropic.APIConnectionError:  # network — retried by max_retries already
    ...
```
- The SDK retries 408/409/429/5xx automatically up to `max_retries`; catch the
  final raised error, never assume a call succeeded.

## Testing (no live API, no key required)
```python
import pytest
from unittest.mock import patch

def test_extraction_validates(monkeypatch):
    # Unit tests must NOT hit the paid API or require ANTHROPIC_API_KEY. Assert
    # your OWN validation/branching around a fabricated response object; do not
    # test Anthropic's server.
    ...
```

## Version-Specific Gotchas (dated, sourced)
- **anthropic 0.116.0** is the current SDK release, uploaded **2026-07-02**,
  `requires_python >=3.9`. [pypi.org/project/anthropic, retrieved 2026-07-09]
- Model IDs above are the current Claude models; prefer pinned/dated aliases.
  [docs.anthropic.com model overview, retrieved 2026-07-09]
- Bedrock (`anthropic[bedrock]`) and Vertex (`anthropic[vertex]`) use different
  auth AND different model-ID forms — do not reuse the direct-API IDs verbatim.

## References (retrieved 2026-07-09)
- Anthropic SDK (PyPI): https://pypi.org/project/anthropic/
- anthropic-sdk-python: https://github.com/anthropics/anthropic-sdk-python
- Claude models overview: https://docs.anthropic.com/en/docs/about-claude/models
- Prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Tool use: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- OWASP Top 10 for LLMs (Prompt Injection): https://owasp.org/www-project-top-10-for-large-language-model-applications/
