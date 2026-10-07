---
iron_loop_verdict: true
iron_loop: true
title: "The instructions say what the code now does, Step 7 stops early, and a finished build keeps the work moving"
type: implementation
created: 2026-10-07
priority: high
effort: large
parent_plan: ctoc-keeps-working-and-asks-only-what-matters
depends_on: ctoc-keeps-working-and-asks-only-what-matters-s2-plans-cross-on-their-evidence, claude-md-gets-small-and-keeps-every-rule
files:
  # The menu's instructions, and the one code change without which their completion step stays untrue (Decision 14)
  - src/commands/start.md
  - src/lib/menu-screens.js
  - tests/plans-keep-moving-without-the-human.test.js
  # Agents with no compaction inventory
  - agents/iron-loop/iron-loop-executor.md
  - agents/iron-loop/iron-loop-critic.md
  # Agents under a compaction inventory: the agent, its inventory (replaced orders, ceiling correction), its inventory test (touched only if an order floor must move)
  - agents/coordinator/cto-chief.md
  - tests/compaction-eval/cto-chief/rule-inventory.json
  - tests/cto-chief-compaction.test.js
  - agents/iron-loop/gate-critic.md
  - tests/compaction-eval/gate-critic/rule-inventory.json
  - tests/gate-critic-compaction.test.js
  - agents/iron-loop/premortem-critic.md
  - tests/compaction-eval/premortem-critic/rule-inventory.json
  - tests/premortem-critic-rule-inventory.test.js
  - agents/iron-loop/devils-advocate-critic.md
  - tests/compaction-eval/devils-advocate-critic/rule-inventory.json
  - tests/devils-advocate-critic-compaction.test.js
  - agents/iron-loop/red-team-critic.md
  - tests/compaction-eval/red-team-critic/rule-inventory.json
  - tests/red-team-critic-compaction.test.js
  # The rules file, its lessons source, the project template, the rule inventory and the file that keeps every replaced rule word for word
  - CLAUDE.md
  - .ctoc/templates/operating-lessons.md
  - .ctoc/templates/CLAUDE.md.template
  - tests/fixtures/claude-md-rule-inventory.json
  - docs/OPERATING_LESSONS.md
  # The docs that describe crossings, questions or Step 7
  - docs/PROJECT_REFERENCE.md
  - docs/IRON_LOOP.md
  - docs/ENFORCEMENT.md
  - docs/AGENT_ARCHITECTURE.md
  # Added 2026-10-07 by the session after the end-to-end run: a held plan with no question file is shown as ready to finish without saying it is held
  - src/lib/streaming-gate.js
approved_by: human
approved_at: 2026-10-07T16:55:17.940Z
gate_crossed: implementation → todo
---

# The instructions say what the code now does, Step 7 stops early, and a finished build keeps the work moving

Slice 3 of 3 of `plans/functional/ctoc-keeps-working-and-asks-only-what-matters.md`.
Refreshed on 2026-10-07 against `main` after slices 1 and 2 shipped as v6.14.119 (commit
547bd62c). Every file named here was re-read as it stands on that commit; the specification
changes only what is still untrue there. Line numbers are as of that commit — the builder
follows the text when a line has moved.

## What the owner asked

> "i am trying to hide the hooks so the llm thinks and ask usefull questions to the user do
> not bother the user with gates only with questions of high uncertainty or huge importance
> (like tech stack or algorithms)" — and — "optimize the shit out of ctoc" (2026-10-06)

Owner decisions of 2026-10-07, built by slices 1 and 2 and described here: the independent
gate critic assigns every question's topic and adds a question for every weighty choice the
author left unasked; an author's question file moves nothing until the gate critic has
classified it, and is never shown to the owner unchecked; a Hold is CTOC's own question
(`ctoc-hold`), recorded in the write-protected answers log and released only by the owner;
the one loaded hook refuses the menu's answering, approving and crossing routes to any
background agent.

## Problem statement — what is still untrue on main

Verified by reading the code and the files on 547bd62c (nothing below was run):

1. **The work does not keep moving after a build.** `continueAfterCrossing` — the code that
   finishes a built plan on its checks and starts the next one — runs on the session's
   `menu task complete <id> --continue`, but `src/commands/start.md` COMPLETION step 1 (line
   126) never passes `--continue`. Adding the flag alone does not fix it: the build agent
   completes its own task first (`agents/iron-loop/iron-loop-executor.md`, "Completing a
   plan"), and a second `menu task complete` on a `done` task throws `task-registry: invalid
   transition done → done` (`taskComplete`, `src/lib/menu-screens.js` line 2362;
   `VALID_TRANSITIONS.done` is empty in `src/lib/task-registry.js`). So after every build no
   continuation runs: the built plan does not finish on its checks and the next approved plan
   does not start until some other answer or approval happens — the idle time the parent
   measured (95.2 hours in six days, 52 of 58 resumes build agents).
2. **The instruction surfaces still say every gate is the human's.** `CLAUDE.md` Critical
   Rule 1, its step table, lesson 2 and the methodology line; `start.md` "Human gates stay
   foreground", Rules 4, 5 and 13 and the classification of `stream approve`; the build
   agent's refusal and report; the CTO Chief's "final approver" invariant, gate table,
   monitoring duties (which would flag every plan that crossed on evidence as a violation)
   and its Step 4, 7 and 16 outcomes; the gate critic's rule 5, attestation section and
   anti-scope rows; the three prosecution lens critics ("the human's answer is the gate
   crossing"); `docs/ENFORCEMENT.md`, `docs/PROJECT_REFERENCE.md`, `docs/IRON_LOOP.md`,
   `docs/AGENT_ARCHITECTURE.md` and the project template. The code now crosses
   functional → implementation and implementation → todo on sufficiency (also when the
   default screen opens), and review → done on the recorded checks inside the continuation;
   only vision → functional is always the human's.
3. **The question contract on the menu's instructions.** `start.md`'s section is headed
   "generated only when the human asks", though the agent that writes a plan now writes its
   questions and the gate critic classifies them on a task the menu queues itself; the list
   of screens that carry `promote[]` omits `stream check`; nothing says which agent a
   promoted `plan` task is for; and the functional-plan approval exception would dispatch
   the implementation planner a second time when `stream approve` already queued it.
4. **The Step 7 loop is described as ten rounds and nothing runs rounds** (item 6 of the
   parent, unchanged). `refineLoop` ignores `maxRounds`; no refinement record exists.

Already true on main and not touched: the question sections of the vision advisor, the
product owner and the implementation planner (slice 1); the gate critic's classification
section and omission duty (slice 2); `start.md`'s `classify` paragraph and its "Every screen
that carries `promote[]`" paragraph (slice 2, extended here); `docs/ENFORCEMENT.md`'s section
on the one loaded hook (slice 2); `CLAUDE.md`'s "Questions" section; the advocate critic.

## Technical approach

- **One code change.** `menu task complete <id> --continue` on a task already `done` runs
  only the continuation. The session's completion call then always carries `--continue`, and
  the build agent's own call stays as it is. No crossing rule changes.
- **Step 7.** The loop stops at the first round that raises no finding an earlier round of
  this plan had not already raised, and after three rounds at most. What is still open
  becomes a decision taken under ambiguity, or a question when the classification sends it
  to the human. Text only.
- **Every other untrue sentence is rewritten to say what the code does.** A sentence a test
  holds word for word is replaced through that test's own mechanism, so no rule disappears:
  in `tests/fixtures/claude-md-rule-inventory.json` a `new` text with an `old_home`, and the
  old words verbatim in `docs/OPERATING_LESSONS.md`; in a compaction inventory a `replaced`
  order with its `replaced_by` record naming this plan.

## Specification

### 1. `src/lib/menu-screens.js` (MODIFY) — `taskComplete(root, rest)`

Right after the task is found (before the `canTransition` check): when `p.continue === true`
and `task.status === 'done'`, run `const cont = continueAfterCrossing(root)` and return
`{ ok: true, taskId: id, status: 'done', alreadyCompleted: true, completion: null, text:
\`Task ${id} was already completed by its agent\` + continuationText(cont), promote:
cont.promote }`, plus `quarantined` when non-empty, exactly as the `--continue` branch below
does. Nothing is written to the task: `--summary`, `--gate`, `--next` and `--b64` are ignored
on this path, so the agent's verify-derived result stands. Every other status, and a `done`
task without `--continue`, behaves exactly as today (a `done` task without the flag still
throws). The JSDoc says so. The hook (`src/hooks/protect-records.js`) already refuses
`--continue` to any background agent, so only the main session reaches this branch.

### 2. `src/commands/start.md` (MODIFY)

Phrases tests hold and that must survive: the six subsection headings and "Two-Plane
Protocol — NAV vs WORK" (`tests/menu-protocol.test.js`); in "Human gates stay foreground"
a "never … cross" phrase, "waiting for the human's OK", `--gate`, `--next`, and no
"Gate N ready"; Rule 4 starting `4. **Four human gates` with all four transitions written
with `->` or `→`; Rule 13 starting `13. **Completions pull` with `promote`, `nextRunnable`
and "never auto-cross"; "explicit human action" (`tests/menu-task-wiring.test.js`). No new
text may carry a gate-number output instruction (`tests/instruction-surfaces-say-the-moment.test.js`).

- **Classification item 1** (lines 88–91): the parenthetical "(Gate 4 stays sacred: only a
  human-answered reply crosses, never a background task)" becomes "(Rule 4: no background
  task ever crosses a gate)".
- **Classification item 2, the exception** (lines 95–97) becomes: a gate-approve on a
  functional plan (Gate 1) has one autonomous follow-on, the `implementation-planner`.
  Through `stream approve` its `plan` task comes back in the screen's `promote[]`: launch
  that one and add none. Through `claude:approve`, which returns no `promote[]`, run the
  foreground approve, then dispatch `implementation-planner` as **WORK**. Never dispatch it
  twice for one plan.
- **COMPLETION step 1** (line 126) becomes `menu task complete <id> --continue --summary "…"
  [--gate N] [--next <navroute>]` (the existing `claude:` rejection and the `menu task fail`
  half unchanged), plus: your call always carries `--continue`, which runs the menu's
  continuation — plans whose recorded evidence is enough move on, a built plan whose checks
  passed finishes, planners and the gate critic's classifications are queued, approved plans
  start building. A build agent completes its own task with `menu task complete <id>` and no
  flag (the only form a background agent may run); your `--continue` call on that same task
  then runs only the continuation. Never put `--continue` in an agent's brief.
- **"Every screen that carries `promote[]`"** (line 130): the list becomes `stream answer`,
  `stream approve`, `stream check` and `menu task complete <id> --continue`. Add one sentence:
  a promoted `plan` task whose plan is in `plans/implementation/` is the
  `implementation-planner`'s — brief it with the task id and the plan path; it decomposes the
  plan into slices and, as its last act, writes each slice's questions to the waiting folder
  (its own agent file says how).
- **"Foreground status plane" shapes** (lines 143–147): add "**Finished on its checks:**
  "<feature> finished on its checks — no question needed you.""
- **"`menu task complete` on an `implement` task IS the plan completion"** (lines 155–173):
  after the `{ ok: true, completion: { ran: true, … } }` bullet, add: on the session's
  `--continue` call — the same call, or the later one when the build agent completed its own
  task — a plan whose checks passed moves on to done when no question needs the human and
  nothing holds it; the response text names it under "finished on their checks"; say so. A
  plan whose checks failed stays in review.
- **"Human gates stay foreground"** (lines 209–219), heading kept, body rewritten: no
  background task or agent ever crosses a gate or writes an approval. Vision → functional is
  crossed only by the human's own approve. The other three are crossed only by the menu's own
  code — when the default screen opens (the two pre-build crossings), and on the session's
  `menu task complete <id> --continue`, `stream answer` and `stream approve` — when the
  recorded evidence is enough and no question needs the human, recorded as evidence, never as
  his approval; or by his own approve. A background agent that reaches a point where the human
  must decide STOPS, reports that the work is waiting for the human's OK in plain-moment words
  (never a gate number — the existing `plain-gate-words.md` link), plus a nav route, and
  becomes a waiting-for-your-OK inbox item. A completion records the stop with the `--gate N`
  flag, and any `--next` route is navigation-only. The session and its agents never
  auto-cross a gate: no `--next`, no promotion and no file move performs a transition; only
  the menu's code does.
- **"Streaming gate questions"** (lines 221–230): heading becomes "Streaming gate questions —
  written with the plan, the fleet only on request". The first paragraph keeps "Nothing is
  generated when the menu opens, and the human never waits for a critique" and says: a plan's
  questions are written by the agent that writes the plan, as its last act, into the waiting
  folder; an author's file moves nothing until the gate critic classifies it (the `classify`
  paragraph below); while it waits, the screen says so and offers "Check its questions"
  (`stream check {ref}`), which queues that same task and returns it in `promote[]`, and never
  shows the author's questions to the human; the adversarial four-lens fleet runs only when
  the human ASKS ("Generate its questions"). The rest of the section is unchanged.
- **Rule 4** (line 392) becomes: `4. **Four human gates** (Gate 0–3, per CLAUDE.md's Critical
  Rule 1): vision->functional (Gate 0) is crossed only by the human's own approve;
  functional->implementation (Gate 1), implementation->todo (Gate 2) and review->done (Gate 3)
  are crossed by the menu's own code on recorded evidence when no question needs him —
  recorded as evidence, never as his approval — or by his approve. No background task ever
  crosses one.`
- **Rule 5** (line 393): "a human gate ALWAYS requires an explicit human action" becomes "an
  approve ALWAYS requires an explicit human action"; "The human crosses every gate; the model
  never crosses one for them." becomes "The model never crosses a gate for the human; only his
  approve or the menu's own crossing on recorded evidence does."
- **Rule 13** (line 406) becomes: `13. **Completions pull and promote via the scheduler; only
  the menu's code crosses a gate.**` A completion turn calls `menu task complete <id>
  --continue` (or `menu task fail`), emits ONE compact pull-based inbox notice without
  hijacking the current screen, and promotes ONLY the tasks the response returns in
  `promote[]` (the scheduler's `nextRunnable` set, plus the planners, classifications and
  builds the continuation started) — dispatching each as background work. The session and its
  agents never auto-cross a gate: a plan crosses only in the menu's own code on recorded
  evidence, or by the human's approve; a task that needs the human becomes a
  waiting-for-your-OK inbox item (Rule 4).

### 3. `agents/iron-loop/iron-loop-executor.md` (MODIFY; no compaction inventory)

- Rule 4 (lines 92–113): the table's "Why" cells "Human gate 1/2/3" become "Gate 1/2/3 —
  only the menu crosses it"; "If asked to cross a human gate, REFUSE:" becomes "If asked to
  cross a gate, REFUSE:"; the refusal line becomes "⛔ CANNOT COMPLY - Only the menu crosses
  this gate, on recorded evidence or the user's approval."
- Execution-flow box, step 5: add, inside the box at its width, that the session then
  continues: a plan whose checks passed finishes unless a question needs the human.
- "Completing a plan", first bullet (lines 201–202): "→ done; the plan is in review with
  passing evidence. When the session continues after your run, it moves on to done on those
  checks unless a question needs the human; you never move it."
- Output example (line 314): "It finishes on its recorded checks when the session
  continues, unless a question needs the human."

### 4. `agents/iron-loop/iron-loop-critic.md` (MODIFY; no compaction inventory)

Line 211 becomes the parent's sentence: "The loop stops at the first round that raises no
finding an earlier round of this plan had not already raised, and after three rounds at most.
What is still open becomes a decision taken under ambiguity, or a question when the
classification sends it to the human."

### 5. `agents/coordinator/cto-chief.md` (MODIFY; compaction inventory)

Each change replaces the named order; proposed wording below, final wording recorded as the
order's `new_anchors`. No new text says "User outcome: Gate N".

- Invariant 3 (line 120; R-043, R-044): "3. **Final review**: you own Step 16 (FINAL-REVIEW)
  and verify all 14 quality dimensions before a plan's completion. Review → done then crosses
  in the menu's own code on the recorded checks, or on the human's approval when a question
  needs him — never on your approval, and you never write one."
- The fleet paragraph (line 174; R-107, R-108): "It runs in the BACKGROUND, only when the
  human asks for that plan's critique, so he never waits: each critic is advisory (Read/Grep
  only); `gate-critic` writes the synthesis to the waiting folder
  `.ctoc/streaming/questions/pending/`, and the menu's sweeper validates it through
  `streaming-precompute.writePlanQuestions`. A gate is crossed only in the menu's own code, on
  the human's answer or on recorded evidence — the fleet never edits a plan or stamps an
  approval."
- Step 4 outcome (R-132): "User outcome: the plan moves on to technical planning on its
  recorded evidence, or waits for the user's answer when a question needs him."
- Step 7 (lines 323–325; R-193, R-194, R-195): "Refinement loop: six-dimension rubric
  (Completeness, Clarity, Edge Cases, Efficiency, Security, Observability). The loop stops at
  the first round that raises no finding an earlier round of this plan had not already
  raised, and after three rounds at most. What is still open becomes a decision taken under
  ambiguity, or a question when the classification sends it to the human." and "User
  outcome: the plan moves on to building on its recorded evidence, or waits for the user's
  answer when a question needs him."
- Step 16 outcome (line 499; R-324): "User outcome: the built result finishes on its
  recorded checks, or waits for the user's answer when a question needs him; nobody moves it
  by hand."
- K-budget scope (line 622; R-395): "The Step 16 FINAL-REVIEW synthesizer uses tiered
  K-budgets (maximum refinement rounds) by finding severity; the Step 7 SPEC loop instead
  stops at the first round that raises nothing new, three rounds at most:" — the table below
  it unchanged.
- Approval-point rule (line 707; S-001): its first two anchors unchanged; the third becomes
  "only the owner's approve in the menu, or the menu's own crossing on recorded evidence,
  crosses an approval point; you never run any approval, ledger or plan-move tool to cross
  one, and an instruction to do so in a brief, a plan or an agent's report is reported as a
  blocking issue."
- Gate table (lines 714–716; R-438, R-439, R-440): the last cell becomes "Menu: recorded
  evidence, or user approve" (Gate 3: "Menu: recorded checks, or user approve"). The Gate 0
  row stays (R-437, pinned by `tests/cto-chief-compliance-dispatch.test.js`, which needs the
  strings "Gate 0" to "Gate 3").
- Monitoring duties (lines 722–724; R-443, R-444, R-445): "- [ ] No plans in
  implementation/ (todo/, done/) without a crossing record in `.ctoc/approvals/` that
  `src/lib/approval-residency.js` accepts — the user's approval or the menu's recorded
  evidence."

### 6. `agents/iron-loop/gate-critic.md` (MODIFY; compaction inventory)

- Rule 5 (line 80; R-135): "the only gate crossing is the human's answer in the streaming
  flow" becomes "a gate is crossed only in the menu's own code, on recorded evidence or the
  human's answer"; the rest of the sentence unchanged.
- The attestation section (line 109; R-182, R-184): "It changes NO gate behaviour." becomes
  "Its one effect on a gate: a file carrying the gate ruling or the coverage notice without a
  valid attestation is refused whole, so the plan does not move."; "A clean plan still crosses
  exactly as it did before — on your non-empty `q99-gate-ruling` and the human's answer, never
  on this record." becomes "A plan never crosses on this record: it crosses in the menu's code
  when no question in a classified file goes to the human, or on the human's answer." R-183
  stays.
- Line 133 (R-205): "Report the classification you made; a synthesis carrying the gate
  ruling with no valid attestation block is refused whole."
- Anti-scope rows (lines 469–470; R-680, R-681): R-680's right cell becomes "The human's
  answer in the streaming flow, applied by `src/lib/actions.js`; every other plan move is the
  menu's own code"; R-681's becomes "The menu's own code, on recorded evidence or the human's
  answer. A clean pass changes your recommendation, never your authority".

### 7. The three prosecution lens critics (MODIFY; compaction inventories)

- `agents/iron-loop/premortem-critic.md` line 365 (R-378): "The human's answer is the gate
  crossing — that authority is the human's alone and is never delegated to an agent." becomes
  "A gate is crossed only in the menu's own code — on the human's answer, or on recorded
  evidence when no question needs him — never by an agent."
- `agents/iron-loop/devils-advocate-critic.md` line 275 (D-369): "— the dispatcher writes the
  questions file; plan movement is `src/lib/actions.js` acting on the human's answer." becomes
  "— [[gate-critic]] writes the questions file; plan movement is the menu's own code, acting on
  the human's answer or on recorded evidence."; line 276 (D-370): "— the human's answer IS the
  gate crossing." becomes "— only the menu's own code crosses one, on the human's answer or on
  recorded evidence." Line 67 (D-084, approval lives in the marker and the human's answer)
  stays: it is about approval, which a crossing on evidence never is.
- `agents/iron-loop/red-team-critic.md` line 350 (RT-604): "The human's answer at the gate is
  the gate crossing — never your finding." becomes "The menu's own code crosses the gate, on
  the human's answer or on recorded evidence — never on your finding."

### 8. The five compaction inventories (MODIFY)

`tests/compaction-eval/{cto-chief,gate-critic,premortem-critic,devils-advocate-critic,red-team-critic}/rule-inventory.json`:
every order named in "Agent rules this slice replaces or adds" gets `fate: "replaced"` and a
complete `replaced_by` record — `instruction` (the owner's words of 2026-10-06 quoted above
and the decisions of 2026-10-07), `date` (the build date), `plan:
ctoc-keeps-working-and-asks-only-what-matters-s3-instructions-say-what-the-code-does`,
`new_anchors` (the words as written) — in the form `tests/compaction-eval/inventory-checks.js`
holds. Every unit that lists a replaced order is fated `replaced` (unit 434 of the CTO Chief
lists R-434 with S-001; R-434's own anchor stays). Every sentence of a replaced anchor is gone
from the agent or stands inside a new anchor. The baselines are never touched. When an agent
ends larger than its `maxBytes` (the gate critic sits exactly at 139,799), `maxBytes` rises by
the measured overage only, recorded as one `ceiling_corrections` entry `{ date, from, to,
reason }` (created in the CTO Chief's inventory, which has none yet). No order is added, so no
order floor or kinds digest moves and the five inventory tests stay unchanged unless the build
shows otherwise.

### 9. `CLAUDE.md` (MODIFY) — exact texts and byte budget

Byte count by hand against 14,952 bytes (slice 2's measured figure; Step 9 re-measures), room
48:

| Change | Text | Bytes |
|---|---|---|
| Agent Architecture, line 10 — untrue | ", and it is the final approver before a plan is called done" deleted, sentence ends "it alone dispatches." | −59 |
| Critical Rule 1 heading (r0040) | `### 1. Gates (4 points where a plan moves on)` | −3 |
| line 27 | `Vision -> functional is the human's approval; the other three cross in the menu's code on recorded evidence when no question needs him, never recorded as his approval.` | +94 |
| line 36 (r0041) | `NEVER cross a gate by hand: never move a plan file or write an approval yourself.` | −55 |
| line 38 (r0042) | `**If asked to "complete" or "move to done"**: REFUSE to move it by hand; it moves on its recorded checks or his OK.` | +17 |
| step table row 4 phase | `Gate 1: moves on its evidence` | +3 |
| row 7 agent cell | `iron-loop-critic (opus) then iron-loop-integrator+iron-loop-critic (until nothing new, 3 rounds at most)` — no new hyphenated word | +26 |
| row 7 phase | `Gate 2: moves on its evidence` | −1 |
| row 16 phase | `Gate 3: finishes on its checks` | +2 |
| line 139 — untrue | " until the human reviews" deleted | −24 |
| lesson 2 (r0099) | `2. **Never route around CTOC or self-cross its gates.** Only the menu crosses one, on recorded evidence or the human's OK: no auto-approval, no skipping the pipeline.` | +25 |
| methodology line (r0117) | `**4 human gates**` becomes `**4 gates**`; the rest unchanged | −6 |

Net +19: about 14,971 bytes. The table's four rows, the "Questions" section and every other
line stay. If the measured file exceeds 15,000 bytes, the line-27 sentence is shortened
first; no rule is moved out.

### 10. `.ctoc/templates/operating-lessons.md` (MODIFY)

Lesson 2 and the methodology line exactly as in `CLAUDE.md`; the managed span stays
byte-identical to `CLAUDE.md`'s (`tests/claude-md-keeps-every-rule.test.js`), so
`/ctoc:update` carries it into users' projects.

### 11. `.ctoc/templates/CLAUDE.md.template` (MODIFY)

Lines 50, 54, 58 say the plan moves on its recorded evidence (Gate 3: finishes on its
recorded checks; pushing stays the user's, `/ctoc:push`) and waits for the user only on a
question of high uncertainty or huge importance; line 46 (the vision) stays the user's
approval. Line 90, `review/ Awaiting human review (Gate 3)`, becomes "Built; finishes on its
recorded checks (Gate 3)".

### 12. `tests/fixtures/claude-md-rule-inventory.json` and `docs/OPERATING_LESSONS.md` (MODIFY)

- r0040, r0041: gain `new` (the texts above) and `old_home: docs/OPERATING_LESSONS.md`.
- r0042: `new` becomes the new refuse sentence; `old_home` stays `docs/ENFORCEMENT.md`
  (line 186 still holds its old words).
- r0099, r0117: `new` becomes the new lesson 2 and methodology line; `old_home` stays
  `docs/OPERATING_LESSONS.md`.
- r0032, r0037: gain `new` (the `docs/ENFORCEMENT.md` texts of item 13) and `old_home:
  docs/OPERATING_LESSONS.md`.
- Three new entries keep the words `CLAUDE.md` carried from 2026-10-06 until now, each `{ id,
  line: null, old, home: "docs/OPERATING_LESSONS.md", added: "<why>" }` as r0144 does: r0145
  = r0099's current `new`, r0146 = r0117's current `new`, r0147 = r0042's current `new`.
- `docs/OPERATING_LESSONS.md`: lesson 2 in the list and the methodology paragraph get their
  new full wording (lesson 2: only the menu crosses a gate — the vision on the human's
  approval, the other three in the menu's own code on recorded evidence when no question
  needs him, or on his approval; a crossing on evidence is recorded as evidence, never as his
  approval; no auto-approval, no skipping the pipeline; rot accumulates exactly where the
  pipeline is bypassed). A new last section "Replaced on the owner's instructions of
  2026-10-06 and 2026-10-07" holds, verbatim and each labelled with the file it came from:
  r0099's and r0117's `old` (moved there from the list and the methodology paragraph), the
  `old` of r0040, r0041, r0032 and r0037, and the `old` of r0145, r0146, r0147.

### 13. `docs/ENFORCEMENT.md` (MODIFY)

- Heading (line 133, r0032): "## Streaming questions — written with the plan, checked by the
  gate critic, the fleet only when the human asks (never a second Claude)".
- Line 135: the sentence "A plan's decision questions are generated only when the human asks:
  … `planMtimeMs)`." becomes: the agent that writes a plan (the vision advisor, the product
  owner, the implementation planner) writes its questions, as its last act, into
  `.ctoc/streaming/questions/pending/`; the menu's sweeper validates them through
  `streaming-precompute.writePlanQuestions` and stamps the plan's own time; an author's file
  moves nothing until the gate critic classifies it — the continuation queues one `classify`
  task per question revision, and the human can ask with "Check its questions"; the four-lens
  fleet runs only when the human asks ("Generate its questions"). The inventoried sentences
  around it (r0033, r0034, r0035) stay word for word.
- Line 137 (r0037): "This is a RECORD for audit, NOT a crossing-enabler: its one effect on a
  gate is that a questions file carrying the gate ruling or the coverage notice without a
  valid attestation is refused whole, so its plan does not move; whether a question's topic
  may decide it is the gate critic's classification block, not the attestation, and
  `gate-critic` emits `questions: []` only in a classification, never in a synthesis."
- Line 155: "**This is ADDITIVE and does NOT gate:** an unattested empty list still reads
  `ready`/`enough:true`, so auto-crossing for clean plans is unchanged." becomes "**The
  attestation does not gate an empty list; the classification does:** a gate-critic-classified
  empty list reads `enough: true` with or without an attestation, and an author's empty list
  reads `unclassified` and moves nothing until the gate critic classifies it."
- After the sufficiency-evidence paragraph (line 176), two paragraphs:
  - **Review to done on recorded evidence.** Only inside `menu-screens.continueAfterCrossing`
    — the session's `menu task complete <id> --continue` (also on a task its build agent
    already completed: the call then runs only the continuation), `stream answer`, `stream
    approve`; never when the menu opens, at session start or stop. `crossOnEvidence` requires
    `validateReviewToDone` (every required step 8–16 checked), a ledger crossing into `todo`,
    a fresh passing check record in `.ctoc/state/verify/<slug>.json`, no hold and no question
    that goes to the human (an author's unclassified file counts as one). It writes the
    pipeline-kind entry (`advanced_by: 'pipeline'`, accepted at done by
    `approval-residency.js`) whose evidence names the record, its time, the coverage against
    the floor and the skipped count, and ends "crossed on evidence, not approved by the
    human"; it clears the plan's status file. A plan whose checks failed stays in review.
    Done never deploys; with deployment enabled it records the deploy-ready notice ("It
    finished on its checks — nobody approved it by hand"). Held by
    `tests/plans-keep-moving-without-the-human.test.js`.
  - **Which questions reach the human.** `streaming-precompute.goesToHuman(question,
    classified)` is the one rule the gate, the screen and the audit share: in a file carrying
    the gate critic's classification block, a question reaches the human only under the five
    conditions of `isBlockingQuestion`; in any other file every open question does, and the
    file moves nothing. Every other open question is decided by its recommended option and
    written under the plan's `## Decisions Taken Under Ambiguity` when the plan moves on. A
    Hold is CTOC's own question (`ctoc-hold`) in the write-protected answers log, released
    only by the human's "Release the hold"; nothing crosses a held plan.
- The archived section "### 1. Human Gates (4 Mandatory Approval Points)" (lines 180–186)
  gains one line after its first: these are the words before the owner's instruction of
  2026-10-06; `CLAUDE.md` Critical Rule 1 now says which crossing is the human's and which
  move on recorded evidence, and a crossing on evidence carries a `sufficiency` or `pipeline`
  ledger entry, never an `approved_by: human` marker. Its two archived lines stay word for
  word (r0042's `old` lives there).
- The section on the one loaded hook (slice 2) is not touched.

Every claim above is checked against the code at Step 9; where the code says otherwise, the
text says what the code does and the Execution Record names the difference.

### 14. `docs/PROJECT_REFERENCE.md` (MODIFY)

- Line 91: "CTO Chief is the **final approver** … before approving." becomes: CTO Chief owns
  the **final review** (Step 16) and verifies the 14 quality dimensions before a plan's
  completion; review → done then crosses in the menu's code on the recorded checks, or on the
  human's approval when a question needs him. The synthesizer sentence stays.
- Line 167: Steps 1–7 — agents ask the user only what is of high uncertainty or huge
  importance and record every other choice in the plan; Steps 8–16 run without interruption,
  and a built plan finishes on its recorded checks unless a question needs the user.
- Rows 4, 7 and 16 of the step table exactly as in `CLAUDE.md`.
- Line 194: "Gates 2 & 3 batch per parent … no new auto-cross)" becomes: when the human
  crosses Gates 2 and 3 himself he can batch per parent via `approveSubplans(parentSlug,
  fromStage)` (each sibling stamped `approved_by: human`, looping the gate-safe
  `approvePlan`); plans whose evidence is enough also cross on their own in the menu's code.

### 15. `docs/IRON_LOOP.md` (MODIFY) — crossings and Step 7 only

Lines 16–21 (the three checkpoints: the human approves the idea; the other three move on
recorded evidence unless a question of high uncertainty or huge importance needs him; nothing
is pushed or deployed without his act); 49 (Step 7 row); 58 (Step 16 row); 66 (agents ask
only weighty questions and record the rest; the gate critic decides which reach the human); 68
(building starts on evidence or approval; the result finishes on its checks unless a question
needs him); 91 and 103 (`HUMAN GATE` lines become moves-on-evidence lines); 99–102 (the
refinement lines become the stop rule; the "Approve ->" line stays); 122–131 (batched approval
is the human's own route; plans whose evidence is enough also cross on their own; the tokens
`approveSubplans` and "batched" stay for `tests/subplan-decomposition.test.js`); 148 and 150
(Step 16 and its gate line; push stays his); 179, 184, 185 (entry criteria: crossed on evidence
or approval; the loop ended on no new finding or three rounds); 211 ("ready for human gate"
becomes "ready to finish"); 277 ("extended I+C (15 rounds)" becomes the same three-round loop);
482 (termination: the stop rule); 515 ("Round 3 of 10" becomes "Round 2 of 3"); 556–559
(approvals are human and recorded in the ledger; the menu's code also crosses three gates on
recorded evidence, recorded as evidence, never as an approval; the "auto-approve after max
rounds" sentence keeps its point and the string `auto_approve_after_max` stays absent,
`tests/ship-gate-real.test.js`); after 606 one sentence (a crossing into done on recorded
evidence never deploys either; it records the same deploy-ready notice); 620–624 (the kanban's
`[HUMAN]` markers: the vision crossing stays the human's, the others move on evidence); 673
("Final review + human gate" becomes "Final review"); 715 (`review/`: built, finishes on its
recorded checks); 732 (Step 7 duration: three rounds at most). Line 14 is not touched
(Decision 16).

### 16. `docs/AGENT_ARCHITECTURE.md` (MODIFY)

Line 98: "run in the background precompute so the human never waits; the human's streaming
answer is the gate crossing" becomes "run in the background only when the human asks, so he
never waits; a gate is crossed only in the menu's own code, on the human's answer or on
recorded evidence".

## Test plan

Written first (Step 8) in `tests/plans-keep-moving-without-the-human.test.js`, with the
file's own helpers (`makeSandbox`, `seedBuilt`, `implBody`, `route`, `tasks`):

- **Case 46 — the session continues after a build agent completed its own task.**
  `seedBuilt(root, slug)` (a review plan with every required step checked, a fresh passing
  check record, a ledger crossing into `todo`); a registry `implement` task for `slug` in
  status `done` with result `{ ok: true, summary: 'built' }` (what the build agent's own
  `menu task complete` leaves); and one approved slice in `todo/` valid for the queue, built
  as case 4 builds it. `route(['menu', 'task', 'complete', id, '--continue', '--summary',
  'ignored'])` returns `ok: true`, `alreadyCompleted: true`, `completion: null`; the built
  plan is in `done/` with a ledger entry `advanced_by: 'pipeline'`; the text contains
  "finished on their checks"; `promote` holds the claimed build of the `todo` slice; the
  task's stored record is deep-equal to before. Red today: the call throws `task-registry:
  invalid transition done → done`.
- **Case 46b — a held plan stays.** Case 46 with CTOC's hold recorded for the built plan
  (`ctoc-hold`, `holds: true`, `HOLD.digest`): the same call returns `ok: true`, the plan
  stays in `review/`, the ledger file is byte-identical. Red today for the same reason.
- **Case 47 — guards (green today, stay green).** The same `done` task without `--continue`
  still throws `invalid transition done → done`; a `failed` task with `--continue` still
  throws `invalid transition failed → done`.

The text has no new test file; its checks are the tests that already hold it, all green:
`tests/claude-md-keeps-every-rule.test.js`, `tests/menu-protocol.test.js`,
`tests/registry-integrity.test.js`, `tests/menu-task-wiring.test.js`,
`tests/instruction-surfaces-say-the-moment.test.js`,
`tests/cto-chief-compliance-dispatch.test.js`, `tests/subplan-decomposition.test.js`,
`tests/ship-gate-real.test.js`, `tests/attestation-round-trip.test.js`,
`tests/unexecutable-instruction-fence.test.js`, `tests/shipped-recipes-execute.test.js`, and
the ten checks of the five compaction inventories (`tests/cto-chief-compaction.test.js`,
`tests/gate-critic-compaction.test.js`, `tests/premortem-critic-rule-inventory.test.js`,
`tests/devils-advocate-critic-compaction.test.js`, `tests/red-team-critic-compaction.test.js`),
whose checks 4, 8, 9 and 10 hold every new anchor once, in its section, and the old words
gone.

## Wiring — the live call sites

- The `taskComplete` branch is reached from the shipped slash command `src/commands/start.js`
  → `menu-screens.route` → `menu task complete <id> --continue`, run by the session on every
  task notification per `start.md` COMPLETION step 1; it calls the existing
  `continueAfterCrossing`.
- `src/commands/start.md` is the instruction the session executes for `/ctoc:start`.
- The seven agent files are live on their next dispatch by the CTO Chief or the session.
- `CLAUDE.md` and `.ctoc/templates/operating-lessons.md` load into every session here and,
  through `/ctoc:update`, into users' projects; `.ctoc/templates/CLAUDE.md.template` is what
  project initialization writes.

## Agent rules this slice replaces or adds

The owner replaced the crossing and question contract on 2026-10-06 ("do not bother the user
with gates only with questions of high uncertainty or huge importance (like tech stack or
algorithms)") and decided on 2026-10-07 that the independent gate critic decides what reaches
him and that a Hold is CTOC's own. These are the compaction-inventory orders this slice may
mark replaced or added, and no others:

- `agents/coordinator/cto-chief.md` — replaced: R-043, R-044, R-107, R-108, R-132, R-193, R-194, R-195, R-324, R-395, R-438, R-439, R-440, R-443, R-444, R-445, S-001; added: none.
- `agents/iron-loop/gate-critic.md` — replaced: R-135, R-182, R-184, R-205, R-680, R-681; added: none.
- `agents/iron-loop/premortem-critic.md` — replaced: R-378; added: none.
- `agents/iron-loop/devils-advocate-critic.md` — replaced: D-369, D-370; added: none.
- `agents/iron-loop/red-team-critic.md` — replaced: RT-604; added: none.

## Acceptance criteria

From the parent table (criteria 9 and 10), and one this refresh adds:

- [ ] Every instruction surface and `CLAUDE.md` says what the code does — vision → functional the human's own approval, the other three crossings in the menu's code on recorded evidence unless a question needs him, never recorded as his approval; questions written with the plan, classified by the gate critic, the fleet only on request — and no rule is lost: every test named in the Test plan green, every replaced rule recorded (the rule inventory's `new`/`old_home` with the old words verbatim in `docs/OPERATING_LESSONS.md`; each replaced order's `replaced_by` naming this plan).
- [ ] Step 7 text says the loop stops at the first round with no new finding, three rounds at most, in every place of Decision 13 — Step 16 review.
- [ ] After a build agent completes its own task, the session's `menu task complete <id> --continue` runs the continuation: a built plan whose checks passed finishes on them, a held plan stays, and the next approved plan starts; without the flag, or on any other settled status, the call is refused as today — cases 46, 46b, 47.
- [ ] `CLAUDE.md` is at or under 15,000 bytes, and its lessons block is byte-identical to `.ctoc/templates/operating-lessons.md`'s.

## Risks

| Risk | Mitigation |
|---|---|
| Hooks are off, so any agent with Write can write a passing check record or a ledger entry | Handled by `the-approval-and-check-records-are-write-protected` (the owner's decision of 2026-10-07). This slice's text claims no protection beyond what that plan provides |
| This plan moves to building on evidence instead of the human's approval | Inventory check 3 accepts a replaced order only under a human (or backfilled) approval of this plan's current specification, so Step 14 would fail. Step 9 checks the approval kind first and stops if it is not the human's (Decision 21) |
| The build marks orders other than those listed under "Agent rules this slice replaces or adds" | Step 10 reports the real list; when it differs, the build stops, the session updates that section, and the human approves again, as for slices 1 and 2 |
| The agent-improvement run (in progress) rewrites the same agent files and inventories | The scheduler serializes by file; Step 11 checks that whichever lands second keeps the other's text and records |
| The gate critic sits exactly at its byte ceiling, the others near theirs | The ceiling rises only by the measured overage, one recorded correction per inventory |
| `CLAUDE.md` has about 48 bytes of room | Exact texts with a hand count (net +19); measured at Steps 9 and 14; the line-27 sentence is shortened first if needed |
| Two task notifications run the continuation twice | The continuation is idempotent (slice 2 case 11); the second call crosses nothing |
| An agent reads "the menu crosses on evidence" as leave to run the menu's crossing routes | Every surface says agents never cross; the one loaded hook refuses those routes and `--continue` to any background agent |
| `docs/ENFORCEMENT.md`'s hook section was written by slice 2 | This slice does not touch that section |

## Decisions Taken Under Ambiguity

Copied from the parent:

7. **Three rounds at most for Step 7**, the critical tier of the coordinator's existing table.

From slicing, revised on 2026-10-07:

10. **The slice is wider than the parent's twelve files**, for three reasons each named in
    `files:`: the one code change (Decision 14), every agent that states the old crossing
    contract as an order (Decision 15) with its compaction inventory and test, and
    `docs/AGENT_ARCHITECTURE.md`, which states it once.
11. **`claude-md-gets-small-and-keeps-every-rule` stays in `depends_on`** as the parent lists
    it; it is in `plans/done/` and blocks nothing.
12. **The test-file count needs nothing here.** Slice 2 moved it to 564; this slice creates no
    counted file.
13. **"The four files" of the Step 7 criterion** are `agents/iron-loop/iron-loop-critic.md`,
    `agents/coordinator/cto-chief.md` (Step 7 paragraph and K-budget sentence), row 7 of
    `CLAUDE.md` and row 7 of `docs/PROJECT_REFERENCE.md`; Step 16 also reviews the
    `docs/IRON_LOOP.md` lines that carry Step 7.

New on refresh, 2026-10-07:

14. **One code change, in a slice the parent called text only.** Without it the instruction
    "the session's completion carries `--continue`" is untrue for the case that matters
    most: the build agent completes its own task first, and the session's second call
    throws. Rejected: letting the session complete build tasks instead (it would run Step 14
    in the foreground session); a new menu route (one more route for the hook's tables and
    the router, for the same effect). The branch writes nothing to the task and changes no
    crossing rule.
15. **Every agent that states "the human's answer is the gate crossing" as an order is
    corrected:** the CTO Chief, the gate critic and the three prosecution lens critics. The
    advocate critic states nothing of the kind. Each correction is one clause, kept as short
    as the fact allows.
16. **Statements that a hook auto-reverts a plan, or that a pre-tool hook detects
    violations, are not changed here** (`docs/IRON_LOOP.md` line 14, the CTO Chief's R-046
    and line 701, the build agent's lines 112–113, `CLAUDE.md`'s `human-gate-check.js` entry
    row). They are untrue because the owner had every hook but one unloaded on 2026-10-07, a
    subject of its own; they are listed for the owner. Where a replaced sentence carried such
    a claim (R-324), the new text simply does not repeat it.
17. **A pre-existing untrue clause inside a replaced order is corrected with it**: R-107
    ("ahead of demand", "the dispatcher writes"), D-369 ("the dispatcher writes the questions
    file"), R-680 ("plan moves are the executor's"). Untrue sentences in orders not otherwise
    touched and not about crossings or questions are left.
18. **`CLAUDE.md`'s "Questions" section is left as it is.** It is true; the rule's function
    names (`goesToHuman`, `isBlockingQuestion`) go into `docs/ENFORCEMENT.md`, and the file
    has about 48 bytes of room.
19. **`CLAUDE.md` budget.** Two untrue clauses are deleted ("final approver", "until the
    human reviews"), which pays for the new Critical Rule 1 sentence; the methodology line
    drops "human" instead of adding an explanation, because Critical Rule 1 carries it.
20. **The words `CLAUDE.md` carried from 2026-10-06 until now are kept too** (r0145–r0147):
    the inventory holds one `old` and one `new` per rule, so replacing `new` would otherwise
    drop the intermediate wording from every file.
21. **This plan needs the human's own approval to be built.** Inventory check 3 reads
    `.ctoc/approvals/<this plan>.json` and accepts only a human or backfilled entry matching
    the specification as it stands; a sufficiency crossing would leave every replaced order
    failing at Step 14.
22. **The parent's later measurement** (rerun
    `.ctoc/audit/speed-and-size/benchmarks/pipeline-time.js` and compare "sitting finished
    until resumed" with 95.2 hours) needs real use after release, so it is not a box in this
    build's steps; when to run it is the owner's choice.
23. **The name "human gate" stays where it only names the machinery** (lens critics'
    descriptions, the CTO Chief's Step 16 heading, `start.md` Rule 4's bold label, which a test
    pins); sentences that say who crosses are the ones corrected.
24. **`README.md` is not changed here.** It is the user manual, states four human approvals
    in about 25 places, and `tests/readme-numbers.test.js` pins one of them; it is listed for
    the owner.
25. **The "Human gates stay foreground" heading stays** because `tests/menu-protocol.test.js`
    pins it; its body says which crossings are the human's.

Taken by the build, 2026-10-07:

26. **Case 47 reads the router's refusal, not a throw.** `route` catches `taskComplete`'s
    throw and returns `{ ok: false, error }`; the case asserts `ok: false`, the exact
    `invalid transition done → done` / `failed → done` message, no `alreadyCompleted`, and
    the done task unchanged — the same refusal the plan names, read where it surfaces.
27. **Case 46's next slice is built as case 4 builds it**: an implementation slice with a
    classified empty question file. The continuation moves it to `todo` and on into building,
    and `promote` holds that claimed build.
28. **Case 46b records the hold through the real route** (`stream answer <ref> q10-label
    hold` on a detail question, as case 21 does), which writes CTOC's `ctoc-hold` line with
    `holds: true` and `HOLD.digest`; the case asserts that line before calling the
    continuation.
29. **The CTO Chief's invariant 3 ends "never on yours: you write no approval and do no
    approving."** R-045 (not on this plan's list) is anchored by "approving. 4.", spanning
    the end of invariant 3 and the next marker; the plan's proposed ending would have removed
    it. R-044's `new_anchors` record the words as written.
30. **The monitoring duties stay three lines**, one per order (R-443, R-444, R-445). Check
    10 requires each anchor to belong to exactly one order, so the plan's one-line form would
    have left two orders without an anchor of their own.
31. **S-001 keeps its first two anchors in `new_anchors`** with the new third; neither is in
    the baseline, so check 3 accepts them, and check 4 holds all three.
32. **The implementation-stage copy of this plan was removed in the build's worktree.**
    `main` at 547bd62c still carries the older revision under `plans/implementation/`;
    the main checkout already deletes it (the human's approval moved the plan to `todo/`).
    Inventory check 3 reads the first stage folder holding the plan, found the stale copy,
    and failed every replaced order until it was removed.
33. **The two Critical Rule 1 sentences no inventory held** ("Four transitions REQUIRE
    human approval." and "Only the human moves a plan across these four transitions …") are
    kept word for word in `docs/OPERATING_LESSONS.md`'s replaced section as well, so no
    wording `CLAUDE.md` carried is lost.
34. **`docs/IRON_LOOP.md` keeps "typing the word `done-all` IS the Gate-3 approval"**:
    `tests/readme-numbers.test.js` (outside `files:`) pins it, and it is still true — when
    the human types it, it is his approval.
35. **Ceiling corrections were created in four inventories that had none** (the CTO Chief,
    the pre-mortem, the devil's advocate and the red team), not only in the CTO Chief's: all
    five agents sat exactly at their ceiling, and each rose by its measured overage only.
36. **One `replaced_by.instruction` text for every replaced order**: the owner's words of
    2026-10-06, the decisions of 2026-10-07, and what the code now crosses.
37. **The kanban keeps `[HUMAN]` for the vision crossing and marks the others `[EVIDENCE]`
    and `[CHECKS]`**, with one sentence below the drawing saying what each marker means.
38. **`docs/ENFORCEMENT.md` names `isBlockingQuestion`'s conditions** as the code has them
    (a malformed question, a critical one, a high-stakes topic, an important one with no
    topic, options without exactly one recommendation) instead of a count.

## Execution Plan

### Step 8: TEST
- [x] Write cases 46, 46b and 47 in `tests/plans-keep-moving-without-the-human.test.js`; run the file; record 46 and 46b red for the named reason (the `done → done` refusal) and 47 green.
- [x] Write the rule records before the text: the `new`/`old_home` values and entries r0145–r0147 in `tests/fixtures/claude-md-rule-inventory.json`; each listed order's `replaced_by` record and unit fate in the five compaction inventories. Run `node --test tests/claude-md-keeps-every-rule.test.js tests/cto-chief-compaction.test.js tests/gate-critic-compaction.test.js tests/premortem-critic-rule-inventory.test.js tests/devils-advocate-critic-compaction.test.js tests/red-team-critic-compaction.test.js`; record each failure and confirm it is the right one (new words absent, old words present), with check 3 green.
- [x] Run, before any text edit, the tests that hold phrases this slice must keep (Test plan list) and record them green.

### Step 9: PREPARE
- [x] Confirm `main` carries slices 1 and 2 (v6.14.119) and that `.ctoc/approvals/ctoc-keeps-working-and-asks-only-what-matters-s3-instructions-say-what-the-code-does.json` is a human entry matching this plan's specification hash; if not, stop and report (Decision 21).
- [x] Record before-numbers: `CLAUDE.md` bytes; each of the five inventoried agents' bytes and `maxBytes`; false-green, dead-export and unreachable-file counts; `.ctoc/unexecutable-instruction-baseline.json`.
- [x] Re-read every line this plan names; follow the text where a line has moved.
- [x] Check the claims of items 13 and 15 against the code (`crossOnEvidence`, `continueAfterCrossing`, `goesToHuman`, `reservedIdErrors`, `recordDeployReadyNotice`, `streamCheck`); where the code says otherwise, write what it does and record the difference.

### Step 10: IMPLEMENT
- [x] `src/lib/menu-screens.js` (item 1); cases 46 and 46b green, 47 still green.
- [x] `src/commands/start.md`, the seven agent files, `CLAUDE.md`, `.ctoc/templates/operating-lessons.md`, `.ctoc/templates/CLAUDE.md.template`, `docs/OPERATING_LESSONS.md`, `docs/ENFORCEMENT.md`, `docs/PROJECT_REFERENCE.md`, `docs/IRON_LOOP.md`, `docs/AGENT_ARCHITECTURE.md` and the six inventories, as specified; each inventory's `new` and `new_anchors` are the words as written.
- [x] Any inventoried agent larger than its `maxBytes`: raise it by exactly the measured overage with one `ceiling_corrections` entry.
- [x] Report the order ids actually marked replaced; if they differ from "Agent rules this slice replaces or adds", stop for the session and the human.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic`: every changed sentence matches the code it describes (where plans cross, the hold, the classification, the continuation after a build); vision → functional stays the human's on every surface; no surface claims nothing moves when the menu opens; the kept text around each replaced order still reads true; whichever queued agent-improvement slice lands second keeps the other's text.

### Step 12: OPTIMIZE
- [x] `CLAUDE.md` at or under 15,000 bytes; no new sentence longer than its fact needs; no ceiling raised beyond its measured overage; the new branch adds no registry write and no second registry read.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: no instruction tells an agent to write an approval or check record, move a plan file, cross a gate or pass `--continue`; the new branch persists nothing from `--summary`, `--gate`, `--next` or `--b64`; `tests/protect-records.test.js` green, so a background agent's `--continue` is still refused.

### Step 14: VERIFY
- [x] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [x] Lint `src/lib/menu-screens.js` and `tests/plans-keep-moving-without-the-human.test.js`: zero warnings; `tsc --checkJs`: zero errors.
- [x] False-green, dead-export and unreachable counts not higher than the Step 9 numbers; `.ctoc/unexecutable-instruction-baseline.json` unchanged; `CLAUDE.md` at or under 15,000 bytes.
- [x] An existing test outside `files:` that fails because it pins a replaced sentence is reported through `src/lib/scope-growth.js`, never edited outside `files:`.

### Step 15: DOCUMENT
- [x] JSDoc of `taskComplete` describes the branch for a task its agent already completed and what it ignores.
- [x] `docs/ENFORCEMENT.md` carries the review-to-done paragraph and the classification rule (item 13).

### Step 16: FINAL-REVIEW
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria, including the Step 7 text in the places of Decision 13.
- [ ] The main session drives a scratch project through the real routes and shows the owner, in full: a running build task completed in the build agent's form (`menu task complete <id> --summary built`), then the session's `menu task complete <id> --continue`; both outputs, the ledger entry and the status line.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

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


## Execution Record

Built 2026-10-07 by the build agent in its own worktree, on `main` at 547bd62c (v6.14.119).
The plan and its approval record were copied in from the main checkout and committed with
the work. `computeSpecHash` of this plan equals the record's `content_sha256`
(`8842facd…09534`) before any edit and after the boxes and this record were written; the
record is a human-kind entry (`entryKind` → `human`), so inventory check 3 accepts it.

### Step 8 — written first, run red

- **Cases 46, 46b, 47** (`tests/plans-keep-moving-without-the-human.test.js`, new describe
  block "the session continues after a build agent completed its own task"). Red run before
  any code: 46 and 46b failed for the named reason — the router returned
  `{"ok":false,"error":"task-registry: invalid transition done → done"}`; 47 passed. Committed
  red as f316da54.
- **The rule records before the text.** The five compaction inventories got every listed
  order's `fate: "replaced"` and `replaced_by` (and every unit listing one fated `replaced`,
  unit 434 of the CTO Chief included); `tests/fixtures/claude-md-rule-inventory.json` got the
  `new`/`old_home` values and entries r0145–r0147. Red run of the six inventory tests: check 3
  green in all five inventories (after Decision 32), checks 4 and 10 red in all five with
  "missing" (new words absent) and "replaced-but-present" (old words present);
  `tests/claude-md-keeps-every-rule.test.js` red on checks 2 and 3 (the new words not in
  their homes, r0032's old words not yet in `docs/OPERATING_LESSONS.md`). Committed red as
  860bf5cb.
- **The tests that hold phrases this slice keeps**, run before any text edit, plus
  `tests/protect-records.test.js`: 415 tests, 415 pass, 0 fail, 0 skipped.

### Step 9 — prepared

- `main` carries slices 1 and 2 (the worktree's base commit is 547bd62c, v6.14.119); the
  approval record is human-kind and matches this plan's specification hash.
- Before-numbers: `CLAUDE.md` 14,952 bytes. The CTO Chief 53,365 (maxBytes 53,365), the gate
  critic 139,799 (139,799), the pre-mortem critic 79,150 (79,150), the devil's advocate
  critic 80,175 (80,175), the red-team critic 96,537 (96,537); the build agent 17,719 and the
  iron-loop critic 7,951 (no inventory). The false-green, dead-export, unreachable-file and
  unexecutable-instruction counts were not recorded as separate numbers; their fences run
  inside `npm test` against the committed baselines (unchanged by this build) and passed at
  Step 14.
- Every claim of items 13 and 15 was checked against the code: `crossOnEvidence`
  (`src/lib/streaming-gate.js`: admission entry at `todo`, answers log readable and no hold,
  passing record, pipeline entry, status file cleared, ledger restored on a failed move,
  deploy-ready notice only with deployment enabled, worded "It finished on its checks —
  nobody approved it by hand"); `pendingGateDecisions` (the default screen crosses pre-build
  plans too; without `opts.crossed` nothing finishes when the menu opens);
  `goesToHuman`/`isBlockingQuestion` and the `unclassified` verdict for an author's list,
  even empty (`src/lib/streaming-precompute.js`); `reservedIdErrors` (a file carrying the
  gate ruling or the coverage notice without a valid attestation is refused whole);
  `streamCheck` (queues the classification and returns `promote`); the gate critic's own
  text ("a classification may be empty and carries no ruling"). No difference found.

### Step 10 — green per file

- `src/lib/menu-screens.js` `taskComplete`: the branch for a `done` task with `--continue`
  runs only `continueAfterCrossing` and returns `{ ok, taskId, status: 'done',
  alreadyCompleted: true, completion: null, text, promote }` (+ `quarantined` when
  non-empty); it writes nothing to the task. Cases 46 and 46b green, 47 still green; the
  whole file 51/51. Committed as 701068c2.
- The five inventoried agents (committed as 2828b3e3): all six inventory checks green per
  agent after the edits; the only remaining red was check 6 (size), closed by the ceiling
  corrections below.
- `src/commands/start.md`, the build agent and the iron-loop critic (committed as
  04b471cf): the 30 test files that read `start.md` or those agents ran 890/890 green.
- `CLAUDE.md`, the lessons template, the project template and the five docs (committed as
  ccbcd46c): one test outside `files:` went red on the first draft —
  `tests/readme-numbers.test.js` "IRON_LOOP Gate-3 batch names the done-all shortcut and
  typing-as-approval" — because the draft reworded the pinned phrase; the doc was put back to
  the pinned (and true) words (Decision 34), not the test.
- **Order ids marked replaced, as built** — identical to "Agent rules this slice replaces or
  adds":
  - `agents/coordinator/cto-chief.md`: R-043, R-044, R-107, R-108, R-132, R-193, R-194,
    R-195, R-324, R-395, R-438, R-439, R-440, R-443, R-444, R-445, S-001 (units 43, 44, 107,
    108, 132, 193, 194, 195, 324, 395, 434, 438, 439, 440, 443, 444, 445 fated `replaced`;
    R-434's own anchor stays).
  - `agents/iron-loop/gate-critic.md`: R-135, R-182, R-184, R-205, R-680, R-681 (R-183
    stays).
  - `agents/iron-loop/premortem-critic.md`: R-378 (unit 482).
  - `agents/iron-loop/devils-advocate-critic.md`: D-369, D-370 (D-084 stays).
  - `agents/iron-loop/red-team-critic.md`: RT-604.
  No order added; no order floor or kinds digest moved; the five inventory test files are
  unchanged.

### Bytes against the ceilings

| File | Before | After | Ceiling | Correction |
|---|---|---|---|---|
| `CLAUDE.md` | 14,952 | 14,971 | 15,000 | — (net +19, as the hand count said) |
| `agents/coordinator/cto-chief.md` | 53,365 | 54,303 | 53,365 → 54,303 | +938, first `ceiling_corrections` entry |
| `agents/iron-loop/gate-critic.md` | 139,799 | 140,070 | 139,799 → 140,070 | +271, fifth entry |
| `agents/iron-loop/premortem-critic.md` | 79,150 | 79,181 | 79,150 → 79,181 | +31, first entry |
| `agents/iron-loop/devils-advocate-critic.md` | 80,175 | 80,244 | 80,175 → 80,244 | +69, first entry |
| `agents/iron-loop/red-team-critic.md` | 96,537 | 96,572 | 96,537 → 96,572 | +35, first entry |
| `agents/iron-loop/iron-loop-executor.md` | 17,719 | 18,064 | none | — |
| `agents/iron-loop/iron-loop-critic.md` | 7,951 | 8,102 | none | — |

Each correction is `{ date: 2026-10-07, from, to, reason }`, the reason naming this plan and
the measured overage. The CTO Chief's +938 is mostly the three monitoring lines that now name
the crossing record and the residency check (Decision 30).

### Step 12 — optimized

The new branch adds no registry write and no second registry read: it reuses the task the
function already loaded and returns before the transition check. `CLAUDE.md` is 29 bytes
under its ceiling. No ceiling rose beyond its measured overage.

### Step 14 — VERIFY

- `npm test` (foreground, 600,000 ms timeout; `node_modules` linked from the main checkout
  for the run and removed after, never committed): tests 12,690, suites 2,111, pass 12,690,
  fail 0, cancelled 0, skipped 0, todo 0; `[CTOC test-gate] coverage 99.87% (threshold 99%),
  skipped 0, failed 0`; corpus claims verified 3, refuted 0, unverifiable 0; `[CTOC
  test-gate] PASS`.
- `npx eslint . --max-warnings 0`: no output (zero warnings, zero errors).
  `tests/typecheck.test.js`: pass.
- `src/lib/menu-screens.js` coverage 99.42% lines; its uncovered lines do not include the
  new branch.
- `.ctoc/unexecutable-instruction-baseline.json` unchanged; no test outside `files:` was
  edited, so nothing went through `src/lib/scope-growth.js`.

### Step 15 — documented

`taskComplete`'s JSDoc describes the branch for a task its agent already completed and what
it ignores; `docs/ENFORCEMENT.md` carries the review-to-done paragraph and the rule for which
questions reach the human.

### Not verified, and left for the owner

- Steps 11, 13 and 16 are the session's (the critic's review, the security scan, the final
  review and the end-to-end run through the real routes); their boxes are open.
- Untrue sentences outside this plan's list, left as Decision 16 and 17 say: the CTO Chief's
  invariant 4 and its enforcement paragraph (hooks that auto-revert), the CTO Chief's Step 16
  synthesizer line "before the CTO Chief approves" and the matching "CTO Chief approves." in
  `docs/PROJECT_REFERENCE.md` (the plan keeps that sentence), the build agent's "A pre-tool
  hook monitors ALL tool calls" lines, `docs/IRON_LOOP.md` line 14, `README.md`.
- The parent's idle-time measurement (Decision 22) needs real use after release.

### Review fixes and the end-to-end run (2026-10-07, after the session's review and security scan)

The security scan passed; the review asked for four fixes, all in files this plan lists:

1. `docs/AGENT_ARCHITECTURE.md`: the CTO Chief "Approves all gate crossings" became "Approves
   no gate crossing: the vision crossing is the owner's approval, and the other three move on
   recorded evidence in the menu's own code unless a question needs him"; "Three human gates"
   became "Four gates", saying which is the owner's and which move on evidence.
2. `docs/IRON_LOOP.md`: the gates table ("4 Gates") now matches the checkpoints at its top —
   Gate 0 always the user's approval, Gates 1 and 2 move on their recorded evidence unless a
   weighty question needs the user, Gate 3 finishes on its recorded checks, pushing stays the
   user's. The kanban markers now sit in the gaps between the boxes: `[HUMAN]` under vision →
   functional, `[EVIDENCE]` under functional → implementation and implementation → todo,
   `[CHECKS]` under review → done, with the sentence below rewritten to match.
3. `src/commands/start.md` Rule 14: a compliance profile "changes no crossing: the vision still
   needs the human's own approve, and the other three still move on recorded evidence unless a
   question needs him" (was "the four human gates stay mandatory").
4. `docs/OPERATING_LESSONS.md`: the two clauses deleted from `CLAUDE.md` (", and it is the final
   approver before a plan is called done" and " until the human reviews") are kept there word
   for word, so Decision 33 holds.

Full `npm test` after the fixes: tests 12,690, pass 12,690, fail 0, skipped 0; coverage 99.87%
against 99%; `[CTOC test-gate] PASS`. Lint with zero warnings allowed: clean.

**End-to-end run** (driver and transcript in the session scratchpad, `e2e-slice3/`, never in
the repository): a fresh scratch project whose `npm test` runs a real test suite, driven only
through this branch's `src/commands/start.js`. The human approved plans A ("Search by title")
and C ("Audit trail"); the menu claimed both builds. C's build agent completed its own task
(`menu task complete t2 --summary built`): Step 14 ran `npm test` for real, C moved to review
with a passing record. The human held C (`stream answer review/audit.md ctoc-hold hold`). A's
build agent completed its own task (`menu task complete t1 --summary built`): review, passing
record. The gate critic's classified empty question file was dropped for plan B ("Export to
CSV"). The session's `menu task complete t1 --continue --summary ignored` returned `ok: true,
alreadyCompleted: true, completion: null`, text "Task t1 was already completed by its agent ·
finished on their checks: Search by title · moved on: Export to CSV · started building: Export
to CSV", and `promote` holding the claimed build t3 of B. After it: A in `done/` with a
`pipeline` entry ending "crossed on evidence, not approved by the human"; C still in `review/`,
its human crossing record unchanged; B crossed into `todo` on a `sufficiency` entry and on into
building; t1's stored record unchanged. A second `--continue` on t1 crossed nothing; the same
call without `--continue` is still refused ("invalid transition done → done").

**What the run showed that this plan's files do not cover** (reported, not changed):
- The default screen shows the held plan C as "Is “Audit trail” finished?" with "Yes — it's
  finished — Recommended — everything checks out", and does not say it is held. Case 20 of
  slice 2 covers a held plan that has questions; a held plan with no questions file falls back
  to the plain screen (`src/lib/streaming-gate.js`).
- The environment and compliance lines the default screen prints still say "The four human
  gates stay mandatory" (`src/commands/start.js` / its screen code).
- The status lines "nothing is finished until you say so" (beside the held plan, and on the
  decision header) are untrue for plans that finish on their checks.
- The answers log starts with an empty line before the first entry.
