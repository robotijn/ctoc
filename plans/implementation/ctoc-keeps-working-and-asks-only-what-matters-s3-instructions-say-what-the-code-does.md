---
title: "The instructions and rules say what the code now does, and Step 7 stops early"
type: implementation
created: 2026-10-07
priority: high
effort: medium
parent_plan: ctoc-keeps-working-and-asks-only-what-matters
depends_on: ctoc-keeps-working-and-asks-only-what-matters-s2-plans-cross-on-their-evidence, claude-md-gets-small-and-keeps-every-rule
files:
  - src/commands/start.md
  - agents/iron-loop/iron-loop-executor.md
  - agents/iron-loop/iron-loop-critic.md
  - agents/coordinator/cto-chief.md
  - CLAUDE.md
  - .ctoc/templates/operating-lessons.md
  - .ctoc/templates/CLAUDE.md.template
  - docs/OPERATING_LESSONS.md
  - docs/PROJECT_REFERENCE.md
  - docs/IRON_LOOP.md
  - docs/ENFORCEMENT.md
  - tests/fixtures/claude-md-rule-inventory.json
---

# The instructions and rules say what the code now does, and Step 7 stops early

Slice 3 of 3 of `plans/functional/ctoc-keeps-working-and-asks-only-what-matters.md`. The
specification, criteria, risks and decisions below are copied from that plan; only the
slicing notes under "Decisions Taken Under Ambiguity" are new.

## What the owner asked

> "i am trying to hide the hooks so the llm thinks and ask usefull questions to the user do
> not bother the user with gates only with questions of high uncertainty or huge importance
> (like tech stack or algorithms)" — and — "optimize the shit out of ctoc" (2026-10-06)

## Problem statement

After slices 1 and 2, the code moves plans on their evidence and asks the human only weighty
questions, but the menu instructions, the agents, `CLAUDE.md` and the docs still describe
every crossing as the human's approval. And item 6 of the parent:

6. **The Step 7 loop is described as ten rounds and nothing runs rounds.** `refineLoop` in
   `src/lib/iron-loop.js` ignores `maxRounds` and always reports `rounds: 1`; no refinement
   record exists (`.ctoc/loops/` is absent). The records show 4 integrator runs (0.7 hours) in
   October against 22 build runs, and 17 integrator runs (1.9 hours, none in this repository)
   in September. The critic ran 34 times (4.7 hours) in October, shared with Steps 4, 11
   and 16. So the records cannot say how many rounds ran per plan; on average it was fewer
   than one per built plan (inferred). The text promises ten.

## Technical approach

**Step 7.** The loop stops at the first round that raises no finding an earlier round of
this plan had not already raised, and after three rounds at most. Text only; no code runs
rounds.

Every instruction surface and rule that describes a crossing is rewritten to say what the
code does; every rule sentence that changes keeps its old words through the rule
inventory's own mechanism, so no rule disappears.

## Specification

- `src/commands/start.md`: COMPLETION step 1 becomes
  `menu task complete <id> --continue --summary "…"` (the session's call; the build agent's
  own call stays without the flag); step 3 says `promote[]` also carries builds this
  completion started and planner tasks for plans that just moved on; new paragraph: a screen
  from `stream approve` or `stream answer` may carry `promote[]` — launch each the same way,
  without asking; a promoted `plan` task whose plan is in `plans/implementation/` is the
  implementation-planner's (brief: decompose into slices, write each slice's questions to the
  quarantine as the last act); the functional-plan approval exception says the planner
  arrives through `promote[]` and is never dispatched twice. Rewrite "Human gates stay
  foreground", Rule 4 and Rule 13 so they say what the code does — agents never cross a
  gate and never write an approval; the menu's own code moves a plan on recorded evidence
  and records it as evidence; only a question that needs the human stops the plan — keeping
  the phrases `tests/menu-protocol.test.js` holds ("never auto-cross", "waiting for the
  human's OK", `--gate`, `--next`, `promote`, `nextRunnable`, the four transitions, the
  section headings). The "generated only when the human asks" section adds that the agent
  writing a plan drops its questions itself; the four-lens fleet stays on request.
- `agents/iron-loop/iron-loop-executor.md`: box step 5 and the Output example say the built
  work moves to done on its recorded checks unless a question needs the human.
- `agents/iron-loop/iron-loop-critic.md` (the "max rounds (10)" sentence) and
  `agents/coordinator/cto-chief.md` (the Step 7 paragraph and the K-budget table's scope):
  "The loop stops at the first round that raises no finding an earlier round of this plan
  had not already raised, and after three rounds at most. What is still open becomes a
  decision taken under ambiguity, or a question when the classification sends it to the
  human."
- `CLAUDE.md`: Critical Rule 1 — heading "1. Gates (4 points where a plan moves on)";
  vision to functional is the human's; the other three cross when the recorded evidence is
  enough and no question needs him, recorded as evidence, never as his approval; "NEVER
  cross a gate by hand: no agent moves a plan file or writes an approval"; the "move to done"
  sentence refuses a move by hand. Step table row 7 Agent cell: `iron-loop-critic (opus) then
  iron-loop-integrator+iron-loop-critic (until a round adds nothing new, at most three)` (no
  new hyphenated word — `tests/registry-integrity.test.js` parses this column); the three
  "User approves …" phase cells say the plan moves on its evidence. Lesson 2 and the
  methodology line in the managed lessons block (identical in
  `.ctoc/templates/operating-lessons.md`). The "Questions" section names
  `isBlockingQuestion` as the rule. Stays at or under 15,000 bytes.
- `.ctoc/templates/CLAUDE.md.template`: the four "Human Gate N: User approves …" lines say
  which moment the human decides and which move on evidence.
- `docs/PROJECT_REFERENCE.md` row 7; `docs/IRON_LOOP.md` lines 49, 100–102, 185, 277, 482,
  556, 732; `docs/ENFORCEMENT.md` — the streaming-questions heading and one paragraph on
  the review-to-done evidence crossing.
- `tests/fixtures/claude-md-rule-inventory.json` and `docs/OPERATING_LESSONS.md`: every
  inventory-held sentence this slice rewrites (at least r0040, r0041, r0042, r0099, r0117 and
  the streaming-questions heading) gets `new` text and `old_home: docs/OPERATING_LESSONS.md`,
  and its old words go verbatim into `docs/OPERATING_LESSONS.md` under "Replaced on the
  owner's instruction of 2026-10-06" — the test's own mechanism; no rule disappears.

## Test plan

Slice 3 has no code; its checks are the three existing structural tests named in the first
acceptance criterion: `tests/claude-md-keeps-every-rule.test.js`,
`tests/menu-protocol.test.js`, `tests/registry-integrity.test.js`.

## Wiring — the live call sites

- `src/commands/start.md` is the instruction surface the session executes for `/ctoc:start`;
  its COMPLETION step 1 is what makes the session pass `--continue`, the live trigger for
  slice 2's `continueAfterCrossing` on completions.
- The three agent files are live on their next dispatch by the CTO Chief.
- `CLAUDE.md` and `.ctoc/templates/operating-lessons.md` are loaded into every session in this
  repository and, through `/ctoc:update`, into users' projects; `.ctoc/templates/CLAUDE.md.template`
  is what project initialization writes.

## Acceptance criteria

From the parent table (criteria 9 and 10):

- [ ] Every instruction surface and `CLAUDE.md` says what the code does; no rule is lost — `tests/claude-md-keeps-every-rule.test.js`, `tests/menu-protocol.test.js`, `tests/registry-integrity.test.js` green.
- [ ] Step 7 text: stop at the first round with no new finding, three at most — Step 16 review of the four files.

## Risks

| Risk | Mitigation |
|---|---|
| Hooks are off, so any agent with Write can write a passing check record or a ledger entry | Handled by `the-approval-and-check-records-are-write-protected` (the owner's decision of 2026-10-07), which this slice reaches through slices 1 and 2. This slice's text must not claim more protection than that plan provides: its Risks list what it cannot catch |
| Queued agent-improvement slices rewrite the same agent files (the critic, the executor, the CTO Chief) | The scheduler serializes by file; Step 11 checks that whichever lands second keeps the other's text |
| `docs/ENFORCEMENT.md` is also edited by `the-approval-and-check-records-are-write-protected` (an added sentence and section on the records protection) | That plan builds first. This slice edits only the streaming-questions heading and adds the review-to-done paragraph, and keeps the protection's text |

## Decisions Taken Under Ambiguity

Copied from the parent:

7. **Three rounds at most for Step 7**, the critical tier of the coordinator's existing table.

New, from slicing:

10. **The slice keeps the parent's boundary** (twelve text files), because the brief said to
    cut along the slices the parent already defines. Every file is text, and the checks are
    the three structural tests.
11. **`claude-md-gets-small-and-keeps-every-rule` stays in `depends_on`** as the parent's
    table lists it. It is already in `plans/done/`, so it blocks nothing.
12. **The test-file count in `CLAUDE.md` is updated by slice 2,** which creates the test file
    (a plan that creates a counted file must declare `CLAUDE.md`). This slice only checks the
    count still matches.
13. **"The four files" of the Step 7 criterion are read as the four places this
    specification gives Step 7 text:** `agents/iron-loop/iron-loop-critic.md`,
    `agents/coordinator/cto-chief.md`, row 7 of `CLAUDE.md` and row 7 of
    `docs/PROJECT_REFERENCE.md`. The parent does not name them. Step 16 also reviews any
    `docs/IRON_LOOP.md` line of this slice that carries Step 7 text, so nothing is missed if
    that reading is too narrow.

## Execution Plan

### Step 8: TEST
- [ ] Slice 3 has no code. Run `node --test tests/claude-md-keeps-every-rule.test.js tests/menu-protocol.test.js tests/registry-integrity.test.js` before any edit and record them green; they are the checks this slice must keep green.

### Step 9: PREPARE
- [ ] Confirm `claude-md-gets-small-and-keeps-every-rule` has landed (slice 3 edits its files) — it is in `plans/done/`.
- [ ] Confirm slice 2 is built, so the text describes code that exists.
- [ ] Record before-numbers: false-green scan count, dead-export count, unreachable-file count, `CLAUDE.md` bytes.

### Step 10: IMPLEMENT
- [ ] `src/commands/start.md`, the three agent files, `CLAUDE.md`, `.ctoc/templates/operating-lessons.md`, `.ctoc/templates/CLAUDE.md.template`, the four docs, the rule inventory, as specified.
- [ ] Check that the test-file count in `CLAUDE.md` matches the files on disk (slice 2 updated it).

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic`: no instruction surface contradicts the code; vision to functional is still the human's in every surface; whichever queued agent-improvement slice lands second keeps the other's text.

### Step 12: OPTIMIZE
- [ ] `CLAUDE.md` stays at or under 15,000 bytes; no sentence repeats one already moved to a doc.

### Step 13: SECURE
- [ ] Dispatch `security-scanner` over the changed text: no instruction tells an agent to write an approval or check record, move a plan file, or cross a gate itself.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [ ] False-green, dead-export and unreachable counts not higher than the Step 9 numbers; `CLAUDE.md` at or under 15,000 bytes.

### Step 15: DOCUMENT
- [ ] `docs/ENFORCEMENT.md` describes the evidence crossing at done and the classification rule.

### Step 16: FINAL-REVIEW
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria, including the review of the Step 7 text in the four files of Decision 13 and in any `docs/IRON_LOOP.md` line of this slice that carries it.
- [ ] Rerun `node .ctoc/audit/speed-and-size/benchmarks/pipeline-time.js --from <release date>` after a week of use and compare "sitting finished until resumed" with the 95.2 hours of the parent.
