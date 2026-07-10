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

## Collection Footguns — size, metric, HNSW, quantization
`size` (vector dimension) and `distance` are **fixed at `create_collection`** — a
mismatched `size` fails the upsert, and a wrong `distance` silently mis-ranks.

```python
from qdrant_client import QdrantClient, models

# FOOTGUN: size MUST equal the embedding width; distance MUST match the model.
#   Cosine for normalized OpenAI/SBERT; Dot only if you pre-normalize; Euclid rare.
client.create_collection(
    collection_name="docs",
    vectors_config=models.VectorParams(
        size=1536,                          # exact model output width
        distance=models.Distance.COSINE,    # cannot change after create
    ),
    hnsw_config=models.HnswConfigDiff(
        m=16,             # graph degree: higher recall, more RAM/build time
        ef_construct=100, # build-time candidate list: higher = better graph, slower
    ),
)
```
- **`m` and `ef_construct`** are build-time HNSW knobs; **`hnsw_ef`** (a.k.a.
  `search_params.hnsw_ef`) is the query-time knob — higher = better recall, slower
  search (64–256 typical). Leaving query `hnsw_ef` at the default under-recalls in
  production. [qdrant.tech/documentation/concepts/indexing/, retrieved 2026-07-10]
- **Quantization trades recall for memory.** Scalar (INT8) ~4x memory cut with
  small recall loss; binary is ~32x but only viable for high-dim models trained for
  it — enabling binary blindly craters recall. Use `oversampling` + `rescore` to
  recover. [qdrant.tech/documentation/guides/quantization/, retrieved 2026-07-10]
- **Payload indexes must exist before filtering at scale.** A filtered search on an
  unindexed payload field forces a full scan; create the payload index first (see
  the `create_payload_index` calls above).

## Consistency — wait, sharding, replication
```python
# FOOTGUN: default upsert returns before the write is durably applied. A test (or
# a read-your-write flow) that queries immediately can miss the point. Use wait.
client.upsert(collection_name="docs", points=points, wait=True)   # block until applied
```
- Distributed mode shards by point id and replicates per `replication_factor`;
  reads take a `consistency` level. Without `wait=True`, upsert is fire-and-forget
  from the client's perspective. [qdrant.tech/documentation/concepts/points/,
  retrieved 2026-07-10]

## Security — API-key auth and payload tenancy (CWE-284 / CWE-285)
- **A bare Qdrant has no auth.** Set `QDRANT__SERVICE__API_KEY` (and TLS) before
  exposing it; an open instance is fully readable/writable — **CWE-284 Improper
  Access Control**. [cwe.mitre.org/data/definitions/284.html, retrieved 2026-07-10]
- **Multi-tenant via a payload filter (`group_id`) is only as safe as the filter
  source.** If the `group_id` in the filter comes from the request, a tenant can
  read another's vectors — **CWE-285 Improper Authorization**. Derive it from the
  authenticated session. [cwe.mitre.org/data/definitions/285.html, retrieved
  2026-07-10]

```python
# SAFE: server-trusted tenant id in a MUST filter; client cannot widen it.
def search(session, client, vector, limit=10):
    return client.search(
        collection_name="docs", query_vector=vector, limit=limit,
        query_filter=models.Filter(must=[
            models.FieldCondition(key="tenant",
                match=models.MatchValue(value=session.tenant_id)),  # from session
        ]),
        search_params=models.SearchParams(hnsw_ef=128),
    )
```

## Performance & Recall Tuning
- **`hnsw_ef` (query) is the recall/latency dial** — raise for recall, lower for
  speed; the build-time `m`/`ef_construct` set the graph's ceiling.
- **Quantization for RAM** — scalar INT8 keeps the quantized set in RAM
  (`always_ram=True`) and rescoring from `on_disk` originals recovers recall;
  binary quantization is ~32x smaller but only for models trained for it.
- **`on_disk` vectors** trade a little latency for a large memory cut on
  millions-scale collections; keep the HNSW graph and quantized codes in RAM.
- **Payload indexes** turn a filtered full-scan into an indexed lookup — create them
  before bulk insert. [qdrant.tech/documentation/guides/optimize/, retrieved 2026-07-10]

## Testing
```python
from qdrant_client import QdrantClient, models

def test_upsert_wait_is_visible():
    client = QdrantClient(":memory:")                 # embedded, zero doubles
    client.create_collection("t", vectors_config=models.VectorParams(
        size=4, distance=models.Distance.COSINE))
    client.upsert("t", points=[models.PointStruct(id=1, vector=[1,0,0,0])], wait=True)
    hits = client.search("t", query_vector=[1,0,0,0], limit=1)
    assert hits[0].id == 1                             # visible because wait=True

def test_size_mismatch_raises():
    ...                                                # 5-dim vector into 4-dim coll
```

## Version-Specific Gotchas (dated, sourced)
- **Qdrant server v1.18.2** is the current release, published **2026-06-04**.
  [github.com/qdrant/qdrant/releases, retrieved 2026-07-10]
- **`qdrant-client` 1.18.0** is the current Python client, uploaded **2026-05-11**,
  `requires_python >= 3.10`. `QdrantClient(":memory:")` runs fully embedded for
  tests. [pypi.org/project/qdrant-client/, retrieved 2026-07-10]
- **Payload indexes** are created explicitly and should precede bulk insert for the
  filtered-query fast path. [qdrant.tech/documentation/concepts/indexing/, retrieved
  2026-07-10]

## References (retrieved 2026-07-10)
- Qdrant server releases: https://github.com/qdrant/qdrant/releases
- Python client (PyPI): https://pypi.org/project/qdrant-client/
- Indexing / HNSW: https://qdrant.tech/documentation/concepts/indexing/
- Quantization: https://qdrant.tech/documentation/guides/quantization/
- Points / consistency: https://qdrant.tech/documentation/concepts/points/
- Security: https://qdrant.tech/documentation/guides/security/
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-285 (Improper Authorization): https://cwe.mitre.org/data/definitions/285.html
