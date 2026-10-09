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
  # Session decision 2026-10-09, under the owner's instruction to decide: the reader is held to
  # real parsers by a seeded differential test. parse5 and markdown-it are test-only
  # dependencies (devDependencies, exact versions); nothing is added at runtime.
  - tests/hotfix-check-differential.test.js
  - package.json
  - package-lock.json
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
- [x] The colour change in `src/styles/button.css` and the catalogue value change in
  `locales/en.json` (same key, same `{count}`) pass the same way.
- [x] Other uncommitted work is neither judged nor committed: with `notes.md` also modified and
  not named, both calls answer exactly what they answer without it, and running the answer's
  `commit.add` and `commit.message` from the project root makes a commit holding only
  `src/pages/home.html` while `notes.md` stays modified. An unrelated uncommitted edit that
  would make a test fail does not change the verdict; an unrelated uncommitted edit that a test
  needs in order to pass makes the hotfix fail with `the existing tests fail
  (tests/flags.test.js: flags are on)`, because the copy lacks it. Neither an ignored local
  `.ctoc/quality-config.yaml` nor an uncommitted change to a committed one chooses the test
  command.
- [x] The `--run-tests` call runs the tests in a temporary copy under the system's temporary
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
- [x] A judged file that changes while the `--run-tests` call runs — before its content reaches
  the copy, or while the tests run — is refused with `I could not read the change (<file>
  changed while it was being checked)`. On a pass, each judged file's id in the temporary
  index equals its hash taken before any rule read its content and its hash taken after the
  tests; those ids and the last commit's id are what slice 2 records.
- [x] A judged file whose name holds `'`, `"`, `$`, `\`, a backtick or a control character is
  refused by both calls with `I could not read the change (<file> has a name the commit
  command cannot carry)`.
- [x] A linked `node_modules` whose workspace link (a top-level or `@scope/` entry), or a linked
  virtual environment whose editable install (a `.pth` or `__editable__` finder file), leads to
  a folder of the repository holding other uncommitted work is refused with `I could not read
  the change (other uncommitted work is in code the tests load through installed packages:
  <folder>)`, and no test runs; the same link with no such work passes, and so does a hotfix
  whose judged file lies in that folder.
- [x] Running a pass's `commit.add` and then its `commit.message` (with `<what changed>`
  filled in) from the project root, in a repository where another file holds a staged change,
  makes one commit that holds exactly the judged files; the other file stays staged.
- [ ] Every refusal scenario of the functional plan that this slice covers (program logic,
  setting, text inside code, price, sensitive area, more than 20 lines, new file, failing test,
  edited test, no test ran, unreadable change, unrecognised file) answers exactly the sentence
  with its clause; the failing-test clause reads
  `the existing tests fail (tests/home.test.js: shows Save)`, also when the runner reports the
  failure on standard error only.
- [x] An edited test is refused without running any test.
- [x] The corpus — 82 edit shapes (24 that qualify, 58 traps) plus the mode-change case — gives
  exactly the expected verdict and clause for every shape (`checking` for each shape that
  qualifies, because the first call runs no test), among them: 20 changed lines in one file and
  three files reach `checking` while 21 lines and four files are refused; a `.tsx` comparison
  chain and a generic type are refused; a full-width digit and `WWW.` are risk markers; a
  `*.spec.*` file outside a test folder is a test; a document whose attributes say `-diff`
  counts its real lines; `constraints*.txt`, a `.txt` under a `requirements` folder,
  `runtime.txt` and `CMakeLists.txt` are not documentation; a colour or text edit under `.claude/`
  or `agents/` is refused.
- [x] The same change checked twice gives byte-identical answers; Windows line endings do not
  count as changed lines; a named path written with `\` gives the same answer as with `/`; the
  answers are identical with and without `diff.noprefix`, `diff.mnemonicPrefix`,
  `diff.interHunkContext`, `diff.algorithm`, `diff.relative`, `diff.context` and `color.diff`
  set in the repository, and with and without `diff.autoRefreshIndex=false` beside a file whose
  modification time moved while its content did not.
- [x] A project folder that lies outside the repository git reports (a `core.worktree`
  elsewhere) is refused with `I could not read the change (this folder lies outside the
  repository git reports)`; a fault inside the check is refused with exactly
  `I could not read the change (the check stopped)` and its message in `detail`.
- [x] npm's placeholder test script, a test runner that is not installed, a timed-out run and a
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
- [x] No call changes, stages, stashes or deletes anything in the project: the files outside
  `.git/` and `.ctoc/`, `.git/index`, the stash and the list of worktrees are byte-identical
  before and after, also when the project's own tests write and stage files.
- [x] Every pass and every refusal appends exactly one line to `.ctoc/logs/hotfix-checks.jsonl`
  with its verdict, cause and counts and no file name or wording; a `checking` answer and the
  usage answer append none; a log that cannot be written changes no answer; a log above 1 MiB
  is renamed to `.ctoc/logs/hotfix-checks.jsonl.1` and a new one started; nothing is written
  through a symbolic link at `.ctoc`, `.ctoc/logs` or the log, nor into a log that is a hard
  link (the linked file's bytes are unchanged).
- [x] `npm test` passes: lint, typecheck, every test, coverage at or above the floor in
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

**Owner's decision 2026-10-09: formats the check reads.** Read this entry before the
specification above: the specification's text is left as approved (so its hash holds), and
this decision supersedes parts of it. A later reader who follows the specification's lists of
formats builds the wrong check.
- *The formats that stay:* plain HTML (`.html`, `.htm`); colours in plain CSS (`.css`);
  catalogue wording in JSON, YAML and Java properties files (`.json`, `.yaml`, `.yml`,
  `.properties` under a catalogue folder); plain prose in Markdown (`.md`) and plain text
  (`.txt`).
- *The formats removed:* Vue (`.vue`) and Svelte (`.svelte`); JSX and TSX (`.jsx`, `.tsx`);
  MDX (`.mdx`); reStructuredText (`.rst`); Sass and Less (`.scss`, `.sass`, `.less`); gettext
  (`.po`). A file of a removed format gets `I do not recognise <file> as wording or a colour`.
- *The specification sections it supersedes:*
  - **"Rule 4 — the four kinds, and everything else"**: kind 1 (documentation, `.rst`), kind 2
    (markup, `.jsx`, `.tsx`, `.vue`, `.svelte`, and both `.jsx`/`.tsx` clauses of that
    paragraph), kind 3 (message catalogue, `.po` and the gettext `msgstr` form) and kind 4
    (colour, `.scss`, `.sass`, `.less`, and the Sass and Less variable alternatives of the
    declaration pattern).
  - **The corpus box of "Acceptance criteria"** ("The corpus — 82 edit shapes …"), where it
    names a `.tsx` comparison chain and a generic type: both are refused because the file's
    kind is not recognised. Its counts are stale too; the counts that hold are in Decision 130.
  - **The first row of "Risks"**, where it names JavaScript comparisons and generic types in
    `.jsx`/`.tsx` and their mitigation: no such file is read.
  - **Step 8** (TEST), the corpus list, where it names `Greeting.jsx`, `CancelButton.tsx`,
    `NameField.vue`, `Loading.svelte`, `translations/de.po`, `theme.scss`, `accent.less` and
    `docs/guide.rst` as shapes that qualify, and its `.jsx` and `.vue` traps: each is kept as
    a test and asserts the "not recognised" refusal.
  - **Step 11** (REVIEW), its first box, where it asks for "`.jsx`/`.tsx` lines where `<` and
    `>` are code".
- *Where the detail is:* Decision 105 (the decision as taken, with every sentence it
  supersedes quoted), Decisions 117 to 130 (the sixth round: within the formats that stay,
  the HTML reader keeps to a strict subset, and the functional plan's sentence for a change
  the check cannot read exactly).
- *Parts of the specification that later decisions at review supersede* (added 2026-10-09,
  in the seventh round, on the reviewer's correction; the specification's text is left as
  approved here too):
  - **The row of "Risks" on a sensitive word inside a joined name** (`AuthPanel.jsx` "splits
    into `AuthPanel`, which is not `auth`", and "widening it is a normal plan"): reversed by
    Decision 127. Rule 5 reads the camel-case sub-words of each part, so `AuthPanel` sits in
    the area `auth`.
  - **"Rule 4", kind 2 (markup)**, where it says the parts that differ lie "on the same line"
    and that the text run holds no `&`: superseded by Decision 139 (text over several lines,
    and the plain character references). Its other clauses for `.html` are superseded by the
    strict subset (Decisions 117 to 122) and by Decisions 131 to 140.
  - **"Rule 4", kind 1 (documentation)**, "Any wording edit qualifies": Markdown is read as
    its reader renders it (Decisions 141 to 147).
  - **The corpus box of "Acceptance criteria"**: the counts that hold are in Decision 148.
- *Parts of the specification that decisions at review supersede, named in the eighth round*
  (added 2026-10-09, on the brief's item "complete the record"; the specification's text is
  left as approved here too):
  - **"Rule 4", kind 1 (documentation)**, whole ("`.md`, `.txt`, `.rst` … Any wording edit
    qualifies"): a `.md` file qualifies only as a wording change in pure prose, a `.txt`
    file only under a documentation name, and a legal text never (Decisions 151 to 158).
    The line above that says Markdown "is read as its reader renders it (Decisions 141 to
    147)" is superseded with those decisions.
  - **"Rule 4", kind 4 (colour)**: its comparison of each pair of lines "with every colour
    token replaced by one marker", its pattern for a declaration (which lets the name start
    with `--`, `$` or `@`), and its list of what a colour token is and where it stands. A
    stylesheet is read whole, statement by statement (Decisions 71 and 80); `url(…)` holds
    no colour (57); a colour passes only in a real colour property, a name that ends in
    `color` or one of the listed shorthands (92); a custom property passes only when it is
    named for a colour and holds exactly one colour, and every other custom property is a
    setting (115); a colour that is not a whole value gets the sentence for a change the
    check cannot read exactly (128).
  - **"Files", the sentence "Nothing else is exported"**: `ruleRefusal` is exported too
    (Decision 86), for the corpus's property test and for the differential test; `judge`
    calls it, so it has a live caller.
  - **"The rules and the order they run in", Rule 5**, "The display path split at every
    character that is not a letter (`/[^A-Za-z]+/`), lower-cased; a part equal to one of the
    33 words": the path is read from the repository's top (Decision 67), folded with Unicode
    NFKC, split at every character that is no letter of any script, and read also by its
    camel-case sub-words (127); a word counts in the plural too, and CTOC's own lists of
    secret files and enforcement paths are asked (84); on a stylesheet's own name the plural
    does not count (113). The eighth round adds the names of legal texts (Decision 154).
  - **Decision 13, "No new dependency"**: it holds for what the product needs to run. Two
    test-only dependencies were added in the seventh round, parse5 and markdown-it
    (`devDependencies`, exact versions; Decision 131), and `package.json` names the Node.js
    they need (Decision 172).
  - **"Rule 4", kind 2 (markup)**, for `.html`: besides what the list above names,
    Decisions 160 to 167 (only white space before the doctype, a table among another
    table's rows, `<noscript>`, `<rt>` and `<rp>`, leading white space before the body and
    in a table, control and format characters, the byte-order mark, white space after the
    body's end).
  - **The acceptance criteria**: in the box "Every refusal scenario of the functional plan
    …" the item "more than 20 lines" (Decision 156: the scenario's own numbers now get
    another sentence, and the box is unticked); the box on line endings, whose passing
    example is an HTML page now (Decision 156); the corpus box, whose counts are in
    Decision 173.
  - **Step 8** (TEST): case 10 ("two `.md` files, 13 lines removed and 12 added") and case
    19 ("an `.md` file whose every line ending changed"), converted as Decision 156 says;
    and in the corpus list `notes/todo.txt` among the shapes that qualify (plain text under
    no documentation name is not recognised) and `docs/limit.md` with its clause for 21
    lines (it gets the sentence for a change the check cannot read exactly). Each is kept
    as a test.

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

90. **Text inside a component or a custom element is never wording** (decision at review,
    2026-10-09; source: the security attack, item A1, high). Committed passes on `51cb8267`:
    `.jsx` `<RunSql>SELECT name FROM users</RunSql>` → `SELECT pass FROM admins`, and `.vue`
    `<MyAction>charge</MyAction>` → `refund`. The session's decision, a safe default:
    *"limit text-bearing elements to HTML host elements, meaning a lowercase name with no
    hyphen. Refuse the text children of capitalised components and of custom elements (names
    with a hyphen), in JSX, Vue, Svelte and HTML alike. This includes Vue slot content passed
    to a component through `<template #x>`."* The scanner now counts every open element whose
    name fails `^[a-z][a-z0-9]*$` (by its own name, so another element's end tag does not
    end it) and marks all text inside it quiet, at any depth; a JSX fragment `<>` is no
    element. The clause is the markup kind's existing sentence, `I do not recognise <file> as
    wording or a colour`, the nearest one: the refusal comes from the same token comparison
    as raw text and templates, and the program-code clause names "program code", which a
    `.html` file is not. The executor's choices, each stricter: (a) the rule reads the name as
    written, so in a `.html` file `<DIV>` and `<MyAction>` hold their text too (HTML would
    lower-case them); (b) a name with a colon (`svelte:head`) or a dot (`ui.p`) is no host
    name; (c) in `.html`, `.htm` and Markdown a self-closing `<my-widget/>` still opens the
    element, as HTML reads it, while `.vue` and `.svelte` (now read in a `svelte` mode, as
    `html` otherwise) close it. **The owner will be offered an alternative**: an allowlist of
    presentational component names (`Button`, `Link`, `Label`, ...) whose text is wording.
91. **A reference definition's destination and title may stand on the next lines** (decision
    at review, 2026-10-09; source: the security attack, item A2, high). Committed passes:
    `[a]:` with `/u/profile` on the next line changed to `/u/delete`, and to
    `//evil.example/x`. When `[label]:` has no inline destination, the next non-blank line
    (the destination) joins the exact-compare text; when the destination has no title after
    it, a next line opening a title (`"`, `'`, `(`) joins it with every following line up to
    a blank one (a title may run over lines, never over a blank one). The executor's choice:
    a next line that is itself a definition is read as its own definition, not as the
    destination.
92. **A custom property or a Sass or Less variable is a setting; a colour passes only in a
    real colour property** (decision at review, 2026-10-09; source: the security attack, item
    A3, medium). `--enabled: green` → `red` and `--mode: red` → `lime` passed as colour, but a
    script reads them (`getComputedStyle`). The session's decision, a safe default: *"any value
    change in a custom property (`--x`), a Sass variable (`$x`) or a Less variable (`@x`) is
    refused, with the settings clause. Colour passes stay limited to real colour-valued CSS
    properties."* Every declaration `name: value` whose name starts `--`, `$` or `@` is read
    from the whole file (the stylesheet scanner's statements, the value as written, comments
    and strings in it included); when the two sequences differ, at any depth, the answer is
    `it changes a setting in <file>, and settings changes are a common cause of outages`,
    before the colour comparison. The real colour properties, exactly as the code has them: a
    name matching `/(?:^|-)color$/i` (`color`, `background-color`, `border-color`,
    `border-top-color`, `outline-color`, `text-decoration-color`, `caret-color`,
    `accent-color`, `column-rule-color`, `flood-color`, `lighting-color`, `stop-color`,
    `scrollbar-color`, ...) and the shorthands `background`, `border`, `border-top`,
    `border-right`, `border-bottom`, `border-left`, `border-block`, `border-block-start`,
    `border-block-end`, `border-inline`, `border-inline-start`, `border-inline-end`,
    `outline`, `column-rule`, `fill`, `stroke`, `box-shadow`, `text-shadow`,
    `text-decoration`, `text-emphasis` (`COLOUR_SHORTHANDS`); never a name starting `--`, `$`
    or `@`. A hexadecimal or functional colour no longer passes in any other property either
    (`width: #fff` was a pass). The earlier qualifying shape "a named colour in a custom
    property" (`src/styles/custom.css`, `--accent: red` → `blue`) is now a trap, with this
    decision as its reason, and so are the three other variable shapes (`vars.css`
    `--brand`, `theme.scss` `$brand`, `accent.less` `@accent`); the branch case `main.scss`
    now expects the settings clause, and `end.scss` keeps its purpose (a `//` comment at the
    file's end) on `a { color: … }`. Residual, recorded: a Less detached ruleset
    (`@x: { … }`) is a block, not a variable value; the declarations inside it are judged
    like any other. **The owner will be offered an alternative**: colour-named tokens
    (`--color-*` and similar) whose colour values pass as colours.
93. **reStructuredText literal blocks and doctests are code** (decision at review,
    2026-10-09; source: the code review, item B1). The block after a paragraph ending in
    `::` or a line `::` alone, after a blank line, is code: indented deeper than that line,
    or (the executor's addition, by the same reasoning) a quoted literal block, the lines at
    its indentation starting with the same punctuation. A doctest, a line starting `>>> ` (or
    `>>>` alone) and the lines after it up to a blank line, is code in `.rst`, in `.txt` (a
    new plain-text reader; `.txt` had none) and in `.md` (where `>>>` would otherwise be a
    triple quote: reading it as code only refuses more).
94. **Every reStructuredText directive is code but the prose ones** (decision at review,
    2026-10-09; source: the code review, item B2). The prose directives: `note`, `warning`,
    `tip`, `important`, `caution`, `danger`, `error`, `hint`, `attention`, `seealso`,
    `admonition`, `topic`, `sidebar`, `rubric`. Their line and body are read as prose, line
    by line (so a code directive nested in one is code); their options, the body's leading
    `:name:` lines, are code. Every other directive (`ifconfig`, `doctest`, `image`,
    `toctree`, `automodule`, `replace`, a domain directive such as `py:function`, ...) is
    code with its indented body. The executor's addition: a prose directive whose own line
    ends in `::` (`.. note:: Run this::`) is code whole, because a literal block follows.
    Comments, footnotes and citations (`.. text`, `.. [1] text`) stay prose.
95. **HTML code elements hold code** (decision at review, 2026-10-09; source: the code
    review, item B3). Text inside `<code>`, `<pre>`, `<kbd>`, `<samp>` and `<var>` is quiet,
    counted like a component (Decision 90), in HTML and in Markdown's inline HTML; the
    executor applied it in JSX, Vue and Svelte too (the same elements, the same reasoning).
96. **`<title>` text is wording** (decision at review, 2026-10-09; source: the code review,
    item B4). Its content is read to `</title>` as one text token (HTML reads it as text,
    tags included), judged by the normal text rules, so a `<` inside still refuses. The
    branch case `src/pages/title.html` now expects `checking`.
97. **Vue's conditional templates render** (decision at review, 2026-10-09; source: the code
    review, item B5). In `.vue`, a nested `<template>` with `v-if`, `v-else-if` or `v-else`
    and no slot (`#x`, `v-slot…`) is markup; its text qualifies unless something around it
    holds it (a component, Decision 90; a slot template). The executor added `v-else-if` (the
    same chain) and left `v-for` templates quiet. The branch case `src/components/Slot.vue`
    (a `v-if` template inside the component's markup, despite its name no slot) now expects
    `checking`.
98. **A stylesheet's own file name is no sensitive area** (decision at review, 2026-10-09;
    source: the code review, item B6). `tokens.css` and `design-tokens.css` matched `token`
    through its plural. For `.css`, `.scss`, `.sass` and `.less` the sensitive words are
    matched in the folders only; CTOC's secret-file guard still reads the whole path.
99. **The reused CTOC checks** (decision at review, 2026-10-09; source: the code review,
    item B7). (a) CTOC's secret-file guard, `src/hooks/guard-files.js`, pattern
    `/id_(rsa|dsa|ed25519|ecdsa|\w+)/i`, refuses `src/styles/grid_theme.css` and
    `docs/android_setup.html` (both `isSecretTarget` true, run 2026-10-09). The module is not
    changed here; the false positive is recorded for a fix to the guard itself. (b)
    `isProtectedEnforcementPath` (`src/lib/protected-paths.js`) names CTOC's own enforcement
    surface: its only other caller, `plan-coverage.js`, refuses an autonomous plan's write
    over "CTOC's own gate-enforcement code", and its list is CTOC's files (`src/hooks/`,
    `plan-coverage.js`, ...). So it is meant for CTOC's repository only: the hotfix check now
    asks it only when `isCtocProject(top).isCtocRepo` (`src/lib/ctoc-project-detector.js`,
    the detection `SessionStart.js` uses: `package.json` named `ctoc` at the project
    boundary). A React project's `src/hooks/README.md` is a qualifying corpus shape again; a
    branch case pins the refusal in a repository that is CTOC.
100. **Markdown list items** (decision at review, 2026-10-09; source: the code review, item
    B8). An indented code block is four columns beyond the content column of the list item
    it stands in, read after CommonMark's list rules, so a paragraph indented to the content
    column after a blank line is prose. The executor's choices, each keeping the reading on
    the safe side where it cannot follow CommonMark exactly: every line indented less than
    an item's content column ends the item (a lazy continuation line too, which only makes
    more lines code); a thematic break (`* * *`) and an item with no text are no items; an
    ordered item not numbered 1 starts an item only after a blank line or another item (it
    cannot interrupt a paragraph); a fence inside an item opens at most three columns beyond
    the item's content column and closes only at that column (a closing fence further left
    would really open a new block); an item whose text opens a fence or a doctest opens it,
    and one whose text starts five columns after its marker is code. Residual, recorded: a
    block quote's own indented code (`>     code`) is still read as prose, as before.
101. **TypeScript type parameter lists are no element** (decision at review, 2026-10-09;
    source: the code review, item B9). After `<T,>(…) =>` in a `.tsx` file the rest of the
    file was read as element children, so a later string `"<b>Save</b>"` passed. Where JSX
    could start, a `<` followed by a name (after an optional `const`, `in` or `out`) and then
    `,` or `extends` starts a type parameter list, skipped to its matching `>` (strings
    skipped, the `>` of `=>` not counted) as code.
102. **The property test inserts 23 characters, and found the reStructuredText reference**
    (decision at review, 2026-10-09; source: the code review, item B10). `` ` ``, `&`, `$`,
    `[`, `]`, `|` and `_` were added. On `51cb8267` they gave 1,730 passes no table named;
    one class was a real hole: `handbook_` is a reStructuredText simple reference, a link to
    the target `handbook`. Simple references (`name_`, `name__`) and footnote and citation
    references (`[1]_`) are now compared exactly, read word by word with the surrounding
    punctuation stripped by hand. The other passes are named, each with its reason: in markup
    and JSX text `[ ] | _` are shown as typed (`&`, `$` and the backtick refuse); in catalogue
    values `[ ] | _ &`; in Markdown prose `| _` (a table cell or emphasis), `[ ]` (a bracket
    that names no definition; targets are compared exactly), an unpaired backtick, and an
    `&` that starts no character reference (one that does is not named, so it fails the
    test); in reStructuredText every new character but an `_` that ends a reference name; in
    plain text all of them. `$` never passes (a currency sign, rule 6). The test now
    separates `.rst` from `.txt`.
103. **The corpus counts in the specification are stale** (the executor, 2026-10-09; source:
    the code review, item B12). The Step 8 box and the acceptance criterion say 82 edit
    shapes (24 that qualify, 58 traps); the file now holds 34 shapes that qualify and 167
    traps, plus the mode change (202 cases; 204 tests in the file with the property test and
    the linear-time case). The reason: each review round added the shapes and traps its
    findings named (Decisions 51 to 64, 65 to 77, 78 to 89, 90 to 102), and this round moved
    four variable shapes to the traps (Decision 92) and `src/hooks/README.md` back to the
    shapes (Decision 99). The specification text is left as written, so its hash holds; this
    decision is the current count (with Decision 104's cut-short case, 205 tests in the
    corpus file).
104. **Every scanner fails closed** (decision at review, 2026-10-09; source: an automated
    commit security review that named "fail-open state drift" and "parser differential" in
    `hotfix-check.js` without details, and the session's item C1). (a) *End-of-file state*:
    every scanner reports `open` when either side ends inside an unfinished construct (an
    unclosed tag, attribute quote, comment, `<!…>`, CDATA, raw-text element or `<title>`,
    an unclosed `{…}` in HTML, Vue or Svelte or `{{`/`{%` in Markdown, a Vue `<template>`
    never closed; in JavaScript an unclosed string, template literal, regular expression,
    block comment, brace, JSX element or type parameter list; in stylesheets an unclosed
    comment, string, `url(`, or block; in Markdown an unclosed fence, front matter in any of
    its three forms, or link destination; in reStructuredText a backtick run left unpaired,
    an open role span, interpreted text or inline literal). Rule 4 then answers
    `I could not read the change (<file> leaves a tag, quote, comment, block, fence or span
    open)`, log cause `unreadable`. (c) *Desync*: a scanner reports `lost` where it meets
    something it cannot follow where it expects structure: an attribute name starting with
    `<`, `"`, `'` or `=` (an unclosed `<div` swallowing the next tag), a JavaScript or CSS
    string or regular expression running into a line break, a `}` with nothing open (in
    JavaScript and in stylesheets); the answer is `I could not read the change (<file>
    holds something I cannot follow)`. (b) *Matching state at each changed line*: for
    markup and JSX the token comparison already demands identical token kinds on both sides
    with each changed text token on one line, so the state at every changed line is the same
    by construction; for stylesheets the two whole texts must be identical but colour
    tokens; for Markdown, reStructuredText and plain text the line classes of every changed
    line are compared (`lineClassChange`). The one scanner that read a changed line without
    knowing its state was the message catalogue: a changed line is now read alone only
    where it starts an entry, never inside a YAML block scalar (`|`, `>` and the lines
    indented beneath), a YAML quoted value or flow collection begun on an earlier line, or a
    properties value continued by a `\` on the line above (`lost` otherwise). The executor's
    reading of the state rule: the state where wording must be allowed is taken at the
    changed text, not at the line's first character, because the qualifying shape
    `wrapped.html` (a tag whose attributes run onto the changed line) starts that line inside
    a tag on both sides. A reStructuredText directive body that runs to the end of the file
    is closed by the format's own rule (its content ends at a dedent or at the end), so it is
    not counted as open: the qualifying branch case `docs/note.rst` ends in a note's body.
    Superseded pins, each now the unreadable answer: the round-3 branch cases `Str.jsx`,
    `Tick.jsx` and `Re.jsx` (an unclosed string, template literal and regular expression at
    the end of the file were passes), `unclosed.html` (an unclosed script), `open-json.md`
    (an unclosed JSON front matter, a setting before), `unfence.md`, the round-4 case
    `fence-out.md`, and the edge shape `docs/rule.md` (an unclosed first-line `---` was no
    front matter and passed; Decision of round 2). In the property test a backtick inserted
    in reStructuredText now refuses, so the table no longer names it. A new property case
    cuts the new side of every qualifying corpus file at every point (1,874 cuts): a cut that
    passes must leave the file ending in plain visible text with every construct before it
    closed, by a separate check in the test. It found two holes, both fixed red first: a
    Markdown link destination cut before its `)` (`[the new guide](/guide`) passed, and is
    now an open construct; and an emptied `.rst` or `.txt` file passed as a wording edit
    (the Markdown one already refused): a side emptied, or filled from empty, now holds the
    content of a removal or an addition and is not recognised, in every qualifying kind.
105. **OWNER DECISION (2026-10-09, answer "a"): the hotfix check keeps only the formats it
    can read exactly.** The reason, as the owner decided it: five rounds of security attacks
    with real runs each found new ways to get a behaviour change committed as a hotfix, and
    the last ones were in Vue, MDX, reStructuredText and Less, where a hand-written reader
    disagrees with the real compiler. So the hotfix check keeps only the formats it can read
    exactly.
    *The formats that stay:* plain HTML (`.html`, `.htm`); colours in plain CSS (`.css`), on
    real colour-valued properties (and, by Decision 115, in a custom property named for a
    colour); catalogue wording in JSON, YAML and Java properties files (`.json`, `.yaml`,
    `.yml`, `.properties` under a catalogue folder); plain prose in Markdown (`.md`) and
    plain text (`.txt`).
    *The formats removed:* `.vue` and `.svelte`; `.jsx` and `.tsx`; `.mdx` (never read as
    its own format; a guard case pins that it stays unrecognised); `.rst`; `.scss`, `.sass`
    and `.less`; gettext `.po`. The module read no other format. Each removed format gets the
    plan's existing sentence for a kind the check does not recognise, `I do not recognise
    <file> as wording or a colour`, through the last row of the table in "Rule 4 — the four
    kinds, and everything else", so the change goes through the normal build loop. The rows
    above that one still come first, as the table says: a removed-format file that is a test
    is still `it changes a test (<file>)` (rule 7 runs before rule 4), and one in a
    database or build folder still gets that folder's clause.
    *The sentences of the specification this decision supersedes* (the text is left as
    written, so its hash holds):
    - "Rule 4 — the four kinds", kind 1: "**Documentation**: `.md`, `.txt`, `.rst`" — now
      `.md` and `.txt`.
    - Kind 2: "**Markup**: `.html`, `.htm`, `.jsx`, `.tsx`, `.vue`, `.svelte`." — now `.html`
      and `.htm`; and with it both `.jsx`/`.tsx` clauses of that paragraph: "in `.jsx` and
      `.tsx` the `>` must end an opening tag `<name …>` and the `<` after the text must begin
      `</name` with the same name, letter case exact (so a generic type such as
      `Box<A>|Box<B>` and a comparison chain such as `a<b>limit<c` are refused)" and "and in
      `.jsx` and `.tsx` also no `(`, `)`, `;`, `=`, `"` or `'`".
    - Kind 3: "**Message catalogue**: `.json`, `.yaml`, `.yml`, `.po`, `.properties`" — now
      without `.po`; and "Gettext `msgstr "value"` (also `msgstr[n]`)".
    - Kind 4: "**Colour**: `.css`, `.scss`, `.sass`, `.less`." — now `.css`; and in the
      declaration pattern the alternatives `\$[\w-]+` and `@[\w-]+` (Sass and Less
      variables).
    - The acceptance criterion on the corpus where it says "a `.tsx` comparison chain and a
      generic type are refused": they still are, now because the file's kind is not
      recognised (the same sentence as before).
    - The first row of "Risks", where it names "JavaScript comparisons and generic types in
      `.jsx`/`.tsx`" and their mitigation: no such file is read.
    - Step 8's corpus list where it names `Greeting.jsx`, `CancelButton.tsx`,
      `NameField.vue`, `Loading.svelte`, `translations/de.po`, `theme.scss`, `accent.less`
      and `docs/guide.rst` as shapes that qualify, and its `.jsx` and `.vue` traps; Step 11's
      first box where it asks for "`.jsx`/`.tsx` lines where `<` and `>` are code".
    *Earlier decisions it supersedes, in whole or in the named part:* 89 (reStructuredText
    roles), 93 and 94 (reStructuredText literal blocks and directives; the doctest rule for
    `.txt` and `.md` stays), 97 (Vue's conditional templates), 101 (TypeScript type
    parameter lists); the JSX, Vue and Svelte parts of 90 and 95; the Sass and Less
    variable part of 92; the reStructuredText and JSX rows of the property-test tables of 87
    and 102; and in 104 the JavaScript, JSX, Sass and reStructuredText constructs.
    *How it was carried out.* The scanners and their code are removed (the JavaScript and
    JSX reader, the type-parameter reader, the Vue and Svelte modes, the reStructuredText
    line and span readers, the Sass indented-statement reader, the Sass and Less variable
    reader, the gettext entry and escape reader); nothing is left as a stub. No corpus or
    test case was deleted: every qualifying shape and every trap of a removed format is
    kept and now asserts the "not recognised" refusal, grouped under a comment that names
    this decision (`REMOVED_FORMATS` in the corpus file; the last group of each table in the
    main test file).
106. **Host elements are a fixed list** (the session's fix 1 of this round, 2026-10-09).
    Decision 90 called every lower-case name without a hyphen a host element, so
    `<runsql>SELECT name FROM users</runsql>` passed. The host elements are now the HTML,
    SVG and MathML element names of Vue's `isHTMLTag`, `isSVGTag` and `isMathMLTag` lists,
    copied into the module with a comment naming the source, and matched in lower case. An
    element of any other name, a custom element (a hyphen in the name, whatever the lists
    hold: `color-profile` and `annotation-xml` therefore hold their text) and any element
    carrying an `is` attribute hold their text. Status of the copy, corrected in the sixth
    round: the list was first written from the executor's memory of
    `packages/shared/src/domTagConfig.ts`; the session then compared `HOST_ELEMENTS` with
    that file, downloaded 2026-10-09: 225 distinct names, none extra, none missing. Since
    the sixth round (Decision 120) the list holds the 111 HTML names of `HTML_TAGS` only;
    the SVG and MathML names are dropped. This also
    supersedes Decision 90's choice (a): the open-element count was keyed by the name as
    written, so `<DIV>…</div>` never closed; names are lower-cased, and `<DIV>Save</DIV>` is
    the host element `div`, whose text is wording. The round-4 branch case
    `src/pages/upper.html` therefore changes from "not recognised" to `checking`, by this
    fix as the session specified it.
107. **A stack of open elements** (fix 2). The scanner keeps every open element, lower-cased,
    on a stack. An end tag that closes the top pops it. Any other end tag, while an element
    that holds text is open, is a fault: `I could not read the change (<file> holds
    something I cannot follow)`. The reason: HTML ignores such an end tag when a "special"
    element lies between (`<run-sql><div></run-sql>SELECT …</div></run-sql>` keeps the text
    inside `run-sql`), and closes several elements with it otherwise; this scanner does not
    copy those rules, so it does not guess where the held text ends. With no such element
    open, the same end tag closes the nearest open element of its name or nothing (`<li>`
    and `<p>` without end tags are everyday HTML and change no verdict). The executor's
    choices, each on the refusing side: a void element never opens; `/>` closes nothing
    (HTML does not let an element close itself; inside SVG it really does, and reading it
    as open only refuses more, while honouring it there would be wrong inside
    `foreignObject`); a `<template>` is an element that holds its text; text after a
    custom element that is never closed stays held to the end of the file. The round-4
    branch case `src/pages/pre.html` (`<pre></code>…`) keeps its refusal with the new
    sentence.
108. **Markdown that may be built as MDX** (fix 3). In `.md`, a changed run of prose that
    holds `{` or `}` is code, and so are a line that starts `import ` or `export ` where a
    block starts and the lines after it up to a blank line. The executor's reading: the
    brace test is on the whole changed text between two tags, not on the changed line
    alone, because an MDX expression may run over several lines (`Hello {` / `eval(x)` /
    `}`); so a typo beside an unchanged `{name}` in the same paragraph is refused too. The
    property test no longer names `{` and `}` as wording in Markdown.
109. **Backticks pair inside one run of inline text** (fix 4): one paragraph, heading, list
    item or table row, never across a blank line, a code line, or the start or end of a
    block. The block boundaries come from the Markdown line reader, after CommonMark: a
    heading, a setext underline, a thematic break, a list item, a block quote; a lazy
    continuation line continues its paragraph, and such a paragraph takes no underline.
    The executor's addition, because splitting too much is as wrong as splitting too
    little (a span cut in two leaves its code as prose): where the pairing itself is not
    sure — the run holds `|` (a table cell ends there), a backslash before a backtick, or
    `<` (a tag or autolink takes its backticks out of the pairing) — everything from the
    run's first backtick to its last is compared exactly. Also from this work, each a pass
    on `6de2f75c`: an ordered item not numbered 1 after a bullet item starts no item; an
    indented line right after a closed fence, a heading or a quote that did not end in a
    paragraph is code.
110. **Block quotes are read like the document they quote** (fix 5; closes the residual
    recorded in Decision 100). The marker (`>` after at most three spaces, and one space)
    is taken off each line of a run of quoted lines, the rest is classified by the same
    Markdown line reader, and the classes are copied back. A list item's own text is now
    read the same way, as a line of its own at the item's content column, so `- >     code`
    and an item that opens a quote, a fence, a doctest or another item are all read. The
    executor's choices, each on the refusing side: a quote whose marker holds a tab is code
    whole; so is a quote nested deeper than 16, and a line with more than 16 list markers
    (both also keep the reader linear); a fence still open where its quote ends counts as
    left open; a line starting `>>>` stays a doctest (Decision 93), not three quotes; a
    reference definition is also recognised behind the markers of a quote or a list item.
111. **Link labels fold case as CommonMark does** (fix 6):
    `.toLowerCase().toUpperCase().toLowerCase()` after the white space is collapsed, so
    `[ẞ]` names the definition `[SS]`.
112. **`listing` and `tt` are code elements** (fix 7). Both are also outside the host list
    of Decision 106; they are named so the reason stays with the code elements.
113. **A stylesheet's own name** (fix 8; replaces Decision 98). Rule 5 matches the sensitive
    words as whole words on a stylesheet's own name again and drops only the plural ending
    there: `login.css` and `payment.css` sit in a sensitive area, `tokens.css` and
    `design-tokens.css` do not. Folders are matched as before, plural included.
114. **The earlier safe default for custom properties, as first asked in this round** (fix
    9): every `--x` value change refused. Replaced during the round by Decision 115.
115. **A custom property named for a colour may change its colour** (the session's decision
    of 2026-10-09, made on the owner's instruction to decide it; it changes item 9 of this
    round and the custom-property part of Decision 92). The reason: design-token projects
    keep their colours in custom properties, and a script can read a real property's
    computed colour just as well as a custom property's, so a colour-named custom property
    carries the same kind of risk the check already accepts. In `.css`, a custom property
    (`--x`) value change qualifies as a colour change only when all of these hold: the
    property name contains `color` or `colour`, in any letter case; the whole old value and
    the whole new value are each exactly one colour — a hexadecimal colour, a named colour,
    or one `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`,
    `oklch()` or `color()` function — with no `var()`, no `url()`, no second token and no
    `!important` added or removed; and everything else in the two files is identical (or a
    colour in a real colour property, as before). Every other custom-property change stays
    refused with the settings clause. The executor's choices: a comment inside the value is
    a second token; the functions are read in their written forms only (three numbers and
    an optional `/ alpha`; `color()` after its colour space's name), so a function the
    reader does not follow is refused; a renamed, added or removed custom property is a
    setting; a custom property whose value opens a block (`--x: { color: red }`) cannot be
    followed (`I could not read the change`), because its inside would otherwise read as
    declarations — a pass on `6de2f75c`. The new functions count only in a custom
    property's value; in real colour properties the colour tokens stay those of the
    specification. In plain CSS `$x` and `@x` are no variables, so a declaration that starts
    with one is no longer a "setting" but simply not recognised.
116. **The corpus counts** (replaces the count in Decision 103). The corpus file holds 30
    shapes that qualify and 195 traps, 42 of them the kept cases of removed formats (41
    converted, of which 8 were qualifying shapes and 33 were traps, plus the `.mdx` guard),
    plus the mode change: 229 tests in the file with the two property cases and the
    linear-time case. The main test file holds 99 tests; 75 rows of its four tables are
    converted cases of removed formats.
117. **The strict HTML subset** (decision at review, 2026-10-09; source: the session's design
    decision of this round, after a final code reading and a security attack; it follows the
    owner's decision that the check keeps only what it can read exactly). The HTML reader
    (`.html`, `.htm`, and inline HTML in Markdown) accepts only a subset of HTML in which it
    agrees with a browser's parser by construction, and refuses the WHOLE file for anything
    outside it. It does not copy the browser's recovery rules. Decisions 118 to 122 say what
    is outside. Kept as it was: the stack of open elements, `is`, custom elements, code
    elements, raw-text elements, an option without a value.
118. **A brace inside a tag is outside the subset** (decision at review, 2026-10-09; source:
    the session's item 1; supersedes Decision 79 part (c)). The brace reading is removed
    entirely (`skipBraces` and its three call sites): a browser knows no braces. A `{` or `}`
    anywhere between `<name` and its closing `>` refuses the file; in text a brace is a plain
    character, judged by the existing text rules (a changed text token with a brace is still
    refused). The executor's reading of "anywhere inside a tag": a quoted attribute value
    too, so `<p title="{a}">` refuses. Reason for the decision: `<button { is="run-sql" }>`
    hid the `is` attribute from the reader, and `{<run-sql>}` and `{<script>/*}` hid a whole
    tag. Cost: a page with a brace in any attribute (inline JSON in a `data-` attribute, an
    inline `onclick` with a block) no longer qualifies. Two former passes refuse:
    `src/pages/braced.html` and `src/pages/stray.html` (`<p data-x=}>`).
119. **`<!`, `<?` and `</` before no letter** (decision at review, 2026-10-09; source: the
    session's item 2). Inside the subset are only `<!DOCTYPE html>` in any letter case and a
    standard comment: it starts `<!--`, is not followed at once by `>` or `->`, holds no
    `<!--` and no `--!>`, and ends at the first `-->`. `<![CDATA[`, `<?…`, `<!x>` and `</ x>`
    are outside. The same comment rule holds inside a script block (`rawEnd`). The executor's
    choices, each on the refusing side: the doctype is exactly the fifteen characters
    `<!doctype html>`, so a legacy doctype (`<!DOCTYPE html PUBLIC …>`) refuses; a comment
    that ends in `<!-` refuses (the HTML standard names it with the other three); inside a
    script, `--!>` refuses only inside a `<!--`. Found while fixing, a pass on `5326daae`:
    the closing tag of a raw-text element was recognised before any character JavaScript
    calls white space, so `<script>x</script ><b></b>run()<b></b></script>` ended the
    script for the reader where a browser reads on (a no-break space is no HTML white
    space) and `run()` → `drop()` answered `checking`; a closing tag now ends before a tab,
    line feed, form feed, carriage return, space, `/` or `>` only.
120. **Foreign content is opaque, and the host elements are HTML's only** (decision at
    review, 2026-10-09; source: the session's item 3). Everything from `<svg` to its matching
    `</svg>`, and from `<math` to `</math>`, is one piece, compared exactly; no text inside
    counts as wording. `HOST_ELEMENTS` holds the 111 names of Vue's `HTML_TAGS` only, so
    `<unknown>`, `<set>` and `<text>` outside `<svg>` are no host elements and hold their
    text. An `<svg>` or `<math>` that is not closed in the file is outside the subset. The
    executor's choices, needed so that the reader and a browser agree where the piece ends
    (a browser leaves foreign content at many HTML start tags, which is what the trap
    `<svg><style><pre></style>…` used): inside the piece the tags are read on a stack of
    their own, `/>` closes (never after an unquoted value, as the tokenizer reads it), and
    the file is outside the subset when an end tag does not close the element on top; when
    any tag stands inside an element where a browser reads HTML again (`foreignObject`,
    `desc`, `title`, MathML's `mi`, `mo`, `mn`, `ms`, `mtext`, and `annotation-xml`), so
    only text may stand there; or when a start tag carries an HTML element's name other than
    `a`, `script`, `style` and `title`, or one of the obsolete names the parser still knows
    (`PARSER_KNOWN`). Honest status: that last list and the list of elements where HTML is
    read again were written from the executor's memory of the HTML standard's rules for
    foreign content, not compared with the standard (the round ran without network); no
    browser was run. **The cost, recorded:** text inside inline SVG or MathML no longer
    qualifies (`<svg><text>Save</text></svg>` → `Store` and `<math><mtext>…` were passes and
    refuse now), and a page whose inline SVG holds HTML in a `<foreignObject>`, a tag inside
    its `<title>` or `<desc>`, or a CDATA section refuses whole.
121. **Inside `<select>` only options are followed** (the executor, under the session's
    design decision; found while fixing, a pass on `5326daae`). While a `<select>` is open,
    any tag but `<option>`, `<optgroup>`, `<hr>` and the end tags of `option`, `optgroup`
    and `select` is outside the subset. Reason: the HTML standard's older "in select" rules
    ignore every other tag there, a `<style>` among them, but still honour `<script>`, and
    newer browsers have relaxed those rules; so `<select><style><script>/*</style>*/ run()
    /*<b></b>*/</script></select>` is a style sheet to this reader and a running script to
    such a browser, and `run()` → `drop()` answered `checking`. The same through an end tag
    that the reader took to close the `<select>` (`<div><select></div>…`). Honest status:
    the claim about browsers is the executor's reading of the standard from memory; no
    browser was run. The session did not list this item.
122. **An element never closed is outside the subset** (decision at review, 2026-10-09;
    source: the functional plan as amended today, scenario "A plain HTML file outside the
    strict subset is refused whole": a `<div>` that is never closed, and `<p>Save</p>` on
    another line). In an HTML file, any element still open at the end of the file refuses
    it. An end tag that closes several elements (`</ul>` over `<li>`, `</body>` over `<p>`)
    stays everyday HTML. Not in Markdown, where a placeholder may stay open (Decision 124).
    This goes beyond the session's list of what is outside the subset; it is taken from the
    scenario. Cost: a page that leaves out its last end tags no longer qualifies.
123. **A changed `import` or `export` line** (decision at review, 2026-10-09; source: the
    session's item 5; extends Decision 108). In `.md`, a changed line that starts with
    lower-case `import ` or `export ` is code wherever it stands. The executor's addition: a
    block of such lines (to the next blank line) also starts after any line that is no
    paragraph's text (a heading, a closed fence), not only after a blank line, so a wrapped
    `import` under a heading is code in its second line too. Inside a paragraph the line
    keeps its class, so that a code span running into it is still compared exactly.
124. **Autolinks and placeholders** (decision at review, 2026-10-09; source: the session's
    item 6). An autolink — `<http://…>`, `<https://…>`, `<mailto:…>`, or `<name@host>` as
    CommonMark reads an e-mail autolink — is one opaque piece, compared exactly; before, it
    was read as an unknown element that never closes, which refused every later typo.
    **What `<file>` in prose did:** the same — an unknown element, never closed, so every
    text after it to the end of the file was held and refused. **What was chosen:** at a
    blank line, the elements opened in the paragraph before it and still open are closed,
    when (a) no line of that paragraph starts with `<` (behind white space and the markers of
    a list item or a quote), so no HTML block starts there and the paragraph is rendered
    inside an element of its own, whose end tag a browser closes everything in it with, and
    (b) every tag of the paragraph is the start tag of a name the HTML parser does not know
    (no host element, none of `PARSER_KNOWN`), or the end tag of such an element opened in
    the same paragraph. So `<file>` refuses a change in its own paragraph only. In every
    other case — a tag at the start of a line, any known HTML tag in the paragraph, an end
    tag for something opened earlier — the element stays open to the end of the file, as
    before. Honest status: `PARSER_KNOWN` is from memory (Decision 120). Cost that stays:
    `</3` or `<?` in Markdown prose refuses the file (Decision 119).
125. **A heading qualifies only while its generated anchor stays the same** (decision at
    review, 2026-10-09; source: the session's item 7). For every ATX and setext heading the
    anchor is: lower case, everything dropped that is no letter, digit, space, hyphen or
    underscore, the spaces then turned into hyphens; the old and the new file's anchors are
    compared in order. `# Install` → `# Setup` is refused, `# instal the App` → `# Instal
    the app` qualifies. The executor's addition: an `&` is kept, so that `copy` → `&copy;`
    (a character reference, which a site generator drops) changes the anchor. The sentence
    is the functional plan's (Decision 128), not the "not recognised" one the session's item
    named before the plan was amended.
126. **A brace reaches its own paragraph** (decision at review, 2026-10-09; source: the
    session's item 8; narrows Decisions 108 and 109, whose "text run" was the whole file in
    Markdown without inline HTML). A changed line is code when its paragraph (bounded by
    blank lines) holds a `{` or `}`; a brace in another paragraph no longer refuses it
    (`docs/mdx-far.md`: a `{` in one paragraph, a typo in a later one, qualifies). The
    executor's addition, so that the narrowing opens no hole: where the Markdown is built as
    MDX an expression that starts a block may run on over blank lines (`{/*` … `*/}`), so a
    paragraph that leaves a brace open, closes one never opened, or holds a quote, a
    backtick or a `/` inside braces reaches every line after it. Markdown's own `{{…}}` and
    `{%…%}` reading is removed with the brace reading (Decision 118). Not closed, and the
    same on `5326daae`: an expression that starts on a line the reader takes for indented
    code (MDX has no indented code) is not seen.
127. **Paths are folded, and camel-case sub-words count** (decision at review, 2026-10-09;
    source: the security attack, the session's items 9 and 10; replaces the "known gap" the
    module's header named). Rule 5 folds the path with Unicode NFKC and lower case, splits it
    at every character that is no letter (`\P{L}`), and also reads the sub-words of each
    part, split where a capital letter follows a small one (digits already split). So a
    folder `ＡＵＴＨ` in full-width letters, `AuthPanel.html`, `paymentForm.html` and
    `userTokens.html` sit in a sensitive area, and `Author.html` does not. To the letter of
    the item: `HTMLLogin` has no small-to-capital boundary before `Login` and is one word.
128. **The functional plan's sentence for a change the check cannot read exactly** (decision
    at review, 2026-10-09; source: the session's addition to this round, from the functional
    plan as amended today). The clause `it changes <file> in a way the check cannot read
    exactly, and only what it can read exactly qualifies` is given in five cases, each under
    the log cause it had before (the plan's table names no cause word): text inside a
    component or custom element (`unrecognised`); text inside `<svg>` or `<math>`
    (`unrecognised`); an HTML file, or inline HTML in Markdown, outside the strict subset
    (`unreadable`; this replaces "I could not read the change (… cannot follow)" and "(…
    leaves a tag, quote, comment … open)" where the markup reader said them; the style
    sheet, catalogue, fence and front-matter readers keep those sentences); a Markdown
    heading whose anchor changes (`unrecognised`); a colour that is not the whole value of a
    colour property (`unrecognised`), and a custom property named for a colour whose value
    is not exactly one colour (`setting`). A file of a removed format keeps "I do not
    recognise". **The tests:** every assertion and corpus row that pinned the old sentence
    for one of these cases asserts the new one; that is the wording the functional plan now
    specifies on a refusal that stays a refusal, not a weakened test. **A behaviour change
    that comes with it:** the plan's table says "a colour that is not the whole value of a
    colour property" and its scenario refuses `border: 1px solid #0a58ca` → `#0b5ed7`, which
    passed; a colour now qualifies only as the whole value of its property (an `!important`
    after it aside). Three former passes refuse (Decision 130). **Disagreements reported:**
    the plan's table and its scenarios agree with each other; the session's list of the five
    cases is narrower than both in two places — it names only custom properties under the
    fifth case, and no element left open under the third (Decision 122) — and the plan was
    followed in both.
129. **The host-element list was compared** (source: the session's item 11; corrects
    Decision 106 and the fifth round's "Not done"). The session compared `HOST_ELEMENTS` with
    Vue's `packages/shared/src/domTagConfig.ts`, downloaded 2026-10-09: 225 distinct names,
    none extra, none missing. After Decision 120 the list is the 111 HTML names; the
    executor counted them in code (111 distinct).
130. **The tests of the sixth round, and the counts** (the executor; replaces Decision 116).
    Former passes that refuse by a decision above: `src/pages/braced.html` and
    `src/pages/stray.html` (118), `src/pages/svg-text.html` and `src/pages/math.html` (120),
    `src/styles/quoted.css` and the long `box-shadow` list of the linear-time case (128).
    Two rows of this round were wrong as first written and were corrected, not loosened: the
    e-mail autolink row lost its `@` to the row helper's own placeholder; and
    `<https://example.org/a b>` is no autolink and no tag a Markdown reader passes on, so it
    is a placeholder that its paragraph closes (a second row pins the refusal in its own
    paragraph). The cut-short case's own check of "closed plain text" now knows that an
    autolink is closed. Comments that stood above nothing after the removed formats are
    gone from the three tables of the main test file and from the corpus. The corpus file
    holds 34 shapes that qualify and 211 traps, 42 of them the kept cases of removed
    formats, plus the mode change: 249 tests with the two property cases and the
    linear-time case. The main test file holds 100 tests; its sixth-round table holds 92 rows.
131. **The reader is held to real parsers by a differential test** (decision at review,
    2026-10-09; source: the session's brief after a security run that compared 5.9 million
    generated HTML edits and 300,000 Markdown edits with real parsers and found 39,248 and
    885 that the check passed although the parser shows a change to script text, a link
    destination, an attribute or a form value; reason: six rounds of reading never found
    that much, so the claim is now tested against the parsers themselves, permanently).
    `tests/hotfix-check-differential.test.js` generates documents and one-word edits from a
    fixed seed (20261009; every case is a function of the seed and its index, both printed
    on a failure, and a failing case is cut down to its smallest form before it is printed).
    For every edit `ruleRefusal` passes, the old and the new document are parsed by parse5
    with scripting on and with scripting off (Markdown is first rendered by markdown-it with
    `html: true`), and the two trees must be identical but for the data of exactly one text
    node, every ancestor of which is an HTML element of the check's host list that holds no
    text (no script, style, textarea, template, code element, option without a value, select
    outside an option, custom element or element with an `is` attribute); no attribute may
    differ anywhere; in Markdown no heading's generated anchor may differ. A sample of the
    cases also goes through the real menu route and must get the same answer. The run counts
    the passed edits per ingredient (24 for HTML, 28 for Markdown) and fails when one is
    zero, so that "zero disagreements" can never mean "nothing of that kind passes". 120
    documents written by hand (the classes found and everyday shapes) go through the same
    oracle. The plain visible-text edits the check refuses are counted and printed, never
    asserted. Sizes: 50,000 HTML and 12,000 Markdown cases by default; 6 million and 1
    million with `HOTFIX_DIFFERENTIAL_SOAK=1`; `HOTFIX_DIFFERENTIAL_SEED`, `_HTML`,
    `_MARKDOWN`, `_FROM` and `_SHOW` choose another seed, size, first case, and a print of
    refused plain edits. **The two test-only dependencies:** parse5 8.0.1 and markdown-it
    15.0.2, `devDependencies` at exact versions; nothing under `src/` requires either.
    parse5 is published as an ECMAScript module only, and markdown-it's own dependency
    `entities` 8.1.0 asks for Node.js 20.19 or later, so this one test file needs a Node.js
    that can `require` such a module (20.19 or later, 22.12 or later); the repository's
    continuous integration runs Node.js 20 and 22 (`.github/workflows/tests.yml`), and
    `package.json` still says `>=18` for the product itself, which needs neither package.
132. **Names are lower-cased in ASCII only** (decision at review, 2026-10-09; source: the
    brief's class "HTML, names"; reason: the HTML tokenizer folds only `A` to `Z`).
    JavaScript's `toLowerCase` turns the Kelvin sign into `k`, so `<lin` + Kelvin sign + `>`
    was read as the void element `link`, while a browser makes an unknown element of it that
    holds everything after it. Tag and attribute names, and the doctype, now go through
    `asciiLower`.
133. **`<frameset>` and `<frame>` refuse the file** (decision at review, 2026-10-09; source:
    the brief's class "HTML, frames"; reason: a browser may drop the whole body for a
    `<frameset>` and then drops the text after it, so an edit there changes nothing).
134. **Options and `<select>`** (decision at review, 2026-10-09; source: the brief's class
    "HTML, options", and what the differential showed). Inside a `<select>` text is wording
    only directly inside an `<option>` with a `value`; an `<option>` with no `value` holds
    its text, as before, but is now an element on the stack: closed by its own end tag, by
    the next `<option>` or `<optgroup>` while it is on top (inside a `<select>` also by
    `<hr>`, and an `<optgroup>` on top is then closed too), and by the end tag of its
    `<select>`, `<datalist>` or `<optgroup>`. The old flag closed it at any later `<option>`
    whatever stood between.
135. **The content of `<noscript>`** (decision at review, 2026-10-09; source: the brief's
    class "HTML, `<noscript>`"; reason: with scripting a browser reads it as raw text, without
    scripting as markup, and the oracle runs both). It stays one raw piece compared exactly,
    and must now itself be markup of the strict subset with every element closed
    (`scanMarkup` on the content); else the file is refused. `<noscript><code></noscript>`
    left a code element open for a browser without scripting.
136. **An end tag that does not close the top of the stack refuses the file, with a listed
    table of exceptions** (decision at review, 2026-10-09; source: the reviewer's general rule
    in the brief; reason: HTML ignores such an end tag or moves elements for it, by rules the
    scanner does not copy). The old rule closed the nearest open element of that name
    whenever no holder was open, and ignored an end tag that closed nothing. **The exceptions
    kept, exactly** (`IMPLIED_END`; each is an end tag the standard lets a writer leave out,
    and the differential shows parse5 closes the same elements): `p` is closed by the end tag
    of `address`, `article`, `aside`, `blockquote`, `details`, `dialog`, `div`, `dl`,
    `fieldset`, `figcaption`, `figure`, `footer`, `header`, `hgroup`, `main`, `menu`, `nav`,
    `ol`, `section`, `summary`, `ul`, `li`, `dd`, `dt`, `td`, `th`, `body` and `html`; `li`
    by `ul`, `ol`, `menu`; `dt` and `dd` by `dl`; `rt` and `rp` by `ruby`; `option` by
    `select`, `datalist`, `optgroup`; `optgroup` by `select`, `datalist`; `caption`,
    `colgroup`, `thead`, `tbody`, `tfoot` by `table`; `tr` by `table`, `thead`, `tbody`,
    `tfoot`; `td` and `th` by `tr`, `table`, `thead`, `tbody`, `tfoot`; `head` and `body` by
    `html`. Nothing is closed at the end of the file (Decision 122 stands: the cut-short
    property case needs it). Of the brief's list of optional end tags, the end of the file
    closing `html`, `head` and `body` is therefore not kept.
137. **A start tag closes an open element only where that element is on top** (the executor,
    2026-10-09, under the brief's "stay in line with the strict-subset design"; source: the
    differential at 2 million cases, `<p><small><datalist><hr><option></datalist><small>
    <form>alpha</form></small></small></p>`: the `<hr>` closes the `<p>` and everything in
    it for a browser, the later `</datalist>` then closes nothing, and the option without a
    value stays open over `alpha`; reason: the scanner agrees with the parser only while its
    stack is the parser's stack). Followed in the plain form, refused in every other: a tag
    that ends a paragraph (`P_CLOSERS`, the standard's list) while a `<p>` is open; `<li>`
    with an `<li>` open in the same list (it may stand under a `<p>` on top), `<dd>` and
    `<dt>` likewise in their `<dl>`; a heading on top is closed by the next heading; `<a>`,
    `<button>` and `<nobr>` close an open one of their own; `<rt>` and `<rp>` in a `<ruby>`;
    the parts of a table each only where a table has them, after closing the parts on top
    that they end (`TABLE_PARTS`); a part of a table with no table around it, a `<table>`
    directly in a table's rows, anything but `<col>` and `<template>` or text in a
    `<colgroup>`, and a `<form>` inside a `<form>` refuse the file. This is stricter than
    zero disagreements needs in places (a mutation run that removed each of these rules
    found disagreements only for the table of Decision 136), and is kept because it is the
    rule by which the stack stays exact.
138. **After the body's end, `is` on `<html>` and `<body>`, and a table in a paragraph**
    (the executor, 2026-10-09; source: the differential). After `</body>` or `</html>` only
    white space, comments and those two end tags may follow: a browser puts anything else
    back into the body, inside whatever is still open there. An `is` attribute on `<html>` or
    `<body>` refuses the file: a browser adds the attributes of a second such tag to the one
    element that holds everything (`<p>alpha</p><body is>`). A `<table>` closes an open `<p>`
    only when `<!DOCTYPE html>` leads the file; without a doctype a browser is in quirks mode
    and nests the table in the paragraph (`<p is=x><table>alpha</table>`), and the scanner
    now does the same. **A legacy doctype stays refused** (the brief's Step 4): it too puts
    a browser in quirks mode or limited-quirks mode, and which one depends on the doctype's
    public identifier, a table the scanner does not carry.
139. **Three false refusals let go** (decision at review, 2026-10-09; source: the brief's
    Step 4, each "only if the differential stays at zero", which it does). A changed text
    token in an HTML file may now (a) run over several lines: it is one text node however
    many lines it is written on; (b) hold a character reference, when every `&` in it starts
    one of `&amp;`, `&nbsp;`, `&quot;`, `&apos;`, `&copy;`, `&reg;`, `&trade;`, `&hellip;`,
    `&mdash;`, `&ndash;`, `&lsquo;`, `&rsquo;`, `&ldquo;`, `&rdquo;`, `&laquo;`, `&raquo;`,
    `&middot;`, `&bull;` or `&shy;`, written with its semicolon: rule 6 reads the text as
    written, and any other reference could spell a digit, a currency sign, an `@` or a `/`
    that it would not see (`&commat;`, `&#36;`); (c) stand beside a comment instead of a tag.
    This supersedes the specification's "on the same line" and its ban on `&` in the text
    run for `.html` (the entry at the top of the decisions names it).
140. **Text that comes or goes whole is no reworded text** (the executor, 2026-10-09; source:
    the corpus trap `src/pages/crossing.html`, which Decision 139 (a) would have turned into
    a pass). A changed text token that is white space only on exactly one side refuses: text
    then moved across a tag, and in a table a browser puts text that is not white space
    elsewhere than white space.
141. **Markdown is read block by block, as its reader renders it** (the executor, 2026-10-09,
    under the brief's "fix until the differential shows zero"; source: the brief's Markdown
    classes; reason: each of them came from guessing which lines are prose and then scanning
    the prose as one flat text, and patching the guesses class by class left the next class
    open). `markdownBlocks` now reads the file after CommonMark's block rules as markdown-it
    applies them: tables, indented and fenced code, block quotes, thematic breaks, lists,
    link reference definitions, HTML blocks (the seven start conditions), ATX and setext
    headings, paragraphs and what interrupts them; the tabs among a line's markers count as
    columns. It hands `scanMarkup` the document a reader renders: every tag the reader makes
    (`<p>`, `<blockquote>`, `<ul>`, `<ol>`, `<li>`, `<h1>` to `<h6>`, `<pre>` for a code block
    with its text left out, `<hr>`, a table's tags), each raw HTML block as written, each run
    of inline text, and what is compared exactly. So the file's own HTML and the reader's
    tags go through the one strict HTML scanner as one document, and an end tag inside a
    paragraph can no longer close an element opened outside it. A tag the reader makes
    closes, with its end tag, the placeholders left open in its inline text (`<file>`: names
    the HTML parser does not know), as a browser does; anything else left open there refuses
    the file. A list item's paragraph may or may not get a `<p>` (a reader decides by blank
    lines), so there a `<p>` already open, or a placeholder left open, refuses the file. An
    element still open at the end of the file refuses it. This replaces the line classes
    `starts` and `ends`, the blank-line `breaks` with their `reset`, and the functions
    `backtickPairs`, `codeSpans` and `linkTargets` (Decisions 107, 109, 110 and 124 in the
    parts that describe them).
142. **Inline text is read in the order a Markdown reader takes it** (the executor,
    2026-10-09; source: the brief's classes and the differential). In a run of inline text:
    a backslash takes the next character (`\</code>` is no end tag); a run of backticks to
    the next run of the same length is one code span, compared exactly, and a span inside a
    tag or a tag inside a span follow from the order (this replaces "where the pairing is
    not sure, everything from the first backtick to the last is one span" of Decision 109);
    what follows a link's text, `](destination "title")`, is compared exactly in its plain
    form, and where the scanner cannot read it as one plain piece the rest of the text is
    fixed and must hold no `<` and no backtick; a link label after `]`, or one that names a
    definition, is compared exactly, over line breaks too; an image's own text is compared
    exactly (it becomes an attribute) and may hold no `<`, backtick, backslash or `[`; an
    autolink is `<scheme:…>` with any scheme, or an e-mail address, as markdown-it reads
    them; a tag counts only when Markdown's own grammar reads it with the same end as the
    HTML tokenizer, and a `<` and a letter that Markdown passes on as text refuses the file;
    an element with raw text (`<script>`, `<style>`, `<textarea>`, `<title>` and the others)
    and `<svg>` or `<math>` stand only in an HTML block, where they end in the block they
    start in. An HTML block is raw: no code span, fence, autolink, escape or link is read
    inside it.
143. **A lazy continuation line is followed where readers agree on it** (the executor,
    2026-10-09; source: the brief's class "Markdown, continuation and code"). A line right
    under a block quote or a list item, without its marker or indentation, continues the
    paragraph open there, also under a `>` line that follows it (so a quoted `---` under a
    lazy line underlines the whole into a heading, the class the security run found); where
    no paragraph is open, the block quote or list item ends above it. A line that starts a
    block of its own is no lazy line. **Refused, because readers disagree:** a list marker
    that is no bullet and not number 1, or has no text, right under a paragraph of another
    list or of a block quote (markdown-it starts a list there; CommonMark's text makes it
    paragraph text); a list marker four columns in; the header row of what may be a table; a
    `>` line four columns in right under a block quote (markdown-it reads it as quoted,
    CommonMark as code); and, under a quote inside a quote, a line four columns in that
    would start a block (`>>e`, then `    <div>charlie</div>`: markdown-it ends both quotes
    there and reads the line as code, CommonMark's text makes it a lazy line; found by a
    run with a third seed, 1 in 400,000 Markdown cases, after the first soak had passed).
144. **A link reference definition is read in its plain form only** (the executor,
    2026-10-09; source: the brief's class "labels and definitions across line breaks"):
    `[label]: destination "title"` on one line. A label, destination or title on a line of
    its own, a backslash in the label, a destination in round brackets, a scheme a reader
    refuses to link, and a line below that may be its title refuse the file ("cannot read
    exactly", where four tests asserted "not recognised": Decision 148).
145. **Tables are read as markdown-it reads them** (the executor, 2026-10-09): a row with a
    `|` above a delimiter row with as many columns, to a blank line, a block start or a line
    indented four columns (which is then code, a class the differential found). The
    delimiter row and the cells a row holds beyond its columns (a reader drops them) are
    compared exactly.
146. **Doctests, `import` and `export` blocks, a quote line with a tab after its marker and
    front matter are read as the Markdown they are, and classed as before** (decision at
    review, 2026-10-09; source: the brief's fix for "Markdown, script text"). Their lines
    were left out of the text the HTML reader scans, so a `<script>` under an `export` line
    was never seen. They are now part of the document like any line, and a change to one of
    them is still code (or settings). Such a change keeps its own sentence when the file is
    also outside the subset.
147. **Two smaller rules of the Markdown reader** (the executor, 2026-10-09). A change with
    changed lines in which no rendered text changes (a list marker, white space) is no
    wording. A heading that holds `&` is compared whole instead of by its anchor: a
    character reference may spell a letter (`&DD;` and `&dd;` are two letters that lower
    case does not fold).
148. **The tests of the seventh round, and the counts** (the executor; replaces the counts in
    Decision 130). `tests/hotfix-check.test.js` gains the seventh-round table, 63 rows.
    **Rows that now refuse (tightened):** `src/pages/stray.html`, `src/pages/gt.html` and
    `src/pages/comment.html` (an end tag that closes nothing, Decision 136); and
    `docs/autolink-space.md` (a `<` and a letter that is no autolink and no tag, Decision
    142). **Rows that keep their refusal and assert another sentence:** "cannot read exactly"
    instead of "not recognised" for `docs/two-defs.md`, `docs/inline-title.md`, the two
    `docs/wrapped-ref.md` rows and `docs/wrapped-title.md` (Decision 144), `docs/angle.md` (a
    destination in angle brackets) and `docs/tick-second.md` (Decision 143); "not
    recognised" instead of "cannot read exactly" for `docs/tick-tag.md` (the changed words
    stand in a code span, which the reader now sees). **Rows that now pass, each a false
    refusal:** `src/pages/multiline.html` and `src/pages/rules.html` (Decision 139; both moved
    from the corpus's traps to its qualifying shapes, and a new trap pins `&commat;`);
    `docs/tick-cell.md` (`| ` | `rm -rf build` |` alone is no table row, markdown-it reads
    the first two backticks as the span and the changed words as plain text; a new row
    pins the refusal inside a real table); `docs/placeholder-code-line.md` (the fence ends
    the paragraph, whose end closes the placeholder for a browser; markdown-it and parse5
    read the changed words as a paragraph of their own). **The linear-time case** now judges
    each input twice and times the second run: `process.cpuUsage` also counts the threads
    that compile the reader, which made the first run of `docs/lists.md` (60,000 lines of
    three-deep lists, now really parsed) read 260 to 410 ms against a steady 80 to 120 ms;
    the bound stays 250 ms, and the case gains 23 inputs built against the new readers. The
    corpus holds 36 shapes that qualify and 213 traps, 44 of them the kept cases of removed
    formats, plus the mode change.
149. **The reviewer's corrections** (decision at review, 2026-10-09; source: the brief's Step
    5). The comment above the fifth round's first rows said the host list is "HTML, SVG,
    MathML"; it says what Decision 120 made of it. The third and fourth round's test titles
    named Sass, conditional templates, directives and generics, which those rows now assert
    are not recognised; the titles say so. The Risks row on `AuthPanel.jsx` is named in the
    entry at the top of these decisions. The corpus file itself now holds an indented Sass
    file (`src/styles/indented.sass`), a gettext file under `locales/` (`locales/de.po`) and
    a `<math>` trap (`src/pages/formula.html`).
150. **No quantifier inside a quantifier** (the executor, 2026-10-09; source: the lint rule
    `security/detect-unsafe-regex`, an error in `src/`). markdown-it's patterns for a tag,
    an e-mail autolink, a link destination and a definition repeat a group that repeats; the
    reader has each as a loop over flat patterns that only moves forward (`markdownTagEnd`,
    `autolinkEnd`, `linkTargetEnd`, `definitionLabel`), and the linear-time case holds
    inputs built against each.
151. **Markdown and plain text qualify only as a wording change in pure prose** (decision at
    review, 2026-10-09; source: the session's brief for the eighth round, after a security
    run that pushed 249,644 edits the check passed through other Markdown renderers found on
    the build machine (markdown-it in other configurations, marked, micromark with GitHub's
    extensions, pandoc, Python-Markdown) and found thousands that change a link, an attribute
    or code under at least one of them; reason: Markdown is not one language, so no reader of
    its structure can agree with every renderer, and under the owner's decision the check
    keeps only what it can read exactly). **Deleted:** the Markdown block reader
    (`markdownBlocks`), the inline reader, the heading-anchor rule, the guards for Markdown
    built as MDX (all but one, Decision 157), the autolink, block-quote, table and definition
    code, and the sending of Markdown through the HTML scanner, with every helper only they
    used. `src/lib/hotfix-check.js` had 3,543 lines before this round and has 2,952 after
    it. **In their place,** a `.md` file, or a `.txt` file under a documentation name
    (Decision 154), qualifies only when all of this holds:
    - *A plain prose line* has 0 to 3 leading spaces; holds no white space but the space;
      starts with a letter or an opening quotation mark (`"`, `'`, or a typographic opening
      quote); and holds only letters, combining marks, decimal digits, spaces, the
      punctuation `, . ; ? ! ' " -`, the typographic quotes, the en dash, the em dash and the
      ellipsis. Each of `. , ; ? !` stands before a space, a closing quote or the end of the
      line, so `example.com` and `a.b` are no prose; `-` stands only between two letters. No
      control or format character can occur, because the line is defined by what it may
      hold.
    - *A plain paragraph* is the run of non-blank lines around a changed line. Every line
      of it is a plain prose line, on both sides. An empty line, or the start or end of the
      file, bounds it; a line of spaces only counts as empty, and a line of other white
      space is a line of the paragraph that is not plain. So a paragraph right under a
      heading line, with no empty line between, does not qualify.
    - *Position.* The paragraph lies outside front matter and metadata blocks, outside code
      fences, and not below raw HTML (Decisions 152 and 153).
    - *Changed words.* Rule 6 reads them, and Decision 155 adds one marker.
    - *Nothing else in the file changes* (Decision 156).
    Every other change to such a file gets the functional plan's sentence for a change the
    check cannot read exactly (Decision 158). **Superseded by this decision:** Decision 70 in
    its parts (a), (b) and (c); Decision 81 in what it says of Markdown; Decisions 91, 100,
    108 to 111, 123 to 126 and 141 to 147; and in Decision 148 the Markdown rows and the
    corpus counts (Decision 173 holds the counts). The entry at the top of these decisions
    names the specification text it supersedes.
152. **Where the rule as worded did not hold against renderers, it is stricter** (the
    executor, 2026-10-09, under the brief's "written first and seen failing, then fixed";
    source: the differential test of Decision 159, and Python-Markdown 3.9 and pandoc 3.11
    run by hand on the build machine; reason: each case below is an edit the rule as worded
    passes and at least one renderer shows as something other than the words of a
    paragraph). None of these is looser than the brief, and each has its smallest case as a
    test, named here by its file in `tests/hotfix-check-corpus.test.js`:
    - *The first line of a changed paragraph is not indented;* the lines after it keep the
      0 to 3 spaces. `- Step one.`, an empty line, `  Old words here.`: the paragraph belongs
      to the list item (`docs/item-para.md`; markdown-it).
    - *A code fence starts at the first column, carries one word at most, and closes with a
      fence of exactly its own length.* The brief follows a fence after up to three spaces
      and with any info text that holds no backtick, and closes it at a fence at least as
      long. Found: a fence indented inside a list item ends where the item ends, before its
      closing fence (`docs/item-fence-out.md`; markdown-it); Python-Markdown reads no fence
      with two words after it (`docs/two-word-info.md`) and none whose closing fence is
      longer than its opening one (`docs/long-closer.md`); a fence right under a line that
      ends in `]:` is that definition's destination (`docs/def-fence.md`; markdown-it). Each
      of these, a fence-like line inside a metadata block, and a byte-order mark or white
      space other than a space on a fence-like line, refuses the whole file.
    - *A carriage return on its own refuses the file.* To a Markdown reader it ends a line;
      to the line count here it does not: `x`, a carriage return, three backticks
      (`docs/lone-return.md`; markdown-it).
    - *Metadata blocks.* The brief's rule (a line of three or more `-`, or `+++`, with an
      optional word after it, directly followed by a non-blank line, opens a block wherever
      it stands, up to the next `---`, `+++` or `...`, else to the end of the file) with
      three additions: groups of dashes with spaces between them open a block too (pandoc
      reads such a line as a table's border); a block opened by `+++` is closed only by
      `+++`; and a closing line that is itself directly followed by a non-blank line opens
      the next block (pandoc reads the text under it as more metadata or as a table).
    - *A first word that pandoc reads as a list marker refuses:* one letter or a Roman
      numeral, and a full stop (`a. Old words here.`, `docs/letter-marker.md`).
153. **Raw HTML above a paragraph holds it, whatever seems to close it; inside a code fence
    too** (the executor, 2026-10-09; source: the differential test, and Python-Markdown run
    by hand). The brief names twelve raw starts (`<script`, `<style`, `<pre`, `<textarea`,
    `<xmp`, `<plaintext`, `<title`, `<noscript`, `<iframe`, `<!--`, `<![CDATA[`, `<?`) and
    holds a paragraph only while one of them stands above it with no closer of its own
    between. Found: a closer can be cut off where its block quote or list item ends
    (`> <!-- a`, an empty line, `-->`: `docs/cut-comment.md`) or escaped by the Markdown
    around it, and any other element left open holds the paragraphs below it just the same
    (`<div>` and `</div>` around a paragraph, `docs/wrapped-div.md`; a custom element,
    `docs/component.md`; `<div markdown="1">`, `docs/md-in-html.md`). So every `<` that
    stands before a letter, `!`, `?` or `/` holds every line from there to the end of the
    file, front matter included, and no closer is honoured. **Two shapes hold nothing,**
    because every renderer reads them as closed where they stand: a comment alone on its
    line, from the first column, with no `<`, `>` or `--` inside it (`docs/lint.md`
    qualifies); and a tag inside a code span that opens and closes on one line, when no
    backslash, no unpaired run of backticks and no `|` inside a span stands before it in
    the same run of non-blank lines (`docs/span-tag.md` qualifies; a backslash because
    Python-Markdown reads `\<script>` as a tag, `docs/escaped-script.md`; a `|` because a
    table cell ends there, `docs/cell-span.md`). **A tag inside a code fence holds what
    follows like any other.** The reader first let it hold nothing unless it was one of the
    twelve raw starts, and `docs/fence-tag.md` qualified. Then the edits the built reader
    passes were run through Python-Markdown without its fenced-code extension: a renderer
    that knows no fences reads the fence's lines as Markdown, and a block tag left open
    there (`<div>`, `<option>One`) takes the rest of the file as raw HTML, the changed
    paragraph included (1 class in 30,000 passed edits; `docs/fence-open-tag.md`). So the
    exemption is gone, test first (commit `4cea5188` the tests, `51814ec6` the reader).
    **The cost,** said plainly: a page with one `<br>`, `<img>` or HTML example near its top
    takes no typo fix below it; on this repository's own Markdown files the fence part alone
    took 180 of the 1,450 typo fixes that passed before it (the Execution Record).
154. **Plain text qualifies only under a documentation name, and legal texts never**
    (decision at review, 2026-10-09; source: the brief, after the security run's findings in
    `.txt` files that are a list of dependencies, a template with placeholders, a list of
    exclusions and build options). A `.txt` file is documentation only when its base name,
    in any letter case, is `README`, `CHANGELOG`, `CHANGES`, `NEWS`, `HISTORY`, `AUTHORS`,
    `CONTRIBUTORS`, `NOTES`, `INSTALL` or `humans`, optionally with a language part before
    `.txt`. The executor's reading of "a language part such as `README.en.txt`": two or
    three letters, then at most two parts of two to eight letters or digits behind `-` or
    `_` (`README.pt-BR.txt`), so that `readme.backup.txt` carries no documentation name.
    Every other `.txt` gets `I do not recognise <file> as wording or a colour`, unless an
    earlier clause already names it (a dependency list, a build list, a settings text file
    such as `robots.txt`). **Legal texts:** a `.md` or `.txt` file whose base name starts,
    in any letter case, with `LICENSE`, `LICENCE`, `COPYING`, `NOTICE`, `PATENTS` or `LEGAL`
    never qualifies, whatever its change. **The clause** (the brief: "use the existing
    clause that fits; say which") is the functional plan's clause for a sensitive area,
    `<file> sits in an area named <word>, and such areas are never a hotfix`, with the word
    `license` for the two spellings of licence and `legal` for the other four; both words
    are in the functional plan's own list. The log's cause is `sensitive-area`. `LICENSE.md`
    was refused this way before (rule 5 found the word); `LICENCE.txt`, `COPYING.md`,
    `NOTICE.md` and `PATENTS.md` passed. Known over-reach, on the refusing side: the name is
    matched by its start, so `noticeboard.md` and `legalese.md` are refused as legal texts.
155. **A changed word of 7 to 40 hexadecimal digits is a risk marker in documentation**
    (decision at review, 2026-10-09; source: the brief; reason: sites link such a word as a
    commit id, so changing it changes a link). The executor's choices: capital letters
    count too, and a word is what does not touch another letter or digit, so the id in
    `abcdefa,` counts. The sentence is rule 6's own, cause `risk-marker`. What the rule
    adds in practice is small: a word with a digit in it was a risk marker already, so the
    new refusals are words of the letters `a` to `f` only. Some of those are ordinary words
    (`defaced`, `effaced`), which are then refused with a sentence about numbers and
    addresses that does not describe them; `decade` and `facade` have six letters and pass.
156. **Nothing else in the file changes** (decision at review, 2026-10-09; source: the
    brief). In a Markdown or documentation text file no line is added or removed, no line
    ending changes, a byte-order mark neither comes nor goes, and a changed line keeps its
    leading and its trailing spaces (two trailing spaces are a line break to a renderer).
    `asText` now keeps a leading byte-order mark in the text the rules read, so a change to
    it is seen in every kind of file. **Two consequences for cases this slice pinned
    before, both converted and not deleted:**
    - *The size clause.* No kind of file can now gain or lose a line and still be read, so
      a change that qualifies always changes an even number of lines, as many removed as
      added. The functional plan's scenario "More than 20 changed lines" removes 13 lines
      and adds 12 and expects `it changes 25 lines in 2 files …`; that change is now
      refused by rule 4 with the sentence for a change the check cannot read exactly,
      because rule 4 runs before the size rule (Decision 1). The size clause itself is
      pinned by changes reworded line for line: 26 lines in 2 files (case 10), 26 lines in
      1 file and 22 lines in 1 file (the corpus). The acceptance box that names this
      scenario is unticked, and the Execution Record says what would tick it again.
    - *Line endings.* Case 19's page whose every line ending changed with one word still
      passes as an HTML page with 2 changed lines counted; the same change to a Markdown
      file is refused, with 2 lines counted in the log.
157. **One guard for Markdown built as MDX is kept, against the brief's "delete the MDX
    guards"** (the executor, 2026-10-09; said in the report). A paragraph whose first line
    starts with `import ` or `export ` refuses: `import Chart from "chart"` and `export
    default Layout` are plain prose lines by their characters, and where the file is built
    as MDX they are code. The guard is one pattern. **Not guarded, so a known limit that
    this round opens:** a plain paragraph inside an MDX expression in braces that runs over
    empty lines (`{`, an empty line, `"The old words."`, an empty line, `}`) was refused
    as a setting and now passes; the main test file's rows `docs/brace-open.md` and
    `docs/brace-string.md` pin that they pass. `.mdx` files themselves stay a removed
    format.
158. **Which sentence a refused Markdown or text change gets** (decision at review,
    2026-10-09; source: the brief). (a) A `.md` file, or a `.txt` file under a documentation
    name, with any change but Decision 151's: `it changes <file> in a way the check cannot
    read exactly, and only what it can read exactly qualifies`, cause `unrecognised`. That
    sentence now also answers changes that had a sentence of their own: a changed line in
    front matter (it read "it changes a setting"), and a changed line of fenced or indented
    code or an `import` line (they read "I do not recognise"). (b) A `.txt` file under no
    documentation name: `I do not recognise <file> as wording or a colour`, cause
    `unrecognised`. (c) A legal name: the sensitive-area clause (Decision 154). (d) A
    changed word that is a risk marker: rule 6's sentence. (e) More than 20 changed lines in
    a change that passes (a) to (d): the size clause. Unchanged, and answered before the
    reader runs: a place that governs the work, a dot-folder, a build folder, a file with an
    empty side.
159. **The Markdown differential: markdown-it in four configurations, and only a paragraph's
    words may differ** (decision at review, 2026-10-09; source: the brief; it replaces the
    Markdown half of Decision 131's oracle). For every Markdown edit the check passes, the
    old and the new text are rendered by markdown-it 15.0.2 in four configurations (the
    default; `html: true`; `linkify: true`; `html: true, linkify: true, typographer: true`),
    each result is parsed by parse5 with scripting on and with scripting off, and in every
    configuration the two trees must be identical but for the data of text nodes whose
    every ancestor is `p`, `body` or `html`. Text in a list item, a block quote, a table
    cell, a heading, a link or emphasis is therefore a disagreement now, where Decision
    131's oracle allowed it. **The generator** writes the constructs of the security run's
    findings and plain paragraphs in every position, and makes eleven kinds of edit instead
    of one: a word replaced, a word deleted, a word added, a mark added, a mark removed, a
    change at a line start, lines joined, a line split, a line added, a line removed,
    leading or trailing spaces changed. The four kinds that add or remove a line may never
    pass in either format, and in Markdown neither may a change of leading or trailing
    spaces; the test asserts it. **A floor for the share that passes,** per format, about
    half of what was measured (HTML 6.0% measured, floor 3%; Markdown 18.0%, floor 9%), so
    that a reader which starts to refuse far more fails the test; every ingredient must
    still occur among the passed edits (28 for HTML, 18 for Markdown). **Not in the test:**
    Python-Markdown and pandoc are no dependencies of this repository; they were run by
    hand on the build machine against the edits the reader passes (the Execution Record),
    and that is how the class of Decision 153's last part was found after the reader was
    built. A later change to the reader is not covered by those hand runs.
160. **Only white space stands before the doctype** (decision at review, 2026-10-09; source:
    the brief's first HTML fix, from a security run with its own generator checked against
    parse5 and a headless Chromium; reason: with text or a tag before the doctype a browser
    reads the page in quirks mode, where a table nests otherwise, and the reader had not
    noticed). Pending text is now read before the doctype is examined, and a doctype after
    anything but white space refuses the file; one byte-order mark is taken off before the
    scan (Decision 166). The reader first also let a comment stand there, because a current
    browser stays in standards mode after one and the differential agrees; the brief says
    "anything other than white space or a byte-order mark", so a comment before the doctype
    now refuses the file too, test first (commit `4cea5188`, the witness and
    `src/pages/lead-comment.html`; commit `51814ec6`, the reader). Cost: a page that starts
    with a comment above its doctype takes no hotfix.
161. **No table starts among another table's rows, also through elements that stand
    between** (decision at review, 2026-10-09; source: the brief's second HTML fix).
    `<table><b><table>…</table></b><tr>…`: a browser ends the open table at the inner
    `<table>` and starts the new one beside it. Each open element now carries whether the
    nearest part of a table around it, itself included, is one that holds rows (`table`,
    `thead`, `tbody`, `tfoot`, `tr`, `colgroup`) or one that holds cell content (`td`, `th`,
    `caption`, `template`); a `<table>` start tag in the first case refuses the file.
    Decision 137 refused this only for a `<table>` directly in the rows.
162. **The content of `<noscript>` is read in place** (decision at review, 2026-10-09;
    source: the brief's third HTML fix; it replaces Decision 135's separate scan of the
    content). The content is read on the same stack of open elements, with the `<noscript>`
    holding its text, so no text inside it is wording. Its end tag must stand exactly where
    its raw text ends (the first `</noscript` after its start tag) and must find the
    `<noscript>` on top of the stack; a browser with scripting ends the element at the
    first, one without scripting at the second, and the file is refused unless both are the
    same place. The end of the raw text is looked for once per `<noscript>` that is not
    inside another one: the corpus's timing case, in its new form, caught that the first
    version looked for it at every start tag, which is quadratic for a file of nested
    `<noscript>` tags.
163. **`<rt>` and `<rp>` close an open one only directly inside the ruby** (decision at
    review, 2026-10-09; source: the brief's fourth HTML fix). `<ruby><span><rt>x<rt>y…`: a
    browser closes more than the `<rt>` on top. Where the element directly under the open
    `<rt>` or `<rp>` is not the `<ruby>`, the file is refused.
164. **Text read before the body, or directly inside a table, keeps its leading white
    space** (decision at review, 2026-10-09; source: the brief's fifth HTML fix; reason: a
    browser reads that white space into another place than the text after it, so changing
    it changes where nodes go). It holds for text read while only `html` or `head` is open,
    and for text directly inside `table`, `thead`, `tbody`, `tfoot` or `tr` (the executor
    took the four other table parts with `table`: a browser moves text out of each).
165. **Changed text holds no control or format character** (decision at review, 2026-10-09;
    source: the brief's sixth HTML fix) other than a tab, line feed, form feed or carriage
    return: an escape, a right-to-left override, a zero-width or a tag character. A reader
    does not see them, and a terminal or a browser acts on them. Sentence: not recognised.
166. **One leading byte-order mark is taken off an HTML page, and it neither comes nor
    goes** (decision at review, 2026-10-09; source: the brief's seventh HTML fix; a browser
    takes it off). The check takes one off each side before the scan, and so does the
    test's oracle; a change that adds or removes it is not recognised. Until this round the
    text decoder took the mark off before any rule read the file, so a change to it could
    not be seen; the decoder now keeps it (Decision 156).
167. **White space after the body's end is no wording** (decision at review, 2026-10-09;
    source: the brief's eighth HTML fix). Text after `</body>` or `</html>` is white space
    by Decision 138, and a browser puts it back into the body; a change to it is refused
    as not recognised.
168. **From the code reading** (decision at review, 2026-10-09; source: the brief's ninth
    item). The stale `{@link tableStart}` names `TABLE_PARTS`. The byte-order-mark strip
    that could never match stood in the Markdown reader's front-matter code (the decoder
    had already taken the mark off) and went with that reader, as did the `const level`
    that hid the `level` array and every helper only that reader used. No comment in `src/`
    or in the tests says "HTML, SVG, MathML" for the host list any more (looked for as an
    exact phrase).
169. **Every refusal rule of the HTML reader has a witness, and each witness is proven to
    bite** (decision at review, 2026-10-09; source: the brief, after a security run took
    eight rules out of the reader one at a time and the differential test did not notice:
    anything after `</body>`, any doctype, a comment holding `<!--` or `--!>` and a form in
    a form, not even at a million cases; any tag in a select, no quirks mode, HTML names
    inside `<svg>` and a followed `<frameset>`, not at the default size). The differential
    test file holds 74 documents written by hand for 59 rules; each row names its rule, and
    the check must refuse each. The proof is a scratch run, repeated on the final module:
    each rule is weakened alone in a copy of the module, the witnesses run against the
    copy, and the witnesses of that rule, and no others, must then pass. 62 weakenings; all
    bite; every witness is flipped by at least one; the brief's eight are among them. The
    Execution Record holds the table. **Two rules have no witness, and why:** a changed text
    that holds `{`, `}`, `$`, a backtick or a lone `<` is refused by rule 4 and, if rule 4
    let it go, by rule 6, whose markers include all five characters, so taking the rule out
    changes the sentence and no verdict; and the end tag of a `<noscript>` that does not
    find it on top is refused by the general rule for end tags, whose witnesses cover it.
170. **What the differential test's HTML half gained** (decision at review, 2026-10-09;
    source: the brief). The generator writes a doctype that is not first (after text, a
    tag, a comment or white space), a byte-order mark, a table inside a table through an
    inline element, the scope boundaries `object`, `marquee`, `applet` and `template`,
    pieces of `<noscript>`, a ruby, control and format characters, and the eleven kinds of
    edit of Decision 159. The share that passes has its floor (Decision 159). The sample
    that goes through the real menu route is made inside its own test, from its own seed,
    so no test depends on another's order. The file starts with a guard that fails with one
    plain sentence on a Node.js that cannot load its parsers (Decision 172).
171. **Timing cases measure a ratio** (decision at review, 2026-10-09; source: the brief;
    reason: the millisecond bounds of the earlier rounds measured the machine and its load,
    and "finding 2c" had under a millisecond to spare). Each case calls the reader in the
    test's own process, warms it once, takes the least of five runs at a size n and at 4n,
    and requires the larger to take less than 8 times as long (a linear reader gives about
    4, a quadratic one 16). n grows until one call takes 20 ms; the largest input stays at
    about 1.6 million characters, because many megabytes measure how the JavaScript engine
    handles large strings and not the reader, so a call that is still faster than 20 ms
    there is repeated until the timed run costs 20 ms, and the smaller time is never
    counted as less than 20 ms. The only absolute bound left is five seconds for one call.
    Applied to findings 2a, 2b and 2c, the script-block case, the corpus's linear-time case
    (83 inputs) and the quality agent's two timing cases. Each was proven once to catch a
    quadratic reader, by a scratch change that makes one quadratic (11 changes, all caught;
    the Execution Record).
172. **`package.json` names the Node.js the test-only parsers need** (decision at review,
    2026-10-09; source: the brief; it closes the "Not done" item of the seventh round).
    `engines.node` is `^20.19.0 || >=22.12.0`, in `package.json` and in the lock file's
    root entry. The differential test starts with a guard that says, on an older Node.js,
    in one sentence, which versions it needs and why.
173. **The tests of the eighth round, and the counts** (the executor; it replaces the
    counts of Decision 148). Every Markdown and text row of the corpus and of the main test
    file is kept and converted, none deleted; the decision is written beside each group.
    **The corpus** holds 34 shapes that qualify and 278 traps (44 of them the kept cases of
    removed formats), plus the mode change, the two property cases and the linear-time
    case: 316 tests. Eight shapes that qualified are traps now: `notes/todo.txt` (no
    documentation name), `docs/links.md` (a web address), `docs/linktext.md` (a link's
    text), `docs/list.md` (a list item), `docs/quote-prose.md` (a quote), `docs/autolink.md`
    (below an autolink), `docs/heading-caps.md` (a heading) and `docs/fence-tag.md`
    (Decision 153). Five qualify that are new: `CHANGES.txt`, `docs/readme.en.txt`,
    `docs/plain.md`, `docs/lint.md` and `docs/span-tag.md`. The brief's 27 findings of the
    Markdown security run each have a trap. **The main test file** has 102 tests; its
    eighth-round table has 168 rows that pin the rule item by item (42 qualify), then the
    three sentences and the cause words the log keeps for them. Rows of the earlier rounds
    that now pass, because the reader no longer reads the structure they were about:
    `docs/fence-below.md`, `docs/comment-open.md`, `docs/open-json.md`,
    `docs/import-mid.md`, `docs/brace-open.md` and `docs/brace-string.md`. **The
    differential test** has 5 tests: the HTML run, the Markdown run, the witnesses, 152
    documents written by hand (93 HTML, 59 Markdown) and the route sample.
174. **Known limits, recorded and not closed** (the executor, 2026-10-09; the first is the
    brief's own item).
    - *Hidden text, and text a page's script reads.* An element hidden by a stylesheet or
      an attribute, and an element whose text a script reads by its id, hold data that no
      parser can tell from wording. The check reads the page, not what its stylesheets and
      scripts do with it.
    - *A Markdown file that something else reads first.* A template engine's block tags
      around a paragraph, with empty lines between (`{% comment %}` … `{% endcomment %}`,
      `{% highlight text %}` … `{% endhighlight %}`, `{{< hint >}}` … `{{< /hint >}}`), and
      an MDX expression in braces: the paragraph is a plain paragraph to this reader and
      passes, although the engine may hide it or show it as code. The first three passed
      before this round too; the MDX expression is new (Decision 157).
    - *A renderer's extension that puts a plain paragraph in another element without
      changing what is shown:* the term of a definition list (pandoc, and Python-Markdown
      with its `extra` set, make a `dt`), a paragraph between `:::` lines (pandoc makes a
      `div` around the `p`), a word that an abbreviation definition marks. The Markdown
      oracle of Decision 159 is markdown-it, which reads each as a paragraph.
    - *A defect of one renderer on raw HTML below the paragraph.* Python-Markdown 3.9
      renders one malformed shape (a `<script>` in a block quote that holds `<!--<script>`,
      with an end tag outside the quote) in four different ways by the length of the text
      above it, so a typo fix above such a shape can change how that renderer shows the
      script below. The rule holds a paragraph below raw HTML, not above it; refusing every
      file that holds raw HTML anywhere would close this and costs 497 of the 1,270 typo
      fixes that pass on this repository's files (the Execution Record). Left to the
      session.
    - *Continuous integration cannot load the differential test.*
      `.github/workflows/tests.yml` runs every test file with `node --test` and has no step
      that installs the dependencies, so `require('parse5')` fails there. The workflow is
      not in this plan's file list; it needs a plan of its own.
    - *A stale comment outside this plan's files:* `src/lib/claim-fetcher.js` still calls
      Node.js 18 "the declared `engines` floor".

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

### Fix round 4 — the security attack and the code review (2026-10-09)

A fourth fix round, in this worktree from `51cb8267`, on the security attack's three
findings (real runs) and the code review's twelve items (reading). Every trap and shape was
written first and run on `51cb8267`: the corpus gave 33 failures, each for the stated reason
(a trap answered `checking`, a shape was refused), and the property test failed; the
round-4 branch cases, judged by the pure rules of `51cb8267`'s module, differed on 22 of 47
(the rest already held and stay as guards). Decisions 90 to 103 hold the reasons. Commit
`2a97bb84`: the module and both test files. The coordinator's item C1 (every scanner fails
closed), which arrived during the round, was handled the same way, red first on
`2a97bb84`; Decision 104 holds its reasons; commit `4cf78f79`. The specification hash after every plan edit:
`4aaf099b44f61ce1721e1bd2309bc781e49f2b8a2896c60aff3ecb22e80f8003`.

| Item | Red (on `51cb8267`) | Green |
|---|---|---|
| A1 components | `RunSql.jsx` (`SELECT name FROM users` → `SELECT pass FROM admins`), `Charge.vue` (`charge` → `refund`), `widget.html` (`<my-widget>x</my-widget>`), `Pay.svelte` answered `checking`; branch cases `<DIV>`, `<MyAction><b>…</b></MyAction>`, `<Box><p>`, `<ui.p>` passed | not recognised; `home.html` `<button>Save</button>` → `Store` still `checking`; `SlotPass.vue` (`<template #label>` inside a component) was already refused, kept as a guard |
| A2 wrapped references | `wrapped-ref.md` (`/u/profile` → `/u/delete`, and → `//evil.example/x`), `wrapped-title.md` (a title on the third line), `inline-title.md` answered `checking` | not recognised; prose after a definition (`after-def.md`) still `checking` |
| A3 variables | `flags.css` (`--enabled: green` → `red`, `--mode: red` → `lime`), `custom.css`, `vars.css`, `theme.scss`, `accent.less` answered `checking`; `width: #fff` passed; `gap.less`, `map.scss`, `font.css` answered "not recognised" | the settings clause; `width.css` not recognised; `fill`, `stroke`, `outline-color`, `border-color` changes still `checking` |
| B1 literal blocks, doctests | `literal.rst`, `expanded.rst` (`pip install requests` → `reqests`), `quoted.rst`, `doctest.rst`, `notes/doctest.txt`, `doctest.md` (an output line changed) answered `checking` | not recognised |
| B2 directives | `ifconfig.rst`, `doctest-dir.rst`, `image.rst`, `toctree.rst`, `automodule.rst`, `note-class.rst` (a prose directive's option) answered `checking` | not recognised; a `note` body and a `warning` line still `checking`; `.. note::` → `.. raw::` refused |
| B3 code elements | `code-el.md`, `code-el.html` (`<code>pip install requests</code>` → `reqests`), `Kbd.jsx`, `pre.html` (`</code>` inside `<pre>`) answered `checking` | not recognised; text after `</code>` still `checking` |
| B4 title | `titled.html` and the branch case `title.html` were refused | `checking` |
| B5 conditional templates | `Cond.vue`, `Else.vue`, `ElseIf.vue` and the branch case `Slot.vue` were refused | `checking`; `v-for`, `#x v-if` and a `v-if` inside a slot stay refused (guards) |
| B6 token stylesheets | `src/styles/tokens.css` and `design-tokens.css` "sit in an area named token" | `checking` |
| B7 reused checks | `src/hooks/README.md` in a project that is not CTOC "sits in an area named enforcement" | `checking`; in a repository whose `package.json` is named `ctoc`, refused as before. The secret guard's false positive is recorded (Decision 99), not changed |
| B8 Markdown lists | `list.md` (a paragraph at the sub-item's content column) was refused; `wide.md`, `fence-out.md`, `item-fence.md`, `item-doctest.md` answered `checking` | `list.md` `checking`; the others not recognised; `list-code.md` (code six columns in) was already refused, kept |
| B9 generics | `GenStr.tsx` (`<T,>` then `"<b>Save</b>"`), `Ext.tsx` (`<T extends object>`), `Const.tsx` (`<const T,>`) answered `checking` | not recognised; `<p>Save</p>` after a generic with `=>` inside still `checking` |
| B10 property test | 1,730 unnamed passes with the seven new characters, `handbook_` among them | green (below) |
| C1 fail closed | on `2a97bb84`, 32 of the 36 cases of the new fail-closed test differed: an unclosed `<div` before the change, an unclosed attribute quote, `<!--`, `<script>`, tag, `{{`, Vue root `<template>` and CDATA after it; in JSX an unclosed `{`, `/*`, element, string, template literal and regular expression, a string into a line break, a stray `}`; in CSS an unclosed `/*`, block and string, a stray `}`; in Markdown a change above an unclosed fence, an unclosed `---`, `{{` and `<!--`; in reStructuredText an open role span and inline literal answered `checking`; under an unclosed fence, and one side well-formed and the other not (HTML, Markdown), refused with another clause; the emptied `.rst` and `.txt` and the filled `.txt` answered `checking`. Catalogue states: a changed line inside a block scalar (`|`, `>-`), a quoted value, a flow collection, a properties continuation answered `checking`. The cut-short case failed at `docs/linktext.md` cut to `Read [the new guide](/guide` | the unreadable answer, `open` or `lost` as above, for each trap; the `.tsx` generic arrow (B9) stays not recognised (a guard); well-formed HTML, Markdown and reStructuredText beside the same constructs, a line after a block scalar and after a continuation still `checking`; the emptied and filled files not recognised |

Self-review findings fixed before the commit, each red first in a branch case: a list item
whose own text opens a fence or a doctest, a second definition right after `[a]:`, a
`.. note:: Run this::` literal, and an ordered item not numbered 1 inside a paragraph. Lint
refused two patterns as unsafe (the thematic break and the reference name); both are read by
hand now. A trailing-punctuation pattern first written for the reference words took
16,980 ms on a 200,000-character word (it rescans from every position); it is a hand loop
now, 1 ms, and the linear-time case holds that input.

The corpus: 34 shapes that qualify and 167 traps plus the mode change, 205 tests in the
file with the two property cases and the linear-time case; the main test file 98 tests (303
in the two files, all passing). The character property test: 8,487 variants (each of 23
characters at each position of each qualifying shape's changed text, and 115 inside the
role span of `docs/shortcuts.rst`); 6,110 pass, each with its character named in the table
of Decision 102; the rest refuse; 69 variants (one refused and one passing per shape) give
the same answer through the real route. The cut-short property case: 1,874 cuts, 490 pass,
each ending in closed plain text (all in documentation and catalogue files; no markup, JSX
or stylesheet cut passes). The linear-time case gained nine inputs (nested list items,
literal blocks, wrapped definitions, a 200,000 `)` word, 30,000 directive options,
unclosed type parameter lists, 30,000 open components, 50,000 variable declarations, 30,000
open YAML quotes and blocks); each is judged in 1 to 46 ms of processor time.

Coverage of `hotfix-check.js` under its own two test files: lines 99.97%, branches 97.49%,
functions 98.41%; the one line not run is the "texts differ, no changed-line group"
refusal, as before.

**The mutation sample (item B11).** Twenty one-line mutations of the module, each aimed at
one of the 58 round-3 branch cases, covering every scanner: for each, the pure rules judged
all 58 shapes (which ones flip) and the real round-3 test ran (it must fail). The module was
restored after each (the script compares nothing by hand: it rewrites one line and puts the
original text back).

| Case | Scanner | Line | Mutation | Shapes flipped | Round-3 test |
|---|---|---|---|---|---|
| `Tpl.jsx` | JavaScript, template literal | 836 | a backtick no longer closes the template | 1 (it) | fails |
| `Gen.tsx` | JavaScript, type parameters | 936 | the type parameter list is not skipped | 1 (it) | fails |
| `escaped.html` | markup, script escapes | 1080 | `<script>` inside `<!--` no longer escapes twice | 1 (it) | fails |
| `title.html` | markup, title | 1209 | the title's text runs to the end of the file | 1 (it) | fails |
| `tpl.html` | markup, template | 1199 | a `<template>` no longer counts as quiet | 1 (it) | fails |
| `After.vue` | markup, Vue | 1195 | the top-level template is not the component's markup | 2 (it, `Slot.vue`) | fails |
| `cdata.html` | markup, CDATA | 1221 | CDATA ends at the first `>` | 1 (it) | fails |
| `Each.svelte` | markup, Svelte braces | 882 | a brace expression runs to the end | 1 (it) | fails |
| `esc.po` | catalogue, Gettext | 1420 | octal escapes read no digit | 1 (it) | fails |
| `short.yaml` | catalogue, YAML | 1426 | a short `\x` escape is accepted | 1 (it) | fails |
| `ctl.json` | catalogue, JSON | 1450 | the raw value is used undecoded | 1 (it) | fails |
| `top.sass` | stylesheet, Sass | 1557 | every Sass line counts as inside a block | 1 (it) | fails |
| `space.css` | stylesheet, colour function | 1661 | the space form needs four numbers | 1 (it) | fails |
| `span.md` | Markdown, code spans | 2224 | code spans and targets are not compared | 2 (it, `full.md`) | fails |
| `open-json.md` | Markdown, front matter | 1766 | an unclosed JSON front matter is none | 1 (it) | fails |
| `sub.rst` | reStructuredText, substitution | 1938 | `.. |name| raw::` is not read past the name | 1 (it) | fails |
| `note.rst` | reStructuredText, prose directive | 1901 | `note` is no prose directive | 1 (it) | fails |
| `interp.rst` | reStructuredText, interpreted text | 2117 | interpreted text is not compared | 1 (it) | fails |
| `.vscode/notes.txt` | kinds, dot-folders | 2293 | no folder is a dot-folder | 1 (it) | fails |
| `GEMINI.local.md` | kinds, instruction files | 247 | `GEMINI*.md` is no instruction file | 1 (it) | fails |

20 of 20: the aimed-at case flips and the round-3 test fails, run on `2a97bb84` and again on
`4cf78f79` (the same result; line numbers are of `4cf78f79`, each mutation found by its
unique line text; the CDATA mutation was rewritten for the new comment reader). Where the
first failing case shows as `{"verdict"…}` the aimed-at shape expects `checking` and its
assertion message is the answer's JSON; the pure-rule judgement attributes the flip.

**The real flow (item B12)**, on `2a97bb84` and again on `4cf78f79` (the same answers), in a scratch project made by one bare menu
call and committed (`src/styles/button.css`, `locales/en.json`, `package.json` with
`"test": "node --test"`, `tests/app.test.js` with two node:test tests). A first attempt used
`"test": "node --test tests/"`, which Node 24 runs as one failing test named `tests`; the
check refused it correctly (`the existing tests fail (tests: tests)`), and the project's
command was fixed and committed. Through `node src/commands/start.js`:
- a colour change, `.save { background-color: #0a58ca; }` → `#0b5ed7`:
  `hotfix check src/styles/button.css` →
  `{ "verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next": "hotfix check --run-tests 'src/styles/button.css'", "ask": { "questions": [] }, "actions": {}}`;
  `hotfix check --run-tests src/styles/button.css` (375 ms for the whole call on `4cf78f79`) →
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "src/styles/button.css" ], "add": "git --literal-pathspecs add -- 'src/styles/button.css'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'src/styles/button.css'", "judged": [ { "path": "src/styles/button.css", "blob": "26d9708543d05ebc3bef99ddc4a2a0ff8b7eec67" } ] }, "ask": { "questions": [] }, "actions": {} }`;
- a catalogue wording change, `"Save {count} items"` → `"Store {count} items"`:
  `hotfix check locales/en.json` →
  `{ "verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next": "hotfix check --run-tests 'locales/en.json'", "ask": { "questions": [] }, "actions": {}}`;
  `hotfix check --run-tests locales/en.json` (357 ms) →
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "locales/en.json" ], "add": "git --literal-pathspecs add -- 'locales/en.json'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'locales/en.json'", "judged": [ { "path": "locales/en.json", "blob": "2d04620e18ddae077f01341157b2c1e4e6b3a435" } ] }, "ask": { "questions": [] }, "actions": {} }`;
- each call's standard output parses as one JSON document; the log's last two lines:
  `{"at":"2026-10-09T00:13:30.207Z","verdict":"hotfix","cause":null,"urgent":false,"files":1,"lines":2}`
  and `{"at":"2026-10-09T00:13:30.748Z","verdict":"hotfix","cause":null,"urgent":false,"files":1,"lines":2}`;
  no `ctoc-hotfix-` folder remains, `git worktree list --porcelain` lists one worktree, and
  `git status --porcelain` shows only `.ctoc/logs/`.

**Baselines.** `git diff f486ee4a..HEAD -- .ctoc` is empty: no baseline file changed (and
this round touches nothing under `.ctoc/`).

Step 14, on `4cf78f79` with this record, in this worktree (the main checkout's `node_modules`
linked for the run and removed after):
- `npx eslint --max-warnings 0` on the three changed files: exit 0. `npx tsc --noEmit -p .`:
  exit 0. (On `2a97bb84` alone `npm test` also passed: 13,081 tests, coverage 99.87%.)
- `npm test`:
  ```
  ℹ tests 13083 | ℹ suites 2117 | ℹ pass 13083 | ℹ fail 0 | ℹ cancelled 0 | ℹ skipped 0 | ℹ todo 0
  ℹ all files | 99.87 | 93.74 | 99.34 |
  [CTOC test-gate] coverage 99.87% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
  ```

### Fix round 5 — the owner's decision and the fixes that still apply (2026-10-09)

A fifth round, in this worktree from `6de2f75c`: the owner's decision to keep only the
formats the check reads exactly (Decision 105), the fixes that still apply in those formats
(Decisions 106 to 113) and the session's decision on colour-named custom properties, which
arrived during the round (Decision 115). Test first: commit `5c032859` holds only the two
test files, run on `6de2f75c`'s module; commit `ddb7f201` holds the module and the test
corrections named below. The specification hash after every plan edit:
`4aaf099b44f61ce1721e1bd2309bc781e49f2b8a2896c60aff3ecb22e80f8003`.

**The module.** `src/lib/hotfix-check.js`: 2,930 lines and 141,393 bytes on `6de2f75c`;
2,734 lines and 136,470 bytes now. Removed: the JavaScript and JSX reader, the TypeScript
type-parameter reader, the Vue and Svelte modes, the reStructuredText line and span readers,
the Sass indented-statement reader, the Sass and Less variable reader, the gettext entry and
escape reader. Added: the fixed host-element list, the stack of open elements, the Markdown
block reader with block quotes, the per-paragraph backtick pairing, and the colour-named
custom property reader. The formats that stay: `.html`, `.htm`; `.css`; `.json`, `.yaml`,
`.yml`, `.properties` under a catalogue folder; `.md`, `.txt`.

**Red on `6de2f75c`** (commit `5c032859`: the two test files, 329 tests, 292 pass, 37 fail):
26 corpus traps (16 of this round's traps answered `checking`; 10 kept cases of removed
formats were still read: the 8 former qualifying shapes answered `checking`, `theme.scss`
and `accent.less` answered with the settings clause), 3 new qualifying shapes refused, the
two property cases, the linear-time case (its removed-format inputs were still read), the
four table tests of rounds 3 and 4 and the edge shapes (75 converted rows), and the round-5
table. Per fix, each answer read from the round-5 table's run:

| Fix | Red (on `6de2f75c`) | Green |
|---|---|---|
| The owner's decision | the 8 qualifying shapes of removed formats answered `checking` (`Greeting.jsx`, `CancelButton.tsx`, `NameField.vue`, `Loading.svelte`, `de.po`, `guide.rst`, `shortcuts.rst`, `Cond.vue`), and so did every converted row that was a pass | each answers `I do not recognise <file> as wording or a colour`; a `.mdx` guard case answers the same (it did before) |
| 1 host elements | `<button is="run-sql">SELECT name FROM users</button>` → `SELECT pass FROM admins` and `<runsql>…</runsql>` answered `checking`; `<DIV>Save</div>` was refused | not recognised; `<DIV>…</div>` `checking`; `<P IS="x">` refused, text in `<svg><text>` and `<math><mtext>` `checking` (guards) |
| 2 the stack | `<run-sql><div></run-sql>SELECT name FROM users</div></run-sql>` in `.html` and in `.md`, and `<my-card><p>one<p>two</my-card>` before a changed paragraph, answered `checking` | `I could not read the change (<file> holds something I cannot follow)`; `<ul><li>One<li>Save</ul>`, a stray `</b>`, and text after a closed custom element still `checking`; text after `<my-widget/>` not recognised |
| 3 MDX | `Hello {eval(name)} there.` → `eval(code)`, the same over three lines, a typo beside `{name}`, a changed `import` line, a wrapped `import`, a changed `export` line answered `checking` | not recognised; prose after `<p>Hello {name}</p>` and a line starting `important` still `checking` |
| 4 backticks | a lone backtick in one paragraph, heading, list item, setext heading, before a thematic break, before a quote, in a table cell and behind a backslash, each followed by `` `rm -rf build` `` → `rm -rf dist`, answered `checking`; found while fixing, also `checking`: an item's setext heading before the span, and `pip install requests` indented right after a closed fence, a heading and a quoted code line | not recognised; a typo beside a lone backtick in another paragraph, between two list items that hold spans, and in an ordered item after another one still `checking`; a span across a lazy line, across an indented line after a quote, and beside a mid-paragraph `import` stay refused (guards, refused before) |
| 5 block quotes | `>     pip install requests` (indented), a `> ~~~` fence, a `> >>>` doctest, indented code under a list item in a quote, a nested quote, `- >     code`, a tab after `>`, a quote 40 deep, `[guide]` → `[other]` with `[other]: /u/delete` defined inside a quote and inside a list item, 20 list markers on one line answered `checking` | not recognised; a quote's prose and prose after a quoted fence still `checking` |
| 6 labels | `[guide]` → `[ẞ]` with `[SS]: /u/delete` answered `checking` | not recognised |
| 7 code elements | `<listing>pip install requests</listing>` and `<tt>…</tt>` → `reqests` answered `checking` | not recognised |
| 8 stylesheet names | a colour in `src/styles/login.css` and `payment.css` answered `checking` | `<file> sits in an area named login` / `payment`; `tokens.css` still `checking`; `src/tokens/base.css` sits in `token` (a guard) |
| 9 custom properties (Decision 115) | `--color-brand: #0b5ed7` → `#1a73e8`, `--button-colour: red` → `blue`, `--Brand-COLOR: RED` → `Transparent`, `hwb()` → `oklch()`, `lab()` → `color()`, and a colour-named property beside a real colour property were refused as a setting; `--color-a: { color: red }` → `blue` answered `checking` | `checking`; the block value cannot be followed; `--enabled: green` → `red`, `--mode: red` → `lime`, `--color-mode: dark` → `light`, `--brand-color: red` → `red url(x)`, `--color-a: var(--b)` → `var(--c)`, `!important` kept or added, a comment in the value, a renamed property, `oklch()` with two numbers and an added property stay a setting (refused before, guards); the same edit beside a changed `width` is not recognised |

The rows found while fixing (the second half of rows 4 and 5) were judged by the pure rules
of `6de2f75c`'s module, read from git into a scratch file, before their fix was kept.

**Test corrections in `ddb7f201`, each named.** Two round-4 rows changed their expected
answer, both by a fix as the session specified it: `src/pages/upper.html` (`<DIV>Save</DIV>`)
from "not recognised" to `checking` (Decision 106), and `src/pages/pre.html`
(`<pre></code>…`) from "not recognised" to the "cannot follow" sentence (Decision 107). Four
of this round's own new rows were wrong as first written and were corrected, not loosened:
an ordered item after another ordered item really starts an item (the row now uses a bullet
item, and a second row pins the pass); a row meant to change two colours added a line;
`and-more.css` adds a property, which is a setting; a backtick inside a tag's attribute
leaves the tag open (refused before and after, with that sentence). One qualifying corpus
shape of this round (`docs/tick-alone.md`) was moved to the round-5 table only, because the
cut-short case's own check reads an odd number of backticks at the end as unfinished.

**Counts.** The corpus: 30 shapes that qualify and 195 traps, 42 of them the kept cases of
removed formats, plus the mode change; 229 tests in the file. The main test file: 99 tests,
75 converted rows in four tables, and the round-5 table of 84 rows. Both files: 328 tests,
all passing. The character property test: 7,820 variants (each of 23 characters at each
position of each qualifying shape's changed text, and the 115 inside the role span of
`docs/shortcuts.rst`, all refused now); 5,087 pass, each with its character named; 59
variants give the same answer through the real route. The two colour-named custom property
shapes are in it: no inserted character passes. The cut-short property case: 1,586 cuts,
456 pass, each ending in closed plain text. The linear-time case keeps its 20 inputs (those
of removed formats now also assert the "not recognised" refusal) and gains 9: 30,000 open
elements closed by 30,000 end tags of another name, with and without a custom element
open; 20,000 differently named elements; a quote 40,000 deep; 30,000 quoted lines; 60,000
paragraphs with backticks; 20,000 lines of items and quotes; 40,000 list markers on one
line; 50,000 custom properties; each under the case's 250 ms of processor time.

Coverage of `hotfix-check.js` under its own two test files: lines 99.96%, branches 97.40%,
functions 98.22%; the one line not run is the "texts differ, no changed-line group"
refusal, as before.

**One real run of a documentation typo (item 10)**, on `ddb7f201`, in a scratch project
made for it and committed: `package.json` with `"test": "node --test"`, `tests/app.test.js`
with two node:test tests, and `docs/guide.md` (`# Guide`, `Read teh guide before you
start.`, and a quoted line ``> Run `npm test` first.``). The typo was fixed (`teh` → `the`),
and through `node src/commands/start.js`, run in the project:
- `hotfix check docs/guide.md` →
  `{ "verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next": "hotfix check --run-tests 'docs/guide.md'", "ask": { "questions": [] }, "actions": {} }`;
- `hotfix check --run-tests 'docs/guide.md'` →
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "docs/guide.md" ], "add": "git --literal-pathspecs add -- 'docs/guide.md'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'docs/guide.md'", "judged": [ { "path": "docs/guide.md", "blob": "289cb59eff66f3f1004d7100f8939808562af97e" } ] }, "ask": { "questions": [] }, "actions": {} }`;
- the answer's two commands, run from the project root with the message filled in
  (`hotfix: a typo in the guide`), made commit `10a567e`, `1 file changed, 1 insertion(+),
  1 deletion(-)`, holding `docs/guide.md` only; `git rev-parse HEAD:docs/guide.md` gives
  `289cb59eff66f3f1004d7100f8939808562af97e`, the judged id;
- the log's one line: `{"at":"2026-10-09T09:41:00.813Z","verdict":"hotfix","cause":null,"urgent":false,"files":1,"lines":2}`;
  no `ctoc-hotfix-` folder remains and `git worktree list` lists one worktree. The menu
  process also wrote its own `.ctoc/`, `CLAUDE.md` and `IRON_LOOP.md` into the scratch
  project on its first call, untracked and not in the commit.

**Not done, said plainly.** The host-element list was written from memory in this round;
corrected in the sixth round: the session has since compared it with Vue's source (225
distinct names, none extra, none missing; Decisions 106 and 129). Steps 11, 13 and 16 stay with the session's reviewers, as
before; no box is ticked in this round.

Step 14, on `ddb7f201`, in this worktree (the main checkout's `node_modules` linked for
the run and removed after), before this record was written:
- `npx eslint --max-warnings 0` on the three changed files: exit 0. `npx tsc --noEmit -p .`:
  exit 0.
- `npm test`:
  ```
  ℹ tests 13108 | ℹ suites 2117 | ℹ pass 13108 | ℹ fail 0 | ℹ cancelled 0 | ℹ skipped 0 | ℹ todo 0
  ℹ all files | 99.88 | 93.70 | 99.34 |
  [CTOC test-gate] coverage 99.88% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
  ```
- `npm test` again on `f07a9d14`, with this record in place: 13,108 tests, 13,108 pass, 0 fail,
  0 skipped; coverage 99.87%; `[CTOC test-gate] PASS`. This one line was added after that run.

### Fix round 6 — the strict HTML subset and the functional plan's sentence (2026-10-09)

A sixth round, in this worktree from `5326daae`, on a final code reading and a security
attack: the session's design decision that the HTML reader keeps to a strict subset
(Decisions 117 to 122), four Markdown items (123 to 126), two path items (127), and the
session's addition during the round, the functional plan's sentence for a change the check
cannot read exactly (128). Test first: commit `2c0387bb` holds only the two test files, run
on `5326daae`'s module; commit `048f9ffa` holds the module and the test corrections named in
Decision 130. The specification hash after every plan edit:
`4aaf099b44f61ce1721e1bd2309bc781e49f2b8a2896c60aff3ecb22e80f8003`.

**Red on `5326daae`** (commit `2c0387bb`: 349 tests, 330 pass, 19 fail): 15 corpus traps, 2
new qualifying shapes refused (`docs/autolink.md`, `docs/mdx-far.md`), the inserted-character
property case (it asserts every shape qualifies first), and the sixth-round table. Per item,
each answer read from that table's run:

| Item | Red (on `5326daae`) | Green (on `048f9ffa`) |
|---|---|---|
| 1 braces in a tag | `<button { is="run-sql" }>SELECT name FROM users</button>` → `SELECT pass FROM admins`, `{<run-sql>}<span>…</span></run-sql>`, `{<script>/*}<b></b>*/ run() /*<b></b>*/</script>` → `drop()` and `<p title="{a}">` answered `checking` | the first, second and fourth: "cannot read exactly"; the script: not recognised; `<p>{a}</p>` beside a changed paragraph still `checking`, a change beside `{a}` in one text still not recognised (guards) |
| 2 `<!`, `<?`, `</ x` | `<!--><run-sql>--><span>…`, `<!---><run-sql>-->…`, `<!-- a --!><run-sql> -->…`, a comment holding `<!--`, `<![CDATA[><run-sql>]]>…`, `<?php echo 1 ?>`, `<!x>`, `</ x>`, a legacy doctype, and in a script `<!-->`, a nested `<!--` and `--!>` answered `checking`; so did `<script>x</script ><b></b>run()<b></b></script>` → `drop()` and the same with `<style>` (found while fixing); the first shape in `.md` too | "cannot read exactly"; the two no-break-space shapes not recognised; `<!DocType HTML>` with standard comments (also `<!---->`), and a script wrapped in `<!--` … `//-->`, still `checking` |
| 3 foreign content, host names | `<svg><style><pre></style><span>pip install requests</span></pre></svg>` → `reqests`, `<unknown>`, `<set>` and `<text>` outside `<svg>`, an `<svg>` never closed, a tag inside an SVG `<title>`, HTML in `<foreignObject>`, `<g x=1/>`, and a changed SVG `<title>` answered `checking`; `<svg><text>Save</text></svg>` → `Store` and `<math><mtext>` were passes | "cannot read exactly"; a page with a closed `<svg>` (title, group, path), a `<math>` and an `<svg/>` beside a changed paragraph still `checking` |
| `<select>` (found while fixing) | `<select><style><script>/*</style>*/ run() /*<b></b>*/</script></select>` → `drop()`, and the same behind `<div><select></div>`, answered `checking` | "cannot read exactly"; options in an `<optgroup>` beside an `<hr>` still `checking` |
| an element never closed (the functional plan) | `<div>`, then `<p>Save</p>` → `Store` answered `checking` | "cannot read exactly"; `<ul><li>One<li>Save</ul>` still `checking` |
| 5 `import` / `export` | `# Title` then `import Chart from './chart'` → `'./other'`; the same wrapped over two lines; `export` after a closed fence; `import` inside a paragraph: all `checking` | not recognised; `# Title` then `important old words.` still `checking` |
| 6 autolinks, placeholders | a typo in the paragraph after `<https://…>`, beside `<http://…>` in one paragraph, after `<mailto:…>` and `<team@example.org>`, and after `Edit <file> and <your-name> then save.` was refused (not recognised) | `checking`; the autolink's own text changed stays not recognised (refused before); a change beside `<file>` in its own paragraph, after `<file>` at the start of a line or of a list item, after `<object><runsql>`, `<div>` … `<runsql>`, `</p>` … `<runsql>`, `<center>` … `<runsql>`, and with a fence but no blank line between: "cannot read exactly" (refused before, as not recognised) |
| 7 headings | `# Install` → `# Setup`, `## Getting started` → `going`, a setext heading, a heading in a quote and in a list item, `# The copy` → `# The &copy;` answered `checking` | "cannot read exactly"; `# instal the App` → `# Instal the app` (ATX and setext), `# Install.` → `# Install!` and a typo under a heading still `checking` |
| 8 a brace's reach | `Hello {name} there.`, blank line, a typo: refused, and so was a typo in the paragraph before a brace | `checking`; a typo in the same paragraph (same line, and the next line), after `{/*` left open, and after `{"}" +` stay not recognised (refused before); after `{% if a %}` and `{{ name }}` `checking` (as before) |
| 9 folded paths | a folder `ＡＵＴＨ` (full-width) holding `index.html` answered `checking` | sits in an area named `auth`; `src/état/index.html` still `checking` |
| 10 camel case | `AuthPanel.html`, `paymentForm.html`, `userTokens.html` answered `checking` | sit in `auth`, `payment`, `token`; `Author.html` and `brandTokens.css` `checking` |
| the functional plan's sentence | `<my-card>Save</my-card>` → not recognised; `--brand-color: red` → `red url(x)` and `--color-mode: dark` → `light` → the settings sentence; `border: 1px solid #0a58ca` → `#0b5ed7` and a colour in `box-shadow: 0 0 2px red` answered `checking` | "cannot read exactly"; `--enabled: green` → `red` keeps the settings sentence, `width: #fff` not recognised, `border: red`, `outline-color: red` and `color: red !important` `checking`; the whole sentence in `text` reads "I did not treat this as a hotfix because it changes src/pages/card.html in a way the check cannot read exactly, and only what it can read exactly qualifies; it goes through a normal plan, and your edits stay in place, not committed."; the log's causes for the three kinds: `unrecognised`, `unreadable`, `setting` |

**What the strict subset refuses that passed legitimately before** (each a cost, taken by
the decisions named): text inside inline `<svg>` or `<math>`; a page with a brace in any
attribute; a page with a legacy doctype, a `<?…?>` piece, a CDATA section or a comment that
holds `<!--`; a page whose inline SVG holds HTML in `<foreignObject>` or a tag inside
`<title>` or `<desc>`; a page with any tag but options inside a `<select>`; a page that
leaves an element open at its end; Markdown prose with `</3` or `<?`; a colour that is not
the whole value of its property (`border: 1px solid red`, `background: url(x) red`); a
heading whose words change.

**Counts.** The corpus: 34 shapes that qualify and 211 traps, 42 of them the kept cases of
removed formats, plus the mode change; 249 tests in the file. The main test file: 100 tests;
the sixth-round table 92 rows. Both files: 349 tests, all passing. The character property
test: 8,395 variants; 5,503 pass, each with its character named; 67 variants give the same
answer through the real route. The cut-short property case: 1,758 cuts, 459 pass, each
ending in closed plain text. The linear-time case keeps its 29 inputs and gains 13 (foreign
content 30,000 deep, 20,000 pieces of it, 40,000 never closed; 20,000 comments holding a
comment start; 40,000 comment starts; a script with 30,000 comment marks; 40,000 tags in a
`<select>`; 40,000 autolink starts; 40,000 e-mail starts; 30,000 placeholders; 30,000 braced
paragraphs and 100,000 open braces; 20,000 headings; one value of 100,000 tokens), each
under the case's 250 ms of processor time. Coverage of `hotfix-check.js` under its own two
test files: lines 99.97%, branches 97.45%, functions 98.35%; the one line not run is the
"texts differ, no changed-line group" refusal, as before. The module: 2,734 lines on
`5326daae`, 3,001 now.

**Three real runs (item 14)**, on `048f9ffa`, the last commit that changes code (the commit
after it holds this plan only), through `node src/commands/start.js`, in a scratch project
made for it and committed: `package.json` with `"test": "node --test"`, `tests/app.test.js`
with two node:test tests, `src/pages/home.html`, `src/styles/button.css`, `locales/en.json`.
- Button wording, `<button>Save</button>` → `<button>Store</button>`:
  `hotfix check src/pages/home.html` →
  `{ "verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next": "hotfix check --run-tests 'src/pages/home.html'", "ask": { "questions": [] }, "actions": {} }`;
  `hotfix check --run-tests 'src/pages/home.html'` →
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "src/pages/home.html" ], "add": "git --literal-pathspecs add -- 'src/pages/home.html'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'src/pages/home.html'", "judged": [ { "path": "src/pages/home.html", "blob": "da15ff4851987deceee519450275211f968e4b43" } ] }, "ask": { "questions": [] }, "actions": {} }`.
- A colour, `.save { background-color: #0a58ca; }` → `#0b5ed7`: the first call →
  `{ "verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next": "hotfix check --run-tests 'src/styles/button.css'", "ask": { "questions": [] }, "actions": {} }`;
  the second →
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "src/styles/button.css" ], "add": "git --literal-pathspecs add -- 'src/styles/button.css'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'src/styles/button.css'", "judged": [ { "path": "src/styles/button.css", "blob": "26d9708543d05ebc3bef99ddc4a2a0ff8b7eec67" } ] }, "ask": { "questions": [] }, "actions": {} }`.
- Catalogue wording, `"Save {count} items"` → `"Store {count} items"`: the first call →
  `{ "verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next": "hotfix check --run-tests 'locales/en.json'", "ask": { "questions": [] }, "actions": {} }`;
  the second →
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "locales/en.json" ], "add": "git --literal-pathspecs add -- 'locales/en.json'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'locales/en.json'", "judged": [ { "path": "locales/en.json", "blob": "2d04620e18ddae077f01341157b2c1e4e6b3a435" } ] }, "ask": { "questions": [] }, "actions": {} }`.
- The three were judged one after the other with all three edits in the working folder
  (each call named one file), then each answer's two commands were run from the project
  root with the message filled in: commits `02f119d` (`hotfix: the button says Store`),
  `c454fe0` (`hotfix: the button colour`) and `bd5a1bc` (`hotfix: the catalogue says
  Store`), each `1 file changed, 1 insertion(+), 1 deletion(-)` and holding its one file;
  `git rev-parse HEAD:<file>` gives the judged id for each of the three. The log's three
  lines: `{"at":"2026-10-09T10:40:30.868Z","verdict":"hotfix","cause":null,"urgent":false,"files":1,"lines":2}`
  and two more of the same shape. No `ctoc-hotfix-` folder remains and `git worktree list`
  lists one worktree. The menu process wrote its own `.ctoc/`, `CLAUDE.md` and
  `IRON_LOOP.md` into the scratch project on its first call, untracked and in no commit.

**Not done, said plainly.**
- No browser and no HTML parser was run in this round (none is installed, and the round ran
  without network): every statement here about what a browser does is the executor's
  reading of the HTML standard from memory. The lists that rest on it are `PARSER_KNOWN`,
  the elements inside `<svg>` and `<math>` where HTML is read again, and the `<select>`
  rule (Decisions 120, 121, 124); the reviewers should compare them with the standard.
- Where Markdown is built as MDX, an expression that starts on a line the reader takes for
  indented code is not seen (Decision 126); the same on `5326daae`.
- `HTMLLogin` is one word to rule 5 (Decision 127), to the letter of the session's item.
- Steps 11, 13 and 16 stay with the session's reviewers, as before; no box is ticked in this
  round.

Step 14, on `048f9ffa`, in this worktree (the main checkout's `node_modules` linked for
the run and removed after), before this record was written:
- `npx eslint --max-warnings 0` on the three changed files: exit 0. `npx tsc --noEmit -p .`:
  exit 0.
- `npm test`:
  ```
  ℹ tests 13129 | ℹ suites 2117 | ℹ pass 13129 | ℹ fail 0 | ℹ cancelled 0 | ℹ skipped 0 | ℹ todo 0
  ℹ all files | 99.87 | 93.72 | 99.34 |
  [CTOC test-gate] coverage 99.87% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
  ```
- `npm test` again on `32ec7beb`, with this record in place: 13,129 tests, 13,129 pass, 0 fail,
  0 skipped; coverage 99.87%; `[CTOC test-gate] PASS`. This one line was added after that run.

### Fix round 7 — the reader held to real parsers (2026-10-09)

A seventh round, in this worktree from `e43ea9ae`, on the session's brief after a security
run that compared generated edits with real parsers (Decision 131): a permanent
differential test, then fixes until it shows zero disagreements (Decisions 131 to 150).
Test first: commit `a4d01e69` holds the two test-only dependencies; commit `4d389b06` holds
only tests (the differential test, the seventh-round table, the corpus rows) and the
test-file count, run red on `e43ea9ae`'s module; commit `0b0ac23c` holds the module; commit
`ea55203d` holds a speed-up of the module that changes no answer (below); commit `2fd8113b`
sets the differential test's default size; commits `5eefe57b` (the test) and `48ca2c1e` (the
module) close a class that a run with a third seed found (below). The specification
hash was checked before the first plan edit and after every plan edit:
`8092f09db82bf8ac0a95ac2a1a9d04bde47c6fecde79229ae1b5ae0aa7ebd1dd`, equal to the approval
record's `content_sha256`.

**The two test-only dependencies (Step 1).** `npm install --save-dev --save-exact parse5
markdown-it` in this worktree, then `npm ci` in this worktree (the main checkout's
`node_modules` is no longer linked). `package.json` gains `"markdown-it": "15.0.2"` and
`"parse5": "8.0.1"` under `devDependencies`, the latest of each on the registry that day
(`npm view <name> version`). Their own dependencies, as installed: parse5 8.0.1 asks for
`entities ^8.0.0` (installed 8.1.0); markdown-it 15.0.2 asks for `argparse ^3.0.0` (3.0.2,
nested under markdown-it because eslint's own tree holds another major), `entities ^8.0.0`
(8.1.0, shared), `linkify-it ^6.0.0` (6.1.0), `mdurl ^2.1.0` (2.1.0), `punycode.js ^2.3.1`
(2.3.1) and `uc.micro ^3.0.0` (3.0.0). Eight packages enter `package-lock.json`; the lock
file's own version field also moved from the stale `6.9.49` to `6.14.123`, which `npm
install` does by itself. `npm audit`: nothing for the eight; it reports 2 high-severity
findings, both in packages that were there before this round and that only eslint brings
(`brace-expansion` 1.1.15 under `minimatch`, `js-yaml` 4.2.0 under `@eslint/eslintrc`);
they are named under "Not done". Nothing under `src/` requires parse5 or markdown-it (the
only `require` of either is in `tests/hotfix-check-differential.test.js`).

**Red on `e43ea9ae`** (this round's tests against that commit's module, extracted with
`git archive`). The differential test's default sample as `2fd8113b` sets it, seed 20261009:

| | edits | passed by the check | disagreements | plain visible-text edits refused |
|---|---|---|---|---|
| HTML, red | 49,837 | 5,939 | 138 | 19,826 |
| HTML, green | 49,837 | 4,773 | 0 | 20,854 |
| Markdown, red | 11,975 | 4,875 | 425 | 2,217 |
| Markdown, green | 11,975 | 2,954 | 0 | 3,713 |

(The Markdown rows were measured with the generator of `2fd8113b`. `5eefe57b` added pieces
to it; with those the fixed module passes 2,922 of the 11,975 edits and refuses 3,813 plain
ones, 0 disagreements.)

The red classes, with the count in that sample and the smallest case of each (the test cuts
a failing case down before it prints it; the cut also shortens the words):

| Kind | Class, as the real parser reads the edit | Count | Smallest case (old text; the edit replaces the word) |
|---|---|---|---|
| HTML | text inside a `<select>`, outside an option | 28 | `<select>alpha</SELECT>` |
| HTML | the text of an option without a value | 21 | `<noscript><option></noscript>charlie</y>` |
| HTML | text inside an element with an `is` attribute | 18 | `<dd>delta<body is></body></dd>` |
| HTML | style text | 18 | `<noscript><style></noscript>bravo</e>` |
| HTML | script text | 16 | `<noscript><script></noscript>delta</t>` |
| HTML | text inside a custom or unknown element | 16 | `<lin` + Kelvin sign + `>bravo</l>` |
| HTML | text inside a `<textarea>` | 11 | `<noscript><textarea></noscript>charlie<area>` |
| HTML | text inside a code element | 7 | `<noscript><code></noscript>bravo</e>` |
| HTML | no text changes at all | 3 | `<!DOCTYPE html><s><frameset></frameset><h1>bravo</s>` |
| Markdown | text inside a code element | 230 | `<code>\</code>bravo` |
| Markdown | script text | 55 | `>>>`, `<script>`, a blank line, `bravo` |
| Markdown | no text changes at all | 33 | `[`, then `f]:bravo` on the next line |
| Markdown | an attribute differs | 29 | `![delta]()` |
| Markdown | a link destination differs | 24 | `><a`, then `>href="alpha">` on the next line |
| Markdown | text inside a `<pre>` | 19 | `-`, three spaces, a tab, `bravo` |
| Markdown | text inside a `<textarea>` | 13 | `p<textarea>[](</textarea>)bravo` |
| Markdown | text inside a custom or unknown element | 12 | `<div><o@m> delta` |
| Markdown | a heading's anchor changes | 7 | `>charlie`, `]`, `>-` on three lines |
| Markdown | a comment differs | 3 | `export `, then `<!o`, a blank line, `delta` |

Also red on `e43ea9ae`: 33 edits of the documents written by hand, and 39 of the 61 rows of
the seventh-round table: 34 answered `checking` for a change the fixed module refuses, and 5
were refused that now pass (the three false refusals of Decision 139, a link that the next
link closes, and a table in a paragraph under `<!DOCTYPE html>`). The first default size
of the test, 80,000 and 25,000 cases, showed 246 of 9,547 passed HTML edits and 893 of
10,137 passed Markdown edits in disagreement; commit `4d389b06`'s message quotes those. Two classes were
found only by larger runs while fixing, and are in the documents written by hand: the
`<datalist>` case of Decision 137 (2 in 2 million HTML cases against the first version of
the fix) and the table in a paragraph without a doctype of Decision 138 (4 in 3 million).

**Green.** The default run (50,000 HTML and 12,000 Markdown cases, 16 edits through the
real menu route, 120 documents written by hand): 4.3 seconds by itself (1.4 s, 0.8 s and 2.0 s
for the three parts) and 10.3 seconds under coverage by itself; the test gate runs it under
coverage beside the suite's other files, where the first size of 80,000 and 25,000 cases
took 27 seconds (18.1 s and 8.6 s), which is why the default was made smaller. **The long soak**, `HOTFIX_DIFFERENTIAL_SOAK=1`, on `48ca2c1e`, the last commit that
changes code or tests:

| | cases | edits | passed by the check | disagreements | plain visible-text edits refused | time |
|---|---|---|---|---|---|---|
| HTML | 6,000,000 | 5,980,328 | 573,840 | 0 | 2,493,121 | 155.2 s |
| Markdown | 1,000,000 | 997,621 | 240,847 | 0 | 323,169 | 67.8 s |

(A case whose document holds none of the words has no edit.) The refused plain edits by
cause: HTML 2,154,732 "cannot read exactly", 327,042 not recognised, 6,166 "cannot read
exactly" inside a component, 5,181 risk markers; Markdown 242,490 "cannot read exactly",
49,757 not recognised, 25,577 unreadable, 5,343 settings, 2 others. Every one of the 24 HTML
and 28 Markdown ingredients occurs among the passed edits; the fewest: `<svg>` or `<math>`
in the document (2,417), a `<textarea>` (3,725), a lazy line under a list item (959), a
loose list (3,112).

**Other seeds.** The same soak had passed once before, on `2fd8113b` (5,980,328 HTML and
997,564 Markdown edits, 0 disagreements), and so had seed 7 (1,993,321 HTML and 498,789
Markdown edits). Seed 99 then found one disagreement in 399,028 Markdown edits: under
`>>e`, the line `    <div>charlie</div>` (Decision 143). It was fixed test first
(`5eefe57b`: the generator gains such lines, four documents written by hand and two rows of
the seventh-round table; red on `ea55203d`'s module), and the runs were repeated on the fixed
module, each with 0 disagreements: seed 99 with 1,197,019 Markdown edits; seeds 1 to 6 with
about 997,600 Markdown edits each (5,985,492 in all, 1,443,581 passed); seeds 1 to 3 with
about 2,990,200 HTML edits each (8,970,686 in all, 861,930 passed). So one seed's soak is
no proof: a class of one in several hundred thousand cases showed only under another seed.

**How strong the test is** (run while fixing, in a scratch copy, never committed): each
of these changes to the fixed module was put in alone and the test run again. Found, with
the first class it printed: any end tag closing anything above it (283 disagreements in
600,000 HTML cases); a link target that cannot be read as one plain piece left unfixed (88
in 300,000 Markdown cases); Markdown's own tag grammar not asked (1,150); the reader's end
tags closing whatever stands open (2,043); raw-text elements and `<svg>` allowed in inline
text (26, after the generator gained such pieces); an image's text left unchecked (16,
likewise). Not found in 600,000 HTML cases: each start-tag rule of Decision 137 removed
alone, and text after `</body>` allowed; those rules rest on the reasoning in Decisions 137
and 138 and on the documents written by hand, which hold their cases.

**Plain visible-text edits the check refuses** (counted by the test, not asserted; "plain"
means the real parsers read the edit as a change to one text node outside every holder). In
the default sample HTML went from 19,826 to 20,854 and Markdown from 2,217 to 3,713 (the
table above). The generator writes odd documents on purpose, so these are not rates for
real files. By cause, after the fix: HTML 17,950 "cannot read exactly" (the strict subset),
2,808 not recognised, 96 others; Markdown 2,775 "cannot read exactly", 582 not recognised,
297 unreadable (a fence never closed), 59 settings. A count of the reader's own
rules on 100,000 Markdown cases named what refuses most: a `<` and a letter that is no tag
for a Markdown reader, or a raw-text element inside a paragraph; an end tag that closes
nothing; something other than a placeholder left open at a paragraph's end; a link target
or an image text the reader cannot read as one plain piece; a definition that is not in
its plain form. Following lazy continuation lines (Decision 143) took the largest class
away: before it, 28% of the plain Markdown refusals in that count were lazy lines.

**What the stricter readers refuse that passed before** (each a cost, taken by the decisions
named): an HTML page with an end tag that closes nothing (`</p>` alone, `</br>`), with tags
closed in another order than opened (`<b><p>…</b>…</p>`), with a block inside a `<span>`
inside a `<p>`, with a link inside a link's `<span>`, with a table cell outside a table,
with anything but white space after `</body>`, with `<frameset>` or `<frame>` (136, 137,
138, 133); text directly in a `<select>` (134); a Markdown file with an end tag in a
paragraph for an element opened in an HTML block, with an element other than a placeholder
left open at the end of a paragraph or of the file, with a raw-text element or `<svg>`
inside a paragraph, with `<` and a letter that Markdown passes on as text, with a link
reference definition that is not on one line, with a link destination in angle brackets
beside other markup, or with one of the lines on which readers disagree (141, 142, 143,
144); an image's own text.

**Counts.** `tests/hotfix-check-differential.test.js`: 4 tests. `tests/hotfix-check.test.js`:
101 tests; the seventh-round table 63 rows. `tests/hotfix-check-corpus.test.js`: 36 shapes
that qualify, 213 traps (44 of them the kept cases of removed formats), the mode change, the
two property cases and the linear-time case: 253 tests. The three files: 358 tests, all
passing. The character property test: 8,717 variants, 5,698 pass, each with its character
named; 71 variants give the same answer through the real route. The cut-short property
case: 1,907 cuts, 389 pass, each ending in closed plain text. The linear-time case: 42 inputs
kept, 23 added; under the gate's coverage run the slowest are `docs/paragraphs.md` (190 to
210 ms), `src/styles/properties.css` (176 to 186 ms, a reader this round did not touch) and
`docs/lists.md` (173 to 178 ms), against the bound of 250 ms; on `e43ea9ae` the slowest was
`src/styles/properties.css` at 201 to 214 ms. The module: 3,001 lines on `e43ea9ae`,
3,543 now.

**The speed-up commit `ea55203d`.** The first full gated run on `0b0ac23c` failed one case
of 13,138: `docs/ticks.md` (450 runs of backticks of rising length) took 254 ms against the
250 ms bound, because every opening run searched the rest of the text for its closing run.
The runs are now read once per text and paired by length. The same measurement showed
`docs/lists.md` at 252 to 286 ms under coverage, so the block reader also skips the doctest
pass for a file without one, keeps one object per tag the reader makes, reads a bullet
without a pattern, and needs no element stack for a Markdown file without a `<`. The
differential test passes and refuses exactly the same edits before and after (57,452 of
598,017 HTML and 146,461 of 598,466 Markdown edits passed, both times).

**Two real runs (Step 6)**, on `48ca2c1e`, the last commit that changes code, through
`node src/commands/start.js`, in a scratch project made for it and committed: `package.json`
with `"test": "node --test"`, `tests/app.test.js` with two node:test tests,
`src/pages/home.html`, `src/pages/odd.html`, `notes.md`. (Both runs were first made on
`ea55203d`, with the same answers; there the hotfix was `Save` → `Store`, commit `b9c05b4`.)
- The new sentence. `src/pages/odd.html` holds `<b><p>One</b>Save</p>`; `Save` → `Store`;
  `hotfix check src/pages/odd.html` →
  `{ "verdict": "refused", "text": "I did not treat this as a hotfix because it changes src/pages/odd.html in a way the check cannot read exactly, and only what it can read exactly qualifies; it goes through a normal plan, and your edits stay in place, not committed.", "ask": { "questions": [] }, "actions": {} }`.
  The edit stayed in the file; it was then put back by hand.
- The unrelated edit. `<button>Store</button>` → `<button>Keep</button>` in
  `src/pages/home.html`, while `notes.md` is rewritten and uncommitted (`git status`: both
  ` M`). `hotfix check src/pages/home.html` →
  `{ "verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next": "hotfix check --run-tests 'src/pages/home.html'", "ask": { "questions": [] }, "actions": {} }`;
  `hotfix check --run-tests 'src/pages/home.html'` →
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "src/pages/home.html" ], "add": "git --literal-pathspecs add -- 'src/pages/home.html'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'src/pages/home.html'", "judged": [ { "path": "src/pages/home.html", "blob": "71d266162567cbd37fbcc2ce5c8975d80ac78c2d" } ] }, "ask": { "questions": [] }, "actions": {} }`.
  The answer's two commands, run from the project root with the message filled in, made
  commit `4502ace` (`hotfix: the button says Keep`): `1 file changed, 1 insertion(+), 1
  deletion(-)`, holding `src/pages/home.html` only; `git rev-parse HEAD:src/pages/home.html`
  gives the judged id `71d26616…`; `git status` after it still shows ` M notes.md`. The
  log's two lines: `{"at":"2026-10-09T13:43:44.869Z","verdict":"refused","cause":"unreadable","urgent":false,"files":0,"lines":0}`
  and `{"at":"2026-10-09T13:43:45.400Z","verdict":"hotfix","cause":null,"urgent":false,"files":1,"lines":2}`.
  `git worktree list` lists one worktree, and no `ctoc-hotfix-` folder was left in the
  system's temporary folder. The menu process wrote its own `.ctoc/`, `CLAUDE.md` and
  `IRON_LOOP.md` into the scratch project on its first call, untracked and in no commit.

**The acceptance boxes ticked in this round, each on its evidence** (the tests named are in
`tests/hotfix-check.test.js` unless another file is named, and all pass in the gated run
below):
- The colour change and the catalogue value change pass the same way: cases 2 and 3.
- Other uncommitted work is neither judged nor committed: cases 4, 29, 42 and 30; and this
  round's real run above (commit `4502ace` holds `src/pages/home.html` only, `notes.md`
  stays modified).
- The tests run in a temporary copy, which is gone afterwards: cases 43, 44, 45, 46, 53
  and 17.
- A judged file that changes during the check: case 47; the ids of a pass: "round 2,
  finding 9".
- A name the commit command cannot carry: case 48.
- Other uncommitted work behind a linked package: cases 49, 50, 51 and 52.
- The commit takes only the judged files: case 32.
- Every refusal scenario answers exactly its sentence: cases 5 to 16, and 36 for a failure
  on standard error only.
- An edited test is refused without running any test: case 13.
- The corpus: `tests/hotfix-check-corpus.test.js`, 253 tests. The box's own counts (82
  shapes) and its `.tsx` examples are superseded (the entry at the top of the decisions,
  and Decision 148): the corpus holds 36 shapes that qualify, 213 traps and the mode change,
  and the `.tsx` comparison chain and generic type are refused as files the check does not
  recognise. Every other example the box names is a row of the corpus: the 20-line and
  three-file limits and their 21-line and four-file refusals, the full-width digit and
  `WWW.`, the `*.spec.*` file, the `-diff` document, `constraints*.txt`, a `.txt` under
  `requirements`, `runtime.txt`, `CMakeLists.txt`, and edits under `.claude/` and `agents/`.
- The same change twice, line endings, backslashes, git settings: cases 18, 19, 20 and 35.
- A folder outside the repository, and a fault inside the check: cases 33 and 34.
- A run in which no test ran: cases 37 and 38, and in
  `tests/quality-agent-coverage.test.js` the cases d (a timeout), e (npm's placeholder), f, g
  and h (the Windows launch, and a missing script), j (counters on standard error) and k
  (output past 10 MiB).
- Nothing in the project is touched: case 24.
- The log: cases 28, 39, 40 and 41.
- `npm test` passes: the gated run below (lint and type check inside it, coverage 99.87%
  against the floor of 99, 0 skipped); no baseline file under `.ctoc/` changed in this round
  (`git diff e43ea9ae --name-only` names eight files, none of them a baseline); the counts in
  `CLAUDE.md` and `README.md` read 135 modules and 567 test files, which
  `tests/readme-numbers.test.js` holds to the files on disk.

**Not done, said plainly.**
- The two high-severity `npm audit` findings (`brace-expansion`, `js-yaml`) sit in eslint's
  own dependencies and were there before this round; `npm audit fix` would rewrite parts of
  the lock file that this round has no reason to touch. They need a decision of their own.
- The differential test needs Node.js 20.19 or later (or 22.12 or later), because parse5 8
  is an ECMAScript module and markdown-it 15 pulls one in; on an older Node.js the file
  fails to load. `package.json` still says `>=18`. The session should decide whether to say
  so there.
- The oracle is parse5 and markdown-it. Where another Markdown reader differs from
  markdown-it, the check follows markdown-it, except for the lines of Decision 143, which
  the executor knows to differ and refuses; no second Markdown reader was run. Site
  generators that take front matter off before they read Markdown are a second reading the
  oracle does not cover; a change to front matter is refused as before, and a tag that
  starts inside front matter and ends below it is read as markdown-it reads it.
- The edits are one word for another. An edit that adds or removes brackets, backticks or
  markers around unchanged text is covered by the character property test of the corpus,
  as before, and not by the differential test.
- Lists the executor wrote from memory in the sixth round (`PARSER_KNOWN`, the elements of
  `<svg>` and `<math>` where HTML is read again) were not compared with the standard's text;
  they are now exercised against parse5 by the generator's foreign content.
- The timing case "finding 2c" passes with under one millisecond to spare in the gated run
  (above); its bound, or the stylesheet reader's speed, needs a look before it fails a
  gated run by chance. This round changed neither.
- Steps 11, 13 and 16 stay with the session's reviewers; their boxes are not ticked.

Step 14, in this worktree with its own `node_modules` (`npm ci`):
- On `48ca2c1e`: `npx eslint . --max-warnings 0`: no finding. `npx tsc --noEmit`: exit 0.
- `npm test` on `ea55203d` (the commit before the default size was set and the third seed's
  class was closed):
  ```
  ℹ tests 13138 | ℹ suites 2117 | ℹ pass 13138 | ℹ fail 0 | ℹ cancelled 0 | ℹ skipped 0 | ℹ todo 0
  ℹ all files | 99.87 | 93.85 | 99.35 |
  ℹ   hotfix-check.js | 99.97 | 98.27 | 98.64 | 771
  [CTOC test-gate] coverage 99.87% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
  ```
  The one line of `hotfix-check.js` not run (771) is the "texts differ, no changed-line
  group" refusal, as before.
- `npm test` on `d77e0511`, the commit that holds this record (its code and tests are
  `48ca2c1e`'s); these lines were added after that run:
  ```
  ℹ tests 13138 | ℹ suites 2117 | ℹ pass 13138 | ℹ fail 0 | ℹ cancelled 0 | ℹ skipped 0 | ℹ todo 0
  ℹ all files | 99.88 | 93.87 | 99.35 |
  ℹ hotfix-check.js | 99.97 | 98.27 | 98.64 | 771
  [CTOC test-gate] coverage 99.88% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
  [CTOC test-gate] PASS
  ```
  In that run "finding 2c" measured 95.5 ms of extra processor time against its 100 ms.
- A timing case this round did not touch has almost no room: "finding 2c" (a colour change in
  a 300 KB one-line stylesheet) allows 100 ms of extra processor time and measured 99.4 ms in
  that gated run; by itself under coverage it measures 88 to 92 ms on `e43ea9ae` and 87 to
  100 ms now, and it failed at 100.5 to 107 ms in three ad-hoc runs of the three hotfix test
  files side by side. The stylesheet reader is unchanged; the case is named under "Not done".

### Fix round 8 — Markdown as pure prose, and a witness for every HTML rule (2026-10-09)

An eighth round, in this worktree from `c2c9f86d`, on the session's brief after five
area-limited reviews (three security checks with real runs, two code readings). It replaces
the Markdown reader with one rule for pure prose, fixes the HTML reader's proven
disagreements, gives every refusal rule of the HTML reader a witness, and puts the timing
cases in ratio form (Decisions 151 to 174). The specification hash was checked before the
first plan edit and after every plan edit:
`8092f09db82bf8ac0a95ac2a1a9d04bde47c6fecde79229ae1b5ae0aa7ebd1dd`, equal to the approval
record's `content_sha256`.

**The approval record and the hash.** Every record before the seventh round names the hash
`4aaf099b44f61ce1721e1bd2309bc781e49f2b8a2896c60aff3ecb22e80f8003`. The plan's `files:` list
is part of what is hashed, and commit `e43ea9ae` added three test-only files to it
(`tests/hotfix-check-differential.test.js`, `package.json`, `package-lock.json`), so the hash
became `8092f09d…`. The approval was recorded again for that hash on 2026-10-09, as a
backfilled entry: the record `.ctoc/approvals/<this plan>.json` in this worktree reads
`approved_by: human`, `approved_at: 2026-10-09T11:22:56.337Z`, `backfilled: true`, its
reason "The file list is widened by three test-only files (…): a seeded differential test
holds the hotfix check's reader to real parsers", and that `content_sha256`. This round
changed neither the file list nor the record.

**Commits, test first.** `f4d76de8` holds only tests (the corpus and main-file rows
converted, the eighth-round table, the new differential test with its witnesses and
documents written by hand, the timing cases in ratio form), run red on `c2c9f86d`'s module.
`ed84abbe` holds the module (3,543 lines and 188,158 bytes before, 2,949 lines and 160,370
bytes then), and with it a few test rows written while the proofs below were run: rows of
the eighth-round table for weakenings that the table had not noticed (a continuation line
indented five spaces, brackets taken off a line, a closing line that opens the next block,
groups of dashes, a byte-order mark beside a fence, `docs/readme.backup.txt`), the timing
inputs for `<noscript>` and deep nesting, and two witnesses taken out (Decision 169).
`e135bcce` holds the Node.js range. `4cea5188` holds the red tests for two classes found
after that, and `51814ec6` the reader's change for them (below); `55599892` a comment's
measured number. The module has 2,952 lines and 160,589 bytes now.

**Red on `c2c9f86d`** (this round's final tests against that commit's module, in a scratch
copy made with `git show`):

| Test file | Tests | Fail on `c2c9f86d` | What fails |
|---|---|---|---|
| `tests/hotfix-check-differential.test.js` | 5 | 4 | the HTML run, the Markdown run, the witnesses, the documents written by hand |
| `tests/hotfix-check-corpus.test.js` | 316 | 88 | traps that passed or got another sentence, and the two property cases |
| `tests/hotfix-check.test.js` | 102 | 10 | case 10, case 19, the edge shapes, and the tables of rounds 3 to 8 |
| `tests/quality-agent-coverage.test.js` | 66 | 0 | nothing: its two timing cases are the same cases in ratio form, proven by the quadratic changes below |

The differential test's default sample on `c2c9f86d`, seed 20261009:

| | edits | passed by the check | disagreements |
|---|---|---|---|
| HTML, red | 47,352 | 3,126 | 71 |
| HTML, green | 47,352 | 2,850 | 0 |
| Markdown, red | 11,236 | 5,873 | 1,007 |
| Markdown, green | 11,236 | 2,024 | 0 |

The 71 HTML disagreements: 70 "no text changes" and 1 "more than one text node changes"
(the smallest case the test prints for each is an edit of the kind "a change at a line
start"). Nine of the 74 witnesses pass on `c2c9f86d`, which are the things this
round's HTML fixes close: text, a tag and a comment before the doctype, white space after
the body's end, `<rt>` under another element than the ruby, a table among another table's
rows through `<b>`, a control character, and the two cases of leading white space. The
test of the documents written by hand fails there too (its message lists 19 edits).
**The Markdown number needs its reading.** The 1,007 are counted against this round's
oracle, which allows a change only in the words of a paragraph. By class, as the test names
them: text inside a list 485 (`ul` 356, `ol` 129), inside a block quote 304, inside a table
114, inside a heading 30, inside raw HTML that `html: true` lets through 29 (`div`, `details`,
`b`), inside emphasis or a link 6, inside a `<pre>` 2, and a tree of another shape 37. So most
of them are places the earlier rule allowed on purpose and this round's rule does not; the
classes that are no such place are the 2 in a `<pre>` and the 37 trees of another shape
(the smallest of those is a line split in two).

**The Markdown differential per configuration** (1,000,000 cases, seed 20261009, 936,402
edits; each configuration run alone in a scratch copy of the test):

| markdown-it | passed on `c2c9f86d` | disagreements on `c2c9f86d` | passed now | disagreements now |
|---|---|---|---|---|
| the default | 481,162 | 82,523 | 163,458 | 0 |
| `html: true` | 481,162 | 85,224 | 163,458 | 0 |
| `linkify: true` | 481,162 | 82,523 | 163,458 | 0 |
| `html: true, linkify: true, typographer: true` | 481,162 | 85,224 | 163,458 | 0 |

**Green.** The three hotfix test files: 423 tests, all passing (5, 316 and 102). The default
differential run: HTML 47,352 edits, 2,850 passed (6.0%), 0 disagreements; Markdown 11,236
edits, 2,024 passed (18.0%), 0 disagreements in all four configurations; 74 witnesses for
59 rules, all refused; of the documents written by hand, 78 of 245 HTML edits (93
documents) and 20 of 106 Markdown edits (59 documents) pass, none in disagreement; 16
edits through the real menu route, each answered as the rules answer it. The corpus's
property cases: 8,349 variants of one inserted character, 1,711 named passes, 67 checked
through the route; 1,907 cuts, 12 pass, each in closed plain text at the very end.

**The long soak**, `HOTFIX_DIFFERENTIAL_SOAK=1`, on `51814ec6`, the last commit that changes
the reader (6,000,000 HTML and 1,000,000 Markdown cases per seed; a case whose document holds
none of the words has no edit):

| seed | HTML edits | passed | disagreements | Markdown edits | passed | disagreements |
|---|---|---|---|---|---|---|
| 20261009 | 5,673,054 | 332,459 | 0 | 936,402 | 163,458 | 0 |
| 7 | 5,673,361 | 332,079 | 0 | 936,221 | 163,189 | 0 |
| 99 | 5,673,349 | 332,625 | 0 | 936,459 | 162,830 | 0 |

The same three seeds had passed on `e135bcce`, before the two late classes: 333,993,
333,703 and 334,238 HTML edits passed, the same Markdown counts, 0 disagreements; and
seeds 1 to 4 on `ed84abbe` with 2,000,000 HTML and 1,000,000 Markdown cases each.

**Renderers that are not in the test, run by hand** (scratch, on the build machine; edits
the real `ruleRefusal` passes, documents from a scratch generator that writes harder raw
HTML than the test's).
- *Before the reader was built,* on a prototype of the rule: Python-Markdown 3.9 without
  and with extensions, 30,000 passed edits; pandoc 3.11 as `markdown` and as `gfm`, 8,000.
  What they showed is in Decisions 152 and 153.
- *On the built reader* (`e135bcce`): pandoc, 8,000 passed edits in both formats, no class.
  Python-Markdown, 30,000: one class, a block tag left open inside a code fence, for
  Python-Markdown without its fenced-code extension (Decision 153). Fixed test first:
  `4cea5188` is red on `e135bcce`'s module in exactly three corpus traps
  (`docs/fence-open-tag.md`, `docs/fence-tag.md`, `src/pages/lead-comment.html`), three rows
  of the eighth-round table and one witness; `51814ec6` turns them green.
- *On the final reader* (`51814ec6`): Python-Markdown without and with extensions (`extra`,
  `meta`, `sane_lists`, `smarty`, `toc`, `admonition`, `nl2br`), six seeds of 60,000 passed
  edits each. Four seeds: no class. Two seeds: one edit each in which Python-Markdown
  renders a `<script>` that stands below the changed paragraph in another way. That is a
  defect of the renderer and not a reading: the document `> <script>`, `> <!--<script>`,
  `> </script>`, `>`, `> Bravo then's.`, `>`, `</script>` under a first paragraph of 1 to 59
  letters renders in four different ways, by the length of that paragraph alone. On three
  documents (each holds an unfinished comment, `<!-->` or `<!--`) Python-Markdown did not
  finish within five seconds; they were left out. **This is recorded as a limit, not
  closed:** the rule holds a paragraph that stands below raw HTML, and this is raw HTML
  below the paragraph. Refusing every file that holds raw HTML anywhere would close it, and
  would cost 497 of the 1,270 typo fixes that pass on this repository's files (measured,
  below); that is a decision for the session, named in the report.

**Each witness bites** (Decision 169; the scratch run on `51814ec6`: one rule weakened at a
time in a copy of the module, then every witness run against the copy; "yes" means the
witnesses named, and no other witness, pass on the weakened copy). 62 weakenings, 74
witnesses, 59 rules; every witness is flipped by at least one weakening.

| Rule | Weakened in the scratch copy | Witnesses that then pass | Bites |
|---|---|---|---|
| an attribute name cannot start with a quote, `<` or `=` | any attribute name | `<p>alpha</p><br "x">` | yes |
| an attribute value in quotes must end | an unfinished quote is let through | `<p>alpha</p><br title="x>` | yes |
| a tag must end | an unfinished tag is let through | `<p>alpha</p><br class` | yes |
| a tag holds no brace | braces in a tag are let through | `<p title="{x}">alpha</p>` | yes |
| names are lower-cased as HTML does it, the ASCII letters only | Unicode lower case | `<lin\u212a>x<p>alpha</p>` | yes |
| a comment must end | a comment may run to the end of the file | `<p>alpha</p><!-- x` | yes |
| a comment does not start with `>` | allowed | `<!--><br>--><p>alpha</p>` | yes |
| a comment does not start with `->` | allowed | `<!---><br>--><p>alpha</p>` | yes |
| a comment holds no `<!--` | a comment may hold `<!--` | `<!-- a <!-- b --><p>alpha</p>` | yes |
| a comment holds no `--!>` | a comment may hold `--!>` | `<!-- a --!> b --><p>alpha</p>` | yes |
| a comment does not end in `<!-` | allowed | `<!-- a <!---><p>alpha</p>` | yes |
| `<!`, `<?` and `</` start only a standard comment, `<!DOCTYPE html>` or an end tag | every such piece is read to its `>` | `<!x><p>alpha</p>`, `<?x?><p>alpha</p>`, `</ x><p>alpha</p>`, `<!DOCTYPE html PUBLIC "x"><p>alpha</p>` | yes |
| `<!`, `<?` and `</` start only a standard comment, `<!DOCTYPE html>` or an end tag | any doctype counts | `<!DOCTYPE html PUBLIC "x"><p>alpha</p>` | yes |
| only white space stands before the doctype | anything may stand before the doctype | `Draft<!DOCTYPE html><p>alpha</p>`, `<br><!DOCTYPE html><p>alpha</p>`, `<!-- c --><!DOCTYPE html><p>alpha</p>` | yes |
| only white space stands before the doctype | a comment may stand before the doctype | `<!-- c --><!DOCTYPE html><p>alpha</p>` | yes |
| in a script, `<!--` is not followed at once by `>` or `->` | allowed | `<script><!--> x</script><p>alpha</p>` | yes |
| in a script, a `<!--` holds no second `<!--` | allowed | `<script><!-- a <!-- b --></script><p>alpha</p>` | yes |
| in a script, a `<!--` holds no `--!>` | allowed | `<script><!-- a --!> b --></script><p>alpha</p>` | yes |
| inside svg or math an end tag closes the element on top | any end tag closes the top | `<svg><g></path></svg><p>alpha</p>` | yes |
| inside svg or math no tag stands where HTML is read again | allowed | `<svg><title><g></g></title></svg><p>alpha</p>` | yes |
| inside svg or math no HTML element name stands | HTML names inside svg | `<svg><b>x</b></svg><p>alpha</p>` | yes |
| inside svg or math no name stands that the parser treats in a way of its own | allowed | `<svg><font>x</font></svg><p>alpha</p>` | yes |
| svg or math must end | may run to the end of the file | `<p>alpha</p><svg><g>` | yes |
| inside a select only options are followed | any tag in a select | `<select><b>x</b></select><p>alpha</p>` | yes |
| after the body's end no tag follows | any tag may follow `</body>` | `<body><p>alpha</p></body><br>` | yes |
| after the body's end no text follows | any text may follow `</body>` | `<body><p>alpha</p></body>x` | yes |
| white space after the body's end is no wording | it is wording | `<html><body><p>x</p></body> </html>` | yes |
| an end tag closes the element on top, or elements that may leave their end tag out | such an end tag is ignored | `<p>alpha</p></div>`, `<p>alpha</p><span></div></span>` | yes |
| a frameset refuses the file | frameset followed | `<p>alpha</p><frameset></frameset>` | yes |
| a frame refuses the file | frame followed | `<p>alpha</p><frame></frame>` | yes |
| `html` carries no `is` attribute | allowed | `<p>alpha</p><html is="x"></html>` | yes |
| `body` carries no `is` attribute | allowed | `<p>alpha</p><body is="x"></body>` | yes |
| an item's start tag closes an open item only where that item is on top | the item is opened where it stands | `<ul><li><span>x<li>y</li></span></li></ul><p>alpha</p>`, `<dl><dt><span>x<dd>y</dd></span></dt></dl><p>alpha</p>` | yes |
| a tag that ends a paragraph closes it only where the paragraph is on top | the tag is opened where it stands | `<p><span>x<div>y</div></span></p><p>alpha</p>` | yes |
| without a doctype a table stays inside the paragraph (quirks mode) | no quirks mode | `<p is="x">x<table><tr><td>alpha</td></tr></table>` | yes |
| a link, a button or a nobr closes an open one of its own only where that is on top | opened where it stands | `<a href="/a"><span>x<a href="/b">y</a></span></a><p>alpha</p>` | yes |
| no form stands in a form | a form may stand in a form | `<form><div><form>x</form></div></form><p>alpha</p>` | yes |
| in a ruby, `rt` and `rp` do not follow an element whose end tag the parser would add | allowed | `<ruby><p>x<rt>y</rt></p></ruby><p>alpha</p>` | yes |
| in a ruby, `rb` and `rtc` are outside the subset | allowed | `<ruby><rb>x</rb></ruby><p>alpha</p>` | yes |
| `rt` and `rp` close an open one only directly inside the ruby | closed wherever it stands | `<ruby><span><rt>x<rt>y</rt></span></ruby><p>alpha</p>` | yes |
| a part of a table stands only where a table has it | anywhere | `<div><td>x</td></div><p>alpha</p>` | yes |
| no table starts among a table's rows | a table may start there | `<table><table></table></table><p>alpha</p>`, `<table><b><table></table></b><tr><td>x</td></tr></table><p>alpha</p>` | yes |
| no table starts among a table's rows | only a table directly among the rows is refused (the rule as it was) | `<table><b><table></table></b><tr><td>x</td></tr></table><p>alpha</p>` | yes |
| a column group holds columns only | any tag | `<table><colgroup><b>x</b></colgroup></table><p>alpha</p>` | yes |
| a column group holds no text | text allowed | `<table><colgroup>x</colgroup></table><p>alpha</p>` | yes |
| a noscript ends where its raw text ends | wherever its end tag stands | `<noscript><!-- </noscript> --></noscript><p>alpha</p>` | yes |
| an element must be closed | an element may stay open | `<div><p>alpha</p>`, `<p>alpha</p><style>x`, `<p>alpha</p><script>x`, `<p>alpha</p><title>x` | yes |
| nothing but text between tags may change | tokens that are no text may differ | `<p class="alpha">x</p>`, `<p>x</p>`, `<svg><text>alpha</text></svg>`, `<script>alpha()</script>` | yes |
| a group of changed lines keeps its number of lines | lines may come and go | `<p>alpha\nbravo</p>\n` | yes |
| a byte-order mark neither comes nor goes | it may | `\ufeff<p>alpha</p>` | yes |
| text inside a code element is code | it is wording | `<p><code>alpha</code></p>` | yes |
| text inside a template is not shown | it is wording | `<template><p>alpha</p></template>` | yes |
| the text of a noscript is not shown to every reader | it is wording | `<noscript>alpha</noscript>` | yes |
| an option without a value sends its text | its text is wording | `<datalist><option>alpha</option></datalist>` | yes |
| inside a select only the text of an option with a value is wording | all text there is wording | `<select>alpha<option value="x">y</option></select>` | yes |
| an element whose name is no HTML element holds its text | its text is wording | `<x-foo>alpha</x-foo>` | yes |
| an element with an `is` attribute holds its text | its text is wording | `<p is="x">alpha</p>` | yes |
| changed text holds no character reference but the plain ones | any reference | `<p>alpha &commat;</p>` | yes |
| changed text holds no control or format character | allowed | `<p>alpha\u200b</p>` | yes |
| changed text stands between two tags or comments | anywhere | `alpha<p>x</p>` | yes |
| text neither comes nor goes whole | it may | `<p>alpha<b>x</b></p>` | yes |
| text read before the body, or directly inside a table, keeps its leading white space | the leading white space may change | `<html><head> alpha</head><body></body></html>`, `<table> alpha<tr><td>x</td></tr></table>` | yes |

**The prose reader's rules, weakened one at a time** against the eighth-round table (the
same kind of scratch run, on `51814ec6`): 45 weakenings, each makes the table fail. They
are: a carriage return on its own; no line comes or goes; no line ending changes; a
fence-like line inside a metadata block; an indented fence-like line; a byte-order mark
beside a fence; other white space on a fence-like line; one word after an opening fence; a
fence under the start of a definition; a closing fence longer than the opening one; a
closing fence as long as the opening one; a closing fence holds nothing after it; a closing
fence of the same character; a code fence holds its lines; a metadata block holds its lines;
a closing line followed by text opens the next block; groups of dashes open a block; `+++`
is closed by `+++` only; a block opens only before a non-blank line; no metadata block opens
inside a fence; raw HTML above holds what follows; a tag inside a fence holds what follows;
inside a fence every tag counts, not only the twelve raw starts; a comment line holds no
`<`, `>` or `--`; a comment line starts at the first column; a comment line holds nothing
after the comment; a backslash makes the code spans unsure; a code span holds no `|`; an
unpaired backtick makes the next lines unsure; a code span closes on its own line; the first
line is not indented; a first word that is a list marker; a first word that is code; a line
has at most three leading spaces; a line starts with a letter or an opening quotation mark;
the punctuation of prose and nothing else; sentence punctuation stands before a space, and a
hyphen between letters; what is held is no prose; both sides are held to the rule; the
leading and trailing spaces of a changed line stay; a word of 7 to 40 hexadecimal digits; a
number in the changed words; plain text only under a documentation name; a language part of
two or three letters; legal texts never qualify. The first run of this, on the module of
`ed84abbe` before it was committed, left some unnoticed; the rows named under "Commits" were
written for those, and one check that no weakening could show (a second count of the lines)
was taken out of the reader.

**Each timing case still catches a quadratic reader** (Decision 171; a scratch change that
makes one reader quadratic, then the case run against it; on `51814ec6`):

| Timing case | Made quadratic | What the case then measured | Caught |
|---|---|---|---|
| finding 2a | a line-start pattern that also matches line breaks | 16 KB took 128 ms, 64 KB 2,111 ms | yes |
| finding 2b | the catalogue tail tries every split of the white space | 16 thousand spaces took 110 ms, 64 thousand 1,664 ms | yes |
| finding 2c, short declarations | the statement of each colour is searched from the top | 19 ms and 312 ms | yes |
| finding 2c, one long declaration | the value is read again for every colour | 65 ms and 1,038 ms | yes |
| the script blocks | the marks of every block are searched from the top of the file | 142 ms and 2,243 ms | yes |
| the corpus case, a stylesheet | the statement of each colour is searched from the top | 14.1 times as long | yes |
| the corpus case, the prose reader | every line looks back over the lines above it | 29.9 times as long | yes |
| the corpus case, the HTML reader | the open elements are counted again for every text | 15.4 times as long | yes |
| the corpus case, `<noscript>` | the end of the raw text is looked for at every start tag | 15.3 times as long | yes |
| the quality agent, a blank stretch | a line-start counter that also matches line breaks | 33 ms and 432 ms | yes |
| the quality agent, a run of digits | a counter that starts inside a run of digits | 29 ms and 474 ms | yes |

On the unchanged readers the cases measured between 2.9 and 5.6 times as long at four
times the size in this round's runs; the bound is 8. The fourth of the corpus rows is not
a made-up change: it is the first version of Decision 162, which the case caught at 16.0
times before it was committed.

**How often a real typo fix goes through** (the brief's measurement; on `51814ec6`). Every
tracked `.md` file of this repository: 1,627 files, 462,434 lines. For each line of
visible prose, one edit: the second letter of the first word of three or more letters that
markdown-it shows as text on that line is replaced by another letter. 226,111 edits (57,901
in paragraphs at the top level of a file, 133,581 in paragraphs inside a list or a quote,
34,629 in headings). Of 2,243 edits sampled, 2,242 change exactly one visible text in the
page markdown-it renders and nothing else (the other one is inside a web address).

| Judged | as on `c2c9f86d` | after this round | after `51814ec6` |
|---|---|---|---|
| under the file's own path | 2,378 (1.05%) | 47 (0.02%) | 37 (0.02%) |
| under a neutral path, `docs/page.md` | 103,715 (45.9%) | 1,450 (0.64%) | 1,270 (0.56%) |

Under its own path nearly every file of this repository is refused for where it lies,
before any reader runs: 217,723 edits in places that govern the work (`plans/`, `skills/`,
`agents/`, `.ctoc/`, `.claude/`, instruction files), 5,126 under `tests/`, 107 in a
sensitive area; the reader decides 3,155, and passes 37. Under a neutral path every refusal
is the sentence for a change the check cannot read exactly, and every pass is in a
paragraph at the top level: 1,270 of 57,901 (2.2%); none of the 133,581 in a list or quote,
none of the 34,629 in headings. What the rule first meets in the refused top-level
paragraphs (56,631), most frequent first: a line that starts with `*` 16,213 (a bold
lead-in or a bullet with no empty line above); a colon 8,228; a line that starts with `#`
7,980 (a heading right above, no empty line between); a backtick 9,348 (6,233 inside a
line, 3,115 at its start); a line that starts with `-` 5,353; a round bracket 3,859; a `*`
inside a line 2,402; a line that starts with `_` 757; the paragraph's place in the file
595 (raw HTML above, a metadata block, a list letter, an `import` line); punctuation with
no space after it or a hyphen not between letters 480; a slash 320. So on this
repository's own documentation the pure-prose rule lets about one typo fix in 180 through,
where the reader it replaces let through nearly one in two; that is the cost of the
decision, in the owner's number.
**HTML.** The worktree holds no `.html` file at all (none tracked, none under
`node_modules`), so there is no real file to measure. As a stand-in, said as one: each of
the 1,627 Markdown files as the page markdown-it renders from it, inside a doctype, `html`,
`head` and `body`; 279,585 edits, one per line with visible text. 195,008 pass (69.7%), the
same on `c2c9f86d`. Refused: 80,682 because the changed text holds a number, a path or an
address somewhere (for HTML rule 6 reads the whole text between two tags, not the changed
word); 2,651 not recognised; 1,244 cannot be read exactly. Such pages are regular (no
attributes with braces, no custom elements), so this is a favourable number for HTML.

**Three real runs** through `node src/commands/start.js`, in a scratch project made for it
and committed: `package.json` with `"test": "node --test"`, `tests/app.test.js` with two
node:test tests, `src/pages/home.html`, and `docs/guide.md` holding `# Guide`, an empty
line, `This tool reads teh change you made, and it answers in one sentence.`, an empty
line, `Read the [manual](https://example.com/manual) before the frist run.` Run on
`e135bcce` and again on `55599892`, the last commit that changes code or tests, with the
same answers.
- *A Markdown typo in a plain paragraph* (`teh` → `the`). `hotfix check docs/guide.md` →
  `{ "verdict": "checking", "text": "Checking the hotfix against the existing tests.", "next": "hotfix check --run-tests 'docs/guide.md'", "ask": { "questions": [] }, "actions": {} }`;
  `hotfix check --run-tests docs/guide.md` →
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "docs/guide.md" ], "add": "git --literal-pathspecs add -- 'docs/guide.md'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'docs/guide.md'", "judged": [ { "path": "docs/guide.md", "blob": "8579fcfe55a3c114d7df199e877c5b5322f13c46" } ] }, "ask": { "questions": [] }, "actions": {} }`.
  The answer's two commands, with the message filled in, made a commit (`hotfix: a typo in
  the guide`, `1 file changed, 1 insertion(+), 1 deletion(-)`) holding `docs/guide.md` only;
  `git rev-parse HEAD:docs/guide.md` gives the judged id.
- *A Markdown edit in a paragraph that holds a link* (`frist` → `first`).
  `hotfix check docs/guide.md` →
  `{ "verdict": "refused", "text": "I did not treat this as a hotfix because it changes docs/guide.md in a way the check cannot read exactly, and only what it can read exactly qualifies; it goes through a normal plan, and your edits stay in place, not committed.", "ask": { "questions": [] }, "actions": {} }`.
  `git status` still shows ` M docs/guide.md`; the edit was then put back.
- *Button wording in HTML* (`<button>Save</button>` → `<button>Store</button>`).
  `hotfix check src/pages/home.html` → the same `checking` answer with
  `"next": "hotfix check --run-tests 'src/pages/home.html'"`; the `--run-tests` call →
  `{ "verdict": "hotfix", "text": "", "tests": "2 tests passed.", "commit": { "files": [ "src/pages/home.html" ], "add": "git --literal-pathspecs add -- 'src/pages/home.html'", "message": "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'src/pages/home.html'", "judged": [ { "path": "src/pages/home.html", "blob": "963a96c162a2304fd999f2e891a9b19979ea3d09" } ] }, "ask": { "questions": [] }, "actions": {} }`;
  the commit (`hotfix: the button says Store`) holds `src/pages/home.html` only, with the
  judged id.
The log's three lines carry `hotfix` and no cause, `refused` and `unrecognised`, `hotfix`
and no cause, each with 1 file and 2 lines. `git worktree list` lists one worktree and no
`ctoc-hotfix-` folder was left in the system's temporary folder. The menu process wrote its
own `.ctoc/`, `CLAUDE.md` and `IRON_LOOP.md` into the scratch project, untracked and in no
commit.

**The acceptance boxes.**
- *Unticked in this round:* "Every refusal scenario of the functional plan …". Its item
  "more than 20 lines" is no longer true as the functional plan writes the scenario: a
  change that removes 13 lines and adds 12 is refused, but with the sentence for a change
  the check cannot read exactly, not with `it changes 25 lines in 2 files …` (Decision
  156). Every other scenario the box names answers its sentence (cases 5 to 9 and 11 to
  16, and 36). Two things would make it true again, and neither is the executor's to
  choose: the functional plan's scenario takes numbers a change can still have (13 lines
  reworded in 2 files, 26 lines, which case 10 pins today); or the size rule answers
  before the sentence for a change that cannot be read exactly, which changes the rule
  order of Decision 1.
- *Kept, on this round's evidence* (all in the gated runs below): the button wording
  (case 1, and the third real run); the corpus box (`tests/hotfix-check-corpus.test.js`,
  316 tests; its own counts and its `.tsx` examples stay superseded, the counts are in
  Decision 173; of the examples it names, 21 changed lines are still refused, now with the
  sentence for a change the check cannot read exactly, and every other one is a row that
  asserts what the box says); the box on determinism, line endings and git settings (cases
  18, 19, 20 and 35; case 19's passing example is an HTML page now, Decision 156); the
  documentation-only change in a project with no test command (case 17, whose
  documentation change is a plain paragraph); `npm test` (below; no baseline file under
  `.ctoc/` changed in this round, and no file was added, so the counts in `CLAUDE.md` and
  `README.md` stand).
- Every other box rests on tests this round did not change in what they assert.

**Not done, said plainly.**
- The functional plan's size scenario (the unticked box above).
- The limit of the Python-Markdown defect above, and the other limits of Decision 174: a
  Markdown file that a template engine or MDX reads first; hidden text and text a script
  reads; `.github/workflows/tests.yml` installs nothing, so the differential test cannot
  load in continuous integration; the stale comment in `src/lib/claim-fetcher.js`.
- One guard for MDX is kept against the brief (Decision 157), and a comment before the
  doctype was first allowed against the brief and is now refused (Decision 160).
- No real `.html` file was measured, because the worktree holds none.
- The two high-severity `npm audit` findings of the seventh round's record stand; this round
  touched no dependency.
- Two `pandoc` processes that this round did not start (their arguments, `--wrap=none
  --no-highlight`, occur in none of its scripts) ran at full load on the build machine
  through the second half of the round; they were left alone.
- Stylesheets, catalogues and paths belong to a later round and were not started.
- Steps 11, 13 and 16 stay with the session's reviewers; their boxes are not ticked.

Step 14, in this worktree with its own `node_modules`:
- `npx eslint . --max-warnings 0`: no finding. `npx tsc --noEmit`: exit 0.
- `npm test` on `55599892`, the last commit that changes code or tests, before this record
  was written: `ℹ tests 13203 | ℹ suites 2117 | ℹ pass 13203 | ℹ fail 0 | ℹ cancelled 0 |
  ℹ skipped 0 | ℹ todo 0`; `all files | 99.87 | 93.77 | 99.37`; `hotfix-check.js | 99.97 |
  98.48 | 98.86 | 797`; `[CTOC test-gate] coverage 99.87% (threshold 99%), skipped 0, failed
  0`; `[CTOC test-gate] PASS`. The one line of `hotfix-check.js` not run (797) is the
  "texts differ, no changed-line group" refusal, as before.

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
