# vLLM CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v0.14+ requires Python 3.10-3.13, CUDA 12.9
pip install vllm
# Verify: python -c "from vllm import LLM; print('OK')"
# CPU requires glibc >= 2.35 (Ubuntu 22.04+)
```

## Claude's Common Mistakes
1. Using deprecated `VLLM_ATTENTION_BACKEND` env var - use AttentionConfig
2. Running large models without quantization (AWQ/GPTQ)
3. Missing `tensor_parallel_size` for multi-GPU
4. Not using OpenAI-compatible API for existing integrations
5. Ignoring `gpu_memory_utilization` causing OOM

## Correct Patterns (2026)
```python
from vllm import LLM, SamplingParams

# Load with quantization and multi-GPU
llm = LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    quantization="awq",  # or "gptq"
    tensor_parallel_size=2,  # Multi-GPU
    gpu_memory_utilization=0.9,
    max_model_len=8192,
)

# Sampling params
sampling_params = SamplingParams(
    temperature=0.7,
    top_p=0.9,
    max_tokens=512,
)

# Batch inference
prompts = ["Explain AI:", "What is ML?"]
outputs = llm.generate(prompts, sampling_params)

for output in outputs:
    print(output.outputs[0].text)

# Production: Use OpenAI-compatible server
# python -m vllm.entrypoints.openai.api_server \
#     --model meta-llama/Llama-3.1-8B-Instruct \
#     --quantization awq --tensor-parallel-size 2

# Client (OpenAI SDK compatible)
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="dummy")
response = client.chat.completions.create(
    model="meta-llama/Llama-3.1-8B-Instruct",
    messages=[{"role": "user", "content": "Hello"}],
)
```

## Version Gotchas
- **v0.14+**: Removed AQLM quantization, original Marlin format
- **v0.10+**: Python 3.12 recommended
- **v0.9.x**: Requires transformers < 4.54.0
- **Breaking**: `AttentionConfig` replaces `VLLM_ATTENTION_BACKEND` env var

## What NOT to Do
- Do NOT skip quantization for models > 7B
- Do NOT use single GPU for models requiring parallelism
- Do NOT ignore `gpu_memory_utilization` setting
- Do NOT use deprecated attention backend env vars
- Do NOT forget OpenAI-compatible API for drop-in replacement
