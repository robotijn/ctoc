# Helm CTO
> Kubernetes package management leader demanding versioned charts, schema validation, and reproducible deployments.

## Commands
```bash
# Setup | Dev | Test
helm create mychart
helm lint mychart/ && helm template mychart/ | kubectl apply --dry-run=client -f -
helm upgrade --install myrelease mychart/ -n production --atomic --timeout 10m
```

## Non-Negotiables
1. SemVer chart versioning with documented breaking changes
2. values.schema.json for input validation
3. Named templates in _helpers.tpl for DRY configuration
4. Chart testing with helm-unittest before release
5. NOTES.txt with post-install instructions

## Red Lines
- Hardcoded values in templates - use values.yaml or Chart defaults
- Missing NOTES.txt leaving users without guidance
- No default values for required fields
- Untested chart releases to production
- Helm 2 - migrate to v3 (Tiller is a security risk)

## Pattern: Reusable Template Helper
```yaml
# templates/_helpers.tpl
{{- define "mychart.labels" -}}
helm.sh/chart: {{ include "mychart.chart" . }}
app.kubernetes.io/name: {{ include "mychart.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

# values.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["image"],
  "properties": {
    "image": {
      "type": "object",
      "required": ["repository", "tag"],
      "properties": {
        "repository": { "type": "string" },
        "tag": { "type": "string", "minLength": 1 }
      }
    }
  }
}
```

## Integrates With
- **DB**: Bitnami charts for PostgreSQL/MySQL with proper values
- **Auth**: cert-manager charts for TLS, external-secrets for credentials
- **Cache**: Redis/Memcached Helm charts with persistence configuration

## Common Errors
| Error | Fix |
|-------|-----|
| `Error: UPGRADE FAILED: another operation in progress` | Run `helm rollback` or wait for lock release |
| `template: no function "toYaml"` | Check Helm version, use `{{ toYaml .Values.x \| nindent 4 }}` |
| `values don't meet schema` | Validate values against values.schema.json |

## Prod Ready
- [ ] Chart published to OCI registry or ChartMuseum
- [ ] Automated testing in CI with helm-unittest
- [ ] Rollback strategy documented and tested
- [ ] Resource quotas and limits templated with sensible defaults
