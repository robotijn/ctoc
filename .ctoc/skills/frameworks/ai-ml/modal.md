# Modal CTO
> Serverless ML infrastructure.

## Non-Negotiables
1. Function decorators
2. GPU selection
3. Image definition
4. Volume mounts
5. Secrets management

## Red Lines
- Hardcoded secrets
- Wrong GPU type
- Missing image dependencies
- No volume for models
- Ignoring cold start

## Pattern
```python
import modal

app = modal.App("my-app")
image = modal.Image.debian_slim().pip_install("torch")

@app.function(gpu="A100", image=image)
def inference(prompt: str) -> str:
    return model.generate(prompt)
```
