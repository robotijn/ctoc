# CrewAI CTO
> AI agent orchestration for building collaborative multi-agent systems.

## Commands
```bash
# Setup | Dev | Test
pip install crewai crewai-tools
crewai create crew my_crew
crewai run
```

## Non-Negotiables
1. Clear agent roles with specific expertise
2. Well-defined task dependencies
3. Tool integration with guardrails
4. Appropriate process selection (sequential/hierarchical)
5. Memory configuration for context retention
6. Iteration limits to prevent runaway agents

## Red Lines
- Vague or overlapping agent goals
- Missing task context and expected outputs
- No tool usage guardrails
- Ignoring process type for workflow
- Unlimited iterations without stops
- No error handling for agent failures

## Pattern: Production Agent Crew
```python
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool, WebsiteSearchTool
from langchain_openai import ChatOpenAI

# Configure LLM
llm = ChatOpenAI(model="gpt-4o", temperature=0)

# Define tools with guardrails
search_tool = SerperDevTool()
web_tool = WebsiteSearchTool()

# Create specialized agents
researcher = Agent(
    role="Senior Research Analyst",
    goal="Conduct thorough research and provide accurate, sourced information",
    backstory="Expert researcher with 10 years of experience in data analysis",
    tools=[search_tool, web_tool],
    llm=llm,
    verbose=True,
    allow_delegation=False,
    max_iter=5,  # Limit iterations
)

writer = Agent(
    role="Technical Writer",
    goal="Create clear, engaging content based on research",
    backstory="Technical writer specializing in making complex topics accessible",
    llm=llm,
    verbose=True,
    allow_delegation=False,
    max_iter=3,
)

editor = Agent(
    role="Content Editor",
    goal="Review and polish content for accuracy and clarity",
    backstory="Senior editor with expertise in technical documentation",
    llm=llm,
    verbose=True,
    allow_delegation=False,
    max_iter=3,
)

# Define tasks with clear outputs
research_task = Task(
    description="Research the latest developments in {topic}",
    expected_output="Comprehensive report with sources and key findings",
    agent=researcher,
    output_file="research.md",
)

writing_task = Task(
    description="Write an article based on the research findings",
    expected_output="Well-structured article of 1000-1500 words",
    agent=writer,
    context=[research_task],  # Depends on research
    output_file="article.md",
)

editing_task = Task(
    description="Review and edit the article for publication",
    expected_output="Polished, publication-ready article",
    agent=editor,
    context=[writing_task],
    output_file="final_article.md",
)

# Create crew with process
crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.sequential,  # Or Process.hierarchical
    memory=True,  # Enable memory
    verbose=True,
)

# Execute
result = crew.kickoff(inputs={"topic": "AI agents in production"})
print(result)
```

## Integrates With
- **LLMs**: OpenAI, Anthropic, Ollama, local models
- **Tools**: LangChain tools, custom tools
- **Memory**: Short-term, long-term, entity memory
- **Deployment**: FastAPI, Docker, Kubernetes

## Common Errors
| Error | Fix |
|-------|-----|
| `Agent stuck in loop` | Reduce max_iter, clarify task description |
| `Tool execution failed` | Check tool configuration, add error handling |
| `Context too long` | Summarize previous task outputs |
| `Delegation confusion` | Set allow_delegation=False for clarity |

## Prod Ready
- [ ] Agent roles clearly defined
- [ ] Task dependencies explicit
- [ ] Iteration limits set (max_iter)
- [ ] Tools have error handling
- [ ] Memory configured for workflow
- [ ] Output files specified for tasks
