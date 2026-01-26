# Grafana CTO
> Observability visualization platform.

## Non-Negotiables
1. Dashboard as code (JSON/Grafonnet)
2. Folder organization
3. Variable templating
4. Proper time ranges
5. Alert integration

## Red Lines
- Manual dashboard changes in prod
- Hardcoded data source names
- Missing dashboard descriptions
- No row organization
- Excessive refresh rates

## Pattern
```json
{
  "dashboard": {
    "title": "Service Overview",
    "templating": {
      "list": [{
        "name": "instance",
        "type": "query",
        "datasource": "${DS_PROMETHEUS}"
      }]
    }
  }
}
```
