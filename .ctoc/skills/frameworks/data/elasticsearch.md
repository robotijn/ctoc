# Elasticsearch CTO
> Distributed search and analytics.

## Non-Negotiables
1. Index mapping design
2. Shard sizing strategy
3. Query DSL optimization
4. Index lifecycle management
5. Proper analyzers

## Red Lines
- Dynamic mapping in production
- Too many shards (overshard)
- Missing ILM policies
- Deeply nested documents
- Wildcard queries on analyzed fields

## Pattern
```json
{
  "mappings": {
    "properties": {
      "title": { "type": "text", "analyzer": "english" },
      "status": { "type": "keyword" }
    }
  }
}
```
