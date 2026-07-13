---
title: "W03-s2 — Anchor the architecture-invariants frontmatter parser to byte 0"
type: feature
parent_plan: "ctoc-audit-w03-agent-contracts-load"
depends_on: ctoc-audit-w03-s1-frontmatter-byte0
priority: HIGH
files:
  - tests/architecture-invariants.test.js
---

# W03-s2 — Anchor the architecture-invariants frontmatter parser to byte 0

**SIP1 slice of** `ctoc-audit-w03-agent-contracts-load` (Story B / Finding C7).
**Scope:** replace the lenient `readFM` in `tests/architecture-invariants.test.js` (which
matches `---` anywhere in the file — the false-green that certifies the C6 defect as
correct) with a byte-0-anchored parser that parses exactly as the runtime does, and add
synthetic-fixture tests proving the anchoring. One file.

**Why this depends on s1:** `architecture-invariants.test.js` runs its (soon-to-be-
anchored) parser against the **real** agent tree — the Tier-0 cto-chief checks
(lines ~73–96), the Tier-1 checks (lines ~134–149), and the Tier-3 scout `model: haiku`
checks (lines ~250–270). Anchoring the parser *while the 19 files are still heading-first*
would make those real-file assertions go RED and stay red until s1 lands — a slice may
never end with the suite red. Ordering after s1 (files already at byte 0) makes anchoring
safe: the anchored parser finds the byte-0 frontmatter and every real-file assertion stays
green. (The parent plan's "anchored parser goes red on the *current* pre-fix tree"
scenario is proven here by a **synthetic fixture**, which is ordering-robust, rather than
against the real tree — exactly as the parent Test Strategy anticipates.)

## Decisions Taken Under Ambiguity

- **Keep the `\n` newline literal; do NOT switch to `\r?\n`.** CRLF-safe frontmatter
  parsing is a distinct workstream (vision workstream 7 / W07); adding it here would be
  cross-workstream scope creep. Story B is strictly "drop the `m` flag and the match-
  anywhere fallback." The regex stays `/^---\n([\s\S]*?)\n---/`.
- **Extract a pure `parseFrontmatter(content)` helper** so the anchoring is unit-testable
  with in-memory fixtures (no temp files, no doubles). `readFM(path)` becomes a thin
  wrapper that reads the file and delegates. This is the minimal refactor that makes the
  parser directly assertable.
- **Two other identical lenient parsers are NOT touched here** (`tests/cto-chief-
  toplevel.test.js:25`, `src/lib/iron-loop-enforcer.js:98`). They are separate local
  functions — anchoring this file does not break them — and after s1 they parse the real
  tree correctly. Once this slice lands, `architecture-invariants.test.js` already gives
  strict, anchored coverage of cto-chief and all scouts, so no coverage GAP remains.
  Anchoring the other two for defence-in-depth is surfaced in the parent index for the
  maintainer to schedule; it is deliberately out of this slice.

## Implementation Details

### File specification — `tests/architecture-invariants.test.js` (MODIFY)
- **Add** pure helper near the top:
  `function parseFrontmatter(content) { const m = content.match(/^---\n([\s\S]*?)\n---/); return m ? m[1] : ''; }`
  (byte-0 anchored: `^` binds to string start because there is no `m` flag; no second
  `content.match(/\n---\n.../)` fallback).
- **Change** `readFM(filePath)` to: read the file, `return { fm: parseFrontmatter(content), body: content };`
  removing the current `/^---\n([\s\S]*?)\n---/m` + match-anywhere fallback (lines ~19–20).
- **Add** a `describe('Frontmatter parser is byte-0 anchored (C7)')` block with the fixture
  tests below.

## Execution Plan

### Step 8: TEST
TDD-first — write the fixture tests that are RED against the current lenient `readFM`
before changing it:
- [ ] **Heading-first fixture is rejected**: `parseFrontmatter('# Title\n\n---\nname: x\n---\n')`
  returns `''` (empty) — it must NOT return the misplaced `name: x`. RED now: the current
  lenient parser returns `name: x` via its `m`-flag/anywhere match, so the assertion fails.
- [ ] **Byte-0 fixture is accepted**: `parseFrontmatter('---\nname: x\n---\n# Title\n')`
  returns frontmatter containing `name: x`. (Green both before and after — pins the happy
  path so anchoring doesn't over-reject.)
- [ ] Write these as real `node:test` cases asserting parser BEHAVIOUR on in-memory
  strings (no temp files). Confirm RED: `node --test tests/architecture-invariants.test.js`.

### Step 9: PREPARE
- [ ] Confirm no other in-flight edit is touching `tests/architecture-invariants.test.js`
  (parent Dependency-Risk — serialize, do not concurrent-edit).
- [ ] Confirm s1 has landed (the 19 files are at byte 0) so anchoring is safe against the
  real-file assertions in this same file.

### Step 10: IMPLEMENT
- [ ] `tests/architecture-invariants.test.js`: add `parseFrontmatter`, rewire `readFM` to
  delegate to it, and delete the `m` flag + match-anywhere fallback. Add the fixture
  `describe` block from Step 8. (Single file; the two fixture assertions turn GREEN once
  the parser is anchored.)

### Step 11: REVIEW
- [ ] Self-review: `^---` binds to byte 0 only (no `m`), no fallback remains, `readFM`'s
  return shape `{ fm, body }` is unchanged so all existing call sites are unaffected.

### Step 12: OPTIMIZE
- [ ] Confirm `parseFrontmatter` is a single small pure function reused by `readFM` — no
  duplicated regex, no dead branch left behind.

### Step 13: SECURE
- [ ] No new file/path/shell inputs. The regex is anchored and linear (`[\s\S]*?` lazy,
  bounded by the closing `---`) — no catastrophic-backtracking surface introduced.

### Step 14: VERIFY
- [ ] Run the target file green: `node --test tests/architecture-invariants.test.js`
  (fixtures pass; all real-file Tier-0/1/2/3 assertions still pass on the s1-fixed tree).
- [ ] Run the full suite: `node --test tests/*.test.js` — expect `# fail 0`. Triage any
  NEW failure per the parent risk rule: (a) same heading-first defect class → it is a
  drifted file, fix it (in scope by definition); (b) a genuinely different consumer of the
  old lenient behaviour → escalate via `markNeedsInput`, do not loosen the anchor back.

### Step 15: DOCUMENT
- [ ] Record that the invariants parser now matches the runtime (byte-0) and that a future
  heading-first regression on cto-chief or any scout now turns this suite RED.

### Step 16: FINAL-REVIEW
- [ ] Confirm the three Story-B acceptance scenarios (red-on-heading-first via fixture,
  fixture-rejected-not-partial, green-after-s1) hold, and the full suite is `# fail 0`.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Anchoring affects another consumer of the lenient behaviour | Full suite at Step 14; triage rule (fix same-class / escalate different) | Step 14 |
| Concurrent edit to this test file from another workstream | Confirm no in-flight edit at Step 9; serialize | Step 9 |
| Over-rejection (anchored parser drops a valid byte-0 file) | Byte-0 happy-path fixture pins acceptance | Step 8, Step 14 |
