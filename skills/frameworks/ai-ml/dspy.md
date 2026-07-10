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

## Compilation Footguns — Signatures, Optimizers & Cached Traces
DSPy's premise is that you write `Signature`s and let a compiler (optimizer) tune
the prompts. The failure modes are all in the compile step.

```python
import dspy
from dspy.teleprompt import BootstrapFewShot, MIPROv2

# FOOTGUN 1 — a Signature is the typed contract; a vague docstring/field desc
# gives the optimizer nothing to optimize against and yields undefined behavior.
class GenerateAnswer(dspy.Signature):
    """Answer the question using ONLY the provided context; cite sources."""
    context = dspy.InputField(desc="retrieved passages (untrusted)")
    question = dspy.InputField()
    answer = dspy.OutputField(desc="grounded answer with citations")

# FOOTGUN 2 — compile() REQUIRES a metric AND a trainset. No metric = nothing to
# optimize; a trivial metric (len > 50) optimizes for length, not correctness.
def metric(example, pred, trace=None) -> bool:
    return example.answer.lower() in pred.answer.lower()   # a REAL correctness check

optimizer = BootstrapFewShot(metric=metric, max_bootstrapped_demos=4)
compiled = optimizer.compile(RAG(), trainset=trainset)   # trainset is mandatory
```

- **FOOTGUN 3 — cached-trace / config staleness.** A compiled program bakes in the
  demos AND the LM it was compiled against. Swapping the LM (or its version) after
  compile silently invalidates the tuned prompts — recompile when the LM changes.
  Save/load explicitly with `compiled.save(...)` / `program.load(...)` and version
  the artifact alongside the LM id.
- **LM-config coupling**: `dspy.configure(lm=...)` is process-global. Two modules
  needing different LMs must scope config (`dspy.context(lm=...)`), or they trample
  each other.

## Cost
Optimizers are expensive: `BootstrapFewShot` runs the program over the trainset to
harvest demonstrations, and `MIPROv2` additionally searches instructions —
**dozens to hundreds of LM calls per compile**. Budget the trainset size and demo
count; compile offline, cache the result, and never recompile on the request path.

## Security — Optimized/Retrieved Prompts Embed Untrusted Content
DSPy folds retrieved passages and bootstrapped demonstrations directly INTO the
prompt. Any of that content is attacker-influenceable → **indirect prompt
injection** (OWASP LLM01, 2025). A poisoned trainset example or retrieved passage
can steer the model or get baked into the compiled program permanently.

- **CVE-2025-12695** — DSPy did not properly restrict file reads (CWE-653,
  Improper Restriction of Security Check). Published 2025-11-04.
  Source: https://github.com/advisories/GHSA-vvw2-h478-xwr3 — keep DSPy patched.
- Treat `context`/passages as untrusted data in the Signature docstring; never let
  a DSPy tool/module read arbitrary attacker-supplied paths or exec model output
  (that would be CWE-94). Sanitize and vet any trainset that gets compiled in.

## Error Handling
```python
try:
    result = compiled(question="...")
except Exception as e:
    # LM provider errors, retrieval failures, and assertion/suggestion violations
    # surface here. Surface them — a failed retrieval yields an ungrounded answer.
    raise RuntimeError(f"DSPy program failed: {e}") from e
```

## Testing
- Use `dspy.Evaluate` on a held-out devset with the SAME metric you compiled
  against, so a signature or optimizer change shows up as a metric regression.
- Keep the trainset/devset split fixed and the LM pinned in tests; both move the score.
- Assert the metric is a real correctness check, not a length/format proxy.

## Version-specific (verified 2026-07-10)
- **dspy 3.2.1** — current stable on PyPI, released 2026-05-05.
  `requires-python >=3.10,<3.15`. The package is `dspy` (renamed from `dspy-ai`).
  Source: https://pypi.org/pypi/dspy/json (retrieved 2026-07-10).
- Configure the LM with `dspy.configure(lm=dspy.LM(...))`. `MIPROv2` and
  `BootstrapFewShot` are the mainstream optimizers.
  Source: https://dspy.ai/ (retrieved 2026-07-10).

## References
- DSPy docs — https://dspy.ai/ (retrieved 2026-07-10)
- PyPI dspy 3.2.1 — https://pypi.org/pypi/dspy/json (retrieved 2026-07-10)
- CVE-2025-12695 improper file-read restriction (CWE-653) — https://github.com/advisories/GHSA-vvw2-h478-xwr3 (published 2025-11-04)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
- OWASP GenAI / LLM Top 10 — LLM01 Prompt Injection — https://genai.owasp.org/llm-top-10/ (retrieved 2026-07-10)
