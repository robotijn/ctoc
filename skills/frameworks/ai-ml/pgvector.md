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
