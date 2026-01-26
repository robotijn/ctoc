# CrewAI CTO
> AI agent orchestration framework.

## Non-Negotiables
1. Clear agent roles
2. Task dependencies
3. Tool integration
4. Process selection
5. Memory configuration

## Red Lines
- Vague agent goals
- Missing task context
- No tool guardrails
- Ignoring process type
- Unlimited iterations

## Pattern
```python
from crewai import Agent, Task, Crew

researcher = Agent(
    role="Researcher",
    goal="Find accurate information",
    tools=[search_tool]
)
crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()
```
