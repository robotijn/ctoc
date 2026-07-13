---
title: "W01-s1 — Shared deny mechanism (Edit + Write emit a real deny)"
type: feature
parent_plan: "ctoc-audit-w01-enforcement-blocks"
depends_on: none
files:
  - src/lib/hook-deny-signal.js
  - tests/hook-deny-signal.test.js
  - src/hooks/PreToolUse.Edit.js
  - src/hooks/PreToolUse.Write.js
  - tests/w01-edit-write-deny-protocol.test.js
  - tests/e2e-enforcement-and-gates.test.js
priority: HIGH
---

# W01-s1 — Shared deny mechanism (Edit + Write emit a real deny)

**Parent:** `ctoc-audit-w01-enforcement-blocks` (functional plan; see it for ASSESS/
ALIGN/CAPTURE, the 10 BDD scenarios, and ADR-1 the deny protocol). This is slice
**(a)** — the shared deny mechanism used by Edit and Write. It is the foundation the
other two slices reuse: s2 (Bash) and s3 (MultiEdit/NotebookEdit) both call the same
emitter this slice creates.

Fixes finding **C1** on the Edit surface (and Write, which delegates to Edit's
`enforce()`): `PreToolUse.Edit.js`'s `block()` currently ends in `process.exit(1)`
(`src/hooks/PreToolUse.Edit.js:141`). The Claude Code harness treats exit 1 as a
non-blocking error — the "BLOCKED" banner prints and the edit proceeds. This slice
replaces that cosmetic signal with the real harness deny protocol, centralized in ONE
module so every surface signals identically (ADR-1).

## Implementation Details

### Architecture Decision (see parent ADR-1 for full rationale)

Create ONE dependency-free module, `src/lib/hook-deny-signal.js`, as the single point
of protocol truth. Both this slice's `PreToolUse.Edit.js` block-path and s2's five
`PreToolUse.Bash.js` block sites call its `emitDeny()`. Centralizing the protocol is
what prevents a repeat of C1 (a deny signal defined by scattered, tribal-knowledge
`process.exit(N)` calls). Protocol shape (confirmed clean because both hooks write
their human banners to **stderr** — `src/lib/ui.js:216` `writeToTerminal` → `process.
stderr`, and `PreToolUse.Edit.js:123-128` `block()` → `process.stderr` — so **stdout
carries only the decision JSON**):

- **Primary (this slice implements):** write the Claude Code PreToolUse decision JSON
  to **stdout** and `process.exit(0)`:
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
  "permissionDecisionReason":<reason>}}`. Self-describing; the test asserts the
  semantic field, not an opaque numeral.
- **Fallback (documented, one-line swap inside `emitDeny` only):** `process.exit(
  HARNESS_BLOCK_EXIT_CODE)` where `HARNESS_BLOCK_EXIT_CODE = 2`. Used only if the
  Step-9 doc check finds the installed harness ignores the JSON channel.
- **Allow stays exit-0-silent — do NOT emit an allow-JSON.** An explicit
  `permissionDecision:"allow"` would force-bypass the permission system (over-permit);
  the current silent exit 0 preserves the normal permission flow. Only the DENY path
  emits JSON.

### Dependency Graph (this slice)

```
src/lib/hook-deny-signal.js         (CREATE, no deps)
  └─ tested-by → tests/hook-deny-signal.test.js                 (CREATE)
  └─ required-by → src/hooks/PreToolUse.Edit.js  (MODIFY block()/require)
                     └─ delegated-from → src/hooks/PreToolUse.Write.js (COVERED, no edit)
                     └─ behavior-tested-by → tests/w01-edit-write-deny-protocol.test.js (CREATE)
                     └─ legacy-assertion-flipped-in → tests/e2e-enforcement-and-gates.test.js (MODIFY)
```
No cycles. `hook-deny-signal.js` imports nothing first-party (only optionally nothing);
it must remain dependency-free so it can never fail to load the enforcement signal.

### File Specifications

#### `src/lib/hook-deny-signal.js` — CREATE
Purpose: single source of truth for the PreToolUse deny protocol.
Exports:
- `HARNESS_BLOCK_EXIT_CODE` = `2` — named constant documenting the harness hard-block
  exit code (used by the fallback and asserted by tests; never a bare literal `2`).
- `denyDecision(reason: string)` → `object` — PURE. Returns
  `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
  permissionDecisionReason: String(reason || 'CTOC enforcement: blocked') } }`. No I/O.
  This is the function the unit test pins the protocol shape against.
- `emitDeny(reason: string, opts?: { stream?, exit? })` → never returns — writes
  `JSON.stringify(denyDecision(reason))` to `opts.stream` (default `process.stdout`)
  then calls `opts.exit` (default `process.exit`) with `0`. `opts` exists ONLY so the
  unit test can capture the emitted JSON and the exit code without killing the test
  process; production passes no `opts`.
Cross-platform: pure string/JSON + process streams; no paths, no shell.

#### `src/hooks/PreToolUse.Edit.js` — MODIFY
- Add at top (literal require, first-party dependency-free — NOT fail-soft; enforcement
  cannot signal deny without it):
  `const { emitDeny } = require('../lib/hook-deny-signal');`
- In `block(reason, info)` (`:122-142`): keep the stderr human banner (`:123-128`) and
  the `enforcementLog.logEnforcement({... outcome:'block'})` call (`:129-140`) exactly
  as-is. Replace the final `process.exit(1)` (`:141`) with:
  `emitDeny(\`CTOC: no active plan covers "${info.target_file || '(unknown)'}" and no
  escape phrase was used. Create/activate a covering plan via /ctoc:menu, or use an
  escape phrase (hotfix, trivial fix, urgent).\`);`
- Do NOT touch `allow()` (`:144-158`) — it stays `process.exit(0)` silent. Do NOT touch
  `enforce()`'s decision flow (`:175-223`), the whitelist, coverage, or escape-phrase
  logic — W01 changes HOW a decision is signaled, never WHAT is decided.

#### `src/hooks/PreToolUse.Write.js` — COVERED, no edit expected
It already delegates to Edit's exported `enforce()` (`:280-317`), which calls the
now-fixed `block()`. Listed in `files:` so the coverage hook does not block a
last-resort touch; the expectation is zero edits.

### Test Plan

#### `tests/hook-deny-signal.test.js` — CREATE (module + test together)
Node `node:test`. Unit-level, no spawning:
1. `denyDecision('r')` returns exactly the documented object — asserts
   `hookSpecificOutput.hookEventName === 'PreToolUse'`,
   `hookSpecificOutput.permissionDecision === 'deny'`,
   `hookSpecificOutput.permissionDecisionReason === 'r'`.
2. `emitDeny('r', { stream, exit })` with an injected string-capturing `stream` and a
   capturing `exit`: the captured stdout parses to the same object as (1), and `exit`
   was called with `0`. Proves the emitter writes ONLY the JSON and exits 0.
3. `HARNESS_BLOCK_EXIT_CODE === 2` (pins the fallback constant).
4. `denyDecision(undefined)` yields a non-empty string reason (no `undefined` leaking
   into the harness payload).

#### `tests/w01-edit-write-deny-protocol.test.js` — CREATE (subprocess behavior)
Spawn the REAL hooks with `spawnSync(process.execPath, [HOOK], { input: JSON, cwd:
tmpProject, env: { ...process.env, CLAUDE_TOOL_INPUT: '' } })`, mirroring the proven
pattern in `tests/plan-index-duplicate-hook.test.js:277-291` and `tests/
e2e-enforcement-and-gates.test.js`. A tiny helper parses the LAST JSON object on
stdout and returns `{ status, denied: parsed?.hookSpecificOutput?.permissionDecision
=== 'deny', stdout, stderr }`. Fixtures: a temp CTOC project (has `.ctoc/`), a target
`src/lib/x.js` covered by no plan, and — for allow cases — an in-progress plan
declaring `files: ["src/**"]` and a transcript containing `hotfix`.
1. **Uncovered Edit is prevented** (BDD "Uncovered Edit"): spawn `PreToolUse.Edit.js`,
   uncovered target, no escape → `denied === true`; and the target file's bytes are
   byte-identical before/after (write a known target first, assert unchanged).
2. **Uncovered Write is prevented via delegate** (BDD "Uncovered Write"): spawn
   `PreToolUse.Write.js`, uncovered non-plan target → `denied === true`, identical deny
   shape as (1); no bytes written.
3. **Plan-covered Edit is ALLOWED** (BDD "Plan-covered"): covering plan present →
   `denied === false` (assert ABSENCE of the deny signal on stdout — exit 0 alone is
   necessary-but-not-sufficient now that deny is also exit 0).
4. **Escape phrase still allows** (BDD "Escape phrase"): transcript has `hotfix` →
   `denied === false`.
5. **Deny reason names the target** — the emitted `permissionDecisionReason` (or the
   stderr banner) contains the target path, proving the real target was evaluated.

#### `tests/e2e-enforcement-and-gates.test.js` — MODIFY (flip the bug-encoding assertion)
Test "1. blocks a non-whitelisted file..." (`:170`) currently asserts
`assert.equal(res.status, 1, 'should BLOCK (exit 1)')` — this is the false-green that
let C1 ship. Change it to parse stdout and assert `permissionDecision === 'deny'`
(keep the `assert.match(res.stderr, /BLOCKED/)` banner check). The allow tests (#3
covering-plan, #4 escape, #5 non-CTOC) currently assert `status === 0`; strengthen
each to ALSO assert the deny signal is ABSENT from stdout (exit 0 no longer
distinguishes allow from deny). Do NOT alter the whitelist tests 2a/2b/2c/2d — their
`status === 0` allow contract is unchanged and their separate (deliberately-failing)
whitelist bug is out of W01's scope.

### Security Review
- [ ] No new path handling; no user path is resolved by the emitter. N/A for traversal.
- [ ] `emitDeny` writes only a fixed-shape JSON built from a first-party reason string
      (no untrusted interpolation into a shell; `permissionDecisionReason` is data).
- [ ] No secrets; the reason strings contain only the target path already in the payload.
- [ ] Fail-open posture preserved: a require failure of the emitter crashes the hook
      before `enforce()` (tool proceeds) — consistent with the file's documented
      fail-open contract; no NEW fail-closed surface introduced.
- [ ] No prototype pollution: `denyDecision` returns a fresh object literal.

## Execution Plan

### Step 8: TEST
Write the failing tests FIRST (TDD red), asserting BEHAVIOR (the tool is prevented /
the deny signal is emitted), never "the hook returns 1":
(a) Create `tests/hook-deny-signal.test.js` with the 4 unit cases above — these fail
because `src/lib/hook-deny-signal.js` does not exist yet.
(b) Create `tests/w01-edit-write-deny-protocol.test.js` with the 5 subprocess cases —
cases 1/2/5 (deny + reason) FAIL today because Edit/Write exit 1 with no stdout JSON;
cases 3/4 (allow) already pass and guard against regression.
(c) Edit `tests/e2e-enforcement-and-gates.test.js`: flip test #1 to assert
`permissionDecision === 'deny'` — now RED against the un-fixed hook.
Run `node --test tests/hook-deny-signal.test.js tests/w01-edit-write-deny-protocol.test.js
tests/e2e-enforcement-and-gates.test.js` and confirm the new deny assertions are RED.

### Step 9: PREPARE
Confirm the harness contract before coding (the parent's deferred caveat): WebFetch the
Claude Code hooks reference (docs.claude.com hooks page) and confirm the current
PreToolUse advanced-output shape is `hookSpecificOutput.permissionDecision` with values
`allow|deny|ask` on stdout + exit 0. If the installed harness predates the JSON channel,
note it and plan the `HARNESS_BLOCK_EXIT_CODE` fallback inside `emitDeny`. Re-read
`src/hooks/PreToolUse.Edit.js:122-158` (block/allow) and `src/lib/ui.js:215-216` to
re-confirm banners are on stderr (stdout stays JSON-clean). No new npm deps.

### Step 10: IMPLEMENT
ONE step, ordered sub-items:
(a) Create `src/lib/hook-deny-signal.js` (`HARNESS_BLOCK_EXIT_CODE`, `denyDecision`,
`emitDeny`) per the File Specification. Run `node --test tests/hook-deny-signal.test.js`
→ green.
(b) Edit `src/hooks/PreToolUse.Edit.js`: add the `emitDeny` require at top; replace the
`process.exit(1)` in `block()` (`:141`) with the `emitDeny(...)` call. Leave `allow()`,
`enforce()`, whitelist, coverage, escape-phrase untouched.
(c) Run `node --test tests/w01-edit-write-deny-protocol.test.js` → green (Edit AND the
Write delegate now emit the deny JSON; allow paths still allow).

### Step 11: REVIEW
Self-review: only `block()`'s exit line changed in Edit.js; `allow()` still silent exit
0; no allow-JSON added; decision logic byte-unchanged; the emitter is dependency-free;
Write.js untouched; the e2e flip asserts the semantic field, not a numeral.

### Step 12: OPTIMIZE
Confirm the protocol lives in exactly ONE place (`emitDeny`); no duplicated JSON literal
in Edit.js. Nothing else to optimize (a ~30-line pure module).

### Step 13: SECURE
Run the Security Review checklist above. Confirm stdout carries ONLY the JSON on the
deny path (no `console.log`/banner leaking to stdout would corrupt the harness parse) —
grep the deny path for `process.stdout`/`console.log` outside `emitDeny`.

### Step 14: VERIFY
`node --test tests/hook-deny-signal.test.js tests/w01-edit-write-deny-protocol.test.js
tests/e2e-enforcement-and-gates.test.js` → `# fail 0`, then the FULL suite
`node --test tests/*.test.js` → `# fail 0`, 0 skipped (catches any other test that
depended on Edit's old exit-1 deny — flip those too if surfaced).

### Step 15: DOCUMENT
The JSDoc on `hook-deny-signal.js` documents the protocol and the fallback. Add a
one-line note in `PreToolUse.Edit.js`'s header comment that `block()` now emits the
shared deny via `../lib/hook-deny-signal` (replacing the exit-1 cosmetic signal).

### Step 16: FINAL-REVIEW
Confirm: this slice edits only its six declared files; deny is observable as
`permissionDecision:"deny"` on stdout for Edit and Write; allow paths remain silent
exit 0; the false-green e2e assertion is flipped; suite green; the emitter is ready for
s2 and s3 to reuse.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| A stray banner/`console.log` on stdout corrupts the JSON parse | Banners go to stderr (confirmed ui.js:216, Edit:123-128); Step 13 greps the deny path for stdout writes | Step 13 |
| Installed harness ignores the JSON channel | `HARNESS_BLOCK_EXIT_CODE` fallback is a one-line swap inside `emitDeny`; Step 9 confirms against live docs | Step 9 / emitter |
| Allow tests false-green now that deny is also exit 0 | Allow assertions strengthened to assert ABSENCE of the deny JSON, not just exit 0 | Step 8 (e2e + new test) |
| Another suite test asserted Edit's old exit-1 deny | Full-suite VERIFY surfaces it; flip to the deny-JSON assertion | Step 14 |
