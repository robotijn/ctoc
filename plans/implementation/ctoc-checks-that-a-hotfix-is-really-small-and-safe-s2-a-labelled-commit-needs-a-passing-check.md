---
title: "A commit labelled hotfix or emergency goes through only when a passing check matches exactly what is staged"
type: implementation
created: 2026-10-07
priority: high
effort: medium
parent_plan: ctoc-checks-that-a-hotfix-is-really-small-and-safe
depends_on: ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check, ctoc-keeps-working-and-asks-only-what-matters-s2-plans-cross-on-their-evidence
files:
  - src/hooks/protect-records.js
  - src/lib/hotfix-check.js
  - docs/ENFORCEMENT.md
  - tests/protect-records.test.js
  - tests/hotfix-check.test.js
---

# A commit labelled hotfix or emergency goes through only when a passing check matches exactly what is staged

Slice 2 of 4 of `plans/functional/ctoc-checks-that-a-hotfix-is-really-small-and-safe.md`.
It carries out the owner's decision of 2026-10-07 (answer "a", recorded in the functional
plan): the one loaded hook refuses a hotfix-labelled commit without a passing check.

## Problem statement

After slice 1 the check exists, but nothing makes a session run it: CTOC's hooks stay hidden,
and a session that heard "hotfix" can edit and commit without ever asking. The owner chose
(2026-10-07, answer "a") that the one hook Claude Code loads — `src/hooks/protect-records.js`,
registered alone by `hooks/hooks.json` — refuses a shell `git commit` whose message starts with
"hotfix:" or "emergency:" unless a passing hotfix check record exists for exactly the staged
change, bound to the staged content and the commit it builds on. The record must live where
that same hook already keeps agents out (under `.ctoc/state/verify/`), so only the menu's
`hotfix check` route can write it. The `/ctoc:push` variant is dropped.

Two facts the build must respect:

- Keeps-working slice 2 (in flight on its own branch) is changing the same hook: when the
  hook input carries a non-empty `agent_id`, a menu call is allowed only for a fixed list of
  routes, read with one strict reading of the command — a single simple direct call, its
  arguments read the way `start.js` receives them, anything else refused. This slice builds on
  top of that version.
- The coordinator's constraint (2026-10-07): the commit rule uses that same single reading of
  the `git commit` command, never a second tokenizer, and fails closed on any label it cannot
  read exactly — a message passed through a file, a heredoc or an editor — saying so.

## Technical approach

### The record (`src/lib/hotfix-check.js`)

**The binding of a change.** `sha256('ctoc-hotfix-binding-v1\n' + base + '\n' + lines)`,
where `base` is the full object id of `HEAD`, and `lines` is one line `<path>\t<blob>\n` per
file in code-unit order of `path` (top-level-relative, `/`), `blob` being the file's object id
as it will be staged, or `deleted` for a deleted file. Hexadecimal, 64 characters.

**On every pass the check writes a record.** It computes the binding the change will have once
its files are staged — `base` from `rev-parse --verify HEAD^{commit}`, each blob from
`git hash-object -- <path>` at the top level (git's own clean filters and line-ending
conversion, exactly as `git add` applies them; nothing is written to the object store) — and
writes `.ctoc/state/verify/hotfix/<binding>.json`:
`{ kind: 'hotfix', binding, base, paths, files, changedLines, tests: { ran, passCount, note },
checkedAt }` (through `./safe-fs`, folder created when missing; the same change overwrites its
own record with the same content). The pass screen gains `record` (the record's
project-relative path). When the record cannot be written, the answer is the refusal
`I could not read the change (the check stopped: its record could not be written: <message>)`:
no pass is reported without its record. A refusal writes nothing.

**One new export, `labelledCommitIsChecked({ root, cwd, kind }) → boolean`**, for the hook:
the top level from `cwd`, `base`, and the staged change from `diff --cached --raw -z
--no-renames --no-abbrev` (status `D` → `deleted`, otherwise the new object id), through the
same git helper slice 1 built; its binding; then true only when
`<root>/.ctoc/state/verify/hotfix/<binding>.json` parses and holds that `binding`, that `base`
and `kind`. Any git or read failure → false. Nothing staged gives the binding of an empty
change, for which the check never writes a record (rule 1 refuses "nothing has changed").

### The hook rule (`src/hooks/protect-records.js`)

**Where it runs.** For a Bash call that is not the menu, after the existing record rules
(their sentence wins when both apply), and only when the project root walk
(`describeProjectRoot(payload.cwd)`, the walk `findProjectRoot` already delegates to) reports
the marker `ctoc` or `plans` — a project that is not a CTOC project is left alone. It applies
to the main session and to background agents alike.

**One reading of the command.** The rule calls the command reader keeps-working slice 2 gives
the hook — one simple direct call turned into its arguments the way `start.js` receives them,
or nothing for anything else (a `$` other than `${CLAUDE_PLUGIN_ROOT}`, a backtick, a
backslash, an unclosed quote, an unquoted `;`, `&`, `|`, `<`, `>`, carriage return or line
break). If slice 2 left that reading inside the menu-specific function, it is split into its
own internal function that both the menu rule and this rule call, with no behaviour change for
the menu rule. No second tokenizer is written.

**The decision**, `commitLabelDecision(command, cwd, root) → null | 'unchecked' | 'unreadable'`
(internal). "Holds a label" below means the raw command text matches `hotfix:` or
`emergency:` (letter case ignored) — a presence test, never a parse.

1. **The reader returned `git commit …`** — the first argument's base name (`.exe` removed) is
   `git` and the second argument is `commit`. Walk the rest: `-q` and `--quiet` are allowed;
   `-m X`, `--message X` and `--message=X` collect a message; `-F X`, `--file X` and
   `--file=X` note a message file; anything else (`-a`, `-am`, `--amend`, `-C`, `--fixup`,
   `--`, a path, …) is "other".
   - With at least one message: the subject is the first line of the first message. A subject
     that does not start (after spaces) with `hotfix:` or `emergency:` (letter case ignored) →
     null. A labelled subject with "other" or a message file → `unreadable`. Otherwise →
     `labelledCommitIsChecked({ root, cwd, kind })` ? null : `unchecked`, `kind` being
     `hotfix` or `emergency`.
   - With a message file and no message: the first line of the file's first 4096 bytes (the
     literal path, resolved against the session's working directory) is labelled →
     `unreadable`; unlabelled or unreadable → null (git cannot read an unreadable file
     either).
   - With neither: the command holds a label → `unreadable`; else null.
2. **The reader returned any other call.** When one of its arguments is `git` (base name,
   `.exe` removed) and a later argument is `commit` — `git -C . commit …`, `git -c k=v commit
   …`, `env git commit …` — and the command holds a label → `unreadable`; else null. A call
   that only mentions those words inside one argument (`echo "git commit -m 'hotfix: x'"`) is
   not a commit, and the exact reading says so.
3. **The reader returned nothing** (a heredoc message, a chained `git add … && git commit …`,
   a substitution, a pipe into `git commit -F -`): when the text holds `git` and `commit` as
   words and the command holds a label → `unreadable`; else null.

**The two refusal sentences** (stderr, exit 2, through the existing `refuse`; `decide` returns
the sentence to refuse with, or null, in whatever shape keeps-working slice 2 leaves it):

- `unchecked`: `CTOC refused this commit because it is labelled hotfix or emergency and no
  passing hotfix check matches exactly what is staged; run node "<plugin root>/src/commands/
  start.js" hotfix check with the files you changed, stage only the files it passed, and commit
  them on their own.` — `<plugin root>` is the hook's own `PLUGIN_ROOT`, so the sentence names
  the real call even for a session that never read the menu's instructions.
- `unreadable`: `CTOC refused this commit because it carries a hotfix or emergency label that
  CTOC cannot read exactly; commit the staged files on their own with the message in plain
  quotes, as git commit -m 'hotfix: <what changed>' or git commit -m 'emergency: <what
  changed>', and nothing else in the command.`

**Background agents.** The allowed-routes table keeps-working slice 2 adds gains one row:
`hotfix check …` (any further arguments) — the check judges a change and writes only its own
record, never an answer, an approval or a plan move. Every other `hotfix` route stays refused
by that table's fail-closed default.

**Fail rule.** `UNCHECKED_SUSPECT_RE` gains `hotfix:` and `emergency:`, so a crash while the
hook reads a labelled commit refuses it with the existing "protection failed to run" sentence;
every other crash behaves as today. The rule loads `../lib/hotfix-check` (and runs git) only in
step 1 for a labelled subject, so no other call pays for it.

**Header.** "WHAT IT REFUSES" gains the commit rule; "WHAT IT CANNOT CATCH" gains: a commit
that carries no label or a false one; a message taken from an editor, a template or an earlier
commit (`-C`, `-c`, `--reuse-message`) without the label text in the command; a commit made by
a script file, `git commit-tree`, a merge, cherry-pick or revert; a project git hook (for
example a formatter run before the commit) that changes the staged files after this check; and
a background agent claiming "urgent" (slice 3) — each emergency change still lands in the
owner's review.

### `docs/ENFORCEMENT.md`

In "The one loaded hook — write protection for the records": a sixth item under "What it
refuses" (the commit rule, the two sentences, the one reading, the CTOC-project condition);
the `hotfix check` row in the background-agent table; the cannot-catch lines above. In
"Mandatory Pipeline Use", item 4 (escape phrases) gains one sentence: that hook is not loaded
today, and a commit labelled `hotfix:` or `emergency:` is refused by the one loaded hook unless
the menu's hotfix check passed exactly what is staged.

### Wiring — the live call sites

`labelledCommitIsChecked` is called by `src/hooks/protect-records.js`, the one hook registered
in `hooks/hooks.json`, on every labelled `git commit` a session or agent runs. The record writer
is called from `hotfixRoute`'s pass path (slice 1's live route). Both ends ship in this slice.

## Acceptance criteria

- [ ] In a CTOC project, after the menu's hotfix check passed `README.md` and only `README.md`
  is staged, `git commit -m 'hotfix: reword the readme'` (also with double quotes and with
  `-q`) is allowed — exit 0, nothing on standard output.
- [ ] The same commit is refused with exactly the `unchecked` sentence (exit 2, the sentence
  as the one line on stderr) when: no check ran; another file is also staged; the file changed
  again after the check; the label is `emergency:` but the record is a hotfix record; `HEAD`
  moved after the check; the repository has no commit.
- [ ] A labelled commit CTOC cannot read exactly is refused with exactly the `unreadable`
  sentence: the heredoc form; `git add … && git commit -m 'hotfix: …'`; `-am`; `--amend`; a
  path after `--`; `git -C . commit`; `git -c k=v commit`; `env git commit`; `-F msg.txt` and
  `--file=msg.txt` whose first line is labelled; a pipe into `git commit -F -`.
- [ ] Unlabelled commits, a label only in a later paragraph, `-F` with an unlabelled file,
  searches for the label text, an `echo` of a labelled commit command, and labelled commits in
  a repository that is not a CTOC project are allowed exactly as today.
- [ ] A background agent may run `hotfix check …` through the menu; its labelled commit
  follows the same rule as the main session's.
- [ ] Every passing check leaves exactly one record named by its binding; a refusal leaves
  none; the record matches the staged change after `commit.add` is run, also with
  `core.autocrlf=true` and Windows line endings in the working file.
- [ ] Writing a record by hand — the Write tool, a shell redirect, a one-line script — is
  refused, as every other write into the check records already is.
- [ ] `npm test` passes: lint, typecheck, all tests, coverage at or above the floor, 0 skipped;
  `docs/ENFORCEMENT.md` states the rule, its sentences and its limits.

## Risks

| Risk | Mitigation |
|---|---|
| Claude Code's habitual heredoc commit is refused, and the session takes several tries | The `unreadable` sentence names the one form that works; slice 4 writes that form into the instructions; the refusal costs one retry, never a wrong commit |
| The binding differs between the check and the staged file on another machine's settings (line endings, filters) | The blob is computed by `git hash-object`, which applies the same conversion `git add` applies; a test runs with `core.autocrlf=true` and a CRLF working file |
| A project git hook changes the staged files after this check (a formatter run before the commit) | Named in the hook's cannot-catch list and in `docs/ENFORCEMENT.md`; the committed content is then the hook-formatted version of a checked change |
| The rule slows every Bash call | It loads nothing and runs no git unless the reader returned a `git commit` with a labelled subject; other calls pay the existing reader plus presence tests |
| Keeps-working slice 2 builds its reader differently from what this plan assumes | Step 9 reads that slice's final hook first; the rule calls whatever single reader it left, split out if needed, and the tests here drive the real hook process, not the reader |
| A non-CTOC repository's own "hotfix:" commits are refused by a plugin the user installed for other projects | The rule runs only where the root walk finds a CTOC project marker (`.ctoc` with settings or plans, or CTOC's `plans/` folders) |

## Decisions Taken Under Ambiguity

1. **The binding is the base commit plus each file's blob as it will be staged**, not a hash of
   `git diff --cached` text: the blob ids are what the commit will hold, independent of diff
   settings, and the check can compute them before anything is staged with
   `git hash-object` (which writes nothing). The owner's "for example a digest of `git diff
   --cached` plus the base commit" is met in substance: the staged content and the base.
2. **The check, not the session, writes the record, and every pass writes one.** Decision 12 of
   the functional plan, as amended with the owner's answer.
3. **Records live in `.ctoc/state/verify/hotfix/`**, a sub-folder of the check records, so no
   file name can collide with a plan's own check record and the existing protection already
   covers it (the hook's record pattern matches any path under `.ctoc/state/verify/`).
4. **The label is read case-insensitively** (`Hotfix:` counts as labelled): reading more as
   labelled can only refuse more, never let an unchecked commit through.
5. **Only `-q`/`--quiet` and the message options are allowed beside a labelled message**,
   because every other option either commits something other than what is staged (`-a`,
   `--amend`, a path, `--include`, `--only`) or takes the message from somewhere CTOC cannot
   read (`-F`, `-C`, `--fixup`). An allow-list fails closed on options git adds later.
6. **A message file is opened only to see whether it is labelled, and a labelled one is always
   refused** (the coordinator's constraint), so a file changed between the hook and git can
   only cause a refusal, never a pass.
7. **A call that reaches `git … commit` through global git options or a wrapper (`env`) is
   unreadable when labelled**, because the exact reading shows a commit whose staged content or
   working folder this rule does not model; refusing it costs one retry.
8. **The rule runs only in a CTOC project** (marker `ctoc` or `plans` from the existing root
   walk), as every other CTOC enforcement treats non-CTOC projects.
9. **The `unchecked` sentence carries the plugin's real path**, because a session or agent that
   never read the menu's instructions cannot expand `${CLAUDE_PLUGIN_ROOT}`; the path is
   CTOC's install location, not a secret, and no text of the refused command is echoed.
10. **Background agents may run `hotfix check`**: it writes only its own deterministic record,
    so an agent cannot obtain a pass the rules would not give; this is not an answer, an
    approval or a plan move, which the owner's decision of 2026-10-07 reserves to the human.

## Execution Plan

### Step 8: TEST
- [ ] Add to `tests/protect-records.test.js`, numbered after the file's last case and driven
  through the real hook process with the suite's own `run`, `payload` and broken-entry setup.
  A helper turns the temporary project into a git repository (`README.md` committed, one word
  changed), runs `await route(['hotfix', 'check', 'README.md'], project)` (a documentation-only
  change in a project with no test command, so the first call passes) and stages with the
  answer's `commit.add`. Each case is red today unless marked guard: the hook allows every
  commit, and the check writes no record.
  1. Allowed: `git commit -m 'hotfix: reword the readme'`, the same in double quotes, and with
     `-q`.
  2. Refused `unchecked`: no check ran; `notes.md` also staged; `README.md` edited again and
     re-staged; `emergency:` label with the hotfix record; a commit made after the check (HEAD
     moved); a CTOC project whose repository has no commit.
  3. Refused `unreadable`: the heredoc form exactly as Claude Code writes it
     (`git commit -m "$(cat <<'EOF'` … `EOF` `)"`); `git add README.md && git commit -m
     'hotfix: x'`; `git commit -am 'hotfix: x'`; `git commit --amend -m 'hotfix: x'`;
     `git commit -m 'hotfix: x' -- README.md`; `git -C . commit -m 'hotfix: x'`;
     `git -c core.editor=true commit -m 'hotfix: x'`; `env git commit -m 'hotfix: x'`;
     `git commit -F msg.txt` and `git commit --file=msg.txt` with first line `hotfix: x`;
     `printf 'hotfix: x' | git commit -F -`.
  4. Guard, allowed: `git commit -m 'fix: x'`; `git commit -m 'fix: x' -m 'hotfix: named in
     the body'`; `git commit -F msg.txt` with an unlabelled first line; `grep -rn 'hotfix:'
     docs`; `git log --oneline | grep 'hotfix:'`; `echo "git commit -m 'hotfix: x'"`.
  5. Guard, allowed: a labelled commit in a git repository with no `.ctoc` and no `plans/`.
  6. Background agent (`agent_id` set): `node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js"
     hotfix check README.md` and `… hotfix check --run-tests 'README.md'` are allowed (red
     once keeps-working slice 2 is in: its table refuses an unlisted route); its labelled
     commit is allowed with the record and refused `unchecked` without it.
  7. Guard, refused with the existing records sentence: a Write to
     `.ctoc/state/verify/hotfix/<64 hexadecimal characters>.json`; `echo '{}' >
     .ctoc/state/verify/hotfix/x.json`; `node -e "require('fs').writeFileSync('.ctoc/state/
     verify/hotfix/x.json','{}')"`.
  8. Crash (the broken entry copy without its library): a labelled `git commit` is refused
     with the "protection failed to run" sentence; `git commit -m 'fix: x'` is allowed.
  9. Line endings: with `core.autocrlf=true` and a CRLF `README.md` in the working tree, the
     checked, staged change is allowed.
  10. The `unchecked` sentence is exactly the text above with `<plugin root>` replaced by this
      repository's root.
- [ ] Add to `tests/hotfix-check.test.js`:
  1. A pass writes exactly one file under `.ctoc/state/verify/hotfix/`, named
     `<binding>.json` with 64 hexadecimal characters, holding `kind: 'hotfix'`, that
     `binding`, `HEAD`'s id as `base`, the files and the tests; the pass screen's `record`
     names it.
  2. Every refusal of slice 1's cases writes no file there.
  3. After running the answer's `commit.add` (including a file name holding a space and an
     apostrophe), `labelledCommitIsChecked({ root, cwd, kind: 'hotfix' })` is true; with
     `kind: 'emergency'` false; with a second file staged false; with nothing staged false.
  4. Checking the same change twice leaves one record with the same binding.
  5. When the record folder cannot be created (a file named `hotfix` already sits in
     `.ctoc/state/verify/`), the answer is the "its record could not be written" refusal and
     no pass is reported.
- [ ] Run both files: every non-guard case red.

### Step 9: PREPARE
- [ ] Read keeps-working slice 2's final `src/hooks/protect-records.js`, its tests and its
  `docs/ENFORCEMENT.md` text; identify the single command reader and how `decide` returns a
  sentence.
- [ ] Confirm on the installed git that `hash-object -- <path>` equals the blob `git add`
  stores for the same file under `core.autocrlf=true` (one manual run in a scratch
  repository, output quoted in the build record).

### Step 10: IMPLEMENT
- [ ] `src/lib/hotfix-check.js`: the binding, the record writer on every pass, the `record`
  field, `labelledCommitIsChecked`.
- [ ] `src/hooks/protect-records.js`: the reader split out if needed, `commitLabelDecision`,
  the two sentences, the CTOC-project condition, the `hotfix check` row in the background-agent
  table, the fail-rule words, the header.
- [ ] `docs/ENFORCEMENT.md`: the rule, the sentences, the table row, the limits, and the
  sentence in item 4.

### Step 11: REVIEW
- [ ] The critic tries to commit an unchecked labelled change past the hook in ten new command
  shapes; any that is allowed is a finding unless it is on the cannot-catch list.

### Step 12: OPTIMIZE
- [ ] Confirm by reading the code that `../lib/hotfix-check` is required, and git started, only
  in step 1 of the decision for a labelled subject; every other Bash call runs the existing
  reader and the presence tests, nothing more.

### Step 13: SECURE
- [ ] The security scanner attacks the rule: option smuggling (`--message` with `=`, combined
  short options, `--` placement, quoting edge cases), wrappers and global git options, a
  message file that is a symbolic link or a device, path traversal in the file operand, a
  forged record placed through a cannot-catch route, and a binding collision attempt (two
  changes, one binding).

### Step 14: VERIFY
- [ ] `npm test`: lint, typecheck, all tests, coverage at or above the floor in
  `.ctoc/coverage-baseline.json`, 0 skipped, 0 flaky.
- [ ] Live once with the loaded hook in a scratch CTOC project: a labelled commit without a
  check is refused (quote the stderr line), the menu's check is run, the files are staged, and
  the same commit goes through.

### Step 15: DOCUMENT
- [ ] JSDoc on `labelledCommitIsChecked`, the binding and record functions, and
  `commitLabelDecision`; the hook header and `docs/ENFORCEMENT.md` as above.

### Step 16: FINAL-REVIEW
- [ ] Every acceptance box above is checked against its evidence; the live refusal and the
  live pass are quoted.
