# Kubernetes CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# kubectl (latest stable)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
# kubeadm (for cluster setup)
sudo apt-get install -y kubeadm kubelet kubectl
# Note: K8s 1.32 EOL Feb 2026, 1.33 EOL June 2026
```

## Claude's Common Mistakes
1. **Uses deprecated APIs** - `flowcontrol.apiserver.k8s.io/v1beta3` removed in 1.32
2. **Ignores kubeadm cri-tools change** - 1.32+ doesn't auto-install crictl
3. **Suggests old etcd endpoints** - 1.31+ requires etcd 3.5.11+ for `/livez`/`/readyz`
4. **Missing PodDisruptionBudgets** - Required for safe rollouts
5. **Uses `latest` image tag** - Must use digests for production

## Correct Patterns (2026)
```yaml
# Production-ready Deployment (K8s 1.32+)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
      - name: myapp
        image: myapp@sha256:abc123...  # DIGEST, not tag
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
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop: ["ALL"]
```

## Version Gotchas
- **1.32**: `flowcontrol.apiserver.k8s.io/v1beta3` removed, use v1
- **1.32**: AuthorizeNodeWithSelectors beta, breaks some RBAC
- **1.32**: Anonymous auth restricted to health endpoints only
- **AWS EKS 1.32**: Last version with AL2 AMIs, use AL2023 going forward

## What NOT to Do
- Do NOT use `kubectl apply` from laptops in production - use GitOps
- Do NOT run as root without explicit security justification
- Do NOT use `latest` tag - pin to digests
- Do NOT skip PodDisruptionBudgets for critical workloads
- Do NOT ignore deprecated API warnings - they become errors
