# ChromaDB CTO
> Open-source embedding database.

## Non-Negotiables
1. Collection organization
2. Embedding function selection
3. Metadata filtering
4. Persistence configuration
5. Distance function choice

## Red Lines
- Default embeddings for production
- Missing persistence
- No metadata strategy
- Ignoring distance metrics
- Large batch inserts without batching

## Pattern
```python
import chromadb

client = chromadb.PersistentClient(path="./chroma")
collection = client.create_collection(
    name="docs",
    embedding_function=embedding_fn,
    metadata={"hnsw:space": "cosine"}
)
```
