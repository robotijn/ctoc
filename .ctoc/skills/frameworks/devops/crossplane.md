# Crossplane CTO
> Kubernetes-native cloud infrastructure.

## Non-Negotiables
1. Composition for abstraction
2. Provider credentials via secrets
3. XRDs for platform APIs
4. Patch and transform pipelines
5. GitOps workflow

## Red Lines
- Direct managed resource access to users
- Credentials in compositions
- Missing deletion policies
- No composition validation
- Unversioned XRDs

## Pattern
```yaml
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: xpostgresql.db.example.com
spec:
  compositeTypeRef:
    apiVersion: db.example.com/v1
    kind: XPostgreSQL
  resources:
    - name: instance
      base:
        apiVersion: rds.aws.upbound.io/v1beta1
        kind: Instance
```
