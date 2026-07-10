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

## Agent-Loop Footguns — Unbounded Cost & Deadlock
An agent conversation is a loop over paid LLM calls. Without a hard ceiling it can
run until your budget or rate limit is exhausted. AutoGen v0.4+ (the redesigned
`autogen-agentchat` API) makes termination an explicit, composable condition — use it.

```python
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.conditions import MaxMessageTermination, TextMentionTermination

# FOOTGUN — no termination = infinite agent-to-agent loop = unbounded token spend.
# ALWAYS compose a hard message cap with a semantic stop, OR-combined:
termination = MaxMessageTermination(max_messages=20) | TextMentionTermination("TASK_COMPLETE")

team = RoundRobinGroupChat([planner, coder], termination_condition=termination)
# max_messages is the circuit breaker; the text mention is the happy-path exit.
```

- **Deadlock / livelock**: two agents can ping-pong ("you go first" / "no, you")
  forever without producing the stop token. The `MaxMessageTermination` cap is the
  ONLY reliable backstop — a semantic-only condition can never fire.
- **Cost blowup**: group chat is O(agents × rounds) LLM calls. A 5-agent, 20-round
  chat is up to 100 completions per task. Cap `max_messages` and prefer the smallest
  team that solves the task.
- **Legacy v0.2 (`pyautogen`)** used `max_consecutive_auto_reply` and `max_round`;
  the v0.4 line replaces both with termination conditions. Do not mix the two APIs.

## Concurrency
AutoGen v0.4 is built on an async, event-driven actor runtime — agents exchange
messages asynchronously.

```python
import asyncio

async def main():
    result = await team.run(task="Build a web scraper")
    print(result.messages[-1].content)

asyncio.run(main())  # the v0.4 API is async-first; await team.run / run_stream
```

Do NOT block the event loop with synchronous I/O inside a custom agent — it stalls
every other agent. Use async tool implementations.

## Security — Code Execution Is the Core Trust Boundary (CWE-94)
An AutoGen coder agent's whole purpose is to generate and RUN code. The generated
code is, in effect, attacker-influenced (via prompt injection through task input or
tool output). Executing it locally is **CWE-94 Improper Control of Generation of
Code ('Code Injection')** — the model can be steered into `rm -rf`, exfiltration,
or lateral movement.

```python
from autogen_ext.code_executors.docker import DockerCommandLineCodeExecutor

# SAFE — never run generated code on the host. Sandbox it in a disposable container
# with a timeout and no host mounts / no credentials in the image.
executor = DockerCommandLineCodeExecutor(image="python:3.13-slim", timeout=60)

# UNSAFE — LocalCommandLineCodeExecutor runs generated code directly on the host.
# Only ever acceptable inside an already-isolated, throwaway CI sandbox.
```

- Also treat any tool output fed back into the chat as untrusted (indirect prompt
  injection, OWASP LLM01, 2025) — it can carry instructions that redirect the coder.
- Never bake API keys or cloud credentials into the executor image or `work_dir`.

## Error Handling
```python
try:
    result = await team.run(task="...")
except Exception as e:
    # Provider rate limits, code-executor timeouts, and container-start failures
    # surface here. Surface them — a swallowed executor failure silently drops the
    # agent's work and can loop retrying at full cost.
    raise RuntimeError(f"AutoGen team run failed: {e}") from e
```

## Testing
- Assert the termination condition fires: run with a low `max_messages` and assert
  the run stops and reports the stop reason, so a regression can't reintroduce an
  unbounded loop.
- Mock ONLY the model client (an external dependency) via a scripted/replay client;
  never mock the executor or termination logic — that is the code under test.

## Version-specific (verified 2026-07-10)
- **AutoGen v0.4+ redesign** — install `autogen-agentchat` + `autogen-ext[...]`.
  Current `autogen-agentchat` is **0.7.5**, released 2025-09-30.
  Sources: https://pypi.org/pypi/autogen-agentchat/json (retrieved 2026-07-10);
  https://github.com/microsoft/autogen/releases (tag python-v0.7.5, 2025-09-30).
- Legacy `pyautogen` (v0.2 API, current **0.10.0**, 2025-07-15) is the old
  `AssistantAgent`/`UserProxyAgent`/`GroupChat` API and is in maintenance — new
  projects should use the v0.4 `autogen-agentchat` API or Microsoft Agent Framework.
  Source: https://pypi.org/pypi/pyautogen/json (retrieved 2026-07-10).

## References
- AutoGen docs — https://microsoft.github.io/autogen/stable/ (retrieved 2026-07-10)
- PyPI autogen-agentchat 0.7.5 — https://pypi.org/pypi/autogen-agentchat/json (retrieved 2026-07-10)
- GitHub releases (python-v0.7.5, 2025-09-30) — https://github.com/microsoft/autogen/releases (retrieved 2026-07-10)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
- OWASP GenAI / LLM Top 10 — LLM01 Prompt Injection — https://genai.owasp.org/llm-top-10/ (retrieved 2026-07-10)
