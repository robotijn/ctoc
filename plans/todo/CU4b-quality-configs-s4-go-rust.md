---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T21:40:58.361Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.442Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4b s4 — go/strictest + rust/legacy quality-configs → systems-toolchain depth"
type: implementation
parent_plan: CU4b-quality-configs
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/quality-configs/go/strictest.md
  - skills/quality-configs/rust/legacy.md
  - tests/cu4b-go-rust-configs.test.js
---

# CU4b s4 — go/strictest + rust/legacy → same-family systems-toolchain depth

> Slice 4 of the CU4b decomposition (SIP1). Upgrade the two ORPHAN single-thin-in-family
> systems configs — `go/strictest.md` and `rust/legacy.md` — each using its OWN
> SAME-FAMILY template (`go/strict.md` for go, `rust/strict.md` for rust; both SOLID,
> READ-ONLY). Grouped into one slice because each language has exactly ONE thin config;
> splitting would create two sub-target 1-file slices. They are disjoint by file and each
> keeps its own template — NO cross-contamination between go and rust. Inherits the
> parent's Gate-1 `approved_by: human` marker; Gate 2 & 3 batch via
> `approveSubplans('CU4b-quality-configs', …)`. **HARD RULES:** **(1) NO STUBS** — real
> golangci-lint / clippy rules/rationale/versions, each file `> 5` `##` sections. **(2) NO
> FABRICATED versions/rules** — every golangci-lint/clippy/rustfmt/coverage-tool version
> and linter name WEB-VERIFIED against official docs at edit time, inline dated http source
> ≥ 2025-01-01; unverifiable → omit. **(3) ZERO TEST DOUBLES** — the content-contract test
> reads the REAL go+rust config files off disk. **(4) STRUCTURAL TEMPLATING** — copy each
> language's own `strict` STRUCTURE, author language-correct values; NO Go value in the
> rust guide and NO Rust value in the go guide.

Satisfies CU4b acceptance criteria: **"all 9 thin configs reach sibling-family depth"**
(go/strictest + rust/legacy), **"config values are language-correct"**, **"every section
names a technology-specific identifier"**, **"all version claims carry dated sources"**.

## Implementation Details

### Architecture Decision

Read-fresh 2026-07-09: go/strictest = 5 `##`/101 lines, rust/legacy = 5 `##`/44 lines.
Each has a rich SAME-family sibling as its STRUCTURE template (SOLID, READ-ONLY):

- **go/strictest** ← **`skills/quality-configs/go/strict.md`** (7 `##`: Mode /
  golangci-lint(`.golangci.yml`) / Coverage / Complexity / Install Command / Makefile /
  Directory Structure). go/strictest already ships a full `.golangci.yml` `enable-all`
  block + coverage/complexity tables + install command — it is MISSING the Makefile,
  Directory Structure, and a CI section. The upgrade ADDS those and surfaces the
  golangci-lint version + `go.mod` Go version.
- **rust/legacy** ← **`skills/quality-configs/rust/strict.md`** (8 `##`: Mode / Clippy
  (`clippy.toml`) / Cargo(`Cargo.toml`) / Rustfmt(`rustfmt.toml`) / Coverage / Complexity /
  Commands / Install). rust/legacy already ships `Cargo.toml` `[lints]` + `clippy.toml` +
  coverage/complexity tables — it is MISSING Rustfmt, a coverage TOOL (cargo-llvm-cov),
  Commands, Install, and CI. The upgrade ADDS those, keeping the RELAXED legacy limits.

**Two independent gradients** (both correctness axes, kept correct):
- go **strictest**: `enable-all` linters (keep), tight complexity (gocyclo 7 / gocognit 10
  / funlen 30 / revive limits — keep), coverage 90%, `default-severity: error`; add
  Makefile + CI + golangci-lint install-at-version.
- rust **legacy**: `unsafe_code = "warn"` (not deny), `correctness = "deny"` but `style =
  "allow"`, relaxed `clippy.toml` (cognitive 25 / args 8 / lines 100 — keep), coverage 50%,
  gradual adoption; add rustfmt + cargo-llvm-cov + `cargo clippy`/`cargo fmt` commands + CI.

### Dependency Graph

```
skills/quality-configs/go/strictest.md  (MODIFY) ─ structure from ─▶ go/strict.md   (READ-ONLY, same-family)
skills/quality-configs/rust/legacy.md   (MODIFY) ─ structure from ─▶ rust/strict.md (READ-ONLY, same-family)
tests/cu4b-go-rust-configs.test.js  (CREATE, reads BOTH real files — zero doubles)
```

The go and rust upgrades are independent (different toolchains); the shared slice only
co-locates the research pass for two systems languages. No cycle. `depends_on: none`.

### File Specifications

#### File: `go/strictest.md`
**Action:** MODIFY (add sections to reach `> 5` `##`; keep the existing `.golangci.yml` +
tables). Must carry at minimum (structure mirrors go/strict):
1. **Mode** (keep).
2. **golangci-lint Config (`.golangci.yml`)** (keep the `enable-all` block).
3. **Coverage Requirements** (keep; 90%).
4. **Complexity Limits** (keep the table).
5. **Install Command** (keep/extend — pin golangci-lint to a WEB-VERIFIED current version
   instead of `@latest`, or document both).
6. **Makefile** — `lint`/`test`/`cover` targets (from go/strict structure).
7. **Directory Structure** — the standard layout note (from go/strict structure).
8. **CI Integration** — GitHub Actions (`actions/setup-go@v5` with the current Go version,
   `golangci/golangci-lint-action`), coverage gate.
Identifiers: `golangci-lint`, `gocyclo`/`gocognit`/`revive`, a Go version (`go 1.2x`),
`go install`. Each version/tool claim inline-dated-sourced ≥ 2025-01-01
(golangci-lint.run / go.dev).

#### File: `rust/legacy.md`
**Action:** MODIFY (add sections to reach `> 5` `##`; keep the existing `Cargo.toml`
`[lints]` + `clippy.toml` + tables). Must carry at minimum (structure mirrors rust/strict):
1. **Mode** (keep).
2. **Clippy Config (`clippy.toml`)** (keep the relaxed thresholds).
3. **Cargo Config (`Cargo.toml`)** (keep the `[lints]` block).
4. **Rustfmt Config (`rustfmt.toml`)** — legacy-appropriate (edition + basic style).
5. **Coverage Requirements** — 50%, via **cargo-llvm-cov** (name the tool).
6. **Complexity Limits** (keep the table).
7. **Commands** — `cargo clippy -- -W clippy::all`, `cargo fmt --check`,
   `cargo llvm-cov`.
8. **Install** — `rustup component add clippy rustfmt` + `cargo install cargo-llvm-cov`
   (WEB-VERIFIED tool names/versions) + a CI note.
Identifiers: `clippy`, `rustfmt`, `cargo-llvm-cov`, a Rust edition (`edition = "2021"`/`2024`
as verified), `[lints.clippy]`. Each version/tool claim inline-dated-sourced ≥ 2025-01-01
(doc.rust-lang.org/clippy / rust-lang.github.io/rustfmt / github.com/taiki-e/cargo-llvm-cov).

#### File: `tests/cu4b-go-rust-configs.test.js`
**Action:** CREATE. **Framework:** `node:test`. **Zero doubles** — reads BOTH real files
via `fs.readFileSync`.

**Test cases:**
- **go/strictest**: `> 5` `##` sections; `> 90` lines; required sections golangci-lint,
  Coverage, Complexity, Install, Makefile OR CI; identifiers `golangci-lint` + a Go
  version token + `gocyclo`/`revive`; ≥ 4 fences; dated http source; **NO rust tokens**
  (`clippy`, `Cargo.toml`, `rustfmt`, `cargo`); gradient token `90%` + `enable-all`.
- **rust/legacy**: `> 5` `##` sections; `> 90` lines; required sections Clippy, Cargo,
  Rustfmt, Coverage, Commands OR Install; identifiers `clippy` + `rustfmt` +
  `cargo-llvm-cov` + a `[lints` token; ≥ 4 fences; dated http source; **NO go tokens**
  (`golangci-lint`, `\.golangci`, `gocyclo`, `go install`); gradient token `50%` +
  `unsafe_code = "warn"`.

### Test Plan

Step 8 RED: go/strictest fails the Makefile/Directory/CI required-section + go-version
identifier assertions; rust/legacy fails the Rustfmt/coverage-tool/Commands required-section
+ cargo-llvm-cov identifier assertions. After upgrade all pass; `node --test tests/*.test.js`
→ `# fail 0`.

### Security Review

- Content-only edits to 2 markdown files + one test file; no runtime path handling.
- Source URLs official public domains (golangci-lint.run, go.dev, doc.rust-lang.org,
  rust-lang.github.io, github.com/taiki-e) — no secrets.
- Only the 3 enumerated files touched.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write `tests/cu4b-go-rust-configs.test.js` — reads BOTH REAL files, zero doubles;
      asserts per-file `>5` sections, required sections, language identifiers, `>=4` fences,
      dated http source, cross-language guard (no rust token in go / no go token in rust),
      gradient tokens.
- [ ] Run — expect RED.

### Step 9: PREPARE
- [ ] READ `go/strict.md` and `rust/strict.md` (structure templates) fresh off disk.
- [ ] **WEB-VERIFY at edit time** (no invented versions): current golangci-lint version +
      action, current stable Go version, current clippy/rustfmt (via rustup), current
      cargo-llvm-cov version, the current stable Rust edition. Capture each source URL +
      retrieval date ≥ 2025-01-01.

### Step 10: IMPLEMENT
- [ ] Expand go/strictest to `> 5` `##` using go/strict STRUCTURE (add Makefile/Directory/
      CI, pin golangci-lint version). Expand rust/legacy to `> 5` `##` using rust/strict
      STRUCTURE (add Rustfmt/cargo-llvm-cov/Commands/Install/CI, keep relaxed legacy limits).
      ONE step. NO go value in rust and NO rust value in go. Each section identifier-bearing;
      each version inline-dated-sourced.

### Step 11: REVIEW
- [ ] Self-review: go gradient (strictest/90%/enable-all) and rust gradient (legacy/50%/
      unsafe=warn) correct; no cross-language token in either file; each section
      identifier-bearing; each version sourced; existing blocks retained.

### Step 12: OPTIMIZE
- [ ] Density at go/strict and rust/strict level; tables where the templates use tables;
      no filler.

### Step 13: SECURE
- [ ] All source URLs official; only the 3 files edited.

### Step 14: VERIFY
- [ ] `node --test tests/cu4b-go-rust-configs.test.js` → GREEN.
- [ ] `node --test tests/*.test.js` → `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [ ] Append to `## Decisions Taken Under Ambiguity`: UPGRADED verdict for go/strictest and
      rust/legacy; templates = go/strict (go), rust/strict (rust); each golangci-lint / Go /
      clippy / rustfmt / cargo-llvm-cov / Rust-edition version with its dated source URL.

### Step 16: FINAL-REVIEW
- [ ] Only the 3 enumerated files changed; nothing fabricated; go/strict + rust/strict read
      but NOT edited (no-churn).

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Rust value in the go guide or go value in the rust guide (HIGH) | Test asserts NO rust tokens in go and NO go tokens in rust; each file extends only its own `strict` sibling | Step 10, 11, test |
| Invented golangci-lint/clippy/tool version | Web-verify at edit time; inline dated official URL; pin instead of `@latest` where a version is claimed | Step 9, 15 |
| Section inflation without depth | Test asserts identifier + `>=4` fences + dated source per file | Step 14 |

## Decisions Taken Under Ambiguity

(To be completed by the executor at Step 15 — must record: the UPGRADED verdict for
go/strictest.md and rust/legacy.md; templates used = go/strict.md (go) and rust/strict.md
(rust), both same-family, STRUCTURE only; and each web-verified golangci-lint / Go /
clippy / rustfmt / cargo-llvm-cov / Rust-edition version with its dated http source URL and
retrieval date ≥ 2025-01-01. Never invent a version.)
