---
approved_by: human
approved_at: 2026-07-10T14:54:11.843Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.213Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s10 — numeric, logic & infra language guides (julia, prolog, terraform, powershell)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/julia.md
  - skills/languages/prolog.md
  - skills/languages/terraform.md
  - skills/languages/powershell.md
  - tests/cu4c-numeric-logic-infra-guides.test.js
---

# CU4c s10 — numeric, logic & infra language guides (julia · prolog · terraform · powershell)

> Slice 10 of the CU4c decomposition. De-stub the four remaining specialized-domain
> language guides from the 5-section template floor (confirmed fresh 2026-07-09: each has
> exactly the 5 template sections) into substantive correction surfaces, in ONE coherent
> research pass. This slice groups the domain "singletons" that have no closer family:
> numeric/scientific (Julia), logic (Prolog), infrastructure-as-code (Terraform), and
> ops/shell (PowerShell). Their shared research spine is **domain-specific
> footguns + a security surface distinctive to the domain** (Julia `@inbounds`/type
> instability, Prolog cut/negation-as-failure, Terraform state-secret exposure CWE-312 +
> drift, PowerShell execution-policy bypass + injection CWE-78). Adds the content-contract
> test that reads the REAL guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every Julia/Prolog(SWI/ISO)/Terraform/PowerShell version, CWE identifier, tool version,
> date, and best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or direct
> fetch of julialang.org / swi-prolog.org / developer.hashicorp.com/terraform /
> learn.microsoft.com/powershell / cwe.mitre.org) and carry an inline dated source ≥
> 2025-01-01 — never invented (hard user rule). If no dated authoritative source exists
> for a claim, **OMIT it** and note the absence in the audit findings. The content-contract
> test READS the real files off disk — no mocks, no fakes.

Maps to CU4c acceptance criteria: **"upgraded guides meet the CU2 depth standard"**,
**"CVE/CWE classes named for applicable languages (secret-exposure for IaC; injection for
shell)"**, and **"no audited-SOLID guide is rewritten (no-churn)"** — for these four files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Examples in each guide's OWN language, idiomatic +
current. Bar = depth-within-language, objectively gated: every required `## ` section
names a concrete identifier; every version/security claim carries a dated source ≥
2025-01-01. **Prolog note:** anchor to ISO Prolog + name the implementation (SWI-Prolog)
for impl-specific claims.

**No-churn (extend, never overwrite):** all four have exactly 5 `## ` sections today
(confirmed fresh 2026-07-09); existing 5 preserved verbatim, new sections ADDED below.
**Terraform note:** Terraform (HCL) is declarative IaC — the "concurrency-equivalent"
required section is **plan/apply lifecycle + state locking + drift**, the honest depth
surface (parallel resource graph, `terraform.tfstate` locking).

Grouping rationale: ONE research pass batches four domain-singletons that don't fit the
other families but each carries a sharp, distinctive footgun+security story worth a
research pass together: Julia (numeric perf + `@inbounds` UB), Prolog (logic control +
`eval`-analog), Terraform (**state secrets CWE-312**, drift, provider pinning), PowerShell
(**execution policy is not a security boundary**, `Invoke-Expression` injection CWE-78/94).
Disjoint from every other slice by file.

### Dependency Graph

```
skills/languages/julia.md       (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-numeric-logic-infra-guides.test.js
skills/languages/prolog.md      (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-numeric-logic-infra-guides.test.js
skills/languages/terraform.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-numeric-logic-infra-guides.test.js
skills/languages/powershell.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-numeric-logic-infra-guides.test.js
```

Four disjoint content files + one test. No cycle. `depends_on: none` (parallel-safe;
Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/security claims; extend the existing `Version Gotchas` section):

#### File: `skills/languages/julia.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Julia edits.
- **Concurrency Footguns** — `Threads.@threads` data races on shared arrays, `@spawn`/
  `Task`, `Distributed` (`@distributed`), thread-safety of libraries; false sharing. Name
  `Threads.@threads`, `@spawn`.
- **Error Handling Idioms** — `try`/`catch`, typed exceptions (`throw(ArgumentError(...))`),
  `@assert`, avoiding overbroad catches. Name `ArgumentError`.
- **Security and Dependency Gotchas** — **`@inbounds` disables bounds checking → out-of-
  bounds memory access (CWE-125) if the assumption is wrong**, `eval`/`Meta.parse` on
  untrusted input = code injection CWE-94, `run`/backtick shell injection CWE-78; `Manifest.
  toml` reproducible pinning. Name `@inbounds`, CWE-125.
- **Testing Conventions** — `Test` stdlib (`@test`, `@testset`), `Pkg.test`, coverage via
  `--code-coverage`. Name `@testset`.
- **Performance Traps** — **type instability** (use `@code_warntype`), global-variable
  access (non-const globals kill perf), abstract-typed containers, allocation in hot loops
  (`@allocated`); the first-call compilation latency ("time to first plot"). Name
  `@code_warntype`, type instability.
- **Version-Specific Gotchas** — EXTEND: current Julia 1.x + package server, dated ≥
  2025-01-01, sourced to julialang.org.
- **References** — dated source list.

#### File: `skills/languages/prolog.md`
**Action:** MODIFY (extend 5→>5; no-churn) — anchor to ISO + name SWI-Prolog for impl specifics
**Purpose:** Trigger-loaded correction surface for Prolog edits.
- **Control-Flow Footguns** (concurrency-equivalent) — **the cut (`!`) prunes choice
  points** (green vs red cuts; a red cut changes logical meaning), negation-as-failure
  (`\+`) is NOT logical negation (closed-world assumption), left-recursion → infinite loop.
  Name cut `!`, negation-as-failure `\+`.
- **Error Handling Idioms** — ISO `catch/3` + `throw/1`, `error(Type, Context)` terms,
  `setup_call_cleanup/3`, distinguishing failure from error. Name `catch/3`, `throw/1`.
- **Security and Dependency Gotchas** — `read_term`/`term_to_atom` + `call` on untrusted
  input = **code injection CWE-94** (constructing goals from input then calling), sandboxing
  (SWI `safe_goal/1`), pack pinning. Name CWE-94, `safe_goal`.
- **Testing Conventions** — PlUnit (SWI `:- begin_tests`), `?- run_tests.`, assertion
  predicates. Name PlUnit.
- **Performance Traps** — missing first-argument indexing, non-tail recursion + no
  last-call optimization, `findall/3` materializing huge lists, unbound `assert`/`retract`
  churn. Name first-argument indexing.
- **Version-Specific Gotchas** — EXTEND: ISO Prolog core + SWI-Prolog current version
  extensions, dated ≥ 2025-01-01, sourced to swi-prolog.org.
- **References** — dated source list.

#### File: `skills/languages/terraform.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Terraform (HCL) edits.
- **Plan/Apply Lifecycle & State Footguns** (concurrency-equivalent) — **state locking**
  (concurrent apply corruption; remote backend with locking), **drift** between real infra
  and state, `terraform plan` before `apply` always, `-target` footgun, resource graph
  parallelism. Name state locking, drift.
- **Error Handling / Safety Idioms** — `precondition`/`postcondition` + `check` blocks,
  `terraform validate`, `lifecycle { prevent_destroy }`, avoiding blind `-auto-approve`.
  Name `prevent_destroy`, precondition.
- **Security and Dependency Gotchas** — **secrets in state file are stored in plaintext
  (CWE-312 Cleartext Storage of Sensitive Information)** — encrypt the backend, never
  commit `terraform.tfstate`; **provider/module version pinning** (unpinned `~>` supply-
  chain drift); `sensitive = true` to redact output; policy-as-code (Sentinel/OPA/tfsec/
  Checkov). Name CWE-312, provider pinning, tfsec.
- **Testing Conventions** — `terraform test` (native `.tftest.hcl`), Terratest (Go), plan
  assertions, `tflint`. Name `terraform test`, tflint.
- **Performance / Correctness Traps** — `count` vs `for_each` (index-shift destroys
  resources on list reorder — prefer `for_each` with keys), large monolithic state, deep
  module nesting. Name `for_each` vs `count`.
- **Version-Specific Gotchas** — EXTEND: current Terraform version + the OpenTofu fork +
  BSL license change context, dated ≥ 2025-01-01, sourced to developer.hashicorp.com/
  terraform. (If asserting the license/fork facts, verify + date them.)
- **References** — dated source list.

#### File: `skills/languages/powershell.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for PowerShell edits.
- **Pipeline / Concurrency Footguns** — object pipeline (not text), `ForEach-Object
  -Parallel` (7+) runspace variable-scope (`$using:`), `-Parallel` throttle, `Start-Job`
  vs threadjobs. Name `ForEach-Object -Parallel`, `$using:`.
- **Error Handling Idioms** — `$ErrorActionPreference = 'Stop'` to make errors terminating,
  `try`/`catch`/`finally`, `-ErrorAction Stop` per-cmdlet, `$?`/`$LASTEXITCODE` for native
  commands, terminating vs non-terminating errors. Name `$ErrorActionPreference`,
  terminating errors.
- **Security and Dependency Gotchas** — **execution policy is NOT a security boundary**
  (trivially bypassed with `-ExecutionPolicy Bypass`), **`Invoke-Expression`/`iex` on
  untrusted input = code/command injection (CWE-94 / CWE-78)**, credential handling
  (`SecureString`/`PSCredential`, never plaintext), Constrained Language Mode, module
  signing + `PSGallery` pinning. Name CWE-94, `Invoke-Expression`, execution-policy caveat.
- **Testing Conventions** — **Pester** framework (`Describe`/`It`/`Should`), `Invoke-
  Pester`, code coverage, PSScriptAnalyzer lint. Name Pester, PSScriptAnalyzer.
- **Performance Traps** — array `+=` reallocation in loops (use `List[T]`/`ArrayList` or
  pipeline), `Write-Host` vs pipeline output, unnecessary `Select-Object *`, format-cmdlets
  mid-pipeline. Name `+=` reallocation.
- **Version-Specific Gotchas** — EXTEND: **PowerShell 7.x (cross-platform, pwsh) vs Windows
  PowerShell 5.1** divergence, dated ≥ 2025-01-01, sourced to learn.microsoft.com/powershell.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-numeric-logic-infra-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL four guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — julia, prolog, terraform, powershell):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — Concurrency/ControlFlow/Lifecycle/Pipeline, Error
   Handling, Security/Dependency, Testing, Performance, Version-specific, References
   (regexes broadened to match ControlFlow/Lifecycle/Pipeline for the concurrency-
   equivalent).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Per-language security class + concrete identifiers** — julia: `@inbounds` +
   `@code_warntype` + `CWE-125`; prolog: cut `!` + `CWE-94` + PlUnit; terraform: `CWE-312`
   + `for_each` + tfsec; powershell: `CWE-94` + Pester + execution-policy caveat.

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to four Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (julialang.org, swi-prolog.org,
  developer.hashicorp.com, learn.microsoft.com, cwe.mitre.org) — no secrets.
- Only the five enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all four guides fresh off disk first. Create `tests/cu4c-numeric-logic-infra-guides.test.js`
reading the four REAL files; run it — MUST be RED now (each has exactly 5 `## ` sections,
no dedicated Security/Testing/References sections, no CWE tokens, no dated sources).

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): current Julia 1.x
(julialang.org), ISO Prolog + SWI current (swi-prolog.org), current Terraform + OpenTofu +
BSL license facts (developer.hashicorp.com/terraform / opentofu.org), PowerShell 7.x vs 5.1
(learn.microsoft.com/powershell), CWE-125/94/78/312 pages (cwe.mitre.org). Capture each
source URL + retrieval date (≥ 2025-01-01). Omit any niche claim with no dated source;
record for Step 15.

### Step 10: IMPLEMENT
Extend the four guides with the added sections. Additive only — existing 5 sections stay
verbatim. ONE step, four files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; julia names @inbounds + CWE-125, prolog names cut + CWE-94, terraform names
CWE-312 + for_each, powershell names CWE-94 + the execution-policy caveat; every version/
security claim carries a dated source ≥ 2025-01-01; diff additive.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the five enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes julia/prolog/terraform/powershell triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s10"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the five enumerated files edited; every version/security claim sourced with
a date ≥ 2025-01-01; Terraform/OpenTofu license facts verified (or omitted); nothing
fabricated; no cross-language BAD/SAFE examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Terraform/OpenTofu license + fork facts asserted from memory | Web-verify against developer.hashicorp.com + opentofu.org; date them or OMIT | Step 9, Step 16 |
| Fabricated version/CVE (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| Prolog impl divergence (SWI vs GNU vs ISO) | Anchor to ISO + name SWI-Prolog for impl-specific claims; dated source | Step 9, Step 11 |
| Overstating execution policy as security | Explicitly state execution policy is NOT a security boundary + source | Step 10, Step 11 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts security class + concrete identifiers, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 28 tests, 4 pass, 24 fail (RED confirmed)

### Step 9: PREPARE
- [x] Install dependencies if needed — none (node:test builtin)
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed — n/a
- [x] WEB-VERIFY every version/security fact (see Decisions below)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — 4 guides extended additively
- [x] Add error handling — n/a (content-only)
- [x] Wire up integration points — H1/frontmatter preserved (skills.json intact)

### Step 11: REVIEW
- [x] Self-review all new code — each guide >5 sections, >120 lines, additive diff
- [x] Verify integration points work together — H1 headers verified intact
- [x] Check error handling completeness — each guide names its error-handling idioms

### Step 12: OPTIMIZE
- [x] Remove redundant operations — dense, footgun-per-bullet, no padding
- [x] Optimize critical paths — n/a
- [x] Simplify complex code — n/a

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — test uses path.join(__dirname,'..') + fixed rel paths
- [x] Sanitize outputs — n/a
- [x] No secrets in code — only public official domains
- [x] Safe file operations — read-only fs.readFileSync

### Step 14: VERIFY
- [x] Run lint + type check — eslint on new test file exit 0
- [x] Run ALL tests (TDD Green) — BARRIER PATTERN: ran ONLY this slice test (28/28 pass); full suite left to caller
- [x] Check coverage >= 80% — content-grounding substitutes (CU2 convention)
- [x] 0 skipped, 0 flaky tests — 0 skipped, 0 todo

### Step 15: DOCUMENT
- [x] Update relevant documentation — the four guides ARE the documentation
- [x] Add JSDoc comments to new functions — test file has file-level doc block
- [x] Update CHANGELOG if needed — deferred to caller commit

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed — H1/H2 structure, additive diff confirmed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

All facts WEB-VERIFIED at edit time (retrieved 2026-07-10); each carries an inline dated
source in its guide. Sources used:

- **Julia** — 1.10 is the current LTS; 1.11.9 and 1.12.6 are current feature releases.
  Source: https://endoflife.date/julia (2026-07-10), cross-checked https://julialang.org/downloads/.
- **SWI-Prolog** — stable **9.2.x** series plus a newer **10.x** line; `library(sandbox)` /
  `safe_goal/1` are SWI-specific. Portable claims anchored to ISO/IEC 13211-1. Sources:
  https://github.com/SWI-Prolog/swipl-devel/releases and https://www.swi-prolog.org/ (2026-07-10).
  (Development series is odd-minor 10.1.x — V10.1.11 published 2026-07-05; even-minor = stable.)
- **Terraform** — 1.15.x current (https://endoflife.date/terraform, 2026-07-10). License
  relicensed MPL 2.0 → **BUSL-1.1** (Change License MPL 2.0), verified directly in repo
  LICENSE: https://github.com/hashicorp/terraform/blob/main/LICENSE (2026-07-10).
- **OpenTofu** — 1.12.x current (https://endoflife.date/opentofu, 2026-07-10); stays
  **MPL 2.0**, verified in repo LICENSE: https://github.com/opentofu/opentofu/blob/main/LICENSE (2026-07-10).
- **PowerShell** — 7.x cross-platform (`pwsh`); **7.6 LTS (.NET 10)**, **7.4 LTS (.NET 8)**;
  Windows PowerShell 5.1 = legacy .NET Framework edition. Source:
  https://endoflife.date/powershell (2026-07-10), cross-check https://learn.microsoft.com/powershell/.
- **CWEs** (all cwe.mitre.org, list version 4.20, retrieved 2026-07-10):
  CWE-125 Out-of-bounds Read; CWE-94 Improper Control of Generation of Code (Code Injection);
  CWE-78 OS Command Injection; CWE-312 Cleartext Storage of Sensitive Information. Titles
  verified verbatim against the definition pages.

**Omissions (no dated authoritative source / avoided fabrication):**
- No specific patch-level for the S3 backend `use_lockfile` introduction is asserted beyond
  "Terraform 1.10+/OpenTofu" (the exact minor was not re-verified against a dated changelog
  page, so it is stated only as a range, not a precise version).
- No CVE numbers are cited — none was needed for these design-level footguns, and inventing
  one is forbidden. Only CWE *class* identifiers (verified against MITRE) are used.

**Barrier-pattern note:** per dispatch, verified ONLY this slice's test
(`tests/cu4c-numeric-logic-infra-guides.test.js`: 28/28 green). Did NOT run the full
`tests/*.test.js` suite, did NOT git-stage, did NOT move the plan. Left in the working tree
for the caller to commit. Sibling-slice changes (abap/apex/cobol/…, other cu4c test files)
were already present in the working tree from parallel executors and are untouched by me.
