---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:39.103Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Game engines & Python-mobile (unity · unreal · kivy · beeware)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/mobile/unity.md
  - skills/frameworks/mobile/unreal.md
  - skills/frameworks/mobile/kivy.md
  - skills/frameworks/mobile/beeware.md
  - tests/cu4a-mobile-gameengine-python-guides.test.js
---

# CU4a s26 — Game engines & Python-mobile (unity · unreal · kivy · beeware)

> Slice 26 of the CU4a decomposition. De-stub the 4 thin **mobile** framework
> guides (unity · unreal · kivy · beeware) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: game engines + Python-mobile: frame-loop/GC allocation, memory-management (GC vs manual/`UPROPERTY`), and platform packaging footguns. Adds one content-contract test that reads the REAL guide
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
rewritten (no-churn)"** — for these 4 files.

## Implementation Details

### Architecture Decision

Single-framework reference guides → the **7-language BAD/SAFE cross-coverage rule does NOT apply**
(CU4a single-framework exemption). Each guide's examples are in ITS OWN framework, correct +
idiomatic + current-version. Bar = depth-within-framework, objectively gated: every added `## `
section names a concrete identifier (version number, CWE id, or API/function name); every
version/security claim carries an inline dated http source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the 4 guides has exactly 5 `## ` sections today
(confirmed by reading fresh 2026-07-10). The existing 5 sections are preserved verbatim; new
sections are ADDED below them. The H1 `# <Framework> CTO` header + any frontmatter stay intact so
`.ctoc/skills.json` trigger indexing is unaffected.

Grouping rationale: these 4 are ONE research pass because the correction spine is shared —
game engines + Python-mobile: frame-loop/GC allocation, memory-management (GC vs manual/`UPROPERTY`), and platform packaging footguns. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/mobile/unity.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-mobile-gameengine-python-guides.test.js
skills/frameworks/mobile/unreal.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-mobile-gameengine-python-guides.test.js
skills/frameworks/mobile/kivy.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-mobile-gameengine-python-guides.test.js
skills/frameworks/mobile/beeware.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-mobile-gameengine-python-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/mobile/unity.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for unity edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **GC footguns** — per-frame allocations in `Update` → GC spikes (cache, object pooling), `GetComponent` in hot loops, coroutines vs `async`/`Awaitable`, physics in `FixedUpdate` not `Update`
- **Correctness** — script execution order, `[SerializeField]`
- **Security** — no `eval`; asset/AssetBundle from untrusted source, IL2CPP
- **Version** — Unity 6 / current LTS, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/mobile/unreal.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for unreal edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Memory footguns** — `UPROPERTY()` for GC reachability (else collected/dangling), `TWeakObjectPtr`, Blueprint vs C++ perf, tick cost + `PrimaryActorTick`, garbage-collection cluster
- **Correctness** — replication/`Server`/`Client` RPC
- **Security** — untrusted asset/pak, no eval
- **Version** — Unreal Engine 5.x current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/mobile/kivy.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for kivy edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Threading footguns** — UI updates must be on main thread (`@mainthread`/`Clock.schedule_once`), `Clock` scheduling, property binding, KV-language caching, packaging (buildozer/python-for-android)
- **Performance** — widget count, canvas instructions
- **Security** — no `eval` on untrusted KV/input (CWE-94)
- **Version** — Kivy current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/mobile/beeware.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for beeware edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Packaging footguns** — Briefcase per-platform packaging, Toga native-widget parity gaps, `async` event loop integration, Python-runtime bundling size, platform backend maturity
- **Correctness** — main-thread UI
- **Security** — bundled-dependency provenance
- **Version** — BeeWare (Toga/Briefcase) current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-mobile-gameengine-python-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — unity · unreal · kivy · beeware):
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
   - `unity`: `Update`, `object pooling`, `FixedUpdate`
   - `unreal`: `UPROPERTY`, `tick`, `TWeakObjectPtr`
   - `kivy`: `@mainthread`, `Clock`, `KV language`
   - `beeware`: `Briefcase`, `Toga`, `async`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 4 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (none required in this family) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 5 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 4 guides fresh off disk first, then WRITE the content-contract test.
- [ ] Create `tests/cu4a-mobile-gameengine-python-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [ ] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [ ] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [ ] Web-verify the current stable release of each of unity · unreal · kivy · beeware (official docs / release notes / PyPI / npm / GitHub releases)
- [ ] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [ ] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [ ] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 4 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 4 files + the test file.
- [ ] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [ ] Wire in real CWE links + web-verified version tokens per the File Specifications
- [ ] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [ ] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [ ] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [ ] Diff is additive on all 4 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [ ] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [ ] Remove redundant prose

### Step 13: SECURE
- [ ] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [ ] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [ ] Safe file operations — only the 5 enumerated files touched

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [ ] Confirm `.ctoc/skills.json` still indexes the unity · unreal · kivy · beeware triggers (H1/frontmatter intact)
- [ ] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [ ] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s26") so the completeness check (s31) has no silent omissions
- [ ] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [ ] Verify Steps 8–15 completed correctly; all quality checks passed
- [ ] Only the 5 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
- [ ] Nothing fabricated (versions + CWE ids all traceable to official URLs); no cross-language BAD/SAFE examples added; tests green
- [ ] Ready for human review

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
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review

## Decisions Taken Under Ambiguity

Executed 2026-07-10 (Steps 8–16, TDD). Barrier-pattern: only the 5 enumerated files touched;
slice test verified in isolation; nothing staged; audit ledger NOT modified (caller/aggregator owns it).

### Web-verified facts + sources (retrieved 2026-07-10)
- **Unity**: current streams `6000.4.0f1` (Mainline), `6000.3.x` (LTS), `6000.0.71f1` (LTS / Unity 6.0 LTS).
  Sources: https://unity.com/releases/editor/archive ; https://en.wikipedia.org/wiki/Unity_(game_engine)
  (infobox "Stable release 6000.4.0f1 (Mainline) / 6000.3.12f1 (LTS) / 6000.0.71f1 (LTS)").
- **Unreal Engine**: current stable **5.8** (Wikipedia infobox); 5.6 and 5.7 documentation streams live.
  Sources: https://en.wikipedia.org/wiki/Unreal_Engine ;
  https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5.6-documentation (HTTP 200) ;
  .../unreal-engine-5.7-documentation (HTTP 200). UObject handling (UPROPERTY/TWeakObjectPtr):
  https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-object-handling-in-unreal-engine
- **Kivy 2.3.1** (published 2024-12-26) via PyPI JSON API https://pypi.org/pypi/kivy/json ;
  **Buildozer 1.6.0** via https://pypi.org/pypi/buildozer/json .
- **Toga 0.5.6** (published 2026-07-08) via https://pypi.org/pypi/toga/json ;
  **Briefcase 0.4.4** (published 2026-07-08) via https://pypi.org/pypi/briefcase/json .
- **CWE ids** (all verified live against MITRE, catalog v4.20):
  CWE-94 Code Injection https://cwe.mitre.org/data/definitions/94.html ;
  CWE-502 Deserialization of Untrusted Data https://cwe.mitre.org/data/definitions/502.html ;
  CWE-20 Improper Input Validation https://cwe.mitre.org/data/definitions/20.html ;
  CWE-416 Use After Free https://cwe.mitre.org/data/definitions/416.html ;
  CWE-1357 Reliance on Insufficiently Trustworthy Component https://cwe.mitre.org/data/definitions/1357.html ;
  CWE-829 Inclusion of Functionality from Untrusted Control Sphere https://cwe.mitre.org/data/definitions/829.html .

### Choices made
1. **Unreal current-version citation** — the Epic 5.x release-notes pages are JS-rendered SPAs (no title
   in static HTML), so the precise 5.8 release DATE could not be read off an authoritative dated page.
   Chose to cite UE 5.8 as current stable via the Wikipedia infobox cross-check, and to anchor the
   version guidance on the Epic 5.6/5.7 documentation streams (both HTTP 200). Did NOT fabricate a 5.8
   release date — omitted the exact date rather than assert it uncited (omit-if-no-source rule).
2. **BeeWare Performance section** — the plan's beeware spec did not enumerate a standalone Performance
   heading, but the content test (uniform across all 4 files) requires one. Added a substantive
   "Performance — Bundle Size & Startup" section grounded in the real Briefcase runtime-bundling cost
   (not padding). Consistent with the shared "platform packaging footguns" research spine.
3. **CWE selection** — used the CWE ids that map to each framework's actual attack surface:
   deserialization (CWE-502) for Unity AssetBundle / Unreal .pak untrusted content; code injection
   (CWE-94) for Unity runtime codegen and Kivy untrusted-KV `eval`; input validation (CWE-20) for
   unvalidated Unreal Server RPCs; use-after-free (CWE-416) for missing-`UPROPERTY` dangling UObjects;
   supply-chain (CWE-1357/CWE-829) for BeeWare bundled-dependency provenance. All verified against MITRE.
4. **No-churn honored** — the existing 5 template sections in each of the 4 guides were preserved
   verbatim; new sections were appended below "What NOT to Do". H1 `# <Framework> CTO` headers unchanged.
5. **Single-framework examples** — the 7-language BAD/SAFE rule is exempt per the CU4a single-framework
   spec; each guide's examples are in its own language (C# / C++ / Python / Python+TOML), idiomatic and
   current-version.
