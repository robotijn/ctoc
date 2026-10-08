---
iron_loop_verdict: true
iron_loop: true
title: "The hotfix check: CTOC judges a change called a hotfix and says why in one sentence"
type: implementation
created: 2026-10-07
priority: high
effort: large
parent_plan: ctoc-checks-that-a-hotfix-is-really-small-and-safe
depends_on: ctoc-keeps-working-and-asks-only-what-matters-s2-plans-cross-on-their-evidence
files:
  - src/lib/hotfix-check.js
  - src/lib/menu-screens.js
  - src/commands/start.js
  - tests/hotfix-check.test.js
  - tests/hotfix-check-corpus.test.js
  # The quality agent's test runners, which rule 8 reuses. Every trial build hit their
  # faults: a failing run is read from standard output only (jest reports on standard
  # error); npm.cmd is launched on Windows in a way Node refuses; a timeout, a runner that
  # cannot start and npm's placeholder test script read as failing tests. Since 2026-10-08
  # also: a passing run's standard error is never read (spawnSync, Decision 34) and npx.cmd
  # never starts on Windows (Decision 35). Fixed here, with their cases in the module's own
  # test file (a module ships with its test).
  - src/lib/quality-agent.js
  - tests/quality-agent-coverage.test.js
  # Three existing test files whose fake of the runner's execFileSync would no longer be
  # called once the runner starts programs with spawnSync (session decision (a), Decision
  # 34). Only their fakes move to spawnSync, with the same answers; no assertion changes.
  - tests/quality-agent-coverage-holes.test.js
  - tests/quality-agent-crossplatform.test.js
  - tests/test-selection-scope.test.js
  # The temporary copy (the owner's decision of 2026-10-08). Its folder (mkdtempSync) and its
  # links (symlinkSync) must go through the file-system choke point: symlinkSync on a computed
  # path is a lint error outside it, and tests/safe-fs-blindspot.test.js refuses a raw
  # mkdtempSync. safe-fs gains two wrappers, with their cases in its own test file.
  - src/lib/safe-fs.js
  - tests/safe-fs.test.js
  # The registry of modules that answer the menu's screen shape (text, ask, actions).
  # hotfix-check.js answers that shape, and tests/gate-numbers-fence.test.js (and the
  # self-check in tests/iron-loop-enforcer.test.js) require every such module to be listed.
  - src/lib/human-facing-scan.js
  # The count-cache fence flags hotfix-check.js: its log is rotated by a rename, and its
  # file-kind table holds the folder word "plans". One whitelist entry with a written reason.
  - tests/cache-freshness.test.js
  # Ratchet, not counted toward the slice size: this slice creates one library module and
  # two test files, which move the module and test-file counts in CLAUDE.md and in
  # README.md (tests/readme-numbers.test.js holds README's copy to the files on disk).
  - "CLAUDE.md"
  - README.md
approved_by: human
approved_at: 2026-10-08T20:12:34.566Z
gate_crossed: implementation → todo
---

# The hotfix check: CTOC judges a change called a hotfix and says why in one sentence

Slice 1 of 4 of `plans/functional/ctoc-checks-that-a-hotfix-is-really-small-and-safe.md`.
Slice 2 makes every passing check leave a record and has the one loaded hook refuse a labelled
commit without one; slice 3 adds the urgent path and its review; slice 4 makes the CTO Chief
judge every fix for the hotfix fast path and tells every session when to run the check. This
slice builds the check itself, the menu route that runs it, and the log of its verdicts that
lets the fast path be counted (the owner's requirement of 2026-10-08).

**Amended 2026-10-08** after five trial builds of this plan (worktrees
`.claude/worktrees/trial-hs1-a` to `-e`) and a blind Opus review of each. The build continues
from arm B (`.claude/worktrees/trial-hs1-b`): its `src/lib/hotfix-check.js`, its two test files
and its Execution Record (in its own copy of this plan) are the starting point. The amendment
adds the five files every build needed and the twelve fixes the session decided from the
reviews (Decisions 15 to 26).

**Amended again 2026-10-08** for the owner's decision below (answer "a") and four session
decisions (Decisions 34 to 37). The project's tests now run in a separate temporary copy of
the repository instead of the working folder, which withdraws the amendment's refusal while
other uncommitted work exists; the quality agent reads standard error on a passing run and
starts npm and npx on Windows; slices 2, 3 and 4 now write the commit command in this slice's
form. Five files are added: `src/lib/safe-fs.js` and `tests/safe-fs.test.js` for the copy,
and three existing test files whose fake of the test runner moves with session decision (a).

**Amended a third time 2026-10-08** after one review round of this plan and slice 2
(Decisions 38 to 43). The bytes rules 1 to 7 judge, the bytes the tests run on and the bytes
slice 2 records are now one set: a judged file that changes during the check is refused. A
file name the commit command cannot carry is refused under rule 1. By a session decision
(Decision 40) the copy is removed with `git worktree remove --force` instead of `git worktree
prune`. `worktree add` and `apply` run with the file-system monitor off. By a second session
decision (Decision 41) a linked package folder that leads the tests back to other uncommitted
work in the repository is refused. The quality agent reads output past 10 MiB as undetermined,
and its test helper fakes both process calls, so no case starts a real runner on the trial
build. No file is added.

## The owner's decision (2026-10-08)

**Question:** while other uncommitted work sits in the folder, where does the hotfix check run
the project's tests?

**Answer: a — in a separate temporary copy of the repository** that holds exactly the last
commit plus the judged hotfix change, never in the working folder.

This replaces the amendment's rule that refused while other uncommitted work existed — rule
8's other-work clause, the `other-work` cause word in the log and Decision 18 — together with
the acceptance criteria and test cases built on it. The functional plan's approved scenario
"Other uncommitted work is neither judged nor committed" (an unrelated `notes.md` edit leaves
the verdict unchanged, and the commit holds only the judged file) holds again, unchanged. How
the copy is made, filled, linked and removed is in "Rule 8" below and in Decisions 29 to 33,
the planner's choices under this decision, and Decisions 38, 40 and 41.

## Problem statement

Today the words "hotfix", "quick fix", "trivial fix", "trivial change" and "urgent" let a
change skip planning, and nothing looks at the change (`src/lib/escape-phrases.js` only
matches the words; CTOC's edit hooks are not loaded, `docs/ENFORCEMENT.md`). A one-word label
edit and a rewrite of a payment rule are treated the same. The owner asked CTOC to check
whether a hotfix really is small and safe (2026-10-07), and the functional plan fixes what
"small and safe" means: eight rules, one fixed sentence per cause.

There is no module that reads a change against the last commit, classifies each edit, or runs
the project's tests on the hotfix's behalf, and no menu route a session can call to ask.

## Technical approach

### What the session and the owner get

One new menu route, two calls, answered as menu JSON (`text`, `ask`, `actions` plus the fields
named below):

1. `node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" hotfix check [<file> ...]` — instant.
   Reads the change and runs rules 1 to 7; it runs no test and reads nothing about the
   project's tools. On a refusal it answers with the one sentence. When rules 1 to 7 hold it
   answers `verdict: 'checking'`, `text: 'Checking the hotfix against the existing tests.'`
   (the one status line) and `next`, the exact route to run for the test run:
   `hotfix check --run-tests '<file>' ...`.
2. `hotfix check --run-tests [<file> ...]` — the test run, which the session runs as
   background shell work. It runs rules 1 to 7 again (cheap, deterministic), then rule 8 in a
   temporary copy of the repository, and answers the pass or the refusal.

A pass answers `verdict: 'hotfix'`, `text: ''` (the owner sees nothing extra) and
`commit: { files, add, message }`: `files` the display paths; `add` the exact staging command
`git --literal-pathspecs add -- '<file>' ...`; and `message` the exact commit command
`git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- '<file>' ...`, which
commits exactly the judged files whatever else is staged. Each path is single-quoted. Rule 1
refuses every judged file whose name holds a character the quoting would have to escape or
that slice 2's command reader refuses (`'`, `"`, `$`, `\`, a backtick, a control character),
so no path in `next`, `add` or `message` is ever escaped. Both commands must be run from the
project root: their paths are project-root-relative, and run from another folder they name
other files. A refusal answers `verdict: 'refused'` and `text` = the sentence;
when the check stopped on a fault it also carries `detail`, the fault's message (control
characters removed, at most 200 characters), outside the fixed sentence. When the temporary
copy could not be removed, `detail` also names its folder (rule 8), whatever the verdict, the
two parts joined by `; `. Every answer carries `ask: { questions: [] }` and `actions: {}`. A
documentation-only change in a project with no test command also takes both calls, because
whether the project has a test command is read in the copy (rule 8).

The two calls follow the functional plan: the rules that read the change answer instantly,
and the test run is background work with one status line while it runs.

### The change that is judged (rule 1)

Every git call goes through one internal helper: `spawnSync('git', ['-c',
'core.quotepath=false', '-c', 'diff.autoRefreshIndex=true', ...args], { cwd, env: {
...process.env, LC_ALL: 'C', GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT:
'0', GIT_LITERAL_PATHSPECS: '1' }, maxBuffer: 64 MiB, windowsHide: true })` with git's
redirecting variables (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`,
`GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE`,
`GIT_CEILING_DIRECTORIES`) removed, output read as a buffer. `diff.autoRefreshIndex=true` keeps
a file whose modification time moved but whose content did not out of every diff against the
working tree, whatever the repository sets. That refresh rewrites the index git read, and
`GIT_OPTIONAL_LOCKS=0` does not stop it (verified, Decision 44), so no call reads the
repository's own index: once the check's temporary folder exists (below), every call at the top
level — the listings, the diffs, `cat-file`, the two hashings, and rule 8's ignored-folder
listing and listings of uncommitted work — runs with `GIT_INDEX_FILE` set to
`<tmp>/repo-index`, the copy of the repository's index, after the redirecting variables are
removed. The exceptions are rule 8's: the four calls on the temporary index (step 3 of "Making
the copy") set `GIT_INDEX_FILE` to `<tmp>/index` instead, and `worktree add`, `worktree remove`
and `apply` (which runs in the copy, on the copy's own index) set none. Rule 8 alone also gives
standard input as a buffer (the patch handed to `git apply`). The project root and git's top
level (`rev-parse --show-toplevel`) are both resolved with `fs.realpathSync.native` (the
non-native form keeps Windows short names such as `PROGRA~1`, and the two paths would not
compare). Git runs from the top level; paths given to git and kept internally are
top-level-relative with `/`; paths shown to the owner are project-root-relative with `/` (a
path outside the project root reads `../<path>`).

**The copy of the repository's index** (Decision 44), made in both calls, once per call, right
after the last commit's id is read (the fourth row below). `rev-parse --git-path index` at the
top level, resolved against the top level, names the repository's index, the right one for a
linked worktree too. `tmp = fs.realpathSync.native(safeFs.mkdtempSync(path.join(os.tmpdir(),
'ctoc-hotfix-')))` makes the check's own temporary folder: a new folder with a unique name under
the system's temporary folder, readable only by this user on macOS and Linux (`mkdtemp` creates
it with mode `0700`), its real path resolved so that Windows short names and macOS's `/var` link
never give one folder two names. `safeFs.cpSync(<the repository's index>, <tmp>/repo-index, {
preserveTimestamps: true })` copies the index into it. The copy keeps the original's
modification time because git trusts a file's cached time only when it is older than the index
file's own, so a copy with a fresh time could hide a file changed in the second the index was
last written (believed, git's racy-clean rule; Node may round the time down to the millisecond,
which only makes git compare more files by content). A failure here, a repository without an
index file among them, is `the check stopped`. The folder, with the copy in it, is removed on
every path of both calls ("Removing the copy"); rule 8 makes the rest of its copy inside it.

Reading, in order; the first failure is the clause `I could not read the change (<why>)`:

| Situation | `<why>` |
|---|---|
| `git` cannot be started (spawn `ENOENT`) | `git is not installed` |
| `rev-parse --show-toplevel` fails | `this folder is not a git repository` |
| the project root's path relative to the top level starts with `..` or is absolute | `this folder lies outside the repository git reports` |
| `rev-parse --verify -q HEAD^{commit}` fails (its output, the last commit's full id, is kept for rule 8 and for slice 2's record) | `this folder has no commit to compare with` |
| a named file resolves outside the project root (after `\` is read as `/` and `..` resolved) | `<file> is outside this project` |
| a named file has no change git would commit (unchanged, or ignored) | `<file> holds no change that git would commit` |
| nothing named and nothing changed | `nothing has changed since the last commit` |
| a judged file's path holds `'`, `"`, `$`, `\`, a backtick or a control character (the first such file in sorted display order) | `<file> has a name the commit command cannot carry` (`<file>` with each control character shown as a space, as `detail` is cleaned) |
| a changed file's old or new content holds a zero byte or is not valid UTF-8 (`TextDecoder('utf-8', { fatal: true })`) | `<file> is not text` |
| rule 8 only (`--run-tests` call): `git apply` of the judged change to the temporary copy fails | `the change does not apply cleanly to a fresh copy of the last commit`; git's first line of standard error goes to the answer's `detail` |
| rule 8 only: a judged file's id in the temporary index, or its second hash after the tests, differs from its first hash (below) | `<file> changed while it was being checked` |
| rule 8 only: other uncommitted work lies in a repository folder that a linked package folder leads the tests to (step 6 of "Making the copy") | `other uncommitted work is in code the tests load through installed packages: <folder>` |
| anything throws inside the check | `the check stopped` (fixed); the fault's message goes to the answer's `detail` |

Every `diff` call carries the same fixed arguments, `--no-color --no-ext-diff --no-textconv
--no-renames --no-relative --text`, so no git setting, attribute or external tool changes what
git prints; `--text` makes git print the changed lines of a file whose attributes call it
`binary` or `-diff`. The one exception is the patch that carries the change into the temporary
copy (rule 8), which needs the exact bytes: it carries `--binary --full-index` instead of
`--text`.

The changed set is read once: `diff HEAD --raw -z --no-abbrev <fixed arguments> --
<pathspecs>` (status, old and new mode, old blob) plus `ls-files --others --exclude-standard -z
-- <pathspecs>` (new files), the pathspecs being the named files (a named folder covers the
files beneath it) or, when no file is named, the project root. The judged change is those
paths, except that, when no file is named, paths under `.ctoc/` are left out, because they are
CTOC's own state and records. Any other changed or new path in the repository is neither judged
nor committed, and it never reaches the test run, which happens in a copy of the last commit
(rule 8). Old content comes from `cat-file blob <old blob>`, new content from the working tree;
a symbolic link (mode `120000`) is not read as text. Changed lines come from `diff HEAD -U0
--ignore-cr-at-eol --src-prefix=a/ --dst-prefix=b/ --inter-hunk-context=0
--diff-algorithm=myers --indent-heuristic <fixed arguments> -- <judged files>`, parsed into
groups of removed and added lines (the `\ No newline at end of file` marker skipped, a trailing
carriage return stripped). Under these arguments git prints no unchanged context line; if one
appears anyway, it is counted on both sides (old and new line numbers advance) and closes the
current group, so line numbers and line pairs stay right. A new file counts every line as
added.

**The first hashing** (`--run-tests` call only). Once the judged files are listed and their
names have passed the name check, and before any rule reads their content, each judged file
that `lstat` reads as a regular file is hashed: `hash-object -- <those files>` at the top
level, through the git helper — git's own clean filters and line-ending conversion, exactly as
`git add` applies them, and nothing is written to the object store — one id per file, in
order. A judged file absent from the working folder is `deleted`, and any other judged entry (a
symbolic link, a folder) is `not a file` and is never hashed; rule 2 refuses both before rule
8. Rule 8 compares these first hashes twice: with the files' ids in the temporary index, before
any test runs, and with a second hashing after the tests. So the bytes rules 1 to 7 judged, the
bytes the tests ran on and the ids slice 2 records are one set (Decision 38). The instant first
call writes no record and runs no test, so it does not hash.

### The rules and the order they run in

The first rule that fails gives the clause; the sentence is
`I did not treat this as a hotfix because <clause>; it goes through a normal plan, and your
edits stay in place, not committed.` Files are looked at in sorted display-path order, and the
first failing file gives the clause.

The order is rule 1, 2, 7, 4, 5, 6, 3, then 8 (see Decisions: the functional plan's own
scenarios name an edited test and the kind of change ahead of size).

- **Rule 2 — same files, same names.** A file added or deleted → `it adds, removes or renames
  <file>` (with renames off, a rename is a delete plus an add). A changed mode, a type change
  (status `T`) or a symbolic link → `I do not recognise <file> as wording or a colour`.
- **Rule 7 — no test is edited.** A path segment `test`, `tests`, `__tests__` or `spec`, or a
  base name matching `*.test.*` or `*.spec.*` (in any folder) → `it changes a test (<file>)`.
- **Rule 4 — only kinds that qualify** (next section).
- **Rule 5 — not in a sensitive area.** The display path split at every character that is not
  a letter (`/[^A-Za-z]+/`), lower-cased; a part equal to one of the 33 words of the functional
  plan → `<file> sits in an area named <word>, and such areas are never a hotfix`.
- **Rule 6 — no risk marker in wording.** For markup and catalogue files, the whole old and new
  text run or value (placeholders removed first) holds a digit of any script (Unicode category
  `Nd`, `\p{Nd}`), a currency symbol (`\p{Sc}`), `%`, `://`, `www.` in any letter case, `@`,
  `<`, `>`, `{`, `}`, `$` or a backtick → `the wording in <file> contains a number, a price, a
  web address or an e-mail address`.
- **Rule 3 — size.** n = removed plus added lines over all files, m = files; n > 20 or m > 3 →
  `it changes <n> lines in <m> files and a hotfix is at most 20 lines in at most 3 files`
  (`1 line`, `1 file` in the singular).
- **Rule 8 — the existing tests pass, run in a temporary copy** (section below).

### Rule 4 — the four kinds, and everything else

First, for every file: a modified file whose old and new texts differ (a carriage return
before each line feed, or at the end, ignored) but which yields no changed-line group →
`I do not recognise <file> as wording or a colour` — never a 0-line pass.

A file is placed in the first kind that fits:

1. **Documentation**: `.md`, `.txt`, `.rst`, unless it is a dependency or build list (the
   table below: `requirements*.txt` and `constraints*.txt` in any letter case, any `.txt` with
   a folder named `requirements` in its path, `runtime.txt`, `CMakeLists.txt`). Any wording
   edit qualifies.
2. **Markup**: `.html`, `.htm`, `.jsx`, `.tsx`, `.vue`, `.svelte`. Every group must remove and
   add the same number of lines, and each old/new line pair must be a text edit: the parts that
   differ lie wholly after a `>` and before the next `<` on the same line; that `>` closes a tag
   opened on the same line (the nearest `<` before it is followed by a letter or `/` and a
   letter), and that `<` opens a tag (followed by a letter or `/`); in `.jsx` and `.tsx` the
   `>` must end an opening tag `<name …>` and the `<` after the text must begin `</name` with
   the same name, letter case exact (so a generic type such as `Box<A>|Box<B>` and a
   comparison chain such as `a<b>limit<c` are refused); the whole text run between them, old
   and new, holds no `{`, `}`, `$`, backtick or `&`, and in `.jsx` and `.tsx` also no `(`, `)`,
   `;`, `=`, `"` or `'`; and the line lies outside every `<script…>…</script>`,
   `<style…>…</style>` and `<textarea…>…</textarea>` block of the old and the new file (letter
   case ignored; an unclosed block runs to the end of the file). Anything else →
   `I do not recognise <file> as wording or a colour`.
3. **Message catalogue**: `.json`, `.yaml`, `.yml`, `.po`, `.properties` with a folder named
   `locales`, `locale`, `i18n`, `lang`, `translations` or `messages` in the path. Equal group
   sizes; each line pair has the same key part and differs only in its value: JSON
   `"key": "value",`; YAML `key: value` with a quoted or plain value that does not start with
   `[`, `{`, `&`, `*`, `!`, `|`, `>`, `%`, `@` or a backtick and holds no ` #`; Gettext
   `msgstr "value"` (also `msgstr[n]`); properties `key=value` or `key: value` without a
   trailing `\`. The placeholders — `{{name}}`, `{name}` and `%s`, `%d`, `%i`, `%f`, `%@`,
   `%1$s` forms — are the same multiset before and after. Anything else →
   `I do not recognise <file> as wording or a colour`.
4. **Colour**: `.css`, `.scss`, `.sass`, `.less`. Equal group sizes; in each line pair, with
   every colour token replaced by one marker, the two lines are identical, at least one token
   differs, and every changed token stands in a declaration value: the text between the last
   `{` or `;` before it (or the line start) and the token matches
   `^\s*(--[\w-]+|\$[\w-]+|@[\w-]+|[A-Za-z-]+)\s*:[^;{}]*$`. A colour token is `#` with 3, 4, 6
   or 8 hexadecimal digits, `rgb(…)`, `rgba(…)`, `hsl(…)`, `hsla(…)` (no nested brackets), or
   one of the 148 named colours of CSS Color Module Level 4 or `transparent` (letter case
   ignored), standing at the line start or after whitespace, `:`, `,` or `(`, and before the
   line end, whitespace, `;`, `,`, `)`, `}` or `!`. Anything else →
   `I do not recognise <file> as wording or a colour`.

**The places that govern the work never qualify, whatever the kind.** A file whose base name is
`CLAUDE.md` (any letter case) or that has a folder `.claude`, `.ctoc`, `agents`, `skills`,
`commands` or `plans` anywhere in its path, and that the steps above would place in one of the
four kinds → `I do not recognise <file> as wording or a colour`. Such a file that fits none of
the four kinds gets its clause from the table below like any other file.

A file in none of the four gets its clause from the first of these that fits:

| Kind | How it is recognised | Clause |
|---|---|---|
| dependency list or lock file | base name `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `requirements*.txt`, `constraints*.txt` (both in any letter case), `Pipfile`, `Pipfile.lock`, `pyproject.toml`, `poetry.lock`, `uv.lock`, `go.mod`, `go.sum`, `Cargo.toml`, `Cargo.lock`, `Gemfile`, `Gemfile.lock`, `composer.json`, `composer.lock`, `pom.xml`; or a `.txt` with a folder named `requirements` in its path | `it changes the dependencies in <file>` |
| database file | `.sql`, or a folder `migrations`, `migration` or `migrate` in the path | `it changes stored data in <file>` |
| build or continuous-integration file | base name `Dockerfile` (or `Dockerfile.*`), `Makefile`, `CMakeLists.txt`, `runtime.txt`, `Jenkinsfile`, `Procfile`, `Vagrantfile`, `.gitlab-ci.yml`, `docker-compose.yml`/`.yaml`, `compose.yml`/`.yaml`; `.gradle` and `.gradle.kts`; a `webpack`, `vite`, `rollup`, `esbuild`, `babel`, `tsup` or `turbo` `.config.*` file; a folder `.github`, `.gitlab`, `.circleci` or `.buildkite` in the path | `it changes how the project is built or shipped in <file>` |
| settings file | `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.conf`, `.cfg`, `.properties`, `.xml`, `.plist`, or a base name `.env` or `.env.*` | `it changes a setting in <file>, and settings changes are a common cause of outages` |
| program code | `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.kt`, `.kts`, `.swift`, `.c`, `.h`, `.cc`, `.cpp`, `.hpp`, `.cs`, `.php`, `.sh`, `.bash`, `.zsh`, `.ps1`, `.bat`, `.cmd`, `.lua`, `.scala`, `.dart`, `.ex`, `.exs`, `.erl`, `.clj`, `.pl`, `.r`, `.m`, `.mm`, `.sol` | when every group has equal sizes and every line pair is identical once the inside of every `"…"`, `'…'` and `` `…` `` literal (backslash escapes honoured; a backtick literal holding `${` is not emptied) is emptied: `it changes text inside program code in <file>, and no check can tell whether people read that text or the program depends on it`; otherwise `it changes program logic in <file>, and only wording and colours qualify` |
| anything else | — | `I do not recognise <file> as wording or a colour` |

### Rule 8 — the existing tests, run in a temporary copy (the owner's decision of 2026-10-08)

Rule 8 runs only in the `--run-tests` call, after rules 1 to 7 hold, and never in the working
folder. The project's tests run in a temporary copy of the repository that holds exactly the
last commit plus the judged change. Other uncommitted work, staged or not, and every file git
ignores stay out of it, so they can neither make the tests pass nor make them fail.

**Making the copy**, in this order, every git call through the one git helper:

1. **Where.** The check's temporary folder `tmp`, made in rule 1's reading and already holding
   the copy of the repository's index `repo-index`, gains an empty folder `no-hooks`
   (`safeFs.mkdirSync`); it will also hold the temporary index `index` (step 3) and the copy
   `tree` (step 2).
2. **The checkout.** `git -c core.hooksPath=<tmp>/no-hooks -c core.fsmonitor=false worktree
   add --detach --quiet <tmp>/tree <id>` at the top level, `<id>` the last commit's full id
   that rule 1 read. A detached worktree is a real checkout of that commit, made with the
   repository's own settings, attributes, filters and sparse-checkout patterns, so the copy's
   files are the bytes a checkout of that commit gives in the working folder, and a test that
   runs git inside the copy finds a repository. The empty hooks folder keeps the repository's
   `post-checkout` hook from running, and its `reference-transaction` hook (believed; Step 9
   confirms); `core.fsmonitor=false` keeps a configured file-system monitor command from
   running. The repository's smudge and process filters do run, Git LFS among them, on
   purpose (Decision 42). The worktree has its own index; the main working tree, the main
   index and the stash are not written. The one thing added to the repository is the
   worktree's registration in git's own folder (`worktrees/`), which "Removing the copy" takes
   away.
3. **The patch.** At the top level, with `GIT_INDEX_FILE=<tmp>/index` for these four calls
   only (a temporary index; the main index is never named. It is a second file beside
   `repo-index`, not the same one: `read-tree <id>` builds it from nothing, so it holds exactly
   the last commit plus the judged files whatever the repository has staged, while step 6's
   listings of uncommitted work, after it, must still see what the repository itself tracks
   and has staged; Decision 44): `read-tree <id>` (the temporary
   index holds the last commit); `add --all -- <the judged files>` (it takes each judged file
   as it is in the working folder — changed, added or deleted — through the repository's own
   clean filters and line-ending settings, putting its content into git's object store exactly
   as `commit.add` will for a pass); `ls-files --stage -z -- <the judged files>`, which gives
   each judged file's id in the temporary index (a judged file it does not list is `deleted`);
   and `-c diff.suppressBlankEmpty=false diff --cached <id> --binary --full-index -U3
   --no-color --no-ext-diff --no-textconv --no-renames --no-relative --src-prefix=a/
   --dst-prefix=b/`, read as a buffer. `--binary` with full object ids carries binary content
   exactly; the pinned context, prefixes and blank-line style keep every diff setting out of
   the patch. Each judged file's id in the temporary index must equal its first hash (rule 1);
   the first file in sorted display order whose id differs → the refusal `I could not read the
   change (<file> changed while it was being checked)`, and no test runs. These ids, with the
   last commit's id, are what slice 2's record binds.
4. **Applying it.** `git -c core.fsmonitor=false -c apply.ignoreWhitespace=no apply
   --whitespace=nowarn` at the copy's top level (`<tmp>/tree`), the patch on standard input.
   `git apply` writes nothing unless every hunk applies; it runs inside the copy, so the
   repository's line-ending and filter settings apply to the copy's files exactly as they do
   to the working folder's. A non-zero exit → the refusal `I could not read the change (the
   change does not apply cleanly to a fresh copy of the last commit)`, git's first line of
   standard error in `detail`, and no test runs.
5. **Linked dependency folders.** `git ls-files --others --ignored --exclude-standard
   --directory -z` at the top level, over the whole repository (a monorepo keeps installed
   packages above and beside the project folder), lists the ignored entries; a trailing `/`
   is dropped. An entry is linked when its base name is `node_modules`, or when it holds a file
   `pyvenv.cfg` directly inside it (a Python virtual environment, whatever it is called:
   `.venv`, `venv`, `env`). Its link sits in the copy at the same top-level-relative path.
   Before anything is made for it, the deepest folder on the way to the link's parent that
   already exists in the copy must have a real path (`fs.realpathSync.native`) inside the
   copy's real path `<tmp>/tree`: a symbolic link tracked in the last commit could otherwise
   redirect `mkdirSync` or `symlinkSync` to a folder outside the copy. When it does not, the
   check throws (`the check stopped`, the entry's top-level-relative path in `detail`) and no
   test runs. Then `safeFs.mkdirSync(<its parent in the copy>, { recursive: true })`, then
   `safeFs.symlinkSync(<the entry's real path in the working folder>, <its path in the copy>,
   linkType())`, where `linkType()` reads `process.platform` at each call: `'junction'` on
   Windows (a directory junction, which needs no administrator rights), `'dir'` elsewhere (a
   directory symbolic link). Every link made is remembered for removal. No other ignored
   folder is linked: build output and caches (`build/`, `target/`, `dist/`) are absent from
   the copy and rebuilt there by a project whose tests build (Risks). When nothing is listed,
   nothing is linked and the tests run without installed packages: a project that needs them
   fails its tests or runs none, which is a refusal, never a pass.
6. **Code the tests load from the working folder** (session decision 2026-10-08, Decision
   41). A linked folder can lead the tests back into the working folder: a workspace link
   inside `node_modules` (npm, pnpm and yarn workspaces), or a Python package installed in
   editable mode. The check collects every such target whose real path lies inside the top
   level (`path.relative` from the top level neither starts with `..` nor is absolute):
   - in each linked `node_modules` (read in the working folder, `safeFs.readdirSync`), every
     top-level entry, and every entry of a folder whose name starts with `@`, that is itself a
     link (`safeFs.lstatSync(…).isSymbolicLink()`; a junction reads as one on Windows,
     believed), resolved with `fs.realpathSync.native`; a link whose target does not exist is
     skipped;
   - in each linked virtual environment, every file directly inside
     `Lib/site-packages`, `lib/python*/site-packages` or `lib/pypy*/site-packages` (each where
     it exists) whose name ends in `.pth` or matches `__editable__*finder.py`: in a `.pth`
     file, every line that, trimmed, is not empty, does not start with `#` and does not start
     with `import` followed by a space or tab; in a finder file, every single- or double-quoted
     string literal on one line, with Python's `\\` read as `\`. Of those, every path that
     `path.isAbsolute` accepts on this platform and that exists, resolved with
     `fs.realpathSync.native`. A relative `.pth` line names a folder inside the ignored
     virtual environment and is not collected.

   When at least one target is found, `diff HEAD --name-only -z <fixed arguments>` and
   `ls-files --others --exclude-standard -z`, both at the top level over the whole repository,
   list the uncommitted work. A listed path that is not a judged file, does not lie under the
   project root's `.ctoc/`, and equals a target or lies beneath it → the refusal `I could not
   read the change (other uncommitted work is in code the tests load through installed
   packages: <folder>)`, `<folder>` the first such target in sorted order as a display path,
   and no test runs. A judged file under a target does not refuse: the working-folder bytes
   the link reaches are the judged bytes, which the hashes confirm. With no such path, the
   working-folder code the links reach equals the last commit plus the judged change, so the
   run stays exact. When no target is found, neither listing runs.
7. **The copy's project root** is `<tmp>/tree/<the project root relative to the top level>`.

**Running the tests in the copy.** Inside one internal wrapper that sets the working directory
to the copy's project root and keeps the quality agent's progress lines (`console.log`) off
the menu's JSON, restoring both in `finally`:

- `tools = require('./tool-detector').detectTools(<the copy's project root>).tools`. The test
  command and its settings (`package.json`, `.ctoc/quality-config.yaml`, `.ctoc/capabilities/`)
  therefore come only from files tracked in the last commit, plus CTOC's own built-in
  capability files: an ignored local settings file, or an uncommitted change to a tracked one,
  is not in the copy and never steers the run. The project has a test command when some
  language entry carries `test`. Without one: a documentation-only change passes (the answer
  says no test command, documentation only); anything else → `no test ran, so nothing confirms
  the change`.
- With one, the affected-test selection is the file-name selection of
  `require('./coverage-map').findTestsByHeuristic(<the judged file's absolute path in the
  copy>)` for each judged file. The copy holds only tracked files, so every selected test is a
  tracked one, and the working folder's `.ctoc/state/coverage-map.json` (ignored,
  agent-writable state) is never read. When every judged file has at least one selected test,
  `runSpecificTests(tools, <selected>)`; otherwise `await runFullTests(tools)` (both from
  `src/lib/quality-agent.js`, which reads node:test, jest and mocha counters and fails closed
  on an unreadable one).
- **The second hashing.** After the run — or, for a project with no test command, as soon as
  that is known — the judged files are hashed again in the working folder, exactly as the
  first time. The first file in sorted display order whose second hash differs from its id in
  the temporary index → `I could not read the change (<file> changed while it was being
  checked)`, whatever the run answered. Only then is the run's answer read.
- `passed === true` and `passCount > 0` → the rule holds. `passed === true` with `passCount`
  0, or `undetermined` (which, after this slice's quality-agent changes, includes a timeout,
  output past 10 MiB, a runner that cannot be started and npm's placeholder test script) →
  `no test ran, so nothing confirms the change`. `passed === false` →
  `the existing tests fail (<first failing test>)`.
- `<first failing test>` is read from the run's output (standard output and standard error
  together) with ANSI codes removed: the name from the first TAP `not ok N - <name>` line (the
  innermost failure comes first), the spec reporter's first `✖ <name>` line that is not the
  `failing tests:` heading, or jest's first `● <name>`; the file from the first
  `location: '<path>:<line>:<col>'` (TAP), `test at <path>:<line>:<col>` (spec) or
  `FAIL <path>` (jest) line. Shown as `<file>: <name>` with the file relative to the copy's
  project root (so it reads as the same path in the working folder) and `/`-separated, or
  whichever of the two was read, or `the test command reported a failure` when neither was.

**Removing the copy, on every path.** A `finally` around everything from the making of the
check's temporary folder on (rule 1) — in the first call every answer from then on, where only
step 3 below has anything to remove, and in this call a pass, a refusal (the patch, a changed
file, other work under a linked package, no test command, no test ran), failing tests, a run
the quality agent stopped at its timeout, and a thrown error — runs after the working directory
is restored:

1. every link made in step 5 is removed by itself with `safeFs.unlinkSync` (the link, never the
   folder it points to), before anything is deleted; a link that is already gone (`ENOENT`)
   counts as removed;
2. when step 2 made the worktree, `git worktree remove --force <tmp>/tree` at the top level,
   through the helper call that throws on a non-zero exit: it deletes the copy's files and its
   registration, and touches no other registration (Decision 40);
3. `safeFs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })`
   deletes what remains (the copy of the repository's index, the empty hooks folder, the
   temporary index, and whatever a failed step 2 left), the retries for a file that a
   just-ended Windows process still holds.

The first failure stops the removal there, so a folder whose link could not be removed is never
deleted recursively, and the answer's `detail` gains `the temporary copy at <tmp> could not be
removed: <message>` (control characters removed, at most 200 characters). The verdict stands,
the log line is the verdict's, and nothing about the removal is silent.

**The quality agent's runners** (`src/lib/quality-agent.js`), which rule 8 reuses, change in
four places; every other caller (`/ctoc:push`) gets the same behaviour, and every change keeps
a non-pass a non-pass:

1. `runCommandArgv` starts the program with `spawnSync` instead of `execFileSync` (Decision
   34): `spawnSync(bin, args, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit', shell:
   false, maxBuffer: 10 MiB, timeout, windowsHide: true })`. `output` is the run's standard
   output followed by its standard error (each trimmed, the non-empty ones joined by a line
   feed), on a passing run and a failing one alike, so a runner that reports on standard error
   is read — jest prints a passing run's counters there. The run succeeds when there is no
   `error` and the status is 0. Otherwise the result carries, read in this order:
   `outputTooLarge: true` when the error code is `ENOBUFS` (the output passed `maxBuffer`;
   `spawnSync` then also reports the signal `SIGTERM`, so this is read first and such a run is
   never called timed out); else `timedOut: true` when the signal is `SIGTERM` or the error
   code `ETIMEDOUT`; and `notStarted: true` when the program could not be started (error code
   `ENOENT`, `EACCES` or `EINVAL`) or a command shell reported it missing (status 127 on macOS
   and Linux, 9009 from Windows' command interpreter). With `allowFail` it returns `{ success:
   false, output, error, outputTooLarge?, timedOut?, notStarted? }`, `error` being the spawn
   error's message or `Command failed: <bin> exited with <status or signal>`; without
   `allowFail` it throws an `Error` with that message carrying `status`, `signal`, `stdout`,
   `stderr` and `code`, the shape `execFileSync` threw, so callers that rely on the throw are
   unchanged. The module's git calls stay on `execFileSync`.
2. **npm and npx on Windows** (Decision 35). One internal function, `npmLauncher(tool)` (`tool`
   `'npm'` or `'npx'`), reads `process.platform` and `process.execPath` at each call. On
   `'win32'` it answers the program `process.execPath` and one leading argument,
   `path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', tool +
   '-cli.js')` — the script npm's own `npm.cmd` and `npx.cmd` hand to node; when that script
   does not exist (`safeFs.existsSync`), nothing is started and the run answers `{ success:
   false, notStarted: true, output: '', error: <one plain line naming the missing script> }`.
   Elsewhere it answers the program `npm` or `npx` and no leading argument.
   `runProjectTestCommand` starts `npm test` through it, and `runSpecificTests` starts
   `npx jest <files>` and `npx vitest run <files>` through it. CTOC starts no command
   interpreter and passes no `shell: true` on any platform. npx itself then starts jest or
   vitest; on Windows it does so through the package's `.cmd` shim, which runs through
   `cmd.exe` with npm's own escaping of the arguments (believed; Decision 35, Risks). `pytest`
   and `go` are native programs, started by name as before.
3. `runProjectTestCommand`: a `package.json` test script that is exactly npm's placeholder
   (`echo "Error: no test specified" && exit 1`, after trimming) runs nothing and answers
   `{ success: false, notStarted: true, output: '', error: <one plain line saying the test
   script is npm's placeholder> }`.
4. `runFullTests` and `runSpecificTests`: a result with `outputTooLarge`, `timedOut` or
   `notStarted` returns the module's existing undetermined shape — `{ passed: false,
   undetermined: true, passCount: <counted so far>, failed: 0, skipped: <counted so far>,
   flaky: 0, output: <one line naming the language and whether the run printed more than 10
   MiB, timed out, could not start, is npm's placeholder or found no npm script beside node> }`
   — instead of a failure; each of the five has its own line.

`hotfixRoute` is `async` because `runFullTests` is; it never rejects (everything inside is
caught into the "check stopped" clause), so a fault can never read as a pass.

### The log of verdicts (the owner's requirement of 2026-10-08)

So that the fast path and the refusals can be counted, every final answer — a pass
(`verdict: 'hotfix'`) or a refusal (`verdict: 'refused'`) — appends one line to
`.ctoc/logs/hotfix-checks.jsonl`:

`{ at, verdict, cause, urgent, files, lines }` — `at` the time as an ISO 8601 string; `cause`
one fixed word per clause of the functional plan's table (`unreadable`, `adds-removes-renames`,
`too-big`, `program-logic`, `text-in-code`, `setting`, `dependencies`, `stored-data`, `build`,
`unrecognised`, `sensitive-area`, `risk-marker`, `test-edited`, `tests-fail`, `no-test-ran`),
or `null` on a pass; `urgent` `false` in this slice (slice 3 adds the urgent option); `files`
and `lines` the m and n of rule 3 for the change as read (both 0 when it could not be read). No
file name, path or wording is written, and `detail` never reaches the log.

A `checking` answer, the usage answer and the unknown-command answer write nothing. The log is
never written through a link: the project root is resolved with `fs.realpathSync.native`;
below it `.ctoc` and `.ctoc/logs` must each be a real folder (read with `lstat`, created
one level at a time when missing) and the log a regular file with one link (`lstat`, so a
dangling link is seen; `nlink` 1, so a hard link to another file is never appended to). An
existing log is opened with `O_WRONLY | O_APPEND | O_NOFOLLOW` (where the platform has that
flag), a new one with `O_CREAT | O_EXCL` as well, and `fstat` on the open descriptor must show
the same file (device and inode) as the `lstat` before it, with one link, or nothing is
written. When the log is above 1 MiB it is rotated by renaming it to
`.ctoc/logs/hotfix-checks.jsonl.1` (replacing an older one) and a new log is created
exclusively; no file is ever emptied. Any failure to write is swallowed and never changes the
answer. One internal function, `logVerdict(root, entry)`, writes the line, called where
`hotfixRoute` returns a final answer. `.ctoc/logs/` is in the `.gitignore` CTOC writes at
project initialization, and it lies under `.ctoc/`, which the check leaves out of the judged
change when no file is named; the copy holds only tracked files, so the log never becomes part
of a hotfix or of a test run.

### Files

**`src/lib/hotfix-check.js` (CREATE; arm B's build is the starting point).** One export,
`hotfixRoute(subArgs, root) → Promise<screen>`: `subArgs[0] === 'check'` runs the check with
`--run-tests` as a flag and every other argument a file; an unknown or missing sub-command, or
an unknown `--` option, answers `{ ok: false, text: 'Unknown hotfix command: <x>. Use: hotfix
check [--run-tests] [<file> ...]', ask: { questions: [] }, actions: {} }`. Everything else is
internal: the git helper, the change reader, the name check, the two hashings, the rules, the
kind tables, the temporary copy (made, compared, linked, checked for installed-package
targets, removed), the sentence builders, the test-run wrapper and the log writer. Nothing
else is exported (the dead-export fence counts a test as no caller). Files through `./safe-fs`
— the temporary folder through its new `mkdtempSync` and the links through its new
`symlinkSync` — except `fs.realpathSync.native` and the descriptor calls (`fs.constants`,
`fstatSync`, `writeSync`, `closeSync`), as `src/lib/actions.js` already does for the native
real path; the temporary folder's location from `os.tmpdir()`; paths through `path`; no new
dependency.

**The contract the tests rely on.** Cases 43, 46 and 47 replace functions for one call, so the
module looks each of them up at the moment it is used: it reaches `runFullTests` and
`runSpecificTests` through `require('./quality-agent')` inside the test run (never a
destructuring at module load), and reaches `mkdtempSync`, `mkdirSync`, `symlinkSync`, `rmSync`
and `unlinkSync` only as properties of the `safe-fs` module object (`safeFs.mkdtempSync(…)`),
whose wrappers in turn look up `fs.<name>` at each call. `commit.add` and `commit.message`
must be run from the project root (cases 4 and 32 do so).

**`src/lib/menu-screens.js` (MODIFY).** `route`: `case 'hotfix': return
hotfixCheck.hotfixRoute(args.slice(1), getProjectPath(projectPath));` with
`const hotfixCheck = require('./hotfix-check');` among the requires.

**`src/commands/start.js` (MODIFY).** In `main`'s argument branch, print the route's result
once it settles: `Promise.resolve(route(splitArgs, app.projectPath, { liveAgentIds })).then(
(result) => { console.log(JSON.stringify(result, null, 2)); });`. A synchronous route throws
exactly as before (the call happens before `Promise.resolve`), and every other route's output
is unchanged.

**`src/lib/quality-agent.js` (MODIFY).** The four changes of "The quality agent's runners"
above, in `runCommandArgv`, `runProjectTestCommand`, `runFullTests` and `runSpecificTests`,
with `spawnSync` added to the module's `child_process` import and one internal function,
`npmLauncher`. No export added or removed; `runCommand` (the shell form, used only for
`git push`) untouched.

**`tests/quality-agent-coverage.test.js` (MODIFY).** The quality agent's cases of Step 8. The
file's `withExecSpies` helper fakes both process calls and reloads the module after installing
them, because the module takes both at load. The `spawnSync` fake records each call and
answers through the case's own function (a returned string is read as `{ status: 0, stdout:
<the string>, stderr: '' }`). The `execFileSync` fake hands a call whose program is `git` to
the real `execFileSync`, and for any other program records the call and throws `new
Error('runner started through execFileSync')`. So on the trial build, which still starts
runners with `execFileSync`, no case starts a real runner: there `npm test` would run this
repository's gated suite again, and `npx jest` could install jest from the network. Its
jest-launcher assertion (`npx` or `npx.cmd`) moves to the new contract.

**`tests/quality-agent-coverage-holes.test.js`, `tests/quality-agent-crossplatform.test.js`,
`tests/test-selection-scope.test.js` (MODIFY, fakes only).** Each fakes the runner's
`execFileSync` today — `withBoundaries`' runner in the first, the go-argument capture in the
second, `withGitAbsent`'s record of the configured command in the third. Each of those fakes
moves to `spawnSync`, answering the same output as a `{ status, stdout, stderr }` result (a
thrown failure becomes `{ status: 1, stdout: <its stdout>, stderr: '' }`); their git fakes stay
on `execFileSync`; no assertion changes (Decision 34).

**`src/lib/safe-fs.js` (MODIFY).** Two wrappers in the file's own pattern:
`mkdtempSync(prefix, options)` (one path argument) and `symlinkSync(target, path, type)` (two),
each validating its path arguments, exported, and named in the export's type cast.

**`tests/safe-fs.test.js` (MODIFY).** The two wrappers' cases of Step 8.

**`src/lib/human-facing-scan.js` (MODIFY).** `SCREEN_MODULES` gains
`'src/lib/hotfix-check.js'`, after `'src/lib/menu-screens.js'` in the menu-router group, so the
human-facing-words scan reads the module's sentences like every other screen module's.

**`tests/cache-freshness.test.js` (MODIFY).** One `WHITELIST` entry with its comment:
`['hotfix-check.js', 'writes only .ctoc/logs/hotfix-checks.jsonl (one appended line per final
answer), renames it to .ctoc/logs/hotfix-checks.jsonl.1 above 1 MiB, and makes and removes one
temporary copy of the repository under the system temporary folder; the plans token is the
governing-folder name in its file-kind table, never a write target; no plan, vision or inbox
file is written, so no count can change']`.

**`CLAUDE.md` and `README.md` (MODIFY, counts only).** The library-module count and the
test-file count in each, set to the numbers on disk after this slice (`README.md`: the
`lib/ … JS modules` and `tests/ … test files` lines of its file tree).

### Wiring — the live call site

`hotfix-check.hotfixRoute` is called by `menu-screens.route` (`case 'hotfix'`), which
`src/commands/start.js` calls for every menu call with arguments — the menu's own entry, the
same root every other route hangs from. A session reaches it with
`node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" hotfix check <files>`. Slice 4 writes the
CTO Chief's judgement of every fix and the instructions that tell every session when to make
that call. `logVerdict` is called only by `hotfixRoute`, on the same path, and so are the copy
step and its two new `safe-fs` wrappers, `mkdtempSync` and `symlinkSync`. The quality agent's
changed runners, `npmLauncher` among them, are reached from the same route (rule 8) and from
their existing callers (`/ctoc:push` through the quality agent), where a timeout, output past
10 MiB, a runner that cannot start and npm's placeholder now block as "tests undetermined"
instead of "tests failed" — still not a pass.

## Acceptance criteria

- [x] A one-word wording change in `src/pages/home.html` (`<button>Save</button>` →
  `<button>Store</button>`) in a project whose tests pass: the first call answers
  `verdict: 'checking'`, `text` exactly `Checking the hotfix against the existing tests.` and
  `next` exactly `hotfix check --run-tests 'src/pages/home.html'`; the `--run-tests` call
  answers `verdict: 'hotfix'`, `text: ''`, `commit.files` `['src/pages/home.html']`,
  `commit.add` `git --literal-pathspecs add -- 'src/pages/home.html'` and `commit.message`
  `git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'src/pages/home.html'`.
- [ ] The colour change in `src/styles/button.css` and the catalogue value change in
  `locales/en.json` (same key, same `{count}`) pass the same way.
- [ ] Other uncommitted work is neither judged nor committed: with `notes.md` also modified and
  not named, both calls answer exactly what they answer without it, and running the answer's
  `commit.add` and `commit.message` from the project root makes a commit holding only
  `src/pages/home.html` while `notes.md` stays modified. An unrelated uncommitted edit that
  would make a test fail does not change the verdict; an unrelated uncommitted edit that a test
  needs in order to pass makes the hotfix fail with `the existing tests fail
  (tests/flags.test.js: flags are on)`, because the copy lacks it. Neither an ignored local
  `.ctoc/quality-config.yaml` nor an uncommitted change to a committed one chooses the test
  command.
- [ ] The `--run-tests` call runs the tests in a temporary copy under the system's temporary
  folder: a detached worktree of the last commit with the judged change applied, every ignored
  `node_modules` folder and Python virtual environment linked in — exactly one link each, a
  directory junction when `process.platform` reads `win32`, a directory symbolic link
  otherwise — and no other ignored folder. After a pass, a refusal, failing tests, a timeout
  and a thrown error, the copy and its worktree registration are gone, every other worktree
  registration (a stale one included) is still listed, and the owner's linked folders are
  intact; a link the tests already removed counts as removed; a copy that cannot be removed is
  named in `detail` and the verdict stands. A change that does not apply cleanly to the copy is
  refused with `I could not read the change (the change does not apply cleanly to a fresh copy
  of the last commit)` and runs no test. A symbolic link in the last commit that would put a
  link outside the copy stops the check (`the check stopped`) before any test runs, and nothing
  is made outside the copy. A documentation-only change in a project with no test command
  passes from the `--run-tests` call.
- [ ] A judged file that changes while the `--run-tests` call runs — before its content reaches
  the copy, or while the tests run — is refused with `I could not read the change (<file>
  changed while it was being checked)`. On a pass, each judged file's id in the temporary
  index equals its hash taken before any rule read its content and its hash taken after the
  tests; those ids and the last commit's id are what slice 2 records.
- [ ] A judged file whose name holds `'`, `"`, `$`, `\`, a backtick or a control character is
  refused by both calls with `I could not read the change (<file> has a name the commit
  command cannot carry)`.
- [ ] A linked `node_modules` whose workspace link (a top-level or `@scope/` entry), or a linked
  virtual environment whose editable install (a `.pth` or `__editable__` finder file), leads to
  a folder of the repository holding other uncommitted work is refused with `I could not read
  the change (other uncommitted work is in code the tests load through installed packages:
  <folder>)`, and no test runs; the same link with no such work passes, and so does a hotfix
  whose judged file lies in that folder.
- [ ] Running a pass's `commit.add` and then its `commit.message` (with `<what changed>`
  filled in) from the project root, in a repository where another file holds a staged change,
  makes one commit that holds exactly the judged files; the other file stays staged.
- [ ] Every refusal scenario of the functional plan that this slice covers (program logic,
  setting, text inside code, price, sensitive area, more than 20 lines, new file, failing test,
  edited test, no test ran, unreadable change, unrecognised file) answers exactly the sentence
  with its clause; the failing-test clause reads
  `the existing tests fail (tests/home.test.js: shows Save)`, also when the runner reports the
  failure on standard error only.
- [ ] An edited test is refused without running any test.
- [ ] The corpus — 82 edit shapes (24 that qualify, 58 traps) plus the mode-change case — gives
  exactly the expected verdict and clause for every shape (`checking` for each shape that
  qualifies, because the first call runs no test), among them: 20 changed lines in one file and
  three files reach `checking` while 21 lines and four files are refused; a `.tsx` comparison
  chain and a generic type are refused; a full-width digit and `WWW.` are risk markers; a
  `*.spec.*` file outside a test folder is a test; a document whose attributes say `-diff`
  counts its real lines; `constraints*.txt`, a `.txt` under a `requirements` folder,
  `runtime.txt` and `CMakeLists.txt` are not documentation; a colour or text edit under `.claude/`
  or `agents/` is refused.
- [ ] The same change checked twice gives byte-identical answers; Windows line endings do not
  count as changed lines; a named path written with `\` gives the same answer as with `/`; the
  answers are identical with and without `diff.noprefix`, `diff.mnemonicPrefix`,
  `diff.interHunkContext`, `diff.algorithm`, `diff.relative`, `diff.context` and `color.diff`
  set in the repository, and with and without `diff.autoRefreshIndex=false` beside a file whose
  modification time moved while its content did not.
- [ ] A project folder that lies outside the repository git reports (a `core.worktree`
  elsewhere) is refused with `I could not read the change (this folder lies outside the
  repository git reports)`; a fault inside the check is refused with exactly
  `I could not read the change (the check stopped)` and its message in `detail`.
- [ ] npm's placeholder test script, a test runner that is not installed, a timed-out run and a
  run whose output passes 10 MiB each answer `no test ran, so nothing confirms the change`,
  never "the existing tests fail", and the quality agent names each of the four on its own
  line; a passing jest run whose counters are on standard error counts as a run; on Windows
  `npm test` starts as `<node> <node folder>/node_modules/npm/bin/npm-cli.js test` and `npx
  jest <files>` as `<node> <node folder>/node_modules/npm/bin/npx-cli.js jest <files>`, with no
  command interpreter started by CTOC, and a missing script answers `no test ran, so nothing
  confirms the change`.
- [x] Through the real menu process (`node src/commands/start.js hotfix check …` in a
  temporary project), standard output is exactly one JSON document for both calls — no test
  runner line leaks into it.
- [ ] No call changes, stages, stashes or deletes anything in the project: the files outside
  `.git/` and `.ctoc/`, `.git/index`, the stash and the list of worktrees are byte-identical
  before and after, also when the project's own tests write and stage files.
- [ ] Every pass and every refusal appends exactly one line to `.ctoc/logs/hotfix-checks.jsonl`
  with its verdict, cause and counts and no file name or wording; a `checking` answer and the
  usage answer append none; a log that cannot be written changes no answer; a log above 1 MiB
  is renamed to `.ctoc/logs/hotfix-checks.jsonl.1` and a new one started; nothing is written
  through a symbolic link at `.ctoc`, `.ctoc/logs` or the log, nor into a log that is a hard
  link (the linked file's bytes are unchanged).
- [ ] `npm test` passes: lint, typecheck, every test, coverage at or above the floor in
  `.ctoc/coverage-baseline.json`, 0 skipped; the dead-export and reachability fences hold with
  no baseline change; the `safe-fs` blind-spot fence holds (the copy's folder and links go
  through `src/lib/safe-fs.js`); the human-facing-words fence lists `src/lib/hotfix-check.js`
  among the screen modules; the count-cache fence's whitelist entry for it carries its written
  reason; CLAUDE.md's and README.md's module and test-file counts are updated.

## Risks

| Risk | Mitigation |
|---|---|
| The classifier passes a code change as text (template expressions, script, style and text-area blocks, entities, a text node crossing a tag, a multi-line text node, JavaScript comparisons and generic types in `.jsx`/`.tsx`) | The traps are written before the classifier; every shape not positively recognised is refused; the `.jsx`/`.tsx` text run forbids code punctuation and must end at the closing tag of the element it sits in |
| The test run is slow on a large suite (this repository's whole suite runs, because nothing maps a `.html` change to a test) | The run is the second, background call with one status line; the measured duration of the first live use goes into the build record (no figure is invented here) |
| Making the copy costs time: a checkout of every tracked file, expected at about a second, plus, for a project whose build output lives in the repository folder (Rust's `target/`, Java's `build/`), a rebuild in the copy, because only installed-package folders are linked | A known cost, accepted with the owner's decision; it is paid only in the background call; the measured copy time of the first live use goes into the build record |
| Git settings or attributes change the answer (line-ending conversion, pager, colour, rename guessing, external diff, text conversion, prefixes, hunk merging, diff algorithm, `binary`/`-diff`, a stat-only change under `diff.autoRefreshIndex=false`) | Fixed arguments and environment in the one git helper, `diff.autoRefreshIndex=true` pinned, `--text` and the pinned hunk shape on every diff but the patch; the patch carries `--binary --full-index -U3`, pinned prefixes and `diff.suppressBlankEmpty=false`, and `git apply` `--whitespace=nowarn` and `apply.ignoreWhitespace=no`; the determinism case runs the same change twice with `core.autocrlf=true`; the settings case compares answers with and without eight diff settings |
| A judged file changes while the check runs, so the rules judge, the tests run on and slice 2 records different bytes | Hashed before any rule reads it, compared with its id in the temporary index before the tests and hashed again after them; any difference is a refusal (case 47). Residual: a file edited and then restored to its first bytes between the first hashing and the reading of its text, which needs two edits inside one check |
| A sensitive word hides inside a joined name (`AuthPanel.jsx` splits into `AuthPanel`, which is not `auth`) | The functional plan's rule splits only at characters that are not letters; this slice follows it to the letter and names the gap here; widening it is a normal plan |
| A colour that passes is hard to read on its background | Residual, as the functional plan states; not computed |
| Changing the shared `console.log` and working directory during the test run affects something else in the process | The menu process is single-purpose and exits after one answer; both are restored in `finally`, before the copy is removed; a test asserts the working directory and `console.log` are the originals after a run |
| The log is miscounted or leaks the owner's text | One line per final answer only, closed-set causes and counts, no file name or wording; a test reads the lines back; the log is best effort and never changes a verdict |
| Files git ignores are invisible to the check (Decision 36): a test that reads an ignored local file (a `.env`, say) does not find it in the copy | A known limit: such a test fails or runs nothing there, a refusal, never a false pass; nothing ignored can be committed as a hotfix |
| A project with git submodules gets empty submodule folders in the copy, because a new worktree does not populate them | A test that needs them fails or runs nothing there, a refusal, never a false pass; named for the first live use |
| A worktree shares refs, the stash and the settings with the main repository, so a project test that stashes, tags, branches or sets a setting inside the copy changes the main repository | Residual, exactly as when the tests ran in the working folder; the copy keeps the working folder's files and the main index out of reach, not git's shared records; case 24 pins that the check itself touches neither the stash nor the main index |
| Git runs the repository's own code while it makes the copy: `worktree add` and `apply` run its smudge and process filters, and Git LFS's smudge filter can fetch objects from the network | Intended: the copy's bytes must be those a checkout gives in the working folder, and case 44 relies on the filters running. The repository's hooks (`post-checkout`, `reference-transaction`, believed) are off for `worktree add` and the file-system monitor is off for `worktree add` and `apply` (Decision 42) |
| A linked package folder leads the tests back into the working folder: a workspace link in `node_modules` or an editable Python install | Checked (Decision 41): other uncommitted work under such a target refuses; with none, the working-folder code equals the last commit plus the judged change. Residual: other ways a tool reaches the working folder by an absolute path (a path written inside a package's own files, `NODE_PATH`, a relative `.pth` line), named for the first live use |
| Ignored files inside a package folder that a workspace link reaches (its own build output, say) are the working folder's, not rebuilt from the last commit | Residual, as for ignored files generally (Decision 36); named for the first live use |
| A test that writes into a linked package folder (a cache under `node_modules/.cache`) writes into the owner's | Residual; the links are what keep installed packages available without a reinstall |
| Removing the copy reaches through a link into the owner's `node_modules` or virtual environment, or a tracked symbolic link sends a link outside the copy | Every link is removed by itself before the worktree and the folder are removed, and a link that cannot be removed stops the removal; a link's parent must lie inside the copy before anything is made for it (case 53); case 45 checks the owner's folders byte for byte after the run |
| The quality agent's timeout stops only the program it started (npm, or the configured runner); test processes that program started can keep running, and keep files in the copy open or write into it after the answer | Residual. Removal then fails on the held files and is reported in `detail` (case 43 run 6 is the reported path); the process tree is not followed |
| A process killed during the check (a closed terminal, power loss) leaves the temporary folder and its worktree registration | Residual: no `finally` runs in a killed process. `git worktree list` shows the entry as prunable once the system clears its temporary folder; the owner's own `git worktree prune`, or git's garbage collection, removes it. The check never prunes (Decision 40) |
| Moving the runner to `spawnSync` breaks tests that fake `execFileSync` | The four test files that fake the runner are declared and moved (Decision 34); Step 9 runs every quality-agent test file before the change, and any other file found is requested through `src/lib/scope-growth.js` |
| On Windows npx starts jest or vitest through `cmd.exe` with npm's own escaping (believed), so the selected test-file names reach a command interpreter that CTOC did not start | The names are tracked test files of the last commit selected by file name, never text from the change; npm's escaping is what quotes them; the first Windows use records how a name holding `%` or `^` is passed |
| The Windows behaviours (native real path, a junction made without administrator rights and read as a link by `lstat`, removing a junction without touching its target, npm's command-line scripts beside `node.exe`, Node's refusal to start a `.cmd` file directly) cannot be run on the machine this is built on | The platform seams pin the junction type and the exact launch; the first Windows use confirms the rest and goes into the build record |
| On an unusual Windows install npm's scripts are not beside `node.exe` | Nothing starts and the run reads "no test ran", a refusal; the first Windows use records the layout |

## Decisions Taken Under Ambiguity

1. **Rule order 1, 2, 7, 4, 5, 6, 3, 8.** The functional plan says the rules run in its listed
   order, but its own scenarios require an edited test to read "it changes a test" (rule 7)
   rather than "program logic" (rule 4), and the urgent 40-line scenario to name "program
   logic in src/cart.js" rather than its size. Rules 2 to 7 all read the same diff, so moving
   size after the kind rules costs nothing, and the tests still run last.
2. **Two calls, not one.** The functional plan wants the rules answered instantly and the test
   run as background work with one status line. The first call carries that line as its `text`
   and the second call as `next`, so the session needs no wording of its own and a refused
   change costs no test run.
3. **The failing test is shown as `<file>: <name>`**, for example
   `tests/home.test.js: shows Save` — the functional plan's scenario asks for the file and then
   the name of the first failing test.
4. **A binary file is refused under rule 1** ("is not text"), because rule 1 requires every
   changed file to read as text and runs first; a mode change, type change or symbolic link
   is refused under rule 2 with the "do not recognise" clause, because the functional plan's
   clause table has no separate clause for them.
5. **A named file with no change, or an ignored one, is a rule-1 refusal** ("holds no change
   that git would commit"): the change is exactly what would be committed, and a named file
   that would not be committed means the session misdescribed the change.
6. **Paths under `.ctoc/` are left out when no file is named**, because CTOC writes its own
   state and records there during ordinary work; a named `.ctoc/` file is still judged (and
   never qualifies, as a governing place).
7. **"Anything under `agents/`, `skills/`, `commands/`, `plans/`, `.claude/`, `.ctoc/`" means a
   folder of that name anywhere in the path**, not only at the root, so this repository's own
   `src/commands/start.md` (the menu's instructions) is never treated as documentation.
8. **In `.jsx` and `.tsx` the text run also may not hold `(`, `)`, `;`, `=`, `"` or `'`**, because
   those files mix code and markup on one line and a line-local reading cannot otherwise tell
   `a > b ? x : y < z` from text. Visible text with those characters is refused; a refusal
   costs one normal plan.
9. **The test run reuses the quality agent's runners and its counter reading**, with the
   working directory set to the copy's project root and its progress lines kept off the JSON
   output, because those runners take no working-directory option and print as they go.
   Writing a second test runner would be a second reading of test output to keep in step.
10. **A run whose counters read zero, or cannot be read, is "no test ran"** — including a
    project whose test script prints no counter. A refusal costs one normal plan; a pass on no
    evidence is the false green the functional plan forbids.
11. **The urgent word gets no option in this slice.** Until slice 3, a session that heard
    "urgent" runs the same check; a refused change goes to a normal plan, which is the
    functional plan's own answer when the emergency conditions do not hold.
12. **The menu entry waits for the route's result** (`Promise.resolve`) because the test run is
    asynchronous in `quality-agent.js`; synchronous routes behave exactly as before.
13. **No new dependency.** Git through `child_process`, UTF-8 checking through `TextDecoder`,
    hashing (slice 2) through `crypto`.
14. **The log of verdicts is written by the check route itself** (the owner's requirement of
    2026-10-08; the functional plan's decision 23): one line per final answer, with fixed cause
    words and counts only, best effort, so the fast path and the refusals can be counted and the
    log can never change a verdict. A check run twice on the same change is counted twice; the
    log does not deduplicate.
15. **Binary and `-diff` attributes** (session decision 2026-10-08, from the blind reviews).
    Every diff carries `--text`; a modified file whose texts differ (carriage returns before a
    line feed ignored) but that yields no changed-line group is "I do not recognise …", never a
    0-line pass. Without this, a document marked `-diff` passed with any number of changed
    lines (arm D's and arm E's high finding; arm B passes it too).
16. **The diff shape is pinned** (session decision 2026-10-08, from the blind reviews). Every
    diff carries `--no-color --no-ext-diff --no-textconv --no-renames --no-relative --text`;
    the changed-line diff adds `-U0 --ignore-cr-at-eol --src-prefix=a/ --dst-prefix=b/
    --inter-hunk-context=0 --diff-algorithm=myers --indent-heuristic`; an unchanged context
    line, should git print one anyway, is numbered on both sides and closes the group.
17. **The commit takes only the judged files** (session decision 2026-10-08, from the blind
    reviews). `commit.add` is `git --literal-pathspecs add -- <files>` and `commit.message` is
    `git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- <files>`, so a staged
    unrelated file never rides along. `--literal-pathspecs` is also on the commit (the planner's
    reading: `commit -- <paths>` reads its paths as patterns just as `add` does, so a file name
    holding `*` or `[` would otherwise match other files).
18. **Withdrawn.** The amendment's rule that refused while other uncommitted work existed
    (session decision 2026-10-08, from the blind reviews) is replaced by the owner's decision
    of 2026-10-08 (the section above): the tests run in a temporary copy, and the functional
    plan's scenario "Other uncommitted work is neither judged nor committed" holds unchanged.
19. **Dependency and build lists are not documentation** (session decision 2026-10-08, from
    the blind reviews): `requirements*.txt` and `constraints*.txt` in any letter case and any
    `.txt` under a `requirements` folder are dependency lists; `runtime.txt` and
    `CMakeLists.txt` are build files.
20. **`.jsx` and `.tsx` text closes its own element** (session decision 2026-10-08, from the
    blind reviews): the text counts only when the `<` after it is `</name` for the element
    whose opening tag ends at the `>` before it; generic types and comparison chains are
    refused. `.html`, `.htm`, `.vue` and `.svelte` keep the rule as written, because there `<`
    and `>` outside a tag cannot be code.
21. **Rule 6 reads digits by Unicode property and `www.` in any case** (session decision
    2026-10-08, from the blind reviews). Arm B's code already does both (`\p{Nd}`, the `i`
    flag); the plan now says so, and the corpus pins it.
22. **The log is never written through a link and rotates by renaming** (session decision
    2026-10-08, from the blind reviews). A symbolic link at `.ctoc`, `.ctoc/logs` or the log
    means no write; above 1 MiB the log is renamed to `.1` and a new one is created
    exclusively; no file is ever emptied. The planner's reading adds hard links: a log with
    more than one link is never written, because arm B's emptying through the descriptor
    emptied whatever other file the log was hard-linked to, and appending would write into it.
23. **Windows paths** (session decision 2026-10-08, from the blind reviews): the project root
    and git's top level are both resolved with `fs.realpathSync.native`; a project root whose
    path relative to the top level starts with `..` (or is absolute) is refused with
    `this folder lies outside the repository git reports` instead of running git with a
    pathspec outside the repository.
24. **The quality agent's inherited runner faults are fixed in the quality agent** (session
    decision 2026-10-08, from the blind reviews): a failed run's output includes standard
    error; a timeout, a runner that cannot be started (spawn `ENOENT`/`EACCES`/`EINVAL`, exit
    127 or 9009) and npm's placeholder test script are "undetermined", which the hotfix check
    reads as "no test ran" and `/ctoc:push` still blocks on. The Windows launch this decision
    first named, `cmd.exe /d /s /c "npm.cmd test"`, is replaced by Decision 35; as before,
    nothing is launched with `shell: true`, which Node 24 deprecates for arguments (a warning,
    and warnings are bugs) and the existing tests pin as `false`.
25. **Fixed sentences** (session decision 2026-10-08, from the blind reviews). The planner did
    not read the reviews' own text; this is the planner's reading of the two findings named.
    (a) "The check stopped" is one fixed clause, `I could not read the change (the check
    stopped)`, because the functional plan's clauses are fixed so a test can assert them; the
    fault's message moves to the answer's `detail` field and never reaches the log. (b) The
    places that govern the work never qualify, whatever the kind: arm B refused a governing
    document but passed a colour edit in `.claude/theme.css` and a text edit in
    `agents/card.html`; such a file now reads `I do not recognise <file> as wording or a
    colour`, while a governing file that is program code or settings keeps that kind's clause.
26. **Tests the reviews found missing or unable to fail** (session decision 2026-10-08, from
    the blind reviews): the size boundaries (20 lines and 3 files pass, 21 lines and 4 files are
    refused), a `.tsx` trap only the closing-element rule catches, `*.spec.*` outside a test
    folder, a `-diff` attribute trap, jest output on standard error, a staged unrelated file, an
    unrelated working-folder edit, git settings set in the fixture, and the log-link refusal.
    Every new case is run on arm B's code before any change: the ones that hold a fix are red
    there; the ones that pin what arm B already does are proven able to fail by a one-line
    mutation, run once and reverted.
27. **The five files every build needed** (the planner, from all five builds' records):
    `README.md` (its module and test-file counts are held to disk by
    `tests/readme-numbers.test.js`), `src/lib/human-facing-scan.js` (`SCREEN_MODULES` must list
    every module answering the screen shape), `tests/cache-freshness.test.js` (the whitelist
    entry), `src/lib/quality-agent.js` (Decision 24) and `tests/quality-agent-coverage.test.js`
    (the quality agent's own cases ship with it). The slice then stood at eleven files against a
    sizing rule of one to three, kept whole because the build continues from arm B's code;
    Decision 37 gives today's count.
28. **Arm B's build decisions 15 to 29** (in its copy of this plan, with its Execution Record)
    stand and travel with the build. Two of them correct this plan's own text and are applied
    here: fixture test scripts name files, not folders (`node --test tests/*.test.js` — on Node
    24 a folder argument is loaded as a module and fails), and the functional plan's sensitive
    words are 33, not 34.
29. **The copy is a detached git worktree of the last commit** (the planner's choice under the
    owner's decision). The other way named, a checkout into a temporary folder through a
    temporary index, leaves a folder that is not a git repository: a project whose tests run
    git in their own folder fails there, and on Windows, where the temporary folder lies under
    the user's home, git may instead find an enclosing repository such as a home-folder
    dotfiles one. A worktree is a real checkout that git finds, made with the repository's own
    settings, attributes, filters and sparse patterns, so its bytes are those a checkout gives
    in the working folder, and it has its own index. Its three costs are each handled or
    named: it is registered in git's folder until removed (removed with `git worktree remove
    --force` on every path, Decision 40; a killed process is a named residual); its checkout
    would run the `post-checkout` hook and, believed, the `reference-transaction` hook (an
    empty `core.hooksPath` for that one call, Decision 42); and it shares refs, the stash and
    the settings with the main repository, so a project test that stashes, tags or sets a
    setting inside the copy reaches the main repository exactly as it did in the working folder
    (a named residual).
30. **The change goes into the copy as a git patch, built through a temporary index and applied
    by `git apply`** (the planner's choice). The temporary index takes the judged files as they
    are in the working folder, so the patch carries changed, added and deleted files alike —
    slice 3's emergency changes, which may add a test, reach the copy whole; in this slice rule
    2 refuses an added or deleted file before rule 8. `--binary --full-index` carries binary
    content exactly; `git apply` is all or nothing; and inside the copy git applies the
    repository's line-ending and filter settings, so a project with `core.autocrlf=true` (Git
    for Windows' default) applies cleanly. A patch that does not apply means CTOC could not
    reproduce the change on the last commit, so it is rule 1's "could not read the change"
    with its own reason, never a pass. The temporary index's `add` writes the judged files'
    content into git's object store, the same objects `commit.add` writes moments later for a
    pass; nothing else of the repository is written.
31. **Only installed-package folders are linked: every ignored `node_modules` and every ignored
    folder holding `pyvenv.cfg`, across the whole repository** (the planner's choice). Those
    are what a test run needs and cannot rebuild cheaply; a link costs nothing and keeps the
    owner's packages where they are. Python virtual environments are linked because a
    configured test command may name one by a relative path (`.venv/bin/pytest`), which
    resolves against the copy. Build output (`target/`, `build/`, `dist/`) is not linked, so
    the copy builds from the last commit, never from the working folder's half-built state; the
    price is a rebuild (Risks). Directory junctions on Windows, because they need no
    administrator rights; directory symbolic links elsewhere.
32. **Removal unlinks every link first, then removes the worktree, then deletes the folder, and
    stops at the first failure** (the planner's choice; the middle step is Decision 40's), so
    no removal can reach through a link into the owner's `node_modules` or virtual environment,
    and a copy that cannot be removed is reported in `detail` instead of failing silently. A
    link that is already gone (`ENOENT`, a test removed it) counts as removed, because nothing
    is left to reach through. Before a link is made, its parent must lie inside the copy (from
    the review round of 2026-10-08): a symbolic link tracked in the last commit could
    otherwise send `mkdirSync` or `symlinkSync` outside it, and the check stops instead.
33. **What the test run reads comes only from the copy** (the planner's reading of the owner's
    decision). The tools are detected in the copy, so the first call no longer detects them,
    and a documentation-only change in a project with no test command passes from the
    `--run-tests` call (the first call answers `checking`). The selection needs no
    tracked-file filter, because the copy holds nothing else; the coverage map stays unread.
34. **The quality agent runs tests with `spawnSync` instead of `execFileSync`** (session
    decision 2026-10-08), so that a passing jest run's counters, printed on standard error, are
    read: `execFileSync` returns only standard output when the program succeeds, so a passing
    jest project's hotfix read "no test ran" — a refusal, never a false pass, but a refusal of
    every jest project. The move changes the process call that existing tests fake. Besides
    `tests/quality-agent-coverage.test.js`, three files fake the runner's `execFileSync` (read
    from their source; Step 9 runs them to confirm): `tests/quality-agent-coverage-holes.test.js`,
    `tests/quality-agent-crossplatform.test.js` and `tests/test-selection-scope.test.js`. Their
    fakes move to `spawnSync` with the same answers and no assertion changes; the module's git
    calls stay on `execFileSync`, so their git fakes stay as they are. In the quality agent's
    own test file the helper fakes both calls (from the review round of 2026-10-08): on the
    trial build, where runners still start through `execFileSync`, a helper that faked only
    `spawnSync` let cases d, e and i start a real `npm test` — this repository's gated suite,
    recursively — or `npx jest`, which can install from the network; its `execFileSync` fake
    lets `git` through and throws `runner started through execFileSync` for anything else.
35. **On Windows, npm and npx start as node running npm's own command-line script** (session
    decision 2026-10-08). Node refuses to start a `.cmd` file without a shell (since its April
    2024 security release), so `npx.cmd` never started and jest and vitest projects with a
    selected test read "no test ran" (believed; Windows cannot be run on the build machine).
    `npm.cmd` and `npx.cmd` themselves run `node <node folder>/node_modules/npm/bin/npm-cli.js`
    and `npx-cli.js`; starting those scripts with `process.execPath` needs no command
    interpreter at CTOC's level. A command interpreter that CTOC starts is safe only for a
    fixed literal (`cmd.exe` expands `%name%` even inside quotes, so no quoting by CTOC makes a
    file name safe), which is why the amendment's `cmd.exe /d /s /c "npm.cmd test"` is replaced
    and one launcher serves both. Corrected after the review round of 2026-10-08: npx then
    starts jest or vitest itself, and on Windows it does so through the package's `.cmd` shim,
    which runs through `cmd.exe` with npm's own escaping of the arguments (believed). The
    test-file names, tracked names from the last commit, therefore do reach a command
    interpreter there, escaped by npm rather than by CTOC (Risks). A missing script (an
    unusual install) starts nothing and reads "no test ran". The session's note also named
    pytest and go; they are native programs that Node starts by name (believed, from libuv's
    `.exe` lookup), so they are unchanged. The `process.platform` and `process.execPath` seam
    in the quality agent's own test pins the exact program and arguments.
36. **Files git ignores stay invisible to the check** (session decision 2026-10-08). git does
    not commit an ignored file, so none can enter a hotfix commit, and the check does not judge
    one. Ignored files are also absent from the copy (only the linked package folders are
    there), so none can steer or confirm the test run; a test that needs an ignored local file
    (a `.env`, say) fails or runs nothing there, which is a refusal. A known limit, kept on
    purpose (Risks).
37. **The slice stays one plan** (session decision 2026-10-08), because the build continues from
    arm B's code, which already spans the check, the route, the quality agent's runners and
    their tests. The session counted 11 files; carrying out the owner's decision needs
    `src/lib/safe-fs.js` and its test, and Decision 34 needs the three test files that fake the
    runner, so `files:` now declares 16, each with its reason, against a sizing rule of one to
    three. The review round of 2026-10-08 adds none.
38. **The bytes judged are the bytes tested and recorded** (from the review round of
    2026-10-08). The amendment computed slice 2's record from the working files after the
    background test run, so a file edited during the run left a record for code that was never
    judged or tested. In the `--run-tests` call each judged file is hashed before any rule reads
    its content; its id in the temporary index must equal that hash before any test runs; it is
    hashed again after the tests; any difference is `I could not read the change (<file>
    changed while it was being checked)`. Slice 2 builds its binding from the temporary index's
    ids. The first hash is taken before the content is read, not after, so a single edit in
    between is caught; only an edit undone again before the temporary index is filled escapes
    (Risks).
39. **Names the commit command cannot carry are refused under rule 1** (from the review round
    of 2026-10-08). The commit command single-quotes each path, and slice 2's one reading of a
    command refuses `$`, `\` and backticks anywhere, while a `'` inside single quotes needs the
    `'\''` escape, which holds a backslash. A judged file whose name holds `'`, `"`, `$`, `\`, a
    backtick or a control character therefore could never be committed through the hook, so
    the check refuses it up front with `<file> has a name the commit command cannot carry`
    instead of passing a change that cannot be committed.
40. **Cleanup removes exactly the copy's worktree** (session decision 2026-10-08): after the
    links are removed, `git worktree remove --force <tmp>/tree`, then `safeFs.rmSync(tmp)`. The
    amendment's `git worktree prune` would also drop every other registration whose folder is
    gone, and the owner did not ask for it; it came from the session's brief. With `remove`,
    the acceptance line "the list of worktrees is byte-identical before and after" holds, a
    stale registration of the owner's included (case 43).
41. **Code the tests load through installed packages** (session decision 2026-10-08). Linked
    package folders can make the tests load working-folder code: npm, pnpm and yarn workspace
    links inside `node_modules`, and Python packages installed in editable mode (`.pth` files
    or `__editable__` finder files in a linked virtual environment's site-packages). After
    linking, the check collects every such target whose real path lies inside the repository
    folder, and refuses when other uncommitted work than the judged files lies under one; with
    none, the working-folder code equals the last commit, so the run stays exact. Reason: it
    keeps the premise of the owner's answer "a", that tests see exactly the last commit plus the
    hotfix, without a slow reinstall. It fits in `hotfix-check.js` and its tests; no file is
    added.
42. **No other code of the repository's runs while the copy is made, except its filters** (from
    the review round of 2026-10-08). `worktree add` runs with an empty hooks folder, which
    keeps `post-checkout` and, believed, `reference-transaction` from running (Step 9 checks
    both with marker hooks), and with `core.fsmonitor=false`; `apply` runs with
    `core.fsmonitor=false`. The repository's smudge and process filters, Git LFS among them,
    still run, on purpose: the copy's bytes must be those a checkout gives, and case 44 relies
    on them (Risks).
43. **Output past 10 MiB is "undetermined", read before the timeout** (from the review round of
    2026-10-08). `spawnSync` stops a program whose output passes `maxBuffer` with the error code
    `ENOBUFS` and the signal `SIGTERM`, which the timeout reading would call a timeout; the
    counters of a cut-off output cannot be trusted, so it is undetermined with its own line,
    and the hotfix check reads it as "no test ran". Also from that round: the git helper pins
    `diff.autoRefreshIndex=true`, so a file whose modification time moved while its content did
    not is never judged, whatever the repository sets.
44. **Every read in the main repository names a copy of the repository's index** (verified:
    the session's experiment of 2026-10-08 on git 2.50.1 (Apple Git-155); it settles the
    question Step 9 used to stop the build for). After a file's modification time changed with
    its content unchanged, `git diff --quiet` rewrote `.git/index` in all four variants tried:
    plain, with `GIT_OPTIONAL_LOCKS=0`, with `-c diff.autoRefreshIndex=true`, and with both;
    `GIT_OPTIONAL_LOCKS=0 git diff --name-only HEAD` followed by `git status --porcelain` also
    rewrote it. So `GIT_OPTIONAL_LOCKS=0` does not keep the refresh that the pinned
    `diff.autoRefreshIndex=true` relies on from writing the index it read, and on the
    repository's own index the pin and case 24 could not both hold. With `GIT_INDEX_FILE`
    pointed at a temporary copy of `.git/index`, `git -c diff.autoRefreshIndex=true diff
    --name-only` left the real `.git/index` byte-identical; a file that was only touched was not
    listed, and after a real edit the file was listed while the real index stayed unchanged.
    Hence, in both calls, the index `rev-parse --git-path index` names (the right one for a
    linked worktree too) is copied once into the check's own temporary folder, and every git
    call in the main repository that compares the working tree with the index or with the last
    commit, or may refresh — the listings, the diffs, the hashings — names that copy through
    `GIT_INDEX_FILE`; the folder, the copy with it, is removed on every path of both calls. The
    pin stays, case 24 keeps `.git/index` byte-identical, and the build no longer stops for the
    owner on this point. The copy is a second file beside rule 8's temporary index, not the same
    one: the patch needs an index holding exactly the last commit plus the judged files, which
    `read-tree <id>` builds from nothing, while the listings of uncommitted work that follow it
    must see what the repository itself tracks and has staged. Not part of the experiment, so
    Step 9 records them on the build machine: the `diff HEAD` forms, the `-U0` diff, the
    hashings and the listings the check runs, and a linked worktree's index. Believed, for the
    first Windows use to confirm: Git for Windows reads a native `GIT_INDEX_FILE` path, refreshes
    into the copy and leaves `.git/index` untouched in the same way, and a copy taken while
    another git process replaces the index reads one whole version or fails, which stops the
    check (a refusal).

45. **An empty patch is not applied** (the executor, 2026-10-08). When the temporary index
    already equals the last commit (a judged file whose only change git's line-ending
    settings undo), `git apply` refuses the empty input ("No valid patches in input",
    measured on this machine), so the check skips it: the copy then is the last commit,
    which is exactly the judged change. Any other `apply` failure is still the refusal.
46. **An installed-package entry is linked only when it leads to a folder** (the executor).
    `statSync` follows a link, so a `node_modules` that is itself a symbolic link is linked
    by its real path, and an ignored file named `node_modules` is never linked. The
    `--directory` listing also shows folders that hold only ignored content (`packages/`,
    `packages/a/` in Step 9's run); they are neither `node_modules` nor hold `pyvenv.cfg`,
    so they are skipped.
47. **A blank context line that git prints empty counts as context** (the executor). Under
    `diff.suppressBlankEmpty=true` a blank unchanged line prints as an empty line; should a
    context line appear at all (only if git ignored `--inter-hunk-context=0`), any body line
    that is not `-`, `+` or the `\` marker advances both sides and closes the group.
48. **The trial build's reader of git's quoted path names is removed** (the executor). With
    `core.quotepath=false` git quotes a name in a patch header only for a control
    character, `"` or `\`, and every such judged name is now refused by the name check
    before the changed-line diff runs, so the reader could never run (a dead branch). The
    trial build's quoted-name case moved to a name with spaces, a star and letters beyond
    ASCII, which still pins `--literal-pathspecs`.
49. **Both hashings treat a judged file that is not a regular file the same way**
    (the executor). The second hashing uses the first hashing's rule, so a judged file
    deleted or replaced while the tests ran reads `deleted` or `not a file`, differs from its
    temporary-index id and refuses as "changed while it was being checked", instead of
    stopping the check on a git error.
50. **A hunk header keeps the trial build's pattern** (the executor). The linter's
    unsafe-regular-expression rule refuses the optional-group form `(?:,(\d+))?`; the trial
    build's `,?(\d*)` reads the same headers and passes it (the trial build's decision 25).

51. **Every git call runs no code of the repository's** (decision at review, 2026-10-08;
    source: the security check, which traced `post-index-change` running twice per
    `--run-tests` call and a configured file-system monitor 14 times). The check's
    temporary folder and its empty `no-hooks` folder are now made before the first git call,
    and `runGit` puts `-c core.hooksPath=<no-hooks> -c core.fsmonitor=false` in front of
    every call, so no call can miss it; the per-call settings on `worktree add` and `apply`
    are gone. Reason: Decision 42 turned them off for two calls only, and the temporary
    index's `read-tree` and `add`, the listings and the hashings still ran the repository's
    hooks and monitor. The smudge filters still run, as Risks says. Case "finding 1".
52. **The failing-test reader's line-start patterns match spaces and tabs only**
    (decision at review; source: the security check, 195 KB of blank lines took 68.6 s).
    `^\s*` with the multiline flag let every line start try every later line; all five
    patterns now use `[ \t]*`, and the two trailing `\s*$` too. Case "finding 2a".
53. **The JSON catalogue tail is `([\s,]*)$` with at most one comma, not the prescribed
    `(\s*(?:,\s*)?)$`** (decision at review; source: the security check, 3.7 s on 100,000
    trailing spaces). The prescribed form is linear but the project's
    `security/detect-unsafe-regex` lint rule refuses it (`eslint --max-warnings 0` failed on
    it), and warnings are bugs. `([\s,]*)$` plus "the tail holds at most one comma" accepts
    exactly the lines `(\s*,?\s*)$` accepted, in one pass. Case "finding 2b".
54. **The colour rule is linear** (decision at review; source: the security check, a 300 KB
    one-line stylesheet took 0.6 s). The mask is built by joining the parts once, not by
    slicing the line per token; the property of each declaration is read once, by one
    forward pass over the line, not by searching back from every changed token (one long
    declaration whose every colour changed was quadratic too). Case "finding 2c", both shapes.
55. **The markup block finder counts line breaks once, forward** (decision at review; source:
    the executor, sweeping finding 2's class: 20,000 `<script>` blocks took 5.3 s, because
    every block's line number was counted from the top). Not named by either reviewer;
    fixed because it is the same fault in the same file. Case "finding 2, same class".
56. **Four argument-vector cases pin the platform to Linux** (decision at review; source:
    the review and security brief, item 3). They find or fake the jest or vitest call by
    `args[0]`, which on Windows is npm's own `npx-cli.js`; they now run inside
    `withPlatform('linux', null, …)` as case i does, and the vitest program is asserted as
    exactly `'npx'`. The Linux pin is the contract those cases state ("npx by name"); the
    Windows launch is case g's. Under a simulated `win32` platform (a preload that sets
    `process.platform`, `--test-isolation=none`) the old four failed and the new four pass.
57. **Five text files are settings, `url(…)` is never a colour, and a named colour counts
    only where a colour can stand** (decision at review; source: the brief's item 4, three
    edits that reached `checking`). `robots.txt`, `ads.txt`, `app-ads.txt`, `security.txt`
    and `llms.txt` (any letter case) take the settings clause; every `url(…)` span is blanked
    before the colour tokens are read; a named colour (`red`, `transparent`) passes only in a
    property ending in `color`, in a colour-carrying shorthand (`background`, `border` and its
    sides, `outline`, `column-rule`, `fill`, `stroke`, `box-shadow`, `text-shadow`,
    `text-decoration`, `text-emphasis`) or in a custom property or variable (`--x`, `$x`,
    `@x`); hexadecimal and functional colours keep the old rule. The corpus gains the three
    traps and one passing named colour in a custom property (now 25 that qualify and 61
    traps, where the acceptance line says 24 and 58); the other four names are edge shapes.
58. **A refused test command is "no test ran"** (decision at review; source: the brief's
    item 6). The quality agent's `runFullTests` and `runSpecificTests` answer a configured
    command refused for shell structure with `refused: true` (still `passed: false`, so
    `/ctoc:push` blocks as before), and rule 8 maps it to "no test ran, so nothing confirms
    the change" instead of "the existing tests fail (the test command reported a failure)".
    Cases "finding 6" and the quality agent's "shell structure is refused".
59. **Counters are read from standard output first** (decision at review; source: the
    brief's item 7). `runCommandArgv` keeps `stdout` and `stderr` beside `output`; the
    counters are read from standard output when it carries any counter or summary, else from
    standard error (jest's case). Before, the two were joined and the last match won, so
    `ℹ fail 0` on standard error outvoted `ℹ fail 1` on standard output.
60. **Named files are cleaned in every sentence** (decision at review; source: the brief's
    item 8). "is outside this project" and "holds no change that git would commit" replace
    control characters with a space, as the name check's sentence already did. Case
    "finding 8" (`nope\u001b[2J.md`).
61. **`--` ends the options; `next` carries it only for a name that starts with `-`**
    (decision at review; source: the brief's item 9, narrowed by the coordinator the same
    day). After `--` every word is a file, so `--x.md` can be judged and tested. `next`
    stays exactly `hotfix check --run-tests '<file>' …`, byte-identical to the acceptance
    criterion, and becomes `hotfix check --run-tests -- '<file>' …` only when at least one
    judged name starts with `-` (a mixed set included). The usage text keeps the
    specification's wording. Cases "case 1 + 26" (the acceptance criterion's `next`, red
    while `--` was always emitted) and "finding 9" (`--x.md` alone, and with `notes.md`,
    each `next` routed to a pass).
62. **Removal never unlinks through a folder that moved outside the copy** (decision at
    review; source: the brief's item 10). Before each unlink the link's folder's real path
    must lie inside the temporary folder; if not, removal stops and `detail` says "a link's
    folder moved outside it"; a folder that is gone counts its link as removed. Without
    links, git itself refuses to remove a worktree that was swapped for a link ("validation
    failed"), so no second guard was added there; case "finding 10" (b) pins that refusal.
    `removeCopy` now runs once per check (it clears the folder from the context first).
63. **A kill from outside removes the copy** (decision at review; source: the brief's item
    11). While the temporary folder exists, SIGINT, SIGTERM and SIGHUP run the same
    synchronous removal, remove the handlers and raise the signal again; after the normal
    removal the check yields one turn of the event loop, so a signal that arrived during the
    test run reaches its handler rather than being dropped, then removes the handlers. A
    signal that arrives while `spawnSync` runs the tests is handled when that run returns.
    Case "finding 11": a child process killed with SIGTERM while its tests run ends by
    SIGTERM with no copy left and its worktree registration gone; on Windows, where an
    outside kill is a forced end no handler sees, the case checks only that the handlers are
    removed after a check. The Risks row on a killed process now holds for a forced kill and
    power loss only; the row on timed-out tests stays accurate: `spawnSync` ends only the
    program it started, never its process group.
64. **Case 47 (b) injects its edit at a new seam** (decision at review; the executor). It
    edited the file on the first `mkdirSync`, which was the `no-hooks` folder inside rule 8;
    that folder is now made before any git call (Decision 51). It now changes the file right
    after the rules read its content (the first `readFileSync` of it), still after the first
    hashing and before the content is staged for the copy, to another wording change, so
    only the hashes can tell; the assertion is unchanged.
65. **The rules judge the bytes `git add` stages; an index bit that hides the working file
    refuses** (decision at review, 2026-10-08; source: the targeted security check's item 1,
    high). With a staged edit plus further working-tree edits and the assume-unchanged bit,
    `core.ignoreStat=true` or the skip-worktree bit, the rules judged the staged copy (2
    lines) while `git add` and `commit --only` took the working file (32 lines, 30 of them
    `<script>`); with skip-worktree `git add` failed. Both calls now stage the judged files
    in the temporary index (`read-tree` of the last commit, `add --all -- <judged>`) right
    after the listing, read the new text from it (`cat-file blob <id>`) and the changed
    lines from `diff --cached <last commit> -U0` on it, so the rules judge exactly what
    `git add` stages; rule 8 builds its patch from the same index instead of making its
    own. And after the index copy, `ls-files -v -z -- <judged>` refuses any judged file
    tagged in lower case or `S`: "I could not read the change (<file> is marked in git's
    index as unchanged or skipped)". The specification's "new content from the working
    tree" is now "new content from the staged copy of the working tree"; the first hashing
    moves from before the staging to right after it (still before any rule reads the
    content), so case 47 (b)'s edit lands between the two and only the hashes tell. Each of
    the two parts alone refuses all three shapes (part (a) alone: "I do not recognise
    src/pages/home.html as wording or a colour", the 30 script lines seen).
66. **A tag ends at its first `>` outside quotes and braces** (decision at review; source:
    the security check's item 2, high). The text finder took the last `>` before the
    change and the last `<` before that, so an attribute value holding `>` before the
    change and `<` plus a letter after it read as visible text (`onclick`, Vue
    `:disabled`, Angular `(click)`, `href` to `javascript:steal()`, a `style` `url()`).
    The line is now read from its start: a tag opens at `<` plus a letter or `</` plus a
    letter and closes at the first `>` outside `"`, `'`, a backtick and braces; a change
    inside a tag, or with no tag closed before it, is not text. Braces keep JSX's
    `onClick={() => a > b}` a tag (an edge shape).
67. **The folder rules read the path from the repository top** (decision at review; source:
    the security check's item 3). The sensitive-word rule, the test folders, the governing
    folders, the build folders, the database folders and the `requirements` folder now read
    `topRel`; the clauses still show the path from the project root. One case per rule
    kind: projects in `services/payment/`, `tests/e2e/`, `agents/x/`, `.circleci/web/` and
    `db/migrations/app/`.
68. **Dependency and build lists that end in `.txt`** (decision at review; source: the
    security check's item 4). Any `.txt` whose name contains `requirements` or
    `constraints` is a dependency list; `packages.txt`, `apt.txt` and `version.txt` (any
    letter case, as `CMakeLists.txt` and `runtime.txt` now are) are build files.
69. **A catalogue value must read as wording** (decision at review; source: the security
    check's item 5). A changed value is refused, on either side, when it has no letter
    outside its placeholders, starts with a scheme (`name:` and a character that is not
    white space) or `/`, or is an unquoted YAML or properties `true`, `false`, `yes`,
    `no`, `on`, `off`, `null` or `~`. The executor added one thing the item implies: the
    escapes `\uXXXX`, `\xXX` and `\UXXXXXXXX` are read as their characters before these
    tests, so `"javascript:alert()"` is an address too (an edge shape).
70. **Documentation: changed words, scripts, front matter, other assistants' instruction
    files, release notes** (a session decision made on the owner's behalf because each
    item only tightens a security check; source: the security check's item 6). (a) Rule 6
    now reads documentation too, in the changed words only: for a line replaced line for
    line, the differing part widened to whole words (runs between white space); every line
    of a group that adds or removes lines whole; a number, a currency sign, `@`, `://` or
    `www.` refuses. A typo fixed on a line that holds a link still passes (a qualifying
    shape). (b) In Markdown, a changed line inside a `<script>`, `<style>` or `<textarea>`
    block is not recognised. (c) A changed line inside Markdown front matter (a first line
    `---`, after an optional byte-order mark, closed by `---` or `...`) is a setting; an
    unclosed first `---` is not front matter. (d) `AGENTS.md`, `GEMINI.md` (with
    `CLAUDE.md`, any letter case), `.github/copilot-instructions.md` and anything under
    `.cursor/` govern the work. (e) `.changeset/` is a build folder, and a build folder now
    refuses every kind, documentation included.
71. **A colour token before a `{` stands in a selector** (decision at review; source: the
    security check's item 7). In `nav:hover #add {display:none}`, `nav:` read as a
    property; now a token followed by `{` before the next `;` or `}` stands in no
    declaration. Residual, not fixed: a selector whose `{` is on a later line
    (`nav:hover #add,`) still reads as a declaration.
72. **An `<option>` with no `value` sends its text** (a session decision; source: the
    security check's item 8). Its text is the submitted form value, so a change to it is
    not recognised; with a `value` attribute (quoted attribute values blanked first, so a
    `value` inside another value does not count) the text is wording.
73. **A pass names the judged bytes for slice 2's gate** (decision at review; source: the
    security check's item 9). A project's own pre-commit hook may rewrite the judged file
    or stage another while `commit.message` runs; `--no-verify` is not added, because
    project hooks may scan for secrets. The pass now carries `commit.judged`, `[{ path,
    blob }]`, each judged file with its id in the temporary index. Comparing the real
    commit with it belongs to slice 2's gate, not to this slice.
74. **The end of a script block is found in the text itself** (decision at review; source:
    the re-review's item 10). `toLowerCase` turns U+0130 into two characters, so the
    closing tag's offset in the lower-cased copy landed one character late per U+0130 and
    the next block was skipped. The closing tag is now found with a case-insensitive
    pattern in the original text. No other lower-cased copy in the module is indexed back
    into its original (each feeds a set lookup).
75. **The quality agent's line-start counters match spaces and tabs only** (decision at
    review; source: the re-review's item 11). `parseFailCount`, `parsePassCount` and
    `hasTestSummaryEvidence` used `^\s*` with the multiline flag, which tries every later
    blank line from every line start, and the hotfix check reads every passing run twice.
76. **A failure on either stream fails the run** (decision at review; source: the
    re-review's item 12, the mirror of Decision 59). With `ℹ fail 0` on standard output and
    `ℹ fail 1` on standard error, exit 0, the run passed; `runCounters` now takes the
    larger fail count of the two streams.
77. **The edge-shape case counts its passes from its table** (the executor). It asserted
    two `hotfix` log lines; the new unclosed-front-matter shape is a third pass, so the
    count is now the table's passing shapes plus the two-file pass.

78. **Each language is judged by one whole-file scanner per side** (decision at review,
    2026-10-09; source: the session's decision after the third security round against
    `f486ee4a`, whose high finding was a quoted attribute value running over two lines).
    Rule 4 no longer reads one changed line at a time for markup, stylesheets and
    documentation; the changed-line groups still give rule 3's size, rule 6's changed words
    in documentation and the catalogue's line pairs. The wording the specification fixes
    for each kind is kept where a scanner can carry it: a markup text edit lies between two
    tags on one line and holds no `{`, `}`, `$`, backtick or `&` (in JSX also none of
    `(`, `)`, `;`, `=`, `"`, `'`); in JSX between an opening tag and the closing tag of the
    same name; a colour stands in a declaration value whose property stands on the same line.
79. **The markup scanner** (decision at review, 2026-10-09; source: the session's item 1).
    A state machine after the HTML tokenization model, simplified: data; a tag (name,
    attribute names, unquoted, single- and double-quoted values, `/>`, braces); comments,
    `<!…>`, `<![CDATA[…]]>`, `<?…>` and `</` without a letter; raw text; braces as one
    opaque expression. Character references stay in their token. Both whole files are
    scanned; the two token sequences must be equal in length, kind and content except text
    tokens in data, each of which must pass Decision 78's text rules and rule 6. The
    executor's choices, each stricter or needed by an existing shape: (a) raw text also
    covers `<xmp>`, `<iframe>`, `<noembed>`, `<noframes>`, `<noscript>` and `<plaintext>`,
    which browsers read raw too, and `<script>` follows the script-data escape states, so
    `<!--<script></script>` does not end the block; (b) `<template>` text is never wording
    (the item's raw text), read by the tokenizer rather than skipped so that a `<script>`
    inside it stays a script; in `.vue` the first top-level `<template>` is the component's
    markup, because otherwise no Vue wording edit could qualify (the corpus shape
    `NameField.vue` is one); (c) braces are opaque in every markup kind, in data and inside a
    tag: HTML, Vue and Svelte count braces and skip strings (`{/if}` is no regular
    expression), JSX reads JavaScript (strings, template literals, comments, regular
    expressions, and every `<` that starts an element where an operand is expected); (d) a
    `<` in a changed text token refuses, which keeps the edge shape `<p>Save <3</p>` refused
    as before.
80. **The stylesheet scanner** (decision at review, 2026-10-09; source: the session's item 2
    and the property test). Strings, `/* … */` comments, unquoted `url(…)` and, in SCSS,
    Sass and Less, `//` comments are blanked keeping their length; statements run to the
    `{`, `;` or `}` that ends them across the whole file, so a statement ending in `{` is a
    selector wherever its `{` stands (the trap `nav:hover #add` with `{` on the next line); a
    declaration needs `name:` at its start, and at depth 0 only a variable or custom property
    is one; the property must stand on the token's own line (keeps the edge shape `color:` /
    `red;` on two lines refused). The two whole texts with every colour token masked must be
    identical. Sass's indented syntax: a line opens a block when the next non-blank line is
    indented further. The property test found `rgb(<11, 94, 215)` and `rgb(/11, 94, 215)`
    passing as colours on `f486ee4a`: a colour function now counts only in one of its two
    written forms (three or four comma-separated numbers, or three space-separated numbers
    with an optional `/ alpha`), each number read by hand.
81. **Markdown and reStructuredText** (decision at review, 2026-10-09; source: the session's
    item 3). Front matter in three forms is settings (`---` YAML, `+++` TOML, a JSON object
    whose first line is `{` or starts with `{"`; the executor narrowed "starting with `{`" so
    that a Liquid `{%` on line 1 is not front matter, the corpus trap `docs/liquid.md`).
    Fenced (both kinds) and indented code is code; an unchanged line whose class the change
    moves (a fence removed) refuses too. The prose is read by the markup scanner in a
    Markdown mode where only `{{…}}` and `{%…%}` are template braces (a lone `{` in prose is
    common). The executor added two exact comparisons the item implies: inline code spans
    (a changed `pip install` inside backticks is the same typosquatting route as in a
    block), and link targets with full references `[text][label]` and shortcut references
    that name a definition (changing the label changes the target). In reStructuredText the
    line and indented body of `raw`, `code`, `code-block`, `sourcecode`, `include` and
    `literalinclude` (also behind a substitution, `.. |logo| raw:: html`) are code, and a
    changed line holding `{{` or `{%` refuses. Markdown under `.github/` is documentation
    again except under `.github/workflows/` and `.github/copilot-instructions.md`; because
    that reopens `.github/`, GitHub's other assistant files now govern: names ending
    `.instructions.md`, `.prompt.md` or `.chatmode.md`, and the folders
    `.github/instructions/`, `.github/prompts/` and `.github/chatmodes/`.
82. **Catalogue values are decoded, then read as an address** (decision at review,
    2026-10-09; source: the session's item 4). JSON through `JSON.parse('"'+raw+'"')`;
    YAML double-quoted through YAML's escape table, single-quoted with `''`; Gettext through
    C's escapes; properties through its own (a backslash before any other character is that
    character). An escape the format refuses refuses the value. Then tabs and line breaks
    are removed and control characters and spaces trimmed at both ends, by hand (a trimming
    pattern would be quadratic); the address start now also refuses a leading `\` (`/`
    already covered `//`); rule 6 reads the decoded value, so an escaped `@` is seen. The
    executor added: a plain YAML value is refused when it starts with `#`, `]` or `}`, or
    with `-`, `?` or `:` followed by a space, or holds `: ` or ends with `:` (YAML reads each
    as a comment or structure, never as the wording).
83. **More instruction files govern** (decision at review, 2026-10-09; source: the session's
    item 5): the names `claude.local.md` and `conventions.md`, the folders `.windsurf`,
    `.clinerules`, `.roo`, `.kiro`, `.junie`, `.amazonq` and `.continue`.
84. **Rule 5 asks CTOC's own lists** (decision at review, 2026-10-09; source: the session's
    item 6, the registry fan-out finding). `isSecretTarget` from `src/hooks/guard-files.js`
    and `isProtectedEnforcementPath` from `src/lib/protected-paths.js` are required, not
    copied; both load without side effects (the hook runs only as a script). Neither names a
    word, so the clause says `secret` and `enforcement`. A sensitive word also matches with
    `s` or `es`, and the clause names the word itself (`tokens.txt sits in an area named
    token`).
85. **The re-review's remaining items** (decision at review, 2026-10-09; source: the session's
    item 7). (a) The `core.ignoreStat` shape now asserts the "marked in git's index"
    sentence. (b) `(\d+)\s+skipped`, `(\d+)\s+pending`, `(\d+)\s*(passed|passing)` and the
    two jest `Tests:` patterns carry `(?<!\d)`, so a run of digits is read once. (c) The
    loose objects that `add` into the temporary index writes into `.git/objects` are
    recorded in the module as a known, harmless side effect and not avoided: `git add`
    writes the same objects, on a pass `commit.add` stores the very same ones, `git gc`
    removes an unused one, and avoiding them would mean a second object folder named on
    every call that reads the temporary index.
86. **`ruleRefusal` is exported for the property test** (the executor). The property test
    judges 5,904 edited texts; through git each takes about 92 ms (measured), so it calls
    the rules directly and checks one refused and one passing variant per shape through
    the real route. `judge` calls `ruleRefusal`, so the export has a live caller.
87. **The property test's named passes** (the executor, under the session's item 8). A
    variant that passes must have its inserted character in a table of visible data text
    per kind, with the reason: markup text `" ' ( ) = : / \ # ; *`; JSX text `: / \ # *`;
    catalogue values `' ( ) = : / # ; * "` and a backslash that the format reads as a
    control character or (properties) drops before a letter; Markdown prose
    `> " ' ( ) = : / \ # ; * }`, a lone `{`, and a `<` that starts no tag; plain text and
    reStructuredText every character but `@`. Colour values allow none.
88. **Instruction files by class, and no documentation in a dot-folder** (decision at
    review, 2026-10-09; source: the automated commit security review, item A). Agent
    instruction files apply per folder, so the name list becomes a class matched at any
    depth, any letter case: `AGENTS.md`, `CONVENTIONS.md`, `copilot-instructions.md`,
    `.cursorrules`, `.windsurfrules`, any `CLAUDE*.md` and `GEMINI*.md`, and any name
    ending in `.mdc`, `.instructions.md`, `.prompt.md` or `.chatmode.md`. The explicit
    `.github/copilot-instructions.md` path and the name and ending lists of Decisions 70, 81
    and 83 are gone (the class covers them); the governing folders stay (they also refuse
    markup, catalogue and colour files, which the dot-folder rule does not cover), and so do
    `.github/instructions/`, `.github/prompts/` and `.github/chatmodes/` (a file there need
    not carry the ending). Documentation inside any dot-folder anywhere is not recognised,
    except Markdown under `.github/` outside `.github/workflows/`; the build-folder clause
    runs first, so `.changeset/` notes and `.github/workflows/` Markdown keep theirs.
89. **reStructuredText roles** (decision at review, 2026-10-09; source: the automated commit
    security review, item B). A role can be defined as `raw` and carry HTML. The `role` and
    `default-role` directives and their options are code (Decision 81's directive rule), so
    adding, removing or changing one refuses; every role span, `:name:` before or after the
    backquoted text, is compared exactly with its name. The executor added, by the same
    reasoning: interpreted text without a role (a `default-role` may make it a role), inline
    literals (the Markdown code-span reasoning of Decision 81), the target of a hyperlink
    reference (`<…>`, or the whole text when the text names the target) and a link target
    line `.. _name: address` are compared exactly too. Plain text outside them is wording.
    The property test inserts each of the 16 characters at every position inside a role
    span: every variant refuses.

## Execution Record

Built by the iron-loop executor in the worktree `.claude/worktrees/hotfix-s1-build`
(branch `hotfix-s1-build`), 2026-10-08, from `768c097d` (today's main v6.14.123 plus the
trial build's code, arm B at `3d163d56`, applied three-way, plus this approved plan). The
specification hash was checked before the first plan edit and after every plan edit:
`4aaf099b44f61ce1721e1bd2309bc781e49f2b8a2896c60aff3ecb22e80f8003`, equal to the approval
record's `content_sha256`. Steps 11, 13 and 16 are left to the session's reviewers.

**Commits.** `826be698` the red tests; `7c697132` the check, the runners, safe-fs, the
registry, the whitelist, the counts; `261c4bea` the hashing branch case and the runners'
documentation; `44f3bca4` cases 29, 39 and 40 assert their own fault first; the plan
record follows.

### Carried from the trial build

From arm B's own copy of this plan (`git show trial-hs1-b:plans/todo/…-s1-the-hotfix-check.md`),
its decisions 15 to 29, with what still holds:

- 15 (fixture scripts name files: `node --test tests/*.test.js`; on Node 24 a folder
  argument fails) — holds; every fixture follows it.
- 16 (`NODE_TEST_CONTEXT` cleared around the nested run) — holds; the test helper clears it.
- 17 (with no test command the first call already answers) — **replaced** by this plan's
  Decision 33: the first call answers `checking`; a documentation-only pass comes from the
  `--run-tests` call (case 17).
- 18 (a pass carries `tests`: `N test(s) passed.`, or the no-test-command sentence) — holds.
- 19 (a missing sub-command reads `Unknown hotfix command: (none).`) — holds; case 27 now
  pins the exact text.
- 20 (the git helper removes git's redirecting variables and sets `GIT_LITERAL_PATHSPECS`)
  — holds, extended by `diff.autoRefreshIndex=true` and the copy of the index (Decisions 43
  and 44).
- 21 (33 sensitive words) — holds (this plan's Decision 28).
- 22 (the 148 named colours from the installed `color-name` 1.1.4, inlined) — holds; the
  specification text still could not be opened (no network here), so Step 9's colour-list
  box stays open.
- 23 (folder names compared in lower case) — holds.
- 24 (naming `.` is "outside this project") — holds; case 21 now pins it.
- 25 (line shapes held to the linter's no-nested-quantifier rule) — holds; Decision 50.
- 26 (the log never written through a symbolic link) — holds, extended: hard links, the
  `nlink`/descriptor check, rotation by renaming instead of emptying (Decision 22).
- 27 (`file://host` shown as written; names and files cleaned, 200 characters) — holds.
- 28 (the `requirements.txt` trap at `deps/`) — holds.
- 29 (two files outside the old `files:` needed) — resolved: `README.md` and
  `src/lib/human-facing-scan.js` are declared now and were edited.

Arm B's record: 94 of 94 red before its code, 107 of 107 green after; its real flow passed
a one-word change in 0.39 s with the old commit command; its `npm test` ended at 5 failures,
all five the two then-undeclared files, which this build edits.

Arm B's cases that this plan replaces, changed only toward the new contract (none loosened):
every `commit` assertion (`--literal-pathspecs`, `--only`, Decision 17); case 4 now also
runs the commit (the functional plan's scenario); case 17 (Decision 33); case 28 (the
checking answer writes no line, the pass line comes from `--run-tests`); the 1 MiB emptying
case → case 39 (rename); the corrupt-index wording → case 34 (fixed clause, `detail`); the
missing-folder "check stopped" case (fixed clause, `detail`); the quoted-name case
(Decision 48); the corpus (first call, `checking`; 24 and 58 shapes; arm B's ternary
`Compare.tsx` is renamed `Pick.tsx`, because the plan's `Compare.tsx` is the comparison
chain); the selection case (it now asserts the selected test lies in the copy); the
log-link case (case 41: `.ctoc` as a link added, answers compared with a reference run).
The edge-shape case gained four `.jsx` closing-element shapes, `.env`, a `webpack` config,
`docs/CLAUDE.md` and `skills/x/helper.js`.

### Step 9 facts

git 2.50.1 (Apple Git-155), Node v24.14.1, macOS (Darwin 27.0.0).

The session's verified facts of 2026-10-08, recorded as given: (a) after a file's
modification time changed, every form of `git diff` rewrote the real `.git/index` — plain,
with `GIT_OPTIONAL_LOCKS=0`, and with `-c diff.autoRefreshIndex=true`; through
`GIT_INDEX_FILE` set to a temporary copy the real index stayed byte-identical, a file that
was only touched was not listed, and a real edit was listed. (b) With `core.splitIndex=true`
and a split index in place, a diff through the copied index left the `.git` folder listing
and the real index unchanged. (c) A `git diff` naming one file does refresh and rewrite the
whole real index, other touched files' entries included: **the plan's believed sentence that
it does not (case 24, "git refreshes only the entries a diff covers") is false.** Case 24
still holds, because every comparison uses the copy. Repeated here: naming `a.md` while
`a.md` and `b.md` were only touched rewrote `.git/index` and refreshed `b.md` too, for both
`diff --quiet -- a.md` and `diff HEAD --raw -- a.md`; when the named file itself needed no
refresh (it had a real edit) and only `b.md` was touched, the index was not written.

Measured on this machine for this plan's Step 9:
- Each pinned argument wins over its setting: `--src-prefix=a/ --dst-prefix=b/` gave
  `diff --git a/docs/guide.md b/docs/guide.md` under `diff.noprefix=true` and
  `diff.mnemonicPrefix=true` (unpinned: `diff --git docs/guide.md docs/guide.md`); `--text`
  printed the changed lines of a `-diff` file (without it: `Binary files … differ`);
  `--no-relative` listed all three changed paths from a sub-folder under
  `diff.relative=true` (without it: only `a.md`); `--no-color` printed no escape byte under
  `color.diff=always`; with `-c diff.autoRefreshIndex=false` a file whose time moved was
  listed by `diff HEAD --raw`, and with the pin over a configured `false` it was not.
  `--ignore-cr-at-eol` hid a CRLF-only line; `--raw -z --no-renames --no-abbrev` gave full
  ids and NUL-separated records.
- Decision 44 repeated for the forms the check runs, a stat-moved committed file present,
  nothing named: on the repository's own index `diff HEAD --raw -z` REWROTE `.git/index`
  (main working tree and a linked worktree alike); the `-U0` diff of a really-edited file,
  `hash-object`, `ls-files --others` and `ls-files --others --ignored --directory` left it
  unchanged; through a copy made as rule 1 makes it (`rev-parse --git-path index`, `cpSync`
  with `preserveTimestamps`) all five left the repository's index byte-identical, in the
  main working tree and in a linked worktree (`rev-parse --git-path index` named
  `.git/worktrees/<name>/index` there).
- `worktree add --detach` with `core.hooksPath=<empty folder>` and `core.fsmonitor=false`
  ran neither `post-checkout` nor `reference-transaction` (marker hooks; a control run
  without the empty folder ran both, so the believed `reference-transaction` part is now
  verified on macOS). `worktree remove --force` deleted the worktree's folder and its
  registration and left a stale registration of another worktree listed (`prunable`).
- A patch built through a temporary index (`read-tree`, `add --all`, `diff --cached
  --binary --full-index -U3`) applied with `git apply` inside the worktree under
  `core.autocrlf=true` with CRLF working files (the copy's file read `one\r\nTWO\r\n`),
  carried an added and a deleted file, and was refused whole when one hunk did not apply
  (`error: patch failed: docs/a.md:1`; the added file was not written, the deleted one was
  still there). An empty patch is refused ("No valid patches in input") — Decision 45.
- `hash-object -- <file>` equalled the id `ls-files --stage` read from the temporary index
  after `add --all`, for CRLF working files under `core.autocrlf=true` too. The main
  `.git/index` bytes were unchanged by all of it.
- `ls-files --others --ignored --exclude-standard --directory -z` listed `.venv/`,
  `build/`, `node_modules/`, `packages/`, `packages/a/`, `packages/a/node_modules/` and
  `vendor/node_modules/` (with `vendor` a symbolic link in the last commit and a real
  folder in the working folder).
- The copy's time on this repository (3,635 tracked files): `worktree add` 376 ms, the
  temporary index, patch and apply of a one-word README change 69 ms, `worktree remove`
  and the folder's removal 180 ms; 625 ms in all. On a tiny scratch repository: 95–152 ms
  for add, patch and apply, 9–10 ms for removal.
- `execFileSync(process.execPath, ['-e', '0'], { shell: true })` printed
  `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true can
  lead to security vulnerabilities, as the arguments are not escaped, only concatenated.`
  `spawnSync` of a program printing 2 MiB with `maxBuffer` 1 MiB answered the error code
  `ENOBUFS` with the signal `SIGTERM` and status `null`; a missing program `ENOENT`; a
  timeout `ETIMEDOUT` with `SIGTERM`.
- Read: `menu-screens.js` and `start.js` as on today's main (the `hotfix` case and the
  settled print are arm B's, present); `quality-agent.js` exports `runFullTests` and
  `runSpecificTests`; `tool-detector.detectTools(path).tools`; `coverage-map` exports
  `findTestsByHeuristic`; `.ctoc/quality-config.yaml` reads `languages:` →
  `<language>:` → `test: <command>` (space-indented), a `test` override clearing
  `testFromScript`.
- Every `tests/quality-agent*.test.js` file and `tests/test-selection-scope.test.js` passed
  on the unchanged quality agent (110 tests). The three files of Decision 34 fake the
  runner's `execFileSync` (read, then confirmed by the full suite after the move); the
  other files that fake `execFileSync` fake it for the security scanners or for git, not
  for the test runner. No existing test pinned a fault this slice fixes; the one launcher
  assertion (`npx` or `npx.cmd`) moved to the new contract (`npx` by name off Windows;
  case g pins Windows).

Believed, not verified here (Windows cannot be run on this machine): Git for Windows reads
a native `GIT_INDEX_FILE` path and refreshes into the copy the same way; Node's refusal to
start a `.cmd` file directly; a junction made without administrator rights; `lstatSync`
reading a junction as a symbolic link; `unlinkSync` on a junction removing the junction and
not its target; `npm-cli.js` and `npx-cli.js` under `<node folder>/node_modules/npm/bin/` in
the official installer's layout; npx starting jest's `.cmd` shim through `cmd.exe` with
npm's own escaping; `pytest` and `go` started by name. Also believed: the existing
quality-agent argument assertions that find the jest call by `args[0] === 'jest'` read the
launch off Windows; on a Windows install with `npx-cli.js` beside `node.exe` the first
argument is that script, so those assertions would need the platform pinned there
(continuous integration runs on Linux only).

### Step 8 — red before the implementation, green after

Run on the trial build's code (this branch at `826be698`, whose `src/` is `768c097d`'s):
`tests/hotfix-check.test.js`, `tests/hotfix-check-corpus.test.js`,
`tests/quality-agent-coverage.test.js`, `tests/safe-fs.test.js` — 220 tests, 126 pass, 94
fail; the main file again after its runs became subtests: 74 tests, 25 pass, 49 fail.

Red there, each for its own reason: cases 1, 2, 3, 18, 20, 25 (the old commit commands);
17 and 19 (the first call answered the pass instead of `checking`); 24 (`.git/index`
changed: the tests ran in the working folder); 29 (the unrelated edit changed the verdict);
30 (the ignored, then the uncommitted, quality setting chose `always-pass.js`: a pass);
32 (old commit commands); 33 (`this folder has no commit to compare with`); 34 (`the check
stopped: git diff failed: …` in the sentence); 35 (b) (`docs/other.md` judged); 36 (`the
test command reported a failure`: standard error unread); 37 and 38 (`the existing tests
fail`); 39 (the old log was emptied, not kept under `.1`); 40 (the hard-linked file was
emptied); 42 (a pass: the working folder's flag); all six runs of 43 (the tests ran in the
project folder itself; run 6 found no `ctoc-hotfix-` folder); 44 (a pass); 45 (a) and (b)
(the tests ran in the project folder); 46 (no link made: 0 calls, 3 expected); 47 (a) and
(b) (a pass); 48 (a pass); 49 and 51 (a pass); 50 and 52 (the tests ran in the project
folder); 53 (a pass); the branch cases for the missing folder, the sub-folder project, the
selection, the edge shapes, the log folder that cannot be written and the name with a star
(new contract). Corpus: all 24 qualifying shapes and 9 traps (`docs/big.md` `-diff`,
`deps/constraints.txt`, `deps/requirements/base.txt`, `app/runtime.txt`,
`native/CMakeLists.txt`, `Compare.tsx` chain, `Types.tsx` generic, `.claude/theme.css`,
`agents/card.html`). Quality agent: cases a to k and the throw-shape case red; the five
existing argument-vector cases red too, because the helper now fakes `spawnSync` and refuses
a runner started through `execFileSync`. safe-fs: both round trips and the three surface
and validation loops (the new names absent).

Green there as planned, each proven able to fail by its named one-line change to the trial
build's code, run once and reverted (output kept in the build's scratch notes):
case 4 (the project root as the pathspec: deep-equal failed); 28 (log the `checking`
answer: "a checking answer writes no log line"); 31 (drop the `.ctoc/` exclusion: the
answers differed); 35 (a) (drop the pinned prefixes: the answers and log counts differed);
41 (drop the `.ctoc/logs` folder check: the answers differed, the outside folder gained the
log); corpus `docs/limit.md` (`n > 21`: the 21-line change passed); `days.html` (`\d`);
`site.html` (no `i` flag); `Button.spec.tsx` (no `spec`). Also green there and not in the
plan's red list (the trial build already did them): cases 5 to 16, 21 to 23, 27, the
invalid-UTF-8, failing-test reader, unreadable-counter and `file://host` cases, 49 traps
and the mode change.

Red there for another reason, proven instead on the built code by one change, run once and
reverted: the corpus 20-line shape (`n >= 20`: refused) and three-file shape (`m >= 3`:
refused); quality-agent case i (the platform test swapped: deep-equal failed); case 43's
stale entry (`worktree prune`: five runs failed "the worktree list is as before");
45 (b) (`ENOENT` on unlink a failure: red); 47 (b) (no first-hash comparison: a pass);
50 (refuse whenever a target is found: red); 52 (judged files not excluded: refused);
53 (no parent check: a pass, the link made in `outside`); case 24's moved file (reads name
the repository's own index: ".git/index unchanged" failed).

Green on the built code: the four files above plus the three moved fake files and every
quality-agent file — 294 tests, 294 pass (`hotfix-check.test.js` 75, the corpus 83,
every quality-agent file and the selection file 122, safe-fs 14). One case was added after
the code existed, for branch coverage: the test call refusing a deleted file and a file
replaced by a link without hashing them (green at once; hashing every judged file turned
it red, reverted).

### Step 10 — what changed

`src/lib/hotfix-check.js` (the trial build's module, rewritten where the plan changed it:
the git helper's pins and `GIT_INDEX_FILE`, the copy of the index, the name check, the two
hashings, the outside-the-repository refusal, the context-line numbering, the texts-differ
refusal, governing places for every kind, dependency and build lists, the JSX
closing-element rule, `checking` without tool detection, rule 8's copy, links,
installed-package targets, removal and `detail`, the fixed "check stopped" clause, the
commit commands, the log's hard-link check and rotation); `src/lib/quality-agent.js`
(`spawnSync`, standard error read, `outputTooLarge`/`timedOut`/`notStarted`,
`npmLauncher`, npm's placeholder, the undetermined result with its own line);
`src/lib/safe-fs.js` (`mkdtempSync`, `symlinkSync`); `src/lib/human-facing-scan.js`
(`SCREEN_MODULES`); `tests/cache-freshness.test.js` (the whitelist entry, its reason as the
plan words it); `README.md` (135 modules, 566 test files, by `node src/scripts/release.js`;
`CLAUDE.md` already read 135 and 566 from the trial build, and release.js left it
unchanged). `src/lib/menu-screens.js` and `src/commands/start.js` are the trial build's,
unchanged. `VERSION` unchanged (6.14.123).

### Step 12 — optimise

Read against the plan's list: per call one `rev-parse --git-path index` and one copy of
the index, one `diff --raw` and one `ls-files --others` for the judged paths, one `-U0`
diff for all judged files, one `cat-file` per judged file; in the test call also two
`hash-object` (all judged files at once), one `worktree add`, one `read-tree`, one `add`,
one `ls-files --stage`, one `diff --cached`, one `apply` (none for an empty patch), one
`ls-files --ignored --directory`, the two listings for installed-package targets only when
a target is found, and one `worktree remove`. Plus the two `rev-parse` calls that read the
top level and the last commit. No call per rule or per file beyond `cat-file`.

### Step 14 — verify

- Lint: `npm run lint` (`eslint . --max-warnings 0`) clean. Type check: `npx tsc --noEmit`
  0 errors (0 before the change).
- Coverage of the changed modules under their own tests: `hotfix-check.js` lines 99.30%,
  branches 98.21%, functions 99.03%; the lines not run are exactly the three named
  branches: the context-line numbering (lines 407–413) and the texts-differ refusal
  (line 581), both reachable only if git ignored `--inter-hunk-context=0` or `--text`, and
  `O_NOFOLLOW || 0`'s Windows side. Each named branch was run under its Step 8 mutation:
  case 35 with `--inter-hunk-context=0` removed stayed green and covered lines 407–413 (the
  numbering holds with context lines); the `docs/big.md` trap with `--text` removed went red
  (it then reads "I do not recognise docs/big.md as wording or a colour") and covered line
  581. `safe-fs.js` 100% lines and branches; no line of `quality-agent.js` left unrun by
  these files falls inside a function this slice changed.
- The real flow, in a scratch project made by one bare menu call and committed (one word in
  `src/pages/home.html`; `config/flags.txt` changed so that `npm test` fails in the working
  folder — it exited 1 there):
  `node src/commands/start.js hotfix check src/pages/home.html` (108–162 ms) →
  `{"verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next":
  "hotfix check --run-tests 'src/pages/home.html'", "ask": {"questions": []}, "actions": {}}`;
  `… hotfix check --run-tests src/pages/home.html` (388–525 ms in all; the project's own
  `npm test` alone on a clean checkout took 141–175 ms, so the copy, the checks and the
  process start took about 250–350 ms) → `{"verdict": "hotfix", "text": "", "tests": "2 tests
  passed.", "commit": {"files": ["src/pages/home.html"], "add": "git --literal-pathspecs add
  -- 'src/pages/home.html'", "message": "git --literal-pathspecs commit --only -m 'hotfix:
  <what changed>' -- 'src/pages/home.html'"}, "ask": {"questions": []}, "actions": {}}`.
  Running `add` and `message` (filled with "rename the Save button to Store") from the
  project root made one commit holding `["src/pages/home.html"]`, subject `hotfix: rename
  the Save button to Store`; `git status` afterwards: ` M config/flags.txt`, `?? .ctoc/logs/`.
  The log's line: `{"at":"2026-10-08T20:43:40.667Z","verdict":"hotfix","cause":null,
  "urgent":false,"files":1,"lines":2}`. No `ctoc-hotfix-` folder remained;
  `git worktree list --porcelain` after both calls equalled its output before.
  Seen, not acted on: the bare menu call wrote `.ctoc/settings.yaml` and
  `.ctoc/state/iron-loop.yaml` but no `.gitignore`, so `.ctoc/logs/` showed as untracked.
  Corrected at review (2026-10-08): project initialisation never creates a `.gitignore`; it
  only appends `.ctoc/logs/` and `.ctoc/state/` to one that already exists
  (`src/lib/init-project.js` lines 839–849), and the scratch project had none. That gap
  predates this plan and gets its own plan; `init-project.js` is not in this plan's
  `files:` and is untouched. The check is unaffected (it leaves `.ctoc/` out of the judged
  change, and the copy holds only tracked files).
- `npm test` on the final code (`2b71a744`), in this worktree:
  ```
  ℹ tests 12933 | ℹ pass 12930 | ℹ fail 3 | ℹ cancelled 0 | ℹ skipped 0
  [CTOC test-gate] coverage 99.86% (threshold 99%), skipped 0, failed 3
  [CTOC test-gate] FAIL
  ```
  The three failures are the self-check in `tests/iron-loop-enforcer.test.js` (fast,
  thorough, and the summary-counts case), whose block is `gate-destinations-approved`: this
  plan sits in `plans/todo/` and its approval record
  (`.ctoc/approvals/ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check.json`)
  exists only untracked in the main checkout, never in this worktree. The executor does not
  write approval records. The same commit cloned into a scratch folder with that record
  copied in (its `content_sha256` is this plan's hash):
  ```
  ℹ tests 12933 | ℹ pass 12933 | ℹ fail 0 | ℹ cancelled 0 | ℹ skipped 0
  [CTOC test-gate] coverage 99.86% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] PASS
  ```
  Step 14's `npm test` and fence boxes stay open in this worktree until the approval record
  travels with the branch.

### Fix round — the code review and the security check (2026-10-08)

One fix round on Steps 11 and 13's findings, in this worktree from `72894f5b` (the commit
that carries the plan's approval record). Every fix was test-first: the case was written,
run on the code as it stood and seen failing for the stated reason, then the code changed
and the case passed. Decisions 51 to 64 hold the reasons. Commits: `494a4485` the quality
agent's refused result, its counter reading and the four Windows-pinned cases; `2e5d791b`
the check's fixes and their cases; the plan record follows. The specification hash after
every plan edit: `4aaf099b44f61ce1721e1bd2309bc781e49f2b8a2896c60aff3ecb22e80f8003`.

| Finding | Red (code as it stood) | Green |
|---|---|---|
| 1 hooks and monitor | "no repository hook ran during the check" failed (the `post-index-change` marker existed); with only the hooks folder set, "no file-system monitor ran during the check" failed | pass; the case first proves both fire for a plain `git status` and `git add` |
| 2a failing-test reader | 195 KB of blank lines cost 65,058.3 ms more processor time (run in a scratch clone of `72894f5b`) | 7.9 and 8.4 ms in two runs |
| 2b catalogue tail | 100,000 trailing spaces cost 3,481.4 ms more | 0.2 and 0.5 ms |
| 2c colour rule | the 300 KB line of short declarations cost 769.5 ms more | 31.7 and 34.0 ms; one long declaration with every colour changed 33.2 and 34.9 ms |
| 2, same class: script blocks | 20,000 blocks cost 5,340.2 ms more | 6.3 ms |
| 3 Windows pins | under a simulated `win32`, all four cases failed ("expected a spawnSync npx jest call") | the four pass on darwin and under the simulated `win32` |
| 4 slips | the corpus traps `public/robots.txt`, `src/styles/mask.css` and `src/styles/motion.css` answered `checking`; the edge shape `public/ads.txt` answered a pass | all 87 corpus cases pass, the custom-property colour among the 25 that qualify |
| 6 refused command | "the existing tests fail (the test command reported a failure)" where "no test ran" was expected; `res.refused` was `undefined` | pass |
| 7 counters | `ℹ fail 1` on standard output with `ℹ fail 0` on standard error read as a pass | reads as one failure; jest's standard-error-only counters still read |
| 8 cleaned names | the sentence held `nope\x1B[2J.md` | `nope [2J.md` and `../x .md` |
| 9 `--` | `hotfix check -- --x.md` answered "Unknown hotfix command: --"; later, the always-`--` `next` broke the acceptance criterion's exact `next` (case 1 red) | `--` only for a dash-led name: `--x.md` alone and in a mixed set get it and route to a pass; the usual `next` is the acceptance criterion's |
| 10 swapped copy | removal unlinked `node_modules`, `.venv` and `packages/a/node_modules` in the outside folder (all three gone) | all three intact; `detail` "… could not be removed: a link's folder moved outside it"; with no link git refuses the swapped worktree itself (sub-case b); a link whose folder the tests removed counts as removed (sub-case c, a branch case, green before and after) |
| 11 kill from outside | a child killed with SIGTERM during its test run left `ctoc-hotfix-…` behind | the child ends by SIGTERM, no copy and no worktree registration remain; the handlers are gone after a normal check |

Timing cases measure the processor time this process spends on the big input over the
cheaper of two runs on a small one (child processes not counted), bound 100 ms.

Coverage of the changed modules under their own three test files: `hotfix-check.js` lines
99.44%, branches 98.34%, functions 98.20%; the lines not run are the two named branches
(context-line numbering 435–441, the texts-differ refusal 619) and `O_NOFOLLOW || 0`'s
Windows side, as before. In the full run `quality-agent.js` is at 100% lines.

Step 14, on `2e5d791b`, in this worktree (the main checkout's `node_modules` linked for the
run and removed after):
- `npm run lint` (`eslint . --max-warnings 0`): exit 0. `npx tsc --noEmit`: exit 0, no error.
- `npm test`:
  ```
  ℹ tests 12952 | ℹ suites 2117 | ℹ pass 12952 | ℹ fail 0 | ℹ cancelled 0 | ℹ skipped 0 | ℹ todo 0
  ℹ all files | 99.86 | 93.58 | 99.36 |
  [CTOC test-gate] coverage 99.86% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
  ```
- The fences, each file run by itself, no baseline file changed (`git diff 72894f5b HEAD --
  .ctoc` is empty): `tests/reachability.test.js` 30 of 30; `tests/export-reachability.test.js`
  17 of 17; `tests/gate-numbers-fence.test.js` 44 of 44; `tests/iron-loop-enforcer.test.js`
  33 of 33 (the self-check now passes here, the approval record travels with the branch);
  `tests/readme-numbers.test.js` 62 of 62; `tests/doc-counts.test.js` 6 of 6;
  `tests/cache-freshness.test.js` 23 of 23; `tests/safe-fs-blindspot.test.js` 2 of 2; each
  0 failed, 0 skipped.

The owner's decision of 2026-10-08, that the tests run in a separate temporary copy and
never in the working folder, is carried out: cases 4, 29 and 42 show that other uncommitted
work neither changes the verdict nor is committed, and cases 43, 45, 50 and 52 show that the
tests ran in a copy that is gone afterwards.

### Fix round 2 — the re-review and the targeted security check (2026-10-08)

A second fix round, in this worktree from `f7fde30b`, on the targeted security check (real
runs, git 2.50.1) and the re-review. Every fix was test-first: the case or corpus trap was
written and run on `f7fde30b`, seen failing for the stated reason, then the code changed and
the case passed. Decisions 65 to 77 hold the reasons. Commits: `41f0a865` the quality agent;
`9f422e71` the check and its cases; the plan record follows. The specification hash after
every plan edit: `4aaf099b44f61ce1721e1bd2309bc781e49f2b8a2896c60aff3ecb22e80f8003`.

| Item | Red (on `f7fde30b`) | Green |
|---|---|---|
| 1 index bits | "round 2, finding 1": assume-unchanged and skip-worktree reached a pass where the refusal was expected; `core.ignoreStat=true` committed 32 changed lines where 2 were judged | all three refuse "src/pages/home.html is marked in git's index as unchanged or skipped"; with that refusal disabled, part (a) alone refuses all three as "I do not recognise src/pages/home.html as wording or a colour" |
| 2 attributes | the traps `onclick.html`, `Limit.vue`, `angular.html`, `help-link.html` and `banner.html` answered `checking` | refused; with the old text finder put back, all five answer `checking` again |
| 3 project inside a folder | "round 2, finding 3": `services/payment/README.md` answered `checking` | the five rule kinds give the sensitive-area, test, governing, build and stored-data clauses |
| 4 `.txt` lists | `dev-requirements.txt`, `test-requirements.txt`, `packages.txt`, `version.txt` answered `checking` | dependency and build clauses |
| 5 catalogue values | YAML and `.properties` `true`→`false`, `"/help"`→`"javascript:fetch(document.cookie)"`, `"."`→`","` answered `checking` | not recognised |
| 6 documentation | the install address, the `SECURITY.md` address, the version number, the Markdown script, the front matter, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/style.md` and `.changeset/brave-cats.md` answered `checking` | risk-marker, not-recognised, setting and build clauses; the typo fixed beside a link qualifies |
| 7 selector | `nav:hover #add` → `#bad` answered `checking` | not recognised |
| 8 option | `<option>Red</option>` → `Blue` answered `checking` | not recognised; `<option value="m">` text qualifies |
| 9 judged ids | "round 2, finding 9": `commit.judged` undefined | `[{ path, blob }]` equals `hash-object` of the file; with a rewriting pre-commit hook the commit no longer matches it |
| 10 U+0130 | the `dotted.html` trap answered `checking` | not recognised; with the lower-cased search put back it answers `checking` again |
| 11 slow counters | 32 KB of blank lines in a passing run cost 1,413.7 ms more processor time | under the 100 ms bound |
| 12 either stream | `ℹ fail 0` on standard output, `ℹ fail 1` on standard error, exit 0: a pass | `passed: false`, `failed: 1`, in both runners |

Case 47 (b) moved its edit to the first hashing's `lstat` of the judged file, because the
rules no longer read the working file (Decision 65); seen red on `f7fde30b` (a pass), green
after. The corpus now holds 27 shapes that qualify and 87 traps (115 cases with the mode
change). Six edge shapes cover the new branches: braces in a JSX tag, a stray `}`, an
unclosed first `---`, front matter after a byte-order mark, an escaped scheme in a catalogue
value, and `value` inside another attribute's value.

Coverage of `hotfix-check.js` under its own two test files: lines 99.51%, branches 98.25%,
functions 98.39%; the lines not run are the two named branches, as before (context-line
numbering, the texts-differ refusal).

Step 14, on `9f422e71`, in this worktree (the main checkout's `node_modules` linked for the
run and removed after):
- `npx eslint --max-warnings 0` on the changed files: exit 0. `npx tsc --noEmit`: exit 0.
- `npm test`:
  ```
  ℹ tests 12988 | ℹ suites 2117 | ℹ pass 12988 | ℹ fail 0 | ℹ cancelled 0 | ℹ skipped 0 | ℹ todo 0
  ℹ all files | 99.86 | 93.63 | 99.36 |
  [CTOC test-gate] coverage 99.86% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
  ```

Seen, not acted on (outside this plan's files): `src/lib/step-13-verify.js` and
`src/scripts/test-gate.js` carry the same `^\s*` line-start counters with the multiline
flag; rule 6 reads catalogue values with their escapes unread, so `@` is not seen as
`@`; a selector whose `{` is on a later line still reads as a declaration (Decision 71).

### Fix round 3 — whole-file scanners (2026-10-09)

A third fix round, in this worktree from `f486ee4a`, on the session's decision to stop
patching edit shapes and judge each language with one whole-file scanner per side. Every
corpus trap and shape the security round and the re-review named was written first and run
on `f486ee4a`: 36 of them failed for the stated reason (below), the rest already held and
stay as guards. The two items of the automated commit security review that arrived during
the round were handled the same way, red first on `40b90493`. Decisions 78 to 89 hold the
reasons. Commits: `cc246b40` the quality agent; `40b90493` the scanners and their tests;
`13da4f8e` the security review's two items; the plan record follows. The specification hash
after every plan edit: `4aaf099b44f61ce1721e1bd2309bc781e49f2b8a2896c60aff3ecb22e80f8003`.

| Item | Red (on `f486ee4a`) | Green |
|---|---|---|
| 1 markup | `tip.html` (the high finding: `'one'` → `'two'` in an attribute value whose quotes span two lines) and `status-pick.html` (`<option><b>Pending</b></option>` → `Approved`) answered `checking`; the qualifying shape `wrapped.html` (`<button` / `  class="x">Save</button>` → `Store`) was refused | both traps not recognised; `wrapped.html` reaches `checking`. Already refused on `f486ee4a`, kept as guards: `&gt;` inside a value, an unquoted value, `@click`, `v-bind:`, nested braces in a JSX handler |
| 2 stylesheets | `nav:hover #add` with `{` on the next line → `#bad` answered `checking` | not recognised. `#add /* ; */ {` was already refused, kept as a guard |
| 3 documentation | `docs/click.md` (inline `onclick=`), `docs/js-link.md` (`[x](javascript:go())`), `docs/tpl.md` (`{{ one() }}`), `docs/raw.rst`, `content/post.md` (`+++`, `draft = false` → `true`), `docs/setup.md`, `docs/indented.md`, `docs/tilde.md` (`pip install requests` → `reqests` in three code-block forms), `docs/json-front.md`, `docs/ref.md`, `docs/liquid.md`, `docs/code.rst`, `docs/inc.rst` answered `checking`; `docs/auto.md` (`<https://one.example>`) was refused with the risk-marker clause; the qualifying shape `.github/CONTRIBUTING.md` was refused as "built or shipped" | the traps are not recognised (front matter: a setting); the autolink is not recognised, by rule 4; `.github/CONTRIBUTING.md` reaches `checking`. Already held, kept: `.github/workflows/README.md` is the build; link text and prose beside a code block qualify |
| 4 catalogue values | `"\/\/other.example\/go"`, `"java\tscript:go()"`, `"\tjavascript:go()"`, `"\\\\evil"` (JSON) and `java\script:go()` (properties) answered `checking` | not recognised |
| 5 instruction files | `CLAUDE.local.md`, `.windsurf/rules/style.md`, `.clinerules/style.md`, `.kiro/steering/style.md`, `CONVENTIONS.md` answered `checking` | not recognised |
| 6 CTOC's lists | `tokens.txt`, `config/locales/secrets.yml`, `messages/credentials.json`, `src/hooks/README.md`, `src/payments/index.html`, `docs/passwords.md` and `docs/id_rsa.md` answered `checking` | "sits in an area named" `token`, `secret`, `credential`, `enforcement` (the protected-paths list), `payment`, `password`, `secret` (the secret-file guard: `id_rsa`) |
| 7a `core.ignoreStat` | the tightened assertion passed on `f486ee4a`: the code already gave the sentence, the test only tolerated a pass | the shape asserts "src/pages/home.html is marked in git's index as unchanged or skipped" |
| 7b counters | 40,000 digits in a run's output: 1,263.5 ms more processor time (the skipped fallback); measured alone, the passed fallback took 1,570 ms and the jest summary 565 ms | under the 100 ms bound; 0.2 ms each measured alone |
| 7c loose objects | — | recorded in the module, not avoided (Decision 85) |
| 8 property test | with `ruleRefusal` exported for the probe only, on `f486ee4a`'s classifier: `$brand: rgb(<11, 94, 215);` passed as a colour | green (below) |
| A instruction files (review) | on `40b90493`: `.foo/notes.md` answered `checking`; `docs/sub/AGENTS.md`, `pkg/CLAUDE.md`, `.github/instructions/x.instructions.md`, `prompts/review.prompt.md`, `.cursor/rules/a.mdc` and `rules.mdc` were already refused and stay as guards; the shape `.github/ISSUE_TEMPLATE/bug.md` already qualified | not recognised; the shape still reaches `checking` |
| B reStructuredText roles (review) | on `40b90493`: a `.. role:: raw-html(raw)` definition added, `` :raw-html:`<b>x</b>` `` changed, and a role span's text changed (before and after form) answered `checking`; the property test's role loop: `<` inserted inside `` :kbd:`Ctrl` `` passed | not recognised; every insertion inside the role refuses; the shape with a role beside changed plain text reaches `checking` |

After the scanners: all 33 qualifying shapes reach `checking`, all 139 traps refuse with
their clause, and the mode change holds. The corpus is 33 shapes that qualify and 139 traps
(173 cases with the mode change; 175 tests in the file with the property test and the
linear-time case). The edge-shape case of the main test file passes unchanged; a new case
of 58 shapes, written after the scanners as their branch cases (not red first), drives the
scanners' own branches through the first call: a template literal, a regular expression
with a class, a self-closing element, an unclosed string, template literal and regular
expression at the end of a file, `<T,>` in TypeScript, a script's escape states, an
unclosed script, `<title>`, `<template>` in HTML and nested in Vue, CDATA, Svelte's `{/if}`,
Gettext, YAML and properties escapes, a literal tab in JSON, SCSS line comments, Sass,
colour functions in both forms, a changed string and a quoted `url()`, Markdown code spans,
unmatched backticks, an unclosed JSON front matter, an angle-bracket target, a full
reference, an escaped `)`, prose after an indented block, a removed fence, a reStructuredText
substitution, a `note` directive that stays wording, Jinja braces, a link target, hyperlink
references, an inline literal, interpreted text, a default role, `GEMINI.local.md`,
`copilot-instructions.md` outside `.github/`, a `.txt` in `.vscode/`, GitHub's instruction
file and an issue template.

The property test: 6,112 variants (each of 16 characters at each position of each qualifying
shape's changed text, 6,032, and at each position inside the role span of
`docs/shortcuts.rst`, 80); 2,000 refuse, the 80 inside the role among them; 4,112 pass, each
with its character in the named table of Decision 87; 64 variants (one refused and one
passing per shape) give the same answer through the real route. The scanners' timing
case judges 100,000 to 400,000 characters built against each scanner in under 250 ms each;
with the label search mutated to rescan from every `[`, the 400,000-character case took
2,292.4 ms and failed, so the case can see a rescanning scanner.

Coverage of `hotfix-check.js` under its own two test files: lines 99.96%, branches 96.80%,
functions 98.22%; the one line not run is the "texts differ, no changed-line group" refusal,
as before.

The real flow on the final code, in a scratch project made by one bare menu call and
committed (`src/pages/home.html`, `tests/home.test.js` with two node:test tests, `notes.md`,
`src/flags.js`), with `<button>Save</button>` → `<button>Store</button>`, `notes.md` changed
and `src/flags.js` set to `on: false` (the working folder's `flags are on` test fails:
`ℹ pass 1`, `ℹ fail 1`). Through `node src/commands/start.js`:
- `hotfix check src/pages/home.html`:
  `{ "verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next": "hotfix check --run-tests 'src/pages/home.html'", "ask": { "questions": [] }, "actions": {}}`
- `hotfix check --run-tests src/pages/home.html` (353 ms for the whole call):
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "src/pages/home.html" ], "add": "git --literal-pathspecs add -- 'src/pages/home.html'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'src/pages/home.html'", "judged": [ { "path": "src/pages/home.html", "blob": "da15ff4851987deceee519450275211f968e4b43" } ] }, "ask": { "questions": [] }, "actions": {}}`
- each call's standard output parses as one JSON document;
- `commit.add`, then `commit.message` with `hotfix: the save button reads Store`: the commit
  holds `src/pages/home.html` only, and `HEAD:src/pages/home.html` is
  `da15ff4851987deceee519450275211f968e4b43`, the judged blob; `notes.md` and `src/flags.js`
  stay modified;
- the log: `{"at":"2026-10-08T23:20:10.439Z","verdict":"hotfix","cause":null,"urgent":false,"files":1,"lines":2}`;
- no `ctoc-hotfix-` folder remains, and `git worktree list --porcelain` lists the project's
  own worktree only, as before.

Step 14, on `13da4f8e` with this record, in this worktree (the main checkout's `node_modules` linked for the
run and removed after):
- `npx eslint --max-warnings 0` on the changed files: exit 0. `npx tsc --noEmit -p .`: exit 0.
- `npm test`:
  ```
  ℹ tests 13050 | ℹ suites 2117 | ℹ pass 13050 | ℹ fail 0 | ℹ cancelled 0 | ℹ skipped 0 | ℹ todo 0
  ℹ all files | 99.87 | 93.59 | 99.34 |
  [CTOC test-gate] coverage 99.87% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
  ```

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Write `tests/hotfix-check.test.js`. Every case builds a temporary git repository
  (`git init`, `user.name`, `user.email` and `commit.gpgsign=false` set per call, files
  committed), makes the change, and calls `route(['hotfix', 'check', ...], root)` through
  `src/lib/menu-screens.js` (awaiting it). Projects that run tests carry a `package.json`
  whose `test` script runs `node --test tests/*.test.js`, with one node:test file;
  `NODE_TEST_CONTEXT` is cleared around a nested run (arm B's decisions 15 and 16). A fixture
  test that must report where it ran writes to a file under the folder named by the
  environment variable `CTOC_HOTFIX_PROBE`, outside both repositories. Each case below is red
  today: the route falls through to the dashboard, which carries no `verdict`.
  1. Button wording: the two calls answer exactly as in the first acceptance criterion.
  2. Button colour (`#0a58ca` → `#0b5ed7` in `src/styles/button.css`): same shape, `commit.add`
     and `commit.message` name only the stylesheet.
  3. Catalogue value (`"save": "Save {count} items"` → `"Store {count} items"` in
     `locales/en.json`): pass.
  4. Other uncommitted work is neither judged nor committed (the functional plan's scenario):
     `notes.md` modified and not named, `src/pages/home.html` changed and named → both calls
     answer deep-equal to the same change in a twin repository where `notes.md` is unchanged;
     after the answer's `commit.add` and `commit.message` are run from the project root as in
     case 32, `git show --name-only --format= HEAD` lists only `src/pages/home.html` and
     `git status` still shows `notes.md` modified.
  5. Program logic (`src/cart.js`, `> 0` → `>= 0`): the full sentence of the functional plan's
     scenario, exactly.
  6. Setting (`config/app.yaml`, `timeout_seconds: 30` → `60`): the setting clause.
  7. Text inside code (`src/server.js`, `res.send("Order saved")` → `"Order stored"`): the
     text-inside-code clause.
  8. Price (`<p>Only 9 euro a month</p>` → `7`): the risk-marker clause.
  9. Sensitive area (`src/pages/login.html`, `Sign in` → `Log in`): the `login` clause.
  10. Size: two `.md` files, 13 lines removed and 12 added → `it changes 25 lines in 2 files
      and a hotfix is at most 20 lines in at most 3 files`.
  11. New file `src/pages/about.html` → `it adds, removes or renames src/pages/about.html`.
  12. Failing test: `tests/home.test.js` reads `src/pages/home.html` and asserts it contains
      `Save` (test name `shows Save`); after the change, the `--run-tests` call answers
      `the existing tests fail (tests/home.test.js: shows Save)` — once with the script
      `node --test --test-reporter=tap tests/*.test.js` and once with `--test-reporter=spec`.
  13. Edited test: `src/pages/home.html` and `tests/home.test.js` both changed and named →
      `it changes a test (tests/home.test.js)` from both calls; the test file writes a marker
      file when it runs, and the marker never appears.
  14. No test ran: the `test` script is `node --test empty/*.test.js` (an empty folder) →
      `no test ran, so nothing confirms the change`; and the same with a script `node -e ""`.
  15. Unreadable: a folder that is not a repository; a repository with no commit; `PATH` set
      to an empty folder for the call (restored after) → each `I could not read the change
      (…)` with its reason, and never `verdict: 'hotfix'`.
  16. Unrecognised: `docs/diagram.svg` with one label changed → `I do not recognise
      docs/diagram.svg as wording or a colour`.
  17. Documentation-only change in a project with no test command → the first call answers
      `checking`; the `--run-tests` call answers the pass, its `tests` saying the project has
      no test command and the change is documentation only; a markup change in the same
      project → the `--run-tests` call answers `no test ran, so nothing confirms the change`.
  18. Determinism: the same change checked twice gives deep-equal answers, in a repository with
      `core.autocrlf=true`.
  19. Line endings: an `.md` file whose every line ending changed from LF to CRLF and one word
      changed counts 2 changed lines (it passes rule 3; with 30 lines re-ended it still
      passes).
  20. Backslash path: naming `src\pages\home.html` gives the same answers as
      `src/pages/home.html`.
  21. Outside the project: naming `../x.html` → `I could not read the change (../x.html is
      outside this project)`.
  22. Named but unchanged: `I could not read the change (src/pages/home.html holds no change
      that git would commit)`; nothing named and nothing changed → `(nothing has changed since
      the last commit)`.
  23. Binary: `docs/logo.png` changed → `I could not read the change (docs/logo.png is not
      text)`.
  24. Nothing in the project is touched: for every refusal above, `git status --porcelain=v1 -z`
      outside `.ctoc/` and the bytes of every changed file are identical before and after the
      call. And in a project holding one stash entry and a test that writes `out/report.txt`
      and runs `git add -A` in the folder it runs in, case 1's and case 12's changes are each
      checked through both calls with nothing named, so the check's diffs cover the whole
      project (git refreshes only the entries a diff covers, believed). The fixture step
      before each call, after the fixture's last git command: move the modification time of a
      committed file the case never edits (`docs/untouched.md`) one minute earlier with
      `fs.utimesSync`, its content unchanged — the situation in which git rewrote `.git/index`
      under every option tried (Decision 44) — then read the bytes of `.git/index`. Each call
      leaves the bytes of every file outside `.git/` and `.ctoc/`, the bytes of `.git/index`
      (read right after the call, before any other git command), `git stash list` and
      `git worktree list --porcelain` identical before and after, and no `ctoc-hotfix-` folder
      made by the call remains under `os.tmpdir()`.
  25. Through the real menu process: in a temporary project initialised by one bare menu call
      and committed, `node <repo>/src/commands/start.js hotfix check src/pages/home.html` and
      the `--run-tests` call each print exactly one JSON document (`JSON.parse` of the whole
      standard output succeeds) with the verdicts and `commit` fields of case 1.
  26. The test-run wrapper restores the process: after case 1's `--run-tests` call,
      `process.cwd()` and `console.log` are the values from before the call.
  27. Unknown sub-command and unknown option: `hotfix frobnicate` and `hotfix check --bogus`
      answer the usage text with `ok: false`.
  28. The log: after case 1's two calls `.ctoc/logs/hotfix-checks.jsonl` holds one line,
      `verdict: 'hotfix'`, `cause: null`, `urgent: false`, `files: 1`, `lines: 2`, and an ISO
      `at`; after case 5 one more line, `verdict: 'refused'`, `cause: 'program-logic'`; after
      case 27 no new line; no line holds `src/`, `home`, `Save`, `Store` or `notes`; with a
      file named `logs` placed in `.ctoc/` (so the log cannot be written), case 1's two answers
      are deep-equal to those of case 1.
  29. An unrelated uncommitted edit that would make a test fail does not change the verdict:
      case 1's project also commits `config/flags.txt` holding `on` and `tests/flags.test.js`
      (test name `flags are on`), which reads it; `config/flags.txt` is then changed to `off`
      and not named, and `src/pages/home.html` is changed and named → both calls answer
      deep-equal to the same change in a twin repository without the `config/flags.txt` edit
      (the pass).
  30. The test command comes only from tracked files: case 12's project (its suite fails after
      the change) with a committed script `always-pass.js` that prints `ℹ pass 5` and
      `ℹ fail 0` → (a) with `.ctoc/quality-config.yaml` listed in `.gitignore` and an ignored
      one setting the javascript test command to `node always-pass.js`, the `--run-tests` call
      answers `the existing tests fail (tests/home.test.js: shows Save)`; (b) with a committed
      `.ctoc/quality-config.yaml` changed in the working folder, not named, to set that
      command → the same answer.
  31. The check's own log never enters the change: in a repository whose `.gitignore` does not
      list `.ctoc/logs/`, case 1's change checked twice with no file named (the first run's
      log present for the second) → the two first-call answers are deep-equal.
  32. The commit takes only the judged files: `docs/other.md` changed, staged, then its working
      copy written back to its committed bytes (the index differs from the last commit, the
      working folder does not); `src/pages/home.html` changed; after the pass, the answer's
      `commit.add` and `commit.message` (with `<what changed>` replaced by `reword`) are run
      from the project root — through `sh -c` on macOS and Linux, and on Windows through the
      test's own reader of the single-quoted words, which hands git the same argument list →
      `git show --name-only --format= HEAD` lists exactly `src/pages/home.html`, and
      `docs/other.md` is still staged.
  33. A folder outside the repository git reports: the fixture repository's `core.worktree` set
      to a sibling folder → `I could not read the change (this folder lies outside the
      repository git reports)`.
  34. The check stopped: arm B's corrupt-index case → `text` exactly the sentence with
      `I could not read the change (the check stopped)`; `detail` a non-empty string with no
      control character and at most 200 characters; the log line's cause `unreadable`.
  35. Git settings: (a) one repository with `diff.noprefix=true`, `diff.mnemonicPrefix=true`,
      `diff.interHunkContext=10`, `diff.algorithm=histogram`, `diff.relative=true`,
      `diff.context=5` and `color.diff=always`, and two one-word edits three lines apart in
      `docs/guide.md`, named → answers deep-equal those of the same change in a repository
      without the settings; (b) one repository with `diff.autoRefreshIndex=false`, the same two
      edits, and a committed `docs/other.md` whose modification time is moved forward with its
      content unchanged, nothing named → answers deep-equal those of the same change in a
      repository without the setting (`docs/other.md` is not judged).
  36. Jest output on standard error: the `test` script is `node fake-jest.js`, a committed
      script that prints one line on standard output and, on standard error,
      `FAIL tests/home.test.js` and `  ● shows Save`, then exits 1 → `the existing tests fail
      (tests/home.test.js: shows Save)`.
  37. npm's placeholder: the `test` script is `echo "Error: no test specified" && exit 1` →
      `no test ran, so nothing confirms the change`.
  38. A runner that is not installed: the committed `.ctoc/quality-config.yaml` sets the
      javascript test command to `ctoc-no-such-runner` → `no test ran, so nothing confirms the
      change`.
  39. The log rotates by renaming: a log of 1 MiB plus one byte → after a final answer,
      `.ctoc/logs/hotfix-checks.jsonl.1` holds exactly the old bytes and the log holds one line.
  40. A hard-linked log: the log is a hard link (`fs.linkSync`) to `outside.txt` of 1 MiB plus
      one byte in a folder outside the repository → the answer is the same as without the
      link, and `outside.txt`'s bytes are unchanged.
  41. Log links: `.ctoc` as a symbolic link, `.ctoc/logs` as a symbolic link, the log as a
      symbolic link and as a dangling one → no file outside `.ctoc/logs` is written and the
      answers are unchanged (arm B's existing cases, kept).
  42. An unrelated uncommitted edit that a test needs makes the hotfix fail: case 29's project
      with `config/flags.txt` committed as `off` (so its test fails at the last commit) and
      changed to `on`, not named; `src/pages/home.html` changed and named → the `--run-tests`
      call answers `the existing tests fail (tests/flags.test.js: flags are on)`.
  43. The copy is gone after each of five paths. Before the runs the fixture registers a stale
      worktree of its own (`git worktree add` to a folder beside the repository, then that
      folder deleted), so the list holds an entry whose folder is gone. The fixture's test,
      when it runs, writes the folder it runs in under `CTOC_HOTFIX_PROBE`. Runs: (1) a pass —
      case 1's change; (2) a refusal after the copy exists — the test command is `node
      probe.js` (committed), which records its folder and prints no counter → `no test ran, so
      nothing confirms the change`; (3) failing tests — case 12's change; (4) a timeout —
      `runFullTests` of `src/lib/quality-agent.js` replaced for the call (`t.mock.method`) by a
      function that records `process.cwd()` and answers the quality agent's timeout result,
      `{ passed: false, undetermined: true, passCount: 0, failed: 0, skipped: 0, flaky: 0,
      output: 'javascript tests timed out' }` → `no test ran, so nothing confirms the change`;
      (5) a thrown error — `runFullTests` replaced by one that records `process.cwd()` and
      throws `new Error('runner exploded')` → `I could not read the change (the check
      stopped)` with `runner exploded` in `detail`. After each, the recorded folder and its
      `ctoc-hotfix-` parent folder do not exist, and `git worktree list --porcelain` equals its
      output before the call, the stale entry still listed. A real timeout takes the quality
      agent's five minutes, so runs 4 and 5 replace that collaborator, never the code under
      test. (6) A copy that cannot be removed: `fs.rmSync` replaced for one call by one that
      throws `EBUSY: resource busy` → `verdict` and `text` as in run 1, and `detail` exactly
      `the temporary copy at <the recorded folder's ctoc-hotfix- parent> could not be removed:
      EBUSY: resource busy`; the worktree list still equals its output before the call (the
      worktree was removed before the folder), and the test then removes that folder itself.
  44. A change that does not apply cleanly: `docs/guide.md` and a `.gitattributes` line
      `docs/*.md filter=shout` committed; then the repository's settings gain
      `filter.shout.smudge` set to `"<node>" "<a script outside the repository that upper-cases
      its input>"` (forward slashes in both paths), so a fresh checkout's `docs/guide.md`
      differs from the working folder's; one word of `docs/guide.md` changed, in a project with
      a test command → the `--run-tests` call answers `I could not read the change (the change
      does not apply cleanly to a fresh copy of the last commit)`, `detail` a non-empty line,
      the log line's cause `unreadable`; the project's test never ran (its marker file is
      absent); no `ctoc-hotfix-` folder made by the call remains under `os.tmpdir()`, and
      `git worktree list --porcelain` is unchanged.
  45. Linked dependency folders: (a) case 1's project with an ignored `node_modules/greet/` (a
      `package.json` naming `index.js`, which exports a greeting), an ignored
      `packages/a/node_modules/x/index.js` beside a committed `packages/a/index.js`, an ignored
      `.venv/` holding `pyvenv.cfg`, and an ignored `build/out.txt`; the project's test
      requires `greet` and records its folder, whether `node_modules`,
      `packages/a/node_modules` and `.venv` are symbolic links (`lstat`), and whether `build`
      exists → the pass; the recorded folder is not the project root; the three were links and
      `build` was absent; after the call every file under the three folders in the project is
      byte-identical to before. Case 1's project, which has no ignored folder, is the run with
      nothing to link. (b) The same project whose test, before it ends, removes the
      `node_modules` in the folder it runs in when `lstat` reads it as a link → the pass, no
      `detail`, the recorded folder and its `ctoc-hotfix-` parent gone, and the project's own
      `node_modules/greet/` byte-identical to before.
  46. The Windows junction: case 45's project with a committed `.ctoc/quality-config.yaml`
      setting the javascript test command to `"<node>" --test tests/home.test.js` (so no npm
      launcher is involved); `process.platform` replaced by `'win32'` (`Object.defineProperty`,
      restored in `finally`) and `fs.symlinkSync` wrapped (`t.mock.method`, calling through)
      for one `--run-tests` call → exactly three calls were recorded; their first arguments are
      the real paths of the project's `node_modules`, `packages/a/node_modules` and `.venv`,
      one each, in any order; and every third argument is `'junction'`. The same call without
      the replacement records exactly the same three first arguments, each with `'dir'`. On
      macOS and Linux Node ignores the type, so the links are real and are gone after the call;
      the verdict under the replaced platform is not asserted, because tool detection reads the
      platform too.
  47. A judged file changed during the check: (a) case 1's project whose test, when the
      environment variable `CTOC_HOTFIX_EDIT` names a file, appends ` again` to that file and
      passes; the case sets `CTOC_HOTFIX_EDIT` to the working folder's `src/pages/home.html`
      for one `--run-tests` call (restored after) → `I could not read the change
      (src/pages/home.html changed while it was being checked)`, the log line's cause
      `unreadable`, and the copy gone. (b) Case 1's project with `safeFs.mkdirSync` replaced
      for one `--run-tests` call (`t.mock.method`, calling through) by one that, on its first
      call only — the copy's empty hooks folder, made after the first hashing and before the
      temporary index is filled — first appends ` again` to the working folder's
      `src/pages/home.html` → the same answer, and the project's test never ran (its marker
      under `CTOC_HOTFIX_PROBE` is absent).
  48. Names the commit command cannot carry: in a project with no test command, one run per
      name, nothing named, the file holding one changed word, through the first call →
      `I could not read the change (docs/it's.md has a name the commit command cannot carry)`,
      and the same clause for `docs/a$b.md` and ``docs/a`b.md`` on every platform. For
      `docs/a"b.md`, `docs/a\b.md` and `docs/a<tab>b.md` the file is committed through `git
      update-index --add --cacheinfo` and changed in the working folder on macOS and Linux; on
      Windows, where those three cannot be file names, it is committed the same way with `-c
      core.protectNTFS=false` and absent from the working folder, which gives the same clause,
      because the name check runs before rule 2. The tab is shown as a space
      (`docs/a b.md has a name …`).
  49. Other uncommitted work behind a workspace link: case 1's project with a committed
      `packages/greet/package.json` (`{"name":"greet","main":"index.js"}`) and
      `packages/greet/index.js`, an ignored `node_modules/` whose entry `greet` is a link to
      the real path of `packages/greet` (`'junction'` on Windows, `'dir'` elsewhere), and a
      test that requires `greet` and writes its marker under `CTOC_HOTFIX_PROBE`;
      `packages/greet/index.js` gains a comment line, not named; `src/pages/home.html` changed
      and named → the `--run-tests` call answers `I could not read the change (other
      uncommitted work is in code the tests load through installed packages: packages/greet)`,
      the log line's cause `unreadable`, and the marker is absent. The same with the link at
      `node_modules/@acme/greet` and the test requiring `@acme/greet` → the same clause.
  50. The same link with no edit: case 49's project with `packages/greet/index.js` unchanged →
      the pass, and the test ran in the copy (its recorded folder is not the project root).
  51. An editable Python install with an edit: case 1's project with a committed
      `pylib/mylib/__init__.py` and an ignored `.venv/` holding `pyvenv.cfg` and
      `.venv/lib/python3.12/site-packages/_mylib.pth` (`.venv/Lib/site-packages` on Windows),
      whose lines are a comment, an `import site` line and the real path of `pylib`;
      `pylib/mylib/__init__.py` changed, not named; `src/pages/home.html` changed and named →
      `I could not read the change (other uncommitted work is in code the tests load through
      installed packages: pylib)`. The same with the `.pth` replaced by
      `__editable___mylib_finder.py` holding `MAPPING = {'mylib': '<the real path of
      pylib/mylib, each backslash doubled>'}` → the same clause naming `pylib/mylib`. No Python
      runs: the check only reads the files.
  52. The judged file under a linked target: case 50's project with `packages/greet/README.md`
      committed and one word of it changed and named → the pass, and the test ran in the copy.
  53. A link's parent outside the copy: case 45's project, plus a folder `outside` beside the
      repository and a committed `vendor` that is a symbolic link to it (mode `120000`, made
      with `git update-index --add --cacheinfo`), while the working folder holds a real
      `vendor/` folder with an ignored `vendor/node_modules/x/index.js`; `src/pages/home.html`
      changed and named → `I could not read the change (the check stopped)`, the project's test
      never ran (its marker is absent), `outside` holds no entry after the call, and the copy
      is gone. Where the copy's `vendor` is checked out as a plain file (Windows with
      `core.symlinks=false`), the same answer comes from `mkdirSync` failing (believed).
- [x] Write `tests/hotfix-check-corpus.test.js`: one temporary repository holding every base
  file below, committed once, with no test command. Every shape lives in its own file, under a
  path holding none of the sensitive words unless the shape is about one. Each shape writes its
  new content, calls the route naming its file(s) (the first call), asserts the exact verdict
  and clause, and restores the base content. A shape that qualifies ends at
  `verdict: 'checking'`: rules 1 to 7 held, and the first call runs no test. Red today for the
  same reason as above.
  - Qualify (24): `src/pages/home.html` `<button>Save</button>`→`Store`;
    `src/pages/welcome.html` `<p>Welcome back!</p>`→`Welcome home!`; `site/about.htm`
    `<h2>About us</h2>`→`Who we are`; `src/components/Greeting.jsx` `<h1>Hello there</h1>`→
    `Hello friend`; `src/components/CancelButton.tsx` `<span className="x">Cancel</span>`→
    `Close`; `src/components/NameField.vue` `<label>Name</label>`→`Full name`;
    `src/components/Loading.svelte` `<p>Loading</p>`→`Please wait`; `src/pages/nav.html`
    `<a class="nav" href="/home">Home</a>`→`Start`; `locales/en.json`
    `"save": "Save {count} items",`→`Store`; `i18n/fr.yaml` `save: Enregistrer`→`Sauvegarder`;
    `translations/de.po` `msgstr "Speichern"`→`Sichern`; `lang/app.properties`
    `button.save=Save`→`Store`; `messages/en.yml` `greeting: "Hello, {{name}}"`→`Hi`;
    `src/styles/button.css` `.save { background-color: #0a58ca; }`→`#0b5ed7`;
    `src/styles/theme.scss` `$brand: #0a58ca;`→`rgb(11, 94, 215)`; `src/styles/accent.less`
    `@accent: red;`→`tomato`; `src/styles/link.css` `color: hsl(210, 50%, 40%);`→
    `hsla(210, 50%, 40%, 0.9)`; `src/styles/vars.css` `--brand: #ffffff;`→`#fafafa`;
    `README.md`, `docs/guide.rst`, `notes/todo.txt` one wording edit each; `docs/intro.md`
    with CRLF line endings, one word changed; `docs/long.md` with ten lines reworded (20
    changed lines in one file); three `.md` files changed one line each (6 lines in 3 files).
  - Traps (58), each with its expected clause: `src/cart.js` logic; `src/server.js` string;
    `config/app.yaml` setting; `package.json` version bump (dependencies);
    `deps/requirements.txt` version bump (dependencies, not documentation; arm B's decision
    28); `deps/constraints.txt` and `deps/requirements/base.txt` version bumps
    (dependencies); `app/runtime.txt` and `native/CMakeLists.txt` one word each (built or
    shipped); `db/migrations/001_init.sql` (stored data); `.github/workflows/ci.yml` (built or
    shipped); `Dockerfile` (built or shipped); `src/strings.json` outside a catalogue folder
    (setting); `docs/diagram.svg`, `CLAUDE.md`, `agents/helper.md`, `plans/notes.md` and
    `src/commands/help.md` (do not recognise); `.claude/theme.css` colour
    `#0a58ca`→`#0b5ed7` and `agents/card.html` `<p>Hello</p>`→`<p>Hi</p>` (do not recognise:
    governing places never qualify); markup attribute change `<a href="/a">Home</a>`→
    `href="/b"` (do not recognise); markup digit `<p>Only 9 euro a month</p>`→`7`, a
    full-width digit `<p>Only seven days</p>`→`<p>Only ７ days</p>`, web address
    `<p>Visit example.org</p>`→`www.example.org`, upper-case web address
    `<p>Visit our site</p>`→`<p>Visit WWW.EXAMPLE.ORG</p>`, e-mail `<p>Write to us</p>`→
    `help@example.org` (risk marker); a `<b>Save</b>` line inside a multi-line `<script>`
    block, inside a multi-line `<style>` block and inside a multi-line `<textarea>` block (do
    not recognise); `.jsx` `<p>Hello {name}</p>`→`Hi {name}`; `.vue` `<p>{{ msg }} now</p>`→
    `today`; a multi-line text node line `  Save your work`→`Store`; a tag-crossing edit
    `<b>Save</b> now`→`<b>Save now</b>`; an entity `<p>Terms &amp; rules</p>`→`conditions`
    (each: do not recognise); catalogue key change `"save":`→`"store":` and placeholder change
    `{count}`→`{total}` (do not recognise); catalogue value `"Save now"`→`"Save 5 euro now"`
    (risk marker); stylesheet selector `.red {`→`.blue {`, property change `color: red;`→
    `background: red;`, non-colour value `display: none;`→`block`, hexadecimal-looking
    selector `#bad:hover {`→`#fed:hover {` (each: do not recognise); `.tsx` comparison
    `return a > b ? x : y < z;`→`w`, generic `useState<string>("a")`→`("b")`, comparison
    chain `src/components/Compare.tsx` `  const ok = a<b>limit<c;`→`max` and generic type
    `src/components/Types.tsx` `type U = Box<A>|Box<B>;`→`Box<A>|Bag<B>;` (do not recognise;
    the last two pass arm B's rule and only the closing-element rule catches them);
    `tests/home.test.js` with `src/pages/home.html`, `src/__tests__/cart.spec.js` and
    `src/components/Button.spec.tsx` outside any test folder (a test);
    `src/pages/login.html`, `billing/index.html` and `docs/privacy.md` wording (sensitive area:
    `login`, `billing`, `privacy`); new `src/pages/about.html` and deleted `docs/old.md` (adds,
    removes or renames); `docs/logo.png` (not text); a symbolic link committed as `link`
    (mode `120000`, made with `git update-index --add --cacheinfo`) replaced in the working
    tree by a regular file (do not recognise, on every platform: a type change where links
    exist, a changed link target where they do not); `docs/big.md` with a committed
    `.gitattributes` line `docs/big.md -diff` and 13 lines reworded (`it changes 26 lines in 1
    file and a hotfix is at most 20 lines in at most 3 files`); `docs/limit.md` with 11 lines
    removed and 10 added (`it changes 21 lines in 1 file and …`); four `.md` files changed one
    line each (size: `it changes 8 lines in 4 files and a hotfix is at most 20 lines in at
    most 3 files`).
  - A mode change of `README.md` (executable bit via `git update-index --chmod=+x` and commit,
    working copy left as it was): on macOS and Linux → do not recognise; on Windows, where git
    ignores the executable bit, → `checking`. One case with a platform-dependent expectation,
    never a skipped case.
- [x] Add to `tests/quality-agent-coverage.test.js` (the quality agent's own test file). Where a
  process must not really start, the case runs inside its `withExecSpies` helper, which fakes
  both process calls as described under Files: the `spawnSync` fake records and answers; the
  `execFileSync` fake lets `git` through and throws `runner started through execFileSync` for
  any other program, recording it. "The fake saw no process start" means neither fake recorded
  a call. `process.platform` and `process.execPath` are replaced with `Object.defineProperty`
  and restored in `finally`.
  a. A failing configured run that prints one line on standard output and
     `FAIL tests/a.test.js` on standard error → `runFullTests`' `output` holds both.
  b. A configured test command that does not exist (`ctoc-no-such-runner`) → `runFullTests`
     answers `passed: false`, `undetermined: true`.
  c. A configured run that exits 127 (`"<node>" -e "process.exit(127)"`) → undetermined.
  d. A timeout (the fake answers `{ status: null, signal: 'SIGTERM', error: <an Error with code
     'ETIMEDOUT'>, stdout: '', stderr: '' }`) → undetermined, through `runFullTests` and
     through `runSpecificTests`' jest path.
  e. npm's placeholder (`{ js: { test: 'echo "Error: no test specified" && exit 1',
     testFromScript: true } }`) → undetermined, and the fake saw no process start.
  f. Windows npm: `process.platform` `'win32'` and `process.execPath` `<tmp>/node.exe`, with
     `<tmp>/node_modules/npm/bin/npm-cli.js` present, the fake answering `ℹ pass 1` and
     `ℹ fail 0`; `runFullTests({ javascript: { test: 'node --test', testFromScript: true } })`
     → the one call's program `<tmp>/node.exe`, its arguments
     `[<tmp>/node_modules/npm/bin/npm-cli.js, 'test']`, its `shell` `false`.
  g. Windows npx: the same with `npx-cli.js` present; `runSpecificTests({ javascript: { test:
     'jest', testFramework: 'jest' } }, ['tests/a.test.js'])` → program `<tmp>/node.exe`,
     arguments `[<tmp>/node_modules/npm/bin/npx-cli.js, 'jest', 'tests/a.test.js']`.
  h. Windows with `process.execPath` in an empty temporary folder → `runFullTests` answers
     `passed: false`, `undetermined: true`, its `output` naming the missing script, and the
     fake saw no process start.
  i. Every other platform → program `npm`, arguments `['test']`; the jest path → program
     `npx`, arguments `['jest', 'tests/a.test.js']`.
  j. A passing configured run whose standard output is empty and whose standard error holds
     `Tests:       2 passed, 2 total` (status 0) → `runFullTests` answers `passed: true`,
     `passCount: 2`.
  k. Output past 10 MiB: the fake answers `{ status: null, signal: 'SIGTERM', error: <an Error
     with code 'ENOBUFS'>, stdout: 'ℹ pass 3', stderr: '' }` → `runFullTests` answers
     `passed: false`, `undetermined: true`, its `output` naming the 10 MiB output limit and not
     a timeout.
- [x] Add to `tests/safe-fs.test.js`: `mkdtempSync` and `symlinkSync` in `SYNC_METHODS`,
  `symlinkSync` in `TWO_PATH_SYNC` (the file's loops then check their path validation), and one
  round trip each: `safeFs.mkdtempSync(path.join(<a temporary folder>, 'x-'))` makes a new
  folder whose name starts with `x-`; `safeFs.symlinkSync(<a folder>, <a link path>,
  process.platform === 'win32' ? 'junction' : 'dir')` makes a link whose real path is the
  folder's.
- [x] In `tests/quality-agent-coverage-holes.test.js`, `tests/quality-agent-crossplatform.test.js`
  and `tests/test-selection-scope.test.js`, move each fake of the runner's `execFileSync` to
  `spawnSync` with the same answers (Files); their git fakes stay on `execFileSync`; no
  assertion changes.
- [x] Run `tests/hotfix-check.test.js`, `tests/hotfix-check-corpus.test.js`,
  `tests/quality-agent-coverage.test.js` and `tests/safe-fs.test.js` on arm B's code (worktree
  `trial-hs1-b` at its last build commit; its `src/lib/quality-agent.js` and
  `src/lib/safe-fs.js` are unchanged from the main tree) before any implementation change, and
  record each case's result in the Execution Record.
  Expected red there (each holds a fix): cases 1, 2 and 25 (the new `commit` fields), 17 (arm
  B's first call detects tools and answers the pass), 24 (arm B runs the fixture's tests in
  the working folder, which then holds `out/report.txt` and a changed `.git/index`), 29, 30,
  32, 33, 34, 35 (b) (arm B judges `docs/other.md` too), 36, 37, 38, 39, 40 and 42; case 43's
  six runs (arm B runs the tests in the project folder itself, which the case finds still
  present, and reports no removal); 44, 45 (a) and 46; 47 (a) (arm B passes the edited file);
  48 (arm B passes each name, or on Windows answers the delete); 49 and 51 (arm B passes); every
  qualifying corpus shape (arm B's first call answers the pass or `no test ran`, never
  `checking`) and the corpus's `-diff`, `constraints`, `requirements/` folder, `runtime.txt`,
  `CMakeLists.txt`, comparison-chain, generic-type, `.claude/theme.css` and `agents/card.html`
  traps; quality-agent cases a to h, j and k (d, e and k fail on the `execFileSync` fake's
  throw, which no undetermined result follows); the two new `safe-fs` entries and their round
  trips.
  Expected green there, each proven able to fail by one change to arm B's code, run once, its
  red output recorded and the change reverted: 4 — in `readChange`, take the project root as
  the pathspec even when files are named; 28 — log the `checking` answer too (drop
  `cause !== undefined` in `hotfixRoute`); 31 — drop the `.ctoc/` exclusion in `readChange`;
  35 (a) — drop `--src-prefix=a/ --dst-prefix=b/`; 41 — drop the `lstat` check of `.ctoc/logs`;
  the corpus's 21-line trap — `n > 20` to `n > 21`; the full-width digit — `\p{Nd}` to `\d`;
  `WWW.` — drop the `i` flag; `Button.spec.tsx` — drop `spec` from the name pattern.
  Red on arm B for a reason other than their own fault, so proven instead on the built code by
  one change, run once and reverted: the corpus's 20-line and three-file shapes (red because
  arm B's first call answers the pass) — `n > 20` to `n >= 20` and `m > 3` to `m >= 3`;
  quality-agent case i (red because arm B starts processes with `execFileSync`, whose fake
  throws) — swap the platform test in `npmLauncher`; case 43's stale entry (red because arm B
  makes no copy) — replace `worktree remove --force <tmp>/tree` with `worktree prune`; 45 (b)
  (red because arm B makes no copy) — count `ENOENT` on unlink as a failure; 47 (b) (red
  because arm B makes no copy) — drop the comparison of the temporary index's ids with the
  first hashes; 50 (red because arm B runs the test in the project root)
  — refuse whenever a target is found, whatever lies under it; 52 (same reason) — drop the
  judged files' exclusion from the uncommitted work; 53 (red because arm B makes no copy) —
  drop the check that a link's parent lies inside the copy; case 24's moved file (red because
  arm B runs the tests in the working folder) — let the git helper's reads name the
  repository's own index instead of `<tmp>/repo-index`.
  A case expected red that is green cannot catch its fault and is rewritten until it is red on
  arm B's code. Arm B's existing cases whose expectation this plan replaces (the `commit`
  cases, cases 4, 17 and 28, the 1 MiB emptying case, the corrupt-index wording) change only
  toward the new contract, each named with its reason in the Execution Record; none is
  loosened. The three test files whose fakes move are run on the built code only; they prove
  the move broke nothing, not a fix.

### Step 9: PREPARE
- [x] Record `git --version` and `node --version`; confirm `git diff --ignore-cr-at-eol` and
  `git diff --raw -z --no-renames --no-abbrev` behave as specified on that version, and record
  the output that shows each pinned argument winning over its setting: `--src-prefix=a/
  --dst-prefix=b/` over `diff.noprefix=true` and `diff.mnemonicPrefix=true`, `--text` over a
  `-diff` attribute, `--no-relative` over `diff.relative=true`, `--no-color` over
  `color.diff=always`, and `-c diff.autoRefreshIndex=true` over `diff.autoRefreshIndex=false`
  (with `-c diff.autoRefreshIndex=false` a file whose modification time moved while its
  content did not is listed by `diff HEAD --raw`; with the pin it is not). Repeat Decision 44's
  experiment on that git for the forms the check runs — `diff HEAD --raw -z`, the `-U0` diff,
  `hash-object`, `ls-files --others` and `ls-files --others --ignored --directory`, nothing
  named, such a file present — and record, for each, the bytes of `.git/index` before and
  after: once on the repository's own index, and once with `GIT_INDEX_FILE` set to a copy made
  as rule 1 makes it (`rev-parse --git-path index`, `cpSync` with `preserveTimestamps`), in the
  main working tree and in a linked worktree. Under the copy the repository's index must be
  byte-identical. This is a record, not a stop: a change found under the copy is a fault in the
  git helper, fixed there before Step 10, and case 24 is never loosened.
- [x] In a scratch repository on that git, record: `git -c core.hooksPath=<empty folder> -c
  core.fsmonitor=false worktree add --detach` runs neither a `post-checkout` nor a
  `reference-transaction` hook (each a hook that writes a marker); `git worktree remove
  --force <folder>` deletes the worktree's folder and its registration and leaves a stale
  registration of another worktree listed; a patch built through a temporary index
  (`read-tree`, `add --all`, `diff --cached --binary --full-index`) applies with `git apply`
  inside the worktree under `core.autocrlf=true` with CRLF working files, carries an added and
  a deleted file, and is refused whole when one hunk does not apply; `hash-object -- <file>`
  equals the id `ls-files --stage` reads from the temporary index after `add --all` for the
  same file, CRLF working file under `core.autocrlf=true` included; the main `.git/index`
  bytes are unchanged by all of it; `git ls-files --others --ignored --exclude-standard
  --directory -z` lists `node_modules/`, a nested `packages/a/node_modules/` and `.venv/` as
  folders, and lists `vendor/node_modules/` when `vendor` is a symbolic link in the last
  commit and a real folder in the working folder (case 53's fixture). Measure the copy's time
  on this repository (worktree add, patch, apply, removal) and record it.
- [x] Read keeps-working slice 2's final `src/lib/menu-screens.js` and `src/commands/start.js`
  (this slice builds on top of it) and the exports of `quality-agent.js`, `tool-detector.js`
  and `coverage-map.js` used above, and the `languages:` format `tool-detector.js` reads from
  `.ctoc/quality-config.yaml` (the fixtures of cases 30, 38 and 46).
- [ ] Confirm the CSS Color Module Level 4 named-colour list (148 names) from the
  specification text, not from memory (arm B's decision 22 records why this stayed open).
- [x] Run every `tests/quality-agent*.test.js` file and `tests/test-selection-scope.test.js`
  on the unchanged quality agent and read every assertion on a failed run's `output`, on
  `failed` after a spawn failure or timeout, and on the npm launcher; confirm that the three
  files of Decision 34 fake the runner's `execFileSync` and that no other test file does. An
  existing test that pins a fault this slice fixes is changed only toward the new contract
  and named in the Execution Record; when that test lives in a file this plan does not
  declare, the change is requested through `src/lib/scope-growth.js`, never made silently.
- [x] Record, on this machine, that `execFileSync(process.execPath, ['-e', '0'], { shell:
  true })` prints Node's deprecation warning for arguments passed with a shell (why no launch
  uses a shell), and that `spawnSync` of a program printing more than its `maxBuffer` answers
  the error code `ENOBUFS` with the signal `SIGTERM`. Recorded as believed, for the first
  Windows use to confirm: Node's refusal to start a `.cmd` file directly (Node's April 2024
  security release); a junction made without administrator rights; `fs.lstatSync` reading a
  junction as a symbolic link; `fs.unlinkSync` on a junction removing the junction and not
  its target; npm's `npm-cli.js` and `npx-cli.js` under `<node folder>/node_modules/npm/bin/`
  in the official installer's layout; npx starting jest's `.cmd` shim through `cmd.exe` with
  npm's own escaping; `pytest` and `go` started by name.

### Step 10: IMPLEMENT
- [x] `src/lib/hotfix-check.js` (from arm B's build): the git helper's pinned
  `diff.autoRefreshIndex=true`, the pinned diff arguments and `--text` on every diff but the
  patch, the context-line numbering, the native real paths and the outside-the-repository
  refusal, the name check, the "texts differ, no changed-line group" refusal, the
  governing-place refusal for every kind, the dependency and build lists, the `.jsx`/`.tsx`
  closing-element rule, the first call ending at `checking` without tool detection, the
  check's temporary folder with the copy of the repository's index, made in both calls and
  named by `GIT_INDEX_FILE` on every read in the main repository (Decision 44), the first
  and second hashings, the temporary copy (worktree with hooks and the file-system
  monitor off, patch through the temporary index and its ids compared with the first hashes,
  `git apply` with the file-system monitor off, linked folders behind the parent check, the
  installed-package targets and their refusal, removal in `finally` through `unlinkSync` with
  `ENOENT` counted as removed, `git worktree remove --force` and `rmSync`), tool detection and
  the file-name test selection in the copy, the fixed "check stopped" clause with `detail` and
  the removal note in `detail`, the `commit` commands with `--literal-pathspecs` and `--only`,
  and the log's link checks and rename rotation. Every replaced function is looked up at call
  time (the contract under Files).
- [x] `src/lib/quality-agent.js`: `spawnSync` in `runCommandArgv` with standard error in every
  run's output, `outputTooLarge` read before `timedOut`, `notStarted`, `npmLauncher` for npm
  and npx, npm's placeholder, and the undetermined result with its own line for output past 10
  MiB, a timeout or a runner that cannot start, in `runFullTests` and `runSpecificTests`.
- [x] `src/lib/safe-fs.js`: `mkdtempSync` and `symlinkSync`.
- [x] `src/lib/menu-screens.js`: the `hotfix` case in `route` (arm B's build).
- [x] `src/commands/start.js`: print the route's result once it settles (arm B's build).
- [x] `src/lib/human-facing-scan.js`: `'src/lib/hotfix-check.js'` in `SCREEN_MODULES`.
- [x] `tests/cache-freshness.test.js`: the whitelist entry with its reason.
- [x] `CLAUDE.md` and `README.md`: the library-module and test-file counts.

### Step 11: REVIEW
- [ ] The critic reads every trap against the classifier and tries three new shapes of its own
  per kind, among them `.jsx`/`.tsx` lines where `<` and `>` are code; any pass on a shape that
  is not wording or a colour is a finding.
- [ ] Every clause string is compared character for character with the functional plan's
  table, and the six `<why>` texts this plan adds (outside the repository git reports, a name
  the commit command cannot carry, the check stopped, the change does not apply cleanly,
  changed while it was being checked, other uncommitted work behind installed packages) with
  this plan.
- [ ] The critic confirms by reading that nothing on the check's path reads
  `.ctoc/state/coverage-map.json` (its steering cannot be observed with a node:test fixture,
  because the quality agent runs a node:test project's whole test command whatever the
  selection), that no test runs and no tool is detected outside the copy, that no git call
  names the repository's own index or the stash once the check's temporary folder exists
  (every read names `<tmp>/repo-index`, the four patch calls `<tmp>/index`, and `worktree add`,
  `worktree remove` and `apply` neither), that every pass path — the documentation-
  only pass without a test command included — compares the first hashes with the temporary
  index's ids and with the second hashes, that removal unlinks every link before it removes
  the worktree or deletes anything, and that no git call prunes worktrees.

### Step 12: OPTIMIZE
- [x] One `rev-parse --git-path index` and one copy of the index per call; one `diff --raw`
  and one `ls-files --others` for the judged paths, one `-U0` diff for the
  judged files (split by file), and one `cat-file` per judged file; in the `--run-tests` call
  also two `hash-object` (one per hashing, all judged files at once), one `worktree add`, one
  `read-tree`, one `add`, one `ls-files --stage`, one `diff --cached`, one `apply`, one
  `ls-files --ignored --directory`, at most one `diff --name-only` and one `ls-files --others`
  for the installed-package targets (none when no target is found), and one `worktree remove`
  — not one git call per rule or per file.

### Step 13: SECURE
- [ ] The security scanner checks: no named path reaches git or the file system outside the
  project root; every git call is an argument vector (no shell); a file name beginning with `-`
  is always after `--`; a judged name holding `'`, `"`, `$`, `\`, a backtick or a control
  character is refused under rule 1, so the single quotes in `next`, `commit.add` and
  `commit.message` never need an escape, and names holding spaces survive them;
  `--literal-pathspecs` keeps `*`, `?` and `[` literal; text from the change never becomes a
  regular expression or a command; the log holds no file name, path or wording from the
  change, is never written through a symbolic or hard link, and no file is ever emptied; no
  working-folder file outside the judged change (an ignored or uncommitted quality setting, the
  capabilities, the coverage map) can choose or narrow the test run, because detection and
  selection read only the copy; the bytes judged, tested and recorded are compared by hash and
  any difference refuses; the temporary folder is made by `mkdtemp` (a unique name, owner-only
  on macOS and Linux) under `os.tmpdir()`; `core.hooksPath` points at an empty folder for the
  `worktree add`, and `core.fsmonitor=false` is set on `worktree add` and `apply`; the
  temporary index is the only index the patch calls name, and every other call in the main
  repository names the copy of the repository's index, so no call writes `.git/index`; the
  patch reaches `git apply` on
  standard input, never as a path or a shell string; no link is made whose parent's real path
  lies outside the copy; removal unlinks each link before removing the worktree and deleting,
  stops at the first failure, and removes only the copy's own worktree registration, so it
  never deletes through a link or drops another registration; a linked package folder cannot
  bring other uncommitted work into the test run unnoticed; CTOC's Windows launch starts no
  command interpreter (npx's own start of jest through `cmd.exe` is named in Risks); `detail`
  carries no control character.

### Step 14: VERIFY
- [x] `npm test`: lint, typecheck, all tests, coverage at or above the floor in
  `.ctoc/coverage-baseline.json` with every branch of `hotfix-check.js`, of the changed
  quality-agent functions and of the two `safe-fs` wrappers exercised (including the "check
  stopped" path, the log that cannot be written, the patch that does not apply, both
  comparisons of the hashes, the name check, the installed-package targets of both kinds, the
  link-parent check, a link already gone at removal, the copy that cannot be removed and output
  past 10 MiB), 0 skipped, 0 flaky. Three branches run only where named, and are listed with
  the measured coverage: `O_NOFOLLOW || 0` (its `0` side exists only on Windows); the
  context-line numbering and the "texts differ, no changed-line group" refusal (reachable
  only if git ignored `--inter-hunk-context=0` or `--text`; each runs under its Step 8
  mutation — case 35's repository without `--inter-hunk-context=0`, the `-diff` trap without
  `--text` — and the red or green result is recorded).
- [x] The fences hold with no baseline change: dead exports, reachability, the human-facing
  words (`tests/gate-numbers-fence.test.js` and the self-check in
  `tests/iron-loop-enforcer.test.js`), the README and documented counts
  (`tests/readme-numbers.test.js`, `tests/doc-counts.test.js`), the count cache
  (`tests/cache-freshness.test.js`) and the `safe-fs` blind spot
  (`tests/safe-fs-blindspot.test.js`).
- [x] Drive the real flow once in a scratch copy of a small project: make a wording change and
  edit an unrelated file so that a test would fail in the working folder, run both calls
  through `node src/commands/start.js`, then run the answer's `commit.add` and
  `commit.message` from the project root; quote the JSON answers, the commit's file list, the
  log's lines, the time the copy took and the time the test run took in the build record, and
  confirm that no `ctoc-hotfix-` folder remains and that `git worktree list --porcelain` is
  what it was before.

### Step 15: DOCUMENT
- [x] JSDoc on `hotfixRoute` and on every internal function, naming the rule each one carries;
  JSDoc on the changed quality-agent functions and `npmLauncher` naming the new results; JSDoc
  on the two `safe-fs` wrappers.
- [x] The module header lists the rules, their order and why, the two hashings and what they
  compare, the copy of the repository's index and which git calls name it, the temporary copy
  (where it lives, how it is filled, compared and linked, which
  installed-package targets refuse, how it is removed, on which paths), the four kinds and the
  governing places, the clauses, the log's fields and cause words, the call-time lookups the
  tests rely on, and what the check cannot answer (from the functional plan's table).

### Step 16: FINAL-REVIEW
- [ ] Every acceptance box above is checked against its evidence; the real-flow answers are
  quoted, not summarised.
- [ ] The build record states that the owner's decision of 2026-10-08 is carried out — the
  tests ran in a temporary copy, and the functional plan's scenario "Other uncommitted work is
  neither judged nor committed" holds — and quotes the copy's measured time.
