# Pinecone CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v8.0+ requires Python 3.10+ (3.9 EOL October 2025)
pip install pinecone
# Optional extras: pip install "pinecone[asyncio,grpc]"
# Verify: python -c "from pinecone import Pinecone; print('OK')"
```

## Claude's Common Mistakes
1. Using deprecated `pinecone.init()` instead of `Pinecone()` class
2. Using old `pinecone-client` package name
3. Missing batch upsert for large datasets
4. Not using serverless indexes for cost efficiency
5. Forgetting to delete index when done testing

## Correct Patterns (2026)
```python
from pinecone import Pinecone, ServerlessSpec
import asyncio

# Initialize client (v8+ API)
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])

# Create serverless index (preferred)
if "my-index" not in [i.name for i in pc.list_indexes()]:
    pc.create_index(
        name="my-index",
        dimension=1536,  # Match your embedding model
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1"),
    )

index = pc.Index("my-index")

# Batch upsert (required for large datasets)
def batch_upsert(vectors, batch_size=100):
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        index.upsert(vectors=batch, namespace="default")

# Upsert with metadata
vectors = [
    {"id": "doc1", "values": embedding1, "metadata": {"source": "web", "date": "2026-01-15"}},
    {"id": "doc2", "values": embedding2, "metadata": {"source": "api", "date": "2026-01-16"}},
]
index.upsert(vectors=vectors, namespace="default")

# Query with filter
results = index.query(
    vector=query_embedding,
    top_k=10,
    include_metadata=True,
    filter={"source": {"$eq": "web"}},
    namespace="default",
)

# Async support (v6+)
from pinecone import PineconeAsyncio
async_client = PineconeAsyncio(api_key=os.environ["PINECONE_API_KEY"])
```

## Version Gotchas
- **v8.0**: Python 3.9 no longer supported
- **v5.1+**: Package renamed from `pinecone-client` to `pinecone`
- **v8.0**: Uses orjson for faster JSON parsing
- **Serverless**: Use for cost efficiency, Pod for high throughput

## What NOT to Do
- Do NOT use `pinecone.init()` - use `Pinecone()` class
- Do NOT install `pinecone-client` - install `pinecone`
- Do NOT upsert large datasets without batching
- Do NOT forget namespaces for multi-tenant apps
- Do NOT leave test indexes running (costs money)

## Index Footguns
`dimension` and `metric` are **fixed at `create_index` time** and cannot be
changed afterward — the only fix is to drop and recreate the index and re-upsert
every vector. The single most common Pinecone bug Claude generates is a
`dimension` that does not match the embedding model's output width, which fails at
**upsert** (or silently mis-scores if it slips through), not at create.

```python
# FOOTGUN: index dimension MUST equal the model's output dim, exactly.
#   text-embedding-3-small -> 1536   text-embedding-3-large -> 3072
#   all-MiniLM-L6-v2 -> 384          voyage-3 -> 1024
# A 1536-dim index rejects 3072-dim vectors: "Vector dimension 3072 does not
# match the dimension of the index 1536". There is NO in-place resize.
pc.create_index(name="docs", dimension=1536, metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"))
```

- **`metric` must match how the model was trained.** OpenAI/Voyage embeddings are
  cosine; using `dotproduct` or `euclidean` on un-normalized vectors ranks by
  magnitude, not semantic similarity — recall collapses with no error raised.
- **Serverless vs pod is chosen at create and is not convertible.** Serverless
  auto-scales and bills per read/write + storage; pod-based bills per replica-hour
  and needs `pod_type`/`replicas` sizing. You migrate by creating a new index.
- **Read-after-write is eventually consistent.** An `upsert` is not guaranteed
  visible to the next `query` immediately — a test that upserts then queries in the
  same tick flakes. Poll `describe_index_stats()` for the expected vector count.
- **Upsert batch limits:** keep each `upsert` request under **~2 MB / ~1000
  vectors**; oversized batches return `400 Message length too large`. Batch as in
  the `batch_upsert` helper above. [docs.pinecone.io/guides/index-data/upsert-data,
  retrieved 2026-07-10]

## Correctness — filtering and recall
```python
# FOOTGUN: top_k is applied to the ANN candidate set, and a metadata filter is
# applied DURING the search. A highly selective filter (matches << top_k rows)
# can return fewer than top_k results, or force the index to scan wider and slow
# down. Index the fields you filter on and keep filter cardinality in mind.
results = index.query(
    vector=query_embedding,
    top_k=10,
    filter={"tenant": {"$eq": "acme"}, "lang": {"$eq": "en"}},
    include_metadata=True,
    namespace="acme",              # namespace scoping is separate from filtering
)
```
- **`top_k` trades recall for latency/cost** — Pinecone returns approximate
  neighbors; a larger `top_k` (then re-rank client-side) recovers recall lost to
  ANN approximation. Do not set `top_k=1` and assume it is the true nearest.
- **Metadata is not free** — only index fields you actually filter on; high-
  cardinality metadata inflates index size and write cost.

## Security — key scoping and tenant isolation (CWE-284 / CWE-522)
- **A namespace is a partition, not an authorization boundary.** Any caller with
  the API key can query **any** namespace — passing `namespace="acme"` is a
  convention, not enforcement. Serving multiple tenants from one index while
  trusting client-supplied namespace strings is **CWE-284 Improper Access
  Control**: the app layer MUST derive the namespace from the authenticated
  session, never from a request parameter. [cwe.mitre.org/data/definitions/284.html,
  retrieved 2026-07-10]
- **Scope API keys per environment.** Pinecone supports project/index-scoped keys;
  a leaked broadly-scoped key exposes every index. Store keys in a secret manager,
  never in code or client bundles — a browser-shipped key is **CWE-522
  Insufficiently Protected Credentials**. [cwe.mitre.org/data/definitions/522.html,
  retrieved 2026-07-10]

```python
# SAFE: derive tenant namespace from the verified session, not the request body.
def query_for(session, vector, top_k=10):
    ns = session.tenant_id                       # authenticated, server-trusted
    return index.query(vector=vector, top_k=top_k, namespace=ns,
                       include_metadata=True)
```

## Performance & Recall Tuning
- **Batch and parallelize upserts** — a serial per-vector upsert is dominated by
  round-trip latency; batch ~100–1000 vectors/request and run batches concurrently.
- **`top_k` is the recall lever** — over-fetch (`top_k` larger than you need) then
  re-rank client-side to recover neighbors the ANN approximation dropped; do not
  treat `top_k=1` as the exact nearest.
- **Namespaces bound the search space** — querying inside the right namespace scans
  fewer vectors and is both cheaper and lower-latency than one giant namespace.
- **Prune metadata** — only index fields you filter on; unused metadata inflates
  storage and write cost with no query benefit.
  [docs.pinecone.io/guides/index-data/indexing-overview, retrieved 2026-07-10]

## Testing
```python
import os, pinecone
from pinecone import Pinecone, ServerlessSpec

def test_dimension_is_enforced():
    pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
    # A mismatched dimension MUST raise, not silently succeed.
    idx = pc.Index("test-1536")
    try:
        idx.upsert([{"id": "x", "values": [0.0] * 3072}])   # wrong width
        assert False, "expected a dimension-mismatch error"
    except Exception as e:
        assert "dimension" in str(e).lower()

def test_read_after_write_is_polled():
    # never assert vector count immediately after upsert — poll stats.
    ...
```

## Version-Specific Gotchas (dated, sourced)
- **`pinecone` 9.1.0** is the current stable SDK, uploaded **2026-06-03**,
  `requires_python >= 3.10`. [pypi.org/project/pinecone/, retrieved 2026-07-10]
- **v5.1+**: the package was renamed from `pinecone-client` to `pinecone`; installing
  the old name pulls a shim. Use `pinecone`. [docs.pinecone.io/reference/python-sdk,
  retrieved 2026-07-10]
- **Serverless** is the default index type for new projects (per-request billing);
  `create_index` requires an explicit `spec` (ServerlessSpec or PodSpec).
  [docs.pinecone.io/guides/index-data/create-an-index, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Pinecone Python SDK (PyPI): https://pypi.org/project/pinecone/
- Create an index: https://docs.pinecone.io/guides/index-data/create-an-index
- Upsert data / limits: https://docs.pinecone.io/guides/index-data/upsert-data
- Metadata filtering: https://docs.pinecone.io/guides/index-data/indexing-overview
- API keys / RBAC: https://docs.pinecone.io/guides/production/security-overview
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-522 (Insufficiently Protected Credentials): https://cwe.mitre.org/data/definitions/522.html
