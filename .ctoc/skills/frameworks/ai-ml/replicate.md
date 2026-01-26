# Replicate CTO
> ML model deployment platform.

## Non-Negotiables
1. Cog packaging
2. Input/output schemas
3. GPU configuration
4. Model versioning
5. Prediction webhooks

## Red Lines
- Missing cog.yaml
- No input validation
- Wrong hardware tier
- No version pinning
- Ignoring async predictions

## Pattern
```python
# predict.py
from cog import BasePredictor, Input

class Predictor(BasePredictor):
    def setup(self):
        self.model = load_model()

    def predict(self, prompt: str = Input(description="Input prompt")) -> str:
        return self.model.generate(prompt)
```
