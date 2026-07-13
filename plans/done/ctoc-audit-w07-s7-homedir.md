---
approved_by: human
approved_at: 2026-07-13T18:37:06.255Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T16:17:11.930Z
gate_crossed: implementation → todo
---

---
title: "W07-s7 — os.homedir() over process.env.HOME"
type: feature
parent_plan: "ctoc-audit-w07-cross-platform"
depends_on: none
priority: MEDIUM
files:
  - src/lib/agent-critic-loop.js
  - src/lib/grading-system.js
  - tests/w07-homedir.test.js
---

# W07-s7 — os.homedir() over process.env.HOME

**Slice scope:** Finding M22 — two modules use `process.env.HOME`, which is `undefined` on
Windows (it sets `USERPROFILE`/`HOMEDRIVE`+`HOMEPATH`). Independent of the other slices
(`depends_on: none`). `agent-critic-loop.js:44` is a **module-level** `const`, so
`path.join(undefined, ...)` throws `TypeError` at `require()` time — the module cannot load
on Windows at all. `grading-system.js:31-33` is guarded with `|| '/tmp'`, so it does not
throw but silently resolves grades to a bogus path. Replace both with `os.homedir()`.

## Implementation Details

### Dependency Graph
```
src/lib/agent-critic-loop.js --uses--> os.homedir()   (add const os = require('os'))
src/lib/grading-system.js    --uses--> os.homedir()   (add const os = require('os'))
tests/w07-homedir.test.js    --spawns--> child node process with HOME filtered from env
```
No inter-module deps. No cycles.

### File Specification — `src/lib/agent-critic-loop.js` (MODIFY)
`:44` — `const GRADES_FILE = path.join(process.env.HOME, '.ctoc/agents/grades.yaml');`
(module-level; the throw-at-require site). `os` is NOT currently imported.
- Add `const os = require('os');` to the imports (alongside `safe-fs`, `path`).
- Change `:44` to `const GRADES_FILE = path.join(os.homedir(), '.ctoc/agents/grades.yaml');`.
`os.homedir()` always returns a string (falls back to `USERPROFILE`/`getpwuid`), so the
module loads even when `HOME` is unset.

### File Specification — `src/lib/grading-system.js` (MODIFY)
`:31-33` — `function getGradesFile() { return path.join(process.env.HOME || '/tmp',
'.ctoc/agents/grades.yaml'); }`. `os` is NOT currently imported. `:35` `const GRADES_FILE =
getGradesFile();` (module-level; safe once the function uses `os.homedir()`).
- Add `const os = require('os');` to the imports.
- Change to `return path.join(os.homedir(), '.ctoc/agents/grades.yaml');` — drop the
  `|| '/tmp'` fallback (`os.homedir()` is always defined).

### Test Plan — `tests/w07-homedir.test.js` (CREATE)
The parent's Test Strategy is explicit: the module-load throw must be proven in a **fresh
child process** with `HOME` filtered from `env` — Node's module cache means a second
in-process `require()` would not re-run the top-level `path.join` that actually throws.
- MODULE LOAD (agent-critic-loop): `execFileSync(process.execPath, ['-e',
  "require('<abs path>/src/lib/agent-critic-loop.js')"], { env: <process.env minus HOME>,
  cwd: projectRoot })` exits 0 (does not throw). A pre-fix run of this test throws
  `TypeError: Path must be a string`.
- PATH RESOLUTION (agent-critic-loop): in the same child, print `GRADES_FILE` and assert it
  starts with `os.homedir()` and does not contain `/tmp`.
- grading-system: `getGradesFile()` is a function (not module-load), so test in-process —
  save `process.env.HOME`, `delete process.env.HOME`, assert `getGradesFile()` starts with
  `os.homedir()` and is not `/tmp`-derived, then restore `HOME` in a `finally`.
- (When constructing the filtered env, remove `HOME` only; leave `USERPROFILE`/`getpwuid`
  so `os.homedir()` still resolves a real path — the exact condition M22 describes.)

## Execution Plan

### Step 8: TEST
Write `tests/w07-homedir.test.js` FIRST (TDD — the module-load test throws against today's
`agent-critic-loop.js`), asserting BEHAVIOR:
- [ ] Write a test: a child `node` process requiring `agent-critic-loop.js` with `HOME`
  unset exits 0 (module loads).
- [ ] Write a test: the child prints a `GRADES_FILE` under `os.homedir()`, not `/tmp`.
- [ ] Write a test: `grading-system.getGradesFile()` with `HOME` deleted resolves under
  `os.homedir()` and is not `/tmp`-derived (restore `HOME` in `finally`).

### Step 9: PREPARE
- [ ] Confirm neither file currently imports `os`; confirm the import block location.
- [ ] Confirm a robust way to build a `HOME`-filtered `env` object for the child process.

### Step 10: IMPLEMENT
- [ ] `src/lib/agent-critic-loop.js` — add `const os = require('os');`; change `:44` to
  `os.homedir()`.
- [ ] `src/lib/grading-system.js` — add `const os = require('os');`; change `getGradesFile()`
  to `os.homedir()`; drop the `|| '/tmp'` fallback.

### Step 11: REVIEW
- [ ] Verify `GRADES_FILE` resolves to the same real path on a machine WHERE `HOME` is set
  (behavior unchanged for the common case) — `os.homedir()` == `process.env.HOME` there.
- [ ] Verify no other `process.env.HOME` reference remains in either file.

### Step 12: OPTIMIZE
- [ ] Confirm `os.homedir()` is called once per resolution (no redundant calls in a loop).

### Step 13: SECURE
- [ ] `os.homedir()` is a trusted OS lookup (no env-injection of a home path an attacker
  controls via `HOME`); confirm the grades path is still confined under the user's home.

### Step 14: VERIFY
- [ ] Run `node --test tests/w07-homedir.test.js` — all pass.
- [ ] Run the full suite `node --test tests/*.test.js` — `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [ ] Note M22 in both touched sites: `os.homedir()` is required over `process.env.HOME`
  for Windows (per the repo's cross-platform rule).

### Step 16: FINAL-REVIEW
- [ ] `agent-critic-loop.js` loads with `HOME` unset (proven in a child process); grades
  resolve to the real home; no gate crossed (Gate 2 is human).


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
