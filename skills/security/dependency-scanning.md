# Dependency Scanning - Software Composition Analysis (SCA)
> Claude Code security correction guide. Updated February 2026.

## Why Dependency Scanning Matters

**70-90% of modern applications consist of third-party dependencies.** A single vulnerable dependency can compromise your entire application. Supply chain attacks (SolarWinds, Log4Shell, XZ Utils) prove this is not theoretical.

## Language-Specific Scanners

### JavaScript/TypeScript (npm, yarn, pnpm)

```bash
# npm audit (built-in)
npm audit                        # Show vulnerabilities
npm audit --production           # Production deps only
npm audit fix                    # Auto-fix where possible
npm audit fix --force            # Force major version updates (REVIEW FIRST)
npm audit --audit-level=high     # Fail CI on high+ only

# yarn audit
yarn audit                       # Show vulnerabilities
yarn audit --level high          # Filter by severity
yarn npm audit --recursive       # yarn 4.x deep scan

# pnpm audit
pnpm audit                       # Show vulnerabilities
pnpm audit --fix                 # Auto-fix
pnpm audit --audit-level high    # Fail on high+
```

**Configuration** - `.npmrc` or `.yarnrc.yml`:
```ini
# .npmrc
audit-level=high
```

### Python (pip, poetry, pipenv)

```bash
# pip-audit (RECOMMENDED - OSV database)
pip install pip-audit
pip-audit                               # Scan installed packages
pip-audit -r requirements.txt           # Scan requirements file
pip-audit --fix                         # Auto-remediate
pip-audit --strict                      # Fail on any finding
pip-audit -f json -o audit.json         # JSON output for CI

# safety (PyUp.io database)
pip install safety
safety check                            # Scan installed
safety check -r requirements.txt        # Scan requirements
safety check --full-report              # Detailed output
safety check --json                     # JSON for CI

# poetry (built-in)
poetry check                            # Validate pyproject.toml
poetry show --outdated                  # Show outdated deps
# No built-in security audit - use pip-audit with poetry export

# pipenv
pipenv check                            # Security scan
```

**CI Integration**:
```yaml
# pyproject.toml - pip-audit configuration
[tool.pip-audit]
require-hashes = true
vulnerability-service = "osv"  # or "pypi"
```

### Go

```bash
# govulncheck (OFFICIAL - RECOMMENDED)
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...                       # Scan all packages
govulncheck -json ./...                 # JSON output
govulncheck -mode=binary ./cmd/app      # Scan compiled binary

# go mod audit (Go 1.22+)
go mod audit                            # Basic audit
go mod audit -json                      # JSON output

# nancy (Sonatype OSS Index)
go install github.com/sonatype-nexus-community/nancy@latest
go list -json -deps ./... | nancy sleuth
```

**Why govulncheck is superior**: It analyzes actual code paths, not just declared dependencies. Only reports vulnerabilities in code you actually call.

### Rust

```bash
# cargo-audit (RECOMMENDED)
cargo install cargo-audit
cargo audit                             # Scan Cargo.lock
cargo audit --json                      # JSON output
cargo audit fix                         # Auto-fix (updates Cargo.toml)
cargo audit --deny warnings             # Fail CI on any finding

# cargo-deny (comprehensive)
cargo install cargo-deny
cargo deny init                         # Create deny.toml
cargo deny check                        # Full check (advisories, licenses, bans)
```

**Configuration** - `deny.toml`:
```toml
[advisories]
db-path = "~/.cargo/advisory-db"
db-urls = ["https://github.com/rustsec/advisory-db"]
vulnerability = "deny"
unmaintained = "warn"
yanked = "warn"

[licenses]
unlicensed = "deny"
allow = ["MIT", "Apache-2.0", "BSD-3-Clause"]
```

### Java/Kotlin (Maven, Gradle)

```bash
# OWASP Dependency-Check (RECOMMENDED)
# Maven
mvn org.owasp:dependency-check-maven:check
# Gradle
./gradlew dependencyCheckAnalyze

# Snyk
snyk test --all-projects

# Trivy (container + deps)
trivy fs --scanners vuln .
```

**Maven Configuration** - `pom.xml`:
```xml
<plugin>
    <groupId>org.owasp</groupId>
    <artifactId>dependency-check-maven</artifactId>
    <version>11.1.0</version>
    <configuration>
        <failBuildOnCVSS>7</failBuildOnCVSS>
        <formats>HTML,JSON,SARIF</formats>
        <nvdApiKey>${env.NVD_API_KEY}</nvdApiKey>
    </configuration>
</plugin>
```

### .NET (NuGet)

```bash
# dotnet list package (built-in)
dotnet list package --vulnerable
dotnet list package --vulnerable --include-transitive

# Snyk
snyk test --file=*.csproj
```

### PHP (Composer)

```bash
# composer audit (built-in, Composer 2.4+)
composer audit
composer audit --format=json

# Local PHP Security Checker
composer global require enlightn/security-checker
security-checker security:check composer.lock
```

### Ruby (Bundler)

```bash
# bundler-audit
gem install bundler-audit
bundle-audit check --update     # Update DB and scan
bundle-audit check --format json

# Snyk
snyk test --file=Gemfile.lock
```

## Multi-Language Scanners

### Snyk (RECOMMENDED for Enterprise)
```bash
# Installation
npm install -g snyk
snyk auth                               # Authenticate

# Scanning
snyk test                               # Scan current project
snyk test --all-projects                # Monorepo scan
snyk test --severity-threshold=high     # Filter by severity
snyk monitor                            # Continuous monitoring
snyk code test                          # SAST (Snyk Code)
snyk container test myimage:tag         # Container scanning

# CI Integration
snyk test --json > snyk-results.json
snyk-to-sarif -i snyk-results.json -o snyk.sarif
```

### Trivy (RECOMMENDED for Containers + IaC)
```bash
# Installation
brew install trivy  # or apt, apk, etc.

# Filesystem scanning
trivy fs .                              # Scan current directory
trivy fs --scanners vuln,secret .       # Vuln + secrets
trivy fs --severity HIGH,CRITICAL .     # Filter severity
trivy fs -f sarif -o trivy.sarif .      # SARIF output

# Container scanning
trivy image myapp:latest
trivy image --ignore-unfixed myapp:latest

# IaC scanning
trivy config .                          # Terraform, K8s, etc.
```

### Grype (Anchore)
```bash
# Installation
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s

# Scanning
grype .                                 # Scan directory
grype dir:.                             # Explicit directory
grype sbom:./sbom.json                  # Scan SBOM
grype myimage:tag                       # Container

# Output
grype . -o json                         # JSON output
grype . -o sarif                        # SARIF for GitHub
grype . --fail-on high                  # Fail CI on high+
```

## SBOM Generation

**Software Bill of Materials (SBOM)** - Complete inventory of all components.

### CycloneDX (OWASP Standard)
```bash
# JavaScript
npm install -g @cyclonedx/cdxgen
cdxgen -o sbom.json                     # Auto-detect project type
cdxgen -t npm -o sbom.json              # Explicit type

# Python
pip install cyclonedx-bom
cyclonedx-py environment -o sbom.json
cyclonedx-py requirements -o sbom.json requirements.txt

# Go
go install github.com/CycloneDX/cyclonedx-gomod/cmd/cyclonedx-gomod@latest
cyclonedx-gomod mod -output sbom.json

# Java (Maven)
mvn org.cyclonedx:cyclonedx-maven-plugin:makeBom

# Multi-language (Syft - RECOMMENDED)
syft . -o cyclonedx-json > sbom.json
```

### SPDX (Linux Foundation Standard)
```bash
# Syft can output SPDX
syft . -o spdx-json > sbom.spdx.json

# spdx-sbom-generator (multi-language)
spdx-sbom-generator -p . -o sbom.spdx
```

### SBOM Best Practices
1. **Generate on every build** - SBOMs should be build artifacts
2. **Sign SBOMs** - Use Sigstore/cosign for integrity
3. **Store with releases** - Attach to GitHub releases, container registries
4. **Include in contracts** - Require SBOMs from vendors
5. **Scan SBOMs continuously** - Vulnerabilities discovered post-release

```bash
# Sign SBOM with cosign
cosign sign-blob --key cosign.key sbom.json > sbom.json.sig

# Scan existing SBOM
grype sbom:./sbom.json
trivy sbom sbom.json
```

## CVE/CVSS Scoring

### CVSS 4.0 Severity Mapping (2024+)
| Score | Severity | Fix SLA |
|-------|----------|---------|
| 9.0 - 10.0 | Critical | 24-72 hours |
| 7.0 - 8.9 | High | 7 days |
| 4.0 - 6.9 | Medium | 30 days |
| 0.1 - 3.9 | Low | 90 days |

### Exploitability Factors (EPSS)
```bash
# Check if vulnerability is actively exploited
# EPSS (Exploit Prediction Scoring System) - FIRST.org
curl -s "https://api.first.org/data/v1/epss?cve=CVE-2024-XXXXX" | jq '.data[].epss'

# KEV (Known Exploited Vulnerabilities) - CISA
# If in KEV catalog, treat as Critical regardless of CVSS
curl -s "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json" | \
  jq '.vulnerabilities[] | select(.cveID == "CVE-2024-XXXXX")'
```

### Decision Matrix for Prioritization
```
┌──────────────────────────────────────────────────────────────────┐
│                VULNERABILITY PRIORITIZATION                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  In CISA KEV?  ───────► YES ───────► CRITICAL (fix immediately) │
│       │                                                          │
│       ▼                                                          │
│      NO                                                          │
│       │                                                          │
│       ▼                                                          │
│  EPSS > 0.1 (10%)?  ──► YES ───────► Elevate one severity level │
│       │                                                          │
│       ▼                                                          │
│      NO                                                          │
│       │                                                          │
│       ▼                                                          │
│  Is code path reachable? ──► NO ───► Deprioritize (still fix)   │
│       │                                                          │
│       ▼                                                          │
│      YES                                                         │
│       │                                                          │
│       ▼                                                          │
│  Use CVSS severity as-is                                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Remediation Strategies

### Strategy 1: Direct Upgrade
```bash
# Check for fix availability
npm outdated lodash
pip index versions requests

# Upgrade to fixed version
npm install lodash@4.17.21
pip install "requests>=2.32.0"
cargo update -p vulnerable-crate
```

### Strategy 2: Transitive Dependency Override
```json
// package.json - npm overrides
{
  "overrides": {
    "vulnerable-package": "^2.0.0",
    "parent-package>vulnerable-nested": "^1.5.0"
  }
}
```

```toml
# Cargo.toml - patch
[patch.crates-io]
vulnerable-crate = { git = "https://github.com/org/vulnerable-crate", branch = "security-fix" }
```

```xml
<!-- pom.xml - dependency management -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
            <version>2.18.0</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

### Strategy 3: Remove Unused Dependency
```bash
# Find unused dependencies
npx depcheck                            # JavaScript
pip-autoremove <package> --leaves       # Python
go mod tidy                             # Go (auto-removes unused)
cargo machete                           # Rust
```

### Strategy 4: Vendor and Patch (Last Resort)
```bash
# When upstream won't fix and no alternative exists
# 1. Fork the repository
# 2. Apply security fix
# 3. Reference your fork

# Go
go mod edit -replace vulnerable/pkg=github.com/yourorg/pkg-fixed@v1.2.3

# npm
npm install github:yourorg/pkg-fixed#security-fix
```

### Strategy 5: WAF/Runtime Protection (Temporary)
When immediate patching isn't possible:
- Deploy WAF rules to block exploitation
- Enable runtime protection (RASP)
- Document as accepted risk with timeline

## CI/CD Integration

### GitHub Actions Complete Example
```yaml
name: Dependency Security

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM

permissions:
  contents: read
  security-events: write

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          format: cyclonedx-json
          output-file: sbom.json

      - name: Upload SBOM
        uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: sbom.json

      - name: Scan with Grype
        uses: anchore/scan-action@v4
        id: grype
        with:
          sbom: sbom.json
          fail-build: true
          severity-cutoff: high
          output-format: sarif

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ steps.grype.outputs.sarif }}

  snyk-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Snyk Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --sarif-file-output=snyk.sarif

      - name: Upload Snyk SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: snyk.sarif
```

### Automated Dependency Updates

**Dependabot** (.github/dependabot.yml):
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      security:
        applies-to: security-updates
        patterns:
          - "*"
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]

  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "gomod"
    directory: "/"
    schedule:
      interval: "weekly"
```

**Renovate** (renovate.json):
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    "security:openssf-scorecard",
    ":dependencyDashboard"
  ],
  "vulnerabilityAlerts": {
    "enabled": true,
    "labels": ["security"]
  },
  "packageRules": [
    {
      "matchUpdateTypes": ["patch", "minor"],
      "automerge": true,
      "automergeType": "pr"
    },
    {
      "matchDepTypes": ["devDependencies"],
      "automerge": true
    }
  ]
}
```

## Supply Chain Attack Vectors

### Known Attack Patterns (Learn from History)

| Attack | Year | Vector | Detection Method |
|--------|------|--------|------------------|
| **XZ Utils (CVE-2024-3094)** | 2024 | Backdoor in build system | Code review, reproducible builds |
| **Log4Shell (CVE-2021-44228)** | 2021 | JNDI injection in logging | Dependency scanning, version check |
| **SolarWinds** | 2020 | Compromised build server | Binary verification, SBOM |
| **event-stream** | 2018 | Malicious maintainer takeover | Package health monitoring |
| **ua-parser-js** | 2021 | NPM account compromise | Version pinning, lockfile audit |
| **colors/faker** | 2022 | Maintainer sabotage | Version pinning, code review |

### Defense-in-Depth Strategy

```yaml
# Multi-layer supply chain security
supply_chain_security:
  layer_1_source:
    - signed_commits: required
    - branch_protection: enabled
    - code_review: required
    - two_person_rule: true  # For sensitive changes

  layer_2_dependencies:
    - lockfile: required
    - hash_verification: required
    - private_registry: optional  # For enterprise
    - version_pinning: exact_versions

  layer_3_build:
    - reproducible_builds: target
    - isolated_build_env: required
    - slsa_level: 2  # Minimum
    - build_provenance: signed

  layer_4_deployment:
    - image_signing: required
    - sbom_attestation: required
    - admission_control: enabled
```

### Detecting Malicious Packages

```bash
# OpenSSF Scorecard - assess dependency health
go install github.com/ossf/scorecard/v4/cmd/scorecard@latest
scorecard --repo=github.com/owner/repo --format=json

# Package health indicators (red flags)
# - Recent maintainer changes
# - Low star count with high download
# - Postinstall scripts doing network calls
# - Obfuscated code
# - Unusual version jumps

# Socket.dev - detect supply chain attacks
# Commercial tool with real-time package analysis

# NPM - check package health
npm view <package> time  # Version history
npm view <package> maintainers  # Current maintainers
```

### Lockfile Security

```bash
# Verify lockfile integrity
npm ci --ignore-scripts  # Don't run install scripts from deps

# Check for lockfile tampering
git diff package-lock.json  # Review all changes

# Pin to exact versions (not ranges)
# package.json
{
  "dependencies": {
    "lodash": "4.17.21"  # Exact, not "^4.17.21"
  }
}

# Python - use hashes
pip install --require-hashes -r requirements.txt

# requirements.txt with hashes
requests==2.32.0 \
  --hash=sha256:abc123... \
  --hash=sha256:def456...
```

## Vulnerability Database Coverage

### Understanding Database Gaps

| Database | Coverage | Strengths | Weaknesses |
|----------|----------|-----------|------------|
| **NVD** | Comprehensive | Official CVE source | Slow to update (weeks) |
| **OSV** | Growing | Fast updates, OSS-focused | Newer, less coverage |
| **Snyk DB** | Commercial | Very fast, 0-day info | Paid for full access |
| **GitHub Advisory** | Growing | Well-integrated | Limited to popular |
| **RustSec** | Rust-only | Community-driven, fast | Rust ecosystem only |

### Multi-Database Scanning

```yaml
# Combine databases for comprehensive coverage
scanning_strategy:
  primary: "osv"  # Fast, open
  secondary: "nvd"  # Comprehensive
  commercial: "snyk"  # If budget allows

# Trivy uses multiple databases by default
# Grype uses vulnerability databases from multiple sources
```

### Handling Zero-Days

```yaml
# When a new vuln is announced before it's in databases
zero_day_response:
  step_1: "Monitor security mailing lists (oss-security@lists.openwall.com)"
  step_2: "Check vendor advisories directly"
  step_3: "Grep codebase for affected function calls"
  step_4: "Check if package is in your SBOM"
  step_5: "Apply vendor patches or workarounds before CVE assigned"
```

## Container Dependency Scanning

### Base Image Vulnerabilities

```bash
# Scan container images
trivy image myapp:latest

# Use distroless or minimal bases
FROM gcr.io/distroless/base-debian12

# Multi-stage builds to minimize attack surface
FROM node:20 AS build
RUN npm ci && npm run build

FROM gcr.io/distroless/nodejs20-debian12
COPY --from=build /app/dist /app
```

### Container SBOM

```bash
# Generate SBOM for container
syft myapp:latest -o cyclonedx-json > container-sbom.json

# Attach SBOM to container image (OCI artifact)
cosign attach sbom --sbom container-sbom.json myapp:latest

# Verify SBOM signature
cosign verify-attestation --type spdx myapp:latest
```

## License Compliance

### License Risk Levels

| Risk | Licenses | Business Impact |
|------|----------|-----------------|
| **High** | GPL, AGPL, SSPL | Copyleft, may require source disclosure |
| **Medium** | LGPL, MPL, EPL | Partial copyleft, specific requirements |
| **Low** | MIT, Apache-2.0, BSD | Permissive, minimal obligations |
| **Unknown** | No license | Legal ambiguity, avoid |

### License Scanning

```bash
# cargo-deny (Rust)
cargo deny check licenses

# licensed (Ruby)
gem install licensed
licensed cache
licensed status

# FOSSA (commercial, comprehensive)
fossa analyze

# ScanCode (open source)
scancode --license --copyright -n 4 --json-pp output.json .
```

### Configuration

```toml
# deny.toml - Rust license policy
[licenses]
unlicensed = "deny"
copyleft = "deny"
allow = [
    "MIT",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "ISC",
    "CC0-1.0",
    "Zlib",
]
deny = [
    "GPL-2.0",
    "GPL-3.0",
    "AGPL-3.0",
]
```

## Metrics and Reporting

### Key Metrics

```yaml
dependency_metrics:
  # Risk exposure
  total_dependencies: count
  direct_vs_transitive_ratio: percentage
  outdated_dependencies: count
  deprecated_dependencies: count

  # Vulnerability posture
  open_vulnerabilities_by_severity: breakdown
  mean_time_to_remediate: days
  vulnerability_aging: days_since_discovery

  # Compliance
  license_policy_violations: count
  sbom_coverage: percentage
  packages_without_lockfile: count
```

### Dependency Dashboard Example

```sql
-- Track dependency risk over time
SELECT
    week,
    COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical,
    COUNT(CASE WHEN severity = 'high' THEN 1 END) as high,
    AVG(days_to_fix) as avg_fix_time
FROM dependency_vulnerabilities
WHERE discovered_date > NOW() - INTERVAL '12 weeks'
GROUP BY week
ORDER BY week;
```

## Claude's Common Mistakes

1. **Using outdated `npm audit` alone** - Combine with Snyk or Grype for accuracy
2. **Ignoring transitive dependencies** - Most vulnerabilities are transitive
3. **Not checking EPSS/KEV** - CVSS alone doesn't indicate active exploitation
4. **Suggesting `npm audit fix --force` blindly** - Can break compatibility
5. **Missing SBOM generation** - Required for compliance and continuous monitoring
6. **Not considering reachability** - govulncheck and Snyk analyze actual usage
7. **Ignoring supply chain attacks** - Lockfile manipulation, typosquatting, maintainer takeover
8. **Not pinning versions** - Ranges allow malicious updates
9. **Skipping license scanning** - Legal risk as serious as security risk

## What NOT to Do

- Do NOT suppress vulnerabilities without documented justification and expiration
- Do NOT rely on a single scanning tool - use multiple for coverage
- Do NOT ignore low-severity findings indefinitely - they can be chained
- Do NOT upgrade blindly in production - test first
- Do NOT skip transitive dependency analysis
- Do NOT forget to scan container base images
- Do NOT disable security scans to meet release deadlines
- Do NOT use dependency scanners without NVD API key (rate limited)
- Do NOT use version ranges in production - pin exact versions
- Do NOT skip lockfile review in code review
- Do NOT install packages without checking maintainer history
- Do NOT ignore license compliance - legal risk is real
