# Milvus CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install pymilvus
# Docker Compose:
# wget https://github.com/milvus-io/milvus/releases/download/v2.4/milvus-standalone-docker-compose.yml
# docker-compose up -d
# Verify: python -c "from pymilvus import connections; connections.connect(); print('OK')"
```

## Claude's Common Mistakes
1. Not loading collection before search
2. Creating index before bulk insert (slow)
3. Using FLAT index for large datasets
4. Wrong consistency level causing stale reads
5. Missing partition strategy for time-series data

## Correct Patterns (2026)
```python
from pymilvus import (
    connections, Collection, FieldSchema, CollectionSchema,
    DataType, utility
)

# Connect
connections.connect(host="localhost", port="19530")

# Define schema
fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
    FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=1536),
    FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=256),
]
schema = CollectionSchema(fields, description="Document embeddings")

# Create collection with partitions
collection = Collection("documents", schema)
collection.create_partition("2026_q1")
collection.create_partition("2026_q2")

# Bulk insert BEFORE creating index
data = [texts, embeddings, categories]
collection.insert(data, partition_name="2026_q1")

# Create index AFTER bulk insert
collection.create_index(
    "embedding",
    {
        "index_type": "HNSW",  # Best for recall, or IVF_FLAT for large scale
        "metric_type": "COSINE",
        "params": {"M": 16, "efConstruction": 256}
    }
)

# MUST load collection before search
collection.load()

# Search with partition and filter
results = collection.search(
    data=[query_embedding],
    anns_field="embedding",
    param={"metric_type": "COSINE", "params": {"ef": 128}},
    limit=10,
    expr="category == 'api'",
    partition_names=["2026_q1"],
    consistency_level="Strong",  # Or "Eventually" for speed
)

# Release when done
collection.release()
connections.disconnect("default")
```

## Version Gotchas
- **Index timing**: Create AFTER bulk insert, not before
- **Load required**: Must call `collection.load()` before search
- **Consistency**: "Strong" for accuracy, "Eventually" for speed
- **Partitions**: Use for time-series or categorical data

## What NOT to Do
- Do NOT search without calling `collection.load()` first
- Do NOT create index before bulk insert
- Do NOT use FLAT index for collections > 100K vectors
- Do NOT forget to release collections when done
- Do NOT ignore partitions for large time-series data
