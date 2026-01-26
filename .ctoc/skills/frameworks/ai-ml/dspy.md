# DSPy CTO
> Programming with foundation models.

## Non-Negotiables
1. Signature definitions
2. Module composition
3. Optimizer selection
4. Metric functions
5. Compiled prompts

## Red Lines
- Manual prompt engineering
- Missing signatures
- No optimization
- Ignoring metrics
- Hardcoded examples

## Pattern
```python
import dspy

class RAG(dspy.Module):
    def __init__(self):
        self.retrieve = dspy.Retrieve(k=3)
        self.generate = dspy.ChainOfThought("context, question -> answer")

    def forward(self, question):
        context = self.retrieve(question).passages
        return self.generate(context=context, question=question)
```
