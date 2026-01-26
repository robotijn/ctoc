# Kubernetes CTO
> Container orchestration at scale.

## Non-Negotiables
1. Declarative configs (GitOps)
2. Resource limits on all pods
3. Liveness and readiness probes
4. Network policies for isolation
5. RBAC with least privilege

## Red Lines
- kubectl apply from local machine in prod
- Running as root without necessity
- Latest tag in production
- Secrets in plain ConfigMaps
- Missing pod disruption budgets

## Pattern
```yaml
resources:
  limits:
    memory: "512Mi"
    cpu: "500m"
  requests:
    memory: "256Mi"
    cpu: "250m"
```
