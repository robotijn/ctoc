# Helm CTO
> Kubernetes package management.

## Non-Negotiables
1. Chart versioning (SemVer)
2. Values schema validation
3. Proper template helpers
4. Chart testing before release
5. Document all values

## Red Lines
- Hardcoded values in templates
- Missing NOTES.txt
- No default values
- Untested chart releases
- Helm 2 (migrate to v3)

## Pattern
```yaml
# values.yaml with sensible defaults
replicaCount: 1
image:
  repository: myapp
  tag: ""  # Required, no default
```
