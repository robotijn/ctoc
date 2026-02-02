# Security Quality Gates - Enforcing Security Standards in CI/CD
> Claude Code security correction guide. Updated February 2026.

## What Are Security Quality Gates?

Quality gates are automated checkpoints that **block deployments** when security or quality thresholds aren't met. They shift security left by failing fast on issues rather than discovering them in production.

### Gate Philosophy
```
┌─────────────────────────────────────────────────────────────────┐
│                    QUALITY GATE DECISION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Does code meet ALL gate conditions?                            │
│                     │                                           │
│          ┌──────────┴──────────┐                               │
│          ▼                     ▼                                │
│         YES                   NO                                │
│          │                     │                                │
│          ▼                     ▼                                │
│     GATE PASSED           GATE FAILED                          │
│     (can merge/deploy)   (blocked - fix required)              │
│                                                                 │
│  No exceptions. No "just this once." No manual overrides.      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Gate Conditions

### Condition 1: Zero Critical/Blocker Issues
```yaml
# Blockers = security vulnerabilities that enable:
# - Remote Code Execution
# - SQL Injection (data exposure)
# - Authentication Bypass
# - Hardcoded Production Secrets
# - Privilege Escalation

gate_conditions:
  blocker_issues: 0      # Zero tolerance
  critical_issues: 0     # Zero tolerance on new code
```

**Why Zero Tolerance**: A single blocker can compromise entire systems. Technical debt reasoning doesn't apply to exploitable vulnerabilities.

### Condition 2: No New Security Hotspots (Unreviewed)
```yaml
# Security hotspots = code that MIGHT be vulnerable
# Examples:
# - Cryptographic operations
# - User input handling
# - Authentication logic
# - File operations with user input

gate_conditions:
  new_security_hotspots_reviewed: true  # All must be reviewed
```

**Hotspot Review Workflow**:
1. Developer reviews flagged code
2. Marks as "Safe", "Fixed", or "False Positive"
3. Security team audits marked items periodically
4. Gate only passes when all are reviewed

### Condition 3: Code Coverage on New Code >= 80%
```yaml
gate_conditions:
  coverage_on_new_code: 80%  # Minimum 80%
```

**Why 80%**: Research shows diminishing returns above 80%. Focus testing on security-critical paths.

**Security-Critical Paths (Require 100% Coverage)**:
- Authentication functions
- Authorization checks
- Input validation
- Cryptographic operations
- Session management
- Error handling in security code

### Condition 4: Duplicated Lines < 3%
```yaml
gate_conditions:
  duplicated_lines_on_new_code: 3%  # Maximum 3%
```

**Security Relevance**: Duplicated code means duplicated security bugs and inconsistent fixes.

### Condition 5: No New Bugs on New Code
```yaml
gate_conditions:
  new_bugs: 0  # Zero new bugs
```

**Why**: Bugs often become security vulnerabilities. Null pointer exceptions become DoS vectors, type errors become injection points.

### Condition 6: Technical Debt Ratio < 5%
```yaml
gate_conditions:
  technical_debt_ratio: 5%  # Maximum 5%
```

**Technical Debt Ratio** = (remediation time / development time) x 100

**Security Relevance**: High debt correlates with security issues - rushed code skips security controls.

---

## Complete Quality Gate Configuration

### SonarQube Quality Gate Definition

```json
{
  "name": "Security-First Quality Gate",
  "conditions": [
    {
      "metric": "new_blocker_violations",
      "op": "GT",
      "error": "0"
    },
    {
      "metric": "new_critical_violations",
      "op": "GT",
      "error": "0"
    },
    {
      "metric": "new_security_hotspots_reviewed",
      "op": "LT",
      "error": "100"
    },
    {
      "metric": "new_coverage",
      "op": "LT",
      "error": "80"
    },
    {
      "metric": "new_duplicated_lines_density",
      "op": "GT",
      "error": "3"
    },
    {
      "metric": "new_bugs",
      "op": "GT",
      "error": "0"
    },
    {
      "metric": "new_vulnerabilities",
      "op": "GT",
      "error": "0"
    },
    {
      "metric": "new_sqale_debt_ratio",
      "op": "GT",
      "error": "5"
    }
  ]
}
```

### Creating via SonarQube API

```bash
# Create new quality gate
curl -X POST \
  -u admin:$SONAR_TOKEN \
  "https://sonar.example.com/api/qualitygates/create" \
  -d "name=Security-First"

# Add conditions
curl -X POST \
  -u admin:$SONAR_TOKEN \
  "https://sonar.example.com/api/qualitygates/create_condition" \
  -d "gateName=Security-First" \
  -d "metric=new_blocker_violations" \
  -d "op=GT" \
  -d "error=0"

# Set as default
curl -X POST \
  -u admin:$SONAR_TOKEN \
  "https://sonar.example.com/api/qualitygates/set_as_default" \
  -d "name=Security-First"
```

---

## CI/CD Integration

### GitHub Actions with Quality Gate

```yaml
# .github/workflows/quality-gate.yml
name: Quality Gate

on:
  pull_request:
    branches: [main, develop]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for accurate analysis

      # Run tests with coverage
      - name: Run Tests
        run: |
          npm ci
          npm run test:coverage

      # SonarQube Analysis
      - name: SonarQube Scan
        uses: SonarSource/sonarqube-scan-action@master
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
        with:
          args: >
            -Dsonar.projectKey=${{ github.repository_owner }}_${{ github.event.repository.name }}
            -Dsonar.pullrequest.key=${{ github.event.pull_request.number }}
            -Dsonar.pullrequest.branch=${{ github.head_ref }}
            -Dsonar.pullrequest.base=${{ github.base_ref }}

      # Quality Gate Check (BLOCKING)
      - name: Quality Gate Check
        uses: SonarSource/sonarqube-quality-gate-action@master
        timeout-minutes: 5
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

      # Security Scans
      - name: Semgrep SAST
        uses: semgrep/semgrep-action@v1
        with:
          config: p/security-audit p/owasp-top-ten

      - name: TruffleHog Secrets
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified --fail

      - name: Dependency Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  # Gate summary (only runs if all checks pass)
  gate-passed:
    needs: quality-gate
    runs-on: ubuntu-latest
    steps:
      - name: Gate Passed
        run: echo "All quality gates passed - ready for review"
```

### GitLab CI Quality Gate

```yaml
# .gitlab-ci.yml
stages:
  - test
  - analyze
  - gate

variables:
  SONAR_USER_HOME: "${CI_PROJECT_DIR}/.sonar"

test:
  stage: test
  script:
    - npm ci
    - npm run test:coverage
  artifacts:
    paths:
      - coverage/
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

sonarqube:
  stage: analyze
  image:
    name: sonarsource/sonar-scanner-cli:latest
    entrypoint: [""]
  script:
    - sonar-scanner
      -Dsonar.projectKey=${CI_PROJECT_PATH_SLUG}
      -Dsonar.qualitygate.wait=true
  allow_failure: false  # BLOCKING

semgrep:
  stage: analyze
  image: semgrep/semgrep
  script:
    - semgrep scan --config=p/security-audit --error
  allow_failure: false  # BLOCKING

secrets:
  stage: analyze
  image: trufflesecurity/trufflehog:latest
  script:
    - trufflehog git file://. --only-verified --fail
  allow_failure: false  # BLOCKING

quality-gate:
  stage: gate
  needs: [test, sonarqube, semgrep, secrets]
  script:
    - echo "All quality gates passed"
  rules:
    - if: $CI_MERGE_REQUEST_ID
```

### Azure DevOps Quality Gate

```yaml
# azure-pipelines.yml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

stages:
  - stage: QualityGate
    jobs:
      - job: Analyze
        steps:
          - checkout: self
            fetchDepth: 0

          - task: Npm@1
            inputs:
              command: 'ci'

          - task: Npm@1
            inputs:
              command: 'custom'
              customCommand: 'run test:coverage'

          - task: SonarQubePrepare@5
            inputs:
              SonarQube: 'SonarQube'
              scannerMode: 'CLI'
              configMode: 'manual'
              cliProjectKey: '$(Build.Repository.Name)'
              cliSources: '.'

          - task: SonarQubeAnalyze@5

          - task: SonarQubePublish@5
            inputs:
              pollingTimeoutSec: '300'

          # This task FAILS the build if quality gate fails
          - task: sonar-buildbreaker@8
            inputs:
              SonarQube: 'SonarQube'
```

---

## Security-Specific Gate Conditions

### Vulnerability Severity Gates

```yaml
# security-gate-conditions.yml
security_gates:
  # SAST Findings
  sast:
    critical: 0     # Zero critical findings
    high: 0         # Zero high findings (on new code)
    medium: 5       # Max 5 medium (with approved exceptions)
    low: unlimited  # Track but don't block

  # Dependency Vulnerabilities
  dependencies:
    critical: 0     # Zero critical CVEs
    high: 0         # Zero high CVEs
    medium: 10      # Max 10 (30-day fix window)

  # Secrets
  secrets:
    verified: 0     # Zero verified secrets (instant block)
    unverified: 0   # Zero unverified (review required)

  # Container Security
  container:
    critical: 0     # Zero critical in base image
    high: 0         # Zero high in app layers
```

### Custom Security Rules

```yaml
# Semgrep custom rules for quality gate
rules:
  - id: custom-auth-bypass
    severity: ERROR  # Will fail quality gate
    patterns:
      - pattern: |
          if $ADMIN_CHECK:
            ...
          $SENSITIVE_ACTION()
      - pattern-not-inside: |
          if is_admin($USER):
            ...

  - id: custom-sql-concatenation
    severity: ERROR  # Will fail quality gate
    pattern: |
      $DB.query("..." + $INPUT + "...")

  - id: custom-weak-crypto
    severity: ERROR  # Will fail quality gate
    pattern-either:
      - pattern: hashlib.md5(...)
      - pattern: hashlib.sha1(...)
```

---

## Gate Status Integration

### PR Decoration (SonarQube)

```properties
# sonar-project.properties
sonar.pullrequest.provider=github
sonar.pullrequest.github.repository=owner/repo
sonar.pullrequest.github.endpoint=https://api.github.com

# For PR analysis
sonar.pullrequest.key=${env.PULL_REQUEST_KEY}
sonar.pullrequest.branch=${env.PULL_REQUEST_BRANCH}
sonar.pullrequest.base=${env.PULL_REQUEST_BASE}
```

### Status Checks Configuration

```yaml
# GitHub Branch Protection Rules (via API)
# PUT /repos/{owner}/{repo}/branches/{branch}/protection
{
  "required_status_checks": {
    "strict": true,  # Require branch to be up to date
    "contexts": [
      "quality-gate",
      "sonarqube-quality-gate",
      "semgrep",
      "trufflehog",
      "dependency-scan"
    ]
  },
  "enforce_admins": true,  # Even admins can't bypass
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

### Slack/Teams Notifications

```yaml
# GitHub Actions notification on failure
- name: Notify on Gate Failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": ":x: Quality Gate Failed",
        "attachments": [{
          "color": "danger",
          "fields": [
            {"title": "Repository", "value": "${{ github.repository }}", "short": true},
            {"title": "PR", "value": "#${{ github.event.pull_request.number }}", "short": true},
            {"title": "Author", "value": "${{ github.event.pull_request.user.login }}", "short": true},
            {"title": "Failed Checks", "value": "See PR for details", "short": false}
          ]
        }]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_SECURITY_WEBHOOK }}
```

---

## Exception Handling

### When Exceptions Are Appropriate

| Scenario | Exception Allowed? | Process |
|----------|-------------------|---------|
| False positive confirmed | Yes | Document in suppression file with justification |
| Vulnerability in unused code path | Yes (temporary) | Set 30-day deadline to remove or fix |
| Third-party dependency, no fix available | Yes | Document, add monitoring, set review date |
| "We need to ship" pressure | **NO** | Never compromise security gates |
| "It's just internal" | **NO** | Internal apps are attack vectors |
| "We'll fix it next sprint" | **NO** | Fix now or don't merge |

### Exception Request Process

```yaml
# .security/exceptions/CVE-2024-XXXX.yml
exception:
  id: EXC-2024-001
  type: vulnerability
  cve: CVE-2024-XXXX
  package: example-lib@1.2.3

  justification: |
    The vulnerable function is not called in our codebase.
    Verified by code analysis and grep.

  evidence:
    - type: code_search
      command: "grep -r 'vulnerable_function' src/"
      result: "No matches found"

  mitigations:
    - description: "WAF rule blocking exploitation pattern"
      implemented: true

  approved_by: "@security-lead"
  approved_date: "2026-02-01"
  expiration: "2026-03-01"  # 30 days max

  review_requirements:
    - Check if patch available
    - Re-verify code paths
    - Update if mitigation status changes
```

### Exception Tracking Dashboard

```sql
-- Exception metrics query
SELECT
  exception_type,
  COUNT(*) as total_exceptions,
  COUNT(CASE WHEN expiration < CURRENT_DATE THEN 1 END) as expired,
  COUNT(CASE WHEN created_date > CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_last_30_days,
  AVG(EXTRACT(days FROM expiration - created_date)) as avg_exception_duration
FROM security_exceptions
GROUP BY exception_type;
```

---

## Metrics and Reporting

### Key Quality Gate Metrics

```yaml
# Track these metrics over time
quality_metrics:
  # Gate effectiveness
  - gate_failure_rate_per_pr
  - time_to_fix_after_gate_failure
  - false_positive_rate

  # Security posture
  - open_vulnerabilities_by_severity
  - mean_time_to_remediate (MTTR)
  - security_debt_days

  # Code quality
  - coverage_trend
  - duplication_trend
  - technical_debt_ratio_trend

  # Developer experience
  - gate_check_duration
  - developer_friction_score
```

### Dashboard Query Examples

```promql
# Prometheus metrics for quality gate

# Gate pass rate
rate(quality_gate_passed_total[7d]) /
rate(quality_gate_evaluated_total[7d]) * 100

# Mean time to fix gate failures
avg(quality_gate_fix_duration_seconds) by (team)

# Security findings trend
sum(security_findings_total) by (severity, project)

# Coverage trend
avg(code_coverage_percent) by (project)
```

### SonarQube Measures API

```bash
# Get quality gate status for a project
curl -u $SONAR_TOKEN: \
  "https://sonar.example.com/api/qualitygates/project_status?projectKey=myproject"

# Get metrics for a project
curl -u $SONAR_TOKEN: \
  "https://sonar.example.com/api/measures/component?component=myproject&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density"

# Get security hotspots
curl -u $SONAR_TOKEN: \
  "https://sonar.example.com/api/hotspots/search?projectKey=myproject&status=TO_REVIEW"
```

---

## Tuning Quality Gates

### Start Strict, Loosen If Needed

```yaml
# Phase 1: Introduction (Month 1)
# Focus on most critical checks
phase_1:
  critical_vulnerabilities: 0
  verified_secrets: 0
  # Other checks as warnings only

# Phase 2: Expansion (Month 2-3)
# Add more conditions
phase_2:
  critical_vulnerabilities: 0
  high_vulnerabilities: 0
  verified_secrets: 0
  coverage_on_new_code: 70%

# Phase 3: Full Enforcement (Month 4+)
# Full quality gate
phase_3:
  critical_vulnerabilities: 0
  high_vulnerabilities: 0
  verified_secrets: 0
  coverage_on_new_code: 80%
  duplicated_lines: 3%
  new_bugs: 0
  security_hotspots_reviewed: 100%
```

### Team-Specific Gates

```yaml
# Different gates for different risk levels
quality_gates:
  # High-risk services (payments, auth, PII)
  high_risk:
    coverage: 90%
    vulnerabilities: 0  # Any severity
    hotspots: 100% reviewed

  # Standard services
  standard:
    coverage: 80%
    critical_vulnerabilities: 0
    high_vulnerabilities: 0
    hotspots: 100% reviewed

  # Internal tools
  internal:
    coverage: 70%
    critical_vulnerabilities: 0
    hotspots: 50% reviewed  # Lower but still required
```

---

## Gate Bypass Attempts (What to Watch For)

### Common Bypass Patterns

```yaml
# Bypasses to detect and prevent
bypass_patterns:
  # Code-level bypasses
  code:
    - "Splitting large PRs to stay under thresholds"
    - "Adding // nosemgrep or similar suppressions"
    - "Excluding files via .gitattributes"
    - "Moving code to 'excluded' directories"
    - "Committing directly to main (requires branch protection)"

  # Process bypasses
  process:
    - "Emergency deploy without gates"
    - "Admin override on status checks"
    - "Merge without required reviews"
    - "Creating exceptions without approval"

  # Technical bypasses
  technical:
    - "Deleting failing test files"
    - "Marking tests as @skip"
    - "Reducing coverage requirements via config"
    - "Using --no-verify on git commit"
```

### Detection and Prevention

```yaml
# GitHub Actions - Detect suppression abuse
- name: Check for excessive suppressions
  run: |
    SUPPRESSIONS=$(grep -r "nosemgrep\|# noqa\|@SuppressWarnings" --include="*.py" --include="*.java" --include="*.js" . | wc -l)
    if [ "$SUPPRESSIONS" -gt 10 ]; then
      echo "::warning::High number of security suppressions ($SUPPRESSIONS)"
    fi

# Audit suppression additions in PR
- name: New suppressions require justification
  run: |
    git diff origin/main...HEAD | grep -E "nosemgrep|# noqa|@SuppressWarnings" && \
      echo "::error::New suppressions found - add justification in PR description"
```

### Branch Protection Enforcement

```bash
# GitHub API - Enforce branch protection
gh api repos/{owner}/{repo}/branches/main/protection -X PUT \
  -F enforce_admins=true \
  -F required_status_checks='{"strict":true,"contexts":["quality-gate"]}' \
  -F required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":true}' \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -F lock_branch=false

# Prevent direct pushes to main
# This cannot be bypassed even by admins if enforce_admins=true
```

## Performance Optimization

### Reducing Gate Check Time

```yaml
# Parallel execution strategy
jobs:
  # These run in parallel (independent checks)
  sast:
    runs-on: ubuntu-latest
    # ~2 minutes
  secrets:
    runs-on: ubuntu-latest
    # ~1 minute
  dependencies:
    runs-on: ubuntu-latest
    # ~1 minute
  tests:
    runs-on: ubuntu-latest
    # ~5 minutes

  # This waits for all above
  quality-gate:
    needs: [sast, secrets, dependencies, tests]
    runs-on: ubuntu-latest
    # Total time: ~5 minutes (parallel) instead of ~9 minutes (sequential)
```

### Incremental Analysis

```yaml
# Only analyze changed files in PRs
- name: Get changed files
  id: changed
  uses: tj-actions/changed-files@v44
  with:
    files: |
      **/*.py
      **/*.js

- name: Semgrep (changed files only)
  if: steps.changed.outputs.any_changed == 'true'
  run: |
    semgrep scan --config=auto ${{ steps.changed.outputs.all_changed_files }}
```

### Caching for Speed

```yaml
# Cache SonarQube analysis
- uses: actions/cache@v4
  with:
    path: ~/.sonar/cache
    key: sonar-${{ runner.os }}-${{ hashFiles('**/sonar-project.properties') }}

# Cache Semgrep rules
- uses: actions/cache@v4
  with:
    path: ~/.cache/semgrep
    key: semgrep-${{ runner.os }}-${{ hashFiles('.semgrep.yml') }}

# Cache dependency vulnerability database
- uses: actions/cache@v4
  with:
    path: ~/.cache/grype
    key: grype-db-${{ github.run_number }}
    restore-keys: grype-db-
```

## Multi-Repository Gates

### Monorepo Strategy

```yaml
# Run gates only for affected packages
- name: Determine affected packages
  id: affected
  run: |
    CHANGED=$(git diff --name-only origin/main...HEAD)
    echo "packages=$(echo $CHANGED | grep -oE 'packages/[^/]+' | sort -u | tr '\n' ',')" >> $GITHUB_OUTPUT

- name: Run gates for affected packages
  run: |
    for pkg in $(echo "${{ steps.affected.outputs.packages }}" | tr ',' '\n'); do
      npm run quality-gate --workspace=$pkg
    done
```

### Cross-Repository Dependencies

```yaml
# Trigger downstream gates on library changes
on:
  repository_dispatch:
    types: [dependency-updated]

jobs:
  revalidate:
    runs-on: ubuntu-latest
    steps:
      - name: Re-run quality gate with updated dependency
        run: |
          npm update ${{ github.event.client_payload.package }}
          npm run quality-gate
```

## Rollback Strategy

### When Gates Fail After Merge

```yaml
# Automated rollback for production failures
- name: Check production health
  id: health
  run: |
    # Health check endpoint
    if ! curl -sf https://api.example.com/health; then
      echo "healthy=false" >> $GITHUB_OUTPUT
    fi

- name: Rollback if unhealthy
  if: steps.health.outputs.healthy == 'false'
  run: |
    # Revert to previous release
    git revert HEAD --no-edit
    git push origin main

    # Alert on-call
    curl -X POST $SLACK_WEBHOOK -d '{"text":"Automated rollback triggered"}'
```

## Compliance Reporting

### Gate Status Reports

```python
# Generate compliance report from gate results
def generate_compliance_report(project_key: str, period: str):
    """Generate SOC2/PCI-DSS compliance evidence from gate data."""

    gates = sonar_api.get_gate_history(project_key, period)

    report = {
        "period": period,
        "project": project_key,
        "total_builds": len(gates),
        "passed": sum(1 for g in gates if g["status"] == "OK"),
        "failed": sum(1 for g in gates if g["status"] == "ERROR"),

        # Compliance metrics
        "zero_critical_vulns": all(g["critical"] == 0 for g in gates),
        "coverage_maintained": all(g["coverage"] >= 80 for g in gates),
        "secrets_detected": sum(g.get("secrets", 0) for g in gates),

        # Evidence for auditors
        "gate_configs": sonar_api.get_gate_config(project_key),
        "bypass_attempts": 0,  # From audit log
        "exceptions_active": len(get_active_exceptions(project_key)),
    }

    return report
```

### Audit Trail

```sql
-- Quality gate audit log schema
CREATE TABLE quality_gate_audit (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    project_key VARCHAR(255),
    gate_status VARCHAR(50),
    triggered_by VARCHAR(255),
    commit_sha VARCHAR(40),
    branch VARCHAR(255),
    conditions JSONB,  -- All conditions evaluated
    passed_conditions JSONB,
    failed_conditions JSONB,
    override_requested BOOLEAN DEFAULT FALSE,
    override_approved_by VARCHAR(255),
    override_reason TEXT
);

-- Query for compliance audit
SELECT
    DATE_TRUNC('month', timestamp) as month,
    COUNT(*) as total_evaluations,
    SUM(CASE WHEN gate_status = 'OK' THEN 1 ELSE 0 END) as passed,
    SUM(CASE WHEN override_approved_by IS NOT NULL THEN 1 ELSE 0 END) as exceptions
FROM quality_gate_audit
WHERE timestamp > NOW() - INTERVAL '12 months'
GROUP BY 1
ORDER BY 1;
```

## Claude's Common Mistakes

1. **Setting coverage too low** - 80% is industry standard for quality code
2. **Allowing "temporary" gate bypasses** - Temporary becomes permanent
3. **Not blocking on high-severity findings** - Only blocking critical misses real risks
4. **Missing hotspot review requirement** - Hotspots need human judgment
5. **Separating security from quality** - Security is quality
6. **Gate checks taking too long** - Use incremental analysis for speed
7. **Not detecting bypass attempts** - Monitor for suppression abuse
8. **Missing compliance evidence** - Gates should generate audit trails
9. **No rollback strategy** - Plan for gate failures after merge

## What NOT to Do

- Do NOT allow gate bypasses for deadlines
- Do NOT set thresholds so high they're never met (creates workarounds)
- Do NOT ignore gate failures "just this once"
- Do NOT exclude security tests from gates
- Do NOT create gates without enforcement
- Do NOT run gate checks only on merge (run on PR)
- Do NOT forget to track exceptions with expirations
- Do NOT make exceptions without documented justification
- Do NOT allow admins to bypass gates
- Do NOT run all checks sequentially - parallelize for speed
- Do NOT skip audit logging of gate decisions
- Do NOT trust that gates cannot be bypassed - monitor actively
