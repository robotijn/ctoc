# Helm CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Official script method
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
# Or package managers
brew install helm        # macOS
choco install kubernetes-helm  # Windows
# Note: Helm 4.x under development, 3.21 next minor (May 2026)
```

## Claude's Common Mistakes
1. **Missing values.schema.json** - Required for input validation
2. **Hardcodes values in templates** - Use values.yaml with defaults
3. **Ignores NOTES.txt** - Users need post-install guidance
4. **Uses Helm 2 patterns** - Tiller removed, v3 patterns required
5. **Skips chart testing** - helm-unittest required before release

## Correct Patterns (2026)
```yaml
# templates/_helpers.tpl
{{- define "mychart.labels" -}}
helm.sh/chart: {{ include "mychart.chart" . }}
app.kubernetes.io/name: {{ include "mychart.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

# values.schema.json (REQUIRED)
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
    },
    "replicas": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    }
  }
}
```

## Version Gotchas
- **Helm 3.19+**: Security patches, upgrade recommended
- **Helm 4.x**: Under development on main branch, APIs changing
- **OCI registries**: Preferred over ChartMuseum for new setups
- **With ArgoCD**: Use `helm template` output, not Helm releases

## What NOT to Do
- Do NOT hardcode values in templates - use values.yaml
- Do NOT skip values.schema.json - catches config errors early
- Do NOT omit NOTES.txt - users need guidance
- Do NOT use Helm 2 - Tiller is security risk
- Do NOT release charts without helm-unittest
