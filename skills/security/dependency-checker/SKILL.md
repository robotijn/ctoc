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
  max_subagents: 0
---

# Dependency Checker (skill)

> Converted from agents/security/dependency-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are the **fast PR-time SCA** layer. You scan the project's lockfiles and manifests for known vulnerabilities, license issues, and dangerously outdated direct dependencies — fast enough to run on every pull request without slowing the developer feedback loop.

**Role split with [[dependency-auditor]]** (explicit):

| Concern | dependency-checker (this skill) | [[dependency-auditor]] |
|---|---|---|
| When | Every PR, pre-commit, IDE | Nightly / weekly / pre-release |
| Speed budget | < 30s for typical repos | Minutes-to-hours acceptable |
| Scope | Diff vs base branch + direct deps + lockfile delta | Full repo, full transitive graph, SBOM emission |
| Output | Letter to integrator: new findings only | Full inventory, license report, SBOM (CycloneDX/SPDX), policy report |
| Auto-remediation | Suggest patch-level bumps | Open Renovate/Dependabot PRs, dunning policy |
| Reachability | `reachable: unknown` acceptable when DB-only signal | Required: call-graph reachability analysis |

If a question requires deep transitive analysis, SBOM emission, or call-graph reachability, **defer to [[dependency-auditor]]** — write the deferral into the letter rather than blocking the PR on a slow scan.

## 2026 Best Practices (Security category)

- **Shift everywhere**: surface findings in IDE / pre-commit / PR / pre-deploy. This skill targets the PR slot — under 30 seconds end-to-end.
- **SCA layer of the SAST+SCA+DAST+secrets quadrant**: coordinate with [[sast-scanner]], [[secrets-detector]], and DAST runners.
- **Differential dependency scanning** is the default mode at PR-time: scan only the **lockfile delta** vs the base branch and report **only newly introduced** vulnerable versions. OSV-Scanner's GitHub Action ships a PR mode that "will only report new vulnerabilities introduced through the pull request." Full repo scans run on a schedule in [[dependency-auditor]].
- **Lockfile-first, manifest-fallback**: a lockfile (package-lock.json, poetry.lock, Cargo.lock, go.sum, packages.lock.json, conan.lock, vcpkg.json baseline) pins exact resolved versions and is what production runs. Manifests (package.json, pyproject.toml, *.csproj, Cargo.toml, go.mod, conanfile.txt) declare ranges. **Always prefer lockfile data**; treat manifest-only findings as `confidence: low` because the resolved version may differ.
- **Direct vs transitive treatment** matters for fail-fast policy:
  - **Direct + high/critical CVSS** → fail PR immediately. The developer added it; they can fix it.
  - **Transitive + high/critical** → annotate with the upgrade path (which direct dep pulls it in) but do not always fail-fast on the PR that didn't introduce the transitive change. Let [[dependency-auditor]] open the remediation PR.
- **Allowlists for known-accepted CVEs**: persist in `.security/dependency-allowlist.yaml` with mandatory `expires` date and `justification`. Expired entries auto-reactivate the finding. Never allowlist without an expiry.
- **Version-resolution attacks**: flag manifest changes that widen ranges (`"react": "^18"` → `"react": "*"`), unpin to a vulnerable major, or replace a pinned exact version with a range that resolves into a known-vulnerable window. Dependency confusion (internal package name on a public registry) gets its own check.
- **Package signing verification** where the ecosystem supports it: npm provenance attestations (Sigstore), PyPI Trusted Publishers + attestations, Maven Central GPG signatures, NuGet author signing, Go module checksum DB (`sum.golang.org`), Cargo crate signing (experimental in 2026), vcpkg/Conan signed binary cache. A package that previously had provenance but no longer does is a flag.
- **Fail-fast on high-CVSS direct deps**: CVSS ≥ 7.0 on a direct dependency blocks the PR unless allowlisted with future-dated expiry.
- **OWASP A06**: vulnerable & outdated components — every finding tagged.

## Differential Scanning (the load-bearing technique)

Differential scanning is what lets this skill stay under the 30-second PR budget while still catching net-new risk.

```bash
# OSV-Scanner — recommended default. Supports 19+ lockfile formats.
# v2.3.5 (March 2026) added transitive scanning for Python requirements.txt via deps.dev API.
osv-scanner scan source --recursive .                  # full scan (for baselining)

# PR mode via GitHub Action: reports ONLY new vulns introduced in the PR
# .github/workflows/osv-scanner-pr.yml
#   uses: google/osv-scanner-action/.github/workflows/osv-scanner-reusable-pr.yml@main
#
# The action diffs vulns: those present on base branch are suppressed; new ones fail the PR.

# Local equivalent: scan base, scan head, diff
osv-scanner scan source --format=json . > head.json
git stash && git checkout origin/main
osv-scanner scan source --format=json . > base.json
git checkout - && git stash pop
jq -s '.[0].results - .[1].results' head.json base.json   # new findings only
```

Three fields every letter carries from differential mode: `delta` (`new` | `unchanged` | `regressed`), `direct` (bool), and `reachable` (`true` | `false` | `unknown` — `unknown` is allowed at PR-time; full reachability runs in [[dependency-auditor]]).

## Speed targets

| Repo size | PR scan target | How |
|---|---|---|
| Small (< 100 direct deps) | < 10s | Cached OSV.dev DB, lockfile only, diff mode |
| Typical (100–500 direct deps) | < 30s | Same + parallel ecosystem scans |
| Large monorepo (multi-language) | < 60s | Scope to changed paths only; full repo runs in nightly auditor |

**Caching**: OSV-Scanner reads `~/.cache/osv-scanner/` for the local OSV.dev mirror. In CI, cache `~/.cache/osv-scanner/` keyed on the OSV.dev DB date (refresh daily). For npm, cache `~/.npm/_cacache` keyed on lockfile hash. Cache hits reduce a 30s scan to 3–5s on subsequent PRs against the same base.

**Scope-by-changed-paths**: if only `services/web/package-lock.json` changed in the PR, only run the JS scanner against that path; skip pip-audit, cargo-audit, etc.

## Per-ecosystem BAD / SAFE patterns

The "BAD" examples are dependency states or manifest patterns the PR-time scanner should flag. "SAFE" is what to recommend in the letter's `fix` field.

### npm (JS / TS)

```jsonc
// BAD package.json: unpinned ranges that can resolve into vulnerable majors;
// dev-only excludes missing; no provenance check
{
  "dependencies": {
    "lodash": "*",                    // resolves to anything, including yanked
    "axios": "^0.21.0"                // ^ on 0.x allows 0.21.0 (CVE-2021-3749)
  }
}
```

```jsonc
// SAFE package.json: ranges within a known-good major; lockfile committed;
// audit script wired with --omit=dev for prod posture
{
  "dependencies": {
    "lodash": "^4.17.21",             // patched range
    "axios": "^1.7.0"
  },
  "scripts": {
    "audit:prod": "npm audit --omit=dev --audit-level=high"
  }
}
```

```bash
# Fast PR-time commands
npm audit --omit=dev --audit-level=high --json
osv-scanner scan source --lockfile=package-lock.json
# Verify npm provenance (Sigstore-backed attestations)
npm audit signatures
```

### pip (Python)

```toml
# BAD pyproject.toml: unbounded, no lockfile committed
[project]
dependencies = ["requests", "pyyaml"]   # any version, including known-vulnerable ones
```

```toml
# SAFE pyproject.toml + poetry.lock / uv.lock committed
[project]
dependencies = ["requests>=2.32.0,<3", "pyyaml>=6.0.1,<7"]
```

```bash
# Fast PR-time
pip-audit --strict --requirement requirements.txt --format json
osv-scanner scan source --lockfile=poetry.lock      # or uv.lock, Pipfile.lock
# v2.3.5+ OSV-Scanner transitive scan for requirements.txt via deps.dev:
osv-scanner scan source --experimental-transitive-scan --lockfile=requirements.txt
```

### Maven / Gradle (Java / Kotlin)

```xml
<!-- BAD pom.xml: version range that can pull a vulnerable patch -->
<dependency>
  <groupId>org.springframework</groupId>
  <artifactId>spring-core</artifactId>
  <version>[5.0,6.0)</version>     <!-- includes Spring4Shell window -->
</dependency>
```

```xml
<!-- SAFE: pinned to patched version; use dependencyManagement BOM to lock transitive -->
<dependency>
  <groupId>org.springframework</groupId>
  <artifactId>spring-core</artifactId>
  <version>6.1.14</version>
</dependency>
```

```bash
# OWASP Dependency-Check (Maven)
mvn org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=7
# Gradle
./gradlew dependencyCheckAnalyze --info
# OSV-Scanner reads pom.xml, build.gradle.lockfile, gradle.lockfile, gradle/verification-metadata.xml
osv-scanner scan source --recursive .
```

### NuGet (C# / .NET)

```xml
<!-- BAD: floating version, no central package management, no lockfile -->
<PackageReference Include="Newtonsoft.Json" Version="*" />
```

```xml
<!-- SAFE: Central Package Management + lockfile committed -->
<!-- Directory.Packages.props -->
<PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
<!-- csproj -->
<PackageReference Include="Newtonsoft.Json" />
<!-- enable lockfile: -->
<PropertyGroup>
  <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
  <RestoreLockedMode>true</RestoreLockedMode>
</PropertyGroup>
```

```bash
# Fast PR-time
dotnet list package --vulnerable --include-transitive --format json
dotnet list package --deprecated
dotnet list package --outdated
osv-scanner scan source --lockfile=packages.lock.json
# NuGet author signing verification:
dotnet nuget verify <package>.nupkg
```

### Cargo (Rust)

```toml
# BAD Cargo.toml: wildcard, no Cargo.lock committed for a binary crate
[dependencies]
serde = "*"
```

```toml
# SAFE Cargo.toml + Cargo.lock committed (for binary crates) + cargo-deny policy
[dependencies]
serde = { version = "1.0.219", features = ["derive"] }

# deny.toml committed alongside
[advisories]
vulnerability = "deny"
unmaintained = "warn"
yanked = "deny"
```

```bash
# Fast PR-time
cargo audit --json
cargo deny check advisories
osv-scanner scan source --lockfile=Cargo.lock
```

### Go modules

```go
// BAD go.mod: indirect-only declaration of a vulnerable version; no GOSUMDB pin
module example.com/svc
go 1.21
require (
    github.com/golang-jwt/jwt v3.2.0+incompatible   // pre-CVE-2025-30204 family
)
```

```go
// SAFE go.mod with patched version; go.sum committed; GOSUMDB=on (default)
require (
    github.com/golang-jwt/jwt/v5 v5.2.1
)
```

```bash
# Fast PR-time
govulncheck ./...                     # call-graph aware — flags only reachable vulns
osv-scanner scan source --lockfile=go.mod
# Verify checksum DB integrity:
GOFLAGS=-mod=readonly GOSUMDB=sum.golang.org go mod verify
```

### vcpkg / Conan (C / C++)

```json
// BAD vcpkg.json: no baseline pin; transitively pulls whichever version vcpkg is on
{
  "name": "myapp",
  "dependencies": ["openssl", "libcurl"]
}
```

```json
// SAFE vcpkg.json: baseline pin + version overrides + manifest mode
{
  "name": "myapp",
  "version": "1.0.0",
  "builtin-baseline": "a8d2d50da80a2c5f1e1d0c4d8a3c8b8e9c1d2e3f",
  "dependencies": [
    { "name": "openssl", "version>=": "3.3.2" },
    { "name": "libcurl", "version>=": "8.10.1" }
  ],
  "overrides": [
    { "name": "openssl", "version": "3.3.2" }
  ]
}
```

```ini
# BAD conanfile.txt: no lockfile, no signed binary verification
[requires]
openssl/3.0.0
```

```ini
# SAFE conanfile.txt + conan.lock committed + verify_ssl on remote
[requires]
openssl/3.3.2
[options]
openssl:shared=False
```

```bash
# vcpkg
vcpkg install --x-manifest-root=. --x-feature=secure
osv-scanner scan source --lockfile=vcpkg.json
# Conan
conan lock create conanfile.txt
conan audit list                       # Conan 2.x audit subcommand
osv-scanner scan source --lockfile=conan.lock
```

## License Checking (fast pass)

The deep license analysis lives in [[dependency-auditor]]. At PR-time, flag only **newly introduced** licenses that are categorically incompatible.

```bash
npx license-checker --production --json
pip-licenses --format=json
go-licenses report ./...
cargo about generate about.hbs
```

| License class | PR-time action |
|---|---|
| MIT / BSD / Apache-2.0 / ISC / MPL-2.0 | Allow |
| **GPL / AGPL / SSPL** in a proprietary repo | Flag `severity: critical` (copyleft contamination risk) |
| **LGPL** dynamically linked | Allow with note; statically linked → flag |
| **UNKNOWN / NOASSERTION** | Flag `severity: critical` — unverifiable legal posture |
| Custom / "Commons Clause" / BSL | Defer to [[dependency-auditor]] for human review |

## Tool Integration (2026 landscape)

| Tool | Strength | Trade-off | When |
|---|---|---|---|
| **OSV-Scanner** (v2.3.5+, 2026) | 19+ lockfile formats · 11+ ecosystems · OSV.dev coverage · PR-mode action · transitive Python (requirements.txt) added in v2.3.5 | No reachability built in; pair with govulncheck for Go or [[dependency-auditor]] for cross-language reachability | Default PR scanner |
| **npm audit** | Built-in, zero install, fast | npm-only; some false positives in dev-only paths | Use with `--omit=dev --audit-level=high` |
| **pip-audit** | PyPA-maintained, reads installed env or requirements | Python only | Python projects always |
| **cargo audit** | Reads `Cargo.lock` against RustSec advisory DB | Rust only | Rust projects always |
| **govulncheck** | **Call-graph reachability** built in — flags only vulns on actual call paths | Go only | Go projects always — reachability is free here |
| **dotnet list package --vulnerable** | Native, transitive-aware, reads NuGet advisory feed | .NET only; needs `--include-transitive` flag | .NET projects always |
| **OWASP Dependency-Check** | Multi-language, NVD-backed | Slower than OSV-Scanner; better for [[dependency-auditor]] | Schedule, not PR |
| **Trivy** | Container + IaC + deps in one binary | Heavier scope than needed for PR-time deps | When the PR also touches Dockerfiles |
| **Renovate** | Auto-PR remediation, OSV.dev + GitHub Advisories input, immediate vuln PRs bypass schedule | Configuration surface is large | Auto-remediation worker |
| **Dependabot** | GitHub-native, alert-driven | GitHub-only; less configurable than Renovate | Default when on GitHub |

### Renovate config — vulnerability fast-track

```json5
// renovate.json
{
  "extends": ["config:recommended"],
  "vulnerabilityAlerts": {
    "enabled": true,
    "labels": ["security"],
    "schedule": ["at any time"],          // bypass normal schedule
    "prCreation": "immediate",
    "automerge": false                     // require human review on security PRs
  },
  "osvVulnerabilityAlerts": true,         // use OSV.dev in addition to GH Advisories
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "matchCurrentVersion": "!/^0/",
      "automerge": true                    // auto-merge patches on stable majors only
    }
  ]
}
```

### Dependabot config — security-first

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly" }
    open-pull-requests-limit: 10
    # Security updates bypass the schedule automatically.
    groups:
      patch-updates:
        update-types: ["patch"]
  - package-ecosystem: "pip"
    directory: "/"
    schedule: { interval: "weekly" }
  - package-ecosystem: "nuget"
    directory: "/"
    schedule: { interval: "weekly" }
  - package-ecosystem: "cargo"
    directory: "/"
    schedule: { interval: "weekly" }
  - package-ecosystem: "gomod"
    directory: "/"
    schedule: { interval: "weekly" }
```

## Severity (internal triage vs. refinement-loop output)

Internal triage drives the human report. The wire severity to CTO Chief is **always `critical`** per the warnings-are-bugs rule — there is no soft tier on the wire.

Triage is the product of four signals:

| Signal | Values |
|---|---|
| CVSS base | 0.0 – 10.0 (from advisory) |
| Direct / transitive | direct = higher priority |
| Reachable | true ▸ unknown ▸ false (true = higher priority; false often deferrable) |
| Delta vs base branch | `new` (PR introduced) ▸ `regressed` ▸ `unchanged` |

| Triage tier | Pattern | PR-time action |
|---|---|---|
| CRITICAL | CVSS ≥ 9.0 · direct · reachable=true · delta=new | BLOCK PR |
| CRITICAL | CVSS ≥ 7.0 · direct · delta=new (reachable unknown OK at PR-time) | BLOCK PR |
| HIGH | CVSS ≥ 7.0 · transitive · delta=new · no upgrade path available | BLOCK PR (with `defer-to-auditor` note) |
| HIGH | License GPL/AGPL/SSPL or UNKNOWN newly introduced | BLOCK PR |
| MEDIUM | CVSS 4.0–6.9 · direct · delta=new | Warn; require ack in PR body |
| MEDIUM | CVSS ≥ 7.0 · transitive · delta=unchanged | Defer to [[dependency-auditor]] |
| LOW | Outdated but no known CVE; deprecated package; major upgrade available | Backlog |

**Wire severity reconciliation**: regardless of triage tier, the letter emits `severity: critical`. The integrator uses `confidence`, `direct`, `reachable`, and `delta` to weight whether the finding blocks phase advancement. A `confidence: low` + `delta: unchanged` finding does not block; a `confidence: high` + `direct: true` + `delta: new` finding does.

## Output Format (human report)

```markdown
## Dependency Audit Report (PR-time)

### Summary
| Severity | Count | Required Action |
|----------|-------|-----------------|
| CRITICAL | 1 | BLOCK PR |
| HIGH     | 2 | BLOCK PR |
| MEDIUM   | 3 | Ack in PR body |
| LOW      | 8 | Backlog |

Scanned: package-lock.json (delta vs origin/main) · pyproject.toml unchanged · go.sum unchanged
Time: 7.4s · OSV-Scanner v2.3.5 · cached DB (last refresh: 2026-05-19)

### CRITICAL — direct, new in this PR
1. **axios 0.21.0** — CVE-2021-3749 (SSRF, CVSS 9.1)
   - Path: package.json (direct)
   - Delta: new (base branch had axios 1.7.7)
   - Reachable: unknown (defer to [[dependency-auditor]] for call-graph)
   - Fix: `npm install axios@^1.7.7`

### HIGH — transitive, new
2. **lodash 4.17.20** (via @some/lib 2.0.0) — CVE-2021-23337 (CVSS 7.2)
   - Upgrade path: bump @some/lib to ^2.1.0 (pulls lodash ^4.17.21)
   - Fix: `npm install @some/lib@^2.1.0`

### License
| Package | License | Action |
|---------|---------|--------|
| new-gpl-lib 1.0.0 | GPL-3.0 | REMOVE (incompatible with proprietary repo) |

### Outdated (non-blocking)
| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| typescript | 5.3.3 | 5.7.2 | Minor, no CVEs |

### Suggested actions
```bash
npm install axios@^1.7.7
npm install @some/lib@^2.1.0
npm uninstall new-gpl-lib
```
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(package+version+vuln_id+ecosystem)[:12]>
severity: critical                             # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                # high if lockfile-resolved + advisory matches; low if manifest-range only
engine: osv-scanner | npm-audit | pip-audit | cargo-audit | govulncheck | dotnet-list | trivy | manual
package: <name>                                # e.g., axios
version: <resolved-version>                    # e.g., 0.21.0 (from lockfile)
ecosystem: npm | pypi | maven | nuget | cargo | go | conan | vcpkg
vulnerability_id: CVE-2021-3749                # or GHSA-..., RUSTSEC-..., GO-..., OSV id
cvss: 9.1                                      # CVSS v3.1 base score from advisory
fix_available: true | false
fix_version: ">=1.7.7"                         # null if no fix exists
direct: true | false                           # direct dep vs transitive
upgrade_path: ["@some/lib@^2.1.0"]             # for transitive: which direct to bump; [] if direct
reachable: true | false | unknown              # unknown is allowed at PR-time
delta: new | unchanged | regressed             # vs base branch lockfile
license: MIT                                   # populated for license-class findings
file: package-lock.json                        # which lockfile / manifest
message: "axios 0.21.0 vulnerable to SSRF via CVE-2021-3749"
fix: "npm install axios@^1.7.7"
reference: https://osv.dev/vulnerability/CVE-2021-3749
defer_to_auditor: false                        # true if needs deep transitive/reachability analysis
```

The integrator uses `confidence`, `direct`, `reachable`, and `delta` to weight findings. A `direct: true` + `delta: new` + `cvss >= 7.0` finding blocks phase advancement. A `direct: false` + `delta: unchanged` + `reachable: unknown` finding sets `defer_to_auditor: true` and the integrator does not block on it — [[dependency-auditor]] picks it up on the next scheduled run.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
