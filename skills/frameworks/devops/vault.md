# HashiCorp Vault CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Ubuntu/Debian
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update && sudo apt-get install vault
# Current: 1.21.x, LTS: 1.19.x
```

## Claude's Common Mistakes
1. **Uses root token in production** - Must use named tokens with policies
2. **Static secrets when dynamic available** - Database creds should be dynamic
3. **Missing lease management** - Credential sprawl without TTLs
4. **No audit logging** - Compliance and security requirement
5. **Shamir unsealing in automation** - Use auto-unseal with cloud KMS

## Correct Patterns (2026)
```hcl
# Database dynamic secrets configuration
resource "vault_database_secret_backend_connection" "postgres" {
  backend       = "database"
  name          = "mydb"
  allowed_roles = ["readonly", "readwrite"]

  postgresql {
    connection_url = "postgresql://{{username}}:{{password}}@db.example.com:5432/mydb"
  }
}

resource "vault_database_secret_backend_role" "readonly" {
  backend             = "database"
  name                = "readonly"
  db_name             = vault_database_secret_backend_connection.postgres.name
  creation_statements = [
    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
    "GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";"
  ]
  default_ttl = 3600    # 1 hour
  max_ttl     = 86400   # 24 hours
}

# Application policy (least privilege)
path "database/creds/readonly" {
  capabilities = ["read"]
}

path "secret/data/myapp/*" {
  capabilities = ["read", "list"]
}

# Deny access to other paths by default
path "secret/data/*" {
  capabilities = ["deny"]
}
```

## Version Gotchas
- **Vault 1.19**: LTS release with extended support
- **Vault 1.21+**: Latest features, standard support
- **Auto-unseal**: Required for HA, use cloud KMS
- **With Kubernetes**: Use Vault Agent Injector or CSI driver

## What NOT to Do
- Do NOT use root token in production - create named policies
- Do NOT use static secrets when dynamic available
- Do NOT skip audit logging - compliance requirement
- Do NOT use Shamir unsealing in automation - use auto-unseal
- Do NOT forget lease TTLs - credentials sprawl
