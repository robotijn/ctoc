---
approved_by: human
approved_at: 2026-07-13T20:53:24.753Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.495Z
gate_crossed: implementation → todo
---

---
title: "W06-s6 — Documented counts self-verify against live disk counts"
type: feature
parent_plan: "ctoc-audit-w06-truthful-tests"
depends_on: none
files:
  - tests/doc-counts.test.js
priority: HIGH
---

# W06-s6 — Documented counts self-verify against live disk counts

**Story:** S7 — findings B-family (stale documented counts).
**Pairing:** SIBLING-PAIRED with the **documentation correction** that reconciles the
stale numbers. That reconciliation is a doc edit **outside W06's test-only scope**; its
nearest owner is **W09 (release & metadata truth — "the map matches the territory")**,
with **W04** (creates agents → shifts agent counts) and **vision workstream 11**
(removes dead modules → shifts module counts) also moving counted artifacts. W06 adds the
test that goes RED while any documented count lies; it does **not** edit `CLAUDE.md`.

## Implementation Details

### Architecture Decision

`CLAUDE.md` hard-codes component counts in prose. No test checks them against disk, so they
rot silently. A new `tests/doc-counts.test.js` **parses each claimed number out of the doc
at test time** and compares it to a **live count taken from disk at test time** — the
number is never hard-coded in the test (that would just relocate the drift, the same
anti-pattern as the old `release.test.js`). Both operands are computed at runtime, so the
test tracks the docs and the disk as they change.

### RED-now evidence (verified 2026-07-13)
| Documented in CLAUDE.md | Claim | Live disk | Status |
|---|---|---|---|
| test files (`tests/*.test.js`) | **109** (lines 187, 236) | **211** | **DRIFT — RED** |
| JS modules (`src/lib/*.js`) | **114** (line 230) | **123** | **DRIFT — RED** |
| Claude Code hooks (`src/hooks/*.js`) | 16 (line 229) | 16 | agrees |
| dashboard tabs (`src/tabs/*.js`) | 8 (line 232) | 8 | agrees |
| agent definitions (`agents/**` excl. `_shared`) | 124 (line 234) | 124 | agrees |
| skill files (`skills/**/*.md`) | 421 (line 235) | 421 | agrees |

At least two counts (test files, lib modules) drift today, so the test is RED now. The
test asserts **all** documented counts, so it stays a live tripwire for the four that
currently agree.

### Dependency Graph

```
tests/doc-counts.test.js
  --parses claim--> CLAUDE.md (prose numbers)
  --counts live--> tests/*.test.js, src/lib/*.js, src/hooks/*.js, src/tabs/*.js,
                   agents/** (excl _shared), skills/**/*.md
```

Self-contained (one file). Independent of s1–s5, s7.

### File Specification

#### `tests/doc-counts.test.js` (CREATE — the invariant)
- A declarative table of `{ label, claimRegex, liveCount() }` entries, one per documented
  count, e.g.:
  - `{ label: 'test files', claimRegex: /Run all (\d+) test files/, liveCount: () => glob('tests/*.test.js').length }`
  - `{ label: 'JS modules', claimRegex: /(\d+) JS modules/, liveCount: () => glob('src/lib/*.js').length }`
  - hooks, tabs, agents (excl `_shared`), skills — each with its own claim regex + live
    counter.
- `glob(pattern)` — minimal `fs.readdirSync` + suffix/dir filter (no dependency); agent
  count walks `agents/**` excluding any path segment starting with `_`.
- One `it(...)` per row: parse the claimed number from `CLAUDE.md`, compute the live count,
  assert equal; failure message prints **documented vs live side by side**
  (`test files: documented 109, live 211`).
- Hard `require('node:test')`/`require('node:assert')`; no module-under-test require.

### Test Plan
RED-now: `node --test tests/doc-counts.test.js` on today's tree → FAILS on `test files`
(109 vs 211) and `JS modules` (114 vs 123), printing both operands. GREEN-after: once the
documented counts are corrected to match disk (owning workstream per the pairing note),
the run passes; because both operands are computed at runtime, it also stays green as the
corrected docs and disk evolve together.

### Security Review
- [x] Read-only over docs + component dirs; no writes; no network; no `execSync`.
- [x] Path traversal: fixed project-root-relative globs; no user input.
- [x] Failure messages contain integers and labels only.

## Execution Plan

### Step 8: TEST
Write `tests/doc-counts.test.js` as specified. Run on today's tree and **capture the RED
output** showing `test files 109≠211` and `JS modules 114≠123` with both operands printed.
This RED is the acceptance evidence for S7. Log the pairing: "GREEN when the documented
counts are corrected (doc edit owned by W09 / W04 / workstream 11, not W06)."

### Step 9: PREPARE
Confirm the claim regexes match the current `CLAUDE.md` phrasing (verified line numbers
187/229/230/232/234/235/236). Confirm the live-count globs match how each component is
laid out (agents exclude `_shared`; skills are `**/*.md`).

### Step 10: IMPLEMENT
One step, one file:
- [x] `tests/doc-counts.test.js` — the `{label, claimRegex, liveCount}` table, `glob()`,
  and one `it(...)` per documented count with side-by-side failure output.

### Step 11: REVIEW
Verify no count is hard-coded in the test (both operands runtime-computed). Verify the
agent counter excludes `_shared` prose (else it would read 128, not 124) and the skill
counter matches the documented definition of "skill files."

### Step 12: OPTIMIZE
Read `CLAUDE.md` once; reuse across rows. Each live counter reads its directory once.

### Step 13: SECURE
Confirm globs cannot escape the repo (no `..` in patterns). No file content is executed.

### Step 14: VERIFY
Today's tree: RED on the two drifting counts with both operands printed (expected; paired
fix is a doc correction). The four agreeing counts pass. No other test regresses. Record
the RED output as the paired-fix witness.

### Step 15: DOCUMENT
Header comment naming the finding, the pairing note (doc correction owned outside W06),
and that both operands are computed at runtime by design (never hard-code a count).

### Step 16: FINAL-REVIEW
Confirm: every documented count asserted; RED captured with side-by-side operands; no
hard-coded expectations; pairing documented. Ready for the batched Gate 2.

## Decisions Taken Under Ambiguity
- **Pairing owner named, not assigned by W06.** The functional plan does not pin a single
  sibling for the doc reconciliation; per the "he alone schedules" principle this plan
  **names** the candidate owners (W09 primary; W04 and workstream 11 also move counts) and
  leaves the scheduling to the maintainer. W06 ships only the RED tripwire.
- **Both operands computed at runtime.** Hard-coding "211" would reproduce the
  `release.test.js` duplicate-literal defect this whole workstream exists to kill.
- **Agent count excludes `_shared/`.** `agents/**` holds 128 files but 4 are `_shared`
  prose fragments, not agents; the documented 124 counts real agents, so the live counter
  must exclude `_shared` to compare like with like.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
