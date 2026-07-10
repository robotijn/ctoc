# CrewAI CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# CrewAI uses uv by default. Requires Python 3.10-3.13.
pip install crewai crewai-tools
# Or with uv (recommended by CrewAI):
uv pip install crewai crewai-tools
# Create project: crewai create crew my_crew
```

## Claude's Common Mistakes
1. Using deprecated `from langchain_openai import ChatOpenAI` for LLM config
2. Missing `max_iter` limits causing infinite agent loops
3. Not setting `allow_delegation=False` when delegation not needed
4. Forgetting `output_file` for task results persistence
5. Using wrong process type (sequential vs hierarchical)

## Correct Patterns (2026)
```python
from crewai import Agent, Task, Crew, Process, LLM

# Use CrewAI's native LLM wrapper (not LangChain)
llm = LLM(model="gpt-4o", temperature=0)

# Agent with proper guardrails
researcher = Agent(
    role="Senior Research Analyst",
    goal="Find accurate, sourced information",
    backstory="Expert researcher with analytical skills",
    llm=llm,
    max_iter=5,  # CRITICAL: Prevent runaway loops
    allow_delegation=False,
    verbose=True,
)

# Task with explicit output
research_task = Task(
    description="Research {topic} and provide key findings",
    expected_output="Bullet-point summary with sources",
    agent=researcher,
    output_file="research.md",  # Persist results
)

# Crew with memory
crew = Crew(
    agents=[researcher],
    tasks=[research_task],
    process=Process.sequential,
    memory=True,
    verbose=True,
)

result = crew.kickoff(inputs={"topic": "AI agents"})
```

## Version Gotchas
- **2026**: CrewAI is independent of LangChain - use native LLM wrapper
- **Tools**: Import from `crewai_tools`, not `langchain`
- **Memory**: Enable with `memory=True` on Crew, not individual agents
- **Process**: Use `Process.hierarchical` only for manager-worker patterns

## What NOT to Do
- Do NOT use LangChain's ChatOpenAI - use CrewAI's native LLM class
- Do NOT skip `max_iter` - agents can loop infinitely
- Do NOT enable delegation without clear agent hierarchy
- Do NOT forget `expected_output` in tasks
- Do NOT use hierarchical process for simple linear workflows

## Crew Footguns — Runaway Loops, Delegation Cost & Process Choice
CrewAI's cost is driven by how many times each agent re-reasons and how agents
delegate to one another. Three levers dominate.

```python
from crewai import Agent, Task, Crew, Process, LLM

llm = LLM(model="gpt-4o", temperature=0)

researcher = Agent(
    role="Senior Research Analyst",
    goal="Find accurate, sourced information",
    backstory="Expert researcher",
    llm=llm,
    max_iter=5,          # FOOTGUN 1 — the per-agent reasoning-loop cap. Unset/high
                         # = the agent retries tool calls until it burns the budget.
    allow_delegation=False,  # FOOTGUN 2 — delegation multiplies LLM calls: a
                             # delegating agent spawns sub-conversations. Enable ONLY
                             # with a deliberate manager→worker hierarchy.
    verbose=True,
)
```

- **FOOTGUN 3 — process type.** `Process.sequential` runs tasks in a fixed order
  (deterministic, cheap). `Process.hierarchical` adds a **manager agent** that plans
  and delegates — powerful but it introduces an extra planning LLM per step and
  non-deterministic routing. Use `hierarchical` ONLY for genuine manager-worker
  decomposition, never for a simple linear pipeline.
- **Tool-call loops**: an agent that keeps calling a failing tool will spin up to
  `max_iter`. Keep `max_iter` tight and return terminal, non-retryable errors from
  tools so the agent stops rather than retries.

## Determinism
Agent plans are only as reproducible as the LLM sampling.
- Set `temperature=0` on the `LLM` for the most repeatable planning/tool-selection.
- `Process.hierarchical` is inherently less reproducible (the manager re-plans each
  run); prefer `sequential` when you need auditable, repeatable runs.
- `memory=True` makes runs stateful across invocations — a run's output depends on
  prior runs. Disable memory in tests to isolate a single run.

## Security — Tools That Exec Shell/Code (CWE-78 / CWE-94)
CrewAI agents act through tools. A tool that runs a shell command or `eval`s a
string turns model output (attacker-influenceable via task inputs or retrieved
content — OWASP LLM01, 2025) into executed code.

```python
from crewai.tools import tool
import shlex, subprocess

# UNSAFE — string-built shell command = OS command injection (CWE-78).
# @tool("run")
# def run(cmd: str) -> str:
#     return subprocess.check_output(cmd, shell=True).decode()   # NEVER

# SAFE — allowlist + argument vector, never shell=True, validate inputs.
ALLOWED = {"ls", "cat"}
@tool("run")
def run(cmd: str) -> str:
    parts = shlex.split(cmd)
    if not parts or parts[0] not in ALLOWED:
        raise ValueError(f"command not allowed: {cmd}")
    return subprocess.check_output(parts, shell=False, timeout=10).decode()
```

- A tool that builds and `exec`s Python from model output is **CWE-94 Code
  Injection** — do not do it; if you must run code, sandbox it (container, no host
  creds, timeout).
- Validate every tool argument the model supplies before it reaches a filesystem,
  network, or subprocess call.

## Error Handling
```python
try:
    result = crew.kickoff(inputs={"topic": "AI agents"})
except Exception as e:
    # LLM rate limits, tool exceptions, and max_iter exhaustion surface here.
    # Don't swallow — a silently failed task yields an empty/hallucinated result.
    raise RuntimeError(f"crew.kickoff failed: {e}") from e
```

## Testing
- Set `temperature=0` and `memory=False` in tests for isolation and repeatability.
- Assert `max_iter` and `allow_delegation` guardrails are set on every agent so a
  refactor can't reintroduce an unbounded/delegating agent.
- Mock ONLY the `LLM` (external dependency); test real tool validation logic directly.

## Version-specific (verified 2026-07-10)
- **CrewAI 1.15.2** — current stable on PyPI, released 2026-07-08.
  `requires-python >=3.10,<3.14`. Install `crewai` + `crewai-tools`.
  Source: https://pypi.org/pypi/crewai/json (retrieved 2026-07-10).
- CrewAI is independent of LangChain — use the native `crewai.LLM` wrapper and
  import tools from `crewai_tools`, not `langchain`.
  Source: https://docs.crewai.com/ (retrieved 2026-07-10).

## References
- CrewAI docs — https://docs.crewai.com/ (retrieved 2026-07-10)
- PyPI crewai 1.15.2 — https://pypi.org/pypi/crewai/json (retrieved 2026-07-10)
- CWE-78 OS Command Injection — https://cwe.mitre.org/data/definitions/78.html (retrieved 2026-07-10)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
- OWASP GenAI / LLM Top 10 — LLM01 Prompt Injection — https://genai.owasp.org/llm-top-10/ (retrieved 2026-07-10)
