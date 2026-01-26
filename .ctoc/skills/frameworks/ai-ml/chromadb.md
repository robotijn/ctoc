# ChromaDB CTO
> Open-source embedding database for AI applications.

## Commands
```bash
# Setup | Dev | Test
pip install chromadb
python -c "import chromadb; print(chromadb.__version__)"
chroma run --path ./chroma_data --port 8000
```

## Non-Negotiables
1. Proper collection organization strategy
2. Custom embedding function for production
3. Metadata filtering for efficient queries
4. Persistence configuration for durability
5. Appropriate distance function selection
6. Batch operations for performance

## Red Lines
- Using default embeddings in production
- Missing persistence leading to data loss
- No metadata strategy for filtering
- Ignoring distance metrics for use case
- Large batch inserts without chunking
- Not using async client for web apps

## Pattern: Production RAG Backend
```python
import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions

# Production client with persistence
client = chromadb.PersistentClient(
    path="./chroma_data",
    settings=Settings(
        anonymized_telemetry=False,
        allow_reset=False,
    )
)

# Custom embedding function
openai_ef = embedding_functions.OpenAIEmbeddingFunction(
    api_key="your-key",
    model_name="text-embedding-3-small"
)

# Create collection with configuration
collection = client.get_or_create_collection(
    name="documents",
    embedding_function=openai_ef,
    metadata={
        "hnsw:space": "cosine",  # Distance function
        "hnsw:construction_ef": 100,
        "hnsw:search_ef": 50,
    }
)

# Batch upsert with metadata
def upsert_documents(docs: list[dict], batch_size: int = 100):
    for i in range(0, len(docs), batch_size):
        batch = docs[i:i + batch_size]
        collection.upsert(
            ids=[d["id"] for d in batch],
            documents=[d["text"] for d in batch],
            metadatas=[{"source": d["source"], "date": d["date"]} for d in batch],
        )

# Query with metadata filtering
results = collection.query(
    query_texts=["What is machine learning?"],
    n_results=5,
    where={"source": {"$in": ["docs", "articles"]}},
    where_document={"$contains": "neural"},
    include=["documents", "metadatas", "distances"],
)

# Delete by filter
collection.delete(where={"source": "outdated"})
```

## Integrates With
- **Embeddings**: OpenAI, Sentence Transformers, Cohere
- **Frameworks**: LangChain, LlamaIndex
- **Deployment**: Docker, Kubernetes
- **Storage**: Local filesystem, cloud volumes

## Common Errors
| Error | Fix |
|-------|-----|
| `Collection not found` | Use get_or_create_collection() |
| `Embedding dimension mismatch` | Ensure consistent embedding model |
| `OOM on large insert` | Use batch_size for chunked inserts |
| `Slow queries` | Tune HNSW parameters, add indexes |

## Prod Ready
- [ ] Persistence configured for durability
- [ ] Custom embedding function set
- [ ] Metadata schema defined
- [ ] HNSW parameters tuned
- [ ] Batch operations for bulk inserts
- [ ] Backup strategy in place
