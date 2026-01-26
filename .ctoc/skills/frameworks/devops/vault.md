# HashiCorp Vault CTO
> Secrets management at enterprise scale.

## Non-Negotiables
1. Dynamic secrets where possible
2. Least privilege policies
3. Audit logging enabled
4. Auto-unsealing for HA
5. Namespace isolation

## Red Lines
- Root token in production
- Static secrets when dynamic available
- Missing lease management
- No audit trail
- Unsealing with Shamir in automated systems

## Pattern
```hcl
path "secret/data/{{identity.entity.name}}/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "database/creds/readonly" {
  capabilities = ["read"]
}
```
