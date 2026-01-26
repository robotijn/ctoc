# Qdrant CTO
> High-performance vector search.

## Non-Negotiables
1. Collection configuration
2. Payload indexing
3. Quantization settings
4. Sharding strategy
5. Snapshot backups

## Red Lines
- Missing payload indexes
- No quantization for scale
- Single shard for large data
- Ignoring HNSW params
- No snapshots

## Pattern
```python
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance

client = QdrantClient(url="http://localhost:6333")
client.create_collection(
    collection_name="docs",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE)
)
```
