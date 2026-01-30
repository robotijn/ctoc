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

## Version Gotchas
- **OpenTofu 1.8+**: State encryption, early variable evaluation
- **OpenTofu**: Drop-in replacement, MPL 2.0 license
- **State isolation**: Separate state per env and component
- **Modules**: Use for reusability and abstraction
- **With teams**: Peer review all plans before apply
