# Secrets Detection - Credentials and API Key Scanning
> Claude Code security correction guide. Updated February 2026.

## Why Secrets Detection is Critical

Hardcoded secrets are the #1 cause of data breaches. Once a secret is pushed to Git, it's in the reflog forever. Even "deleted" commits are recoverable. **Assume any secret that touched Git is compromised.**

### Types of Secrets to Detect
- API keys (AWS, GCP, Azure, Stripe, etc.)
- Database credentials
- OAuth tokens and secrets
- Private keys (SSH, TLS, signing)
- JWT signing secrets
- Encryption keys
- Service account credentials
- Webhook secrets
- Internal URLs with embedded auth

## Recommended Tools

### TruffleHog (RECOMMENDED - Most Comprehensive)

**Why TruffleHog**: 800+ secret detectors, verification against live APIs, Git history scanning, fastest updates for new secret types.

```bash
# Installation
brew install trufflehog
# or
docker pull trufflesecurity/trufflehog:latest

# Scan current directory (filesystem)
trufflehog filesystem .

# Scan Git repository (includes history)
trufflehog git file://.
trufflehog git https://github.com/org/repo.git

# Scan with verification (RECOMMENDED - proves secrets are live)
trufflehog git file://. --only-verified

# Scan specific commit range
trufflehog git file://. --since-commit=abc123
trufflehog git file://. --branch=main

# Scan GitHub organization (requires token)
trufflehog github --org=myorg --token=$GITHUB_TOKEN

# Scan S3 bucket
trufflehog s3 --bucket=mybucket

# Output formats
trufflehog git file://. --json > results.json
trufflehog git file://. --json | jq '.SourceMetadata.Data.Git'

# CI mode (exit code based on findings)
trufflehog git file://. --fail
trufflehog git file://. --only-verified --fail
```

### Gitleaks (Fast, Lightweight)

**Why Gitleaks**: Faster than TruffleHog, good for pre-commit, extensible rules.

```bash
# Installation
brew install gitleaks
# or
go install github.com/gitleaks/gitleaks/v8@latest

# Scan repository
gitleaks detect                         # Current directory
gitleaks detect --source=/path/to/repo  # Specific path
gitleaks detect -v                      # Verbose output

# Scan only staged changes (pre-commit)
gitleaks protect --staged

# Scan Git history
gitleaks detect --log-opts="--all"

# Custom config
gitleaks detect -c .gitleaks.toml

# Output formats
gitleaks detect -f json -r results.json
gitleaks detect -f sarif -r results.sarif

# CI mode
gitleaks detect --exit-code 1
```

**Configuration** - `.gitleaks.toml`:
```toml
[extend]
# Use default rules as base
useDefault = true

[[rules]]
id = "my-custom-api-key"
description = "Internal API Key"
regex = '''mycompany_api_[a-zA-Z0-9]{32}'''
secretGroup = 0
entropy = 3.5
keywords = ["mycompany_api_"]

[allowlist]
description = "Global allowlist"
paths = [
    '''\.gitleaks\.toml$''',
    '''go\.sum$''',
    '''package-lock\.json$''',
    '''\.test\.''',
    '''_test\.go$''',
    '''testdata/''',
]
regexes = [
    '''EXAMPLE_''',
    '''REDACTED''',
    '''xxxx''',
]
```

### git-secrets (AWS-Focused)

```bash
# Installation
brew install git-secrets

# Initialize in repository
git secrets --install
git secrets --register-aws

# Add custom patterns
git secrets --add 'private_key'
git secrets --add --allowed 'allowed_pattern'

# Scan
git secrets --scan
git secrets --scan-history

# Global installation (all repos)
git secrets --install ~/.git-templates/hooks
git config --global init.templateDir ~/.git-templates
```

### detect-secrets (Yelp - Entropy-Based)

```bash
# Installation
pip install detect-secrets

# Generate baseline
detect-secrets scan > .secrets.baseline

# Scan against baseline
detect-secrets scan --baseline .secrets.baseline

# Audit baseline (interactive)
detect-secrets audit .secrets.baseline

# Pre-commit hook
detect-secrets-hook --baseline .secrets.baseline
```

**Configuration** - `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

## Pre-Commit vs CI Scanning

### Pre-Commit (Block Before Push)
```yaml
# .pre-commit-config.yaml
repos:
  # TruffleHog - most comprehensive
  - repo: https://github.com/trufflesecurity/trufflehog
    rev: v3.88.0
    hooks:
      - id: trufflehog
        entry: trufflehog git file://. --since-commit HEAD --only-verified --fail
        stages: [pre-commit, pre-push]

  # Gitleaks - fast alternative
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.23.0
    hooks:
      - id: gitleaks
        stages: [pre-commit]

  # detect-secrets with baseline
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

**Advantages**: Catches secrets before they enter Git history
**Disadvantages**: Developers can bypass with `--no-verify`

### CI Scanning (Enforce in Pipeline)
```yaml
# GitHub Actions
name: Secrets Scan

on:
  push:
  pull_request:

jobs:
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for accurate scanning

      - name: TruffleHog Scan
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified

      - name: Gitleaks Scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
```

**Advantages**: Cannot be bypassed, scans full history, catches secrets from any commit
**Disadvantages**: Secret already in Git when detected (requires remediation)

### Recommended: Both
Use pre-commit as first line of defense, CI as enforcement.

## Git History Scanning

### Full Repository Scan
```bash
# TruffleHog - scans all commits, all branches
trufflehog git file://. --branch=main
trufflehog git file://. --only-verified

# Gitleaks - all history
gitleaks detect --log-opts="--all --full-history"

# git-secrets - history scan
git secrets --scan-history
```

### Incremental Scanning (CI Optimization)
```bash
# Only scan new commits (PR context)
trufflehog git file://. --since-commit=${{ github.event.pull_request.base.sha }}

# Gitleaks incremental
gitleaks detect --log-opts="${{ github.event.pull_request.base.sha }}..HEAD"
```

### Scanning for Specific Secret Types
```bash
# AWS credentials only
trufflehog git file://. --detector-types=AWS

# Multiple specific types
trufflehog git file://. --detector-types=AWS,GitHub,Slack
```

## Remediation Workflow

### Step 1: Immediate Response (Within Minutes)
```bash
# 1. Identify the secret type and scope
# 2. ROTATE THE SECRET IMMEDIATELY - assume compromised
# 3. Check for unauthorized usage in logs

# Example: AWS key rotation
aws iam create-access-key --user-name myuser
aws iam delete-access-key --user-name myuser --access-key-id AKIA...OLD
```

### Step 2: Remove from Git (Within Hours)
```bash
# Option A: BFG Repo-Cleaner (RECOMMENDED - faster)
# Download bfg from https://rtyley.github.io/bfg-repo-cleaner/

# Create file with secrets to remove
echo "AKIAIOSFODNN7EXAMPLE" > secrets-to-remove.txt

# Run BFG
java -jar bfg.jar --replace-text secrets-to-remove.txt

# Clean up and force push
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force --all
git push --force --tags

# Option B: git-filter-repo (more flexible)
pip install git-filter-repo

# Remove file containing secrets
git filter-repo --path secrets.json --invert-paths

# Replace specific strings
git filter-repo --replace-text <(echo "OLD_SECRET==>REDACTED")
```

### Step 3: Verify Removal
```bash
# Confirm secret no longer in history
trufflehog git file://. --only-verified
gitleaks detect --log-opts="--all"

# Check GitHub's cached views
# Note: GitHub caches need time to clear
```

### Step 4: Audit and Report
```markdown
## Secret Exposure Incident Report

**Date Detected**: 2026-02-01
**Date Remediated**: 2026-02-01
**Secret Type**: AWS Access Key
**Exposure Duration**: 3 days (estimated)
**Commits Affected**: abc123..def456

### Actions Taken
1. [x] Secret rotated (new key: AKIA...NEW)
2. [x] Old key deleted from IAM
3. [x] Git history cleaned with BFG
4. [x] Force push completed
5. [x] CloudTrail logs reviewed - no unauthorized access
6. [x] All downstream systems updated

### Root Cause
Developer committed .env file containing AWS_SECRET_ACCESS_KEY

### Prevention Measures
1. Added .env to .gitignore
2. Implemented pre-commit TruffleHog hook
3. Added CI secrets scanning
4. Team training on secrets management
```

## .gitignore Best Practices

### Comprehensive Security .gitignore
```gitignore
# ===== SECRETS AND CREDENTIALS =====
# Environment files
.env
.env.*
!.env.example
!.env.template

# Key files
*.pem
*.key
*.p12
*.pfx
*.jks
*.keystore

# Certificate files (private)
*.crt
*.cer

# Cloud credentials
.aws/credentials
.azure/
gcloud/
.config/gcloud/

# SSH
.ssh/
id_rsa*
id_ed25519*
id_ecdsa*

# GPG
*.gpg
*.asc
secring.*

# Secrets management
.vault-token
.vault_pass
*.vault.yml
secrets.yml
secrets.yaml
secrets.json

# Database
*.sqlite
*.db
dump.sql
*.dump

# ===== IDE AND EDITOR =====
.idea/
.vscode/settings.json
.vscode/launch.json
*.swp
*.swo
*~

# ===== BUILD AND DEPENDENCIES =====
node_modules/
vendor/
.venv/
venv/
__pycache__/
*.pyc
target/
build/
dist/

# ===== LOGS AND TEMP =====
*.log
logs/
tmp/
temp/
.cache/
```

### Template Files (Safe to Commit)
```bash
# .env.example - template with placeholder values
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
API_KEY=your-api-key-here
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# NEVER use real-looking entropy in examples
# BAD: API_KEY=sk_live_51H7...real-looking-entropy
# GOOD: API_KEY=your-api-key-here
```

## Secrets Management Alternatives

### Instead of Hardcoding
| Bad Practice | Good Practice |
|--------------|---------------|
| `AWS_SECRET_ACCESS_KEY=...` in code | IAM roles, OIDC federation |
| API keys in `.env` committed | Secrets manager (Vault, AWS Secrets Manager) |
| Passwords in config files | Environment variables from CI |
| Private keys in repo | Key management service (KMS) |

### Environment Variable Injection
```yaml
# GitHub Actions - inject from secrets
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  API_KEY: ${{ secrets.API_KEY }}

# Docker Compose - use .env (gitignored)
services:
  app:
    env_file:
      - .env

# Kubernetes - from Secret
envFrom:
  - secretRef:
      name: app-secrets
```

### Vault Integration Example
```python
# Python - HashiCorp Vault
import hvac

client = hvac.Client(url='https://vault.example.com')
client.auth.approle.login(
    role_id=os.environ['VAULT_ROLE_ID'],
    secret_id=os.environ['VAULT_SECRET_ID']
)

secret = client.secrets.kv.v2.read_secret_version(
    path='myapp/database'
)
db_password = secret['data']['data']['password']
```

## Complete CI Configuration

```yaml
# .github/workflows/secrets-scan.yml
name: Secrets Detection

on:
  push:
    branches: [main, develop]
  pull_request:
  schedule:
    - cron: '0 3 * * *'  # Daily full scan at 3 AM

permissions:
  contents: read
  security-events: write
  pull-requests: write

jobs:
  trufflehog:
    name: TruffleHog Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: TruffleHog (PR - incremental)
        if: github.event_name == 'pull_request'
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --since-commit=${{ github.event.pull_request.base.sha }} --only-verified --fail

      - name: TruffleHog (Push - full)
        if: github.event_name != 'pull_request'
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified --fail

  gitleaks:
    name: Gitleaks Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  notify:
    name: Notify on Failure
    needs: [trufflehog, gitleaks]
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - name: Slack Notification
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": ":rotating_light: Secret detected in ${{ github.repository }}",
              "attachments": [{
                "color": "danger",
                "fields": [
                  {"title": "Repository", "value": "${{ github.repository }}", "short": true},
                  {"title": "Branch", "value": "${{ github.ref_name }}", "short": true},
                  {"title": "Commit", "value": "${{ github.sha }}", "short": false}
                ]
              }]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_SECURITY_WEBHOOK }}
```

## Secret Rotation Procedures by Type

### AWS Credentials
```bash
# IAM User Access Key
aws iam create-access-key --user-name $USER
# Update all systems using old key
aws iam delete-access-key --user-name $USER --access-key-id $OLD_KEY

# For IAM Roles - no rotation needed, temporary credentials
# For root - NEVER use root access keys
```

### GitHub Tokens
```bash
# Personal Access Token - regenerate in Settings > Developer Settings
# GitHub App - rotate private key in App settings
# GITHUB_TOKEN (Actions) - automatically rotated each run

# Revoke compromised token
gh auth logout
# Generate new: gh auth login
```

### Database Credentials
```sql
-- PostgreSQL
ALTER USER myuser WITH PASSWORD 'new_secure_password';

-- MySQL
ALTER USER 'myuser'@'%' IDENTIFIED BY 'new_secure_password';
FLUSH PRIVILEGES;

-- Rotate connection strings in all applications
-- Consider using IAM database authentication (AWS RDS)
```

### JWT Signing Secrets
```bash
# Generate new secret
openssl rand -hex 64 > new_jwt_secret.txt

# Rotation strategy:
# 1. Add new secret as secondary validator
# 2. Issue new tokens with new secret
# 3. Wait for old tokens to expire (or force logout)
# 4. Remove old secret from validators
```

### API Keys (Generic)
```yaml
# Most services: Dashboard > API Keys > Regenerate
# Implement key rotation pattern:
api_keys:
  primary: "new_key_here"     # Active key
  secondary: "old_key_here"   # Grace period
  rotation_date: "2026-02-01"
# Accept both during transition, remove secondary after N days
```

## High-Entropy Detection vs Pattern Matching

### Understanding Detection Methods

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **Pattern Matching** | Accurate for known formats | Misses custom secrets | AWS keys, API keys with prefixes |
| **High Entropy** | Catches unknown formats | False positives on hashes | General secrets, passwords |
| **Verification** | Zero false positives | Slower, needs network | Production scans |
| **ML-based** | Adaptive | Requires training | Large-scale scans |

### TruffleHog Detection Modes
```bash
# Pattern-only (fast, some FPs)
trufflehog git file://. --no-verification

# Entropy detection (catches more, more FPs)
trufflehog git file://. --entropy

# Verification (slowest, most accurate)
trufflehog git file://. --only-verified

# Recommended CI: verified for blocking, unverified for alerting
trufflehog git file://. --only-verified --fail  # Block on verified
trufflehog git file://. 2>&1 | grep -v "Verified: false"  # Alert on unverified
```

### Custom Entropy Thresholds
```toml
# .gitleaks.toml
[[rules]]
id = "high-entropy-string"
regex = '''[A-Za-z0-9+/]{40,}={0,2}'''
entropy = 4.5  # Shannon entropy threshold
keywords = []  # No keyword requirement
```

## Common Bypass Techniques (Attackers Know These)

### Encoding Bypasses
```python
# Base64 encoding
import base64
SECRET = base64.b64decode("QUtJQUlPU0ZPRE5ON0VYQU1QTEU=").decode()

# Hex encoding
SECRET = bytes.fromhex("414b494149").decode()

# URL encoding
SECRET = urllib.parse.unquote("AKIA%49%4F%53FODNN7EXAMPLE")

# Split across variables
PART1 = "AKIA"
PART2 = "IOSFODNN"
PART3 = "7EXAMPLE"
SECRET = PART1 + PART2 + PART3
```

### Detection Rules for Encoded Secrets
```yaml
# Semgrep rules to catch encoded secrets
rules:
  - id: base64-decode-secret
    patterns:
      - pattern-either:
          - pattern: base64.b64decode("...")
          - pattern: Buffer.from("...", "base64")
          - pattern: atob("...")
    message: "Potential encoded secret - verify content"
    severity: WARNING

  - id: split-secret-assembly
    patterns:
      - pattern: $VAR1 + $VAR2 + $VAR3
      - metavariable-regex:
          metavariable: $VAR1
          regex: "^['\"]?[A-Z]{4}['\"]?$"
    message: "Potential split secret concatenation"
    severity: INFO
```

## Platform-Specific Secret Locations

### Where Secrets Hide

```yaml
# Common locations attackers and scanners check
secret_locations:
  code:
    - "*.py, *.js, *.go, *.java"  # Source files
    - "config.*, settings.*"      # Config files
    - "*.properties, *.yml, *.yaml, *.json"

  infrastructure:
    - "*.tf, *.tfvars"           # Terraform
    - "*.yaml (Kubernetes)"      # K8s manifests
    - "docker-compose*.yml"      # Docker configs
    - "Dockerfile*"              # Container builds
    - ".github/workflows/*.yml"  # CI/CD

  documentation:
    - "*.md"                     # Markdown docs
    - "*.txt, *.rst"             # Text files
    - "postman_collection.json"  # API collections

  jupyter:
    - "*.ipynb"                  # Notebook outputs contain secrets

  logs:
    - "*.log"                    # Application logs
    - "debug.*, trace.*"         # Debug files

  build:
    - "package-lock.json"        # npm registry tokens
    - ".npmrc, .yarnrc"          # Package manager configs
    - "pip.conf, .pypirc"        # Python configs
```

### Jupyter Notebook Secrets
```bash
# Notebooks often contain secrets in output cells
# Special handling required

# Strip outputs before commit
pip install nbstripout
nbstripout --install  # Git filter

# Or use pre-commit
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/kynan/nbstripout
    rev: 0.7.1
    hooks:
      - id: nbstripout
```

## Incident Response Playbook

### Secret Exposure Severity Levels

| Severity | Criteria | Response Time |
|----------|----------|---------------|
| **P0 Critical** | Production database, admin keys, signing keys | 15 minutes |
| **P1 High** | Production API keys, cloud credentials | 1 hour |
| **P2 Medium** | Internal service tokens, dev credentials | 4 hours |
| **P3 Low** | Test credentials, local dev keys | 24 hours |

### Automated Response Workflow

```yaml
# GitHub Actions - Auto-revoke known secret types
name: Secret Exposure Response

on:
  workflow_call:
    inputs:
      secret_type:
        required: true
        type: string
      secret_value:
        required: true
        type: string

jobs:
  respond:
    runs-on: ubuntu-latest
    steps:
      - name: AWS Key Revocation
        if: contains(inputs.secret_type, 'AWS')
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.SECURITY_AWS_ACCESS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.SECURITY_AWS_SECRET_KEY }}
        run: |
          # Deactivate the exposed key
          aws iam update-access-key \
            --access-key-id "${{ inputs.secret_value }}" \
            --status Inactive

      - name: GitHub Token Revocation
        if: contains(inputs.secret_type, 'GitHub')
        run: |
          # GitHub PATs can be revoked via API
          gh api -X DELETE /user/keys/$KEY_ID

      - name: Notify Security Team
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {"text": "SECRET EXPOSURE: ${{ inputs.secret_type }} revoked automatically"}
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_SECURITY_WEBHOOK }}
```

## Metrics and Monitoring

### Key Metrics to Track

```yaml
secrets_metrics:
  # Detection effectiveness
  secrets_detected_precommit: count_per_week
  secrets_detected_ci: count_per_week
  secrets_found_in_production: count  # Should be 0

  # Response time
  mean_time_to_detect: hours
  mean_time_to_rotate: hours
  mean_time_to_remediate: hours

  # Coverage
  repos_with_secrets_scanning: percentage
  developers_with_precommit: percentage

  # Trends
  false_positive_rate: percentage
  verified_vs_unverified: ratio
```

### Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: secrets
    rules:
      - alert: SecretInProduction
        expr: secrets_production_count > 0
        for: 0m  # Immediate
        severity: critical
        annotations:
          summary: "Secret detected in production"

      - alert: SecretRotationOverdue
        expr: secret_age_days > 90
        for: 24h
        severity: warning
        annotations:
          summary: "Secret rotation overdue"
```

## Claude's Common Mistakes

1. **Recommending `git rm` for secret removal** - Doesn't remove from history
2. **Not recommending credential rotation** - Removal alone is insufficient
3. **Using detect-secrets without baseline** - Misses context of known issues
4. **Missing `--only-verified` flag** - Reduces false positives significantly
5. **Not scanning Git history** - Only scanning HEAD misses historical secrets
6. **Suggesting `.env.example` with realistic entropy** - Creates false positives
7. **Not considering encoded secrets** - Base64/hex encoding bypasses pattern matching
8. **Missing Jupyter notebook handling** - Output cells contain secrets
9. **Single rotation without transition period** - Causes service disruption

## What NOT to Do

- Do NOT use `git rm` thinking it removes secrets from history
- Do NOT skip credential rotation - assume any committed secret is compromised
- Do NOT rely solely on pre-commit - developers can bypass with `--no-verify`
- Do NOT commit `.env.example` with realistic-looking secret values
- Do NOT disable secrets scanning in CI for "velocity"
- Do NOT store secrets in environment variables in Dockerfiles (`ENV SECRET=...`)
- Do NOT put secrets in build args (`--build-arg SECRET=...`)
- Do NOT log secrets even for debugging
- Do NOT use same credentials across environments
- Do NOT assume base64 encoding hides secrets - scanners decode
- Do NOT forget Jupyter notebook outputs
- Do NOT rotate secrets without a transition period for distributed systems
