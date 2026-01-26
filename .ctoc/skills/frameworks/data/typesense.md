# Typesense CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name typesense -p 8108:8108 \
  typesense/typesense:26.0 \
  --data-dir=/data --api-key=xyz
# Health check: http://localhost:8108/health
```

## Claude's Common Mistakes
1. **Missing schema field definitions** - Typesense requires explicit schema
2. **No facet on filter fields** - Must set `facet: true` in schema
3. **Admin key exposed to clients** - Generate search-only API keys
4. **Single node in production** - Use 3+ nodes for HA
5. **Pagination missing** - Always use per_page and page

## Correct Patterns (2026)
```javascript
import Typesense from 'typesense';

const client = new Typesense.Client({
  nodes: [{ host: 'localhost', port: 8108, protocol: 'http' }],
  apiKey: 'xyz',
});

// Create collection with explicit schema
await client.collections().create({
  name: 'products',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'category', type: 'string', facet: true },
    { name: 'brand', type: 'string', facet: true },
    { name: 'price', type: 'float', facet: true },
    { name: 'in_stock', type: 'bool', facet: true },
    { name: 'popularity', type: 'int32' },
    { name: 'embedding', type: 'float[]', num_dim: 384, optional: true },
  ],
  default_sorting_field: 'popularity',
});

// Search with filters and facets
const results = await client.collections('products').documents().search({
  q: 'wireless headphones',
  query_by: 'name,description,brand',
  filter_by: 'category:=electronics && price:<500 && in_stock:true',
  facet_by: 'category,brand',
  sort_by: 'popularity:desc',
  per_page: 20,
  page: 1,
});

// Curation rules for search quality
await client.collections('products').overrides().upsert('promote-featured', {
  rule: { query: 'headphones', match: 'contains' },
  includes: [{ id: 'featured-123', position: 1 }],
});
```

## Version Gotchas
- **v26+**: Native vector search with embedding field type
- **Conversational search**: Built-in RAG support
- **Geo search**: Built-in with geopoint field type
- **HA**: 3+ nodes with Raft consensus

## What NOT to Do
- Do NOT skip explicit schema definition
- Do NOT forget `facet: true` on filter fields
- Do NOT expose admin API key to clients
- Do NOT run single node in production (no HA)
