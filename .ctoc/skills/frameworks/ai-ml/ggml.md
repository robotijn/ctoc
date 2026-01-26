# GGML/GGUF CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# GGML is typically used via llama-cpp-python
pip install llama-cpp-python
# For CUDA: CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python
# Models use GGUF format (successor to GGML)
```

## Claude's Common Mistakes
1. Using old GGML format instead of GGUF
2. Wrong quantization for hardware (Q4_K_M is usually best)
3. Not enabling memory mapping for large models
4. Missing `n_gpu_layers` when GPU available
5. Default context size too small

## Correct Patterns (2026)
```python
from llama_cpp import Llama

# Load GGUF model with optimizations
llm = Llama(
    model_path="llama-3.1-8b.Q4_K_M.gguf",  # GGUF format, not GGML
    n_ctx=4096,           # Context window
    n_threads=8,          # CPU threads
    n_gpu_layers=-1,      # -1 = offload all layers to GPU
    use_mmap=True,        # Memory map for efficiency
    use_mlock=False,      # Set True if you have permissions
    verbose=False,
)

# Basic inference
output = llm(
    "Explain quantum computing:",
    max_tokens=256,
    temperature=0.7,
    top_p=0.9,
    stop=["User:", "\n\n"],
)
print(output["choices"][0]["text"])

# Streaming
for chunk in llm("Write a poem:", max_tokens=256, stream=True):
    print(chunk["choices"][0]["text"], end="", flush=True)

# Chat completion (OpenAI-compatible)
response = llm.create_chat_completion(
    messages=[
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Hello!"}
    ],
    max_tokens=256,
)
```

## Version Gotchas
- **GGUF**: Current format, GGML is deprecated
- **Quantization**: Q4_K_M best balance, Q5_K_M for quality, Q4_0 for size
- **n_gpu_layers**: Use -1 for full GPU, reduce if OOM
- **Context**: Default 512, most models support 4096+

## What NOT to Do
- Do NOT use GGML format - convert to GGUF
- Do NOT skip `n_gpu_layers` when GPU available
- Do NOT use default context size (512) - set explicitly
- Do NOT forget `use_mmap=True` for large models
- Do NOT use Q8_0 unless quality critical (slow)
