# Typesense CTO
> Fast, typo-tolerant search engine with built-in high availability.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name typesense -p 8108:8108 typesense/typesense:0.25.2 --data-dir=/data --api-key=xyz
curl http://localhost:8108/health
curl -X POST http://localhost:8108/collections -H 'X-TYPESENSE-API-KEY: xyz' -d @schema.json
```

## Non-Negotiables
1. Schema definition with explicit field types
2. Facet configuration for filtering
3. API key scopes (search-only vs admin)
4. High availability cluster (3+ nodes)
5. Curation rules for search quality
6. Synonyms for improved recall

## Red Lines
- Missing schema field definitions
- No facets for filter operations
- Single node in production
- Unbounded result sets without pagination
- Admin API key exposed to clients

## Pattern: Production Search Setup
```json
// Create collection with schema
{
  "name": "products",
  "fields": [
    { "name": "id", "type": "string" },
    { "name": "name", "type": "string" },
    { "name": "description", "type": "string" },
    { "name": "category", "type": "string", "facet": true },
    { "name": "brand", "type": "string", "facet": true },
    { "name": "price", "type": "float", "facet": true },
    { "name": "in_stock", "type": "bool", "facet": true },
    { "name": "popularity", "type": "int32" },
    { "name": "embedding", "type": "float[]", "num_dim": 384, "optional": true }
  ],
  "default_sorting_field": "popularity",
  "enable_nested_fields": false
}
```

```javascript
// Search with filters and facets
const results = await client.collections('products').documents().search({
  q: 'wireless headphones',
  query_by: 'name,description,brand',
  filter_by: 'category:=electronics && price:<500 && in_stock:true',
  facet_by: 'category,brand,price',
  sort_by: 'popularity:desc',
  per_page: 20,
  page: 1,
});

// Curation rule for search quality
await client.collections('products').overrides().upsert('promote-featured', {
  rule: { query: 'headphones', match: 'contains' },
  includes: [{ id: 'featured-123', position: 1 }],
  excludes: [{ id: 'discontinued-456' }]
});
```

## Integrates With
- **SDKs**: JavaScript, Python, Ruby, PHP, Go
- **UI**: InstantSearch.js, React InstantSearch
- **Vector**: Built-in vector search support

## Common Errors
| Error | Fix |
|-------|-----|
| `Could not find a field` | Check schema field names |
| `Field not a facet` | Add `facet: true` to schema |
| `API key unauthorized` | Check key permissions |
| `Cluster unhealthy` | Verify all nodes are running |

## Prod Ready
- [ ] Schema with explicit field types
- [ ] Facets on all filter fields
- [ ] Search-only API keys for clients
- [ ] HA cluster with 3+ nodes
- [ ] Synonyms and curations configured
