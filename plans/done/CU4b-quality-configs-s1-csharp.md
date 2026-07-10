---
approved_by: human
approved_at: 2026-07-10T12:29:05.668Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T21:40:58.265Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.442Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4b s1 — csharp quality-configs (legacy · strict · strictest) → .NET 9 depth"
type: implementation
parent_plan: CU4b-quality-configs
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/quality-configs/csharp/legacy.md
  - skills/quality-configs/csharp/strict.md
  - skills/quality-configs/csharp/strictest.md
  - tests/cu4b-csharp-configs.test.js
---

# CU4b s1 — csharp quality-configs → .NET 9 sibling depth

> Slice 1 of the CU4b decomposition (SIP1). Upgrade all THREE thin csharp
> quality-config guides to structural depth using the CROSS-FAMILY template
> `kotlin/strictest.md` (all csharp variants are thin — no rich same-family sibling).
> Inherits the parent's Gate-1 `approved_by: human` marker; Gate 2 & 3 batch via
> `approveSubplans('CU4b-quality-configs', …)`. **HARD RULES (non-negotiable):**
> **(1) NO STUBS** — real .NET 9 rules/rationale/versions, each file `> 5` `##`
> sections. **(2) NO FABRICATED versions/rules** — every .NET / analyzer / package
> version and rule id WEB-VERIFIED against official docs at edit time, inline dated
> http source ≥ 2025-01-01; unverifiable → omit. **(3) ZERO TEST DOUBLES** — the
> content-contract test reads the REAL csharp config files off disk and asserts
> substance. **(4) STRUCTURAL TEMPLATING** — copy kotlin/strictest's STRUCTURE, author
> C#-correct values; NO Kotlin/detekt/ktlint value may appear in a csharp guide.

Satisfies CU4b acceptance criteria: **"csharp configs use cross-family structural
template correctly"**, **"all 9 thin configs reach sibling-family depth"** (the 3
csharp files), **"config values are language-correct"**, **"every section names a
technology-specific identifier"**, **"all version claims carry dated sources"**.

## Implementation Details

### Architecture Decision

All three csharp variants are thin (read-fresh 2026-07-09): legacy = 3 `##`/27 lines,
strictest = 4 `##`/38 lines, strict = 5 `##`/106 lines. There is NO rich same-family
csharp sibling, so the STRUCTURE template is the cross-family richest managed-language
config **`skills/quality-configs/kotlin/strictest.md`** (8 `##`: Mode / detekt(config) /
ktlint(.editorconfig) / Gradle(build file) / Coverage / Complexity / Compiler Flags /
Commands). That maps cleanly onto .NET: analyzer-config → `.editorconfig`; build-file →
`.csproj`; coverage → coverlet/reportgenerator; compiler-flags → `TreatWarningsAsErrors`/
`WarningsAsErrors`; commands → `dotnet format`/`dotnet test`; plus a CI block.
kotlin/strictest is chosen over c/strictest (13 `##`) because c/strictest's
MISRA/CMake/CMocka structure is C-idiomatic and a poorer analog for a managed-runtime
config. **csharp/strict already ships a rich `.editorconfig` + `.csproj`** (lines 11–83)
— that is the IN-FAMILY VALUE reference for the sibling files (do not copy Kotlin values;
extend from the real C# values already present in strict).

**The strictness gradient must stay correct** (a real correctness axis, not padding):
- legacy: `Nullable: warnings`, `TreatWarningsAsErrors: false`, `AnalysisLevel:
  latest-minimum`, coverage 50%, gradual per-file nullable opt-in.
- strict: `Nullable: enable`, `WarningsAsErrors: nullable`, `AnalysisLevel: latest-all`,
  `EnforceCodeStyleInBuild: true`, coverage 80% (already present — fill the missing
  sections: complexity limits, install/package versions surfaced, CI).
- strictest: `Nullable: enable`, `TreatWarningsAsErrors: true`,
  `dotnet_analyzer_diagnostic.severity = error`, coverage 90%, tight complexity.

### Dependency Graph

```
skills/quality-configs/csharp/legacy.md     (MODIFY)  ─┐
skills/quality-configs/csharp/strict.md     (MODIFY)  ─┼─ structure from ──▶ kotlin/strictest.md (READ-ONLY)
skills/quality-configs/csharp/strictest.md  (MODIFY)  ─┘   values from ────▶ csharp/strict existing blocks (in-family)
tests/cu4b-csharp-configs.test.js           (CREATE, reads the 3 real files — zero doubles)
```

Disjoint from every other slice. No cycle. `depends_on: none`.

### File Specifications

#### Files: the three csharp configs
**Action:** MODIFY (add sections to reach `> 5` `##`; keep every existing section).
**Purpose:** each becomes a substantive .NET 9 correction surface at `.editorconfig` /
`.csproj` edit time.
**Change Type:** structural depth expansion (kotlin/strictest structure, C# values).

Each file, after upgrade, must carry at minimum (structure mirrors kotlin/strictest):
1. **Mode** (keep) — the strictness one-liner.
2. **EditorConfig (`.editorconfig`)** — Roslyn analyzer severities (e.g.
   `dotnet_diagnostic.CA2000.severity`, `dotnet_analyzer_diagnostic.severity`),
   `csharp_style_*` keys; the gradient sets severity `warning` (legacy) →
   `error` (strictest).
2. **Project File (`.csproj`)** — `Nullable`, `TreatWarningsAsErrors`/`WarningsAsErrors`,
   `EnableNETAnalyzers`, `AnalysisLevel`, `EnforceCodeStyleInBuild`; the
   `Microsoft.CodeAnalysis.NetAnalyzers` / `StyleCop.Analyzers` / `coverlet.collector`
   PackageReferences with WEB-VERIFIED current versions.
3. **Coverage Requirements** (keep/extend) — coverlet + reportgenerator; 50/80/90 floor.
4. **Complexity Limits** — CA1502 (cyclomatic) / CA1505 (maintainability) severities +
   a limits table (legacy relaxed → strictest tight).
5. **Commands** — `dotnet build /warnaserror`, `dotnet test --collect:"XPlat Code
   Coverage"`, `dotnet format --verify-no-changes`.
6. **CI Integration** — a GitHub Actions snippet (`actions/setup-dotnet@v4`, `dotnet
   test` with coverage gate), and for legacy the gradual-adoption note (baseline the
   existing analyzer warnings, ratchet down).

Every added section names ≥ 1 identifier (".NET 9", a `CAxxxx` id, `AnalysisLevel`,
`TreatWarningsAsErrors`, `coverlet`, `dotnet-format`). Every version/analyzer claim
carries an inline dated http source ≥ 2025-01-01 (learn.microsoft.com analyzer docs /
NuGet package page / .NET release notes).

#### File: `tests/cu4b-csharp-configs.test.js`
**Action:** CREATE. **Framework:** `node:test`. **Zero doubles** — reads the 3 real
files via `fs.readFileSync` (mirrors `tests/cu3-web-guides.test.js`).

**Test cases (per csharp file):**
1. `> 5` `##` sections (defeats the thin floor — legacy started at 3, strictest at 4,
   strict at 5; asserting `> 5` proves real additions on all three).
2. well past the stub floor (`> 90` lines).
3. required sections present: EditorConfig, Project File, Coverage, Complexity,
   Commands, CI (case-insensitive regex).
4. names C# identifiers: `.NET 9` (or a C#/`net9.0` token), `Nullable`, an
   `AnalysisLevel`/`TreatWarningsAsErrors` key, a `CA\d+` analyzer id.
5. ≥ 4 code fences (`.editorconfig` + `.csproj` + commands blocks).
6. ≥ 1 dated source: a `20(2[5-9]|[3-9]\d)` token AND an `https?://` URL.
7. **cross-language guard:** the file must NOT contain Kotlin/detekt/ktlint signature
   tokens (`detekt`, `ktlint`, `build.gradle`, `\.kt\b`) — proves no template value leaked.
8. gradient guard: legacy contains `Nullable>warnings` / `50%`; strictest contains
   `TreatWarningsAsErrors>true` / `90%`.

### Test Plan

Baseline: at Step 8 the test must RUN RED (legacy/strict/strictest fail the `> 5`
sections, required-section, and identifier assertions before the upgrade), proving the
checks test something real. After the upgrade all pass; `node --test tests/*.test.js`
→ `# fail 0`.

### Security Review

- Content-only edits to 3 markdown files + one test file; no runtime path handling.
- All source URLs are official public domains (learn.microsoft.com, nuget.org,
  github.com/dotnet) — no secrets.
- Only the 4 enumerated files touched.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write `tests/cu4b-csharp-configs.test.js` — reads the 3 REAL files, zero doubles;
      asserts `>5` sections, required sections, C# identifiers, `>=4` fences, dated http
      source, NO Kotlin tokens, gradient tokens.
- [x] Run — expect RED (all three csharp files fail before upgrade).

### Step 9: PREPARE
- [x] READ `kotlin/strictest.md` (structure template) and the existing csharp/strict
      `.editorconfig`/`.csproj` blocks (in-family values) fresh off disk.
- [x] **WEB-VERIFY at edit time** (no invented versions): current .NET SDK (9.x) analyzer
      guidance, `Microsoft.CodeAnalysis.NetAnalyzers` / `StyleCop.Analyzers` /
      `coverlet.collector` current versions, `AnalysisLevel`/`Nullable`/`TreatWarningsAsErrors`
      semantics, `dotnet format` usage. Capture each source URL + retrieval date ≥ 2025-01-01.

### Step 10: IMPLEMENT
- [x] Expand all THREE csharp configs to `> 5` `##` sections using the kotlin/strictest
      STRUCTURE with C#-correct values; keep the strictness gradient correct. ONE step.
      No Kotlin value copied. Each section names an identifier; each version claim carries
      an inline dated source.

### Step 11: REVIEW
- [x] Self-review: gradient correct across the 3 files; no cross-language token; each
      section has an identifier; each version claim sourced; existing sections retained.

### Step 12: OPTIMIZE
- [x] Keep density at kotlin/strictest level; no filler; tables where kotlin uses tables.

### Step 13: SECURE
- [x] All source URLs official public domains; only the 4 files edited.

### Step 14: VERIFY
- [x] `node --test tests/cu4b-csharp-configs.test.js` → GREEN.
- [x] `node --test tests/*.test.js` → `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [x] Append to `## Decisions Taken Under Ambiguity`: per-file UPGRADED verdict for
      csharp/legacy, csharp/strict, csharp/strictest; template used = kotlin/strictest
      (structure); every .NET/analyzer/package version with its dated source URL.

### Step 16: FINAL-REVIEW
- [x] Only the 4 enumerated files changed; nothing fabricated (every version traceable to
      a dated official URL); kotlin/strictest read but NOT edited (no-churn).

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Kotlin value leaks into a C# guide (HIGH) | Test asserts NO `detekt`/`ktlint`/`build.gradle`/`.kt` tokens; extend from real csharp/strict values | Step 10, 11, test |
| Invented .NET/package version | Web-verify each version at edit time; inline dated official URL | Step 9, 15 |
| Section inflation without depth | Test asserts identifier + `>=4` fences + dated source per file | Step 14 |

## Decisions Taken Under Ambiguity

Executed 2026-07-09 (Steps 8–16, TDD; BARRIER-PATTERN — this slice's test only, unstaged).

**Template used:** `skills/quality-configs/kotlin/strictest.md` — STRUCTURE ONLY (Mode /
config-file / project-file / Coverage / Complexity / Commands / CI). Zero Kotlin values
copied; the test's cross-language guard asserts `detekt`/`ktlint`/`build.gradle`/`gradlew`/
`kover`/`.kt` are ABSENT from all three C# files (verified: 0 hits each).

**Per-file verdict (all UPGRADED, thin → substantive):**
- `csharp/legacy.md`: 3 §/27 lines → **7 §/160 lines, 8 fences**. Lenient/migration tier —
  `Nullable=warnings`, `TreatWarningsAsErrors=false`, `AnalysisLevel=latest-minimum`, 50%
  coverage, complexity as `suggestion`, gradual-adoption CI (baseline + no-new-warnings).
- `csharp/strict.md`: 5 §/106 lines → **7 §/176 lines, 8 fences**. Balanced tier — kept the
  existing `.editorconfig`/`.csproj`; added Complexity + CI; surfaced pinned versions;
  `Nullable=enable`, `WarningsAsErrors=nullable`, `AnalysisLevel=latest-all`,
  `EnforceCodeStyleInBuild=true`, 80%.
- `csharp/strictest.md`: 4 §/38 lines → **7 §/173 lines, 8 fences**. Maximal tier (superset
  of strict) — `dotnet_analyzer_diagnostic.severity=error`, `TreatWarningsAsErrors=true`,
  `AnalysisMode=All`, `CA1502.threshold=10`, `GenerateDocumentationFile=true`, 90%.

**Gradient (monotonic, verified by test):** legacy `TreatWarningsAsErrors=false` → strict
`WarningsAsErrors=nullable` → strictest `TreatWarningsAsErrors=true`; coverage 50→80→90;
CA1502 severity suggestion→warning→error.

**Web-verified versions/rules (all retrieved 2026-07-09; unverifiable → omitted):**
- `Microsoft.CodeAnalysis.NetAnalyzers` = **10.0.301** (latest stable; 11.x are previews) —
  <https://api.nuget.org/v3-flatcontainer/microsoft.codeanalysis.netanalyzers/index.json>
- `StyleCop.Analyzers` = **1.2.0-beta.556** (latest published; no non-beta line exists) —
  <https://api.nuget.org/v3-flatcontainer/stylecop.analyzers/index.json>
- `coverlet.collector` = **10.0.1** —
  <https://api.nuget.org/v3-flatcontainer/coverlet.collector/index.json>
- `dotnet-reportgenerator-globaltool` = **5.5.10** —
  <https://api.nuget.org/v3-flatcontainer/dotnet-reportgenerator-globaltool/index.json>
- `AnalysisLevel`/`AnalysisMode`/`Nullable`/`TreatWarningsAsErrors` semantics —
  <https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props>
- CA1502 (cyclomatic, configurable `threshold`) / CA1505 (maintainability index) —
  <https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1502>
  and .../ca1505 (both HTTP 200)
- CA1062 / CA1063 / CA1816 / CA2000 / CA2213 quality-rules pages — all HTTP 200 at
  <https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/>
- `dotnet format --verify-no-changes` —
  <https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-format>
- `actions/setup-dotnet@v4` (`dotnet-version: '9.0.x'`) —
  <https://github.com/actions/setup-dotnet>

**Decision (SDK-bundled analyzers):** legacy omits the `Microsoft.CodeAnalysis.NetAnalyzers`
PackageReference (the net9.0 SDK bundles it; pinning is only needed to exceed the bundled
version) and notes 10.0.301 as the pin option; strict/strictest pin 10.0.301 explicitly to
lock the rule set across machines. Documented rather than stubbed.

**Test result:** `node --test tests/cu4b-csharp-configs.test.js` — RED baseline 28 tests /
13 pass / 15 fail (pre-upgrade) → GREEN 28 tests / 28 pass / 0 fail / 0 skipped.
`npx eslint tests/cu4b-csharp-configs.test.js` → exit 0. Full suite NOT run (concurrent
slices mid-build); changes left unstaged for the caller. Plan not moved.
