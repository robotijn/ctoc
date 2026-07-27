---
title: "R6-D — A crashed security scanner is a FAILURE, not a pass; Windows/timeout gaps closed"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/sast-runner.js"
  - "src/lib/hooks-installer.js"
  - "src/lib/quality-agent.js"
  - "src/commands/update.js"
  - "tests/sast-runner-failclosed.test.js"
  - "tests/hooks-installer-hascommand.test.js"
  - "tests/quality-agent-crossplatform.test.js"
  - "tests/lib-quality-update-home.test.js"
---

# R6-D — Fail-closed security, cross-platform quality gate

Verified on disk:
- `sast-runner.js` `runGosec` (:344), `runBandit` (:317), `runESLintSecurity`
  (:379) inner catch swallow an unparseable stdout with only a comment. A tool
  that CRASHES (Python traceback / segfault / config error on stdout) → parse
  throws → discarded → zero findings, zero errors → `passed = critical===0 &&
  high===0` is TRUE. `runSemgrep` (:257) shows the correct pattern:
  `this.errors.push({ tool, error: error.message })`. Fail-OPEN in a gate.
- `SASTRunner.run()` (:225) returns `success:true` when NO scanner ran (masked
  today by quality-agent's `scannable.length>0` guard, but wrong at the module
  boundary — an exported class whose "success" means "verified nothing").
- `hasCommand` (hooks-installer.js:51) uses POSIX-only `command -v` → always
  false on Windows → CTOC concludes pre-commit/pip/pipx absent when installed.
- `quality-agent.js runCommand` (:87) has NO timeout → a hung test/`--watch`/
  stdin-waiting command pins the quality gate forever (its siblings all set one).
- Go package path (:170) uses `path.dirname` → backslashes on Windows → malformed
  `go test ./pkg\sub/...`. And `update.js:13` uses `process.env.HOME` not
  `os.homedir()` (throws if both env vars unset).

## Implementation Details
1. **Fail-closed scanners.** In `runGosec`/`runBandit`/`runESLintSecurity`, the
   inner catch (stdout present but unparseable) MUST
   `this.errors.push({ tool: '<tool>', error: error.message })` — mirror
   `runSemgrep` exactly. A scanner that ran and produced garbage is an error the
   consumer surfaces as a loud skip, never silence. Verify the ELSE branch (no
   stdout) also records an error where semgrep does.
2. **`run()` honest when nothing scanned.** `SASTRunner.run()` returns a distinct
   signal when zero scanners were available/ran — `{ success:false, scanned:false,
   reason:'no security scanner available' }` (or add `scanned:false` and make
   `success` reflect "a scan ran and found nothing"). The quality-agent caller
   must treat "no scanner ran" as a LOUD skip (tool-missing), not a clean pass —
   confirm/adjust quality-agent.js:490-519 accordingly, keeping the existing
   loud-skip behavior for genuinely-missing tools.
3. **`hasCommand` cross-platform.** Branch on `process.platform`: `where` on
   win32, `command -v` elsewhere; quote/arg-safe the command name. Keep the
   try/catch → boolean contract.
4. **`runCommand` timeout.** Add `timeout: <bound>` to the `execSync` options
   (match the SAST default, 300000ms, or a documented value) and map
   `error.killed`/`ETIMEDOUT`/`error.signal==='SIGTERM'` to a LOUD failure
   (`{ success:false, output, timedOut:true }`), never a swallow.
5. **Go path separators** (:170): `path.dirname(f).split(path.sep).join('/')` so
   the go import path is forward-slashed on Windows.
6. **`update.js` HOME**: `const HOME = os.homedir();` (add `const os =
   require('os')` if absent) — never returns undefined.

### Wiring — the live call sites (MANDATORY)
All changes are inside already-live paths (SAST ← quality-agent ← /ctoc:push;
hasCommand ← hooks-installer ← init; runCommand ← the quality gate; update.js ←
/ctoc:update). No new exports without a caller.

### Test Plan (TDD-Red first)
THE FAIL-CLOSED TEST: a mocked scanner subprocess that exits non-zero with a
NON-JSON stdout (a traceback) → `this.errors` contains that tool with a message,
and the SECURITY RESULT is NOT clean (the crash surfaces). Contrast: non-zero
exit with valid findings JSON → parsed as findings (unchanged). `run()` with no
scanner available → `scanned:false`/`success:false`, and quality-agent surfaces
it as a loud skip, not a pass. `hasCommand` on a simulated win32
(`process.platform` stub) uses `where`; POSIX uses `command -v`. `runCommand`
with a command that sleeps past the timeout → `{success:false, timedOut:true}`,
not a hang (use a short timeout + a real sleepy subprocess; bound the test).
Go packages on a `path.sep='\\'` simulation → forward slashes. update.js HOME
resolves via os.homedir when env vars are cleared.

## Execution Plan (Steps 8-16)
Step 8 TEST red · Step 9 PREPARE (read sast-runner run()/runGosec/runBandit/
runESLintSecurity/runSemgrep, quality-agent runCommand + the SAST consumer block,
hooks-installer hasCommand, update.js head IN FULL) · Step 10 IMPLEMENT items
1-6 · Step 11 REVIEW (every scanner catch now records; grep for a remaining
comment-only catch) · Step 13 SECURE (re-attack: does ANY scanner crash still
read clean? prove not) · Step 14 VERIFY (named tests + eslint; no git) · Step 16
REPORT (each fail-open closed, with the test that proves the crash now surfaces).

## Decisions Taken Under Ambiguity

1. **eslint fail-closed shape.** `runESLintSecurity` uses `execFileSync` (no
   shell). Mirrored `runSemgrep`: non-zero exit with valid JSON stdout → parsed as
   findings (unchanged); non-zero exit with NON-JSON stdout → `this.errors.push({
   tool:'eslint-security', error })`; empty stdout (ran, produced nothing / crashed
   to stderr) → error recorded too, matching semgrep's ELSE branch. The genuinely
   "eslint not installed" case is already filtered upstream by
   `isToolAvailable('eslint')` before this method is reached, so an empty-output
   outcome here is a real failure, not a benign absence.
2. **`run()` honesty.** Added `this.scannersRun` tracking. `run()` now returns
   `scanned:true` on the normal path and, when zero scanners were available/ran,
   `{ success:false, scanned:false, reason:'no security scanner available',
   findings:[], errors }`. `success` stays `true` on the scanned path (existing
   consumers read `.findings`/`.errors`, not `.success`). quality-agent's SAST
   consumer additionally treats `res.scanned === false` as a loud skip
   (belt-and-suspenders over the existing `scannable.length>0` guard).
3. **`runCommand` timeout contract.** Added `timeout` option (default 300000ms, the
   SAST default). On `allowFail`, a timeout returns
   `{ success:false, output, error, timedOut:true }` — loud, never a swallow. On
   NON-allowFail (e.g. `pushToRemote`'s `git push`) a timeout still THROWS, because
   those callers rely on throw-to-fail; returning an object there would let
   `pushToRemote` falsely report a successful push (a fail-open regression).
4. **Go package path — normalize-first, not the literal snippet.** The plan's
   `path.dirname(f).split(path.sep).join('/')` only converts separators on a Windows
   build (POSIX `path.dirname` treats backslashes as ordinary characters, so it is
   unreachable-by-test and wrong when a Windows-style path is seen on any other
   platform). Implemented instead as: normalize both separators to `/` FIRST
   (`f.split(/[\\/]+/).join('/')`), then `path.posix.dirname`. Deterministic and
   identical on every platform; go import paths are always forward-slashed. This is
   strictly more correct than the snippet and is directly testable on POSIX.
5. **`hasCommand` exported** so the platform-branch behavior can be tested; it was
   module-private. `runCommand` and `runSpecificTests` in quality-agent likewise
   exported for the timeout and go-path tests (both are already live internal
   functions on the push path — the tests are genuine callers, not dead exports).

## Execution Log (Steps 8-16)
- Step 8 TEST (red): `tests/sast-runner-failclosed.test.js`,
  `tests/hooks-installer-hascommand.test.js`,
  `tests/quality-agent-crossplatform.test.js`,
  `tests/lib-quality-update-home.test.js`.
- Step 10 IMPLEMENT: items 1-6 across the four source files.
- Step 13 SECURE: re-attack — every scanner SCAN-path catch now records to
  this.errors (bandit both branches, gosec both branches, eslint all three paths);
  the only non-recording catch is isToolAvailable (a boolean probe), and an
  unavailable scanner now makes run() return scanned:false → a loud skip. No path
  reads a crashed scanner as clean. Residual: a scanner that runs successfully and
  returns a valid empty result (e.g. gosec `{"Issues":null}`) still reads clean —
  correct, that is a genuine no-findings run, not a crash.
- Step 14 VERIFY: new tests 13/13 pass; impacted existing suite 201/201 pass, 0
  fail; eslint --max-warnings 0 exit 0 on all 8 touched files. (Full suite skipped
  per coordinator constraint — a concurrent executor owns adjacent files.)
- Step 16 REPORT: delivered to the coordinator.

## Rework — adversarial re-verification (Step 16, 2026-07-27)

Re-audited every claimed fix against source, ran the REAL gate, corrected drift.
Isolated worktree (`agent-a5ddeed41d6b1f23d`), fresh `npm install`.

**Full gate now run — the "Full suite skipped" note above is REFUTED-as-stale.**
The original Step-14 ran only the impacted subset under a concurrency constraint. In
an isolated worktree the whole gate runs clean:
- `npm test` (src/scripts/test-gate.js): **tests 10520 · pass 10520 · fail 0 ·
  skipped 0 · coverage 99.15% (threshold 99%) → PASS**.
- `npx tsc --noEmit`: clean, exit 0. Any "full-suite red / tsc errors" concern is
  stale — the tree is green.

**Each fix verified SHIPPED and CORRECT against disk (fail-closed security bar):**
1. Fail-closed scanners — `runBandit` (sast-runner.js:612), `runGosec` (:646),
   `runESLintSecurity` (:683) each record an unparseable/empty stdout to
   `this.errors`, mirroring `runSemgrep`. A crashed scanner can no longer read clean.
   Proven by `tests/sast-runner-failclosed.test.js` (crash→error for all three;
   contrast test confirms a valid-findings non-zero exit still parses).
2. `run()` honest — returns `{ success:false, scanned:false, reason }` when zero
   scanners ran (:457) or no analyzable source (:413); `runLanguageScanner` counts a
   scanner only when it added no error (:585); `runSemgrep` returns false on crash
   (:524-538). quality-agent surfaces `res.scanned === false` as a loud skip (:1090).
3. `hasCommand` cross-platform — `where` on win32, `command -v` elsewhere, token-validated
   (hooks-installer.js:59-72). Proven by `tests/hooks-installer-hascommand.test.js`.
4. `runCommand` timeout — bounded 300000ms; timeout surfaced as
   `{ success:false, timedOut:true }` on allowFail, re-thrown loudly for non-allowFail
   (quality-agent.js:96-123). Proven with a real sleepy subprocess.
5. Go package paths — normalize both separators to `/` then `path.posix.dirname`
   (quality-agent.js:513-516); deterministic on every platform. Proven with backslash
   input asserting forward-slash argv.
6. `update.js` HOME — `os.homedir()` (update.js:18); loads with HOME/USERPROFILE unset.
   Proven by `tests/lib-quality-update-home.test.js`.

**Residual re-attack:** a scanner that runs and returns a valid empty result is a
genuine no-findings pass (correct, not a crash); `success:true` alongside recorded
`errors` is safe because consumers read `.findings`/`.errors`/`.scanned`, never
`.success`, and every error is surfaced as a loud skip. No path reads a crashed
scanner as clean.

**`files:` corrected** — the four test-file globs (`tests/quality-agent*.test.js`
etc.) over-claimed write coverage over ~8 pre-existing test files this plan never
authored; replaced with the four exact filenames it created. Source files were
already exact.

**Disposition:** all six defects CLOSED and verified; stale "full-suite skipped"
note REFUTED-as-stale with the real green gate; `files:` tightened. No genuine fork.
