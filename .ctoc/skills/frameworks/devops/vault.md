# HashiCorp Vault CTO
> Enterprise secrets management leader demanding dynamic secrets, least-privilege policies, and comprehensive audit.

## Commands
```bash
# Setup | Dev | Test
vault server -dev -dev-root-token-id="root"
vault secrets enable -path=secret kv-v2
vault audit enable file file_path=/var/log/vault/audit.log
```

## Non-Negotiables
1. Dynamic secrets for databases, cloud providers - no static credentials
2. Least-privilege policies with path-based access control
3. Audit logging enabled on all production clusters
4. Auto-unsealing with cloud KMS for high availability
5. Namespace isolation for multi-tenant environments

## Red Lines
- Root token usage in production - use named tokens with policies
- Static secrets when dynamic secrets are available
- Missing lease management causing credential sprawl
- No audit trail - compliance and security requirement
- Shamir unsealing in automated systems - use auto-unseal

## Pattern: Database Dynamic Secrets
```hcl
# Enable database secrets engine
path "database/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Configure PostgreSQL connection
resource "vault_database_secret_backend_connection" "postgres" {
  backend       = "database"
  name          = "mydb"
  allowed_roles = ["readonly", "readwrite"]

  postgresql {
    connection_url = "postgresql://{{username}}:{{password}}@db.example.com:5432/mydb"
  }
}

# Create readonly role
resource "vault_database_secret_backend_role" "readonly" {
  backend             = "database"
  name                = "readonly"
  db_name             = vault_database_secret_backend_connection.postgres.name
  creation_statements = [
    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
    "GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";"
  ]
  default_ttl = 3600
  max_ttl     = 86400
}

# Application policy
path "database/creds/readonly" {
  capabilities = ["read"]
}

path "secret/data/{{identity.entity.name}}/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
```

## Integrates With
- **DB**: Database secrets engine for PostgreSQL, MySQL, MongoDB
- **Auth**: Kubernetes auth method, OIDC, LDAP
- **Cache**: Transit engine for encryption-as-a-service

## Common Errors
| Error | Fix |
|-------|-----|
| `permission denied` | Check policy path, verify token has correct policies |
| `lease not found` | Lease expired - request new credentials |
| `connection refused` | Vault sealed - trigger auto-unseal or manual unseal |

## Prod Ready
- [ ] Auto-unseal configured with cloud KMS
- [ ] Audit logs shipped to SIEM
- [ ] Disaster recovery replication enabled
- [ ] Performance standby nodes for read scaling
