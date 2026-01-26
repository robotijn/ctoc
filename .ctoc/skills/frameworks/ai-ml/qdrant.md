# Qdrant CTO
> High-performance vector similarity search with rich filtering.

## Commands
```bash
# Setup | Dev | Test
pip install qdrant-client
docker run -d -p 6333:6333 qdrant/qdrant
python -c "from qdrant_client import QdrantClient; print(QdrantClient(':memory:').get_collections())"
```

## Non-Negotiables
1. Proper collection configuration with vectors
2. Payload indexing for filter performance
3. Quantization for memory efficiency at scale
4. Sharding strategy for large datasets
5. Snapshot backups for disaster recovery
6. HNSW parameter tuning

## Red Lines
- Missing payload indexes causing slow filters
- No quantization for large-scale deployments
- Single shard for billions of vectors
- Ignoring HNSW ef/m parameters
- No snapshot strategy
- Not using batch operations

## Pattern: Production Vector Store
```python
from qdrant_client import QdrantClient, models
from qdrant_client.models import (
    VectorParams, Distance, PointStruct,
    QuantizationConfig, ScalarQuantization,
    PayloadSchemaType, Filter, FieldCondition, MatchValue
)

# Connect to Qdrant
client = QdrantClient(url="http://localhost:6333")

# Create collection with quantization
client.create_collection(
    collection_name="documents",
    vectors_config=VectorParams(
        size=1536,
        distance=Distance.COSINE,
        on_disk=True,  # Store vectors on disk
    ),
    quantization_config=ScalarQuantization(
        scalar=models.ScalarQuantizationConfig(
            type=models.ScalarType.INT8,
            quantile=0.99,
            always_ram=True,
        )
    ),
    hnsw_config=models.HnswConfigDiff(
        m=16,  # Connections per node
        ef_construct=100,  # Index build quality
    ),
    optimizers_config=models.OptimizersConfigDiff(
        indexing_threshold=20000,
    ),
)

# Create payload indexes for filtering
client.create_payload_index(
    collection_name="documents",
    field_name="category",
    field_schema=PayloadSchemaType.KEYWORD,
)
client.create_payload_index(
    collection_name="documents",
    field_name="date",
    field_schema=PayloadSchemaType.DATETIME,
)

# Batch upsert
points = [
    PointStruct(
        id=i,
        vector=embedding,
        payload={"category": "api", "title": f"Doc {i}", "date": "2024-01-15"}
    )
    for i, embedding in enumerate(embeddings)
]
client.upsert(collection_name="documents", points=points, wait=True)

# Search with filters
results = client.search(
    collection_name="documents",
    query_vector=query_embedding,
    limit=10,
    query_filter=Filter(
        must=[
            FieldCondition(key="category", match=MatchValue(value="api")),
        ]
    ),
    with_payload=True,
    search_params=models.SearchParams(hnsw_ef=128, exact=False),
)

# Create snapshot
client.create_snapshot(collection_name="documents")
```

## Integrates With
- **Embeddings**: OpenAI, Sentence Transformers, FastEmbed
- **Frameworks**: LangChain, LlamaIndex, Haystack
- **Deployment**: Docker, Kubernetes, Qdrant Cloud
- **Monitoring**: Prometheus, Grafana

## Common Errors
| Error | Fix |
|-------|-----|
| `Collection not found` | Check collection name, create if missing |
| `Vector dimension mismatch` | Ensure embedding size matches config |
| `Slow filtered search` | Create payload indexes for filter fields |
| `High memory usage` | Enable quantization, use on_disk vectors |

## Prod Ready
- [ ] Payload indexes created for filter fields
- [ ] Quantization enabled for memory efficiency
- [ ] HNSW parameters tuned
- [ ] Snapshot backups scheduled
- [ ] Batch operations for bulk inserts
- [ ] Search params optimized (hnsw_ef)
