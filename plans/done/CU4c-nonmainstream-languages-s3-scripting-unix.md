---
approved_by: human
approved_at: 2026-07-10T14:54:11.698Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.034Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s3 — Unix scripting language guides (bash, perl, tcl, lua)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/bash.md
  - skills/languages/perl.md
  - skills/languages/tcl.md
  - skills/languages/lua.md
  - tests/cu4c-scripting-unix-guides.test.js
---

# CU4c s3 — Unix scripting language guides (bash · perl · tcl · lua)

> Slice 3 of the CU4c decomposition. De-stub the four **Unix glue / embeddable scripting**
> language guides from the 5-section template floor (confirmed fresh 2026-07-09: each has
> exactly the 5 template sections) into substantive correction surfaces, in ONE coherent
> research pass. Shared research spine: string-interpolation → **injection** (command
> injection CWE-78, code injection CWE-94/eval), quoting/word-splitting, taint, and
> embedding into host applications (Lua/Tcl embedded, Perl one-liners, Bash as glue).
> Adds the content-contract test that reads the REAL guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every Bash/Perl/Tcl/Lua version, CWE identifier, tool version, date, and best-practice
> claim MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch of gnu.org/bash /
> perl.org / tcl.tk / lua.org / cwe.mitre.org / owasp.org) and carry an inline dated
> source ≥ 2025-01-01 — never invented (hard user rule). If no dated authoritative source
> exists for a claim, **OMIT the claim** and note the absence in the audit findings. The
> content-contract test READS the real files off disk — no mocks, no fakes.

Maps to CU4c acceptance criteria: **"upgraded guides meet the CU2 depth standard"**,
**"CVE/CWE classes named for applicable languages (injection risks for scripting
languages)"**, and **"no audited-SOLID guide is rewritten (no-churn)"** — for these four.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Examples are in each guide's OWN language, idiomatic
+ current. Bar = depth-within-language, objectively gated: every required `## ` section
names a concrete identifier; every version/security claim carries a dated source ≥
2025-01-01.

**No-churn (extend, never overwrite):** bash.md already carries strong injection/quoting
content in its existing 5 sections — those are PRESERVED verbatim and EXTENDED, never
rewritten. All four files have exactly 5 `## ` sections today (confirmed fresh 2026-07-09).

Grouping rationale: ONE research pass because all four center on the same footgun family
— **injection via interpolation/`eval`** (Bash command injection, Perl `system`/backtick +
`open` two-arg, Tcl `exec`/`eval` substitution, Lua `os.execute`/`loadstring`) plus
quoting/word-splitting and embedding boundaries. Disjoint from the dynamic-OO-scripting
slice (s4: ruby/php/groovy/coffeescript) by file and by research spine (those are web/OO;
these are Unix-glue/embeddable).

### Dependency Graph

```
skills/languages/bash.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-scripting-unix-guides.test.js
skills/languages/perl.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-scripting-unix-guides.test.js
skills/languages/tcl.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-scripting-unix-guides.test.js
skills/languages/lua.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-scripting-unix-guides.test.js
```

Four disjoint content files + one test. No cycle. `depends_on: none` (parallel-safe;
Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/security claims; extend the existing `Version Gotchas` section):

#### File: `skills/languages/bash.md`
**Action:** MODIFY (extend 5→>5; strict no-churn — existing injection/quoting content
preserved verbatim)
**Purpose:** Trigger-loaded correction surface for Bash edits.
- **Concurrency / Job-Control Footguns** — background `&` + `wait`, subshell variable
  scope loss in pipelines (`while read` in a pipe loses vars), `set -o pipefail` and
  exit-status of pipelines, race on shared temp files. Name `pipefail`, `wait`.
- **Error Handling Idioms** — EXTEND: `set -euo pipefail` limits (ERR not inherited into
  functions without `set -E`), `trap ... ERR`, checking `$?` vs `||`, `${var:?msg}`. Name
  `trap ERR`, `set -E`.
- **Security and Dependency Gotchas** — EXTEND existing injection content: **command
  injection CWE-78** via unquoted `eval`/`$(...)` on user input (link
  cwe.mitre.org/definitions/78.html), `printf %q`/arrays over `eval`, `IFS` reset,
  fetch-pipe-to-shell risk. Name CWE-78.
- **Testing Conventions** — `bats-core`, `shellcheck` as a gate (already named — extend
  with severity flags), `shfmt`. Name bats-core.
- **Performance Traps** — forking per iteration (`$(cmd)` in tight loops), `cat`-abuse,
  reading files line-by-line vs `mapfile`, external `grep`/`sed` vs builtins.
- **Version-Specific Gotchas** — EXTEND: Bash 5.x features + macOS default Bash 3.2
  divergence, dated ≥ 2025-01-01, sourced to gnu.org/software/bash.
- **References** — dated source list.

#### File: `skills/languages/perl.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Perl edits.
- **Concurrency Footguns** — `fork` copy-on-write + zombie reaping (`$SIG{CHLD}`), threads
  (`ithreads`) copy-everything cost, no shared mutable state by default. Name `fork`,
  `$SIG{CHLD}`.
- **Error Handling Idioms** — `use strict; use warnings` mandatory, `eval { } / $@` +
  `Try::Tiny`, checking `open` return + `$!`, `die`/`croak` with objects. Name
  `Try::Tiny`, `$@`.
- **Security and Dependency Gotchas** — **taint mode `-T`**, two-arg `open` = **command
  injection CWE-78** (use three-arg `open(my $fh, '<', $file)`), `system(LIST)` over
  `system(STRING)`, CPAN pinning via `cpanfile`+`Carton`. Name CWE-78, `-T`, three-arg open.
- **Testing Conventions** — `Test::More`/`Test2`, `prove`, `Devel::Cover`. Name Test2.
- **Performance Traps** — regex recompilation (`qr//`), string concat in loops, slurping
  huge files, autovivification surprises.
- **Version-Specific Gotchas** — EXTEND: current Perl 5.x stable + `use v5.3x` feature
  bundles, dated ≥ 2025-01-01, sourced to perl.org / perldoc.perl.org.
- **References** — dated source list.

#### File: `skills/languages/tcl.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Tcl edits.
- **Concurrency Footguns** — the event loop (`vwait`/`after`), Tcl threads are separate
  interpreters (no shared vars → thread-shared vars needed), `update` re-entrancy trap.
  Name `vwait`, `after`.
- **Error Handling Idioms** — `catch { } msg opts` + `try`/`trap`/`finally` (8.6+),
  `error`/`return -code`, `$errorInfo`. Name `try`, `catch`.
- **Security and Dependency Gotchas** — `eval`/`subst` on untrusted input =
  **code injection CWE-94** (link cwe.mitre.org/definitions/94.html), `exec` command
  injection CWE-78, safe interpreters (`interp create -safe`), `{*}` expansion vs unquoted
  substitution. Name CWE-94, `interp -safe`.
- **Testing Conventions** — `tcltest` framework, `[test]` assertions. Name tcltest.
- **Performance Traps** — string-as-everything shimmering (dual-Obj type thrashing),
  `lappend` vs `concat`, unbraced `expr` re-parsing (always brace `expr {$a+$b}`).
- **Version-Specific Gotchas** — EXTEND: Tcl 8.6 vs 9.0 differences, dated ≥ 2025-01-01,
  sourced to tcl.tk / core.tcl-lang.org.
- **References** — dated source list.

#### File: `skills/languages/lua.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Lua edits.
- **Concurrency / Coroutines Footguns** — coroutines are cooperative (not preemptive),
  `coroutine.resume` swallows errors (returns `false, err` — must check), no true
  parallelism without host threads. Name `coroutine.resume`.
- **Error Handling Idioms** — `pcall`/`xpcall` + traceback, `error(obj, level)`, checking
  the boolean first return, `assert`. Name `pcall`, `xpcall`.
- **Security and Dependency Gotchas** — `loadstring`/`load` + `os.execute`/`io.popen` on
  untrusted input = **code/command injection (CWE-94 / CWE-78)**, sandboxing via
  restricted `_ENV`, LuaRocks pinning. Name CWE-94, `_ENV` sandbox.
- **Testing Conventions** — `busted` framework, `luassert`, luacov. Name busted.
- **Performance Traps** — table rehash on growth (pre-size with `table.create`/`{}`),
  string concat in loops (`table.concat`), global-vs-local access cost, 1-based indexing
  off-by-one bugs. Name `table.concat`.
- **Version-Specific Gotchas** — EXTEND: Lua 5.4 (integer/float subtypes, `<close>`
  to-be-closed vars) vs 5.1/LuaJIT divergence, dated ≥ 2025-01-01, sourced to lua.org.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-scripting-unix-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL four guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — bash, perl, tcl, lua):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — Concurrency/Coroutines/Job-Control, Error Handling,
   Security/Dependency, Testing, Performance, Version-specific, References (regexes).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Injection CWE named per file** — bash: `CWE-78` + bats-core; perl: `CWE-78` +
   `Try::Tiny`; tcl: `CWE-94` + tcltest; lua: `CWE-94` + `pcall`.

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to four Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (gnu.org, perl.org, perldoc.perl.org, tcl.tk,
  lua.org, cwe.mitre.org, owasp.org) — no secrets.
- Only the five enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all four guides fresh off disk first (bash.md already has injection/quoting content —
note what to preserve). Create `tests/cu4c-scripting-unix-guides.test.js` reading the four
REAL files; run it — MUST be RED now (each has exactly 5 `## ` sections, no dedicated
Concurrency/Testing/References sections, no CWE tokens, no dated sources).

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): Bash 5.x
(gnu.org/software/bash), current Perl 5.x stable (perl.org), Tcl 8.6/9.0 (tcl.tk),
Lua 5.4 (lua.org), CWE-78 + CWE-94 pages (cwe.mitre.org). Capture each source URL +
retrieval date (≥ 2025-01-01). Omit any niche claim with no dated source; record for Step 15.

### Step 10: IMPLEMENT
Extend the four guides with the added sections. Additive only — existing 5 sections stay
verbatim (especially bash's existing injection/quoting bullets). ONE step, four files +
the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; every version/security claim carries an inline dated source ≥ 2025-01-01; the
injection CWE (78/94) named per file; diff additive on all four guides.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the five enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes bash/perl/tcl/lua triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s3"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the five enumerated files edited; every version/security claim sourced with
a date ≥ 2025-01-01; nothing fabricated; no cross-language BAD/SAFE examples added; bash's
existing content preserved verbatim; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale Bash/Perl/Tcl/Lua version | Web-verify current stable at edit time; inline dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/advisory (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| Overwriting bash's existing injection/quoting content | Strict additive no-churn; existing 5 sections preserved verbatim; diff reviewed for 0 deletions | Step 10, Step 11 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts injection CWE + concrete identifiers, not just section count | Step 11, Step 14 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 28 tests, 4 pass / 24 fail (RED confirmed)

### Step 9: PREPARE
- [x] Install dependencies if needed — none required (node:test, existing eslint)
- [x] Check prerequisites — web-verified all versions/CWEs (see Decisions table)
- [x] Verify dev environment ready
- [x] Create directories/config if needed — n/a

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — 7 new sections per guide, additive
- [x] Add error handling — each guide has an Error Handling Idioms section
- [x] Wire up integration points — skills.json triggers intact

### Step 11: REVIEW
- [x] Self-review all new code — >5 sections (12 each), >120 lines each, CWE named
- [x] Verify integration points work together — H1 headers intact, additive diff
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations — dense, footgun-per-bullet, no padding
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — test uses path.join(__dirname,'..')
- [x] Sanitize outputs — content-only markdown edits, no runtime surface
- [x] No secrets in code — only public official domain URLs
- [x] Safe file operations — read-only fs.readFileSync in the test

### Step 14: VERIFY
- [x] Run lint + type check — eslint on test file exit 0
- [x] Run ALL tests (TDD Green) — slice test 28/28 pass (BARRIER: own test only, per caller)
- [x] Check coverage >= 80% — content-grounding substitutes for line coverage (CU2 convention)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation — the four guides ARE the documentation; sources dated
- [x] Add JSDoc comments to new functions — test file header documents zero-doubles contract
- [x] Update CHANGELOG if needed — n/a (caller commits)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

### Web-verified facts + sources (all retrieved 2026-07-10)

| Fact asserted in guide | Value | Official source (URL) |
|---|---|---|
| Bash current stable | 5.3, released 2025-07-30 (prior 5.2.37, 2024-09-23) | https://ftp.gnu.org/gnu/bash/ (directory listing with dates) |
| macOS default /bin/bash | 3.2 (last GPLv2 release) | https://www.gnu.org/software/bash/ |
| Perl current stable | 5.42 (2025-07-03), latest 5.42.2 (2026-03-29); prior 5.40 (2024-06-09, latest 5.40.4) | https://endoflife.date/perl ; https://www.cpan.org/src/ |
| Tcl/Tk current stable | 9.0.4 (9.1b0 = beta, not production); legacy 8.6.18 | https://www.tcl-lang.org/software/tcltk/download.html ; .../8.6.html |
| Lua current 5.4 maint. | 5.4.8, released 2025-06-04; Lua 5.5.0 released 2025-12-22; LuaJIT stays 5.1-compatible | https://www.lua.org/versions.html |
| CWE-78 title | "Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')" | https://cwe.mitre.org/data/definitions/78.html |
| CWE-94 title | "Improper Control of Generation of Code ('Code Injection')" | https://cwe.mitre.org/data/definitions/94.html |

Verification method: live `curl` of each official domain at edit time; version tokens
and dates were read directly from the gnu.org/cpan.org/tcl-lang.org/lua.org listings
and the endoflife.date API, CWE titles from the MITRE definition pages. No version,
date, or CWE identifier was invented.

### Decisions
- **Injection CWE mapping (per plan):** Bash/Perl → CWE-78 (OS command injection is
  the dominant class — both shell out); Tcl/Lua → CWE-94 (code injection via
  `eval`/`subst` and `load`/`loadstring` re-parsing strings as code) AND CWE-78 named
  for the `exec`/`os.execute`/`io.popen` shell-out path. Both CWEs named where both
  apply, so the guide reflects the real footgun surface rather than a single label.
- **Bash 5.3 chosen over "5.x" hand-wave:** the guide names the concrete 5.3 release
  (2025-07-30) with its source, and flags the macOS 3.2 divergence — the single most
  common real-world Bash portability footgun — because a dated concrete version was
  verifiable. No niche 5.3 feature was claimed beyond what the gnu.org listing/NEWS
  supports; `${ ...; }` reflexive command substitution is documented in Bash 5.3 NEWS.
- **Tcl 9.1b0 explicitly labeled beta / not-for-production** rather than presented as
  current stable, because the download page marks it `b0` (beta). Current stable
  named as 9.0.4.
- **Lua 5.5.0 named as newest major but 5.4.8 kept as the working baseline** in the
  version section, because 5.4 is the deployed mainstream (LuaJIT still tracks 5.1);
  both dated and sourced to lua.org/versions.html. No omitted claims — every version
  and CWE assertion had a dated authoritative source, so nothing was dropped for
  lack of a source.
- **Single-language idiomatic examples only** (CU4c carve-out): each guide's fenced
  examples are in its own language; no cross-language 7-language BAD/SAFE matrix added.
- **No-churn honored:** all four files are additive (git numstat: 0 lines removed on
  each); the existing 5 template sections — including bash's existing injection/quoting
  bullets — are preserved verbatim, new sections appended after `## Version Gotchas`.
