# Grafana CTO
> Observability visualization leader demanding dashboard-as-code, template variables, and alert integration.

## Commands
```bash
# Setup | Dev | Test
grafana-cli plugins install grafana-piechart-panel
docker compose up -d grafana && curl http://localhost:3000/api/health
grr apply dashboards/ && grr watch dashboards/
```

## Non-Negotiables
1. Dashboard as code with Grafonnet, Jsonnet, or Terraform provider
2. Folder organization by team/service with proper RBAC
3. Variable templating for reusable dashboards ($namespace, $instance)
4. Sensible time ranges and refresh intervals per use case
5. Alert integration with Grafana Alerting or Prometheus

## Red Lines
- Manual dashboard changes in production - use provisioning
- Hardcoded data source names - use variable substitution
- Missing dashboard descriptions and panel titles
- No row organization in large dashboards
- Refresh rate under 30s for non-real-time dashboards

## Pattern: Provisioned Dashboard with Variables
```json
{
  "dashboard": {
    "title": "Service Overview",
    "uid": "service-overview",
    "tags": ["generated", "infrastructure"],
    "templating": {
      "list": [
        {
          "name": "datasource",
          "type": "datasource",
          "query": "prometheus"
        },
        {
          "name": "namespace",
          "type": "query",
          "datasource": "${datasource}",
          "query": "label_values(up, namespace)",
          "refresh": 2
        }
      ]
    },
    "panels": [
      {
        "title": "Request Rate",
        "type": "timeseries",
        "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{namespace=\"$namespace\"}[5m]))",
            "legendFormat": "{{ job }}"
          }
        ]
      }
    ]
  }
}
```

## Integrates With
- **DB**: PostgreSQL/MySQL data sources for business metrics
- **Auth**: OAuth/OIDC with team-based folder permissions
- **Cache**: Redis data source for real-time session data

## Common Errors
| Error | Fix |
|-------|-----|
| `Datasource not found` | Verify provisioned datasources, check uid matches |
| `Template variable no values` | Check query syntax, verify datasource connectivity |
| `Panel data is null` | Verify metric exists, check time range alignment |

## Prod Ready
- [ ] Dashboards provisioned from Git repository
- [ ] Data sources configured via Terraform or provisioning
- [ ] Alert rules with proper notification channels
- [ ] Public dashboards disabled or protected with auth
