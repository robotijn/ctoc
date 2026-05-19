---
name: onboarding-validator
description: Validates developer onboarding — README, bootstrap, devcontainer, version pinning, contributing docs — to minimize time-to-first-hello-world.
type: skill
when_to_load:
  - "onboarding validation"
  - "onboarding check"
  - "new dev setup"
  - "onboarding audit"
  - "time to first hello world"
  - "TTFHW"
  - "developer onboarding"
  - "devcontainer audit"
  - "codespaces audit"
  - "bootstrap script audit"
  - "README quickstart check"
related_skills:
  - devex/api-deprecation-checker
  - documentation/documentation-updater
  - documentation/changelog-generator
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Onboarding Validator (skill)

> Converted from agents/devex/onboarding-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate that new developers can successfully onboard to the project by auditing setup procedures, README quality, bootstrap scripts, tool-version pinning, devcontainer/Codespaces readiness, and contributor documentation. You assume the next reader is a stranger with zero context: a one-command bootstrap is the bar; multi-step manual setup is a finding.

## 2026 Best Practices (DevEx category)

- **One-command bootstrap is the bar**: README has Prerequisites + a single bootstrap command (`./scripts/bootstrap.sh`, `make bootstrap`, `mise install`, `devbox shell`, `nix develop`). Multi-step manual setup is a finding. The first 2 lines of README must answer "what is this?" and "why should I care?"
- **Devcontainer / Codespaces ready**: `.devcontainer/devcontainer.json` checked in; project opens green in Codespaces. Prebuilds enabled on `main` so a new joiner gets a precomputed environment instead of waiting on container build (`Settings → Codespaces → Prebuilds`, trigger `every push` for main).
- **Tool versions pinned, not assumed**: `.tool-versions` (asdf), `.mise.toml` (mise), `flake.nix` / `devbox.json` (nix/devbox), `.nvmrc` (Node), `.python-version` / `pyproject.toml` (Python), `global.json` (.NET), `.java-version` / `mise.toml` (Java), Maven/Gradle wrapper (`mvnw` / `gradlew`), `Dockerfile` base-image SHA pinning. Mise (Rust, ~10–30 ms activation) is the modern polyglot manager replacing asdf (~200–500 ms shell startup) per the mise project's benchmarks; treat either as acceptable, but at least one MUST be present in a polyglot repo.
- **CONTRIBUTING.md is mandatory**: how to test (`make test`), how to lint, how to open a PR, how releases happen, code-of-conduct link, DCO (Developer Certificate of Origin) / CLA (Contributor License Agreement) policy if applicable. Without it, every new contributor re-asks the same questions.
- **`.env.example` with comments, never real secrets**: every variable used by `process.env` / `os.environ` must have an entry; comment what it does and where to get the value (e.g. "Stripe test key — dashboard.stripe.com/test/apikeys"). Never commit real keys, even "dev only" — see [[secrets-detector]].
- **Project structure documented**: a short `## Project Structure` section listing what lives where (one line per top-level dir). Stops the "where do I put X?" question.
- **Test the docs in CI**: every README code block runs in a smoke job; every link resolves; bootstrap script executes on a clean container. Pair with [[documentation-updater]].
- **TTFHW (Time To First Hello World) is the KPI**: target ≤ 60 minutes from clone to running test; if missed, the bottleneck is environment setup, access, or docs (in that order). DORA + SPACE + DevEx are the three measurement frames — combine speed (DORA), holistic (SPACE), and engineer experience (DevEx).
- **Operational + qualitative combined**: clone-to-test wall-clock numbers plus a week-1 satisfaction survey from new joiners. One frame alone lies.

## Onboarding Checklist

### Essential Files
| File | Purpose | Required |
|------|---------|----------|
| README.md | What/why + Prerequisites + one-command bootstrap | Yes |
| CONTRIBUTING.md | How to test, lint, PR, release | Yes |
| .env.example | Environment template (commented, no real secrets) | Yes |
| LICENSE | Legal terms | Yes |
| CODE_OF_CONDUCT.md | Community norms | Recommended |
| CHANGELOG.md | Version history | Recommended |
| .devcontainer/devcontainer.json | Codespaces / VS Code dev container | Recommended |
| Version-pin file | `.mise.toml` / `.tool-versions` / `flake.nix` / `devbox.json` / `.nvmrc` / `global.json` / `.python-version` / `.java-version` | Yes (≥1) |
| scripts/bootstrap.sh (or Makefile target) | One-command setup | Yes |

### README Sections
| Section | Purpose |
|---------|---------|
| Tagline (2 lines) | What is this, why should I care |
| Prerequisites | Required tools/versions (point to pin files) |
| Quick Start | One-command bootstrap, then run |
| Configuration | Environment variables (link `.env.example`) |
| Running Locally | Dev server / CLI commands |
| Testing | How to run tests + coverage |
| Project Structure | Top-level dir map |
| Troubleshooting | Common pitfalls |
| Contributing | Link to CONTRIBUTING.md |

## Categories (validator findings)

Every finding the validator emits is one of these. Each maps to a fix.

| Category | Symptom | Fix |
|----------|---------|-----|
| `missing_readme_quickstart` | README absent, or no Prerequisites / Quick Start section | Add Prerequisites + one-command bootstrap block |
| `multi_step_bootstrap` | README lists ≥3 manual steps before first run | Collapse into `scripts/bootstrap.sh` or `make bootstrap` |
| `tool_version_unpinned` | No `.mise.toml` / `.tool-versions` / `flake.nix` / `devbox.json` / `.nvmrc` / `global.json` / `.python-version` / `.java-version` | Add appropriate pin file; CI must use the same versions |
| `missing_devcontainer` | No `.devcontainer/devcontainer.json`; Codespaces shows generic image | Add devcontainer config + enable prebuilds on main |
| `missing_env_example` | Code references env vars but `.env.example` absent or incomplete | Create `.env.example` with all referenced vars + comments |
| `missing_contributing_md` | No CONTRIBUTING.md, or it's a stub | Document test/lint/PR/release flow |
| `secret_in_env_example` | Real-looking key in `.env.example` | Replace with placeholder; rotate the leaked key (see [[secrets-detector]]) |
| `undocumented_structure` | No project structure section / map | Add `## Project Structure` table |
| `stale_bootstrap` | Bootstrap script references removed tool or wrong version | Run bootstrap in clean container, fix breaks |
| `broken_readme_example` | A README code block fails when copy-pasted | Run README blocks in CI; fix or remove |

## 7-language coverage: bootstrap & version pinning patterns

### 0. Shell — `scripts/bootstrap.sh` (foundational)

```bash
# BAD: README tells the user to run 8 commands by hand
#   1. brew install postgres redis
#   2. nvm install 20
#   3. npm install
#   4. cp .env.example .env
#   5. createdb myapp
#   6. npm run db:migrate
#   7. npm run db:seed
#   8. npm run dev
# Every step is a place to fail. No version pinning. No idempotency.
```

```bash
# SAFE: scripts/bootstrap.sh — one command, idempotent, opinionated
#!/usr/bin/env bash
set -euo pipefail                 # fail fast on first error / unset var / pipe failure
IFS=$'\n\t'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }

# 1. Tool versions via mise (reads .mise.toml).
command -v mise >/dev/null || { echo "install mise: https://mise.jdx.dev"; exit 1; }
log "installing pinned tool versions"
mise install                       # honours .mise.toml

# 2. Deps for every language detected.
[[ -f package.json    ]] && { log "pnpm install"; pnpm install --frozen-lockfile; }
[[ -f pyproject.toml  ]] && { log "uv sync";      uv sync --frozen; }
[[ -f go.mod          ]] && { log "go mod download"; go mod download; }
[[ -f Cargo.toml      ]] && { log "cargo fetch"; cargo fetch; }

# 3. Env file (never overwrite an existing .env).
[[ -f .env ]] || { log "copying .env.example -> .env"; cp .env.example .env; }

# 4. Local infra via docker compose (Postgres, Redis, etc.).
if [[ -f docker-compose.yml ]]; then
  log "starting local services"
  docker compose up -d --wait      # --wait blocks until healthchecks pass
fi

# 5. Migrate + seed (idempotent — script must be safe to re-run).
[[ -f package.json ]] && pnpm run db:migrate && pnpm run db:seed || true

log "done. run: pnpm dev  (or: make dev)"
```

Edge cases: missing `set -e` (silent failures), non-idempotent (re-running breaks), no `--frozen-lockfile` (drift), assumes `bash` on systems where `/bin/sh` is dash, hardcoded paths.

### 1. C# / .NET 9 — `global.json` + `dotnet restore`

```text
# BAD: README says "install .NET" — version unspecified
# Result: dev uses .NET 8, CI uses .NET 9, build passes locally fails in CI
```

```json
// SAFE: global.json pins SDK version repo-wide
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "latestFeature",
    "allowPrerelease": false
  }
}
```

```bash
# scripts/bootstrap.sh fragment for .NET 9
dotnet --version                      # respects global.json — fails clearly if SDK absent
dotnet restore                        # uses NuGet.config + packages.lock.json
dotnet build --no-restore             # build with restored deps
dotnet test --no-build --logger "trx" # run tests
```

Commit `packages.lock.json` (set `<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>` in csproj) so transitive deps are pinned. Pair with `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` — see warnings-are-bugs.

### 2. Java 21+ — `./mvnw` / `./gradlew` wrappers

```text
# BAD: README says "install Maven 3.9 and run mvn install"
# Result: dev with Maven 3.6 sees obscure plugin errors
```

```bash
# SAFE: commit the Maven / Gradle wrapper to the repo.
# Maven wrapper (mvnw, mvnw.cmd, .mvn/wrapper/maven-wrapper.properties)
./mvnw -version                       # pins exact Maven version per the wrapper
./mvnw verify                         # tests + integration + checks

# Gradle wrapper (gradlew, gradlew.bat, gradle/wrapper/gradle-wrapper.properties)
./gradlew --version
./gradlew build
```

```toml
# .mise.toml — pin the JDK
[tools]
java = "temurin-21"
maven = "3.9.9"        # only needed if not using the wrapper
```

Edge cases: `JAVA_HOME` clashing with system Java (mise fixes this), wrapper jar not committed, `.gitignore` excluding `gradle/wrapper/gradle-wrapper.jar`.

### 3. Python 3.12+ — uv + `pyproject.toml` + `.python-version`

```bash
# BAD: README says "pip install -r requirements.txt"
# - no Python version pin
# - no lockfile (or unsorted requirements.txt)
# - virtualenv left to the reader
# - transitive deps drift between dev and CI
```

```toml
# SAFE: pyproject.toml + uv.lock (uv is the 2026 default fast resolver)
[project]
name = "myapp"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["fastapi>=0.115", "pydantic>=2.9"]

[dependency-groups]
dev = ["pytest>=8.3", "ruff>=0.7", "mypy>=1.13"]

[tool.uv]
package = true
```

```text
# .python-version  (read by mise / pyenv / uv)
3.12.7
```

```bash
# scripts/bootstrap.sh fragment for Python
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install                     # installs the version from .python-version
uv sync --frozen                      # creates .venv, installs from uv.lock
uv run pytest                         # runs in the synced env, no `source activate` needed
```

Edge cases: `requirements.txt` and `pyproject.toml` both present (split source of truth), `pip` directly instead of `uv` (slow + non-deterministic), missing `--frozen` (lock-file ignored).

### 4. C / C++ — CMake bootstrap with presets

```text
# BAD: README says "mkdir build && cd build && cmake .. && make"
# - no compiler version pin
# - no toolchain file
# - Debug vs Release left ambiguous
# - Windows users (`make` absent) blocked
```

```json
// SAFE: CMakePresets.json — one source of truth for configure/build/test
{
  "version": 6,
  "configurePresets": [{
    "name": "dev",
    "generator": "Ninja",
    "binaryDir": "${sourceDir}/build/dev",
    "cacheVariables": {
      "CMAKE_BUILD_TYPE": "Debug",
      "CMAKE_EXPORT_COMPILE_COMMANDS": "ON",
      "CMAKE_C_STANDARD": "17",
      "CMAKE_CXX_STANDARD": "23"
    }
  }],
  "buildPresets":  [{ "name": "dev", "configurePreset": "dev" }],
  "testPresets":   [{ "name": "dev", "configurePreset": "dev",
                      "output": { "outputOnFailure": true } }]
}
```

```bash
# scripts/bootstrap.sh fragment for C/C++
cmake --preset dev                    # configure
cmake --build --preset dev -j         # build (Ninja)
ctest --preset dev                    # run tests
```

```toml
# .mise.toml — pin Ninja + CMake
[tools]
cmake = "3.30.5"
ninja = "1.12.1"
```

Compiler version: prefer Conan or vcpkg manifests (`conanfile.txt` / `vcpkg.json`) for dependency pinning; record the expected compiler in CONTRIBUTING.md and verify in CI matrix.

### 5. TypeScript — pnpm + `.nvmrc` (or `.mise.toml`)

```text
# BAD: README says "npm install && npm start"
# - no Node version pin (.nvmrc absent)
# - npm chosen over pnpm/yarn arbitrarily (no `packageManager` field)
# - no `engines` field in package.json
# - lockfile may not be respected
```

```text
# SAFE: .nvmrc  (or use mise — see .mise.toml below)
20.18.0
```

```json
// SAFE: package.json fragment
{
  "engines":         { "node": ">=20.18 <21" },
  "packageManager":  "pnpm@9.12.0",
  "scripts": {
    "bootstrap":     "pnpm install --frozen-lockfile && pnpm run db:setup",
    "dev":           "next dev",
    "test":          "vitest run --coverage"
  }
}
```

```toml
# .mise.toml — alternative pin via mise
[tools]
node = "20.18.0"
pnpm = "9.12.0"
```

```bash
# scripts/bootstrap.sh fragment for TS
corepack enable                       # activates pnpm version pinned in package.json
pnpm install --frozen-lockfile        # fails if lockfile is stale
pnpm run db:setup
```

Edge cases: mixing `npm`/`yarn`/`pnpm` in the same repo, missing `--frozen-lockfile` (drift between dev and CI), `packageManager` field absent (corepack uses default version), Node and pnpm not actually checked at bootstrap time.

### 6. SQL — `docker-compose.yml` with seeded DB

```yaml
# BAD: README says "create a Postgres database called myapp and run migrations"
# - which Postgres version?
# - which port?
# - what credentials?
# - what about the seed data the tests assume?
```

```yaml
# SAFE: docker-compose.yml — local services, pinned, seeded, with healthchecks
version: "3.9"

services:
  db:
    image: postgres:16.4-alpine        # pinned major.minor.patch
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev_only_not_a_secret
      POSTGRES_DB: myapp_dev
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro   # schema + seed on first start
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev -d myapp_dev"]
      interval: 2s
      timeout: 3s
      retries: 20

  redis:
    image: redis:7.4-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 3s
      retries: 20

volumes:
  pgdata: {}
```

```sql
-- db/init/001_seed.sql — checked-in, repeatable seed data
INSERT INTO users (id, email, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'dev@example.com', 'admin')
ON CONFLICT (id) DO NOTHING;
```

```bash
# scripts/bootstrap.sh fragment for SQL deps
docker compose up -d --wait           # waits for healthchecks before returning
pnpm run db:migrate                   # idempotent migration runner
```

Edge cases: `latest` image tag (no reproducibility), missing healthcheck (bootstrap returns before DB is ready), seed data committed with real PII, port collision (use `127.0.0.1:5432:5432` to avoid exposing on LAN), volume not cleaned between resets.

## devcontainer.json — the Codespaces baseline

```json
// .devcontainer/devcontainer.json — opens green in Codespaces, identical to local
{
  "name": "myapp dev",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu-24.04",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/node:1":   { "version": "20.18" },
    "ghcr.io/devcontainers/features/python:1": { "version": "3.12" }
  },
  "postCreateCommand": "./scripts/bootstrap.sh",
  "forwardPorts": [3000, 5432],
  "portsAttributes": {
    "3000": { "label": "app",      "onAutoForward": "openPreview" },
    "5432": { "label": "postgres", "onAutoForward": "ignore" }
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "ms-python.python",
        "ms-azuretools.vscode-docker"
      ]
      // do NOT include personal theme / icon-pack extensions here
    }
  },
  "remoteUser": "vscode"
}
```

Pair with **Codespaces prebuilds** on `main` (trigger: every push; idle timeout: 30 min for cost). New joiners boot into a precomputed environment in seconds instead of waiting on the build.

## Validation Tests

### 1. Repo essentials present

```bash
need() { [[ -f "$1" ]] || echo "MISSING: $1"; }
need README.md
need CONTRIBUTING.md
need .env.example
need LICENSE
need scripts/bootstrap.sh || need Makefile

# at least one version-pin file
pin_found=0
for f in .mise.toml .tool-versions flake.nix devbox.json .nvmrc \
         global.json .python-version .java-version; do
  [[ -f "$f" ]] && { pin_found=1; break; }
done
(( pin_found )) || echo "MISSING: any tool-version pin file (.mise.toml / .tool-versions / flake.nix / devbox.json / .nvmrc / global.json / .python-version / .java-version)"

# devcontainer
[[ -f .devcontainer/devcontainer.json ]] || echo "MISSING: .devcontainer/devcontainer.json"
```

### 2. README structural checks

```bash
grep -qi "^## *prerequisites" README.md   || echo "README: missing Prerequisites"
grep -qi "^## *quick *start"  README.md   || echo "README: missing Quick Start"
grep -qi "^## *testing"       README.md   || echo "README: missing Testing"
grep -qi "^## *contributing"  README.md   || echo "README: missing Contributing section"
grep -qi "^## *project *structure" README.md || echo "README: missing Project Structure"

# count distinct manual bootstrap steps in Quick Start — > 1 numbered step is a finding
qs_steps=$(awk '/^## *Quick Start/{f=1;next} /^## /{f=0} f' README.md \
             | grep -cE '^[[:space:]]*[0-9]+\.[[:space:]]')
(( qs_steps > 1 )) && echo "FINDING: multi_step_bootstrap (Quick Start has ${qs_steps} numbered steps; collapse into one)"
```

### 3. `.env.example` completeness + safety

```bash
[[ -f .env.example ]] || { echo "MISSING: .env.example"; exit 0; }

# every env var referenced in source must appear in .env.example
rg --no-filename -o '(process\.env|os\.environ\[|os\.getenv\()\.?[A-Z_]+' src \
  | rg -o '[A-Z][A-Z0-9_]+' | sort -u \
  | while read var; do
      grep -q "^${var}=" .env.example || echo "UNDOCUMENTED env var: $var"
    done

# scan for real-looking secrets (rough; pair with secrets-detector for full coverage)
rg -nE '=(sk_live_|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36,}|xox[abp]-)' .env.example \
  | awk '{print "SECRET-IN-EXAMPLE: " $0}'
```

### 4. Bootstrap script runs clean

```bash
# in CI: spin up a clean container, then run the project's bootstrap script
docker run --rm -v "$PWD":/repo -w /repo \
  mcr.microsoft.com/devcontainers/base:ubuntu-24.04 \
  bash -c 'apt-get update >/dev/null && ./scripts/bootstrap.sh' \
  || echo "BOOTSTRAP_FAILED"
```

### 5. Version-pin consistency

```bash
# .nvmrc vs package.json engines.node must agree (if both exist)
if [[ -f .nvmrc && -f package.json ]]; then
  nvmrc=$(tr -d 'v\n' < .nvmrc)
  engine=$(jq -r '.engines.node // empty' package.json)
  [[ -n "$engine" && "$engine" != *"$nvmrc"* ]] \
    && echo "VERSION-DRIFT: .nvmrc=$nvmrc vs package.json engines.node=$engine"
fi

# .python-version vs pyproject.toml requires-python
if [[ -f .python-version && -f pyproject.toml ]]; then
  pyver=$(cat .python-version)
  req=$(grep -E '^requires-python' pyproject.toml || true)
  echo "$req" | grep -q "$pyver" || echo "VERSION-DRIFT: .python-version=$pyver vs $req"
fi
```

### 6. devcontainer present + minimal

```bash
if [[ -f .devcontainer/devcontainer.json ]]; then
  jq -e '.postCreateCommand // .postCreate // empty' .devcontainer/devcontainer.json >/dev/null \
    || echo "devcontainer: no postCreateCommand (bootstrap will not run on Codespace creation)"
  jq -e '.image // .build // empty' .devcontainer/devcontainer.json >/dev/null \
    || echo "devcontainer: no image or build field"
fi
```

## Output Format

```markdown
## Onboarding Validation Report

### Summary
| Category | Findings | Required Action |
|----------|----------|-----------------|
| missing_readme_quickstart  | 0 | — |
| multi_step_bootstrap       | 1 | Collapse into scripts/bootstrap.sh |
| tool_version_unpinned      | 1 | Add .mise.toml or .tool-versions |
| missing_devcontainer       | 1 | Add .devcontainer/devcontainer.json |
| missing_env_example        | 0 | — |
| missing_contributing_md    | 1 | Document test/lint/PR/release flow |
| secret_in_env_example      | 0 | — |
| undocumented_structure     | 1 | Add Project Structure section |
| stale_bootstrap            | 0 | — |
| broken_readme_example      | 0 | — |

### Setup Test Results
| Step           | Status  | Time | Notes |
|----------------|---------|------|-------|
| Clone          | Pass    | 5s   | — |
| Bootstrap      | Pass    | 45s  | one command |
| Build          | Pass    | 12s  | — |
| Dev server up  | Warning | 8s   | needed manual .env edit |
| Health check   | Fail    | —    | 404 on /health |
| Tests          | Pass    | 23s  | 156 tests, coverage 84% |

### Time to First Run (TTFHW)
| Metric                  | Value  | Target |
|-------------------------|--------|--------|
| Clone to first test run | 2m 15s | < 60m  |
| Bootstrap wall-clock    | 45s    | < 5m   |
| First passing test      | 1m 25s | < 3m   |

### Documentation Quality
| Document               | Exists | Complete | Issues |
|------------------------|--------|----------|--------|
| README.md              | Yes    | 70%      | missing Project Structure |
| CONTRIBUTING.md        | No     | —        | not found |
| .env.example           | Yes    | 80%      | 2 vars undocumented |
| .devcontainer/         | No     | —        | Codespaces not configured |
| Version pin file       | Yes    | —        | .nvmrc only (no Python pin) |

### Blockers for New Developers
1. CONTRIBUTING.md absent — every new joiner re-asks how to run tests
2. No `.devcontainer/devcontainer.json` — Codespaces shows generic image, ~10 min lost on every fresh env
3. Two env vars (`DATABASE_URL`, `REDIS_HOST`) referenced in source but missing from `.env.example`

### Recommendations
1. Add `scripts/bootstrap.sh` and replace 5-step Quick Start with one command
2. Add `.mise.toml` pinning Node 20.18 + Python 3.12 + pnpm 9.12
3. Add `.devcontainer/devcontainer.json` with `postCreateCommand: ./scripts/bootstrap.sh`
4. Add CONTRIBUTING.md with test / lint / PR / release sections
5. Add `## Project Structure` section to README
6. Document `DATABASE_URL` and `REDIS_HOST` in `.env.example`

### Estimated Onboarding Time
- **Current**:     30–45 minutes (with troubleshooting)
- **After fixes**: 5–10 minutes (Codespaces) / 10–15 minutes (local)
```

## Tool Integration (2026)

| Tool | Strengths | Trade-offs | When to use |
|------|-----------|-----------|-------------|
| **mise** | Polyglot (Node, Python, Go, Ruby, Terraform, …); Rust-based, ~10–30 ms shell activation per mise's own benchmarks; reads `.mise.toml` + `.tool-versions`; runs tasks too | Newer than asdf — smaller plugin ecosystem | Default polyglot pin manager in 2026 |
| **asdf** | Mature plugin ecosystem; shell-script based | ~200–500 ms shell startup per mise's published comparison | Already-in-use repos; consider migration to mise |
| **devbox** | Wraps Nix without requiring users to learn Nix; `devbox.json` is JSON, not Nix-lang; per-project shells | Still pulls Nix as a runtime dep | Teams wanting Nix reproducibility without the language tax |
| **nix-shell / flakes** | Full reproducibility; pinned to git revisions | Steep learning curve | Teams already invested in Nix |
| **`.devcontainer/devcontainer.json`** | One config opens identically in VS Code Dev Containers and Codespaces; commit linters/formatters here | Personal theme/icon prefs must NOT be in this file | Always — even when local-only |
| **GitHub Codespaces** | Zero local setup; new joiner codes in minutes; prebuilds eliminate cold-start wait | Cost; idle timeout to manage | Public OSS + teams; enable prebuilds on `main` |
| **Tilt / Skaffold** | Live rebuild + sync for K8s-targeted dev loops | Adds a layer above docker-compose | Microservices repos |
| **docker compose** | Pinned local services (Postgres, Redis, Kafka); healthcheck + `--wait` give deterministic readiness | Image pulls add cold-start time | Any repo with external services |
| **Makefile / Justfile** | Discoverable verbs (`make help`, `just`) | Make has cross-platform quirks; `just` is cleaner | Wrap bootstrap + common tasks |

## Special Considerations

- **Don't validate vendored deps**: skip `node_modules/`, `vendor/`, `target/`, `bin/`, `obj/`, `.venv/` for env-var and structure scans.
- **OSS vs internal**: OSS repos need CODE_OF_CONDUCT.md + LICENSE + maintainers list; internal repos may swap LICENSE for a `## Internal Use` note. Don't over-flag.
- **Monorepos**: each package gets its own README quickstart linked from root README; CONTRIBUTING.md stays at root.
- **Windows-friendly**: bootstrap script must have a `.ps1` counterpart or be runnable under WSL. Devcontainer / Codespaces sidesteps this entirely — prefer it for cross-OS teams.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable validation report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|-------------|----------|-----------------|
| CRITICAL | secret_in_env_example, broken bootstrap on clean container, README quick-start commands fail | BLOCK |
| HIGH | missing_readme_quickstart, multi_step_bootstrap, tool_version_unpinned, missing_contributing_md | Fix before release |
| MEDIUM | missing_devcontainer, undocumented_structure, missing_env_example entries | Fix this sprint |
| LOW | stale CHANGELOG, no troubleshooting section, no badges | Backlog |

## Red Lines

- NEVER ship a release with broken README quick-start commands.
- NEVER allow env vars used by source code without a `.env.example` entry.
- NEVER let TTFHW exceed 60 minutes without a documented reason in CONTRIBUTING.md.
- NEVER commit real secrets to `.env.example` — even "dev only" keys. Placeholder + comment only.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+category)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = verified by clean-container run
engine: onboarding-validator
kind: missing_readme_quickstart | multi_step_bootstrap | tool_version_unpinned |
      missing_devcontainer | missing_env_example | missing_contributing_md |
      secret_in_env_example | undocumented_structure | stale_bootstrap |
      broken_readme_example
target_file: README.md                              # the file the fix lands in
target_line: 12                                     # or null when whole-file
message: "README Quick Start has 6 numbered manual steps; collapse into scripts/bootstrap.sh"
suggested_fix: |
  1. Create scripts/bootstrap.sh wrapping the 6 steps idempotently.
  2. Replace Quick Start with a single fenced block: `./scripts/bootstrap.sh && pnpm dev`.
  3. Add the script to .devcontainer/devcontainer.json `postCreateCommand`.
reference: https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration
```

The integrator uses `confidence` to weight findings — a `confidence: low` finding (e.g. "README seems short but bootstrap was not actually run") doesn't block phase advancement on its own; a `confidence: high` finding (bootstrap script failed in a clean container) does.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every onboarding gap, missing pin file, multi-step bootstrap, undocumented env var, or broken README example emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a new joiner who can't onboard today is a hire who churns next quarter. Onboarding rot is invisible to the team that already onboarded — only fresh eyes see it.
