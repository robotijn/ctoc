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
