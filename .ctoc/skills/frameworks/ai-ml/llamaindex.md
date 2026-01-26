# LlamaIndex CTO
> Enterprise RAG framework with production-ready data connectors.

## Commands
```bash
# Setup | Dev | Test
pip install llama-index llama-index-llms-openai llama-index-embeddings-openai
python -c "from llama_index.core import VectorStoreIndex; print('OK')"
pytest tests/ -v
```

## Non-Negotiables
1. Choose appropriate index type for use case
2. Tune chunk size and overlap for retrieval quality
3. Use query engines for complex retrieval
4. Configure response synthesizers appropriately
5. Implement evaluation with LlamaIndex eval
6. Use observability callbacks

## Red Lines
- Default chunk sizes without tuning
- Wrong index type for query patterns
- No evaluation of retrieval quality
- Missing metadata filtering
- Ignoring hybrid search opportunities
- No caching for repeated queries

## Pattern: Production RAG Pipeline
```python
from llama_index.core import (
    VectorStoreIndex, Settings, StorageContext,
    load_index_from_storage
)
from llama_index.core.node_parser import SentenceSplitter
from llama_index.llms.openai import OpenAI
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.core.postprocessor import SentenceTransformerRerank

# Configure global settings
Settings.llm = OpenAI(model="gpt-4o", temperature=0)
Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")
Settings.node_parser = SentenceSplitter(chunk_size=512, chunk_overlap=50)

# Build or load index
try:
    storage_context = StorageContext.from_defaults(persist_dir="./storage")
    index = load_index_from_storage(storage_context)
except:
    from llama_index.core import SimpleDirectoryReader
    documents = SimpleDirectoryReader("./data").load_data()
    index = VectorStoreIndex.from_documents(documents)
    index.storage_context.persist(persist_dir="./storage")

# Query engine with reranking
reranker = SentenceTransformerRerank(model="cross-encoder/ms-marco-MiniLM-L-6-v2", top_n=3)
query_engine = index.as_query_engine(
    similarity_top_k=10,
    node_postprocessors=[reranker],
    response_mode="tree_summarize"
)

response = query_engine.query("What are the key findings?")
print(response.response)
print([node.metadata for node in response.source_nodes])
```

## Integrates With
- **LLMs**: OpenAI, Anthropic, Ollama, vLLM
- **Vector DBs**: Pinecone, Chroma, Weaviate, Qdrant
- **Data**: SQL, MongoDB, Notion, Slack, Google Drive
- **Observability**: LlamaTrace, Arize Phoenix

## Common Errors
| Error | Fix |
|-------|-----|
| `Empty response` | Check retrieval, increase similarity_top_k |
| `Context too long` | Reduce chunk_size, use tree_summarize mode |
| `Rate limit exceeded` | Add rate limiter to LLM settings |
| `Index not found` | Verify persist_dir path, rebuild index |

## Prod Ready
- [ ] Index persisted to storage
- [ ] Chunk size tuned for content type
- [ ] Reranking enabled for quality
- [ ] Metadata filtering configured
- [ ] Evaluation metrics tracked
- [ ] Caching layer for frequent queries
