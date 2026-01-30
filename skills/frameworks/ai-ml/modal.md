# Modal CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install modal
modal token new  # Authenticate
# Run: modal run app.py
# Deploy: modal deploy app.py
```

## Claude's Common Mistakes
1. Hardcoded secrets in code (use Modal secrets)
2. Wrong GPU type for model size
3. Missing image dependencies causing import failures
4. No volume for large model weights
5. Loading model in `@method` instead of `@enter`

## Correct Patterns (2026)
```python
import modal

app = modal.App("ml-inference")

# Define image with all dependencies
image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch", "transformers", "accelerate"
).run_commands("pip install flash-attn --no-build-isolation")

# Volume for model weights (persists across runs)
volume = modal.Volume.from_name("model-weights", create_if_missing=True)

@app.cls(
    gpu=modal.gpu.A100(count=1, memory=40),  # Match GPU to model
    image=image,
    volumes={"/models": volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
    container_idle_timeout=300,
    allow_concurrent_inputs=10,
)
class Inference:
    @modal.enter()  # Load model ONCE at container start
    def load_model(self):
        from transformers import AutoModelForCausalLM, AutoTokenizer
        import torch

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

@app.local_entrypoint()
def main():
    inference = Inference()
    print(inference.generate.remote("Hello, world!"))
```

## Version Gotchas
- **GPU selection**: A100-40GB for 8B models, A100-80GB/H100 for 70B
- **@modal.enter()**: Runs once when container starts (for model loading)
- **Volumes**: Required for large model weights to avoid re-download
- **Secrets**: Use `modal secret create` for API keys

## What NOT to Do
- Do NOT hardcode secrets - use Modal secrets
- Do NOT load model in `@method` - use `@modal.enter()`
- Do NOT skip volumes for large models (slow cold starts)
- Do NOT use wrong GPU for model size
- Do NOT forget `container_idle_timeout` (wastes money)
