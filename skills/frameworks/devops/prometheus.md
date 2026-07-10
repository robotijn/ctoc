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

## Cardinality Footguns
A Prometheus time series is uniquely identified by its metric name **plus every
label/value pair**. Total series = product of label cardinalities. Putting an unbounded
value (user id, request id, email, full URL, container id) in a label is the #1 cause of
a Prometheus OOM — "cardinality explosion". Each series costs RAM (head chunks) and disk.

```promql
# FOOTGUN: user_id and path are unbounded → millions of series, head OOM.
http_requests_total{user_id="42917", path="/orders/8f3a-...", method="GET"}

# RIGHT: keep labels low-cardinality and bounded. Put the high-cardinality dimension
# in the log/trace, not the metric. Aggregate the route to a template.
http_requests_total{route="/orders/:id", method="GET", status="200"}
```

- **`rate()` requires a counter and a range window.** `rate(x[5m])` computes per-second
  average increase over 5m and is only valid on counters. The range MUST cover **at
  least 2 scrape intervals** (rule of thumb: range ≥ 4× scrape_interval) or `rate`
  returns empty/spiky data. `rate` on a gauge is meaningless — use `deriv` or raw value.

```promql
# FOOTGUN: 15s range with a 15s scrape_interval → often <2 samples → empty result.
rate(http_requests_total[15s])

# RIGHT: window comfortably larger than the scrape interval.
rate(http_requests_total[5m])
```

- **Recording rules precompute expensive/nested queries.** A dashboard that runs a
  heavy `sum(rate(...))` across thousands of series on every refresh will hammer the
  server; precompute it once per evaluation interval:

```yaml
groups:
  - name: http.rules
    interval: 30s
    rules:
      - record: job:http_requests:rate5m           # queried cheaply by dashboards
        expr: sum by (job) (rate(http_requests_total[5m]))
```

- **Federation is for aggregation hierarchies, not raw scraping.** `/federate` pulls a
  *selected, aggregated* subset from one Prometheus into another (e.g. per-cluster →
  global). Federating raw high-cardinality series duplicates the cardinality problem in
  the parent. Match on recording-rule names, not `{__name__=~".+"}`.

## Correctness — counter resets & staleness
- **Counter resets** (process restart → counter goes back to 0) are handled *for you* by
  `rate`/`increase`/`irate`, which detect the drop and add the pre-reset value. Do NOT
  compute deltas manually with `x - x offset 5m` on a counter — a restart yields a
  negative bogus value.
- **Staleness:** when a target disappears or a series stops being reported, Prometheus
  marks it stale after a few missed scrapes and it no longer participates in queries
  (returns no data rather than the last value) — an alert `expr` that assumes the series
  is always present can silently stop evaluating. Guard with `absent()` for
  "target down" alerts.

## Security — no auth by default (CWE-306)
Prometheus ships with **no authentication and no TLS on its HTTP endpoints by default**.
Exposing `:9090` (query UI, `/api/v1/*`, and especially the admin API with
`--web.enable-admin-api` which can delete series) publicly is **CWE-306 "Missing
Authentication for Critical Function"** (cwe.mitre.org/data/definitions/306.html).

```yaml
# RIGHT: front Prometheus with auth+TLS. Since 2.24 it has built-in basic-auth/TLS via
# a web config file; put it behind a reverse proxy / mTLS in a private network.
# web-config.yml
tls_server_config:
  cert_file: /etc/prom/tls.crt
  key_file:  /etc/prom/tls.key
basic_auth_users:
  admin: $2y$10$......    # bcrypt hash, never plaintext
```
- Do NOT enable `--web.enable-admin-api` or `--web.enable-lifecycle` on a
  publicly-reachable instance; both let a caller mutate/delete state.

## Testing & Safety (promtool)
`promtool` validates config, lints, and **unit-tests alerting/recording rules** — ship
rule changes through it in CI so a bad `expr` or a broken alert threshold never reaches
prod.

```bash
promtool check config prometheus.yml         # syntax + reference validation
promtool check rules rules/*.yml             # rule-file validation
promtool test rules rules_test.yml           # unit tests: feed series, assert alerts fire
```
```yaml
# rules_test.yml — assert HighErrorRate fires for a synthetic series
tests:
  - interval: 1m
    input_series:
      - series: 'http_requests_total{status="500", job="api"}'
        values: '0+10x10'
    alert_rule_test:
      - eval_time: 5m
        alertname: HighErrorRate
        exp_alerts: [{ exp_labels: { severity: critical, job: api } }]
```
- Validate every rule/config change in CI with `promtool`; a rule that never fires (bad
  `for:` or threshold) is silent until an incident. Keep a `--dry-run` reload check before
  hot-reloading (`--web.enable-lifecycle`) on a private instance only.

## Performance & Cost (memory / retention)
- **RAM tracks active series count**, not scrape rate — the head block holds every active
  series' most recent chunk. Cutting cardinality (above) is the single biggest memory win;
  budget roughly on active-series count, not on targets.
- **Recording rules trade compute for storage:** precompute expensive dashboard queries so
  they don't re-scan thousands of series on every panel refresh.
- **Retention & scale:** `--storage.tsdb.retention.time` bounds disk; for long
  retention/HA, remote-write to a downsampling backend (Thanos/Mimir/Cortex) instead of a
  single huge local TSDB.
- Keep `scrape_interval` sane (10–60s); sub-10s intervals multiply samples, ingestion CPU,
  and disk with little analytical gain for most metrics.

## Version-Specific Gotchas (dated, sourced)
- **Prometheus 3.13.1** is the current stable download, and **3.5.x is the current LTS**
  line. 3.x defaults to the new UI (old UI behind a flag), UTF-8 metric/label names, and
  removed several long-deprecated 2.x flags.
  [prometheus.io/download, retrieved 2026-07-10]
- **Upgrade path to 3.0:** upgrade to **2.55 (the 2.x LTS) first**, then to 3.x — do not
  jump straight from an old 2.x to 3.0. [prometheus.io/docs/prometheus/latest/migration,
  retrieved 2026-07-10]
- **Agent mode** is now the `--agent` command-line mode (the old feature-flag form is
  gone) for remote-write-only forwarding.
  [prometheus.io/docs/prometheus/latest/feature_flags, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Prometheus downloads / releases: https://prometheus.io/download/
- Querying basics (rate/counters): https://prometheus.io/docs/prometheus/latest/querying/functions/
- Recording rules: https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/
- Federation: https://prometheus.io/docs/prometheus/latest/federation/
- Security model & TLS/basic-auth: https://prometheus.io/docs/operating/security/
- Staleness handling: https://prometheus.io/docs/prometheus/latest/querying/basics/#staleness
- CWE-306 (Missing Authentication for Critical Function): https://cwe.mitre.org/data/definitions/306.html
