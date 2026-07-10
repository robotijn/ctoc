# Weaviate CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install weaviate-client
# Docker: docker run -d -p 8080:8080 semitechnologies/weaviate:latest
# Verify: python -c "import weaviate; print(weaviate.__version__)"
```

## Claude's Common Mistakes
1. Using v3 API instead of v4 (`weaviate.connect_to_*`)
2. Missing vectorizer module configuration
3. Not enabling multi-tenancy for SaaS applications
4. Forgetting to close client connection
5. Using near_text without vectorizer configured

## Correct Patterns (2026)
```python
import weaviate
from weaviate.classes.config import Configure, Property, DataType
from weaviate.classes.query import MetadataQuery, Filter

# Connect (v4 API)
client = weaviate.connect_to_local(
    headers={"X-OpenAI-Api-Key": os.environ["OPENAI_API_KEY"]}
)
# Or: client = weaviate.connect_to_weaviate_cloud(cluster_url, auth_credentials)

try:
    # Create collection with schema
    collection = client.collections.create(
        name="Document",
        vectorizer_config=Configure.Vectorizer.text2vec_openai(
            model="text-embedding-3-small"
        ),
        generative_config=Configure.Generative.openai(model="gpt-4o"),
        properties=[
            Property(name="title", data_type=DataType.TEXT),
            Property(name="content", data_type=DataType.TEXT),
            Property(name="source", data_type=DataType.TEXT, skip_vectorization=True),
        ],
        multi_tenancy_config=Configure.multi_tenancy(enabled=True),
    )

    # Create tenant and insert
    collection.tenants.create("tenant_a")
    tenant_col = collection.with_tenant("tenant_a")

    tenant_col.data.insert_many([
        {"title": "Doc 1", "content": "Content here", "source": "web"},
    ])

    # Hybrid search (vector + keyword)
    results = tenant_col.query.hybrid(
        query="machine learning",
        alpha=0.5,  # 0=keyword, 1=vector
        limit=10,
        return_metadata=MetadataQuery(score=True),
    )

    # RAG with generative search
    response = tenant_col.generate.near_text(
        query="Explain ML",
        limit=3,
        grouped_task="Summarize these documents",
    )
    print(response.generated)

finally:
    client.close()  # ALWAYS close connection
```

## Version Gotchas
- **v4**: New API - use `weaviate.connect_to_*` not `Client()`
- **Vectorizers**: Must configure for near_text queries
- **Multi-tenancy**: Enable at collection creation time
- **Generative**: Requires generative module configured

## What NOT to Do
- Do NOT use v3 `Client()` API - use v4 `connect_to_*`
- Do NOT forget to close client connection
- Do NOT use near_text without vectorizer configured
- Do NOT skip multi-tenancy for SaaS applications
- Do NOT forget to create tenant before inserting

## Schema Footguns — vectorizer, HNSW, hybrid alpha
The vectorization decision is made **at collection-create time** and is sticky:
if you set a `vectorizer_config` module (e.g. `text2vec_openai`), Weaviate
vectorizes on write and `near_text` works; if you bring your own vectors, you set
`vectorizer_config=Configure.Vectorizer.none()` and MUST pass a `vector=` on every
insert — otherwise objects are stored unvectorized and never match a vector search.

```python
from weaviate.classes.config import Configure, Property, DataType, VectorDistances

# FOOTGUN: bring-your-own-vectors REQUIRES vectorizer none() + an explicit vector
# on insert. Mixing a server-side vectorizer with a manual `vector=` double-encodes.
collection = client.collections.create(
    name="Document",
    vectorizer_config=Configure.Vectorizer.none(),          # BYO vectors
    vector_index_config=Configure.VectorIndex.hnsw(
        distance_metric=VectorDistances.COSINE,             # MUST match your model
        ef_construction=128,   # build-time quality; higher = better graph, slower build
        max_connections=32,    # "M": graph degree; higher = better recall, more RAM
        ef=-1,                 # -1 = dynamic ef at query; set explicit for stable latency
    ),
    properties=[Property(name="title", data_type=DataType.TEXT)],
)
collection.data.insert(properties={"title": "Doc 1"}, vector=my_embedding)
```
- **`ef_construction` / `max_connections` (M) / `ef`** are the HNSW recall-vs-cost
  knobs (the Python v4 client uses these snake_case names; the underlying REST/
  GraphQL schema calls them `efConstruction` / `maxConnections`). `ef` too low drops
  recall; too high burns query latency. `max_connections` drives index RAM. Distance
  metric MUST match the embedding model (cosine for OpenAI/most SBERT).
  [weaviate.io/developers/weaviate/config-refs/schema/vector-index, retrieved 2026-07-10]
- **Hybrid `alpha`** blends BM25 keyword and vector scores: `alpha=0` is pure
  keyword, `alpha=1` is pure vector, `0.5` is even. A wrong `alpha` silently skews
  ranking with no error. [weaviate.io/developers/weaviate/search/hybrid, retrieved
  2026-07-10]

## Consistency — replication and tombstones
- Weaviate replicates with a tunable factor; reads/writes take a **consistency
  level** (`ONE`/`QUORUM`/`ALL`). `ONE` can serve a stale replica after a write.
- Deletes are **tombstoned**, not immediately reclaimed; HNSW compaction runs
  asynchronously, so disk/RAM does not drop the instant you delete. Bulk-delete
  then expect background cleanup, not instant reclamation.
  [weaviate.io/developers/weaviate/concepts/replication-architecture, retrieved
  2026-07-10]

## Security — auth and multi-tenancy isolation (CWE-284 / CWE-285)
- **Anonymous access is enabled by default in a bare Docker run.** Ship API-key or
  OIDC auth before exposing an instance — an open instance lets anyone read/delete
  every collection (**CWE-284 Improper Access Control**).
  [cwe.mitre.org/data/definitions/284.html, retrieved 2026-07-10]
- **Multi-tenancy is the isolation primitive, but the `tenant` string is caller-
  supplied.** `collection.with_tenant(t)` scopes the query to tenant `t`; if the
  app passes a client-controlled `t`, one tenant can read another's vectors —
  **CWE-285 Improper Authorization**. Derive the tenant from the authenticated
  session, never from the request. [cwe.mitre.org/data/definitions/285.html,
  retrieved 2026-07-10]

```python
# SAFE: tenant derived from the verified session, never from the request body.
def search(session, client, query, limit=10):
    col = client.collections.get("Document").with_tenant(session.tenant_id)
    return col.query.near_text(query=query, limit=limit)
```

## Performance & Recall Tuning
- **`ef` is the query-time recall/latency dial** — raise it to recover recall on a
  hard corpus, lower it to shave latency. `ef=-1` lets Weaviate pick dynamically
  from `limit`; pin an explicit `ef` for predictable p99.
- **`ef_construction` / `max_connections` set build-time quality** — higher values
  build a better graph (higher recall) at more RAM and slower ingest.
- **Product quantization (PQ) / BQ** cut vector RAM at some recall cost for large
  collections; enable only when memory-bound and validate recall afterward.
- **Filtered search cost** scales with filter selectivity — index the properties you
  filter on and keep `alpha` deliberate so hybrid ranking is not silently skewed.
  [weaviate.io/developers/weaviate/concepts/vector-index, retrieved 2026-07-10]

## Testing
```python
import weaviate

def test_byo_vectors_require_explicit_vector():
    client = weaviate.connect_to_local()
    try:
        col = client.collections.get("Document")          # vectorizer none()
        # Inserting without a vector must not become a searchable object.
        col.data.insert(properties={"title": "no-vec"})    # expect failure/skip
    finally:
        client.close()                                     # ALWAYS close

def test_tenant_isolation():
    # tenant_a must never see tenant_b's objects.
    ...
```

## Version-Specific Gotchas (dated, sourced)
- **Weaviate server v1.38.3** is the current release, published **2026-07-10**.
  [github.com/weaviate/weaviate/releases, retrieved 2026-07-10]
- **`weaviate-client` 4.22.0** is the current Python client, uploaded
  **2026-06-18**, `requires_python >= 3.10`. The v4 client uses
  `weaviate.connect_to_*`; the v3 `Client()` API is removed.
  [pypi.org/project/weaviate-client/, retrieved 2026-07-10]
- **Multi-tenancy must be enabled at collection creation** (`multi_tenancy_config`);
  you cannot retrofit it onto an existing single-tenant collection.
  [weaviate.io/developers/weaviate/manage-data/multi-tenancy, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Weaviate server releases: https://github.com/weaviate/weaviate/releases
- Python client (PyPI): https://pypi.org/project/weaviate-client/
- Vector index / HNSW config: https://weaviate.io/developers/weaviate/config-refs/schema/vector-index
- Hybrid search / alpha: https://weaviate.io/developers/weaviate/search/hybrid
- Multi-tenancy: https://weaviate.io/developers/weaviate/manage-data/multi-tenancy
- Authentication: https://weaviate.io/developers/weaviate/configuration/authentication
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-285 (Improper Authorization): https://cwe.mitre.org/data/definitions/285.html
