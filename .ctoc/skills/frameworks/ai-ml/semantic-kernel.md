# Semantic Kernel CTO
> Microsoft's enterprise-grade AI orchestration SDK for .NET, Python, and Java.

## Commands
```bash
# Setup | Dev | Test
pip install semantic-kernel
python -c "import semantic_kernel as sk; print('OK')"
pytest tests/ -v
```

## Non-Negotiables
1. Plugin architecture for modular functionality
2. Appropriate planner selection for task complexity
3. Memory connectors for context persistence
4. Function calling with proper error handling
5. Prompt templates with variables
6. Token management and limits

## Red Lines
- Hardcoded prompts without templates
- Missing error handling for AI calls
- No memory strategy for conversations
- Ignoring token limits causing truncation
- Unsafe function execution without validation
- Not using plugins for reusable functionality

## Pattern: Production AI Application
```python
import semantic_kernel as sk
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion
from semantic_kernel.core_plugins import TextPlugin
from semantic_kernel.functions import kernel_function
from semantic_kernel.prompt_template import PromptTemplateConfig

# Initialize kernel
kernel = sk.Kernel()

# Add AI service
kernel.add_service(
    AzureChatCompletion(
        deployment_name="gpt-4o",
        endpoint="https://your-endpoint.openai.azure.com",
        api_key="your-key",
    )
)

# Create a custom plugin
class ResearchPlugin:
    @kernel_function(description="Search for information on a topic")
    async def search(self, query: str) -> str:
        # Implementation
        return f"Results for: {query}"

    @kernel_function(description="Summarize text")
    async def summarize(self, text: str) -> str:
        return f"Summary: {text[:100]}..."

# Register plugins
kernel.add_plugin(ResearchPlugin(), "research")
kernel.add_plugin(TextPlugin(), "text")

# Create prompt function
prompt = """
{{$history}}
User: {{$input}}
Assistant: Let me help you with that.
"""

prompt_config = PromptTemplateConfig(
    template=prompt,
    execution_settings={
        "default": {"max_tokens": 1000, "temperature": 0.7}
    }
)

chat_function = kernel.add_function(
    plugin_name="chat",
    function_name="respond",
    prompt_template_config=prompt_config,
)

# Execute with context
result = await kernel.invoke(
    chat_function,
    input="What is machine learning?",
    history="Previous conversation context"
)
print(result)
```

## Integrates With
- **LLMs**: Azure OpenAI, OpenAI, HuggingFace
- **Memory**: Azure AI Search, Chroma, Pinecone
- **Tools**: Native functions, OpenAPI plugins
- **Languages**: Python, .NET, Java

## Common Errors
| Error | Fix |
|-------|-----|
| `Service not found` | Verify service added with add_service() |
| `Token limit exceeded` | Reduce prompt size, increase max_tokens |
| `Plugin not registered` | Check add_plugin() call |
| `Function not found` | Verify function_name matches decorator |

## Prod Ready
- [ ] Plugins modularize functionality
- [ ] Prompt templates use variables
- [ ] Error handling for all AI calls
- [ ] Memory connector configured
- [ ] Token limits respected
- [ ] Functions validated before execution
