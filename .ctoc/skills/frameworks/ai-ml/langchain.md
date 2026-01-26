# LangChain CTO
> The orchestration layer for production LLM applications.

## Commands
```bash
# Setup | Dev | Test
pip install langchain langchain-openai langchain-anthropic langgraph langsmith
langsmith start && python -m pytest tests/ -v
langchain serve --port 8000
```

## Non-Negotiables
1. LCEL (LangChain Expression Language) for all chains
2. LangSmith for debugging, tracing, and evaluation
3. Structured outputs with Pydantic models
4. Streaming responses for user experience
5. Proper retry logic with exponential backoff
6. Token counting and context window management

## Red Lines
- Legacy Chain classes instead of LCEL
- Not handling rate limits and API errors
- Context window overflow without chunking
- Missing input/output validation
- Hardcoded prompts without templates
- No observability in production

## Pattern: Production RAG Chain
```python
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_community.vectorstores import Chroma
from pydantic import BaseModel

class Answer(BaseModel):
    response: str
    sources: list[str]
    confidence: float

# Structured output chain
llm = ChatOpenAI(model="gpt-4o", temperature=0).with_structured_output(Answer)
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = Chroma(embedding_function=embeddings)
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

prompt = ChatPromptTemplate.from_messages([
    ("system", "Answer based on context:\n{context}"),
    ("human", "{question}")
])

chain = (
    {"context": retriever, "question": RunnablePassthrough()}
    | prompt
    | llm
)

# Stream with callbacks
async for chunk in chain.astream("What is RAG?"):
    print(chunk, end="", flush=True)
```

## Integrates With
- **LLMs**: OpenAI, Anthropic, Ollama, vLLM
- **Vector DBs**: Chroma, Pinecone, Weaviate, Qdrant
- **Memory**: Redis, PostgreSQL, MongoDB
- **Agents**: LangGraph for stateful workflows

## Common Errors
| Error | Fix |
|-------|-----|
| `RateLimitError` | Add `max_retries` to LLM, implement backoff |
| `Context length exceeded` | Use `RecursiveCharacterTextSplitter`, reduce retrieval k |
| `OutputParserException` | Use `with_structured_output()` or `PydanticOutputParser` |
| `Timeout waiting for response` | Set `request_timeout`, use streaming |

## Prod Ready
- [ ] LangSmith tracing enabled in production
- [ ] All chains use LCEL syntax
- [ ] Structured outputs with Pydantic validation
- [ ] Rate limiting and retry logic implemented
- [ ] Token usage tracked and logged
- [ ] Fallback chains for critical paths
