# DSPy CTO
> Programming-not-prompting framework for foundation models.

## Commands
```bash
# Setup | Dev | Test
pip install dspy-ai
python -c "import dspy; print(dspy.__version__)"
pytest tests/ -v
```

## Non-Negotiables
1. Clear signature definitions for inputs/outputs
2. Module composition for complex pipelines
3. Optimizer selection based on task type
4. Metric functions for evaluation
5. Compiled prompts for production
6. Few-shot examples in training sets

## Red Lines
- Manual prompt engineering instead of compilation
- Missing signatures causing undefined behavior
- No optimization before deployment
- Ignoring evaluation metrics
- Hardcoded examples instead of learned
- Not using assertions for validation

## Pattern: Production RAG Pipeline
```python
import dspy
from dspy.teleprompt import BootstrapFewShot

# Configure LM
lm = dspy.OpenAI(model="gpt-4o", max_tokens=1000)
dspy.settings.configure(lm=lm)

# Define signatures
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
        prediction = self.generate(context=context, question=question)
        return dspy.Prediction(
            context=context,
            answer=prediction.answer
        )

# Define metric
def validate_answer(example, pred, trace=None):
    # Check answer quality
    has_citation = any(doc in pred.answer for doc in pred.context)
    is_relevant = len(pred.answer) > 50
    return has_citation and is_relevant

# Compile with optimizer
trainset = [
    dspy.Example(question="What is RAG?", answer="RAG is...").with_inputs("question"),
    # More examples...
]

optimizer = BootstrapFewShot(metric=validate_answer, max_bootstrapped_demos=4)
compiled_rag = optimizer.compile(RAG(), trainset=trainset)

# Use compiled module
result = compiled_rag(question="Explain machine learning")
print(result.answer)

# Save compiled module
compiled_rag.save("rag_compiled.json")
```

## Integrates With
- **LLMs**: OpenAI, Anthropic, local models
- **Retrievers**: ColBERTv2, Pinecone, Weaviate
- **Optimizers**: BootstrapFewShot, MIPRO, BayesianSignatureOptimizer
- **Evaluation**: Custom metrics, assertions

## Common Errors
| Error | Fix |
|-------|-----|
| `Signature mismatch` | Verify input/output field names match |
| `Optimization failed` | Increase trainset size, adjust metric |
| `Module not compiled` | Call optimizer.compile() before use |
| `LM rate limit` | Add caching, reduce optimization iterations |

## Prod Ready
- [ ] Signatures clearly defined
- [ ] Module compiled with optimizer
- [ ] Metrics validate output quality
- [ ] Trainset covers edge cases
- [ ] Compiled module saved for deployment
- [ ] Assertions guard against failures
