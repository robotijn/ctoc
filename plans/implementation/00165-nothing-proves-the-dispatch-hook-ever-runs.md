---
title: "Nothing proves the dispatch hook ever runs"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/dispatch-seat-liveness.js"
  - "tests/the-dispatch-seat-says-whether-it-is-live.test.js"
  - "src/lib/iron-loop-enforcer.js"
---

# Nothing proves the dispatch hook ever runs

## Why this plan exists before the one that was actually ordered

The ruling is: make the dispatch path record what it is building — claim a task and
move the plan before an executor starts, the same two steps the menu path already
performs. The obvious seat for that mechanism is `src/hooks/PreToolUse.Task.js`. It
fires on the `Task` tool, it is wired in `.claude-plugin/hooks.json`, it already
detects a CTOC project, and it already takes a concurrency slot. On paper it is
exactly the right place.

**On this repository, measured today, there is no evidence it has ever run.**

| witness | what it would be | measured |
|---|---|---|
| `.ctoc/state/agent-slots.json` | created by `agentSlots.acquire` → `writeSlots` on EVERY allowed dispatch in a CTOC project | **ABSENT.** `.ctoc/state/` holds `agent.json`, `continuation.json`, `tasks.json` and nothing else |
| an enforcement-log line with `"tool":"Task"` | written by both `allow()` and `block()` in `PreToolUse.Task.js` | **ZERO** across the whole of `.ctoc/logs/enforcement.json` |
| an enforcement-log line carrying a `subagent` field | that field is written ONLY by the Task hook | **ZERO** |
| the newest enforcement-log entry of any kind | — | **2026-07-17**, three days stale, across a period of heavy building |

The measurement was taken from inside a live subagent dispatch — this planning run is
itself a real `Task` dispatch in this repository. Had the hook fired for it,
`agent-slots.json` would exist right now, holding this run's slot, well inside the
thirty-minute time-to-live. It does not exist.

`release()` cannot explain the absence: it writes the remaining list back, so it
would leave a file with an empty `slots` array, never no file. A failed write cannot
comfortably explain it either — `.ctoc/state/` is demonstrably writable, since
`tasks.json` is written there constantly.

The installed plugin was checked as well, because that — not this source tree — is
what actually executes:

```
/Users/doctony/.claude/plugins/cache/robotijn/ctoc/6.12.97/.claude-plugin/hooks.json
    → PreToolUse matcher "Task" → src/hooks/PreToolUse.Task.js        [WIRED]
/Users/doctony/.claude/plugins/cache/robotijn/ctoc/6.12.97/src/hooks/PreToolUse.Task.js
                                                                      [PRESENT]
```

Repository `VERSION` is `6.12.98`; the installed plugin is `6.12.97`, one patch
behind. The wiring and the file are both correct in the installed copy. **So the hook
is correctly declared and correctly present, and still produced no artifact for a real
dispatch.** Why is not established, and this plan does not guess. The candidate
explanations — the plugin not enabled for this session, the harness not invoking
PreToolUse for `Task`, a crash before `acquire`, a cwd that is not this project — are
distinguishable only by observation, and observation is what this plan ships.

## The reason this is a plan and not a footnote

Building the claim mechanism into a hook that does not run would produce a mechanism
that is indistinguishable from an instruction: the registry would stay exactly as
empty as it is now, every later question would keep its dishonest answer, and the
suite would be green the entire time because a hook's decision function tests
perfectly well in-process whether or not the harness ever calls it.

That is this repository's own false-green defect class — a verdict reported about
input that was never received — wearing the shape of an enforcement fence. The plan
that lands the claim (`00166`) therefore takes this plan's answer as a **hard
precondition**, and this plan's whole job is to make that answer a measurement rather
than an assumption, permanently and at runtime.

## What is built

One module that answers a single question honestly, and one place a human meets the
answer.

**The question:** has CTOC's dispatch seat produced evidence of running in this
project?

**The three possible answers, which must never collapse into two:**

| answer | meaning | how it is reached |
|---|---|---|
| `live` | the seat ran; here is the evidence and how old it is | the slot store exists and parses, or a `Task`-tool enforcement-log entry exists |
| `not-live` | the instruments were read successfully and hold NO evidence of the seat ever running | both sources readable, both empty of Task evidence |
| `unknown` | the instruments could not be read, so nothing is known either way | a read threw, a parse failed, or the project root is unusable |

The distinction between `not-live` and `unknown` is the entire point. A check that
reported "not live" when it simply could not open the file would be the same defect it
exists to prevent — the empty answer standing in for the unread one. `unknown` is a
loud state, never a quiet pass.

## Implementation Details

### Dependency graph

```
src/lib/dispatch-seat-liveness.js   (NEW)
  ├─requires→ src/lib/safe-fs.js        [existing, unchanged]
  ├─requires→ src/lib/agent-slots.js    [existing, unchanged — for slotsPath + SLOT_TTL_MS]
  └─requires→ path                      [node builtin]

src/lib/iron-loop-enforcer.js ──requires→ src/lib/dispatch-seat-liveness.js  [NEW edge]
```

No cycle: `agent-slots` requires only `path`, `crypto`, `safe-fs` and `task-registry`,
and none of those requires this new module. Step 11 verifies that by reading the
require graph rather than by trusting this paragraph.

`agent-slots.slotsPath` and `agent-slots.SLOT_TTL_MS` are both already exported
(`agent-slots.js:274-282`), so the store's location and staleness window are spelled
**once**, in the module that owns them. This plan must not re-derive either.

### File: `src/lib/dispatch-seat-liveness.js`
**Action:** CREATE
**Purpose:** The one encoding of "did CTOC's dispatch seat actually run here?"

Exports:

- `seatLiveness(root, opts)` → `{ state, evidence, sources, reason }`
  - `state` is exactly one of `'live' | 'not-live' | 'unknown'`.
  - `evidence` is `null`, or `{ source, at, ageMs, detail }` where `source` is
    `'agent-slots'` or `'enforcement-log'`, `at` is an ISO-8601 instant and `ageMs`
    is its age against an injectable `now`.
  - `sources` reports each instrument independently:
    `{ agentSlots: 'present'|'absent'|'unreadable', enforcementLog: 'has-task'|'no-task'|'unreadable' }`.
    A caller can therefore see WHICH instrument was blind, not merely that something
    was.
  - `reason` is a short fixed-vocabulary token explaining the state, never free text.
  - **Never throws.** Every read is individually guarded. But — and this is the
    inversion that matters — a guarded failure produces `'unreadable'` for that
    source, and if NO source could be read the overall state is `'unknown'`, never
    `'not-live'`.
  - `opts.now` (milliseconds) is injectable so age assertions are deterministic
    without sleeping.

- `describeLiveness(result)` → `string`
  - One human-readable paragraph naming the state, the evidence and its age, and —
    when the state is `not-live` or `unknown` — the specific consequence: that a
    dispatch-seated claim cannot be relied upon, so `00166` must not be trusted to
    have fired. Pure, so its text is asserted in-process.

**Reading the slot store.** The store's shape (`{version, slots:[…]}`) and its path
come from `agent-slots`. Presence of the FILE is the evidence that the seat ran at
least once, independent of whether any slot is currently held — a released slot leaves
an empty array behind, and an empty array in an existing file still proves the seat
executed. Its modification time supplies `at`. An entry inside the time-to-live
additionally reports a live holder in `detail`, but is not required for `live`.

**Reading the enforcement log.** `.ctoc/logs/enforcement.json` is newline-delimited
JSON, one object per line (verified by reading it: 21 lines, compact form, no spaces
after the colons). The scan looks for an entry whose `tool` is `Task`, or which
carries a `subagent` key. **Per-line parse failures are counted, not fatal** — a
single malformed line in an append-only log must not blind the whole check — but if
NO line could be parsed the source is `'unreadable'`, not `'no-task'`. The file is
read with a bounded read and the scan runs over lines, so a log that has grown large
cannot be truncated-then-parsed into a wrong verdict.

Deliberately NOT here: any attempt to make the seat live, any write, any repair, and
any inference about WHY it is not live. This module observes and reports. A module
that both diagnosed and healed would have no honest failure state.

### File: `src/lib/iron-loop-enforcer.js`
**Action:** MODIFY — register one check, change no existing one

Add a check named `dispatch-seat-liveness` alongside the existing `false-green-fence`
check, using **whatever registration shape Step 9 reads live in that file** — this
plan does not restate the enforcer's internal contract, and where the code disagrees
with this paragraph the code wins and the discrepancy is recorded.

The check's verdict mapping, which is the load-bearing part:

| liveness state | check result | why |
|---|---|---|
| `live` | pass, with the evidence age reported | the seat runs; a claim can be relied on |
| `not-live` | **fail, loudly** | the instruments were read and hold no evidence the seat ever ran |
| `unknown` | **fail, loudly, with a different message** | the instruments could not be read; this is NOT a pass |

`unknown` failing is deliberate and is the whole discipline: a check that cannot read
its own instrument must not return the success value. This mirrors `test-gate.js`,
whose parsers return `null` rather than `0` for exactly this reason.

Nothing else in the enforcer changes: no existing check's verdict, no threshold, no
ordering.

### File: `tests/the-dispatch-seat-says-whether-it-is-live.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, no shell. The slot-store fixture is minted by
calling the real `agent-slots.acquire`, never by hand-writing the JSON — a hand-built
fixture drifts from the schema the moment the schema moves.

| # | Case | Assertion |
|---|---|---|
| 1 | **the measured reality** — state dir with `tasks.json` only, log with no Task line | `state === 'not-live'`; `sources.agentSlots === 'absent'`; `sources.enforcementLog === 'no-task'` |
| 2 | **the seat ran** — a real `acquire()` against the fixture root | `state === 'live'`; `evidence.source === 'agent-slots'` |
| 3 | **a released slot still proves it ran** — `acquire()` then `release()` | `state === 'live'` — the file survives with an empty array, and that is evidence |
| 4 | **the log alone can carry it** — no slot store, one line with `"tool":"Task"` | `state === 'live'`; `evidence.source === 'enforcement-log'` |
| 5 | **the `subagent` key alone carries it** — a line with a `subagent` field and no Task tool | `state === 'live'` |
| 6 | **THE FENCE** — slot store present but unreadable (mode-stripped or a directory in its place), log unreadable | `state === 'unknown'`, **never `'not-live'`**; both `sources` report `'unreadable'` |
| 7 | **half-blind is still unknown-free** — slot store unreadable, log readable with a Task line | `state === 'live'`; `sources.agentSlots === 'unreadable'` — one blind instrument does not erase another's positive evidence |
| 8 | **half-blind with no positive evidence** — slot store unreadable, log readable and empty | `state === 'unknown'` — a readable-but-empty instrument cannot overrule an unread one |
| 9 | **a corrupt log line does not blind the scan** — one malformed line plus one valid Task line | `state === 'live'`; the malformed line is counted, not fatal |
| 10 | **every line malformed** | `sources.enforcementLog === 'unreadable'`, not `'no-task'` |
| 11 | **age is reported and injectable** — `opts.now` set past the fixture's stamp | `evidence.ageMs` matches the injected clock; no sleeping |
| 12 | **never throws** — a `root` that is a file, an empty string, and `null` | returns `state === 'unknown'` for each; no throw |
| 13 | **the description names the consequence** — for `not-live` and `unknown` | the text says a dispatch-seated claim cannot be relied upon; the two messages DIFFER from each other |
| 14 | **the enforcer fails on both bad states** | the registered check fails for `not-live` AND for `unknown`, with different messages |
| 15 | **the fence is not vacuous** — case 1's assertion applied to case 2's fixture | FAILS, proving case 1 discriminates on real evidence rather than matching anything |

Cases 6, 8 and 10 are the plan. Case 15 guards against a test that would pass against
any input.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `seatLiveness` | the `dispatch-seat-liveness` check in `iron-loop-enforcer.js` | the enforcer's thorough-mode run, which a human invokes |
| `describeLiveness` | that same check's failure message | the human's terminal |
| the test file | the suite | `npm test` |

Nothing here is reachable only from a test.

## What this does NOT fix

1. **It does not make the seat live.** If the answer is `not-live`, this plan reports
   that and stops. Making the dispatch record its work is `00166`, and `00166` is
   gated on this answer.
2. **It does not explain WHY the seat is not live.** Plugin enablement, harness
   behaviour for the `Task` matcher, and working-directory resolution are all
   candidates; distinguishing them needs observation this module deliberately does not
   attempt.
3. **It does not repair the 64 existing bookkeeping records**, which remain a separate
   decision already surfaced to the human.
4. **It does not narrow the write surface** — `00129` Part B stays blocked, and this
   plan is one input to unblocking it, not the unblocking.
5. **It cannot prove the seat is live for a FUTURE dispatch.** It reports evidence of
   past execution. A seat that ran yesterday and is broken today reads `live`. The
   evidence age is reported precisely so a human can judge that themselves.
6. **`.ctoc/state/agent.json` is still stale** — it reports `active: true` for
   `00071-fg1-false-green-fence`, started 2026-07-18, whose task finished the same
   day. Not touched here. See the correction recorded in `00167`.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/the-dispatch-seat-says-whether-it-is-live.test.js` in full and run **only
that file, before touching `src/`**. Record the starting state verbatim. Every case
must be RED for the honest reason — the module does not exist. **If any case passes,
STOP**: something already provides this and must be found before a second encoding is
added.

### Step 9: PREPARE

Read from disk, in full, and let the code win over this plan where they differ:
`src/lib/agent-slots.js` (the exported `slotsPath`, `SLOT_TTL_MS`, the store shape);
`src/hooks/PreToolUse.Task.js` (`allow`/`block`, exactly which fields reach the log);
`src/lib/enforcement-log.js` (the on-disk line format and the field names);
`src/lib/iron-loop-enforcer.js` (the check-registration shape — **read it before
writing the wiring; this plan deliberately does not restate it**).

Then re-measure and **report the table before any code is written**:

1. Does `.ctoc/state/agent-slots.json` exist now? Planning measured ABSENT.
2. How many `.ctoc/logs/enforcement.json` entries carry `"tool":"Task"` or a
   `subagent` field? Planning measured ZERO of each. **Match on the COMPACT form —
   the log has no space after the colon, and a pattern written with one silently
   measures zero on a log that is full.** Planning made exactly that mistake and
   caught it; do not re-make it.
3. What is the newest enforcement-log timestamp? Planning measured 2026-07-17.
4. Confirm the installed plugin still wires the `Task` matcher and still contains
   `src/hooks/PreToolUse.Task.js`, and record the installed version against
   repository `VERSION`. Planning measured 6.12.97 installed against 6.12.98 in the
   tree.

**If measurement 1 or 2 now shows evidence the seat HAS run, that is the headline
result and it changes `00166` from blocked to buildable.** Report what changed.

### Step 10: IMPLEMENT
One step, files as sub-items.

- `src/lib/dispatch-seat-liveness.js` — `seatLiveness`, `describeLiveness`; three
  states that never collapse; per-source reporting; never throws; injectable clock.
- `src/lib/iron-loop-enforcer.js` — register the `dispatch-seat-liveness` check;
  `not-live` and `unknown` BOTH fail, with different messages.
- `tests/the-dispatch-seat-says-whether-it-is-live.test.js` — the fifteen cases.

### Step 11: REVIEW
Confirm there is exactly ONE encoding of "is the seat live" and that
`iron-loop-enforcer.js` holds no second copy of the rule. Confirm the store path and
the time-to-live are IMPORTED from `agent-slots` and not re-spelled. **Confirm by
reading the require graph that no cycle exists.** Confirm that no code path can return
`'not-live'` from a guarded read failure — read the diff, do not infer it from the
tests. Confirm no existing enforcer check changed.

### Step 12: OPTIMIZE
Confirm the log scan is bounded and line-oriented, that it stops at the first positive
Task entry rather than reading the whole file when it does not have to, and that
nothing new runs on any path other than the enforcer check itself. Record the check's
timing on the live repository.

### Step 13: SECURE
- Confirm a hostile enforcement-log line cannot inject text into `describeLiveness`:
  a line containing a newline, a terminal escape, `%s`, and a 10,000-character field.
  The description names a fixed vocabulary state and a numeric age only.
- Confirm the check leaks no absolute path outside the repository, no log CONTENTS
  (a log line may carry a target file path), and no stack traces. Only the state, the
  source name, and the age may surface.
- Confirm a `root` containing `..`, a NUL, or a symbolic link out of the tree cannot
  make this module read outside the project.
- Confirm every fault path returns rather than throws: absent state dir, unreadable
  store, store that is a directory, unreadable log, log that is a directory.

### Step 14: VERIFY
Targeted run first: the new test file, plus `tests/architecture-invariants.test.js`,
`tests/export-reachability.test.js`, `tests/false-green-fence.test.js`,
`tests/doc-counts.test.js`, `tests/readme-numbers.test.js`, and whatever test file
Step 9 finds covering `iron-loop-enforcer.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be
lowered. Lint every changed JavaScript file at `--max-warnings 0`.

Then prove it **the way a human would**: run the enforcer on this repository and
**read the output**. It must state, in plain words, whether the dispatch seat has ever
run here and how old the evidence is. Given the planning measurement it should say
`not-live`, and that is a PASS of this plan — the check working correctly on a project
where the seat is dead. **No git operations.**

### Step 15: DOCUMENT
A file header on `dispatch-seat-liveness.js` recording: the measurement that motivated
it (no slot store, no Task log entry, taken from inside a live dispatch on
2026-07-20); why three states rather than two, naming `unknown` as the state that must
never be silently folded into `not-live`; why the file's PRESENCE rather than a held
slot is the evidence; and that this module observes only and must never be extended to
repair what it measures. A comment at the enforcer check recording why `unknown` fails.

### Step 16: FINAL-REVIEW
Report, in this order:

1. **The Step 9 measurement table verbatim**, and whether the seat shows as live.
   This is the headline: it decides whether `00166` may be built at all.
2. The Step 8 verbatim reds, and the result of case 15 (the vacuity guard).
3. What the enforcer actually printed when run by hand at Step 14.
4. The six things this does NOT fix, the still-dead dispatch seat first.
5. Every decision taken under ambiguity.

## Ordering and file conflicts

**This plan builds FIRST of the four.** `00166` declares this plan in its
`depends_on` because its precondition is this plan's answer.

**A concurrent executor is finishing a slice touching `src/lib/project-root.js` and
`src/lib/menu-screens.js`.** This plan declares NEITHER and does not modify either.

`src/lib/iron-loop-enforcer.js` is not declared by any of the other three plans in
this set. If Step 9 finds another active plan declaring it, **stop and ask** rather
than editing a file two plans claim.

## Decisions Taken Under Ambiguity

1. **The precondition is shipped as a runtime check, not settled as a one-off
   measurement.** A measurement written into a plan is true on the day it is taken;
   the seat can go dead again on any plugin update, and nothing would notice. A check
   a human can run keeps answering. This is why this is a plan rather than a paragraph
   in `00166`.
2. **Three states, and `unknown` fails the check.** The tempting two-state design —
   live or not — would report "not live" for an unreadable instrument, which is this
   repository's documented false-green class. `unknown` is louder than `not-live`,
   because "I could not look" is a worse position than "I looked and it is dead".
3. **File PRESENCE is the evidence, not a held slot.** A subagent that finished
   released its slot, leaving an empty array. Requiring a live holder would report
   `not-live` for a project whose seat works perfectly and is merely idle.
4. **This module does not attempt to explain why the seat is dead.** Plugin
   enablement and harness matcher behaviour are not observable from inside a Node
   module reading this project's files. Reporting a guessed cause would be an
   assertion planning could not verify — the defect class this repository fences.
5. **This module never repairs what it measures.** A check that healed its own
   instrument could never report a true `not-live`, because the first run would fix
   it. Observation and repair are kept apart deliberately.
6. **The enforcer's registration shape is NOT restated here.** Planning did not read
   `iron-loop-enforcer.js` in full and will not invent its contract. Step 9 reads it
   live and the code wins. Writing a plausible-looking registration that does not
   match would be a guess dressed as a specification.
7. **The compact-form log pattern is called out explicitly in Step 9.** Planning first
   searched for `"tool": "Task"` with a space, measured zero, and nearly recorded a
   false finding; the log is written compactly. The corrected search still measured
   zero, which is why the finding stands. The trap is documented so the executor does
   not fall into it and reach the right answer for the wrong reason.
8. **The measurement was taken from inside a real dispatch, and that is stated as the
   evidence rather than a synthetic fixture.** This planning run is itself a `Task`
   dispatch in this repository; the absent slot store is therefore live evidence about
   the real path, not a fixture that was always going to be well-formed.
</content>
</invoke>
