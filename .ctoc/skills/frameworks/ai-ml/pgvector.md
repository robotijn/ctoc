# pgvector CTO
> Vector similarity search directly in PostgreSQL.

## Commands
```bash
# Setup | Dev | Test
# Install extension
CREATE EXTENSION vector;
# Verify
SELECT * FROM pg_extension WHERE extname = 'vector';
# Python client
pip install pgvector psycopg[binary]
```

## Non-Negotiables
1. Choose appropriate index type (HNSW vs IVFFlat)
2. Respect dimension limits (2000 for index)
3. Use correct distance operator for use case
4. Maintain indexes after bulk operations
5. Create partial indexes for filtered queries
6. Configure HNSW build parameters

## Red Lines
- IVFFlat without sufficient training data
- Missing vector index on large tables
- Wrong distance operator for similarity type
- No VACUUM after bulk inserts
- Exceeding dimension limits
- Not tuning ef_search for recall

## Pattern: Production Vector Store
```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table with vector column
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create HNSW index (recommended for most cases)
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Or IVFFlat for very large datasets with more RAM constraints
-- CREATE INDEX ON documents
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);

-- Partial index for filtered queries
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops)
WHERE (metadata->>'type' = 'article');

-- Similarity search
SELECT id, content, 1 - (embedding <=> $1) AS similarity
FROM documents
ORDER BY embedding <=> $1  -- Cosine distance
LIMIT 10;

-- With metadata filter
SELECT id, content
FROM documents
WHERE metadata->>'category' = 'tech'
ORDER BY embedding <=> $1
LIMIT 10;

-- After bulk insert
VACUUM ANALYZE documents;
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

## Integrates With
- **ORMs**: SQLAlchemy, Django, Prisma
- **Databases**: PostgreSQL, Supabase, Neon
- **Embeddings**: OpenAI, Sentence Transformers
- **Frameworks**: LangChain, LlamaIndex

## Common Errors
| Error | Fix |
|-------|-----|
| `index row size exceeds maximum` | Reduce vector dimensions below 2000 |
| `operator does not exist` | Use correct operator: <=> (cosine), <-> (L2) |
| `index not used` | Check planner, increase effective_cache_size |
| `slow queries after bulk insert` | Run VACUUM ANALYZE |

## Prod Ready
- [ ] HNSW or IVFFlat index created
- [ ] Dimension within limits
- [ ] Correct distance operator used
- [ ] VACUUM scheduled after bulk ops
- [ ] ef_search tuned for recall needs
- [ ] Partial indexes for common filters
