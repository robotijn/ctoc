# ChromaDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v1.4.1+ requires Python 3.9+
pip install chromadb
# Server mode: chroma run --path /db_path
# Verify: python -c "import chromadb; print(chromadb.__version__)"
```

## Claude's Common Mistakes
1. Using deprecated `client.get_collection()` without persistence
2. Missing embedding function configuration
3. Using in-memory mode for production
4. Not specifying distance metric (defaults to L2, usually want cosine)
5. Forgetting to handle collection already exists error

## Correct Patterns (2026)
```python
import chromadb
from chromadb.config import Settings

# Persistent client (production)
client = chromadb.PersistentClient(
    path="./chroma_db",
    settings=Settings(anonymized_telemetry=False)
)

# Client-server mode (recommended for production)
# client = chromadb.HttpClient(host="localhost", port=8000)

# Get or create collection with proper config
collection = client.get_or_create_collection(
    name="documents",
    metadata={"hnsw:space": "cosine"},  # Cosine similarity
    embedding_function=None,  # Use default or custom
)

# Custom embedding function
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
embedding_fn = OpenAIEmbeddingFunction(
    api_key=os.environ["OPENAI_API_KEY"],
    model_name="text-embedding-3-small"
)

collection = client.get_or_create_collection(
    name="openai_docs",
    embedding_function=embedding_fn,
    metadata={"hnsw:space": "cosine"},
)

# Add documents
collection.add(
    ids=["doc1", "doc2"],
    documents=["First document", "Second document"],
    metadatas=[{"source": "web"}, {"source": "api"}],
)

# Query with filters
results = collection.query(
    query_texts=["search query"],
    n_results=10,
    where={"source": "web"},
    include=["documents", "metadatas", "distances"],
)
```

## Version Gotchas
- **v1.4+**: Database migrations are irreversible - backup first
- **Distance**: Default L2, use `hnsw:space: cosine` for similarity
- **Persistence**: Use `PersistentClient` or `HttpClient` for production
- **Embeddings**: Must match between add() and query()

## What NOT to Do
- Do NOT use `Client()` (ephemeral) for production - use PersistentClient
- Do NOT forget distance metric configuration
- Do NOT mix embedding functions on same collection
- Do NOT upgrade without backing up database first
- Do NOT forget `include` parameter to get documents back
