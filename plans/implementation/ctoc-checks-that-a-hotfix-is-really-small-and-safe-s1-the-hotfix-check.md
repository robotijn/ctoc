---
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
  # Ratchet, not counted toward the slice size: this slice creates one library module and
  # two test files, which move the module and test-file counts in CLAUDE.md.
  - "CLAUDE.md"
---

# The hotfix check: CTOC judges a change called a hotfix and says why in one sentence

Slice 1 of 4 of `plans/functional/ctoc-checks-that-a-hotfix-is-really-small-and-safe.md`.
Slice 2 makes every passing check leave a record and has the one loaded hook refuse a labelled
commit without one; slice 3 adds the urgent path and its review; slice 4 tells every session
when to run the check. This slice builds the check itself and the menu route that runs it.

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
   Reads the change and runs every rule except the tests. On a refusal it answers with the one
   sentence. When every other rule holds it answers `verdict: 'checking'`, `text: 'Checking
   the hotfix against the existing tests.'` (the one status line) and `next`, the exact route
   to run for the test run: `hotfix check --run-tests '<file>' ...`.
2. `hotfix check --run-tests [<file> ...]` — the test run, which the session runs as
   background shell work. It runs every rule again (cheap, deterministic) and then the tests,
   and answers the pass or the refusal.

A pass answers `verdict: 'hotfix'`, `text: ''` (the owner sees nothing extra) and
`commit: { files, add, message }`: `files` the display paths, `add` the exact staging command
`git add -- '<file>' ...` (each path single-quoted, a `'` inside written as `'\''`), and
`message` the form of the commit, `git commit -m 'hotfix: <what changed>'`. A refusal answers
`verdict: 'refused'` and `text` = the sentence. Every answer carries `ask: { questions: [] }`
and `actions: {}`. When the first call can already decide everything (a documentation-only
change in a project with no test command, so rule 8 runs nothing) it answers the pass
directly.

The two calls follow the functional plan: the rules that read the change answer instantly,
and the test run is background work with one status line while it runs.

### The change that is judged (rule 1)

Every git call goes through one internal helper: `spawnSync('git', ['-c',
'core.quotepath=false', ...args], { cwd, env: { ...process.env, LC_ALL: 'C', GIT_PAGER: 'cat',
GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 64 MiB, windowsHide: true })`,
output read as a buffer. Git runs from the repository's top level
(`rev-parse --show-toplevel`); paths given to git and kept internally are top-level-relative
with `/`; paths shown to the owner are project-root-relative with `/`.

Reading, in order; the first failure is the clause `I could not read the change (<why>)`:

| Situation | `<why>` |
|---|---|
| `git` cannot be started (spawn `ENOENT`) | `git is not installed` |
| `rev-parse --show-toplevel` fails | `this folder is not a git repository` |
| `rev-parse --verify -q HEAD^{commit}` fails | `this folder has no commit to compare with` |
| a named file resolves outside the project root (after `\` is read as `/` and `..` resolved) | `<file> is outside this project` |
| a named file has no change git would commit (unchanged, or ignored) | `<file> holds no change that git would commit` |
| nothing named and nothing changed | `nothing has changed since the last commit` |
| a changed file's old or new content holds a zero byte or is not valid UTF-8 (`TextDecoder('utf-8', { fatal: true })`) | `<file> is not text` |
| anything throws inside the check | `the check stopped: <message, control characters removed, at most 200 characters>` |

The changed set: `diff HEAD --raw -z --no-renames --no-abbrev --no-ext-diff --no-textconv
[-- <files>]` (status, old and new mode, old blob) plus `ls-files --others --exclude-standard -z
[-- <files>]` (new files). When no file is named, paths under `.ctoc/` are left out: they are
CTOC's own state and records, never the owner's change. Old content comes from `cat-file blob
<old blob>`, new content from the working tree; a symbolic link (mode `120000`) is not read as
text. Changed lines come from `diff HEAD -U0 --no-color --no-ext-diff --no-textconv
--no-renames --ignore-cr-at-eol -- <file>`, parsed into hunks of removed and added lines (the
`\ No newline at end of file` marker skipped, a trailing carriage return stripped); a new file
counts every line as added.

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
  base name matching `*.test.*` or `*.spec.*` → `it changes a test (<file>)`.
- **Rule 4 — only kinds that qualify** (next section).
- **Rule 5 — not in a sensitive area.** The display path split at every character that is not
  a letter (`/[^A-Za-z]+/`), lower-cased; a part equal to one of the 34 words of the functional
  plan → `<file> sits in an area named <word>, and such areas are never a hotfix`.
- **Rule 6 — no risk marker in wording.** For markup and catalogue files, the whole old and new
  text run or value (placeholders removed first) holds a digit, a currency symbol (`\p{Sc}`),
  `%`, `://`, `www.`, `@`, `<`, `>`, `{`, `}`, `$` or a backtick → `the wording in <file>
  contains a number, a price, a web address or an e-mail address`.
- **Rule 3 — size.** n = removed plus added lines over all files, m = files; n > 20 or m > 3 →
  `it changes <n> lines in <m> files and a hotfix is at most 20 lines in at most 3 files`
  (`1 line`, `1 file` in the singular).
- **Rule 8 — the existing tests pass** (section below).

### Rule 4 — the four kinds, and everything else

A file is placed in the first kind that fits:

1. **Documentation**: `.md`, `.txt`, `.rst`, unless its base name is `CLAUDE.md` (any letter
   case) or any folder in its path is `.claude`, `.ctoc`, `agents`, `skills`, `commands` or
   `plans`, and unless it is a dependency list (below). Any wording edit qualifies.
2. **Markup**: `.html`, `.htm`, `.jsx`, `.tsx`, `.vue`, `.svelte`. Every hunk must remove and add
   the same number of lines, and each old/new line pair must be a text edit: the parts that
   differ lie wholly after a `>` and before the next `<` on the same line; that `>` closes a tag
   opened on the same line (the nearest `<` before it is followed by a letter or `/` and a
   letter), and that `<` opens a tag (followed by a letter or `/`); the whole text run between
   them, old and new, holds no `{`, `}`, `$`, backtick or `&`, and in `.jsx` and `.tsx` also no
   `(`, `)`, `;`, `=`, `"` or `'`; and the line lies outside every `<script…>…</script>`,
   `<style…>…</style>` and `<textarea…>…</textarea>` block of the old and the new file (letter
   case ignored; an unclosed block runs to the end of the file). Anything else →
   `I do not recognise <file> as wording or a colour`.
3. **Message catalogue**: `.json`, `.yaml`, `.yml`, `.po`, `.properties` with a folder named
   `locales`, `locale`, `i18n`, `lang`, `translations` or `messages` in the path. Equal hunk
   sizes; each line pair has the same key part and differs only in its value: JSON
   `"key": "value",`; YAML `key: value` with a quoted or plain value that does not start with
   `[`, `{`, `&`, `*`, `!`, `|`, `>`, `%`, `@` or a backtick and holds no ` #`; Gettext
   `msgstr "value"` (also `msgstr[n]`); properties `key=value` or `key: value` without a
   trailing `\`. The placeholders — `{{name}}`, `{name}` and `%s`, `%d`, `%i`, `%f`, `%@`,
   `%1$s` forms — are the same multiset before and after. Anything else →
   `I do not recognise <file> as wording or a colour`.
4. **Colour**: `.css`, `.scss`, `.sass`, `.less`. Equal hunk sizes; in each line pair, with
   every colour token replaced by one marker, the two lines are identical, at least one token
   differs, and every changed token stands in a declaration value: the text between the last
   `{` or `;` before it (or the line start) and the token matches
   `^\s*(--[\w-]+|\$[\w-]+|@[\w-]+|[A-Za-z-]+)\s*:[^;{}]*$`. A colour token is `#` with 3, 4, 6
   or 8 hexadecimal digits, `rgb(…)`, `rgba(…)`, `hsl(…)`, `hsla(…)` (no nested brackets), or
   one of the 148 named colours of CSS Color Module Level 4 or `transparent` (letter case
   ignored), standing at the line start or after whitespace, `:`, `,` or `(`, and before the
   line end, whitespace, `;`, `,`, `)`, `}` or `!`. Anything else →
   `I do not recognise <file> as wording or a colour`.

A file in none of the four gets its clause from the first of these that fits:

| Kind | How it is recognised | Clause |
|---|---|---|
| dependency list or lock file | base name `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `requirements*.txt`, `Pipfile`, `Pipfile.lock`, `pyproject.toml`, `poetry.lock`, `uv.lock`, `go.mod`, `go.sum`, `Cargo.toml`, `Cargo.lock`, `Gemfile`, `Gemfile.lock`, `composer.json`, `composer.lock`, `pom.xml` | `it changes the dependencies in <file>` |
| database file | `.sql`, or a folder `migrations`, `migration` or `migrate` in the path | `it changes stored data in <file>` |
| build or continuous-integration file | base name `Dockerfile` (or `Dockerfile.*`), `Makefile`, `Jenkinsfile`, `Procfile`, `Vagrantfile`, `.gitlab-ci.yml`, `docker-compose.yml`/`.yaml`, `compose.yml`/`.yaml`; `.gradle` and `.gradle.kts`; a `webpack`, `vite`, `rollup`, `esbuild`, `babel`, `tsup` or `turbo` `.config.*` file; a folder `.github`, `.gitlab`, `.circleci` or `.buildkite` in the path | `it changes how the project is built or shipped in <file>` |
| settings file | `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.conf`, `.cfg`, `.properties`, `.xml`, `.plist`, or a base name `.env` or `.env.*` | `it changes a setting in <file>, and settings changes are a common cause of outages` |
| program code | `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.kt`, `.kts`, `.swift`, `.c`, `.h`, `.cc`, `.cpp`, `.hpp`, `.cs`, `.php`, `.sh`, `.bash`, `.zsh`, `.ps1`, `.bat`, `.cmd`, `.lua`, `.scala`, `.dart`, `.ex`, `.exs`, `.erl`, `.clj`, `.pl`, `.r`, `.m`, `.mm`, `.sol` | when every hunk has equal sizes and every line pair is identical once the inside of every `"…"`, `'…'` and `` `…` `` literal (backslash escapes honoured; a backtick literal holding `${` is not emptied) is emptied: `it changes text inside program code in <file>, and no check can tell whether people read that text or the program depends on it`; otherwise `it changes program logic in <file>, and only wording and colours qualify` |
| anything else | — | `I do not recognise <file> as wording or a colour` |

### Rule 8 — the existing tests

Runs only in the `--run-tests` call, and only after rules 1 to 7 pass.

- `tools = require('./tool-detector').detectTools(root)`. The project has a test command when
  some language entry carries `test`. Without one: a documentation-only change passes (the
  answer says no test command, documentation only); anything else →
  `no test ran, so nothing confirms the change`.
- With one, inside one internal wrapper that sets the working directory to the project root
  and keeps the quality agent's progress lines (`console.log`) off the menu's JSON, restoring
  both in `finally`: `affected = require('./coverage-map').findAffectedTests(<absolute changed
  paths>)`; when `!affected.requiresFullSuite && affected.tests.length > 0`,
  `runSpecificTests(tools, affected.tests)`, otherwise `await runFullTests(tools)` (both from
  `src/lib/quality-agent.js`, which already reads node:test, jest and mocha counters and fails
  closed on an unreadable one).
- `passed === true` and `passCount > 0` → the rule holds. `passed === true` with `passCount`
  0, or `undetermined` → `no test ran, so nothing confirms the change`. `passed === false` →
  `the existing tests fail (<first failing test>)`.
- `<first failing test>` is read from the run's output with ANSI codes removed: the name from
  the first TAP `not ok N - <name>` line (the innermost failure comes first), the spec
  reporter's first `✖ <name>` line that is not the `failing tests:` heading, or jest's first
  `● <name>`; the file from the first `location: '<path>:<line>:<col>'` (TAP), `test at
  <path>:<line>:<col>` (spec) or `FAIL <path>` (jest) line. Shown as `<file>: <name>` with the
  file project-relative and `/`-separated, or whichever of the two was read, or `the test
  command reported a failure` when neither was.

`hotfixRoute` is `async` because `runFullTests` is; it never rejects (everything inside is
caught into the "check stopped" clause), so a fault can never read as a pass.

### Files

**`src/lib/hotfix-check.js` (CREATE).** One export, `hotfixRoute(subArgs, root) →
Promise<screen>`: `subArgs[0] === 'check'` runs the check with `--run-tests` as a flag and every
other argument a file; an unknown or missing sub-command, or an unknown `--` option, answers
`{ ok: false, text: 'Unknown hotfix command: <x>. Use: hotfix check [--run-tests] [<file> ...]',
ask: { questions: [] }, actions: {} }`. Everything else is internal: the git helper, the
change reader, the rules, the kind tables, the sentence builders and the test-run wrapper.
Nothing else is exported (the dead-export fence counts a test as no caller). Files through
`./safe-fs`; paths through `path`; no new dependency.

**`src/lib/menu-screens.js` (MODIFY).** `route`: `case 'hotfix': return
hotfixCheck.hotfixRoute(args.slice(1), getProjectPath(projectPath));` with
`const hotfixCheck = require('./hotfix-check');` among the requires.

**`src/commands/start.js` (MODIFY).** In `main`'s argument branch, print the route's result
once it settles: `Promise.resolve(route(splitArgs, app.projectPath, { liveAgentIds })).then(
(result) => { console.log(JSON.stringify(result, null, 2)); });`. A synchronous route throws
exactly as before (the call happens before `Promise.resolve`), and every other route's output
is unchanged.

### Wiring — the live call site

`hotfix-check.hotfixRoute` is called by `menu-screens.route` (`case 'hotfix'`), which
`src/commands/start.js` calls for every menu call with arguments — the menu's own entry, the
same root every other route hangs from. A session reaches it with
`node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" hotfix check <files>`. Slice 4 writes the
instruction that tells every session when to make that call.

## Acceptance criteria

- [ ] A one-word wording change in `src/pages/home.html` (`<button>Save</button>` →
  `<button>Store</button>`) in a project whose tests pass: the first call answers
  `verdict: 'checking'`, `text` exactly `Checking the hotfix against the existing tests.` and
  `next` exactly `hotfix check --run-tests 'src/pages/home.html'`; the `--run-tests` call
  answers `verdict: 'hotfix'`, `text: ''`, `commit.files` `['src/pages/home.html']`,
  `commit.add` `git add -- 'src/pages/home.html'`.
- [ ] The colour change in `src/styles/button.css` and the catalogue value change in
  `locales/en.json` (same key, same `{count}`) pass the same way.
- [ ] With `notes.md` also modified and not named, the screens for `src/pages/home.html` are
  identical to the screens without `notes.md`, and `commit.add` names `src/pages/home.html`
  only.
- [ ] Every refusal scenario of the functional plan that this slice covers (program logic,
  setting, text inside code, price, sensitive area, more than 20 lines, new file, failing test,
  edited test, no test ran, unreadable change, unrecognised file) answers exactly the sentence
  with the clause from the functional plan's table; the failing-test clause reads
  `the existing tests fail (tests/home.test.js: shows Save)`.
- [ ] An edited test is refused without running any test.
- [ ] The corpus — 67 edit shapes (22 that qualify, 45 traps) plus the mode-change case — gives
  exactly the expected verdict and clause for every shape.
- [ ] The same change checked twice gives byte-identical answers; Windows line endings do not
  count as changed lines; a named path written with `\` gives the same answer as with `/`.
- [ ] Through the real menu process (`node src/commands/start.js hotfix check …` in a
  temporary project), standard output is exactly one JSON document for both calls — no test
  runner line leaks into it.
- [ ] No refusal changes, stages, stashes or deletes any file in the project (the working tree
  and the index are byte-identical before and after).
- [ ] `npm test` passes: lint, typecheck, every test, coverage at or above the floor in
  `.ctoc/coverage-baseline.json`, 0 skipped; the dead-export and reachability fences hold with
  no baseline change; CLAUDE.md's module and test-file counts are updated.

## Risks

| Risk | Mitigation |
|---|---|
| The classifier passes a code change as text (template expressions, script, style and text-area blocks, entities, a text node crossing a tag, a multi-line text node, JavaScript comparisons in `.jsx`/`.tsx`) | The 45 traps are written before the classifier; every shape not positively recognised is refused; the `.jsx`/`.tsx` text run forbids code punctuation |
| The test run is slow on a large suite (this repository's whole suite runs, because nothing maps a `.html` change to a test) | The run is the second, background call with one status line; the measured duration of the first live use goes into the build record (no figure is invented here) |
| Git settings change the answer (line-ending conversion, pager, colour, rename guessing, external diff, text conversion) | Fixed arguments and environment in the one git helper; `--ignore-cr-at-eol`; the determinism case runs the same change twice, with `core.autocrlf=true` set in the temporary repository |
| A sensitive word hides inside a joined name (`AuthPanel.jsx` splits into `AuthPanel`, which is not `auth`) | The functional plan's rule splits only at characters that are not letters; this slice follows it to the letter and names the gap here; widening it is a normal plan |
| A colour that passes is hard to read on its background | Residual, as the functional plan states; not computed |
| Changing the shared `console.log` and working directory during the test run affects something else in the process | The menu process is single-purpose and exits after one answer; both are restored in `finally`; a test asserts the working directory and `console.log` are the originals after a run |

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
   refused, as a governing place).
7. **"Anything under `agents/`, `skills/`, `commands/`, `plans/`, `.claude/`, `.ctoc/`" means a
   folder of that name anywhere in the path**, not only at the root, so this repository's own
   `src/commands/start.md` (the menu's instructions) is never treated as documentation.
8. **In `.jsx` and `.tsx` the text run also may not hold `(`, `)`, `;`, `=`, `"` or `'`**, because
   those files mix code and markup on one line and a line-local reading cannot otherwise tell
   `a > b ? x : y < z` from text. Visible text with those characters is refused; a refusal
   costs one normal plan.
9. **The test run reuses the quality agent's runners and its counter reading**, with the
   working directory set to the project root and its progress lines kept off the JSON output,
   because those runners take no working-directory option and print as they go. Writing a
   second test runner would be a second reading of test output to keep in step.
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

## Execution Plan

### Step 8: TEST
- [ ] Write `tests/hotfix-check.test.js`. Every case builds a temporary git repository
  (`git init`, `user.name`, `user.email` and `commit.gpgsign=false` set per call, files
  committed), makes the change, and calls `route(['hotfix', 'check', ...], root)` through
  `src/lib/menu-screens.js` (awaiting it). Projects that run tests carry a `package.json`
  whose `test` script runs `node --test tests/`, with one node:test file. Each case below is
  red today: the route falls through to the dashboard, which carries no `verdict`.
  1. Button wording: the two calls answer exactly as in the first acceptance criterion.
  2. Button colour (`#0a58ca` → `#0b5ed7` in `src/styles/button.css`): same shape, `commit.add`
     names only the stylesheet.
  3. Catalogue value (`"save": "Save {count} items"` → `"Store {count} items"` in
     `locales/en.json`): pass.
  4. Other uncommitted work: `notes.md` modified and not named; both screens deep-equal those of
     case 1; `commit.add` names `src/pages/home.html` only.
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
      `node --test --test-reporter=tap tests/` and once with `--test-reporter=spec`.
  13. Edited test: `src/pages/home.html` and `tests/home.test.js` both changed and named →
      `it changes a test (tests/home.test.js)` from both calls; the test file writes a marker
      file when it runs, and the marker never appears.
  14. No test ran: the `test` script is `node --test empty/` (an empty folder) → `no test ran,
      so nothing confirms the change`; and the same with a script `node -e ""`.
  15. Unreadable: a folder that is not a repository; a repository with no commit; `PATH` set
      to an empty folder for the call (restored after) → each `I could not read the change
      (…)` with its reason, and never `verdict: 'hotfix'`.
  16. Unrecognised: `docs/diagram.svg` with one label changed → `I do not recognise
      docs/diagram.svg as wording or a colour`.
  17. Documentation-only change in a project with no test command → the first call answers the
      pass directly; a markup change in the same project → `no test ran, so nothing confirms
      the change`.
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
  24. Nothing is touched: for every refusal above, `git status --porcelain=v1 -z` and the
      bytes of every changed file are identical before and after the call.
  25. Through the real menu process: in a temporary project initialised by one bare menu call
      and committed, `node <repo>/src/commands/start.js hotfix check src/pages/home.html` and
      the `--run-tests` call each print exactly one JSON document (`JSON.parse` of the whole
      standard output succeeds) with the verdicts of case 1.
  26. The test-run wrapper restores the process: after case 1's `--run-tests` call,
      `process.cwd()` and `console.log` are the values from before the call.
  27. Unknown sub-command and unknown option: `hotfix frobnicate` and `hotfix check --bogus`
      answer the usage text with `ok: false`.
- [ ] Write `tests/hotfix-check-corpus.test.js`: one temporary repository holding every base
  file below, committed once, with no test command. Every shape lives in its own file, under a
  path holding none of the sensitive words unless the shape is about one. Each shape writes its
  new content, calls the route naming its file(s), asserts the exact verdict and clause, and
  restores the base content. A shape that qualifies ends at `no test ran, so nothing confirms
  the change` (rules 1 to 7 held) or, for documentation, at the pass. Red today for the same
  reason as above.
  - Qualify (22): `src/pages/home.html` `<button>Save</button>`→`Store`;
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
    with CRLF line endings, one word changed.
  - Traps (45), each with its expected clause: `src/cart.js` logic; `src/server.js` string;
    `config/app.yaml` setting; `package.json` version bump (dependencies);
    `requirements.txt` version bump (dependencies, not documentation);
    `db/migrations/001_init.sql` (stored data); `.github/workflows/ci.yml` (built or shipped);
    `Dockerfile` (built or shipped); `src/strings.json` outside a catalogue folder (setting);
    `docs/diagram.svg`, `CLAUDE.md`, `agents/helper.md`, `plans/notes.md` and
    `src/commands/help.md` (do not recognise); markup attribute change
    `<a href="/a">Home</a>`→`href="/b"` (do not recognise); markup digit
    `<p>Only 9 euro a month</p>`→`7`, web address `<p>Visit example.org</p>`→
    `www.example.org`, e-mail `<p>Write to us</p>`→`help@example.org` (risk marker); a
    `<b>Save</b>` line inside a multi-line `<script>` block, inside a multi-line `<style>`
    block and inside a multi-line `<textarea>` block (do not recognise); `.jsx`
    `<p>Hello {name}</p>`→`Hi {name}`; `.vue` `<p>{{ msg }} now</p>`→`today`; a multi-line text
    node line `  Save your work`→`Store`; a tag-crossing edit `<b>Save</b> now`→
    `<b>Save now</b>`; an entity `<p>Terms &amp; rules</p>`→`conditions` (each: do not
    recognise); catalogue key change `"save":`→`"store":` and placeholder change
    `{count}`→`{total}` (do not recognise); catalogue value `"Save now"`→`"Save 5 euro now"`
    (risk marker); stylesheet selector `.red {`→`.blue {`, property change `color: red;`→
    `background: red;`, non-colour value `display: none;`→`block`, hexadecimal-looking
    selector `#bad:hover {`→`#fed:hover {` (each: do not recognise); `.tsx` comparison
    `return a > b ? x : y < z;`→`w` and generic `useState<string>("a")`→`("b")` (do not
    recognise); `tests/home.test.js` with `src/pages/home.html` and
    `src/__tests__/cart.spec.js` (a test); `src/pages/login.html`, `billing/index.html` and
    `docs/privacy.md` wording (sensitive area: `login`, `billing`, `privacy`); new
    `src/pages/about.html` and deleted `docs/old.md` (adds, removes or renames);
    `docs/logo.png` (not text); a symbolic link committed as `link` (mode `120000`, made with
    `git update-index --add --cacheinfo`) replaced in the working tree by a regular file (do
    not recognise, on every platform: a type change where links exist, a changed link target
    where they do not); four `.md` files changed one line each (size: `it changes 8 lines in
    4 files and a hotfix is at most 20 lines in at most 3 files`).
  - A mode change of `README.md` (executable bit via `git update-index --chmod=+x` and commit,
    working copy left as it was): on macOS and Linux → do not recognise; on Windows, where git
    ignores the executable bit, → the documentation pass. One case with a platform-dependent
    expectation, never a skipped case.
- [ ] Run `node --test tests/hotfix-check.test.js tests/hotfix-check-corpus.test.js`: every case
  red.

### Step 9: PREPARE
- [ ] Record `git --version` and `node --version`; confirm `git diff --ignore-cr-at-eol` and
  `git diff --raw -z --no-renames --no-abbrev` behave as specified on that version.
- [ ] Read keeps-working slice 2's final `src/lib/menu-screens.js` and `src/commands/start.js`
  (this slice builds on top of it) and the exports of `quality-agent.js`, `tool-detector.js`
  and `coverage-map.js` used above.
- [ ] Confirm the CSS Color Module Level 4 named-colour list (148 names) from the
  specification text, not from memory.

### Step 10: IMPLEMENT
- [ ] `src/lib/hotfix-check.js`: the git helper, the change reader, rules 2, 7, 4, 5, 6, 3 and
  8 in that order, the kind tables, the sentence builders, the test-run wrapper, and
  `hotfixRoute`.
- [ ] `src/lib/menu-screens.js`: the `hotfix` case in `route`.
- [ ] `src/commands/start.js`: print the route's result once it settles.
- [ ] `CLAUDE.md`: the library-module and test-file counts.

### Step 11: REVIEW
- [ ] The critic reads every trap against the classifier and tries three new shapes of its own
  per kind; any pass on a shape that is not wording or a colour is a finding.
- [ ] Every clause string is compared character for character with the functional plan's
  table.

### Step 12: OPTIMIZE
- [ ] One `diff --raw`, one `ls-files` and one `-U0` diff per check (all files at once, split by
  file), not one git call per rule.

### Step 13: SECURE
- [ ] The security scanner checks: no named path reaches git or the file system outside the
  project root; every git call is an argument vector (no shell); a file name beginning with `-`
  is always after `--`; the quoting in `commit.add` survives names holding spaces, quotes and
  `$`; text from the change never becomes a regular expression or a command.

### Step 14: VERIFY
- [ ] `npm test`: lint, typecheck, all tests, coverage at or above the floor in
  `.ctoc/coverage-baseline.json` with every branch of `hotfix-check.js` exercised (including the
  "check stopped" path), 0 skipped, 0 flaky.
- [ ] Drive the real flow once in a scratch copy of a small project: make a wording change, run
  both calls through `node src/commands/start.js`, and quote both JSON answers and the time the
  test run took in the build record.

### Step 15: DOCUMENT
- [ ] JSDoc on `hotfixRoute` and on every internal function, naming the rule each one carries.
- [ ] The module header lists the rules, their order and why, the four kinds, the clauses, and
  what the check cannot answer (from the functional plan's table).

### Step 16: FINAL-REVIEW
- [ ] Every acceptance box above is checked against its evidence; the real-flow answers are
  quoted, not summarised.
