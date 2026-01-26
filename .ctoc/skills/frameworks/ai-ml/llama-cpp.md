# llama.cpp CTO
> High-performance LLM inference in C++ with minimal dependencies.

## Commands
```bash
# Setup | Dev | Test
pip install llama-cpp-python
# Or build from source with CUDA
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python --force-reinstall --no-cache-dir
python -c "from llama_cpp import Llama; print('OK')"
```

## Non-Negotiables
1. Use GGUF format models (not old GGML)
2. Select quantization based on hardware (Q4_K_M recommended)
3. Configure context size appropriately
4. Enable GPU layer offloading when available
5. Optimize batch size for throughput
6. Manage KV cache for long contexts

## Red Lines
- Using deprecated GGML format
- Missing GPU offload when VRAM available
- Ignoring batch size optimization
- No KV cache management for long sessions
- Wrong quantization for target hardware
- Not validating model after conversion

## Pattern: Production Inference Server
```python
from llama_cpp import Llama
from llama_cpp.llama_chat_format import Llama3ChatHandler
import json

# Load model with optimizations
llm = Llama(
    model_path="llama-3.1-8b-instruct.Q4_K_M.gguf",
    n_ctx=8192,  # Context window
    n_gpu_layers=-1,  # Offload all layers to GPU
    n_batch=512,  # Batch size for prompt processing
    n_threads=8,  # CPU threads for non-GPU ops
    use_mmap=True,  # Memory map model
    chat_format="llama-3",  # Built-in chat format
    verbose=False,
)

# Chat completion (OpenAI-compatible)
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Explain quantum computing in simple terms."}
]

response = llm.create_chat_completion(
    messages=messages,
    max_tokens=512,
    temperature=0.7,
    top_p=0.9,
    stream=False,
)

print(response["choices"][0]["message"]["content"])

# Streaming chat completion
for chunk in llm.create_chat_completion(
    messages=messages,
    max_tokens=512,
    stream=True,
):
    delta = chunk["choices"][0]["delta"]
    if "content" in delta:
        print(delta["content"], end="", flush=True)

# Embeddings
embeddings = llm.create_embedding("Text to embed")["data"][0]["embedding"]

# Grammar-constrained generation
grammar = """
root ::= object
object ::= "{" pair ("," pair)* "}"
pair ::= string ":" value
value ::= string | number | "true" | "false" | "null"
"""
constrained = llm("Generate JSON:", grammar=grammar)
```

## Integrates With
- **APIs**: OpenAI-compatible endpoints
- **Formats**: GGUF, HuggingFace (via conversion)
- **Hardware**: CUDA, Metal, CPU (AVX2/AVX512), Vulkan
- **Deployment**: FastAPI, Docker, edge devices

## Common Errors
| Error | Fix |
|-------|-----|
| `GGML_ASSERT failed` | Update llama.cpp, check model compatibility |
| `CUDA out of memory` | Reduce n_gpu_layers, use smaller quant |
| `Slow generation` | Increase n_batch, enable GPU offload |
| `Chat format error` | Set correct chat_format for model |

## Prod Ready
- [ ] GGUF model validated after conversion
- [ ] GPU offload configured (n_gpu_layers)
- [ ] Batch size optimized for throughput
- [ ] Context size appropriate for use case
- [ ] Streaming enabled for real-time responses
- [ ] Memory mapping enabled for large models
