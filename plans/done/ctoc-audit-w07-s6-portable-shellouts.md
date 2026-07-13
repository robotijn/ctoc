---
approved_by: human
approved_at: 2026-07-13T20:53:24.845Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.562Z
gate_crossed: implementation → todo
---

---
title: "W07-s6 — Portable shell-outs (SAST runner + disk probe)"
type: feature
parent_plan: "ctoc-audit-w07-cross-platform"
depends_on: none
priority: MEDIUM
files:
  - src/lib/sast-runner.js
  - src/lib/runner-detect.js
  - tests/w07-portable-shellouts.test.js
---

# W07-s6 — Portable shell-outs (SAST runner + disk probe)

**Slice scope:** Finding M13 — the two POSIX-only shell-outs on hot paths. Independent of
the frontmatter slices (`depends_on: none`). `sast-runner` uses `2>/dev/null`/`|| true`
(invalid under `cmd.exe`; `/dev/null` absent on Windows); `runner-detect` shells out to
`df | tail` (absent on a stock Windows install). Replace both with portable, non-shell calls
per the parent's recommendation (`execFileSync`/argument-array; `fs.statfs` for disk).

## Implementation Details

### Dependency Graph
```
src/lib/sast-runner.js   --uses--> child_process.execFileSync (portable, no shell)
src/lib/runner-detect.js --uses--> fs.statfsSync (Node >=18.15; repo runs Node v24)
tests/w07-portable-shellouts.test.js --requires--> both
```
No new inter-module deps. No cycles.

### File Specification — `src/lib/sast-runner.js` (MODIFY)
`runESLintSecurity()` at `:353-371`: `command = 'npx eslint ... 2>/dev/null || true'` (:355)
passed to `execSync(command, { shell: true })` (:357-362).
- Extend the `child_process` import to include `execFileSync`.
- Replace with an argument-array, no-shell invocation. `2>/dev/null` → `stdio` discards
  stderr; `|| true` → a `catch` that reads `error.stdout` (ESLint exits non-zero when it
  finds issues, but still prints JSON to stdout). Cross-platform `npx`:
```js
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
let out = '';
try {
  out = execFileSync(npx, ['eslint', '--plugin', 'security', '--format', 'json', '.'], {
    cwd: this.projectRoot, timeout: this.options.timeout, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],   // replaces 2>/dev/null; no shell
  });
} catch (e) {
  out = (e && e.stdout) ? e.stdout : '';   // replaces `|| true`: findings => non-zero exit + stdout
}
if (out && out.trim()) { this.parseESLintResults(JSON.parse(out)); }
```
The outer `try/catch` (ESLint not configured → ok) stays. Result: no `shell: true`, no
`2>/dev/null`, no `|| true` string present in source.

### File Specification — `src/lib/runner-detect.js` (MODIFY)
`checkDisk()` at `:90-117`: `execSync('df -k "${targetPath}" | tail -1')` (:93) with a
misleading `// Use df command for cross-platform compatibility` comment (:92).
- Require `fs` (`const fs = require('fs');` if not already imported).
- Replace the `df | tail` pipeline with `fs.statfsSync` (no external binary; portable):
```js
function checkDisk(targetPath = os.homedir()) {
  try {
    const st = fs.statfsSync(targetPath);
    const availableGB = Math.floor((st.bavail * st.bsize) / (1024 ** 3));
    return { ok: availableGB >= REQUIREMENTS.MIN_DISK_GB, name: 'Disk Space',
             version: `${availableGB}GB available`,
             message: availableGB < REQUIREMENTS.MIN_DISK_GB ? `Minimum ${REQUIREMENTS.MIN_DISK_GB}GB required` : null };
  } catch {
    return { ok: false, name: 'Disk Space', version: 'Unknown', message: 'Could not detect disk space' };
  }
}
```
- Delete the misleading `df` comment. If `execSync` is now unused in the file, remove its
  import (dead-code); if still used elsewhere, leave it.

### Test Plan — `tests/w07-portable-shellouts.test.js` (CREATE)
Dev machines (macOS/Linux) HAVE `/bin/sh`, `df`, `tail` — so a naive "it ran" test would
pass today and still miss the Windows failure. Assert BOTH the static-source guarantee and
shell-independent behavior:
- STATIC: read `src/lib/sast-runner.js` source; assert it contains no `2>/dev/null`, no
  `|| true`, and no `shell: true`. Read `src/lib/runner-detect.js` source; assert no
  `df ` / `| tail` string.
- BEHAVIOR (runner-detect): `checkDisk()` for a real path returns `{ ok: <bool>, version:
  '<N>GB available' }` with a numeric GB > 0; run it in a child process launched with an
  EMPTY `PATH` and assert it still succeeds (proves no PATH-resolved binary is needed).
- BEHAVIOR (sast-runner): instantiate the runner (per its module export) in a temp dir with
  no ESLint config and assert `runESLintSecurity()` resolves without throwing (the `catch`
  path), and that the method issues no shell string (covered by the STATIC assertion).

## Execution Plan

### Step 8: TEST
Write `tests/w07-portable-shellouts.test.js` FIRST (TDD — the STATIC assertions fail against
today's source), asserting BEHAVIOR + source invariants:
- [x] Write a test: `sast-runner.js` source has no `2>/dev/null` / `|| true` / `shell: true`.
- [x] Write a test: `runner-detect.js` source has no `df ` / `| tail`.
- [x] Write a test: `checkDisk()` returns a positive GB number and succeeds under empty `PATH`.
- [x] Write a test: `runESLintSecurity()` resolves (no throw) when ESLint is absent.

### Step 9: PREPARE
- [x] Confirm Node `fs.statfsSync` is available (repo runs Node v24; `>=18.15` required).
- [x] Confirm the `child_process` import in `sast-runner.js` and whether `execSync` remains
  used elsewhere in `runner-detect.js`.

### Step 10: IMPLEMENT
- [x] `src/lib/sast-runner.js` — import `execFileSync`; rewrite `runESLintSecurity()` to the
  argument-array, no-shell form (discard stderr via `stdio`; capture `error.stdout`).
- [x] `src/lib/runner-detect.js` — require `fs`; rewrite `checkDisk()` to use
  `fs.statfsSync`; delete the misleading comment; drop `execSync` import if now unused.

### Step 11: REVIEW
- [x] Verify `checkDisk()` returns the same shape/semantics (`ok`, `name`, `version`,
  `message`) as before — callers are unaffected.
- [x] Verify `runESLintSecurity()` still feeds `parseESLintResults` the same JSON on the
  happy path.

### Step 12: OPTIMIZE
- [x] `fs.statfsSync` removes a process spawn from the disk probe (faster + portable) — confirm
  no residual spawn remains.

### Step 13: SECURE
- [x] Confirm no `shell: true` and no string interpolation of any path into a shell command
  (the `df "${targetPath}"` interpolation is gone); `execFileSync` uses a fixed argument array.

### Step 14: VERIFY
- [x] Run `node --test tests/w07-portable-shellouts.test.js tests/runner-detect.test.js` — all pass.
- [x] Run the full suite `node --test tests/*.test.js` — `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [x] Update the `checkDisk` comment to state it uses `fs.statfsSync` (truthful, replacing the
  old misleading `df` comment); note M13 in both touched functions.

### Step 16: FINAL-REVIEW
- [x] No POSIX-only shell construct remains in either file (proven by the static tests); disk
  probe works with no external binary; no gate crossed (Gate 2 is human).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
