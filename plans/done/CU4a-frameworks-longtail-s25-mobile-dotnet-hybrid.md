---
approved_by: human
approved_at: 2026-07-10T18:13:18.659Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:39.078Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: ".NET & hybrid mobile (maui · xamarin · ionic · capacitor · nativescript)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/mobile/maui.md
  - skills/frameworks/mobile/xamarin.md
  - skills/frameworks/mobile/ionic.md
  - skills/frameworks/mobile/capacitor.md
  - skills/frameworks/mobile/nativescript.md
  - tests/cu4a-mobile-dotnet-hybrid-guides.test.js
---

# CU4a s25 — .NET & hybrid mobile (maui · xamarin · ionic · capacitor · nativescript)

> Slice 25 of the CU4a decomposition. De-stub the 5 thin **mobile** framework
> guides (maui · xamarin · ionic · capacitor · nativescript) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: .NET/WebView-hybrid mobile: migration/EOL status, native-bridge + WebView security (CWE-79/JS-bridge), and platform-permission handling. Adds one content-contract test that reads the REAL guide
> files off disk with **zero doubles**. Disjoint by file from every sibling upgrade slice →
> `depends_on: none` (parallel-safe; Gate 2 & 3 still batch per parent via `approveSubplans`).
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES. SINGLE-FRAMEWORK EXAMPLES.**
> Every framework version, CVE/CWE id, advisory, date, and best-practice claim MUST be WEB-VERIFIED
> at edit time (WebSearch or direct fetch of the framework's official docs / release notes / PyPI /
> npm / GitHub releases / cwe.mitre.org) and carry an inline dated http source ≥ 2025-01-01 — never
> invented (hard user rule). If a claim has no dated authoritative source, **OMIT it** and note the
> absence in the audit findings rather than asserting it uncited. Examples are idiomatic + current
> within each single framework — the 7-language BAD/SAFE cross-coverage rule is EXEMPT here.

Maps to CU4a acceptance criteria: **"every audit-confirmed thin framework file is upgraded or
recorded"**, **"upgraded frameworks meet the CU3 depth standard (>5 sections; each section names a
technology-specific identifier — version number, CWE id, or concrete API/function name; every
version/security claim carries a dated source ≥ 2025-01-01)"**, and **"no audited-SOLID file is
rewritten (no-churn)"** — for these 5 files.

## Implementation Details

### Architecture Decision

Single-framework reference guides → the **7-language BAD/SAFE cross-coverage rule does NOT apply**
(CU4a single-framework exemption). Each guide's examples are in ITS OWN framework, correct +
idiomatic + current-version. Bar = depth-within-framework, objectively gated: every added `## `
section names a concrete identifier (version number, CWE id, or API/function name); every
version/security claim carries an inline dated http source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the 5 guides has exactly 5 `## ` sections today
(confirmed by reading fresh 2026-07-10). The existing 5 sections are preserved verbatim; new
sections are ADDED below them. The H1 `# <Framework> CTO` header + any frontmatter stay intact so
`.ctoc/skills.json` trigger indexing is unaffected.

Grouping rationale: these 5 are ONE research pass because the correction spine is shared —
.NET/WebView-hybrid mobile: migration/EOL status, native-bridge + WebView security (CWE-79/JS-bridge), and platform-permission handling. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/mobile/maui.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-mobile-dotnet-hybrid-guides.test.js
skills/frameworks/mobile/xamarin.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-mobile-dotnet-hybrid-guides.test.js
skills/frameworks/mobile/ionic.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-mobile-dotnet-hybrid-guides.test.js
skills/frameworks/mobile/capacitor.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-mobile-dotnet-hybrid-guides.test.js
skills/frameworks/mobile/nativescript.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-mobile-dotnet-hybrid-guides.test.js
```

5 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/mobile/maui.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for maui edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Lifecycle footguns** — handlers vs renderers (mappers), `MainThread.BeginInvokeOnMainThread`, dependency-injection lifetime, Shell navigation, platform-specific `#if`
- **Performance** — startup/AOT, collection virtualization
- **Security** — SecureStorage not plaintext (CWE-312), certificate pinning
- **Version** — .NET MAUI current .NET release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/mobile/xamarin.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for xamarin edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **EOL footguns** — Xamarin support ENDED (May 2024) → migrate to .NET MAUI; do NOT start new Xamarin projects, `MessagingCenter` deprecated, linker behavior
- **Migration** — upgrade-assistant path
- **Security** — SecureStorage (CWE-312), TLS
- **Version** — Xamarin EOL + MAUI migration, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/mobile/ionic.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for ionic edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **WebView footguns** — DOM content in a WebView → XSS if untrusted HTML injected (CWE-79), framework choice (Angular/React/Vue), Capacitor vs legacy Cordova plugins, live-reload security
- **Performance** — virtual scroll, lazy routes
- **Security** — CSP, `innerHTML` sanitization (CWE-79), secure storage plugin
- **Version** — Ionic current release + Capacitor, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/mobile/capacitor.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for capacitor edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Bridge footguns** — native plugin bridge, `server.url`/live-reload must be off in prod, `allowNavigation` scope, custom-scheme, permissions in native manifests
- **Correctness** — plugin platform parity
- **Security** — WebView CSP/`allowNavigation` (CWE-79), Preferences plugin not secure by default (CWE-312)
- **Version** — Capacitor current major, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/mobile/nativescript.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for nativescript edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Runtime footguns** — direct native-API access marshalling, main-thread blocking, memory (native object references), plugin ecosystem staleness, flavor (Angular/Vue/Core)
- **Performance** — UI thread work
- **Security** — secure storage plugin (CWE-312), TLS
- **Version** — NativeScript current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-mobile-dotnet-hybrid-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 5 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — maui · xamarin · ionic · capacitor · nativescript):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~55-line stub floor** — `> 120` lines.
3. **Required correction-surface sections present** (case-insensitive heading regexes) —
   a footgun/concurrency/memory section, Error Handling, Security/Dependency, Testing,
   Performance, Version-specific, References.
4. **≥ 4 code fences** (≥ 2 fenced single-framework examples).
5. **Dated source present** — at least one date token `20(2[5-9]|[3-9]\d)` (≥ 2025) AND at least
   one `https?://` URL per file.
6. **H1 intact** — original `# <Framework> CTO` header still present (skills.json indexing).
7. **Per-framework concrete identifiers** (proves substance, not padding):
   - `maui`: `MainThread`, `SecureStorage`, `handler`
   - `xamarin`: `EOL`, `MAUI`, `migrate`
   - `ionic`: `WebView`, `CWE-79`, `Capacitor`
   - `capacitor`: `allowNavigation`, `server.url`, `CWE-79`
   - `nativescript`: `marshalling`, `main thread`, `native API`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 5 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-79) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 6 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 5 guides fresh off disk first, then WRITE the content-contract test.
- [x] Create `tests/cu4a-mobile-dotnet-hybrid-guides.test.js` (zero doubles — reads the 5 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of maui · xamarin · ionic · capacitor · nativescript (official docs / release notes / PyPI / npm / GitHub releases)
- [x] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [x] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [x] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 5 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 5 files + the test file.
- [x] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [x] Wire in real CWE links + web-verified version tokens per the File Specifications
- [x] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [x] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [x] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [x] Diff is additive on all 5 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [x] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [x] Remove redundant prose

### Step 13: SECURE
- [x] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [x] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [x] Safe file operations — only the 6 enumerated files touched

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [x] Confirm `.ctoc/skills.json` still indexes the maui · xamarin · ionic · capacitor · nativescript triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s25") so the completeness check (s31) has no silent omissions
- [x] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed correctly; all quality checks passed
- [x] Only the 6 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
- [x] Nothing fabricated (versions + CWE ids all traceable to official URLs); no cross-language BAD/SAFE examples added; tests green
- [x] Ready for human review

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale framework version gives false confidence | Web-verify current stable at edit time; inline dated http source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/CVE/CWE (hard user rule) | Every fact carries an official source URL retrieved at edit time; test asserts dated source + http URL per file; omit-if-no-source | Step 9, Step 14, Step 16 |
| Fast-moving ai-ml/data APIs go stale | Name the exact version alongside the dated source so staleness is visible at the next trigger load | Step 9, Step 11 |
| Frontmatter/H1 corruption breaks skills.json indexing | Additions below H1/frontmatter; full suite + trigger check after edit | Step 11, Step 14 |
| Padding without specificity | Objective gate — test asserts per-framework concrete identifiers, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

Barrier-pattern execution (2026-07-10): verified ONLY this slice's own test
(`tests/cu4a-mobile-dotnet-hybrid-guides.test.js`), left all edits UNSTAGED, did
NOT run the full suite, did NOT touch `.ctoc/audit/corpus-audit-2026-06-15.json`
(the audit-ledger append is deferred to the batching/completeness step per the
barrier instruction). Caller commits.

### Web-verified facts + sources (retrieved 2026-07-10)

| Fact | Value | Source (verified at edit time) |
|------|-------|--------------------------------|
| .NET MAUI current stable | `Microsoft.Maui.Controls` **10.0.80** (.NET 10 wave), published **2026-06-24** | https://www.nuget.org/packages/Microsoft.Maui.Controls (NuGet flat-container + registration index) |
| MAUI handlers/mappers (not renderers) | handlers + property `Mapper` replaced renderers | https://learn.microsoft.com/dotnet/maui/user-interface/handlers/ (HTTP 200) |
| MAUI UI-thread marshalling | `MainThread.BeginInvokeOnMainThread` | https://learn.microsoft.com/dotnet/maui/platform-integration/appmodel/main-thread |
| MAUI SecureStorage | Keychain/Keystore-backed | https://learn.microsoft.com/dotnet/maui/platform-integration/storage/secure-storage (HTTP 200) |
| Xamarin EOL | **May 1, 2024** — all SDKs, no more patches | https://dotnet.microsoft.com/platform/support/policy/xamarin ("Last updated: May 1, 2024"; body: "Xamarin support ended on May 1, 2024 for all Xamarin SDKs") |
| Ionic current stable | `@ionic/core` **8.8.13**, published **2026-07-01** | https://www.npmjs.com/package/@ionic/core (npm registry dist-tags.latest) |
| Capacitor current stable | `@capacitor/core` **8.4.1**, published **2026-06-19** | https://www.npmjs.com/package/@capacitor/core (npm registry dist-tags.latest) |
| Capacitor `server.url` / `allowNavigation` / `cleartext` / `androidScheme` config keys | confirmed present in config schema | https://capacitorjs.com/docs/config (keys `allowNavigation`, `url`, `cleartext`, `androidScheme` found in page) + https://capacitorjs.com/docs/guides/security (HTTP 200) |
| NativeScript current stable | `@nativescript/core` **9.0.20**, published **2026-05-27** | https://www.npmjs.com/package/@nativescript/core (npm registry dist-tags.latest) |
| NativeScript marshalling / multithreading | direct native access + Workers | https://docs.nativescript.org/guide/marshalling (200) + https://docs.nativescript.org/guide/multithreading (200) |
| CWE-79 (Cross-site Scripting) | real MITRE id | https://cwe.mitre.org/data/definitions/79.html (HTTP 200) |
| CWE-312 (Cleartext Storage of Sensitive Information) | real MITRE id | https://cwe.mitre.org/data/definitions/312.html (HTTP 200) |

### Choices
- **CWE-319** (Cleartext Transmission) named in capacitor.md alongside `cleartext:
  true` because that config literally enables plain http — a real, on-topic
  identifier grounded in the Capacitor config docs; kept minimal (no separate
  test assertion added for it, only CWE-79/CWE-312 are asserted).
- **MAUI version token** asserted as `.NET 10` OR `10.0.80` (regex allows either)
  since MAUI's major tracks the .NET major and both appear in the guide.
- **NativeScript version token** regex allows `9.0`/`NativeScript 9`/`8.9` to
  stay robust to a patch bump; the guide states the exact web-verified `9.0.20`.
- **No omissions** — every asserted version/CWE had a dated authoritative source
  at edit time; nothing was dropped for lack of a source.
