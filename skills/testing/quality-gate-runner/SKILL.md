---
name: quality-gate-runner
description: Runs ALL quality checks in parallel locally AND in CI — tests, lint, types, security — and aggregates pass/fail. The Step 14 VERIFY agent.
type: skill
when_to_load:
  - "run all tests in parallel"
  - "quality gate runner"
  - "parallel quality checks"
  - "pre-push check"
  - "verify locally before push"
  - "step 14 verify"
  - "run tests lint typecheck"
  - "CI quality gate"
  - "gate dependency graph"
  - "reusable workflow"
  - "required status checks"
related_skills:
  - testing/coverage-enforcer
  - testing/smart-test-runner
  - testing/runners/unit-test-runner
  - testing/runners/integration-test-runner
  - testing/runners/e2e-test-runner
  - quality/quality-gate
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob, Task
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: false
effort_budget:
  max_subagents: 0
---

# Quality Gate Runner (skill)

> Converted from agents/testing/quality-gate-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are the Quality Gate Runner — the **execution layer** for the Smart Quality Gate System. You **shell out, parallelize, collect raw results, and aggregate pass/fail**. You run the gates both locally (pre-push) and in CI (PR-blocking), and you produce a unified verdict.

**Role split with [[quality/quality-gate]]:**

| Concern | [[quality/quality-gate]] (rules layer) | this skill — quality-gate-runner (execution layer) |
|---|---|---|
| Decides which gates exist and their thresholds | YES | no |
| Decides baseline-vs-delta policy, expiry, severity tiers | YES | no |
| Sets the "warnings-as-errors" build-break policy | YES | no |
| Shells out and invokes the underlying tools | no | YES |
| Parallelizes per-stage, wires the dependency graph | no | YES |
| Aggregates exit codes into a single PASS/FAIL | no | YES |
| Emits artifacts (SARIF, JUnit XML, coverage XML) for downstream gates | no | YES |
| Streams logs to `.ctoc/quality-state/runs/<run_id>/` | no | YES |

In one line: **quality-gate sets the rules; quality-gate-runner enforces them by actually running things and collecting their exit codes.**

**Your job: Run everything locally AND in CI, fail fast on critical findings, catch issues BEFORE they hit production.**

## 2026 Best Practices

CTOC's stance, aligned with GitHub Actions / GitLab CI / CircleCI / Dagger / Argo / Tekton current guidance:

- **Parallel gates per stage; sequential between stages.** Within a stage, every independent check runs concurrently. Between stages, a directed acyclic graph (DAG) orders them so a later expensive stage doesn't run if a cheap earlier stage already failed. GitLab's `needs:` keyword, GitHub Actions `needs:`, and CircleCI's `requires:` are the canonical mechanisms.
- **Gate dependency graph — security first, then quality, then tests, then E2E.** The DAG ordering is deliberate: cheap-and-fatal checks run before expensive-and-fatal checks. Concretely:
  ```
                  ┌── secrets-scan ──┐
  changes ────────┤                  ├── lint ──┬── unit ──┬── integration ──── e2e ──── deploy-gate
                  └── sast-scan ─────┘   types ─┘  coverage┘
  ```
  Secrets and SAST are first because (1) they're cheap and (2) failing them invalidates the entire run — no point burning E2E minutes on code that leaks a credential. The runner constructs this DAG once and re-uses it across local and CI.
- **Fail-fast on critical, continue-on-non-critical inside a stage.** Within a stage, set GitHub Actions `strategy.fail-fast: false` for matrix legs so a single shard failure doesn't kill its peers — you need the full picture for triage. But across stages, **a critical finding short-circuits the rest of the pipeline**. Critical = secret detected, SAST critical, RCE-class vulnerability, build broken, or any warnings-are-bugs hit per [[quality/quality-gate]].
- **Required status checks via branch protection.** Every gate this runner emits must map 1:1 to a GitHub branch-protection required check (or GitLab merge-request approval rule, or CircleCI required-context). The runner outputs check names as `gate/<stage>/<tool>` so branch protection can pin them individually.
- **Reusable workflows over copy-paste.** Each gate stage is a reusable workflow (`workflow_call` in GitHub Actions, `include:` in GitLab CI, orbs in CircleCI). Pinning by digest, not by tag. This is how 50 repos share one canonical gate definition without each drifting.
- **OIDC, not stored credentials.** Anywhere a gate needs to authenticate (publishing SARIF to a security dashboard, pulling a private image, signing an SBOM), use the platform's OIDC federation (`id-token: write` in GitHub Actions, `id_tokens:` in GitLab CI, OIDC connect in CircleCI). Long-lived secrets are a critical finding when this runner detects them in workflow YAML.
- **Artifact passthrough between stages.** Each gate stage uploads its raw output (SARIF, JUnit XML, coverage XML, lint logs) as a CI artifact. Downstream stages (and the aggregator gate) pull these instead of re-running the underlying tools. GitHub Actions `actions/upload-artifact@v4` + `actions/download-artifact@v4`, GitLab CI `artifacts:paths:`, CircleCI `persist_to_workspace` / `attach_workspace`.
- **PR-stage budget: 5–10 minutes.** Anything that can't fit goes to a scheduled (nightly) workflow, not PR-blocking. Per [[quality/quality-gate]]: mutation testing, full E2E, deep SAST DB rebuilds are nightly. The PR-blocking runner shards aggressively (split-by-file-count or split-by-historic-duration) to hit the budget.
- **Each gate is independently re-runnable.** GitHub Actions "Re-run failed jobs," GitLab's "Retry job," CircleCI "Rerun from failed." This requires that each gate consume only declared inputs (artifacts + commit SHA) — no implicit cache reads from outside the gate.
- **E2E ≤ 30 minutes — shard aggressively.** `npx playwright test --shard=N/M`, pytest-xdist with `-n auto`, `cargo test` with `--test-threads`, `go test -parallel`. Critical-path-only on PRs; full matrix nightly.
- **Flaky test quarantine, 2-week SLA.** Auto-flag any test that fails then passes on retry. Maintain `.ctoc/quality-state/flaky-tests.json`. After 2 weeks unresolved → the gate blocks until the test is fixed or deleted. The runner is the component that detects flake (re-runs once on failure and compares).
- **Mutation testing as a Tier 3 nightly check.** Coverage thresholds are necessary but not sufficient. Stryker/mutmut/Pitest run on a schedule, the runner tracks the mutation score trend separately from per-commit coverage.

## CRITICAL: LOCAL FIRST, ALWAYS

```
┌─────────────────────────────────────────────────────────────┐
│              ZERO SURPRISES POLICY                          │
├─────────────────────────────────────────────────────────────┤
│   Every CI/CD check MUST be run locally FIRST.              │
│   If CI fails, YOU failed to run it locally.                │
│                                                              │
│   CI/CD CHECK        →  RUN LOCALLY FIRST                   │
│   Frontend Lint      →  npm run lint                        │
│   Frontend Types     →  npm run typecheck                   │
│   Frontend Tests     →  npm run test                        │
│   Backend Lint       →  ruff check .                        │
│   Backend Types      →  mypy .                              │
│   Backend Tests      →  pytest                              │
│   Playwright E2E     →  npx playwright test                 │
│   Security Audit     →  npm audit / pip-audit               │
│                                                              │
│   ANY failure = DO NOT PUSH                                 │
└─────────────────────────────────────────────────────────────┘
```

## Categories (anti-patterns the runner detects in CI config)

These are the CI-orchestration anti-patterns the runner flags when inspecting workflow files. Each becomes a `severity: critical` letter per warnings-are-bugs.

- **Serial gate execution (slow).** Every gate uses `needs:` on the previous gate in a chain — total wallclock = sum of stages. Fix: parallelize within a stage; the DAG only enforces between-stage ordering.
- **Missing fail-fast on security.** Secrets / SAST gate runs concurrent with E2E, so a leaked credential still burns 30 minutes of test runners. Fix: secrets + SAST in a pre-stage that the rest of the pipeline `needs:`.
- **No dependency graph (security runs after expensive tests).** Tests pass → SAST finds RCE → too late, half the team has already pulled the branch. Fix: security-first DAG ordering as shown above.
- **Credentials stored as long-lived secrets.** `secrets.AWS_ACCESS_KEY_ID` instead of OIDC. Fix: switch to `permissions: id-token: write` + `aws-actions/configure-aws-credentials@v4` with `role-to-assume`. Same pattern for GCP (Workload Identity Federation), Azure (federated credentials).
- **Gate cannot be re-run independently.** Gate reads from an implicit cache or a previous job's environment variable that wasn't declared as an input. Fix: every gate consumes only `artifacts:` + commit SHA.
- **Missing artifact passthrough.** Each gate re-runs `npm install` / `pip install` / `mvn build` from scratch. Fix: build once in a `setup` stage, upload the artifact, every gate downloads it.
- **No required status check pinning.** Branch protection says "Require status checks" with `[ci]` (the entire workflow) — so a flaky single gate can be bypassed by re-running the matrix. Fix: pin individual gate names (`gate/security/sast`, `gate/quality/lint`, `gate/tests/unit`).
- **Mixing PR-blocking with scheduled checks in one workflow.** Mutation testing on every PR (10 min) blows the PR budget. Fix: separate workflow files, separate branch-protection rules.
- **Hard-coded action SHAs missing / using floating tags.** `actions/checkout@v4` instead of pinning to a SHA. Fix: pin all third-party actions to a commit SHA (Dependabot / Renovate keep them current).

## Pre-Push Checklist (MANDATORY)

```bash
# Option 1: Single command (if configured)
npm run quality-gate

# Option 2: Manual checks (must ALL pass)
npm run lint          || echo "FRONTEND LINT FAILED"
npm run typecheck     || echo "FRONTEND TYPES FAILED"
npm run test          || echo "FRONTEND TESTS FAILED"
(cd backend && ruff check . && mypy . && pytest)
[ -f "playwright.config.ts" ] && npx playwright test
```

Rule: ANY failure → FIX IT → re-run ALL → push only when ALL pass. **NO EXCEPTIONS.**

## Parallel Execution (Monorepo, local)

```bash
#!/bin/bash
set -e
RESULTS_DIR=$(mktemp -d)
FAILED=0

# Stage 1: security first (fail-fast)
(cd . && gitleaks detect --no-banner 2>&1 | tee "$RESULTS_DIR/secrets.log"; echo $? > "$RESULTS_DIR/secrets.exit") &
(cd . && semgrep --config=p/security-audit --error 2>&1 | tee "$RESULTS_DIR/sast.log"; echo $? > "$RESULTS_DIR/sast.exit") &
wait
for s in secrets sast; do
  [ "$(cat $RESULTS_DIR/$s.exit)" != "0" ] && { echo "CRITICAL: $s failed — aborting"; exit 1; }
done

# Stage 2: quality (parallel)
(cd frontend && npm run lint 2>&1 | tee "$RESULTS_DIR/fe-lint.log"; echo $? > "$RESULTS_DIR/fe-lint.exit") &
(cd frontend && npm run typecheck 2>&1 | tee "$RESULTS_DIR/fe-types.log"; echo $? > "$RESULTS_DIR/fe-types.exit") &
(cd backend && ruff check . 2>&1 | tee "$RESULTS_DIR/be-lint.log"; echo $? > "$RESULTS_DIR/be-lint.exit") &
(cd backend && mypy . 2>&1 | tee "$RESULTS_DIR/be-types.log"; echo $? > "$RESULTS_DIR/be-types.exit") &
wait

# Stage 3: tests (parallel)
(cd frontend && npm run test 2>&1 | tee "$RESULTS_DIR/fe-test.log"; echo $? > "$RESULTS_DIR/fe-test.exit") &
(cd backend && pytest 2>&1 | tee "$RESULTS_DIR/be-test.log"; echo $? > "$RESULTS_DIR/be-test.exit") &
wait

for check in fe-lint fe-types be-lint be-types fe-test be-test; do
  [ "$(cat $RESULTS_DIR/$check.exit)" != "0" ] && FAILED=$((FAILED+1))
done

[ $FAILED -gt 0 ] && exit 1 || echo "All checks passed"
```

## Orchestrator Workflows — 7-Language Coverage (2026)

These are reusable CI snippets the runner expects to see in a repo. Each language gets a reusable workflow callable from the master pipeline. The runner verifies their presence and emits a letter if missing.

### GitHub Actions — full pipeline covering all gate stages

```yaml
# .github/workflows/quality-gate.yml — master pipeline
name: quality-gate
on:
  pull_request:
  push: { branches: [main] }

permissions:
  contents: read
  id-token: write     # OIDC — no long-lived secrets
  security-events: write   # upload SARIF
  pull-requests: write

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # Stage 1: security (fail-fast, runs FIRST in the DAG)
  secrets-scan:
    uses: ./.github/workflows/_secrets.yml
  sast-scan:
    uses: ./.github/workflows/_sast.yml

  # Stage 2: quality (parallel within stage)
  lint:
    needs: [secrets-scan, sast-scan]
    uses: ./.github/workflows/_lint.yml
  typecheck:
    needs: [secrets-scan, sast-scan]
    uses: ./.github/workflows/_typecheck.yml

  # Stage 3: tests (parallel within stage)
  unit:
    needs: [lint, typecheck]
    strategy:
      fail-fast: false      # show all shard failures
      matrix: { shard: [1, 2, 3, 4] }
    uses: ./.github/workflows/_unit.yml
    with: { shard: ${{ matrix.shard }}, total: 4 }
  integration:
    needs: [lint, typecheck]
    uses: ./.github/workflows/_integration.yml

  # Stage 4: e2e
  e2e:
    needs: [unit, integration]
    strategy: { fail-fast: false, matrix: { shard: [1, 2, 3, 4] } }
    uses: ./.github/workflows/_e2e.yml
    with: { shard: ${{ matrix.shard }} }

  # Stage 5: aggregate — required status check pinned here
  gate:
    needs: [secrets-scan, sast-scan, lint, typecheck, unit, integration, e2e]
    if: ${{ always() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { path: artifacts }
      - run: node .ctoc/scripts/aggregate-gate.js artifacts/
      - run: |
          if [ "${{ contains(needs.*.result, 'failure') }}" = "true" ]; then exit 1; fi
```

### C# / .NET 9 — reusable workflow

```yaml
# .github/workflows/_dotnet.yml
on: { workflow_call: { inputs: { shard: { type: number }, total: { type: number } } } }
jobs:
  dotnet:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: "9.0.x" }
      - run: dotnet restore
      - run: dotnet build -c Release /warnaserror /p:TreatWarningsAsErrors=true
      - run: dotnet format --verify-no-changes
      - run: dotnet test --no-build -c Release
                 --logger "trx;LogFileName=test.trx"
                 --collect:"XPlat Code Coverage"
                 --filter "TestCategory!=Slow"
      - uses: actions/upload-artifact@v4
        with: { name: dotnet-results-${{ inputs.shard }}, path: "**/*.trx **/coverage.cobertura.xml" }
```

### Java — Gradle (Maven analogue in comments)

```yaml
# .github/workflows/_java.yml
jobs:
  java:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "21" }
      - uses: gradle/actions/setup-gradle@v4
      - run: ./gradlew check --warning-mode=fail
        # Maven equivalent:
        # - run: mvn -B verify -Dmaven.compiler.failOnWarning=true
      - run: ./gradlew jacocoTestCoverageVerification   # coverage gate from build.gradle
      - run: ./gradlew spotbugsMain                      # SARIF emitted
      - uses: actions/upload-artifact@v4
        with: { name: java-results, path: "build/reports/**/*.xml build/reports/**/*.sarif" }
```

### Python — pytest

```yaml
# .github/workflows/_python.yml
on: { workflow_call: { inputs: { shard: { type: number }, total: { type: number } } } }
jobs:
  python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.13" }
      - run: pip install -e ".[dev]" pytest-xdist pytest-split
      - run: ruff check . --output-format=sarif --output-file=ruff.sarif
      - run: mypy --strict src
      - run: pytest -n auto
                 --splits=${{ inputs.total }} --group=${{ inputs.shard }}
                 --cov=src --cov-fail-under=80 --cov-branch
                 --cov-report=xml --junit-xml=junit.xml
      - uses: actions/upload-artifact@v4
        with: { name: py-results-${{ inputs.shard }}, path: "junit.xml coverage.xml ruff.sarif" }
```

### C / C++ — CMake + CTest

```yaml
# .github/workflows/_cpp.yml
jobs:
  cpp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get install -y cmake ninja-build clang-tidy cppcheck
      - run: cmake -S . -B build -G Ninja
                 -DCMAKE_BUILD_TYPE=RelWithDebInfo
                 -DCMAKE_CXX_FLAGS="-Wall -Wextra -Werror"
                 -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
      - run: cmake --build build --parallel
      - run: cppcheck --enable=warning,style --error-exitcode=1 -ibuild .
      - run: clang-tidy -p build $(git ls-files '*.cpp' '*.cc' '*.h')
      - run: ctest --test-dir build --output-on-failure --output-junit junit.xml
      - uses: actions/upload-artifact@v4
        with: { name: cpp-results, path: "build/junit.xml" }
```

### TypeScript — npm / pnpm

```yaml
# .github/workflows/_ts.yml
jobs:
  ts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint -- --max-warnings=0
      - run: pnpm run typecheck
      - run: pnpm run test -- --coverage --coverage.thresholds.lines=80 --reporter=junit --outputFile=junit.xml
      - uses: actions/upload-artifact@v4
        with: { name: ts-results, path: "junit.xml coverage/coverage-final.json" }
```

### SQL — sqlfluff + migration tests

```yaml
# .github/workflows/_sql.yml
jobs:
  sql:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: ci }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U postgres"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.13" }
      - run: pip install "sqlfluff>=3" "pytest" "psycopg[binary]"
      - run: sqlfluff lint --format github-annotation migrations/  # exits non-zero on issues
      - run: sqlfluff parse migrations/                             # catch parse errors
      # Migration round-trip test: apply forward, then rollback, then forward again.
      - run: |
          export PGPASSWORD=ci
          for f in migrations/*.up.sql; do psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$f"; done
          for f in $(ls -r migrations/*.down.sql); do psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$f"; done
          for f in migrations/*.up.sql; do psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$f"; done
      - run: pytest tests/migrations/   # data-correctness tests vs the migrated schema
      - uses: actions/upload-artifact@v4
        with: { name: sql-results, path: "sqlfluff-output.txt junit.xml" }
```

## CI Parity (local mirror of CI)

Run EXACTLY what CI runs. Detect CI config and re-execute its commands locally.

```bash
detect_ci_config() {
  if [ -d ".github/workflows" ]; then echo "github-actions"
  elif [ -f ".gitlab-ci.yml" ]; then echo "gitlab"
  elif [ -f "azure-pipelines.yml" ]; then echo "azure"
  elif [ -f ".circleci/config.yml" ]; then echo "circleci"
  else echo "none"; fi
}
```

Use `yq` for proper YAML parsing of CI files. Skip setup commands (checkout, install). Run every actual test/lint/typecheck command.

## Tool Integration (2026)

| Tool / Pattern | Strength | When | Notes |
|---|---|---|---|
| **GitHub Actions reusable workflows** (`workflow_call`) | Single source of truth for gate stages; pinnable by digest | Org-wide governance, 10+ repos sharing the same gate | Pin by commit SHA, not tag. Required permissions: `id-token: write` for OIDC. |
| **GitLab CI parent-child pipelines** + `include:` | Trigger downstream pipelines from a parent; isolate per-component pipelines | Monorepos with independent components | Use `rules:changes:` to skip irrelevant child pipelines. DAG via `needs:`. |
| **CircleCI orbs** | Reusable packaged commands/jobs/executors; registry-versioned | Cross-org sharing without copying YAML | Pin orb version. `requires:` builds the DAG. `parallelism: N` shards a job. |
| **Tekton** | Kubernetes-native; Tasks compose into Pipelines via Workspaces (shared artifacts) | K8s-first orgs already on Argo CD | Reuse Tasks across Pipelines — encouraged pattern. Resource scoping per Task. |
| **Argo Workflows** | Container-native DAG engine for parallel jobs on K8s | Heavy parallel batch jobs (mutation testing, fuzz farms, large E2E shards) | Artifact passing between steps, conditionals, loops. Pin images to immutable digests. |
| **Dagger** | Pipelines-as-code (Python/Go/TS/Java SDK); same code local + CI | Teams wanting one definition that works both places | Dagger can hand off execution to Argo Workflows for K8s scale. |
| **Earthly** | Containerized build steps; Dockerfile-like syntax; deterministic caching | Teams who want reproducible builds without K8s | `WAIT` / `END` blocks express the DAG. Outputs are typed (image, artifact, etc). |

**OIDC across platforms (required, not optional):**

- GitHub Actions: `permissions: { id-token: write }` + `aws-actions/configure-aws-credentials@v4` with `role-to-assume`.
- GitLab CI: `id_tokens:` keyword + `aud:` claim → IAM role trust policy.
- CircleCI: OIDC connect (machine-to-machine tokens) → cloud IAM role.
- Argo Workflows / Tekton: ProjectedServiceAccountToken with audience → IAM role (IRSA on EKS, Workload Identity on GKE, Workload Identity Federation on AKS).

If the runner sees `${{ secrets.AWS_ACCESS_KEY_ID }}` or equivalents in workflow YAML, emit a `severity: critical` letter — long-lived cloud credentials in CI are a hardened anti-pattern in 2026.

## Quality Check Matrix

| Check | TypeScript | Python | Go | Rust | C# | Java | C/C++ | SQL | Required |
|-------|------------|--------|-----|------|-----|------|-------|-----|----------|
| Unit Tests | `npm test` | `pytest` | `go test` | `cargo test` | `dotnet test` | `gradle test` | `ctest` | `pytest tests/migrations/` | YES |
| Lint | `eslint` | `ruff` | `golangci-lint` | `clippy` | `dotnet format --verify-no-changes` | `spotbugs` | `cppcheck` / `clang-tidy` | `sqlfluff lint` | YES |
| Types | `tsc --noEmit` | `mypy` | `go vet` | (built-in) | `dotnet build` | `gradle compileJava` | `clang -fsyntax-only` | `sqlfluff parse` | YES |
| Format | `prettier --check` | `ruff format --check` | `gofmt -l` | `cargo fmt --check` | `dotnet format` | `spotlessCheck` | `clang-format --dry-run -Werror` | `sqlfluff format --check` | YES |
| Security | `npm audit` | `pip-audit` | `govulncheck` | `cargo audit` | `dotnet list package --vulnerable` | `gradle dependencyCheckAnalyze` | `cppcheck --addon=cert` | (n/a — schema review) | YES |
| Integration | `npm run test:int` | `pytest tests/integration` | `go test -tags=integration` | `cargo test --features=integration` | `dotnet test --filter Category=Integration` | `gradle integrationTest` | `ctest -L integration` | migration round-trip | IF EXISTS |
| E2E | `npx playwright test` | — | — | — | — | — | — | — | IF EXISTS |
| Playwright | `npx playwright test` | — | — | — | — | — | — | — | IF EXISTS |

## Playwright in the Gate

```bash
if [ -f "playwright.config.ts" ] || [ -f "playwright.config.js" ]; then
  (npx playwright test --reporter=list 2>&1 | tee "$RESULTS_DIR/playwright.log"; echo $? > "$RESULTS_DIR/playwright.exit") &
fi
```

Shard for parallel CI: `npx playwright test --shard=1/4` across 4 nodes. Critical-path E2E should fit in 30 minutes total.

## Output Format

### Pass
```markdown
## Quality Gate Results
**Status**: PASS
**Duration**: 45.2s (parallel) vs ~180s (sequential)

| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Secrets | PASS | 0.8s | gitleaks clean |
| SAST | PASS | 4.1s | semgrep clean |
| Unit Tests | PASS | 12.3s | 145/145, 87% cov |
| Lint | PASS | 3.2s | 0 errors |
| Type Check | PASS | 8.1s | clean |
| Format | PASS | 1.1s | formatted |
| Security | WARN | 5.4s | 2 low sev in dev deps |
| Integration | PASS | 15.1s | 23/23 |

### Verdict: READY TO COMMIT
```

### Fail
```markdown
## Quality Gate Results
**Status**: FAIL — 2 blocking issues

### Failed: Unit Tests
FAILED tests/test_auth.py::test_login_invalid_password
AssertionError: Expected 401, got 500

### Failed: Type Check
src/services/user.py:23: error: Argument 1 to "get_user" has incompatible type "str"; expected "int"

### Verdict: BLOCKED — fix 2 failing checks before commit
```

## Coverage Enforcement (Built-in)

```bash
MODE=${CTOC_MODE:-strict}
case $MODE in
  strictest) LINE=90; BRANCH=85 ;;
  legacy)    LINE=50; BRANCH=40 ;;
  *)         LINE=80; BRANCH=75 ;;
esac

# Jest
npx jest --coverage --coverageThreshold='{"global":{"lines":'$LINE',"branches":'$BRANCH'}}'
# pytest
pytest --cov=src --cov-fail-under=$LINE --cov-branch
# Go
go test -coverprofile=coverage.out ./... && \
  go tool cover -func=coverage.out | grep total
# Rust
cargo tarpaulin --fail-under $LINE
# .NET
dotnet test --collect:"XPlat Code Coverage" /p:Threshold=$LINE
# Java
./gradlew jacocoTestCoverageVerification
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable gate report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. Triage tiers stay in the report body for prioritization; the letter's `severity` field is always `critical`.

**Reconciliation with [[quality/quality-gate]] tier model.** The rules layer organizes checks into Tier 1 (sub-minute, every commit), Tier 2 (PR-blocking, 5–10 min), Tier 3 (nightly, mutation/full-E2E/deep-SAST). The runner maps its internal triage tiers onto the rules layer's gates: CRITICAL/HIGH findings fail the gate at any tier; MEDIUM/LOW are reported only and do not block unless the rules layer escalates them (e.g., via baseline-delta or expiry).

| Triage tier | Examples | Internal action recommendation | Maps to quality-gate tier |
|-------|----------|--------|---|
| CRITICAL | Failing tests, secrets in code, SAST critical, build broken, coverage regression below threshold, type errors, long-lived credentials in CI YAML | BLOCK — gate FAIL | Any tier where detected; immediate block |
| HIGH | Lint errors, security audit HIGH, coverage below 80% but not regressed, deprecated API warnings | BLOCK — gate FAIL (warnings-are-bugs) | Tier 1 or Tier 2; immediate block |
| MEDIUM | Format issues, lint warnings the team chose to allow, slow tests over budget | Fix soon — visible in report but doesn't block if explicitly waived | Tier 2 report-only unless baseline-delta regresses |
| LOW | Missing changelog entry, missing JSDoc, minor cosmetic | Backlog | Tier 3 report-only |

When uncertain whether a finding is HIGH or CRITICAL on the wire, defer to the rules layer: this skill emits `severity: critical` regardless, and [[quality/quality-gate]] applies its baseline/expiry/waiver policy to decide whether to block phase advancement.

## Red Lines (Never Pass With)

- ANY failing test
- ANY lint error (warnings only OK with documented justification in `## Decisions Taken Under Ambiguity`)
- ANY type error
- ANY secret detected
- HIGH/CRITICAL security vulnerability
- Coverage below threshold
- New code below 85% coverage
- Unformatted code (auto-fix should handle)
- Quarantined-and-unfixed flaky tests past 2-week SLA
- Long-lived cloud credentials referenced in CI workflow YAML
- Required status checks unpinned in branch protection

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+gate)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = reproduced; low = single-run flake-suspected
engine: pytest | jest | vitest | mypy | tsc | ruff | eslint | cppcheck | clang-tidy | sqlfluff | semgrep | gitleaks | gh-actions-yaml | gitlab-ci-yaml | circleci-config
kind: test_failure | lint_error | type_error | coverage_regression | security_finding | format_drift | flaky_test | ci_config_smell | missing_required_check | oidc_missing
target_file: src/services/user.py
target_line: 23
gate_failed: security | quality | tests | e2e | ci-config
suggested_fix: "Replace AWS_ACCESS_KEY_ID secret with OIDC role-to-assume via aws-actions/configure-aws-credentials@v4"
reference: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect
```

The integrator uses `confidence` to weight findings — a `confidence: low` single-run finding (suspected flake) doesn't block phase advancement on its own; two consecutive failures escalate it. `kind: ci_config_smell` letters are emitted at gate setup time (a static lint of the CI YAML), not per-run.

## Quick Reference

| Tool | Threshold Flag | Report Flag |
|------|----------------|-------------|
| Jest | `--coverageThreshold='{"global":{"lines":80}}'` | `--coverage` |
| Vitest | `--coverage.thresholds.lines=80` | `--coverage` |
| pytest | `--cov-fail-under=80` | `--cov=src` |
| go test | (manual check) | `-coverprofile=c.out` |
| cargo tarpaulin | `--fail-under 80` | (default) |
| nyc | `--check-coverage --lines 80` | `--reporter=text` |
| dotnet test | `/p:Threshold=80` (Coverlet) | `--collect:"XPlat Code Coverage"` |
| jacoco (Gradle) | `jacocoTestCoverageVerification` rule | `jacocoTestReport` |

---

## Refinement Loop — critic mode (v6.9.16)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
