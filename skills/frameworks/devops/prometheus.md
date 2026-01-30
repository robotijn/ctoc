# Prometheus CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Download Prometheus 3.x (latest)
wget https://github.com/prometheus/prometheus/releases/download/v3.9.1/prometheus-3.9.1.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
# Or Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack
```

## Claude's Common Mistakes
1. **Uses old UI patterns** - Prometheus 3.0 has new UI, old available via flag
2. **High cardinality labels** - User IDs, request IDs blow up storage
3. **Missing unit suffixes** - Metrics need _seconds, _bytes, _total
4. **Alerts without runbooks** - runbook_url annotation required
5. **Uses Prometheus 2.x config** - Some flags removed in 3.0

## Correct Patterns (2026)
```yaml
# prometheus.yml (v3.x)
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "rules/*.yml"

scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true

# rules/http.yml
groups:
  - name: http_requests
    interval: 30s
    rules:
      # Recording rule for dashboards
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))

      # Alert with runbook (REQUIRED)
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
```

## Version Gotchas
- **Prometheus 3.0**: New UI, UTF-8 default, removed deprecated flags
- **Prometheus 3.0**: Upgrade to 2.55 first, then to 3.0
- **Prometheus 3.5+**: LTS releases available
- **Agent mode**: `--agent` flag replaces feature flag

## What NOT to Do
- Do NOT use high cardinality labels - blows up storage
- Do NOT skip unit suffixes on metrics (_seconds, _bytes, _total)
- Do NOT create alerts without runbook_url annotation
- Do NOT upgrade directly to 3.0 - go through 2.55 first
- Do NOT use scrape intervals under 10s without justification
