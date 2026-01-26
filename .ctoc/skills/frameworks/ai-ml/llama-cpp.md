# llama.cpp CTO
> Efficient LLM inference in C++.

## Non-Negotiables
1. GGUF format models
2. Proper quantization selection
3. Context size configuration
4. GPU layer offloading
5. Batch size optimization

## Red Lines
- Old GGML format
- Missing GPU offload
- Ignoring batch size
- No KV cache management
- Wrong quant for hardware

## Pattern
```python
from llama_cpp import Llama

llm = Llama(
    model_path="model.gguf",
    n_ctx=4096,
    n_gpu_layers=35,
    n_batch=512
)
```
