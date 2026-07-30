---
iron_loop_verdict: true
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
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-30T19:04:14.591Z
gate_crossed: implementation → todo
---

# The shell channel asks the coverage question the edit channel asks

## Rebase note (2026-07-30)

Rebased onto the current tree. The intent and acceptance criteria are UNCHANGED; only
the technical route was corrected against what shipped since this plan was written:

- **`00201` is BUILT** (its plan sits in `plans/review/`). Its module
  `src/lib/shell-write-targets.js` exists and is ALREADY wired into `PreToolUse.Bash.js`
  (eager `require` at `:96`; `isWriteCommand` calls `shellWrites.classifyWrites` at
  `:670-676`). So this slice does NOT add that require — it reuses it. Not blocked.
- **Mode is resolved through `src/lib/enforcement-mode.js`, not `src/lib/settings.js`.**
  `00069` shipped `enforcement-mode.resolveEnforcementMode(root)` → `{mode, source}` as
  the ONE encoding of `enforcement.mode` (it reads `.ctoc/settings.yaml enforcement.mode`
  at tier 1, then the environment profile, then the schema default, fail-closed to
  `strict`). The Edit channel uses exactly this at `PreToolUse.Edit.js:608-610`. Reading
  `settings.yaml` directly here would be a second, drifting copy of that policy — the
  precise defect this slice exists to end.
- **`src/commands/menu.md` is now `src/commands/start.md`** (case 21).
- **All line-number citations were re-derived** against the current 884-line
  `PreToolUse.Bash.js` and 734-line `PreToolUse.Edit.js`.
- **`CLAUDE.md` added to `files:`** — Step 15 DOCUMENT edits it, so it must be declared
  for coverage + the doc-count ratchet.
- **The test fixture must MINT AN APPROVAL-LEDGER ENTRY** for the covering plan, or
  `src/covered.js` is not actually covered and case 1 fails. Corrected in the Test Plan.

## The defect, read on disk

A search for a real `require('../lib/plan-coverage')` or a call to `findCoveringPlan`
in `src/hooks/PreToolUse.Bash.js` returns **nothing** — the one textual hit
(`:658`) is the filename `plan-coverage.js` used as an EXAMPLE path inside a comment,
not a usage. There is no coverage check, no `enforcement-log` require, no
`logEnforcement` call.

The two channels that can write a file run different gates:

| | Edit channel (`PreToolUse.Edit.js`) | Shell channel (`PreToolUse.Bash.js`) |
|---|---|---|
| protected-store deny | ledger + verify + streaming, with real-path confinement | ledger only, via `isLedgerForgery` |
| whitelist | yes (`isWhitelisted`) | — |
| CTOC project detection | yes | — |
| **plan coverage** | **`findCoveringPlan`** | **none** |
| escape phrase | yes, role-scoped to user-typed text (`findEscapeInTranscript`) | — |
| enforcement mode | yes (`enforcement-mode.resolveEnforcementMode`) | — |
| step threshold | — | yes (step >= 8) |
| **decision logging** | **`enforcement-log.logEnforcement` on every allow and every block** | **none** |

The shell channel has no notion of which files a plan declares. Past step 8 — which is
where all implementation work happens — a shell command may write any file in the
repository. The `files:` declaration that the whole v7 enforcement design rests on is
enforced on one of the two write channels.

And the channel that grants the most has **zero recorded decisions**. When something
goes wrong there is nothing to read: `.ctoc/logs/enforcement.json` contains a complete
account of the Edit channel and no trace at all of the shell one.

`00201` makes the shell channel able to say what a command writes
(`classifyWrites(command)` → `{verdict: 'none'|'writes'|'indeterminate', targets, reason}`).
This slice makes it ask the same question the Edit channel asks about that answer, and
write down what it decided.

## The fix

### The coverage check

After the step gate, for a command classified `writes` with determinate targets: every
target in `classified.targets` is passed to `plan-coverage.findCoveringPlan`. If **any**
target has no covering plan, the command is denied, naming that target.

`classifyWrites` already returns its targets cd-RESOLVED (relative to the accumulated
`cd` prefix, which is relative to the repo root = `process.cwd()`), and
`findCoveringPlan(targetFile, root)` accepts a repo-relative OR an absolute path
(`plan-coverage.js:619`). So the classifier's targets are passed straight in — there is
no separate "resolve to absolute" step, and Step 9 must confirm this against the code
(THE CODE WINS on the target shape).

All targets, not the first — a command writing one covered and one uncovered file must
not be cleared by the covered one.

The whitelist that the Edit channel applies (`.gitignore`, `.ctoc/`, `.local/`,
`plans/*.md`, `VERSION`) is applied here too, and by **importing `isWhitelisted` from
`PreToolUse.Edit.js`**, which already exports it (`PreToolUse.Edit.js:720-725`). Two
copies of a whitelist is how two channels drift, and this slice exists because two
channels drifted.

The escape-phrase check is applied too, from the same source: `PreToolUse.Edit.js`
exports `findEscapeInTranscript(transcriptString)` (`:720-725`), and the Bash payload
carries `transcript_path` exactly as the Edit payload does. `findEscapeInTranscript`
takes the RAW TRANSCRIPT STRING, not the path — so `main()` must first READ the
transcript file, mirroring the Edit channel's `readTranscript(stdinJson)`
(`PreToolUse.Edit.js:342-346`: `safeFs.readFileSync(stdinJson.transcript_path, 'utf8')`,
fail-soft to null). Without the escape check, a human who types "hotfix" unblocks their
Edit tools and finds their shell commands still blocked — an inconsistency that gets the
whole guard disabled.

### The indeterminate refusal

For a command classified `indeterminate`, past the step gate, where the gate would
otherwise allow: **deny**, with a reason naming which construct made it unreadable
(the classifier's `reason` — a CLOSED vocabulary from `shell-write-targets.js:47-61`:
`interpreter`, `task runner`, `command substitution`, `heredoc`, …) and what to do
instead — put the code in a checked-in file covered by a plan and run that file.

This is the honest position. The gate cannot see what `node -e '…'` writes, so it cannot
clear it. Refusing is the only answer that is not a guess. It is also exactly the
posture `isLedgerForgery` already takes at `:443-490` for inline evaluation it cannot
statically clear (the command-substitution / non-literal-`require` refusals at
`:469-489`) — this extends an existing, shipped, tested policy to the general write
case rather than inventing one.

**The cost is real and must be stated**: `npm run build`, `python script.py`, `make`,
`node scripts/x.js` and every task runner become denied past step 8. That is a large
behavioural change on the ordinary working path. (Note: `isWriteCommand` ALREADY
classifies these as writes — an `indeterminate` verdict counts as a write today
(`PreToolUse.Bash.js:663-676`), so before step 8 they are already blocked. What is new
is the deny PAST step 8 in strict mode.)

So the refusal is **scoped, and its scope is the decision this slice most needs a human
to confirm**:

- an indeterminate command is denied only when the project is a CTOC project **and**
  `enforcement-mode.resolveEnforcementMode(root)` returns mode `strict`;
- in `soft` mode it is allowed and **logged** as `allow-indeterminate`, so the volume
  and shape of what strict mode would deny is measurable from real use before anyone
  turns it on;
- in `off` mode, as today, nothing is enforced.

The default is `strict` (the resolver's fail-closed terminal value, and the documented
per-project default). **This slice therefore changes default behaviour for every
installation.** Step 14 must measure the blast radius against this repository's own menu
recipes and scripts and report the count before the review gate. If the count is large,
the correct outcome is a human decision on the default, not a quiet loosening.

### The logging

Every terminal decision in `main()` records one entry through
`enforcement-log.logEnforcement(entry, root)` — the same store, the same field set the
Edit channel uses (`PreToolUse.Edit.js:544-553` in `block()`, `:567-576` in `allow()`):

| outcome | when |
|---|---|
| `block` | ledger forgery, opaque decode, irreversible, plan move, commit-before-15, write-before-8, no covering plan, indeterminate-in-strict |
| `allow` | a determinate write with a covering plan |
| `whitelist` | a determinate write to a whitelisted path |
| `escape` | an escape phrase the user typed |
| `allow-indeterminate` | indeterminate in soft mode |

The entry carries the Edit channel's existing field set:
`tool: 'Bash'`, the **write target** in `target_file`, the matched plan in
`plan_matched`, the escape phrase in `escape_phrase`, the resolved `mode` and
`mode_source`, and a fixed-vocabulary `reason` (the enforcement log is schema-free —
`logEnforcement` spreads `{ timestamp, ...entry }` — so adding `reason` needs no change
to `enforcement-log.js`). It does **not** carry the command string: a command may
contain a secret (`export TOKEN=… && …`) and this log is a file on disk that gets read,
pasted and attached to issues. The fixed-vocabulary `reason` reconstructs what happened
without recording what was typed.

Logging is wrapped in its own `try/catch` and never changes an outcome, matching
`PreToolUse.Edit.js:543-554` / `:566-577`. A log failure is not a permission decision.

Allows that record nothing today and would flood the log — a plain `ls`, a `git status`,
every `none` verdict — are **not** logged. The log records decisions the gate made about
writes, not every command the session ran.

## Implementation Details

### File: `src/hooks/PreToolUse.Bash.js`
**Action:** MODIFY — `main()`, plus a new `checkWriteCoverage` helper, a
`readTranscript` helper, and three requires

```js
// shellWrites is ALREADY required at the top of the file (line 96, EAGER — 00201).
// Reuse the existing binding; do NOT add a second require.
const { isWhitelisted, findEscapeInTranscript } = require('./PreToolUse.Edit'); // both exported (:720-725)
let coverage = null;
try { coverage = require('../lib/plan-coverage'); } catch { coverage = null; }
let enforcementLog = null;
try { enforcementLog = require('../lib/enforcement-log'); } catch { enforcementLog = null; }
// Mode via the SHIPPED shared encoding (00069) — never a second settings.yaml reader.
let enforcementMode = null;
try { enforcementMode = require('../lib/enforcement-mode'); } catch { enforcementMode = null; }
```

`coverage` is loaded fail-soft, and the consequence is written next to it in the same
comment style `PreToolUse.Edit.js:57-64` uses for `real-path-confinement`: **if
`plan-coverage` fails to load, this gate cannot decide, so a write command that reached
this point is DENIED, not allowed.** That inverts the Edit channel's fail-soft
(`PreToolUse.Edit.js:51-52` degrades to its other layers), and it inverts it
deliberately — the Edit channel has a whitelist, project detection and an escape phrase
underneath it; this stage has no other layer.

Importing `PreToolUse.Edit.js` is safe: its execution is guarded by
`require.main === module` at `:731`, so importing runs no enforcement and consumes no
stdin. Step 9 must verify that on disk before relying on it. (This import creates an
edge `PreToolUse.Bash.js → PreToolUse.Edit.js`; the reverse edge does not exist, so no
cycle. Confirm in Step 11.)

```js
/**
 * Does an allowed-by-step write command have plan coverage for every file it writes?
 * Return-never-throw: every fault returns a DENY verdict, because this gate has no
 * second layer to fall back to.
 *
 * @param {{verdict: string, targets: string[], reason: string|null}} classified
 *        - the result of shellWrites.classifyWrites(command), computed once by main()
 * @param {string} root - process.cwd()
 * @param {string|null} transcript - the RAW transcript string (already read from
 *        stdinJson.transcript_path by main()'s readTranscript), for the escape check
 * @param {{mode: string, source: string}} modeInfo - from resolveEnforcementMode(root)
 * @returns {{decision:'allow'|'deny'|'whitelist'|'escape'|'allow-indeterminate',
 *            target:(string|null), plan:(string|null), reason:(string|null)}}
 */
function checkWriteCoverage(classified, root, transcript, modeInfo) { … }
```

Sketch of the decision order inside `checkWriteCoverage`, mirroring the Edit channel:

1. escape phrase first (`findEscapeInTranscript(transcript)`) → `escape` allow;
2. `indeterminate` verdict → in `strict` deny (reason = `classified.reason`); in `soft`
   `allow-indeterminate`; in `off` allow;
3. `writes` verdict → for each target: if `isWhitelisted(target)` skip it as
   `whitelist`; else `findCoveringPlan(target, root)` — the FIRST uncovered target is
   the deny (name it); if all covered, `allow` with the matched plan;
4. `coverage === null` at step 3 → deny (the inverted fail-soft);
5. any internal fault → deny.

Placement in `main()`: after the existing write step gate at `:846-860`, so a command
blocked for being pre-step-8 is still blocked for that reason and gets that message.
Coverage is the second question, asked only of commands the step gate cleared. `main()`
should call `shellWrites.classifyWrites(command)` ONCE (the existing `isWriteCommand` at
`:670` re-classifies internally; thread the single result to both the step-gate check
and `checkWriteCoverage` to avoid a double scan — Step 12).

Denials use the hook's EXISTING deny mechanism — `writeToTerminal(formatBlocked(command,
state, reason, 'COVERAGE'|'INDETERMINATE'))` then `emitDeny(...)` — NOT the Edit
channel's `block()`. Allows (`allow`/`whitelist`/`escape`/`allow-indeterminate`) log
then fall through to the existing final `process.exit(0)` at `:863`.

The payload must now be available to `main()` as a parsed object, not only as a command
string, because the escape-phrase check needs `transcript_path`. `getCommand()` at
`:714-726` reads stdin and returns only the command string. Change it to return the
parsed payload (and `main()` derives the command from it) — **one stdin read, single
consumer**, the constraint stated at `:708-713`. This is the minimum change; the
reader's fail-open and truncation defects are `00206`, which depends on this slice, and
this slice must not silently fix half of them (Decision 9).

Add a `readTranscript(stdinJson)` helper that mirrors `PreToolUse.Edit.js:342-346`
(`stdinJson.transcript_path` → `fs.readFileSync`, fail-soft to null; `fs` is already
imported at `:84`).

### File: `tests/bash-gate-plan-coverage.test.js`
**Action:** CREATE — `node:test`, driving the **real spawned hook** (spawn pattern per
`tests/pretooluse-bash-coverage.test.js:48,85`)

Fixture: a temp project under `os.tmpdir()` with `.ctoc/` (incl. `.ctoc/approvals/` and
`.ctoc/logs/`), a covering plan in `plans/todo/` declaring `files: ["src/covered.js"]`
that is **APPROVED** — the plan file alone is NOT enough. `findCoveringPlan` calls
`approval-residency.isApprovedForCoverage`, so an unapproved `plans/todo/` plan grants
NOTHING and case 1 would DENY. Mint the approval entry exactly as
`tests/pretooluse-edit-coverage.test.js:99-118` does:

```js
const ledger = require('../src/lib/approval-ledger');
ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
  content: <the plan file's exact bytes>,
  stage_from: 'implementation',
  stage_to: 'todo',
  approved_by: 'human',
}, root);
```

Plus a signed state at step 10 written through `state-manager.saveState(project, state)`
(`state-manager.js:138`), and `.ctoc/settings.yaml` set per case with
`enforcement:\n  mode: strict|soft|off` (this is exactly what
`enforcement-mode.readYamlEnforcementMode` reads at tier 1 — `enforcement-mode.js:75`).

| # | Command | Mode | Expected |
|---|---|---|---|
| 1 | `echo x > src/covered.js` | strict | allow, logged `allow` with the plan name in `plan_matched` |
| 2 | **`echo x > src/uncovered.js`** | strict | **deny**, banner names `src/uncovered.js` — RED today |
| 3 | **`cd . && echo x > src/uncovered.js`** | strict | deny — the `00201` cd bypass, now denied for the right reason |
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
| 20 | the log entry carries no command text | strict | after case 2, read `.ctoc/logs/enforcement.json` and assert no entry contains the raw command or the target as-written in a `command` field; `target_file` is present, a `command` field is absent |
| 21 | every `node -e` recipe from `src/commands/start.md` | strict | denied or allowed **consistently with what the recipe needs to do** — read the recipes from disk, and where one is now denied, that is a finding to report at Step 16, not a licence to loosen |

Case 21 is the blast-radius measurement and it is the case most likely to change the
shape of this slice. If CTOC's own menu recipes cannot run under strict mode, the
default is wrong and the human decides, before the review gate. (Note: the current Bash
hook header at `:34` asserts every `src/commands/start.md` `node -e` recipe still works
through the ledger gate, and `tests/ledger-forgery-closed.test.js` pins that; case 21
extends the same posture to the NEW coverage/indeterminate stage.)

Fixtures under `os.tmpdir()`, `path.join` throughout, `fs.rmSync(..., {recursive,force})`
teardown. On Windows, assert path comparisons after normalizing separators.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `checkWriteCoverage` | `main()` in `PreToolUse.Bash.js`, after the step gate (`:846-860`) | the registered `PreToolUse` hook, matcher `Bash` |
| `logEnforcement` calls | every terminal branch of `main()` | same |
| the imported `isWhitelisted` / `findEscapeInTranscript` | `checkWriteCoverage` | same |
| `readTranscript` | `main()`, before `checkWriteCoverage` | same |

`main()` runs on every Bash tool call (`main().catch(...)` at `:880`). Nothing here is
reachable only from a test.

## Test Plan

Covered by `tests/bash-gate-plan-coverage.test.js`. Cases 2, 3, 4, 5 and 8 are the
defect. Cases 1, 6, 7, 12, 14, 15 and 19 are the guards against the fix becoming "the
shell is unusable". Cases 17 and 18 pin the failing directions. Case 20 pins the secret
hygiene of the new log entries. Case 1 depends on the APPROVAL-LEDGER-ENTRY fixture
above — without it, `src/covered.js` is uncovered and case 1 turns into a second copy
of case 2.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the file in full and run only it. Cases 2, 3, 4, 5, 8, 9, 10, 12, 13, 17, 18 and
20 must be RED. Record case 2's and case 8's red verbatim from the **spawned** hook.
Before relying on it, confirm case 1 is GREEN once the fix lands — a case 1 that is red
after implementation means the approval fixture is wrong, not the code.

### Step 9: PREPARE
Read from disk: `PreToolUse.Bash.js:708-864` (the reader and `main`),
`PreToolUse.Edit.js:727-733` (**verify** the `require.main` guard before importing from
it) and `PreToolUse.Edit.js:342-346` + `:425-429` (the `readTranscript` /
`findEscapeInTranscript` shapes to mirror), `src/lib/plan-coverage.js:613-663`
(`findCoveringPlan` and `explainDenial` signatures — confirm both accept a repo-relative
target, `:619`), `src/lib/shell-write-targets.js:470-531` (`classifyWrites` return shape
and that `targets` are already cd-resolved), `src/lib/enforcement-log.js` in full
(confirm `logEnforcement(entry, root)` arg order and that it no-ops when `.ctoc/` is
absent), `src/lib/enforcement-mode.js` (`resolveEnforcementMode(root)` → `{mode,
source}`), and `src/commands/start.md` for case 21. **Where the code disagrees with this
plan, THE CODE WINS** — particularly on whether `findCoveringPlan` wants an absolute or
relative target.

### Step 10: IMPLEMENT
- `src/hooks/PreToolUse.Bash.js` — the three requires; `getCommand` returns the parsed
  payload; a `readTranscript` helper; `checkWriteCoverage` added; `main()` classifies
  once, gains the coverage/indeterminate stage after the step gate, and the logging
  calls on every terminal branch.
- `tests/bash-gate-plan-coverage.test.js` — the twenty-one cases.

### Step 11: REVIEW
Confirm every branch of `main()` that terminates records exactly one log entry, and that
no branch records two. Confirm `checkWriteCoverage` has no `throw` and that every catch
returns a deny. Confirm the step gate still runs before the coverage gate. Confirm no
second copy of the whitelist, the escape logic, or the mode resolver was written — all
three are imported. Confirm the `PreToolUse.Bash.js → PreToolUse.Edit.js` import
introduces no cycle.

### Step 12: OPTIMIZE
`findCoveringPlan` scans plan files, so it is called **only** for a command with
determinate write targets — never on a `none` verdict, never on a read. `classifyWrites`
is called ONCE per command and its result threaded to both the step gate and the
coverage stage. Measure the added latency of a covered write and report it; a gate that
adds a visible pause to every command is a gate that gets disabled.

### Step 13: SECURE
Confirm the log entry carries no command text and no absolute path outside the project
root. Confirm the deny banner names only the target and a fixed-vocabulary reason.
Re-attack: construct a command whose determinate target passes coverage while a second,
hidden write lands elsewhere — every success is added to the recognized set in `00201`
or written verbatim into "What this plan does NOT fix".

### Step 14: VERIFY
`node --test` on the new file plus every existing test that spawns the Bash hook
(`tests/pretooluse-bash-coverage.test.js`, `tests/ledger-forgery-closed.test.js`), then
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
  channel resolves this via `real-path-confinement`; the shell channel applies it only
  to the LEDGER guard today (`PreToolUse.Bash.js:245-253`), not to coverage targets, and
  wiring it in is a further slice.
- It does **not** protect `.ctoc/` on the shell channel beyond the existing ledger deny.
  The Edit channel's `.ctoc/` whitelist is imported wholesale, so a shell write to
  `.ctoc/quality-config.yaml` is allowed — see `00204`, which removes that grant on both
  channels at once by narrowing the shared whitelist.
- It does **not** fix the payload reader's fail-open or its truncating fallback. `00206`.
- It does **not** cover Windows shell write forms not recognized by `00201`.

## Decisions Taken Under Ambiguity

1. **The whitelist, the escape check, and the mode resolver are imported (from
   `PreToolUse.Edit.js` and `enforcement-mode.js`), not copied.** Two channels with two
   copies of one policy is the exact defect this slice repairs; reproducing it while
   repairing it would be absurd. (Rebase correction: the mode comes from
   `enforcement-mode.resolveEnforcementMode`, the shipped shared encoding, not from a
   fresh `settings.yaml` read.)
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
5. **The strict-mode default is inherited from the existing resolver, and flagged rather
   than assumed.** `strict` is already `enforcement-mode`'s fail-closed terminal value
   and the documented default, so this slice does not invent one — but it does change
   what strict means, and Step 16 names that for the human explicitly instead of letting
   it ship silently.
6. **The command string is never logged.** A command can carry a secret; the log is a
   file people paste into issues. `target_file` plus a fixed-vocabulary `reason`
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


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
