---
title: "W01-s2 — Bash gate reads stdin and emits a real deny (C1+C2)"
type: feature
parent_plan: "ctoc-audit-w01-enforcement-blocks"
depends_on: ctoc-audit-w01-s1-shared-deny-mechanism
files:
  - src/hooks/PreToolUse.Bash.js
  - tests/security-bash-hook.test.js
  - tests/e2e-enforcement-and-gates.test.js
priority: HIGH
---

# W01-s2 — Bash gate reads stdin and emits a real deny (C1+C2)

**Parent:** `ctoc-audit-w01-enforcement-blocks`. This is slice **(b)** — the Bash gate.
**Depends on s1**: it reuses the `emitDeny()` / `HARNESS_BLOCK_EXIT_CODE` created in
`src/lib/hook-deny-signal.js`.

Fixes findings **C2 and C1 together** in one file (the parent proves they are a single
combined defect — fixing either alone still lets every dangerous command through):

- **C2:** `getCommand()` (`src/hooks/PreToolUse.Bash.js:268-278`) reads
  `process.env.CLAUDE_TOOL_INPUT` (`:269`), which the harness never sets. The payload
  arrives on **stdin**. So `getCommand()` always returns `''`, and `main()`'s first
  check `if (!command) process.exit(0)` (`:320-322`) allows every command unread.
- **C1:** all five block sites — irreversible (`:336`), raw plan `mv`/`cp` (`:363`),
  premature commit (`:376`), write-without-feature (`:388`), write-before-Step-8
  (`:395`) — end in `process.exit(1)`, which the harness does not treat as a block.

## Implementation Details

### Architecture Decision
Reuse s1's shared protocol verbatim — the Bash gate must emit the IDENTICAL deny signal
as Edit/Write (parent success metric: "all five surfaces emit the identical deny signal
shape"). No new protocol logic in this file; it imports `emitDeny` from
`../lib/hook-deny-signal`. The Bash gate's human banners already go to **stderr** via
`writeToTerminal` (`src/lib/ui.js:216`), so stdout stays clean for the decision JSON.

### Dependency Graph (this slice)
```
src/lib/hook-deny-signal.js  (from s1)
  └─ required-by → src/hooks/PreToolUse.Bash.js (MODIFY getCommand + 5 block sites)
                     └─ behavior-tested-by → tests/security-bash-hook.test.js (MODIFY: flip input channel + deny protocol)
                     └─ legacy-assertion-reconciled-in → tests/e2e-enforcement-and-gates.test.js (MODIFY: Bash gate region)
```
No cycles. Depends only on s1.

### File Specifications

#### `src/hooks/PreToolUse.Bash.js` — MODIFY
- Add requires at top: `const fs = require('fs');` and
  `const { emitDeny } = require('../lib/hook-deny-signal');` (Bash.js currently requires
  only `state-manager` and `ui`).
- Rewrite `getCommand()` (`:268-278`) to read the PreToolUse payload from **stdin (fd
  0)**, mirroring `PreToolUse.Edit.js:84-89`'s `readStdinJson()`:
  ```
  function getCommand() {
    let raw = '';
    try { raw = fs.readFileSync(0, 'utf8') || ''; } catch { return ''; }
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return (parsed && parsed.tool_input && parsed.tool_input.command)
        || (parsed && parsed.command) || '';
    } catch {
      const m = raw.match(/command['":\s]+["']?([^"'\n]+)/);
      return m ? m[1] : '';
    }
  }
  ```
  It must NOT read `process.env.CLAUDE_TOOL_INPUT` anywhere in the command-acquisition
  path (parent success metric: "Zero remaining reads of `process.env.CLAUDE_TOOL_INPUT`
  in the command-acquisition path"). `main()` reads stdin exactly once via this single
  `getCommand()` call at `:318` (single-consumer pipe — unchanged call site).
- Replace `process.exit(1)` at all FIVE block sites with `emitDeny(<reason>)`, keeping
  each site's `writeToTerminal(formatBlocked(...))` / banner on stderr exactly as-is:
  - `:336` irreversible → `emitDeny(\`CTOC: irreversible/destructive command blocked: ${command}\`)`
  - `:363` raw plan move → `emitDeny(\`CTOC: raw mv/cp of a plan file blocked — plan moves must go through the menu (human gate): ${command}\`)`
  - `:376` premature commit → `emitDeny(\`CTOC: commit blocked before Step ${MINIMUM_STEP_FOR_COMMIT} (DOCUMENT). Current step ${currentStep}.\`)`
  - `:388` write-no-feature → `emitDeny('CTOC: write command blocked — no active feature context.')`
  - `:395` write-before-step-8 → `emitDeny(\`CTOC: write command blocked — planning not complete (step ${currentStep} < ${MINIMUM_STEP_FOR_WRITE}).\`)`
  Each deny reason INCLUDES the real `command` where relevant, so a test can prove the
  command was read from stdin (BDD "reported blocked command matches the actual command").
- Leave `if (!command) process.exit(0)` (`:320-322`) — empty command still allows, but
  `command` is now the real stdin command, so it is empty only when genuinely empty.
- OUT OF SCOPE (parent): the top-level `main().catch(err => {...; process.exit(1)})`
  (`:403-406`) fail-open/closed posture — do NOT touch. Decision logic (WRITE_PATTERNS,
  IRREVERSIBLE_PATTERNS, git/rm walkers, commit/write step gates) — do NOT touch; W01
  changes only HOW a deny is signaled and WHERE the command is read.

### Test Plan

#### `tests/security-bash-hook.test.js` — MODIFY (input channel + deny protocol flip)
This file is the existing spawned-subprocess Bash test and currently ENCODES BOTH bugs:
its helper delivers commands via `env: { CLAUDE_TOOL_INPUT: rawToolInput }`
(`:99-101`), and its input-channel contract test (`:136-150`) asserts a command on
stdin is ALLOWED ("stdin is not an input channel; command is invisible → allowed"), and
every block assertion checks `res.status === 1`. Rewrite:
1. Change the spawn helper to deliver the command as JSON on **stdin**:
   `spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name:'Bash',
   tool_input:{ command } }), env: { ...process.env, CLAUDE_TOOL_INPUT: '' } })`.
2. Change `assertBlocked`/`assertAllowed` to parse stdout for
   `hookSpecificOutput.permissionDecision` — `deny` = blocked, absent = allowed (not
   `res.status`, per parent Test Strategy point 2).
3. INVERT the input-channel contract test → **"reads the command from stdin (not
   `CLAUDE_TOOL_INPUT` env)"**: give `rm -rf plans` on stdin with `CLAUDE_TOOL_INPUT`
   unset → assert `deny` (BDD "Bash gate reads the real transport"). This is the C2
   regression guard.
4. Add BDD "does not fall through to allow-by-default": `git push --force` on stdin,
   `CLAUDE_TOOL_INPUT` unset → assert `deny`; the test explicitly FAILS if allow.
5. Add "reported blocked command matches stdin": assert the `rm -rf plans` string
   appears in the deny reason or the stderr banner (proves getCommand read stdin, not
   defaulted to empty).
6. The edge-case tests (`:329-366`, empty/null/missing command → allow) stay valid:
   with genuinely empty stdin, `getCommand()` returns `''` → allow. Keep them, but they
   now feed empty **stdin** rather than empty env.

#### `tests/e2e-enforcement-and-gates.test.js` — MODIFY (Bash gate region only)
The gate-hook helper (`:104-110`) currently asserts `res.status === 0` ("gate hook
should always exit 0") — trivially true today because the gate is inert. Under s1's
protocol a deny is still exit 0 (JSON on stdout), so keep the exit-0 shape BUT add: for
a dangerous command on stdin, assert stdout carries `permissionDecision:"deny"`; for a
benign command, assert it does not. Deliver the command on stdin (not env). Touch ONLY
the Bash/gate-hook region of this file — s1 already owns the Edit-assertion region;
edits here are disjoint and land after s1.

### Security Review
- [ ] Command injection: the command string is only pattern-matched (existing literal
      RegExps) and embedded as DATA into `permissionDecisionReason` — never interpolated
      into a shell. No `exec`/`execSync` added.
- [ ] Stdin read is `try/catch` fail-open (returns `''` → allow) — a broken pipe cannot
      crash the gate; consistent with the hook's documented posture.
- [ ] No `process.env.CLAUDE_TOOL_INPUT` read remains in the command path (grep-verified
      in Step 14).
- [ ] ReDoS: no new RegExp on untrusted input; the fallback `command['":\s]+...` regex
      is a bounded literal, matching the existing Edit.js pattern.
- [ ] The deny reason includes the raw command; it goes to `permissionDecisionReason`
      (data to the model) and the stderr banner (already truncated to 60 chars at
      `:289-291`) — no secret exposure beyond the command the user already typed.

## Execution Plan

### Step 8: TEST
Write failing tests FIRST (TDD red), asserting BEHAVIOR (the destructive command is
prevented / the deny signal fires), never "the hook returns 1":
(a) Edit `tests/security-bash-hook.test.js`: flip the spawn helper to stdin, flip
assertions to parse `permissionDecision`, INVERT the input-channel contract test, and
add the "no fall-through to allow" + "reported command matches stdin" cases. Against the
un-fixed hook these are RED (the hook reads empty env → allows `rm -rf`, and exits 1
with no JSON).
(b) Edit the Bash region of `tests/e2e-enforcement-and-gates.test.js` to deliver on
stdin and assert `permissionDecision:"deny"` for a dangerous command — RED today.
Run `node --test tests/security-bash-hook.test.js tests/e2e-enforcement-and-gates.test.js`
and confirm the new deny assertions FAIL against the current inert gate.

### Step 9: PREPARE
Re-read `src/hooks/PreToolUse.Edit.js:84-89` (`readStdinJson`) to copy the stdin-read
pattern, and `src/hooks/PreToolUse.Bash.js:316-401` (`main` + all five block sites) to
confirm exact line targets. Confirm `emitDeny` is exported from
`src/lib/hook-deny-signal.js` (s1 landed). Confirm `writeToTerminal` → stderr
(`src/lib/ui.js:216`) so stdout stays JSON-clean. No new npm deps.

### Step 10: IMPLEMENT
ONE step, ordered sub-items:
(a) Add `const fs = require('fs');` and `const { emitDeny } = require('../lib/hook-deny-signal');`.
(b) Rewrite `getCommand()` to read stdin (fd 0) per the File Specification; remove the
`process.env.CLAUDE_TOOL_INPUT` read.
(c) Replace `process.exit(1)` at `:336`, `:363`, `:376`, `:388`, `:395` with the
corresponding `emitDeny(...)` calls, each keeping its stderr banner and including the
real command where specified.
(d) Run `node --test tests/security-bash-hook.test.js tests/e2e-enforcement-and-gates.test.js`
→ green.

### Step 11: REVIEW
Self-review: getCommand reads ONLY stdin; all five block sites emit the shared deny;
banners still on stderr; decision logic (patterns, git/rm walkers, step gates)
byte-unchanged; the top-level catch (`:403-406`) untouched; `if (!command) exit 0`
retained.

### Step 12: OPTIMIZE
Confirm stdin is read exactly once (single `getCommand()` call at `:318`). No duplicated
deny logic — all five sites funnel through `emitDeny`. Nothing else to optimize.

### Step 13: SECURE
Run the Security Review checklist above. Grep the file to confirm zero remaining
`CLAUDE_TOOL_INPUT` reads in the command path and zero `process.exit(1)` on a deny path.

### Step 14: VERIFY
`node --test tests/security-bash-hook.test.js tests/e2e-enforcement-and-gates.test.js`
→ `# fail 0`; then the FULL suite `node --test tests/*.test.js` → `# fail 0`, 0 skipped
(catches any other test — e.g. `security-enforcement-evasion`, `opuspack-hooks` — that
fed the Bash gate via `CLAUDE_TOOL_INPUT` or asserted exit 1; flip those to stdin +
deny-JSON). `grep -n CLAUDE_TOOL_INPUT src/hooks/PreToolUse.Bash.js` → no command-path
hit.

### Step 15: DOCUMENT
Update `PreToolUse.Bash.js`'s header comment (`:1-10`): input is now stdin (not
`CLAUDE_TOOL_INPUT`), and a block emits the shared `permissionDecision:"deny"` signal
via `../lib/hook-deny-signal` (not exit 1). Fix the stale "Exit codes: 0 allowed / 1
blocked" line.

### Step 16: FINAL-REVIEW
Confirm: this slice edits only its three declared files; `rm -rf`, force-push, raw plan
`mv`, and premature commit each emit `permissionDecision:"deny"` read from stdin; the
reported command matches stdin; benign commands still allow; the C2 input-channel
contract test is inverted and green; suite green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Other suite tests feed the Bash gate via `CLAUDE_TOOL_INPUT` / assert exit 1 | Full-suite VERIFY surfaces them; migrate to stdin + deny-JSON | Step 14 |
| Reading fd 0 blocks when no stdin is piped | `getCommand()` try/catch returns `''` (fail-open → allow); tests spawn with explicit `input` | Step 10(b) |
| A banner leaks to stdout and corrupts the JSON parse | `writeToTerminal` → stderr (confirmed ui.js:216); Step 13 greps for stdout writes | Step 13 |
| Fixing C2 without C1 (or vice-versa) leaves the gate inert | Both land in this single slice — the parent proves they are one combined defect | whole slice |
