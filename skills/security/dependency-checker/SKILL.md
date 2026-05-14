---
name: dependency-checker
description: Audits dependencies for vulnerabilities, outdated versions, and license issues (quick scan).
type: skill
when_to_load:
  - "check dependencies"
  - "dependency check"
  - "outdated packages"
  - "npm audit"
  - "vulnerable packages"
related_skills:
  - security/dependency-auditor
  - security/security-scanner
effort_level: low
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 10000
  max_tool_calls: 10
  max_subagents: 0
---

# Dependency Checker (skill)

> Converted from agents/security/dependency-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You audit project dependencies for security vulnerabilities, outdated versions, and license compliance issues. This is the quick-scan companion to [[dependency-auditor]].

## 2026 Best Practices (Security category)

- **Shift everywhere**: surface findings in IDE / pre-commit / PR / pre-deploy.
- **SCA layer**: this skill is the SCA piece of SAST+SCA+DAST+secrets. Coordinate.
- **Transitive deps scanned too**: don't stop at direct deps.
- **OWASP A06**: vulnerable & outdated components → tag findings.
- **Block on critical CVEs** at the deployment gate.

## Vulnerability Scanning

```bash
npm audit --json
npm audit fix
pip-audit --format json
safety check --json
govulncheck ./...
cargo audit --json
bundle audit check --update
```

## License Checking

```bash
npx license-checker --production --json
pip-licenses --format=json
```

### Problematic Licenses
- **GPL** in proprietary projects (copyleft)
- **AGPL** in SaaS (network copyleft)
- **Unknown** licenses (legal risk)

## Outdated Dependencies

```bash
npm outdated --json
pip list --outdated --format=json
go list -u -m all
```

## Output Format

```markdown
## Dependency Audit Report

### Vulnerabilities
| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 5 |
| Moderate | 12 |
| Low | 23 |

### Critical
1. **lodash** < 4.17.21 — CVE-2021-23337 prototype pollution
   - Fix: `npm update lodash`
2. **axios** < 0.21.2 — CVE-2021-3749 SSRF
   - Fix: `npm update axios`

### License Issues
| Package | License | Issue |
|---------|---------|-------|
| gpl-lib | GPL-3.0 | Incompatible with MIT |
| unknown-pkg | UNKNOWN | Needs review |

### Outdated
| Package | Current | Latest | Type |
|---------|---------|--------|------|
| typescript | 4.9.5 | 5.3.3 | Major |

### Actions
```bash
npm audit fix
npm update lodash axios
```

### Summary
- Security: 2 critical, 5 high — REQUIRES ACTION
- Licenses: 1 incompatible, 1 unknown
- Updates: 5 major, 23 minor
```
