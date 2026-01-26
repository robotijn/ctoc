# Meilisearch CTO
> Lightning-fast, typo-tolerant search engine for instant search experiences.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name meilisearch -p 7700:7700 getmeili/meilisearch:v1.6
curl http://localhost:7700/health
curl -X POST http://localhost:7700/indexes/products/documents -H 'Content-Type: application/json' -d @data.json
```

## Non-Negotiables
1. Configure searchableAttributes for relevance
2. Set filterableAttributes before filtering
3. Customize ranking rules for use case
4. Master key required in production
5. Pagination with offset/limit or cursor
6. Sortable attributes configured explicitly

## Red Lines
- All attributes searchable (poor relevance)
- Missing filterableAttributes for facets
- No API key authentication in production
- Large documents exceeding limits
- Ignoring indexing settings for performance

## Pattern: Search Index Configuration
```bash
# Create index with primary key
curl -X POST 'http://localhost:7700/indexes' \
  -H 'Authorization: Bearer MASTER_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"uid": "products", "primaryKey": "id"}'

# Configure searchable attributes (order matters for relevance)
curl -X PUT 'http://localhost:7700/indexes/products/settings/searchable-attributes' \
  -H 'Authorization: Bearer MASTER_KEY' \
  -H 'Content-Type: application/json' \
  -d '["name", "description", "category", "brand"]'

# Configure filterable attributes
curl -X PUT 'http://localhost:7700/indexes/products/settings/filterable-attributes' \
  -H 'Authorization: Bearer MASTER_KEY' \
  -H 'Content-Type: application/json' \
  -d '["category", "brand", "price", "in_stock"]'

# Configure sortable attributes
curl -X PUT 'http://localhost:7700/indexes/products/settings/sortable-attributes' \
  -H 'Authorization: Bearer MASTER_KEY' \
  -H 'Content-Type: application/json' \
  -d '["price", "created_at", "popularity"]'
```

```javascript
// Search with filters and facets
const results = await index.search('wireless headphones', {
  filter: ['category = electronics', 'price < 500', 'in_stock = true'],
  facets: ['brand', 'category'],
  sort: ['price:asc'],
  limit: 20,
  offset: 0,
});
```

## Integrates With
- **SDKs**: JavaScript, Python, Ruby, PHP, Go, Rust
- **Frameworks**: Instant Search UI components
- **Sync**: Meilisync for database replication

## Common Errors
| Error | Fix |
|-------|-----|
| `invalid_api_key` | Check Authorization header |
| `attribute not filterable` | Add to filterableAttributes first |
| `document too large` | Split or reduce document size |
| `indexing slow` | Batch documents, tune settings |

## Prod Ready
- [ ] Master key and API keys configured
- [ ] Searchable/filterable attributes set
- [ ] Ranking rules customized
- [ ] Pagination for all queries
- [ ] Backups via snapshots or dumps
