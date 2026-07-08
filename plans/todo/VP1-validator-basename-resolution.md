---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T09:31:09.463Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T09:02:49.685Z
gate_crossed: functional → implementation
iron_loop: true
---

---
title: "VP1 — Resolve created-file claims against the plan's files: declaration"
type: functional
status: functional
created: 2026-07-07
program: ctoc-pipeline-hygiene
priority: MEDIUM
files:
  - src/lib/plan-validator.js
  - tests/plan-validator.test.js
---

# VP1 — Resolve created-file claims against the plan's files: declaration

> Found while shipping OM2 (2026-07-07): a complete, correct plan was falsely blocked
> at Gate 3 (completeExecution → validateForReview) because its prose said
> "create `guard-files.js`" (bare basename) while the file lives at
> `src/hooks/guard-files.js`. Same false-positive CLASS as the v6.9.86 code-fence fix.

## 1. ASSESS — Problem Understanding

`validateNoContradictions` (`src/lib/plan-validator.js:302`) scans plan prose with
`createdFilePattern = /(?:created?|added?|new file)[:\s]*[`"]?([^\s`"'(),]+\.[a-z0-9]+)[`"]?/gi`
and, for each captured filename, checks existence at `path.join(projectPath, filePath)`
— i.e. the PROJECT ROOT. A plan that legitimately creates `src/hooks/guard-files.js`
but refers to it in prose by its bare basename (`create \`guard-files.js\``) resolves to
`<root>/guard-files.js`, which does not exist → hard error "claimed as created but
doesn't exist", blocking an otherwise-complete plan. The plan's `files:` frontmatter
ALREADY declares the authoritative path (`src/hooks/guard-files.js`) — the validator
just doesn't consult it. Today the only workaround is to hand-edit every prose mention
to a full path (what OM2 had to do, twice).

## 2. ALIGN — Business Alignment

The `files:` frontmatter is the authoritative declaration of what a plan creates.
A created-file claim in prose should be validated AGAINST that declaration: if a
claimed basename matches the basename of a declared file that EXISTS on disk, the claim
is satisfied — regardless of the prose's path precision. Only claims that match NO
declared file AND don't exist at the resolved path are real contradictions. This kills
the false-positive without weakening the genuine check (a plan claiming to create a file
it neither declares nor wrote still errors).

## 3. CAPTURE — Acceptance Criteria (BDD)

- [ ] **Scenario: bare-basename claim resolved via files: declaration**
  Given a plan whose `files:` declares `src/hooks/guard-files.js` (present on disk)
  And whose prose says "create `guard-files.js`" (bare basename)
  When `validateNoContradictions` runs
  Then NO "claimed as created but doesn't exist" error is raised for it

- [ ] **Scenario: genuine missing-file claim still errors**
  Given a plan whose prose claims "create `nowhere.js`"
  And `nowhere.js` is neither declared in `files:` nor present at project root
  When the validator runs
  Then the "claimed as created but doesn't exist" error IS raised

- [ ] **Scenario: full-path claim still works unchanged**
  Given a plan claiming "create `src/hooks/guard-files.js`" (present)
  Then it validates clean (no regression to the existing path-resolution behavior)

- [ ] **Scenario: basename collision is safe**
  Given `files:` declares `src/a/util.js` (present) and prose claims "create `util.js`"
  Then the claim is satisfied by the declared+existing file (basename match against the
  files: list, not a blind root check)

## Scope

**In:**
- `src/lib/plan-validator.js` — in `validateNoContradictions`, when a claimed filename
  does NOT exist at its resolved path, fall back to matching its basename against the
  plan's parsed `files:` declaration; if a declared file with that basename EXISTS,
  treat the claim as satisfied. Parse `files:` from the plan frontmatter (reuse the
  existing metadata parser). Keep the fenced-code-strip already in place.
- `tests/plan-validator.test.js` — the 4 BDD scenarios above; assert the OM2-shape
  (bare basename + subpath declaration) no longer false-blocks, and the genuine
  missing-file case still errors.

**Out:**
- Broadening the prose regex itself (keep it; the fix is the files:-declaration fallback).
- The script-existence Pattern 2 check (separate; only fix the created-file Pattern 1
  unless the same false-positive is proven there too).

## Decisions Taken

- **D-VP1-1:** the `files:` declaration is authoritative; a created-file prose claim is
  satisfied if its basename matches a declared file that exists — this is the minimal,
  correct fix and mirrors how the enforcement hook already trusts `files:`.
- **D-VP1-2:** do not weaken the genuine check — a claim matching no declared file and
  absent on disk still errors (prevents silent stub/no-op claims, the original intent).

---

# Implementation Details

> Read fresh from disk (`src/lib/plan-validator.js`, `src/lib/state.js`,
> `src/lib/stale-detector.js`, `src/lib/plan-coverage.js`, `tests/plan-validator.test.js`)
> before writing this blueprint. Line numbers below are the ACTUAL current lines.

## 5. PLAN — Technical Approach

### The bug, confirmed against current code

`validateNoContradictions(content, projectPath)` lives at
`src/lib/plan-validator.js:288-367`. Its **Pattern 1** created-file loop is
lines **305-320**:

- **`createdFilePattern`** regex — line **302**:
  `/(?:created?|added?|new file)[:\s]*[`"]?([^\s`"'(),]+\.[a-z0-9]+)[`"]?/gi`
  Captures a bare basename such as `guard-files.js` from prose like
  "create \`guard-files.js\`".
- **Existence check** — lines **306-311**: `path.join(projectPath, filePath)`,
  i.e. the PROJECT ROOT. A declared `src/hooks/guard-files.js` resolves the bare
  basename to `<root>/guard-files.js`, which is absent.
- **Error push** — lines **314-319**, inside `if (!exists)`:
  `` `File "${filePath}" claimed as created but doesn't exist. …` ``

The fenced-code strip (lines **295-297**) is already present and must be kept.

### The `files:` parser to reuse (do NOT hand-roll)

`validateNoContradictions` receives the raw `content` string and NO `planPath`.
Two candidate parsers exist:

| Candidate | Signature | Handles inline-array `files: [a]`? | Handles 2-block frontmatter? | Verdict |
|---|---|---|---|---|
| `plan-coverage.js` → `readPlanFiles(planPath)` | takes a **path** (re-reads file) | **No** (block-list + quoted-scalar only) | reads only the FIRST `---…---` block | **Rejected** — wrong signature (no path in scope) and cannot parse the OM2/PI0 inline-array shape that BDD #1 requires. |
| `stale-detector.js` → `parseFilesField(region)` + `extractFrontmatterRegion(content)` | takes **content/region strings** | **Yes** (inline-array, block-list, scalar) | **Yes** — `extractFrontmatterRegion` concatenates ALL leading `---…---` blocks | **CHOSEN.** |

**Decision D-VP1-3:** reuse `extractFrontmatterRegion` + `parseFilesField` +
`declaredFileExists` from `src/lib/stale-detector.js`. Rationale:
1. They consume the `content` string already in scope — no re-read, no `planPath`.
2. `parseFilesField` parses **all three** YAML syntaxes, so BDD #1's OM2/PI0
   shape `files: [src/hooks/guard-files.js]` (inline-array) AND this very plan's
   own block-list form both resolve. `plan-coverage.js:readPlanFiles` would fail
   BDD #1.
3. `extractFrontmatterRegion` merges the TWO frontmatter blocks the VP1 plan (and
   any approved plan) carries — the `approved_by` block and the `title/files`
   block — so `files:` is found regardless of which block holds it. `state.js`
   `parseMetadata` (line 58) only reads the first block AND its line-based parser
   returns `files: ''` for a block-list (empty value, dash lines skipped) — it
   **cannot** yield the declared list. `parseMetadata` is therefore unusable here.
4. `declaredFileExists(root, declared)` (stale-detector) is cross-platform: it
   splits on any separator run, drops `.`/`..`/empty segments (traversal guard),
   and existence-checks under `root`. Preferred over a raw
   `path.join(projectPath, declaredPath)`.

All three are already exported by `stale-detector.js`
(`module.exports` at line 736: `extractFrontmatterRegion`, `parseFilesField`,
`declaredFileExists`).

### Discrepancy vs. the ASSESS note (recorded, non-blocking)

ASSESS cites the regex "at `src/lib/plan-validator.js:302`" and existence check
"at 307-309 / error push 314-318". Read fresh, the regex is exactly line **302**;
the resolved-path lines are **306-311** and the error push is **314-319** (the
`if (!exists)` opens at **314**). One-line drift from the ASSESS estimate, no
behavioral difference. The stub also says "reuse the existing metadata parser" —
corrected here to `stale-detector`'s `parseFilesField`, because `state.js`
`parseMetadata` provably cannot parse a `files:` sequence (see point 3). This is
the minimal faithful realization of D-VP1-1, not a scope change.

## 6. DESIGN — The Fix

### File: `src/lib/plan-validator.js`
**Action:** MODIFY · **Change Type:** modify-existing (Pattern 1 only)

**Add import** (top of file, alongside line 10's
`const { parseMetadata } = require('./state');`):
```
const { extractFrontmatterRegion, parseFilesField, declaredFileExists } = require('./stale-detector');
```

**Parse declared files ONCE per call**, near the top of `validateNoContradictions`
(after the `scanContent` fenced-strip at lines 295-297, before the Pattern 1
`while` loop at line 305):
```
const declaredFiles = parseFilesField(extractFrontmatterRegion(content)); // [] when none
```

**Gate the error push** (lines 314-319). Replace the bare `if (!exists)` with a
fallback that consults the declared list by BASENAME before erroring:
```
if (!exists) {
  const claimedBase = path.basename(filePath);
  // Claim is satisfied if the plan DECLARES a file with the same basename that
  // EXISTS on disk (bare-basename prose for a legitimately declared+created file).
  const satisfiedByDeclaration = declaredFiles.some(
    (declared) => path.basename(declared) === claimedBase && declaredFileExists(projectPath, declared)
  );
  if (!satisfiedByDeclaration) {
    result.errors.push(
      `File "${filePath}" claimed as created but doesn't exist. ` +
      `Create the file or remove the claim.`
    );
  }
}
```
`result.checklist[`file_${filePath}`]` (line 312) stays as-is (records the raw
`exists` of the claimed path — informational).

**Scope guards (all honored):**
- Pattern 1 ONLY. Pattern 2 (script check, lines 322-345) and Pattern 3
  (lines 347-364) are untouched — the false-positive is not proven there (D from
  the stub Out-of-scope).
- `createdFilePattern` (line 302) is NOT broadened.
- No `new RegExp` on non-literal input — no regex added at all; basename equality
  is a plain string compare (`===`). The reused parsers use `safeRegExp` on
  literal patterns internally.
- No new dependency — `stale-detector.js` is an existing in-repo module; `path`
  is already imported (line 9).

### Dependency graph
```
plan-validator.js  --requires-->  stale-detector.js  (extractFrontmatterRegion, parseFilesField, declaredFileExists)
plan-validator.js  --already-requires-->  state.js (parseMetadata — unchanged), safe-fs, regex-utils, path, project-root
tests/plan-validator.test.js  --tests-->  plan-validator.js
```
No cycle: `stale-detector.js` does not require `plan-validator.js` (verified — its
requires are `safe-fs`, `regex-utils`, `path`, and lazy `child_process`).

### Edge-case matrix (maps to the 4 BDD scenarios)

| # | Claim in prose | `files:` declares | On disk | Result |
|---|---|---|---|---|
| 1 | `guard-files.js` (bare) | `src/hooks/guard-files.js` | exists | **no error** (basename match + declared exists) |
| 2 | `nowhere.js` | not declared | absent | **error** (no declared basename match) |
| 3 | `src/hooks/guard-files.js` (full) | (irrelevant) | exists | **no error** (own path resolves — unchanged path) |
| 4 | `util.js` (bare) | `src/a/util.js` | exists | **no error** (declared basename match) |
| — | `guard-files.js` (bare) | `src/hooks/guard-files.js` | **absent** | **error** (declared but missing — genuine, D-VP1-2) |

## 7. SPEC — Test Plan (extend `tests/plan-validator.test.js`)

**Framework:** `node:test` (existing). **Idiom:** reuse the file's `beforeEach`
temp `testDir` + `createPlan(stage, name, content)` helper (lines 17-40). Real
files are written under `testDir`; the plan content is passed directly to
`validator.validateNoContradictions(content, testDir)`. Add these under the
existing `// === contradiction parser (file-claim) — v6.9.86 ===` group, after
the current line-80 test.

**Test 1 — bare-basename claim resolved via `files:` (OM2/PI0 shape) → NO error.**
Assert the OM2/PI0 shape SPECIFICALLY: inline-array `files: [src/hooks/guard-files.js]`
in frontmatter + prose "create `guard-files.js`".
```
- Setup: fs.mkdirSync(<testDir>/src/hooks, {recursive}); fs.writeFileSync(<testDir>/src/hooks/guard-files.js, '// guard')
- content: "---\nfiles: [src/hooks/guard-files.js]\n---\n# Plan\n\nStep 10: create `guard-files.js` for the hook.\n"
- Act: validateNoContradictions(content, testDir)
- Assert: NO error matching /claimed as created/ AND /guard-files\.js/
```

**Test 2 — genuine missing-file claim still errors.**
```
- content: "---\nfiles: [src/lib/plan-validator.js]\n---\n# Plan\n\nCreated `nowhere.js` for the feature.\n"
  (nowhere.js neither declared nor present at root)
- Assert: result.errors.some(e => /claimed as created/i.test(e) && /nowhere\.js/.test(e)) === true
```

**Test 3 — full-path claim still clean (no regression).**
```
- Setup: write <testDir>/src/hooks/guard-files.js
- content: "---\nfiles: [src/hooks/guard-files.js]\n---\n# Plan\n\nCreate `src/hooks/guard-files.js`.\n"
- Assert: NO /claimed as created/ error (own-path resolution unchanged)
```

**Test 4 — basename collision safe (declared+existing satisfies bare claim).**
```
- Setup: fs.mkdirSync(<testDir>/src/a, {recursive}); write <testDir>/src/a/util.js
- content: "---\nfiles: [src/a/util.js]\n---\n# Plan\n\nadd `util.js`.\n"
- Assert: NO /claimed as created/ error for util.js
```

**Regression coverage retained:** the two existing tests (fenced-code ignore,
real-missing-file flag, lines 44-80) continue to pass unchanged — Test 2 is the
new files:-aware twin of the existing real-missing test.

**Coverage note:** the new branch (`satisfiedByDeclaration` true vs. false) is
exercised in both directions — Tests 1/3/4 hit the satisfied path, Test 2 hits
the unsatisfied path. Error path and happy path both covered.

## Acceptance Criteria Mapping

| BDD Scenario (CAPTURE) | Implemented in | Test |
|---|---|---|
| bare-basename resolved via files: | fallback at plan-validator.js line 314 block | Test 1 |
| genuine missing-file still errors | `satisfiedByDeclaration` false ⇒ push | Test 2 |
| full-path claim unchanged | existing path.join resolution (untouched) | Test 3 |
| basename collision safe | basename `===` against declared list | Test 4 |

## Security Review

- Path traversal: `declaredFileExists` (reused) splits on any separator and drops
  `.`/`..`/empty segments — a declared `../../etc/passwd` neutralizes to a
  root-relative path; existence check stays under `projectPath`. ✓
- No untrusted regex: basename comparison is `===`; no `new RegExp` on plan input. ✓
- Read-only: only `safeFs.existsSync` is invoked; no writes to disk from the validator. ✓
- No secrets, no injection surface (pure string + existence check). ✓

## Implementation Order

1. `src/lib/plan-validator.js` — add require; parse `declaredFiles`; gate the
   Pattern-1 error push (single hunk).
2. `tests/plan-validator.test.js` — add Tests 1-4.
   (TDD per Iron Loop: at Step 8 the tests are written first and Test 1/3/4 fail
   RED against current code; Step 10 makes them GREEN.)

---

## Execution Plan

> This is a documentation/blueprint plan (implementation-planner output). The
> code changes are scoped above; the executor implements them under these steps.
> Canonical Iron Loop labels (Steps 8-16), single IMPLEMENT step.

### Step 8: TEST
- [x] Test plan written (SPEC §7): 4 BDD scenarios in `tests/plan-validator.test.js`,
      reusing the existing `createPlan`/temp-dir idiom. Tests 1/3/4 assert NO
      `claimed as created` error; Test 2 asserts the error IS raised. TDD-Red:
      Tests 1 and 4 fail against current code (bare basename not resolved).

### Step 9: PREPARE
- [x] Dependencies identified: reuse `extractFrontmatterRegion`, `parseFilesField`,
      `declaredFileExists` from `src/lib/stale-detector.js` (already exported,
      line 736). No new package. `path` already imported (line 9). No directories
      to create.

### Step 10: IMPLEMENT
- [x] `src/lib/plan-validator.js`: add the require line; compute
      `declaredFiles = parseFilesField(extractFrontmatterRegion(content))` once;
      wrap the Pattern-1 error push (lines 314-319) in the `satisfiedByDeclaration`
      basename fallback (DESIGN §6). Pattern 2/3 untouched; regex not broadened.
- [x] `tests/plan-validator.test.js`: add Tests 1-4 (SPEC §7).

### Step 11: REVIEW
- [x] Self-review against Architecture checks: no cycle (stale-detector does not
      import plan-validator); dependency flows inward (lib → lib); single
      responsibility; matches existing module style; no scope creep beyond
      Pattern 1.

### Step 12: OPTIMIZE
- [x] `declaredFiles` parsed once per call, not per regex match — O(prose matches ×
      declared files) worst case, both tiny. No redundant file reads (content
      already in memory). Nothing further to optimize.

### Step 13: SECURE
- [x] Security review complete (§ Security Review): traversal guard via
      `declaredFileExists`; no untrusted-input regex; read-only existence checks.

### Step 14: VERIFY
- [x] Gate: `node --test tests/plan-validator.test.js` must show `# fail 0`
      (existing 2 contradiction tests + 4 new = green); then full suite
      `node --test tests/*.test.js` — `# fail 0`, 0 skipped. Coverage of the new
      branch: both directions exercised (Tests 1/3/4 satisfied, Test 2 unsatisfied).

### Step 15: DOCUMENT
- [x] JSDoc on `validateNoContradictions` gains a one-line note that a claimed
      file absent at its own path is satisfied when a declared file with the same
      basename exists (D-VP1-1). No external docs affected.

### Step 16: FINAL-REVIEW
- [x] Human approval at Gate 3 (review → done). All 4 BDD acceptance criteria
      mapped and tested; genuine-missing check preserved (D-VP1-2); no regression
      to full-path resolution.

## Decisions Taken Under Ambiguity

- **D-VP1-3 (parser choice):** reuse `stale-detector.js`'s `extractFrontmatterRegion`
  + `parseFilesField` + `declaredFileExists` rather than `state.js` `parseMetadata`
  (cannot parse a `files:` sequence — returns `''`) or `plan-coverage.js`
  `readPlanFiles` (wrong signature: needs a path; cannot parse inline-array, so
  fails BDD #1's OM2/PI0 shape). This is the minimal faithful realization of
  D-VP1-1; the ASSESS phrase "reuse the existing metadata parser" is honored by
  reusing the parser that actually parses `files:`.


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
