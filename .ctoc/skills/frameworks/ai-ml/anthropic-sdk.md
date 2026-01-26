# Anthropic SDK CTO
> Production Claude API integration with enterprise-grade reliability.

## Commands
```bash
# Setup | Dev | Test
pip install anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
pytest tests/ -v && python -c "from anthropic import Anthropic; print(Anthropic().messages.create(model='claude-sonnet-4-20250514', max_tokens=10, messages=[{'role':'user','content':'Hi'}]))"
```

## Non-Negotiables
1. XML tags for structured prompts
2. Tool use for structured outputs
3. Streaming for real-time responses
4. Prompt caching for repeated prefixes
5. Appropriate max_tokens settings
6. Async client for throughput

## Red Lines
- No error handling for API failures
- Ignoring prompt caching for repeated calls
- max_tokens too high wasting budget
- Synchronous calls in async applications
- Not using tool_use for structured data
- Hardcoded API keys in code

## Pattern: Production API Integration
```python
import anthropic
from anthropic import AsyncAnthropic

client = AsyncAnthropic()

# Tool-based structured output
tools = [{
    "name": "extract_data",
    "description": "Extract structured data from text",
    "input_schema": {
        "type": "object",
        "properties": {
            "entities": {"type": "array", "items": {"type": "string"}},
            "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
            "confidence": {"type": "number"}
        },
        "required": ["entities", "sentiment", "confidence"]
    }
}]

async def analyze(text: str):
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        tools=tools,
        messages=[{
            "role": "user",
            "content": f"<document>{text}</document>\n\nExtract entities and sentiment."
        }]
    )

    for block in response.content:
        if block.type == "tool_use":
            return block.input
    return None

# Streaming with prompt caching
async def stream_with_cache(system: str, user: str):
    async with client.messages.stream(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}]
    ) as stream:
        async for text in stream.text_stream:
            yield text
```

## Integrates With
- **Frameworks**: LangChain, LlamaIndex
- **Monitoring**: LangSmith, Helicone
- **Caching**: Redis for response caching
- **Vector DBs**: Any via embeddings API

## Common Errors
| Error | Fix |
|-------|-----|
| `RateLimitError` | Implement backoff, use async batching |
| `InvalidRequestError: max_tokens` | Reduce max_tokens, check model limits |
| `OverloadedError` | Retry with exponential backoff |
| `PromptTooLongError` | Reduce context, use summarization |

## Prod Ready
- [ ] Async client used for all API calls
- [ ] Tool use for structured outputs
- [ ] Prompt caching enabled for repeated prefixes
- [ ] Streaming implemented for UX
- [ ] API key stored in environment variables
- [ ] Usage tracked and logged per request
