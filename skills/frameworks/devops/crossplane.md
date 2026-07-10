# Crossplane CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install Crossplane
kubectl create namespace crossplane-system
helm repo add crossplane-stable https://charts.crossplane.io/stable
helm install crossplane crossplane-stable/crossplane -n crossplane-system
# Install provider
kubectl crossplane install provider upbound/provider-aws
```

## Claude's Common Mistakes
1. **Direct managed resource access** - Use XRDs for platform APIs
2. **Hardcodes credentials** - Must use ProviderConfig with IRSA/Workload Identity
3. **Missing deletion policies** - Causes orphaned cloud resources
4. **Unversioned XRDs** - Breaks consumer compatibility
5. **Skips composition validation** - Errors surface in production

## Correct Patterns (2026)
```yaml
# Composite Resource Definition (XRD)
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xpostgresqls.database.example.com
spec:
  group: database.example.com
  names:
    kind: XPostgreSQL
    plural: xpostgresqls
  claimNames:
    kind: PostgreSQL
    plural: postgresqls
  versions:
    - name: v1alpha1
      served: true
      referenceable: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                size:
                  type: string
                  enum: [small, medium, large]
              required: [size]

---
# Composition
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: xpostgresql-aws
  labels:
    provider: aws
spec:
  compositeTypeRef:
    apiVersion: database.example.com/v1alpha1
    kind: XPostgreSQL
  resources:
    - name: rds-instance
      base:
        apiVersion: rds.aws.upbound.io/v1beta1
        kind: Instance
        spec:
          forProvider:
            engine: postgres
            engineVersion: "15"
          deletionPolicy: Delete  # or Orphan
      patches:
        - fromFieldPath: spec.size
          toFieldPath: spec.forProvider.instanceClass
          transforms:
            - type: map
              map:
                small: db.t3.micro
                medium: db.t3.small
                large: db.t3.medium
```

## Version Gotchas
- **Crossplane 1.15+**: Composition Functions GA
- **Upbound providers**: Replacing crossplane-contrib
- **IRSA/Workload Identity**: Required for cloud auth
- **With ArgoCD**: Use App-of-Apps for composition management

## What NOT to Do
- Do NOT expose managed resources directly - use XRDs
- Do NOT hardcode credentials - use ProviderConfig
- Do NOT skip deletionPolicy - causes orphaned resources
- Do NOT deploy unversioned XRDs - breaks consumers
- Do NOT skip composition validation in dev cluster first

## Composition & Reconciliation Footguns
Crossplane is a **continuous reconciler**, not a one-shot applier. Every managed
resource is reconciled on a loop: Crossplane compares desired (the XR/Composition)
against observed (the real cloud object) and **corrects drift automatically**. Edit
the RDS instance in the AWS console and Crossplane reverts it on the next loop —
the XR is the source of truth, not the cloud.

- **XRD → Composition → Claim** is the platform contract. The XRD defines the API
  schema; the Composition maps it to managed resources; a **Claim** is the
  namespaced consumer handle to a cluster-scoped Composite (XR).
- **`managementPolicies`** (v1.11+, on by default in v2) decouple the reconciler's
  actions. `["Observe"]` alone imports without owning; the default full set
  `["*"]` creates/updates/deletes. Set the wrong policy and Crossplane either
  refuses to fix drift (`Observe`-only) or deletes a resource you meant to only
  observe.
- **`deletionPolicy`** (`Delete` vs `Orphan`) decides whether deleting the XR
  deletes the real cloud resource. `Orphan` leaves it running — the classic silent
  cost leak.
- **Composition Functions** (GA since 1.14) are the current authoring model — a
  pipeline of function containers produces the resource set. Prefer the function
  pipeline over the legacy `resources:`/`patches:` array for new work.

```yaml
# Composition using the function pipeline (current model, v1.14+ / v2)
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: xpostgresql-aws
spec:
  compositeTypeRef:
    apiVersion: database.example.com/v1alpha1
    kind: XPostgreSQL
  mode: Pipeline
  pipeline:
    - step: patch-and-transform
      functionRef:
        name: function-patch-and-transform
```

## Correctness — Connection Secrets
Managed resources publish their connection details (endpoint, password) to a
Kubernetes **Secret**, not to the XR status. Wire it explicitly or the consuming
workload never gets credentials:

```yaml
spec:
  writeConnectionSecretToRef:          # on the managed resource / XR
    namespace: crossplane-system
    name: xpostgresql-conn
# The Secret holds the DB password in base64 — treat it as sensitive, scope RBAC,
# and prefer a Secret Store (ESO / provider-kubernetes) for propagation.
```

## Security — Provider Credentials & RBAC
- **ProviderConfig credential source** — never bake a static cloud key into a
  `ProviderConfig`. Use `source: InjectedIdentity` with **IRSA / Workload
  Identity** so the provider pod assumes a role. Hard-coding a key here is CWE-798
  "Use of Hard-coded Credentials" (cwe.mitre.org/798).
- **RBAC on XRs / Claims (CWE-284)** — a Composite Resource can provision real
  cloud infrastructure, so granting `create` on an XR is granting the ability to
  spend money and open network paths. Improperly scoped RBAC here is CWE-284
  "Improper Access Control" (cwe.mitre.org/284). Grant Claim access namespace-by-
  namespace; keep cluster-scoped XR/Composition/XRD edit rights to platform admins
  only. Crossplane auto-generates per-XRD RBAC ClusterRoles — bind them narrowly,
  do not hand out the aggregated `crossplane-admin`.

```yaml
apiVersion: pkg.crossplane.io/v1
kind: ProviderConfig      # provider-aws
metadata:
  name: default
spec:
  credentials:
    source: InjectedIdentity     # IRSA / Workload Identity — no static key
```

## Testing & Reconciliation Validation
- **`crossplane render`** (crossplane CLI) runs a Composition + functions locally
  against a sample XR and prints the resulting managed resources — a fast unit
  check without a live cluster.
- **`crossplane validate`** checks Compositions/XRDs against provider CRD schemas.
- Always apply a new Composition in a **dev cluster** and confirm the reconciler
  reaches `SYNCED=True READY=True` before promoting; a broken patch surfaces only
  when a real XR is created.

## Version-Specific Gotchas (dated, sourced)
- **Crossplane 2.3.3** is the current stable chart/app version on the official
  stable channel. Crossplane **v2** made namespaced Composite Resources and the
  function pipeline the default authoring model. [charts.crossplane.io/stable,
  retrieved 2026-07-10]
- **Composition Functions are GA since v1.14** — the legacy inline
  `resources:`/`patches:` form still works but is superseded; author new
  Compositions with `mode: Pipeline`. [crossplane.io/docs, retrieved 2026-07-10]
- **Upbound providers** replaced the archived `crossplane-contrib` providers for
  the major clouds. [crossplane.io/docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Crossplane releases (Helm chart index): https://charts.crossplane.io/stable/index.yaml
- Compositions & Composition Functions: https://docs.crossplane.io/latest/concepts/compositions/
- Composite Resource Definitions (XRDs): https://docs.crossplane.io/latest/concepts/composite-resource-definitions/
- ProviderConfig & credentials: https://docs.crossplane.io/latest/concepts/providers/
- Management & deletion policies: https://docs.crossplane.io/latest/concepts/managed-resources/
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-798 (Use of Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
