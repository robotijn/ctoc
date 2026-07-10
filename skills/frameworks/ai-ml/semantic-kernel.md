# Semantic Kernel CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Semantic Kernel merging with AutoGen into Microsoft Agent Framework
pip install semantic-kernel
# For new projects, consider:
pip install agent-framework  # Microsoft Agent Framework (preview)
```

## Claude's Common Mistakes
1. Using deprecated plugin decorators (use `kernel_function`)
2. Missing context injection for plugin functions
3. Not using Handlebars prompt templates (new default)
4. Ignoring streaming for chat interfaces
5. Using old planner APIs (use Function Calling)

## Correct Patterns (2026)
```python
import semantic_kernel as sk
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion
from semantic_kernel.functions import kernel_function
from semantic_kernel.prompt_template import HandlebarsPromptTemplate

# Initialize kernel
kernel = sk.Kernel()

# Add OpenAI service
kernel.add_service(OpenAIChatCompletion(
    ai_model_id="gpt-4o",
    api_key=os.environ["OPENAI_API_KEY"],
))

# Plugin with proper decorators
class WeatherPlugin:
    @kernel_function(description="Get weather for a city")
    def get_weather(self, city: str) -> str:
        return f"Weather in {city}: 72F, Sunny"

kernel.add_plugin(WeatherPlugin(), plugin_name="weather")

# Handlebars prompt template (new default)
prompt = """{{#if instructions}}{{instructions}}{{/if}}
User: {{input}}
Assistant:"""

template = HandlebarsPromptTemplate(
    template=prompt,
    template_format="handlebars",
)

# Invoke with function calling
result = await kernel.invoke_prompt(
    prompt,
    input="What's the weather in Seattle?",
    instructions="Use the weather plugin to answer.",
)

# Streaming
async for chunk in kernel.invoke_stream("chat", prompt="Hello"):
    print(chunk, end="")
```

## Version Gotchas
- **2025-2026**: Merging with AutoGen into Microsoft Agent Framework
- **Templates**: Handlebars is new default, Jinja2 still supported
- **Planners**: Deprecated - use function calling instead
- **Plugins**: Use `@kernel_function` not old decorators

## What NOT to Do
- Do NOT use deprecated planners - use function calling
- Do NOT use old `@sk_function` decorator - use `@kernel_function`
- Do NOT ignore streaming for interactive applications
- Do NOT skip plugin descriptions (needed for function calling)
- Do NOT ignore Microsoft Agent Framework for new projects

## Planner & Plugin Footguns
In Semantic Kernel the model selects and invokes your plugin functions
(`@kernel_function`) via function calling. Two things go wrong: the schemas the
model sees, and the non-determinism of what it decides to call.

```python
from semantic_kernel.functions import kernel_function
from typing import Annotated

class MathPlugin:
    # FOOTGUN — the description + parameter annotations ARE the schema the model
    # reasons over. Vague descriptions cause wrong-function selection and bad args.
    @kernel_function(description="Add two integers and return the sum")
    def add(
        self,
        a: Annotated[int, "first addend"],
        b: Annotated[int, "second addend"],
    ) -> Annotated[int, "the sum"]:
        return a + b
```

- **Argument binding**: `KernelFunction` binds arguments by name from
  `KernelArguments`. A typo or a missing annotation means the model passes the
  wrong value or the call fails at invocation — validate/convert inside the function.
- **Planner non-determinism**: function-calling (which replaced the deprecated
  Sequential/Stepwise planners) picks a different tool sequence run-to-run. Do not
  assume a fixed plan; make each function idempotent and independently safe.
- **Token budget**: every plugin's schema is sent on every turn. Dozens of plugins
  blow the context window and raise cost — register only the plugins a call needs.

## Concurrency
```python
# The Python kernel is async-first: await invocation, iterate streaming responses.
result = await kernel.invoke(add_fn, a=2, b=3)
async for chunk in kernel.invoke_stream(chat_fn, input="Hello"):
    print(chunk, end="")
```
Use filters/hooks (function-invocation filters) for cross-cutting logging,
retries, and — critically — argument validation before a native function runs.

## Performance & Cost
- **Plugin-schema token cost dominates.** Every registered plugin's function
  schemas are serialized into the prompt on every turn. Registering dozens of
  plugins inflates input tokens on each call and can crowd out the actual context —
  register only the plugins a given kernel invocation needs.
- **Stream long responses** (`invoke_stream`) so interactive latency is first-token,
  not full-completion, bound.
- **Reuse the kernel and services** rather than reconstructing them per request;
  service/client setup is not free.

## Security — Plugins Are Code the Model Can Invoke (CWE-94)
A native `@kernel_function` is real code (shell, HTTP, DB, filesystem) that the
model chooses to call, with arguments it generates. If those arguments reach a
`subprocess`, `eval`, or SQL string unchecked, model output becomes executed code —
**CWE-94 Code Injection** (and CWE-78 for shell). The model's choice can be steered
by **prompt injection via memory/RAG** (OWASP LLM01, 2025): poisoned text loaded
into the kernel's memory can instruct it to call a dangerous plugin.

```python
# UNSAFE — a plugin that execs model-supplied strings is a code-injection sink.
# @kernel_function(description="run python")
# def run(self, code: str) -> str:
#     return str(eval(code))          # NEVER — CWE-94

# SAFE — plugins do ONE narrow, validated thing; no eval, no shell=True, least
# privilege. Validate arguments in a function-invocation filter before execution.
```

- Treat any text retrieved into memory as untrusted instructions, not just data.
- Give plugins the minimum privilege they need; never a general code/shell executor.

## Error Handling
```python
try:
    result = await kernel.invoke(fn, **args)
except Exception as e:
    # Service errors, function-invocation failures, and JSON-schema/arg-binding
    # errors surface here. Surface them; a swallowed plugin error yields a wrong
    # or empty answer the model may then narrate as success.
    raise RuntimeError(f"kernel.invoke failed: {e}") from e
```

## Testing
- Unit-test native functions directly (they are plain methods) with malformed and
  malicious arguments; assert validation rejects them before any side effect.
- Assert the plugin's `@kernel_function` description/annotations exist — they are the
  contract the model depends on and must not silently drift.

## Version-specific (verified 2026-07-10)
- **semantic-kernel (Python) 1.44.0** — current stable on PyPI, released 2026-07-07.
  `requires-python >=3.10`. Source: https://pypi.org/pypi/semantic-kernel/json (retrieved 2026-07-10).
- Planners are deprecated in favor of function calling; use `@kernel_function`
  (not the old `@sk_function`). Handlebars is the default prompt template format,
  Jinja2 still supported. Semantic Kernel and AutoGen are converging into the
  Microsoft Agent Framework for new projects.
  Source: https://learn.microsoft.com/en-us/semantic-kernel/overview/ (retrieved 2026-07-10).

## References
- Semantic Kernel docs — https://learn.microsoft.com/en-us/semantic-kernel/overview/ (retrieved 2026-07-10)
- PyPI semantic-kernel 1.44.0 — https://pypi.org/pypi/semantic-kernel/json (retrieved 2026-07-10)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
- CWE-78 OS Command Injection — https://cwe.mitre.org/data/definitions/78.html (retrieved 2026-07-10)
- OWASP GenAI / LLM Top 10 — LLM01 Prompt Injection — https://genai.owasp.org/llm-top-10/ (retrieved 2026-07-10)
