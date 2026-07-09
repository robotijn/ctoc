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

## LangChain 1.0 Migration Footguns (the 0.x → 1.x break)
LangChain 1.0 was a hard rewrite, not a compatible bump. The single most common
Claude error is emitting 0.x code that no longer imports.

```python
# REMOVED in 1.0 — these raise ImportError, not a deprecation warning:
#   from langchain.chains import LLMChain          # LLMChain: gone
#   chain = LLMChain(llm=llm, prompt=prompt)       # gone
#   from langchain.agents import AgentExecutor     # deprecated → LangGraph
#   chain = prompt | llm | StrOutputParser()       # LCEL pipe: removed

# 1.x idiom — call the model directly; structured output replaces parsers:
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel

llm = ChatOpenAI(model="gpt-5.5", temperature=0)   # real, verified model id

class Answer(BaseModel):
    answer: str
    confidence: float

structured = llm.with_structured_output(Answer)     # no output parser needed
result = structured.invoke("What is RAG?")
```
- **Provider version coupling**: `langchain` 1.x pins to matching provider majors.
  Mixing a 0.x `langchain-openai` with a 1.x `langchain` produces confusing
  `ImportError`/attribute failures. Pin the trio together.
- **LCEL is not "renamed" — it is removed.** Do NOT translate a `|` pipeline into
  a lambda chain; use `.invoke()` / `.with_structured_output()` / LangGraph.

## Prompt Injection in Tool-Enabled Chains (with mitigation)
An agent that can call tools (shell, HTTP, SQL, file I/O) turns model output into
**executed actions**. Untrusted text pulled into the context (a web page, a
retrieved document, a user message) can carry instructions that hijack the tool
call — this is prompt injection, and in a tool-enabled chain it is a code-execution
/ data-exfiltration path, not a cosmetic bug. **The mitigation is mandatory, not
optional:**

```python
from langgraph.prebuilt import create_react_agent
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(model="claude-opus-4-8")        # real, verified model id

# MITIGATIONS (apply at least sanitization + schema validation + a human gate
# on any irreversible tool):
#  1. Treat ALL retrieved / user text as data, never as instructions — wrap it in
#     a delimiter and instruct the model it is untrusted content.
#  2. Constrain every tool's input with a strict schema (Pydantic / JSON Schema)
#     and VALIDATE the model-produced args before executing — never `eval`/`exec`
#     a model string, never pass raw model output to a shell.
#  3. Allow-list tool actions; put a human-in-the-loop / approval gate on any
#     irreversible or high-blast-radius tool (payments, deletes, prod writes).
#  4. Run tools in a sandbox with least privilege; scope credentials per tool.
def safe_tool(query: str) -> str:
    if not query.isascii() or len(query) > 500:      # validate BEFORE acting
        raise ValueError("rejected untrusted tool input")
    ...  # execute in a sandbox with a scoped credential

agent = create_react_agent(llm, tools=[safe_tool])
```
- Structured-output schema validation (`with_structured_output`) also narrows the
  injection surface for extraction chains: the model can only return the shape you
  declared, so free-form injected instructions cannot become arbitrary fields.
- Source: OWASP LLM01 Prompt Injection; python.langchain.com security docs.
  See References.

## Security & Dependency Gotchas (CVE-2025-68664, re-verified)
- **CVE-2025-68664 — serialization injection in `dumps()` / `dumpd()`
  (CWE-502), CVSS 3.1 base 9.3 CRITICAL.** LangChain's serializers do NOT escape
  free-form dictionaries that contain an `'lc'` key. `'lc'` is LangChain's internal
  marker for a serialized object, so attacker-controlled data carrying that key
  structure is later **deserialized as a legitimate LangChain object instead of
  plain user data** — a serialization-injection primitive. **Patched in 0.3.81
  (0.x line) and 1.2.5 (1.x line); upgrade immediately.** Do NOT run `dumps()`/
  `dumpd()` / `loads()` over untrusted data below those versions.
  [nvd.nist.gov CVE-2025-68664, published 2025-12-23, retrieved 2026-07-09]

```python
# FOOTGUN: serializing free-form untrusted dicts on a pre-fix build.
from langchain_core.load import dumps, loads
untrusted = {"lc": 1, "type": "constructor", ...}   # attacker-shaped payload
blob = dumps(untrusted)          # < 0.3.81 / < 1.2.5: injection primitive
obj = loads(blob)                # rehydrated as a "trusted" LC object
# SAFE: pin >= 1.2.5 (or >= 0.3.81 on 0.x) AND never loads() untrusted input.
```

## Async, Retry & Timeout Idioms
```python
import asyncio
from langchain_openai import ChatOpenAI

# Async fan-out: use ainvoke/abatch — NOT a sync .invoke() in an event loop
# (a sync call blocks the loop and serializes every request).
llm = ChatOpenAI(model="gpt-5.5", timeout=30, max_retries=3)  # per-call budget

async def ask_all(prompts: list[str]) -> list[str]:
    results = await llm.abatch(prompts)     # concurrent, bounded by max_retries
    return [r.content for r in results]

asyncio.run(ask_all(["a", "b", "c"]))
```
- Always set `timeout` and `max_retries` on the model client — a provider stall
  otherwise hangs the whole request. Retries use exponential backoff by default.

## Performance & Token-Cost Traps
- **Streaming**: use `.astream()` / `.stream()` for user-facing latency — return
  first tokens immediately instead of blocking on the whole completion.
- **Batch, don't loop**: `.abatch(prompts)` issues concurrent provider calls; a
  Python `for` loop over `.invoke()` serializes them and multiplies wall-clock time.
- **RAG context bloat**: stuffing every retrieved chunk into the prompt inflates
  input tokens (cost + latency) and can push past the context window. Cap the
  retriever's `k`, rerank, and trim — do not send the whole vector store.
- **Prompt caching**: for a large stable system prompt reused across calls, route
  through a provider that supports caching (langchain-anthropic exposes
  `cache_control`) so the stable prefix is billed cheaply on repeat calls.

## Production Tracing (LangSmith)
Set `LANGSMITH_TRACING=true` + `LANGSMITH_API_KEY` (env vars, never literals) to
capture every chain/agent step, token counts, and latency. Without tracing, a
tool-agent's failure is a black box — you cannot see which tool call or which
injected document broke the run. Do NOT ship a tool-enabled agent to prod untraced.

## Testing Chains (fake provider, no live API)
```python
from langchain_core.language_models.fake_chat_models import FakeListChatModel

def test_chain_no_network():
    # Deterministic fake — never hit a paid API in unit tests, never require a key.
    fake = FakeListChatModel(responses=["mocked answer"])
    assert fake.invoke("q").content == "mocked answer"
```
- Test the injection mitigation directly: assert `safe_tool` REJECTS non-ascii /
  over-length / delimiter-breaking input, not just that the happy path works.

## Version-Specific Gotchas (dated, sourced)
- **langchain 1.3.12** is the current stable release, uploaded **2026-07-08**,
  `requires_python >=3.10,<4.0`. Provider/graph packages verified same day:
  `langchain-anthropic` 1.4.8, `langchain-openai` 1.3.4, `langgraph` 1.2.8.
  [pypi.org/project/langchain, retrieved 2026-07-09]
- **1.0 (Sept 2025)**: LCEL pipe syntax removed, `LLMChain` removed, `AgentExecutor`
  deprecated in favor of LangGraph agents (`create_react_agent`).
  [python.langchain.com 1.0 release notes / migration guide, retrieved 2026-07-09]
- **CVE-2025-68664**: fixed in 0.3.81 and 1.2.5 — run >= those versions in prod.
  [nvd.nist.gov, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- LangChain releases (PyPI): https://pypi.org/project/langchain/
- LangChain 1.0 docs / migration: https://python.langchain.com/docs/versions/v1/
- LangGraph agents: https://langchain-ai.github.io/langgraph/
- CVE-2025-68664 (serialization injection, CWE-502): https://nvd.nist.gov/vuln/detail/CVE-2025-68664
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- OWASP Top 10 for LLMs (LLM01 Prompt Injection): https://owasp.org/www-project-top-10-for-large-language-model-applications/
