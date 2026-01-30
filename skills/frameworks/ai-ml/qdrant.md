# Qdrant CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install qdrant-client
# Docker: docker run -d -p 6333:6333 qdrant/qdrant
# Verify: python -c "from qdrant_client import QdrantClient; print('OK')"
```

## Claude's Common Mistakes
1. Missing payload indexes for filtered queries (slow)
2. No quantization for large-scale deployments
3. Not using batch operations for bulk inserts
4. Wrong HNSW ef_search causing poor recall
5. Ignoring on_disk option for large vectors

## Correct Patterns (2026)
```python
from qdrant_client import QdrantClient, models
from qdrant_client.models import (
    VectorParams, Distance, PointStruct,
    ScalarQuantization, PayloadSchemaType,
    Filter, FieldCondition, MatchValue
)

# Connect
client = QdrantClient(url="http://localhost:6333")
# Or cloud: QdrantClient(url="https://...", api_key="...")

# Create collection with quantization
client.create_collection(
    collection_name="documents",
    vectors_config=VectorParams(
        size=1536,
        distance=Distance.COSINE,
        on_disk=True,  # Store vectors on disk for large collections
    ),
    quantization_config=ScalarQuantization(
        scalar=models.ScalarQuantizationConfig(
            type=models.ScalarType.INT8,
            quantile=0.99,
            always_ram=True,  # Keep quantized in RAM
        )
    ),
    hnsw_config=models.HnswConfigDiff(m=16, ef_construct=100),
)

# Create payload indexes BEFORE inserting data
client.create_payload_index("documents", "category", PayloadSchemaType.KEYWORD)
client.create_payload_index("documents", "date", PayloadSchemaType.DATETIME)

# Batch upsert
points = [
    PointStruct(id=i, vector=emb, payload={"category": "api", "title": f"Doc {i}"})
    for i, emb in enumerate(embeddings)
]
client.upsert(collection_name="documents", points=points, wait=True)

# Search with filters
results = client.search(
    collection_name="documents",
    query_vector=query_embedding,
    limit=10,
    query_filter=Filter(must=[
        FieldCondition(key="category", match=MatchValue(value="api")),
    ]),
    search_params=models.SearchParams(hnsw_ef=128),  # Higher = better recall
)
```

## Version Gotchas
- **Payload indexes**: Create before bulk insert for best performance
- **Quantization**: INT8 reduces memory 4x with minimal accuracy loss
- **hnsw_ef**: Higher = better recall, slower search (64-256 typical)
- **on_disk**: Use for collections with millions of vectors

## What NOT to Do
- Do NOT skip payload indexes for filtered fields
- Do NOT ignore quantization for large collections
- Do NOT upsert one-by-one - use batch operations
- Do NOT use default hnsw_ef for production
- Do NOT store large vectors in RAM when on_disk works
