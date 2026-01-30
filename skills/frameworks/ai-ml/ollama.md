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
