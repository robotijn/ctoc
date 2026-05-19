---
name: sbom-cra-checker
description: SBOM correctness, signing, retention, and EU Cyber Resilience Act (CRA) vulnerability-reporting readiness — validates SPDX 2.3+/CycloneDX 1.6+ against NTIA minimum elements and ENISA Single Reporting Platform wiring.
type: skill
when_to_load:
  - "SBOM"
  - "software bill of materials"
  - "CRA"
  - "Cyber Resilience Act"
  - "CycloneDX"
  - "SPDX"
  - "ENISA"
  - "NTIA minimum elements"
  - "vulnerability reporting"
  - "VEX"
  - "supply chain compliance"
  - "EU regulation software"
  - "single reporting platform"
related_skills:
  - security/dependency-auditor
  - compliance/license-scanner
  - compliance/gdpr-compliance-checker
  - security/secrets-detector
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# SBOM + CRA Checker (skill)

> New skill for CTOC v7 B2 compliance sweep — the EU Cyber Resilience Act makes SBOMs a **legal artifact**, not a best-practice nicety. `dependency-auditor` and `license-scanner` produce inputs; this skill validates the SBOM itself, its signature, its retention, and the manufacturer's ability to file a 24-hour notification on the ENISA Single Reporting Platform.
> Auto-loaded when the user prompt matches a `when_to_load` trigger.

## Role

You are a paranoid compliance auditor. Your job is to assume that on **11 September 2026** an EU market-surveillance authority will ask the manufacturer to produce, on demand, (a) the SBOM for every product version still on the market, (b) the signature proving the SBOM matches the shipped binary, (c) the 10-year retention chain, and (d) a runbook capable of filing a CRA notification on the ENISA SRP **within 24 hours** of becoming aware of an actively-exploited vulnerability. If any of those four cannot be demonstrated end-to-end today, you raise it. SBOMs that exist only on a developer laptop, that are unsigned, that drift from the shipped binary, or that lack a credible reporting runbook are **not compliant** — they are theater.

## 2026 Best Practices (Compliance category — CRA / SBOM)

- **Legal deadlines (non-negotiable)**:
  - **11 Sep 2026** — manufacturers must report actively-exploited vulnerabilities and severe incidents via the ENISA Single Reporting Platform (SRP). Reporting cadence: **24h early warning · 72h detailed notification · 14 days after a corrective measure is available (vulnerabilities) / 1 month after initial notification (severe incidents) for the final report**. (Sources: [EC CRA — Reporting](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting), [ENISA SRP](https://www.enisa.europa.eu/topics/product-security-and-certification/single-reporting-platform-srp).)
  - **11 Dec 2027** — full conformity assessment applies. Products with digital elements placed on the EU market must comply with the essential cybersecurity requirements, including the SBOM obligation. ([EC CRA — Policy page](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act).)
  - **Retention: 10 years** after a product is placed on the market for the security documentation, including the SBOM. ([BSI guidance](https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Informationen-und-Empfehlungen/Cyber_Resilience_Act/cyber_resilience_act.html).)
  - **Maximum administrative fines**: **€15 million or 2.5% of total worldwide annual turnover, whichever is higher**, for non-compliance with the essential cybersecurity requirements. ([CRA Regulation (EU) 2024/2847, Art. 64](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act).)

- **NTIA Minimum Elements (the floor — every SBOM must contain all seven data fields plus the three practices)** ([NTIA, *The Minimum Elements For a Software Bill of Materials*, July 2021](https://www.ntia.gov/report/2021/minimum-elements-software-bill-materials-sbom)):
  1. **Supplier Name** — who created the component
  2. **Component Name** — the component's name
  3. **Version of the Component**
  4. **Other Unique Identifiers** — e.g. PURL, CPE, SWID
  5. **Dependency Relationship** — how components relate (parent/child / "Included-In")
  6. **Author of SBOM Data** — who assembled the SBOM (may differ from supplier)
  7. **Timestamp** — when the SBOM was generated
  Plus three **practice** requirements: data format must be machine-readable (SPDX, CycloneDX, or SWID are the named conforming formats); SBOMs must be regenerated when components change; depth must cover at least one level of transitive dependencies. **An SBOM missing any of these seven fields is non-conforming.**

- **Format choice: SPDX 2.3+ or CycloneDX 1.6+** — both are explicitly recognized; CRA Art. 13(25) text requires a *commonly used and machine-readable* format. ([Sbomify comparison](https://sbomify.com/2026/01/15/sbom-formats-cyclonedx-vs-spdx/), [FOSSA](https://fossa.com/blog/sbom-formats-compared-explained/).)
  - **CycloneDX 1.6** (2024, ECMA-424) — component-centric, originated in OWASP, strongest vulnerability/VEX integration, native CBOM (cryptography BoM) and ML-BoM extensions. Default choice for security/CRA-driven programs.
  - **SPDX 2.3** (ISO/IEC 5962:2021) — package-and-relationship model, strongest license metadata, broad tool support. Default for license-compliance-driven programs. SPDX 3.0 (2024) splits into profiles; many tools still pin SPDX 2.3 — verify your toolchain before adopting 3.0.
  - If unsure, emit **CycloneDX 1.6** as the primary format and an SPDX 2.3 export alongside — most generators support both.

- **Signing is non-optional**: unsigned SBOMs are repudiable. Sign with **Sigstore cosign** (keyless OIDC) or x.509 over the SBOM artifact. CRA's "verifiable" requirement is interpreted by most legal commentary to require a tamper-evident chain from build → SBOM → distribution. ([OpenSSF on CRA / SBOM signing](https://openssf.org/public-policy/eu-cyber-resilience-act/).)

- **Build provenance (SLSA + in-toto attestations) above bare signing**: a signed SBOM proves *who* signed; a SLSA-aligned in-toto attestation proves *how* the build ran (source repo, commit SHA, builder identity, isolation level). 2026 platforms emit these natively — GitHub Actions artifact attestations (GA since 2024) and Red Hat Konflux issue in-toto ITE-6 attestations linked to OCI artifacts. Treat a SLSA Build L3 attestation alongside a signed SBOM as the **target state**; signed-SBOM-only as the **floor**. ([SLSA framework](https://slsa.dev/), [GitHub artifact attestations](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds), [InfoQ — provenance becoming standard, Aug 2025](https://www.infoq.com/news/2025/08/provenance/).)

- **Downstream verification at install / pull time**: a signature only matters if someone checks it. Wire the verification step into (a) the consuming CI pipeline (`cosign verify-blob` / `cosign verify-attestation` as a required gate before a dependency is cached), (b) the deployment admission controller for container workloads (Sigstore policy-controller, Kyverno verifyImages), and (c) the installer for distributed binaries. An unverified-but-signed SBOM in transit is equivalent to no signature.

- **Per-release SBOM bundled with binary artifact**: the SBOM travels with the product. Attach as a release asset on GitHub, an OCI artifact next to the container image, or a sidecar in the installer bundle. An SBOM in a separate repo that drifts from the shipped binary fails CRA's accuracy requirement.

- **Generate at build time, not after**: build-time generation (cyclonedx-maven-plugin, `dotnet CycloneDX`, `cyclonedx-py`, `@cyclonedx/cdxgen` integrated with the resolver) sees the *actual* dependency graph the build tool resolved. Post-hoc scanning of source trees or container images is a fallback and produces less precise data — flag it as `confidence: medium` at best. ([Sbomify, *SBOM Generation Tools Compared*, Jan 2026](https://sbomify.com/2026/01/26/sbom-generation-tools-comparison/).)

- **ENISA SRP runbook must exist before Sep 2026**: a manufacturer that cannot file in 24h is non-compliant the moment a CVE in their product is publicly exploited. The runbook must name:
  - the designated CSIRT (based on the manufacturer's main establishment),
  - the person/team responsible for filing,
  - the SBOM lookup procedure (which component? which version range? which downstream products?),
  - the customer-notification path (CRA requires informing affected users without undue delay).
  A testing period precedes the 11 Sep 2026 go-live; manufacturers should complete SRP profile onboarding (CSIRT member state, authorized representative for non-EU manufacturers, contact details) during that window rather than under incident pressure. ([ENISA SRP overview](https://www.enisa.europa.eu/topics/product-security-and-certification/single-reporting-platform-srp), [ENISA SRP implementation procurement](https://www.enisa.europa.eu/procurement/implementation-of-the-single-reporting-platform).)

- **SBOM diff in PRs**: emit the SBOM delta (added/removed/upgraded components) as a PR check. Reviewers cannot reason about supply-chain risk if dependency changes are invisible.

- **VEX (Vulnerability Exploitability eXchange) alongside SBOM**: CycloneDX 1.4+ supports inline VEX statements; CSAF VEX is the OASIS-standardized companion. VEX lets the manufacturer assert *not_affected* / *under_investigation* / *affected* / *fixed* per CVE — the only sane way to triage the noise an SBOM-driven scan produces. VEX must also be **published alongside** the SRP notification: an *affected* statement traces customer impact, an *under_investigation* statement is what you publish at T+24h when the analysis is still in flight, and a *fixed* statement closes the disclosure loop. Sign VEX documents the same way you sign SBOMs. ([OASIS CSAF](https://oasis-open.github.io/csaf-documentation/).)

- **SBOMs in regulated/medical/automotive paths have additional rules**: FDA Section 524B for medical devices, UNECE WP.29 R155/R156 for automotive, US Executive Order 14028 for federal software. These layer on top of CRA — don't strip CRA requirements when one of these applies; combine. ([MedDeviceGuide](https://meddeviceguide.com/blog/sbom-software-bill-of-materials-medical-devices-guide).)

## Core Principle: An SBOM is Evidence, Not Documentation

If the SBOM cannot be (a) regenerated deterministically from source, (b) cryptographically tied to the shipped binary, and (c) produced on 24h notice to a regulator who asks for the components of version 2.4.1 that shipped to a customer in 2031, it is not evidence. It is paperwork. The CRA fines paperwork.

Never assume: the build pipeline already produces an SBOM; "we use npm/Maven so we have an SBOM"; the SBOM in the repo matches what shipped; the security team has a notification runbook; the legal-retention requirement is the IT team's problem; SPDX or CycloneDX alone is sufficient without signing; one SBOM at release time satisfies a 10-year retention obligation through the version's full support window.

## Categories

> Ordered roughly by severity-on-the-wire impact. All findings emit `severity: critical` per warnings-are-bugs; the order below is the **internal triage** order the report uses.

### 0. Missing SBOM Artifact (CRA Annex I, Part II, point 1 — TOP PRIORITY)

```yaml
# BAD: release pipeline produces a binary, no SBOM
# .github/workflows/release.yml
- name: Build
  run: dotnet publish -c Release -o ./out
- name: Upload
  uses: actions/upload-artifact@v4
  with: { name: app, path: ./out }
# No SBOM generation, no attachment to the release. Non-compliant.

# SAFE: build → generate SBOM → sign → attach
- name: Build
  run: dotnet publish -c Release -o ./out
- name: Generate SBOM (CycloneDX)
  run: dotnet CycloneDX ./src/App.csproj -o ./out --json --include-project-references
- name: Sign SBOM (Sigstore)
  run: cosign sign-blob --yes --bundle ./out/bom.json.cosign.bundle ./out/bom.json
- name: Attach to release
  uses: softprops/action-gh-release@v2
  with: { files: "./out/*,./out/bom.json,./out/bom.json.cosign.bundle" }
```

Edge cases: monorepo where only the top-level package has an SBOM but each shipped artifact is a separate "product with digital elements"; multi-language repos where the SBOM covers only the dominant language; container images shipped without an OCI-attached SBOM.

### 1. Incomplete NTIA Fields

```json
// BAD: CycloneDX bom.json missing supplier on a component
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "components": [
    { "type": "library", "name": "left-pad", "version": "1.3.0" }
    // missing: supplier, purl, author of SBOM data, bom-ref
  ]
}

// SAFE
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "serialNumber": "urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79",
  "version": 1,
  "metadata": {
    "timestamp": "2026-05-19T08:14:22Z",
    "authors": [{ "name": "Acme Build Bot", "email": "build@acme.example" }],
    "component": { "type": "application", "name": "acme-app", "version": "2.4.1", "bom-ref": "pkg:acme-app@2.4.1" }
  },
  "components": [
    {
      "type": "library",
      "bom-ref": "pkg:npm/left-pad@1.3.0",
      "name": "left-pad",
      "version": "1.3.0",
      "supplier": { "name": "npm, Inc.", "url": ["https://www.npmjs.com/package/left-pad"] },
      "purl": "pkg:npm/left-pad@1.3.0"
    }
  ],
  "dependencies": [
    { "ref": "pkg:acme-app@2.4.1", "dependsOn": ["pkg:npm/left-pad@1.3.0"] }
  ]
}
```

Flag any of: missing `metadata.timestamp`, missing `metadata.authors`, components without `supplier`, components without a unique identifier (`purl` / `cpe` / `swid`), missing `dependencies` graph at least one level deep.

### 2. Unsigned SBOM

```bash
# BAD: bom.json published with no signature
gh release upload v2.4.1 bom.json

# SAFE: sign with cosign keyless (OIDC) — produces a verifiable bundle
cosign sign-blob --yes --bundle bom.json.cosign.bundle bom.json
gh release upload v2.4.1 bom.json bom.json.cosign.bundle

# Verify (anyone downstream)
cosign verify-blob \
  --bundle bom.json.cosign.bundle \
  --certificate-identity-regexp "https://github.com/acme/.+" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  bom.json
```

Equivalent for x.509-signed SBOMs via OpenSSL CMS or in-toto attestations. Either works; the requirement is **a verifiable signature chain to a known identity**. Self-signed keys without a published trust root fail the "verifiable" bar.

Verify the signature **at consumption**, not only at production. A signature unchecked downstream is decorative:

```bash
# CI gate before a release is published / a container is admitted to prod
cosign verify-blob \
  --bundle bom.json.cosign.bundle \
  --certificate-identity-regexp "https://github.com/acme/.+/.github/workflows/.+@refs/.+" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  bom.json || exit 1
```

### 3. Missing Build Provenance / Attestation (above the signing floor)

A signed SBOM proves who signed; an in-toto / SLSA attestation proves **how** the build ran (source repo, commit SHA, builder identity, isolation tier). 2026 platforms emit these natively — flag releases that ship a signed SBOM without an accompanying build attestation as a gap from the target state, even if not a hard CRA blocker today.

```bash
# BAD: signed bom.json, no provenance attestation
gh release upload v2.4.1 bom.json bom.json.cosign.bundle

# SAFE: GitHub native artifact attestation (Actions, GA since 2024)
# In the workflow:
- uses: actions/attest-build-provenance@v2
  with: { subject-path: './out/bom.json' }

# Verify downstream
gh attestation verify ./out/bom.json --repo acme/app
# Or with cosign + in-toto predicate
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity-regexp "https://github.com/acme/.+" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/acme/app:v2.4.1
```

Flag: SBOM signed but no SLSA/in-toto attestation attached; attestation present but for a different commit than the SBOM was generated from; attestation issuer not on an allowlist.

### 4. SBOM Not Retained 10 Years

```yaml
# BAD: SBOM in GitHub Releases only — repository can be deleted, archived, or transferred
# CRA expects 10 years after market placement. GitHub release retention is not guaranteed.

# SAFE: tiered retention
# 1. Hot: GitHub Releases / OCI registry — current versions, fast access
# 2. Cold: object storage (S3 / GCS / Azure Blob) with Object Lock / Bucket Lock in compliance mode
#    Retention period: 10 years from product end-of-market-availability date
# 3. Index: registry mapping (product, version, hash, SBOM URL, signature URL, ship_date, retention_until)
```

Flag: any pipeline that publishes the SBOM only to a mutable location (GitHub release, GitLab artifact, CI cache) without a duplicate write to immutable, long-retention storage. Flag: no documented retention policy in the project.

### 5. Missing ENISA-Report Runbook

```markdown
<!-- BAD: no runbook exists, or runbook is "email security@acme.example" -->

<!-- SAFE: docs/runbooks/cra-vulnerability-report.md -->
# CRA Vulnerability Notification Runbook

**Designated CSIRT**: <CSIRT of main establishment, e.g. NCSC-NL, BSI, CERT-FR>
**SRP credentials**: stored in <vault path>; primary owner: <name/role>; backup: <name/role>
**SRP manufacturer profile**: registered <date>; profile includes CSIRT member state + authorized representative if non-EU. Re-verify quarterly.
**SLA**: T+24h initial · T+72h detailed · T+14d (vuln) / T+30d (incident) final

## Trigger
An actively-exploited vulnerability is observed in any version of <product>
currently on the EU market, OR a severe incident impacting product security.

## Step 1 — Within 1 hour of awareness
- [ ] Page <on-call security>; create incident channel.
- [ ] Identify affected component(s); query SBOM index for downstream products.
- [ ] Confirm "actively exploited" status (see ENISA criteria) or "severe incident" criteria.

## Step 2 — Within 24 hours (T+24h Early Warning)
- [ ] File Early Warning notification on ENISA SRP <https://srp.enisa.europa.eu/>:
      product name, version range, suspicion of malicious exploitation, member states affected.
- [ ] Acknowledge receipt; record SRP case ID.

## Step 3 — Within 72 hours (T+72h Detailed Notification)
- [ ] File detailed notification: technical details, severity, impact, initial mitigation.

## Step 4 — Mitigation + customer notification
- [ ] Develop, test, release corrective measure (patch / new version).
- [ ] Publish (and sign) VEX statement: *affected* / *fixed* per CVE, with downstream product references derived from the SBOM index.
- [ ] Notify affected users without undue delay (CRA Art. 14(8)).

## Step 5 — Final report
- [ ] Vulnerabilities: T+14 days after corrective measure available — final SRP report.
- [ ] Severe incidents: T+1 month after initial — final SRP report.

## Annexes
- A. SBOM index query template
- B. CSIRT contact details (out-of-band)
- C. Press / customer notification templates
```

Flag: no runbook file, runbook missing any of the four staged deadlines, runbook missing the SBOM-lookup step (you can't notify customers if you can't trace components to products), runbook missing the SRP-profile-onboarding pre-flight, runbook missing the VEX-publish step in mitigation.

### 6. SBOM Out of Sync With Shipped Artifact

```bash
# BAD: SBOM generated days before release from a different commit
# (build pipeline regenerates the artifact but reuses a stale SBOM)

# SAFE: SBOM generation is part of the same pipeline run that produces the artifact,
# and the SBOM's component hash references the artifact's hash.

# Verify post-hoc by re-running generation and diffing:
syft scan ./out/app.tar.gz -o cyclonedx-json > /tmp/regen.json
cyclonedx-cli diff ./out/bom.json /tmp/regen.json --component-versions
# Any non-zero diff → SBOM has drifted from the artifact.
```

Flag: SBOM produced in a separate job that does not depend on the artifact build's output; SBOM committed to the repo (rather than generated per-release); SBOM whose `metadata.component.hashes` does not include a SHA-256 of the shipped artifact.

### 7. Missing Transitive Dependencies

NTIA practice #3 requires the SBOM to cover **at least one level** of transitive dependencies; CRA-grade auditors expect the *full* dependency closure. A shallow SBOM that lists only direct dependencies is a red flag.

```bash
# BAD: pip freeze captures the venv but only flat — no dependency graph
pip freeze > requirements.txt   # NOT an SBOM

# SAFE: cyclonedx-py captures the full transitive graph with relationships
cyclonedx-py environment --output-format JSON --output-file bom.json
# Or build-time, even better:
cyclonedx-py poetry --output-format JSON --output-file bom.json
```

Flag: SBOM with `dependencies` array having only the top-level component; SBOM whose `dependsOn` chains are <2 levels deep on any non-trivial application.

### 8. Scope Confusion: Source vs Build vs Runtime SBOM

CycloneDX 1.5+ distinguishes SBOM **types** in `metadata.lifecycles`:
- **design** — components intended to be used
- **pre-build** — declared dependencies (manifests)
- **build** — what the build actually resolved
- **post-build** — final artifact contents
- **operations** — what is actually deployed/running
- **discovery** — observed at runtime

CRA cares about **build** and **post-build** at minimum — what shipped. Many tools (especially shallow CI scanners) emit *pre-build* SBOMs (just the manifest) and call them done. That's the wrong scope.

```json
// BAD: lifecycle implies design-only, not what was built
{ "metadata": { "lifecycles": [{ "phase": "design" }] } }

// SAFE: the artifact-shipped SBOM declares its phase honestly
{ "metadata": { "lifecycles": [{ "phase": "build" }, { "phase": "post-build" }] } }
```

Flag: SBOMs with no `lifecycles` declaration; SBOMs declaring `pre-build` or `design` but attached to a shipped release; multiple SBOMs for the same release with conflicting lifecycle scope.

### 9. Hallucinated / Unverified Components in AI-Generated Manifests

Where dependency manifests are LLM-generated, package names may be hallucinated (do not exist on the registry) — and an SBOM that names a nonexistent component is worse than no SBOM: it asserts the existence of a component that cannot be patched. Cross-check every `purl` against the upstream registry as part of SBOM validation. Coordinate with [[dependency-auditor]] which carries the hallucination-detection logic.

### 10. License Field Omitted (CRA Annex I + license-scanner overlap)

CRA Annex I requires the SBOM to support vulnerability management; it does not mandate license. But: license absence is a `confidence: medium` finding because (a) most CRA-conforming tools emit it for free and (b) [[license-scanner]] needs it. Flag any component with `licenses: []` or no `licenses` key when the upstream registry has it.

### 11. SBOM Format Mismatch With Recipient Requirements

If you ship to US Federal (EO 14028 — SPDX-preferred for some agencies), EU CRA (either SPDX or CycloneDX), and medical device (FDA prefers SPDX + machine-readable), produce **both** formats. Don't argue format wars — produce the union, sign both, retain both.

```bash
# Generate both from a single source of truth
syft scan ./out/app.tar.gz -o cyclonedx-json=bom.json -o spdx-json=bom.spdx.json
cosign sign-blob --yes --bundle bom.json.cosign.bundle bom.json
cosign sign-blob --yes --bundle bom.spdx.json.cosign.bundle bom.spdx.json
```

## Language / Toolchain Coverage

The CRA does not differentiate by language — every product with digital elements placed on the EU market is in scope. The toolchain choices below are concrete starting points; verify the tool's current release before pinning to a version.

### C# / .NET 9

```bash
# Microsoft's own tool — SPDX 2.2 output, integrates with .NET SDK
dotnet tool install --global Microsoft.Sbom.DotNetTool
sbom-tool generate -b ./bin/Release -bc ./src -pn AcmeApp -pv 2.4.1 \
  -nsb https://acme.example -m ./manifest

# CycloneDX-flavored — emits CycloneDX 1.6
dotnet tool install --global CycloneDX
dotnet CycloneDX ./src/AcmeApp.csproj -o ./out --json --include-project-references --set-version 2.4.1
```

Pitfalls: `dotnet CycloneDX` defaults can omit project-reference traversal — use `--include-project-references` for multi-project solutions. `Microsoft.Sbom.Tool` produces SPDX 2.2; if you need 2.3+, post-process or switch to `dotnet CycloneDX`.

### Java 21+ (Maven / Gradle)

```xml
<!-- Maven: cyclonedx-maven-plugin -->
<plugin>
  <groupId>org.cyclonedx</groupId>
  <artifactId>cyclonedx-maven-plugin</artifactId>
  <configuration>
    <schemaVersion>1.6</schemaVersion>
    <outputFormat>json</outputFormat>
    <includeBomSerialNumber>true</includeBomSerialNumber>
    <includeTestScope>false</includeTestScope>
  </configuration>
  <executions>
    <execution><phase>package</phase><goals><goal>makeAggregateBom</goal></goals></execution>
  </executions>
</plugin>
```

```kotlin
// Gradle Kotlin DSL — cyclonedx-gradle-plugin
plugins { id("org.cyclonedx.bom") version "<current>" }   // pin to a tested version
tasks.cyclonedxBom {
    setIncludeConfigs(listOf("runtimeClasspath"))
    setSkipConfigs(listOf("testCompileClasspath", "testRuntimeClasspath"))
    setOutputFormat("json")
}
```

Pitfalls: defaults often include test-scope dependencies — strip them or you will leak JUnit / Mockito into the production SBOM. For SPDX output use the `spdx-maven-plugin` alongside.

### Python 3.12+

```bash
# CycloneDX official Python generator — supports requirements, Poetry, Pipenv, PDM
pip install cyclonedx-bom
cyclonedx-py environment --output-format JSON --output-file bom.json   # current venv
cyclonedx-py poetry --output-format JSON --output-file bom.json        # poetry.lock
cyclonedx-py requirements requirements.txt --output-format JSON --output-file bom.json

# Microsoft sbom-tool also works on Python projects (SPDX 2.2 output)
sbom-tool generate -b ./dist -bc . -pn acme-app -pv 2.4.1 -nsb https://acme.example -m ./manifest
```

Pitfalls: `pip freeze` is **not** an SBOM (no relationships, no PURLs, no metadata). Generating from `requirements.txt` without a lockfile produces an under-pinned SBOM — use `pip-compile` / Poetry / PDM to lock first.

### C (C17/C23 — Conan / vcpkg / CMake)

```bash
# Microsoft sbom-tool over a build output directory works for C/C++ when packages
# are resolved via Conan or vcpkg (it reads the manifest + lockfile).
sbom-tool generate -b ./build -bc . -pn acme-c-app -pv 2.4.1 \
  -nsb https://acme.example -m ./manifest

# Conan native SBOM hook (Conan 2.x)
conan install . --output-folder=build --build=missing
conan sbom build --format cyclonedx-1.6 --output build/bom.json
```

Pitfalls: vendored sources (a `third_party/` directory copied in) are invisible to package-manager-based generators. Augment with `syft scan ./build -o cyclonedx-json` to catch vendored code. Header-only libraries with no build artifact still count as components — declare them manually if the toolchain misses them.

### C++ 20/23

Same tooling as C. Additionally:

```bash
# vcpkg manifest mode + sbom-tool
vcpkg install --x-manifest-root=. --x-install-root=./vcpkg_installed
sbom-tool generate -b ./build -bc . -pn acme-cpp-app -pv 2.4.1 -nsb https://acme.example -m ./manifest

# Or syft against the final shipping image / archive
syft scan ./dist/acme-cpp-app.tar.gz -o cyclonedx-json=bom.json -o spdx-json=bom.spdx.json
```

Pitfalls: STL and compiler runtime are usually omitted — that's fine if you statically link a documented toolchain version, but call it out in `metadata.properties` so an auditor can trace it. Cross-compilation (e.g. building for Linux ARM64 on a macOS host) requires generating the SBOM against the **target** binary, not the build host.

### TypeScript / JavaScript

```bash
# npm v10.5+ has a native sbom command
npm sbom --sbom-format cyclonedx > bom.json
npm sbom --sbom-format spdx > bom.spdx.json

# @cyclonedx/cdxgen — most comprehensive Node/TS generator, also covers many other langs
npx @cyclonedx/cdxgen -t javascript -o bom.json --spec-version 1.6 .

# pnpm / yarn berry — use cdxgen, both lockfile formats are supported
npx @cyclonedx/cdxgen -t pnpm -o bom.json --spec-version 1.6 .
```

Pitfalls: `npm sbom` reflects what's in `node_modules`, which depends on whether you ran `--production` — make sure to run it after `npm ci --omit=dev` for the shipped graph. Bundlers (Vite, esbuild, Rollup) tree-shake — the SBOM should be the *resolved* dependency graph, not just everything in `package.json`.

### SQL — skipped (with rationale)

Database schemas and stored procedures are not "software components" in the NTIA / CRA sense — they don't produce a shippable binary that's distributed to end users. A `.sql` file alone has no SBOM. **But**: the database engine (PostgreSQL 17, MySQL 9, MSSQL 2025, SQLite) and any extensions (pgvector, PostGIS, pg_partman) **are** components of the deployed system and **must** appear in the SBOM of whatever container or installer ships them. Treat the SQL layer as a runtime dependency of the application SBOM, not as a separate SBOM. If a manufacturer ships an installable database product, then a normal SBOM-for-the-binary applies — same rules as C.

## Tool Integration (2026 landscape)

> Tool capabilities and integrations evolve; verify a tool's current release notes against the claims below before pinning. The categorization is stable; the version numbers and feature lists drift.

| Tool | Role | Strengths | Trade-offs |
|------|------|-----------|------------|
| **Syft (Anchore)** | General SBOM generator | Single binary; broadest language coverage; emits both CycloneDX and SPDX; scans filesystems, container images, and archives | Post-hoc scanner — sees what's there, not what the build resolved. Use as a fallback or a verification check, not the canonical source |
| **CycloneDX CLI** | Format conversion + merge + validation | Authoritative for CycloneDX validation; merges multi-module SBOMs into one; converts between formats and spec versions | Generation requires per-language plugins (cyclonedx-maven, cyclonedx-py, etc.) |
| **Microsoft `sbom-tool`** | Build-output SBOM, SPDX 2.2 | Integrates with .NET SDK natively; works across languages via build directory scanning; published by Microsoft, used internally for Microsoft products | SPDX 2.2 (not 2.3) at time of writing — verify the current release before pinning |
| **Sigstore cosign** | Signing | Keyless OIDC signing; transparency log (Rekor) — verifiable years later; widely adopted; OSI / OpenSSF stewardship | Requires OIDC identity provider (GitHub/GitLab/Google/etc.) in the build pipeline |
| **OWASP Dependency-Track** | SBOM inventory + vulnerability monitoring | Open-source; ingests CycloneDX SBOMs; continuous vulnerability monitoring against the inventory; VEX-aware; CRA-shaped audit trail | Self-hosted; needs operational care (database, upgrades) |
| **GUAC** | SBOM graph aggregation | Graph database over many SBOMs + attestations; cross-product dependency queries (e.g. "every product that contains log4j 2.14") — exactly the lookup needed for ENISA notifications | Maturing project; expect operational rough edges |
| **GitHub native SBOM export** | Quick SPDX 2.3 export | `GET /repos/{owner}/{repo}/dependency-graph/sbom`; zero setup; aggregates from GitHub's dependency graph | Source-tree dependency graph, not build-resolved — not sufficient as the canonical CRA SBOM |
| **FOSSA / Snyk SBOM / Mend** | Commercial SCA + SBOM | Hosted retention; CRA-shaped reporting workflows; VEX management UIs; SLA-backed | Commercial license; vendor lock-in; verify their SBOM matches your build-time SBOM |
| **Sbomify / Lineaje / Cybeats** | Specialist SBOM platforms | CRA-targeted workflows; SBOM lifecycle (intake → enrichment → distribution → retention); often include SRP-style reporting prep | Newer category; due-diligence the vendor before betting compliance on them |

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|-------|----------|--------|
| CRITICAL | No SBOM at all on a shipped release · no ENISA-SRP runbook · SBOM unsigned · SBOM in mutable-only storage with no retention plan · SBOM not regenerated since first release of a long-supported product | BLOCK release; cannot lawfully place on EU market after 11 Sep 2026 |
| HIGH | NTIA mandatory field missing on >5% of components · SBOM lifecycle phase wrong (pre-build presented as shipped) · transitive deps shallower than one level · no license metadata on >20% of components · no build-provenance attestation (signed but no SLSA / in-toto) · signature does not verify downstream | Fix before next release |
| MEDIUM | Tool version drift (e.g. SPDX 2.2 when 2.3+ available) · SBOM in only one format when recipients require both · license metadata partially missing · no VEX channel defined | Within sprint |
| LOW | Cosmetic: SBOM has redundant fields, non-canonical ordering, missing optional `metadata.properties` | Backlog |

## Output Format

```markdown
## SBOM + CRA Readiness Report — <product@version>

### Summary
| Severity | Count | Required Action |
|----------|-------|-----------------|
| CRITICAL | 0     | IMMEDIATE       |
| HIGH     | 2     | Before Release  |
| MEDIUM   | 5     | Within Sprint   |
| LOW      | 12    | Backlog         |

| CRA Readiness Dimension          | Status |
|----------------------------------|--------|
| SBOM exists for shipped artifact | yes / no |
| Format (SPDX 2.3+ / CycloneDX 1.6+) | <list> |
| NTIA 7 fields complete           | yes / no (gap: ...) |
| Signed (cosign / x.509)          | yes / no |
| Signature verifies downstream    | yes / no |
| Build provenance attestation (SLSA / in-toto) | yes / no |
| Bundled with binary artifact     | yes / no |
| 10-year retention plan documented| yes / no |
| ENISA SRP runbook present        | yes / no |
| ENISA SRP runbook covers 24h/72h/14d/1mo | yes / no |
| ENISA SRP manufacturer profile onboarded | yes / no |
| VEX channel defined + publish step in runbook | yes / no |

### CRITICAL: No ENISA SRP runbook
**File**: docs/runbooks/ (no cra-vulnerability-report.md)
**CRA**: Art. 14 — Reporting obligations
**Impact**: Manufacturer cannot meet 24h reporting SLA after 11 Sep 2026.
            Maximum fine: €15M or 2.5% of global turnover.
**Fix**: Create docs/runbooks/cra-vulnerability-report.md with the four-stage timeline
        (T+24h / T+72h / T+14d / T+1mo) and CSIRT designation.
**Reference**: https://digital-strategy.ec.europa.eu/en/policies/cra-reporting
```

## Special Considerations

- **Open-source projects**: the CRA contains explicit carve-outs for non-commercial open-source software (Recital 18, Art. 3(18)). A project that is purely upstream, with no commercial steward and no monetary exchange, is not directly in CRA scope as a "manufacturer." But the moment a vendor *integrates* that OSS into a commercial product, the vendor inherits SBOM and reporting obligations for the whole stack. Don't tell an upstream OSS maintainer they must comply; do tell the downstream vendor they must.
- **Internal-only tools**: products not "placed on the market" are out of scope. An internal-only line-of-business app is not in CRA scope. But: if you sell access to the app (SaaS), it is in scope as a product with digital elements remotely accessed.
- **Open-source steward** (CRA Art. 24): a new role with lighter-touch obligations than a manufacturer. Foundations stewarding OSS used in commercial products fall here. Different SBOM expectations.
- **Legacy products on the market before 11 Dec 2027**: there is no grandfather clause for products still receiving substantial updates after that date — substantial updates re-trigger compliance. Confirm with legal counsel before relying on a legacy carve-out.
- **Third-party SBOMs**: if a vendor ships you a sub-component with its own SBOM, you must **integrate** it into your product SBOM (CycloneDX `externalReferences` or SPDX `relationship: CONTAINS`). Don't ignore vendor SBOMs and re-scan their binaries — you'll lose precision.
- **VEX is part of the answer, not a bypass**: filing a 24h notification under CRA is required when a vuln is actively exploited, regardless of whether you have a VEX statement asserting *not_affected*. VEX reduces scanner noise; it does not remove the reporting duty.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+kind+target)[:12]>   # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = directly verified; low = inferred from absence
engine: sbom-cra-checker | syft | cyclonedx-cli | sbom-tool | manual
kind:                                                  # what category of finding
  - missing_sbom
  - ntia_field_missing
  - unsigned_sbom
  - unverified_signature                                # signature present but does not verify
  - missing_attestation                                 # no SLSA / in-toto build-provenance attestation
  - retention_noncompliant
  - missing_enisa_runbook
  - missing_srp_onboarding                              # SRP manufacturer profile not registered
  - missing_vex                                         # no VEX channel / no VEX published with disclosure
  - sbom_artifact_drift
  - missing_transitive_deps
  - scope_confusion_lifecycle
  - hallucinated_component
  - format_mismatch
sbom_format: cyclonedx-1.6 | cyclonedx-1.5 | spdx-2.3 | spdx-2.2 | spdx-3.0 | none
attestation: slsa-v1 | in-toto-ite6 | github-build-provenance | none | unknown
ntia_field_missing:                                    # one or more, only when kind = ntia_field_missing
  - supplier_name
  - component_name
  - version
  - unique_identifier
  - dependency_relationship
  - sbom_author
  - timestamp
retention_compliant: true | false | unknown            # 10-year retention plan present?
signed: true | false | unknown                         # cosign / x.509 signature present?
cra_article: "Art. 13" | "Art. 14" | "Annex I"        # which CRA provision is implicated
target_file: docs/runbooks/cra-vulnerability-report.md # if a file, point to it
target_line: <n> | null                                # if line-specific
sbom_path: out/bom.json | null                         # the SBOM under inspection
component_ref: pkg:npm/left-pad@1.3.0 | null          # if a specific component
message: "ENISA SRP runbook missing — manufacturer cannot meet 24h reporting SLA"
suggested_fix: "Create docs/runbooks/cra-vulnerability-report.md per template in skill"
reference: https://digital-strategy.ec.europa.eu/en/policies/cra-reporting
```

The integrator uses `confidence` to weight findings. A `confidence: low` finding (e.g. inferred absence of a runbook because no `docs/runbooks/` directory exists) emits at `severity: critical` on the wire per warnings-are-bugs, but the integrator may pair it with a question to the user before blocking. `confidence: high` findings (e.g. SBOM file present and explicitly missing `metadata.timestamp`) block phase advancement unconditionally.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every CRA non-conformance, every missing NTIA field, every unsigned SBOM, every absent runbook step, every deprecation in the toolchain (e.g. SPDX 2.2 when 2.3+ is available), and every CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a missing runbook today is a €15M fine on **11 September 2026** or a SBOM-trace request that cannot be answered in 2031. Code that ships green-with-warnings ships with known latent failures; CRA paperwork that ships green-with-gaps ships with known latent fines.

## Sources

- [European Commission — Cyber Resilience Act (policy)](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act)
- [European Commission — CRA Reporting obligations](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting)
- [ENISA — Single Reporting Platform (SRP)](https://www.enisa.europa.eu/topics/product-security-and-certification/single-reporting-platform-srp)
- [OpenSSF — EU Cyber Resilience Act](https://openssf.org/public-policy/eu-cyber-resilience-act/)
- [Sbomify — Compliance hub (CRA / NIS2 / EO 14028)](https://sbomify.com/compliance/)
- [Sbomify — SBOM Formats Compared: CycloneDX vs SPDX (Jan 2026)](https://sbomify.com/2026/01/15/sbom-formats-cyclonedx-vs-spdx/)
- [Sbomify — SBOM Generation Tools Compared (Jan 2026)](https://sbomify.com/2026/01/26/sbom-generation-tools-comparison/)
- [NTIA — The Minimum Elements For a Software Bill of Materials (July 2021)](https://www.ntia.gov/report/2021/minimum-elements-software-bill-materials-sbom)
- [BSI — Cyber Resilience Act guidance](https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Informationen-und-Empfehlungen/Cyber_Resilience_Act/cyber_resilience_act.html)
- [OASIS CSAF — VEX documentation](https://oasis-open.github.io/csaf-documentation/)
- [MedDeviceGuide — SBOM for Medical Devices (FDA 524B + EU CRA + NTIA)](https://meddeviceguide.com/blog/sbom-software-bill-of-materials-medical-devices-guide)
- [SLSA — Supply-chain Levels for Software Artifacts](https://slsa.dev/)
- [GitHub — Using artifact attestations to establish provenance for builds](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds)
- [InfoQ — Supply Chain Security: Provenance Tools Becoming Standard (Aug 2025)](https://www.infoq.com/news/2025/08/provenance/)
- [ENISA — SRP implementation (procurement)](https://www.enisa.europa.eu/procurement/implementation-of-the-single-reporting-platform)
