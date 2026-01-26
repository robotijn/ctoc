# Replicate CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v2 SDK in beta - use --pre flag for latest
pip install replicate --pre
pip install cog  # For model packaging
# Set API key: export REPLICATE_API_TOKEN="r8_..."
```

## Claude's Common Mistakes
1. Loading model in `predict()` instead of `setup()`
2. Missing input validation with `Input()` constraints
3. Using sync client for long-running predictions
4. Not pinning model versions in production
5. Ignoring FileOutput for file responses (v2 change)

## Correct Patterns (2026)
```python
# predict.py for Cog
from cog import BasePredictor, Input, Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

class Predictor(BasePredictor):
    def setup(self):
        """Load model ONCE during container start."""
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
        prompt: str = Input(description="Input prompt"),
        max_tokens: int = Input(default=256, ge=1, le=4096),
        temperature: float = Input(default=0.7, ge=0, le=2),
    ) -> str:
        """Run inference."""
        inputs = self.tokenizer(prompt, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            outputs = self.model.generate(**inputs, max_new_tokens=max_tokens, temperature=temperature)
        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)
```

```python
# Client usage
import replicate

# Sync prediction (v2 returns FileOutput for files)
output = replicate.run(
    "username/model:version",  # ALWAYS pin version in production
    input={"prompt": "Hello", "max_tokens": 256}
)
print(output)

# Async prediction with webhook (for long tasks)
prediction = replicate.predictions.create(
    model="username/model",
    version="abc123",
    input={"prompt": "Long task..."},
    webhook="https://your-server.com/webhook",
    webhook_events_filter=["completed"]
)
```

## Version Gotchas
- **v2 SDK**: Returns `FileOutput` for files, not URL strings
- **v2 migration**: Check migration guide for breaking changes
- **Version pinning**: Always use `model:version` in production
- **Webhooks**: Required for predictions > 60 seconds

## What NOT to Do
- Do NOT load model in `predict()` - use `setup()`
- Do NOT skip `Input()` validation constraints
- Do NOT use sync client for long predictions - use webhooks
- Do NOT skip version pinning in production
- Do NOT ignore v2 FileOutput changes
