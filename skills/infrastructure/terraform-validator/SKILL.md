---
name: terraform-validator
description: Validates Terraform / OpenTofu IaC for syntax, security, and 2026 best practices (remote state with locking, drift detection, for_each, policy-as-code).
type: skill
when_to_load:
  - "terraform validate"
  - "terraform check"
  - "infrastructure as code"
  - "IaC scan"
  - "terraform security"
  - "validate terraform"
  - "opentofu validate"
  - "tofu check"
related_skills:
  - infrastructure/docker-security-checker
  - infrastructure/kubernetes-checker
  - security/secrets-detector
  - cost/cloud-cost-analyzer
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

# Terraform Validator (skill)

> Converted from agents/infrastructure/terraform-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate Terraform and OpenTofu configurations for syntax, security vulnerabilities, drift risk, and infrastructure best practices. Treat unsafe defaults (public buckets, `Action = "*"`, local state) as exploitable today — not theoretical.

## 2026 Best Practices (Infrastructure category)

The landscape shifted materially between 2023 and 2026. Several tools that were standard in earlier guidance are now deprecated or archived; the recommendations below reflect the current state.

### State, locking, and backends

- **Remote state with locking is non-negotiable.** Local state in a shared repo is a critical finding (state leakage, no concurrency safety, no audit trail). Required backends:
  - **AWS** — S3 with native state locking (Terraform 1.10+ / OpenTofu 1.8+ support S3-native locking via `use_lockfile = true`; the previously-mandatory DynamoDB table is no longer required, though still supported for older versions). Enforce SSE-KMS + bucket versioning + block-public-access.
  - **GCP** — `gcs` backend with CMEK encryption and object versioning.
  - **Azure** — `azurerm` backend on Storage with blob lease locking + customer-managed key.
  - **HCP Terraform / Terraform Enterprise / Spacelift / env0 / Scalr** — managed backends with built-in locking and RBAC.
- **State file encryption.** OpenTofu 1.7+ supports native state encryption (incl. remote state) — use when storing in any backend that doesn't already encrypt at rest with KMS/CMEK.
- **Drift detection on a schedule.** Run `terraform plan` (or `tofu plan`) on a 4–6 hour or nightly cadence in read-only mode; non-empty diff = alert. HCP Terraform, Spacelift, env0, Scalr, and Atlantis all expose scheduled drift detection. Drift caught early prevents the "we can't apply, every plan shows a 200-line diff" failure mode.

### Versioning, pinning, modules

- **Explicit version pins on Terraform/OpenTofu, providers, and modules.** `required_version = ">= 1.10.0"`, `required_providers { aws = { source = "hashicorp/aws", version = "~> 5.70" } }`, and modules pinned by tag (`ref=v3.2.1`) — never `ref=main`. Floating versions are reproducibility bugs.
- **Lockfile committed.** `.terraform.lock.hcl` must be in source control and CI must run `terraform init -lockfile=readonly` to fail on drift.
- **Tofu/Terraform parity.** If the project supports both, pin both `required_version` ranges and run CI matrix.

### Plan / apply guardrails

- **Plan-before-apply in CI.** Plan runs on every PR, apply only runs on merge to the protected branch, with a required human approver. Atlantis is the OSS reference implementation; Spacelift, env0, HCP Terraform, Scalr are the managed equivalents. Plain `terraform apply` in CI without a plan-review gate is a critical finding.
- **Policy-as-code gate.** OPA/Conftest, Sentinel (HCP Terraform), or Spacelift policies block applies that violate org rules (untagged resources, oversized instances, public buckets, missing encryption). At minimum: tag-compliance policy, no-public-storage policy, encryption-required policy.
- **Cost gate.** Infracost in PR diffs; build fails on cost regressions above threshold. Pair with [[cloud-cost-analyzer]].

### Language idioms

- **Prefer `for_each` over `count` for resource sets.** `count` uses positional indexing — removing item 0 from a 5-element list re-indexes and destroys/recreates items 1–4. `for_each` uses stable map/set keys — removing one item only affects that one item. Use `count` only for the `count = var.enabled ? 1 : 0` toggle idiom.
- **Dynamic blocks only inside a single resource.** Dynamic blocks repeat nested blocks (e.g., multiple `ingress` blocks on one security group). Don't use dynamic blocks to repeat whole resources — use `for_each` on the resource itself.
- **Sensitive variables marked.** `variable "db_password" { type = string, sensitive = true }` — prevents accidental log/output leakage. Hardcoded secrets in `variable.default`, `locals`, or `*.tfvars` files in the repo are a critical finding regardless of marking.
- **Secrets via managed stores only.** HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, SOPS-encrypted YAML. The Terraform code reads at apply-time; the secret value never lands in `.tf` or in the plan output cleartext (use `sensitive = true` on the data source output to be safe).

### Cloud-specific bare minimums

- **AWS** — S3 buckets need `aws_s3_bucket_public_access_block`, `aws_s3_bucket_server_side_encryption_configuration`, `aws_s3_bucket_versioning`. Security groups: no `0.0.0.0/0` on 22/3389/3306/5432/6379/27017. IAM: no `Action = "*"` or `Resource = "*"` on a `Allow`. EBS/RDS/EFS: encryption-at-rest required. CloudTrail in every account, multi-region.
- **GCP** — IAM bindings: no `roles/owner` or `roles/editor` to a `member` outside org-trusted SAs. GCS buckets: uniform bucket-level access, no `allUsers`/`allAuthenticatedUsers`. Cloud SQL: no public IP, require SSL. VPC firewall: no `0.0.0.0/0` on SSH/RDP.
- **Azure** — Storage accounts: `allow_blob_public_access = false`, `min_tls_version = "TLS1_2"`. NSG rules: no `Internet → *` on management ports. Key Vault: purge protection + soft-delete on.
- **Cloudflare** — Zone-level WAF on, DNSSEC on, `always_use_https = true` on the zone settings, no wildcard API tokens (pin to specific zones/accounts).
- **Kubernetes (via Terraform Kubernetes/Helm providers)** — no privileged pods, non-root user, read-only root FS, resource requests+limits, NetworkPolicy denying all by default.
- **Vercel** — `passwordProtection` on preview deployments handling internal data; environment variables marked sensitive; framework version pinned.

### OpenTofu vs Terraform decision (2026)

- **Licensing.** Terraform 1.6+ ships under BSL 1.1 (not OSI-approved). OpenTofu forked from Terraform 1.5.x and ships under MPL 2.0 (OSI-approved). IBM acquired HashiCorp in 2025 — BSL terms unchanged but worth tracking.
- **Compatibility.** OpenTofu preserves HCL syntax, the provider protocol, the state model, and the common command surface. Most modules work unchanged. Some HashiCorp-proprietary features (Sentinel) are HCP-only.
- **OpenTofu-only features.** Native state encryption (incl. remote state), early-evaluation variables for backend config, additional functions.
- **Decision rubric.** If you depend on Terraform Cloud / Sentinel / HashiCorp commercial features → Terraform. If you want OSI-licensed tooling, CNCF governance, or state encryption → OpenTofu. If unsure, OpenTofu is the lower-lock-in default for new projects; this skill flags `tofu` and `terraform` invocations identically.

## Tool Integration (2026)

The IaC scanning landscape has consolidated. The tools below reflect status as of 2026.

| Tool | Status (2026) | What it is | When to use |
|------|---------------|-----------|-------------|
| **Checkov** | Active, primary | 1000+ Terraform-specific policies; graph-based cross-resource checks; multi-IaC (Terraform, CFN, K8s, ARM, Bicep, Ansible, Dockerfile, Helm) | Default scanner in CI |
| **Trivy** | Active, primary | Absorbed tfsec's rules in 2023 (tfsec deprecated, transition completed 2024); single binary also scans containers, deps, secrets | Default when you also need container/dep scanning in the same step |
| **KICS** | Active | 2400+ Rego queries across 22+ IaC platforms; breadth-first | When you need the widest platform coverage |
| **tfsec** | **Deprecated** | Folded into Trivy | Do not adopt for new projects — use Trivy |
| **Terrascan** | **Archived (Nov 2025)** | Was Rego-based with 500+ policies | Do not adopt — migrate to Checkov or Trivy |
| **TFLint** | Active, complementary | Linter (deprecated args, provider-specific validation, instance-type checks) — NOT a security-first scanner | Always run alongside a real security scanner |
| **Conftest / OPA** | Active | Run org Rego policies against `terraform show -json` plan output | Org-specific guardrails (tagging, allowed instance types, allowed regions) |
| **Infracost** | Active | Cost diff per PR | Cost-as-policy gate |
| **Atlantis** | Active (OSS) | PR-driven plan/apply, runs in your infra; state-locking via backend | OSS PR automation; requires its own hardening (HTTPS, secrets, RBAC) |
| **Spacelift / env0 / Scalr / HCP Terraform** | Active (managed) | Managed plan/apply, RBAC, policy-as-code, drift detection, cost estimation | Buy-vs-build for orchestration; pick on policy engine and lock-in tolerance |
| **OpenTofu** | Active, CNCF | MPL-licensed Terraform fork | New projects unless you need HashiCorp commercial features |

### Commands

```bash
# Syntax + format (works for both terraform and tofu)
terraform init -backend=false -lockfile=readonly
terraform validate
terraform fmt -check -recursive
# OpenTofu equivalent
tofu init -backend=false -lockfile=readonly && tofu validate && tofu fmt -check -recursive

# Lint
tflint --init
tflint --recursive --format=json --enable-rule=terraform_required_version --enable-rule=terraform_required_providers

# Security — Checkov (primary)
checkov -d . --framework terraform --output sarif --output-file-path checkov.sarif
checkov -d . --framework terraform_plan --file plan.json   # scan the plan, not just source

# Security — Trivy (covers what tfsec used to)
trivy config . --format sarif --output trivy.sarif --severity HIGH,CRITICAL

# Breadth — KICS (when needed)
docker run -v "$PWD":/path checkmarx/kics scan -p /path -o /path -f sarif

# Policy-as-code — OPA / Conftest on the plan JSON
terraform plan -out tfplan.binary
terraform show -json tfplan.binary > tfplan.json
conftest test --policy policies/ tfplan.json

# Cost gate
infracost breakdown --path . --format json --out-file infracost.json
infracost diff --path . --compare-to main --format github-comment
```

## 7-language coverage

Terraform IS the language — the canonical surface is HCL. Below are HCL examples across the major cloud sub-providers, plus how Terraform is driven from CI in TS/Python/Java/C#. C, C++, and SQL get a rationale instead of code: IaC is not authored in those languages; the CLI is the integration surface, and `Bash` already covers it.

### HCL — AWS

```hcl
# BAD: local backend in a shared repo, no encryption, no versioning
terraform {
  backend "local" { path = "terraform.tfstate" }   # leaks state into git/CI cache
  required_providers { aws = { source = "hashicorp/aws" } }   # no version pin
}

resource "aws_s3_bucket" "data" {
  bucket = "my-app-data"                            # no random suffix → squat risk on import
}
# missing: public_access_block, encryption, versioning

resource "aws_iam_policy" "admin" {
  policy = jsonencode({
    Statement = [{ Effect = "Allow", Action = "*", Resource = "*" }]   # critical — root-equivalent
  })
}

resource "aws_security_group" "db" {
  ingress { from_port = 5432; to_port = 5432; protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
}

variable "db_password" { default = "ChangeMe123!" }   # hardcoded secret, not sensitive

resource "aws_instance" "web" {
  count         = length(var.instance_names)         # count over set → re-indexing destroys neighbors
  instance_type = "t3.medium"
  ami           = "ami-0abc"                          # AMI not pinned to digest / SSM lookup
}
```

```hcl
# SAFE
terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws    = { source = "hashicorp/aws",    version = "~> 5.70" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {
    bucket         = "tfstate-prod-acme-7fa3"
    key            = "core/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/tfstate"
    use_lockfile   = true                             # native S3 locking, TF 1.10+ / Tofu 1.8+
  }
}

resource "random_id" "suffix" { byte_length = 4 }

resource "aws_s3_bucket" "data" {
  bucket = "my-app-data-${random_id.suffix.hex}"
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_iam_policy" "data_rw" {
  policy = jsonencode({
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]
      Resource = "${aws_s3_bucket.data.arn}/*"
    }]
  })
}

variable "db_password" {
  type      = string
  sensitive = true                                    # never logged in plan output
  # no default — value comes from Vault / Secrets Manager / TF_VAR_* at apply time
}

resource "aws_instance" "web" {
  for_each      = toset(var.instance_names)           # stable identity per name
  instance_type = "t3.medium"
  ami           = data.aws_ssm_parameter.al2023.value # resolved at plan time, pinned chain
  tags = {
    Name        = each.key
    Environment = var.env
    Owner       = var.owner
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
  }
}
```

### HCL — GCP

```hcl
# BAD
resource "google_storage_bucket" "public" {
  name     = "my-public-data"
  location = "US"
}
resource "google_storage_bucket_iam_member" "anyone" {
  bucket = google_storage_bucket.public.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"                                  # critical — world-readable
}
resource "google_project_iam_member" "owner" {
  project = var.project_id
  role    = "roles/owner"                              # critical — root-equivalent
  member  = "user:dev@example.com"
}
```

```hcl
# SAFE
resource "google_storage_bucket" "data" {
  name                        = "data-${var.project_id}-${random_id.suffix.hex}"
  location                    = "US"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning { enabled = true }
  encryption { default_kms_key_name = google_kms_crypto_key.data.id }
}

resource "google_project_iam_member" "data_writer" {
  project = var.project_id
  role    = "roles/storage.objectCreator"              # least privilege
  member  = "serviceAccount:${google_service_account.uploader.email}"
}
```

### HCL — Azure

```hcl
# BAD
resource "azurerm_storage_account" "sa" {
  name                            = "myappstoragepub"
  resource_group_name             = azurerm_resource_group.rg.name
  location                        = azurerm_resource_group.rg.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  allow_nested_items_to_be_public = true                 # critical — public blob containers
  min_tls_version                 = "TLS1_0"             # weak crypto
}
```

```hcl
# SAFE
resource "azurerm_storage_account" "sa" {
  name                            = "stappprod${random_string.suffix.result}"
  resource_group_name             = azurerm_resource_group.rg.name
  location                        = azurerm_resource_group.rg.location
  account_tier                    = "Standard"
  account_replication_type        = "GZRS"
  allow_nested_items_to_be_public = false
  min_tls_version                 = "TLS1_2"
  shared_access_key_enabled       = false                # force AAD auth
  public_network_access_enabled   = false                # private endpoint only
  blob_properties { versioning_enabled = true }
}
```

### HCL — Cloudflare

```hcl
# BAD: API token with account-wide write, no zone scope
provider "cloudflare" { api_token = "PLACEHOLDER_BROAD_TOKEN" }
resource "cloudflare_zone_settings_override" "z" {
  zone_id = var.zone_id
  settings { always_use_https = "off"; min_tls_version = "1.0" }   # downgrade attack surface
}

# SAFE: zone-scoped token from a secrets manager, hardened settings
provider "cloudflare" { api_token = data.vault_kv_secret_v2.cf.data["zone_scoped_token"] }
resource "cloudflare_zone_settings_override" "z" {
  zone_id = var.zone_id
  settings {
    always_use_https           = "on"
    min_tls_version            = "1.2"
    automatic_https_rewrites   = "on"
    opportunistic_encryption   = "on"
    security_level             = "medium"
    browser_check              = "on"
    ssl                        = "strict"
  }
}
```

### HCL — Kubernetes provider

```hcl
# BAD: privileged + root + no limits
resource "kubernetes_deployment_v1" "app" {
  metadata { name = "app" }
  spec {
    selector { match_labels = { app = "app" } }
    template {
      metadata { labels = { app = "app" } }
      spec {
        container {
          name  = "app"
          image = "registry.example.com/app:latest"               # mutable tag
          security_context { privileged = true; run_as_user = 0 } # critical
        }
      }
    }
  }
}

# SAFE: non-root, read-only fs, resource bounds, immutable image digest
resource "kubernetes_deployment_v1" "app" {
  metadata { name = "app" }
  spec {
    selector { match_labels = { app = "app" } }
    template {
      metadata { labels = { app = "app" } }
      spec {
        automount_service_account_token = false
        container {
          name  = "app"
          image = "registry.example.com/app@sha256:PLACEHOLDER_DIGEST"
          security_context {
            run_as_non_root            = true
            run_as_user                = 10001
            read_only_root_filesystem  = true
            allow_privilege_escalation = false
            capabilities { drop = ["ALL"] }
          }
          resources {
            requests = { cpu = "100m", memory = "128Mi" }
            limits   = { cpu = "500m", memory = "512Mi" }
          }
        }
      }
    }
  }
}
```

### HCL — Vercel provider

```hcl
# BAD: framework drifts on every apply, env var stored as plaintext default
resource "vercel_project" "app" {
  name      = "app"
  framework = null                                       # auto-detect → drifts
  environment = [{
    key    = "STRIPE_SECRET_KEY"
    value  = "sk_live_PLACEHOLDER_HARDCODED_KEY"         # critical
    target = ["production"]
  }]
}

# SAFE: framework pinned, secret marked sensitive, value sourced from secrets manager
resource "vercel_project" "app" {
  name      = "app"
  framework = "nextjs"
  environment = [{
    key       = "STRIPE_SECRET_KEY"
    value     = data.vault_kv_secret_v2.stripe.data["secret_key"]
    target    = ["production"]
    sensitive = true
  }]
}
```

### Driving Terraform from CI — TypeScript (Node), Python, Java, C#

The Terraform / OpenTofu CLI is the integration surface. Use a runner wrapper around `terraform plan` → `terraform show -json` → policy gate → `terraform apply`. Below: minimal hardening patterns.

```typescript
// CI driver — TypeScript (Node 22+). Used in GitHub Actions or a custom runner.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
const run = promisify(execFile);

async function plan(dir: string): Promise<{ resourceChanges: unknown[] }> {
  // SAFE: arg array, no shell, explicit lockfile readonly
  await run("terraform", ["init", "-input=false", "-lockfile=readonly"], { cwd: dir });
  await run("terraform", ["validate"], { cwd: dir });
  await run("terraform", ["plan", "-input=false", "-out=tfplan.bin"], { cwd: dir });
  const { stdout } = await run("terraform", ["show", "-json", "tfplan.bin"], {
    cwd: dir,
    maxBuffer: 64 * 1024 * 1024,
  });
  await unlink(`${dir}/tfplan.bin`).catch(() => {});
  return JSON.parse(stdout);
}
// BAD pattern to never write:
//   exec(`terraform apply -auto-approve ${userSuppliedDir}`)   // shell injection + no plan gate
```

```python
# CI driver — Python 3.12+
import json, subprocess, pathlib

def plan(workdir: pathlib.Path) -> dict:
    base = ["terraform", "-chdir", str(workdir)]
    # SAFE: argv list, no shell=True
    subprocess.run(base + ["init", "-input=false", "-lockfile=readonly"], check=True)
    subprocess.run(base + ["validate"], check=True)
    subprocess.run(base + ["plan", "-input=false", "-out=tfplan.bin"], check=True)
    out = subprocess.run(base + ["show", "-json", "tfplan.bin"],
                        check=True, capture_output=True, text=True)
    return json.loads(out.stdout)

# Gate the apply on policy + cost
# subprocess.run(["conftest", "test", "--policy", "policies/", "tfplan.json"], check=True)
# subprocess.run(["infracost", "diff", "--path", str(workdir)], check=True)
```

```java
// CI driver — Java 21, ProcessBuilder (no shell)
import java.nio.file.*;
import java.util.*;

public final class TerraformRunner {
  public static int plan(Path dir) throws Exception {
    runChecked(dir, "terraform", "init", "-input=false", "-lockfile=readonly");
    runChecked(dir, "terraform", "validate");
    runChecked(dir, "terraform", "plan", "-input=false", "-out=tfplan.bin");
    return runChecked(dir, "terraform", "show", "-json", "tfplan.bin");
  }
  private static int runChecked(Path dir, String... argv) throws Exception {
    Process p = new ProcessBuilder(argv).directory(dir.toFile()).inheritIO().start();
    int rc = p.waitFor();
    if (rc != 0) throw new RuntimeException(argv[0] + " " + argv[1] + " exit=" + rc);
    return rc;
  }
}
// A Maven plugin (e.g., terraform-maven-plugin) is an alternative; either way, no shell concatenation.
```

```csharp
// CI driver — C# / .NET 9, System.Diagnostics.Process with ArgumentList (no shell)
using System.Diagnostics;
public static class TerraformRunner {
  public static async Task PlanAsync(string dir) {
    await RunAsync(dir, "init", "-input=false", "-lockfile=readonly");
    await RunAsync(dir, "validate");
    await RunAsync(dir, "plan", "-input=false", "-out=tfplan.bin");
    await RunAsync(dir, "show", "-json", "tfplan.bin");
  }
  private static async Task RunAsync(string dir, params string[] args) {
    var psi = new ProcessStartInfo("terraform") {
      WorkingDirectory = dir,
      UseShellExecute = false,                // never shell
      RedirectStandardOutput = true,
    };
    foreach (var a in args) psi.ArgumentList.Add(a);   // SAFE: argv list
    using var p = Process.Start(psi)!;
    await p.WaitForExitAsync();
    if (p.ExitCode != 0) throw new Exception($"terraform {args[0]} exit={p.ExitCode}");
  }
}
```

### Skipped languages — C, C++, SQL

- **C / C++** — Not used to author IaC. Where C/C++ code touches infrastructure, it does so through the cloud SDKs at runtime, which is outside this skill's scope (covered by [[sast-scanner]] + cloud-SDK auditing). The integration surface to Terraform is the CLI — already covered by the Bash and CI-driver examples above.
- **SQL** — Not used to author IaC. Database schema-as-code is a separate domain (Flyway, Liquibase, sqitch). Terraform may provision the database; schema migrations are a follow-on step.

## Categories (auto-flagged)

| Category | Trigger | Severity (triage) |
|----------|---------|-------------------|
| Unlocked or local state | `backend "local"`; missing `use_lockfile`/`dynamodb_table`/managed-backend equivalent | CRITICAL |
| Missing provider version pin | `required_providers` missing `version`, or `version = ">= 0"` | HIGH |
| Missing terraform/tofu version pin | `required_version` absent | HIGH |
| Hardcoded secrets | Secret-shaped string in `variable.default`, `locals`, `*.tfvars` in repo, env-var defaults | CRITICAL |
| `count` over a non-toggle set | `count = length(var.list)` where the list has stable identities (use `for_each`) | MEDIUM |
| Missing drift detection | No scheduled `plan` workflow / no managed-backend drift feature enabled | HIGH |
| Missing plan review gate | CI runs `apply` without a separate plan + human approval | CRITICAL |
| Missing tagging policy | Resources with required-tag-set incomplete; no Conftest tag policy in repo | MEDIUM |
| Public S3 (or equivalent) by default | Missing public-access-block / equivalent on storage | CRITICAL |
| Overly permissive IAM | `Action = "*"` + `Resource = "*"` on `Allow`, or `roles/owner` / `Owner` role grant | CRITICAL |
| 0.0.0.0/0 on sensitive ports | Ingress on 22/3389/3306/5432/6379/27017 from anywhere | CRITICAL |
| Unencrypted storage | EBS / RDS / S3 / GCS / Azure blob without encryption | HIGH |
| Mutable image tag in K8s/Vercel/runtime | `:latest` or no digest pin | HIGH |
| Floating module ref | `ref=main` / no `?ref=` on `git::` source | MEDIUM |
| Untagged resource | Missing Environment / Owner / CostCenter / ManagedBy tags | MEDIUM |
| Deprecated provider arg | TFLint deprecated-arg rule fires | HIGH (warnings-are-bugs) |
| tfsec / Terrascan still in pipeline | Pipeline references deprecated/archived tool | MEDIUM |

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule. The triage tiers stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|-------------|----------|-----------------|
| CRITICAL | Public buckets, `Action="*"`, hardcoded secrets, local state in shared repo, 0.0.0.0/0 on DB ports, missing plan-review gate | BLOCK |
| HIGH | Unencrypted storage, missing version pins, missing drift detection, mutable image tags, deprecated provider args | BLOCK |
| MEDIUM | `count` over identity-bearing sets, untagged resources, floating module refs, missing tag policy | Fix soon |
| LOW | Style / `terraform fmt` issues only | Backlog |

## Letter schema (refinement-loop output contract)

```yaml
finding_id: <sha256(critic+file+line+rule)[:12]>     # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = corroborated; low = single-tool unverified
engine: checkov | trivy | kics | tflint | conftest | manual
kind: state_unlocked | provider_version_unpinned | hardcoded_secret | count_over_set
      | drift_detection_missing | plan_gate_missing | tagging_policy_missing
      | public_storage_default | iam_overly_permissive | open_port_world
      | unencrypted_storage | mutable_image_tag | module_ref_floating
      | deprecated_tool | other
rule_id: <tool rule id, e.g. CKV_AWS_19>
corroborated_by: [<other engines that also flagged this>]  # empty list if single-source
target_file: infra/storage.tf
line: 12
resource_type: aws_s3_bucket | aws_iam_policy | google_storage_bucket | azurerm_storage_account | ...
resource_address: aws_s3_bucket.data
provider: aws | gcp | azure | cloudflare | kubernetes | vercel | other
message: "S3 bucket aws_s3_bucket.data is missing public-access-block and SSE-KMS configuration."
suggested_fix: |
  Add aws_s3_bucket_public_access_block with all four flags = true,
  aws_s3_bucket_server_side_encryption_configuration with KMS,
  and aws_s3_bucket_versioning. See SKILL exemplar in the AWS section.
reference: https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
```

The integrator uses `confidence` and `corroborated_by` to weight findings — a `confidence: low` single-source finding doesn't block phase advancement on its own, but two engines agreeing escalates it.

## Red Lines

- NEVER allow `Action = "*"` + `Resource = "*"` on an `Allow` IAM policy.
- NEVER allow `backend "local"` in a shared repository.
- NEVER allow hardcoded secrets in `variable.default`, `locals`, or `*.tfvars` checked into the repo.
- NEVER allow `apply` in CI without a separate `plan` + human approval gate.
- NEVER allow a public storage default (S3 / GCS / Azure Blob) without an explicit public-access block.
- NEVER recommend tfsec or Terrascan for new pipelines — both are end-of-life as of 2026 (tfsec folded into Trivy; Terrascan archived Nov 2025).
- NEVER let `count` be used over an identity-bearing collection where `for_each` is correct.
- NEVER let a deprecation warning ship "for later" — warnings are bugs.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
