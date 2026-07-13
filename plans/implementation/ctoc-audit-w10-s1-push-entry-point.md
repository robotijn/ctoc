---
title: "W10-s1 — Real /ctoc:push entry point (H3)"
type: feature
parent_plan: "ctoc-audit-w10-menu-taskplane"
depends_on: none
files:
  - src/commands/push.js
  - src/commands/push.md
  - src/lib/quality-agent.js
  - tests/w10-push-entry-point.test.js
priority: HIGH
---

# W10-s1 — Real /ctoc:push entry point (H3)

**Parent:** `ctoc-audit-w10-menu-taskplane`. This is slice **(a)** — give `/ctoc:push`
a real, invokable entry point. Independent (no `depends_on`).

Fixes finding **H3**: `src/commands/push.md:8` tells Claude to run the bare shell
command `ctoc push [options]`, but there is no `bin` field in `package.json` and no
`src/commands/push.js` — the command resolves to nothing. The sibling slash commands
both invoke a real file: `src/commands/menu.md:9` runs
`node "${CLAUDE_PLUGIN_ROOT}/src/commands/menu.js"` and `src/commands/update.md:9`
runs a `node "$(find … update.js …)"` one-liner. `push.md` is the only one of the
three naming a command with nothing behind it.

## Implementation Details

### Architecture Decision (ADR)

**Context.** `push.md` documents an exact contract: run Tier-1 (blocking) + Tier-2
(warning) quality checks, then `git push` on success, with four documented flags
(`(none)`, `--force`, `--skip-tests`, `--dry-run`). The engine that already implements
this contract is `src/lib/quality-agent.js` — it has `runLint`/`runTypecheck`/
`runSmartTests`/`runSecurityScan` (the Tier-1 checks), `runTieredChecks()`
(`quality-agent.js:351`), and `pushToRemote()` (`quality-agent.js:384`, with
pull-rebase conflict handling). But that file (1) runs `main()` unconditionally at the
bottom (`quality-agent.js:525`, no `require.main === module` guard — so `require()`ing
it triggers a full quality run and a real `git push`), (2) has NO `module.exports`, and
(3) parses only `--triggered-by=`/`--on-success=`/`--verbose` — **none** of the three
flags `push.md` documents.

**Decision.** `push.js` is a **self-contained, dependency-injectable orchestrator** that
OWNS the documented flag semantics and REUSES `quality-agent.js`'s check/push building
blocks. To reuse them safely, `quality-agent.js` gets a minimal additive change: wrap
its bottom-of-file `main()` call in `if (require.main === module)` and add a
`module.exports` of the reusable functions. `push.js` composes the individual Tier-1
runners itself (so `--skip-tests` simply omits the test runner) and calls the exported
`pushToRemote()`.

**Consequence.** No release/version-metadata logic is added (that is W9, explicitly out
of scope in the parent). `push.js` exports a testable `run(argv, deps)` seam so the test
injects a fake checks-runner + fake pusher and asserts behavior with **no real test-suite
run and no real network push**. Requiring `quality-agent.js` becomes side-effect-free,
which also de-risks any future reuse.

**Rejected alternative.** `push.js` shelling out to `quality-agent.js` as a child
process: it cannot honor `--force`/`--skip-tests` (quality-agent ignores them → fails
acceptance scenario 3 "no flag silently ignored"), and testing scenarios 1–2 would run
the real 5485-test suite and a real `git push`. Rejected.

### Dependency Graph (this slice)
```
src/lib/quality-agent.js  (MODIFY: add require.main guard + module.exports — additive)
  └─ required-by → src/commands/push.js  (NEW: parse documented flags, compose Tier-1,
                     decide push/block, call pushToRemote)
                     └─ pointed-at-by → src/commands/push.md  (MODIFY: repoint bash block)
                     └─ behavior-tested-by → tests/w10-push-entry-point.test.js (NEW)
```
No cycles. No dependency on other W10 slices.

### File Specifications

#### `src/lib/quality-agent.js` — MODIFY (minimal, additive)
- **Guard the script side-effect.** Replace the bare bottom-of-file call
  (`quality-agent.js:524-529`)
  ```
  // Run
  main().catch(err => { … process.exit(1); });
  ```
  with `if (require.main === module) { main().catch(err => { … process.exit(1); }); }`
  so `require('./quality-agent')` no longer starts a quality run or a push. This is the
  proven guard pattern already used across the hooks (e.g.
  `PostToolUse.plan-index-sync.js:178`).
- **Export the reusable blocks** (add at end of file):
  `module.exports = { runLint, runTypecheck, runSmartTests, runFullTests,
  runSecurityScan, runTieredChecks, pushToRemote, printSummary };`
- Do **NOT** change any check or push LOGIC — behavior of the existing script path is
  byte-identical (the guard only prevents auto-run on `require`).

#### `src/commands/push.js` — CREATE
Mirror `menu.js`/`update.js`: a Node entry point runnable as
`node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" [flags]`.

- **Exports (for testability):**
  - `parsePushArgs(argv: string[])` → `{ force: boolean, skipTests: boolean,
    dryRun: boolean }`
    - Recognizes exactly `--force`, `--skip-tests`, `--dry-run`. An unrecognized
      `--flag` is reported (returned in an `unknown[]` array) so `main()` can exit
      non-zero naming it — nothing is silently ignored (acceptance scenario 3).
  - `run(opts, deps)` → `Promise<{ ok: boolean, pushed: boolean, blockedBy: string[],
    tier: 1|2|null, dryRun: boolean, text: string }>`
    - `opts` = the parsed flags. `deps` = `{ detect, runLint, runTypecheck,
      runSmartTests, runSecurityScan, pushToRemote, logger }`, each defaulting to the
      real `quality-agent`/`tool-detector` function; the test injects fakes.
    - Flow: detect tools → run Tier-1 checks (lint, typecheck, security, and tests
      **unless** `skipTests`) → if any Tier-1 check fails: `{ ok:false, pushed:false,
      blockedBy:[names], tier:1 }` and **do not** push. → else Tier-1 passes: if
      `dryRun`, print "Would push to <remote/branch>" and return `{ ok:true,
      pushed:false, dryRun:true }` **without** pushing. → else call `deps.pushToRemote()`
      and return `{ ok:true, pushed:true }`. `--force` only affects Tier-2 warnings
      (Tier-1 failures ALWAYS block regardless of `--force`, per `push.md:135-136`).
  - `main(argv)` — parse; on unknown flag, print the offending flag and
    `process.exitCode = 2`, return; else `await run(...)`, print the result text, set
    `process.exitCode = result.ok ? 0 : 1`.
- **Entry:** `if (require.main === module) { main(process.argv.slice(2)); }`.
- **Cross-platform:** no bash; `pushToRemote()` already uses `execSync('git push')`.
  `push.js` adds no new shell-outs. No hardcoded paths.

#### `src/commands/push.md` — MODIFY (repoint the invocation)
- Replace the bare `ctoc push [options]` bash block (`push.md:7-9`) with the plugin-root
  node invocation, mirroring `menu.md:8-10`:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" [options]
  ```
- Leave the documented Options table (`--force`, `--skip-tests`, `--dry-run`) and the
  behavior prose unchanged — `push.js` now implements exactly that surface. Update any
  remaining bare `ctoc push` occurrences in the runnable example blocks to the same
  `node "…/push.js"` form (the prose/scenario headings may keep the friendly `ctoc push`
  label, but every fenced command a reader would copy-run must be the real invocation).

### Test Plan

#### `tests/w10-push-entry-point.test.js` — CREATE (`node:test`)
All tests inject fakes via the `run(opts, deps)` seam — **no real suite run, no network**.
Every case is RED before this slice (the module does not exist) and GREEN after.

1. **Happy path — checks pass, push runs (scenario 1).** Inject `deps` whose check
   runners all return `{ passed: true }` and a `pushToRemote` spy. `run({}, deps)` →
   result `{ ok:true, pushed:true }` and the `pushToRemote` spy was called exactly once.
2. **Tier-1 failure blocks, no push (scenario 2).** Inject a failing `runSmartTests`
   (`{ passed:false }`) and a `pushToRemote` spy. `run({}, deps)` → `{ ok:false,
   pushed:false, tier:1 }`, `blockedBy` names `tests`, and the `pushToRemote` spy was
   **never** called.
3. **`--dry-run` runs checks but does not push (scenario 3a).** All checks pass; inject
   a `pushToRemote` spy. `run({ dryRun:true }, deps)` → `{ ok:true, pushed:false,
   dryRun:true }`; spy never called; result text contains "Would push".
4. **`--skip-tests` omits the test runner (scenario 3b).** Inject a `runSmartTests` spy;
   `run({ skipTests:true }, deps)` → the `runSmartTests` spy is **never** called, and
   lint/typecheck/security spies ARE called; push proceeds when the rest pass.
5. **`--force` pushes despite a Tier-2 warning, but NOT despite a Tier-1 failure
   (scenario 3c).** With a Tier-1 failure + `force:true` → still `{ ok:false,
   pushed:false }` (force never overrides Tier-1). (Tier-2 warnings are currently an
   empty aspirational set in `quality-agent.runTieredChecks`; assert `force` does not
   flip a Tier-1 block — the load-bearing safety property.)
6. **`parsePushArgs` recognizes every documented flag and flags unknowns.**
   `parsePushArgs(['--force','--dry-run'])` → `{ force:true, dryRun:true,
   skipTests:false }`; `parsePushArgs(['--bogus'])` → `unknown` contains `--bogus`.
7. **Requiring `quality-agent.js` has no side effects (guard regression).**
   `require('../src/lib/quality-agent')` returns an object exposing `runTieredChecks`
   and `pushToRemote` and does **not** run a quality check (assert via a spawned
   subprocess that `require`-ing it prints nothing / exits 0 immediately) — proves the
   `require.main` guard landed.

### Security Review
- [ ] **Command injection:** `push.js` adds no `execSync`/`exec` with interpolated
      user input. The only shell-out is the existing literal `git push` /
      `git pull --rebase` inside `pushToRemote()` — no flag value is interpolated into a
      shell string.
- [ ] **Path safety:** `push.js` reads no user-supplied paths; it resolves nothing from
      argv into a filesystem path. Flags are booleans only.
- [ ] **Fail-safe default:** any Tier-1 check failure blocks the push; an unknown flag
      exits non-zero rather than proceeding — the default on ambiguity is "do not push".
- [ ] **No secret exposure:** result text prints check pass/fail names and the remote
      label only — never tokens or credentials.
- [ ] **DoS/`maxBuffer`:** reuses `quality-agent.runCommand`'s existing 10MB buffer
      cap; `push.js` introduces no unbounded capture.

## Execution Plan

### Step 8: TEST
Write `tests/w10-push-entry-point.test.js` FIRST (TDD red), asserting BEHAVIOR — "a
Tier-1 failure means `pushToRemote` is never called" and "`node push.js` resolves to a
real runnable file", NOT "the function returned a number". Cases 1–7 above. Run
`node --test tests/w10-push-entry-point.test.js` and confirm RED (module absent →
import throws; the guard-regression subprocess case fails because `quality-agent` auto-runs).

### Step 9: PREPARE
Re-read `src/lib/quality-agent.js:30-529` to confirm the exact names to export
(`runLint`, `runTypecheck`, `runSmartTests`, `runSecurityScan`, `runTieredChecks`,
`pushToRemote`, `printSummary`) and the `tool-detector.detectTools()` shape used at
`quality-agent.js:474`. Re-read `src/commands/menu.md:8-10` for the exact
`${CLAUDE_PLUGIN_ROOT}` invocation string to mirror in `push.md`. No new npm deps.

### Step 10: IMPLEMENT
ONE step, ordered sub-items:
(a) `src/lib/quality-agent.js`: wrap the bottom `main().catch(...)` in
`if (require.main === module)`; add the `module.exports` of the reusable functions. No
logic change.
(b) `src/commands/push.js` (new): `parsePushArgs`, `run(opts, deps)` with the
dependency-injection seam and the documented flag semantics, `main(argv)`, and the
`require.main` entry guard.
(c) `src/commands/push.md`: repoint the fenced `ctoc push` command(s) to
`node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"`.
(d) Run `node --test tests/w10-push-entry-point.test.js` → green.

### Step 11: REVIEW
Self-review: `push.js` honors all three documented flags distinctly; Tier-1 failure and
unknown flag both block/exit-non-zero; `pushToRemote` is only called on a clean Tier-1
pass and not in `--dry-run`; `quality-agent.js` logic is byte-unchanged apart from the
guard + exports; `push.md`'s runnable blocks all point at the real file.

### Step 12: OPTIMIZE
Confirm no duplicated check logic — `push.js` reuses the exported runners rather than
re-implementing lint/typecheck/test/security. The Tier-1 runners execute in the existing
order; `--skip-tests` short-circuits only the test runner.

### Step 13: SECURE
Run the Security Review checklist. Grep `push.js` for any `exec`/`execSync` — confirm the
only process spawn lives in the reused `pushToRemote()` and interpolates no flag value.

### Step 14: VERIFY
`node --test tests/w10-push-entry-point.test.js` → `# fail 0`; then the FULL suite
`node --test tests/*.test.js` → `# fail 0`, 0 skipped (catches any existing test that
`require`d `quality-agent.js` and relied on — or was broken by — its auto-run;
reconcile any such test to the guarded shape). Confirm
`node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js" --dry-run` runs without "command not
found" and prints a structured result.

### Step 15: DOCUMENT
Update `push.js`'s header comment (purpose: real entry point behind `/ctoc:push`,
Tier-1/2 check-then-push, the three documented flags, the `run(opts, deps)` test seam).
Note in `quality-agent.js`'s header that it is now both a script (guarded) and a library
(exports the check/push blocks).

### Step 16: FINAL-REVIEW
Confirm: this slice edits only its four declared files; `/ctoc:push` resolves to a real
file; a Tier-1 failure blocks the push and names the failing check; `--force`/
`--skip-tests`/`--dry-run` each produce distinct, documented behavior; requiring
`quality-agent.js` no longer auto-runs; suite green, 0 skipped.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| An existing test `require`d `quality-agent.js` and depended on auto-run | Full-suite VERIFY surfaces it; the guard makes require side-effect-free — migrate the test to call an exported fn | Step 14 |
| `--force` wrongly overriding a Tier-1 block | Case 5 asserts force never flips a Tier-1 failure; force affects Tier-2 only | Step 8 |
| Real `git push` firing during tests | `run(opts, deps)` injects a `pushToRemote` spy — no test path reaches the real push | Step 8/10 |
| `push.md` still shows an un-runnable `ctoc push` in a copy block | Step 16 checks every fenced runnable command points at `push.js` | Step 16 |
