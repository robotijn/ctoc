# Audit Command

Quick dependency vulnerability auditing for your project.

## Usage

```bash
ctoc audit [deps|all|report|gate]
ctoc audit deps [--fix]
ctoc audit report [--format <format>]
ctoc audit gate [--mode <mode>]
```

## Actions

### deps (default)

Audit project dependencies for known vulnerabilities.

```bash
# Run dependency audit
ctoc audit
ctoc audit deps

# Show fix commands
ctoc audit deps --fix
```

Supports multiple package managers:

| Manager | Lock File | Audit Tool |
|---------|-----------|------------|
| npm | package-lock.json | npm audit |
| yarn | yarn.lock | yarn audit |
| pnpm | pnpm-lock.yaml | pnpm audit |
| pip | requirements.txt | pip-audit |
| poetry | poetry.lock | poetry audit |
| go | go.sum | govulncheck |
| cargo | Cargo.lock | cargo audit |
| bundler | Gemfile.lock | bundle audit |
| composer | composer.lock | composer audit |

### all

Run full security audit (dependencies + SAST + secrets).

```bash
ctoc audit all
```

### report

Generate an audit report from the latest scan.

```bash
# Text report
ctoc audit report

# JSON report
ctoc audit report --format json

# Markdown report
ctoc audit report --format markdown
```

### gate

Check if dependencies pass quality gate thresholds.

```bash
# Check with strict thresholds
ctoc audit gate

# Check with strictest thresholds
ctoc audit gate --mode strictest

# Check with legacy thresholds
ctoc audit gate --mode legacy
```

## Examples

### Basic Workflow

```bash
# 1. Run audit
ctoc audit

# 2. Get fix commands
ctoc audit deps --fix

# 3. Check gate
ctoc audit gate
```

### CI/CD Integration

```yaml
# GitHub Actions
- name: Audit Dependencies
  run: |
    ctoc audit deps
    ctoc audit gate --mode strict
```

### Pre-commit Hook

```bash
# .husky/pre-commit
ctoc audit deps
if [ $? -ne 0 ]; then
  echo "Vulnerable dependencies detected!"
  exit 1
fi
```

## Output

### Vulnerability Details

Each vulnerability includes:

- **Severity**: CRITICAL, HIGH, MODERATE, LOW
- **Package**: Affected package name
- **Version**: Affected version
- **CVE**: CVE identifier if available
- **Title**: Brief description
- **Fix**: Recommended version to upgrade to

### Example Output

```
Dependency Audit
==================================================

Package Managers: npm
Scan Duration: 3s
Total Vulnerabilities: 5

By Severity:
  CRITICAL: 1
  HIGH: 2
  MODERATE: 2

Critical/High Vulnerabilities:
------------------------------
  [CRITICAL] lodash@4.17.15
    Prototype Pollution
    CVE: CVE-2020-8203
    Fix: Upgrade to 4.17.21

  [HIGH] axios@0.21.0
    Server-Side Request Forgery
    CVE: CVE-2021-3749
    Fix: Upgrade to 0.21.2

Audit FAILED: 3 critical/high vulnerability(ies) found.
```

## Quality Gate Thresholds

| Finding Type | Strict | Strictest | Legacy |
|--------------|--------|-----------|--------|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 5 |
| Moderate | 10 | 0 | 20 |

## Fix Commands

With `--fix`, the command shows upgrade commands:

```
Fix Commands:
------------------------------
  npm install lodash@4.17.21
  npm install axios@0.21.2
  npm install minimist@1.2.6

Run these commands to fix vulnerable dependencies.
```

## Results Storage

Results are saved to `.ctoc/security/dependency-audit.json` for:

- Report generation
- Quality gate checks
- Trend analysis

## Requirements

For best results, ensure the audit tools are installed:

```bash
# Node.js (built-in)
npm --version

# Python
pip install pip-audit

# Go
go install golang.org/x/vuln/cmd/govulncheck@latest

# Rust
cargo install cargo-audit

# Ruby
gem install bundler-audit
```

## Related Commands

- `ctoc security scan` - Full security scan
- `ctoc security gate` - Security quality gate
- `ctoc quality check` - Full quality check

## See Also

- [Dependency Scanning](../skills/security/dependency-scanning.md)
- [OWASP Top 10](../skills/security/owasp-top-10.md)
