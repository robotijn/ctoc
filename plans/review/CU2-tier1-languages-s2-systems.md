---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T14:24:27.902Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.367Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU2 s2 — systems language guides (go, rust)"
type: implementation
parent_plan: CU2-tier1-languages
depends_on: none
priority: HIGH
risk_level: LOW
files:
  - skills/languages/go.md
  - skills/languages/rust.md
  - tests/cu2-systems-guides.test.js
---

# CU2 s2 — systems language guides (go · rust)

> Slice 2 of the CU2 decomposition. De-stub the two systems-language guides from
> the 5-section template floor into substantive correction surfaces, in ONE
> coherent research pass (both are concurrency-first, managed-memory-adjacent
> languages: goroutine leaks / ownership+async-tokio, and cargo-audit / govulncheck
> supply-chain share a research spine). Adds the content-contract test that reads
> the REAL guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every Go/Rust version number, CWE identifier, tokio version, edition, date, and
> best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch
> of go.dev / doc.rust-lang.org / crates.io / cwe.mitre.org / RUSTSEC) and carry an
> inline dated source ≥ 2025-01-01 — never invented (hard user rule). The
> content-contract test READS the real files off disk and asserts substantive
> structure — no mocks, no stubs, no fakes.

Maps to CU2 acceptance criteria: **"each guide exceeds the 5-section floor with
substantive depth"**, **"go.md covers goroutine leaks, error wrapping, and module
gotchas"**, **"rust.md covers ownership, async, and unsafe footguns"**, **"all
version-specific and security claims carry dated sources"**, and **"tests stay
green and skills.json mappings remain valid"** — for these two files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule
does NOT apply** (CU2 vision carve-out). Each guide's examples are in ITS OWN
language, correct + idiomatic + current-version. Bar = depth-within-language,
objectively gated: every required `## ` section names a concrete identifier
(version number, CWE ID, or API/function name); every version/security claim
carries an inline dated source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** go.md and rust.md each have exactly 5
solid `## ` sections today (confirmed by reading fresh 2026-07-09 — Critical
Corrections, Current Tooling, Patterns, Anti-Patterns, Version Gotchas). Preserved
verbatim; new sections ADDED.

Grouping rationale: go + rust are one research pass because both center on
concurrency correctness (goroutine lifecycle / Send+Sync + async) and both have a
`vet+vuln` toolchain story (`govulncheck` / `cargo audit` + RUSTSEC) that is
researched together. They are disjoint from the managed-VM (java/csharp) and
native-unsafe (c/cpp) slices.

### Dependency Graph

```
skills/languages/go.md    (MODIFY: extend 5→>5 sections)  <--tested-by-- tests/cu2-systems-guides.test.js
skills/languages/rust.md  (MODIFY: extend 5→>5 sections)  <--tested-by-- tests/cu2-systems-guides.test.js
```

Two disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (independent of s1/s3/s4 — different files, parallel-safe).

### File Specifications

#### File: `skills/languages/go.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Go edits.
**Change Type:** substantive content addition

Add these `## ` sections (each names a concrete identifier + dated source ≥
2025-01-01 for version/security claims):
- **Concurrency / Goroutine Footguns** — goroutine leak patterns (send on
  unbuffered channel with no receiver, missing `ctx` cancel propagation,
  `sync.WaitGroup` misuse), `context.Context` propagation requirement, `-race`.
- **Error Handling Idioms** — `errors.Is` / `errors.As` wrapping vs sentinel-error
  anti-pattern, `fmt.Errorf("...: %w", err)`, not discarding errors (`_ = err`).
- **Security and Dependency Gotchas** — `govulncheck`, Go module dependency pinning
  (`go.sum`, `GOFLAGS=-mod=readonly`), `go mod tidy -diff` in CI; name a relevant
  Go vuln-class / advisory reference from the Go vuln DB (pkg.go.dev/vuln) with a
  dated source.
- **Testing Conventions** — table-driven tests, `t.Parallel()`, `go test -race`,
  `testing.TB`.
- **Performance Traps** — interface boxing / allocation, map pre-allocation
  (`make(map, n)`), slice append reallocation, `sync.Pool`.
- **Version-Specific Gotchas** — extend the existing section with dated, sourced
  items for the current Go release line verified at edit time (loop-var capture fix
  1.22, range-over-func 1.23, timer channel change 1.23, and the current stable Go
  version). Each dated ≥ 2025-01-01, sourced to go.dev/doc/devel/release.
- **References** — dated source list.

#### File: `skills/languages/rust.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Rust edits.
**Change Type:** substantive content addition

Add sections covering: ownership/lifetime elision edge cases; **async footguns**
(holding a lock across `.await` → deadlock, async-trait object limitations,
`Send` bound on futures) — **name the tokio version applicable at implementation
time** (verified against crates.io/docs.rs) with a dated source; `unsafe` block
invariant-documentation requirement + `// SAFETY:` convention + `miri`;
`Send`/`Sync` implementation pitfalls; **Rust edition migration** (2021 vs 2024
edition differences — `unsafe extern`, `env::set_var` unsafe, `static mut` refs);
dependency security (`cargo audit` + RUSTSEC advisory DB, name a RUSTSEC-id-shaped
reference); testing (`#[test]`, `cargo test`, `#[should_panic]`); performance traps
(needless `Box`/heap allocation, `String` vs `&str`, `.clone()` to satisfy borrowck).
Each version/security claim dated ≥ 2025-01-01, sourced to doc.rust-lang.org /
blog.rust-lang.org / rustsec.org / docs.rs.

### Test Plan

#### Tests: `tests/cu2-systems-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL go.md / rust.md off disk via `fs.readFileSync`
(mirroring `tests/skill-regulatory-citations.test.js`). No mocks, no fakes.

Content-contract test cases (per file — go, rust):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Required sections present** — Concurrency, Error Handling, Security/Dependency,
   Testing, Performance, Version-specific, References (case-insensitive regexes).
3. **Concrete identifiers present** — go: `errors.As` (or `errors.Is`) + `govulncheck`
   + a `1.2x` Go version token; rust: `tokio` + a version token + `cargo audit` +
   an edition token (`2024`/`2021`).
4. **Advisory/vuln reference named** — go: a `govulncheck` / pkg.go.dev/vuln
   reference; rust: a `RUSTSEC` token or `cargo audit` + rustsec.org URL.
5. **Dated source present** — at least one date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND
   at least one `http` source URL per file.
6. **Frontmatter/H1 intact** — original `# Go CTO` / `# Rust CTO` H1 still present
   (skills.json indexing unbroken).

**Coverage note:** content-grounding — content-contract assertions substitute for
line/branch coverage (CU1 s4 convention).

### Security Review

- Content-only edits to two Markdown guides + one test reading them; no runtime
  path, no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths.
- Source URLs are public official domains (go.dev, pkg.go.dev, doc.rust-lang.org,
  blog.rust-lang.org, rustsec.org, docs.rs, crates.io, cwe.mitre.org) — no secrets.
- Only the three enumerated files touched.

## Execution Plan

### Step 8: TEST
Confirm baseline green. Create `tests/cu2-systems-guides.test.js` reading the two
REAL files; run it — MUST be RED now (each file has exactly 5 `## ` sections, no
Concurrency/Security/Testing sections, no advisory tokens, no dated sources). Read
both current files fresh off disk first.

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): retrieve
current stable Go release + the 1.22/1.23 change facts (go.dev/doc/devel/release),
current tokio version (crates.io / docs.rs/tokio), Rust 2024 edition facts
(doc.rust-lang.org/edition-guide + blog.rust-lang.org), `cargo audit`/RUSTSEC
(rustsec.org), and the Go vuln DB (pkg.go.dev/vuln). Capture each source URL +
retrieval date (≥ 2025-01-01).

### Step 10: IMPLEMENT
Extend go.md and rust.md with the added sections (real footguns, idiomatic
per-language examples, dated sources). Additive only — existing 5 sections stay
verbatim. ONE step, two files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections; every added section names a concrete
identifier; every version/security claim carries an inline dated source ≥
2025-01-01; the tokio version and Go version are the web-verified current ones;
diff additive on the guides.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused; every bullet names a specific footgun
+ identifier, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the three
enumerated files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm
`.ctoc/skills.json` still indexes go/rust triggers (H1/frontmatter intact).
`tests/readme-numbers.test.js` still passes (count unchanged).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU2-s2") so the completeness check has no silent omissions. Record each
web-verified fact + source URL + retrieval date in `## Decisions Taken Under
Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the three enumerated files edited; every version/security claim
sourced with a date ≥ 2025-01-01; nothing fabricated (tokio version, Go version,
edition facts, RUSTSEC/vuln references all traceable to official URLs); no
cross-language BAD/SAFE examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale tokio/Go version gives false confidence | Web-verify current tokio + Go stable at edit time; inline dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/edition/advisory (hard user rule) | Every fact carries an official source URL retrieved at edit time; test asserts dated source + http URL per file | Step 9, Step 14, Step 16 |
| Frontmatter corruption breaks skills.json indexing | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts concrete identifiers + advisory tokens, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 14 tests / 2 pass / 12 fail (RED)

### Step 9: PREPARE
- [x] Install dependencies if needed — none (content edits + node:test)
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed — web-verified all version/security facts

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — go 5→11, rust 5→16 sections
- [x] Add error handling — Error Handling section in each guide
- [x] Wire up integration points — H1 intact; skills.json still indexes go/rust

### Step 11: REVIEW
- [x] Self-review all new code — each section names a concrete identifier + dated source
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations — dense, footgun-per-bullet, no padding
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — test uses path.join(__dirname,'..')
- [x] Sanitize outputs
- [x] No secrets in code — only public official-domain URLs
- [x] Safe file operations — only the 3 enumerated files touched

### Step 14: VERIFY
- [x] Run lint + type check — eslint exit 0; tsc baseline-neutral (0 errors in slice files)
- [x] Run ALL tests (TDD Green) — 3452 pass / 0 fail; slice 14/14
- [x] Check coverage >= 80% — content-grounding substitutes (CU1 s4 convention)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation — corpus-audit UPGRADED verdicts; Decisions section
- [x] Add JSDoc comments to new functions — test file has module docstring
- [x] Update CHANGELOG if needed — n/a (skill-content slice)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

All version/security facts below were WEB-VERIFIED at edit time (2026-07-09) against
official sources via direct API/HTTP fetch; nothing invented. Retrieval date on every item.

**Go — verified facts + sources:**
- Current stable **Go 1.26.5**, released **2026-02-11**; 1.25 (2025-08-12, added
  container-aware GOMAXPROCS + `testing/synctest`); 1.24 (2025-02-11, EOL 2026-02-11);
  1.23 (2024-08-13, range-over-func + timer-channel change); 1.22 (loop-var capture fix).
  Source: https://go.dev/dl/ (mode=json) + https://endoflife.date/go [retrieved 2026-07-09].
- **GO-2025-3563** = **CVE-2025-22871**, request smuggling in `net/http` (invalid chunked
  data), **published 2025-04-08**, fixed 1.23.8/1.24.2. Verified via vuln.go.dev/ID/GO-2025-3563.json.
  Source: https://pkg.go.dev/vuln/GO-2025-3563 [retrieved 2026-07-09].
- **GO-2025-3373**, crypto/x509 IPv6-zone-ID URI name-constraint bypass, **published 2025-01-28**.
  Verified via vuln.go.dev/ID/GO-2025-3373.json. Source: https://pkg.go.dev/vuln/GO-2025-3373 [2026-07-09].
- Go 1.25 features confirmed by grepping https://go.dev/doc/go1.25 (synctest, GOMAXPROCS, container).

**Rust — verified facts + sources:**
- Current stable **Rust 1.96.1**, released **2026-05-28**. Source: https://endoflife.date/rust
  (api/rust.json) [retrieved 2026-07-09].
- **2024 edition stabilized in Rust 1.85.0, released 2025-02-20** — confirmed by grepping the
  release blog for "2024 edition". Source: https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/
  [retrieved 2026-07-09]. Edition guide HTTP 200: https://doc.rust-lang.org/edition-guide/rust-2024/.
- **tokio 1.52.3** current stable (max_stable_version == newest_version). Source:
  https://crates.io/api/v1/crates/tokio + docs.rs/tokio (Mutex page HTTP 200) [retrieved 2026-07-09].
- **RUSTSEC-2025-0009** (`ring` AES panic w/ overflow checks), **published 2025-03-06**; and
  **RUSTSEC-2024-0003** (`h2` HTTP/2 DoS), **published 2024-01-17**. Both verified via
  api.osv.dev/v1/vulns/<id>. Source: https://rustsec.org/advisories/ [retrieved 2026-07-09].

**Decisions:**
1. **rust.md needed a dedicated `## Error Handling Idioms` section.** The test's required-section
   regex (`error.?handling`) is a heading match; Rust's error content originally lived inside
   Critical Corrections / Anti-Patterns. Added an explicit Error Handling section (`?` operator,
   `thiserror` for libs / `anyhow` for bins, `#[must_use]` on Result) rather than weakening the
   test. Chosen because the go.md counterpart already has a named Error Handling section — symmetry
   across the two systems guides is the higher-quality outcome.
2. **Version tokens embedded verbatim** (Go 1.26.5, tokio 1.52.3, Rust 1.85.0/1.96.1) so a future
   staleness sweep can grep them against the live registries; each carries its dated source line.
3. **No corpus-audit CU2-s1 precedent existed** — s1 shipped its test but recorded no corpus entry.
   Recorded UPGRADED verdicts for go.md/rust.md as `slice: "CU2-s2"` in
   `.ctoc/audit/corpus-audit-2026-06-15.json` (whitelisted `.ctoc/*`) per Step 15 to prevent a
   silent completeness omission.
4. **Nothing omitted for lack of verification** — every fact written was verifiable at edit time.
   No fabricated CVE/RUSTSEC/version/edition was included.

**No-churn confirmed:** git diff = 336 insertions, 0 deletions on the two guides; existing 5
sections each preserved verbatim; H1 (`# Go CTO` / `# Rust CTO`) intact — skills.json still indexes both.
