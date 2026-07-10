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

## Instrumentation Footguns
Datadog bills custom metrics by **unique tag combination** (each distinct set of
tag:value pairs is a separate custom metric). High-cardinality tags (user id, request
id, container id, full URL) multiply that count — a single metric tagged with `user_id`
can become millions of billed custom metrics. This is the Datadog equivalent of a
Prometheus cardinality explosion, but it hits your **bill** directly.

```python
# FOOTGUN: user_id + endpoint are unbounded → cost explosion (per-combination billing)
statsd.increment("app.request", tags=[f"user_id:{uid}", f"endpoint:{full_url}"])

# RIGHT: bounded, aggregatable tags; put the high-cardinality dimension in a log/span
statsd.increment("app.request", tags=[f"route:{route_template}", f"status:{code}"])
```

- **Distribution vs gauge/count.** A **gauge** samples the last value in the flush
  interval (you lose intra-interval detail); a **count** sums; a **distribution**
  (`statsd.distribution`) computes globally-accurate percentiles (p50/p95/p99) across all
  hosts server-side. Using a gauge where you need a percentile SLO gives wrong tail
  numbers. Distributions cost more custom metrics per percentile — budget accordingly.
- **APM sampling controls trace cost.** Without a sampling strategy, trace volume (and
  bill) scales with traffic. Head-based sampling decides at the entry span; the Agent's
  `max_traces_per_second` and `DD_APM_MAX_TPS` cap ingestion. Ingestion sampling ≠
  retention/index filters — a span can be ingested then dropped by an index filter.
- **Log pipelines + facet indexing cost.** Ingested logs are cheap; **indexed** logs
  (searchable/faceted) are what you pay for. Use exclusion filters and sampling on
  high-volume, low-value logs (health checks, debug) so you index a representative
  fraction, not everything.

```yaml
# datadog.yaml — cap APM ingestion at the Agent so cost is bounded regardless of traffic
apm_config:
  enabled: true
  max_traces_per_second: 50        # head-based cap; also DD_APM_MAX_TPS env
logs_config:
  # sample noisy sources before they hit indexing pipelines
  processing_rules:
    - type: exclude_at_match
      name: drop_health_checks
      pattern: 'GET /healthz'
```

## Correctness — monitor evaluation window & no-data
- A metric monitor evaluates over an **evaluation window** (`avg(last_5m)`); too short a
  window makes it flap on a single spiky point, too long makes it slow to fire. Match the
  window to the metric's flush/scrape cadence plus jitter.
- **No-data handling is explicit.** Set `notify_no_data: true` and a
  `no_data_timeframe` so a dead exporter alerts instead of the monitor silently sitting
  "OK" with no data. Conversely, for spiky low-traffic metrics, `notify_no_data: false`
  avoids false pages during quiet periods. Choose per monitor.

```yaml
monitors:
  - type: metric alert
    query: "avg(last_5m):avg:myservice.latency{env:production} > 500"
    options:
      notify_no_data: true
      no_data_timeframe: 10        # minutes with no data before alerting
      evaluation_delay: 60         # wait for late-arriving points
```

## Security — API/APP keys and PII (CWE-798)
- **API keys and APP keys must never be committed to code or images** — that is
  **CWE-798 "Use of Hard-coded Credentials"** (cwe.mitre.org/data/definitions/798.html).
  An API key ingests data; an APP key can read/modify your whole org via the API. Inject
  via environment/secret store, and scope APP keys to a service account with least
  privilege.

```yaml
# FOOTGUN: CWE-798 — key baked into the manifest / image
api_key: "abc123def456..."

# RIGHT: reference from the environment / a secrets backend; use the secrets provider
api_key: ENC[datadog_secret_backend_handle]     # or ${DD_API_KEY} from a secret store
```

- **Scrub PII before it leaves the host.** Enable the Agent's log/APM scrubber so
  emails, tokens, card numbers, and query strings are redacted client-side — do not rely
  on deleting them after ingestion.

```yaml
logs_config:
  processing_rules:
    - type: mask_sequences
      name: redact_emails
      pattern: '[\w.+-]+@[\w-]+\.[\w.-]+'
      replace_placeholder: '[REDACTED_EMAIL]'
```

## Testing & Safety (monitors & agent config as code)
Monitors, SLOs, and dashboards are code (Terraform `datadog` provider / API) — review and
dry-run changes so a bad threshold doesn't page the whole org or, worse, silently stop
alerting.

```bash
# Validate agent config before restart (catches YAML/integration errors).
datadog-agent configcheck        # verify loaded integration configs
datadog-agent status             # confirm the agent is reporting after a change

# Manage monitors as code; plan before apply so threshold/no-data changes are reviewed.
terraform plan     # datadog_monitor / datadog_dashboard changes
```
- **Safety:** guard cost — set a **custom-metrics budget alert** and audit tag
  cardinality (Metrics Summary) before shipping a new tag; a single high-cardinality tag
  can 100× the bill. Cap APM with `max_traces_per_second` and log volume with exclusion
  filters (above) so cost is bounded regardless of traffic.
- Use **Synthetic** API/browser tests or CI monitors to assert the telemetry pipeline
  itself works end-to-end (agent → intake → monitor), not just that the app runs.

## Performance & Cost (cardinality budget)
Datadog cost is dominated by three lines, each driven by cardinality/volume:
- **Custom metrics** — billed per **unique tag combination**; one high-cardinality tag
  (`user_id`, `request_id`, `pod_name`) can 100× the count. Audit with the Metrics Summary
  before shipping a tag; drop unbounded tags at the source.
- **APM traces** — bounded by head-based sampling (`max_traces_per_second` / retention
  filters); without a cap, cost scales linearly with traffic.
- **Indexed logs** — you pay for **indexed**, not ingested, logs; use exclusion filters +
  sampling on high-volume/low-value sources (health checks, debug) so you index a
  representative fraction.

The Agent itself is lightweight; the cost lever is what you send it, so shape telemetry
(tag cardinality, sampling, log filters) at emission time — deleting data after ingestion
does not refund it.

## Version-Specific Gotchas (dated, sourced)
- **Datadog Agent 7.81.0** is the current 7.x release (Python 3 only; Agent 5/6 are EOL).
  Use unified service tagging (`env`, `service`, `version`) on all telemetry so metrics,
  traces, and logs correlate.
  [github.com/DataDog/datadog-agent CHANGELOG.rst, retrieved 2026-07-10]
- **Service Catalog schema v2.2** is the current `service.datadog.yaml` format for
  service ownership/metadata.
  [docs.datadoghq.com/service_catalog, retrieved 2026-07-10]
- **Custom metrics are billed per unique tag combination** — audit cardinality with the
  Metrics Summary / cardinality estimator before shipping a new tag.
  [docs.datadoghq.com/metrics/custom_metrics, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Datadog Agent releases (CHANGELOG): https://github.com/DataDog/datadog-agent/blob/main/CHANGELOG.rst
- Custom metrics & cardinality billing: https://docs.datadoghq.com/metrics/custom_metrics/
- Distributions vs gauges: https://docs.datadoghq.com/metrics/distributions/
- APM ingestion & sampling: https://docs.datadoghq.com/tracing/trace_pipeline/ingestion_controls/
- Log processing / exclusion filters: https://docs.datadoghq.com/logs/log_configuration/pipelines/
- Monitor no-data & evaluation: https://docs.datadoghq.com/monitors/configuration/
- Agent secrets management: https://docs.datadoghq.com/agent/configuration/secrets-management/
- Scrubbing sensitive data: https://docs.datadoghq.com/agent/configuration/agent-scrubbing/
- CWE-798 (Use of Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
