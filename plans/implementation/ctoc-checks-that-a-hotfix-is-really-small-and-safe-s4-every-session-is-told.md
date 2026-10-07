---
title: "Every session is told that a hotfix word is checked, and how to run the check and commit"
type: implementation
created: 2026-10-07
priority: high
effort: small
parent_plan: ctoc-checks-that-a-hotfix-is-really-small-and-safe
depends_on: ctoc-checks-that-a-hotfix-is-really-small-and-safe-s3-urgent-changes-and-their-review
files:
  - src/commands/start.md
  - .ctoc/templates/operating-lessons.md
  - CLAUDE.md
  - .ctoc/templates/CLAUDE.md.template
  - src/lib/ctoc-routing-reminder.js
  - src/lib/escape-phrases.js
  - tests/hotfix-words-are-instructed.test.js
---

# Every session is told that a hotfix word is checked, and how to run the check and commit

Slice 4 of 4 of `plans/functional/ctoc-checks-that-a-hotfix-is-really-small-and-safe.md`: the
instructions. Slices 1 to 3 built the check, the hook rule and the urgent path; nothing yet
tells a session when to run the check, how to read its answers, or how to write the commit the
hook will accept.

## Problem statement

CTOC's hooks stay hidden, so the only things that reach a session are the instruction file
every session reads in a CTOC project (its `CLAUDE.md`, whose managed lessons block CTOC
refreshes from `.ctoc/templates/operating-lessons.md` on `/ctoc:update`) and the menu's
instruction file (`src/commands/start.md`). Today both say the hotfix words skip planning
(the template's "Escape Hatches" line), none names the check, and the routing reminder still
says "let the human type an escape phrase" as if the phrase were the end of it. Slice 2's hook
refuses a labelled commit it cannot read exactly — including Claude Code's habitual heredoc
commit — so a session that is not told the plain `git commit -m '…'` form will be refused
until it learns it from the refusal.

## Technical approach

**`src/commands/start.md` (the menu's instruction file).**
- The Navigation Commands table gains the routes: `hotfix check [--urgent] [{file} …]` (the
  check, instant), `hotfix check [--urgent] --run-tests {file} …` (the test run — the `next`
  of a `checking` answer; background shell work), `hotfix go-ahead {binding} {file} …` and
  `hotfix decline` (the owner's two answers to the stored-data question — run only as his
  chosen action), `hotfix review {binding} keep|replan` (the owner's answer to an emergency
  review — run only as his chosen action).
- The NAV classification list gains `hotfix`; the `--run-tests` call is run as a background
  shell command (`run_in_background`, lesson 20), not as an agent and not as a task.
- A new section, "Hotfix words — the change is checked before it is committed", the recipe:
  1. When the owner's message holds "hotfix", "quick fix", "trivial fix", "trivial change" or
     "urgent" and you change files without a plan, make the edit, then run
     `node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" hotfix check` naming every file you
     changed, with `--urgent` when he said "urgent". "skip planning" and "skip iron loop" are
     his explicit order and are never checked.
  2. `verdict: 'checking'` → show its `text` as the one status line, run its `next` the same
     way in the background, and act on that answer when it finishes.
  3. `verdict: 'hotfix'` or `'emergency'` → show `text` when it is not empty; run `commit.add`;
     then commit on its own, `git commit -m 'hotfix: <what changed, in the owner's words>'`
     (`emergency:` for an emergency) — plain quotes, double quotes when the message holds an
     apostrophe, no `$`, backtick or backslash, never a heredoc, nothing else in the command.
  4. `verdict: 'refused'` → show `text` exactly; commit nothing; never revert, stash or delete
     the edit; start a normal plan for the request through the menu's create-plan flow
     (`claude:create-plan functional`), with priority HIGH when the owner said "urgent".
  5. `verdict: 'ask'` → pass its `ask` to AskUserQuestion and run the action of the owner's
     choice; never choose for him.
  6. A commit refused by CTOC's write protection says what to do; do it.
  7. A background agent doing the edit follows the same steps and may run `hotfix check`; it
     never runs `hotfix go-ahead`, `hotfix decline` or `hotfix review` (the owner's answers —
     the write protection refuses them).
- No other text in the file changes.

**`.ctoc/templates/operating-lessons.md` and `CLAUDE.md` (the managed lessons block, kept
identical by `tests/claude-md-keeps-every-rule.test.js`).** One paragraph after the
**Methodology** paragraph, inside the block: **Hotfix words are checked.** When the owner says
hotfix, quick fix, trivial fix, trivial change or urgent, make the change, run the menu's
`hotfix check` on the files you changed (`--urgent` when he said urgent), and commit only what
it passes, on its own, as `git commit -m 'hotfix: …'` or `git commit -m 'emergency: …'`; when
it refuses, show its sentence and make a normal plan. CTOC refuses a labelled commit without a
passing check. "skip planning" and "skip iron loop" are not checked. No existing sentence of
the block is changed (the rule inventory holds each word for word).

**`.ctoc/templates/CLAUDE.md.template` (new projects).** The "Escape Hatches" line becomes:
The owner can skip planning by saying "skip planning" or "skip iron loop". "hotfix", "quick
fix", "trivial fix", "trivial change" and "urgent" skip it only for a change CTOC's hotfix
check passes before the commit (see the lessons below).

**`src/lib/ctoc-routing-reminder.js`.** The directive's closing lines (`buildRoutingDirective`)
become: "If this change is genuinely too small for a plan, say so plainly and let the human
type an escape phrase; a hotfix word (hotfix, quick fix, trivial fix, trivial change, urgent)
is then checked by the menu's hotfix check before the commit. Do not route around the pipeline
silently." The module is not loaded today (its hook is unregistered); its text is kept true for
when it is.

**`src/lib/escape-phrases.js`.** The header comment gains what each phrase means since
2026-10-07: "hotfix", "quick fix", "trivial fix" and "trivial change" claim a change is small
and safe, and CTOC's hotfix check (`src/lib/hotfix-check.js`, the menu's `hotfix check`)
judges that claim before the commit; "urgent" asks for speed and, when the change is too big
for a hotfix, opens the emergency path; "skip planning" and "skip iron loop" are the owner's
explicit order and are never judged. The list itself does not change.

### Wiring — the live surfaces

`src/commands/start.md` is the file `/ctoc:start` loads; the lessons block reaches every CTOC
project's `CLAUDE.md` through `ensureLessonsBlock` on `/ctoc:update` (and this repository's own
`CLAUDE.md` directly); the template is written by `init-project.js` for a new project. The
routing reminder and the phrase list's header carry no live behaviour change.

## Acceptance criteria

- [ ] `start.md` names every `hotfix` route, classifies `hotfix` as instant and the test run as
  background shell work, and holds the seven-step recipe above.
- [ ] Every `hotfix …` route written in `start.md`'s table, run through `route` in a temporary
  git project, answers something other than the unknown-command answer.
- [ ] The lessons block in `.ctoc/templates/operating-lessons.md` and in `CLAUDE.md` holds the
  hotfix paragraph, the two blocks stay identical, and `CLAUDE.md` stays at or under 15,000
  bytes.
- [ ] The template's escape line, the routing directive and the phrase list's header say what
  the functional plan says; `buildReminder` still returns no text for a prompt holding an
  escape phrase.
- [ ] `npm test` passes: lint, typecheck, all tests (including `tests/menu-protocol.test.js`,
  `tests/claude-md-keeps-every-rule.test.js` and `tests/ctoc-routing-reminder.test.js`
  unchanged), coverage at or above the floor, 0 skipped; CLAUDE.md's test-file count updated.

## Risks

| Risk | Mitigation |
|---|---|
| The paragraph takes `CLAUDE.md` over its 15,000-byte limit | Step 9 measures the size with the paragraph added; if it would exceed the limit the build stops there and reports the measured size — it never shortens another rule, because the rule inventory holds every rule word for word |
| Keeps-working slice 3 edits the same files (`start.md`, `CLAUDE.md`, the lessons template, `docs/ENFORCEMENT.md`) | Plans build one at a time; whichever builds second starts from the other's text; neither depends on the other's content |
| A session ignores the instructions and commits a hotfix without the label | The functional plan's residual risk: the hook catches a labelled commit only; the paragraph is the mitigation |

## Decisions Taken Under Ambiguity

1. **The every-session instruction goes into the managed lessons block**, not only the
   template, because `/ctoc:update` refreshes the block in every existing CTOC project while
   the template reaches only new ones; it is a paragraph beside the Methodology paragraph, not
   a 21st lesson, because adding a lesson is the owner's own rule-making.
2. **All menu instructions for the hotfix check land in this slice**, after the three code
   slices, so `start.md` changes once and describes routes that exist.
3. **The refusal recipe starts the normal plan through the existing `claude:create-plan
   functional` flow**, the menu's one way to start a plan from a request.
4. **The plain `git commit -m` form is spelled out** (double quotes for an apostrophe, never a
   heredoc), because slice 2's hook refuses any labelled commit it cannot read exactly.
5. **This slice is over the three-file target** (six instruction files and one test): each is a
   paragraph or a line on one subject, and a session told by one surface and not another would
   act on whichever it read.

## Execution Plan

### Step 8: TEST
- [ ] Write `tests/hotfix-words-are-instructed.test.js`; each case red today:
  1. `start.md`'s Navigation Commands table holds rows for `hotfix check`, the `--run-tests`
     call, `hotfix go-ahead`, `hotfix decline` and `hotfix review`; the NAV classification list
     names `hotfix`.
  2. The "Hotfix words" section names the five judged words, `--urgent`, `next`,
     `commit.add`, `git commit -m 'hotfix:`, `emergency:`, the never-a-heredoc rule, that "skip
     planning" and "skip iron loop" are never checked, that a refusal never reverts, stashes or
     deletes the edit, priority HIGH for urgent, and that a background agent never runs the
     owner's three answer routes.
  3. Every `hotfix …` route in that table, with placeholders filled for a temporary git project
     (a changed `README.md`; a 64-character binding), run through `route` answers without
     `ok: false`.
  4. The lessons block of `.ctoc/templates/operating-lessons.md` holds the hotfix paragraph
     word for word (whitespace aside) after the Methodology paragraph.
  5. `.ctoc/templates/CLAUDE.md.template`'s escape line is the new sentence.
  6. `buildRoutingDirective()` holds the new closing sentence; guard: `buildReminder` for a
     prompt holding "hotfix" still returns `reason: 'escape-phrase'` and no text.
  7. The text of `src/lib/escape-phrases.js` holds the meaning of each of the seven phrases as
     specified, and `ESCAPE_PHRASES` is unchanged (guard).
- [ ] Run it: every non-guard case red.

### Step 9: PREPARE
- [ ] Measure `CLAUDE.md` in bytes with the paragraph added to its lessons block; above 15,000,
  stop and report the measured size.
- [ ] Read the then-current `start.md`, `CLAUDE.md` and lessons template (keeps-working slice 3
  may have changed them) and `tests/menu-protocol.test.js`'s pinned phrases.

### Step 10: IMPLEMENT
- [ ] `src/commands/start.md`: the table rows, the classification, the section.
- [ ] `.ctoc/templates/operating-lessons.md` and `CLAUDE.md`: the paragraph, identical in both;
  `CLAUDE.md`'s test-file count.
- [ ] `.ctoc/templates/CLAUDE.md.template`: the escape line.
- [ ] `src/lib/ctoc-routing-reminder.js`: the closing sentence of the directive.
- [ ] `src/lib/escape-phrases.js`: the header paragraph.

### Step 11: REVIEW
- [ ] The critic reads the recipe as a session would, on a fresh project, and follows it for a
  wording change, a refused change, an urgent emergency change and a stored-data change; any
  step it cannot carry out from the text alone is a finding.

### Step 12: OPTIMIZE
- [ ] The paragraph and the recipe say each thing once; no sentence repeats another surface
  word for word except where the two lessons files must be identical.

### Step 13: SECURE
- [ ] The security scanner confirms no instruction tells a session or agent to run the owner's
  answer routes on its own, to bypass the hook, or to change a record.

### Step 14: VERIFY
- [ ] `npm test`: lint, typecheck, all tests, coverage at or above the floor in
  `.ctoc/coverage-baseline.json`, 0 skipped, 0 flaky.
- [ ] One live run: a fresh session in a scratch CTOC project, told "hotfix: rename the Save
  button to Store", follows the instructions to a committed `hotfix:` change without being
  refused by the hook; quote its commands in the build record.

### Step 15: DOCUMENT
- [ ] The changed surfaces are themselves the documentation; the build record lists each
  sentence added.

### Step 16: FINAL-REVIEW
- [ ] Every acceptance box above is checked against its evidence; the live run is quoted.
