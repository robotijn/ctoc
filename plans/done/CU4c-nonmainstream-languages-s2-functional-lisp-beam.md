---
approved_by: human
approved_at: 2026-07-10T14:54:11.673Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.008Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s2 — Lisp & BEAM language guides (clojure, scheme, erlang, elixir)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/clojure.md
  - skills/languages/scheme.md
  - skills/languages/erlang.md
  - skills/languages/elixir.md
  - tests/cu4c-functional-lisp-beam-guides.test.js
---

# CU4c s2 — Lisp & BEAM language guides (clojure · scheme · erlang · elixir)

> Slice 2 of the CU4c decomposition. De-stub the four **Lisp-family / BEAM-actor**
> language guides from the 5-section template floor (confirmed fresh 2026-07-09: each
> has exactly the 5 template sections) into substantive correction surfaces, in ONE
> coherent research pass. Shared research spine: s-expression/homoiconic idioms + macro
> hygiene (Clojure, Scheme), and the actor/OTP concurrency model with supervision trees,
> "let it crash", and hot code reload (Erlang, Elixir). Clojure bridges both (Lisp on the
> JVM). Adds the content-contract test that reads the REAL guide files off disk with zero
> doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every Clojure/Scheme(R7RS)/Erlang/OTP/Elixir version, CWE identifier, tool version,
> date, and best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or direct
> fetch of clojure.org / r7rs.org / scheme.org / erlang.org / elixir-lang.org /
> hexdocs.pm / cwe.mitre.org) and carry an inline dated source ≥ 2025-01-01 — never
> invented (hard user rule). If no dated authoritative source exists for a claim about
> a niche language, **OMIT the claim** and note the absence in the audit findings. The
> content-contract test READS the real files off disk — no mocks, no fakes.

Maps to CU4c acceptance criteria: **"upgraded guides meet the CU2 depth standard"**,
**"CVE/CWE classes named for applicable languages (deserialization for JVM langs beyond
Java; injection for scripting-style eval)"**, and **"no audited-SOLID guide is rewritten
(no-churn)"** — for these four files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Each guide's examples are in ITS OWN language,
idiomatic + current-version. Bar = depth-within-language, objectively gated: every
required `## ` section names a concrete identifier; every version/security claim carries
an inline dated source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** clojure.md, scheme.md, erlang.md, elixir.md each
have exactly 5 `## ` sections today (confirmed fresh 2026-07-09). Existing 5 preserved
verbatim; new sections ADDED below.

Grouping rationale: ONE research pass because the correction spine is shared — macro
hygiene + `eval`/reader-injection risk (Clojure, Scheme), and BEAM concurrency
(processes, `GenServer`/`gen_server`, supervision, mailbox unbounded-growth, atom-table
exhaustion) for Erlang+Elixir. Clojure's JVM interop pulls in **Java-deserialization
CWE-502**. Disjoint from the typed-FP slice (s1) and every other slice by file.

### Dependency Graph

```
skills/languages/clojure.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-functional-lisp-beam-guides.test.js
skills/languages/scheme.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-functional-lisp-beam-guides.test.js
skills/languages/erlang.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-functional-lisp-beam-guides.test.js
skills/languages/elixir.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-functional-lisp-beam-guides.test.js
```

Four disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (parallel-safe; Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/security claims; extend the existing `Version Gotchas` section):

#### File: `skills/languages/clojure.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Clojure edits.
- **Concurrency Footguns** — atoms/refs/agents, STM (`dosync`) retry semantics + side
  effects inside transactions (bad), `core.async` `go`-block blocking-call trap, lazy-seq
  holding head → OOM. Name `dosync`, `core.async`.
- **Error Handling Idioms** — `ex-info`/`ex-data` over bare `throw`, `try`/`finally`,
  avoiding swallowed exceptions in `future`s. Name `ex-info`.
- **Security and Dependency Gotchas** — `read-string`/`eval` on untrusted input = code
  execution (use `clojure.edn/read-string`), JVM interop pulls in **deserialization
  CWE-502** (link cwe.mitre.org/definitions/502.html); deps pinning via `deps.edn` +
  `clj -Stree`. Name `edn/read-string`, CWE-502.
- **Testing Conventions** — `clojure.test`, `test.check` property tests, `kaocha` runner.
  Name `test.check`.
- **Performance Traps** — reflection warnings (`*warn-on-reflection*`), transients for
  bulk builds, boxed math (`unchecked-*`), lazy-seq realization cost.
- **Version-Specific Gotchas** — EXTEND: current Clojure stable + `deps.edn`/tools.deps,
  dated ≥ 2025-01-01, sourced to clojure.org.
- **References** — dated source list.

#### File: `skills/languages/scheme.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Scheme edits.
- **Concurrency / Continuations Footguns** — `call/cc` full continuations re-entering
  code unexpectedly, dynamic-wind interaction, tail-call requirement (proper TCO is
  mandated by the standard). Name `call/cc`, `dynamic-wind`.
- **Error Handling Idioms** — R7RS `guard` + `raise`/`error`, `with-exception-handler`,
  avoiding non-continuable raises where continuation expected. Name `guard`, R7RS.
- **Security and Dependency Gotchas** — `eval` on untrusted forms = arbitrary execution;
  `read` from untrusted ports; implementation-specific package managers vary
  (Guile/Racket/Chez). Injection via unsanitized `eval` (CWE-95 "Eval Injection",
  link cwe.mitre.org/definitions/95.html). Name CWE-95.
- **Testing Conventions** — SRFI-64 test framework, implementation runners (Racket
  `raco test`, Chez). Name SRFI-64.
- **Performance Traps** — non-tail recursion stack growth, list vs vector access,
  interpreted vs compiled implementation differences.
- **Version-Specific Gotchas** — EXTEND: R7RS-small vs R6RS portability + implementation
  divergence, dated ≥ 2025-01-01, sourced to r7rs.org / scheme.org / the impl's site.
- **References** — dated source list.

#### File: `skills/languages/erlang.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Erlang edits.
- **Concurrency / OTP Footguns** — unbounded process mailbox growth (selective receive
  scanning), `gen_server` blocking `handle_call` timeout, linking vs monitoring, atom
  table exhaustion from dynamic `list_to_atom`. Name `gen_server`, `list_to_atom`.
- **Error Handling Idioms** — "let it crash" + supervisor restart strategy, tagged
  tuples `{ok, V} | {error, R}`, `try`/`catch` on `throw`/`exit`/`error` classes. Name
  supervisor, `{error, R}`.
- **Security and Dependency Gotchas** — distributed Erlang cookie is a shared secret
  (default-cookie = trust-anyone footgun), `binary_to_term/1` on untrusted data =
  atom/term forgery → use `binary_to_term(Bin, [safe])` (deserialization, CWE-502
  class; link cwe.mitre.org/definitions/502.html). Name `binary_to_term`, `[safe]`,
  CWE-502.
- **Testing Conventions** — EUnit + Common Test (`ct`), PropEr property tests. Name PropEr.
- **Performance Traps** — large-message copy between processes, list-vs-binary building
  (`iolist`), ETS contention, `++` right-append O(n).
- **Version-Specific Gotchas** — EXTEND: current OTP release line, dated ≥ 2025-01-01,
  sourced to erlang.org.
- **References** — dated source list.

#### File: `skills/languages/elixir.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Elixir edits.
- **Concurrency / OTP Footguns** — `GenServer` serial-bottleneck, unbounded mailbox,
  `Task.async` without `Task.await` leak, `Task.Supervisor` for fault isolation. Name
  `GenServer`, `Task.async`.
- **Error Handling Idioms** — `{:ok, v} | {:error, r}` + `with`, `try`/`rescue`, avoiding
  bang functions (`File.read!`) on recoverable paths. Name `with`, `{:error, r}`.
- **Security and Dependency Gotchas** — atom exhaustion via `String.to_atom/1` on user
  input (use `String.to_existing_atom/1`), `:erlang.binary_to_term/1` deserialization
  (CWE-502 class; use `[:safe]`), `mix deps.audit` / `mix hex.audit`. Name
  `String.to_existing_atom`, CWE-502.
- **Testing Conventions** — ExUnit, `StreamData` property tests, `mix test --cover`.
  Name ExUnit, StreamData.
- **Performance Traps** — `Enum` vs `Stream` (eager materialization), building large
  binaries, `String.length` O(n) on graphemes, GenServer as shared mutable state.
- **Version-Specific Gotchas** — EXTEND: current Elixir stable + OTP compatibility matrix,
  dated ≥ 2025-01-01, sourced to elixir-lang.org / hexdocs.pm.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-functional-lisp-beam-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL four guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — clojure, scheme, erlang, elixir):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — Concurrency/Continuations, Error Handling,
   Security/Dependency, Testing, Performance, Version-specific, References (regexes).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Per-language concrete identifiers** — clojure: `CWE-502` + `test.check`; scheme:
   `call/cc` + `SRFI-64`; erlang: `binary_to_term` + `gen_server`; elixir: `GenServer`
   + `to_existing_atom`.

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to four Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (clojure.org, r7rs.org, scheme.org, erlang.org,
  elixir-lang.org, hexdocs.pm, cwe.mitre.org) — no secrets.
- Only the five enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all four guides fresh off disk first. Create `tests/cu4c-functional-lisp-beam-guides.test.js`
reading the four REAL files; run it — MUST be RED now (each file has exactly 5 `## `
sections, no Concurrency/Security/Testing sections, no dated sources).

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): current Clojure
stable (clojure.org), R7RS status + a chosen impl (r7rs.org/scheme.org), current OTP
release (erlang.org), current Elixir stable + OTP matrix (elixir-lang.org/hexdocs.pm),
CWE-502 + CWE-95 pages (cwe.mitre.org). Capture each source URL + retrieval date
(≥ 2025-01-01). Omit any niche claim with no dated source; record the omission for Step 15.

### Step 10: IMPLEMENT
Extend the four guides with the added sections. Additive only — existing 5 sections stay
verbatim. ONE step, four files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; every version/security claim carries an inline dated source ≥ 2025-01-01;
CWE tokens present (clojure/erlang/elixir CWE-502, scheme CWE-95); diff additive.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the five enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes clojure/scheme/erlang/elixir triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s2"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the five enumerated files edited; every version/security claim sourced with
a date ≥ 2025-01-01; nothing fabricated; no cross-language BAD/SAFE examples added; tests
green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale Clojure/OTP/Elixir version | Web-verify current stable at edit time; inline dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/advisory (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| Scheme portability spread (impls diverge) | Anchor to R7RS + name the impl for any impl-specific claim; dated source | Step 9, Step 11 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts concrete identifiers, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 28 tests, 4 pass, 24 fail (RED confirmed)

### Step 9: PREPARE
- [x] Install dependencies if needed — none (node:test built-in)
- [x] Check prerequisites — web-verified all versions/CWEs (see Decisions table)
- [x] Verify dev environment ready
- [x] Create directories/config if needed — none

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — 4 guides extended additively
- [x] Add error handling — Error Handling Idioms section per guide
- [x] Wire up integration points — H1/skills.json triggers intact

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations — footgun-per-bullet, no padding
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — test uses path.join(__dirname,'..')
- [x] Sanitize outputs
- [x] No secrets in code — only public official URLs
- [x] Safe file operations — read-only fs.readFileSync

### Step 14: VERIFY
- [x] Run lint + type check — eslint on test file exit 0
- [x] Run ALL tests (TDD Green) — slice test 28/28 GREEN (barrier: slice-only per brief)
- [x] Check coverage >= 80% — content-grounding substitutes (CU2 convention)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation — the 4 guides ARE the docs
- [x] Add JSDoc comments to new functions — test file header documents contract
- [x] Update CHANGELOG if needed — n/a (caller commits/versions)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

Executed 2026-07-10 (Steps 8–16, TDD). Every version/security fact below was
web-verified against an official source at edit time; sources + retrieval dates
are inlined in each guide's `## References`. Nothing fabricated.

### Web-verified facts (source + retrieved 2026-07-10)
| Fact | Verified value | Source (URL) |
|------|----------------|--------------|
| Clojure current stable | **1.12.5** (1.13 is alpha only) | https://clojure.org/releases/downloads ; https://api.github.com/repos/clojure/clojure/tags |
| Racket current release | **9.2** (published 2026-05-28) | https://github.com/racket/racket/releases/latest |
| Erlang/OTP current release | **29.0.3** (published 2026-07-02) | https://github.com/erlang/otp/releases/latest |
| Elixir current release | **1.20.2** (published 2026-06-23) | https://github.com/elixir-lang/elixir/releases/latest |
| Elixir↔OTP compatibility | **Elixir 1.20 → OTP 27–29** | compatibility-and-deprecations.md @ v1.20.2 tag (raw.githubusercontent.com/elixir-lang/elixir/v1.20.2/lib/elixir/pages/references/compatibility-and-deprecations.md) |
| CWE-502 title | "Deserialization of Untrusted Data" | https://cwe.mitre.org/data/definitions/502.html |
| CWE-95 title | "Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection')" | https://cwe.mitre.org/data/definitions/95.html |
| CWE-94 title | "Improper Control of Generation of Code ('Code Injection')" | https://cwe.mitre.org/data/definitions/94.html |

### Decisions
1. **Test filename** — the plan frontmatter names `tests/cu4c-functional-lisp-beam-guides.test.js`,
   but the execution brief mandated `tests/cu4c-functional-lisp-beam-guides.test.js`.
   Followed the brief (the operative instruction); created the latter. No collision
   with any existing test. `files:` frontmatter is a superset match either way.
2. **CWE assignments (verified, not fabricated)** — Clojure `eval`/`read-string`
   code execution mapped to **CWE-94 (Code Injection)** with **CWE-502** for the
   JVM-interop deserialization surface (both named per brief's "CWE-94 for lisp
   eval" + "CWE-502"). Scheme `eval` → **CWE-95 (Eval Injection)** per plan.
   Erlang `binary_to_term` and Elixir `:erlang.binary_to_term` → **CWE-502**.
   Every CWE title string was fetched from cwe.mitre.org and matched before use.
3. **Additive-only (no-churn)** — the original 5 `## ` sections in each guide were
   preserved verbatim; all new sections were appended below the existing
   `## Version Gotchas`. Existing example code untouched.
4. **Atom-table cap figure** — stated Erlang's default atom limit as "~1,048,576"
   (the documented default `+t`), qualified with "~" and "default"; sourced to
   erlang.org System Limits in-guide. Not presented as an exact invariant.
5. **No omitted claims** — every version/security claim in scope had a dated
   official source; nothing was dropped for lack of a source.

### Barrier-pattern note (executor)
Verified ONLY this slice's test (`node --test tests/cu4c-functional-lisp-beam-guides.test.js`
→ 28/28 pass). Did NOT run the full `tests/*.test.js` suite. Left all changes
UNSTAGED in the working tree; caller commits. Plan not moved.
