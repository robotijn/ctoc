# Grafana CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Debian/Ubuntu
sudo apt-get install -y apt-transport-https software-properties-common
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt-get update && sudo apt-get install grafana
# Or Docker
docker run -d -p 3000:3000 grafana/grafana:11.4.0
```

## Claude's Common Mistakes
1. **Manual dashboard changes in production** - Use provisioning or Terraform
2. **Hardcodes datasource names** - Use variable substitution
3. **Missing dashboard descriptions** - Users need context
4. **Fast refresh rates** - Under 30s wastes resources for non-real-time
5. **Uses deprecated panels** - Graph panel replaced by Time series

## Correct Patterns (2026)
```json
{
  "dashboard": {
    "title": "Service Overview",
    "uid": "service-overview-v1",
    "tags": ["generated", "infrastructure"],
    "description": "Overview metrics for all services",
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
          "datasource": {"type": "prometheus", "uid": "${datasource}"},
          "query": "label_values(up, namespace)",
          "refresh": 2,
          "multi": true
        }
      ]
    },
    "panels": [
      {
        "title": "Request Rate",
        "description": "HTTP requests per second by job",
        "type": "timeseries",
        "gridPos": {"x": 0, "y": 0, "w": 12, "h": 8},
        "targets": [
          {
            "datasource": {"type": "prometheus", "uid": "${datasource}"},
            "expr": "sum(rate(http_requests_total{namespace=~\"$namespace\"}[5m])) by (job)",
            "legendFormat": "{{ job }}"
          }
        ]
      }
    ],
    "refresh": "30s"
  }
}
```

## Version Gotchas
- **Grafana 11.x**: New alerting system, legacy alerting removed
- **Grafana 10.x**: Graph panel deprecated, use Time series
- **Security releases**: Watch for +security suffix versions
- **With Terraform**: grafana_dashboard resource for GitOps

## What NOT to Do
- Do NOT make manual changes in production - use provisioning
- Do NOT hardcode datasource UIDs - use variables
- Do NOT use refresh under 30s without real-time need
- Do NOT use deprecated Graph panel - use Time series
- Do NOT skip dashboard descriptions
