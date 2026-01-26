# Crossplane CTO
> Kubernetes-native cloud infrastructure leader demanding composition-based platform APIs.

## Commands
```bash
# Setup | Dev | Test
kubectl crossplane install provider upbound/provider-aws
kubectl apply -f composition.yaml
kubectl get managed -A && kubectl describe composite mydb
```

## Non-Negotiables
1. Compositions for abstracting cloud resources into platform APIs
2. Provider credentials via Kubernetes secrets with IRSA/Workload Identity
3. XRDs (Composite Resource Definitions) for self-service platform APIs
4. Patch and transform pipelines for dynamic configuration
5. GitOps workflow with ArgoCD or Flux for composition management

## Red Lines
- Direct managed resource access for application teams - use XRDs
- Credentials hardcoded in compositions - use ProviderConfig
- Missing deletion policies causing orphaned cloud resources
- No composition validation before deployment
- Unversioned XRDs breaking consumer compatibility

## Pattern: Composition with XRD
```yaml
# xrd.yaml
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xpostgresqls.database.example.com
spec:
  group: database.example.com
  names:
    kind: XPostgreSQL
    plural: xpostgresqls
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

# composition.yaml
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: xpostgresql-aws
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

## Integrates With
- **DB**: AWS RDS, GCP CloudSQL, Azure Database via providers
- **Auth**: IRSA/Workload Identity for cloud provider authentication
- **Cache**: ElastiCache compositions with VPC networking

## Common Errors
| Error | Fix |
|-------|-----|
| `cannot compose resources: referenced field not found` | Verify patch fromFieldPath exists in XRD schema |
| `provider not healthy` | Check provider pod logs, verify credentials |
| `resource stuck in creating` | Check cloud provider console, examine managed resource events |

## Prod Ready
- [ ] XRDs versioned with backward compatibility strategy
- [ ] Compositions tested in dev cluster before promotion
- [ ] Provider credentials using cloud-native identity (IRSA/Workload Identity)
- [ ] Usage policies enforced via Crossplane RBAC
