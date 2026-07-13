---
title: "W07-s1 — Shared CRLF-safe frontmatter helper"
type: feature
parent_plan: "ctoc-audit-w07-cross-platform"
depends_on: none
priority: MEDIUM
files:
  - src/lib/frontmatter.js
  - tests/frontmatter.test.js
---

# W07-s1 — Shared CRLF-safe frontmatter helper

**Slice scope:** Create the single CRLF-safe frontmatter module every other W07
migration slice consumes. No existing parser is touched here — this slice only
ships the new helper and its own test. This is the load-bearing decision the
parent recorded ("RECOMMEND a shared helper ... over independently patching each
of the ~12 parsers"): the helper is the one place the `/^---\r?\n/` pattern
lives, so no future parser can silently reintroduce the Windows CRLF lockout.

## Implementation Details

### Architecture Decision (where the helper lives)
The parent left the helper's home open for Step 5. **Decision: a new zero-dependency
module `src/lib/frontmatter.js`**, NOT an export bolted onto `state.js` or
`stale-detector.js`. Reasons: (1) `state.js` will *consume* the helper, and it is
itself required by ~30 modules — putting the helper there widens an already-central
module and risks a require cycle once `vision-decomposer` (which requires
`state.parseMetadata`) also imports the helper; (2) a standalone module with no
internal `require`s cannot participate in any cycle; (3) one obvious home makes the
"single source of the pattern" property auditable by a grep.

### Dependency Graph
```
src/lib/frontmatter.js  --requires-->  (node core only: none)
tests/frontmatter.test.js  --requires-->  src/lib/frontmatter.js
(s2, s3, s4, s5 will require src/lib/frontmatter.js — declared via their depends_on)
```
No cycles. Depth 1.

### File Specification — `src/lib/frontmatter.js` (CREATE)
Mirror the pattern already proven correct in `src/hooks/human-gate-check.js:66,68`
and `src/lib/reconciliation.js:94`, and additionally strip interior `\r` so no
field value leaks a stray carriage return (the defect the parent names for
`sync-unit`).

Exports:
- `FRONTMATTER_OPEN` → `RegExp` = `/^---\r?\n/` — CRLF-safe opening fence, for
  detect/prepend/strip callers (e.g. `vision-decomposer`).
- `FRONTMATTER_BLOCK` → `RegExp` = `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/` — full
  block; capture group 1 is the interior (may contain `\r` until normalized).
- `splitLines(s: string)` → `string[]` — `String(s).split(/\r?\n/)`.
- `parseFrontmatter(content: string)` →
  `{ hasFrontmatter: boolean, raw: string, lines: string[], body: string }`
  - `raw` — interior frontmatter with **every `\r` stripped** (`''` when none).
  - `lines` — `raw.split('\n')` (guaranteed `\r`-free).
  - `body` — `content.slice(match[0].length)` (whole content when no frontmatter).
  - No throw: non-string coerced via `String(content)`; no match → `hasFrontmatter:false`.

Reference implementation:
```js
'use strict';
const FRONTMATTER_OPEN = /^---\r?\n/;
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function splitLines(s) { return String(s).split(/\r?\n/); }
function parseFrontmatter(content) {
  const text = String(content);
  const m = text.match(FRONTMATTER_BLOCK);
  if (!m) return { hasFrontmatter: false, raw: '', lines: [], body: text };
  const raw = m[1].replace(/\r/g, '');
  return { hasFrontmatter: true, raw, lines: raw.split('\n'), body: text.slice(m[0].length) };
}
module.exports = { FRONTMATTER_OPEN, FRONTMATTER_BLOCK, splitLines, parseFrontmatter };
```

### Security Review
- No I/O, no `execSync`, no user path handling — pure string function. No path
  traversal / injection surface.
- `String(content)` guard prevents a throw on non-string input (fail-safe, matches
  the callers' existing `if (!match) return {}` tolerance).
- Regex is a fixed literal (no user-built pattern) — no ReDoS-from-input vector;
  `[\s\S]*?` is lazy and bounded by the closing fence.

## Execution Plan

### Step 8: TEST
Write `tests/frontmatter.test.js` FIRST (TDD — these fail until the module exists),
asserting BEHAVIOR, using a byte-level CRLF/LF twin (`crlf = lf.replace(/\n/g, '\r\n')`):
- [ ] Write a test: `parseFrontmatter(crlf)` is `assert.deepStrictEqual` to
  `parseFrontmatter(lf)` for a fixture with title/priority/`files:` block.
- [ ] Write a test: the returned `raw` contains no `\r` (`assert(!/\r/.test(raw))`)
  and every entry of `lines` contains no `\r`.
- [ ] Write a test: `parseFrontmatter('no frontmatter here')` →
  `{ hasFrontmatter:false, raw:'', lines:[], body:'no frontmatter here' }`.
- [ ] Write a test: `body` for a CRLF doc equals the LF twin's `body`.
- [ ] Write a test: `FRONTMATTER_OPEN.test('---\n...')` and
  `FRONTMATTER_OPEN.test('---\r\n...')` are both `true`.
- [ ] Write a test: `splitLines('a\r\nb')` deep-equals `splitLines('a\nb')` →
  `['a','b']`.

### Step 9: PREPARE
- [ ] Confirm no `src/lib/frontmatter.js` exists yet (new module, no clobber).
- [ ] Confirm Node's built-in `node:test`/`assert` are the test tooling (repo convention).

### Step 10: IMPLEMENT
- [ ] `src/lib/frontmatter.js` — create the module exactly per the File
  Specification (four exports; zero internal `require`s).

### Step 11: REVIEW
- [ ] Verify LF-input behavior is byte-identical to the legacy inline parsers it
  replaces (same `raw` interior, same `body` boundary) so consumers are drop-in.
- [ ] Verify no internal `require` (cycle-free invariant holds).

### Step 12: OPTIMIZE
- [ ] Confirm a single regex `match` per call (no redundant re-scan); reject any
  accidental global-flag statefulness on the shared regex constants.

### Step 13: SECURE
- [ ] Confirm the `String(content)` guard and the fixed (non-user) regex — no
  injection/ReDoS-from-input surface.

### Step 14: VERIFY
- [ ] Run `node --test tests/frontmatter.test.js` — all pass, 0 skipped.
- [ ] Run the full suite `node --test tests/*.test.js` — `# fail 0` (new module
  is additive; must not perturb existing tests).

### Step 15: DOCUMENT
- [ ] Ensure the module JSDoc names finding H1 and states the "single home for the
  CRLF-safe pattern" contract so future parsers import rather than re-inline it.

### Step 16: FINAL-REVIEW
- [ ] All acceptance behavior proven by tests that failed before and pass after;
  exports match the signatures s2–s5 depend on; no gate crossed (Gate 2 is human).
