# Kubernetes CTO
> Container orchestration engineering leader demanding GitOps workflows, resource governance, and zero-trust networking.

## Commands
```bash
# Setup | Dev | Test
kubectl apply -k overlays/dev/
kubectl rollout status deployment/myapp -n production --timeout=300s
kubectl run test-pod --rm -it --image=busybox -- wget -qO- http://myapp:8080/health
```

## Non-Negotiables
1. Declarative GitOps with ArgoCD or Flux - no kubectl apply from laptops
2. Resource limits and requests on every container
3. Liveness, readiness, and startup probes for all workloads
4. Network policies enforcing least-privilege pod communication
5. RBAC with namespace-scoped service accounts

## Red Lines
- kubectl apply from local machine in production
- Running containers as root without explicit security context
- latest tag in production - use immutable image digests
- Secrets in plain ConfigMaps - use Sealed Secrets or External Secrets
- Missing PodDisruptionBudgets for critical workloads

## Pattern: Production-Ready Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
      - name: myapp
        image: myapp@sha256:abc123...
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"
          requests:
            memory: "256Mi"
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
```

## Integrates With
- **DB**: External operators (CloudNativePG, Vitess) or managed services
- **Auth**: OIDC via Dex, service mesh mTLS for inter-pod auth
- **Cache**: Redis Operator or managed ElastiCache with NetworkPolicy

## Common Errors
| Error | Fix |
|-------|-----|
| `CrashLoopBackOff` | Check logs, verify probes aren't failing, check resource limits |
| `ImagePullBackOff` | Verify image exists, check imagePullSecrets for private registries |
| `OOMKilled` | Increase memory limits or fix application memory leak |

## Prod Ready
- [ ] Horizontal Pod Autoscaler configured with custom metrics
- [ ] Pod Security Standards enforced (restricted profile)
- [ ] Observability stack deployed (Prometheus, Grafana, tracing)
- [ ] Disaster recovery tested with etcd snapshots and cluster restore
