# vLLM CTO
> High-throughput LLM inference with PagedAttention for production serving.

## Commands
```bash
# Setup | Dev | Test
pip install vllm
python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3.1-8B-Instruct --port 8000
curl http://localhost:8000/v1/completions -d '{"model": "meta-llama/Llama-3.1-8B-Instruct", "prompt": "Hello"}'
```

## Non-Negotiables
1. PagedAttention for memory efficiency
2. Continuous batching for throughput
3. Quantization (AWQ, GPTQ) for large models
4. Tensor parallelism for multi-GPU
5. OpenAI-compatible API for drop-in replacement
6. Proper KV cache configuration

## Red Lines
- Running without quantization for large models
- Single GPU for models requiring parallelism
- Ignoring memory profiling
- Not using continuous batching
- Sync inference when async available
- No health monitoring in production

## Pattern: Production Deployment
```python
from vllm import LLM, SamplingParams
from vllm.entrypoints.openai.api_server import run_server

# Offline batch inference
llm = LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    quantization="awq",
    tensor_parallel_size=2,  # Multi-GPU
    gpu_memory_utilization=0.9,
    max_model_len=8192,
)

sampling_params = SamplingParams(
    temperature=0.7,
    top_p=0.9,
    max_tokens=512,
)

prompts = ["Explain quantum computing", "What is machine learning?"]
outputs = llm.generate(prompts, sampling_params)

for output in outputs:
    print(output.outputs[0].text)

# Online serving with OpenAI-compatible API
# python -m vllm.entrypoints.openai.api_server \
#     --model meta-llama/Llama-3.1-8B-Instruct \
#     --quantization awq \
#     --tensor-parallel-size 2 \
#     --max-model-len 8192

# Client usage (OpenAI SDK compatible)
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="dummy")
response = client.chat.completions.create(
    model="meta-llama/Llama-3.1-8B-Instruct",
    messages=[{"role": "user", "content": "Hello"}],
)
```

## Integrates With
- **Models**: HuggingFace, AWQ, GPTQ quantized
- **APIs**: OpenAI SDK, LangChain, LlamaIndex
- **Deployment**: Docker, Kubernetes, Ray Serve
- **Monitoring**: Prometheus, Grafana

## Common Errors
| Error | Fix |
|-------|-----|
| `CUDA out of memory` | Reduce gpu_memory_utilization, use quantization |
| `Model too large` | Enable tensor_parallel_size across GPUs |
| `KV cache too small` | Increase gpu_memory_utilization, reduce max_model_len |
| `Tokenizer mismatch` | Use matching tokenizer from HuggingFace |

## Prod Ready
- [ ] Quantization enabled for memory efficiency
- [ ] Tensor parallelism configured for multi-GPU
- [ ] OpenAI-compatible API deployed
- [ ] Health checks and metrics exposed
- [ ] GPU memory profiled and optimized
- [ ] Continuous batching enabled
