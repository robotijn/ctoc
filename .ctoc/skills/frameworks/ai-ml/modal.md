# Modal CTO
> Serverless cloud infrastructure for ML workloads.

## Commands
```bash
# Setup | Dev | Test
pip install modal
modal token new
modal run app.py
modal deploy app.py
```

## Non-Negotiables
1. Use function decorators for compute units
2. Select appropriate GPU type for workload
3. Define container images with dependencies
4. Use volumes for model persistence
5. Manage secrets securely
6. Handle cold starts appropriately

## Red Lines
- Hardcoded secrets in code
- Wrong GPU type for model size
- Missing image dependencies causing failures
- No volume for large model weights
- Ignoring cold start latency
- Not using stub for organization

## Pattern: Production ML Inference
```python
import modal

# Define app and image
app = modal.App("ml-inference")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch",
    "transformers",
    "accelerate",
).run_commands(
    "pip install flash-attn --no-build-isolation"
)

# Volume for model weights
volume = modal.Volume.from_name("model-weights", create_if_missing=True)

# GPU function with model caching
@app.cls(
    gpu=modal.gpu.A100(count=1, memory=40),
    image=image,
    volumes={"/models": volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
    container_idle_timeout=300,
    allow_concurrent_inputs=10,
)
class Inference:
    @modal.enter()
    def load_model(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.tokenizer = AutoTokenizer.from_pretrained(
            "meta-llama/Llama-3.1-8B-Instruct",
            cache_dir="/models"
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            "meta-llama/Llama-3.1-8B-Instruct",
            torch_dtype=torch.float16,
            device_map="auto",
            cache_dir="/models"
        )

    @modal.method()
    def generate(self, prompt: str, max_tokens: int = 256) -> str:
        inputs = self.tokenizer(prompt, return_tensors="pt").to("cuda")
        outputs = self.model.generate(**inputs, max_new_tokens=max_tokens)
        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)

# Web endpoint
@app.function(image=image)
@modal.web_endpoint(method="POST")
def inference_endpoint(request: dict):
    inference = Inference()
    return {"response": inference.generate.remote(request["prompt"])}

# Local entrypoint for testing
@app.local_entrypoint()
def main():
    inference = Inference()
    result = inference.generate.remote("Explain quantum computing:")
    print(result)
```

## Integrates With
- **GPUs**: A100, A10G, T4, H100
- **Storage**: Volumes, CloudBucketMount
- **APIs**: Web endpoints, webhooks
- **Frameworks**: PyTorch, TensorFlow, JAX

## Common Errors
| Error | Fix |
|-------|-----|
| `GPU not available` | Check GPU quota, use different type |
| `Import error` | Add dependency to Image definition |
| `Volume not found` | Create volume with create_if_missing=True |
| `Cold start timeout` | Use @modal.enter() for model loading |

## Prod Ready
- [ ] GPU type matches workload requirements
- [ ] Image includes all dependencies
- [ ] Volumes persist model weights
- [ ] Secrets stored securely
- [ ] Cold start handled with @modal.enter()
- [ ] Concurrent inputs configured
