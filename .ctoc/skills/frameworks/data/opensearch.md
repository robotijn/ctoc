# OpenSearch CTO
> Open-source search and analytics suite, Elasticsearch-compatible.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name opensearch -p 9200:9200 opensearchproject/opensearch:2
curl -k https://localhost:9200 -u admin:admin
curl -k -X PUT https://localhost:9200/myindex -u admin:admin -H 'Content-Type: application/json' -d @mapping.json
```

## Non-Negotiables
1. Index templates for consistent mappings
2. Index State Management (ISM) policies for lifecycle
3. Security plugin configured with authentication
4. Shard allocation awareness for fault tolerance
5. Snapshot repository for backups
6. Explicit mappings over dynamic

## Red Lines
- All Elasticsearch anti-patterns apply here
- No ISM policies for growing indexes
- Security plugin disabled in production
- Uncontrolled index growth
- No backup/restore strategy

## Pattern: Production Index Management
```json
// Index template with ISM policy
PUT _index_template/logs_template
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 2,
      "number_of_replicas": 1,
      "plugins.index_state_management.policy_id": "logs_policy"
    },
    "mappings": {
      "properties": {
        "timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "message": { "type": "text" },
        "service": { "type": "keyword" },
        "trace_id": { "type": "keyword" }
      }
    }
  }
}

// ISM policy for log retention
PUT _plugins/_ism/policies/logs_policy
{
  "policy": {
    "policy_id": "logs_policy",
    "states": [
      {
        "name": "hot",
        "actions": [{ "rollover": { "min_size": "30gb", "min_index_age": "1d" } }],
        "transitions": [{ "state_name": "warm", "conditions": { "min_index_age": "7d" } }]
      },
      {
        "name": "warm",
        "actions": [{ "replica_count": { "number_of_replicas": 0 } }],
        "transitions": [{ "state_name": "delete", "conditions": { "min_index_age": "30d" } }]
      },
      {
        "name": "delete",
        "actions": [{ "delete": {} }]
      }
    ]
  }
}
```

## Integrates With
- **Ingest**: Logstash, Fluent Bit, Data Prepper
- **Viz**: OpenSearch Dashboards, Grafana
- **Security**: SAML, OIDC, LDAP backends

## Common Errors
| Error | Fix |
|-------|-----|
| `security_exception` | Check user roles and permissions |
| `index_not_found_exception` | Verify index or alias exists |
| `circuit_breaking_exception` | Increase memory or reduce query |
| `ISM policy not applied` | Check policy attachment to index |

## Prod Ready
- [ ] Index templates for all patterns
- [ ] ISM policies for lifecycle management
- [ ] Security plugin with authentication
- [ ] Snapshot repository configured
- [ ] Monitoring via Performance Analyzer
