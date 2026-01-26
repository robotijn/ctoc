# Prometheus CTO
> Metrics and alerting at scale.

## Non-Negotiables
1. Proper metric naming conventions
2. Label cardinality control
3. Recording rules for dashboards
4. Alert runbooks
5. Federation for scale

## Red Lines
- High cardinality labels (user IDs, etc.)
- Missing unit suffixes (_seconds, _bytes)
- Alerts without runbooks
- No retention planning
- Scraping too frequently

## Pattern
```yaml
groups:
  - name: example
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          runbook_url: https://wiki/runbooks/high-error-rate
```
