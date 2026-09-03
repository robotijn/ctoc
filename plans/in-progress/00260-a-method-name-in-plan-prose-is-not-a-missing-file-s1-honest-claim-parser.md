---
iron_loop_verdict: true
title: "The created-file claim parser reads files, not method names"
type: implementation
iron_loop: true
parent_plan: a-method-name-in-plan-prose-is-not-a-missing-file
depends_on: none
priority: high
effort: small
files:
  - src/lib/plan-validator.js
  - tests/plan-validator.test.js
  - tests/plan-validator-coverage.test.js
approved_by: human
approved_at: 2026-09-03T20:11:11.795Z
gate_crossed: implementation → todo
---

# The created-file claim parser reads files, not method names

One slice. It changes Pattern 1 of the contradiction scan so a member expression
cited in plan prose is no longer demanded as a file on disk, and it brings the
regression corpus that pins every misread this repository's own plans actually
contain.

## What I read before planning

| Read | What it settled |
|---|---|
| `src/lib/plan-validator.js` lines 514-640 | the whole of the contradiction scan: the fence strip (531-533), the declared-files parse (539), Pattern 1 (544-572), Pattern 2 (575-597), Pattern 3 (599-637) |
| same file, lines 498-512 | `declaredFileExistsUnder` — separator-split existence check, drops empty/`.`/`..` |
| same file, lines 562-564 | the declared-basename resolution the fix must leave intact |
| same file, lines 99-182 | `MASKED_SPAN_PATTERNS` + `maskQuotedSpans`, including the length-preserving space filler rule this slice reuses |
| same file, line 12 | `parseFilesField` / `extractFrontmatterRegion` imported from `stale-detector` |
| `tests/plan-validator.test.js` lines 117-252 | six existing cases on the contradiction parser |
| `tests/plan-validator-coverage.test.js` lines 162-179, 325-385 | the aggregation case and the Pattern 2 / Pattern 3 cases |
| `tests/escalation-word-boundary.test.js` lines 265-320, 322-377, 645-660 | every other caller of the scan in the suite — all Pattern 3, all filtered to escalation errors, none touching Pattern 1 |
| `src/lib/actions.js` lines 1017-1033 | `completeExecution` — the path that produced the live refusal |
| `plans/**` frontmatter `files:` declarations | the real extension set (below) |

### The callers, enumerated

`validateNoContradictions` has exactly ONE call site inside `src/`:
`validateForReview` (`src/lib/plan-validator.js:232`). Everything else reaches it
through that function:

```text
validateNoContradictions            src/lib/plan-validator.js:524
  └─ validateForReview              src/lib/plan-validator.js:232
       ├─ completeExecution         src/lib/actions.js:1021   ← the live refusal
       ├─ orphan-recovery gate      src/lib/actions.js:2211
       └─ validateTransition map    src/lib/plan-validator.js:988  ('in-progress->review')
            ├─ approvePlan          src/lib/actions.js:443-445 (deps-injectable)
            ├─ streaming-gate       src/lib/streaming-gate.js:675, :1198
            └─ menu-screens         src/lib/menu-screens.js:1926
```

It is also a public export (`module.exports`, line 1412) and is called directly
by three test files. The brief named the caller as the done-gate validator; that
is drift — `validateReviewToDone` (line 804) does NOT call this scan. The
`review → done` gate checks required-step completeness and VERIFY evidence only.
The blocked completion the parent plan reproduces came from `completeExecution`,
which returns `blocked:true` plus a kickback when the pre-review gate refuses.

## Implementation Details

### Dependency graph

```text
src/lib/plan-validator.js  (MODIFY)  — no new imports, no new module
      ▲                         ▲
      │ requires                │ requires
tests/plan-validator.test.js    tests/plan-validator-coverage.test.js
      (MODIFY)                        (MODIFY)
```

No new file, no new export, no new dependency. Two module-level constants and one
four-line helper are added next to the existing ones.

### File: `src/lib/plan-validator.js`

**Action:** MODIFY. Three guards, all inside the Pattern 1 region; nothing else in
the function changes.

#### Edit A — the frozen extension set and the plausibility helper

Placed at module level immediately after `NON_NEWLINE_RE` (line 118), so it sits
with the other compiled-once constants:

```js
/**
 * A captured token is a FILE only if it can be one: it carries a path separator,
 * or its final suffix is a real file extension. `d.push`, `stat.birthtime` and
 * `this.scannersRun` are member expressions and fail both tests.
 *
 * The set is the union of the extensions the parent plan names and the ones this
 * repository's plans actually DECLARE in `files:` (`template` and `gitkeep` are
 * the two the derivation added; see the plan's derivation table). Adding an
 * extension only ever makes the check stricter, so this list is a ratchet: extend
 * it, never trim it.
 */
const FILE_EXTENSIONS = Object.freeze(new Set([
  'js', 'mjs', 'cjs', 'ts', 'md', 'json', 'yaml', 'yml',
  'txt', 'sh', 'py', 'html', 'css', 'template', 'gitkeep'
]));

/**
 * @param {string} token - a Pattern 1 capture
 * @returns {boolean} true if the token could name a file
 */
function isPathPlausible(token) {
  if (token.includes('/') || token.includes('\\')) return true;
  return FILE_EXTENSIONS.has(token.slice(token.lastIndexOf('.') + 1).toLowerCase());
}
```

`lastIndexOf` returning `-1` needs no branch: `slice(0)` yields the whole token,
which is not in the set. A dotless token cannot reach here anyway (the capture
requires a dot), and an unreachable branch would be an uncoverable line under a
99% floor.

The separator test is deliberately first and deliberately covers the backslash: a
Windows-authored declaration is split on either separator by
`declaredFileExistsUnder`, so the plausibility rule must agree with it.

#### Edit B — the inline call-span strip

Compiled once at module level, beside `MASKED_SPAN_PATTERNS`:

```js
// An inline code span that contains a CALL is a citation of code, never a file
// claim. Only spans containing an open parenthesis are blanked: a span citing a
// plain path is left visible, so a real claim written in backticks still
// validates. Single-line by construction (the content class excludes the
// delimiter and the newline), so a stray backtick can never open a span that
// swallows the document and switches the checker off.
const INLINE_CALL_SPAN_RE = safeRegExp('(`{1,3})[^`\\n]*?\\([^`\\n]*?\\1', 'g');
```

Applied in `validateNoContradictions` immediately after the fence strip, so the
two run in the order fences-then-spans:

```js
const scanContent = content
  .replace(/```[\s\S]*?```/g, '')
  .replace(/~~~[\s\S]*?~~~/g, '')
  .replace(INLINE_CALL_SPAN_RE, (span) => span.replace(NON_NEWLINE_RE, ' '));
```

The filler is a SPACE and the length is preserved, for the reason already written
into `maskQuotedSpans`: blanking can then only ever REMOVE a match, never create
one by joining the text on either side of the span.

This strip feeds Pattern 2 as well, which is correct and is covered: a script
cited as a call stops being read as a missing script, while the two existing
Pattern 2 cases cite paren-free spans and are untouched.

#### Edit C — a claim followed by an open parenthesis is a call

Inside the Pattern 1 loop, as the first two statements of the body, before the
`checklist` entry is written:

```js
const filePath = match[1];

// A capture immediately followed by "(" is a call, not a path. The capture class
// stops AT the parenthesis, so the character after the match is the evidence.
// The trailing [`"]? in the pattern may have consumed one delimiter; the capture
// itself can never end in one, so this test is exact.
const trailer = /[`"]$/.test(match[0]) ? 1 : 0;
if (scanContent[match.index + match[0].length - trailer] === '(') continue;

// A token that cannot name a file is not a claim about a file.
if (!isPathPlausible(filePath)) continue;
```

Both guards `continue` BEFORE `result.checklist['file_' + filePath]` is written,
so a skipped token leaves no phantom checklist entry. No existing test asserts on
a `file_*` key; the aggregation case at `tests/plan-validator-coverage.test.js:178`
asserts only that `result.checklist.contradictions` is attached.

#### Rejected alternative, recorded so it is not re-proposed

Expressing guard C as a lookahead inside the pattern —
`([^\s\`"'(),]+\.[a-z0-9]+)(?!\()` — is WRONG and silently so. The suffix
quantifier is greedy, so a failing lookahead makes the engine backtrack one
character and try again: against a call it does not reject the match, it captures
one character less. The plan's own reproduction becomes a capture of
`assert.strictEqua`, and the error message changes without the defect changing.
The guard must read the character after the completed match, from outside the
regex.

### Where each observed misread dies

Every token the parent plan lists, its real source on disk, and the guard that
catches it. The prose shapes are quoted in the fenced block below so this plan
does not trip the very pattern it fixes.

| Token the scan invents | Source | Caught by |
|---|---|---|
| `d.push` | `plans/review/00157-the-dry-run-tells-the-truth-and-no-git-hook-is-installed-unasked.md:269` (also 314, 357, 362, 536) | C (suffix `push`), and A where the call form appears |
| `d.length` | same plan, line 357 | C (suffix `length`) |
| `this.scannersRun` | `plans/review/00025-r6d-security-failopen-and-crossplatform.md:117` | C (suffix `scannersrun`) |
| `taskRegistry.findActivePlanTask` | `plans/review/00013-r3b-scheduler-enforced-not-advisory.md:186-187` | A (followed by `(`), then B, then C |
| `safeFs.writeFileSync` | `plans/done/ctoc-audit-w11-s5-agent-lock-wx.md:42-43` | A, then B, then C |
| `stat.birthtime` | `plans/done/ctoc-audit-w11-s7-queue-order-and-dead-exports.md:49` | C (suffix `birthtime`) |
| `assert.strictEqual` | `plans/in-progress/00259-a-canonical-create-react-app-is-detected-s1-symmetric-credit.md:293` — the live refusal | A, then B, then C |

The exact prose, byte-for-byte from those files:

```text
00157:269   confirm no `created.push` remains on a preview path.
00157:357   `result.created.length > 0` on a run that writes nothing.
00025:117   2. **`run()` honesty.** Added `this.scannersRun` tracking.
00013:186   ... lookup.** Added
00013:187      `taskRegistry.findActivePlanTask(reg, plan, kind)` (prefers running/cancelling over queued) and
w11-s5:42   ... Attempt an exclusive-create
w11-s5:43   `safeFs.writeFileSync(lockPath, data, { flag: 'wx' })` — atomic create-or-fail (`EEXIST`).
w11-s7:49   `created: stat.birthtime` (line 38) and `files.sort((a,b)=>a.created-b.created)` (line 52,
00259:293   - one assertion ADDED: `assert.strictEqual(result.confidence, 50)`.
```

Two of these are worth naming precisely, because they explain shapes that look
impossible:

- `d.push` and `d.length` are not variables. The verb alternation is
  `created?`, so the engine can match `create` and leave the trailing `d` as the
  first character of the "path": the token `created.push` yields the capture
  `d.push`. Any prose citing that member expression is affected.
- Two of the seven span a line break. The separator between verb and capture is
  `[:\s]*`, and `\s` matches a newline, so a paragraph ending in `Added` picks up
  the backticked call that opens the next line. The regression corpus must
  therefore carry multi-line cases; single-line cases alone would leave that half
  of the defect unpinned.

### The derived extension set

Probed across `plans/**` for every bare-path list item (which over-collects: it
sees body lists as well as frontmatter, so an ABSENCE result is strong):

| Extension | In a real `files:` block | Evidence |
|---|---|---|
| `js`, `md` | yes | 1586 bare-path list lines across 349 plans |
| `json` | yes | `plans/implementation/close-the-coverage-holes.md:21`, `plans/review/00187-…:13` |
| `yaml` | yes | `plans/review/00029-cr3-project-type-taxonomy.md:11-17` |
| `template` | yes | `plans/done/A1-canvas-layer-impl.md:16-17`, `plans/review/00150-…:13-14` (both frontmatter, verified by reading) |
| `gitkeep` | yes | `plans/done/A1-canvas-layer-impl.md:18`, `plans/done/A3-menu-rethink-impl.md:28-29` |
| `yml` | body list only | `plans/done/local-ci-gate-enforcement.md:479-482` |
| `ts` `tsx` `jsx` `mjs` `cjs` `sh` `py` `html` `css` `txt` | none found anywhere in `plans/**` | zero matches |

`CLAUDE.md.template` is why `template` matters: the capture is greedy up to the
first excluded character, so the token is `CLAUDE.md.template` and the suffix
that must be recognised is the LAST one.

The shipped set is the UNION of the parent plan's list and this derivation, not
the derivation alone. Dropping `sh`, `py`, `ts` and the rest because this
repository happens not to declare them would convert a true positive into
silence in every downstream project that does — trading a false red for a false
green, which is the worse of the two failures. The derivation therefore ADDS
(`template`, `gitkeep`) and removes nothing.

### File: `tests/plan-validator.test.js`

**Action:** MODIFY. Add the regression corpus in the existing
`=== contradiction parser (file-claim) ===` group, after the fenced-block case at
line 141, and tighten one pin (below). Framework is `node:test` with the file's
existing `testDir` fixture and `validator.validateNoContradictions(content, testDir)`
call shape.

### File: `tests/plan-validator-coverage.test.js`

**Action:** MODIFY. Add the branch-kill cases beside the existing Pattern 2 /
Pattern 3 group at line 325: the separator-override branches and the
no-phantom-checklist assertion. This keeps the behavioural corpus in the first
file and the mutation-killing cases in the file whose stated job that is.

## Test Plan — TDD-Red first

Every case below is written and RUN before Edit A/B/C exists. The RED column
names the assertion that fails today and why.

### Group 1 — the misread corpus (`tests/plan-validator.test.js`), all RED today

| # | Input (single line unless noted) | Assertion | RED today because |
|---|---|---|---|
| 1 | the live line from `00259:293` verbatim | no error matching `/claimed as created/` | errors with `assert.strictEqual` |
| 2 | the `00157:269` line verbatim | same | errors with `d.push` |
| 3 | the `00157:357` line verbatim | same | errors with `d.length` |
| 4 | the `00025:117` line verbatim | same | errors with `this.scannersRun` |
| 5 | the `00013:186-187` pair, newline included | same | errors with `taskRegistry.findActivePlanTask` |
| 6 | the `w11-s5:42-43` pair, newline included | same | errors with `safeFs.writeFileSync` |
| 7 | the `w11-s7:49` line verbatim | same | errors with `stat.birthtime` |

Cases 5 and 6 are the multi-line pins. A corpus of single-line cases would pass
against a fix that only reads the current line and would leave the
`[:\s]*`-spans-a-newline half of the defect live.

### Group 2 — the teeth, GREEN before and after

| # | Input | Assertion | What it kills |
|---|---|---|---|
| 8 | a claim of a missing path inside a paren-free backtick span, on a line that ALSO contains a separate call span | the error IS reported | an over-broad Edit B that blanks every inline span |
| 9 | a claim of a missing path whose suffix is NOT a known extension (separator present) | the error IS reported | an Edit A that checks only the extension and drops the separator override |
| 10 | a claim written with backslash separators, no forward slash, missing on disk | the error IS reported | the second operand of the separator test |
| 11 | existing: fenced code produces no claim (line 119) | unchanged | a regression in the fence strip |
| 12 | existing: a real missing claim still errors (line 143) | unchanged | the whole fix collapsing into silence |
| 13 | existing: bare-basename resolved through `files:` (line 159) | unchanged | Edit A rejecting a legitimate bare basename |
| 14 | existing: full-path claim clean (line 208) | unchanged | path resolution regression |

### Group 3 — branch kills (`tests/plan-validator-coverage.test.js`)

| # | Input | Assertion |
|---|---|---|
| 15 | prose citing a member expression | `result.checklist` has NO `file_*` key for that token — the skip happens before the checklist write |
| 16 | the two existing Pattern 2 cases (lines 329, 343) | unchanged: a paren-free script span still warns, a bare command still does not |
| 17 | the two existing Pattern 3 cases (lines 358, 373) | unchanged: Edit B touches `scanContent`, never the `content` that Pattern 3 masks |

### The one tightened pin — Lesson 14

`tests/plan-validator.test.js:231` — `VP1 #4: basename collision safe`.

```text
old:  'add `util.js`.',
new:  'Created `util.js`.',
```

Justification, from outside the test: the verb alternation is
`(?:created?|added?|new file)`, in which `added?` is the literal `adde` with an
optional final `d`. The bare word `add` matches NOTHING in that alternation, so
Pattern 1 never fires on this fixture and the case asserts the absence of an
error on a scan that produced zero matches. It passes today for a reason
unrelated to the behaviour its own name and comment claim to pin, and it would
keep passing if the declared-basename resolution were deleted outright. The
change is strictly STRENGTHENING: it makes the case exercise the resolution path
(capture `util.js`, absent at the temp root, satisfied by the declared and
existing `src/a/util.js`), so it can now fail if that path breaks. No assertion
is removed, loosened, re-scoped or widened; the expected outcome is unchanged.
This is the only existing case touched. No existing case pins the misread itself
— checked all six in `tests/plan-validator.test.js`, both Pattern 1 cases in
`tests/plan-validator-coverage.test.js`, and all five contradiction cases in
`tests/escalation-word-boundary.test.js` (which read Pattern 3 only and filter to
escalation errors).

## The read-only sweep, and where its result is recorded

Run BEFORE the edits and AFTER them, from the repository root. It only reads:

```bash
node -e "const fs=require('fs'),path=require('path'),v=require('./src/lib/plan-validator.js');for(const st of ['review','done','in-progress','todo']){const d=path.join('plans',st);if(!fs.existsSync(d))continue;for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.md'))){const c=fs.readFileSync(path.join(d,f),'utf8');const e=v.validateNoContradictions(c,process.cwd()).errors.filter(x=>/claimed as created/.test(x));if(e.length)console.log(st+'/'+f+' :: '+e.join(' | '));}}"
```

The acceptance is NOT an empty AFTER list, and reading it that way would drive
the parser into exactly the false green this slice exists to prevent. Several
plans carry a genuine path-shaped claim of a file that is absent today (for
instance `QUALITY.md` in `plans/done/strict-quality-enforcement.md:1661` and
`nowhere.js` quoted as fixture content in
`plans/done/VP1-validator-basename-resolution.md:272`). Those are true positives
and MUST survive.

The acceptance is: **no line in the AFTER list names a token that lacks a path
separator and whose final suffix is not in `FILE_EXTENSIONS`.** Every such line
in the BEFORE list must be gone, and the seven plans named in the misread table
must contribute none.

Recorded in this plan file, under a `## Sweep evidence (read-only)` heading the
executor appends at Step 14: the BEFORE list verbatim, the AFTER list verbatim,
and the count of lines removed. Both lists go inside a fenced block, so this
plan's own evidence cannot re-trip the scan when the plan is validated.

### Honest limit on the count

The parent plan states ten misread plans. This slice names seven tokens across
six plans in `review`/`done`/`in-progress`, located by pattern search and
verified by READING each site (three further candidates —
`plans/done/onboarding-claude-md-operating-lessons.md:1194`,
`plans/done/OM1-operating-manual-merge.md:511`,
`plans/done/OM2-port-opuspack-hooks-to-node.md:284` — were read and are inside
fenced blocks, so the current code already ignores them). This planning pass had
no way to execute the validator, and a text search under-reports by
construction: the real capture class admits nearly every non-space character,
while the probe used here admitted only identifier characters, and it could not
emulate the fence strip. The list above is therefore a floor, not the census.
The sweep recipe above IS the census, and the executor records what it actually
prints — never this table copied forward.

## Decisions Taken Under Ambiguity

1. **The extension list is the union, not the derivation alone.** The brief says
   the derived list wins. It wins by ADDING (`template`, `gitkeep`); the parent
   plan's proposed extensions stay. Removing `sh`/`py`/`ts`/`css` because this
   repository does not declare them would silence a genuine missing-file claim in
   any project that does. A fix for a false red is never allowed to manufacture a
   false green.
2. **Guard B carries a small, named cost, and it is accepted because the human
   approved it.** Blanking an inline span that contains an open parenthesis also
   blanks a claim written inside that same span — `` `src/lib/foo.js (new)` ``
   stops being checked. Guards A and C already cover every misread observed on
   disk, so B is the least load-bearing of the three and the only one that can
   remove a true positive. It is implemented as approved, narrowed to spans that
   actually contain a parenthesis, and case 8 pins that a paren-free claim on the
   same line still errors. If the cost ever shows up in practice, B is the guard
   to reconsider first.
3. **The guard reads the character after the match, not a lookahead.** A
   lookahead placed after the capture makes the greedy suffix backtrack, which
   shortens the capture instead of rejecting the match. Recorded above with the
   exact failure so it is not re-proposed.
4. **Skipped tokens leave no checklist entry.** Both guards `continue` before the
   `file_*` write. A checklist entry for a token that names no file would be a
   record of a claim nobody made.
5. **No `## Execution Plan` section is written here.** The parent plan and the
   dispatch brief both forbid it; the canonical Steps 8-16 section is appended by
   the Iron Loop when this plan enters the build queue.
6. **`CLAUDE.md` is not declared.** All three declared files already exist, so no
   documented count moves and the count-mover gate in `validateForQueue` does not
   require the declaration.


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


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
