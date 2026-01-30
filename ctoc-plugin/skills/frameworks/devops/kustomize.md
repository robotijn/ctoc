# Kustomize CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Standalone install
curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
# Or via kubectl (built-in)
kubectl apply -k overlays/production/
# Note: kubectl kustomize may lag standalone version
```

## Claude's Common Mistakes
1. **Duplicates manifests across environments** - Use base/overlay pattern
2. **Inline patches when strategic merge works** - Adds complexity
3. **Missing namespace in overlays** - Cross-environment conflicts
4. **Forgets configMapGenerator hash suffixes** - Breaks rollout triggers
5. **Uses kubectl kustomize for latest features** - Standalone more current

## Correct Patterns (2026)
```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
commonLabels:
  app.kubernetes.io/name: myapp

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
secretGenerator:
  - name: app-secrets
    envs:
      - secrets.env
    options:
      disableNameSuffixHash: false  # Keep hash for rollouts
patches:
  - path: replica-patch.yaml
images:
  - name: myapp
    newName: registry.example.com/myapp
    newTag: v1.2.3  # Or use digest for prod
```

## Version Gotchas
- **Kustomize 5.x**: Some transformer behaviors changed
- **kubectl built-in**: May be 1-2 versions behind standalone
- **With ArgoCD**: Kustomize version in ArgoCD may differ
- **With Flux**: Use kustomize-controller, respects kustomization.yaml

## What NOT to Do
- Do NOT duplicate manifests - use base/overlay structure
- Do NOT hardcode namespaces in base - set in overlay
- Do NOT disable configMap hash suffix - breaks rollout detection
- Do NOT use inline patches for simple changes - strategic merge cleaner
- Do NOT skip `kustomize build | kubectl apply --dry-run=server`
