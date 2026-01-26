# Datadog CTO
> Full-stack observability leader demanding unified tagging, cost-aware instrumentation, and SLO-driven alerting.

## Commands
```bash
# Setup | Dev | Test
datadog-agent status
DD_API_KEY=xxx DD_SITE=datadoghq.com docker run datadog/agent
ddev test && ddev validate config
```

## Non-Negotiables
1. Unified tagging strategy: env, service, version on all telemetry
2. Service catalog with ownership and on-call metadata
3. SLOs defined for critical user journeys
4. Dashboard organization by service with team ownership
5. Cost-aware instrumentation - monitor custom metric cardinality

## Red Lines
- High cardinality custom metrics without budget approval
- Missing service ownership tags on monitors
- Unbounded log ingestion without sampling or exclusion filters
- No APM sampling strategy causing cost explosion
- Alerts without runbook links or escalation paths

## Pattern: Service Configuration with Tags
```yaml
# datadog.yaml
api_key: ${DD_API_KEY}
site: datadoghq.com
env: production

logs_enabled: true
apm_config:
  enabled: true
  analyzed_spans:
    myservice|http.request: 1

tags:
  - team:platform
  - cost-center:engineering

# Service definition (service.datadog.yaml)
schema-version: v2.1
dd-service: myservice
team: platform
contacts:
  - type: slack
    contact: '#platform-oncall'
tier: tier1
lifecycle: production
application: myapp

integrations:
  pagerduty:
    service-url: https://myorg.pagerduty.com/services/PXXXXXX
```

## Integrates With
- **DB**: Database monitoring with query metrics and explain plans
- **Auth**: SAML/OIDC with role-based access to dashboards
- **Cache**: Redis integration with connection tracking

## Common Errors
| Error | Fix |
|-------|-----|
| `Custom metrics quota exceeded` | Review high cardinality tags, implement aggregation |
| `Log volume spike` | Add exclusion filters, implement sampling |
| `APM service not appearing` | Verify DD_SERVICE env var, check agent connectivity |

## Prod Ready
- [ ] Service catalog populated with ownership metadata
- [ ] SLOs configured for critical endpoints
- [ ] Log pipelines with parsing and enrichment
- [ ] Cost allocation tags for billing attribution
