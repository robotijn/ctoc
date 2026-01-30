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
