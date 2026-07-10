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

## Collection Footguns — embedding function, metric, client mode
The single most common Chroma bug is an **embedding-function mismatch between
`add` and `query`**: Chroma stores whatever embedding function the collection was
created with, and re-uses it for `query_texts`. If you add with one model and later
`get_or_create_collection` without specifying the same `embedding_function`, Chroma
falls back to its default (`all-MiniLM-L6-v2`, 384-dim) and either dimension-errors
or silently searches a different vector space.

```python
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

# FOOTGUN: the embedding_function is a property of the collection. It MUST be the
# same on every get_or_create_collection call for that name, or add/query diverge.
ef = OpenAIEmbeddingFunction(api_key=os.environ["OPENAI_API_KEY"],
                             model_name="text-embedding-3-small")  # 1536-dim
collection = client.get_or_create_collection(
    name="docs",
    embedding_function=ef,                     # SAME ef on every open
    metadata={"hnsw:space": "cosine"},         # else default is L2 (usually wrong)
)
```
- **`hnsw:space` defaults to `l2`.** For normalized text embeddings you almost
  always want `cosine`; set it at create — it cannot be changed later without
  recreating the collection. [docs.trychroma.com/docs/collections/configure,
  retrieved 2026-07-10]
- **In-memory vs persistent:** `chromadb.Client()` is ephemeral (lost on process
  exit); use `PersistentClient(path=...)` or `HttpClient(host=...)` for anything
  that must survive a restart.
- **`where` metadata filters** use Mongo-style operators (`$eq`, `$ne`, `$gt`,
  `$in`, `$and`, `$or`); a bare `{"k": v}` means `$eq`. `where_document` filters on
  document text (`$contains`). [docs.trychroma.com/docs/querying-collections/metadata-filtering,
  retrieved 2026-07-10]

## Scale & Filter Correctness — single-node limits, batching, where-filters
- Chroma is a **single-node** store; it is excellent for prototypes and mid-size
  corpora but is not a sharded distributed DB. Very large corpora belong on a
  clustered engine (Milvus/Qdrant).
- **Batch `add`.** Adding one document per call round-trips (and re-embeds) per
  item; pass lists to `add` and respect the server's `get_max_batch_size()` so a
  large ingest does not exceed the request limit.
- **Filter correctness:** a `where` clause narrows on metadata, `where_document`
  narrows on document text; both are ANDed with the vector search. A too-selective
  `where` can return fewer than `n_results` — the filter is a hard predicate, not a
  soft rerank. [docs.trychroma.com/docs/querying-collections/metadata-filtering,
  retrieved 2026-07-10]

```python
# SAFE: batch within the server's max batch size.
mx = client.get_max_batch_size()
for i in range(0, len(ids), mx):
    collection.add(ids=ids[i:i+mx], documents=docs[i:i+mx], metadatas=metas[i:i+mx])
```

## Security — server auth and tenant/database separation (CWE-284 / CWE-285)
- **Chroma server mode ships without auth by default.** Before exposing
  `chroma run`, enable a provider (static token or basic auth via
  `CHROMA_SERVER_AUTHN_PROVIDER` + credentials) and TLS — an open server is a
  **CWE-284 Improper Access Control** exposure of every collection.
  [cwe.mitre.org/data/definitions/284.html, retrieved 2026-07-10]
- **Tenant/database are namespacing, not authorization.** Chroma's `tenant` and
  `database` scope collection names; they do not by themselves stop a caller from
  targeting another tenant's database unless the app enforces it — trusting a
  request-supplied tenant is **CWE-285 Improper Authorization**. Derive it from the
  session. [cwe.mitre.org/data/definitions/285.html, retrieved 2026-07-10]

## Performance & Recall Tuning
- **Batch `add` within `get_max_batch_size()`** — per-item adds re-embed and
  round-trip one document at a time; batch to amortize both.
- **`hnsw:search_ef` / construction params** — Chroma exposes HNSW knobs via
  collection `configuration`/metadata (`hnsw:construction_ef`, `hnsw:search_ef`,
  `hnsw:M`); higher search_ef = better recall, slower query.
- **Prefer server/persistent mode** for anything beyond a notebook — the in-memory
  client re-reads/re-embeds on each process and does not scale.
- **Scope with `where` / `where_document`** to cut the candidate set rather than
  post-filtering in Python. [docs.trychroma.com/docs/collections/configure,
  retrieved 2026-07-10]

## Testing
```python
import chromadb

def test_same_embedding_function_roundtrips():
    client = chromadb.EphemeralClient()               # in-proc, zero doubles
    col = client.get_or_create_collection("t", metadata={"hnsw:space": "cosine"})
    col.add(ids=["a"], embeddings=[[1.0, 0.0, 0.0]])
    res = col.query(query_embeddings=[[1.0, 0.0, 0.0]], n_results=1)
    assert res["ids"][0][0] == "a"                    # same space -> nearest is itself

def test_where_filter_operators():
    ...                                               # {"src": {"$in": [...]}}
```

## Version-Specific Gotchas (dated, sourced)
- **`chromadb` 1.5.9** is the current release, uploaded **2026-05-05**,
  `requires_python >= 3.9`. [pypi.org/project/chromadb/ and
  github.com/chroma-core/chroma/releases (tag 1.5.9), retrieved 2026-07-10]
- **v1.4+ database migrations are irreversible** — back up the persist directory
  before upgrading across a schema-migration boundary.
  [docs.trychroma.com/docs/overview/migration, retrieved 2026-07-10]
- **Default distance is `l2`**; set `metadata={"hnsw:space": "cosine"}` at
  create for normalized embeddings. [docs.trychroma.com/docs/collections/configure,
  retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Chroma (PyPI): https://pypi.org/project/chromadb/
- Chroma releases: https://github.com/chroma-core/chroma/releases
- Configure collections (hnsw:space): https://docs.trychroma.com/docs/collections/configure
- Metadata / where filtering: https://docs.trychroma.com/docs/querying-collections/metadata-filtering
- Authentication: https://docs.trychroma.com/production/administration/auth
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-285 (Improper Authorization): https://cwe.mitre.org/data/definitions/285.html
