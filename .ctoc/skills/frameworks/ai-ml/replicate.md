# Replicate CTO
> Deploy and run ML models with a simple API.

## Commands
```bash
# Setup | Dev | Test
pip install replicate cog
cog init
cog predict -i prompt="Hello"
cog push r8.im/username/model
```

## Non-Negotiables
1. Proper Cog packaging with predict.py
2. Clear input/output schema definitions
3. Appropriate GPU hardware selection
4. Model versioning for deployments
5. Prediction webhooks for async workloads
6. Setup method for model loading

## Red Lines
- Missing cog.yaml configuration
- No input validation on predictions
- Wrong hardware tier for model
- No version pinning in production
- Ignoring async predictions for long tasks
- Loading model in predict() instead of setup()

## Pattern: Production Model Deployment
```python
# predict.py
from cog import BasePredictor, Input, Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

class Predictor(BasePredictor):
    def setup(self):
        """Load model into memory once during container start."""
        self.tokenizer = AutoTokenizer.from_pretrained(
            "meta-llama/Llama-3.1-8B-Instruct",
            cache_dir="./model_cache"
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            "meta-llama/Llama-3.1-8B-Instruct",
            torch_dtype=torch.float16,
            device_map="auto",
            cache_dir="./model_cache"
        )

    def predict(
        self,
        prompt: str = Input(description="Input prompt for generation"),
        max_tokens: int = Input(description="Maximum tokens to generate", default=256, ge=1, le=4096),
        temperature: float = Input(description="Sampling temperature", default=0.7, ge=0, le=2),
        top_p: float = Input(description="Top-p sampling", default=0.9, ge=0, le=1),
    ) -> str:
        """Run inference on the model."""
        inputs = self.tokenizer(prompt, return_tensors="pt").to("cuda")

        with torch.inference_mode():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=True,
            )

        response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        return response[len(prompt):]  # Return only generated text
```

```yaml
# cog.yaml
build:
  python_version: "3.11"
  python_packages:
    - torch==2.1.0
    - transformers==4.36.0
    - accelerate==0.25.0
  gpu: true
  cuda: "12.1"

predict: "predict.py:Predictor"
```

```python
# Client usage
import replicate

# Sync prediction
output = replicate.run(
    "username/model:version",
    input={"prompt": "Explain quantum computing:", "max_tokens": 256}
)
print(output)

# Async prediction with webhook
prediction = replicate.predictions.create(
    model="username/model",
    version="abc123",
    input={"prompt": "Long task..."},
    webhook="https://your-server.com/webhook",
    webhook_events_filter=["completed"]
)
```

## Integrates With
- **Packaging**: Cog, Docker
- **Hardware**: CPU, T4, A40, A100
- **APIs**: REST, Python SDK, webhooks
- **Storage**: Model weights caching

## Common Errors
| Error | Fix |
|-------|-----|
| `Model failed to load` | Check setup() method, verify paths |
| `Input validation error` | Add proper Input() constraints |
| `Prediction timeout` | Use webhooks for long predictions |
| `Version not found` | Pin specific version in production |

## Prod Ready
- [ ] cog.yaml configured with dependencies
- [ ] Model loads in setup() not predict()
- [ ] Input validation with constraints
- [ ] Hardware tier appropriate for model
- [ ] Webhooks for async predictions
- [ ] Version pinned in production calls
