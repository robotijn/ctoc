# AutoGen CTO
> Multi-agent conversation framework.

## Non-Negotiables
1. Agent role definition
2. Conversation patterns
3. Human-in-the-loop config
4. Code execution safety
5. Termination conditions

## Red Lines
- Unrestricted code execution
- Missing termination logic
- No conversation limits
- Ignoring agent capabilities
- Unsafe Docker config

## Pattern
```python
from autogen import AssistantAgent, UserProxyAgent

assistant = AssistantAgent("assistant", llm_config=config)
user = UserProxyAgent("user", human_input_mode="TERMINATE")
user.initiate_chat(assistant, message="Task description")
```
