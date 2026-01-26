# Elasticsearch CTO
> Distributed search and analytics engine for full-text and structured data.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name elastic -p 9200:9200 elasticsearch:8.11.0
curl localhost:9200/_cluster/health?pretty
curl -X PUT localhost:9200/myindex -H 'Content-Type: application/json' -d @mapping.json
```

## Non-Negotiables
1. Explicit index mappings before production
2. Shard sizing: 10-50GB per shard, <1000 shards per node
3. Index lifecycle management (ILM) for time-series
4. Proper field types: keyword for exact, text for full-text
5. Bulk API for indexing (1000-5000 docs per batch)
6. Query optimization with filters before queries

## Red Lines
- Dynamic mapping in production indexes
- Oversharding (too many small shards)
- Missing ILM policies for growing data
- Deeply nested objects (>2 levels)
- Wildcard queries on analyzed text fields

## Pattern: Production Index Design
```json
// Index mapping with explicit types
PUT /products
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "30s"
  },
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "analyzer": "english",
        "fields": { "keyword": { "type": "keyword" } }
      },
      "category": { "type": "keyword" },
      "price": { "type": "float" },
      "tags": { "type": "keyword" },
      "created_at": { "type": "date" },
      "description": { "type": "text", "index": false }
    }
  }
}

// Optimized search query
POST /products/_search
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "category": "electronics" } },
        { "range": { "price": { "gte": 100, "lte": 500 } } }
      ],
      "must": [
        { "match": { "name": "wireless headphones" } }
      ]
    }
  },
  "sort": [{ "price": "asc" }],
  "size": 20
}
```

## Integrates With
- **Ingest**: Logstash, Beats, direct API
- **Viz**: Kibana, Grafana
- **Languages**: Official clients for Python, Java, JS, Go

## Common Errors
| Error | Fix |
|-------|-----|
| `circuit_breaking_exception` | Reduce query complexity or add memory |
| `mapper_parsing_exception` | Check field type matches data |
| `index_not_found` | Verify index exists or alias |
| `search_phase_execution_exception` | Check shard health |

## Prod Ready
- [ ] Explicit mappings for all indexes
- [ ] ILM policies for index lifecycle
- [ ] Shard sizing optimized
- [ ] Bulk indexing for writes
- [ ] Monitoring via _cat APIs or Kibana
