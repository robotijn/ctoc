# Semantic Kernel CTO
> Microsoft's AI orchestration SDK.

## Non-Negotiables
1. Plugin architecture
2. Planner selection
3. Memory connectors
4. Function calling
5. Prompt templates

## Red Lines
- Hardcoded prompts
- Missing error handling
- No memory strategy
- Ignoring token limits
- Unsafe function execution

## Pattern
```python
import semantic_kernel as sk

kernel = sk.Kernel()
kernel.add_chat_service("gpt4", AzureChatCompletion(...))
kernel.import_plugin(MyPlugin(), "myPlugin")
result = await kernel.invoke(function, input="query")
```
