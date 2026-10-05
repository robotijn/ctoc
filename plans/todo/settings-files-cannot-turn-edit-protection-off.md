---
iron_loop_verdict: true
iron_loop: true
title: "The settings files cannot turn edit protection off"
type: implementation
created: 2026-10-05
priority: high
effort: small
depends_on: none
files:
  - src/hooks/PreToolUse.Edit.js
  - tests/config-command-tables-protected.test.js
  - tests/bash-gate-plan-coverage.test.js
  - tests/pretooluse-edit-coverage.test.js
  - tests/the-whitelist-cannot-leave-the-repository.test.js
  - tests/hooks.test.js
  - tests/e2e-enforcement-and-gates.test.js
  - CLAUDE.md
  - README.md
approved_by: human
approved_at: 2026-10-05T19:26:55.537Z
gate_crossed: implementation → todo
---

# The settings files cannot turn edit protection off

## Problem Statement

Any agent can switch edit protection off by writing one line into `.ctoc/settings.yaml` or `.ctoc/settings.json`, because both files sit inside the `.ctoc/` folder that the edit-protection hook lets every agent write without a plan. Once the mode is set to off, every edit the hook would have blocked goes through, and the shell channel has the same hole because it reuses the same whitelist. The owner is the one hurt: his approval of a plan is meant to be the only thing that decides which files an agent may change, and an agent that can lower the mode removes that control from the inside. The security scan of the tool-grant test reproduced it in a scratch copy (an edit blocked, the mode changed to off through the whitelist, the same edit then allowed), recorded in `.ctoc/audit/tool-grant-run-notes/s1-step13-secure-d-tg-s1-step13.md`. Fixed means an agent's edit of either settings file, through an editing tool or a determinate shell write, is refused unless an approved plan declares the file or the owner types an escape phrase, and, on the recommended answer to the owner question below, refused at every enforcement mode.

## Scope

This plan changes the edit-protection hook `src/hooks/PreToolUse.Edit.js`, the tests listed in `files:`, and the descriptions in `CLAUDE.md` and `README.md`. It does not edit the shell hook, which picks up the fix through the function it already imports. It does not close writes made through a script interpreter such as `node -e`, and it does not protect the ratchet baselines under `.ctoc/`; both are listed under "Neighbours", and when they are built is the owner's decision.

Written by the implementation planner on 2026-10-05, dispatched by the CTO Chief session.
Everything below was read from files in this repository; nothing was run. Claims are
labelled **read**, **believed** or **to verify**.

## Why

The edit-protection hook decides how strictly it acts by reading two files that every
agent may write without a plan.

- `src/hooks/PreToolUse.Edit.js` whitelists everything under `.ctoc/` (`WHITELIST`,
  pattern `/^\.ctoc\//`, read at lines 72-79). The only exclusions ahead of it are the
  approval ledger, the verification evidence and the streaming question store (denied
  outright) and the configuration command tables (`isCommandTablePath`, lines 316-355,
  which fall through to plan coverage).
- `src/lib/enforcement-mode.js` (read) resolves the mode from `.ctoc/settings.yaml`
  (`enforcement.mode`), then `.ctoc/settings.json` (`workflow.enforcementMode`), then the
  environment profile named in `.ctoc/settings.json` (`general.environment: dev` gives
  `soft`), then `strict`.
- So an agent can write `enforcement:\n  mode: off` into `.ctoc/settings.yaml` (allowed
  as whitelisted), and every edit that was blocked then goes through, logged as
  `off-allow`. The security scan reproduced exactly this in a scratch copy: an edit to a
  test file was blocked under `strict`, the mode was changed to `off` through the
  whitelist, and the same edit went through. Source: the scan's finding titled "The
  switch that turns edit protection off is a file agents can write without a plan", in
  `.ctoc/audit/tool-grant-run-notes/s1-step13-secure-d-tg-s1-step13.md`.

The same two files hold other switches a gate obeys (read): the opt-in "suite must be
green to stop" gate (`src/hooks/stop-test-gate.js` reads `general.stopTestGate` from
`.ctoc/settings.yaml`), the declared entry-point command the verification step runs
(`general.entry_point`, read by `src/lib/app-runner.js`), and the deployment target
(`deployment` in `.ctoc/settings.json`).

## The shell channel, checked (read)

`src/hooks/PreToolUse.Bash.js` asks the same coverage question for a shell command the
write classifier reports as a determinate write. It imports `isWhitelisted` from the Edit
hook instead of copying it (`checkWriteCoverage`, lines 801-831), so today
`echo 'enforcement:' > .ctoc/settings.yaml`, past the build-step write gate with a
feature active, is allowed as a whitelisted target: **the same hole**. Because the Bash
hook imports the very function this plan changes, the fix closes it there with no edit to
`PreToolUse.Bash.js`; a test proves it. That channel's coverage deny is already blind to
the mode (read, lines 1014-1047).

What stays open, stated plainly: a command the classifier calls indeterminate passes
unchanged (`node -e …`, `python3 -c …`, `node src/commands/start.js …`). That includes
CTOC's own settings writer reached through `node -e`
(`require('./src/lib/settings').setSetting('workflow', 'enforcementMode', 'off')`), the
same route the menu's `claude:set-environment` uses (read, `src/commands/start.md`
line 67). Refusing indeterminate writes is the unbuilt item CLAUDE.md already lists; this
plan does not build it.

## Implementation Details

### `src/hooks/PreToolUse.Edit.js`

1. **A list of the two settings files**, beside `COMMAND_TABLE_PATHS`, with a comment
   saying why they leave the whitelist (their contents decide how strictly edits are
   checked, and hold the other obeyed switches named above):

   ```js
   const SETTINGS_PATHS = ['.ctoc/settings.yaml', '.ctoc/settings.json'];
   ```

2. **One matcher for both lists**, so the two-check shape (name arithmetic, or real-path
   confinement that returns true on every fault and never throws) exists once:

   ```js
   function matchesConfigPath(filePath, list) {
     const norm = normalizeForProtection(filePath);
     return list.some((p) => isUnderProtectedDir(norm, p)
       || (realPathConfinement !== null
         && realPathConfinement.resolvesUnder(filePath, p, process.cwd())));
   }
   function isCommandTablePath(filePath) { return matchesConfigPath(filePath, COMMAND_TABLE_PATHS); }
   function isSettingsPath(filePath) { return matchesConfigPath(filePath, SETTINGS_PATHS); }
   ```

   `isCommandTablePath` keeps its name, export and behaviour (its existing tests run
   unchanged).

3. **`isWhitelisted`**: the existing early return becomes
   `if (isCommandTablePath(filePath) || isSettingsPath(filePath)) return false;`, with
   the comment extended. A settings edit now falls through to plan coverage and the
   owner's typed escape phrase, exactly like a command table.

4. **The decision at every mode** (the recommended answer to the owner question below).
   In `enforce()`, after the escape-phrase check and before the mode decides:

   ```js
   if (targetFile && isSettingsPath(targetFile)) {
     return block('the settings files decide how strictly edits are checked; changing '
       + 'them needs an approved plan that declares them or an escape phrase you type '
       + 'yourself', { tool, target_file: targetFile, project_root: root, mode,
       mode_source: modeSource });
   }
   ```

   An approved plan that declares the file, or the owner's typed escape phrase, still
   allows the edit: an approval requirement, not a ban. The block reason names why, so a
   lockout is readable.

5. `isSettingsPath` is not exported: `isWhitelisted` and `enforce` call it, and the
   tests reach it through those two, the way a caller does.

### Documentation

- `CLAUDE.md`, "Mandatory Pipeline Use", the whitelist paragraph: the carve-outs list
  adds "the two settings files that decide how strictly edits are checked
  (`.ctoc/settings.yaml`, `.ctoc/settings.json`), which fall through to plan coverage and,
  unlike every other uncovered file, are refused at every enforcement mode unless an
  approved plan declares them or the owner types an escape phrase". The paragraph on the
  mode's floor gains one sentence: an agent cannot lower the mode by editing these files
  with an editing tool or a determinate shell write; the interpreter channel stays open,
  as the unbuilt item says.
- `README.md`, the "Always writable" sentence (line 883 as read): "except the three
  protected stores and the quality command tables" becomes "except the three protected
  stores, the quality command tables and the two settings files". The lines telling the
  owner to set `enforcement.mode` in `.ctoc/settings.yaml` stay true: the owner editing
  the file himself is not a tool call.

### Wiring — the live call sites

No new module. `isSettingsPath` is called by `isWhitelisted` and `enforce` in
`src/hooks/PreToolUse.Edit.js`, which runs on every Edit, Write, MultiEdit and
NotebookEdit call (registered in `.claude-plugin/hooks.json`; Write, MultiEdit and
NotebookEdit delegate to `enforce`, read). `PreToolUse.Bash.js` reaches it through its
import of `isWhitelisted` on every Bash call.

## Test plan (written first, Step 8)

No new test file (no documented count moves). Every test drives the real exported
functions or spawns the real hook; doubles only at the process boundary, temp projects
under the system temporary folder.

**In `tests/config-command-tables-protected.test.js`, a new describe "the settings files
leave the whitelist":**

1. `isWhitelisted('.ctoc/settings.yaml') === false` (red today).
2. `isWhitelisted('.ctoc/settings.json') === false` (red today). The existing case 11,
   which asserts the opposite, is rewritten to this assertion with a comment that the
   owner replaced that contract on 2026-10-05; it tightens, it does not loosen.
3. The absolute form, the Windows-separator form and a case variant
   (`.ctoc/SETTINGS.yaml`) are not whitelisted.
4. Near names stay whitelisted: `.ctoc/settings.yaml.bak`, `.ctoc/settings-old.json`,
   `.ctoc/state/agent-status.json`.
5. A symbolic link `.ctoc/alias.yaml → .ctoc/settings.yaml` in a temp project is not
   whitelisted; if the platform refuses the link the test fails loudly naming the
   platform (the file's existing convention; a skipped case is forbidden).
6. **The attack, end to end, cannot lower the mode.** Temp CTOC project, settings
   `enforcement:\n  mode: strict`. Through the real `enforce()`: an Edit of `src/a.js` is
   denied; an Edit of `.ctoc/settings.yaml` is denied, exit code 2, with the settings
   reason in the banner; `resolveEnforcementMode(root).mode` is still `strict`; the Edit
   of `src/a.js` is denied again. The same for `.ctoc/settings.json`.
7. **Every mode.** With the settings at `soft`, and again at `off`, an uncovered Edit of
   `.ctoc/settings.yaml` is denied. (If the owner picks the other answer below, this case
   becomes: `soft` allows with the warning, `off` allows.)
8. **An approval requirement, not a ban.** An approved plan in `todo/` declaring
   `.ctoc/settings.yaml`, minted with the real approval ledger as case 17 already does,
   allows the edit; a user-typed escape phrase in a transcript fixture allows it too.
9. Junk inputs (`null`, `''`, `'../outside'`) never throw from `isWhitelisted`.

**In `tests/bash-gate-plan-coverage.test.js`:**

10. With a signed state at step 10 and a feature, `echo 'enforcement:' > .ctoc/settings.yaml`
    is denied, and the log entry reads reason `uncovered` with the settings file as target
    (red today: whitelisted).
11. The same command with an approved plan declaring `.ctoc/settings.yaml` is allowed.
12. Control: `echo x > .ctoc/state/notes.json` is still allowed as whitelisted.

**Example swaps in four files** that used a settings file as "any whitelisted `.ctoc/`
file". Each keeps testing what it was written to test (the `.ctoc/` whitelist works) with
a `.ctoc/` file that stays whitelisted:

- `tests/pretooluse-edit-coverage.test.js`: the absolute-path whitelist case (lines
  198-203) uses `.ctoc/state.json`; the "unrelated `.ctoc/` path" in the ledger-and-verify
  regression case (lines 494-496) uses `.ctoc/state/agent-status.json`.
- `tests/the-whitelist-cannot-leave-the-repository.test.js`, case 6: `.ctoc/settings.json`
  becomes `.ctoc/state/agent-status.json`, title included.
- `tests/hooks.test.js`: line 353 uses `.ctoc/state/agent-status.json`; the simulated
  regular-expression case at line 1020 uses `.ctoc/state.json`.
- `tests/e2e-enforcement-and-gates.test.js`, case 2c: `.ctoc/state/notes.json`.

Step 8 runs all seven files and records the red: cases 1, 2, 6, 7 and 10 fail today; the
swapped examples pass today and after.

## Security review

- **The change only narrows.** Two files leave a blanket allow; nothing gains access.
- **Failing direction.** `matchesConfigPath` returns true (excluded from the whitelist)
  on any real-path fault and never throws; a throw would reach `enforce()`'s fail-open
  catch and become an allow. Same direction as the existing guards.
- **Evasions covered by tests:** absolute path, backslashes, case variant, a `..` that
  re-enters `.ctoc/` (rejected by the whitelist's traversal guard and then uncovered), a
  symbolic link to the real file.
- **Residuals, stated:** the interpreter channel (above); a hard link to a settings file
  made beforehand (the same residual the existing guards document: making it already
  needs a write the hooks do not grant); the ratchet baselines under `.ctoc/` remain
  whitelisted (neighbours).
- **No secrets, no personal information**; the block message names a
  repository-relative target only.

## Acceptance criteria

1. An Edit, Write, MultiEdit or NotebookEdit of `.ctoc/settings.yaml` or
   `.ctoc/settings.json` with no approved plan declaring it and no user-typed escape
   phrase is denied at every enforcement mode, with a reason that names the settings.
2. A determinate shell write to either file, past the build-step gate, is denied unless
   an approved plan declares it or the owner typed an escape phrase.
3. An approved plan declaring the file, or the owner's escape phrase, allows the edit.
4. Every other `.ctoc/` file keeps its current treatment (the existing whitelist,
   ledger, verification-evidence, streaming and command-table tests pass unchanged).
5. `npm test` passes: fail 0, skipped 0, coverage at or above the enforced floor.
6. `CLAUDE.md` and `README.md` describe the new carve-out and the open interpreter
   channel.

## Questions for the owner

### 1. Should an agent's edit to the settings files be refused at every enforcement mode, or follow the mode like any other uncovered file?

Plain fall-through to plan coverage leaves the mode in charge of the decision. Under
`soft` an uncovered edit is allowed with a warning, so an agent in a `soft` project could
still set `off` and silence the warnings.

- **Recommended: (a) refused at every mode** unless an approved plan declares the file
  or the owner types an escape phrase. Reason: the switch that sets the mode must not be
  governed by the mode, or the protection can be removed from inside; under `soft` the
  warning does not stop the edit.
- (b) Follow the mode. An owner who chose `soft` or `off` lets agents edit the settings
  freely; under `soft` an agent can switch the warnings off.

If the owner picks (b): drop item 4 of the hook change; test case 7 asserts the `soft`
warning-and-allow and the `off` allow; the CLAUDE.md sentence loses "at every
enforcement mode".

## Decisions Taken Under Ambiguity

1. **`deployment-setup`'s own write of the `deployment` block into `.ctoc/settings.json`
   now needs an approved plan or the owner's escape phrase.** A deployment target decides
   where approved code goes, so it is obeyed configuration like the rest; allowing only
   that key would need the hook to parse and compare file contents, which is fragile.
   The denial names the reason, so the owner sees it.
2. **No `.yml` spelling is added**: nothing reads `.ctoc/settings.yml` (read:
   `enforcement-mode.js` and `stop-test-gate.js` read `settings.yaml`, `settings.js`
   reads `settings.json`).
3. **`PreToolUse.Bash.js` is not edited.** It imports `isWhitelisted`; changing that one
   function closes the determinate shell channel too, and a second copy of the rule would
   be the drift the import was written to prevent.
4. **The four example swaps** change tests that asserted the contract the owner replaced;
   each keeps its original purpose with a file that stays whitelisted, and the new cases
   assert the settings files are no longer whitelisted.
5. **CTOC's own writers are unaffected** (read): `init-project.js`, `settings.js` and the
   menu's commands write through Node's file functions, not through an editing tool, so
   the hook never sees them. `ci-runner-setup`'s preference goes to the user-level
   `~/.ctoc/settings.yaml`, outside the project.
6. **`isSettingsPath` is not exported**; its two callers are in the same module.

## Neighbours (seen, not built here; scheduling is the owner's)

- **Shell writes through an interpreter skip plan coverage**, including CTOC's own
  settings writer through `node -e`. Listed in CLAUDE.md as unbuilt work.
- **The ratchet baselines under `.ctoc/`** (`false-green-baseline.json`,
  `reachability-baseline.json`, `recipe-coverage.json` and their siblings) are
  whitelisted. By reading, an agent can widen one without a plan; the coverage floor has a
  second statement in a protected test, most of the others do not. Not reproduced.

## Execution Plan

### Step 8: TEST
- [ ] Add cases 1 to 9 to `tests/config-command-tables-protected.test.js` and rewrite case 11.
- [ ] Add cases 10 to 12 to `tests/bash-gate-plan-coverage.test.js` (a covering-plan helper that takes its declared paths).
- [ ] Make the example swaps in the four files.
- [ ] Run the seven files with `node --test`; expect RED on cases 1, 2, 6, 7 and 10 only; record the failing lines.

### Step 9: PREPARE
- [ ] Confirm `realPathConfinement.resolvesUnder` accepts a single file as the protected target, as the command-table entry `.ctoc/quality-config.yaml` already relies on.
- [ ] Confirm the shell write classifier reports `echo … > .ctoc/settings.yaml`, `tee`, `sed -i`, `cp` and `mv` onto a settings file as determinate writes; record any it calls indeterminate.
- [ ] List every command in `src/commands/start.md` that writes a settings file and confirm each runs through `node`, so the menu keeps working.
- [ ] Search the tests for any other assertion that a settings file is whitelisted or that its edit is allowed.

### Step 10: IMPLEMENT
- [ ] `src/hooks/PreToolUse.Edit.js`: `SETTINGS_PATHS`, `matchesConfigPath`, `isSettingsPath`, the `isWhitelisted` exclusion, the every-mode refusal in `enforce()`, comments.
- [ ] `CLAUDE.md`: the whitelist paragraph and the floor sentence.
- [ ] `README.md`: the "Always writable" sentence.
- [ ] Run the seven test files; expect GREEN.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` on the diff: failing direction of every new branch, the placement of the every-mode refusal (after coverage and escape, before the mode), no change to the three deny guards.

### Step 12: OPTIMIZE
- [ ] Confirm the matcher is shared, not duplicated.
- [ ] Measure the added cost on an ordinary source edit. `isWhitelisted` already runs the command-table matcher, real-path checks included, on every call (read, line 104); the two settings entries add two more real-path checks per call. Record the time per call before and after. The real-path check stays: a link of any name can lead to a settings file.

### Step 13: SECURE
- [ ] Dispatch `security-scanner` on the diff: try the evasions in the security review against the built hook in a scratch project, including the original reproduction (blocked edit, settings edit, blocked edit again).

### Step 14: VERIFY
- [ ] Run `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [ ] Run the linter over `src/hooks/PreToolUse.Edit.js`; zero warnings.
- [ ] Confirm `.ctoc/logs/enforcement.json` in a scratch run records the settings denial with outcome `block`.

### Step 15: DOCUMENT
- [ ] Confirm `CLAUDE.md` and `README.md` match the built behaviour, including the open interpreter channel.
- [ ] JSDoc on `matchesConfigPath` and `isSettingsPath`.

### Step 16: FINAL-REVIEW
- [ ] Show the owner the reproduction before and after: the settings edit allowed and the blocked edit going through, against the settings edit denied with its reason and the blocked edit still blocked.
- [ ] Dispatch `iron-loop-critic` for the final review against the acceptance criteria.
- [ ] Hand the result to the owner for his decision to call it done.


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
