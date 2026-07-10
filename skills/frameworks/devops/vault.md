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

## Secret & Lease Footguns
Vault's value is **short-lived, revocable** secrets. The two failures Claude ships
most: static secrets where dynamic ones exist, and secrets that never expire.

- **Dynamic secrets + lease/TTL** — a database credential is minted per request
  with a lease. If the app does not **renew** the lease before `default_ttl`, the
  credential is **revoked** and connections start failing mid-run; if nothing
  renews and nothing revokes on shutdown, you get credential sprawl. Renew on a
  timer at ~⅔ of TTL, and revoke the lease explicitly on graceful shutdown:
  ```bash
  vault lease renew database/creds/readonly/<lease_id>
  vault lease revoke database/creds/readonly/<lease_id>   # on shutdown
  ```
- **Never use the root token in production** — the root token has unlimited,
  unrevocable authority (CWE-284, below). Generate it only to bootstrap policies,
  then **revoke it** (`vault token revoke -self`) and authenticate apps via an
  auth method (Kubernetes, AppRole, OIDC) that issues scoped, TTL'd tokens.
- **KV v1 vs v2** — v2 is versioned; the API path is different
  (`secret/data/<p>` for v2 vs `secret/<p>` for v1). A policy written for the
  wrong version silently grants nothing. For v2, `read`/`create` on `data/`,
  `delete`/`list` on `metadata/`.

## Availability — Seal / Unseal & HA
Vault boots **sealed**: its data is encrypted and unreadable until unsealed. Every
restart re-seals. Shamir unseal needs a quorum of key-holders to type keys — fine
for humans, fatal for automation because a pod restart at 3am blocks until someone
unseals it. Use **auto-unseal** with a cloud KMS/HSM so restarts self-recover:

```hcl
# vault.hcl — auto-unseal via AWS KMS (also azurekeyvault, gcpckms, transit)
seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "alias/vault-unseal"
}
storage "raft" {           # integrated storage → HA without external Consul
  path    = "/vault/data"
  node_id = "node-a"
}
```
For HA, run ≥3 nodes on Raft integrated storage (or Consul); a single node is a
single point of failure and every restart is downtime until unseal.

## Security — Audit, Least Privilege, No Secrets in Logs
- **Enable an audit device** before going live — with none enabled, a compromise
  is invisible. Vault **hashes** sensitive fields in the audit log by default (HMAC),
  so the log itself does not leak secrets — but if you enable `log_raw` you write
  secrets to disk in cleartext, which is CWE-532 "Insertion of Sensitive
  Information into Log File" (cwe.mitre.org/532). Never set `log_raw`.
  ```bash
  vault audit enable file file_path=/var/log/vault/audit.log
  ```
- **Least-privilege policies (CWE-284)** — a policy is default-deny, but a broad
  `path "secret/*" { capabilities = ["read","list"] }` grants an app the whole KV
  store. Over-broad policy is CWE-284 "Improper Access Control"
  (cwe.mitre.org/284). Scope to the exact paths + capabilities the workload needs:
  ```hcl
  path "database/creds/readonly" { capabilities = ["read"] }
  path "secret/data/myapp/*"     { capabilities = ["read"] }
  # everything else stays denied by default
  ```
- **Response wrapping** (`-wrap-ttl`) hands a secret to a client as a one-time-use
  token, so the secret never sits in an env var or CI log.

## Testing Conventions
```bash
# Dev-mode server for tests ONLY — in-memory, auto-unsealed, root token printed.
# NEVER run -dev in production (no persistence, no seal).
vault server -dev -dev-root-token-id=root

# Assert a policy is least-privilege: a token with it must be DENIED elsewhere.
VAULT_TOKEN=$scoped vault kv get secret/other/app   # expect: permission denied
```
Validate policies in CI against a `-dev` server; assert both the allowed read
succeeds and an out-of-scope read is denied (the negative test is the real one).

## Version-Specific Gotchas (dated, sourced)
- **Vault 2.0.3** is the current release (the 2.0.0 major GA'd **2026-04-14**);
  the **1.19.x line is the LTS** (1.19.0 released **2025-03-05**) with extended
  support. Pin the LTS for long-running clusters unless you need 2.x features.
  [releases.hashicorp.com/vault + checkpoint-api.hashicorp.com/v1/check/vault,
  retrieved 2026-07-10]
- **Auto-unseal is required for practical HA** — Shamir unseal blocks automated
  restarts. [developer.hashicorp.com/vault/docs/concepts/seal, retrieved 2026-07-10]
- **On Kubernetes**, inject secrets via the Vault Agent Injector or the Secrets
  Store CSI driver rather than baking them into manifests.
  [developer.hashicorp.com/vault, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Vault releases: https://releases.hashicorp.com/vault/
- Current version (checkpoint): https://checkpoint-api.hashicorp.com/v1/check/vault
- Seal / auto-unseal concepts: https://developer.hashicorp.com/vault/docs/concepts/seal
- Lease, renew & revoke: https://developer.hashicorp.com/vault/docs/concepts/lease
- Policies (least privilege): https://developer.hashicorp.com/vault/docs/concepts/policies
- Audit devices: https://developer.hashicorp.com/vault/docs/audit
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-532 (Insertion of Sensitive Information into Log File): https://cwe.mitre.org/data/definitions/532.html
