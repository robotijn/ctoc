# GGML CTO
> Lightweight tensor library for efficient ML inference on CPUs and GPUs.

## Commands
```bash
# Setup | Dev | Test
pip install ggml  # Python bindings
# Or build from source
git clone https://github.com/ggerganov/ggml && cd ggml && mkdir build && cd build && cmake .. && make
./bin/test-ggml
```

## Non-Negotiables
1. Select appropriate quantization format (Q4_K_M, Q5_K_M)
2. Enable memory mapping for large models
3. Plan context size based on available memory
4. Configure thread count for CPU inference
5. Validate model conversion before deployment
6. Use GGUF format (successor to GGML)

## Red Lines
- Wrong quantization for target hardware
- Missing memory mapping for large models
- Ignoring context size limits
- No thread optimization for multi-core
- Using unconverted model formats
- Skipping conversion validation

## Pattern: Model Conversion and Inference
```python
# Convert HuggingFace model to GGUF (using llama.cpp tools)
# python convert_hf_to_gguf.py meta-llama/Llama-3.1-8B --outtype q4_k_m

# Using GGML through llama-cpp-python
from llama_cpp import Llama

# Configure for optimal performance
llm = Llama(
    model_path="llama-3.1-8b.Q4_K_M.gguf",
    n_ctx=4096,  # Context size
    n_threads=8,  # CPU threads
    n_gpu_layers=35,  # GPU offload layers
    use_mmap=True,  # Memory mapping
    use_mlock=False,  # Lock in RAM (requires privileges)
    verbose=False,
)

# Inference
output = llm(
    "Explain quantum computing:",
    max_tokens=256,
    temperature=0.7,
    top_p=0.9,
    stop=["User:", "\n\n"],
)

print(output["choices"][0]["text"])

# Streaming
for chunk in llm(
    "Write a poem about AI:",
    max_tokens=256,
    stream=True,
):
    print(chunk["choices"][0]["text"], end="", flush=True)
```

## Integrates With
- **Inference**: llama.cpp, llama-cpp-python
- **Formats**: GGUF, safetensors (via conversion)
- **Hardware**: CPU (AVX2/AVX512), CUDA, Metal
- **Deployment**: Local, edge devices, servers

## Common Errors
| Error | Fix |
|-------|-----|
| `Model format not supported` | Convert to GGUF format |
| `Out of memory` | Use smaller quantization, enable mmap |
| `Slow inference` | Increase n_gpu_layers, optimize n_threads |
| `Context too long` | Reduce n_ctx, use sliding window |

## Prod Ready
- [ ] Model converted to GGUF format
- [ ] Quantization appropriate for hardware
- [ ] Memory mapping enabled
- [ ] Thread count optimized for CPU
- [ ] GPU layers configured if available
- [ ] Context size validated
