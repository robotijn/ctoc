# OpenSearch CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name opensearch -p 9200:9200 -p 9600:9600 \
  -e "discovery.type=single-node" \
  -e "OPENSEARCH_INITIAL_ADMIN_PASSWORD=Admin123!" \
  opensearchproject/opensearch:2.11
# Dashboards available separately
```

## Claude's Common Mistakes
1. **Elasticsearch patterns without adaptation** - ISM replaces ILM
2. **Security plugin disabled** - Required in production (enabled by default)
3. **No ISM policies** - Index State Management is OpenSearch's lifecycle
4. **Dynamic mapping in production** - Explicit mappings required
5. **Ignoring Performance Analyzer** - Built-in monitoring tool

## Correct Patterns (2026)
```json
// Index template with ISM policy
PUT _index_template/logs_template
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 2,
      "plugins.index_state_management.policy_id": "logs_policy"
    },
    "mappings": {
      "properties": {
        "timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "message": { "type": "text" },
        "service": { "type": "keyword" }
      }
    }
  }
}

// ISM policy (OpenSearch's ILM equivalent)
PUT _plugins/_ism/policies/logs_policy
{
  "policy": {
    "states": [
      {
        "name": "hot",
        "actions": [{ "rollover": { "min_size": "30gb" } }],
        "transitions": [{ "state_name": "warm", "conditions": { "min_index_age": "7d" } }]
      },
      {
        "name": "warm",
        "actions": [{ "replica_count": { "number_of_replicas": 0 } }],
        "transitions": [{ "state_name": "delete", "conditions": { "min_index_age": "30d" } }]
      },
      { "name": "delete", "actions": [{ "delete": {} }] }
    ]
  }
}
```

## Version Gotchas
- **vs Elasticsearch**: ISM not ILM; _plugins API paths differ
- **Security**: Always on; configure users/roles via Security plugin
- **ML Commons**: Built-in ML framework for embeddings/anomaly detection
- **k-NN**: Native vector search plugin

## What NOT to Do
- Do NOT assume Elasticsearch API paths work (use _plugins)
- Do NOT disable security plugin in production
- Do NOT skip ISM policies for time-series indices
- Do NOT use dynamic mapping in production
