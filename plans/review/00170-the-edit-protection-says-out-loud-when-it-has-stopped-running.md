---
approved_by: human
approved_at: 2026-07-20T10:17:33.118Z
gate_crossed: implementation → todo
---

---
title: "The edit protection says out loud when it has stopped running"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/enforcement-liveness.js"
  - "tests/the-edit-protection-says-whether-it-is-running.test.js"
  - "src/areas/system.js"
---

# The edit protection says out loud when it has stopped running

## The finding, re-measured from inside the repository

The claim handed to planning was that CTOC's edit-protection hooks did not run in
this session and nothing noticed. **Re-measured today, the finding stands, and two
of the supporting numbers were wrong in a direction that makes it worse, not
better.**

| what was claimed | what is on disk now | verdict |
|---|---|---|
| the log records every decision including allows | `PreToolUse.Edit.js` `allow()` and `block()` both call `enforcementLog.logEnforcement` on every path — whitelist, allow, escape, silent-passthrough, block | **confirmed by reading the code** |
| the log holds 20 entries | it holds **24 lines** | corrected upward |
| the newest entry is 2026-07-17 | the newest is **2026-07-20T10:03:21Z** — but entries 21-24 are the probe invocations described in the brief (`zz-probe-does-not-exist.js`, a plan file, `plan-coverage.js`, `zz2.js`) | **the correction strengthens the finding**: the only entries from today are hand-fired probes. The newest ORGANIC entry is still 2026-07-17 |
| dozens of edits today produced zero entries | between the 2026-07-17 entries and the hand-fired probes there is nothing at all | **confirmed** |
| the hook code is correct | read in full; the whitelist, the two protected-directory guards, coverage, escape-phrase and block paths are all intact and all log | **confirmed** |

### The number that settles it

`src/lib/enforcement-log.js:20` reads:

```js
const MAX_ENTRIES = 1000;
```

**The log is not full and has never rotated.** Twenty-four entries is not a window
onto recent history — it is the *complete lifetime record* of every enforcement
decision ever made in this repository. A project that has been edited by agents for
months, under a hook that logs unconditionally on every one of five outcomes, has
recorded twenty-four decisions. That is not a gap; it is an absence.

### What this does NOT establish, and must not be written as though it does

The *cause* is not established here and this plan does not guess at it. The
staleness hypothesis handed to planning — that a session keeps the hook
configuration it had at startup, so a mid-session plugin update silently disarms
enforcement — is **consistent with every measurement and is verified by none of
them.** What can be checked from inside the repository is only that the hooks are
correctly declared (`.claude-plugin/hooks.json` wires all four editing tools plus
Bash, Task and the two `*` matchers) and correctly written. Whether the harness
invoked them is not observable from here at all.

**What remains unverifiable from inside this repository**, stated plainly so nobody
later reads this plan as having proved it:

1. Whether a Claude Code session reloads hook configuration after a plugin update,
   or holds the configuration it started with. No artifact in this tree records it.
2. Whether the plugin was enabled for this session.
3. Whether the harness invoked the `Edit` matcher at all.
4. Whether the working directory the hooks resolved matched this project.

Naming a cause would be an assertion planning could not check — this repository's
own false-green defect class, in prose.

## The defect this plan fixes, which is a different one

The defect is **not** that hooks can stop running. That may be unavoidable and its
cause is outside this tree. The defect is that **nothing notices, and nothing says
so.** A guard that has fallen over and reports nothing is indistinguishable from a
guard that is working and has nothing to report. This repository has fixed that
exact shape five times — a parser whose no-match default was the success value, a
verdict read from truncated output, an exit that discarded pending writes — and
every fix was the same move: make the silence loud.

This is that shape aimed at the enforcement layer itself, which is the layer every
other guard is built on top of.

## Question 1 — what is the honest signal, and is any threshold sound?

**A fixed time threshold is not sound, and the honest finding is that none is
needed.** The reason is worth stating precisely, because the tempting design is a
constant and the constant is what would cry wolf.

A duration threshold ("warn if no decision in N hours") asks a question the
instrument cannot answer: it treats *silence* as the signal, and silence is exactly
what an idle project and a broken hook have in common. A project touched monthly is
silent for a month and is perfectly healthy; the same silence on a project edited
every minute is an emergency. There is no N that is right for both, and deriving N
from historical logging rate fails on the case that matters most — this repository,
where the historical rate is twenty-four decisions in several months, so almost any
N derived from it reads today's total absence as normal.

**So the signal is not silence. It is a DISAGREEMENT BETWEEN TWO OBSERVABLES, and
it carries no time constant at all:**

| observable | what it is | where it comes from |
|---|---|---|
| **the last recorded decision** | the newest timestamp in `.ctoc/logs/enforcement.json` | written only by a hook that ran |
| **the last unrecorded edit** | the newest modification time among the files DECLARED by plans in the active stages (`in-progress`, `todo`, `implementation`) | the filesystem, which no hook mediates |

If a declared file of an active plan changed *after* the newest recorded decision,
then an edit happened that the enforcement hook did not see. An idle project has
nothing newer than its last decision and stays silent forever, however long it has
been idle. A busy project disagrees within minutes of the hook going quiet. **The
project's own activity supplies the scale**, which is what the brief asked for, and
neither a daily nor a monthly project needs a different answer.

The only constant in the comparison is a **two-second allowance for filesystem
modification-time granularity** (one second on several filesystems, two on FAT
derivatives). That is a physical property of the instrument, not a policy number,
and it is the sole magic value in this plan.

### Why the declared files of active plans, and not every file

Modification times move for reasons that are not tool calls: CTOC's own code writes
through `safeFs` without passing any hook, `src/scripts/release.js` rewrites
`VERSION`, `package.json` and `README.md`, a checkout restores times, a package
install rewrites a tree. Scanning everything would produce a noisy witness and a
check that cried wolf would be turned off, which is worse than not shipping it.

The files an active plan DECLARES are the sharpest available witness: they are
precisely the files an executor edits *through tool calls*, and each such edit must
produce an `allow` entry because the covering plan is what grants it. Innocent
explanations still exist — a formatter run over the tree, a checkout — so this is
**evidence, not proof**, and the wording and the confidence ladder below both say so
rather than overclaiming.

### The instrument that was deliberately NOT chosen, and why it is a trap

The obvious alternative is to have the check **run the hook itself** and see whether
it blocks — exactly the probe that was performed by hand. It must not be built.
That probe proves the hook FILE works. It cannot prove the HARNESS invokes it, and
the measurement that produced this plan is precisely the case where those two facts
diverge: correct file, correct wiring, and no invocation. A self-test would return a
confident **"enforcement is fine"** on the one situation it exists to detect. It is
this repository's false-green class wearing the costume of a health check.

## Question 2 — where the human meets it

**On the System screen, replacing a line that already exists and says nothing.**

`src/areas/system.js:37` today renders:

```
    Enforcement         4821 bytes  .ctoc/logs/enforcement.json
```

A byte count. It is rendered faithfully, it is accurate, and it answers no question
a human has. It would read exactly the same on a project whose protection has been
dead for three days — which is the project it is being rendered on right now. This
is the "honest count shipped into a store nothing renders" failure in its other
form: a number that reaches the human and carries no meaning.

`src/areas/system.js` is a LIVE mount (`src/commands/start.js:255` requires it) and
it is the screen a human opens to ask whether CTOC itself is healthy. That makes it
the correct home and not merely the convenient one. **It is also the only such
surface currently unclaimed by an active plan** — see "File conflicts" below, which
is a scheduling fact the human should know.

### Exactly what it says, in the owner's terms

No internal vocabulary. Not "PreToolUse hooks have not fired." The words name what
is unprotected and what to do:

```
  Edit protection
    Active — CTOC checked an edit 4 minutes ago.
```

```
  Edit protection
    NOT RUNNING — 23 files changed since CTOC last checked one, at 09:12 on
    17 Jul. Edits are not being checked against your plans right now.
    Restart this session to load it again.
```

```
  Edit protection
    Cannot tell — CTOC could not read its own record
    (.ctoc/logs/enforcement.json). Treat protection as OFF until this reads
    clean.
```

The middle line is the load-bearing one and every clause in it earns its place: it
names the consequence in the owner's terms (*edits are not being checked against
your plans*), it gives the count and the moment so the claim can be judged rather
than believed, and it names one action.

## Question 3 — how confident before it speaks

Advising a restart on a false positive is expensive and teaches the human to ignore
the line. Advising nothing on a true positive is the entire defect. So the check
speaks at three volumes and only the loudest one gives advice:

| what the two observables show | state | volume |
|---|---|---|
| nothing newer than the last decision | `recording` | **silent** — one calm line, no advice |
| the log HAS entries, and **two or more** distinct declared files changed after the newest one | `not-recording` | **loud** — names the count, the moment, and advises restarting the session |
| exactly ONE declared file changed after the newest entry | `not-recording`, low confidence | **quiet** — states the observation, gives NO restart advice |
| the log has NEVER held an entry for this project | `unknown` | **quiet** — a fresh or never-enforced project is not a broken one; says so and advises nothing |
| either instrument could not be read | `unknown` | **loud, different words** — "could not check", never silence |

**The two-file corroboration floor is a chosen constant and is recorded as one.** A
single file can move for a single innocent reason — one formatter run, one file
restored from version control. Two distinct declared files of two active plans
moving after the last recorded decision is a pattern, not an accident. On the case
that produced this plan the real count is dozens, so the floor is nowhere near the
decision boundary; it exists to keep a quiet project from ever being shouted at.

**The restart advice is given only when the log proves the hook worked here
before.** If it has entries, the mechanism is installed and configured and has since
gone quiet, which is the situation a restart addresses. If it has never had an
entry, restarting is a guess, and the check says what it sees instead of guessing.

## Question 4 — can a session detect its own staleness directly?

**Partly, and the mechanism is sound, but it is not the right FIRST instrument. It
is a separate slice — `00171` — and this plan does not depend on it.**

What was verified, because it is the load-bearing fact and it holds:

> `src/lib/version.js:23-47` — `getVersion()` reads `VERSION` from `getPluginRoot()`,
> which walks up from `__dirname`. **A hook therefore reports the version of the
> build it is ACTUALLY EXECUTING**, not the version of the repository it is pointed
> at. So a hook can honestly stamp which build ran.

Now the irony the brief asked to be stated — and it must be stated correctly,
because the reasoning offered for it does not survive checking:

> **The suggested reason is wrong.** The concern was that the session-start hook is
> subject to the same staleness, so it is the wrong instrument. In fact a *stale*
> session-start hook writing a *stale* version is **precisely the measurement
> wanted**: the hook that ran at session start IS, by definition, the build this
> session loaded, and recording it is exactly how a later reader learns the session
> is behind. Staleness does not disqualify the instrument; it is what the instrument
> reads.

The instrument is disqualified as a first move for three different reasons, two of
them fundamental:

1. **There is no trustworthy reference to compare against from inside the
   repository.** Detecting staleness needs the *installed* version, and inside a
   development checkout `getVersion()` returns the repository's `VERSION`
   (`6.12.98`) while the installed plugin is a different build (`6.12.97`). Those
   differ legitimately and permanently during development, so a naive comparison
   cries wolf on every developer's machine, every day. Reading the installed version
   requires walking the Claude plugin cache layout, which planning has **not
   verified** and will not hardcode.
2. **The retro-fit gap.** A stamp exists only in builds that ship it. Every session
   running today writes none, so "no stamp" means *the session predates the feature*
   or *the hook did not run* or *the feature broke* — three causes behind one
   absence, for an unbounded period after release. That absence must read as
   `unknown`, never as healthy, which limits what it can conclude early on.
3. **`src/hooks/SessionStart.js` is declared by an active plan** (`00067`), so the
   natural home is not available to be edited today. That is scheduling, not design.

There is a better beacon than session start, and `00171` builds it: **the
`PostToolUse` hook wired on the `*` matcher runs on every tool call and is not in
any deny path**, so a beacon there is both comprehensive and incapable of blocking
anything. Combined with this plan's instrument it *separates the two causes the
hand probe could not*:

| beacon | enforcement log | diagnosis |
|---|---|---|
| fresh | stale | hooks ARE loaded; the *enforcement* hook specifically is not recording |
| stale or absent | stale | the hook system is not running for this session — the staleness hypothesis |

That discrimination is the whole value of `00171`, and it is why it is a separate
slice rather than a paragraph here.

## Question 5 — the larger question, NAMED and deliberately not solved

**An enforcement layer whose absence is undetectable was never a boundary.**

This finding is evidence for the ruling already made: against an agent holding an
unrestricted shell, no in-process gate is a security boundary, and these guards
protect against mistake and drift rather than intent. A guard that can stop running
silently does not even reach the lower bar — it does not reliably protect against
drift either, because drift is exactly what accumulates while nobody is looking.

**This plan does not act on that.** The natural home for the note is
`docs/CRITICAL_CONTROL_POINTS.md`, and **that file is declared by an active plan
(`00089`)**, so it is not this plan's to edit. It is recorded here as a finding for
the human to schedule.

## Implementation Details

### Dependency graph

```
src/lib/enforcement-liveness.js   (NEW)
  ├─requires→ src/lib/safe-fs.js          [existing, unchanged]
  ├─requires→ src/lib/enforcement-log.js  [existing, unchanged — readLog()]
  └─requires→ path                        [node builtin]

src/areas/system.js ──requires→ src/lib/enforcement-liveness.js   [NEW edge]
```

No cycle: `enforcement-log` requires only `durable-log`, `safe-fs` and `path`, none
of which reaches back here. Step 11 verifies this by reading the require graph
rather than by trusting this paragraph.

`enforcement-log.readLog(root)` already exists and returns the entries as an array
through the durable-log reader, so **the on-disk line format is spelled once, in the
module that owns it.** This plan must not re-parse the file itself. That module is
declared by another active plan (`00069`) and is **required, never edited**, here.

### File: `src/lib/enforcement-liveness.js`
**Action:** CREATE
**Purpose:** The one encoding of "is CTOC's edit protection actually recording
decisions in this project?"

Exports:

- `protectionLiveness(root, opts)` → `{ state, confidence, lastDecisionAt, unrecordedCount, unrecordedSince, sources, reason }`
  - `state` is exactly one of `'recording' | 'not-recording' | 'unknown'`.
  - `confidence` is `'high' | 'low' | null` — `'high'` only when the corroboration
    floor is met and the log proves the hook worked here before. Only `'high'`
    earns the restart advice.
  - `lastDecisionAt` is an ISO-8601 instant or `null`.
  - `unrecordedCount` is the number of DISTINCT declared files whose modification
    time is newer than `lastDecisionAt` by more than the granularity allowance;
    `unrecordedSince` is the oldest such time.
  - `sources` reports each instrument independently:
    `{ log: 'has-entries'|'empty'|'absent'|'unreadable', edits: 'observed'|'none'|'unreadable' }`
    so a caller can see WHICH instrument was blind rather than merely that
    something was.
  - `reason` is a short fixed-vocabulary token, never free text.
  - **Never throws.** Every read is individually guarded — but a guarded failure
    yields `'unreadable'` for that source, and **no combination of unreadable
    sources may ever produce `'recording'`.** That inversion is the plan.
  - `opts.now` (milliseconds) is injectable so age assertions are deterministic
    without sleeping.

- `describeProtection(result)` → `{ heading, lines, severity }`
  - Pure, so its text is asserted in-process with no rendering. `severity` is
    `'ok' | 'warn' | 'alarm'`. The `not-recording`-with-`high`-confidence text is
    the only one that contains restart advice; the `unknown` text differs from the
    `not-recording` text in words, not only in severity.

**The two-observable comparison, written out.**

`lastDecisionAt` comes from `enforcementLog.readLog(root)` — the newest parseable
`timestamp`. Entries with an absent or unparseable timestamp are counted and
skipped; if entries exist but NONE has a usable timestamp, the source is
`'unreadable'`, never `'empty'`.

The edit witness enumerates the plans in `plans/in-progress`, `plans/todo` and
`plans/implementation`, reads each one's `files:` declaration, and takes the
modification time of each declared path that exists. **Step 9 reads
`src/lib/plan-coverage.js` first and reuses whatever active-plan enumeration it
already exports; only if none exists does this module read the frontmatter itself.**
Two encodings of "which plans are active" is the drift this repository keeps paying
for. If a plan file cannot be read, that plan is counted as unreadable and the
source degrades to `'unreadable'` rather than silently shrinking the witness — **a
witness that got smaller because it could not look is the defect this plan exists to
remove.**

`GRANULARITY_MS = 2000` is the sole constant, justified in "Question 1" above.
`CORROBORATION_FLOOR = 2` is the confidence constant, justified in "Question 3".
Both are named exports so a test can drive the boundary rather than approximate it.

Deliberately NOT here: any attempt to make the hooks run, any write of any kind, any
invocation of a hook, and any inference about WHY the protection is not recording.
This module observes and reports. A module that both diagnosed and repaired would
have no honest failure state.

### File: `src/areas/system.js`
**Action:** MODIFY — the Logs block only

Replace the `Enforcement … N bytes` line with the protection verdict rendered from
`describeProtection`. The `Gate violations` and `Cleanup` byte lines are **left
exactly as they are** — they are outside this plan's finding, and changing them
would widen the slice for no evidence.

The render is **fail-open in shape but never fail-quiet in content**: if
`protectionLiveness` itself is unavailable (a require failure), the line renders the
`unknown` text — it must never fall back to the byte count, and it must never render
nothing. Falling back to the old line on error would reintroduce the exact silence
this plan removes, at the exact moment it matters.

The path `.ctoc/logs/enforcement.json` stays visible on the `unknown` line so a
human can look at the file the check could not read. Control characters are stripped
before render, per the existing `stripCtl` convention in this area.

### File: `tests/the-edit-protection-says-whether-it-is-running.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
`fs.promises.rm(root, { recursive: true, force: true })` in `finally`, no shell.
Log fixtures are minted by calling the real `enforcementLog.logEnforcement`, never
by hand-writing JSON lines — a hand-built fixture drifts from the schema the moment
the schema moves. Modification times are set explicitly with `fs.utimesSync` so no
test ever sleeps.

| # | Case | Assertion |
|---|---|---|
| 1 | **the measured reality** — a log whose newest entry predates several declared files | `state === 'not-recording'`, `confidence === 'high'`, `unrecordedCount >= 2` |
| 2 | **a healthy project** — newest log entry newer than every declared file | `state === 'recording'`; no advice in the description |
| 3 | **an IDLE project is silent, however old** — one entry from 400 days ago, no file newer | `state === 'recording'`. This is the anti-wolf case: **no duration anywhere in the module** |
| 4 | **a BUSY project speaks within seconds** — one entry, two declared files touched 3s later | `state === 'not-recording'` — the same code, opposite verdict, driven only by activity |
| 5 | **one file is not enough** — exactly one declared file newer | `state === 'not-recording'`, `confidence === 'low'`, and the description contains **no restart advice** |
| 6 | **the corroboration floor is exact** — 1 file → low, 2 files → high | drives `CORROBORATION_FLOOR` at its boundary, not near it |
| 7 | **the granularity allowance is exact** — a file 1s newer → not counted; 3s newer → counted | drives `GRANULARITY_MS` at its boundary |
| 8 | **THE FENCE — an unreadable log is never `recording`** | log file replaced by a directory → `state === 'unknown'`, `sources.log === 'unreadable'`. It must NOT report healthy and must NOT report `not-recording` |
| 9 | **an unreadable PLAN is never a smaller witness** — one active plan file unreadable | `sources.edits === 'unreadable'` and `state === 'unknown'` — never `'recording'` because the remaining readable plans happened to show nothing |
| 10 | **an absent log is `unknown`, not broken** — no `.ctoc/logs/` at all | `state === 'unknown'`, `sources.log === 'absent'`, and **no restart advice** — a fresh project is not a broken one |
| 11 | **an empty log is `unknown`** — file exists, zero entries | `sources.log === 'empty'`; no advice |
| 12 | **a corrupt LINE does not blind the scan** — one malformed line plus valid entries | the valid entries are used; the malformed one is counted, not fatal |
| 13 | **every line malformed** | `sources.log === 'unreadable'`, not `'empty'` |
| 14 | **never throws** — `root` that is a file, `''`, `null`, and a path containing a NUL | `state === 'unknown'` for each; no throw |
| 15 | **the two bad states read DIFFERENTLY to a human** | the `not-recording` and `unknown` descriptions differ in words, and only the high-confidence `not-recording` one mentions restarting |
| 16 | **the System screen renders the verdict, not a byte count** | `system.render` output contains the protection heading and does NOT contain `bytes` on the enforcement line, across all three states |
| 17 | **the screen never falls back to silence** — `enforcement-liveness` made to throw on require | the rendered output still contains the `unknown` text; it never renders the byte count and never renders an empty block |
| 18 | **the fence is not vacuous** — case 1's assertion applied to case 2's fixture | FAILS, proving case 1 discriminates on real evidence rather than matching anything |

Cases 3, 4, 8, 9 and 17 are the plan. Case 18 guards against a test that would pass
against any input.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `protectionLiveness` | `src/areas/system.js:render` | `/ctoc:start` → System area, a screen a human opens |
| `describeProtection` | that same render | the human's terminal |
| the test file | the suite | `npm test` |

`src/areas/system.js` is required by `src/commands/start.js:255` and is a **mounted,
live** area. This matters and was checked: several done plans record that
`src/tabs/overview.js` is an UNMOUNTED legacy tab and that features wired there are
dead on arrival. Wiring this verdict into the overview tab would have produced
exactly the failure the brief warned about — an honest signal shipped into a surface
nothing renders. Step 9 re-confirms the mount before the wiring is written.

Nothing here is reachable only from a test.

## What this does NOT fix

1. **It does not make the hooks run.** This is the headline limitation. After this
   plan lands, edits in a session whose hooks are not firing are still unchecked;
   the only difference is that a human who opens the System screen is told so
   instead of being shown a byte count.
2. **It does not explain WHY they are not running.** Session staleness, plugin
   enablement and harness matcher behaviour are all candidates and none is
   observable from inside a Node module reading this project's files. `00171`
   narrows it to two; it does not close it.
3. **It does not warn PROACTIVELY.** The verdict appears when a human opens the
   System screen. Nothing interrupts an agent that is editing unprotected right now.
   Pushing the warning into the session banner means editing `SessionStart.js`,
   which an active plan declares.
4. **It is evidence, not proof.** A formatter run or a checkout can move declared
   files without a tool call, which reads as unrecorded edits. The confidence ladder
   and the wording both hold that line; neither removes the possibility.
5. **It cannot detect the reverse failure** — a hook that runs and logs but whose
   decision is wrong. A recorded `allow` proves the hook fired, not that it was
   right.
6. **It does not restore the missing history.** The edits this session made without
   enforcement are gone unrecorded and cannot be reconstructed.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.

Write `tests/the-edit-protection-says-whether-it-is-running.test.js` in full and run
**only that file, before touching `src/`**. Record the starting state verbatim.
Every case must be RED for the honest reason — the module does not exist. **If any
case passes, STOP**: something already provides this and must be found before a
second encoding is added.

Then prove cases 3 and 4 are the same code path with opposite verdicts, by reading
the module you are about to write for **any** duration constant. There must be none
besides `GRANULARITY_MS`. A duration that creeps in here is the wolf-crying design
this plan rejected, and case 3 is the test that catches it.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.

Read from disk, in full, and let the code win over this plan where they differ:

- `src/lib/enforcement-log.js` — `readLog`'s exact return shape and field names.
- `src/lib/durable-log.js` — what `readEntries` does with a malformed line, so case
  12's behaviour is the real one and not an assumed one.
- `src/lib/plan-coverage.js` — **whether it already exports an active-plan
  enumeration.** If it does, reuse it; do not write a second one. Do NOT edit this
  file; it is declared by `00126` and `00129`.
- `src/areas/system.js` — the render shape, the `c.*` colour conventions, and the
  `stripCtl` usage in sibling areas.
- `src/commands/start.js` around line 255 — **confirm `../areas/system` is really
  mounted and reachable**, and record how. If it is not, STOP: the surface is wrong
  and the human must choose another.

Then re-measure and **report the table before any code is written**:

1. How many lines does `.ctoc/logs/enforcement.json` hold now? Planning measured 24.
2. What is the newest timestamp, and is it a hand-fired probe or organic traffic?
   Planning measured 2026-07-20T10:03:21Z, a probe; newest organic 2026-07-17.
3. How many files declared by plans in `in-progress`, `todo` and `implementation`
   have a modification time newer than that newest entry? Planning did not measure
   this and does not predict it. **This is the number the whole check turns on —
   report it, do not assume it.**
4. Is `MAX_ENTRIES` still 1000, so the log has demonstrably never rotated?

**If measurement 3 comes back at zero, that is the headline result and it CONTRADICTS
the finding.** Report it as such and stop before implementing; do not adjust the
design until it agrees with the plan.

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.

One step, files as sub-items.

- `src/lib/enforcement-liveness.js` — `protectionLiveness`, `describeProtection`;
  three states that never collapse; per-source reporting; the two-observable
  comparison; `GRANULARITY_MS` and `CORROBORATION_FLOOR` as the only constants;
  never throws; injectable clock.
- `src/areas/system.js` — the Logs block's enforcement line becomes the verdict; the
  other two byte lines are untouched; no fallback to the byte count on any path.
- `tests/the-edit-protection-says-whether-it-is-running.test.js` — the eighteen
  cases.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.

Confirm there is exactly ONE encoding of "is the protection recording" and that
`src/areas/system.js` holds no second copy of the rule — the area renders a verdict,
it does not compute one. Confirm the log format is read through
`enforcementLog.readLog` and is not re-parsed here. **Confirm by reading the require
graph that no cycle exists.** Confirm by reading the diff — not by inferring from the
tests — that no path returns `'recording'` from a guarded read failure, and that no
path returns `'recording'` when any source is `'unreadable'`. Confirm
`src/lib/enforcement-log.js` and `src/lib/plan-coverage.js` were required and **not
modified**; they belong to other active plans.

### Step 12: OPTIMIZE

This runs on a screen render, so it must be cheap. Confirm the log is read once and
the declared-file scan stats each distinct path at most once, deduplicating paths
declared by several plans. Confirm the scan short-circuits once the corroboration
floor is met — beyond `'high'` there is nothing more to learn and a large repository
should not be walked to produce a count nobody reads. Record the measured render
cost on this repository.

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.

- Confirm a hostile enforcement-log entry cannot inject into the rendered line: an
  entry whose `target_file` contains a newline, a terminal escape, `%s`, and a
  10,000-character value. The rendered text carries a fixed-vocabulary state, a
  count and a formatted time — **never a value read out of the log**.
- Confirm no absolute path outside the repository, no log CONTENTS (an entry carries
  target file paths) and no stack trace can reach the screen. The `unknown` line
  names one repository-relative path, hardcoded.
- Confirm a `root` containing `..`, a NUL byte, or a symbolic link out of the tree
  cannot make this module stat or read outside the project.
- Confirm every fault path returns rather than throws: absent `.ctoc/`, log that is
  a directory, unreadable plan file, declared path that is a dangling symbolic link,
  declared glob matching nothing.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.

Targeted run first: the new test file, plus `tests/enforcement-log.test.js`,
`tests/architecture-invariants.test.js`, `tests/export-reachability.test.js`,
`tests/false-green-fence.test.js`, `tests/doc-counts.test.js`,
`tests/readme-numbers.test.js`, and whatever test file Step 9 finds covering
`src/areas/system.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be
lowered. Lint every changed JavaScript file at `--max-warnings 0`.

Then prove it **the way a human would**: open the System screen and **read the
line**. Given the Step 9 measurement it should say the protection is NOT RUNNING,
with a real count and a real moment — and that is a **PASS** of this plan: the check
working correctly on a project whose protection is dead. Paste the rendered line
verbatim into the report. **No git operations.**

### Step 15: DOCUMENT

A file header on `enforcement-liveness.js` recording: the measurement that motivated
it (24 lifetime entries under a 1000-entry cap, newest organic entry three days old
across a period of heavy building, taken 2026-07-20); **why there is no duration
threshold**, naming the idle-versus-busy argument explicitly so the next person does
not add one; why `unknown` must never fold into `recording`; and that this module
observes only and must never be extended to run a hook or repair what it measures. A
comment at the `src/areas/system.js` call site recording that the byte count it
replaced was accurate and meaningless.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

Report, in this order:

1. **The Step 9 measurement table verbatim**, measurement 3 first — the count of
   declared files changed after the last recorded decision. If it is zero, say so
   loudly; it contradicts the finding.
2. The rendered System line, verbatim, from Step 14.
3. The Step 8 verbatim reds, and the result of case 18 (the vacuity guard).
4. The six things this does NOT fix, "it does not make the hooks run" first.
5. The two findings handed on rather than acted on: the ceiling note belonging in
   `docs/CRITICAL_CONTROL_POINTS.md` (declared by `00089`), and the beacon in
   `00171`.
6. Every decision taken under ambiguity.

## File conflicts — checked before declaring anything

Every obvious home for this work is already declared by an active plan. This was
checked file by file across `plans/todo`, `plans/implementation` and
`plans/in-progress` before the `files:` block above was written:

| file | declared by | consequence |
|---|---|---|
| `src/hooks/SessionStart.js` | `00067` | the session banner is unavailable as a surface |
| `src/hooks/PreToolUse.Edit.js` | `00142`, `00129`, `00069`, `00072` | the hook cannot be stamped from here |
| `src/lib/enforcement-log.js` | `00069` | the log format cannot be extended here — required, not edited |
| `src/lib/iron-loop-enforcer.js` | `00165`, `00160`, `00154`, `00130`, … | no enforcer check registered here |
| `src/tabs/overview.js` | `00086` | and it is an unmounted legacy tab regardless |
| `src/commands/start.js` | `00067`, `00156`, `00089` | no menu-level surface |
| `src/lib/menu-screens.js` | `00131`, `00152`, `00086` | — |
| `docs/CRITICAL_CONTROL_POINTS.md` | `00089` | the ceiling note is handed to the human |
| `CLAUDE.md` | eight active plans | no documentation change here |

`src/areas/system.js` is declared by **no** active plan and is a live mount. It is
the surface for exactly that reason as well as for being the right one.

**If Step 9 finds that any declared file above has become claimed, or that
`src/areas/system.js` HAS since been claimed, STOP and ask** rather than editing a
file two plans claim.

## Decisions Taken Under Ambiguity

1. **No duration threshold exists anywhere in the module, and that is the design
   rather than an omission.** Silence is what a healthy idle project and a dead hook
   have in common, so silence cannot be the signal. The signal is a disagreement
   between two observables, which the project's own activity scales automatically.
   Case 3 (a 400-day-idle project stays silent) and case 4 (a busy project speaks in
   seconds) are the same code path and exist to keep a future duration constant from
   being added quietly.
2. **A time constant WAS admitted, and it is physical rather than a policy.**
   `GRANULARITY_MS = 2000` covers filesystem modification-time granularity. It is
   named, exported, and driven at its boundary by case 7 so it cannot drift into a
   tuning knob.
3. **The corroboration floor of two files is a chosen constant and is admitted as
   one.** One file can move for one innocent reason; two distinct declared files of
   active plans is a pattern. It is set for the false-positive direction — the cost
   of a wrongly-advised restart is a human's annoyance and, worse, a line they learn
   to ignore.
4. **Restart advice is given ONLY when the log proves the hook worked here before.**
   Advising a restart on a project that never had enforcement configured would be a
   guess presented as a diagnosis. The check reports what it sees instead.
5. **The witness is scoped to files declared by active plans, not to the whole
   tree.** A whole-tree scan is noisy — CTOC's own writes, the release script,
   checkouts — and a check that cries wolf gets disabled, which is worse than no
   check. Declared files are the paths an executor edits through tool calls, so an
   unrecorded change to one is close to a direct observation.
6. **The check must NEVER run a hook to test it.** A self-test proves the hook file
   works and says nothing about whether the harness invokes it — and the measurement
   behind this plan is exactly the case where those diverge. It would return
   "enforcement is fine" on the one situation it exists to detect.
7. **Three states, and `unknown` is louder than `not-recording`.** "I could not
   look" is a worse position than "I looked and it is dead", because it hides which
   one is true. Cases 8, 9, 10, 11 and 13 all exist to stop `unknown` collapsing
   into either neighbour.
8. **An unreadable plan degrades the witness to `unknown` rather than shrinking
   it.** If a plan cannot be read, its declared files are invisible, so a smaller
   count is an artifact of blindness. Reporting a healthy verdict off a witness that
   could not see is precisely this defect eating its own fix — case 9.
9. **The System screen never falls back to the byte count.** A require failure
   renders the `unknown` text. Falling back to the old line on error would restore
   the exact silence being removed, at the moment it matters most — case 17.
10. **Only the enforcement line changes; the other two byte counts stay.** They are
    outside the finding. Widening the slice to fix lines nobody measured would be
    scope creep dressed as consistency.
11. **`src/areas/system.js` is the surface because it is LIVE, checked, and
    unclaimed.** Several done plans record that `src/tabs/overview.js` is unmounted
    and that features wired there are dead. That was checked before choosing, not
    after.
12. **The version beacon is split into `00171` and this plan does NOT depend on
    it.** The beacon needs a trustworthy installed-version reference that planning
    could not verify from inside the repository, and it cannot answer for sessions
    that predate it. This plan's instrument works retroactively, today, on the
    evidence that already exists. Coupling them would have delayed the working half
    behind the uncertain one.
13. **The stated reason for distrusting the session-start hook does not hold, and
    saying so is part of the job.** A stale session-start hook recording a stale
    version is the measurement, not a flaw in it. The instrument is deferred for
    three different reasons — no trustworthy reference, the retro-fit gap, and an
    active claim on the file — and recording the wrong reason would have left a
    plausible-sounding argument in the record for someone to build on.
14. **The cause of the outage is deliberately NOT named.** Session staleness fits
    every measurement and is verified by none. Writing it into the plan as
    established would be an assertion planning could not check.
15. **The larger question is named and left unscheduled.** An enforcement layer
    whose absence is undetectable was never a boundary; the note belongs in
    `docs/CRITICAL_CONTROL_POINTS.md`, which an active plan declares. The human
    schedules it.

### Added during execution (Steps 8–16)

16. **The plan's Step 12 short-circuit was REJECTED, and this is the one place
    the plan was found materially wrong on design.** Step 12 instructs the scan
    to stop counting once the corroboration floor is met. Doing so caps
    `unrecordedCount` at 2 — but Question 2's own rendered example promises
    "23 files changed", and Question 2 argues that the count exists "so the
    claim can be judged rather than believed". Both cannot hold. The count won:
    "2 files have changed" on a project where thirty-five did understates a true
    alarm to the only reader who matters. The cost of counting in full is bounded
    by construction — the witness is plan-DECLARED LITERAL paths (149 on this
    repository), never a tree walk — and the measured render cost is 3.1 ms.
    Test case 6 asserts the true count at 3 changed files, which is what caught it.
17. **The newest entry is the cutoff even when that entry is a hand-fired probe,
    and the plan did not notice this about its own instrument.** The plan
    documents entries 21–24 as probes fired by hand today, then defines the
    cutoff as "the newest timestamp". The probes therefore RESET the cutoff:
    measured against them, zero declared files are newer; measured against the
    newest ORGANIC entry (2026-07-17T08:52:39Z), thirty-five are. The design was
    NOT adjusted, per Step 9's instruction. It is self-consistent — any hook
    invocation forgives prior history, because a file older than the last decision
    is indistinguishable from a file whose edit WAS that decision — and it is
    monotone: the moment new edits land unrecorded, it fires, which it did within
    the hour. The limitation is real and is recorded here rather than engineered
    around: a SINGLE hook invocation, from any cause, silently forgives every
    unrecorded edit that preceded it.
18. **Glob declarations are excluded from the witness.** A declaration such as
    `agents/**/*.md` names a SET, not a file to stat, and expanding it means
    walking the tree — the noisy witness this plan rejects. One of the 150
    declarations on this repository is a glob; the other 149 are literal. Skipping
    it can only make the check less sensitive, never more permissive.
19. **The witness spans `implementation` even though `plan-coverage`'s
    `STAGE_PRIORITY` deliberately omits it.** That omission exists because a
    pre-approval plan must never CONFER PERMISSION. Here nothing is granted: a
    declaration is used only as a witness that a file is one an agent edits
    through tool calls. A wider witness is strictly more sensitive.
20. **`plan-coverage` exports no active-plan enumeration, so the stage walk is
    written here — but the `files:` PARSE is not.** Step 9 required reusing an
    existing enumeration if one existed. `plan-coverage` exports
    `readPlanFiles`, `globToRegex`, `touchesOverlap`, `findCoveringPlan` and
    `explainDenial`; the stage enumeration is private to `scanForCoverage`. The
    format-bearing half — parsing `files:` out of a plan — is reused through the
    exported `readPlanFiles`, so the declaration format is still spelled once.
    Only the trivial "which directories to walk" is restated, and it is
    deliberately a DIFFERENT list (see 19), so sharing it would have been wrong.
21. **A blind witness does not veto POSITIVE evidence at or above the floor.**
    The plan says no combination of unreadable sources may produce `recording`;
    it does not say they must suppress `not-recording`. When two or more
    unrecorded files have already been observed, an unreadable plan elsewhere can
    only have HIDDEN more, never invented these. Below the floor the small count
    may be an artifact of the blindness, so the verdict degrades to `unknown`
    (`reason: 'witness-unreadable'`) — which is exactly case 9's fixture.
22. **`asOf` was added to the result, beyond the plan's listed fields.**
    `describeProtection` must be pure to be asserted without rendering, yet
    "Active — checked 4 minutes ago" needs a clock. Passing the injected `now`
    through the result keeps the description pure and deterministic. Reading
    `opts` happens INSIDE the guard so a hostile options object degrades to
    `unknown` instead of crashing the screen — the backstop's live test.
23. **The moment is rendered in LOCAL time.** "09:12 on 17 Jul" is the clock the
    human was looking at when the edits happened; rendering it in UTC would make
    them do arithmetic to judge the claim. Tests assert structure and the absence
    of `NaN`, never a fixed wall-clock string, so this cannot fail by timezone.
24. **A defensive guard around `existsSync` was REMOVED rather than left
    uncovered.** `root` is already known to be an existing directory and the rest
    of the path is a fixed join, so that branch was unreachable by any input. A
    guard no input can reach is untestable code pretending to be safety; the
    outer catch is the real backstop, and it now has a real test.
25. **The count ratchets in `CLAUDE.md` and `tests/readme-numbers.test.js` were
    moved, though neither is in this plan's `files:`.** Adding one module and one
    test file tripped three documented counts (src/lib 106→107, test files
    439→440 in two places). The brief's standing rule is that ratchet files are
    in scope by rule and must be moved in the correct direction, measured live —
    and an active plan, `00082`, is titled exactly that. Only the numbers changed;
    no whitelist entry was added anywhere. `README.md` line 844 still reads "104
    JS modules" and was left alone: no test asserts it, it was already stale
    before this work, and `README.md` is declared by `00089`.

## Execution Record (Steps 8–16)

- **Step 8 TEST — RED, verbatim.** `node --test tests/the-edit-protection-says-whether-it-is-running.test.js`
  before any source existed: `Cannot find module '../src/lib/enforcement-liveness'`
  (`MODULE_NOT_FOUND`), `tests 1 / pass 0 / fail 1`. Zero cases passed, so nothing
  already provided this. Case 18 (the vacuity guard) passes GREEN at the end,
  asserting that case 1's assertion THROWS against case 2's healthy fixture.
  Case 3 additionally reads the finished module's source and asserts it contains
  no uppercase numeric constant other than `GRANULARITY_MS` and
  `CORROBORATION_FLOOR` — the fence against a duration threshold creeping back.
- **Step 9 PREPARE — measurements.** (3) declared files newer than the newest
  entry: **0** against the probe at 2026-07-20T10:03:21Z, **35** against the
  newest organic entry at 2026-07-17T08:52:39Z — see decision 17. (1) the log
  holds **24** lines, matching planning. (2) newest entry is a hand-fired probe;
  newest organic is 2026-07-17, matching planning. (4) `MAX_ENTRIES` is still
  **1000**, so the log has demonstrably never rotated. `src/areas/system.js` is
  required at `src/commands/start.js:255` and is a live mount; it remains declared
  by no other active plan.
- **Step 10 IMPLEMENT.** `src/lib/enforcement-liveness.js` (new),
  `src/areas/system.js` (Logs block only — the two sibling byte lines untouched),
  `tests/the-edit-protection-says-whether-it-is-running.test.js` (new).
- **Step 11 REVIEW.** One encoding of the rule; `src/areas/system.js` renders a
  verdict and computes none. The log format is read only through
  `enforcementLog.readLog`. No cycle: nothing in the graph reaches back to a
  brand-new module. `git status` confirms `src/lib/enforcement-log.js` and
  `src/lib/plan-coverage.js` are UNMODIFIED. No path returns `recording` from a
  guarded read failure.
- **Step 12 OPTIMIZE.** Log read once; each distinct declared path `lstat`ed at
  most once (deduplicated across plans — a dedicated test asserts it). Measured
  render cost on this repository: **3.1 ms** over 20 renders. Short-circuit
  rejected, see decision 16.
- **Step 13 SECURE.** A hostile entry whose `target_file` carries a newline, a
  terminal escape, `%s` and 10,000 characters reaches the screen in NO form —
  asserted. Out-of-tree declarations (`../../../../etc/passwd`, `/etc/hosts`) are
  never stat'ed. Every fault path returns rather than throws: absent `.ctoc/`,
  log-as-directory, unreadable plan, unlistable stage directory, hostile options
  object, hostile roots (a file, `''`, `null`, `undefined`, `42`, `{}`, a NUL byte).
- **Step 14 VERIFY.** `npm test`, verbatim: `tests 10273`, `suites 1762`,
  `pass 10273`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`,
  `[CTOC test-gate] coverage 99.01% (threshold 99%), skipped 0, failed 0`,
  `[CTOC test-gate] PASS`. Re-run for stability at the floor: identical counts,
  coverage 99.03%, PASS. `enforcement-liveness.js` reaches **100.00%** line
  coverage in the full run. The floor was NOT lowered. ESLint `--max-warnings 0`
  and `tsc --checkJs` are both clean on all changed files.
- **Step 14 — the human's own reading**, rendered verbatim from the live System
  screen on this repository (colour codes stripped):

  ```
    Edit protection
      NOT RUNNING — 6 files have changed since CTOC last checked one, at 12:03 on 20 Jul.
      Edits are not being checked against your plans right now.
      Restart this session to load it again.
  ```

  This is a **PASS**: the check working correctly on a project whose protection is
  dead. The six files include this executor's own edits, which the hook did not
  record — the instrument catching the live outage as it happened.
- **Step 15 DOCUMENT.** File header on `enforcement-liveness.js` records the
  motivating measurement, why there is no duration threshold (naming the
  idle-versus-busy argument), why `unknown` must never fold into `recording`, and
  that the module observes only. A comment at the `src/areas/system.js` call site
  records that the byte count it replaced was accurate and meaningless.
- **Step 16 FINAL-REVIEW.** Two findings are handed on, not acted on: the ceiling
  note for `docs/CRITICAL_CONTROL_POINTS.md` (declared by `00089`), and the
  `PostToolUse` beacon in `00171` that would separate "the hook system is not
  running" from "the enforcement hook specifically is not recording". This plan
  still does NOT make the hooks run, does not explain why they are not running,
  does not warn proactively, is evidence rather than proof, cannot detect a hook
  that runs but decides wrongly, and does not restore the missing history.
