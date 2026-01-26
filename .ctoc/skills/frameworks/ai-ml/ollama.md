# Ollama CTO
> Run large language models locally with production-grade simplicity.

## Commands
```bash
# Setup | Dev | Test
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b-instruct-q4_K_M
ollama serve && ollama run llama3.1
```

## Non-Negotiables
1. Choose appropriate model size for hardware
2. Use quantized models (Q4_K_M or Q5_K_M) for efficiency
3. Enable streaming for responsive UX
4. Use ollama-python for API integration
5. Configure context length appropriately
6. Monitor GPU memory usage

## Red Lines
- Running unquantized models on consumer hardware
- Ignoring context length limits
- Not streaming for interactive applications
- Using models too large for available VRAM
- No health checks in production
- Blocking calls without timeouts

## Pattern: Production API Integration
```python
import ollama
from ollama import AsyncClient

# Synchronous usage
response = ollama.chat(
    model="llama3.1:8b-instruct-q4_K_M",
    messages=[{"role": "user", "content": "Explain quantum computing"}],
    options={"temperature": 0.7, "num_ctx": 4096}
)
print(response["message"]["content"])

# Async streaming for production
async def stream_response(prompt: str):
    client = AsyncClient()
    async for chunk in await client.chat(
        model="llama3.1:8b-instruct-q4_K_M",
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    ):
        yield chunk["message"]["content"]

# Embeddings for RAG
embeddings = ollama.embeddings(
    model="nomic-embed-text",
    prompt="Document text for embedding"
)
vector = embeddings["embedding"]

# Model management
ollama.pull("llama3.1:8b-instruct-q4_K_M")
ollama.list()  # List available models
ollama.show("llama3.1")  # Model details
```

## Integrates With
- **Frameworks**: LangChain, LlamaIndex
- **APIs**: OpenAI-compatible endpoint
- **Deployment**: Docker, Kubernetes
- **Hardware**: NVIDIA GPUs, Apple Silicon, CPU

## Common Errors
| Error | Fix |
|-------|-----|
| `CUDA out of memory` | Use smaller quantization (Q4_0), reduce num_ctx |
| `Connection refused` | Ensure `ollama serve` is running |
| `Model not found` | Run `ollama pull model_name` first |
| `Timeout` | Increase timeout, check model is loaded |

## Prod Ready
- [ ] Model pulled and tested locally
- [ ] Quantization appropriate for hardware
- [ ] Context length configured for use case
- [ ] Streaming enabled for user-facing apps
- [ ] Health endpoint monitored
- [ ] GPU memory usage profiled
