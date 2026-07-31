---
approved_by: human
approved_at: 2026-07-20T09:18:54.046Z
gate_crossed: implementation → todo
title: "Agents stop inventing status they cannot verify — a fence over what an agent is TOLD to say, and a stated limit about what cannot be fenced at all"
type: implementation
parent_plan: none
depends_on: 00154-a-fence-that-fails-when-a-gate-number-reaches-a-human, 00089-the-product-stops-claiming-compliance-it-does-not-enforce
priority: CRITICAL
program: fresh-repository-first-run
iron_loop: true
files:
  - "skills/agent-fragments/honest-status.md"
  - "src/lib/agent-honesty-scan.js"
  - "src/lib/iron-loop-enforcer.js"
  - "agents/**/*.md"
  - "CLAUDE.md"
  - "tests/agent-honest-status-fence.test.js"
---

# Agents stop inventing status they cannot verify

The owner was shown this, in his own session:

```
Your session's compliance gate is at 11:15.
```

I searched the whole repository for that sentence and for the phrasing "your
session's". **Zero matches** — not in `src/`, not in `agents/`, not in `skills/`.
No code produces that line. **An agent invented it.**

## Three fictions in one sentence, each verified separately

| fiction | what was checked | result |
|---|---|---|
| **"gate"** is internal vocabulary the owner has twice instructed must never reach a human | the standing rule, and its sibling plan 00151 | The rule exists and is being enforced against shipped strings by 00151–00154. This line bypassed all of that because no string literal produced it. |
| **"at 11:15"** is a deadline | grepped `src/` for `setInterval`, `cron`, `schedule`, `deadline`, and a time-of-day pattern | **Nothing in this product is scheduled against a wall clock.** The only "scheduler" is the task-registry's *concurrency* scheduler, and the only "deadline" is `task-registry.js`'s cancel clock and `app-runner.js`'s poll budget — both millisecond durations, never a time of day. There is no 11:15. There is no clock. The model invented a temporal structure so a status line would sound complete. |
| **"compliance"** names a subsystem that runs | grepped every occurrence of `isControlEnabled` | Defined at `regulatory-regime.js:282`, exported at `:381`, **called from nowhere in `src/`**. The only invocation in the shipped product is an agent recipe at `agents/coordinator/ivv-chief.md:35-36`. So the agent announced a timed checkpoint for a mechanism that does not run. |

The third fiction is the worst of the three, because it is the one a user could
act on.

## Why this is worse than a bad string in code

A bad string in code is wrong in one place and a fence can find it. This sentence
was **generated**. It had no source. The model was asked where things stood, had
no data, and produced a fluent, specific, entirely fictional answer rather than
saying it had none.

The existing fences (00151–00154) enforce the owner's rule against **shipped
code**. Nothing enforces it against **what an agent says**, which is the surface
the human actually reads.

## The honest answer to "where can this be checked?" — mostly, it cannot

The brief asked for honesty about what is mechanisable, and warned against
inventing a checker that cannot work. Having looked, here is the truth, stated
before any design:

| surface | fenceable? | why |
|---|---|---|
| **The top-level session model's own prose** — where THIS incident happened | **NO. Not at all.** | The assistant's text is not a tool call, not a file write, not a subagent return. It streams straight to the terminal. There is no hook, no compile step, no interception point, and there never will be one. |
| **A subagent's returned text** | **Effectively no.** | A `SubagentStop` hook sees a transcript *after* the fact. It cannot prevent the human reading the line, and judging "is this sentence fabricated?" requires knowing what was true — which is the original problem, not a solution to it. |
| **Agent DEFINITION files** (`agents/**/*.md`) | **YES.** | Static text on disk. Fully readable, fully checkable, and they are the only lever that acts on the model *before* it speaks. |

**So the mechanism is not a fence over output. It is an instruction at the
definition level, plus a fence that the instruction is present.** That limit is
not a footnote — it is the design, and it goes in the module header, not buried
here.

### The fence I considered and REJECTED, with the measurement

The obvious idea is to scan agent definitions for the defect's fingerprints — an
invented time, a gate number in an example status line. I measured it before
proposing it. A time-of-day pattern over all 124 agent definitions returns
**three hits, and all three are false positives**:

- `agents/testing/quality-gate-runner.md:317` — `${cmd:0:50}`, a bash substring
- `agents/coverage-mapper.md:125` — `"2026-02-03T09:00:00"`, an ISO timestamp in a JSON example
- `agents/security/incident-responder.md:110` — "not available at 03:00", prose about an on-call incident

Three findings, zero real. A fence born red with a 100% false-positive rate needs
a whitelist on day one, and **a fence that cries wolf gets whitelisted into
uselessness** — this repository's own conclusion, recorded as decision 6 of plan
00154. More decisively: the invented time did not come from a definition. It came
from the model. Scanning definitions for it searches the wrong haystack.

**Rejecting this is the correct output.** The checkable thing is not the
fingerprint of the lie; it is the presence of the instruction that prevents it.

## What agents are currently told about asserting versus verifying

Grepped all 124 definitions for the "never guess / could not verify / unverified"
family: **21 files carry something in it. 103 do not.**

The 21 are not evenly spread — they cluster in exactly the place the brief
predicted. The adversarial critics already have this discipline, written out
properly. `agents/iron-loop/gate-critic.md:104` heads a whole section:

> ## Degraded input — never guess, never fabricate, never go silent

and at `:196` and `:328` it resolves the hard case the honest way — a finding it
cannot tier is emitted as `important` with what evidence would settle it,
explicitly "Do not drop it, and do not guess." `premortem-critic.md:153` treats
self-congratulating claims as "an unverified CLAIM to verify against code, never
as evidence," and `:262` forbids an empty `blind_spots`.

**That is the behaviour that produced "I could not verify this" instead of a
guess, and it is already written down.** This plan does not invent a discipline.
It generalises one that four agents already prove works, to the 103 that lack it.

## The compliance angle is SEPARATE — read this before assuming overlap

Plan **00089** and this plan touch the word "compliance" and are not the same work.

| | 00089 | this plan (00160) |
|---|---|---|
| **Subject** | what the product's DOCUMENTATION and menu CLAIM about regulatory controls | what an AGENT SAYS about status, on any subject |
| **Defect** | shipped prose asserts enforcement (`four_eyes_gate3` requires two approvers) that no evaluator performs | an agent generated a status line about a subsystem, a schedule and a gate, none of which exist |
| **Fix** | retract the claims; mark unenforced controls `NOT ENFORCED` | tell every agent what it may assert versus must verify first; fence that the instruction is present |
| **Surface** | `docs/`, `README.md`, `cto-chief.md`, the menu prompt | `skills/agent-fragments/`, all agent definitions, `CLAUDE.md` |

**Neither covers the other.** 00089 could ship complete and an agent would still
invent "your session's compliance gate is at 11:15", because that sentence is not
in any document 00089 edits. This plan could ship complete and `INDEPENDENCE.md`
would still contain a false statement about a hook. The compliance subsystem is
the *example* here, not the subject. This plan does not retract a single
compliance claim, and must not.

## What a status line should say instead

The owner's confirmed mapping (from 00151, which builds `src/lib/gate-words.js`):

| the moment | what it IS |
|---|---|
| review → done | nothing is finished until you say so |
| implementation → todo | nothing gets built until you say build it |

A status line is built from **three parts, each traceable to something on disk**:

1. **WHAT the work is** — the plan's TITLE through `humanPlanName(title, slug)`.
   Never a slug, never a filename, never a number.
2. **WHERE it stands** — the `moment` phrasing from `gate-words.js`. Never a gate
   name, never a stage-directory name.
3. **WHAT is waiting on the human** — a count read from disk, or nothing.

So the invented line becomes, when there is data:

> Three plans are waiting on you. Nothing gets built until you say build it.

and when there is not:

> I don't have a count for that — I haven't read the plan directory this session.

**No time appears in either, because nothing in this product is time-scheduled.**
The absence of a clock is not a gap to be filled with a plausible number; it is a
fact to be reflected by saying nothing about time.

### Where the instruction lives: one shared file, not 124

Written once as `skills/agent-fragments/honest-status.md`, referenced by every
definition — the established pattern in this repository
(`no-stub-rule.md`, `async-choice-protocol.md`, `ancestry-read.md`,
`warnings-are-critical.md`), and the pattern
`tests/critic-warnings-are-critical.test.js` already fences. A rule copied into a
hundred files diverges in a hundred directions; a rule referenced from a hundred
files is edited once.

## Implementation Details

### File: `skills/agent-fragments/honest-status.md`
**Action:** CREATE
**Purpose:** The single statement of what an agent may assert, what it must verify first, and what it says when it has neither.
**Change Type:** new shared instruction fragment

Its content, specified so the executor does not invent it:

1. **The assertion rule.** Three bins: *read from disk this turn* (assertable),
   *inferred from what was read* (assertable, labelled as inference), *neither*
   (**not assertable at all**). A status line's every clause falls in bin one or
   bin two.
2. **The absence rule, stated as the load-bearing one.** When asked for status
   and holding no data, the honest output is to say so. Naming what is missing —
   "I haven't read the plan directory this session" — is a complete, useful
   answer. **A fluent sentence with an invented number in it is not.**
3. **Never invent a temporal structure.** Nothing in CTOC is scheduled against a
   wall clock. No status line contains a time of day, a deadline or an
   "at HH:MM". If a duration is genuinely known (a timeout budget), it is named
   as a duration and its source is named.
4. **Never name a subsystem as running without checking it has a caller.** The
   worked example is the incident: "compliance" was announced as active while
   `isControlEnabled` has zero callers in `src/`.
5. **The human's vocabulary.** No gate number, no gate name, no stage-directory
   name, no slug, no plan number, no invented abbreviation. Point at
   `gate-words.js` for the moment phrasings and `humanPlanName` for the work's
   name.
6. **The worked example**, verbatim: the invented line, why each of its three
   clauses is fiction, and the two honest replacements above.

The fragment must contain the literal marker string **`HONEST STATUS`** in a
heading, because the fence matches that marker rather than guessing at English.

---

### File: `src/lib/agent-honesty-scan.js`
**Action:** CREATE
**Purpose:** Census the dispatchable agent definitions and report which ones do not carry the honest-status instruction — failing loudly when it cannot read them.
**Change Type:** new-module

#### Its header states the limit, first

The module header opens with the limit, not the capability, so nobody trusts it
past its edge:

> This scans agent DEFINITIONS. It does NOT and CANNOT check agent OUTPUT.
> A model's prose reaches the human directly — no hook, no compile step, no
> interception point. This module raises the floor on what agents are TOLD.
> It proves nothing about what any agent actually SAID.

#### Exports

- `isDispatchable(content)` → `boolean`
  - True when the definition's YAML frontmatter carries a `name:` key. Shared
    fragments and non-dispatchable includes have none. This is the mechanical
    scope test — not a filename convention, not a hand-kept list.
- `scanAgentFile(absPath)` → `{ available: true, dispatchable, hasFragmentRef, hasMarker } | { available: false, reason }`
  - Never throws. Unreadable, empty, or frontmatter-less files yield
    `available: false` with a reason — **never a passing result**. "I could not
    read it" and "I read it and it complies" are different facts, and a scanner
    that returns the success value for both is this repository's central defect
    class. It would be a particularly stupid one to commit inside a plan about
    agents asserting things they did not verify.
- `censusAgents(root)` → `{ available, reason?, total, dispatchable, missing: string[], scanned: string[] }`
  - `missing` lists dispatchable definitions lacking the reference. If **any**
    file is unavailable, the whole result is `available: false`, naming it.
- `fragmentIsSubstantive(root)` → `{ available, reason?, ok, missingSections: string[] }`
  - The fragment exists, carries the `HONEST STATUS` marker, and covers all six
    required points. A referenced fragment that has been emptied out would
    otherwise pass every reference check while teaching nothing.

#### Non-vacuity is part of the contract

`censusAgents` returns `available: false` when `dispatchable < 100`. There are
124 definitions today, of which nearly all declare `name:`. A census that
suddenly finds four has a broken glob, not a shrunken repository — and it would
otherwise report a clean pass over files it never read. This is the guard that
makes the fence fail loud on input it cannot read.

#### Dependencies
- `path`, `./safe-fs`. No parser needed — YAML frontmatter delimiters and a
  literal marker search are sufficient, and a text scan is honest here in a way
  it was not for 00154, because the target is *documentation text*, not a
  string literal composed at runtime.
- Nothing from `hooks/` or `commands/`.

---

### File: `src/lib/iron-loop-enforcer.js`
**Action:** MODIFY
**Purpose:** Give the scan a live call site, so it is reachable by a human on demand and not only by its own test.
**Change Type:** modify-existing — one new check

Add an `agent-honesty-fence` check, registered in the shape already established
by `false-green-fence` and by 00154's `gate-words-fence` in the same file. It
reports:

- `available: false` → **FAIL**, with the reason. Not "skipped", not "passed".
- `missing` non-empty → FAIL, naming each definition.
- fragment not substantive → FAIL, naming the absent sections.
- otherwise → pass, stating how many definitions were checked.

Without this the scanner is a module proved only by its own test — Operating
Lesson 16, and unforgivable in a plan about agents claiming things they have not
verified.

---

### File: `agents/**/*.md`
**Action:** MODIFY
**Purpose:** Every dispatchable definition references the shared instruction.
**Change Type:** one identical block appended to each — uniform, no per-file judgement

Appended to each definition's operating-principles block:

```markdown
- [`skills/agent-fragments/honest-status.md`](../../skills/agent-fragments/honest-status.md) — assert only what you verified; when you have no data, say you have none. Never invent a time, a deadline, or a subsystem's activity.
```

**Every dispatchable agent, not a curated subset.** Any agent's text can reach the
human; there is no mechanically derivable "reports status" predicate to scope by,
unlike 00154's `{ text, ask, actions }` screen contract which is a real syntactic
shape. A hand-curated list would rot silently and its rot would be invisible.

`agents/coordinator/cto-chief.md` is also declared by plan 00089 — hence the
dependency. The edits do not overlap in region (00089 rewrites the v6.9.27
control claims; this appends to the principles block), but two plans holding one
file is a scheduling conflict, and serializing is the answer.

---

### File: `CLAUDE.md`
**Action:** MODIFY
**Purpose:** Reach the ONE surface no fence can — the session model's own prose.
**Change Type:** one operating lesson

The incident was the session model narrating status, not a subagent returning a
report. **No fence in this plan touches that surface.** The only lever is the
instruction the session model carries in context, which is `CLAUDE.md`. Add
Operating Lesson 17:

> **17. Say only what you verified; when you have no data, say you have none.**
> Asked where something stands, an agent with no data must say so — naming what it
> has not read is a complete answer. A fluent status line with an invented number,
> time or subsystem in it is a fabrication, and it reads exactly like a fact.
> Nothing in CTOC is scheduled against a wall clock, so no status line contains a
> time. Never name a subsystem as running without confirming it has a caller.

Also declared by 00089 — same serialization reasoning as `cto-chief.md`.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `agent-honesty-scan.censusAgents` | `iron-loop-enforcer`'s `agent-honesty-fence` check | the enforcer, reachable from the shipped entry point |
| `agent-honesty-scan.fragmentIsSubstantive` | same check | same |
| `agent-honesty-scan.isDispatchable` | both of the above, plus the ratchet test | same |
| `honest-status.md` | referenced by every dispatchable definition; loaded by the model on dispatch | every agent dispatch |
| `tests/agent-honest-status-fence.test.js` | `npm test` | the gated suite |

## Test Plan

### Tests: `tests/agent-honest-status-fence.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `node:assert/strict`)

Mechanics are proved on fixtures the test writes; the repository-wide assertions
are separate and explicit.

| # | Case | Fixture / action | Assertion |
|---|---|---|---|
| 1 | **the fragment exists and is substantive** | `fragmentIsSubstantive(repoRoot)` | `ok === true`, `missingSections` empty |
| 2 | **the fragment carries the marker** | read the file | contains `HONEST STATUS` |
| 3 | **the fragment states the absence rule** | read the file | matches the no-data-say-so rule and the no-invented-time rule |
| 4 | **an emptied fragment FAILS** | fixture fragment with the heading only | `ok === false`, naming the absent sections — a reference to a hollow file must not pass |
| 5 | **a definition with `name:` is dispatchable** | fixture frontmatter | `isDispatchable === true` |
| 6 | **a fragment file without `name:` is not** | `skills/agent-fragments/no-stub-rule.md` | `isDispatchable === false` — shared includes are correctly out of scope |
| 7 | **a missing reference is reported** | fixture definition with `name:` and no reference | appears in `missing` |
| 8 | **a present reference is not reported** | fixture with the reference line | absent from `missing` |
| 9 | **an unreadable file is UNAVAILABLE, not clean** | a path that does not exist | `available === false` with a reason naming the path; `missing` is NOT an empty passing list |
| 10 | **a file with no frontmatter is UNAVAILABLE, not clean** | fixture of bare prose | `available === false` — the parse-failure case that must never read as compliant |
| 11 | **one unavailable file poisons the census** | fixture root, one good file, one unreadable | `censusAgents` returns `available: false` |
| 12 | **a census that finds too few FAILS** | fixture root with 3 definitions | `available === false`, reason naming the non-vacuity floor — the guard against a broken glob reporting a clean pass |
| 13 | **the real repository is compliant** | `censusAgents(repoRoot)` | `available === true`, `missing` empty, `dispatchable >= 100` — RED before this plan (103 definitions lack it), green after |
| 14 | **the enforcer check fails on a missing reference** | drive `agent-honesty-fence` against a fixture root with one non-compliant definition | the check FAILS and names the file |
| 15 | **the enforcer check fails when the census is unavailable** | force an unreadable definition | the check reports FAILURE, and its message contains neither "passed" nor "skipped" |
| 16 | **the four critics keep their existing discipline** | `gate-critic.md`, `premortem-critic.md`, `red-team-critic.md`, `devils-advocate-critic.md` | each still matches `never guess` / `never fabricate` / `unverified` — proving the generalisation ADDED a floor without flattening the stronger rules that already worked |
| 17 | **`CLAUDE.md` carries the session-model lesson** | read `CLAUDE.md` | contains the no-data-say-so rule — the only assertion covering the surface no fence reaches |
| 18 | **no compliance claim was touched** | `docs/INDEPENDENCE.md`, `cto-chief.md` | byte-identical in the regions plan 00089 owns — proving this plan did not silently do 00089's job |

Case 12 is the one that keeps the fence honest about itself. Case 4 is the one
that stops a hollow fragment passing. Case 16 is what stops a uniform floor
becoming a uniform ceiling. Case 18 is the separation the brief demanded.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown, POSIX-
normalised comparison paths, no shell.

## What this plan does NOT fix

Stated plainly and up front, because a fence whose limits are unstated is trusted
past them — and here the largest limit is the incident's own surface.

1. **It does not fence agent OUTPUT, and no plan can.** The sentence that started
   this went from a model to a terminal. Nothing in this design would have
   blocked it. What this design changes is the instruction the model carries
   *before* it speaks. That is a real reduction in likelihood and **zero
   guarantee**, and anyone reading the fence as a guarantee has misread it.
2. **It cannot detect a fabrication that carries no fingerprint.** A confidently
   wrong sentence about a real subsystem, with no number and no time, passes
   everything here.
3. **It proves a reference, not obedience.** A definition can carry the link and
   its agent can still invent a status line. The fence raises the floor on what
   agents are told; it cannot reach into a generation.
4. **It retracts no compliance claim.** `four_eyes_gate3` still requires nothing,
   the audit chain still hashes nothing, and `INDEPENDENCE.md` still contains a
   false sentence about a hook. That is plan 00089's subject and this plan must
   not touch it.
5. **It wires no compliance control.** `isControlEnabled` still has zero callers
   in `src/` after this ships. Nothing here changes that; the fix is only that no
   agent should announce otherwise.
6. **It does not fence skills.** 427 skill files also instruct models. Scope was
   held to agent definitions because that is where dispatch loads from; skills
   are a real, unclosed gap.
7. **It does not check the wording quality of any status line.** A fence can
   prove a marker is present. It cannot prove a sentence is clear. That stays a
   human judgement, and it should.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/agent-honest-status-fence.test.js` in full, run ONLY that file, record the red output verbatim. Case 13 MUST be red today (103 of 124 definitions carry no such instruction) and case 17 MUST be red (`CLAUDE.md` has 16 lessons). Cases 1–4 are red because the fragment does not exist. Cases 5–12, 14, 15 and 18 must be GREEN from the start — they prove the scanner's own mechanics and the separation from 00089, and any of them red at the start means the fixture is wrong, not the product. Case 16 must be green from the start; if it is red, the four critics do NOT already carry the discipline this plan claims to generalise, and that finding invalidates a premise — STOP and report it rather than proceeding.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 9: PREPARE — re-read from disk, because this plan's counts are claims: re-run the `name:` frontmatter census and record the true dispatchable count; re-run the "never guess" grep and record which definitions already comply, so the append does not duplicate an existing rule; re-read `iron-loop-enforcer.js` to copy the `false-green-fence` registration shape exactly. Confirm 00154 has landed (`src/lib/human-facing-scan.js` and `src/lib/gate-words.js` exist) — if not, STOP: the status-line vocabulary this fragment points at does not exist yet. Confirm 00089 has landed, or that `cto-chief.md` and `CLAUDE.md` are not held by an in-flight plan. **Where this plan's numbers disagree with disk, DISK WINS — record every discrepancy.**
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
  - `skills/agent-fragments/honest-status.md` — the six points, the marker, the worked example.
  - `src/lib/agent-honesty-scan.js` — the census, the non-vacuity floor, the limit in the header.
  - `src/lib/iron-loop-enforcer.js` — the `agent-honesty-fence` check.
  - `agents/**/*.md` — the identical reference line, appended to every dispatchable definition; definitions already carrying a stronger rule keep it AND gain the reference.
  - `CLAUDE.md` — Operating Lesson 17.
### Step 11: REVIEW — confirm no code path returns an empty `missing` list when a file could not be read. Confirm the enforcer treats unavailable as FAILURE. Confirm the non-vacuity floor fires before any pass is reported. Confirm the four critics' existing sections were ADDED TO, never replaced — a uniform floor must not overwrite a stronger rule. Read the fragment back and ask: would an agent holding no data, asked for status, now know that saying "I have none" is the correct answer? If not, the fragment failed at its one job.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 12: OPTIMIZE — 124 files, one read each, one frontmatter slice and one literal search per file. Read each file once; share the fragment content across all checks; no regex backtracking on file-sized input.
### Step 13: SECURE — the scan reads files beneath the project root only. Confirm every path is resolved and confined under `root` before reading, so a crafted glob cannot escape. Confirm findings pass through a control-character strip before printing, since a definition's text reaches a terminal. Confirm no definition content beyond a file path and a boolean enters the output — an agent definition may quote a credential in an example, and the census must never echo file bodies.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 14: VERIFY — run the new test plus `tests/agent-modernization.test.js`, `tests/critic-warnings-are-critical.test.js`, `tests/agent-shared-not-dispatchable.test.js`, `tests/agent-contract-load.test.js`, `tests/gate-words.test.js` and `tests/compliance-claims-match-code.test.js`, then the full gated run `npm test`. Lint the changed JavaScript. Do not lower the coverage floor. No git operations.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).
### Step 15: DOCUMENT — the module header carries the limit VERBATIM and FIRST: this checks definitions, never output, and proves nothing about what any agent said. Add the fence to `CLAUDE.md`'s quality section beside the false-green fence. Update the documented agent-file count if the census disagrees with it.
### Step 16: FINAL-REVIEW — report the true census from Step 9, the verbatim red and green evidence, the seven limits above, and every decision taken under ambiguity. State explicitly whether case 16 was green, since a red there would have invalidated the plan's premise.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).

## Decisions Taken Under Ambiguity

1. **The output-pattern scanner is REJECTED, on measurement rather than taste.**
   A time-of-day scan over all 124 definitions returns three hits, all false
   positives (a bash substring, an ISO timestamp, prose about a 3am incident).
   It would need a whitelist on day one, and the defect it hunts is not in the
   definitions anyway. Proposing a checker that cannot work would have been the
   same failure as the incident: a plausible artifact with nothing behind it.
2. **Definitions are fenced; output is declared unfenceable, loudly.** The
   session model's prose passes through no hook and no compile step. Rather than
   invent an interception point, the plan states the limit in the module header,
   in the plan, and in the "does NOT fix" list, and reaches that surface the only
   way available — an instruction in `CLAUDE.md`.
3. **Every dispatchable definition, not a curated subset.** There is no
   mechanically derivable "reports status" predicate — unlike 00154, whose
   `{ text, ask, actions }` screen contract is a real syntactic shape. A curated
   list would rot silently. `name:` in frontmatter is the mechanical, non-rotting
   scope test, and it correctly excludes the shared fragments.
4. **The scan is a text scan, not a parse — the opposite of 00154's call, on
   purpose.** 00154 must parse because its target is a string literal composed at
   runtime with no digit in its source text. Here the target is documentation
   text containing a literal marker. Parsing Markdown would add a dependency and
   a failure mode to answer a question a substring already answers exactly.
5. **`available` is in the return type, not an exception.** A census returning an
   empty `missing` list when it could not read its input is this repository's
   central defect class. The type makes that unrepresentable.
6. **A non-vacuity floor of 100.** There are 124 definitions. A census finding
   fewer has a broken glob, and would otherwise report a clean pass over files it
   never read — the exact shape being fenced. The floor is deliberately well
   below the true count so ordinary growth and pruning never trip it.
7. **The fragment is checked for substance, not just existence.** A referenced
   file that has been emptied passes every reference check while teaching
   nothing. Case 4 makes a hollow fragment fail.
8. **The four critics' stronger rules are preserved and asserted.** Case 16 pins
   them. Generalising a floor must never flatten what already works; that would
   trade a real discipline for a uniform one.
9. **This plan retracts no compliance claim, and case 18 proves it.** The
   temptation was to fix the false `INDEPENDENCE.md` sentence while here. That is
   00089's subject; two plans editing one sentence is how both get it wrong.
10. **`depends_on` names 00154 and 00089 for mechanical reasons, not politeness.**
    The fragment points at `gate-words.js`, which 00154's chain builds — pointing
    at a file that does not exist would be its own invented claim. And 00089 holds
    `cto-chief.md` and `CLAUDE.md`, both of which this plan appends to; two plans
    holding one file is a scheduling conflict, and serializing is the answer.
11. **The wiring is in THIS plan, not a follow-up.** Shipping a scanner reachable
    only from its own test, inside a plan about agents asserting things they never
    verified, would be self-refuting.

### Discrepancies found at execution — DISK WON (recorded per Step 9/16)

12. **CLAUDE.md already had a lesson 17, so the new lesson is 18 — not 17 as the
    plan claimed.** The plan states "CLAUDE.md has 16 lessons" and predicts case 17
    would be red on that basis. On disk, CLAUDE.md carried **17** lessons: a lesson
    17 ("A foregone answer is not a question — presenting it as a choice is
    manipulation") was added since this plan was written. The honest-status lesson
    was therefore added as **Operating Lesson 18**. Case 17 of the test does not
    count lessons — it asserts the no-data-say-so rule text is present — so it was
    red before and green after regardless. No number was overwritten.
13. **The clean enforcer verdict is SILENT, not "stating how many checked".** The
    plan text says a clean pass should state how many definitions were checked. On
    disk, every sibling fence (`false-green-fence`, `gate-words-fence`) returns a
    bare `CLEAN()` with no message, and `checkAllInvariants` records any clean
    verdict carrying a message as an informational finding — today only
    `plan-counts` is info. Emitting a count on every run would add permanent noise
    and break that convention, so `checkAgentHonestyFence` returns silent `CLEAN()`.
    Consistency with the established shape won.
14. **The "unavailable file" fixtures use a no-frontmatter file, not chmod.** Cases
    10/11/15 need an "unavailable" definition. A permission-based unreadable file is
    not cross-platform (no-op on Windows, and root bypasses it), which would make the
    test lie on those platforms. A file with no YAML frontmatter is deterministically
    `available:false` everywhere, so it is the unavailable fixture. This matches the
    scanner's real contract: "no frontmatter" is one of its unavailable reasons.
15. **Four extra enforcer sub-cases (15b–15e) were added for branch coverage.** The
    plan named enforcer cases 14 and 15. `checkAgentHonestyFence` has six branches
    (not-a-tree, fragment-unavailable, fragment-hollow, census-unavailable,
    census-missing, clean); leaving three uncovered would sink the 99% src floor.
    Cases 15b (fragment absent), 15c (fragment hollow), 15d (no agents dir → clean),
    and 15e (real repo → clean) cover the rest. No branch is proved only by its
    own module's test.
16. **The reference is appended under a uniform `## Honest status (shared rule)`
    heading at end-of-file of every dispatchable definition.** All 124 agents carry
    `name:` in frontmatter and none previously referenced the fragment, so all 124
    received the identical block — no per-file judgement, no curated subset. The
    relative link target is computed per file (115 at depth two → `../../`, 9 at
    depth three → `../../../`).
