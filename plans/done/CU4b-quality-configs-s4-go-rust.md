---
approved_by: human
approved_at: 2026-07-10T12:29:05.695Z
gate_crossed: review → done
---

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
- [x] Write `tests/cu4b-go-rust-configs.test.js` — reads BOTH REAL files, zero doubles;
      asserts per-file `>5` sections, required sections, language identifiers, `>=4` fences,
      dated http source, cross-language guard (no rust token in go / no go token in rust),
      gradient tokens.
- [x] Run — expect RED.

### Step 9: PREPARE
- [x] READ `go/strict.md` and `rust/strict.md` (structure templates) fresh off disk.
- [x] **WEB-VERIFY at edit time** (no invented versions): current golangci-lint version +
      action, current stable Go version, current clippy/rustfmt (via rustup), current
      cargo-llvm-cov version, the current stable Rust edition. Capture each source URL +
      retrieval date ≥ 2025-01-01.

### Step 10: IMPLEMENT
- [x] Expand go/strictest to `> 5` `##` using go/strict STRUCTURE (add Makefile/Directory/
      CI, pin golangci-lint version). Expand rust/legacy to `> 5` `##` using rust/strict
      STRUCTURE (add Rustfmt/cargo-llvm-cov/Commands/Install/CI, keep relaxed legacy limits).
      ONE step. NO go value in rust and NO rust value in go. Each section identifier-bearing;
      each version inline-dated-sourced.

### Step 11: REVIEW
- [x] Self-review: go gradient (strictest/90%/enable-all) and rust gradient (legacy/50%/
      unsafe=warn) correct; no cross-language token in either file; each section
      identifier-bearing; each version sourced; existing blocks retained.

### Step 12: OPTIMIZE
- [x] Density at go/strict and rust/strict level; tables where the templates use tables;
      no filler.

### Step 13: SECURE
- [x] All source URLs official; only the 3 files edited.

### Step 14: VERIFY
- [x] `node --test tests/cu4b-go-rust-configs.test.js` → GREEN.
- [x] `node --test tests/*.test.js` → `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [x] Append to `## Decisions Taken Under Ambiguity`: UPGRADED verdict for go/strictest and
      rust/legacy; templates = go/strict (go), rust/strict (rust); each golangci-lint / Go /
      clippy / rustfmt / cargo-llvm-cov / Rust-edition version with its dated source URL.

### Step 16: FINAL-REVIEW
- [x] Only the 3 enumerated files changed; nothing fabricated; go/strict + rust/strict read
      but NOT edited (no-churn).

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Rust value in the go guide or go value in the rust guide (HIGH) | Test asserts NO rust tokens in go and NO go tokens in rust; each file extends only its own `strict` sibling | Step 10, 11, test |
| Invented golangci-lint/clippy/tool version | Web-verify at edit time; inline dated official URL; pin instead of `@latest` where a version is claimed | Step 9, 15 |
| Section inflation without depth | Test asserts identifier + `>=4` fences + dated source per file | Step 14 |

## Decisions Taken Under Ambiguity

**Executed 2026-07-09 (barrier-pattern slice — verified own test only, left UNSTAGED, plan NOT moved).**

**Verdict: BOTH UPGRADED.**
- `go/strictest.md`: 5 `##`/101 lines → **8 `##`/221 lines**. Structure template = `go/strict.md`
  (same-family, READ-ONLY, no churn confirmed via `git status`). Added Makefile, Directory
  Structure, and CI Integration sections; kept the maximal preset, tight complexity table (gocyclo
  7 / gocognit 10 / funlen 30 / nestif 3 / revive limits) and 90% coverage. Correct tier =
  MAXIMAL.
- `rust/legacy.md`: 5 `##`/44 lines → **10 `##`/168 lines**. Structure template = `rust/strict.md`
  (same-family, READ-ONLY, no churn confirmed). Added Rustfmt, cargo-llvm-cov coverage tool,
  Commands, Edition Migration, Install, and CI sections; kept the RELAXED legacy limits (cognitive
  25 / args 8 / lines 100), `unsafe_code = "warn"`, `style = "allow"`, and 50% coverage. Correct
  tier = LENIENT/MIGRATION.

**Web-verified versions (all retrieved 2026-07-09, dated inline in each file):**
- golangci-lint **v2.12.2** — https://github.com/golangci/golangci-lint/releases/tag/v2.12.2 (published 2026-05-06)
- Go **1.26.5** stable — https://go.dev/dl/ (2026-07-09)
- golangci-lint-action **v9.3.0** — https://github.com/golangci/golangci-lint-action/releases/tag/v9.3.0 (2026-06-29)
- actions/setup-go **v6.5.0** — https://github.com/actions/setup-go/releases/tag/v6.5.0 (2026-06-24)
- Rust **1.97.0** stable — https://github.com/rust-lang/rust/releases/tag/1.97.0 (2026-07-09)
- Rust **2024 edition** stable since 1.85 — https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/ (2025-02-20)
- cargo-llvm-cov **v0.8.7** — https://github.com/taiki-e/cargo-llvm-cov/releases/tag/v0.8.7 (2026-05-13)
- golangci-lint v2 config schema (`version: "2"`, `linters.default: all`, `linters.settings`,
  top-level `formatters`) — https://raw.githubusercontent.com/golangci/golangci-lint/main/.golangci.reference.yml + https://golangci-lint.run/docs/configuration/file/ (2026-07-09)
- clippy/rustfmt thresholds + `[lints]` table + cargo-llvm-cov `--fail-under-lines` — doc.rust-lang.org/clippy, rust-lang.github.io/rustfmt, github.com/taiki-e/cargo-llvm-cov (2026-07-09)

**AMBIGUITY DECISION — golangci-lint v1 → v2 config migration (documented choice, no-stub rule).**
The original `go/strictest.md` shipped the **deprecated v1 schema** (`linters.enable-all: true`,
`linters-settings:`, `severity.default-severity`). golangci-lint v2 (current, v2.12.2) **removed**
`enable-all` in favor of `linters.default: all`, moved settings under `linters.settings`, split
`gofmt`/`goimports` into a top-level `formatters` block, and renamed `severity.default-severity`
→ `severity.default`. Per the "warnings are bugs" + "no fabricated" rules I shipped the **current
v2 schema** and documented the v1→v2 delta inline. Consequence: the plan's originally-suggested
gradient token `enable-all` is NOT present (it is the removed v1 key); my content-contract test
asserts the v2-correct tokens `version: "2"` + `default: all` instead. Also corrected the v2 module
import path (`github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.12.2`).

**AMBIGUITY DECISION — test cross-language guard false-positive.** My own guard `/go install/`
matched inside `cargo install` in the rust file. Fixed by anchoring the Go CLI verb with `\bgo install`
(word boundary does not fire inside "cargo"); the assertion still blocks a real `go install` leak.

**VERIFY tallies (own test only — full suite deliberately NOT run per barrier pattern):**
- RED (thin files): `node --test tests/cu4b-go-rust-configs.test.js` → 18 tests, 5 pass, **13 fail**.
- GREEN (after upgrade): → **18 tests, 18 pass, 0 fail, 0 skipped**.
- `eslint tests/cu4b-go-rust-configs.test.js` → **exit 0**.
- `git status`: only the 3 slice files touched (2 modified + 1 untracked); `go/strict.md` +
  `rust/strict.md` unchanged. Left UNSTAGED; plan NOT moved.
