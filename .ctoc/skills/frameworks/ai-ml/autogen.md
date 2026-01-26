# AutoGen CTO
> Multi-agent conversation framework for complex AI workflows.

## Commands
```bash
# Setup | Dev | Test
pip install pyautogen
python -c "from autogen import AssistantAgent; print('OK')"
pytest tests/ -v
```

## Non-Negotiables
1. Clear agent role definitions with specific capabilities
2. Well-designed conversation patterns
3. Human-in-the-loop configuration for safety
4. Code execution sandboxing (Docker)
5. Proper termination conditions
6. Cost tracking for API usage

## Red Lines
- Unrestricted code execution without sandboxing
- Missing termination logic causing infinite loops
- No conversation turn limits
- Ignoring agent capability boundaries
- Unsafe Docker configuration
- No cost limits on API calls

## Pattern: Production Multi-Agent System
```python
from autogen import AssistantAgent, UserProxyAgent, GroupChat, GroupChatManager
from autogen.coding import DockerCommandLineCodeExecutor

# LLM configuration with cost tracking
config_list = [{
    "model": "gpt-4o",
    "api_key": os.environ["OPENAI_API_KEY"],
}]

llm_config = {
    "config_list": config_list,
    "cache_seed": 42,
    "temperature": 0,
}

# Safe code execution with Docker
code_executor = DockerCommandLineCodeExecutor(
    image="python:3.11-slim",
    timeout=60,
    work_dir="./workspace",
)

# Define specialized agents
planner = AssistantAgent(
    name="Planner",
    system_message="You are a planning expert. Break down tasks into steps.",
    llm_config=llm_config,
)

coder = AssistantAgent(
    name="Coder",
    system_message="You write clean, tested Python code.",
    llm_config=llm_config,
)

reviewer = AssistantAgent(
    name="Reviewer",
    system_message="You review code for bugs and improvements.",
    llm_config=llm_config,
)

# User proxy with safe execution
user_proxy = UserProxyAgent(
    name="User",
    human_input_mode="TERMINATE",  # Or "ALWAYS" for human approval
    max_consecutive_auto_reply=10,
    code_execution_config={"executor": code_executor},
    is_termination_msg=lambda x: "TASK_COMPLETE" in x.get("content", ""),
)

# Group chat for collaboration
group_chat = GroupChat(
    agents=[planner, coder, reviewer, user_proxy],
    messages=[],
    max_round=20,
    speaker_selection_method="auto",
)

manager = GroupChatManager(groupchat=group_chat, llm_config=llm_config)

# Start conversation
user_proxy.initiate_chat(
    manager,
    message="Build a web scraper that extracts article titles from news sites.",
)
```

## Integrates With
- **LLMs**: OpenAI, Azure OpenAI, Anthropic, local models
- **Execution**: Docker, Jupyter, local shell
- **Tools**: Function calling, RAG integration
- **Observability**: Logging, cost tracking

## Common Errors
| Error | Fix |
|-------|-----|
| `Infinite conversation loop` | Add termination conditions, limit max_round |
| `Code execution failed` | Check Docker setup, verify image |
| `API rate limit` | Add delays, implement retries |
| `Agent confusion` | Clarify system messages, use specific roles |

## Prod Ready
- [ ] Code execution sandboxed in Docker
- [ ] Termination conditions defined
- [ ] Conversation limits set (max_round)
- [ ] Human-in-the-loop for critical decisions
- [ ] Cost tracking enabled
- [ ] Agent roles clearly defined
