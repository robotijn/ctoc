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
  - .ctoc/false-green-baseline.json
  - tests/reachability.test.js
  - tests/menu-coverage.test.js
  - tests/gate-numbers-fence.test.js
  - tests/ledger-forgery-closed.test.js
  - tests/e2e-menu-lifecycle.test.js
  - tests/pretooluse-edit-coverage.test.js
  - tests/pretooluse-edit-escape-role-scoping.test.js
  - agents/iron-loop/iron-loop-executor.md
  - .ctoc/templates/operating-lessons.md
  - .ctoc/templates/saas/b2c-subscription/README.md
  - tests/areas.test.js
  - tests/compliance-ride-along.test.js
  - tests/iron-loop-enforcer-coverage.test.js
  - tests/lib-cmd2-batch.test.js
  - tests/project-root.test.js
  - tests/streaming-render.test.js
  - tests/menu-environment.test.js
  - tests/task-reconcile-coverage.test.js
  - tests/streaming-gate.test.js
  - tests/dashboard-wedge-reports.test.js
  - tests/export-reachability.test.js
  - tests/agent-layer-reachability.test.js
  - tests/dashboard-reconcile-failure.test.js
  - tests/inbox-stale-stream.test.js
  - tests/menu-task-wiring.test.js
  - tests/plan-index-search-ui.test.js
  - src/areas/system.js
  - src/lib/compliance-regime.js
  - src/lib/streaming-precompute.js
  - src/lib/task-view.js
  - src/lib/tui.js
  - agents/iron-loop/advocate-critic.md
  - agents/iron-loop/devils-advocate-critic.md
  - agents/iron-loop/premortem-critic.md
  - skills/iron-loop/advocate-lens/SKILL.md
  - tests/architecture-invariants.test.js
  - tests/greenfield-journey.test.js
  - tests/menu-screens.test.js
  - tests/dashboard-injection.test.js
  - .ctoc/templates/CLAUDE.md.template
  - tests/init-project.test.js
  - tests/init-project-coverage.test.js
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
    GRANT COMPLETED 2026-07-21: the first cut of files: was incomplete (built
    from an incomplete grep). The executor re-grepped, found nine load-bearing
    files that break npm test without the rename, two shipped TEMPLATES that
    inject ctoc:menu into every freshly initialized project, and comment/fixture
    references, all outside the grant, and correctly STOPPED rather than widen
    its own permission. Grant expanded to all of them under the human's standing
    all-day ruling: extend the grant to the files a change mechanically forces,
    fix them in one pass, never half-rename. The false-green baseline entry for
    src/commands/menu.js is RENAMED in place to src/commands/start.js (same
    finding, moved file) — never a new finding, count unchanged.

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

### The argv verb stays `menu` — only the file path and the slash command are renamed

The backing script's FIRST argv token is the internal machine verb: `route()` in
`src/lib/menu-screens.js` dispatches on `case 'menu':`, and every producer passes
it — the completion command `menu task complete`, `menu task add`, `menu commands`,
the scheduler wiring in `src/lib/task-reconcile.js`, `src/lib/streaming-render.js`,
and the `w10-*` tests. That token is INTERNAL: the user never sees it. What the user
sees is the slash command, which is the command file's basename, so renaming
`menu.md` to `start.md` is the entire user-visible change.

Renaming the verb `menu` to `start` would force a coordinated edit across every
producer and consumer of the token, several of which are the scheduler/task wiring
the brief flags as risk-bearing. Correctness (the wiring keeps working) outranks a
cosmetic match of an invisible token. So the verb is LEFT as `menu`; nothing that
reads or writes it changes; there is no half-rename where some call sites say `menu`
and others say `start`. Proven by running the `w10-*` task tests, the task-reconcile
tests, and the live completion path — all green after the file rename.

### The false-green baseline entry is renamed in place, not added or removed

`.ctoc/false-green-baseline.json` `findings` held
`src/commands/menu.js:silent-catch:activateCurrentArea`. After the file rename the
scan emits the SAME finding at the SAME symbol from the moved file
(`src/commands/start.js:silent-catch:activateCurrentArea`). The baseline key is
renamed in place — the finding count is UNCHANGED, nothing is added, nothing is
removed, and the silent-catch itself is untouched (fixing it would be scope creep on
a rename). Verified by running the false-green scan after the rename and confirming
the emitted key matches the renamed baseline key with the count unchanged.

### The two `pretooluse-edit-*` tests are inverted to assert the new command name

`tests/pretooluse-edit-coverage.test.js` and
`tests/pretooluse-edit-escape-role-scoping.test.js` asserted the block banner points
at `/ctoc:menu`. The banner's SOURCE (`src/hooks/PreToolUse.Edit.js`, in grant) now
prints `/ctoc:start` because the owner replaced the command name. The three-part
justification for changing a test: (1) the contract genuinely changed — the owner
renamed the command; (2) the source moved to `/ctoc:start`, so the old assertion is
now wrong; (3) the assertion now pins `/ctoc:start` and is structured so a regression
back to `menu` fails. This tightens toward the real behaviour, it does not loosen.

### Comment/fixture-only references — what was changed and what was deliberately kept

Stale prose mentions of `commands/menu.js` / `/ctoc:menu` in shipped or test text are
updated to `start.js` / `/ctoc:start` so no reader is misled. The synthetic
reachability and export-reachability fixtures that use `src/commands/menu.js` are NOT
arbitrary — they represent the SANCTIONED command root, which is now
`src/commands/start.js` (see `SANCTIONED_SCRIPT_ROOTS` in `reachability.js`), so they
were swapped to `start.js` to stay a valid root. The one genuine keep is
`tests/plan-index-conflict.test.js`, whose fixture literal is `src/lib/menu.js` (a
lib path invented for the plan-index test), unrelated to the command file — left
untouched.

### A SIXTH miss — the `.template` extension escaped every grep filter

A post-build check found `.ctoc/templates/CLAUDE.md.template:98` still emitting
`/ctoc:menu` into every freshly initialized project's generated CLAUDE.md. It escaped
all prior sweeps because the file's extension is `.template`, not `.md`, and every
grep used `--include="*.md"`. The coordinator granted the template plus its two reader
tests (`tests/init-project.test.js`, `tests/init-project-coverage.test.js`). The table
row `| /ctoc:menu | Dashboard … |` became `| /ctoc:start | … |`; a whole-template sweep
found no other reference. Neither reader test asserts on the command-name string, so
per the instruction nothing in them was changed; both were run and pass (`73` of `73`),
proving the generated-output change did not break their assertions. The FINAL sweep was
re-run over directories directly — no `--include` filter, so `.template` is covered —
and returns ZERO across all five reference forms. A positive control confirmed the sweep
reaches `.template` files.

### Step 14 VERIFY result — GREEN

`npx eslint <61 changed files> --max-warnings 0` exited `0`. `node --test tests/*.test.js`
reported `tests 10316`, `pass 10316`, `fail 0`, `skipped 0`. `npm test` (the real gate)
printed `coverage 99.02% (threshold 99%), skipped 0, failed 0` and `PASS`. The named
fences ran green as a set: `tests 89`, `pass 89`, `fail 0` (false-green, file
reachability, export reachability, gate-words). The false-green baseline changed by
exactly one line — a path-rename in place — with the findings count held at `210`.
`reachability-baseline.json` and `coverage-baseline.json` were untouched; no whitelist
entry was added; the floor stayed `99`. The Step 8 suite flipped from `7` red to `7`
pass, and `node src/commands/start.js dashboard` returns the `{ text, ask, actions }`
contract, so the renamed command works for a human. Per the coordinator's instruction
the plan was NOT committed, pushed, or moved — it waits in in-progress for the
coordinator to commit and push once the whole suite is confirmed green.

### Step 14 VERIFY — RE-VERIFIED at review (2026-07-27)

Re-ran the real gate on the review-stage tree to confirm the rename still holds against
a repository that grew after the original snapshot above. `npx tsc --noEmit` exited `0`.
`npm test` (the full gate via `test-gate.js` — whole suite + coverage floor + zero-skipped)
printed `tests 10528`, `pass 10528`, `fail 0`, `skipped 0`, `coverage 99.15% (threshold 99%)`
and `PASS`. The earlier snapshot (`10316` tests, `99.02%`) is not stale-wrong — the counts
rose only because unrelated work landed in the tree between the original build and this
review re-verification; the floor and the verdict are unchanged. A tree-wide grep confirms
ZERO `ctoc:menu` in shipped `src/`, `docs/`, `README.md`, `CLAUDE.md`; `src/commands/menu.md`
and `menu.js` are gone, `start.md`/`start.js` present; the false-green baseline carries the
renamed key `src/commands/start.js:silent-catch:activateCurrentArea`. The mid-build "STOP AND
ASK" grant-gap note below was RESOLVED before ship — the grant was expanded to every
mechanically-forced file (see the `scope_extension` "GRANT COMPLETED" note) and no
out-of-grant `menu` reference survives in shipped code. The two remaining `commands/menu`
mentions are `tests/ctoc-start-command.test.js` asserting the old files are absent (correct)
and the runtime `.ctoc/streaming/` cache (not shipped, not staged).

### The argv verb decision is FINAL (accepted)

The coordinator accepted keeping the internal `menu` argv token (rename only the file
path and the slash command). Recorded as final: the token is a machine contract
invisible to the user, renaming it risks the scheduler wiring for zero user benefit,
and a half-rename is worse than none.

### Line-number citations in the critic agents — verified, filename-only change

The three critic agent definitions and the advocate-lens skill cite specific lines in
the command file (`src/commands/menu.md:264`, `:290-296`, `:236-266`, `:238-239`,
`:256-262`, `:287-289`). Because the rename edits substituted characters WITHIN lines
(`menu.js` to `start.js`) and never added or removed a line, every line number is
preserved. Each cited line was OPENED in `start.md` and confirmed to contain exactly
the recipe its citation claims: `:264` passes Related-plans as data, `:290-296` is the
parallel lens dispatch, `:236-266` is corpus retrieval, `:238-239` is the plan-index
key shape, `:256-262` is the fail-open degrade, `:287-289` is concept-search. So the
change was filename-only (`menu.md` to `start.md`) and every verified line number was
KEPT. No line number was invented or dropped; all fourteen citations remain precise.

### A FOURTH reference form — a require WITHOUT a file extension

After the second grant expansion a fourth form surfaced: `require('../src/commands/menu')`
with NO `.js` extension, which Node resolves to the renamed file and which none of the
extension-bearing patterns matched. It appeared in six test files, ALL already inside
the 74-path grant (`fresh-repository-is-its-own-project`, `init-tells-the-truth`,
`menu-reports-what-init-did`, `scheduler-enforced`, `w10-live-agent-reconcile`,
`w10-task-arg-splitting`), so no further stop was needed — they were fixed to
`require('../src/commands/start')`. A whole-tree sweep for the bare form confirmed no
out-of-grant file used it.

### The one deliberate keep — an unrelated fixture literal

`tests/plan-index-conflict.test.js` uses the literal `src/lib/menu.js` as an invented
plan-index fixture path (testing corpus-literal counting), unrelated to the command
file at `src/commands/`. It is NOT in the grant and was deliberately left unchanged.

### A SECOND grant gap was found by an exhaustive sweep — STOP AND ASK a second time

The first grant expansion, like the first cut, was built from a grep that searched
only the `commands/menu.js` path form and the `ctoc:menu` string. It missed three
forms: a bare `menu.md`, a bare `menu.js`, and the `path.join('commands', 'menu.md')`
split form. An exhaustive sweep over every `.js`/`.md`/`.json`/`.yaml` file
(excluding `plans/` and the runtime `.ctoc/streaming/` cache) found more files
outside the 58-path grant that reference the renamed files, five of them
LOAD-BEARING (they read the now-renamed `menu.md`/`menu.js` from the real tree and
will fail `npm test`). Per the standing rule the executor stopped rather than widen
its own permission. The full categorized list is in the surfaced fork; the executor
did NOT edit any of them. All IN-GRANT work is complete; only the out-of-grant
remainder blocks the green gate.

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
