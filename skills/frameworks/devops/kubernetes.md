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

## API & Resource Footguns
The correctness bugs Claude generates most for Kubernetes cluster the same way:
missing resource governance, wrong probe semantics, and pinning removed APIs.

- **Requests vs limits — the OOMKilled trap.** `requests` is what the scheduler
  reserves; `limits` is the hard ceiling the kernel enforces. If a container
  crosses its **memory** `limit` the kernel cgroup OOM-kills it (`reason:
  OOMKilled`, exit 137) — there is no graceful degradation for memory. If you set
  a memory `limit` but **omit** the equal `request`, or set them far apart, the
  pod is Burstable and gets evicted first under node pressure. CPU is different:
  exceeding the CPU `limit` **throttles** (never kills). Set `requests` from
  observed p95 usage; set memory `limit == request` for critical pods (Guaranteed
  QoS), and generally do NOT set a CPU `limit` at all — a CPU limit only adds
  throttling latency without protecting neighbours the way memory limits do.

```yaml
resources:
  requests: { memory: "256Mi", cpu: "250m" }   # scheduler reservation
  limits:   { memory: "256Mi" }                 # == request → Guaranteed QoS,
                                                #    no CPU limit (avoid throttling)
```

- **Liveness vs readiness — NOT interchangeable.** `readinessProbe` failing pulls
  the pod out of the Service endpoints (no traffic) but **leaves it running**.
  `livenessProbe` failing **restarts the container**. The classic outage: putting
  a slow dependency check (DB reachable?) in the *liveness* probe — a transient DB
  blip then restart-loops every replica simultaneously and takes the whole service
  down. Dependency checks belong in `readinessProbe`; liveness must only test "is
  THIS process wedged?". Add a `startupProbe` for slow-booting apps so the
  liveness probe does not fire during a legitimately long startup.
- **Removed/deprecated APIs are hard failures, not warnings.** Removed API
  versions return `404` on apply after the removal release — pin the current
  `apiVersion` and run `kubectl-convert` / `kubent` before an upgrade. Deprecation
  warnings are a countdown to breakage (see Version-Specific Gotchas).
- **`latest` tag** is non-deterministic across nodes and defeats rollback — pin an
  immutable `image@sha256:...` digest. **PodDisruptionBudgets** are required or a
  node drain can evict every replica at once.
- Source: kubernetes.io resource-management & probe docs. See References.

## Security Gotchas (RBAC, Pod Security, Secrets)
- **RBAC least-privilege — CWE-284 (Improper Access Control).** A `Role`/
  `ClusterRole` with `verbs: ["*"]` on `resources: ["*"]`, or binding a workload
  ServiceAccount to `cluster-admin`, is broad access control that a compromised
  pod inherits — CWE-284 (Improper Access Control, cwe.mitre.org/data/definitions/284.html).
  Grant only the exact verbs/resources needed, prefer namespaced `Role` over
  `ClusterRole`, and never mount the default ServiceAccount token
  (`automountServiceAccountToken: false`) into a pod that does not call the API.

```yaml
# LEAST-PRIVILEGE Role — only what the app needs (CWE-284)
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata: { name: reader, namespace: app }
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]   # NOT ["*"], NOT resources ["*"]
```

- **Secrets are base64, NOT encrypted — CWE-312 (Cleartext Storage of Sensitive
  Information).** A `kind: Secret` is only **base64-encoded** in etcd, trivially
  reversible (`base64 -d`) — CWE-312 (cwe.mitre.org/data/definitions/312.html). Enable
  **encryption-at-rest** (`EncryptionConfiguration` with a KMS provider) on the
  API server, restrict `get secret` via RBAC, and prefer an external store
  (External Secrets Operator / Vault / cloud secret manager) over committing
  Secret manifests to git.
- **`securityContext` hardening.** Default to `runAsNonRoot: true`,
  `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, and
  `capabilities.drop: ["ALL"]`. Never `privileged: true` or `hostNetwork/hostPID/
  hostPATH` without an explicit, reviewed reason — a privileged container is
  effectively root on the node.
- **Pod Security Admission (built-in since 1.25).** Label namespaces
  `pod-security.kubernetes.io/enforce: restricted` to reject non-conformant pods
  at admission. The legacy PodSecurityPolicy was removed in 1.25 — do not reference it.
- **NetworkPolicy is default-allow until you say otherwise.** With no policy, every
  pod can reach every other pod. Apply a default-deny ingress/egress policy per
  namespace, then allow-list.

```yaml
# default-deny ingress for a namespace (requires a CNI that enforces NetworkPolicy)
kind: NetworkPolicy
apiVersion: networking.k8s.io/v1
metadata: { name: default-deny-ingress, namespace: app }
spec:
  podSelector: {}
  policyTypes: ["Ingress"]
```

- Source: cwe.mitre.org/284, cwe.mitre.org/312, kubernetes.io security docs. See References.

## Error Handling & Debugging Idioms
- **`CrashLoopBackOff`** — the container starts then exits non-zero repeatedly;
  `kubectl logs <pod> --previous` shows the crashed instance's output (current logs
  are the *new* attempt). `kubectl describe pod` → `Last State: Terminated,
  Reason: OOMKilled` means raise the memory limit, not restart harder.
- **`ImagePullBackOff` / `ErrImagePull`** — bad tag/digest, private registry
  without an `imagePullSecret`, or rate-limited registry. `kubectl describe pod`
  shows the exact pull error.
- **`0/N nodes are available`** — unschedulable: requests exceed allocatable, taint
  without a matching toleration, or nodeSelector/affinity with no match. Read the
  `Events` in `kubectl describe pod`, not just the pod status.
- **Async apply reality** — `kubectl apply` returns before the object is
  reconciled. Gate rollouts on `kubectl rollout status deployment/<name>
  --timeout=120s` (non-zero exit on failure) rather than assuming apply == ready.

## Testing & Validation Conventions
Kubernetes manifests are testable *before* they touch a cluster — do it in CI.

```bash
# 1. Schema + policy validation (offline, fast) — kubeconform against the K8s schema
kubeconform -strict -summary manifests/

# 2. Policy-as-code — reject non-conformant manifests in CI (e.g. no runAsNonRoot)
conftest test manifests/ --policy policy/          # OPA/Rego
# or: kyverno apply policy/ --resource manifests/   # Kyverno CLI

# 3. Server-side dry-run — validates against the live API (CRDs, admission, quotas)
kubectl apply --dry-run=server -f manifests/
```
- **Do NOT rely on `--dry-run=client`** — it only checks local syntax and misses
  admission webhooks, CRD schemas, and quota. Use `--dry-run=server`.
- **Gate deploys on rollout status**, not on apply returning:
  `kubectl rollout status deployment/myapp --timeout=120s` exits non-zero if the
  new pods never become Ready — the correct CI failure signal for a bad deploy.
- **Policy engines** (Kyverno / OPA Gatekeeper) enforce the security rules above at
  admission in-cluster; the same policies run in CI so a bad manifest never merges.

## Reliability & Performance Traps
- **Rolling update `maxUnavailable: 0` + `maxSurge: 1`** keeps full capacity during
  a deploy; the default `25%` can drop a quarter of capacity under load.
- **Readiness gate before traffic** — without a `readinessProbe`, the Service sends
  traffic the instant the container process starts, before the app can serve → 502s
  during every deploy.
- **`terminationGracePeriodSeconds` + `preStop`** — on pod delete, Kubernetes sends
  SIGTERM and removes the endpoint concurrently; a `preStop: sleep 5` + graceful
  SIGTERM handling drains in-flight requests instead of dropping them.
- **HPA needs metrics-server** and requires resource `requests` to compute
  utilization — an HPA on a pod with no CPU `request` never scales.

## Version-Specific Gotchas (dated, sourced)
- **Kubernetes 1.36** is the current stable minor (released **2026-04-22**, latest
  patch **1.36.2** on 2026-06-11), supported until ~2027-04 / EOL **2027-06-28**.
  Support is N-3: 1.35 (EOL 2027-02-28) and 1.34 (EOL 2026-10-27) are still
  supported; **1.33 went EOL 2026-06-28** and **1.32 went EOL 2026-02-28** — running
  either now means no security patches. [endoflife.date/kubernetes + kubernetes.io
  releases, retrieved 2026-07-10]
- **API removals bite on upgrade.** `flowcontrol.apiserver.k8s.io/v1beta3` was
  removed in 1.32 (use `v1`); PodSecurityPolicy was removed back in 1.25 (use Pod
  Security Admission). Removed APIs 404 on apply — run `kubent`/`kubectl-convert`
  before every minor upgrade. [kubernetes.io deprecation-guide, retrieved 2026-07-10]
- **CVE-2025-1974 ("IngressNightmare"), CVSS 9.8 CRITICAL** — an unauthenticated
  attacker with pod-network access could achieve arbitrary code execution in the
  ingress-nginx controller and read all cluster Secrets. Patched in ingress-nginx
  1.11.5 / 1.12.1; upgrade ingress-nginx and restrict access to the admission
  webhook. [nvd.nist.gov/vuln/detail/CVE-2025-1974, published 2025-03-25, retrieved
  2026-07-10]

## References (retrieved 2026-07-10)
- Kubernetes releases & support policy: https://kubernetes.io/releases/
- Kubernetes EOL schedule: https://endoflife.date/kubernetes
- Managing resources (requests/limits, QoS): https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
- Liveness/readiness/startup probes: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
- Pod Security Standards & Admission: https://kubernetes.io/docs/concepts/security/pod-security-standards/
- RBAC: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- Encrypting Secret data at rest: https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/
- Deprecated API migration guide: https://kubernetes.io/docs/reference/using-api/deprecation-guide/
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
- CVE-2025-1974 (IngressNightmare): https://nvd.nist.gov/vuln/detail/CVE-2025-1974
