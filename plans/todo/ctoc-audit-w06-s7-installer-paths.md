---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.519Z
gate_crossed: implementation → todo
---

---
title: "W06-s7 — Every installer-written path exists after install"
type: feature
parent_plan: "ctoc-audit-w06-truthful-tests"
depends_on: none
files:
  - tests/installer-paths.test.js
priority: HIGH
---

# W06-s7 — Every installer-written path exists after install

**Story:** S8 (non-MVP) — the "broken hooks-installer path" finding.
**Pairing:** SIBLING-PAIRED with **vision workstream 11 (state durability & dead-code
removal — "fix or remove the broken hooks-installer path")**. W06 adds the invariant that
goes RED on the broken installer path; W11's production fix turns it GREEN. W06 changes
**no** installer code.

## Implementation Details

### Architecture Decision

The installer is `src/lib/hooks-installer.js`. It reads hook **templates** from
`TEMPLATE_DIR = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'hooks')` and writes
hooks to computed target paths (`husky/<hookType>`, native `.git/hooks/pre-commit`, a
`.pre-commit-config.yaml`, `.lintstagedrc.json`, …). The finding is that at least one path
the installer is documented to write does not exist after install. A new
`tests/installer-paths.test.js` asserts that **every source template the installer reads
resolves, and every install target the installer is documented to produce is reachable** —
computed the way the installer itself computes them — so a broken path goes red naming the
path.

### RED-now anchor — MUST be pinned at build time (honesty gate)

Read-only static analysis on 2026-07-13 found the **obvious** candidates already resolve:
`.ctoc/templates/hooks/` exists with `husky/{commit-msg,pre-commit,pre-push}.template`,
`pre-commit-config/{go,multi-lang,python,typescript}.yaml.template`, and the top-level
`{commit-msg,pre-commit,pre-push}.sh.template`; and every `.claude-plugin/hooks.json`
command path resolves. **Therefore the exact broken path is not yet pinned by W06.** The
paired defect is real (vision workstream 11 names it), but its precise location must be
established from the W11 audit finding at build time.

**This slice's Step 8 is therefore investigative, and RED-before is a hard gate:** the
executor MUST reproduce a failing assertion against a **real, currently-present** broken
installer path before this slice is complete. If, after pinning the W11 finding, no
assertion is RED on today's tree, the executor MUST **kick back** (per the no-stub /
paired-fix contract) to re-scope with the W11 owner rather than commit a test that is
already green on the broken tree — the parent's success metric forbids adding an
already-green invariant.

Candidate broken-path classes to pin (investigate in this order):
1. **Plugin-context `TEMPLATE_DIR` resolution** — `__dirname/../../.ctoc/templates/hooks`
   resolves in-repo but, when CTOC runs from the installed plugin cache, `../../.ctoc` is
   not the project's `.ctoc`; a template read from there would miss. Assert the resolved
   template dir exists relative to the **plugin/package root**, not an assumed CWD.
2. **A documented install target never created** — e.g. a native-hook or settings path the
   installer's docs/README promise but the code does not write (or writes under a wrong
   parent). Assert the documented target's parent is created and the file lands.
3. **A referenced template the code names but the tree lacks** (e.g. a `hookType` whose
   `<hookType>.template` is missing for some project type).

### Dependency Graph

```
tests/installer-paths.test.js
  --imports (read-only)--> src/lib/hooks-installer.js  (to compute the SAME paths it uses,
                            e.g. TEMPLATE_DIR / hookType list) — do NOT run its writers
  --existence-checks--> each resolved source template + documented target path
```

Self-contained (one file). Independent of s1–s6.

### File Specification

#### `tests/installer-paths.test.js` (CREATE — the invariant)
- Determine the installer's path set the way the installer does: import the constants /
  small pure helpers from `src/lib/hooks-installer.js` where exported, else re-derive
  `TEMPLATE_DIR` and the hook-type list from the module source (documented, not guessed).
- `it('every hook template the installer reads exists')` — for each `<hookType>` and each
  project type, assert the corresponding `*.template` file exists; failure names the
  missing template path.
- `it('every documented installer target path is reachable')` — for the pinned broken-path
  class from Step 8, assert the target (or its resolved parent) exists / is created;
  failure names the missing path.
- Where the assertion requires simulating an install, run it against a **temp dir**
  (`fs.mkdtempSync`) and clean up in `after` — never touch the real repo's hooks.
- Hard `require('node:test')`/`require('node:assert')` and hard
  `require('../src/lib/hooks-installer.js')` (RED-louder if the installer module itself
  fails to resolve).

### Test Plan
RED-now: after pinning the W11 broken path in Step 8, `node --test
tests/installer-paths.test.js` FAILS naming that path. GREEN-after: once **W11** fixes or
removes the broken path, the same run passes. If Step 8 cannot produce a RED, kick back
(see the honesty gate above).

### Security Review
- [x] Any simulated install writes only to a `mkdtempSync` temp dir, removed in `after`.
- [x] Path traversal: installer paths are existence-checked / created under a temp root;
  no arbitrary write to the real tree.
- [x] No network; no `execSync` of installer git commands in the test (path resolution is
  computed, not executed) unless run inside the temp sandbox.
- [x] Failure messages contain repo/temp-relative paths only.

## Execution Plan

### Step 8: TEST
Pin the W11 broken installer path (investigate the candidate classes above against the W11
audit finding). Write `tests/installer-paths.test.js` asserting that path (plus the
template-source existence sweep). Run on today's tree and **capture RED** naming the broken
path. **If no assertion is RED**, STOP and kick back to re-scope with the W11 owner — do
not commit an already-green invariant. Log: "GREEN pairing is workstream 11."

### Step 9: PREPARE
Confirm `src/lib/hooks-installer.js` resolves and identify which constants/helpers it
exports for reuse (vs. what must be re-derived from its source). Confirm a temp-dir install
sandbox is viable (`fs.mkdtempSync`).

### Step 10: IMPLEMENT
One step, one file:
- [ ] `tests/installer-paths.test.js` — template-source existence sweep + the pinned
  broken-target assertion, using a temp-dir sandbox for any simulated install.

### Step 11: REVIEW
Verify the test computes installer paths the **same way the installer does** (imports or
faithfully re-derives `TEMPLATE_DIR` / hook-type list) rather than hard-coding a parallel
list that could drift. Verify all writes are sandboxed to a temp dir.

### Step 12: OPTIMIZE
Resolve the template dir once; check each template with a single `existsSync`. Tear down
the temp sandbox exactly once in `after`.

### Step 13: SECURE
Confirm no assertion writes to the real repo's `.git/hooks`, `.husky`, or config files.
Confirm the plugin-context resolution check (candidate 1) does not shell out.

### Step 14: VERIFY
Today's tree: RED naming the pinned broken installer path (expected; paired fix pending
W11). No other test regresses; the temp sandbox is fully removed. Record the RED output as
the paired-fix witness. (If Step 8 kicked back, this slice is not VERIFY-complete — that is
the correct outcome, not a green-now test.)

### Step 15: DOCUMENT
Header comment naming the installer finding, the workstream-11 pairing, and the pinned
broken-path class the test targets.

### Step 16: FINAL-REVIEW
Confirm: a real broken installer path is asserted and RED on today's tree (or a documented
kickback stands); all writes sandboxed; installer path logic mirrored not duplicated; W11
pairing documented. Ready for the batched Gate 2 only if a genuine RED witness exists.

## Decisions Taken Under Ambiguity
- **RED anchor is pinned at build time, not asserted green.** Read-only analysis could not
  locate the exact broken path (the obvious templates + `hooks.json` scripts all resolve),
  so this plan makes RED-before a hard honesty gate with a mandated kickback — faithful to
  the parent's "no test is added that is already green on the broken tree" over shipping a
  vacuous assertion.
- **Kept as its own slice (not folded into s4).** The installer path pairs with workstream
  11, whereas s4's registry pointers pair with W04; separate slices keep the two
  paired-fix witnesses cleanly attributable.
- **All simulated installs are temp-sandboxed** — the test must never mutate the real
  repo's hooks or config.


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
