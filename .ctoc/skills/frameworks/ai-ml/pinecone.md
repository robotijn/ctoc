# Pinecone CTO
> Managed vector database.

## Non-Negotiables
1. Index configuration
2. Namespace strategy
3. Metadata filtering
4. Batch upserts
5. Pod/serverless selection

## Red Lines
- Single namespace for all data
- Missing metadata
- Row-by-row upserts
- Wrong pod type
- No backup strategy

## Pattern
```python
from pinecone import Pinecone

pc = Pinecone(api_key="key")
index = pc.Index("my-index")

index.upsert(
    vectors=[{"id": "1", "values": [0.1, ...], "metadata": {"type": "doc"}}],
    namespace="docs"
)
```
