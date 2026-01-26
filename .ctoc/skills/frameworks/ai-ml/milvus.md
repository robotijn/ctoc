# Milvus CTO
> Scalable vector database for enterprise AI workloads.

## Commands
```bash
# Setup | Dev | Test
pip install pymilvus
# Start with Docker Compose
wget https://github.com/milvus-io/milvus/releases/download/v2.4.0/milvus-standalone-docker-compose.yml -O docker-compose.yml
docker-compose up -d
python -c "from pymilvus import connections; connections.connect(); print('OK')"
```

## Non-Negotiables
1. Explicit collection schema definition
2. Appropriate index type selection (IVF, HNSW)
3. Partition strategy for data organization
4. Proper consistency level for use case
5. Resource management and limits
6. Index creation after bulk inserts

## Red Lines
- Flat index for large datasets (use IVF/HNSW)
- Missing partitions for time-series data
- Wrong consistency level causing stale reads
- No index creation after insert
- Ignoring segment size configuration
- Not loading collection before search

## Pattern: Production Vector Store
```python
from pymilvus import (
    connections, Collection, FieldSchema, CollectionSchema,
    DataType, utility
)

# Connect to Milvus
connections.connect(host="localhost", port="19530")

# Define schema
fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
    FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=1536),
    FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=256),
    FieldSchema(name="timestamp", dtype=DataType.INT64),
]

schema = CollectionSchema(fields, description="Document embeddings")

# Create collection with partitions
collection = Collection("documents", schema)

# Create partitions for data organization
collection.create_partition("docs_2024")
collection.create_partition("docs_2023")

# Bulk insert data
data = [
    texts,      # VARCHAR field
    embeddings, # FLOAT_VECTOR field
    categories, # VARCHAR field
    timestamps, # INT64 field
]
collection.insert(data, partition_name="docs_2024")

# Create index after bulk insert
index_params = {
    "index_type": "IVF_FLAT",
    "metric_type": "COSINE",
    "params": {"nlist": 1024}
}
# Or use HNSW for better recall
index_params_hnsw = {
    "index_type": "HNSW",
    "metric_type": "COSINE",
    "params": {"M": 16, "efConstruction": 256}
}

collection.create_index("embedding", index_params_hnsw)

# Load collection into memory before search
collection.load()

# Search with expression filter
results = collection.search(
    data=[query_embedding],
    anns_field="embedding",
    param={"metric_type": "COSINE", "params": {"ef": 128}},
    limit=10,
    expr="category == 'api' and timestamp > 1704067200",
    output_fields=["text", "category"],
    partition_names=["docs_2024"],
    consistency_level="Strong",
)

# Release when done
collection.release()
connections.disconnect("default")
```

## Integrates With
- **Embeddings**: OpenAI, HuggingFace, custom
- **Frameworks**: LangChain, LlamaIndex, Haystack
- **Deployment**: Docker, Kubernetes, Milvus Cloud
- **Storage**: S3, MinIO, local

## Common Errors
| Error | Fix |
|-------|-----|
| `Collection not loaded` | Call collection.load() before search |
| `Index not found` | Create index with create_index() |
| `Dimension mismatch` | Check embedding dim matches schema |
| `Expression syntax error` | Use proper filter syntax with quotes |

## Prod Ready
- [ ] Schema explicitly defined
- [ ] Index created after bulk inserts
- [ ] Partitions organize time-series data
- [ ] Collection loaded before search
- [ ] Consistency level appropriate
- [ ] Resource limits configured
