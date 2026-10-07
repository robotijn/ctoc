---
title: "An urgent change too big for a hotfix goes ahead as an emergency change and waits for the owner's review"
type: implementation
created: 2026-10-07
priority: high
effort: large
parent_plan: ctoc-checks-that-a-hotfix-is-really-small-and-safe
depends_on: ctoc-checks-that-a-hotfix-is-really-small-and-safe-s2-a-labelled-commit-needs-a-passing-check
files:
  - src/lib/hotfix-check.js
  - src/commands/start.js
  - tests/hotfix-emergency.test.js
  - tests/protect-records.test.js
  # Ratchet, not counted toward the slice size: this slice creates a test file, which moves
  # the test-file count in CLAUDE.md.
  - "CLAUDE.md"
---

# An urgent change too big for a hotfix goes ahead as an emergency change and waits for the owner's review

Slice 3 of 4 of `plans/functional/ctoc-checks-that-a-hotfix-is-really-small-and-safe.md`:
the emergency path, its one question about stored data, and the review item with its two
answers.

## Problem statement

After slices 1 and 2, a change the owner called urgent is judged like any hotfix: small and
safe goes through, anything else is refused and planned. The functional plan says "urgent" is
the owner's own approval of a fast route: when the hotfix test refuses an urgent change, it
goes ahead now as an emergency change under seven conditions (readable, at most 10 files and
200 changed lines, nothing that governs the work, stored data asks once, the existing tests
pass, one commit labelled "emergency:"), and then waits in the owner's open decisions until he
answers "Keep it as it is" or "Keep it and make a normal plan to redo it with tests and
review". Slice 2's hook already refuses an "emergency:" commit without an emergency record;
nothing writes such a record yet, so today every emergency commit is refused.

## Technical approach

### The urgent option (`src/lib/hotfix-check.js`)

`hotfix check --urgent [--run-tests] [<file> ...]`. Rule 1 is read first; with `--urgent`, a
rule-1 failure gives the emergency refusal with the same clause. Rules 2, 7, 4, 5, 6 and 3 run
as in slice 1.

- **No hotfix rule fails**: exactly slice 1 (the `checking` answer, then the test run). A
  passing test run is a hotfix (`hotfix:` record, no review). A failing or empty test run is a
  failed emergency condition too, so the answer is the emergency refusal with that clause —
  never a second test run.
- **A hotfix rule fails** — its clause is the first reason — and the emergency conditions run
  in this order, the first failure giving the emergency refusal
  `I did not go ahead as an emergency change because <clause>; it goes through a normal plan
  marked high priority, and your edits stay in place, not committed.`:
  1. **Size ceiling**: n changed lines over every file (an added file counts its lines, a
     deleted file its old lines), m files; n > 200 or m > 10 → `it changes <n> lines in <m>
     files and an emergency change is at most 200 lines in at most 10 files`.
  2. **What governs the work**: the first file, in sorted order, whose base name is
     `CLAUDE.md` (any letter case) or that has a folder `.claude` or `.ctoc` in its path, or —
     in CTOC's own repository (the root `package.json` names `ctoc`) — that lies under
     `hooks/`, `src/hooks/` or `.claude-plugin/`, or is `src/lib/approval-*.js`,
     `src/lib/gate-*.js`, `src/lib/streaming-gate.js`, `src/lib/hotfix-check.js` or
     `src/lib/protected-paths.js` → `it changes <file>, which sets the rules the work follows,
     and only a normal plan changes that`.
  3. **Stored data asks first**: a database file (slice 1's predicate: `.sql`, or a folder
     `migrations`, `migration` or `migrate`) and no go-ahead record for the change's binding →
     the stored-data question (below). Nothing is recorded and nothing may be committed.
  4. **The tests**: the first call answers `checking` with `next` = `hotfix check --urgent
     --run-tests '<file>' ...`; the test run uses slice 1's rule 8 (an emergency may include
     test files; rule 7 does not apply here). A failure or an empty run → the emergency
     refusal with that clause.
- **All conditions hold** → `verdict: 'emergency'`, `text` = `That is bigger than a hotfix
  (<first reason>), so it goes ahead as an emergency change and waits for your review among
  your open decisions.`, `commit` (`files`, `add` = `git add -- '<file>' ...` — `git add` of a
  deleted path stages the deletion — and `message` = `git commit -m 'emergency: <what
  changed>'`), and `record`. The record is written first; no emergency pass is reported
  without it.

**The emergency record** is slice 2's record with `kind: 'emergency'` (the binding covers
added files by their blob and deleted files as `deleted`), plus `firstReason`, `sensitiveWords`
(every rule-5 match over all files, each once, in path order), `files` with test files (rule
7's shape) first and each group sorted, `changedLines`, `tests`, and
`review: { status: 'open' }`. When a record for the same binding already holds an answered
review, that `review` is kept.

### The stored-data question

The answer is `verdict: 'ask'`, `text: ''`, and one question:
`{ question: 'This changes stored data, and reverting the commit cannot undo that. Go ahead as
an emergency change?', header: 'Stored data', options: [ { label: 'Make a normal plan',
description: 'Recommended — a revert cannot undo a change to stored data, so it gets a plan
and a review first.' }, { label: 'Go ahead as an emergency change', description: 'It is
committed now as an emergency change and waits for your review among your open decisions.' }
] }`, with `actions`: `'Make a normal plan': 'hotfix decline'` and `'Go ahead as an emergency
change': "hotfix go-ahead <binding> '<file>' ..."`.

- `hotfix decline` → `verdict: 'refused'`, `text` = the emergency refusal with the clause
  `it changes stored data, and reverting the commit cannot undo that`. It writes nothing.
- `hotfix go-ahead <binding> [<file> ...]` → recomputes the change of those files. A rule-1
  failure → the emergency refusal with that clause. A binding different from `<binding>` →
  nothing is recorded; `text` = `The change has moved on since you were asked, so nothing was
  recorded; here is the check of the change as it stands now.` followed by the urgent check's
  first answer for the current change. A matching binding → writes
  `.ctoc/state/verify/hotfix/go-ahead-<binding>.json` (`{ binding, at }`) and answers the urgent
  check's first answer, which now passes the stored-data condition. A `<binding>` that is not
  64 hexadecimal characters → the usage answer.

The owner's go-ahead is recorded only in the protected folder, never carried as an option a
caller could add to `hotfix check`.

### The review in the owner's open decisions

**`attachEmergencyReviews(result, root)` (new export; never throws).** Called by
`src/commands/start.js` on the default screen, after the environment and compliance questions
are attached:

- Reads every `.ctoc/state/verify/hotfix/*.json` that is not `go-ahead-*`; keeps those with
  `kind: 'emergency'` and `review.status === 'open'`.
- Finds each one's commit: `git log -n 200 --format=%H%x09%P%x09%s` at the top level; for each
  commit whose first parent is the record's `base` and whose subject starts with `emergency:`
  (letter case ignored), `git diff-tree -r -z --raw --no-renames --no-abbrev <base> <commit>`
  gives the committed change, and its binding must equal the record's. A record with no such
  commit (the change was never committed) is not listed.
- For the listed ones, oldest `checkedAt` first, it prepends to `result.text`:

  ```
  Emergency changes waiting for your review: <count>

  Emergency change: <commit subject after "emergency:", control characters removed, at most 120 characters>
    Files: <files, test files first> — <n> changed lines
    Not a hotfix because <firstReason>
    Sensitive areas: <words, or "none">
    Tests: <passCount> passed
    To undo it: git revert <commit id>
  ```

  and, while `result.ask.questions` holds fewer than four questions, adds one question for the
  oldest: `{ question: 'Emergency change: <subject>. Keep it as it is, or keep it and make a
  normal plan to redo it with tests and review?', header: 'Emergency change', options: [ {
  label: 'Keep it as it is', description: 'Close this review. The commit stays.' }, { label:
  'Keep it and make a normal plan', description: 'Close this review and add a plan to redo it
  with tests and review. The change stays in place.' } ] }`, with `actions`
  `'Keep it as it is': 'hotfix review <binding> keep'` and `'Keep it and make a normal plan':
  'hotfix review <binding> replan'`. Neither option is marked recommended: keeping or
  replanning is the owner's call.
- Any fault (an unreadable record, git missing) leaves that record out or the result
  unchanged; the menu always renders.

**`hotfix review <binding> keep|replan`.** For an open emergency record whose commit is found:

- `keep` → `review: { status: 'kept', answeredAt }`; status `Closed the review of the emergency
  change: <subject>. The commit stays.`
- `replan` → writes the plan below, then `review: { status: 'replanned', answeredAt, plan:
  'functional/<file>' }`; status `Closed the review and added the plan "<title>" to your plans.
  The change stays in place.`
- No open record, or no commit for it → status `There is no open emergency review for that
  change.`, nothing written.
- The answer is `streamingGateScreen(root, status)` (the owner's default screen, required
  lazily) passed through `attachEmergencyReviews`. The route writes only the record and, for
  `replan`, the plan file; it never runs a git command that changes anything.

**The normal plan.** `plans/functional/redo-emergency-change-<slug>.md`, `<slug>` the subject
lower-cased with every run of characters other than `a`–`z` and `0`–`9` turned into `-`,
trimmed, at most 60 characters (empty → the first 12 characters of the commit id); `-2`, `-3`,
… when the name is taken. Its frontmatter: `title` (JSON-quoted) `Redo the emergency change:
<subject> with tests and review`, `type: stub`, `status: stub`, `created`, `priority: HIGH`,
`parent_vision: "none (emergency change <first 12 characters of the commit id>)"`,
`depends_on: none`. Its body: `# <title>`; `## Problem Statement` naming the commit, the files
and changed lines, why it was not a hotfix, the sensitive areas and the test result, and that
the owner chose to keep it and redo it; `## Scope`: redo it through the normal pipeline with a
test that fails without it and a review, the change staying in place until then, and the undo
command; `## Acceptance Criteria`: three boxes — the behaviour the emergency change fixed is
covered by a test that fails without it; the change is reviewed; every file it touched is
covered by this plan.

### `src/commands/start.js`

In the no-arguments branch, after the compliance question is attached and before the setup
note is prepended: `require('../lib/hotfix-check').attachEmergencyReviews(result,
app.projectPath);`.

### Background agents

No hook change. `hotfix go-ahead`, `hotfix decline` and `hotfix review` record the owner's
answers, and keeps-working slice 2's background-agent table refuses every route it does not
list; slice 2 of this plan lists only `hotfix check`, so `hotfix check --urgent` is allowed and
the three answer routes are refused. The tests here prove both.

### Wiring — the live call sites

`attachEmergencyReviews` is called by `src/commands/start.js` on the screen every `/ctoc:start`
opens with; `hotfix go-ahead`, `hotfix decline` and `hotfix review` are reached through
`hotfixRoute`, which `menu-screens.route` calls (slice 1), from the actions the check's question
and the review question carry. The emergency record is read by the loaded hook (slice 2) and
by `attachEmergencyReviews`.

## Acceptance criteria

- [ ] Urgent, small and safe: the answers are slice 1's hotfix answers; no emergency record,
  no review on the default screen.
- [ ] Urgent, 40 changed lines in 4 files with logic in `src/cart.js`, tests passing: the
  answer's `text` is exactly `That is bigger than a hotfix (it changes program logic in
  src/cart.js), so it goes ahead as an emergency change and waits for your review among your
  open decisions.`; after `commit.add` and `git commit -m 'emergency: checkout crashes when the
  cart is empty'` the loaded hook allows the commit; the next default menu screen lists
  "Emergency change: checkout crashes when the cart is empty" with the four files, 40 changed
  lines, the reason, the test result and `git revert <commit id>`, and asks the review
  question.
- [ ] Urgent with failing tests, urgent with 350 lines in 12 files, urgent touching
  `CLAUDE.md`: each answers exactly the emergency refusal with the functional plan's clause; no
  record, no review, and an "emergency:" commit is refused by the hook.
- [ ] Urgent with `db/migrations/20261007_add_column.sql`: the stored-data question exactly as
  specified, "Make a normal plan" first and marked recommended; nothing is recorded until the
  owner answers; "Go ahead" leads to the test run and the emergency pass with no second
  question; "Make a normal plan" answers the stored-data refusal.
- [ ] "Keep it as it is" closes the review: the default screen no longer lists it, `HEAD` is
  unchanged.
- [ ] "Keep it and make a normal plan" closes the review and adds
  `plans/functional/redo-emergency-change-checkout-crashes-when-the-cart-is-empty.md` with the
  title, priority HIGH and the commit id; `HEAD` and the working tree are unchanged.
- [ ] A background agent may run `hotfix check --urgent`; it is refused `hotfix go-ahead`,
  `hotfix decline` and `hotfix review`.
- [ ] `npm test` passes: lint, typecheck, all tests, coverage at or above the floor, 0
  skipped; CLAUDE.md's test-file count updated.

## Risks

| Risk | Mitigation |
|---|---|
| The emergency path becomes routine | Each review stays on the owner's default screen until answered, with the count of open reviews on top |
| An emergency record for a change that was later rewritten never shows, and an emergency commit slips through unreviewed | The hook allows an "emergency:" commit only with a record whose binding equals the staged change, and the review finds the commit by that same binding; a commit with that label and no matching record cannot exist |
| A session or agent claims "urgent" the owner never said | The emergency commit still lands in the owner's review with its reason and the undo command; recorded in the hook's cannot-catch list (slice 2) |
| Looking up commits on every menu open is slow | It runs only when an open emergency record exists, at most one `git log` plus one `git diff-tree` per candidate commit |
| The commit subject, written by a session, carries control characters or markup into the menu and the new plan | Control characters removed and length capped at the one place the subject is read; the plan's title is JSON-quoted in its frontmatter; plan text is data to every agent that reads it |

## Decisions Taken Under Ambiguity

1. **The review item lives in the protected check record and is asked on the owner's default
   screen, not written as an inbox file.** The inbox folder (`.ctoc/inbox/questions/`) is
   agent-writable, so any agent could close or delete the owner's review — answering for him,
   which the owner's decision of 2026-10-07 forbids. The functional plan foresaw this ("the
   inbox may not suit a review item with two recorded answers; spike first"). The review is
   asked where the owner's open decisions are asked today, alongside the environment and
   compliance questions.
2. **The title and the undo command come from the actual commit, found by its binding**, so
   the session is never asked for a subject in advance and the review shows what was really
   committed; an emergency check that was never committed shows nothing.
3. **The owner's answers are their own routes** (`go-ahead`, `decline`, `review`), refused to
   background agents by the existing fail-closed table, and the go-ahead is kept in the
   protected folder, never as an option a caller could add.
4. **The second option's label is "Keep it and make a normal plan"**, with "to redo it with
   tests and review" in its description and in the question, because the question tool asks
   for short labels; the functional plan's scenario is met by the meaning and the question
   text.
5. **"Make a normal plan" is marked recommended**, as the functional plan's scenario states,
   although an owner's risk decision otherwise gets symmetric options (lesson 17): the owner
   approved that wording in the plan.
6. **CTOC's hook and gate code** is named concretely only in CTOC's own repository (root
   `package.json` named `ctoc`), because a user project's `src/hooks/` is usually application
   code (React hooks, for example).
7. **The emergency size counts every changed line, added and deleted files included**, since
   an emergency may add files (a new test) and the review must cover all of it.
8. **The first reason is the hotfix test's first failing clause in slice 1's order**, which is
   what the functional plan's scenario shows ("it changes program logic in src/cart.js" for a
   40-line change).
9. **The normal plan is written to `plans/functional/` as a stub**, the shape
   `vision-decomposer` already writes there; `functional` is not a gate destination in
   `approval-residency.js`, so nothing reverts it, and it then appears among the owner's
   decisions like any functional plan.
10. **A failing test run under `--urgent` ends in the emergency refusal at once**, because
    passing tests is one of the emergency conditions and a second run would only repeat it.

## Execution Plan

### Step 8: TEST
- [ ] Write `tests/hotfix-emergency.test.js`, driving `route(['hotfix', ...], root)` (awaited)
  in temporary git repositories with a passing or failing node:test suite, the loaded hook as a
  real process, and the default screen through `node src/commands/start.js` with no arguments
  in a temporary CTOC project (initialised by one bare menu call and committed). Each case is
  red today: `--urgent` is an unknown option and `go-ahead`, `decline`, `review` are unknown
  sub-commands.
  1. Urgent, one-word wording change, tests passing: slice 1's two answers; no file
     `kind: 'emergency'` under `.ctoc/state/verify/hotfix/`; the default screen has no
     "Emergency change".
  2. Urgent, 40 lines in 4 files (`src/cart.js` with a logic change, three `.md` files under
     `docs/`), tests passing: first answer `checking` with `next` holding `--urgent
     --run-tests`; second answer `verdict: 'emergency'` and the exact sentence; the record holds
     `kind: 'emergency'`, `firstReason`, `review.status: 'open'`.
  3. After case 2, `commit.add` and `git commit -m 'emergency: checkout crashes when the cart is
     empty'` (the loaded hook allows it), the default screen's text holds the subject, the four
     files, `40 changed lines`, `it changes program logic in src/cart.js`, the test result and
     `git revert <the commit id>`; `ask.questions` holds the review question with exactly the
     two options; `actions` maps them to `hotfix review <binding> keep|replan`.
  4. Urgent, 40 lines, a failing test: the exact emergency refusal with `the existing tests
     fail (tests/…: …)`; no record; an `emergency:` commit is refused by the hook.
  5. Urgent, 350 lines in 12 files: the size clause; the suite's marker file shows no test ran.
  6. Urgent, `CLAUDE.md` edited: the governing clause; and in a project whose `package.json`
     names `ctoc`, `src/hooks/x.js` edited: the governing clause naming it; in a project not
     named `ctoc`, `src/hooks/useCart.js` edited is not governing (its answer goes on to the
     tests).
  7. Urgent, `db/migrations/20261007_add_column.sql` plus a logic change, passing every other
     condition: `verdict: 'ask'`, the question, header and option labels exactly as specified,
     the first option's description starting `Recommended — `; nothing written under
     `.ctoc/state/verify/hotfix/`; an `emergency:` commit is refused by the hook.
  8. The "Go ahead" action (`hotfix go-ahead <binding> …`): a `go-ahead-<binding>.json` record;
     the answer is `checking`; the test run ends in the emergency pass with no second question.
  9. "Go ahead" after the migration file changed again: nothing recorded; the answer starts
     with the moved-on sentence and asks the question again.
  10. "Make a normal plan" (`hotfix decline`): the exact emergency refusal with the stored-data
      clause; nothing written.
  11. Review keep: `hotfix review <binding> keep` → the record's review is `kept`; the next
      default screen lists no emergency change; `HEAD` unchanged.
  12. Review replan: `hotfix review <binding> replan` → the plan file named in the acceptance
      criteria exists with the JSON-quoted title, `priority: HIGH`, the commit id and the three
      criteria; the record's review is `replanned`; `HEAD` and `git status` unchanged; a second
      emergency change with the same subject gets `-2`.
  13. Review of an unknown, malformed or already closed binding: the no-open-review status (or
      the usage answer for a malformed one); nothing written.
  14. An emergency record whose change was never committed and `HEAD` has moved on: not listed.
  15. An emergency change that adds `tests/cart.test.js` with the logic fix: the emergency pass;
      the review lists `tests/cart.test.js` first.
  16. The default screen never holds more than four questions (with the environment and
      compliance questions pending, the review question is left out and its text block still
      shows); an unreadable record file is skipped and the screen still renders.
  17. Urgent with a change git cannot read (not a repository): the emergency refusal with the
      rule-1 clause.
- [ ] Add to `tests/protect-records.test.js` (numbered after the file's last case, real hook
  process, `agent_id` set): `… start.js hotfix check --urgent README.md` allowed (red once
  keeps-working slice 2 is in and before this plan's slice 2 lists `hotfix check` — guard after
  slice 2); `… hotfix go-ahead <64 hex> README.md`, `… hotfix decline`, `… hotfix review <64
  hex> keep` refused with keeps-working slice 2's background-agent sentence (guard: the
  fail-closed table already refuses them; the cases pin it); an `emergency:` commit with a
  matching emergency record allowed (red today: no emergency record can be written).
- [ ] Run both files: every non-guard case red.

### Step 9: PREPARE
- [ ] Read this plan's slices 1 and 2 as built, and keeps-working slice 2's final
  `streamingGateScreen` and `start.js` no-arguments branch.
- [ ] Confirm `git add -- <deleted path>` stages the deletion and `git diff-tree -r -z --raw
  --no-renames --no-abbrev <base> <commit>` lists the same entries as the staged change on the
  installed git.

### Step 10: IMPLEMENT
- [ ] `src/lib/hotfix-check.js`: `--urgent`, the emergency conditions and sentences, the
  emergency record, the stored-data question, `go-ahead`, `decline`, `review`, the plan writer,
  `attachEmergencyReviews`.
- [ ] `src/commands/start.js`: attach the emergency reviews on the default screen.
- [ ] `CLAUDE.md`: the test-file count.

### Step 11: REVIEW
- [ ] The critic checks every sentence and clause against the functional plan character for
  character, and tries to get an emergency commit past the hook without a review appearing.

### Step 12: OPTIMIZE
- [ ] Confirm the default screen runs no git command when no open emergency record exists.

### Step 13: SECURE
- [ ] The security scanner checks: a crafted commit subject cannot inject into the menu text,
  the actions, the plan's frontmatter or a shell command; the plan file name cannot leave
  `plans/functional/`; a binding argument is validated before any path is built from it; a
  background agent cannot record any of the owner's three answers.

### Step 14: VERIFY
- [ ] `npm test`: lint, typecheck, all tests, coverage at or above the floor in
  `.ctoc/coverage-baseline.json`, 0 skipped, 0 flaky.
- [ ] Live once in a scratch CTOC project: an urgent logic fix goes ahead, is committed through
  the loaded hook, appears on `/ctoc:start`, and is closed with "Keep it and make a normal
  plan"; quote the screen text and the new plan's first lines in the build record.

### Step 15: DOCUMENT
- [ ] JSDoc on `attachEmergencyReviews` and every new internal function; the module header gains
  the emergency conditions, the question, the review and its two answers.

### Step 16: FINAL-REVIEW
- [ ] Every acceptance box above is checked against its evidence; the live screen is quoted.
