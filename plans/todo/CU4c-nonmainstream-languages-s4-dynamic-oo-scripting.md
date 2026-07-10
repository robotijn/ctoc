---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.060Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s4 — dynamic-OO scripting guides (ruby, php, groovy, coffeescript)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/ruby.md
  - skills/languages/php.md
  - skills/languages/groovy.md
  - skills/languages/coffeescript.md
  - tests/cu4c-dynamic-oo-scripting-guides.test.js
---

# CU4c s4 — dynamic-OO scripting guides (ruby · php · groovy · coffeescript)

> Slice 4 of the CU4c decomposition. De-stub the four **dynamic object-oriented web/app
> scripting** language guides from the 5-section template floor (confirmed fresh
> 2026-07-09: each has exactly the 5 template sections) into substantive correction
> surfaces, in ONE coherent research pass. Shared research spine: dynamic dispatch +
> metaprogramming, web-framework attack surface (deserialization CWE-502, injection),
> and JIT/runtime evolution. **ruby.md is a headline exemplar of CU4c** (YJIT, Ractors,
> Ruby 3.4+). Adds the content-contract test that reads the REAL guide files off disk
> with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every Ruby/PHP/Groovy/CoffeeScript version, CWE identifier, tool version, date, and
> best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch of
> ruby-lang.org / php.net / groovy-lang.org / coffeescript.org / cwe.mitre.org /
> owasp.org) and carry an inline dated source ≥ 2025-01-01 — never invented (hard user
> rule). If no dated authoritative source exists for a claim, **OMIT it** and note the
> absence in the audit findings. The content-contract test READS the real files off
> disk — no mocks, no fakes.

Maps to CU4c acceptance criteria: **"ruby.md covers YJIT, Ractors, and Ruby 3.4+
specifics"**, **"upgraded guides meet the CU2 depth standard"**, **"CVE/CWE classes named
for applicable languages (deserialization CWE-502 for JVM Groovy; injection for scripting
langs)"**, and **"no audited-SOLID guide is rewritten (no-churn)"** — for these four files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Examples in each guide's OWN language, idiomatic +
current. Bar = depth-within-language, objectively gated: every required `## ` section
names a concrete identifier; every version/security claim carries a dated source ≥
2025-01-01.

**No-churn (extend, never overwrite):** all four have exactly 5 `## ` sections today
(confirmed fresh 2026-07-09); existing 5 preserved verbatim, new sections ADDED below.
**CoffeeScript special case:** it is a legacy/declining transpiled language — the honest
correction surface includes a **deprecation/legacy** framing (recommend TypeScript/modern
JS for new code) rather than pretending active momentum; still meets the depth bar with
real transpilation/interop footguns + a dated source.

Grouping rationale: ONE research pass because all four are dynamic-OO scripting with
web-framework lineage — Ruby (Rails, YJIT/Ractors), PHP (Laravel/WordPress attack surface,
deserialization), Groovy (JVM dynamic + **deserialization CWE-502**, Jenkins/Gradle DSL),
CoffeeScript (transpiles to JS, ecosystem footguns). Disjoint from the Unix-scripting
slice (s3: bash/perl/tcl/lua) by file and research spine.

### Dependency Graph

```
skills/languages/ruby.md          (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-dynamic-oo-scripting-guides.test.js
skills/languages/php.md           (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-dynamic-oo-scripting-guides.test.js
skills/languages/groovy.md        (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-dynamic-oo-scripting-guides.test.js
skills/languages/coffeescript.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-dynamic-oo-scripting-guides.test.js
```

Four disjoint content files + one test. No cycle. `depends_on: none` (parallel-safe;
Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/security claims; extend the existing `Version Gotchas` section):

#### File: `skills/languages/ruby.md`
**Action:** MODIFY (extend 5→>5; no-churn) — HEADLINE CU4c file
**Purpose:** Trigger-loaded correction surface for Ruby edits.
- **Concurrency Footguns** — the GVL (threads don't run Ruby in parallel), **Ractors**
  and their current limitations (only share immutable/frozen objects across Ractors;
  many stdlib parts not Ractor-safe), `Thread`/`Mutex`, fiber scheduler. Name Ractor, GVL.
- **Error Handling Idioms** — bare `rescue` = rescues `StandardError` (not `Exception`),
  `rescue => e` + `raise`, `ensure`, avoiding rescuing `Exception` (swallows
  `SignalException`). Name `rescue StandardError`.
- **Security and Dependency Gotchas** — `Marshal.load`/`YAML.load` on untrusted input =
  **deserialization CWE-502** (use `YAML.safe_load`; link cwe.mitre.org/definitions/502.html),
  `bundler-audit`/`bundle audit`, `Gemfile.lock` pinning, mass-assignment. Name CWE-502,
  `YAML.safe_load`.
- **Testing Conventions** — RSpec / Minitest, factory patterns, `simplecov` coverage;
  **N+1 query detection** in ActiveRecord (`bullet` gem, `includes`). Name RSpec, bullet.
- **Performance Traps** — **YJIT footguns** (YJIT disengages on some patterns; profile
  effectiveness with `RubyVM::YJIT.runtime_stats`), object allocation churn, string
  freezing (`# frozen_string_literal: true`), N+1 queries. Name YJIT.
- **Version-Specific Gotchas** — EXTEND: **Ruby 3.4+** behavior changes (frozen
  string-literal warnings direction, `it` block param, Prism parser default), YJIT
  maturity, Bundler compatibility; dated ≥ 2025-01-01, sourced to ruby-lang.org. Name
  "Ruby 3.4".
- **References** — dated source list.

#### File: `skills/languages/php.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for PHP edits.
- **Concurrency Footguns** — shared-nothing request model, Fibers (8.1+) cooperative not
  parallel, no threads in mainstream FPM; `pcntl_fork` CLI-only. Name Fiber.
- **Error Handling Idioms** — `Throwable` (`Error` vs `Exception`), `try`/`catch`/`finally`,
  `declare(strict_types=1)`, avoiding `@` error suppression. Name `Throwable`,
  `strict_types`.
- **Security and Dependency Gotchas** — **`unserialize()` on untrusted input =
  deserialization CWE-502** (POP-chain RCE; link cwe.mitre.org/definitions/502.html),
  **SQL injection CWE-89** (use PDO prepared statements), `composer audit`, `composer.lock`
  pinning. Name CWE-502, CWE-89, PDO prepared statements.
- **Testing Conventions** — PHPUnit, Pest, data providers, coverage via Xdebug/PCOV.
  Name PHPUnit.
- **Performance Traps** — OPcache (must be enabled in prod), array copy-on-write pitfalls,
  N+1 in ORMs (Eloquent/Doctrine), autoloader misconfiguration. Name OPcache.
- **Version-Specific Gotchas** — EXTEND: current PHP 8.x line (readonly properties, enums,
  `#[Attribute]`, typed constants), deprecations; dated ≥ 2025-01-01, sourced to php.net.
- **References** — dated source list.

#### File: `skills/languages/groovy.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Groovy edits.
- **Concurrency Footguns** — runs on the JVM (`java.util.concurrent`), GPars/`@Async`,
  shared mutable state, dynamic dispatch cost under contention. Name `@Async` / GPars.
- **Error Handling Idioms** — `try`/`catch`/`finally`, `@CompileStatic` to surface type
  errors at compile time, checked-exception erosion (Groovy unchecks). Name `@CompileStatic`.
- **Security and Dependency Gotchas** — dynamic `Eval`/`GroovyShell` on untrusted input =
  **code injection CWE-94**, JVM **deserialization CWE-502** (link
  cwe.mitre.org/definitions/502.html), Jenkins-pipeline sandbox escapes as a documented
  class; Gradle/Maven dep pinning + `dependencyCheck`. Name CWE-94, CWE-502, GroovyShell.
- **Testing Conventions** — **Spock** framework (given/when/then), JUnit interop, JaCoCo
  coverage. Name Spock.
- **Performance Traps** — dynamic dispatch overhead vs `@CompileStatic`, metaclass
  mutation cost, closure allocation, GString vs String. Name `@CompileStatic`.
- **Version-Specific Gotchas** — EXTEND: Groovy 4.x (moved to `org.apache.groovy`
  coordinates) vs 3.x, dated ≥ 2025-01-01, sourced to groovy-lang.org / groovy.apache.org.
- **References** — dated source list.

#### File: `skills/languages/coffeescript.md`
**Action:** MODIFY (extend 5→>5; no-churn) — LEGACY/DECLINING framing
**Purpose:** Trigger-loaded correction surface for CoffeeScript edits.
- **Legacy Status / Migration** — CoffeeScript is legacy; modern JS/TS subsumed its
  features (arrow fns, classes, destructuring, `async`/`await`). For NEW code recommend
  TypeScript; this guide corrects edits to EXISTING CoffeeScript. Dated source on status.
- **Async Footguns** — no native `async`/`await` in classic CoffeeScript (transpiles to
  callbacks/Promises depending on target), implicit return capturing a Promise, callback
  nesting. Name implicit-return trap.
- **Error Handling Idioms** — `try`/`catch` transpiles to JS semantics; implicit returns
  from `catch`; existential operator `?.`/`?=` masking undefined. Name existential `?.`.
- **Security and Dependency Gotchas** — transpiled output inherits JS supply-chain risk
  (`npm audit`), `eval`-equiv backtick JS passthrough = **code injection CWE-94**, source
  maps leaking source. Name CWE-94, backtick passthrough.
- **Testing Conventions** — Mocha/Jasmine against transpiled JS, `coffee -c` build step,
  nyc coverage on output. Name Mocha.
- **Performance Traps** — whitespace-significant syntax hiding transpilation cost, implicit
  returns building unused arrays (comprehensions return arrays), runtime helpers injected.
- **Version-Specific Gotchas** — EXTEND: CoffeeScript 2.x targets ES2015+ output vs 1.x,
  low maintenance cadence; dated ≥ 2025-01-01, sourced to coffeescript.org.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-dynamic-oo-scripting-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL four guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — ruby, php, groovy, coffeescript):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — Concurrency/Async/Legacy, Error Handling,
   Security/Dependency, Testing, Performance, Version-specific, References (regexes).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Per-language concrete identifiers** — ruby: `YJIT` + `Ractor` + `Ruby 3.4` +
   `CWE-502`; php: `CWE-502` + `CWE-89` + `OPcache`; groovy: `CWE-502` + `Spock`;
   coffeescript: `CWE-94` + a legacy/TypeScript-migration token.

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to four Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (ruby-lang.org, php.net, groovy-lang.org,
  groovy.apache.org, coffeescript.org, cwe.mitre.org, owasp.org) — no secrets.
- Only the five enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all four guides fresh off disk first. Create `tests/cu4c-dynamic-oo-scripting-guides.test.js`
reading the four REAL files; run it — MUST be RED now (each has exactly 5 `## ` sections,
no dedicated Concurrency/Security/Testing sections, no CWE tokens, no dated sources,
ruby.md has no YJIT/Ractor content).

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): Ruby 3.4+
(YJIT, Ractors, Prism) via ruby-lang.org; current PHP 8.x via php.net; Groovy 4.x via
groovy-lang.org/groovy.apache.org; CoffeeScript 2.x status via coffeescript.org; CWE-502,
CWE-89, CWE-94 pages (cwe.mitre.org). Capture each source URL + retrieval date
(≥ 2025-01-01). Omit any niche claim with no dated source; record for Step 15.

### Step 10: IMPLEMENT
Extend the four guides with the added sections (real footguns, idiomatic per-language
examples, dated sources; CoffeeScript keeps its legacy/migration framing). Additive only —
existing 5 sections stay verbatim. ONE step, four files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; ruby.md names YJIT + Ractor + Ruby 3.4 + CWE-502; every version/security claim
carries an inline dated source ≥ 2025-01-01; diff additive.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the five enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes ruby/php/groovy/coffeescript triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s4"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the five enumerated files edited; ruby.md's YJIT/Ractor/3.4 claims all
sourced with a date ≥ 2025-01-01; nothing fabricated; CoffeeScript's legacy framing is
honest + sourced; no cross-language BAD/SAFE examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale Ruby/PHP/Groovy version gives false confidence | Web-verify current stable + Ruby 3.4 facts at edit time; inline dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/CVE (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| CoffeeScript over-stated as active | Honest legacy/migration framing sourced to coffeescript.org; recommend TypeScript for new code | Step 10, Step 16 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts YJIT/Ractor/CWE tokens + concrete identifiers, not just section count | Step 11, Step 14 |
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
