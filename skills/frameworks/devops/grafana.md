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

## Dashboard Footguns
- **Template variables scope the whole dashboard — and their interpolation format
  matters.** A `$var` inside a PromQL/SQL query is a *string substitution*, not a bound
  parameter. A multi-value variable expands to a regex-alternation, so the wrong panel
  operator breaks the query:

```text
# FOOTGUN: multi-value template variable used with = instead of =~ → no match
sum(rate(http_requests_total{job="$job"}[5m]))     # $job expands to (a|b|c) → breaks =

# RIGHT: use =~ for multi-value template variables, and the :regex format when needed
sum(rate(http_requests_total{job=~"$job"}[5m]))    # matches (a|b|c)
# or force a format:  ${job:regex}   ${job:pipe}   ${job:csv}
```

- **Panel time range vs query range.** A panel inherits the dashboard time range unless
  you override it; a `rate()` window baked into the query is *independent* of the picker.
  Using `[5m]` on a dashboard showing a 90-day range yields jagged, under-sampled lines —
  use `$__rate_interval` so Grafana sizes the window to the current resolution.
- **Unified alerting no-data / error handling.** Grafana's unified alerting (default
  since Grafana 9, legacy alerting removed in 11) fires on rule evaluation. You MUST set
  the **No Data** and **Error** state explicitly (Alerting / OK / NoData) — the default
  "No Data → Alerting" turns a scrape gap into a page storm, while "No Data → OK" hides a
  dead exporter. Choose per rule.
- **Datasource proxy vs browser mode.** A datasource in **Server (proxy)** mode routes
  queries through the Grafana backend (credentials stay server-side). **Browser** mode
  makes the user's browser call the datasource directly — leaking credentials/CORS and
  breaking on private networks. Default to proxy.
- **Transformations run in the browser, after the query.** Heavy joins/merges on large
  result sets freeze the tab; reduce cardinality in the query, not in a transformation.

## Provisioning — dashboards as code
Manual edits in the production UI are lost on the next provisioning sync and are not in
version control. Provision datasources and dashboards from files (GitOps) or Terraform.

```yaml
# /etc/grafana/provisioning/dashboards/app.yaml
apiVersion: 1
providers:
  - name: 'app-dashboards'
    type: file
    disableDeletion: true
    allowUiUpdates: false          # UI edits are read-only → forces changes through git
    options:
      path: /var/lib/grafana/dashboards
```
- Set `allowUiUpdates: false` so operators cannot silently drift a provisioned
  dashboard. Provisioned datasources should reference secrets via env/`secureJsonData`,
  never inline plaintext.

## Security — datasource secrets, CVEs, API keys (CWE-798)
- **Never hard-code API keys / service-account tokens** in provisioning files, dashboard
  JSON, or client code — that is **CWE-798 "Use of Hard-coded Credentials"**
  (cwe.mitre.org/data/definitions/798.html). Store datasource credentials in
  `secureJsonData` (encrypted at rest) and inject via environment variables.

```yaml
# RIGHT: datasource secret injected, encrypted at rest, proxied (not browser-exposed)
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy                  # server-side; credentials never reach the browser
    url: https://prom.internal:9090
    secureJsonData:
      httpHeaderValue1: ${PROM_TOKEN}     # from env, not committed
```

- **Real advisory history — patch promptly:**
  - **CVE-2021-43798** — a plugin **path-traversal (CWE-22)** in Grafana 8.0.0-beta1
    through 8.3.0 let an unauthenticated attacker read arbitrary local files (e.g.
    `/etc/passwd`, `grafana.ini` secrets) via the datasource plugin URL. The famous
    "Grafana LFI". [nvd.nist.gov/vuln/detail/CVE-2021-43798, retrieved 2026-07-10]
  - **CVE-2025-4123** — a **stored/reflected XSS (CWE-79) via client path traversal +
    open redirect (CWE-601)** allowing arbitrary JavaScript execution in a victim's
    session. [nvd.nist.gov/vuln/detail/CVE-2025-4123, retrieved 2026-07-10]
  Watch for `+security` suffixed releases and upgrade immediately; do not run an
  anonymous-access-enabled instance on the public internet.

## Testing & Safety (dashboard + alert validation)
Provisioned dashboards and alert rules are code — validate them in CI before they reach a
running Grafana, and preview alert rules before enabling.

```bash
# Lint dashboard JSON structure/schema before provisioning (community linter).
dashboard-linter lint dashboards/service-overview.json

# Validate alert-rule / provisioning YAML with the Grafana API in a throwaway instance,
# or `grafanactl` / terraform plan for the grafana provider (dry run).
terraform plan     # grafana_dashboard / grafana_rule_group changes, reviewed pre-apply
```
- Use the alert rule **Preview** ("Preview alerts") before enabling to confirm it
  evaluates to the state you expect on real data — catches a rule that would fire
  immediately or never.
- **Safety:** set `allowUiUpdates: false` (provisioning) so operators cannot silently
  drift a version-controlled dashboard; changes must go through git + review.
- Pin the datasource `uid` in provisioned dashboards so a re-provision doesn't orphan
  panels ("Datasource not found") when the datasource is recreated.

## Performance & Cost (query load)
- **Every panel is a query on every refresh.** A dashboard with 40 panels at a 5s refresh
  runs 40 queries every 5 seconds — that load hits your datasource (Prometheus/Loki), not
  Grafana. Default refresh to 30s+ unless a panel is genuinely real-time.
- **Use `$__rate_interval`** (not a hard-coded `[5m]`) so the query window scales with the
  panel's resolution/time range — avoids over-fetching on wide ranges.
- **Table/logs panels with huge result sets** are the classic tab-freeze; cap with `limit`
  and reduce cardinality in the query, not in a browser-side transformation.
- Shared/expensive queries → precompute upstream (Prometheus recording rules) rather than
  recomputing per dashboard load.

## Version-Specific Gotchas (dated, sourced)
- **Grafana 13.x** is the current major line (release `v13.1.0`); unified alerting is the
  only alerting engine (legacy alerting was removed in Grafana 11), and the Graph panel
  was removed in favor of Time series (deprecated back in Grafana 10).
  [github.com/grafana/grafana/releases, retrieved 2026-07-10]
- **`+security` releases** ship out-of-band for CVEs — always take them; they are
  version-pinned patches, not feature releases.
  [grafana.com/security/security-advisories, retrieved 2026-07-10]
- Manage dashboards/datasources as code with the `grafana` Terraform provider or file
  provisioning for reproducible, reviewable GitOps.
  [registry.terraform.io/providers/grafana/grafana, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Grafana releases: https://github.com/grafana/grafana/releases
- Template variables: https://grafana.com/docs/grafana/latest/dashboards/variables/
- Unified alerting (no-data/error states): https://grafana.com/docs/grafana/latest/alerting/
- Provisioning (datasources & dashboards): https://grafana.com/docs/grafana/latest/administration/provisioning/
- Security advisories: https://grafana.com/security/security-advisories/
- CVE-2021-43798 (plugin path traversal): https://nvd.nist.gov/vuln/detail/CVE-2021-43798
- CVE-2025-4123 (XSS via path traversal + open redirect): https://nvd.nist.gov/vuln/detail/CVE-2025-4123
- CWE-798 (Use of Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
