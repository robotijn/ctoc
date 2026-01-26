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
    model="claude-sonnet-4-20250514",
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
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    system=[{"type": "text", "text": long_system_prompt,
             "cache_control": {"type": "ephemeral"}}],  # Cache this
    messages=[{"role": "user", "content": user_input}]
) as stream:
    async for text in stream.text_stream:
        yield text
```

## Version Gotchas
- **Claude 4**: Use `claude-sonnet-4-20250514` or `claude-opus-4-20250514`
- **Caching**: Use `cache_control: {"type": "ephemeral"}` on system prompts
- **Bedrock/Vertex**: Different auth - use extras packages
- **Tool use**: Claude prefers tools over JSON mode for structured output

## What NOT to Do
- Do NOT use JSON mode when tool_use is cleaner
- Do NOT skip prompt caching for repeated system prompts
- Do NOT set max_tokens higher than needed
- Do NOT forget XML tags for document/context sections
- Do NOT use sync client in async applications
