---
approved_by: human
approved_at: 2026-07-08T19:13:51.735Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T16:39:46.252Z
gate_crossed: implementation → todo
---

---
title: "EC2-s2 — add GDPR-6 & GDPR-9 to the skill's gdpr_article enum (+ enum-parity test)"
type: implementation
parent_plan: EC2-gdpr-agent-plan-and-code
depends_on: EC2-s1-gdpr-helpers
iron_loop: true
priority: HIGH
files:
  - skills/compliance/gdpr-compliance-checker/SKILL.md
  - tests/gdpr-skill-enum.test.js
status: refined
risk_level: MEDIUM
---

# EC2-s2 — SKILL.md gdpr_article enum extension (GDPR-6, GDPR-9) + parity test

Slice 2 of the EC2 decomposition. A **strictly additive** change to the skill's letter-schema
`gdpr_article` enum: add `"GDPR-6"` (lawful basis) and `"GDPR-9"` (special categories). Both are
already discussed extensively in the skill body (Article 9 special-categories block; Article 6
legal-basis references in the Article 13 SAFE example) but are absent from the enum — a gap that
would let the agent mint `GDPR-6`/`GDPR-9` codes the schema rejects (parent Current State).

Depends on **EC2-s1** because the parity test asserts the skill's enum equals
`gdpr-helpers.js` `VALID_GDPR_ARTICLES` — so s1's constant must exist first.

The skill body prose is asserted by a content test (PI4 lesson: agent-definition/skill prose is
asserted by content tests where a testable contract exists — here the contract is "the enum line
contains both new codes AND matches the JS mirror").

## Implementation Details

### Architecture Decision (ADR)

**Context:** Two authorities describe the valid GDPR article codes: the skill's letter-schema
`gdpr_article` enum (narrative/contract for the refinement-loop letter) and s1's
`VALID_GDPR_ARTICLES` (the machine mirror). They must not diverge. The skill currently omits
`GDPR-6` and `GDPR-9`.

**Decision:** Add the two codes to the skill's `gdpr_article` enum (the two lines under
"## Letter schema (refinement-loop output contract)"). Add a content test that (1) reads
SKILL.md, extracts the enum tokens, and asserts both new codes are present, and (2) asserts the
extracted enum token set equals `VALID_GDPR_ARTICLES` from s1 (parity). No other skill change.

**Consequences:** The two authorities are provably in sync from now on; any future divergence
fails the parity test. The change is additive — no existing code is removed or renamed, so
existing findings and tests keep passing (parent risk "schema extension must not break existing
tests" — mitigated by the pre-scan step below).

### Dependency Graph

```
src/lib/gdpr-helpers.js (from EC2-s1) — VALID_GDPR_ARTICLES
        │ compared-against
        ▼
skills/compliance/gdpr-compliance-checker/SKILL.md (MODIFY: enum gains GDPR-6, GDPR-9)
        │ read + asserted-by
        ▼
tests/gdpr-skill-enum.test.js (CREATE)
```

No cycle. Chain depth 1 (test → s1 constant + skill file).

### File Specifications

#### File: `skills/compliance/gdpr-compliance-checker/SKILL.md`
**Action:** MODIFY
**Purpose:** Add the two missing article codes to the letter-schema `gdpr_article` enum so the
enum is the complete authority the JS mirror parses against.
**Change Type:** additive-enum-extension

**Changes (exact, in the "## Letter schema (refinement-loop output contract)" YAML block):**
- The current two enum lines read:
  ```
  gdpr_article: "GDPR-7" | "GDPR-13" | "GDPR-14" | "GDPR-15" | "GDPR-17" | "GDPR-20"
               | "GDPR-28" | "GDPR-30" | "GDPR-33" | "GDPR-34" | "GDPR-37" | "GDPR-Chapter-V"
  ```
- **Add** `"GDPR-6"` and `"GDPR-9"` to the enumerated values. Author them so the token order is
  natural (numeric-ascending): `"GDPR-6"` before `"GDPR-7"`, `"GDPR-9"` before `"GDPR-13"`. The
  resulting block enumerates all 14 codes.
- **Do NOT** touch any other line in SKILL.md (no `kind` enum change, no body edit — the
  narrative for Art. 6 and Art. 9 already exists).

**No exports** (markdown file).

**Called By:** the skill is loaded by the refinement loop and referenced by the s3 agent; the
enum is parsed by the s2 parity test.

#### Error Handling
- N/A (documentation file). The guard is the parity test: if the edit is malformed or a code is
  mistyped, the token-set-equality assertion fails loudly.

#### Cross-Platform Notes
- Test reads SKILL.md with `fs.readFileSync(path.join(...), 'utf8')`; the enum-token regex is
  CRLF-tolerant (`\r?` where line boundaries matter, or match on the `"GDPR-…"` tokens directly
  regardless of line wrapping).

### Test Plan

#### Tests: `tests/gdpr-skill-enum.test.js`
**Action:** CREATE
**Framework:** `node:test`. Reads the real SKILL.md and the real `VALID_GDPR_ARTICLES` from
`src/lib/gdpr-helpers.js` — no fixtures, drives the real files (PI4: content asserted against
the real artifact).

**Test Cases (map parent Success Metric 2 + Scenario "GDPR-6 and GDPR-9 are valid enum values"):**
1. **Both new codes present:** extract all `"GDPR-\S+"` tokens appearing in the `gdpr_article:`
   enum block of SKILL.md; assert the set INCLUDES `"GDPR-6"` and `"GDPR-9"`.
2. **All 14 codes present:** assert the extracted enum token set equals the full expected set
   (the 12 originals + `GDPR-6` + `GDPR-9`) — no code accidentally dropped by the edit.
3. **Parity with the JS mirror (load-bearing):** require `VALID_GDPR_ARTICLES` from
   `../src/lib/gdpr-helpers`; assert the SKILL.md enum token set is DEEP-EQUAL to
   `VALID_GDPR_ARTICLES` (same members, both directions) — the two authorities cannot diverge.
4. **No regression on existing enum tokens:** assert each of the 12 original codes
   (`GDPR-7 … GDPR-Chapter-V`) is still present (the edit is additive, nothing removed).

**Coverage Targets:** this is a content/parity test (no JS branch coverage target of its own);
it exercises `VALID_GDPR_ARTICLES` from s1. Full suite must stay green.

### Security Review
- [x] Path traversal: test reads a fixed repo-relative path via `path.join`; no user input.
- [x] Input validation: enum tokens parsed with a static regex; no dynamic RegExp from untrusted
      input.
- [x] No secrets.
- [x] Safe file operations: read-only in the test; the implementation edits ONLY the one
      SKILL.md enum block.
- [x] Error messages: assertion diffs are developer-facing, no sensitive data.
- [x] Prototype pollution: n/a (string-set comparison).
- [x] Command injection: none.

### Risk Mitigation (parent risk: "schema extension must not break existing tests")
- **Pre-scan (Step 9):** grep `tests/*.test.js` for any literal assertion that the
  `gdpr_article` enum is EXACTLY a fixed 12-value list. If found, update that assertion to the
  14-value set as part of THIS slice (document in `## Decisions Taken Under Ambiguity`). The
  parent flags this as LOW-likelihood but MEDIUM-impact; the pre-scan makes it deterministic.

## Execution Plan

### Step 8: TEST
Write `tests/gdpr-skill-enum.test.js` with the 4 cases (red — SKILL.md enum lacks GDPR-6/9, so
cases 1–3 fail until the edit lands).

### Step 9: PREPARE
Confirm `VALID_GDPR_ARTICLES` exists (EC2-s1). Pre-scan `tests/*.test.js` for a fixed-list enum
assertion (parent risk mitigation); note any hit for update.

### Step 10: IMPLEMENT
Edit SKILL.md: add `"GDPR-6"` and `"GDPR-9"` to the `gdpr_article` enum block (numeric-ascending
placement). Touch nothing else. If the pre-scan found a fixed-list assertion, update it to the
14-value set.

### Step 11: REVIEW
Diff SKILL.md — confirm ONLY the enum block changed and both codes were added exactly once.
Confirm the JS mirror already contains both (s1) so parity holds.

### Step 12: OPTIMIZE
No optimization — a two-token additive edit. Do not reflow the rest of the file.

### Step 13: SECURE
Confirm the test's regex is static; confirm no other SKILL.md section was altered.

### Step 14: VERIFY
`node --test tests/gdpr-skill-enum.test.js` → `# fail 0`; then full suite
`node --test tests/*.test.js` → `# fail 0` (specifically no GDPR/skill/letter-schema test
regressed — parent risk).

### Step 15: DOCUMENT
Commit message notes the additive enum extension and the parity guarantee. No README count
change (no new module — SKILL.md edited, one new test file).

### Step 16: FINAL-REVIEW
Confirm both codes present, all 14 enumerated, parity with `VALID_GDPR_ARTICLES` proven, no
existing test regressed. Plan stays in `implementation/`. Ready for batched Gate 2.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — tests 4, pass 1, fail 3

### Step 9: PREPARE
- [x] Install dependencies if needed — none
- [x] Check prerequisites — VALID_GDPR_ARTICLES (s1) confirmed present, 14 codes
- [x] Verify dev environment ready
- [x] Create directories/config if needed — none
- [x] Pre-scan (parent risk): grep tests/*.test.js for a fixed 12-value enum assertion — NONE found; no existing test needed updating

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — added "GDPR-6" and "GDPR-9" to the gdpr_article enum (numeric-ascending), additive only
- [x] Add error handling — N/A (markdown; guard is the parity test)
- [x] Wire up integration points — enum now parity-equal to VALID_GDPR_ARTICLES

### Step 11: REVIEW
- [x] Self-review all new code — SKILL.md diff = 2 lines, enum block only; nothing else touched
- [x] Verify integration points work together — parity test GREEN
- [x] Check error handling completeness — static regex, CRLF-tolerant

### Step 12: OPTIMIZE
- [x] Remove redundant operations — none; two-token additive edit, rest of file not reflowed
- [x] Optimize critical paths — N/A
- [x] Simplify complex code — N/A

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — fixed repo-relative path via path.join, no user input
- [x] Sanitize outputs — N/A
- [x] No secrets in code
- [x] Safe file operations — test is read-only; implementation edits only the one enum block

### Step 14: VERIFY
- [x] Run lint + type check — eslint . exit 0 (0 warnings); tsc baseline-neutral (0 new errors, none reference gdpr files)
- [x] Run ALL tests (TDD Green) — full suite: tests 3200, pass 3200, fail 0
- [x] Check coverage >= 80% — content/parity test exercises s1's VALID_GDPR_ARTICLES; full suite green
- [x] 0 skipped, 0 flaky tests — skipped 0, todo 0

### Step 15: DOCUMENT
- [x] Update relevant documentation — additive enum extension noted; no README count change (no new module)
- [x] Add JSDoc comments to new functions — extractSkillEnum documented in the test
- [x] Update CHANGELOG if needed — commit note covers it

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed — both codes present, all 14 enumerated, parity proven, no regression
- [x] Ready for human review

## Decisions Taken Under Ambiguity

- **Enum wrap point:** placed the line break after `"GDPR-17"` so the first
  continuation line stays a comfortable width (7 codes on line 1, 7 on line 2).
  The plan mandated numeric-ascending token order, not a specific wrap column;
  this keeps both lines balanced. The parity test is wrap-agnostic (it joins the
  continuation block before tokenizing), so the exact break point is cosmetic.
- **Pre-scan result (parent MEDIUM-impact risk):** grepped `tests/*.test.js` for
  a fixed 12-value `gdpr_article` enum assertion. Only `tests/gdpr-helpers.test.js`
  references `gdpr_article`, and it asserts membership (`VALID_GDPR_ARTICLES.has`),
  not an exact fixed list. No existing assertion pins the enum to 12 values, so
  NO existing test required updating — the additive edit is regression-safe.
- **tsc baseline:** the repo's `tsc --noEmit` has ~100 pre-existing errors in
  unrelated `src/*` files (inbox.js, menu.js, state.js, etc.). None reference
  gdpr-helpers.js, SKILL.md, or the new test. This slice adds zero new tsc
  errors — baseline-neutral. Not this slice's job to fix the pre-existing set.
