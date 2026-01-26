# DSPy CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install dspy
# Verify: python -c "import dspy; print(dspy.__version__)"
# Note: Package name changed from dspy-ai to dspy
```

## Claude's Common Mistakes
1. Manual prompt engineering instead of using compilation
2. Missing signatures causing undefined behavior
3. No optimization before deployment
4. Skipping evaluation metrics
5. Hardcoded examples instead of learned few-shots

## Correct Patterns (2026)
```python
import dspy

# Configure LM
dspy.configure(lm=dspy.LM("openai/gpt-4o", max_tokens=1000))
# For Anthropic: dspy.LM("anthropic/claude-sonnet-4-20250514")
# For local: dspy.LM("ollama_chat/llama3.2")

# Define signatures with clear contracts
class GenerateAnswer(dspy.Signature):
    """Answer questions based on provided context."""
    context = dspy.InputField(desc="Retrieved documents")
    question = dspy.InputField()
    answer = dspy.OutputField(desc="Detailed answer with citations")

# Build module
class RAG(dspy.Module):
    def __init__(self, num_passages=3):
        super().__init__()
        self.retrieve = dspy.Retrieve(k=num_passages)
        self.generate = dspy.ChainOfThought(GenerateAnswer)

    def forward(self, question):
        context = self.retrieve(question).passages
        return self.generate(context=context, question=question)

# Define metric for optimization
def validate_answer(example, pred, trace=None):
    has_content = len(pred.answer) > 50
    return has_content

# Compile with optimizer
from dspy.teleprompt import BootstrapFewShot
trainset = [dspy.Example(question="What is RAG?", answer="...").with_inputs("question")]

optimizer = BootstrapFewShot(metric=validate_answer, max_bootstrapped_demos=4)
compiled_rag = optimizer.compile(RAG(), trainset=trainset)

# Use and save compiled module
result = compiled_rag(question="Explain machine learning")
compiled_rag.save("rag_compiled.json")
```

## Version Gotchas
- **Package name**: Changed from `dspy-ai` to `dspy`
- **LM config**: Use `dspy.configure(lm=...)` not `dspy.settings`
- **Signatures**: Clear descriptions improve compilation
- **Optimizers**: BootstrapFewShot for most cases, MIPRO for complex

## What NOT to Do
- Do NOT manually engineer prompts - use compilation
- Do NOT skip signature definitions
- Do NOT deploy without optimization/compilation
- Do NOT ignore evaluation metrics
- Do NOT use hardcoded examples - let optimizer learn them
