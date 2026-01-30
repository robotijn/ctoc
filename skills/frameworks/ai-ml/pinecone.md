# Pinecone CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v8.0+ requires Python 3.10+ (3.9 EOL October 2025)
pip install pinecone
# Optional extras: pip install "pinecone[asyncio,grpc]"
# Verify: python -c "from pinecone import Pinecone; print('OK')"
```

## Claude's Common Mistakes
1. Using deprecated `pinecone.init()` instead of `Pinecone()` class
2. Using old `pinecone-client` package name
3. Missing batch upsert for large datasets
4. Not using serverless indexes for cost efficiency
5. Forgetting to delete index when done testing

## Correct Patterns (2026)
```python
from pinecone import Pinecone, ServerlessSpec
import asyncio

# Initialize client (v8+ API)
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])

# Create serverless index (preferred)
if "my-index" not in [i.name for i in pc.list_indexes()]:
    pc.create_index(
        name="my-index",
        dimension=1536,  # Match your embedding model
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1"),
    )

index = pc.Index("my-index")

# Batch upsert (required for large datasets)
def batch_upsert(vectors, batch_size=100):
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        index.upsert(vectors=batch, namespace="default")

# Upsert with metadata
vectors = [
    {"id": "doc1", "values": embedding1, "metadata": {"source": "web", "date": "2026-01-15"}},
    {"id": "doc2", "values": embedding2, "metadata": {"source": "api", "date": "2026-01-16"}},
]
index.upsert(vectors=vectors, namespace="default")

# Query with filter
results = index.query(
    vector=query_embedding,
    top_k=10,
    include_metadata=True,
    filter={"source": {"$eq": "web"}},
    namespace="default",
)

# Async support (v6+)
from pinecone import PineconeAsyncio
async_client = PineconeAsyncio(api_key=os.environ["PINECONE_API_KEY"])
```

## Version Gotchas
- **v8.0**: Python 3.9 no longer supported
- **v5.1+**: Package renamed from `pinecone-client` to `pinecone`
- **v8.0**: Uses orjson for faster JSON parsing
- **Serverless**: Use for cost efficiency, Pod for high throughput

## What NOT to Do
- Do NOT use `pinecone.init()` - use `Pinecone()` class
- Do NOT install `pinecone-client` - install `pinecone`
- Do NOT upsert large datasets without batching
- Do NOT forget namespaces for multi-tenant apps
- Do NOT leave test indexes running (costs money)
