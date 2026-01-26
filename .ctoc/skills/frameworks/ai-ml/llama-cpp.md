# llama.cpp CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# CPU only
pip install llama-cpp-python
# With CUDA (recommended)
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python --force-reinstall --no-cache-dir
# With Metal (macOS)
CMAKE_ARGS="-DGGML_METAL=on" pip install llama-cpp-python
```

## Claude's Common Mistakes
1. Using deprecated GGML format instead of GGUF
2. Missing `n_gpu_layers` for GPU acceleration
3. Not setting `chat_format` for instruct models
4. Ignoring `n_batch` for prompt processing speed
5. Using sync API in async applications

## Correct Patterns (2026)
```python
from llama_cpp import Llama

# Load with full optimizations
llm = Llama(
    model_path="llama-3.1-8b-instruct.Q4_K_M.gguf",
    n_ctx=8192,           # Context window
    n_gpu_layers=-1,      # Offload all to GPU
    n_batch=512,          # Batch size for prompt processing
    n_threads=8,          # CPU threads for non-GPU ops
    use_mmap=True,
    chat_format="llama-3", # CRITICAL for instruct models
    verbose=False,
)

# Chat completion (OpenAI-compatible)
response = llm.create_chat_completion(
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain quantum computing."}
    ],
    max_tokens=512,
    temperature=0.7,
)
print(response["choices"][0]["message"]["content"])

# Streaming chat
for chunk in llm.create_chat_completion(
    messages=[{"role": "user", "content": "Write a story."}],
    stream=True,
):
    delta = chunk["choices"][0]["delta"]
    if "content" in delta:
        print(delta["content"], end="", flush=True)

# Grammar-constrained generation (JSON output)
grammar = '''
root ::= object
object ::= "{" pair ("," pair)* "}"
pair ::= string ":" value
string ::= "\"" [a-z]+ "\""
value ::= string | "true" | "false"
'''
constrained = llm("Generate JSON:", grammar=grammar)
```

## Version Gotchas
- **chat_format**: Must match model (llama-3, chatml, alpaca, etc.)
- **GGUF only**: GGML deprecated, convert with `convert_hf_to_gguf.py`
- **n_batch**: Higher = faster prompt processing, uses more VRAM
- **Rebuild**: Need `--force-reinstall` when changing CUDA/Metal flags

## What NOT to Do
- Do NOT use GGML format - use GGUF only
- Do NOT skip `chat_format` for instruct models
- Do NOT forget `n_gpu_layers` when GPU available
- Do NOT use default `n_batch` (512) for long prompts
- Do NOT forget `--force-reinstall` when changing build flags
