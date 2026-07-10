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

## Index Footguns — type, metric, nlist/nprobe, load-before-search
Milvus makes you choose an **index type** and a **metric** explicitly, and the two
must be compatible with your vectors. The most common runtime error Claude
produces is searching a collection that was **never loaded into memory**.

```python
# FOOTGUN: metric_type at index time MUST match the search param, and both must
# match the model (COSINE/IP for normalized text; L2 for raw). Mismatch = wrong
# ranking or an error.
collection.create_index("embedding", {
    "index_type": "IVF_FLAT",           # IVF_FLAT/HNSW/DISKANN — pick per scale
    "metric_type": "COSINE",
    "params": {"nlist": 1024},          # IVF: #clusters. ~4*sqrt(N) is a start
})
collection.load()                        # REQUIRED — search on an unloaded coll errors
results = collection.search(
    data=[query_embedding], anns_field="embedding",
    param={"metric_type": "COSINE", "params": {"nprobe": 16}},  # #clusters probed
    limit=10, expr="category == 'api'",
)
```
- **`nlist` (build) vs `nprobe` (search)** are the IVF recall-vs-latency knobs:
  more `nlist` = finer clusters; higher `nprobe` = more clusters scanned = better
  recall, slower search. HNSW uses `M`/`efConstruction` (build) and `ef` (search)
  instead. DiskANN trades RAM for SSD at large scale.
  [milvus.io/docs/index-vector-fields.md, retrieved 2026-07-10]
- **Index type must fit the scale:** FLAT (brute force) is exact but O(N) — fine
  under ~100k, catastrophic at millions. Choose IVF/HNSW/DiskANN above that.
- **Load before search, release when done.** `collection.load()` pins the
  collection (and its index) into memory; searching an unloaded collection raises
  `collection not loaded`. `release()` frees it. Partitions can be loaded
  selectively. [milvus.io/docs/load_collection.md, retrieved 2026-07-10]

## Consistency — level trade-off
```python
# FOOTGUN: consistency_level trades freshness for latency.
#   Strong    -> reads see all prior writes (highest latency)
#   Bounded   -> reads may lag by a bounded staleness window (default, balanced)
#   Eventually-> lowest latency, may miss very recent writes
results = collection.search(..., consistency_level="Strong")   # RAG-correctness
```
A test that inserts then searches under `Eventually` can miss the just-written row
and flake; use `Strong` (or `Bounded` with a wait) for read-your-write.
[milvus.io/docs/consistency.md, retrieved 2026-07-10]

## Security — RBAC and collection isolation (CWE-284 / CWE-285)
- **Enable authentication + RBAC.** Milvus ships with auth disabled in the default
  standalone compose; an open instance is **CWE-284 Improper Access Control**.
  Turn on `common.security.authorizationEnabled`, change the default
  `root:Milvus` credential, and grant per-role privileges.
  [cwe.mitre.org/data/definitions/284.html and milvus.io/docs/authenticate.md,
  retrieved 2026-07-10]
- **Multi-tenant by collection or partition-key — enforce it server-side.** Using
  a client-supplied `partition_key`/`expr` tenant filter without authorization lets
  one tenant read another's vectors — **CWE-285 Improper Authorization**.
  [cwe.mitre.org/data/definitions/285.html, retrieved 2026-07-10]

```python
from pymilvus import connections
# SAFE: connect with credentials; derive the tenant expr from the session.
connections.connect(host="milvus", port="19530",
                    user="app", password=os.environ["MILVUS_PW"])   # not root
def search(session, collection, vec, limit=10):
    return collection.search(
        data=[vec], anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"nprobe": 16}},
        limit=limit, expr=f'tenant == "{session.tenant_id}"')       # server-trusted
```

## Performance & Recall Tuning
- **`nprobe` (IVF) / `ef` (HNSW) are the query recall/latency dials** — raise for
  recall, lower for speed; `nlist` / `M`+`efConstruction` set the build ceiling.
- **DiskANN / mmap for RAM-bound scale** — DiskANN serves billions from SSD at some
  latency cost; mmap keeps rarely-used data off the heap.
- **Load selectively** — `collection.load()` or per-partition loading pins only what
  you search into memory; release what you no longer query.
- **Partition/partition-key pruning** cuts the scanned set for time-series or
  tenant-sharded data before the ANN step. [milvus.io/docs/index-vector-fields.md,
  retrieved 2026-07-10]

## Testing
```python
from pymilvus import MilvusClient

def test_load_before_search():
    client = MilvusClient("milvus_test.db")            # Milvus Lite, zero doubles
    client.create_collection("t", dimension=4)
    client.insert("t", [{"id": 1, "vector": [1,0,0,0]}])
    hits = client.search("t", data=[[1,0,0,0]], limit=1)   # Lite auto-loads
    assert hits[0][0]["id"] == 1

def test_metric_mismatch_ranks_wrong():
    ...                                                # L2 index vs COSINE search
```

## Version-Specific Gotchas (dated, sourced)
- **Milvus server v2.6.19** is the current release, published **2026-06-26**.
  [github.com/milvus-io/milvus/releases, retrieved 2026-07-10]
- **`pymilvus` 3.0.0** is the current Python client, uploaded **2026-05-07**.
  `MilvusClient("*.db")` runs Milvus Lite in-process for tests.
  [pypi.org/project/pymilvus/, retrieved 2026-07-10]
- **Create the index AFTER bulk insert** and **`load()` before search** — both are
  hard runtime requirements, not optimizations. [milvus.io/docs/manage-indexes.md,
  retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Milvus server releases: https://github.com/milvus-io/milvus/releases
- pymilvus (PyPI): https://pypi.org/project/pymilvus/
- Index vector fields: https://milvus.io/docs/index-vector-fields.md
- Load / release collection: https://milvus.io/docs/load_collection.md
- Consistency levels: https://milvus.io/docs/consistency.md
- Authenticate / RBAC: https://milvus.io/docs/authenticate.md
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-285 (Improper Authorization): https://cwe.mitre.org/data/definitions/285.html
