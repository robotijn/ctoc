# Elasticsearch CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Server (security enabled by default in v8+)
docker run -d --name elastic -p 9200:9200 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  elasticsearch:8.17.0

# Clients
pip install elasticsearch    # Python
npm install @elastic/elasticsearch  # Node.js
```

## Claude's Common Mistakes
1. **Dynamic mapping in production** - Explicit mappings prevent type conflicts
2. **Using v7 client on v8 cluster** - Client v9 requires ES v9; use compatibility mode
3. **Wildcard queries on text fields** - Extremely slow; use keyword subfields
4. **Missing ILM policies** - Indices grow unbounded without lifecycle management
5. **Security disabled carelessly** - v8+ has security ON by default

## Correct Patterns (2026)
```python
from elasticsearch import Elasticsearch

# v8+ connection (security enabled by default)
es = Elasticsearch(
    "https://localhost:9200",
    api_key="your-api-key",  # Preferred over basic auth
    verify_certs=True,
)

# Explicit mapping (never rely on dynamic mapping)
es.indices.create(index="products", body={
    "settings": {"number_of_shards": 3, "refresh_interval": "30s"},
    "mappings": {
        "properties": {
            "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "category": {"type": "keyword"},
            "price": {"type": "float"},
            "created_at": {"type": "date"}
        }
    }
})

# Optimized query: filters before full-text
results = es.search(index="products", body={
    "query": {
        "bool": {
            "filter": [
                {"term": {"category": "electronics"}},
                {"range": {"price": {"gte": 100, "lte": 500}}}
            ],
            "must": [{"match": {"name": "wireless headphones"}}]
        }
    }
})
```

## Version Gotchas
- **v8->v9**: Client v9 only works with ES v9; use compatibility mode for v8
- **v8 security**: TLS and auth enabled by default; cannot be disabled in cloud
- **ILM required**: Set index lifecycle policies for time-series data
- **Shard sizing**: Target 10-50GB per shard; avoid oversharding

## What NOT to Do
- Do NOT use dynamic mapping in production (type conflicts)
- Do NOT run wildcard queries on analyzed text fields
- Do NOT use elasticsearch-py v9 with ES v8 cluster
- Do NOT skip ILM policies for growing indices
