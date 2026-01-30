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
