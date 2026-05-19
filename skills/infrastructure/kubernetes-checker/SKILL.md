---
name: kubernetes-checker
description: Validates Kubernetes manifests for security, resource hygiene, and 2026 GitOps best practices.
type: skill
when_to_load:
  - "kubernetes audit"
  - "k8s manifest check"
  - "kubernetes check"
  - "helm chart review"
  - "kubernetes security"
  - "kubernetes validate"
related_skills:
  - infrastructure/docker-security-checker
  - infrastructure/terraform-validator
  - specialized/health-check-validator
  - security/secrets-detector
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Kubernetes Checker (skill)

> Converted from agents/infrastructure/kubernetes-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid cluster operator validating Kubernetes manifests, Helm charts, and Kustomize overlays for security, resource hygiene, supply-chain integrity, and 2026 GitOps best practices. Every manifest is potentially production-bound; every missing field is a latent incident. You catch issues at `git diff` time, not at `kubectl apply` time.

## 2026 Best Practices (Infrastructure category)

The 2026 Kubernetes hardening baseline is defense-in-depth across eight domains: Pod Security Standards (`restricted`), Network Policies (default-deny), RBAC (least-privilege per workload), Secrets (externalized via ESO/Vault), Image Security (cosign-signed, digest-pinned), Runtime Security (Falco/eBPF observability), Cluster Hardening (CIS Benchmarks), and Supply Chain (SBOM + SLSA provenance). The pre-deploy linter — this skill — owns the first four exhaustively and emits findings the others rely on.

- **Pod Security Standards `restricted` is the baseline**, not `baseline`. PSA admission has been stable since Kubernetes 1.25 and is on by default in most managed offerings (EKS / GKE / AKS) in 2026. PodSecurityPolicy is fully gone — flag any manifest referencing the deprecated API. Restricted profile mandates: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, all Linux capabilities dropped, seccomp `RuntimeDefault`, no `hostPath` / `hostNetwork` / `hostPID` / `hostIPC`.
- **NetworkPolicy default-deny is mandatory per namespace**. A namespace without an ingress + egress default-deny is treated as a `severity: critical` finding. Default-deny breaks DNS by design — every namespace MUST also ship an explicit egress allow rule to `kube-system` UDP/TCP 53. Use label selectors, never IP CIDRs except for cloud metadata blocks (`169.254.169.254/32` egress denied).
- **Resource requests AND limits are mandatory**. Missing requests = scheduler can't plan; missing limits = noisy-neighbor and OOM cascades. Flag any container without both for CPU and memory. ResourceQuota at the namespace level is the backstop.
- **Probes: `liveness` + `readiness` + `startup` for every workload**. Cross-link [[health-check-validator]] for probe semantics — startupProbe is mandatory for any image that takes > 10s to warm up (otherwise liveness will kill it before it serves). Probes without `failureThreshold` or with `initialDelaySeconds: 0` are flagged.
- **Secrets via External Secrets Operator (ESO) or Vault Agent Injector**. Raw `kind: Secret` resources committed to Git are a `severity: critical` finding regardless of whether they look real — the next developer assumes the pattern is OK. ESO syncs from AWS Secrets Manager / GCP Secret Manager / Azure Key Vault / Vault / Akeyless / Pulumi ESC and supports auto-rotation. If a `Secret` must exist, it MUST be SOPS-encrypted or sealed-secrets-encrypted.
- **Image digest pinning over tag, including `:latest`**. The 2025–2026 supply-chain attack wave (Docker Hub tag-overwrite incidents, PyPI package-takeover compromises documented by Datadog Security Labs and others) demonstrated that tags are mutable trust-on-first-use anchors. Use `image: registry/app@sha256:abc...` not `image: registry/app:1.2.3`. Tag-only references are flagged `high`; `:latest` is `critical`. The upstream image-build hygiene lives in [[docker-security-checker]] — this skill validates the manifest consumes a digest.
- **`imagePullPolicy: Always` is required when tags are used**, but a digest-pinned image makes the policy moot (digest is immutable). Flag `IfNotPresent` + tag combinations.
- **Image signature verification at admission** via cosign / sigstore — enforced through Kyverno `verifyImages` or Connaisseur. SBOM (CycloneDX or SPDX) attached as OCI artifact; SLSA provenance level 3+ for production workloads.
- **Shift-left scanning in PR**: kube-linter, kube-score, kubeconform/kubeval, kubesec, Trivy config, Polaris, Datree. None of these alone is enough — they catch different families; chain at least three.
- **Policy-as-code at admission**: Kyverno (Kubernetes-native YAML policies, CNCF graduated 2025) or OPA Gatekeeper (Rego, CNCF graduated, more flexible/heavier). Kyverno is the recommended default in 2026 for YAML-first teams; Gatekeeper when external-data lookups (e.g., cross-cluster, IAM) are needed.
- **GitOps reconciliation (Argo CD / Flux) is the deployment plane**. Live drift from Git is a finding. `kubectl edit` in production is a finding. The cluster IS the manifest in Git.
- **Encryption at rest with KMS v2** for etcd Secrets — flag clusters without `EncryptionConfiguration` referencing a KMS provider.
- **Dedicated ServiceAccount per workload**. The `default` SA is never bound to anything; `automountServiceAccountToken: false` unless explicitly needed.

## Categories (findings the skill emits)

| # | Category | Manifest signal | Default severity |
|---|---|---|---|
| 1 | Privileged container | `securityContext.privileged: true` | critical |
| 2 | Runs as root | `runAsUser: 0` or missing `runAsNonRoot: true` | critical |
| 3 | Missing NetworkPolicy | Namespace without ingress+egress default-deny | critical |
| 4 | Missing resource requests/limits | Container without both `requests` and `limits` for cpu+memory | critical |
| 5 | Missing probes | No liveness/readiness/startup on long-running workload | critical |
| 6 | Plain Secret in Git | `kind: Secret` not from ESO/SOPS/sealed-secrets | critical |
| 7 | Image tag instead of digest | `image: x:tag` without `@sha256:...` | critical (`:latest`) / high (other tag) |
| 8 | `hostPath` / `hostNetwork` / `hostPID` / `hostIPC` | Any host-namespace usage outside system DaemonSet | critical |
| 9 | Default ServiceAccount + no PodSecurity context | Workload binds to `default` SA, no securityContext | critical |
| 10 | Capabilities not dropped | Missing `capabilities.drop: ["ALL"]` | critical |
| 11 | Writable root FS | Missing `readOnlyRootFilesystem: true` | critical |
| 12 | `allowPrivilegeEscalation` not false | Missing or true | critical |
| 13 | seccomp not set | Missing `seccompProfile.type: RuntimeDefault` | critical |
| 14 | PodSecurityPolicy reference | Removed API still referenced in legacy Helm charts | critical |
| 15 | `automountServiceAccountToken: true` without need | Default token mounted | high |
| 16 | RBAC wildcard | `verbs: ["*"]` or `resources: ["*"]` outside cluster-admin | critical |
| 17 | Missing image signature verification | Kyverno `verifyImages` / Connaisseur policy absent | high |
| 18 | Missing namespace PSA label | Namespace without `pod-security.kubernetes.io/enforce: restricted` | critical |
| 19 | Egress to cloud metadata not blocked | NetworkPolicy permits `169.254.169.254/32` | critical |
| 20 | DNS not allowed under default-deny | Egress default-deny without kube-system :53 allow | critical |

## Tool Integration (2026)

No single tool catches the full table above; chain at least three. All emit either SARIF or JSON; aggregate into the unified report.

| Tool | Strengths | Trade-offs | When |
|------|-----------|-----------|------|
| **kube-linter** | StackRox-built, 30+ checks tuned to common misconfigs, fast, runs on raw YAML or Helm charts, CI-friendly | Static-only; doesn't see live cluster | Every PR / pre-commit |
| **kube-score** | Scoring-oriented, opinionated defaults (probes, requests/limits, image pinning), easy to consume diff in PR | Fewer checks than kube-linter; some overlap | Every PR alongside kube-linter |
| **kubeconform** | Successor to kubeval, fast, supports CRDs via JSON schema, fully offline | Schema-validity only — no policy/security checks | Every PR (schema gate) |
| **kubeval** | Legacy schema validator; kept for compatibility | Maintenance has shifted to kubeconform | Legacy CI; prefer kubeconform |
| **kubesec** | Risk-scored security analysis per resource, highlights pod-security violations | Older; some checks now better covered by kube-linter + PSA | Spot-checks; security review |
| **Polaris** | Best-practices auditor + dashboard, cluster grading view | Less mutation-friendly than Kyverno | Cluster-wide audit, exec dashboard |
| **Datree** | Centralized policy engine, custom rules in YAML, Helm-aware | Maintenance status has shifted in 2024–2026 (project ownership changed); verify the current release cadence before pinning in CI | Custom org policies (where actively maintained) |
| **Trivy config** | Aqua-built, also scans IaC + images, SARIF-native | Findings overlap with kube-linter | One tool, two surfaces (config + image) |
| **Kyverno** | Kubernetes-native YAML policies, mutate + validate + generate + verifyImages, CNCF graduated | YAML-only DSL — complex logic still possible but verbose | Admission enforcement, default policy engine |
| **OPA Gatekeeper** | Rego language, external-data lookups, cross-cluster policies, CNCF graduated | Rego learning curve; heavier resource footprint | Complex / external-data policies |
| **kubescape** | NSA/CISA Kubernetes Hardening Guidance + MITRE ATT&CK mapping | Heavier than kube-linter | Compliance audits (NSA, CIS, MITRE) |
| **GitLab kubernetes-validate-action / GitHub Actions** | CI glue that runs the above as a matrix and posts SARIF | Glue only — no checks of its own | PR-pipeline integration |

### Commands

```bash
# Schema validation (offline, fast)
kubeconform -strict -summary -kubernetes-version 1.32.0 manifests/

# Linter pack
kube-linter lint manifests/ --format sarif > kube-linter.sarif
kube-score score manifests/*.yaml --output-format ci

# Security analyzers
kubesec scan deployment.yaml
trivy config --format sarif --output trivy-config.sarif manifests/
polaris audit --audit-path manifests/ --format pretty
kubescape scan framework nsa --format sarif --output kubescape.sarif manifests/

# Policy admission (cluster-side, also runs in CI with `kyverno apply`)
kyverno apply policies/ --resource manifests/ --policy-report
# Or Gatekeeper test:
gator test --filename=policies/ --filename=manifests/

# Helm-aware
helm template ./chart | kube-linter lint -
helm template ./chart | kube-score score -
```

Aggregate the SARIF files into the GitHub Security tab (or GitLab equivalent). Per the warnings-are-bugs principle, every finding emitted to the integrator is `severity: critical` on the wire regardless of internal triage tier.

## Per-language deployment patterns

Kubernetes manifest YAML is the foundational language for this skill — every language below ultimately produces or consumes the same `Deployment` + `Service` + `NetworkPolicy` shape. The per-language differences are: which probe path the language framework exposes, how secrets are read, how the image is built, and what Helm chart conventions look like.

> **Skipped**: C and C++ — neither has a meaningful Kubernetes-first deployment pattern in 2026. Native C/C++ services do ship in Kubernetes (databases, network proxies, ML kernels) but the manifest is identical to the Go example below; the language-specific surface is the Dockerfile, not the manifest. SQL — Kubernetes is not a SQL execution surface; CloudSQL/RDS/Cloud Spanner / managed Postgres operators (CloudNativePG, Zalando postgres-operator) own the database-on-K8s pattern, and the manifest validation rules don't diverge from the generic case. Both intentionally out of scope.

### Minimum manifest set (any language)

Every workload ships this four-file set at minimum. Anything less is a critical finding.

```yaml
# 1. deployment.yaml — restricted PSA, digest-pinned, all probes, no plain secret
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: app-prod
spec:
  replicas: 3
  selector: { matchLabels: { app: app } }
  template:
    metadata:
      labels: { app: app }
    spec:
      serviceAccountName: app-sa
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        fsGroup: 10001
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: app
          # Digest-pinned, not :tag. Replace sha256 with the real digest from cosign/registry.
          image: ghcr.io/example/app@sha256:0000000000000000000000000000000000000000000000000000000000000000
          imagePullPolicy: IfNotPresent     # digest is immutable; Always is moot
          ports:
            - { containerPort: 8080, name: http }
          env:
            - name: DB_URL
              valueFrom:
                secretKeyRef: { name: app-db, key: url }   # ESO-managed (see ExternalSecret below)
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 256Mi }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          startupProbe:
            httpGet: { path: /startup, port: http }
            periodSeconds: 5
            failureThreshold: 30          # 150s warm-up budget
          readinessProbe:
            httpGet: { path: /ready, port: http }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 10
            failureThreshold: 3
          volumeMounts:
            - { name: tmp, mountPath: /tmp }
      volumes:
        - { name: tmp, emptyDir: {} }       # writable scratch under readOnlyRootFilesystem
---
# 2. service.yaml
apiVersion: v1
kind: Service
metadata: { name: app, namespace: app-prod }
spec:
  selector: { app: app }
  ports: [ { name: http, port: 80, targetPort: http } ]
---
# 3. networkpolicy-default-deny.yaml — namespace-wide ingress+egress deny, with DNS allow
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: app-prod }
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-dns, namespace: app-prod }
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: kube-system }
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
---
# 4. namespace.yaml — PSA restricted label, mandatory in 2026
apiVersion: v1
kind: Namespace
metadata:
  name: app-prod
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

PodSecurityPolicy is intentionally absent — the API was removed in Kubernetes 1.25 (2022). Any manifest still referencing it is a critical finding (Category 14).

### ExternalSecret (replaces plain `kind: Secret`)

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata: { name: app-db, namespace: app-prod }
spec:
  refreshInterval: 1h
  secretStoreRef: { name: aws-secrets, kind: ClusterSecretStore }
  target:
    name: app-db
    creationPolicy: Owner
  data:
    - secretKey: url
      remoteRef: { key: prod/app/db, property: url }
```

### Language-specific deployments (Helm-friendly)

#### C# / .NET 9 + Microsoft.Identity

```yaml
# values.yaml (Helm) — pinned digest, restricted PSA
image:
  repository: ghcr.io/example/app-dotnet
  digest: sha256:0000000000000000000000000000000000000000000000000000000000000000
env:
  ASPNETCORE_URLS: http://+:8080
  ASPNETCORE_FORWARDEDHEADERS_ENABLED: "true"
  # Microsoft.Identity reads from env / Azure Key Vault via ESO-synced Secret
  AzureAd__Instance: https://login.microsoftonline.com/
  AzureAd__TenantId: ${AZURE_TENANT_ID}     # from ExternalSecret
  AzureAd__ClientId: ${AZURE_CLIENT_ID}     # from ExternalSecret
```

```yaml
# templates/deployment.yaml — only the language-specific bits shown
containers:
  - name: app
    image: "{{ .Values.image.repository }}@{{ .Values.image.digest }}"
    ports: [ { containerPort: 8080, name: http } ]
    startupProbe:
      httpGet: { path: /health/startup, port: http }   # AddHealthChecks().AddCheck<StartupCheck>("startup")
      periodSeconds: 5
      failureThreshold: 30
    readinessProbe:
      httpGet: { path: /health/ready, port: http }     # AddHealthChecks(..., tags: ["ready"])
      periodSeconds: 5
    livenessProbe:
      httpGet: { path: /health/live, port: http }      # AddHealthChecks(..., tags: ["live"])
      periodSeconds: 10
    env:
      - name: DOTNET_RUNNING_IN_CONTAINER
        value: "true"
      # Microsoft.Identity client secret: NEVER plain — pull from Azure Key Vault via ESO
      - name: AzureAd__ClientSecret
        valueFrom:
          secretKeyRef: { name: app-azuread, key: client-secret }
```

In `Program.cs`, expose the probe endpoints that match:

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("startup", () => HealthCheckResult.Healthy(), tags: new[] { "startup" })
    .AddCheck("ready",   () => HealthCheckResult.Healthy(), tags: new[] { "ready"   })
    .AddCheck("live",    () => HealthCheckResult.Healthy(), tags: new[] { "live"    });

app.MapHealthChecks("/health/startup", new() { Predicate = r => r.Tags.Contains("startup") });
app.MapHealthChecks("/health/ready",   new() { Predicate = r => r.Tags.Contains("ready") });
app.MapHealthChecks("/health/live",    new() { Predicate = r => r.Tags.Contains("live") });
```

#### Java / Spring Boot

```yaml
# values.yaml
image:
  repository: ghcr.io/example/app-spring
  digest: sha256:0000000000000000000000000000000000000000000000000000000000000000
env:
  SPRING_PROFILES_ACTIVE: prod
  MANAGEMENT_ENDPOINTS_WEB_BASE_PATH: /actuator
  JAVA_TOOL_OPTIONS: -XX:MaxRAMPercentage=75 -XX:InitialRAMPercentage=50
```

```yaml
containers:
  - name: app
    image: "{{ .Values.image.repository }}@{{ .Values.image.digest }}"
    ports: [ { containerPort: 8080, name: http } ]
    startupProbe:
      httpGet: { path: /actuator/health/liveness, port: http }
      periodSeconds: 5
      failureThreshold: 60                  # JVM warm-up + Spring context can run 30-180s
    readinessProbe:
      httpGet: { path: /actuator/health/readiness, port: http }
      periodSeconds: 5
    livenessProbe:
      httpGet: { path: /actuator/health/liveness, port: http }
      periodSeconds: 10
    env:
      - name: SPRING_DATASOURCE_PASSWORD
        valueFrom:
          secretKeyRef: { name: app-db, key: password }   # ESO-synced
```

Spring Boot ≥ 2.3 exposes `/actuator/health/liveness` and `/actuator/health/readiness` natively when `management.endpoint.health.probes.enabled=true` (default since 2.4 when running on Kubernetes).

#### Python / FastAPI

```yaml
# values.yaml
image:
  repository: ghcr.io/example/app-fastapi
  digest: sha256:0000000000000000000000000000000000000000000000000000000000000000
env:
  UVICORN_HOST: 0.0.0.0
  UVICORN_PORT: "8080"
  UVICORN_WORKERS: "4"
```

```yaml
containers:
  - name: app
    image: "{{ .Values.image.repository }}@{{ .Values.image.digest }}"
    command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
    ports: [ { containerPort: 8080, name: http } ]
    startupProbe:
      httpGet: { path: /healthz/startup, port: http }
      periodSeconds: 3
      failureThreshold: 20                  # Python cold-start budget ~60s
    readinessProbe:
      httpGet: { path: /healthz/ready, port: http }
      periodSeconds: 5
    livenessProbe:
      httpGet: { path: /healthz/live, port: http }
      periodSeconds: 10
```

FastAPI handlers (minimal):

```python
@app.get("/healthz/live")
async def live(): return {"status": "ok"}

@app.get("/healthz/ready")
async def ready(db: Annotated[AsyncSession, Depends(get_db)]):
    await db.execute(text("SELECT 1"))
    return {"status": "ready"}

@app.get("/healthz/startup")
async def startup(): return {"status": "started"} if app.state.warm else Response(status_code=503)
```

#### TypeScript / Next.js (or Node)

```yaml
# values.yaml
image:
  repository: ghcr.io/example/app-next
  digest: sha256:0000000000000000000000000000000000000000000000000000000000000000
env:
  NODE_ENV: production
  PORT: "8080"
  HOSTNAME: 0.0.0.0
```

```yaml
containers:
  - name: app
    image: "{{ .Values.image.repository }}@{{ .Values.image.digest }}"
    ports: [ { containerPort: 8080, name: http } ]
    startupProbe:
      httpGet: { path: /api/health/startup, port: http }
      periodSeconds: 3
      failureThreshold: 30                  # Next.js cold-start can include warm-cache pre-render
    readinessProbe:
      httpGet: { path: /api/health/ready, port: http }
      periodSeconds: 5
    livenessProbe:
      httpGet: { path: /api/health/live, port: http }
      periodSeconds: 10
```

Next.js route handler (App Router):

```ts
// app/api/health/live/route.ts
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ status: "ok" }); }

// app/api/health/ready/route.ts
import { sql } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  await sql`SELECT 1`;
  return Response.json({ status: "ready" });
}
```

#### Go

```yaml
# values.yaml
image:
  repository: ghcr.io/example/app-go
  digest: sha256:0000000000000000000000000000000000000000000000000000000000000000
env:
  GOMAXPROCS: "2"        # match cpu limit so Go scheduler doesn't oversubscribe
  GOMEMLIMIT: "240MiB"   # ~94% of memory limit; let GC reclaim before OOM
```

```yaml
containers:
  - name: app
    image: "{{ .Values.image.repository }}@{{ .Values.image.digest }}"
    ports: [ { containerPort: 8080, name: http } ]
    startupProbe:
      httpGet: { path: /startup, port: http }
      periodSeconds: 2
      failureThreshold: 10                  # Go binaries usually start < 1s
    readinessProbe:
      httpGet: { path: /ready, port: http }
      periodSeconds: 5
    livenessProbe:
      httpGet: { path: /healthz, port: http }
      periodSeconds: 10
```

Go's `GOMAXPROCS` and `GOMEMLIMIT` matter: without them, the Go runtime sees the node's full CPU/memory and oversubscribes the cgroup. Set both to match the manifest's `limits`.

## Common Issues (cross-language)

### Running as root

```yaml
# GOOD
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    fsGroup: 10001
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: app
      image: registry/app@sha256:...
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: { drop: ["ALL"] }
```

### Missing resource limits

```yaml
resources:
  requests: { memory: 128Mi, cpu: 100m }
  limits:   { memory: 256Mi, cpu: 500m }
```

### Plain Secret (the noisy bad pattern)

```yaml
# BAD — DO NOT COMMIT
apiVersion: v1
kind: Secret
metadata: { name: app-db }
type: Opaque
stringData:
  url: postgres://user:PLACEHOLDER_PASSWORD@db:5432/app   # placeholder; even placeholder-shaped strings train wrong habits

# GOOD — ExternalSecret references the real store, the resulting Secret is generated in-cluster, never in Git
```

### Default ServiceAccount + token mount

```yaml
# BAD (implicit)
spec:
  containers: [ ... ]                  # binds `default` SA, mounts token, RBAC unscoped

# GOOD
spec:
  serviceAccountName: app-sa
  automountServiceAccountToken: false  # explicitly opt out unless the app calls the K8s API
```

### RBAC wildcard

```yaml
# BAD — wildcard verb on a workload-scoped Role
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: app-role, namespace: app-prod }
rules:
  - apiGroups: [""]
    resources: ["*"]
    verbs: ["*"]               # critical: no daylight between this and cluster-admin within the namespace

# GOOD — least-privilege, only the verbs the workload actually invokes
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["app-config"]
    verbs: ["get", "watch"]
```

### Egress to cloud metadata not blocked

```yaml
# GOOD — explicit block of the IMDS endpoint in any egress allow rule
egress:
  - to:
      - ipBlock:
          cidr: 0.0.0.0/0
          except: [169.254.169.254/32, 169.254.170.0/24]   # AWS IMDS + ECS task metadata
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used in the human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)). The triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | privileged: true · hostNetwork on app workload · plain Secret with real-looking value · missing NetworkPolicy default-deny · `:latest` tag · PSA `restricted` not enforced · RBAC `verbs: ["*"]` · missing seccomp / capabilities-drop on restricted namespace | BLOCK |
| HIGH | digest absent but specific tag pinned · `automountServiceAccountToken: true` without justification · missing image signature verification policy · missing startupProbe on slow-start image · namespace without ResourceQuota | BLOCK |
| MEDIUM | overly broad NetworkPolicy `to: {}` with empty selector · CPU limit but no memory limit · liveness probe `initialDelaySeconds: 0` · single replica on prod-labeled namespace | Fix soon |
| LOW | missing recommended labels (`app.kubernetes.io/name`, `app.kubernetes.io/version`, `app.kubernetes.io/part-of`) · missing PodDisruptionBudget · no topologySpreadConstraints · Helm chart without a `_helpers.tpl` label-set template | Backlog |

## Output Format

```markdown
## Kubernetes Validation Report

### Manifests Scanned
| Kind | Count |
|------|-------|
| Deployment | 5 |
| Service | 5 |
| NetworkPolicy | 2 |
| ConfigMap | 3 |
| ExternalSecret | 4 |
| Secret (plain) | 0 |

### Tool Results (SARIF-aggregated)
| Tool | Critical | High | Medium | Low |
|------|---------|------|--------|-----|
| kube-linter | 2 | 5 | 8 | 3 |
| kube-score  | 1 | 3 | 6 | 2 |
| kubesec     | 1 | 2 | — | — |
| trivy config | 2 | 4 | 3 | — |
| polaris     | — | 3 | 7 | 4 |
| kyverno (test) | 1 | — | — | — |

### Pod Security Standard
| Namespace | enforce | audit | warn |
|-----------|---------|-------|------|
| app-prod  | restricted | restricted | restricted |
| logging   | (missing) | (missing) | (missing) |   ← critical

### Critical Issues
1. **Plain Secret committed** — Secret/db-creds at base/secret.yaml:1 (Category 6)
2. **No NetworkPolicy default-deny** — Namespace logging (Category 3)
3. **Image tag `:latest`** — Deployment/api at api.yaml:25 (Category 7)
4. **runAsRoot** — Deployment/worker at worker.yaml:42 (Category 2)

### Recommendations (Priority Order)
1. Convert plain Secrets to ExternalSecret (External Secrets Operator)
2. Apply namespace PSA labels (`pod-security.kubernetes.io/enforce: restricted`)
3. Ship default-deny NetworkPolicy + DNS allow per namespace
4. Pin all images by digest; remove `:latest`
5. Add startup/ready/live probes where missing
6. Set requests AND limits for cpu + memory
7. Enable Kyverno `verifyImages` policy referencing cosign keys
```

## Red Lines

- NEVER allow `privileged: true` without a documented exception waiver in the plan's `## Decisions Taken Under Ambiguity`
- NEVER allow `:latest` tags
- NEVER allow `hostNetwork: true` outside system-critical DaemonSets explicitly listed in an allowlist
- NEVER ship a plain `kind: Secret` to Git — even with placeholder values; the pattern itself is a critical finding
- NEVER allow a workload to bind to the `default` ServiceAccount in production namespaces
- NEVER ship a namespace without `pod-security.kubernetes.io/enforce: restricted`
- NEVER allow a NetworkPolicy that opens egress to `169.254.169.254/32` (cloud IMDS)

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind+message)[:12]>   # fingerprint for dedup
severity: critical                                          # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                             # high = corroborated by 2+ engines; low = single tool
engine: kube-linter | kube-score | kubeconform | kubesec | trivy-config | polaris | kyverno | gatekeeper | kubescape | manual
rule_id: <tool's rule id, e.g. run-as-non-root, no-read-only-root-fs, KSV017>
corroborated_by: [<other engines that also flagged this>]   # empty list if single-source
kind: Deployment | StatefulSet | DaemonSet | Namespace | NetworkPolicy | Secret | Role | RoleBinding | ServiceAccount
resource_name: app-api
resource_kind: Deployment
target_file: manifests/base/deployment.yaml
target_line: 42
category: 1..20                                             # from the categories table above
message: "Container runs as root: securityContext.runAsNonRoot is not set"
suggested_fix: |
  spec.template.spec.securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    seccompProfile: { type: RuntimeDefault }
reference: https://kubernetes.io/docs/concepts/security/pod-security-standards/#restricted
```

The integrator uses `confidence` and `corroborated_by` to weight findings — two engines agreeing escalates a finding past `confidence: low` thresholds. `severity` remains `critical` on the wire regardless; the soft tier lives only in the human report.

---

## Refinement Loop — critic mode (v6.9.8+)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every kube-linter warning, kube-score grade below B, kubesec score below 6, Polaris failure, Kyverno policy violation, and deprecation notice (e.g., PodSecurityPolicy reference) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a missing NetworkPolicy today is a lateral-movement incident next quarter. Code that ships green-with-warnings ships with known latent failures.
