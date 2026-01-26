# pgvector CTO
> Vector search in PostgreSQL.

## Non-Negotiables
1. Index type (HNSW vs IVFFlat)
2. Dimension limits
3. Proper distance operator
4. Index maintenance
5. Partial indexes

## Red Lines
- IVFFlat without enough data
- Missing index
- Wrong distance operator
- No VACUUM after bulk insert
- Ignoring dimension limits

## Pattern
```sql
CREATE EXTENSION vector;

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  embedding vector(1536)
);

CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops);
```
