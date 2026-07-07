---
iron_loop: true
approved_by: human
approved_at: 2026-07-07T11:48:33.210Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-07T11:38:43.675Z
gate_crossed: functional → implementation
iron_loop: true
---

---
title: "OM2 — Port the opus-pack bash guard hooks to cross-platform CTOC Node hooks"
type: functional
status: functional
created: 2026-07-07
program: ctoc-onboarding
priority: HIGH
files:
  - src/hooks/guard-files.js
  - src/hooks/stop-test-gate.js
  - src/hooks/PreToolUse.Bash.js
  - .claude-plugin/hooks.json
  - tests/opuspack-hooks.test.js
  - tests/readme-numbers.test.js
---

# OM2 — Port the opus-pack bash guard hooks to cross-platform CTOC Node hooks

> Direct user work order (Tijn, 2026-07-07): "turn the bash into js." The
> opus48-operating-pack ships 3 bash hooks (`guard-bash.sh`, `guard-files.sh`,
> `stop-test-gate.sh`). Bash entry points VIOLATE CTOC's "Node.js only,
> cross-platform" rule (no Windows). Port their enforcement to cross-platform CTOC
> Node hooks, wired via `.claude-plugin/hooks.json`, **deduped against CTOC's
> existing Node enforcement** (no double-gating).

## 1. ASSESS — Problem Understanding

The pack's enforcement thesis: "CLAUDE.md is context; hooks are the fence." Its 3
bash hooks (exit-code-2 deny, fire before permission checks + inside subagents):

1. **`guard-bash.sh`** — (a) blocks an irreversible-command blocklist (force-push,
   `reset --hard`, `clean -f`, `checkout .`, branch delete, `rm -rf`,
   DROP/TRUNCATE/DELETE, `terraform destroy`, `kubectl delete ns/deploy/pvc`,
   `mkfs`, `dd if=`, `> /dev/sd`, `chmod -R 777`); (b) gates git commit/push behind
   a single-use `.claude/allow-commit` sentinel.
2. **`guard-files.sh`** — blocks Read/Edit/Write/Bash access to secret files
   (`.env`, `secrets.*`, `credentials`, `id_rsa/ed25519/ecdsa`, `.pem`, `.key`,
   `.kube/config`, `.aws/`, `.ssh/`, `token`).
3. **`stop-test-gate.sh`** — Stop hook: no "done" without a green suite; 3-attempt
   loop guard; `CLAUDE_SKIP_TEST_GATE=1` escape.

**Dedup against existing CTOC enforcement (the planner MUST read these fresh and
confirm before porting):**
- CTOC already gates commits/edits via `src/hooks/PreToolUse.Bash.js` and the human
  gates (`human-gate-check.js`). → **Do NOT port the commit sentinel** (overlap);
  port only the **irreversible-command blocklist**, which CTOC does not have.
- CTOC has no secret-file guard → `guard-files.js` is genuinely new.
- CTOC has no Stop test-gate → `stop-test-gate.js` is genuinely new.

## 2. ALIGN — Business Alignment

Goal: the pack's enforcement runs on every platform CTOC supports (Win/mac/Linux),
as Node hooks, without duplicating gates CTOC already owns.

- **Cross-platform Node, no bash:** each hook reads the hook JSON from stdin, parses
  `tool_input`, and exits 2 to block / 0 to allow — pure Node, `process.platform`
  agnostic, `child_process` with no shell where avoidable.
- **Irreversible-command blocklist → fold into `PreToolUse.Bash.js`** (the existing
  Bash PreToolUse hook) as an additional deny layer, OR a sibling module it calls —
  planner decides after reading it; the blocklist patterns are ported verbatim
  (they are shell-command string matches, inherently cross-platform to check).
- **`guard-files.js` → new PreToolUse hook** (matcher `Read|Edit|Write|Bash`):
  blocks secret-bearing paths in `file_path` AND in a Bash `command` (cat/grep of
  `.env`). Patterns ported verbatim.
- **`stop-test-gate.js` → new Stop hook:** runs the project's test command (resolve
  from `.ctoc/settings` quality-gate / `package.json` `scripts.test` / `node --test
  tests/*.test.js` for CTOC itself), blocks the stop on red, 3-attempt loop guard
  (counter in `.ctoc/state/`), `CTOC_SKIP_TEST_GATE=1` escape, and on the 3rd
  failure stands down + forces an honest failure report (the pack's loop-guard
  design). No-suite-found → pass (exit 0).

## 3. CAPTURE — Acceptance Criteria (BDD)

- [x] **Scenario: irreversible command blocked cross-platform**
  Given the Bash PreToolUse hook
  When a command matching the blocklist (`git push --force`, `rm -rf`,
  `DROP TABLE`, `terraform destroy`, …) is proposed
  Then the hook exits 2 (block) with a message naming the pattern and the
  ask-for-confirmation path
  And a benign command exits 0

- [x] **Scenario: commit gate is NOT double-implemented**
  Given CTOC already gates commits via the human gates + existing Bash hook
  Then OM2 adds NO second commit-sentinel mechanism (the `.claude/allow-commit`
  sentinel is deliberately not ported) — verified by reading PreToolUse.Bash.js

- [x] **Scenario: secret file access blocked (file tools AND shell reads)**
  Given `guard-files.js`
  When a Read/Edit/Write targets `.env` / `id_rsa` / `*.pem`, OR a Bash command
  `cat .env` is proposed
  Then the hook exits 2 with the secret-pattern message
  And a non-secret path exits 0

- [x] **Scenario: stop-test-gate blocks "done" on a red suite, loop-guarded**
  Given a project with a test command and a RED suite
  When the Stop hook runs
  Then it exits 2 (blocks the stop) with the red output, attempts 1..2
  And on attempt 3 it stands down (exit 0) forcing an honest failure report
  And a GREEN suite exits 0
  And `CTOC_SKIP_TEST_GATE=1` or no-suite-found exits 0

- [x] **Scenario: hooks wired + cross-platform + no regression**
  Then `.claude-plugin/hooks.json` registers the new hooks with correct matchers
  And no `.sh` file is introduced (Node only)
  And the full CTOC suite stays green (the irreversible blocklist must not break
  CTOC's own scripts/tests — verify no CTOC Bash step legitimately needs a blocked
  pattern; if one does, document the allowance)

## Scope

**In:**
- `src/hooks/guard-files.js` (NEW) — secret-file PreToolUse guard, Node, stdin-JSON.
- `src/hooks/stop-test-gate.js` (NEW) — Stop hook, Node, runner-detect + loop guard.
- `src/hooks/PreToolUse.Bash.js` — fold in the irreversible-command blocklist
  (deny layer) without disturbing the existing edit/commit enforcement.
- `.claude-plugin/hooks.json` — register guard-files (Read|Edit|Write|Bash) and
  stop-test-gate (Stop); confirm the Bash matcher already routes to
  PreToolUse.Bash.js.
- `tests/opuspack-hooks.test.js` — per-hook behavioral tests: blocklist hit/miss,
  secret hit/miss (file_path + Bash command), stop-gate red/green/loop-guard/escape/
  no-suite, exit-code-2-on-block, cross-platform path handling; assert NO commit
  sentinel added; assert NO `.sh` file added.

**Out:**
- The commit sentinel (`.claude/allow-commit`) — CTOC already gates commits.
- OM1's operating-manual merge (separate plan).
- Per-project install of hooks into `.claude/hooks/` — these are CTOC plugin hooks
  (active wherever CTOC is), the native CTOC mechanism; per-project copies are not
  needed.

## Decisions Taken

- **D-OM2-1:** port only the NEW capabilities (irreversible blocklist, secret guard,
  stop-test-gate); skip the commit sentinel (CTOC already owns commit gating).
- **D-OM2-2:** hooks are CTOC PLUGIN hooks (src/hooks/ + hooks.json), not per-project
  installs — active wherever CTOC runs, matching "every new ctoc".
- **D-OM2-3:** blocklist folds into the existing `PreToolUse.Bash.js` deny path
  (subject to the planner confirming that file's shape); guard-files + stop-test-gate
  are new files.
- **D-OM2-4:** cross-platform Node only; loop-guard counter in `.ctoc/state/`;
  `CTOC_SKIP_TEST_GATE=1` escape preserved; no `.sh` files.

---

# Implementation Details

> Produced by implementation-planner (read-fresh, 2026-07-07). Every claim below
> was verified against the ACTUAL files on disk; discrepancies are quoted. This
> section is the blueprint for Iron Loop Steps 5–16. Feeds the executor directly.

## Step 5 — PLAN: Codebase reality (read-fresh findings)

### F1. The CTOC hook I/O convention is NOT uniform — quote the code

There are **two distinct** I/O conventions in `src/hooks/`, and the blueprint
must match the RIGHT one per hook type:

- **`PreToolUse.Bash.js` (the fold target)** reads the command from the
  **environment variable `CLAUDE_TOOL_INPUT`** (a JSON string with a `.command`
  field), *not* stdin. Verbatim (`getCommand()`, lines 122–132):
  ```js
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';
  try { const parsed = JSON.parse(toolInput); return parsed.command || ''; }
  catch { const match = toolInput.match(/command['":\s]+["']?([^"'\n]+)/); return match ? match[1] : toolInput; }
  ```
  It **blocks with `process.exit(1)`** and **allows with `process.exit(0)`**.
  Block messages go to the terminal via `writeToTerminal(formatBlocked(...))`.
  The security test asserts this contract explicitly (`tests/security-bash-hook.test.js`
  header): "exit 0 -> ALLOWED, exit 1 -> BLOCKED … reads the command from the
  environment variable CLAUDE_TOOL_INPUT … It does NOT read stdin."

- **`PreToolUse.Edit.js` (the pattern for a NEW PreToolUse guard)** reads
  **both** the env var AND **stdin JSON** via `readStdinJson()` =
  `fs.readFileSync(0, 'utf8')` then `JSON.parse`, pulling `tool_name`,
  `tool_input.file_path` / `.path` / `.notebook_path`, and `transcript_path`.
  It blocks with `process.exit(1)`, allows `process.exit(0)`, and **fails OPEN**
  (`process.exit(0)`) on any internal error.

- **Stop hooks** — `andon-halt.js` is the only existing Stop-style blocking hook.
  It **blocks with `process.exit(2)`** and **allows / fails-open with
  `process.exit(0)`** (verbatim: header "0 — dispatch allowed / 2 — dispatch
  halted (Andon cord pulled)"; final `process.exit(2)` at line 332; every
  fail-open path `process.exit(0)`).

**Convention decision (D-OM2-5, below):** each new/folded hook matches the exact
convention already used by hooks of its own event type — the Bash fold stays on
env-var-input + exit-1-block; `guard-files.js` (a PreToolUse hook fired on
Read|Edit|Write|Bash) reads the env var AND stdin JSON exactly like
`PreToolUse.Edit.js` (because Bash-tool payloads deliver `command`, and file
tools deliver `file_path`, and Claude Code delivers those on stdin for the
multi-matcher case) and blocks with exit 1; `stop-test-gate.js` (a Stop hook)
blocks with exit 2 like `andon-halt.js`. The pack's uniform `exit 2` is NOT
copied blindly — it is correct only for the Stop hook.

### F2. DEDUP PROOF — how CTOC already gates commits (do NOT port the sentinel)

`PreToolUse.Bash.js` already contains a full commit gate. Verbatim:
```js
const MINIMUM_STEP_FOR_COMMIT = 15;
function isCommitCommand(command) { /* segments split on ; && || | $( ` ( ,
  finds `git` token, skips global value-flags (-c -C --git-dir …), returns true
  on `commit` or `push` subcommand */ }
// … in main():
if (isCommitCommand(command)) {
  if (currentStep < MINIMUM_STEP_FOR_COMMIT) {
    const reason = `Commit requires step ${MINIMUM_STEP_FOR_COMMIT}+ (DOCUMENT). Current: ${currentStep}`;
    writeToTerminal(formatBlocked(command, state, reason, 'COMMIT'));
    process.exit(1);
  }
  process.exit(0); // commit allowed at step >= 15
}
```
So CTOC gates `git commit` / `git push` behind Iron Loop **step ≥ 15 (DOCUMENT)**,
with chaining/substitution/global-flag-aware detection that is strictly stronger
than the pack's anchored `^\s*git\s+(commit|push)`. The pack's single-use
`.claude/allow-commit` sentinel is a WEAKER, redundant mechanism. **Confirmed:
the sentinel is NOT ported (D-OM2-1). No second commit mechanism is added.** The
Iron Loop step gate + `human-gate-check.js` (approval-marker enforcement on plan
stage folders) together own commit/gate policy.

Also already present in `PreToolUse.Bash.js` (do not disturb): a write-command
gate (blocks `>`, `tee`, `sed -i`, `touch`, `dd`, `truncate`, … before step 8)
and a plan-move gate (blocks raw `mv`/`cp` of `plans/<stage>/` files). The
blocklist fold must be **additive** and sit BEFORE these existing gates so a
destructive command is denied regardless of Iron Loop step.

### F3. DEDUP — secret-file guard and Stop test-gate are genuinely NEW

- `grep` across `src/hooks/` shows **no** secret-file guard: nothing matches
  `.env` / `id_rsa` / `.pem` / `.aws/` / `.ssh/` as a deny target. `guard-files.js`
  is a real new capability.
- No Stop hook runs a test suite. `andon-halt.js` is a *pre-tool* metrics halt,
  not a Stop test-gate. `stop-test-gate.js` is a real new capability.

### F4. CTOC-dogfooding interaction with the blocklist (INFORMED, verified)

Grep of `src/ tests/ scripts/ .ctoc/` for every blocked pattern issued **through
the Claude Bash tool**:

| Blocked pattern | In-repo occurrences | Interaction with the fold |
|---|---|---|
| `git reset --hard` | `src/commands/update.js:117` runs `git -C "${MARKETPLACE_DIR}" reset --hard origin/main` **via `execSync` in the `/ctoc:update` slash command** (`const { execSync } = require('child_process')`, `run()` at line 54). | **NO interaction.** The hook intercepts the Claude **Bash tool** only (via `CLAUDE_TOOL_INPUT`). `execSync` inside a Node slash command is a direct child process — the hook never fires. `/ctoc:update` keeps working. |
| `rm -rf` | Only in TEST fixtures (`tests/security-bash-hook.test.js:357`, `tests/governance-modules-a.test.js:624` as a *string argument to `legalHold.assertNotHeld`*, `tests/menu-task-wiring.test.js:421` as a `nextAction` string) and doc/template prose (`.ctoc/templates/operating-manual.md:17`). None is executed through the Bash tool. | **NO interaction.** These are strings, not Bash-tool invocations. |
| `push --force` / `push -f` | Only doc/template prose and `push --force` as a *ctoc CLI flag* (`src/commands/push.md`, not git). | **NO interaction.** |
| `git clean -f`, `checkout .`, `chmod -R 777`, `dd if=`, `mkfs.` | Only in test fixtures / `isWriteCommand` unit assertions. | **NO interaction.** |

**Conclusion (report to human):** the irreversible blocklist does **not** break
CTOC's own dogfooding. The one destructive command CTOC itself issues
(`git reset --hard origin/main` during `/ctoc:update`) runs via `execSync`, not
the Bash tool, so the hook cannot see it. **However — a documented behavioral
change the human MUST know:** after this fold ships, if a *Claude agent* (or the
user via the Bash tool) ever tries to run `git reset --hard`, `rm -rf`,
`git clean -f`, `git push --force`, etc. **through the Bash tool** during CTOC's
own development, it will now be BLOCKED (exit 1) and must be confirmed/run by the
human directly. This is the intended safety behavior (these are destructive by
design) but it changes the CTOC dev workflow: destructive git surgery on the
ctoc repo now goes through the human, not an agent. No allowance carve-out is
needed for repo scripts because they use `execSync`, not the tool.

### F5. HOOK-COUNT TEST WILL BREAK — must bump (answer to the count question)

`tests/readme-numbers.test.js:142–144` pins the hook count EXACTLY:
```js
it('src/hooks/: 13 hook files (andon-halt added v6.9.27)', () => {
  assert.equal(countTopLevelFiles('src/hooks'), 13);
});
```
There are **13** files in `src/hooks/` today (confirmed by `ls`). Adding
`guard-files.js` + `stop-test-gate.js` makes **15**. This test WILL fail. It
**must be bumped to 15** with an updated label. `tests/readme-numbers.test.js`
is therefore added to the plan's `files:` (done — scope widened; report to human).
No other count/architecture test pins the hook count (grep found only this one).

### F6. Test-command resolution for the Stop gate (cross-platform)

CTOC's own test command is `package.json` → `"test": "node --test tests/*.test.js"`
(confirmed). CTOC has **zero runtime dependencies** (`"dependencies": {}`), so the
new hooks must use only Node built-ins (`fs`, `path`, `os`, `child_process`) —
matching the codebase (`safe-fs`, `regex-utils`, no external libs in hooks).
Resolution order for the Stop gate (cross-platform, no shell):
1. `.ctoc/settings.yaml` quality-gate test command, if present (read flat, like
   the other safety-critical hooks read `settings.yaml` — see `src/lib/settings.js`
   header: "settings.yaml — read directly by the safety-critical PreToolUse hooks
   … flat + dependency-free so hooks parse it fast without a YAML library").
2. else `package.json` → `scripts.test` (run via `npm test` — but see D-OM2-8 for
   the no-shell spawn detail).
3. else **no suite found → exit 0 (gate does not apply)**, exactly like the pack.

## Step 5 — Decisions Taken Under Ambiguity (no-stub rule)

- **D-OM2-5 (I/O convention per event type):** Bash fold → env-var input + exit-1
  block (match `PreToolUse.Bash.js`). `guard-files.js` → PreToolUse, reads env var
  + stdin JSON, exit-1 block, fail-OPEN on error (match `PreToolUse.Edit.js`).
  `stop-test-gate.js` → Stop hook, exit-2 block, exit-0 allow/fail-open (match
  `andon-halt.js`). Rationale: matching same-event-type siblings is what Claude
  Code's hook runner actually expects; the pack's uniform exit-2 is only correct
  for the Stop hook.
- **D-OM2-6 (blocklist placement):** fold the blocklist as the FIRST deny layer in
  `PreToolUse.Bash.js` `main()`, immediately after `getCommand()` returns a
  non-empty command and BEFORE the plan-move / commit / write gates — a
  destructive command is denied regardless of Iron Loop step. Implemented as a
  module-level `const IRREVERSIBLE_PATTERNS = [ /…/i, … ]` array of **literal**
  RegExps (case-insensitive) plus an `isIrreversibleCommand(command)` helper. The
  patterns are STATIC literals, not data-derived, so `regex-utils.escapeRegExp`
  is NOT needed (that helper is for interpolating untrusted data); literal
  `/…/i` regexes satisfy the "no dynamic RegExp on untrusted input" rule directly.
- **D-OM2-7 (blocklist message + exit):** on a blocklist hit, reuse the existing
  `writeToTerminal(formatBlocked(command, state, reason, 'IRREVERSIBLE'))` +
  `process.exit(1)` path so the block presentation is consistent with the other
  Bash gates. `reason` names the matched pattern and instructs: state the action
  and blast radius, get explicit human confirmation, human runs it directly.
- **D-OM2-8 (stop-gate runner, no-shell):** spawn the resolved test command with
  `child_process.spawnSync(cmd, args, { shell: false })` where possible. For the
  `npm test` fallback, resolve the npm binary cross-platform
  (`process.platform === 'win32' ? 'npm.cmd' : 'npm'`) and pass
  `['test','--silent']` as an argv array (no `shell: true`, no string
  interpolation) — this is the cross-platform + injection-safe form. For CTOC
  itself the resolved command is `node --test tests/*.test.js`; since a glob needs
  a shell, resolve CTOC's own suite by expanding `tests/*.test.js` with
  `fs.readdirSync` and passing the file list as argv to `process.execPath`
  (`['--test', ...files]`), avoiding a shell entirely.
- **D-OM2-9 (loop-guard counter location):** counter file
  `.ctoc/state/.test-gate-fails` (JSON `{ "fails": N }` via `safe-fs`), per
  D-OM2-4. Reset to 0 / deleted on green or on the 3rd stand-down. `.ctoc/state/`
  already exists as CTOC's state dir. (The pack used `.claude/.test-gate-fails`;
  CTOC's home is `.ctoc/state/`.)
- **D-OM2-10 (stop-gate DEFAULT — the PERF fork, RECOMMENDED, flag at Gate 2):**
  **ship OPT-IN, default OFF**, gated by a new setting `general.stopTestGate`
  (boolean, default `false`). See "PERF fork recommendation" below for the full
  rationale. When OFF the Stop hook exits 0 immediately (near-zero cost). When ON
  it runs the suite. `CTOC_SKIP_TEST_GATE=1` is an additional per-session escape
  that short-circuits to exit 0 even when the setting is ON.
- **D-OM2-11 (secret guard scope):** `guard-files.js` blocks on BOTH
  `tool_input.file_path` (Read/Edit/Write) AND `tool_input.command` (Bash — e.g.
  `cat .env`), joining them into one target string exactly as the pack did
  (`TARGET="$FILE_PATH $CMD"`). Patterns ported verbatim as literal `/…/i`
  RegExps. Fails OPEN on internal error (match `PreToolUse.Edit.js`).

## PERF fork recommendation (D-OM2-10) — RECOMMEND OPT-IN, default OFF

**Recommendation: ship the Stop test-gate OPT-IN (default OFF), operator enables
via `general.stopTestGate: true`.**

Rationale (state the facts, no editorializing):
- CTOC's own suite is `node --test tests/*.test.js` across 71+ test files; a full
  run is on the order of ~1–2 minutes. Running the FULL suite on **every agent
  Stop** would add that latency to every single stop, for every CTOC user, on a
  PUBLIC marketplace plugin — many of whom have large or slow suites CTOC cannot
  predict.
- A Stop hook that silently burns 1–2 min on every stop is exactly the
  "grinding with no feedback = broken from the human's viewpoint" failure the
  project's own CLAUDE.md warns against. For a public plugin, a surprising
  minutes-long stall on first use is a worse default than a guard that is off
  until deliberately enabled.
- The value (enforce "done = green") is real but is ALSO already covered inside
  the Iron Loop: **Step 14 VERIFY** is the quality gate (lint, typecheck, ALL
  tests, coverage ≥ 80%). The Stop gate is a belt-and-suspenders backstop for
  ad-hoc/escape-phrase work that skips the loop — valuable to those who want it,
  not something to impose on every public user by default.
- **Human gate is NEVER weakened either way** (per CLAUDE.md + the
  `environment-mode` invariant): the four human gates and the Step-14 quality gate
  are untouched. `stopTestGate` is an *additional* backstop, not a replacement,
  so defaulting it OFF removes nothing mandatory.

The toggle is designed regardless of the default: `general.stopTestGate`
(boolean) added to `SETTINGS_SCHEMA.general` in `src/lib/settings.js`. **NOTE — a
scope observation for the human:** `src/lib/settings.js` is NOT in the plan's
`files:`. If the executor implements the toggle by adding a schema key there, that
file must be added to `files:` too. The MINIMAL-SCOPE alternative that stays
inside the current `files:` is: `stop-test-gate.js` reads its own on/off flag
directly from `.ctoc/settings.yaml` (flat, the safety-critical-hook convention)
with a hardcoded default of OFF, adding no `settings.js` schema key. **Executor
must pick one and, if it edits `settings.js`, report the scope widen to the human**
(do not silently edit an out-of-scope file). Recommended: the settings.yaml-only
read (keeps scope tight, matches how the other safety hooks read config).

## Dependency Graph

```
tests/opuspack-hooks.test.js  ──drives(subprocess)──▶  src/hooks/PreToolUse.Bash.js   (fold: blocklist)
                              ──drives(subprocess)──▶  src/hooks/guard-files.js        (NEW)
                              ──drives(subprocess)──▶  src/hooks/stop-test-gate.js     (NEW)

src/hooks/PreToolUse.Bash.js  ──requires──▶  ../lib/state-manager, ../lib/ui   (UNCHANGED — existing)
src/hooks/guard-files.js      ──requires──▶  path, fs (built-ins only)         (+ optional ../lib/regex-utils NOT needed — literal regexes)
src/hooks/stop-test-gate.js   ──requires──▶  path, fs, os, child_process       (built-ins only)
                              ──reads──────▶  .ctoc/settings.yaml (flat), package.json, .ctoc/state/.test-gate-fails

.claude-plugin/hooks.json     ──registers──▶  guard-files.js (Read|Edit|Write|Bash),  stop-test-gate.js (Stop)
                              ──already-registers──▶  PreToolUse.Bash.js (Bash)   (NO new registration for the fold)

tests/readme-numbers.test.js  ──asserts count of──▶  src/hooks/ (13 ➜ 15)   (BUMP)
```
No cycles. No orphans (every new file is wired in `hooks.json` and exercised by
the test). Layer rule honored: hooks depend only on `lib/` + Node built-ins.

## Implementation Order (dependency order)

1. `tests/opuspack-hooks.test.js` (CREATE) — TDD-Red first (Step 8). Tests fail
   until the hooks/fold exist.
2. `src/hooks/PreToolUse.Bash.js` (MODIFY) — fold in the blocklist (no dep on new files).
3. `src/hooks/guard-files.js` (CREATE) — no dep on other new files.
4. `src/hooks/stop-test-gate.js` (CREATE) — no dep on other new files.
5. `.claude-plugin/hooks.json` (MODIFY) — register the two new hooks.
6. `tests/readme-numbers.test.js` (MODIFY) — bump hook count 13 → 15.

## File Specifications

### File: `src/hooks/PreToolUse.Bash.js`
**Action:** MODIFY · **Change type:** fold-in additional deny layer (blocklist).
**Purpose:** add an irreversible-command blocklist as the first deny layer, without
disturbing existing plan-move / commit / write gates.

**Changes:**
- **Add** module-level constant after `ALWAYS_ALLOWED` (≈ line 54):
  ```js
  // Irreversible / destructive commands — always blocked regardless of Iron Loop
  // step. Ported verbatim from the opus-pack guard-bash.sh blocklist. Literal
  // case-insensitive RegExps (no dynamic/data-derived construction).
  const IRREVERSIBLE_PATTERNS = [
    /git\s+push\s+.*--force(-with-lease)?/i,
    /git\s+push\s+-f\b/i,
    /git\s+reset\s+--hard/i,
    /git\s+clean\s+-[a-z]*f/i,
    /git\s+checkout\s+\.\s*$/i,
    /git\s+(branch|push).*(-D|--delete)/i,
    /rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)/i,
    /rm\s+-rf/i,
    /DROP\s+(TABLE|DATABASE|SCHEMA)/i,
    /TRUNCATE\s+TABLE/i,
    /DELETE\s+FROM\s+\w+\s*;?\s*$/i,
    /terraform\s+destroy/i,
    /kubectl\s+delete\s+(namespace|deployment|pvc)/i,
    /mkfs\./i,
    /dd\s+if=/i,
    />\s*\/dev\/sd/i,
    /chmod\s+-R\s+777/i,
  ];
  ```
- **Add** helper `function isIrreversibleCommand(command)` → `boolean` (returns
  `IRREVERSIBLE_PATTERNS.some(p => p.test(command))`; guards `!command → false`).
- **Modify** `main()`: immediately after `if (!command) process.exit(0);` (≈ line
  176) and BEFORE the plan-move block, insert:
  ```js
  if (isIrreversibleCommand(command)) {
    const stateResult = loadState(projectPath);
    writeToTerminal(formatBlocked(command, stateResult.state,
      'Irreversible/destructive command. State the action and blast radius to the human and get explicit confirmation; the human runs it directly (or temporarily disables this guard).',
      'IRREVERSIBLE'));
    process.exit(1);
  }
  ```
- **Do NOT** touch `isCommitCommand`, the commit gate, `isWriteCommand`, the write
  gate, or the plan-move gate. **Do NOT** add any `.claude/allow-commit` sentinel.
**I/O:** unchanged — env `CLAUDE_TOOL_INPUT`, exit 1 block / 0 allow.
**Error handling:** unchanged top-level `main().catch(... process.exit(1))`.

### File: `src/hooks/guard-files.js`
**Action:** CREATE · **Type:** PreToolUse hook (matcher `Read|Edit|Write|Bash`).
**Purpose:** block access to secret-bearing targets in a file path OR a Bash command.
**I/O (match `PreToolUse.Edit.js`):** read `process.env.CLAUDE_TOOL_INPUT` AND
`readStdinJson()` = `JSON.parse(fs.readFileSync(0,'utf8'))`. Extract
`tool_input.file_path` (or `.path`/`.notebook_path`) AND `tool_input.command`.
`TARGET = `${filePath || ''} ${command || ''}``.
**Exports:** none required at runtime, but **export the pure matcher for testing**:
`module.exports = { isSecretTarget, PROTECTED_PATTERNS }` and run `main()` only under
`if (require.main === module)` (mirror `andon-halt.js`'s test-export pattern).
**Patterns (ported verbatim, literal case-insensitive RegExps):**
```js
const PROTECTED_PATTERNS = [
  /\.env\b/i,
  /secrets?\.(ya?ml|json|toml)/i,
  /credentials/i,
  /id_(rsa|ed25519|ecdsa)/i,
  /\.pem($|\s)/i,
  /\.key($|\s)/i,
  /\.kube\/config/i,
  /\.aws\//i,
  /\.ssh\//i,
  /token/i,
];
```
**Behavior:** if `PROTECTED_PATTERNS.some(p => p.test(TARGET))` →
`process.stderr.write('[CTOC] guard-files BLOCKED: target matches secret pattern …')`
+ `process.exit(1)`. Else `process.exit(0)`. **Fail OPEN** (`process.exit(0)`) on any
internal error — wrap `main()` body in try/catch like `PreToolUse.Edit.js`.
**Cross-platform:** normalize path separators (`String(target).replace(/\\/g,'/')`)
before matching so `\.aws/`, `\.ssh/`, `\.kube/config` match on Windows too.

### File: `src/hooks/stop-test-gate.js`
**Action:** CREATE · **Type:** Stop hook.
**Purpose:** no "done" without a green suite; loop-guarded; opt-in; escapable.
**I/O (match `andon-halt.js`):** Stop hook. **exit 2 = block the stop**,
**exit 0 = allow / fail-open**. Read stdin best-effort (not strictly needed).
**Control flow:**
1. `if (process.env.CTOC_SKIP_TEST_GATE === '1') process.exit(0);` — per-session escape.
2. Resolve `projectRoot` via `findProjectRoot(process.cwd())` (like `andon-halt.js`);
   fail-open on error.
3. **Opt-in check (D-OM2-10):** read `stopTestGate` (default `false`) from
   `.ctoc/settings.yaml` (flat parse, no YAML lib — reuse the `readYamlFlat`
   pattern present in `andon-halt.js`). If OFF → `process.exit(0)` immediately.
4. Resolve the test command (F6 order): settings.yaml quality-gate cmd → `package.json`
   `scripts.test` → **no suite → `process.exit(0)`**.
5. Run it via `spawnSync(..., { shell: false })` (D-OM2-8). Capture status + tail
   of output.
6. **Green (status 0):** delete `.ctoc/state/.test-gate-fails`; `process.exit(0)`.
7. **Red (status ≠ 0):** read+increment `.ctoc/state/.test-gate-fails`
   (`{ fails: N }` via `safe-fs`). If `fails >= 3` → delete counter,
   `process.stderr.write('Test gate: suite still red after 3 attempts — stand down; report the failure honestly with the output below. …')`, `process.exit(0)`
   (stand-down forces the honest report). Else write incremented counter,
   `process.stderr.write("Test gate BLOCKED stop: the suite is red. 'Done' means green. Fix the cause (never weaken the test). Attempt N/3. …")`, `process.exit(2)`.
**Exports:** export pure helpers for testing:
`module.exports = { resolveTestCommand, readFailCount, writeFailCount }`; run `main()` only under `require.main === module`.
**Cross-platform:** `path.join` for all paths; npm binary `win32 ? 'npm.cmd' : 'npm'`;
CTOC self-suite via `fs.readdirSync` glob expansion + `process.execPath` argv
(D-OM2-8); counter under `.ctoc/state/` via `safe-fs`.

### File: `.claude-plugin/hooks.json`
**Action:** MODIFY · **Purpose:** register the two new hooks; the Bash fold needs
NO new registration (the `Bash` matcher already routes to `PreToolUse.Bash.js`,
confirmed at lines 57–65).
**Changes (match the EXACT existing schema — `type: "command"`,
`node "${CLAUDE_PLUGIN_ROOT}/src/hooks/<file>"`):**
- **Add** to the `PreToolUse` array a new entry:
  ```json
  { "matcher": "Read|Edit|Write|Bash",
    "hooks": [ { "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/guard-files.js\"" } ] }
  ```
- **Add** a top-level `"Stop"` array (does not exist yet):
  ```json
  "Stop": [ { "hooks": [ { "type": "command",
    "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/stop-test-gate.js\"" } ] } ]
  ```
- **Do NOT** add/modify the `Bash` PreToolUse entry (fold is in-file).

### File: `tests/readme-numbers.test.js`
**Action:** MODIFY · **Purpose:** unbreak the hook-count assertion.
**Change:** line ~142–144 — update label + count:
```js
it('src/hooks/: 15 hook files (guard-files + stop-test-gate added for OM2)', () => {
  assert.equal(countTopLevelFiles('src/hooks'), 15);
});
```

## Test Plan — `tests/opuspack-hooks.test.js`
**Action:** CREATE · **Framework:** `node:test` (`describe`/`it`/`assert`).
**Harness:** spawn each hook as a subprocess (mirror `tests/security-bash-hook.test.js`).
For the Bash fold, deliver the command via `env.CLAUDE_TOOL_INPUT = JSON.stringify({command})`
and plant valid signed state with `state-manager` (reuse `makeProject`/`setState`
from the existing bash-hook test). For `guard-files.js`, deliver via BOTH
`env.CLAUDE_TOOL_INPUT` and `input` (stdin) JSON. For `stop-test-gate.js`, run in
a hermetic temp project with a synthetic `package.json` whose `scripts.test`
points at a tiny green/red node script; toggle `stopTestGate` via a planted
`.ctoc/settings.yaml`.

**Cases (every one a real assertion; no always-green):**

*Blocklist (Bash fold) — exit 1 on hit, 0 on miss:*
1. `git push --force` → exit 1. 1b. `git push -f` → 1. 1c. `git push --force-with-lease` → 1.
2. `git reset --hard` (and `git reset --hard HEAD~1`) → 1.
3. `git clean -fd` / `git clean -f` → 1.
4. `git checkout .` → 1.
5. `git branch -D x` / `git push origin --delete x` → 1.
6. `rm -rf /tmp/x` / `rm -fr x` → 1.
7. `DROP TABLE users;` / `TRUNCATE TABLE t` / `DELETE FROM t;` → 1.
8. `terraform destroy` → 1.
9. `kubectl delete namespace ns` / `deployment d` / `pvc p` → 1.
10. `mkfs.ext4 /dev/sdb` / `dd if=/dev/zero of=x` / `echo x > /dev/sda` / `chmod -R 777 .` → 1.
11. MISS: `git status`, `ls -la`, `git commit -m x` (commit path is the EXISTING
    gate, not the blocklist — assert it is NOT blocked *by the blocklist* at
    step ≥ 15), `node --test`, `rm file.txt` (no -rf) → exit 0 (with state at
    step ≥ 8 so the write gate does not interfere).

*Secret guard (guard-files.js) — exit 1 on hit, 0 on miss:*
12. `file_path` = `/proj/.env` → 1; `id_rsa` → 1; `x.pem` → 1; `secrets.yaml` → 1;
    `~/.aws/credentials` → 1; `~/.ssh/id_ed25519` → 1; `.kube/config` → 1.
13. Bash `command` = `cat .env` → 1; `grep KEY config/secrets.json` → 1.
14. MISS: `file_path` = `/proj/src/app.js` → 0; `command` = `ls -la` → 0.
15. Fail-open: malformed stdin (`input: 'not json'`, env empty) → exit 0.

*Stop test-gate (stop-test-gate.js):*
16. `stopTestGate` OFF (default) → exit 0 (near-instant, no suite run).
17. ON + GREEN suite → exit 0; counter file absent/zeroed.
18. ON + RED suite, attempt 1 → exit 2; counter = 1. attempt 2 → exit 2; counter = 2.
19. ON + RED suite, attempt 3 → exit 0 (stand-down); counter cleared; stderr names
    "3 attempts" / "report … honestly".
20. ON + `CTOC_SKIP_TEST_GATE=1` → exit 0 even with a red suite.
21. ON + no suite found (no `scripts.test`, no settings cmd) → exit 0.

*Structural / regression guards:*
22. `PreToolUse.Bash.js` source contains NO `allow-commit` / sentinel string
    (assert the commit sentinel was NOT ported): `assert.ok(!src.includes('allow-commit'))`.
23. No `.sh` file added: assert `src/hooks/` contains zero `*.sh`, and the three
    target hook files end in `.js`.
24. Cross-platform path handling: `guard-files.js` blocks a backslash path
    `C:\\Users\\x\\.ssh\\id_rsa` (assert separator normalization) and
    `stop-test-gate.js` counter path uses `path.join` (assert no hardcoded `/`).

**Coverage target:** ≥ 80% line/branch on the three hook modules; every exit
path (0/1/2) exercised.

## Acceptance-criteria mapping

| Plan criterion | Implemented in | Test case |
|---|---|---|
| Irreversible command blocked cross-platform; benign allowed | `PreToolUse.Bash.js` blocklist fold | 1–11 |
| Commit gate NOT double-implemented (sentinel not ported) | (no change — existing step-15 gate) | 22 |
| Secret file access blocked (file tools AND shell reads); non-secret allowed | `guard-files.js` | 12–15 |
| Stop gate blocks "done" on red, loop-guarded (3 → stand-down); green/escape/no-suite allow | `stop-test-gate.js` | 16–21 |
| Hooks wired; no `.sh`; suite green | `hooks.json` + `readme-numbers.test.js` bump | 23, F4/F5 |

## Security review

- [x] **No dynamic RegExp on untrusted input** — all blocklist/secret patterns are
  literal `/…/i` RegExps; no `new RegExp(userInput)`. `escapeRegExp` not required
  (no data interpolation).
- [x] **Path traversal** — `guard-files.js` only READS the target string to match;
  it never opens/writes the target, so traversal is moot. `stop-test-gate.js`
  writes only `.ctoc/state/.test-gate-fails` via `safe-fs` + `path.join`.
- [x] **Command injection** — `stop-test-gate.js` spawns with `shell: false` and
  argv arrays (D-OM2-8); no string interpolation into a shell.
- [x] **No secrets in code** — patterns match secret *names*, contain no values.
- [x] **Fail-open on error** — guard-files + stop-test-gate exit 0 on internal
  error (never break the user's flow); the blocklist fold rides the existing
  `main().catch` (exit 1) but only on a genuine crash, consistent with the file.
- [x] **Error messages leak nothing** — messages name the matched pattern class
  and the remediation, not internal paths/state.

## Risk mitigations

| Risk | Mitigation | Where |
|---|---|---|
| Blocklist blocks a legit CTOC repo op | Verified none run via the Bash tool (F4); `/ctoc:update`'s `reset --hard` uses `execSync`, unaffected. Document the dev-workflow change for the human. | F4 |
| Full-suite Stop gate stalls every public user | Default OFF, opt-in `stopTestGate`; `CTOC_SKIP_TEST_GATE=1` escape; no-suite → pass. | D-OM2-10 |
| Wrong exit code → hook silently no-ops | Match same-event-type sibling conventions exactly (Bash/Edit exit 1; Stop exit 2); assert real exit codes via subprocess. | D-OM2-5, tests |
| Hook-count test breaks the suite | Bump 13 → 15; `readme-numbers.test.js` added to `files:`. | F5 |
| Settings toggle drags an out-of-scope file in | Prefer settings.yaml-only read in `stop-test-gate.js`; if `settings.js` schema edited, report scope widen. | D-OM2-10 |

## Gate 2 checklist for the human

- [x] Approve the **stop-gate default = OPT-IN (OFF)** recommendation (D-OM2-10).
- [x] Approve widening `files:` with `tests/readme-numbers.test.js` (done) and
      acknowledge that IF the executor adds a `settings.js` schema key it must
      widen `files:` again (recommended path avoids this).
- [x] Acknowledge the CTOC dev-workflow change: destructive git via the Bash tool
      is now human-only during ctoc development (F4).

## Step 8–16 execution checklist (canonical labels)

- **Step 8 — TEST:** write `tests/opuspack-hooks.test.js` (all 24 cases) first, Red.
- **Step 9 — PREPARE:** confirm Node built-ins only (zero deps); create no dirs
  (`.ctoc/state/` already exists at runtime; hook creates the counter lazily).
- **Step 10 — IMPLEMENT (one step, sub-items):** (a) fold blocklist into
  `PreToolUse.Bash.js`; (b) create `guard-files.js`; (c) create `stop-test-gate.js`;
  (d) register both in `.claude-plugin/hooks.json`; (e) bump
  `tests/readme-numbers.test.js` 13 → 15. Record any ambiguity in
  `## Decisions Taken Under Ambiguity` (no stubs).
- **Step 11 — REVIEW:** self-review vs the I/O convention (F1), the no-sentinel
  dedup (F2), fail-open paths, no `.sh`.
- **Step 12 — OPTIMIZE:** dedupe pattern arrays; ensure single-pass `.some()` match.
- **Step 13 — SECURE:** run the security checklist above; confirm `shell:false`,
  literal regexes, no traversal.
- **Step 14 — VERIFY (quality gate):** `node --test tests/*.test.js` all green
  (`# fail 0`), incl. the bumped `readme-numbers` count and the new
  `opuspack-hooks` suite; `eslint . --max-warnings 0`; coverage ≥ 80% on the
  three hooks; 0 skipped.
- **Step 15 — DOCUMENT:** JSDoc headers on both new hooks (exit-code contract,
  I/O channel, fail-open); note the two new hooks in CLAUDE.md's hook inventory
  (13 → 15) if the executor updates that prose (report if it widens scope).
- **Step 16 — FINAL-REVIEW:** implementation-reviewer verifies 14 dimensions +
  human-approval marker before Gate 3.

## Validation note (implementation → todo)

The plan retains its required functional sections (ASSESS / ALIGN / CAPTURE-BDD /
Scope in-out / Decisions) and now carries `iron_loop: true` in the FIRST
frontmatter block plus a complete `# Implementation Details` with the Step 8–16
canonical-label checklist — the shape `plan-validator.js` expects for the
implementation → todo transition. `files:` is coverage-complete for every file the
implementation touches (the 5 originals + `tests/readme-numbers.test.js`). Human
gate to `todo` (Gate 2) remains required and is NOT crossed here.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (`tests/opuspack-hooks.test.js`, 43 cases)
- [x] Test error conditions (fail-open, no-suite, loop-guard, malformed stdin)
- [x] Run tests - expect RED (failing) — confirmed RED (hooks missing + fold absent)

### Step 9: PREPARE
- [x] Install dependencies if needed — none; Node built-ins only (zero runtime deps)
- [x] Check prerequisites — confirmed `safe-fs`, `project-root`, `state-manager`, `ui` present
- [x] Verify dev environment ready
- [x] Create directories/config if needed — `.ctoc/state/` created lazily by the counter writer

### Step 10: IMPLEMENT
- [x] Fold blocklist into `PreToolUse.Bash.js` (first deny layer)
- [x] Create `guard-files.js` (secret guard, env+stdin, fail-open)
- [x] Create `stop-test-gate.js` (Stop hook, opt-in, loop-guard)
- [x] Register both in `.claude-plugin/hooks.json`
- [x] Bump `tests/readme-numbers.test.js` 13 → 15
- [x] Add error handling (fail-open on guard-files + stop-test-gate)
- [x] Wire up integration points — GREEN (43/43)

### Step 11: REVIEW
- [x] Self-review vs the I/O convention per event type (F1) — matched
- [x] Verify no-sentinel dedup (F2) — structural test asserts no `allow-commit`
- [x] Check error handling completeness — fail-open paths verified

### Step 12: OPTIMIZE
- [x] Single-pass `.some()` match on both pattern arrays
- [x] No redundant reads; settings read once; counter read/write minimal

### Step 13: SECURE
- [x] Literal case-insensitive RegExps only — no dynamic RegExp on untrusted input
- [x] `spawnSync(shell:false)` + argv arrays — no command injection
- [x] No traversal (guard-files only matches strings; counter via `safe-fs`+`path.join`)
- [x] No secrets in code (patterns match names, not values)

### Step 14: VERIFY
- [x] Run lint — `npx eslint . --max-warnings 0` → exit 0
- [x] Type check — `npm run typecheck` baseline-neutral (0 of my 5 files in the 89 pre-existing errors)
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → tests 2855, **pass 2855, fail 0, skipped 0**
- [x] Coverage >= 80% on the 3 hooks — guard-files 93.28%, PreToolUse.Bash 86.44%, stop-test-gate 94.37%
- [x] 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] JSDoc headers on both new hooks (exit-code contract, I/O channel, fail-open, cross-platform)
- [x] Blocklist fold documented inline in `PreToolUse.Bash.js`
- [x] CLAUDE.md hook-inventory prose (13 → 15) — NOT updated: `CLAUDE.md` is not in `files:`; updating it would silently widen scope. Reported to human (see Execution Record).

### Step 16: FINAL-REVIEW
- [x] Steps 8-15 completed
- [x] All quality checks passed
- [x] Human review pending (Gate 3 — not crossed here; plan left in todo per work order)

---

## Execution Record (Steps 8–16, executor, read-fresh)

**Fold placement (real lines in `src/hooks/PreToolUse.Bash.js`):**
- `const IRREVERSIBLE_PATTERNS = [...]` + `isIrreversibleCommand()` helper at **line 61** (right after `ALWAYS_ALLOWED`, before `GIT_VALUE_FLAGS`).
- Deny layer in `main()` at **lines 213–224** — `if (isIrreversibleCommand(command))` fires immediately after `if (!command) process.exit(0)` and BEFORE the plan-move / commit / write gates, so a destructive command is denied regardless of Iron Loop step. Reuses `writeToTerminal(formatBlocked(command, state, reason, 'IRREVERSIBLE'))` + `process.exit(1)`. All 17 patterns ported verbatim as literal case-insensitive regexes. Commit sentinel NOT ported (existing step-15 commit gate + `isCommitCommand` untouched).

**The 3 hooks — input/exit conventions as built:**
- `PreToolUse.Bash.js` (fold): input `CLAUDE_TOOL_INPUT` env JSON; block = `exit 1`, allow = `exit 0` (matches existing Bash gate).
- `guard-files.js` (NEW, matcher `Read|Edit|Write|Bash`): input env `CLAUDE_TOOL_INPUT` **AND** stdin JSON; target = `"<file_path> <command>"`; block = `exit 1`, allow = `exit 0`, **fail-OPEN = `exit 0`** on internal error (matches `PreToolUse.Edit.js`). Exports `{ isSecretTarget, PROTECTED_PATTERNS }` for tests; runs `main()` only under `require.main === module`. Backslash paths normalized `\`→`/` for Windows.
- `stop-test-gate.js` (NEW, Stop hook): block = `exit 2`, allow/fail-open = `exit 0` (matches `andon-halt.js`). Exports `{ resolveTestCommand, readFailCount, writeFailCount, readStopTestGate }`.

**Stop-gate default-OFF proof:** `readStopTestGate()` returns `true` only when `general.stopTestGate: true`; `isGateEnabled()` returns false when the key is absent or `false`. Test `exits 0 when stopTestGate is not set (default OFF, no suite run)` planted a RED suite with NO settings key → **exit 0** (near-instant, suite never run). `stopTestGate: false` explicit → exit 0. Only `true` runs the suite.

**Normal-git-not-blocked proof (CRITICAL):** dedicated allow-test `NORMAL git commit / push / add are NOT blocked by the blocklist` at step 15: `git add -A`, `git add .`, `git commit -m "msg"`, `git push origin main`, `git push` all → **exit 0**. The blocklist patterns only match `--force`/`-f`, `--delete`/`-D`, and `checkout .` — a plain `git push origin main` / `git commit` / `git add .` matches none. `git checkout .` (destructive) is blocked; `git checkout main` (benign) is allowed. Commit-before-step-15 still blocked by the EXISTING commit gate (not the blocklist), proving the fold did not open a bypass.

**Tallies:**
- opuspack-hooks.test.js: **43 pass, 0 fail, 0 skipped** (RED→GREEN).
- Full suite `node --test tests/*.test.js`: **tests 2855, pass 2855, fail 0, skipped 0, todo 0**.
- Regression (security-bash-hook + readme-numbers + hooks): 212 pass, 0 fail.
- eslint `. --max-warnings 0`: **exit 0** (one stray `eslint-disable` directive removed).
- tsc: baseline-neutral (89 pre-existing errors, 0 in my 5 files).
- `ls src/hooks/*.js | wc -l` = **15**; readme-numbers count test green.
- hooks.json: PreToolUse now 7 entries (guard-files added), Stop 1 entry (stop-test-gate); Bash matcher unchanged (fold is in-file).

**Decisions taken under ambiguity (executor):**
- **D-OM2-12:** Implemented the stop-gate opt-in as a **settings.yaml-only flat read** inside `stop-test-gate.js` (no `src/lib/settings.js` schema key), the MINIMAL-SCOPE path the planner recommended — keeps `files:` tight and matches how the other safety-critical hooks read config. `src/lib/settings.js` was NOT touched.
- **D-OM2-13:** `CLAUDE.md` hook-inventory prose (13 → 15) NOT edited — `CLAUDE.md` is outside the plan's `files:`; editing it would silently widen scope. Flagged for the human instead of freelancing an out-of-scope edit.
- **D-OM2-14:** counter stored as JSON `{ "fails": N }` at `.ctoc/state/.test-gate-fails` via `safe-fs` + `path.join` (per D-OM2-9); cleared on green and on the 3rd stand-down.

## Consolidated pre-Gate-3 KICKBACK (code-review + security-scan, read-fresh, TDD RED→GREEN)

Both the code review and the security scan kicked back on the same surface: 2 pattern
arrays (`IRREVERSIBLE_PATTERNS`, `PROTECTED_PATTERNS`) + 1 parser (`readStopTestGate`).
Applied as ONE consolidated fix pass. Files touched: `src/hooks/PreToolUse.Bash.js`,
`src/hooks/guard-files.js`, `src/hooks/stop-test-gate.js`, `tests/opuspack-hooks.test.js`.
`isCommitCommand`, the step-15 commit gate, the write gate, and the mv/cp plan-move gate
are byte-identical (untouched).

### resolveGitSubcommand approach (FIX 1b/1f — the core defect)
Factored `resolveGitSubcommands(command)` — a shared helper that reuses the EXISTING
`isCommitCommand` token-walk mechanism: split on chaining/substitution boundaries
(`[\n;] && || | $( \` (`), find `git`, then walk tokens skipping git GLOBAL flags via the
same `GIT_VALUE_FLAGS` set (`-c`/`-C`/`--git-dir`/… consume flag+value; other `-…` consume
one), and return `{ sub, args }` for the RESOLVED subcommand. `isDestructiveGitCommand()`
OR-folds over the segments and tests the destructive rules against the resolved
subcommand+args:
- `push` → blocks if args include `--force` / `--force-with-lease` / `-f` / `--delete` / `-D`
- `reset` → blocks if args include `--hard`
- `clean` → blocks if args include `--force` or any `-…f…` short cluster
- `branch` → blocks if args include `-D` / `--delete`
- `checkout` → blocks if args include `.`
Result: `git -c core.pager=cat push --force`, `git -C dir reset --hard`,
`git --git-dir=.g clean -d -f`, `git -c a=b branch -D x`, `git -c a=b checkout .` all BLOCK
regardless of interposed global flags. No duplication of the walk logic.

### Final regex / matcher for each fixed pattern
- **F1 ReDoS (force-push):** `/git\s+push\s+.*--force(-with-lease)?/i` (O(n²), 14.2s on 200k
  spaces) → `/\bgit\b.*\bpush\b.*?--force(-with-lease)?\b/i` (lazy `.*?`, single flexible run,
  non-backtracking). **Timing before/after: 14229ms → 1ms** on a 200k-space input.
- **F2 rm split/long-form:** replaced the two combined-cluster regexes with `isDestructiveRm()`
  — anchors `rm` at a command boundary `(?:^|[\s;&|(])`, tokenizes the arg tail, blocks iff a
  recursive flag (`-r`/`-R`/`--recursive`/`-…r…`) AND a force flag (`-f`/`--force`/`-…f…`) are
  both present in any order/position. Catches `rm -rf`, `-fr`, `-r -f`, `-f -r`,
  `--recursive --force`, `-R -f`.
- **F2 git clean split flags:** handled by the resolver (`clean` + `-f`/`--force` anywhere).
- **HIGH-2/3, LOW-2 command-word anchors:** destructive command WORDS anchored at
  `(?:^|[\s;&|(])` — `dd`, `mkfs`, `terraform destroy`, `kubectl delete`, `chmod -R 777`.
  `add if=` / `confirm -rf` / `perform -rf` now ALLOW; `; rm -rf` / `&& dd if=` still BLOCK.
- **HIGH-4 DELETE FROM (SQL-driver-token approach, chosen — the preferred option):**
  `/DELETE\s+FROM\s+\w+\s*;?\s*$/i` (blocked benign echoes, missed `… WHERE …`) →
  DELETE only counts when a driver token is present: `SQL_DRIVER =
  /\b(psql|mysql|mariadb|sqlite3|sqlcmd|mongo|mongosh)\b/i` AND `SQL_DELETE =
  /\bDELETE\s+FROM\s+\w+/i` (no `$` anchor, so `WHERE` clauses match). `echo DELETE FROM t`
  ALLOWS; `psql -c "DELETE FROM t WHERE 1=1"` and `psql -c "DELETE FROM users"` BLOCK.
  `DROP`/`TRUNCATE` remain driver-INDEPENDENT (command-boundary anchored) — matches the
  existing acceptance tests. NOTE: the pre-existing test asserting bare `DELETE FROM t;`
  blocks was corrected to ALLOW (a driver-less DELETE is indistinguishable from prose).
- **guard-files token over-block (MED-1):** `/token/i` → the task's suggested regex was found
  (read-fresh, verified) to STILL block `refreshToken.js` because `refresh[_-]?token` matches
  camelCase `refreshToken`. **Decision:** require an EXPLICIT `_`/`-` separator:
  `/(^|[/_.-])((access|refresh|auth)[_-]token|\.token|tokens?\.(json|ya?ml|txt|env))\b/i`.
  `tokenizer.js`/`refreshToken.js`/`tokens.test.js` ALLOW; `access_token.json`/`.token`/
  `api_token.txt` BLOCK.
- **guard-files credentials (MED-2):** `/credentials/i` → `/(?:^|[/\\])\.?credentials\b/i`
  (path-segment-anchored, ReDoS-safe: no optional suffix group). `get-credentials.ts` ALLOWS;
  `.credentials`/`credentials.json`/`.aws/credentials` BLOCK.
- **guard-files .env (MED-2):** `/\.env\b/i` → `/\.env(?!\.(?:example|sample|template)\b)\b/i`
  (negative lookahead excludes committable templates; ReDoS-safe, no greedy suffix capture)
  plus a new `/\.envrc\b/i` for direnv. `.env`/`.env.local`/`.env.production` BLOCK;
  `.env.example`/`.env.sample`/`.env.template` ALLOW.
- **guard-files keys (F3):** `/\.pem($|\s)/i` + `/\.key($|\s)/i` → `/\.(pem|key)\b/i` (match
  anywhere in a path segment, so `server.key.backup` blocks); `id_(rsa|ed25519|ecdsa)` →
  `id_(rsa|dsa|ed25519|ecdsa|\w+)` (adds `id_dsa` + any other `id_*` key file).
  Two `security/detect-unsafe-regex` eslint errors on the first `.env`/`credentials` drafts
  (greedy `(\.[\w.-]+)?\b` / `(\.\w+)?` suffix groups) were eliminated by the boundary-only
  forms above — verified SAFE via `safe-regex`.

### readStopTestGate indent-depth fix (FIX 3 / LOW-1)
Tracks the direct-child indent of each top-level section: `stopTestGate` is accepted ONLY
when `section === 'general'` AND its indent equals the section's first-child indent. A nested
`general:\n  sub:\n    stopTestGate: true` is at a deeper indent → returns FALSE (default OFF).
Surrounding quotes stripped from the value before `=== true` (mirrors andon-halt.js
`readYamlFlat`): `general:\n  stopTestGate: "true"` → gate ENABLED. Default-OFF + fail-open
preserved.

### TDD RED→GREEN proof
New boundary/bypass tests were added FIRST and run against the OLD (stashed) source:
**18 failing test groups RED**, including the ReDoS probe at **14,236ms** (the O(n²) blowup)
and every bypass/over-block case. Fixes restored → all GREEN.

### Normal-allow / destructive-block matrix (real hook subprocess, exit codes)
ALLOW (exit 0): `git add -A`·`git add .`·`git commit -m "x"`·`git push origin main`·`git push`·
`git checkout main`·`git checkout -b feat`·`npm test`·`node --test`·`add if=x`·`confirm -rf`·
`perform -rf`·`echo DELETE FROM t`·`rm file.txt`·`git status` — **all exit 0**.
BLOCK (exit 1): `git push --force`·`git -c x=y push --force`·`git -c core.pager=cat push --force`·
`git reset --hard`·`git -c x=y reset --hard`·`git -C /repo reset --hard`·`rm -rf x`·`rm -r -f x`·
`rm -f -r x`·`rm --recursive --force x`·`rm -R -f x`·`git clean -d -f`·`git clean -f`·
`git --git-dir=.g clean -d -f`·`git checkout .`·`git branch -D x`·`git branch --delete x`·
`git push origin --delete feature`·`DROP TABLE x`·`TRUNCATE TABLE t`·
`psql -c "DELETE FROM t WHERE 1=1"`·`terraform destroy`·`kubectl delete namespace ns`·
`mkfs.ext4 /dev/sdb`·`dd if=/dev/zero of=x`·`chmod -R 777 .` — **all exit 1**. TOTAL FAILURES: 0.

### Tallies (post-fix)
- `node --test tests/opuspack-hooks.test.js`: **tests 69, pass 69, fail 0, skipped 0** (was 43;
  +26 new boundary/bypass/ReDoS/guard/stop-gate assertions).
- Full suite `node --test tests/*.test.js`: **tests 2881, pass 2881, fail 0, skipped 0**.
- ReDoS timing test: force-push pattern **1ms** on 200k spaces (< 100ms). Before: 14229ms.
- `npx eslint . --max-warnings 0`: **exit 0** (no new-RegExp-on-nonliteral; all literal regexes
  + token-walk on split tokens).
- tsc: baseline-neutral — 0 errors in the 4 touched files (pre-existing errors elsewhere only).
