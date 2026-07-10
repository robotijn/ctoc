# Terraform CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses local state — use remote state with locking
- Claude hardcodes values — use variables with validation
- Claude forgets `moved` blocks — prevents destroy on rename
- Claude uses `terraform apply -auto-approve` in prod — never

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `opentofu` / `terraform` | IaC engine | Manual infra |
| `terragrunt` or `terramate` | Orchestration, DRY | Monolithic configs |
| `tflint` | Linting | Just validate |
| `checkov` / `tfsec` | Security scanning | No security checks |
| `infracost` | Cost estimation | Surprise bills |

## Patterns Claude Should Use
```hcl
# Remote state with locking
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "prod/network/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

# Variable validation
variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

# Moved blocks prevent destroy on rename
moved {
  from = aws_instance.old_name
  to   = aws_instance.new_name
}

# Pin provider versions
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

## Anti-Patterns Claude Generates
- Local state in production — use remote with locking
- Hardcoded values — use variables with validation
- `-auto-approve` in prod — always review plans
- No `moved` blocks — causes accidental destroys
- Large monolithic state — split by component/env

## Plan/Apply Lifecycle & State Footguns
Terraform's "concurrency-equivalent" surface is the plan → apply lifecycle over shared
state and a parallel resource graph. The state file is the single source of truth and the
single point of failure.

- **State locking.** Two concurrent `apply`s against the same unlocked state corrupt it. Use
  a remote backend that locks (S3 with a lock, or the newer S3 native `use_lockfile`;
  Terraform Cloud/HCP; GCS). Never share a local `terraform.tfstate`.
- **Drift.** Real infrastructure changed out-of-band (a console edit, another tool) and no
  longer matches state. `terraform plan` detects drift; run it in CI so surprises surface
  before `apply`.
- **Always `plan` before `apply`.** Review the plan; the resource graph runs many resources
  in **parallel** (`-parallelism=N`), so an ambiguous change can destroy/recreate more than
  you expect.
- **`-target` is a footgun**, not a workflow. It applies a subset and leaves state partially
  reconciled; reserve it for break-glass recovery.

```hcl
# Remote backend with locking (S3 native lockfile, Terraform 1.10+/OpenTofu)
terraform {
  backend "s3" {
    bucket       = "my-tf-state"
    key          = "prod/network/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true          # encrypt state at rest
    use_lockfile = true          # state locking without a separate lock table
  }
}
```

## Error Handling / Safety Idioms
- **`precondition` / `postcondition`** (in `lifecycle`) and top-level **`check`** blocks
  assert invariants during plan/apply — fail fast with a message instead of provisioning
  something broken.
- **`terraform validate`** catches config errors before any provider call; run it and
  `terraform fmt -check` in CI.
- **`lifecycle { prevent_destroy = true }`** guards stateful resources (databases, buckets)
  against an accidental destroy in the plan.
- **Never `-auto-approve` in prod** — a human reviews the plan.

```hcl
resource "aws_db_instance" "main" {
  # ...
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.environment != "prod" || var.multi_az
      error_message = "Production databases must be multi-AZ."
    }
  }
}
```

## Security and Dependency Gotchas
- **Secrets in the state file are stored in plaintext — CWE-312 (Cleartext Storage of
  Sensitive Information).** Every attribute Terraform manages (DB passwords, private keys,
  generated tokens) is written to state *in cleartext*, regardless of `sensitive = true`
  (which only redacts CLI *output*, not state). Mitigate: encrypt the backend
  (`encrypt = true`, KMS, or OpenTofu's native state encryption), lock down access to the
  state bucket, and **never commit `terraform.tfstate` to git**.
- **Pin provider and module versions.** An unpinned `~>` or a floating module ref is a
  supply-chain risk — a new provider release can change behavior or be compromised. Pin with
  a version constraint *and* commit `.terraform.lock.hcl`.
- **Scan configs with policy-as-code**: **tfsec**, Checkov, or Sentinel/OPA in CI to catch
  open security groups, unencrypted volumes, and public buckets before apply.

```hcl
terraform {
  required_version = "~> 1.15"
  required_providers {
    aws = { source = "hashicorp/aws", version = "5.100.0" }  # exact pin
  }
}
# Commit .terraform.lock.hcl and run: tfsec .   /   checkov -d .
```

## Testing Conventions
- **`terraform test`** (native, `*.tftest.hcl`) runs `run` blocks with `assert` conditions
  against a real or mocked plan/apply — no external framework needed.
- **Terratest** (Go) drives full apply/verify/destroy cycles for integration tests.
- **`tflint`** catches provider-specific mistakes and deprecated syntax that `validate`
  misses.

```hcl
# main.tftest.hcl
run "environment_is_validated" {
  command = plan
  variables { environment = "prod" }
  assert {
    condition     = aws_db_instance.main.multi_az == true
    error_message = "prod DB must be multi-AZ"
  }
}
```

## Performance / Correctness Traps
- **`count` vs `for_each`.** `count` indexes resources by position, so **removing or
  reordering an element in the list shifts every later index — Terraform destroys and
  recreates the shifted resources.** Prefer **`for_each`** over a map/set: resources are
  keyed by a stable string, so adding/removing one leaves the rest untouched.
- **Large monolithic state** slows every plan (refreshes every resource) and widens the blast
  radius; split state by component/environment.
- **Deep module nesting** obscures the plan and multiplies provider refresh cost.

```hcl
# FRAGILE — remove "web" from the list and "api"/"db" get recreated
resource "aws_instance" "srv" {
  count = length(var.names)          # keyed by index 0,1,2...
  tags  = { Name = var.names[count.index] }
}

# STABLE — keyed by name; removing "web" only destroys "web"
resource "aws_instance" "srv" {
  for_each = toset(var.names)
  tags     = { Name = each.key }
}
```

## Version-Specific Gotchas
- **Terraform 1.15.x is current** (source: https://endoflife.date/terraform, retrieved
  2026-07-10). Set `required_version` to pin the CLI.
- **License / fork context:** HashiCorp relicensed Terraform from MPL 2.0 to the **Business
  Source License 1.1 (BUSL-1.1)** in 2023 (LICENSE `Change License: MPL 2.0`, verified at
  https://github.com/hashicorp/terraform/blob/main/LICENSE, retrieved 2026-07-10). The
  community fork **OpenTofu** stays **MPL 2.0** (verified at
  https://github.com/opentofu/opentofu/blob/main/LICENSE, retrieved 2026-07-10); OpenTofu
  1.12.x is current (https://endoflife.date/opentofu, retrieved 2026-07-10) and adds native
  state encryption. Confirm which engine your org is licensed to use.
- **State isolation**: separate state per env and component.
- **Modules**: for reuse and abstraction — pinned, reviewed.
- **Teams**: peer-review every plan before apply.

## References
- Terraform release/support — https://endoflife.date/terraform (retrieved 2026-07-10)
- OpenTofu release/support — https://endoflife.date/opentofu (retrieved 2026-07-10)
- Terraform LICENSE (BUSL-1.1) — https://github.com/hashicorp/terraform/blob/main/LICENSE (retrieved 2026-07-10)
- OpenTofu LICENSE (MPL 2.0) — https://github.com/opentofu/opentofu/blob/main/LICENSE (retrieved 2026-07-10)
- CWE-312 Cleartext Storage of Sensitive Information — https://cwe.mitre.org/data/definitions/312.html (CWE 4.20, retrieved 2026-07-10)
