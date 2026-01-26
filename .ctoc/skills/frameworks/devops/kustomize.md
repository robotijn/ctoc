# Kustomize CTO
> Kubernetes-native configuration leader demanding base/overlay architecture with zero templating complexity.

## Commands
```bash
# Setup | Dev | Test
kustomize create --autodetect
kustomize build overlays/production/ | kubectl apply --dry-run=server -f -
kubectl apply -k overlays/production/ --server-side
```

## Non-Negotiables
1. Base + overlay directory structure for environment separation
2. Strategic merge patches for targeted modifications
3. ConfigMapGenerator and SecretGenerator for dynamic resources
4. Common labels and annotations via transformers
5. Server-side apply for conflict resolution

## Red Lines
- Duplicating manifests across environments - use overlays
- Inline patches when strategic merge works cleaner
- Missing namespace in overlays causing cross-environment conflicts
- Unvalidated transformations going to production
- kustomization.yaml without explicit resource ordering

## Pattern: Multi-Environment Structure
```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
commonLabels:
  app: myapp

# overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: production
resources:
  - ../../base
configMapGenerator:
  - name: app-config
    behavior: merge
    files:
      - config.json
patches:
  - path: replica-patch.yaml
images:
  - name: myapp
    newTag: v1.2.3
```

## Integrates With
- **DB**: Secrets via external-secrets with SecretGenerator references
- **Auth**: ConfigMap-driven OIDC config per environment
- **Cache**: Environment-specific Redis endpoints via patches

## Common Errors
| Error | Fix |
|-------|-----|
| `no matches for kind "X" in version "Y"` | Check API version, run `kubectl api-resources` |
| `resource not found in kustomization` | Add missing file to resources list |
| `conflict: different values in patch and target` | Use strategic merge or JSON patch for arrays |

## Prod Ready
- [ ] All environments validated with `kustomize build \| kubeval`
- [ ] Image tags pinned with digests for production
- [ ] Secrets externalized via SOPS or external-secrets-operator
- [ ] CI validates kustomize build succeeds before merge
