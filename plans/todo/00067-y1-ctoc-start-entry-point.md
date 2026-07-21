---
approved_by: human
approved_at: 2026-07-21T12:00:00.000Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "The command is ctoc:start, not ctoc:menu — a rename, nothing else"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: fresh-repository-first-run
files:
  - src/commands/menu.md
  - src/commands/menu.js
  - src/hooks/PreToolUse.Bash.js
  - src/hooks/PreToolUse.Edit.js
  - src/hooks/SessionStart.js
  - src/hooks/human-gate-check.js
  - src/scripts/ledger-backfill.js
  - src/lib/init-project.js
  - src/lib/tabs.js
  - src/lib/app-runner.js
  - src/lib/human-facing-scan.js
  - src/lib/reachability.js
  - src/lib/streaming-render.js
  - src/lib/streaming-gate.js
  - src/lib/cache.js
  - src/lib/menu-screens.js
  - src/lib/task-reconcile.js
  - src/areas/agent.js
  - README.md
  - CLAUDE.md
  - docs/AGENT_ARCHITECTURE.md
  - .ctoc/reachability-roots.json
  - tests/ctoc-start-command.test.js
  - tests/fresh-repository-is-its-own-project.test.js
  - tests/init-tells-the-truth.test.js
  - tests/menu-reports-what-init-did.test.js
  - tests/scheduler-enforced.test.js
  - tests/w10-task-arg-splitting.test.js
  - tests/w10-live-agent-reconcile.test.js
  - tests/w10-push-entry-point.test.js
  - tests/menu-protocol.test.js
  - tests/menu-auto-init.test.js
  - tests/claude-md-lessons.test.js
  - tests/slash-command-no-model-pin.test.js
  - tests/readme-numbers.test.js
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-21
  reason: >
    The owner asked, in plain words and more than once — "it should be
    ctoc:start not ctoc:menu" — and again in anger while the command still read
    ctoc:menu. This plan previously bundled that rename inside a 22-file
    entry-point REDESIGN (new modules start-screen.js, decision-matrix.js,
    question-cadence.js — a "one open prompt" rework) that the owner never
    asked for, and that over-scoping is why a simple rename sat unbuilt all
    day. Stripped to exactly the rename he requested. He alone schedules; the
    redesign is not scheduled and is not in this plan.

# The command is ctoc:start, not ctoc:menu

The owner types `/ctoc:` and sees `ctoc:menu`. He asked for `ctoc:start`. In
Claude Code a plugin command's NAME is the command file's basename, so
`src/commands/menu.md` is literally what renders `/ctoc:menu`. Nothing changes
the visible name except renaming that file.

This is a rename and only a rename. CTOC still ships exactly THREE slash
commands — after this they are `start`, `push`, `update`. No new command, no
alias (the owner said "not ctoc:menu", which is a replacement), no behaviour
change, no redesign.

## What changes

1. **Rename the command file** `src/commands/menu.md` → `src/commands/start.md`.
   This is what makes `/ctoc:start` appear and `/ctoc:menu` disappear.
2. **Rename the backing script** `src/commands/menu.js` → `src/commands/start.js`,
   so the internal filename does not contradict the command. Update the
   invocation lines inside the command file that call it.
3. **Update every reference to the old path** `commands/menu.js` →
   `commands/start.js` in source, hooks, scripts and tests that require or name
   it, and `.ctoc/reachability-roots.json` if it names the path.
4. **Update every user-facing mention** of `/ctoc:menu` / `ctoc:menu` →
   `/ctoc:start` / `ctoc:start` in command output, hook messages, docs
   (`README.md`, `CLAUDE.md`, `docs/AGENT_ARCHITECTURE.md`) and the project
   instructions' own "3 slash commands" line.
5. **Keep gate-number and other wording untouched** — this plan changes only
   the command name. Do not regress the gate-words work that just shipped.

## What does NOT change

- The dashboard behaviour, the state machine protocol, the subcommands. The
  `menu task add …` argv verb passed to the script is an INTERNAL token, not
  the slash command; renaming the script path must not break the scheduler
  wiring. Decide whether the argv verb stays `menu` or becomes `start` and
  record it — correctness (the wiring keeps working) outranks cosmetics here.
- The count of slash commands stays three.
- No new modules. The redesign is out of scope by the owner's schedule.

## Decisions Taken Under Ambiguity

(Executor continues numbering here, `###` subheadings only, numbers as inline
code spans never fenced `#` lines.)

## Step 8 — TEST (TDD, write first, run, see red)

Write `tests/ctoc-start-command.test.js` FIRST and see it RED:
- `src/commands/start.md` exists and `src/commands/menu.md` does not.
- `src/commands/start.js` exists and `src/commands/menu.js` does not.
- No shipped, human-or-tool-facing file under `src/`, `docs/`, `README.md` or
  `CLAUDE.md` contains the literal `ctoc:menu`. A historical mention inside a
  plan file is not shipped and is out of this assertion's scope.
- The command still resolves: running the renamed script produces the
  dashboard JSON contract `{ text, ask, actions }`, exactly as before.
- Exactly three command files exist in `src/commands/`: `start`, `push`,
  `update`.

## Step 9 — PREPARE
Re-verify every reference against the live tree before editing; the reference
list in this plan was read on 2026-07-21 and the executor MUST re-grep. If a
reference to `commands/menu` or `ctoc:menu` exists in a file NOT in this plan's
`files:`, STOP AND ASK — do not edit it and do not widen the grant.

## Step 10 — IMPLEMENT
Perform the renames and reference updates. Sub-items are the files above.

## Step 11 — REVIEW
No `ctoc:menu` or `commands/menu.js` reference survives in shipped code, tests
or docs; the three-command invariant holds.

## Step 12 — OPTIMIZE
None expected; a rename adds no complexity.

## Step 13 — SECURE
The command file is an entry point; confirm the renamed script keeps the same
guards and no path became injectable through the rename.

## Step 14 — VERIFY
`npx eslint <changed> --max-warnings 0`; `node --test tests/*.test.js` fail 0;
`npm test` real gate; false-green + both reachability fences + the gate-words
fence pass; floor 99 untouched.

## Step 15 — DOCUMENT
The docs updates above ARE the documentation; confirm they read `ctoc:start`.

## Step 16 — FINAL-REVIEW
The owner opens the tool, types `/ctoc:`, and sees `start`, not `menu`.
