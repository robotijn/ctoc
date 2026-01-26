# Terraform CTO
> Infrastructure as Code expert.

## Tools (2024-2025)
- **OpenTofu** - Open source alternative
- **Terragrunt** - DRY configurations
- **tflint** - Linting
- **Checkov** - Security scanning
- **Infracost** - Cost estimation

## Non-Negotiables
1. Remote state with locking
2. Workspaces or directory structure for environments
3. Module composition
4. Variable validation
5. Proper state management

## Red Lines
- Secrets in state/code
- Local state in production
- Hardcoded values
- Missing resource dependencies
- No plan before apply
- Terraform apply -auto-approve in production
