# Prometheus CTO
> Metrics and alerting leader demanding proper naming conventions, cardinality control, and actionable alerts.

## Commands
```bash
# Setup | Dev | Test
prometheus --config.file=prometheus.yml --web.enable-lifecycle
promtool check config prometheus.yml && promtool check rules rules/*.yml
curl -X POST http://localhost:9090/-/reload
```

## Non-Negotiables
1. Metric naming conventions: `namespace_subsystem_name_unit`
2. Label cardinality control - no unbounded label values
3. Recording rules for dashboard queries and alert dependencies
4. Alert runbooks linked in annotations
5. Federation or remote write for multi-cluster scaling

## Red Lines
- High cardinality labels (user IDs, request IDs, timestamps)
- Missing unit suffixes (_seconds, _bytes, _total)
- Alerts without runbook_url annotation
- No retention planning causing disk exhaustion
- Scrape intervals under 10s without justification

## Pattern: Recording Rules and Alerts
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "rules/*.yml"

# rules/http.yml
groups:
  - name: http_requests
    interval: 30s
    rules:
      # Recording rule for dashboard
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))

      # Alert with runbook
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
          /
          sum(rate(http_requests_total[5m])) by (job)
          > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.job }}"
          runbook_url: "https://wiki.example.com/runbooks/high-error-rate"
          value: "{{ $value | humanizePercentage }}"
```

## Integrates With
- **DB**: PostgreSQL exporter, MySQL exporter with connection pooling
- **Auth**: OAuth2 proxy for Prometheus UI access
- **Cache**: Redis exporter with cardinality-safe labels

## Common Errors
| Error | Fix |
|-------|-----|
| `out of order sample` | Ensure only one scraper per target, check timestamps |
| `query processing took too long` | Add recording rules for complex queries |
| `TSDB compaction failed` | Check disk space, verify retention settings |

## Prod Ready
- [ ] Retention configured based on storage capacity
- [ ] Recording rules for all dashboard panels
- [ ] Alertmanager configured with proper routing and silences
- [ ] Thanos or Cortex for long-term storage and HA
