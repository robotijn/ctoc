---
iron_loop_verdict: true
title: "Run the evidence-pack command for real — its main() has never executed under a test"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: medium
files:
  - tests/evidence-pack-main.test.js
  - src/scripts/evidence-pack.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.132Z
gate_crossed: implementation → todo
---

# Run the evidence-pack command for real

**Scope (one line):** spawn `src/scripts/evidence-pack.js` as a real child process against a
seeded fixture project, assert the manifest it writes and the archive it packs, and assert the
documented behaviour when `tar` is not on `PATH`.

## Implementation Details

### What is uncovered today (measured 2026-08-31, node line coverage scoped to `src/**`)

`src/scripts/evidence-pack.js` — **59.56 %**. Uncovered lines:
`97-101` · `115` · `123-125` · `127-129` · `131-137` · `139-146` · `157-206` · `208-221`.

Mapped to the code the planner read in full:

| lines | function | why it is dark |
|---|---|---|
| 97-101 | `collectInputs` — the `.ctoc/baselines/<ver>/manifest.yaml` walk | this repository has no `.ctoc/baselines/` |
| 115 | `collectAllInWindow` — the recursive `entry.isDirectory()` arm | no nested dir under the walked roots |
| 123-125 | `hashFile` | nothing calls it but `main` |
| 127-129 | `ensureDir` | same |
| 131-137 | `readChainHead` | same |
| 139-146 | `readActiveRegimes` | same |
| 157-206 | `main` — **the whole command** | never executed by any test |
| 208-221 | `yamlify` | only `main` calls it |

### What the planner verified (read this session, in full)

- `src/scripts/evidence-pack.js` (226 lines) — every line cited above.
- `src/lib/safe-fs.js` — the only first-party dependency of the script besides
  `../lib/regulatory-regime`, which is required inside a `try/catch` that returns `[]`.
- `tests/evidence-pack-collect.test.js` and the existence of `tests/evidence-pack-security.test.js`.
- `.gitignore` — **`.ctoc/evidence-packs/` is NOT ignored.**
- `tests/pretooluse-write-coverage.test.js` — used to establish that a child process spawned
  from a test DOES contribute to the scoped coverage number (see "Coverage credit", below).

### Three pieces of drift between the parent plan and the code — read these before writing a test

1. **The script's root is fixed at load time from `__dirname`, not from the working directory.**
   Line 26: `const ROOT = path.resolve(__dirname, '..', '..')`, and line 27 derives
   `EVIDENCE_DIR` from it. Spawning the shipped file with `cwd` set to a fixture therefore
   collects the **CTOC repository's** artifacts and writes the pack into the **CTOC
   repository's** `.ctoc/evidence-packs/` — which is not git-ignored. The parent plan's
   "against a seeded fixture repository" is not reachable without a root seam. This slice adds
   the smallest possible seam (below) and records the larger question for the human.
2. **The archive does NOT contain the manifest.** `main` writes `manifest.yaml` to
   `EVIDENCE_DIR` (line 187) and packs a tar built from `relInputs` only (lines 191-194); the
   manifest path is never added to the input list. The parent plan's acceptance line "the tar
   archive exists and contains the manifest" describes behaviour the code does not have. **Do
   not change the code to match the plan in this slice, and do not write an assertion that
   passes by accident.** Assert what the command really does, and record the omission as a
   finding for the human (Decision 3).
3. **With `tar` absent the command does not fail.** Lines 197-202 catch, print
   `tar failed (<message>); writing JSON bundle instead.` to stderr, write a `.json` bundle
   beside the intended tar path, and the process still exits 0. The documented behaviour is a
   FALLBACK, not a failure. Assert the fallback.

Also note the guard at line 190: `if (inputs.length > 0)`. An empty window produces a manifest
with `artifact_count: 0` and **no archive at all** — no error, no fallback bundle.

### Coverage credit — why a spawned child counts

`src/hooks/PreToolUse.Write.js`'s `main()` is called from nowhere in-process; its only callers
are the wrapper scripts spawned at the bottom of `tests/pretooluse-write-coverage.test.js`. The
measured report shows `main()`'s body covered and only its deeper arms red, so
`node --test --experimental-test-coverage` propagates `NODE_V8_COVERAGE` to grandchildren and
merges their coverage back, attributed by real file path. That test file contains a comment (at
its subprocess block) claiming the opposite — "a child's lines are not attributed upward" — which
contradicts its own header and the measurement. **Do not repair that comment in this slice**
(it is not in `files:`); report it at Step 16 so the human can schedule the correction.

Consequence for this slice: the child must run **the real file at its real path**. Copying the
script into a fixture tree would prove behaviour but earn no coverage, and a symlinked copy
resolves back to the real `__dirname`. Hence the seam.

### File specifications

#### `src/scripts/evidence-pack.js` — MODIFY (three lines)

Replace the fixed root constant with a resolved one that honours an explicit override:

```js
// The project the pack is ABOUT. Defaults to the repository this script ships in
// (unchanged behaviour). CTOC_EVIDENCE_ROOT names a different project explicitly —
// the seam the test drives, and the only way to run the command against a project
// that is not the one the file lives in.
function resolveRoot() {
  const override = process.env.CTOC_EVIDENCE_ROOT;
  return override ? path.resolve(override) : path.resolve(__dirname, '..', '..');
}
const ROOT = resolveRoot();
```

`EVIDENCE_DIR` keeps its current definition. Nothing else changes: with the variable unset the
resolved value is byte-identical to today's, so every existing caller and both existing test
files are unaffected.

- Precedent for a named test seam in shipped code: `CTOC_DUPLICATE_GUARD_TEST_FIXTURE` in
  `src/hooks/PreToolUse.Write.js`, read this session.
- `path.resolve` on the override: an absolute path stays itself; a relative one resolves
  against the child's `cwd`. No shell, no interpolation.
- **Do not** widen this into "use `process.cwd()` when it looks like a project" — that changes
  what a shipped compliance command collects, and that is the human's decision (Decision 2).

#### `tests/evidence-pack-main.test.js` — CREATE

`node:test` (`describe`/`it`/`assert`), `spawnSync(process.execPath, [SCRIPT, ...args], { env })`
— argument array, **no shell**. Fixture under `os.tmpdir()` via `fs.mkdtempSync`, removed in
`after`. All paths via `path.join`.

Fixture layout (seeded so every dark helper runs):

```
<fix>/.ctoc/audit/dispatches/2026-08-31/d1.yaml     -> collectInputs step 1
<fix>/.ctoc/audit/chain.jsonl                       -> step 2 (unconditional input)
<fix>/.ctoc/audit/chain-head.yaml   "hash: abc123"  -> readChainHead (131-137)
<fix>/plans/done/a-plan.md          contains "approved_by: human"   -> step 3 + filter
<fix>/plans/done/not-approved.md    no marker                        -> excluded
<fix>/.ctoc/threat-models/nested/t.json                              -> collectAllInWindow 115
<fix>/.ctoc/baselines/6.14.36/manifest.yaml                          -> 97-101
<fix>/.ctoc/capa/c1.yaml                                             -> step 8
```

The dispatch DIRECTORY's own mtime must fall inside the window (line 56 windows the directory,
not the file); freshly created directories satisfy a window ending today.

### Fault-injection seams (exact)

- **`tar` absent:** spawn with `env: { ...process.env, PATH: <an empty temp dir>, CTOC_EVIDENCE_ROOT: fix }`.
  `execFileSync('tar', …)` then throws `ENOENT` and the catch at 197 runs. On Windows also clear
  `PATHEXT` is unnecessary — `execFileSync` without a shell resolves via `PATH` only.
  If the platform still finds a `tar` (a shell built-in cannot be reached here, but a
  system path baked into the process could), the case must **fail loudly**, never skip silently:
  assert first that the run took the fallback, and if it did not, fail with a message naming the
  reason. A skip is permitted only with a printed reason (the precedent is the permission-gated
  cases in `tests/stale-scan-says-when-it-could-not-look.test.js`).
- No mock of any function under test. `safeFs`, `crypto` and `child_process` are untouched; the
  only injection is the process environment of a real child.

### Wiring — the live call sites

- `src/scripts/evidence-pack.js` is already a declared execution root
  (`.ctoc/reachability-roots.json`), executed by a human and named in
  `agents/coordinator/cto-chief.md`. This slice adds no module and no new export, so it creates
  no new dead surface. (Noted for the human: that file lists `src/scripts/evidence-pack.js`
  among `roots` but gives it **no entry in `reasons`**, unlike three of the seven — a small
  honesty gap in the escape hatch, not this slice's work.)
- `tests/evidence-pack-main.test.js` is reached by the gated suite: `npm test` →
  `src/scripts/test-gate.js` → `node --test tests/*.test.js`.

### Security review

- No secret is read, printed or asserted. The fixture contains invented, non-secret bytes.
- The child gets an argument array and no shell; the fixture path never reaches a shell string.
- Every write is under `os.tmpdir()`; the repository tree is not written to at all once the
  root seam exists — which is precisely why the seam is in this slice.
- `CTOC_EVIDENCE_ROOT` grants no new capability: the script already reads and writes whatever
  root it resolves; the variable only names which one, and only in a process the human started.

## Test Plan (TDD-Red first)

Each case is RED before the change and GREEN after. Any case that is already GREEN before the
implementation is a finding to account for at Step 11, never banked.

1. **`main` writes a manifest describing the window.** RED today (`main` never runs; without the
   seam it cannot run against a fixture). Spawn with `--since`/`--until` covering the fixture.
   Assert exit 0, and that `<fix>/.ctoc/evidence-packs/<since>_to_<until>.manifest.yaml` exists
   and contains `pack_id: <since>_<until>`, `since:`/`until:` matching the arguments, and
   `artifact_count:` equal to the number of `- path:` entries.
2. **Every artifact is listed with its real hash and size.** RED (`hashFile`, `yamlify` dark).
   For each `path`/`sha256`/`size_bytes` triple in the manifest, recompute
   `crypto.createHash('sha256')` over `<fix>/<path>` and compare; compare `size_bytes` with
   `fs.statSync`. A mutant hashing the path string instead of the bytes reds here.
3. **The chain head is carried into the manifest.** RED (`readChainHead` dark). Assert
   `chain_head_at_pack_time: abc123`. Second case: with `chain-head.yaml` removed, assert the
   manifest renders `chain_head_at_pack_time: null` — a mutant emitting the empty string reds.
4. **The approved-plan filter holds end to end.** RED. Assert `plans/done/a-plan.md` appears in
   the manifest and `plans/done/not-approved.md` does not.
5. **The baseline manifest and the nested threat-model file are collected.** RED (97-101, 115).
   Assert both relative paths appear in the artifact list.
6. **The archive is produced and its members are exactly the collected artifacts.** RED
   (`packWithTar` is covered today only by the security test's direct call; the `main` path that
   builds the list file and unlinks it is dark). Assert the `.tar.gz` exists, then list it with
   `spawnSync('tar', ['-tzf', tarPath])` and assert the member set equals the manifest's `path`
   set. **Assert explicitly that the manifest file is NOT a member** — that is the real
   behaviour (drift 2) and the assertion makes the omission visible instead of assumed.
   Also assert the temporary `.pack-<since>.list` file no longer exists (line 195 unlinks it).
7. **`tar` absent takes the documented JSON-bundle fallback.** RED. Assert exit 0, stderr
   contains `tar failed (`, no `.tar.gz` exists, and `<since>_to_<until>.json` exists and parses
   to an object whose keys are the collected relative paths and whose values are the files'
   `utf8` contents.
8. **An empty window writes a manifest and no archive.** RED. Spawn with a 1970 window; assert
   exit 0, `artifact_count: 0`, no `.tar.gz`, no `.json` — the `inputs.length > 0` guard.
9. **The default root is unchanged when the variable is unset.** GREEN-by-construction guard
   against the seam becoming a behaviour change: spawn with `CTOC_EVIDENCE_ROOT` deleted from
   the child env and a 1970 window, and assert the manifest was written under the **repository**
   `.ctoc/evidence-packs/`; delete it in `finally`. Keep this case last and keep its cleanup
   unconditional — it is the one case that touches the repository tree, deliberately, because
   the default root is exactly what must not drift.

## Decisions Taken Under Ambiguity

1. **The root seam is an explicit environment variable, not a new argument and not `cwd`.**
   `--root=` would add a public flag to a shipped compliance command (a bigger surface, and a
   path the parser would then need to validate); `process.cwd()` would silently change what an
   existing invocation collects. The variable is inert when unset, so the shipped behaviour is
   byte-identical, and the precedent for a named test seam in production code already ships in
   `PreToolUse.Write.js`.
2. **The bigger root question is NOT decided here.** Installed from the marketplace, this script
   lives in the plugin cache, so `__dirname/../..` is the plugin, not the human's project — an
   evidence pack about the wrong repository. That is a real defect and a real decision (change
   the shipped default, or document that the command runs only from a source checkout). It is
   surfaced at Step 16 for the human; this slice does not change the default.
3. **The manifest's absence from the archive is reported, not fixed.** Case 6 pins the current
   behaviour so the omission is visible; whether an evidence archive must contain its own
   manifest is a compliance decision for the human, and changing it here would be an
   undiscussed change to a regulatory artifact.
4. **The `tar`-absent case fails loudly rather than skipping** if the platform still resolves a
   `tar` binary. A check that quietly no-ops is a check reporting a verdict it never earned.

## Execution Plan

### Step 8: TEST
Write `tests/evidence-pack-main.test.js` with the nine cases above. Run
`node --test tests/evidence-pack-main.test.js` and record which cases are RED and why. Cases 1-8
must be RED before any source edit; case 9 is expected GREEN and is a guard, which must be
stated as such in the run record.

### Step 9: PREPARE
Re-derive the uncovered ranges from the gate's own report (`npm test` prints them) — the line
numbers above are from 2026-08-31 and move with every commit. Confirm `tar` is present on the
build machine, confirm `os.tmpdir()` is writable, and confirm `.ctoc/evidence-packs/` is still
absent from `.gitignore` (case 9's cleanup is what keeps the tree clean).

### Step 10: IMPLEMENT
- Sub-item 1: add `resolveRoot()` to `src/scripts/evidence-pack.js` and derive `ROOT` from it.
  No other line of that file changes.
- Sub-item 2: complete the fixture builder and the nine cases so all are GREEN.
- Sub-item 3: write the test file header naming every range this file covers and every range it
  deliberately leaves — with the reason — per the parent plan's classification rule.

### Step 11: REVIEW
Confirm no assertion was loosened, no existing test touched, no baseline or exemption added, and
no function under test mocked. Account for every case that was GREEN before implementation.
Confirm the default-root guard (case 9) leaves no file behind.

### Step 12: OPTIMIZE
One fixture builder shared by the cases; one spawn helper. No sleeps, no retries — a retry turns
a flaky check into a slow check that lies.

### Step 13: SECURE
Confirm: no shell anywhere; the child's environment carries no secret; nothing outside
`os.tmpdir()` is written except case 9's deliberate, cleaned-up default-root artifact; the
fixture's bytes are invented and non-secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason for the `tar` case on a
platform that cannot remove `tar` from `PATH`), coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record `src/scripts/evidence-pack.js`'s new percentage; the
parent plan's target for this file is at or above 95 %. `node --test` alone is NOT the gate.

### Step 15: DOCUMENT
Document `resolveRoot` and `CTOC_EVIDENCE_ROOT` in the script's header block, stating that the
default is unchanged and that the variable names the project the pack is ABOUT.

### Step 16: FINAL-REVIEW
Report to the human, in plain words: the measured coverage of the file before and after; the
three drift findings (root resolution under an installed plugin, the manifest not being inside
the archive, `tar`-absent being a fallback rather than a failure); and the contradictory comment
about child-process coverage in `tests/pretooluse-write-coverage.test.js`. Each is a decision the
human schedules, not work this slice performs.


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
