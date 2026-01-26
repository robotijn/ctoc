# Pinecone CTO
> Fully managed vector database for production AI applications.

## Commands
```bash
# Setup | Dev | Test
pip install pinecone-client
python -c "from pinecone import Pinecone; print('OK')"
# Verify connection
python -c "from pinecone import Pinecone; pc = Pinecone(); print(pc.list_indexes())"
```

## Non-Negotiables
1. Proper index configuration (dimension, metric)
2. Namespace strategy for data isolation
3. Metadata filtering for efficient queries
4. Batch upserts for performance
5. Pod vs serverless selection based on needs
6. Backup and collection management

## Red Lines
- Single namespace for all data types
- Missing metadata on vectors
- Row-by-row upserts (use batches)
- Wrong pod type for workload
- No backup strategy
- Hardcoded API keys in code

## Pattern: Production Vector Store
```python
from pinecone import Pinecone, ServerlessSpec
import itertools

# Initialize client
pc = Pinecone(api_key="your-api-key")

# Create serverless index
if "my-index" not in pc.list_indexes().names():
    pc.create_index(
        name="my-index",
        dimension=1536,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )

index = pc.Index("my-index")

# Batch upsert helper
def chunked_upsert(vectors: list, namespace: str, batch_size: int = 100):
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        index.upsert(vectors=batch, namespace=namespace)

# Prepare vectors with metadata
vectors = [
    {
        "id": f"doc_{i}",
        "values": embedding,  # 1536-dim vector
        "metadata": {
            "source": "documentation",
            "category": "api",
            "date": "2024-01-15",
        }
    }
    for i, embedding in enumerate(embeddings)
]

# Upsert with namespace
chunked_upsert(vectors, namespace="docs")

# Query with metadata filtering
results = index.query(
    vector=query_embedding,
    top_k=10,
    namespace="docs",
    filter={
        "category": {"$eq": "api"},
        "date": {"$gte": "2024-01-01"}
    },
    include_metadata=True,
    include_values=False,
)

# Get index stats
stats = index.describe_index_stats()
print(f"Total vectors: {stats.total_vector_count}")

# Delete by metadata filter
index.delete(filter={"category": "deprecated"}, namespace="docs")
```

## Integrates With
- **Embeddings**: OpenAI, Cohere, HuggingFace
- **Frameworks**: LangChain, LlamaIndex, Haystack
- **Deployment**: Serverless, pods, hybrid cloud
- **Monitoring**: Pinecone console, metrics API

## Common Errors
| Error | Fix |
|-------|-----|
| `Dimension mismatch` | Check embedding model output dimension |
| `Rate limit exceeded` | Implement backoff, use batch upserts |
| `Namespace not found` | Namespaces are created on first upsert |
| `Query timeout` | Reduce top_k, optimize filters |

## Prod Ready
- [ ] Index dimension matches embedding model
- [ ] Namespaces isolate data domains
- [ ] Metadata schema defined
- [ ] Batch upserts implemented
- [ ] Backup collections configured
- [ ] API key stored in environment
