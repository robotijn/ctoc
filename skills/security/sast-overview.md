# SAST Overview - Static Application Security Testing
> Claude Code security correction guide. Updated February 2026.

## What SAST Is (And Isn't)

**SAST (Static Application Security Testing)** analyzes source code, bytecode, or binaries WITHOUT executing the application. It finds vulnerabilities by pattern matching, data flow analysis, and control flow analysis.

### SAST vs DAST vs IAST vs SCA

| Testing Type | When | What It Finds | False Positives |
|--------------|------|---------------|-----------------|
| **SAST** | Pre-runtime (code) | Injection, XSS, hardcoded secrets, insecure patterns | High (needs tuning) |
| **DAST** | Runtime (running app) | Auth bypass, config issues, runtime injection | Medium |
| **IAST** | Runtime (instrumented) | Real exploitable paths with context | Low |
| **SCA** | Build time (dependencies) | CVEs in dependencies, license issues | Low |

**Critical insight**: SAST alone catches ~30-40% of vulnerabilities. You need all four for comprehensive coverage.

## Tool Categories

### Commercial SAST Tools (Enterprise)
| Tool | Strengths | Languages | Integration |
|------|-----------|-----------|-------------|
| **Checkmarx** | Deep data flow, compliance | 25+ languages | Full CI/CD |
| **Veracode** | Binary analysis, SaaS | 25+ languages | IDE, CI/CD |
| **Fortify (OpenText)** | On-prem, audit trails | 30+ languages | Full CI/CD |
| **SonarQube Enterprise** | Code quality + security | 30+ languages | Full CI/CD |
| **Snyk Code** | ML-powered, fast | 10+ languages | IDE, CI/CD |
| **Semgrep Pro** | Custom rules, fast | 30+ languages | Full CI/CD |

### Open Source SAST Tools (Recommended)
| Tool | Languages | Use Case | Command |
|------|-----------|----------|---------|
| **Semgrep** | 30+ | General SAST, custom rules | `semgrep scan --config=auto` |
| **Bandit** | Python | Security linting | `bandit -r src/` |
| **Gosec** | Go | Go security | `gosec ./...` |
| **Brakeman** | Ruby/Rails | Rails apps | `brakeman -A` |
| **ESLint + security plugins** | JS/TS | Frontend security | `eslint --ext .js,.ts src/` |
| **SpotBugs + FindSecBugs** | Java | Java security | `mvn spotbugs:check` |
| **PHPStan + security rules** | PHP | PHP security | `phpstan analyse src/` |
| **Flawfinder** | C/C++ | Buffer overflows | `flawfinder src/` |
| **CodeQL** | Multiple | Deep analysis, GitHub native | `codeql analyze` |

## Integration Points

### 1. IDE Integration (Shift Left)
```yaml
# VSCode settings.json - Semgrep integration
{
  "semgrep.scan.enabled": true,
  "semgrep.scan.configuration": ["p/security-audit", "p/owasp-top-ten"],
  "semgrep.scan.onSave": true
}
```

**Benefits**: Immediate feedback, catches issues before commit
**Tools**: Semgrep LSP, SonarLint, Snyk IDE plugins

### 2. Pre-commit Hook (Gate 1)
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/semgrep/semgrep
    rev: v1.103.0
    hooks:
      - id: semgrep
        args: ['--config', 'p/security-audit', '--error']

  - repo: https://github.com/PyCQA/bandit
    rev: 1.8.0
    hooks:
      - id: bandit
        args: ['-c', 'pyproject.toml', '-r', 'src/']

  - repo: https://github.com/trufflesecurity/trufflehog
    rev: v3.88.0
    hooks:
      - id: trufflehog
        args: ['--only-verified', 'git', 'file://.']
```

### 3. CI Pipeline (Gate 2 - Blocking)
```yaml
# GitHub Actions - security-scan.yml
name: Security Scan
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for accurate analysis

      - name: Semgrep SAST
        uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/owasp-top-ten
            p/secrets
          generateSarif: true

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: semgrep.sarif

      - name: Fail on Critical/High
        run: |
          CRITICAL=$(jq '[.runs[].results[] | select(.level == "error")] | length' semgrep.sarif)
          if [ "$CRITICAL" -gt 0 ]; then
            echo "::error::Found $CRITICAL critical/high severity findings"
            exit 1
          fi
```

### 4. PR Review Integration
```yaml
# Semgrep App - comments directly on PRs
# Configure at semgrep.dev/orgs/<org>/settings
#
# Alternative: SonarQube PR decoration
# sonar.pullrequest.key=${env.PULL_REQUEST_KEY}
# sonar.pullrequest.branch=${env.PULL_REQUEST_BRANCH}
# sonar.pullrequest.base=${env.PULL_REQUEST_BASE}
```

## False Positive Management

### Triage Decision Framework
```
┌─────────────────────────────────────────────────────────────────┐
│                   FALSE POSITIVE TRIAGE                         │
├─────────────────────────────────────────────────────────────────┤
│  Is the vulnerability exploitable in YOUR context?              │
│                          │                                      │
│              ┌───────────┴───────────┐                          │
│              ▼                       ▼                          │
│            YES                      NO                          │
│              │                       │                          │
│              ▼                       ▼                          │
│         FIX IT NOW           Document reason                    │
│                               │                                 │
│                 ┌─────────────┴─────────────┐                   │
│                 ▼                           ▼                   │
│         Input is sanitized          Code unreachable            │
│         elsewhere (show proof)      (prove it)                  │
│                 │                           │                   │
│                 ▼                           ▼                   │
│         Mark as false positive      Mark as won't fix           │
│         with evidence               with evidence               │
└─────────────────────────────────────────────────────────────────┘
```

### Suppression Methods (Use Sparingly)
```python
# Method 1: Inline comment suppression (Semgrep)
# nosemgrep: python.lang.security.audit.dangerous-system-call
os.system(sanitized_cmd)  # Input validated in validate_command()

# Method 2: Rule-level exclusion in config
# semgrep.yml
rules:
  - id: my-rule
    paths:
      exclude:
        - "*_test.py"
        - "tests/*"
        - "vendor/*"

# Method 3: Finding-specific suppression (Snyk)
# .snyk
ignore:
  SNYK-PYTHON-PYYAML-590151:
    - '*':
      reason: 'yaml.safe_load used exclusively'
      expires: '2026-06-01'
```

### Suppression Audit Requirements
1. **Require justification**: Every suppression needs documented reason
2. **Set expiration**: Suppressions expire and must be re-reviewed
3. **Track in VCS**: All suppressions committed alongside code
4. **Regular review**: Monthly audit of all active suppressions
5. **Approval required**: Security team approves suppressions

## Triage Workflow

### Step 1: Automated Categorization
```yaml
# severity-mapping.yml
severity_mapping:
  critical:  # Fix within 24 hours
    - sql-injection
    - command-injection
    - path-traversal-write
    - authentication-bypass
    - hardcoded-secret-verified

  high:  # Fix within 7 days
    - xss-stored
    - ssrf
    - xxe
    - deserialization-unsafe
    - path-traversal-read

  medium:  # Fix within 30 days
    - xss-reflected
    - information-disclosure
    - weak-cryptography
    - missing-csrf-protection

  low:  # Fix within 90 days
    - verbose-error-messages
    - missing-security-headers
    - outdated-dependencies-minor
```

### Step 2: Manual Review Checklist
```markdown
## Security Finding Review: [FINDING-ID]

### 1. Validation
- [ ] Confirmed vulnerability exists in code
- [ ] Identified all affected code paths
- [ ] Determined data flow (source → sink)

### 2. Exploitability Assessment
- [ ] Is input user-controlled?
- [ ] Are there existing mitigations?
- [ ] What's the attack complexity?
- [ ] What's the required privilege level?

### 3. Impact Assessment
- [ ] Confidentiality impact (data exposure)
- [ ] Integrity impact (data modification)
- [ ] Availability impact (DoS potential)

### 4. Decision
- [ ] True Positive - Fix Required
- [ ] False Positive - Document reason
- [ ] Won't Fix - Risk accepted (approval required)

### 5. Remediation (if TP)
- Fix PR: #___
- Verification test: #___
- Review by: @___
```

## Severity Classification (CVSS-Aligned)

### Critical (CVSS 9.0-10.0) - P0
- Remote Code Execution (RCE)
- SQL Injection (data exposure/modification)
- Authentication Bypass
- Verified Hardcoded Secrets (production)
- Privilege Escalation to Admin

**SLA**: Fix within 24 hours, deploy immediately

### High (CVSS 7.0-8.9) - P1
- Stored XSS
- SSRF with internal access
- Insecure Deserialization
- XXE with file read
- Directory Traversal

**SLA**: Fix within 7 days

### Medium (CVSS 4.0-6.9) - P2
- Reflected XSS
- CSRF
- Information Disclosure
- Weak Cryptography
- Missing Authorization Checks

**SLA**: Fix within 30 days

### Low (CVSS 0.1-3.9) - P3
- Verbose Error Messages
- Missing Security Headers
- Debug Mode Enabled
- Minor Information Leakage

**SLA**: Fix within 90 days

## Complete CI Configuration Example

```yaml
# .github/workflows/security-complete.yml
name: Complete Security Scan

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

permissions:
  contents: read
  security-events: write
  pull-requests: write

jobs:
  sast:
    name: SAST Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Semgrep
        uses: semgrep/semgrep-action@v1
        with:
          config: p/security-audit p/owasp-top-ten
          generateSarif: true

      - name: CodeQL Initialize
        uses: github/codeql-action/init@v3
        with:
          languages: javascript, python

      - name: CodeQL Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: CodeQL Analyze
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{matrix.language}}"

  secrets:
    name: Secrets Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: TruffleHog
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified

  dependencies:
    name: Dependency Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  quality-gate:
    name: Security Quality Gate
    needs: [sast, secrets, dependencies]
    runs-on: ubuntu-latest
    steps:
      - name: Check Results
        run: |
          echo "All security checks passed"
```

## SAST Limitations and Bypasses

### What SAST Cannot Catch
Understanding limitations is critical for defense in depth:

| Vulnerability Class | SAST Detection | Why Limited |
|---------------------|----------------|-------------|
| Business logic flaws | Poor | No business context |
| Race conditions | Limited | Requires runtime analysis |
| Authentication bypass | Partial | Logic complexity |
| Session management | Poor | State-dependent |
| Access control | Partial | Context-dependent |
| Cryptographic implementation | Limited | Algorithm analysis |
| Memory corruption (managed langs) | N/A | Language handles |
| Supply chain attacks | None | SCA domain |

### Common SAST Bypass Techniques (Attackers Know These)
```python
# Bypass 1: Indirect execution through eval-like constructs
cmd = getattr(os, 'sys' + 'tem')  # Bypasses pattern matching
cmd(user_input)

# Bypass 2: Dynamic string construction
query = "SELECT * FROM users WHERE id = "
query += str(user_id)  # String operations can evade detection

# Bypass 3: Reflection and metaprogramming
method_name = request.args.get('method')
getattr(obj, method_name)()  # Dynamic dispatch

# Bypass 4: Encoding/decoding chains
encoded = base64.b64decode(user_input)
exec(encoded)  # Obfuscated execution

# Bypass 5: External data sources
config = yaml.safe_load(open('config.yml'))
db.execute(config['query'])  # Taint doesn't track file content
```

### Defense: Multi-Layer Detection
```yaml
# Combine rules to catch bypass attempts
rules:
  - id: dangerous-getattr
    pattern: getattr($OBJ, $INPUT)
    message: "Dynamic attribute access - verify input is safe"

  - id: dynamic-method-call
    patterns:
      - pattern: $OBJ.$METHOD()
      - metavariable-regex:
          metavariable: $METHOD
          regex: .*\$.*  # Variable method name
    message: "Dynamic method invocation"

  - id: encoded-execution
    patterns:
      - pattern: |
          $DECODED = base64.b64decode(...)
          ...
          exec($DECODED)
    message: "Encoded code execution"
```

## Incremental vs Full Scanning

### When to Use Each
| Scenario | Scan Type | Rationale |
|----------|-----------|-----------|
| PR/MR | Incremental (changed files) | Fast feedback, ~1-2 min |
| Merge to main | Incremental + security rules | Catch missed issues |
| Nightly/Weekly | Full scan | Catch cross-file issues |
| Release | Full scan + audit | Compliance, full visibility |
| Post-dependency update | Full scan | New vulnerability patterns |

### Incremental Scan Configuration
```yaml
# Semgrep incremental (diff-aware)
semgrep scan --config=auto --baseline-commit=$(git merge-base HEAD main)

# SonarQube PR analysis
sonar.pullrequest.branch=${BRANCH_NAME}
sonar.pullrequest.key=${PULL_REQUEST_ID}
sonar.pullrequest.base=main

# CodeQL incremental
# Uses GitHub's built-in diff-aware analysis automatically
```

## Custom Rule Development

### Rule Writing Best Practices
```yaml
# Good: Specific pattern with context
rules:
  - id: django-sql-injection
    patterns:
      - pattern-either:
          - pattern: |
              $QUERYSET.raw($SQL)
          - pattern: |
              $QUERYSET.extra(where=[$SQL])
      - pattern-not-inside: |
          $SQL = "..." % (...)  # Parameterized
    message: "SQL injection in Django ORM"
    severity: ERROR
    metadata:
      cwe: CWE-89
      owasp: A03:2021
      references:
        - https://docs.djangoproject.com/en/5.0/topics/security/#sql-injection-protection

# Bad: Too broad, many false positives
rules:
  - id: too-broad
    pattern: $DB.execute($QUERY)  # No context, flags safe code
```

### Testing Custom Rules
```bash
# Test rules against known-vulnerable code samples
semgrep --config=rules/ --test

# Structure your test directory
rules/
  sql-injection.yaml
  sql-injection.py     # Test file with vuln and safe code

# Test file format
# ruleid: django-sql-injection
User.objects.raw(f"SELECT * FROM users WHERE id = {user_id}")

# ok: django-sql-injection
User.objects.raw("SELECT * FROM users WHERE id = %s", [user_id])
```

## Performance Optimization

### Scan Time Reduction Techniques
```yaml
# 1. Exclude generated/vendored code
semgrep scan --exclude='**/node_modules/**' --exclude='**/vendor/**' --exclude='**/*.min.js'

# 2. Use .semgrepignore
# .semgrepignore
node_modules/
vendor/
*.min.js
*.generated.*
dist/
build/
__pycache__/

# 3. Parallel scanning
semgrep scan --jobs=4 --config=auto

# 4. Rule prioritization for CI
semgrep scan --config=p/security-audit --severity=ERROR  # Critical only for fast feedback
```

### Caching Strategies
```yaml
# GitHub Actions - cache Semgrep
- uses: actions/cache@v4
  with:
    path: ~/.cache/semgrep
    key: semgrep-${{ runner.os }}-${{ hashFiles('**/semgrep.yaml') }}

# SonarQube - incremental analysis
sonar.projectDate=${BUILD_DATE}
# Only analyzes changed files since last analysis
```

## Metrics and KPIs

### SAST Program Metrics
```yaml
security_metrics:
  # Effectiveness
  detection_rate: "% of known vulns caught"
  false_positive_rate: "% of findings that are FP"
  mean_time_to_triage: "Hours from finding to triage"
  mean_time_to_fix: "Days from triage to fix"

  # Coverage
  scanned_repos: "% of repos with SAST enabled"
  rule_coverage: "% of OWASP Top 10 covered by rules"
  language_coverage: "% of languages with tuned rules"

  # Efficiency
  scan_duration_p50: "Median scan time"
  scan_duration_p95: "95th percentile scan time"
  developer_friction: "PRs delayed by SAST issues"
```

### Dashboard Example
```sql
-- SAST findings trend (PostgreSQL)
SELECT
  date_trunc('week', created_at) as week,
  severity,
  COUNT(*) as total_findings,
  COUNT(CASE WHEN status = 'fixed' THEN 1 END) as fixed,
  COUNT(CASE WHEN status = 'false_positive' THEN 1 END) as false_positives
FROM sast_findings
WHERE created_at > NOW() - INTERVAL '12 weeks'
GROUP BY 1, 2
ORDER BY 1, 2;
```

## Claude's Common Mistakes

1. **Suggesting deprecated tools** - Use Semgrep over deprecated tools like RIPS
2. **Missing context in rules** - Custom rules need proper data flow analysis
3. **Over-suppressing** - Each suppression must have documented justification
4. **Ignoring baseline** - Always establish security baseline before adding new checks
5. **Not tuning for language** - SAST tools need language-specific configuration
6. **Ignoring SAST limitations** - SAST cannot catch business logic or runtime issues
7. **Writing overly broad rules** - Specific patterns with context reduce false positives
8. **Not testing custom rules** - Always include test cases with rules

## What NOT to Do

- Do NOT run SAST without first establishing a baseline
- Do NOT suppress findings without documented justification and expiration
- Do NOT rely solely on SAST - combine with DAST, IAST, and SCA
- Do NOT run full scans on every commit - use incremental scanning
- Do NOT ignore findings because "it's just a warning"
- Do NOT disable security scans to meet deadlines
- Do NOT use SAST results as the only security metric
- Do NOT assume SAST catches all vulnerabilities - understand its limitations
- Do NOT write custom rules without test cases
- Do NOT skip vendored/generated code exclusions - wastes time on noise
