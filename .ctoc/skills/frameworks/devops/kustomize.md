# Kustomize CTO
> Kubernetes native configuration management.

## Non-Negotiables
1. Base + overlay structure
2. Strategic merge patches
3. ConfigMap/Secret generators
4. Common labels and annotations
5. Resource validation

## Red Lines
- Duplicating manifests across environments
- Inline patches over strategic merge
- Missing namespace in overlays
- Unvalidated transformations

## Pattern
```yaml
# kustomization.yaml
resources:
  - deployment.yaml
  - service.yaml
configMapGenerator:
  - name: app-config
    files:
      - config.json
```
