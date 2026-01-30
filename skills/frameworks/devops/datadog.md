# Datadog CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Agent install (Linux)
DD_API_KEY=<YOUR_API_KEY> DD_SITE="datadoghq.com" bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"
# Kubernetes (Helm)
helm repo add datadog https://helm.datadoghq.com
helm install datadog datadog/datadog --set datadog.apiKey=<API_KEY>
# Docker
docker run -d --name datadog-agent \
  -e DD_API_KEY=<API_KEY> \
  -e DD_SITE="datadoghq.com" \
  datadog/agent:7
```

## Claude's Common Mistakes
1. **High cardinality custom metrics** - Costs explode without budget approval
2. **Missing unified tagging** - env, service, version required on all telemetry
3. **Unbounded log ingestion** - Needs sampling or exclusion filters
4. **No APM sampling strategy** - Costs spiral without head sampling
5. **Alerts without ownership** - Missing runbooks and escalation

## Correct Patterns (2026)
```yaml
# datadog.yaml (Agent config)
api_key: ${DD_API_KEY}
site: datadoghq.com

# Unified tagging (REQUIRED)
env: production
tags:
  - team:platform
  - cost-center:engineering

logs_enabled: true
apm_config:
  enabled: true
  # Head-based sampling to control costs
  max_traces_per_second: 100

# Service definition (service.datadog.yaml)
schema-version: v2.2
dd-service: myservice
team: platform
contacts:
  - type: slack
    contact: '#platform-oncall'
  - type: email
    contact: platform@example.com
tier: tier1
lifecycle: production
application: myapp
description: "Main API service for myapp"

integrations:
  pagerduty:
    service-url: https://myorg.pagerduty.com/services/PXXXXXX

# Monitor definition with required fields
monitors:
  - type: metric alert
    query: "avg(last_5m):avg:myservice.latency{env:production} > 500"
    message: |
      High latency on myservice.
      Runbook: https://wiki.example.com/runbooks/myservice-latency
      @slack-platform-oncall
    tags:
      - service:myservice
      - team:platform
```

## Version Gotchas
- **Agent 7.x**: Current major version, Python 3 only
- **Service Catalog v2.2**: Latest schema for service definitions
- **Custom Metrics**: Monitor cardinality, costs per unique tag combination
- **With APM**: Use head-based sampling to control trace volume

## What NOT to Do
- Do NOT create high cardinality metrics without budget approval
- Do NOT skip unified tagging (env, service, version)
- Do NOT allow unbounded log ingestion - set filters
- Do NOT skip APM sampling configuration
- Do NOT create alerts without runbook_url and ownership
