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
