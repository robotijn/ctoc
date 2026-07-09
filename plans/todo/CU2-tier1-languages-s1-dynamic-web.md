---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T14:24:27.854Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.367Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU2 s1 — dynamic/web language guides (python, javascript, typescript)"
type: implementation
parent_plan: CU2-tier1-languages
depends_on: none
priority: HIGH
risk_level: LOW
files:
  - skills/languages/python.md
  - skills/languages/javascript.md
  - skills/languages/typescript.md
  - tests/cu2-dynamic-web-guides.test.js
---

# CU2 s1 — dynamic/web language guides (python · javascript · typescript)

> Slice 1 of the CU2 decomposition. De-stub the three dynamic/web-ecosystem
> language guides from the 5-section template floor into substantive correction
> surfaces, in ONE coherent research pass (the asyncio ↔ event-loop ↔ type-system
> footguns and the PyPI/npm supply-chain concerns overlap, so they are researched
> and written together). Adds the content-contract test that reads the REAL guide
> files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every version number, CWE identifier, date, and best-practice claim in these
> three guides MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch of the
> official docs / CVE databases) and carry an inline dated source ≥ 2025-01-01 —
> never invented (hard user rule). The content-contract test READS the real files
> off disk and asserts substantive structure — no mocks, no stubs, no fakes.

Maps to CU2 acceptance criteria: **"each guide exceeds the 5-section floor with
substantive depth"**, **"python.md covers GIL, asyncio, and 3.12+ specifics"**,
**"javascript.md and typescript.md cover async, type, and ecosystem pitfalls"**,
**"all version-specific and security claims carry dated sources"**, and
**"tests stay green and skills.json mappings remain valid"** — for these three
files.

## Implementation Details

### Architecture Decision

These are single-language reference guides, so the **7-language BAD/SAFE
cross-coverage rule does NOT apply** (explicit CU2 vision carve-out): each guide's
examples are in ITS OWN language, correct + idiomatic + current-version. The bar
is **depth-within-language**, gated objectively: every required `## ` section must
name at least one technology-specific identifier (version number, CWE ID, or
concrete API/function name), and every version-specific or security claim must
carry an inline dated source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the three files today has exactly
5 solid `## ` sections (Critical Corrections, Current Tooling, Patterns Claude
Should Use, Anti-Patterns Claude Generates, Version Gotchas — confirmed by reading
the files fresh 2026-07-09). Those sections are preserved verbatim; new sections
are ADDED. Do not delete a healthy sentence.

Grouping rationale: python + javascript + typescript form one research pass because
(a) the async/concurrency footgun families are ecosystem-adjacent (Python asyncio,
JS event loop, TS over the same JS runtime); (b) supply-chain security is the same
class of concern (PyPI vs npm typosquatting / audit tooling); (c) TS is a superset
layer over the JS guide, so they must be written coherently to avoid contradiction.

### Dependency Graph

```
skills/languages/python.md      (MODIFY: extend 5→>5 sections)  <--tested-by-- tests/cu2-dynamic-web-guides.test.js
skills/languages/javascript.md  (MODIFY: extend 5→>5 sections)  <--tested-by-- tests/cu2-dynamic-web-guides.test.js
skills/languages/typescript.md  (MODIFY: extend 5→>5 sections)  <--tested-by-- tests/cu2-dynamic-web-guides.test.js
```

Three disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (independent of s2/s3/s4 — different files, parallel-safe per the
CU2 constraint block).

### File Specifications

#### File: `skills/languages/python.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Python edits — surface real
concurrency, error-handling, security, testing, performance, and version footguns.
**Change Type:** substantive content addition

Add these `## ` sections (each MUST name a concrete identifier + carry a dated
source ≥ 2025-01-01 for every version/security claim):
- **Concurrency / Async Footguns** — GIL implications for CPU-bound threading
  (name the free-threaded build `python3.13t`/`3.14t` and its status);
  `asyncio.gather` exception swallowing (`return_exceptions=True` trap), missing
  `await`, task cancellation / `asyncio.TaskGroup`, `time.sleep` in async code.
- **Error Handling Idioms** — bare `except:` / broad `except Exception:`,
  exception chaining (`raise ... from`), `contextlib.suppress`, `ExceptionGroup`
  / `except*` (name the version that introduced it).
- **Security and Dependency Gotchas** — PyPI supply-chain (typosquatting,
  dependency confusion), hash-pinning (`uv.lock` / `pip install --require-hashes`),
  `pickle` deserialization risk (name the CWE class), `subprocess` shell=True
  injection, `yaml.safe_load` vs `yaml.load`. Name at least one CWE identifier.
- **Testing Conventions** — pytest idioms, fixture scoping (`scope=`), parametrize,
  `pytest-cov` gate.
- **Performance Traps** — accidental O(n²) list membership, `functools.lru_cache`,
  generator vs list materialization, GIL vs multiprocessing for CPU-bound.
- **Version-Specific Gotchas** — extend the existing Version Gotchas with dated,
  sourced 3.12+ items (removed deprecated APIs, PEP 695 type params, f-string
  parser rewrite). Each dated ≥ 2025-01-01.
- **References** (or per-claim inline sources) — dated source list.

#### File: `skills/languages/javascript.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for JavaScript edits.
**Change Type:** substantive content addition

Add sections covering: event-loop misconceptions (macro/microtask ordering,
`queueMicrotask`); Promise rejection handling (unhandledRejection, floating
promises, `Promise.all` fail-fast vs `allSettled`); **prototype pollution** (name
the CWE class — CWE-1321 — with an authoritative source); `npm audit` / supply-chain
(typosquatting, install scripts, `--ignore-scripts`); Node.js vs browser runtime
divergence; testing (`node --test` / vitest); performance traps; and current LTS
gotchas — **name the specific active Node.js LTS version verified at edit time**
with a dated nodejs.org/releases source ≥ 2025-01-01.

#### File: `skills/languages/typescript.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for TypeScript edits.
**Change Type:** substantive content addition

Add sections covering: `strict` mode trade-offs (which flags `strict` implies);
`any` escape-hatch risk vs `unknown` + narrowing; module resolution edge cases
(ESM vs CJS interop, `moduleResolution: "bundler"`, `.js` import extensions);
declaration-file (`.d.ts`) pitfalls; testing/type-testing (`tsd`, `expect-type`);
performance (project references, `--incremental`); and **TypeScript 5.x-specific
changes — name the specific 5.x version(s) verified at edit time** (the current
released 5.x line) with a dated typescriptlang.org / release-notes source ≥
2025-01-01. Keep coherent with the JS guide (no contradiction).

### Test Plan

#### Tests: `tests/cu2-dynamic-web-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL guide files off disk via `fs.readFileSync`
(mirroring `tests/skill-regulatory-citations.test.js`). No mocks, no fixtures, no
fakes — it asserts the actual on-disk guide content.

Content-contract test cases (per file — python, javascript, typescript):
1. **Exceeds the floor** — file has **more than 5** `## ` sections
   (`(md.match(/^## /gm) || []).length > 5`).
2. **Required sections present** — headings matching Concurrency/Async,
   Error Handling, Security/Dependency, Testing, Performance, Version-specific,
   References (case-insensitive heading regexes).
3. **Concrete identifiers present** — each language asserts its own known
   identifiers (e.g. python: `asyncio.gather` and a `3.1x` version; javascript:
   `prototype pollution` or `CWE-1321` and a Node LTS version token; typescript:
   `unknown` and a `5.` version token).
4. **CWE / vuln-class named** where required (js prototype pollution, python
   pickle/deserialization) — assert a `CWE-\d+` token or the named class string.
5. **Dated source present** — assert at least one date `20(2[5-9]|[3-9]\d)` (≥ 2025)
   AND at least one `http` source URL per file.
6. **Frontmatter intact** — the file still starts with a title/`# <Lang> CTO`
   header and no YAML key required by skills.json indexing was removed (assert the
   original H1 line still present).

**Coverage note:** content-grounding, not code — content-contract assertions
substitute for line/branch coverage (same convention as the CU1 s4 test).

### Security Review

- Content-only edits to three Markdown guides + one test file reading them; no
  runtime code path, no user input handling, no path traversal surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no dynamic path
  from untrusted input.
- All added source URLs are public official domains (docs.python.org, peps.python.org,
  nodejs.org, typescriptlang.org, cwe.mitre.org, npmjs.com) — no secrets.
- Only the four enumerated files are touched.

## Execution Plan

### Step 8: TEST
Confirm baseline green. Create `tests/cu2-dynamic-web-guides.test.js` reading the
three REAL files; run it — it MUST be RED now (each file has exactly 5 `## `
sections, no Concurrency/Security/Testing sections, no CWE tokens, no dated
sources), proving the checks test something real. Read all three current files
fresh off disk first.

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule — nothing
invented): retrieve current Python release status (docs.python.org / peps.python.org
for 3.12+ and free-threaded build status), current active Node.js LTS
(nodejs.org/en/about/previous-releases), current TypeScript 5.x release
(typescriptlang.org release notes / devblogs), CWE-1321 (prototype pollution) and
the Python pickle/deserialization CWE class from cwe.mitre.org. Capture each source
URL + retrieval date (≥ 2025-01-01).

### Step 10: IMPLEMENT
Extend the three guides with the added sections (real footguns, real idiomatic
per-language examples, dated sources). Additive only — the existing 5 sections stay
verbatim. ONE step, three files + the test file.

### Step 11: REVIEW
Self-review: each guide now >5 sections; every added section names a concrete
identifier; every version/security claim carries an inline dated source ≥
2025-01-01; TS guide consistent with JS guide; diff is additive on the guides.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused — no padding to hit a section count.
Each bullet earns its place by naming a specific footgun + identifier.

### Step 13: SECURE
Run the Security Review checklist. Confirm every source URL is an official public
domain; no secrets; only the four enumerated files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; the new slice test GREEN (all per-file
content-contract assertions pass). Confirm `.ctoc/skills.json` still indexes
python/javascript/typescript triggers after the edit (H1 + frontmatter intact).
`tests/readme-numbers.test.js` still passes (count unchanged — content-only edits).

### Step 15: DOCUMENT
Append per-file verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` as UPGRADED
records ({path, line_count, section_count, verdict:"UPGRADED", slice:"CU2-s1",
note:<sources + section list>}) so the CU2 completeness check has no silent
omissions. Record each web-verified fact + source URL + retrieval date in
`## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the four enumerated files edited; every version/security claim
sourced with a date ≥ 2025-01-01; nothing fabricated (every fact traceable to an
official URL); no cross-language BAD/SAFE examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale/wrong version claim gives false confidence | Web-verify current Python/Node/TS versions at edit time; inline dated source ≥ 2025-01-01 so staleness is visible | Step 9, Step 15 |
| Fabricated number/CVE/version (hard user rule) | Every fact carries an official source URL retrieved at edit time; test asserts a dated source + http URL per file | Step 9, Step 14, Step 16 |
| Frontmatter corruption breaks skills.json indexing | Additions below the H1/frontmatter; run full suite + confirm triggers after edit | Step 14 |
| Padding to exceed floor without specificity | Objective depth gate — test asserts concrete identifiers + CWE tokens, not just section count | Step 11, Step 14 |
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
