# Security Command

Comprehensive security scanning and vulnerability detection for your codebase.

## Usage

```bash
ctoc security scan [--sast] [--deps] [--secrets] [--all]
ctoc security report [--format <format>]
ctoc security gate [--mode <mode>]
ctoc security fix [--auto]
```

## Actions

### scan

Run security scans on the project. By default, runs all scans.

```bash
# Run all security scans
ctoc security scan

# Run only SAST scan
ctoc security scan --sast

# Run only dependency audit
ctoc security scan --deps

# Run only secrets detection
ctoc security scan --secrets

# Run specific scans
ctoc security scan --sast --secrets
```

**What each scan does:**

| Scan | Description | Tools |
|------|-------------|-------|
| `--sast` | Static Application Security Testing | Semgrep, Bandit, gosec, ESLint security |
| `--deps` | Dependency vulnerability audit | npm audit, pip-audit, govulncheck, cargo audit |
| `--secrets` | Detect hardcoded secrets | Pattern matching + TruffleHog |
| `--all` | Run all scans (default) | All of the above |

### report

Generate a security report from the latest scan.

```bash
# Text report (default)
ctoc security report

# JSON report
ctoc security report --format json

# Markdown report
ctoc security report --format markdown
```

### gate

Check if the project passes security quality gates.

```bash
# Check with strict thresholds (default)
ctoc security gate

# Check with strictest thresholds (zero tolerance)
ctoc security gate --mode strictest

# Check with legacy thresholds (for existing projects)
ctoc security gate --mode legacy
```

**Thresholds by mode:**

| Finding Type | Strict | Strictest | Legacy |
|--------------|--------|-----------|--------|
| Critical SAST | 0 | 0 | 0 |
| High SAST | 0 | 0 | 5 |
| Medium SAST | 10 | 0 | 20 |
| Critical deps | 0 | 0 | 0 |
| High deps | 0 | 0 | 5 |
| Secrets | 0 | 0 | 0 |

### fix

Get suggestions for fixing security issues.

```bash
# Get fix suggestions
ctoc security fix

# Get auto-fixable commands
ctoc security fix --auto
```

## Examples

### Complete Security Workflow

```bash
# 1. Run full security scan
ctoc security scan

# 2. Check security gate
ctoc security gate --mode strict

# 3. Get fix suggestions
ctoc security fix --auto

# 4. Generate report for review
ctoc security report --format markdown > security-report.md
```

### CI/CD Integration

```yaml
# GitHub Actions example
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Security Scan
        run: ctoc security scan

      - name: Check Security Gate
        run: ctoc security gate --mode strict

      - name: Generate Report
        if: always()
        run: ctoc security report --format json > security.json

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: security-report
          path: security.json
```

### Pre-commit Hook

```bash
# Add to .husky/pre-commit or .pre-commit-config.yaml
ctoc security scan --secrets
if [ $? -ne 0 ]; then
  echo "Secrets detected! Please remove before committing."
  exit 1
fi
```

## Scan Output

### SAST Findings

SAST (Static Application Security Testing) detects:

- SQL Injection (CWE-89)
- Cross-Site Scripting/XSS (CWE-79)
- Command Injection (CWE-78)
- Path Traversal (CWE-22)
- Insecure Deserialization (CWE-502)
- Hardcoded Credentials (CWE-798)
- Weak Cryptography (CWE-327)
- And more...

### Dependency Vulnerabilities

Audits dependencies for known CVEs:

- npm packages (package-lock.json)
- Python packages (requirements.txt, Pipfile)
- Go modules (go.mod)
- Rust crates (Cargo.toml)
- Ruby gems (Gemfile)
- PHP packages (composer.json)

### Secrets Detection

Detects hardcoded secrets:

- AWS Access Keys (AKIA...)
- GitHub Tokens (ghp_...)
- Private Keys (-----BEGIN RSA PRIVATE KEY-----)
- Database URLs with credentials
- JWT secrets
- Generic API keys and tokens

## Severity Levels

| Level | Description | SLA |
|-------|-------------|-----|
| CRITICAL | Immediate exploitation risk, RCE, data breach | Fix within 24 hours |
| HIGH | Significant risk, auth bypass, injection | Fix within 7 days |
| MEDIUM | Moderate risk, XSS, info disclosure | Fix within 30 days |
| LOW | Minor risk, best practice violation | Fix within 90 days |

## Results Storage

Scan results are saved to `.ctoc/security/latest-scan.json` for:

- Report generation
- Quality gate checks
- Trend analysis
- CI/CD integration

## Requirements

For full scanning capabilities, install:

```bash
# SAST tools
pip install semgrep bandit
go install github.com/securego/gosec/v2/cmd/gosec@latest

# Dependency auditing
pip install pip-audit
go install golang.org/x/vuln/cmd/govulncheck@latest
cargo install cargo-audit

# Secrets detection (optional, enhances detection)
brew install trufflesecurity/trufflehog/trufflehog
pip install detect-secrets
```

The command works with available tools and gracefully skips unavailable ones.

## Related Commands

- `ctoc quality check` - Run full quality check including security
- `ctoc coverage check` - Check test coverage
- `ctoc audit deps` - Dependency-only audit (alias)

## See Also

- [SAST Overview](../skills/security/sast-overview.md)
- [Dependency Scanning](../skills/security/dependency-scanning.md)
- [Secrets Detection](../skills/security/secrets-detection.md)
- [OWASP Top 10](../skills/security/owasp-top-10.md)
