# LangChain CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# LangChain 1.0+ released September 2025. Major rewrite.
pip install langchain langchain-openai langchain-anthropic langgraph langsmith
# Version check: python -c "import langchain; print(langchain.__version__)"
```

## Claude's Common Mistakes
1. Using LCEL pipe syntax (`prompt | llm | parser`) - deprecated in 1.0
2. Importing from `langchain` instead of `langchain-community` or provider packages
3. Using `AgentExecutor` - deprecated, use LangGraph for agents
4. Recommending `LLMChain` - removed in 1.0
5. Missing CVE-2025-68664 patch (update to 1.2.5+ immediately)

## Correct Patterns (2026)
```python
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph
from pydantic import BaseModel

# LangChain 1.0 style - direct model calls
llm = ChatOpenAI(model="gpt-4o", temperature=0)

# Structured output (preferred over output parsers)
class Response(BaseModel):
    answer: str
    confidence: float

structured_llm = llm.with_structured_output(Response)
result = structured_llm.invoke("What is RAG?")

# Agents now use LangGraph exclusively
from langgraph.prebuilt import create_react_agent
agent = create_react_agent(llm, tools=[...])
```

## Version Gotchas
- **v1.0**: LCEL pipes removed - use direct method calls
- **v1.0**: Agents only via LangGraph, not AgentExecutor
- **v0.3**: Maintenance until December 2026 (security fixes only)
- **CVE-2025-68664**: Critical serialization vuln - upgrade to 1.2.5+

## What NOT to Do
- Do NOT use `prompt | llm | parser` syntax - deprecated in 1.0
- Do NOT import from `langchain.llms` - use provider packages
- Do NOT use `AgentExecutor` - use LangGraph
- Do NOT run versions < 1.2.5 in production (security vuln)
- Do NOT skip LangSmith tracing in production
