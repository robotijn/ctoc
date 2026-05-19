---
name: configuration-validator
description: Validates configuration across environments — schema, security, parity, drift.
type: skill
when_to_load:
  - "config validation"
  - "configuration validator"
  - "env config"
  - "config drift"
  - "environment parity"
  - "validate settings"
related_skills:
  - security/secrets-detector
  - specialized/health-check-validator
  - infrastructure/terraform-validator
effort_level: low
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Configuration Validator (skill)

> Converted from agents/specialized/configuration-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate that configuration is correct, consistent, and secure across all environments (dev, staging, production). You assume config is hostile until proven otherwise: a missing env var is a P0 outage waiting for prod traffic, a string `"true"` parsed as a bool literal is a silent feature-flag inversion, and a secret committed to `config/production.yaml` is a public credential.

## 2026 Best Practices (Specialized category)

- **Fail-closed on missing/invalid config at boot.** Apps MUST refuse to start when required config is absent, malformed, or unparseable. No silent defaulting to development values. Failing in `main()` before listening on a port turns a multi-hour incident into a deploy-blocking error message. This is the operational realization of twelve-factor's [config-in-the-environment](https://12factor.net/config) principle — and the load-bearing fix for the common modern critique that twelve-factor produces "invisible" config when validation is skipped.
- **Validate at boot, not at first use.** Parse-then-validate the entire config object on startup; never lazily validate on the request path. A bad config value discovered three hours into production traffic is an outage; the same value discovered at boot is a rollback.
- **Type-safe binding from env → typed struct.** Treat env vars as untrusted input. Bind through a schema-aware layer (pydantic-settings, envalid/zod-env, .NET `IOptions<T>` + DataAnnotations, Spring `@ConfigurationProperties` + JSR-380, viper + struct tags) so `"true"` → `bool true`, `"30"` → `int 30`, `"https://..."` → parsed `URL`. Reject on coercion failure — never silently fall through to a zero value.
- **Schema-pinned env vars.** Maintain an explicit schema (JSON Schema, pydantic model, zod schema, Spring `@Validated`) that lists every env var the app reads, with type, default, description, required-ness, and which environments use it. Undeclared env vars are a code smell; declared-but-unused env vars are dead documentation. CI enforces both directions.
- **Separate secrets from config.** Config (non-sensitive: timeouts, log levels, feature flags) goes in version-controlled files or env vars. Secrets (DB passwords, API keys, signing keys) go in a secrets manager (Vault, AWS Secrets Manager, Doppler, dotenv-vault, sealed-secrets, SOPS). The validator MUST flag any secret-shaped value in plain config and MUST verify referenced secret URIs resolve.
- **Parse-then-validate (Alexis King's principle).** Convert raw strings into the strictest possible type (a parsed `Url`, a validated `PortNumber`, a confirmed-non-empty `ApiKey`) before passing them anywhere. Downstream code receives proofs, not strings; impossible states become unrepresentable.
- **Manual review for env-specific differences.** Tooling flags drift; humans approve intentional divergence. A parity matrix surfaces every key that differs across dev/staging/prod with a `documented?` column.
- **Resilience: declared = runtime.** Compare runtime config (what the running process actually sees via `/debug/config` or audit logs) to declared config (what the YAML/env said). Override hooks, late-loaded plugins, and operator hot-patches all create runtime drift invisible to schema validation.

## What to Check

### Schema Validation
- All required fields present (fail-closed on missing)
- Types correct after coercion (`"true"` rejected if the schema doesn't permit string→bool widening)
- Values within allowed ranges (port 1–65535, log level in the enum, percentage 0–100)
- Mutually-exclusive fields not both set; required-together fields not split

### Security
- No secrets in plain config files (see [[secrets-detector]])
- Secure defaults: `debug: false`, `tls.min_version: 1.2+`, `cookie.secure: true`
- Debug mode off in production; verbose tracing off in production
- Secret references resolve (Vault path exists, AWS Secrets Manager ARN reachable)

### Environment Parity
- Same structure across envs
- Intentional differences documented in `.ctoc/config-parity-exceptions.yaml`
- Naming convention consistent (no `cache.ttl` in dev and `cache_ttl` in prod)

### Drift Detection
- Runtime config matches declared config
- No undocumented overrides (operator hot-patches, late-loaded plugins)
- Helm rendered output matches committed `values.yaml` + overlay

## Categories (severity reconciliation maps every category to `critical` on the wire)

1. **Missing required env var** — `DATABASE_URL` unset in production. Boot MUST fail.
2. **Type mismatch** — `DEBUG="true"` parsed as truthy string instead of `bool true`; `PORT="8080 "` (trailing space) → `int` coercion fails.
3. **Out-of-range numeric** — `MAX_CONNECTIONS=999999`, `RATE_LIMIT=-1`, `TIMEOUT_MS=0`.
4. **Secrets in plain config files** — `password: "..."` in `production.yaml`, `aws_secret_access_key` in `.env.example` committed with a real value.
5. **Unparseable URLs / DSNs** — `DATABASE_URL=postgres//missing-colon`, malformed Redis URI, missing scheme.
6. **Conflicting feature flags** — `FEATURE_NEW_AUTH=true` AND `FEATURE_LEGACY_AUTH=true`; mutually-exclusive flags both set.
7. **Environment drift** — `cache.ttl: 60` in dev, missing in prod; `log_level: debug` in prod (should be `info` or `warn`).

## Anti-Patterns

```yaml
# BAD — secret in plain config (move to secrets manager)
database:
  password: "REDACTED_PASSWORD"   # → ${DATABASE_PASSWORD} via Vault/Doppler/SOPS

# BAD — debug in prod
debug: true   # in production.yaml

# BAD — inconsistent structure
# dev.yaml:   cache.ttl: 60
# prod.yaml:  cache_ttl: 60

# BAD — silent default masking missing required config
timeout: ${TIMEOUT:-30}   # silently uses 30s if TIMEOUT unset; should fail-closed
```

## Config-binding BAD / SAFE (7 languages)

The validator MUST inspect how the application binds raw env / file config into typed values. Below are the canonical patterns to find (BAD) and prescribe (SAFE) in each ecosystem. These are *what the validator looks for in the codebase* during a scan.

### C# — .NET 9, `IOptions<T>` + `IConfigurationSection`

```csharp
// BAD: untyped, no validation, silent default to empty string
var conn = builder.Configuration["ConnectionStrings:Default"]; // null if missing — boots silently
var cmd  = new SqlCommand(/* ... */, new SqlConnection(conn ?? "")); // crashes mid-request

// BAD: bound without validation
builder.Services.Configure<AppOptions>(builder.Configuration.GetSection("App"));

// SAFE: typed binding + DataAnnotations + ValidateOnStart
public sealed class AppOptions {
    [Required, Url]                                 public string ApiBaseUrl  { get; init; } = "";
    [Required, Range(1, 65535)]                     public int    Port        { get; init; }
    [Required, MinLength(32)]                       public string SigningKey  { get; init; } = "";
    [Range(typeof(TimeSpan), "00:00:01", "00:05:00")]
                                                    public TimeSpan Timeout   { get; init; }
}

builder.Services
    .AddOptions<AppOptions>()
    .Bind(builder.Configuration.GetSection("App"))
    .ValidateDataAnnotations()
    .ValidateOnStart();                             // fail-closed at boot, not first request
```

### Java — Spring Boot, `@ConfigurationProperties` + JSR-380

```java
// BAD: @Value with no validation; missing key resolves to literal "${app.api.base-url}"
@Component
public class Client {
    @Value("${app.api.base-url}") private String baseUrl;   // no fail-closed, no type guard
}

// SAFE: typed binding + bean validation; missing/invalid → BindException at startup
@Validated
@ConfigurationProperties(prefix = "app")
public record AppProperties(
    @NotBlank @URL                           String  apiBaseUrl,
    @Min(1)   @Max(65535)                    int     port,
    @NotBlank @Size(min = 32)                String  signingKey,
    @NotNull  @DurationMin(seconds = 1)
              @DurationMax(minutes = 5)      Duration timeout
) {}

// @ConfigurationPropertiesScan or @EnableConfigurationProperties(AppProperties.class)
// causes Spring to fail the application context if validation fails — fail-closed boot.
```

### Python — `pydantic-settings` `BaseSettings`

```python
# BAD: os.getenv with silent default + manual coercion that silently widens
import os
PORT      = int(os.getenv("PORT", "8080"))            # ValueError uncaught
DEBUG     = os.getenv("DEBUG", "false") == "true"     # "True"/"1"/"yes" all become False
DB_URL    = os.getenv("DATABASE_URL")                 # None silently → connect crashes later

# SAFE: pydantic-settings — fail-closed, type-safe, schema-pinned
from pydantic import AnyHttpUrl, Field, PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8",
                                      extra="forbid")   # reject undeclared env vars
    api_base_url:  AnyHttpUrl
    port:          int          = Field(ge=1, le=65535)
    debug:         bool         = False                   # accepts "true"/"1"/"yes" case-insensitively
    signing_key:   SecretStr    = Field(min_length=32)    # SecretStr → never logged
    database_url:  PostgresDsn                            # parsed + validated DSN, not raw str
    timeout_ms:    int          = Field(gt=0, lt=60_000)

settings = Settings()   # raises ValidationError at import if anything is wrong
```

### C — parse-then-validate with explicit guards

```c
/* BAD: getenv + atoi — no error path; "abc" silently → 0, NULL silently → segfault */
const char *raw_port = getenv("PORT");
int port = atoi(raw_port);                       /* atoi has no error reporting */
listen(sock, port);                              /* port=0 → kernel picks; not what we wanted */

/* SAFE: explicit presence + strtol + range check; fail-closed on any anomaly */
#include <errno.h>
#include <limits.h>
#include <stdlib.h>
#include <stdio.h>

static int load_port(int *out) {
    const char *raw = getenv("PORT");
    if (!raw || *raw == '\0') {
        fprintf(stderr, "FATAL: PORT env var missing\n");
        return -1;
    }
    char *end = NULL;
    errno = 0;
    long v = strtol(raw, &end, 10);
    if (errno != 0 || end == raw || *end != '\0' || v < 1 || v > 65535) {
        fprintf(stderr, "FATAL: PORT='%s' is not a valid 1-65535 integer\n", raw);
        return -1;
    }
    *out = (int)v;
    return 0;
}

int main(void) {
    int port;
    if (load_port(&port) != 0) return 1;        /* fail-closed before listen() */
    /* ... */
}
```

### C++ — same discipline via `std::optional` / typed wrappers

```cpp
// BAD: getenv directly into stoi — no presence check, no exception handler
int port = std::stoi(std::getenv("PORT"));      // segfault if PORT unset; throws if non-numeric

// SAFE: parse-then-validate, return an Expected/optional, abort at main()
#include <charconv>
#include <cstdlib>
#include <expected>          // C++23
#include <string_view>

struct ConfigError { std::string field; std::string reason; };

std::expected<int, ConfigError> load_port() {
    const char *raw = std::getenv("PORT");
    if (!raw || *raw == '\0')
        return std::unexpected(ConfigError{"PORT", "missing"});
    std::string_view sv{raw};
    int v = 0;
    auto [p, ec] = std::from_chars(sv.data(), sv.data() + sv.size(), v);
    if (ec != std::errc{} || p != sv.data() + sv.size() || v < 1 || v > 65535)
        return std::unexpected(ConfigError{"PORT", "not a 1-65535 integer"});
    return v;
}

int main() {
    auto port = load_port();
    if (!port) {
        std::fprintf(stderr, "FATAL: %s — %s\n",
                     port.error().field.c_str(), port.error().reason.c_str());
        return 1;                                // fail-closed
    }
    // use *port
}
```

### JavaScript / TypeScript — `envalid` and `zod-env`

```typescript
// BAD: process.env directly + manual fallbacks; "true" is truthy as a string, "false" is also truthy
const port  = process.env.PORT || 8080;                  // string|number type confusion
const debug = process.env.DEBUG;                         // "false" is truthy as a string!
const key   = process.env.SIGNING_KEY;                   // possibly undefined

// SAFE option A — envalid: schema-pinned, fail-closed on missing/invalid
import { cleanEnv, str, port as envPort, bool, url, num } from "envalid";

export const env = cleanEnv(process.env, {
    NODE_ENV:    str({ choices: ["development", "staging", "production"] as const }),
    PORT:        envPort(),
    API_BASE_URL: url(),
    DEBUG:       bool({ default: false }),
    SIGNING_KEY: str({ desc: "HMAC signing key, ≥32 chars",
                       example: "REDACTED",
                       devDefault: "REDACTED" }),
    TIMEOUT_MS:  num({ default: 30_000 }),
});

// SAFE option B — zod-env: zod schema as the canonical env contract
import { z } from "zod";

const EnvSchema = z.object({
    NODE_ENV:     z.enum(["development", "staging", "production"]),
    PORT:         z.coerce.number().int().min(1).max(65_535),
    API_BASE_URL: z.string().url(),
    DEBUG:        z.preprocess(v => v === "true" || v === "1", z.boolean()).default(false),
    SIGNING_KEY:  z.string().min(32),
    DATABASE_URL: z.string().url(),
    TIMEOUT_MS:   z.coerce.number().int().positive().lt(60_000).default(30_000),
});
export const env = EnvSchema.parse(process.env);    // throws at module load → fail-closed boot
```

### SQL — db-side config tables

Some systems store runtime config in a `app_config` table (feature flags, per-tenant limits). The validator MUST treat this the same way: fail-closed on missing / invalid / out-of-range rows.

```sql
-- BAD: free-text key/value with no constraints; "true" / "TRUE" / "1" / "yes" all live here
CREATE TABLE app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Application reads value as string and casts ad-hoc — same bug class as os.getenv.

-- SAFE: typed columns + CHECK constraints + an enum for tenant-tier; invalid rows can't exist
CREATE TYPE config_value_kind AS ENUM ('bool','int','duration_ms','url','secret_ref');

CREATE TABLE app_config (
    key        TEXT PRIMARY KEY,
    kind       config_value_kind NOT NULL,
    val_bool   BOOLEAN,
    val_int    BIGINT,
    val_text   TEXT,                                    -- url / secret_ref pointer (not the secret itself)
    env        TEXT NOT NULL CHECK (env IN ('dev','staging','prod')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- exactly one typed column populated for the declared kind
    CONSTRAINT kind_matches_value CHECK (
        (kind = 'bool'         AND val_bool IS NOT NULL AND val_int IS NULL AND val_text IS NULL)
     OR (kind = 'int'          AND val_int  IS NOT NULL AND val_bool IS NULL AND val_text IS NULL)
     OR (kind = 'duration_ms'  AND val_int  IS NOT NULL AND val_int > 0 AND val_int < 600000)
     OR (kind IN ('url','secret_ref') AND val_text IS NOT NULL AND val_bool IS NULL AND val_int IS NULL)
    )
);

-- SAFE: secrets table holds REFERENCES to a secrets manager, never the secret value itself
CREATE TABLE secret_refs (
    name        TEXT PRIMARY KEY,
    provider    TEXT NOT NULL CHECK (provider IN ('vault','aws-sm','doppler','sops')),
    uri         TEXT NOT NULL,                          -- e.g. vault://kv/data/prod/db
    rotated_at  TIMESTAMPTZ
);
```

## Tool Integration (2026)

| Tool | Role | When to invoke |
|------|------|----------------|
| **dotenv-vault** | Encrypted `.env` sync across devs/envs; commit `.env.vault` not `.env` | Repos using local env files; CI fetches via auth token |
| **doppler** | Centralized secrets + config manager; SDKs inject at runtime | Multi-env deploys where Vault is overkill |
| **envalid** | Node/TS schema-validated env loading | Every Node/TS service entry-point |
| **pydantic-settings** | `BaseSettings` model with type-safe binding from env / `.env` / SecretStr | Every Python service entry-point |
| **viper (Go)** | Layered config (defaults → file → env → flags); pair with `validator/v10` struct tags | Every Go service entry-point |
| **helm lint** | Schema-validates `Chart.yaml` and templates render | Pre-commit on Helm chart repos |
| **kubeval / kubeconform** | Validates rendered Kubernetes manifests against API schemas (kubeconform is the faster CRD-aware modern successor) | After `helm template` / `kustomize build`, before `kubectl apply` |
| **conftest (OPA)** | Rego policy tests against any structured config (YAML/JSON/TOML/HCL) | Org-wide policy: "no `:latest` tag", "no `privileged: true`", "every Deployment has resource limits" |
| **tflint** | Terraform linter with provider plugins (AWS/GCP/Azure rules) | Every Terraform PR; pair with `terraform validate` + `terraform plan -detailed-exitcode` |

Aggregate output: emit findings as a single SARIF stream so they land alongside SAST results in the GitHub Security tab. Pin a CI step that fails the build whenever this skill emits any letter — per warnings-are-bugs, every finding is `critical` on the wire.

## Output Format

```markdown
## Configuration Validation Report

### Schema
| Environment | Status   | Issues |
|-------------|----------|--------|
| development | Valid    | 0      |
| staging     | Warnings | 2      |
| production  | Errors   | 1      |

### Security
1. **Secret in plain config** (`config/production.yaml:12`)
   - Field: `database.password` (value REDACTED)
   - Fix: reference `${DATABASE_PASSWORD}` via Vault / Doppler / SOPS
2. **Debug enabled** (`config/staging.yaml:5`)
   - Fix: `debug: false`

### Parity
| Key         | dev    | staging | prod | Issue                   |
|-------------|--------|---------|------|-------------------------|
| cache.ttl   | 60     | 300     | -    | Missing in prod         |
| log_level   | debug  | info    | info | OK                      |
| rate_limit  | 1000   | 100     | 100  | Dev too high — document |

### Drift (runtime vs declared)
| Key            | Declared | Runtime | Status              |
|----------------|----------|---------|---------------------|
| db.pool_size   | 10       | 25      | DRIFT — investigate |

### Missing required
| Variable      | Documented | Present | Status                       |
|---------------|------------|---------|------------------------------|
| DATABASE_URL  | Yes        | No      | FAIL-CLOSED at boot          |
| API_KEY       | No         | Yes     | Undocumented — add to schema |
| DEBUG         | Yes        | No      | Default applied — OK         |
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** for human-readable reports. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|-------|----------|--------|
| CRITICAL | Secret in plain config in prod, missing required env in prod, broken DB DSN, debug=true in prod, TLS<1.2 | BLOCK deploy |
| HIGH | Type-coerced bool, out-of-range numeric in prod, conflicting feature flags, unresolved secret-manager URI | BLOCK deploy |
| MEDIUM | Env drift (key in dev/staging missing in prod with no exception entry), undocumented env var read by code | Fix soon |
| LOW | Style inconsistency (`cache.ttl` vs `cache_ttl`), unused declared env var, missing comment in schema | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+key+type)[:12]>   # fingerprint for dedup
severity: critical                                 # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
config_key: app.database.password                  # the offending key (dot-path)
expected_type: SecretRef | int(1..65535) | url | bool | duration_ms | enum[dev,staging,prod]
actual_value: REDACTED                             # REDACT if the value looks like a secret/key/token;
                                                   # otherwise the literal value (e.g. "true", "0", "abc")
env: dev | staging | prod
source_file: config/production.yaml                # file where the misconfiguration lives
source_line: 12                                    # 1-indexed; null if env-var-only finding
category: missing_required | type_mismatch | out_of_range | secret_in_plain_config |
          unparseable_url | conflicting_flags | env_drift
message: "database.password is a literal secret in production.yaml — must move to Vault/SOPS"
fix: "Replace with ${DATABASE_PASSWORD} sourced from Vault at vault://kv/data/prod/db#password"
reference: https://12factor.net/config
```

The integrator uses `confidence` and `category` to weight findings. `actual_value` MUST be `REDACTED` whenever the value matches a secret-shaped pattern (AWS/GCP/Azure keys, private-key headers, JWT, password-like keys, DB DSNs with embedded credentials) — never echo a real secret into the letter, even at `severity: critical`. The integrator treats `category: secret_in_plain_config` as deploy-blocking regardless of `confidence`.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
