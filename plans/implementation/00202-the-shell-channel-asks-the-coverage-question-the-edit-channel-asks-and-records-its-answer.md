---
title: "The shell channel asks the coverage question the edit channel asks, and records its answer — the channel that grants the most stops keeping no ledger"
type: implementation
parent_plan: none
depends_on: 00201-the-shell-gate-works-out-what-a-command-writes-and-says-when-it-cannot
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PreToolUse.Bash.js"
  - "tests/bash-gate-plan-coverage.test.js"
---

# The shell channel asks the coverage question the edit channel asks

## The defect, read on disk

`grep -c "plan-coverage\|findCoveringPlan" src/hooks/PreToolUse.Bash.js` returns **zero**.

The two channels that can write a file run different gates:

| | Edit channel (`PreToolUse.Edit.js`) | Shell channel (`PreToolUse.Bash.js`) |
|---|---|---|
| protected-store deny | ledger + verify evidence, with real-path confinement | ledger only, by string match |
| whitelist | yes | — |
| CTOC project detection | yes | — |
| **plan coverage** | **`findCoveringPlan`** | **none** |
| escape phrase | yes, role-scoped to user-typed text | — |
| step threshold | — | yes (step >= 8) |
| **decision logging** | **`enforcement-log.logEnforcement` on every allow and every block** | **none** |

The shell channel has no notion of which files a plan declares. Past step 8 — which is
where all implementation work happens — a shell command may write any file in the
repository. The `files:` declaration that the whole v7 enforcement design rests on is
enforced on one of the two write channels.

And the channel that grants the most has **zero recorded decisions**. When something
goes wrong there is nothing to read: `.ctoc/logs/enforcement.json` contains a complete
account of the Edit channel and no trace at all of the shell one.

`00201` makes the shell channel able to say what a command writes. This slice makes it
ask the same question the Edit channel asks about that answer, and write down what it
decided.

## The fix

### The coverage check

After the step gate, for a command classified `writes` with determinate targets: every
target is resolved to an absolute path and passed to `plan-coverage.findCoveringPlan`.
If **any** target has no covering plan, the command is denied, naming that target.

All targets, not the first — a command writing one covered and one uncovered file must
not be cleared by the covered one.

The whitelist that the Edit channel applies (`.gitignore`, `.ctoc/`, `.local/`,
`plans/*.md`, `VERSION`) is applied here too, and by **importing `isWhitelisted` from
`PreToolUse.Edit.js`**, which already exports it. Two copies of a whitelist is how two
channels drift, and this slice exists because two channels drifted.

The escape-phrase check is applied too, from the same source: `PreToolUse.Edit.js`
exports `findEscapeInTranscript`, and the Bash payload carries `transcript_path` exactly
as the Edit payload does. Without it, a human who types "hotfix" unblocks their Edit
tools and finds their shell commands still blocked — an inconsistency that gets the
whole guard disabled.

### The indeterminate refusal

For a command classified `indeterminate`, past the step gate, where the gate would
otherwise allow: **deny**, with a reason naming which construct made it unreadable
(`interpreter`, `task runner`, `command substitution`, …) and what to do instead — put
the code in a checked-in file covered by a plan and run that file.

This is the honest position. The gate cannot see what `node -e '…'` writes, so it cannot
clear it. Refusing is the only answer that is not a guess. It is also exactly the
posture `isLedgerForgery` already takes at `:368-386` for inline evaluation it cannot
statically clear — this extends an existing, shipped, tested policy to the general write
case rather than inventing one.

**The cost is real and must be stated**: `npm run build`, `python script.py`, `make`,
`node scripts/x.js` and every task runner become denied past step 8. That is a large
behavioural change on the ordinary working path.

So the refusal is **scoped, and its scope is the decision this slice most needs a human
to confirm**:

- an indeterminate command is denied only when the project is a CTOC project **and**
  `.ctoc/settings.yaml` `enforcement.mode` is `strict`;
- in `soft` mode it is allowed and **logged** as `allow-indeterminate`, so the volume
  and shape of what strict mode would deny is measurable from real use before anyone
  turns it on;
- in `off` mode, as today, nothing is enforced.

The default is `strict` (`CLAUDE.md`, per-project tuning). **This slice therefore
changes default behaviour for every installation.** Step 14 must measure the blast
radius against this repository's own menu recipes and scripts and report the count
before Gate 3. If the count is large, the correct outcome is a human decision on the
default, not a quiet loosening.

### The logging

Every terminal decision in `main()` records one entry through
`enforcement-log.logEnforcement` — the same store, the same shape the Edit channel uses:

| outcome | when |
|---|---|
| `block` | ledger forgery, opaque decode, irreversible, plan move, commit-before-15, write-before-8, no covering plan, indeterminate-in-strict |
| `allow` | a determinate write with a covering plan |
| `whitelist` | a determinate write to a whitelisted path |
| `escape` | an escape phrase the user typed |
| `allow-indeterminate` | indeterminate in soft mode |

The entry carries `tool: 'Bash'`, the **write target** in `target_file`, the matched
plan, and the escape phrase — the existing field set. It does **not** carry the command
string: a command may contain a secret (`export TOKEN=… && …`) and this log is a file on
disk that gets read, pasted and attached to issues. A fixed-vocabulary `reason` is
recorded instead, and that is enough to reconstruct what happened without recording what
was typed.

Logging is wrapped in its own `try/catch` and never changes an outcome, matching
`PreToolUse.Edit.js:368-379`. A log failure is not a permission decision.

Allows that record nothing today and would flood the log — a plain `ls`, a `git status`,
every `none` verdict — are **not** logged. The log records decisions the gate made about
writes, not every command the session ran.

## Implementation Details

### File: `src/hooks/PreToolUse.Bash.js`
**Action:** MODIFY — `main()`, plus a new `checkWriteCoverage` helper and three requires

```js
const shellWrites = require('../lib/shell-write-targets');          // from 00201
const { isWhitelisted, findEscapeInTranscript } = require('./PreToolUse.Edit');
let coverage = null;
try { coverage = require('../lib/plan-coverage'); } catch { coverage = null; }
let enforcementLog = null;
try { enforcementLog = require('../lib/enforcement-log'); } catch { enforcementLog = null; }
let settings = null;
try { settings = require('../lib/settings'); } catch { settings = null; }
```

`coverage` is loaded fail-soft, and the consequence is written next to it in the same
comment style `PreToolUse.Edit.js:57-64` uses for `real-path-confinement`: **if
`plan-coverage` fails to load, this gate cannot decide, so a write command that reached
this point is DENIED, not allowed.** That inverts the Edit channel's fail-soft, and it
inverts it deliberately — the Edit channel degrades to its other layers, this one has no
other layer.

Importing `PreToolUse.Edit.js` is safe: its execution is guarded by
`require.main === module` at `:510`, so importing runs no enforcement and consumes no
stdin. Step 9 must verify that on disk before relying on it.

```js
/**
 * Does an allowed-by-step write command have plan coverage for every file it writes?
 * Return-never-throw: every fault returns a DENY verdict, because this gate has no
 * second layer to fall back to.
 *
 * @param {{verdict: string, targets: string[], reason: string|null}} classified
 * @param {string} root
 * @param {object|null} stdinJson - the parsed payload, for the transcript path
 * @returns {{decision:'allow'|'deny'|'whitelist'|'escape'|'allow-indeterminate',
 *            target:(string|null), plan:(string|null), reason:(string|null)}}
 */
function checkWriteCoverage(classified, root, stdinJson) { … }
```

Placement in `main()`: after the existing step gate at `:749-763`, so a command blocked
for being pre-step-8 is still blocked for that reason and gets that message. Coverage is
the second question, asked only of commands the step gate cleared.

The payload must now be available to `main()` as a parsed object, not only as a command
string, because the escape-phrase check needs `transcript_path`. `getCommand()` at
`:617-629` reads and discards the parse. Change it to return the parsed payload and
derive the command from it — **one stdin read, single consumer**, the constraint stated
at `:611-613`. This is the minimum change; the reader's fail-open and truncation defects
are `00206`, which depends on this slice, and this slice must not silently fix half of
them.

### File: `tests/bash-gate-plan-coverage.test.js`
**Action:** CREATE — `node:test`, driving the **real spawned hook**

Fixture: a temp project with `.ctoc/`, a `plans/todo/` plan declaring
`files: ["src/covered.js"]`, a signed state at step 10 written through
`state-manager.saveState`, and `.ctoc/settings.yaml` set per case.

| # | Command | Mode | Expected |
|---|---|---|---|
| 1 | `echo x > src/covered.js` | strict | allow, logged `allow` with the plan name |
| 2 | **`echo x > src/uncovered.js`** | strict | **deny**, banner names `src/uncovered.js` — RED today |
| 3 | **`cd . && echo x > src/uncovered.js`** | strict | deny — the `00201` bypass, now denied for the right reason |
| 4 | **`cd src && echo x > uncovered.js`** | strict | deny naming `src/uncovered.js`, not `uncovered.js` — proves cd-resolution feeds coverage |
| 5 | `echo x > src/covered.js && echo y > src/uncovered.js` | strict | deny — one covered target does not clear the other |
| 6 | `echo x > VERSION` | strict | allow, logged `whitelist` |
| 7 | `echo x > plans/todo/a.md` | strict | allow, logged `whitelist` |
| 8 | **`node -e 'require("fs").writeFileSync("src/uncovered.js","x")'`** | strict | **deny**, reason names `interpreter` — RED today |
| 9 | `npm run build` | strict | deny, reason `task runner` |
| 10 | `npm run build` | soft | **allow**, logged `allow-indeterminate` |
| 11 | `npm run build` | off | allow, not logged |
| 12 | transcript containing a user-typed `hotfix`, `echo x > src/uncovered.js` | strict | allow, logged `escape` with the phrase |
| 13 | transcript where `hotfix` appears only in a `tool_result` block | strict | **deny** — the role-scoping of `findEscapeInTranscript` must survive being reused here |
| 14 | `ls -la` | strict | allow, **nothing logged** — the log records write decisions, not every command |
| 15 | `git status` | strict | allow, nothing logged |
| 16 | pre-step-8 state, `echo x > src/covered.js` | strict | deny with the **step** reason, not the coverage reason — ordering |
| 17 | `plan-coverage` unresolvable (fixture with the module path shadowed) | strict | **deny**, not allow — the inverted fail-soft |
| 18 | log write fails (log path made a directory) | strict | the allow/deny outcome is unchanged; the hook does not crash |
| 19 | non-CTOC project (no `.ctoc/`) | — | allow, unchanged from today |
| 20 | the log entry carries no command text | strict | after case 2, read `.ctoc/logs/enforcement.json` and assert no entry contains the string `uncovered.js > ` or any raw command; `target_file` is present, a `command` field is absent |
| 21 | every `node -e` recipe from `src/commands/menu.md` | strict | denied or allowed **consistently with what the recipe needs to do** — read the recipes from disk, and where one is now denied, that is a finding to report at Step 16, not a licence to loosen |

Case 21 is the blast-radius measurement and it is the case most likely to change the
shape of this slice. If CTOC's own menu recipes cannot run under strict mode, the
default is wrong and the human decides, before Gate 3.

Fixtures under `os.tmpdir()`, `path.join` throughout, `fs.promises.rm` teardown. On
Windows, assert path comparisons after normalizing separators.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `checkWriteCoverage` | `main()` in `PreToolUse.Bash.js`, after the step gate | the registered `PreToolUse` hook, matcher `Bash` |
| `logEnforcement` calls | every terminal branch of `main()` | same |
| the imported `isWhitelisted` / `findEscapeInTranscript` | `checkWriteCoverage` | same |

`main()` runs on every Bash tool call. Nothing here is reachable only from a test.

## Test Plan

Covered by `tests/bash-gate-plan-coverage.test.js`. Cases 2, 3, 4, 5 and 8 are the
defect. Cases 1, 6, 7, 12, 14, 15 and 19 are the guards against the fix becoming "the
shell is unusable". Cases 17 and 18 pin the failing directions. Case 20 pins the secret
hygiene of the new log entries.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the file in full and run only it. Cases 2, 3, 4, 5, 8, 9, 10, 12, 13, 17, 18 and
20 must be RED. Record case 2's and case 8's red verbatim from the **spawned** hook.

### Step 9: PREPARE
Read from disk: `PreToolUse.Bash.js:611-767` (the reader and `main`),
`PreToolUse.Edit.js:500-512` (**verify** the `require.main` guard before importing from
it), `src/lib/plan-coverage.js:500-560` (`findCoveringPlan` and `explainDenial`
signatures and whether they accept relative paths), `src/lib/enforcement-log.js` in full,
`src/lib/settings.js` for how `enforcement.mode` is actually read, and
`src/commands/menu.md` for case 21. **Where the code disagrees with this plan, THE CODE
WINS** — particularly on whether `findCoveringPlan` wants an absolute or relative target.

### Step 10: IMPLEMENT
- `src/hooks/PreToolUse.Bash.js` — `getCommand` returns the parsed payload;
  `checkWriteCoverage` added; `main()` gains the coverage stage and the logging calls.
- `tests/bash-gate-plan-coverage.test.js` — the twenty-one cases.

### Step 11: REVIEW
Confirm every branch of `main()` that terminates records exactly one log entry, and that
no branch records two. Confirm `checkWriteCoverage` has no `throw` and that every catch
returns a deny. Confirm the step gate still runs before the coverage gate. Confirm no
second copy of the whitelist or the escape logic was written.

### Step 12: OPTIMIZE
`findCoveringPlan` scans plan files, so it is called **only** for a command with
determinate write targets — never on a `none` verdict, never on a read. Measure the
added latency of a covered write and report it; a gate that adds a visible pause to
every command is a gate that gets disabled.

### Step 13: SECURE
Confirm the log entry carries no command text and no absolute path outside the project
root. Confirm the deny banner names only the target and a fixed-vocabulary reason.
Re-attack: construct a command whose determinate target passes coverage while a second,
hidden write lands elsewhere — every success is added to the recognized set in `00201`
or written verbatim into "What this plan does NOT fix".

### Step 14: VERIFY
`node --test` on the new file plus every existing test that spawns the Bash hook, then
the full gated run `npm test`. Lint at `--max-warnings 0`. No git operations. **Report
the case-21 count: how many of CTOC's own menu recipes and scripts are denied under
strict mode. That number is the blast radius and it is the input to the human's decision
about the default.**

### Step 15: DOCUMENT
Update `CLAUDE.md`'s enforcement flow so it describes both channels rather than the Edit
channel alone: the shell channel checks coverage on determinate write targets, refuses
indeterminate commands in strict mode, and logs its decisions to the same store. Update
the documented test-file count from disk.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim, the case-21 blast radius, every Step 13 re-attack that
succeeded, and every decision taken under ambiguity. **Name the strict-mode default
explicitly as a decision the human should confirm rather than inherit.**

## What this plan does NOT fix

- It does **not** make the shell channel sound. Everything `00201` names as undecidable
  stays undecidable; this slice only acts on what that classifier can determine.
- It does **not** close the checked-in-script route. Writing a `.js` file to a
  plan-covered path and running `node that-file.js` is allowed — the file write is
  covered, and the run is an interpreter on a checked-in artifact. That is the same
  residual `PreToolUse.Bash.js:41-47` already names for the ledger, and it is
  deliberately left: the artifact is reviewable, which is the whole difference from an
  un-auditable one-liner.
- It does **not** apply real-path confinement to shell write targets. A symbolic link
  under a covered path whose real destination is elsewhere passes coverage. The Edit
  channel resolves this via `real-path-confinement`; the shell channel does not, and
  wiring it in is a further slice.
- It does **not** protect `.ctoc/` on the shell channel beyond the existing ledger deny.
  The Edit channel's `.ctoc/` whitelist is imported wholesale, so a shell write to
  `.ctoc/quality-config.yaml` is allowed — see `00204`, which removes that grant on both
  channels at once by narrowing the shared whitelist.
- It does **not** fix the payload reader's fail-open or its truncating fallback. `00206`.
- It does **not** cover Windows shell write forms not recognized by `00201`.

## Decisions Taken Under Ambiguity

1. **The whitelist and the escape check are imported from `PreToolUse.Edit.js`, not
   copied.** Two channels with two copies of one policy is the exact defect this slice
   repairs; reproducing it while repairing it would be absurd.
2. **`plan-coverage` failing to load DENIES here, where it degrades on the Edit
   channel.** The Edit channel has a whitelist, project detection and an escape phrase
   underneath it. This gate has nothing underneath it, so a missing module means "cannot
   decide", and "cannot decide" is a deny.
3. **All targets must be covered, not the first.** Otherwise one covered file launders
   every other write in the same command.
4. **Indeterminate is denied in strict mode and logged in soft mode.** Denying in every
   mode ignores that this changes the ordinary working path; allowing in every mode makes
   `00201`'s classifier decorative. Soft mode produces the measurement that tells the
   human whether strict is affordable, from real use rather than from a guess.
5. **The strict-mode default is inherited from the existing setting, and flagged rather
   than assumed.** `strict` is already the documented default, so this slice does not
   invent one — but it does change what strict means, and Step 16 names that for the
   human explicitly instead of letting it ship silently.
6. **The command string is never logged.** A command can carry a secret; the log is a
   file people paste into issues. `target_file` plus a fixed-vocabulary reason
   reconstructs the decision without recording the typing.
7. **Reads and `none`-verdict commands are not logged.** Logging every `ls` would bury
   the write decisions the log exists to hold, and a log nobody can read is not evidence.
8. **The coverage check runs after the step gate, not before.** A pre-step-8 command
   should be told it is pre-step-8; being told instead that it lacks coverage would send
   the human to write a plan when the real answer is to finish planning.
9. **`getCommand` is changed to return the parsed payload here, and its fail-open is
   left alone.** The escape check needs `transcript_path`, so the parse must survive. The
   reader's separate defects are `00206`; fixing them silently inside this slice would
   hide a change whose blast radius deserves its own evidence.
