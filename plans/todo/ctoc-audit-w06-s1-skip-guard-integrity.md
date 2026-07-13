---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.368Z
gate_crossed: implementation → todo
---

---
title: "W06-s1 — Skip-guard integrity: an absent module FAILS, never skips"
type: feature
parent_plan: "ctoc-audit-w06-truthful-tests"
depends_on: none
files:
  - tests/skip-guard-integrity.test.js
  - tests/add-exploration-template.test.js
  - tests/consensus-resolver.test.js
  - tests/deep-explorer.test.js
  - tests/governance-modules-b.test.js
  - tests/lib-utils-batch.test.js
  - tests/plan-index-embedding.test.js
  - tests/review-reporter.test.js
  - tests/strategic-classifier.test.js
priority: HIGH
---

# W06-s1 — Skip-guard integrity: an absent module FAILS, never skips

**Stories:** S1 `[MVP]`, S2 — findings **A2**.
**Pairing:** SELF-PAIRED. W06 owns both the guard test AND the conversions; this slice
goes GREEN within itself. (Unlike the sibling-paired slices s3–s7, no other workstream
is involved.)

## Implementation Details

### Architecture Decision

The `try { mod = require(...) } catch { mod = null }` + per-test `if (!mod) { t.skip(); return; }`
idiom converts a resolution failure (deleted / renamed / never-built module) into
`pass 0 / fail 0 / skip 1`, which is green under the `# fail 0` gate. The fix is to
**hoist the `require()` to a hard top-level call** so an unresolvable module throws at
load time and the whole file reports a failure, and to **delete every null-guard skip**.
A new guard test (`tests/skip-guard-integrity.test.js`) then makes the anti-pattern
impossible to reintroduce: it scans the test tree and fails when any file swallows a
`require()` failure into a nulled binding.

Detector precision: the guard keys on the **mechanism** — a `catch` block that assigns a
`require`d binding to `null`/`undefined` — not on the presence of `.skip(` (legitimate
platform-gated skips, if any are ever added, must remain possible). This keys exactly on
the 8 confirmed carriers.

### Re-scan result (authoritative, supersedes the audit's "55")

The audit's "55 sites" counted per-test `t.skip` guards. A 2026-07-13 re-scan finds the
`try{require}catch{null}` mechanism in **8 files**, carrying **62** `.skip(` guard
occurrences:

| # | File | mechanism |
|---|------|-----------|
| 1 | `tests/add-exploration-template.test.js` | try-require-catch-null + `t.skip` |
| 2 | `tests/consensus-resolver.test.js` | try-require-catch-null + `t.skip` |
| 3 | `tests/deep-explorer.test.js` | try-require-catch-null + `t.skip` |
| 4 | `tests/governance-modules-b.test.js` | try-require-catch-null + `t.skip` |
| 5 | `tests/lib-utils-batch.test.js` | try-require-catch-null + `t.skip` |
| 6 | `tests/plan-index-embedding.test.js` | try-require-catch-null + `t.skip` |
| 7 | `tests/review-reporter.test.js` | try-require-catch-null + `t.skip` |
| 8 | `tests/strategic-classifier.test.js` | try-require-catch-null + `t.skip` |

All 8 modules under test currently resolve, so **no skip fires on today's healthy tree**
— which is exactly why this defect is invisible: it only fires the day a module vanishes.

### Dependency Graph

```
tests/skip-guard-integrity.test.js  --scans-->  tests/*.test.js (read-only glob)
  (no src/ dependency; pure static scan of the test corpus)
8 converted files  --hard-require-->  their own src/lib/*.js targets (unchanged modules)
```

No cross-slice file coupling. Independent of s2–s7.

### File Specifications

#### `tests/skip-guard-integrity.test.js` (CREATE — the invariant)
- Reads every `tests/*.test.js` via `fs.readdirSync(__dirname)` (exclude self).
- For each file, flags the anti-pattern when a `catch (…) { … }` block body assigns a
  binding that a `try { … }` block populated via `require(` to `null` or `undefined`.
  Concretely: the file contains a `try` block whose body matches `\brequire\(` AND a
  following `catch` block whose body matches `=\s*(null|undefined)\s*;?`.
- **Asserts the flagged set is empty.** Failure message lists each offending file so the
  maintainer sees exactly which corner still hides a deletion.
- Single `describe('skip-guard integrity', …)` with one `it('no test swallows a require()
  failure into a nulled binding', …)`; hard `require('node:test')`/`require('node:assert')`
  at top (no guard on its own deps).

#### The 8 conversions (MODIFY — the self-paired fix)
For each file:
- **Hoist** the module `require()` to a top-level `const mod = require('../src/lib/<x>.js');`
  (hard require; delete the `try/catch` and the `let mod;` + `beforeEach` re-require dance,
  keeping any legitimate `delete require.cache[...]` only where a test genuinely needs a
  fresh module instance — if so, re-require hard inside, still no catch).
- **Delete** every `if (!mod) { t.skip('…'); return; }` block (the 62 guard sites).
- Leave all real assertions untouched. Net behavior on a healthy tree: identical pass
  count, zero skips. Net behavior if the module is later deleted: the file throws at load
  and reports failure (the whole point).

### Test Plan

- **The guard test IS the Step-8 deliverable.** RED-now evidence: run
  `node --test tests/skip-guard-integrity.test.js` on today's tree → **FAILS**, listing
  the 8 files.
- **Aggregate conversion verification (paired-fix proof, throwaway only):** after
  conversion, in an uncommitted throwaway state, rename one sampled converted module
  (e.g. `src/lib/consensus-resolver.js`) and confirm its test file now reports a
  **failure**, not a skip. Restore. Rotate the sample across the 8. Never commit the
  rename.
- Framework: `node:test` (`describe`/`it`/`assert`).

### Security Review
- [x] Path traversal: scan is confined to `__dirname` (`tests/`); no user input.
- [x] Safe file ops: read-only scan; conversions edit only the 9 whitelisted files.
- [x] No secrets; no `execSync`; no network.
- [x] Error messages name file paths inside the repo only (no sensitive leakage).

## Execution Plan

### Step 8: TEST
Write `tests/skip-guard-integrity.test.js` as specified. Run it against today's tree and
**capture the RED output** (must list the 8 files). This RED state is the acceptance
evidence for S1/S2 — the guard proves it catches the currently-present anti-pattern.

### Step 9: PREPARE
Confirm the 8 target files and their `require()` targets resolve on disk (they do as of
2026-07-13). If the Step-8 scan flags any file **beyond** the listed 8, add it to this
slice's `files:` frontmatter (plans/*.md is enforcement-whitelisted) before converting it
— the re-scan is authoritative over the baseline list.

### Step 10: IMPLEMENT
One step, file sub-items — the self-paired fix:
- [ ] `tests/add-exploration-template.test.js` — hoist hard require, delete null-guard skips
- [ ] `tests/consensus-resolver.test.js` — hoist hard require, delete null-guard skips
- [ ] `tests/deep-explorer.test.js` — hoist hard require, delete null-guard skips
- [ ] `tests/governance-modules-b.test.js` — hoist hard require, delete null-guard skips
- [ ] `tests/lib-utils-batch.test.js` — hoist hard require, delete null-guard skips
- [ ] `tests/plan-index-embedding.test.js` — hoist hard require, delete null-guard skips
- [ ] `tests/review-reporter.test.js` — hoist hard require, delete null-guard skips
- [ ] `tests/strategic-classifier.test.js` — hoist hard require, delete null-guard skips

### Step 11: REVIEW
Verify no real assertion was dropped during conversion (diff each file: only the
try/catch scaffolding and `if (!mod)` guards should disappear; assertion bodies
unchanged). Confirm no file still contains a `catch` that nullifies a required binding.

### Step 12: OPTIMIZE
Ensure the guard's per-file scan is a single read + two regex tests (no re-reading). No
premature abstraction — one self-contained detector function in the test file.

### Step 13: SECURE
Confirm the scan cannot be tricked into passing by a commented-out pattern giving a
false negative that hides a live one; the detector matches source text, which is the
conservative (fail-louder) direction. No path outside `tests/` is read or written.

### Step 14: VERIFY
`node --test tests/skip-guard-integrity.test.js` → **GREEN** (0 files flagged after
conversion). Full-suite `node --test tests/*.test.js` → `# fail 0`, `# skipped 0`, same
pass total as before conversion (no test lost). Run the throwaway rename-a-sample check
and confirm FAIL-not-skip; restore.

### Step 15: DOCUMENT
Add a one-line header comment in `tests/skip-guard-integrity.test.js` naming finding A2
and the paired story. No external docs.

### Step 16: FINAL-REVIEW
Confirm: guard RED-before / GREEN-after captured; 8 files converted; 62 guard sites gone;
0 skips introduced; suite green. Ready for Gate 2 (batched with the W06 siblings via
`approveSubplans('ctoc-audit-w06-truthful-tests', 'implementation')` — human decision).

## Decisions Taken Under Ambiguity
- **Detector keys on the catch-nullify mechanism, not on `.skip(`.** Keeps legitimate
  platform-gated skips possible while catching every module-absence swallow. If a future
  legitimate `t.skip` is ever needed, it will not trip this guard because it will not
  nullify a required binding.
- **8 files, not 55.** The re-scan is authoritative per the parent's own instruction;
  the count drift does not change behavior (absence must fail, not skip). Documented above
  so review can confirm the mechanism, not the number.


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
