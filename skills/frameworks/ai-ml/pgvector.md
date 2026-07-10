# pgvector CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# PostgreSQL extension
CREATE EXTENSION vector;
# Python client
pip install pgvector psycopg[binary]
# Verify: SELECT * FROM pg_extension WHERE extname = 'vector';
```

## Claude's Common Mistakes
1. Using IVFFlat without enough rows (need 1000+ per list)
2. Missing VACUUM ANALYZE after bulk inserts
3. Wrong distance operator for use case
4. Index not being used (check with EXPLAIN)
5. Exceeding 2000 dimension limit for indexes

## Correct Patterns (2026)
```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table with vector column
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536),  -- Max 2000 for index
    created_at TIMESTAMP DEFAULT NOW()
);

-- HNSW index (recommended for most cases)
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- IVFFlat for very large datasets (slower recall, faster build)
-- CREATE INDEX ON documents
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);  -- sqrt(rows) is good starting point

-- VACUUM after bulk insert (CRITICAL)
VACUUM ANALYZE documents;

-- Similarity search (cosine)
SELECT id, content, 1 - (embedding <=> $1) AS similarity
FROM documents
ORDER BY embedding <=> $1  -- <=> = cosine distance
LIMIT 10;

-- With metadata filter
SELECT id, content
FROM documents
WHERE metadata->>'category' = 'tech'
ORDER BY embedding <=> $1
LIMIT 10;
```

```python
# Python with psycopg
import psycopg
from pgvector.psycopg import register_vector

conn = psycopg.connect("postgresql://localhost/mydb")
register_vector(conn)

# Insert
conn.execute(
    "INSERT INTO documents (content, embedding) VALUES (%s, %s)",
    ("Document text", embedding)
)

# Search
results = conn.execute(
    "SELECT id, content FROM documents ORDER BY embedding <=> %s LIMIT %s",
    (query_embedding, 10)
).fetchall()
```

## Version Gotchas
- **Operators**: `<=>` cosine, `<->` L2, `<#>` inner product
- **HNSW vs IVFFlat**: HNSW for quality, IVFFlat for build speed
- **Dimension limit**: 2000 for indexed columns
- **Index usage**: Check with `EXPLAIN ANALYZE`

## What NOT to Do
- Do NOT skip VACUUM ANALYZE after bulk inserts
- Do NOT use IVFFlat with few rows (need 1000+ per list)
- Do NOT forget to check index usage with EXPLAIN
- Do NOT exceed 2000 dimensions for indexed columns
- Do NOT use wrong distance operator for your use case

## Index Footguns — IVFFlat vs HNSW, opclass, build order
The distance **operator MUST match the index opclass**, or Postgres ignores the
index and silently falls back to a sequential scan (correct results, catastrophic
latency). `<->` ↔ `vector_l2_ops`, `<=>` ↔ `vector_cosine_ops`, `<#>` ↔
`vector_ip_ops`.

```sql
-- HNSW: best speed-recall, higher build cost. m = graph degree,
-- ef_construction = build candidate list (higher = better graph, slower build).
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- IVFFlat: faster build, less memory, lower query recall. `lists` is the number
-- of partitions. Official guidance: rows/1000 up to 1M rows, sqrt(rows) above 1M.
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```
- **Build the index AFTER bulk load, with a large `maintenance_work_mem`.** HNSW
  builds far faster when the graph fits in `maintenance_work_mem`; once it spills,
  build slows sharply (`NOTICE: hnsw graph no longer fits into maintenance_work_mem`).
  IVFFlat additionally needs representative data present at build time to pick good
  cluster centroids — building on an empty/tiny table wrecks recall.
  [github.com/pgvector/pgvector#index-build-time, retrieved 2026-07-10]

```sql
SET maintenance_work_mem = '8GB';   -- size to the graph; do NOT exhaust server RAM
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
```

## Correctness — ef_search, filter-after-scan, exact vs approximate
```sql
-- Query-time recall knob. HNSW default hnsw.ef_search is 40 (verified upstream).
-- Filters are applied AFTER the index returns its ef_search candidates, so a
-- selective WHERE can return FEWER than LIMIT rows. Raise ef_search or enable
-- iterative index scans (pgvector 0.8+) when filtering.
SET hnsw.ef_search = 100;                 -- higher = better recall, slower
SELECT id, content
FROM documents
WHERE tenant_id = $1                       -- filter applied after the index scan
ORDER BY embedding <=> $2                  -- <=> requires vector_cosine_ops index
LIMIT 10;
```
- **No index = exact (sequential) scan.** Without an ANN index the query is exact
  but O(N); with an index it is approximate. A missing/ignored index is the #1
  "why is pgvector slow" cause — confirm with `EXPLAIN ANALYZE` that an
  `Index Scan using ..._hnsw` (not `Seq Scan`) is chosen.
- **Dimension limits:** `vector` supports up to **2,000 dimensions**; `halfvec` up
  to 4,000; `bit` up to 64,000. Indexed `vector` columns are capped at 2,000 dims —
  use `halfvec` (or dimensionality reduction) for wider models.
  [github.com/pgvector/pgvector#vector-type, retrieved 2026-07-10]

## Security — RLS for multi-tenant vectors + SQL injection (CWE-284 / CWE-89)
- **Multi-tenant vectors without Row-Level Security is broken access control
  (CWE-284).** If every tenant's rows live in one `documents` table and isolation
  relies only on the app adding `WHERE tenant_id = ...`, a single missing predicate
  leaks all tenants. Enforce it in the database with RLS.
  [cwe.mitre.org/data/definitions/284.html, retrieved 2026-07-10]

```sql
-- SAFE: RLS makes tenant isolation a database invariant, not an app convention.
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- App sets the session GUC from the AUTHENTICATED identity, never from request body:
-- SET app.tenant_id = '...';   (server-trusted)
```
- **Never string-concatenate a vector or filter into SQL (CWE-89).** Build the
  query with parameters and `register_vector`; interpolating user text into the
  `WHERE`/`ORDER BY` is classic SQL injection.
  [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

```python
# SAFE: parameterized — the embedding and filter are bound, never concatenated.
cur.execute(
    "SELECT id, content FROM documents WHERE tenant_id = %s "
    "ORDER BY embedding <=> %s LIMIT %s",
    (tenant_id, query_embedding, 10),               # register_vector adapts the vector
)
```

## Performance & Recall Tuning
- **`hnsw.ef_search` is the query recall/latency dial** (default 40) — raise for
  recall on filtered or hard queries, lower for speed. `SET LOCAL` scopes it to the
  transaction.
- **`ivfflat.probes`** is the IVFFlat equivalent — more probes = more lists scanned
  = better recall, slower; start at `sqrt(lists)`.
- **Build with a large `maintenance_work_mem`** so the HNSW graph fits in memory,
  and build the index AFTER bulk load; `VACUUM ANALYZE` afterward so the planner has
  fresh stats and actually chooses the index.
- **Confirm with `EXPLAIN ANALYZE`** that an index scan (not `Seq Scan`) is chosen —
  a missing/ignored index is the top pgvector latency cause.
  [github.com/pgvector/pgvector#query-options, retrieved 2026-07-10]

## Testing
```python
import psycopg
from pgvector.psycopg import register_vector

def test_index_is_used_not_seqscan(conn):
    register_vector(conn)
    plan = conn.execute(
        "EXPLAIN (FORMAT TEXT) SELECT id FROM documents "
        "ORDER BY embedding <=> %s LIMIT 5", (query_vec,)
    ).fetchall()
    text = "\n".join(r[0] for r in plan)
    assert "Seq Scan" not in text, "ANN index was not used"

def test_operator_matches_opclass():
    # cosine query (<=>) needs a vector_cosine_ops index or it seq-scans.
    ...
```

## Version-Specific Gotchas (dated, sourced)
- **pgvector extension v0.8.5** is the current release; install it as a Postgres
  extension (`CREATE EXTENSION vector;`). [github.com/pgvector/pgvector/tags,
  retrieved 2026-07-10]
- **`pgvector` Python client 0.5.0** (the psycopg/SQLAlchemy adapter) is separate
  from the extension, uploaded **2026-07-06**, `requires_python >= 3.10`. Do not
  confuse the client version with the extension version.
  [pypi.org/project/pgvector/, retrieved 2026-07-10]
- **HNSW `hnsw.ef_search` defaults to 40**, and approximate-index filters are
  applied after the scan — use `SET hnsw.ef_search` and/or iterative index scans
  (0.8+) when filtering. [github.com/pgvector/pgvector#querying, retrieved
  2026-07-10]

## References (retrieved 2026-07-10)
- pgvector extension + docs: https://github.com/pgvector/pgvector
- pgvector releases/tags: https://github.com/pgvector/pgvector/tags
- pgvector Python client (PyPI): https://pypi.org/project/pgvector/
- Index build time / HNSW: https://github.com/pgvector/pgvector#index-build-time
- PostgreSQL Row-Level Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
