# Milvus CTO
> Scalable vector database.

## Non-Negotiables
1. Collection schema
2. Index type selection
3. Partition strategy
4. Consistency level
5. Resource management

## Red Lines
- Flat index for large data
- Missing partitions
- Wrong consistency level
- No index after insert
- Ignoring segment size

## Pattern
```python
from pymilvus import Collection, FieldSchema, CollectionSchema

fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True),
    FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=1536)
]
collection = Collection("docs", CollectionSchema(fields))
collection.create_index("embedding", {"index_type": "IVF_FLAT", "nlist": 1024})
```
