# AutoGen CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# AutoGen merging with Semantic Kernel into Microsoft Agent Framework
# For new projects, consider:
pip install agent-framework  # Microsoft Agent Framework (preview)
# Or continue with AutoGen:
pip install pyautogen
```

## Claude's Common Mistakes
1. Missing termination conditions causing infinite loops
2. Code execution without Docker sandboxing
3. No `max_consecutive_auto_reply` limit
4. Using AutoGen when Microsoft Agent Framework is better fit
5. Vague agent roles causing confusion

## Correct Patterns (2026)
```python
from autogen import AssistantAgent, UserProxyAgent, GroupChat, GroupChatManager
from autogen.coding import DockerCommandLineCodeExecutor

# LLM config with caching
config_list = [{"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]}]
llm_config = {"config_list": config_list, "cache_seed": 42, "temperature": 0}

# Safe code execution with Docker
code_executor = DockerCommandLineCodeExecutor(
    image="python:3.11-slim",
    timeout=60,
    work_dir="./workspace",
)

# Specialized agents with clear roles
planner = AssistantAgent(
    name="Planner",
    system_message="Break down tasks into clear steps. Output 'TASK_COMPLETE' when done.",
    llm_config=llm_config,
)

coder = AssistantAgent(
    name="Coder",
    system_message="Write clean, tested Python code only.",
    llm_config=llm_config,
)

# User proxy with STRICT limits
user_proxy = UserProxyAgent(
    name="User",
    human_input_mode="TERMINATE",  # Or "ALWAYS" for approval
    max_consecutive_auto_reply=10, # CRITICAL: Prevent infinite loops
    code_execution_config={"executor": code_executor},
    is_termination_msg=lambda x: "TASK_COMPLETE" in x.get("content", ""),
)

# Group chat with round limit
group_chat = GroupChat(
    agents=[planner, coder, user_proxy],
    messages=[],
    max_round=20,  # Hard limit
)

manager = GroupChatManager(groupchat=group_chat, llm_config=llm_config)
user_proxy.initiate_chat(manager, message="Build a web scraper")
```

## Version Gotchas
- **2025-2026**: AutoGen merging into Microsoft Agent Framework
- **Agent Framework GA**: Expected Q1 2026 with stable APIs
- **Migration**: Similar API but new workflow graph approach
- **Maintenance**: AutoGen getting security fixes only

## What NOT to Do
- Do NOT skip termination conditions - causes infinite loops
- Do NOT execute code without Docker sandboxing
- Do NOT forget `max_consecutive_auto_reply` limit
- Do NOT use vague agent system messages
- Do NOT ignore Microsoft Agent Framework for new projects
