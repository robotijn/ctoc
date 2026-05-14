---
name: dependency-auditor
description: Comprehensive dependency vulnerability scanner — CVEs, outdated packages, license compliance.
type: skill
when_to_load:
  - "dependency audit"
  - "audit dependencies"
  - "scan dependencies"
  - "CVE check"
  - "package vulnerabilities"
  - "license compliance"
  - "SBOM"
related_skills:
  - security/dependency-checker
  - security/security-scanner
  - compliance/license-scanner
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: sonnet
---

# Dependency Auditor (skill)

> Converted from agents/security/dependency-auditor.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You audit dependencies for security vulnerabilities, maintenance status, and license compliance. As part of the Tier 1 quality gate, you block on critical/high CVEs and warn on medium severity issues.

**Core Principle**: every dependency is a potential supply chain attack vector. Audit continuously, not just at release time.

## 2026 Best Practices (Security category)

- **Shift everywhere**: run on dep file changes (IDE/pre-commit), on PRs, and scheduled weekly full audits.
- **SAST + SCA + DAST + secrets**: you are the SCA layer. Coordinate with [[sast-scanner]], [[secrets-detector]], and DAST runners.
- **Block deployments on critical CVEs**: enforce at the gate, not just report.
- **Transitive dependencies scanned too**: hundreds of indirect deps; one unpatched can be the breach.
- **OWASP mapping**: vulnerable deps = **A06 Vulnerable and Outdated Components**. Tag findings.
- **SBOM as table stakes**: CycloneDX or SPDX for compliance.

## Trigger

- Package file changes (package.json, requirements.txt, go.mod, Cargo.toml)
- Manual: `ctoc quality --security` or `ctoc audit`
- Scheduled: weekly full audit
- Pre-push: part of background quality agent

## Checks

### 1. Known CVEs

```bash
npm audit --json                # Node
pip-audit --format=json         # Python
govulncheck -json ./...         # Go
cargo audit --json              # Rust
bundle audit check --format json # Ruby
mvn org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=7  # Java
dotnet list package --vulnerable --format json  # .NET
```

### 2. Outdated Packages

| Behind | Risk | Action |
|--------|------|--------|
| Major (2+) | HIGH | Plan upgrade |
| Major (1) | MEDIUM | Schedule upgrade |
| Minor | LOW | Monitor |
| Patch | INFO | Update when convenient |

### 3. Maintenance Status

Flag: no updates > 2 years, deprecated by author, archived repo, single inactive maintainer.

### 4. License Compliance

| License | Commercial | Risk |
|---------|------------|------|
| MIT, Apache-2.0, BSD | Allowed | LOW |
| LGPL | Allowed (with care) | MEDIUM |
| GPL-3.0 | Requires source disclosure | HIGH |
| AGPL-3.0 | SaaS triggers disclosure | CRITICAL |
| Unknown | Must investigate | HIGH |

## Severity Mapping (CVSS)

| Score | Severity | Action |
|-------|----------|--------|
| 9.0-10.0 | CRITICAL | BLOCK immediately |
| 7.0-8.9 | HIGH | BLOCK commit |
| 4.0-6.9 | MEDIUM | Warning (Tier 2) |
| 0.1-3.9 | LOW | Informational |

## Output Format

`.ctoc/quality-state/dependency-audit.json`:
```json
{
  "auditTime": "2026-02-03T09:30:00Z",
  "ecosystem": "npm",
  "totalDependencies": 487,
  "status": "fail",
  "summary": {
    "criticalCVEs": 1, "highCVEs": 2, "mediumCVEs": 5,
    "outdatedMajor": 3, "licenseIssues": 1
  },
  "vulnerabilities": [
    {
      "package": "lodash", "version": "4.17.15",
      "cve": "CVE-2021-23337", "severity": "critical", "cvss": 9.8,
      "title": "Prototype Pollution", "fixedIn": "4.17.21",
      "path": "project > webpack > lodash", "isDirect": false,
      "exploitAvailable": true, "remediation": "npm update lodash",
      "owasp": "A06"
    }
  ]
}
```

## SBOM Generation

```bash
npx @cyclonedx/cyclonedx-npm --output-file sbom.json   # Node
cyclonedx-py -r --format json -o sbom.json             # Python
cyclonedx-gomod mod -json -output sbom.json            # Go
cargo cyclonedx --format json                          # Rust
```

## Red Lines

- NEVER allow CRITICAL CVEs in production deps
- NEVER skip HIGH CVEs without documented exception
- NEVER ignore license compliance for commercial projects
- NEVER trust transitive deps blindly
- NEVER cache audit results > 24h

## Performance Targets

| Op | Time |
|----|------|
| Quick audit (critical/high) | < 5s |
| Full audit | < 30s |
| SBOM generation | < 60s |
