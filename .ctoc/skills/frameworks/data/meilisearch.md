# Meilisearch CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name meilisearch -p 7700:7700 \
  -e MEILI_MASTER_KEY=masterkey \
  getmeili/meilisearch:v1.6
# Dashboard at http://localhost:7700
```

## Claude's Common Mistakes
1. **All attributes searchable** - Configure searchableAttributes for relevance
2. **Filtering without filterableAttributes** - Must set before querying
3. **No API key in production** - Master key required; generate search keys
4. **Sorting without sortableAttributes** - Must configure explicitly
5. **Large documents** - Split or reduce document size

## Correct Patterns (2026)
```javascript
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: 'http://localhost:7700',
  apiKey: 'masterkey',
});

// Configure index settings (order matters for relevance!)
await client.index('products').updateSettings({
  searchableAttributes: ['name', 'description', 'category', 'brand'],
  filterableAttributes: ['category', 'brand', 'price', 'in_stock'],
  sortableAttributes: ['price', 'created_at', 'popularity'],
  rankingRules: [
    'words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'
  ],
});

// Add documents
await client.index('products').addDocuments(products);

// Search with filters and facets
const results = await client.index('products').search('wireless headphones', {
  filter: ['category = electronics', 'price < 500', 'in_stock = true'],
  facets: ['brand', 'category'],
  sort: ['price:asc'],
  limit: 20,
  offset: 0,
});
```

## Version Gotchas
- **v1.6+**: Hybrid search (keyword + vector) support
- **v1.6+**: Multi-index search in single query
- **Typo tolerance**: Built-in; configurable per attribute
- **Instant Search**: InstantSearch.js components work out of box

## What NOT to Do
- Do NOT leave all attributes searchable (poor relevance)
- Do NOT filter without setting filterableAttributes first
- Do NOT expose master key to clients (generate search-only keys)
- Do NOT skip pagination (use limit/offset)
