# Handoff — CTOC: restart required (plugin update removed the agents from the session); five plans in flight

<!-- Maintained by hand this time. Left by the previous Claude instance so the next
     one can continue. Treat as last-known state — VERIFY EVERY CLAIM AGAINST DISK,
     INCLUDING THIS FILE. -->

- Updated: 2026-09-30 16:30 by claude
- Branch: main
- Status: in progress — session must be restarted before any CTOC agent can be dispatched

## Why the restart
At 16:05 on 2026-09-30 the human's other session updated the installed plugin
(`~/.claude/plugins/installed_plugins.json`: ctoc@robotijn 6.14.67, lastUpdated
14:05 UTC). A plugin update withdraws every `ctoc:*` agent type from a running
session. Agents already running finished; nothing new could be dispatched. Restart
Claude Code in this repository, then resume below.

## The human's rulings this session (verbatim where quoted)
- "improve every skill and every agent 3 times using websearch and ultrathink"
  → plan `every-agent-and-specialist-skill-improved-three-times` (121 slices).
- README: "rebuild the readme completely if needed"; "don't call it lessons, just
  show how to use it and explain why, start with a quickstart"; "sequence it the
  order that a plan goes through the ctoc system" → plan
  `the-readme-matches-the-product-today` (15 slices).
- "add the ask-me-questions and deepthink skill to the ctoc installation" → plan
  `deepthink-ships-with-ctoc` (4 slices, 00397–00400).
- "stop asking theswe stupid questions fix it" — settle forks as documented choices.
- "keep going until everything is done then commit and push" — NO push until all done.
- "ctoc is overdoing the usage of ctoc, small changes … do not require a complete
  ctoc run" and "there are too many pre-mortms and way too many devils-advicate being
  started when i use ctoc on another project" → plan `small-changes-take-a-small-path`
  (approved into implementation; SLICING NOT DONE — the planner was cut off by the
  usage limit; re-dispatch a fresh implementation-planner with the brief in the plan's
  own "Notes for the implementation planner").
- "there are now 100+ ctoc menu items! remove them I only want start, update,
  deepthink, ask-me-questions" then "do it" → plan
  `the-menu-shows-only-the-skills-a-human-invokes` (a single plan, no slices; in
  `plans/todo/`, FIRST in `.ctoc/state/todo-order.json`). His "do it" was taken as
  the approval for both planning moments and is recorded as `approved_by: human`.
  Push stays (it is a command, not a skill) — say "remove push" and it goes.
- "make the testing agents smarter so that when running tests only the parts are run
  that the code touched not the entire suite, only before pushing to git the entire
  test suite is running" → NOT YET PLANNED (agents were gone). Write a functional
  plan: executor verify-in-loop runs the tests that read the touched files (the
  read-tracing preload the inventory slice used; `coverage-mapper` /
  `smart-test-runner` exist but are unwired); the full `npm test` with the coverage
  floor runs only at `/ctoc:push` and the wave barrier. Memory file
  `feedback_affected_tests_in_loop_full_suite_before_push.md` records it.

## Where each plan stands
| Plan | Stage | State |
|---|---|---|
| Detector fix `00259` | review | verify passed; waiting for "finished" |
| Agent-critic web grant `00261` (s1) | review | v6.14.68; waiting for "finished" |
| Inventory + record check `00262` (s2) | review | v6.14.69; waiting for "finished" |
| Reviewer agent + skill `00263` (s3) | review | v6.14.70, commit 56db38d5; waiting for "finished" |
| Improvement slices `00264`–`00381` (s4–s121) | todo | approved, queued in order |
| README slices `00382`–`00396` | todo | approved; `00394` depends on `00381` |
| Deepthink slices `00397`–`00400` | todo | approved |
| Menu fix (single plan) | todo, FIRST | approved; build it next |
| Change paths + fleet volume | implementation | approved as "what to build"; needs slicing, then the "how to build" click |

Unpushed commits: 50c970b5 (6.14.68), 5d688c3f (6.14.69), 56db38d5 (6.14.70).
Uncommitted: the four plan moves to review, `.ctoc/approvals/*` for every approved
plan, `.ctoc/state/todo-order.json`, `plans/todo/*`, `plans/implementation/*`, the
`.ctoc/logs/transitions.json` growth, `.ctoc/streaming/questions/*` untracked files.
Commit these as `chore(plans): …` before building; never `git add -A` blindly.

## The round protocol that worked (slice s3, 2 files, ~4 hours)
Per file, per round: (1) citation-validator does the WEB RESEARCH (the installed
critic has no web tools — the repository's critic gained them in 6.14.68, but the
installed plugin is older; after a marketplace update to ≥6.14.68 the critic can
research itself); (2) agent-critic, via SendMessage on the same agent (keeps
context), turns the research into findings with exact `proposed_change {old,new}`;
(3) executor (also kept alive via SendMessage across the whole slice) applies, runs
the inventory's `tests_reading` for the file + the record check; (4) validator
re-validates the edited file; (5) leftovers fixed, re-checked; (6) executor writes
the round entry (shape: parent index "The record's exact shape"; check:
`tests/agent-and-skill-improvement-record.test.js`). Round source classes: 1 original
papers + vendor docs; 2 standards bodies + publishers (code-example correctness);
3 raw re-reads + regulators (the ANSSI/BSI PDF is saved under the session's
tool-results; `pdftotext` is installed and settles page-image disputes). Every
report is saved verbatim under `.ctoc/audit/improvement-run-notes/` (extract the
last assistant text block from the subagent JSONL). Dispatch ids: `d-s<N>-<agent|skill>-r<k>-<research|critic|revalidate>`.
Late corrections to a finished file IN THE SAME SLICE are allowed (plan rule); to a
file in a finished slice they need the scope-growth question.

## Gotchas
- ONE build at a time on the shared tree (Tijn's rule). Never render the dashboard
  while a build runs: `start.js dashboard` reconciles and MOVES plans.
- The scheduler's `startAgent` picks the todo head by `.ctoc/state/todo-order.json`,
  then birthtime. `menu task start <id> --agent-id` fails after `startAgent` (already
  running) — harmless.
- `renumberImplementationPlans` is UNSAFE for `NNNNN-` placeholders; use
  `scratchpad/assign-numbers.js`'s approach: `allocatePlanNumber` per slice in order,
  then rewrite references.
- Validator misreads inline `a.b()` citations in plan prose as claimed files — cite
  in fenced blocks.
- Usage limit hits kill subagents; SendMessage resumes them after the reset.
- Co-author line: executors sign as Opus 5.5; the harness rule says Fable 5.1.

## Resume here (after restart)
1. `git status`; commit the plan/approval/order state as `chore(plans): …` (no push).
2. Ask the human "finished?" for the four review plans (or `done-all` per parent).
3. Build the menu fix: `startAgent(root,{force:true})` → it is the head → dispatch
   `iron-loop-executor` with the plan path, Rule 1 files, complete-once via
   `menu task complete <id>`; run its affected tests + full gate; commit patch bump.
4. Re-dispatch `implementation-planner` for `small-changes-take-a-small-path`
   (placeholders `NNNNN-`, then number), then the human's "how to build" click.
5. Write + approve the smart-test-selection functional plan; slice; queue it.
6. Continue the improvement run at s4 (`00264`, hallucination-detector agent+skill)
   with the round protocol above; then README slices; then deepthink.
7. When everything is done: full `npm test`, then push (the human's instruction).
