---
name: ci-pipeline-checker
description: Validates CI/CD pipelines for supply chain security and 2026 best practices.
type: skill
when_to_load:
  - "CI pipeline check"
  - "ci/cd validation"
  - "github actions audit"
  - "gitlab ci review"
  - "pipeline security"
  - "ci pipeline"
related_skills:
  - infrastructure/ci-runner-setup
  - infrastructure/docker-security-checker
  - security/secrets-detector
  - security/security-scanner
effort_level: medium
model_optimized_for: opus-4-7
tools: Read, Grep, Bash
model: sonnet
---

# CI Pipeline Checker (skill)

> Converted from agents/infrastructure/ci-pipeline-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate CI/CD pipeline configurations (GitHub Actions, GitLab CI, CircleCI, etc.) for security, best practices, and efficiency.

## 2026 Best Practices (Infrastructure category)

- **Shift-left supply chain security**: actions pinned to SHA (not floating tags), reusable workflows reviewed, third-party actions allowlisted at the org level.
- **Least-privilege permissions**: `permissions:` block on every job; `GITHUB_TOKEN` scoped to read-only by default. No `write-all`.
- **Secrets via managed stores only**: GitHub Actions environments + protection rules; no secrets in plain `env`/`run`.
- **Container image scan + SAST + SCA integrated**: every PR runs Trivy/Grype, Semgrep/CodeQL, and dependency audit. Failures BLOCK merge.
- **OIDC over long-lived credentials**: cloud auth (AWS/GCP/Azure) via OIDC federation, not static keys.
- **Concurrency control + timeouts**: every job has `timeout-minutes`; `concurrency: { cancel-in-progress: true }` on PR workflows.

## Commands

### GitHub Actions
```bash
actionlint .github/workflows/*.yml
```

### GitLab CI
```bash
gitlab-ci-lint .gitlab-ci.yml
```

## Security Checks

### Critical
- Secrets hardcoded in workflow files
- Actions referenced by floating tag (`@v4` instead of SHA)
- `permissions: write-all` or missing `permissions:` block
- Dangerous commands (`eval`, `curl | bash`, `wget | sh`)
- Secrets echoed in `run:` blocks
- Long-lived cloud credentials (use OIDC instead)
- Third-party actions not in org allowlist

### Best Practices
- Dependency caching configured
- Matrix testing across language versions
- Parallel jobs where dependencies allow
- `timeout-minutes` on every job
- Artifacts uploaded for failed runs
- SBOM uploaded alongside release artifacts

## Common Issues

### Unpinned Actions
```yaml
# BAD
- uses: actions/checkout@v4

# GOOD - SHA + version comment
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1
```

### Overly Permissive Permissions
```yaml
# BAD
permissions: write-all

# GOOD
permissions:
  contents: read
  pull-requests: write
```

### Secrets in Commands
```yaml
# BAD
- run: echo ${{ secrets.API_KEY }}

# GOOD
- run: some-command
  env:
    API_KEY: ${{ secrets.API_KEY }}
```

### Missing Timeout
```yaml
# GOOD
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - run: npm test
```

### OIDC vs Long-Lived Keys
```yaml
# GOOD - OIDC federation, no static AWS keys
permissions:
  id-token: write
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@<sha>
    with:
      role-to-assume: arn:aws:iam::123:role/ci-deploy
      aws-region: us-east-1
```

## Output Format

```markdown
## CI Pipeline Report

### Files Analyzed
| File | Platform |
|------|----------|
| .github/workflows/ci.yml | GitHub Actions |
| .github/workflows/deploy.yml | GitHub Actions |

### Security Issues
| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 3 |

**Issues:**
1. **Action not pinned to SHA** (High) — `ci.yml:15`
2. **Overly permissive permissions** (High) — `deploy.yml:8`
3. **No timeout configured** (Medium) — `ci.yml` job `test`

### Best Practices
| Check | Status |
|-------|--------|
| Dependency caching | Not configured |
| Matrix testing | Single version only |
| Concurrency control | Not configured |
| Timeouts | 1 of 3 jobs |

### Recommendations
1. Pin all actions to SHA
2. Add dependency caching
3. Add `timeout-minutes` to all jobs
4. Add concurrency control on PR workflow
5. Migrate cloud auth to OIDC
```

## Red Lines

- NEVER allow `permissions: write-all`
- NEVER allow floating action tags on default branch
- NEVER allow plaintext secrets in workflow files
- NEVER allow `curl | bash` patterns
