---
approved_by: human
approved_at: 2026-07-09T20:56:05.681Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T15:53:09.587Z
gate_crossed: implementation → todo
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T20:52:40.393Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU3 s5 — mobile framework guides (react-native, flutter, expo) + 14-file completeness check"
type: implementation
parent_plan: CU3-tier1-frameworks
depends_on: none
priority: HIGH
risk_level: MEDIUM
files:
  - skills/frameworks/mobile/react-native.md
  - skills/frameworks/mobile/flutter.md
  - skills/frameworks/mobile/expo.md
  - tests/cu3-mobile-guides.test.js
  - tests/cu3-completeness.test.js
---

# CU3 s5 — mobile framework guides (react-native · flutter · expo) + 14-file completeness check

> Slice 5 (final) of the CU3 decomposition. De-stub the three mobile framework
> guides into substantive correction surfaces in ONE coherent research pass (native
> bridge/threading architecture, OTA-update safety, and SDK/version-channel
> stability are the shared mobile footgun family), and **run the CU3 14-file
> completeness check** that proves every named framework guide is substantive — the
> analogue of CU2 s4 running the 9-file completeness check. Adds two content-contract
> tests that read the REAL files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every React Native / Flutter SDK / Expo SDK version claim, CVE identifier, date,
> and best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or fetch of
> reactnative.dev / flutter.dev / expo.dev release notes and advisories) and carry
> an inline dated source ≥ 2025-01-01 — never invented. If unverifiable, OMIT. Both
> content-contract tests READ the real files off disk — no mocks, no stubs, no fakes.

Maps to CU3 acceptance criteria: **"react-native.md covers JSI, bridge, and turbo
module pitfalls"**, **"flutter.md and expo.md cover their primary footguns"**,
**"all version-specific and security claims carry dated sources"**, and — via the
completeness test — **"audit-ledger completeness check passes and ai-ml scope
boundary holds"** and **"all 14 named framework guides exceed the 5-section floor"**.

## Implementation Details

### Architecture Decision

Single-framework reference guides — the **7-language BAD/SAFE cross-coverage rule
does NOT apply**. The bar is **depth-within-framework**, gated objectively:
concrete identifier per section + inline dated source ≥ 2025-01-01 per
version/security claim.

**No-churn (extend, never overwrite):** confirmed fresh 2026-07-09 — react-native.md
5 `## ` sections / 51 lines, flutter.md 5 sections / 57 lines, expo.md 5 sections /
55 lines. Existing solid content is preserved verbatim; new sections are ADDED.

**This slice owns the CU3 completeness gate.** Because the five CU3 slices touch
disjoint files (`depends_on: none` between them), s5 does NOT code-depend on the
sibling slices — but the 14-file completeness check is only *meaningful* once the
other four slices are UPGRADED. Per the CU2 s4 precedent (which ran the 9-file check
with `depends_on: none`), this is expressed as: **the completeness test runs last,
in the final slice, and reconciles the audit ledger for all 14 named files.** The
plan-serial FIFO executor builds slices in dependency/order sequence, so by the time
s5 runs, s1–s4 are complete; if the executor ever runs s5 before a sibling, the
completeness test FAILS LOUDLY (RED) rather than passing on an incomplete corpus —
which is the correct, honest behavior.

Grouping rationale: react-native + flutter + expo are one research pass because (a)
Expo is a layer over React Native — the managed-vs-bare workflow boundary in expo.md
and the new-architecture (JSI/Fabric/TurboModules) story in react-native.md are the
same knowledge family and must be coherent; (b) OTA-update safety
(`expo-updates` / RN OTA) is a shared security concern; (c) SDK/version-channel
stability is the shared version-gotcha family across all three.

### Dependency Graph

```
skills/frameworks/mobile/react-native.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-mobile-guides.test.js
skills/frameworks/mobile/flutter.md       (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-mobile-guides.test.js
skills/frameworks/mobile/expo.md          (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-mobile-guides.test.js
tests/cu3-completeness.test.js            (CREATE: reads ALL 14 named guides off disk)
```

Three disjoint content files + one per-slice content test + one 14-file completeness
test. No inter-file code dependency. No cycle. `depends_on: none` (disjoint files;
the completeness test runs last per the note above).

### File Specifications

#### File: `skills/frameworks/mobile/react-native.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for React Native edits.
**Change Type:** substantive content addition

Content mandated by the AC "react-native.md covers JSI, bridge, and turbo module
pitfalls". Add sections covering: **old architecture (bridge) vs new architecture
(JSI / Fabric / TurboModules)** migration footguns; **Hermes engine** compatibility
constraints; native-module **threading model** (UI thread vs JS thread vs native
modules); **`useNativeDriver`** animation requirement and its exceptions (layout
props cannot use it); **Metro bundler** resolution edge cases (symlinks,
`resolver.extraNodeModules`); and **OTA update security** considerations (name an
authoritative source ≥ 2025-01-01 — code-push/OTA lets you ship JS without store
review, so integrity/signing matters). WEB-VERIFY the current React Native version +
new-architecture default at edit time; name the version.

#### File: `skills/frameworks/mobile/flutter.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Flutter edits.
**Change Type:** substantive content addition

Content mandated by the AC "flutter.md addresses ... its primary footguns". Add
sections covering: **widget rebuild anti-patterns** (passing mutable objects where
`const` is expected, giant `build()` methods, missing `const` constructors);
**Dart null-safety migration traps** (`late` misuse, `!` bang operator hiding
nulls); **platform-channel threading** (UI isolate vs background isolate, platform
channels must be called on the UI isolate); **Flutter version-channel stability**
trade-offs (stable vs beta channel — name the current stable Flutter/Dart SDK
version, WEB-VERIFIED); and **state-management anti-patterns** (setState in build,
rebuilding whole trees). Carry dated sources ≥ 2025-01-01.

#### File: `skills/frameworks/mobile/expo.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Expo edits.
**Change Type:** substantive content addition

Content mandated by the AC "expo.md addresses ... its primary footguns". Add
sections covering: **managed workflow vs bare workflow** capability boundary (which
native modules are unavailable in managed; the prebuild/config-plugins bridge);
**EAS Build vs local build** environment differences (secrets, native deps, build
profiles); **SDK version upgrade breaking changes** (name the current Expo SDK
version — WEB-VERIFIED — and the upgrade-per-SDK cadence); and **`expo-updates` OTA
deployment safety** (runtimeVersion policy so a JS OTA does not land on incompatible
native code; channel/branch discipline). Carry dated sources ≥ 2025-01-01.

### Test Plan

#### Tests: `tests/cu3-mobile-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL guide files off disk via `fs.readFileSync`. No
mocks, no fixtures, no fakes.

Content-contract test cases (per file — react-native, flutter, expo):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Required sections present** — the framework-specific footgun sections +
   Security/Dependency, Testing, Performance, Version-specific, References
   (case-insensitive heading regexes).
3. **Concrete identifiers present** — react-native: `TurboModule` (or `JSI`/
   `Fabric`) AND `useNativeDriver`; flutter: `const` AND null-safety (`late` or
   `null safety`) AND a Flutter/Dart version token; expo: `EAS` AND
   `expo-updates` AND an `SDK` version token.
4. **OTA-security note present** — react-native and expo assert an OTA/updates
   security mention with a source.
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `http`
   source URL per file.
6. **Frontmatter/H1 intact** — original `# <Framework> CTO` H1 still present.

#### Tests: `tests/cu3-completeness.test.js`  (the 14-file completeness check)
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads ALL 14 named CU3 guide files off disk via `fs.readFileSync`
+ reads `.ctoc/audit/corpus-audit-2026-06-15.json`. No mocks, no fixtures, no fakes.

The canonical CU3 in-scope set (hard-coded list of the 14 named files — pytorch,
tensorflow, langchain, transformers, anthropic-sdk, openai-sdk, react, nextjs,
pandas, numpy, prisma, react-native, flutter, expo):
1. **Every named file exceeds its floor** — for the 12 files that started at 5
   sections, assert `> 5` `## ` sections; for react and nextjs (started at 6),
   assert `> 6` (raised floor, mirrors s3) — so the corpus-wide check cannot pass
   on the two web files no-op.
2. **Every named file carries a dated source** — a date `20(2[5-9]|[3-9]\d)`
   (≥ 2025) AND an `http` URL in each of the 14.
3. **Completeness — no silent omission** — assert every one of the 14 named paths
   appears in the audit ledger (or the reconciled verdict list) as UPGRADED or
   SOLID-SKIPPED with a rationale. FAIL if any named file is missing a verdict.
4. **ai-ml scope boundary holds** — assert the check's in-scope ai-ml set is exactly
   the 6 named ai-ml files; if it enumerates `skills/frameworks/ai-ml/*.md`, assert
   that no ai-ml file BEYOND the 6 named was marked UPGRADED under a `CU3-*` slice
   (any other ai-ml upgrade is CU4a scope — must not be attributed to CU3).

**Coverage note:** content-grounding, not code — content-contract assertions
substitute for line/branch coverage.

### Security Review

- Content-only edits to three Markdown guides + two test files reading them (and the
  audit JSON, read-only); no runtime code path, no user input handling, no path
  traversal surface.
- Tests use `path.join(__dirname, '..')` + fixed relative paths.
- All added source URLs are public official domains (reactnative.dev, flutter.dev,
  expo.dev, cwe.mitre.org / advisories) — no secrets.
- Only the five enumerated files are touched (three guides + two tests). The audit
  JSON is read by the completeness test; whether s5 also WRITES the audit verdicts
  is resolved at Step 15 (see the CU2 s1 in-plan-contradiction precedent).

## Execution Plan

### Step 8: TEST
Read all three current files fresh off disk first. Create
`tests/cu3-mobile-guides.test.js` (three real files) and `tests/cu3-completeness.test.js`
(all 14 real files + audit ledger); run both — they MUST be RED now (mobile guides
at 5 sections with no JSI/OTA sections; the completeness check red because the other
slices' additions + verdicts are not all present yet), proving the checks test
something real.

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): current
React Native version + new-architecture default + OTA/CodePush integrity guidance
(reactnative.dev / GitHub releases); current stable Flutter + Dart SDK version
(flutter.dev / docs.flutter.dev); current Expo SDK version + `expo-updates`
runtimeVersion policy (expo.dev / docs.expo.dev); any relevant mobile CVE/advisory.
Capture each source URL + retrieval date (≥ 2025-01-01). OMIT anything unverifiable.

### Step 10: IMPLEMENT
Extend the three mobile guides with the added sections (real footguns, real
idiomatic per-framework examples, dated sources). Additive only — existing 5
sections stay verbatim. Finalize both test files. ONE step, three guide files + two
test files.

### Step 11: REVIEW
Self-review: each mobile guide >5 sections; every section names a concrete
identifier; every version/security claim carries an inline dated source ≥
2025-01-01; expo↔react-native (managed/bare, OTA) guidance is coherent; the
completeness test enumerates exactly the 14 named files and enforces the ai-ml
boundary; diff is additive on the guides.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused — no padding. Each bullet names a
specific footgun + identifier.

### Step 13: SECURE
Run the Security Review checklist. Confirm every source URL is an official public
domain; no secrets; only the five enumerated files touched (guides + tests).

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; both new slice tests GREEN
(`cu3-mobile-guides` + `cu3-completeness`). The completeness test passing is the
CU3-wide gate: all 14 named guides substantive, all carry dated sources, every named
file has an audit verdict, ai-ml boundary holds. Confirm `.ctoc/skills.json` still
indexes react-native/flutter/expo triggers after the edit (H1 + frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts for the three mobile files to
`.ctoc/audit/corpus-audit-2026-06-15.json` ({path, line_count, section_count,
verdict:"UPGRADED", slice:"CU3-s5", note}). **Reconcile the ledger for all 14 named
files** so the completeness check has no silent omission — if any sibling slice
recorded its verdicts in its own `## Decisions Taken Under Ambiguity` instead of the
ledger (the CU2 s1 in-plan-contradiction precedent), fold those verdicts into the
ledger here (the audit JSON IS in this slice's `files:` set — no contradiction for
s5). Record each web-verified fact + source URL + retrieval date in
`## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the five enumerated files edited (three guides + two tests, plus the
audit-ledger reconciliation which is in `files:`); every version/security claim
sourced ≥ 2025-01-01; nothing fabricated; the 14-file completeness check GREEN; no
ai-ml file beyond the 6 named was upgraded under CU3 (CU4a boundary intact); no
cross-language BAD/SAFE examples; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| RN/Flutter/Expo SDK churn invalidates a claim | Web-verify current RN / Flutter+Dart / Expo SDK versions at edit time; name the version + dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/CVE (hard user rule) | Every fact carries an official source URL; both tests assert dated source + http URL per file | Step 9, Step 14, Step 16 |
| Completeness check passes on an incomplete corpus | The 14-file test asserts `> floor` sections + dated source + an audit verdict for EVERY named file; RED if any is missing (runs last) | Step 8, Step 14 |
| ai-ml scope bleed into CU4a | Completeness test asserts no ai-ml file beyond the 6 named is CU3-attributed; Step 16 confirms the boundary | Step 11, Step 14, Step 16 |
| Frontmatter corruption breaks skills.json indexing | Additions below the H1/frontmatter; run full suite + confirm triggers | Step 14 |
| OTA-security note incomplete/unsourced | RN + Expo OTA sections name integrity/signing/runtimeVersion + a source ≥ 2025-01-01; test asserts an OTA-security mention | Step 10, Step 14 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 79 tests, 57 pass / 22 fail (mobile thin)

### Step 9: PREPARE
- [x] Install dependencies if needed (none — node:test only)
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Web-verify current versions (RN 0.86.0, Flutter 3.44.5 / Dart 3.12.2, Expo SDK 57)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (3 guides de-stubbed)
- [x] Add error handling (footgun BAD→SAFE demos per section)
- [x] Wire up integration points (H1/frontmatter intact; skills indexing preserved)

### Step 11: REVIEW
- [x] Self-review all new code (each guide >5 sections; every claim sourced)
- [x] Verify integration points work together (expo↔RN OTA/managed coherent)
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations (dense, no padding)
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (tests use path.join + fixed relative paths; no traversal)
- [x] Sanitize outputs (content-only edits, read-only test reads)
- [x] No secrets in code (all URLs public official domains)
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check (eslint . exit 0; tsc baseline-neutral, 0 new errors)
- [x] Run ALL tests (TDD Green) — 3706/3706 pass, # fail 0
- [x] Check coverage >= 80% (content-contract grounding per plan coverage note)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation (the three guides ARE the docs)
- [x] Add JSDoc comments to new functions (test file headers document intent)
- [x] Update CHANGELOG if needed (N/A — content slice; verdicts recorded below)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

1. **Audit ledger NOT touched (in-plan contradiction resolved against the ledger).**
   The plan's Step 15 prose asserts "the audit JSON IS in this slice's `files:`
   set — no contradiction for s5", but the slice's actual YAML `files:` frontmatter
   (lines 23–28) lists only the three guides + two tests — the audit JSON is NOT
   declared. The dispatch brief also explicitly said "do NOT touch the audit
   ledger." The frontmatter + the brief win over the prose. Therefore per-file
   UPGRADED verdicts are recorded HERE (CU2 s1 / sibling-slice precedent: s1–s4
   each recorded their verdicts in their own Decisions section for the same
   reason), and `.ctoc/audit/corpus-audit-2026-06-15.json` was read-only.

2. **Completeness test reconciles verdicts from plan Decisions, not the ledger.**
   Because no CU3 framework-guide verdict lives in the audit JSON (all recorded in
   sibling plan Decisions sections), `tests/cu3-completeness.test.js` reconciles
   the "no silent omission" verdict for each of the 14 named files by scanning the
   audit ledger AND the CU3 slice plan files on disk. A named file with NO verdict
   in either source FAILS. This is the honest reconciliation the plan mandates
   given the ledger-untouched constraint.

3. **Stale mobile CVEs OMITTED (no fabrication).** OSV returned only old advisories
   for these packages — GHSA-7f53-fmmv-mfjv / CVE-2020-1920 (react-native ReDoS,
   fixed ≤ 0.64.1), GHSA-wr5g-q49g-548w / CVE-2023-28131 (expo OAuth, fixed
   < 48.0.0), GHSA-rwx9-wqj8-vr77 / CVE-2020-24653 (fixed < 9.1.0) — all fixed
   long before the current versions. Citing them as current would mislead, so per
   HARD RULE 2 they were OMITTED. The OTA-security sections are instead grounded in
   the authoritative vulnerability CLASS **CWE-494 "Download of Code Without
   Integrity Check"** (cwe.mitre.org/data/definitions/494.html) plus official
   integrity guidance (Expo Updates code signing), which is the real, current
   footgun for OTA delivery.

### Web-verified facts + sources (retrieved 2026-07-09)

| Fact | Value | Source (retrieved 2026-07-09) |
|------|-------|--------------------------------|
| React Native current release | 0.86.0 (published 2026-06-09) | registry.npmjs.org/react-native (dist-tags.latest + time) |
| New Architecture default | since RN 0.76 (Fabric + TurboModules + bridgeless) | reactnative.dev/architecture |
| Flutter stable | 3.44.5 (released 2026-07-06) | storage.googleapis.com/flutter_infra_release/releases/releases_macos.json (current stable) |
| Dart SDK (bundled) | 3.12.2 | same Flutter releases JSON |
| Expo SDK current | SDK 57 (`expo` 57.0.4, published 2026-07-07) | registry.npmjs.org/expo (dist-tags.latest + time) |
| OTA integrity vuln class | CWE-494 "Download of Code Without Integrity Check" | cwe.mitre.org/data/definitions/494.html |
| Expo Updates code signing | signing key + codeSigningCertificate | docs.expo.dev/eas-update/code-signing |

### Per-file UPGRADED verdicts (audit ledger outside `files:` → recorded here, CU2 s1 precedent)

| path | before (sect / lines) | after (sect / lines) | verdict | slice |
|------|------------------------|-----------------------|---------|-------|
| skills/frameworks/mobile/react-native.md | 5 / 51 | 12 / 189 | UPGRADED | CU3-s5 |
| skills/frameworks/mobile/flutter.md | 5 / 57 | 13 / 207 | UPGRADED | CU3-s5 |
| skills/frameworks/mobile/expo.md | 5 / 55 | 12 / 185 | UPGRADED | CU3-s5 |

### 14-file completeness check result (all line counts, verified GREEN)

| # | guide | sections | lines | floor | verdict source |
|---|-------|----------|-------|-------|----------------|
| 1 | skills/frameworks/ai-ml/pytorch.md | 12 | 194 | >5 | CU3-s1 Decisions |
| 2 | skills/frameworks/ai-ml/tensorflow.md | 12 | 178 | >5 | CU3-s1 Decisions |
| 3 | skills/frameworks/ai-ml/langchain.md | 14 | 208 | >5 | CU3-s2 Decisions |
| 4 | skills/frameworks/ai-ml/transformers.md | 15 | 219 | >5 | CU3-s1 Decisions |
| 5 | skills/frameworks/ai-ml/anthropic-sdk.md | 14 | 229 | >5 | CU3-s2 Decisions |
| 6 | skills/frameworks/ai-ml/openai-sdk.md | 15 | 217 | >5 | CU3-s2 Decisions |
| 7 | skills/frameworks/web/react.md | 13 | 232 | >6 | CU3-s3 Decisions |
| 8 | skills/frameworks/web/nextjs.md | 15 | 252 | >6 | CU3-s3 Decisions |
| 9 | skills/frameworks/data/pandas.md | 12 | 187 | >5 | CU3-s4 Decisions |
| 10 | skills/frameworks/data/numpy.md | 13 | 194 | >5 | CU3-s4 Decisions |
| 11 | skills/frameworks/data/prisma.md | 13 | 231 | >5 | CU3-s4 Decisions |
| 12 | skills/frameworks/mobile/react-native.md | 12 | 189 | >5 | CU3-s5 (this) |
| 13 | skills/frameworks/mobile/flutter.md | 13 | 207 | >5 | CU3-s5 (this) |
| 14 | skills/frameworks/mobile/expo.md | 12 | 185 | >5 | CU3-s5 (this) |

All 14 exceed their floor, carry a ≥2025 dated http source, and have a recorded
verdict — the 14-file completeness check is GREEN. ai-ml boundary holds: exactly
the 6 named ai-ml files are substantive; no ai-ml file beyond them is CU3-attributed.
