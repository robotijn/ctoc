# OpenAI SDK CTO
> Production-grade GPT API integration with cost optimization.

## Commands
```bash
# Setup | Dev | Test
pip install openai tiktoken
export OPENAI_API_KEY="sk-..."
pytest tests/ -v && python -c "from openai import OpenAI; print(OpenAI().models.list())"
```

## Non-Negotiables
1. Async client (`AsyncOpenAI`) for throughput
2. Exponential backoff with tenacity or built-in retries
3. Structured outputs with `response_format`
4. Streaming for real-time user experience
5. tiktoken for accurate token counting
6. Cost tracking per request

## Red Lines
- No rate limit handling in production
- Exceeding context window without chunking
- No cost monitoring or budget alerts
- Synchronous calls in async applications
- Hardcoded API keys in code
- Missing error handling for API failures

## Pattern: Production API Integration
```python
import asyncio
from openai import AsyncOpenAI
from pydantic import BaseModel
import tiktoken

class Response(BaseModel):
    answer: str
    confidence: float
    sources: list[str]

client = AsyncOpenAI(max_retries=3, timeout=30.0)
encoder = tiktoken.encoding_for_model("gpt-4o")

async def query(prompt: str) -> Response:
    # Token counting for cost tracking
    input_tokens = len(encoder.encode(prompt))

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format=Response,
        temperature=0,
    )

    return response.choices[0].message.parsed

# Streaming example
async def stream_response(prompt: str):
    async with client.beta.chat.completions.stream(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
```

## Integrates With
- **Frameworks**: LangChain, LlamaIndex
- **Monitoring**: LangSmith, Helicone, Portkey
- **Caching**: Redis, GPTCache
- **Vector DBs**: Pinecone, Chroma

## Common Errors
| Error | Fix |
|-------|-----|
| `RateLimitError` | Implement exponential backoff, use `max_retries` |
| `InvalidRequestError: max tokens` | Use tiktoken to count tokens, chunk inputs |
| `AuthenticationError` | Verify API key, check environment variable |
| `Timeout` | Increase timeout, use streaming for long responses |

## Prod Ready
- [ ] Async client used for all API calls
- [ ] Structured outputs with Pydantic models
- [ ] Token usage tracked and logged
- [ ] Rate limiting with exponential backoff
- [ ] API key stored in environment variables
- [ ] Cost alerts configured per project
