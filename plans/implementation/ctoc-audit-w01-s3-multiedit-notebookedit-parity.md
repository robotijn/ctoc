---
title: "W01-s3 — MultiEdit + NotebookEdit enforce via enforce() (C3) + 5-surface uniform capstone"
type: feature
parent_plan: "ctoc-audit-w01-enforcement-blocks"
depends_on: ctoc-audit-w01-s1-shared-deny-mechanism, ctoc-audit-w01-s2-bash-stdin-gate
files:
  - src/hooks/PreToolUse.MultiEdit.js
  - src/hooks/PreToolUse.NotebookEdit.js
  - tests/w01-multiedit-notebookedit-parity.test.js
priority: HIGH
---

# W01-s3 — MultiEdit + NotebookEdit enforce via enforce() (C3) + uniform capstone

**Parent:** `ctoc-audit-w01-enforcement-blocks`. This is slice **(c)** — MultiEdit and
NotebookEdit delegating to the exported `enforce()`. **Depends on s1** (they route
through Edit's `enforce()` → `block()` → the shared `emitDeny`) and **s2** (this slice
owns the 5-surface uniform capstone test, which spawns the Bash gate fixed in s2).

Fixes finding **C3**: `src/hooks/PreToolUse.MultiEdit.js:8` and
`src/hooks/PreToolUse.NotebookEdit.js:7` each contain only
`require('./PreToolUse.Edit.js')`. Since PI5-s2, Edit's enforcement runs only under
`if (require.main === module)` (`src/hooks/PreToolUse.Edit.js:231-233`). When Edit.js is
loaded via `require()` from a sibling, `require.main` is the sibling — the guard is
false, the IIFE never runs, and **neither file enforces anything**. `enforce(parsed)`
already exists as a stdin-decoupled export (`:175, :225`); this slice adds the missing
`main()` to each delegate that reads stdin once and calls it — the proven
`PreToolUse.Write.js:280-317` pattern, minus Write's advisory guard.

## Implementation Details

### Architecture Decision
Do NOT create a new `enforce()` — it exists and already emits s1's protocol via
`block()`. Each delegate gains its OWN `main()` (its own process entry) so enforcement
no longer depends on `PreToolUse.Edit.js` being `require.main` (BDD "enforce() fires
from a sibling entry point"). The delegate copies Write's `main()` skeleton but omits
the duplicate-guard `run()` — MultiEdit/NotebookEdit have no advisory concern, only
enforcement. `enforce()` reads `tool_name` from the payload for correct logging, and
`getTargetFile()` already handles `file_path` (MultiEdit) and `notebook_path`
(NotebookEdit) (`src/hooks/PreToolUse.Edit.js:100-102`), so no Edit.js change is needed.

### Dependency Graph (this slice)
```
src/hooks/PreToolUse.Edit.js  (enforce export, from s1's block()/emitDeny)
  ├─ delegated-from → src/hooks/PreToolUse.MultiEdit.js   (MODIFY: add main())
  └─ delegated-from → src/hooks/PreToolUse.NotebookEdit.js(MODIFY: add main())
src/hooks/PreToolUse.Bash.js  (from s2) ─┐
Edit/Write/MultiEdit/NotebookEdit ───────┴─ all-spawned-by →
        tests/w01-multiedit-notebookedit-parity.test.js (CREATE: parity + 5-surface capstone)
```
No cycles. Depends on s1 (deny protocol) and s2 (capstone spawns the Bash gate).

### File Specifications

#### `src/hooks/PreToolUse.MultiEdit.js` — MODIFY
Replace the bare `require('./PreToolUse.Edit.js')` (`:8`) with an explicit `main()` that
owns the single stdin read and delegates. Mirror `PreToolUse.Write.js:255-325` minus the
advisory guard:
```
#!/usr/bin/env node
/** CTOC v7 PreToolUse Enforcement Hook — MultiEdit.
 *  Reads the PreToolUse payload from stdin ONCE (single-consumer pipe) and calls the
 *  exported enforce(parsed) from PreToolUse.Edit.js, so enforcement does NOT depend on
 *  Edit.js being require.main === module (the C3 fix). enforce() reads tool_name from
 *  the payload, so logs distinguish MultiEdit from Edit. */
const fs = require('fs');
function readStdinJson() {
  try { const buf = fs.readFileSync(0, 'utf8'); return buf ? JSON.parse(buf) : null; }
  catch { return null; }
}
async function main() {
  let enforce;
  try { ({ enforce } = require('./PreToolUse.Edit.js')); }
  catch (err) {
    process.stderr.write(`[CTOC] MultiEdit hook: enforcement delegate failed to load (failing open): ${err.message}\n`);
    process.exit(0); return;
  }
  if (typeof enforce !== 'function') {
    process.stderr.write('[CTOC] MultiEdit hook: enforcement delegate has no enforce() (failing open)\n');
    process.exit(0); return;
  }
  await enforce(readStdinJson());
}
module.exports = { main };
if (require.main === module) { main(); }
```

#### `src/hooks/PreToolUse.NotebookEdit.js` — MODIFY
Identical structure, header says NotebookEdit, replacing the bare `require()` at `:7`.
`getTargetFile()` already resolves `notebook_path`, so no Edit.js change is needed.

### Test Plan

#### `tests/w01-multiedit-notebookedit-parity.test.js` — CREATE (subprocess)
Spawn each hook as its OWN process entry (`spawnSync(process.execPath, [HOOK], { input,
cwd: tmpProject, env: { ...process.env, CLAUDE_TOOL_INPUT: '' } })`) — never
`PreToolUse.Edit.js` with a substituted `tool_name` (an in-process/wrong-entry test
would not catch C3). Reuse the deny-parse helper shape from s1's test. Fixtures: temp
CTOC project, uncovered target, plus a covering plan for the allow case.
1. **MultiEdit blocked exactly like a single Edit** (BDD): spawn
   `PreToolUse.MultiEdit.js`, uncovered `file_path` → `permissionDecision === 'deny'`,
   identical shape to Edit; target bytes unchanged.
2. **NotebookEdit blocked exactly like a single Edit** (BDD): spawn
   `PreToolUse.NotebookEdit.js`, uncovered `notebook_path` → `deny`; notebook unchanged.
3. **enforce() fires from a sibling entry point** (BDD): assert (1) proves enforcement
   does NOT depend on `PreToolUse.Edit.js` being `require.main` — MultiEdit is the
   entry, yet a deny is emitted.
4. **Plan-covered MultiEdit/NotebookEdit allowed** (BDD "Plan-covered"): covering plan
   present → deny signal ABSENT (assert absence, not merely exit 0).
5. **CAPSTONE — uniform protocol across all five surfaces** (BDD "Uniform protocol"):
   spawn Edit, Write, MultiEdit, NotebookEdit each with the same uncovered target, and
   the Bash gate with `rm -rf plans` on stdin; parse each stdout and assert ALL FIVE
   yield the byte-identical deny shape `{hookSpecificOutput:{hookEventName:'PreToolUse',
   permissionDecision:'deny', ...}}` — no surface diverges. This is why the slice
   depends on s2 (the Bash surface must already emit the shared protocol).

### Security Review
- [ ] No new path handling; `getTargetFile()` (unchanged) already normalizes/validates
      the target — no new traversal surface.
- [ ] Fail-open preserved: a delegate-load failure exits 0 (tool proceeds) with a stderr
      note — matches Write's proven pattern; no new fail-closed path.
- [ ] Single stdin read per process (single-consumer pipe) — no double-drain.
- [ ] No secrets; no shell-out; no dynamic `require(variable)` (literal require only,
      keeps `security/detect-non-literal-require` clean).
- [ ] `main()` is `require.main`-guarded so importing the module in a test never
      consumes stdin or exits.

## Execution Plan

### Step 8: TEST
Write `tests/w01-multiedit-notebookedit-parity.test.js` with the 5 cases above FIRST
(TDD red), asserting BEHAVIOR (the MultiEdit/NotebookEdit tool call is prevented / the
deny signal is emitted from the sibling's own entry point), never "the hook returns 1".
Cases 1/2/3/5 FAIL today because the bare `require()` runs no enforcement (the spawned
MultiEdit/NotebookEdit process exits 0 with no deny JSON); case 4 (allow) guards
regression. Run `node --test tests/w01-multiedit-notebookedit-parity.test.js` and
confirm the deny/capstone assertions are RED.

### Step 9: PREPARE
Re-read `src/hooks/PreToolUse.Write.js:255-325` (the `main()` + `readStdinRaw` skeleton
to copy) and `src/hooks/PreToolUse.Edit.js:175,225,231-233` (confirm `enforce` is
exported and its IIFE is `require.main`-guarded). Confirm s1 (deny protocol) and s2
(Bash gate) have landed so the capstone's five surfaces all emit the shared signal.

### Step 10: IMPLEMENT
ONE step, ordered sub-items:
(a) Rewrite `src/hooks/PreToolUse.MultiEdit.js` with its own `main()` per the File
Specification (replace the bare `require()`).
(b) Rewrite `src/hooks/PreToolUse.NotebookEdit.js` identically (NotebookEdit header).
(c) Run `node --test tests/w01-multiedit-notebookedit-parity.test.js` → green (both
delegates now deny from their own entry; the 5-surface capstone shows one uniform shape).

### Step 11: REVIEW
Self-review: each delegate reads stdin once and calls `enforce(parsed)`; `main()` is
`require.main`-guarded; fail-open on delegate-load failure; no advisory-guard code
copied in (that is Write-only); Edit.js untouched (enforce already handles
`file_path`/`notebook_path` and `tool_name`).

### Step 12: OPTIMIZE
Confirm the two delegates are minimal and identical apart from their header/log label;
no duplication of enforcement logic (they call the shared `enforce()`). Nothing else to
optimize.

### Step 13: SECURE
Run the Security Review checklist above. Confirm literal `require('./PreToolUse.Edit.js')`
(no dynamic require), single stdin read, and fail-open delegate loading.

### Step 14: VERIFY
`node --test tests/w01-multiedit-notebookedit-parity.test.js` → `# fail 0`; then the
FULL suite `node --test tests/*.test.js` → `# fail 0`, 0 skipped. The capstone proves
all five PreToolUse surfaces emit the identical `permissionDecision:"deny"` shape —
the parent's "Uniform protocol across all five surfaces" acceptance criterion.

### Step 15: DOCUMENT
Each delegate's header comment documents that it is its OWN process entry that reads
stdin once and delegates to `enforce()` — enforcement no longer depends on
`require.main === module` in the sibling (the C3 fix).

### Step 16: FINAL-REVIEW
Confirm: this slice edits only its three declared files; MultiEdit and NotebookEdit
each deny an uncovered target from their own entry point, identical to Edit; covered
targets allow; the 5-surface capstone is green; suite green — W01 complete (all of
C1/C2/C3 observable end-to-end).

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Capstone spawns the Bash gate before s2 lands | `depends_on` includes s2; sequential FIFO build guarantees s2 is built first | frontmatter / Step 9 |
| A test imports the delegate in-process instead of spawning it (would not catch C3) | Every case spawns the delegate as its OWN process entry via `spawnSync([HOOK])` | Step 8 |
| Copying Write's `main()` drags in the advisory guard | Copy the skeleton only; omit `run()`/`resolveCheckDuplicate` — enforcement-only | Step 10(a) |
| NotebookEdit's `notebook_path` not resolved | `getTargetFile()` already handles `notebook_path` (Edit.js:100-102) — verified in Step 9, no Edit.js change | Step 9 |
