'use strict';

/**
 * The hotfix check: CTOC looks at a change that someone called a hotfix ("hotfix",
 * "quick fix", "trivial fix", "trivial change", "urgent") and says whether it really is
 * small and safe. When it is not, the answer is one fixed sentence naming the cause.
 *
 * Reached as a menu route (`menu-screens.route`, `case 'hotfix'`):
 *   node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" hotfix check [<file> ...]
 *       — instant: rules 1 to 7; no test runs and nothing about the project's tools is
 *         read. On a refusal, the sentence. When they hold: `verdict: 'checking'`, the one
 *         status line as `text`, and `next`, the exact route that runs the tests:
 *         `hotfix check --run-tests '<file>' ...`, with `--` before the files when a name
 *         starts with `-` (`--` ends the options, so `--x.md` still reaches the test run).
 *   ... hotfix check --run-tests [--] [<file> ...]
 *       — the background test run: rules 1 to 7 again, then rule 8 in a temporary copy of
 *         the repository.
 * A pass answers `verdict: 'hotfix'`, `text: ''`, `tests` and `commit: { files, add,
 * message, judged }`; `add` and `message` are the exact git commands, run from the project
 * root, that stage and commit exactly the judged files (`--literal-pathspecs`, `--only`);
 * `judged` is `[{ path, blob }]`, each judged file with the id of the bytes judged, so that
 * slice 2's gate can compare the real commit with it (a project's own pre-commit hook may
 * rewrite or add files while it commits; `--no-verify` is never used, because project hooks
 * may scan for secrets).
 * A refusal answers `verdict: 'refused'` and the sentence; a fault, a patch that did not
 * apply and a copy that could not be removed also carry `detail`, outside the sentence.
 *
 * WHAT IS JUDGED. Exactly the change git would commit for the named files (or, with no
 * file named, every changed and new file outside `.ctoc/`, which holds CTOC's own state),
 * against the last commit: in both calls the judged files are staged into a temporary
 * index (`<tmp>/index`: `read-tree` of the last commit, `add --all -- <judged>`), and the
 * new text and changed lines the rules read come from it (`cat-file`, `diff --cached`), so
 * the rules judge the bytes `git add` stages. A judged file that git's index marks
 * assume-unchanged (which `core.ignoreStat` also sets) or skip-worktree is refused as
 * unreadable: git would then read its index instead of the file. No language model is
 * involved; the same change always gets the same answer.
 *
 * THE RULES, in the order they run (the first that fails gives the clause; files are
 * looked at in sorted display-path order):
 *   1  the change can be read            — a git repository with a commit, the project
 *                                          inside it, every judged name one the commit
 *                                          command can carry, no index bit that hides the
 *                                          working file, every file text
 *   2  same files, same names            — nothing added, removed, renamed, re-moded, linked
 *   7  no test is edited                 — fix the code, not the tests
 *   4  only kinds that qualify           — documentation, visible text in markup, message
 *                                          catalogue values, colour values in stylesheets;
 *                                          never in a place that governs the work
 *                                          (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`,
 *                                          `GEMINI.md`, `CONVENTIONS.md`, GitHub's assistant
 *                                          files, `.cursor/`, `.windsurf/`, `.clinerules/`,
 *                                          `.roo/`, `.kiro/`, `.junie/`, `.amazonq/`,
 *                                          `.continue/` and the governing folders), never in a
 *                                          build folder (`.github/` but its Markdown outside
 *                                          `workflows/`, `.changeset/`, ...); `robots.txt` and
 *                                          its kind are settings; a `.txt` named like
 *                                          `requirements` is a dependency list.
 *                                          EACH KIND IS JUDGED WHOLE, one scanner per side:
 *                                          markup by a token stream after the HTML tokenizer
 *                                          (tags with every attribute, raw text, comments and
 *                                          braces are compared exactly; only text between two
 *                                          tags may change, on one line, never inside raw text,
 *                                          a `<template>` (but Vue's markup and conditional
 *                                          ones), a code element, a component or a custom
 *                                          element, or an `<option>` with no `value`; a
 *                                          `<title>` is text); JSX as JavaScript whose elements
 *                                          are scanned the same way (a TypeScript type
 *                                          parameter list is no element); stylesheets by
 *                                          statements across the whole file (strings, comments
 *                                          and `url(…)` blanked), a colour only in the value of
 *                                          a real colour property on its line, and any change
 *                                          to a custom property or a Sass or Less variable a
 *                                          setting; Markdown by lines (front matter in three
 *                                          forms is settings, fenced and indented code, read
 *                                          inside list items, and doctests are code) and by
 *                                          the markup scanner for the prose, with code spans
 *                                          and link targets (a reference definition's next
 *                                          lines too) compared exactly; in reStructuredText
 *                                          every directive but the prose ones, literal blocks
 *                                          and doctests are code, and roles, literals and
 *                                          references are compared exactly; doctests in plain
 *                                          text are code; a catalogue value is decoded as its
 *                                          format reads it and read as a browser reads an
 *                                          address
 *   5  not in a sensitive area           — 33 whole words, also in the plural, in the path from
 *                                          the repository top (auth, login, ...; a stylesheet's
 *                                          own file name aside), CTOC's own secret-file guard,
 *                                          and in CTOC's own repository its protected paths; the test,
 *                                          governing, build and database folders are read from
 *                                          the top too
 *   6  no risk marker in wording         — no number, currency, %, address, e-mail, code;
 *                                          in documentation, in the changed words only
 *   3  size                              — at most 20 changed lines in at most 3 files
 *   8  the existing tests pass           — only in the `--run-tests` call, in a copy
 * Rule 7 and the kind rule run before size because the functional plan's own scenarios
 * name an edited test and the kind of change ahead of size; all of 2 to 7 read the same
 * diff, so the order costs nothing, and the tests still run last.
 *
 * NO CODE OF THE REPOSITORY'S RUNS. The check's temporary folder (`mkdtemp` under the
 * system's temporary folder) and its empty `no-hooks` folder are made before the first git
 * call, and every git call carries `-c core.hooksPath=<no-hooks> -c core.fsmonitor=false`
 * (in `runGit`, so no call can miss it): no repository hook (`post-index-change` among
 * them) and no configured file-system monitor command runs. The repository's smudge
 * filters still run where git writes files (`worktree add`), on purpose.
 *
 * THE COPY OF THE REPOSITORY'S INDEX. A diff against the working tree refreshes the index
 * it reads and rewrites it, whatever GIT_OPTIONAL_LOCKS says (verified, the plan's
 * Decision 44). So each call copies the repository's own index (`rev-parse --git-path
 * index`, the right one for a linked worktree too) into the check's own temporary folder
 * with its modification time kept, and
 * every git call in the main repository names that copy through GIT_INDEX_FILE: the
 * listings, the diffs, `cat-file`, the hashings. The exceptions: the calls on the
 * temporary index of the judged change (`read-tree`, `add`, `ls-files --stage`, the two
 * `diff --cached`) name that one, and `worktree add`, `worktree remove` and `apply` name
 * none. `.git/index` is never written. The one write into the repository, known and
 * harmless: `add` into the temporary index stores the judged files' contents as loose
 * objects in `.git/objects`, as `git add` itself does; on a pass `commit.add` stores the
 * very same objects, and an unused one is removed by git's own `git gc`. Avoiding it would
 * take a second object folder named on every call that reads the temporary index.
 *
 * THE TWO HASHINGS (`--run-tests` only). Each judged regular file is hashed with
 * `hash-object` (git's own clean filters, exactly as `git add` applies them) right after
 * it is staged in the temporary index and before any rule reads its content, and again
 * after the tests. Rule 8 compares the first hashes with the files' ids in the temporary
 * index before any test runs, and the second hashes with those ids after; any difference
 * refuses with "<file> changed while it was being checked". So the bytes the rules judged,
 * the bytes the tests ran on and the ids slice 2 records are one set.
 *
 * RULE 8 — THE TEMPORARY COPY. The tests never run in the working folder. In the check's
 * temporary folder: `tree`, a detached worktree of the last commit; the judged change
 * carried in as a
 * `--binary --full-index` patch (`diff --cached`) from the temporary index the judged
 * change was staged in, and applied by `git apply` inside the copy;
 * every ignored `node_modules` and every ignored folder holding `pyvenv.cfg` linked in
 * (a directory junction on Windows, a directory link elsewhere), each only when its parent
 * lies inside the copy. A workspace link inside a linked `node_modules`, or an editable
 * Python install in a linked virtual environment (`.pth` lines, `__editable__` finder
 * files), that leads back into the repository refuses when other uncommitted work lies
 * under it. The project's tools are then detected in the copy, the tests selected by file
 * name in the copy (`coverage-map.findTestsByHeuristic`) when every judged file has one,
 * else the whole suite, all through the quality agent, with the working directory set to
 * the copy and the quality agent's progress lines kept off the menu's JSON.
 * Removal, on every path of both calls, after the working directory is restored: every
 * link unlinked by itself (one already gone, or whose folder is gone, counts as removed),
 * each only while its folder's real path still lies inside the temporary folder (the tests
 * may have swapped the copy for a link elsewhere), then `git worktree remove --force` of
 * exactly the copy's worktree, then the folder; the first failure stops it and is named in
 * `detail`. Worktrees are never pruned. While the temporary folder exists, SIGINT, SIGTERM
 * and SIGHUP first run the same removal, then raise the signal again.
 *
 * THE CLAUSES (inside "I did not treat this as a hotfix because <clause>; it goes through
 * a normal plan, and your edits stay in place, not committed."), with the cause word the
 * log records:
 *   unreadable           I could not read the change (<why>)
 *   adds-removes-renames it adds, removes or renames <file>
 *   too-big              it changes <n> lines in <m> files and a hotfix is at most 20 lines in at most 3 files
 *   program-logic        it changes program logic in <file>, and only wording and colours qualify
 *   text-in-code         it changes text inside program code in <file>, and no check can tell whether people read that text or the program depends on it
 *   setting              it changes a setting in <file>, and settings changes are a common cause of outages
 *   dependencies         it changes the dependencies in <file>
 *   stored-data          it changes stored data in <file>
 *   build                it changes how the project is built or shipped in <file>
 *   unrecognised         I do not recognise <file> as wording or a colour
 *   sensitive-area       <file> sits in an area named <word>, and such areas are never a hotfix
 *   risk-marker          the wording in <file> contains a number, a price, a web address or an e-mail address
 *   test-edited          it changes a test (<file>)
 *   tests-fail           the existing tests fail (<first failing test>)
 *   no-test-ran          no test ran, so nothing confirms the change
 * The `<why>` of "I could not read the change" is one of: git is not installed; this
 * folder is not a git repository; this folder lies outside the repository git reports;
 * this folder has no commit to compare with; <file> is outside this project; <file> holds
 * no change that git would commit; nothing has changed since the last commit; <file> has a
 * name the commit command cannot carry; <file> is marked in git's index as unchanged or
 * skipped; <file> is not text; the change does not apply
 * cleanly to a fresh copy of the last commit; <file> changed while it was being checked;
 * other uncommitted work is in code the tests load through installed packages: <folder>;
 * the check stopped (the fault's message in `detail`).
 *
 * THE LOG. Every final answer (a pass or a refusal; never `checking` or the usage text)
 * appends one line to `.ctoc/logs/hotfix-checks.jsonl`:
 * `{ at, verdict, cause, urgent, files, lines }` — the time, `hotfix` or `refused`, the
 * cause word above (`null` on a pass), `false` (the urgent option is a later slice), and
 * the file and changed-line counts (0 when the change could not be read). No file name,
 * path, wording or `detail` is written. Never through a link: `.ctoc` and `.ctoc/logs`
 * must be real folders and the log a regular file with one link. Above 1 MiB the log is
 * renamed to `hotfix-checks.jsonl.1` and a new one is created exclusively; no file is ever
 * emptied. Best effort: a log that cannot be written never changes an answer.
 *
 * CALL-TIME LOOKUPS (the tests replace these for one call): the quality agent's
 * `runFullTests` and `runSpecificTests` through `require('./quality-agent')` inside the
 * test run, and `mkdtempSync`, `mkdirSync`, `symlinkSync`, `rmSync` and `unlinkSync` only
 * as properties of the `safe-fs` module object.
 *
 * WHAT THIS CHECK CANNOT ANSWER (from the functional plan): whether a string in program
 * code is read by people or depended on by the program (refused instead); whether new
 * wording is right, true or lawful (narrowed by rules 5 and 6 only); whether a new colour
 * is readable on its background (not computed); whether something outside the folder
 * depends on the old text or colour (only the project's own tests speak to it); whether
 * this is the right fix (not a safety question).
 *
 * Known gap, kept to the letter of the functional plan: the sensitive-word rule splits a
 * path only at characters that are not letters, so `AuthPanel.jsx` is not `auth`.
 */

const fs = require('fs'); // the native real path, the open-flag constants and descriptor calls; every path call goes through safe-fs
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { fileURLToPath } = require('url');
const safeFs = require('./safe-fs');
const { isSecretTarget } = require('../hooks/guard-files');
const { isProtectedEnforcementPath } = require('./protected-paths');
const { isCtocProject } = require('./ctoc-project-detector');

const MAX_LINES = 20;
const MAX_FILES = 3;
const LOG_MAX_BYTES = 1024 * 1024;
const STATUS_LINE = 'Checking the hotfix against the existing tests.';
const USAGE = 'Use: hotfix check [--run-tests] [<file> ...]';
const SENTENCE_HEAD = 'I did not treat this as a hotfix because ';
const SENTENCE_TAIL = '; it goes through a normal plan, and your edits stay in place, not committed.';
const NO_TEST_RAN = Object.freeze({ clause: 'no test ran, so nothing confirms the change', cause: 'no-test-ran' });
const DOC_ONLY = 'The project has no test command, and the change is documentation only.';

/** Git's own environment variables that would point it at another repository or index. */
const GIT_REDIRECTS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_CEILING_DIRECTORIES'];
/** The arguments every diff but the patch carries, so no setting or attribute shapes it. */
const FIXED_DIFF = ['--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-relative', '--text'];

const GOVERNING_FOLDERS = new Set(['.claude', '.ctoc', '.cursor', '.windsurf', '.clinerules', '.roo', '.kiro', '.junie',
  '.amazonq', '.continue', 'agents', 'skills', 'commands', 'plans']);
/** The folders of GitHub's assistant under `.github/`, whose files govern whatever their names. */
const GITHUB_GOVERNING = new Set(['instructions', 'prompts', 'chatmodes']);
/** The endings of instruction, rule, prompt and chat-mode files, wherever they sit. */
const GOVERNING_ENDINGS = ['.mdc', '.instructions.md', '.prompt.md', '.chatmode.md'];

/**
 * The instruction files coding assistants read, by class: they apply per folder, so their
 * names count at any depth. `AGENTS.md`, `CONVENTIONS.md`, `copilot-instructions.md`,
 * `.cursorrules`, `.windsurfrules`, any `CLAUDE*.md` or `GEMINI*.md`, and any name ending
 * in `.mdc`, `.instructions.md`, `.prompt.md` or `.chatmode.md`.
 * @param {string} lower the base name, lower case @returns {boolean}
 */
function governingName(lower) {
  return ['agents.md', 'conventions.md', 'copilot-instructions.md', '.cursorrules', '.windsurfrules'].includes(lower)
    || ((lower.startsWith('claude') || lower.startsWith('gemini')) && lower.endsWith('.md'))
    || GOVERNING_ENDINGS.some((x) => lower.endsWith(x));
}
const DOC_EXT = new Set(['.md', '.txt', '.rst']);
const MARKUP_EXT = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte']);
const CATALOGUE_EXT = new Set(['.json', '.yaml', '.yml', '.po', '.properties']);
const CATALOGUE_FOLDERS = new Set(['locales', 'locale', 'i18n', 'lang', 'translations', 'messages']);
const COLOUR_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const TEST_FOLDERS = new Set(['test', 'tests', '__tests__', 'spec']);
const DEPENDENCY_NAMES = new Set(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock',
  'pnpm-lock.yaml', 'bun.lockb', 'Pipfile', 'Pipfile.lock', 'pyproject.toml', 'poetry.lock', 'uv.lock',
  'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock', 'Gemfile', 'Gemfile.lock', 'composer.json',
  'composer.lock', 'pom.xml']);
const DATABASE_FOLDERS = new Set(['migrations', 'migration', 'migrate']);
/** Build lists that end in `.txt` and so are never documentation (compared in lower case). */
const BUILD_TEXT_NAMES = new Set(['cmakelists.txt', 'runtime.txt', 'packages.txt', 'apt.txt', 'version.txt']);
const BUILD_NAMES = new Set(['Makefile', 'Jenkinsfile', 'Procfile', 'Vagrantfile', '.gitlab-ci.yml',
  'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']);
/** Folders whose every file is about building or shipping; their documentation too (`.changeset/` notes ship with a release). */
const BUILD_FOLDERS = new Set(['.github', '.gitlab', '.circleci', '.buildkite', '.changeset']);
/** Text files that crawlers, advertisers, security researchers and language models read as settings. */
const SETTINGS_TEXT_NAMES = new Set(['robots.txt', 'ads.txt', 'app-ads.txt', 'security.txt', 'llms.txt']);
const SETTINGS_EXT = new Set(['.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.properties',
  '.xml', '.plist']);
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.py', '.rb', '.go', '.rs', '.java',
  '.kt', '.kts', '.swift', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.php', '.sh', '.bash', '.zsh', '.ps1',
  '.bat', '.cmd', '.lua', '.scala', '.dart', '.ex', '.exs', '.erl', '.clj', '.pl', '.r', '.m', '.mm', '.sol']);
/** The functional plan's sensitive words, matched whole against the path's letter runs. */
const SENSITIVE_WORDS = new Set(['auth', 'login', 'logout', 'password', 'session', 'token', 'secret',
  'credential', 'key', 'permission', 'role', 'admin', 'payment', 'billing', 'checkout', 'price', 'pricing',
  'invoice', 'tax', 'legal', 'terms', 'privacy', 'consent', 'cookie', 'gdpr', 'license', 'migration',
  'schema', 'database', 'sql', 'deploy', 'workflow', 'ci']);
/** The shorthand properties that may carry a colour; every property ending in `color` may too. */
const COLOUR_SHORTHANDS = new Set(['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-block', 'border-block-start', 'border-block-end', 'border-inline', 'border-inline-start', 'border-inline-end',
  'outline', 'column-rule', 'fill', 'stroke', 'box-shadow', 'text-shadow', 'text-decoration', 'text-emphasis']);
/** The 148 named colours of CSS Color Module Level 4, plus `transparent`. */
const NAMED_COLOURS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black '
  + 'blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue '
  + 'cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki '
  + 'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue '
  + 'darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue '
  + 'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow '
  + 'grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon '
  + 'lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink '
  + 'lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime '
  + 'limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen '
  + 'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose '
  + 'moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen '
  + 'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red '
  + 'rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue '
  + 'slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white '
  + 'whitesmoke yellow yellowgreen transparent').split(' '));

const PLACEHOLDER = /\{\{[^{}]*\}\}|\{[^{}]*\}|%(?:\d\$)?[sdif@]/g;
const RISK_MARKER = /[\p{Nd}\p{Sc}%<>{}$`@]|:\/\/|www\./iu;
/** Documentation's risk markers, read in the changed words only: a number, a price, a web address, an e-mail address. */
const DOC_RISK = /[\p{Nd}\p{Sc}@]|:\/\/|www\./iu;
/** A catalogue value that starts like an address: a scheme (`javascript:x`, `mailto:x`), a path (`/`, `//`) or `\`. */
const ADDRESS_START = /^(?:[A-Za-z][\w+.-]*:\S|[/\\])/;
/** A bare YAML or properties value that a program reads as a switch or nothing, never as wording. */
const BARE_SCALAR = /^(?:true|false|yes|no|on|off|null|~)$/i;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
/** A character a single-quoted path in the commit command cannot carry, or slice 2's reader refuses. */
const UNCARRIABLE = /['"$\\`\u0000-\u001f\u007f-\u009f]/;
const ANSI = /\u001b\[[0-9;:<=>?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

/**
 * @typedef {Object} Hunk one group of removed and added lines: its first old and new line numbers
 * @property {number} oldStart
 * @property {number} newStart
 * @property {string[]} removed
 * @property {string[]} added
 */
/**
 * @typedef {Object} ChangedFile one file of the change, as read by {@link readChange}
 * @property {string} display the path from the project root, with `/`
 * @property {string} topRel the path from the repository's top level, with `/`
 * @property {string} oldMode
 * @property {string} newMode
 * @property {(string|null)} oldSha
 * @property {string} status git's one-letter status (`A` also for a new, untracked file)
 * @property {string} [firstHash] the id `hash-object` gave before any rule read the file
 * @property {string} [stagedId] the id the temporary index (`stageIndex`) holds for it, `deleted` when it holds none
 * @property {(string|null)} [oldText]
 * @property {(string|null)} [newText]
 * @property {Hunk[]} [hunks]
 * @property {string} [kind] the qualifying kind rule 4 placed it in
 * @property {string[]} [runs] the old and new wording rule 6 reads
 */
/** @typedef {{files: ChangedFile[], lineCount: number, root: string, rootFromTop: string, top?: string}} Change */
/**
 * The check's own state for one call: the repository it reads, and everything rule 8
 * made, so that {@link removeCopy} can take it away on every path.
 * @typedef {Object} Context
 * @property {(string|null)} top the repository's top level (real path)
 * @property {(string|null)} head the last commit's full id
 * @property {(string|null)} tmp the check's temporary folder (real path)
 * @property {(string|null)} noHooks the empty folder inside `tmp` every git call names as its hooks folder
 * @property {(string|null)} repoIndex the copy of the repository's index, inside `tmp`
 * @property {(string|null)} [stageIndex] the temporary index holding the last commit plus the judged files, inside `tmp`
 * @property {(string|null)} worktree the copy's worktree, once `worktree add` made it
 * @property {string[]} links every link made in the copy
 */
/** @typedef {{clause: string, cause: string, detail?: string}} Refusal */

/** A rule-1 failure: the change could not be read, for a reason the owner can act on. */
class Unreadable extends Error {
  /** @param {string} why @param {string} [detail] shown outside the sentence */
  constructor(why, detail) {
    super(why);
    this.why = why;
    this.detail = detail;
  }
}

/**
 * Rule 1 — the one way git is called: an argument vector (no shell), fixed settings and
 * environment, git's redirecting variables removed, output kept as a buffer. Every call
 * runs no code of the repository's: `core.hooksPath` names the check's own empty
 * `no-hooks` folder (so no hook, `post-index-change` among them, runs) and
 * `core.fsmonitor=false` (so no configured file-system monitor command runs). `index`
 * names the index the call reads (GIT_INDEX_FILE); `input` is handed on standard input.
 * A missing git is the "not installed" clause.
 * @param {Context} ctx the check's context; its `noHooks` folder exists before any git call
 * @param {string} cwd
 * @param {string[]} args
 * @param {{index?: (string|null), input?: Buffer}} [opts]
 * @returns {{status: (number|null), stdout: Buffer, stderr: Buffer}}
 */
function runGit(ctx, cwd, args, { index = null, input } = {}) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, LC_ALL: 'C', GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' };
  for (const name of GIT_REDIRECTS) delete env[name];
  if (index) env.GIT_INDEX_FILE = index;
  const r = spawnSync('git', ['-c', `core.hooksPath=${ctx.noHooks}`, '-c', 'core.fsmonitor=false',
    '-c', 'core.quotepath=false', '-c', 'diff.autoRefreshIndex=true', ...args],
    { cwd, env, input, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.error) {
    if (/** @type {NodeJS.ErrnoException} */ (r.error).code === 'ENOENT') throw new Unreadable('git is not installed');
    throw r.error;
  }
  return r;
}

/**
 * {@link runGit} that throws (the "check stopped" clause) when git exits non-zero.
 * @param {Context} ctx
 * @param {string} cwd
 * @param {string[]} args
 * @param {{index?: (string|null), input?: Buffer}} [opts]
 * @returns {Buffer}
 */
function gitOut(ctx, cwd, args, opts) {
  const r = runGit(ctx, cwd, args, opts);
  if (r.status !== 0) throw new Error(`git ${args.find((a) => !a.startsWith('-') && !a.includes('='))} failed: ${r.stderr.toString('utf8').trim()}`);
  return r.stdout;
}

/** @param {string} p @returns {string} the path with `/` separators */
const slash = (p) => p.split(path.sep).join('/');
/** @param {string} p @returns {string} the real path; the native form keeps no Windows short name */
const realPath = (p) => fs.realpathSync.native(p);
/** @param {string} rel a `path.relative` result @returns {boolean} whether it climbs out */
const climbsOut = (rel) => rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
/** @param {string} parent @param {string} child @returns {boolean} whether `child` is `parent` or lies beneath it */
const within = (parent, child) => !climbsOut(path.relative(parent, child));
/** @param {string} s @returns {string} the text without control characters, at most 200 characters */
const clean = (s) => String(s).replace(CONTROL_CHARS, ' ').trim().slice(0, 200);
/** @param {*} err @returns {string} */
const messageOf = (err) => (err && err.message ? err.message : String(err));

/** @param {string} p @returns {(import('fs').Stats|null)} the entry itself (a link is not followed), or null */
function lstatOrNull(p) {
  try {
    return safeFs.lstatSync(p);
  } catch {
    return null;
  }
}
/** @param {string} p @returns {(import('fs').Stats|null)} what the path leads to (a link is followed), or null */
function statOrNull(p) {
  try {
    return safeFs.statSync(p);
  } catch {
    return null;
  }
}
/** @param {string} p @returns {string[]} the folder's entries, or none */
function entriesOf(p) {
  try {
    return safeFs.readdirSync(p).map(String);
  } catch {
    return [];
  }
}

/**
 * Rule 1 — decode one side of a file as text, or refuse: a zero byte or invalid UTF-8.
 * @param {Buffer} buf
 * @param {string} display
 * @returns {string}
 */
function asText(buf, display) {
  if (buf.includes(0)) throw new Unreadable(`${display} is not text`);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Unreadable(`${display} is not text`);
  }
}

/**
 * Rules 1 and 3 — split one `-U0` patch for all files into groups of removed and added
 * lines per top-level path. Hunk bodies are consumed by their header counts, so a removed
 * line that itself starts with `--` is never read as a file header. Under the pinned
 * arguments git prints no unchanged context line; should one appear anyway, it is counted
 * on both sides and closes the group, so line numbers and line pairs stay right. The
 * `\ No newline at end of file` marker counts on neither side. Every judged name passed
 * the name check, so git never quotes one in a header.
 * @param {string} patch
 * @returns {Map<string, Hunk[]>}
 */
function parsePatch(patch) {
  const out = new Map();
  const lines = patch.split('\n');
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('diff --git ')) {
      const rest = line.slice('diff --git '.length); // `a/<path> b/<path>`
      current = rest.slice(2, (rest.length - 3) / 2 + 1);
      if (!out.has(current)) out.set(current, []);
      continue;
    }
    const h = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/.exec(line);
    if (!h || current === null) continue;
    let oldLine = Number(h[1]);
    let newLine = Number(h[3]);
    let oldLeft = h[2] === '' ? 1 : Number(h[2]);
    let newLeft = h[4] === '' ? 1 : Number(h[4]);
    /** @type {Hunk|null} */
    let group = null;
    const open = () => {
      if (!group) {
        group = { oldStart: oldLine, newStart: newLine, removed: [], added: [] };
        out.get(current).push(group);
      }
      return group;
    };
    while ((oldLeft > 0 || newLeft > 0) && i + 1 < lines.length) {
      const body = lines[++i];
      const text = body.slice(1).replace(/\r$/, '');
      if (body.startsWith('-')) {
        open().removed.push(text);
        oldLine++;
        oldLeft--;
      } else if (body.startsWith('+')) {
        open().added.push(text);
        newLine++;
        newLeft--;
      } else if (!body.startsWith('\\')) {
        // An unchanged context line (a blank one may print empty): both sides advance.
        group = null;
        oldLine++;
        newLine++;
        oldLeft--;
        newLeft--;
      }
    }
  }
  return out;
}

/**
 * Hash judged files the way `git add` would (`hash-object`, git's own clean filters and
 * line-ending conversion; nothing is written). A file absent from the working folder is
 * `deleted`, any other entry that is not a regular file `not a file`.
 * @param {Context} ctx
 * @param {ChangedFile[]} files
 * @returns {Map<string, string>} top-level path → id
 */
function hashJudged(ctx, files) {
  const top = /** @type {string} */ (ctx.top);
  const ids = new Map();
  const regular = [];
  for (const f of files) {
    const st = lstatOrNull(path.join(top, f.topRel));
    if (st && st.isFile()) regular.push(f.topRel);
    else ids.set(f.topRel, st ? 'not a file' : 'deleted');
  }
  if (regular.length > 0) {
    const out = gitOut(ctx, top, ['hash-object', '--', ...regular], { index: ctx.repoIndex }).toString('utf8').trim().split('\n');
    regular.forEach((rel, i) => ids.set(rel, out[i]));
  }
  return ids;
}

/**
 * The check's own temporary folder under the system's temporary folder (real path), made
 * before any git call, and in it the empty `no-hooks` folder every git call names as its
 * hooks folder ({@link runGit}).
 * @param {Context} ctx
 */
function makeTmp(ctx) {
  ctx.tmp = realPath(safeFs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hotfix-')));
  ctx.noHooks = path.join(ctx.tmp, 'no-hooks');
  safeFs.mkdirSync(ctx.noHooks);
}

/**
 * Rule 1 — the copy of the repository's index (Decision 44): in the check's temporary
 * folder, the index `rev-parse --git-path index` names, its modification time kept (git
 * trusts a cached file time only when it is older than the index file's own). Every later
 * read in the main repository names it.
 * @param {Context} ctx
 */
function copyIndex(ctx) {
  const top = /** @type {string} */ (ctx.top);
  const index = path.resolve(top, gitOut(ctx, top, ['rev-parse', '--git-path', 'index']).toString('utf8').trim());
  ctx.repoIndex = path.join(/** @type {string} */ (ctx.tmp), 'repo-index');
  safeFs.cpSync(index, ctx.repoIndex, { preserveTimestamps: true });
}

/**
 * Rule 1 — read the change: which files, their old and new text, and their changed-line
 * groups; in the `--run-tests` call also each file's first hash, taken before any rule
 * reads its content. Throws {@link Unreadable} with the reason when the change cannot be
 * read.
 * @param {string} root the project root
 * @param {string[]} named the files the session named (may be empty)
 * @param {Context} ctx
 * @param {boolean} runTests
 * @returns {Change}
 */
function readChange(root, named, ctx, runTests) {
  const realRoot = realPath(root);
  const topRun = runGit(ctx, realRoot, ['rev-parse', '--show-toplevel']);
  if (topRun.status !== 0) throw new Unreadable('this folder is not a git repository');
  const top = realPath(topRun.stdout.toString('utf8').trim());
  const rootRel = path.relative(top, realRoot);
  if (climbsOut(rootRel)) throw new Unreadable('this folder lies outside the repository git reports');
  const headRun = runGit(ctx, top, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']);
  if (headRun.status !== 0) throw new Unreadable('this folder has no commit to compare with');
  ctx.top = top;
  ctx.head = headRun.stdout.toString('utf8').trim();
  copyIndex(ctx);
  const read = (args) => gitOut(ctx, top, args, { index: ctx.repoIndex });

  const rootFromTop = slash(rootRel);
  const toTop = (rel) => (rootFromTop ? `${rootFromTop}/${rel}` : rel);
  const wanted = named.map((arg) => {
    const written = arg.replace(/\\/g, '/');
    const rel = path.relative(realRoot, path.resolve(realRoot, written));
    if (rel === '' || climbsOut(rel)) throw new Unreadable(`${written.replace(CONTROL_CHARS, ' ')} is outside this project`);
    return { display: slash(rel), topRel: toTop(slash(rel)) };
  });
  const specs = wanted.length > 0 ? wanted.map((w) => w.topRel) : (rootFromTop ? [rootFromTop] : []);

  /** @type {Array<Omit<ChangedFile, 'display'>>} */
  const entries = [];
  const raw = read(['diff', 'HEAD', '--raw', '-z', '--no-abbrev', ...FIXED_DIFF, '--', ...specs]).toString('utf8').split('\0');
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const meta = raw[i].slice(1).split(' ');
    entries.push({ topRel: raw[i + 1], oldMode: meta[0], newMode: meta[1], oldSha: meta[2], status: meta[4][0] });
  }
  const others = read(['ls-files', '--others', '--exclude-standard', '-z', '--', ...specs])
    .toString('utf8').split('\0').filter(Boolean);
  for (const topRel of others) {
    const st = safeFs.lstatSync(path.join(top, topRel));
    entries.push({ topRel, oldMode: '000000', newMode: st.isSymbolicLink() ? '120000' : '100644', oldSha: null, status: 'A' });
  }

  for (const w of wanted) {
    if (!entries.some((e) => e.topRel === w.topRel || e.topRel.startsWith(`${w.topRel}/`))) {
      throw new Unreadable(`${w.display.replace(CONTROL_CHARS, ' ')} holds no change that git would commit`);
    }
  }
  /** @type {ChangedFile[]} */
  let files = entries.map((e) => ({ ...e, display: rootFromTop ? e.topRel.slice(rootFromTop.length + 1) : e.topRel }));
  if (wanted.length === 0) files = files.filter((f) => !f.display.startsWith('.ctoc/'));
  if (files.length === 0) throw new Unreadable('nothing has changed since the last commit');
  files.sort((a, b) => (a.display < b.display ? -1 : 1)); // paths are unique, never equal
  const uncarriable = files.find((f) => UNCARRIABLE.test(f.display));
  if (uncarriable) {
    throw new Unreadable(`${uncarriable.display.replace(CONTROL_CHARS, ' ')} has a name the commit command cannot carry`);
  }

  const judged = files.map((f) => f.topRel);

  // An index bit that makes git read its index instead of the working file (assume-unchanged,
  // which `core.ignoreStat` also sets, shown in lower case; skip-worktree, `S`): the listing
  // would see one change and `git add` stage another, so the change cannot be read.
  const marked = new Set(read(['ls-files', '-v', '-z', '--', ...judged]).toString('utf8').split('\0')
    .filter((e) => /^(?:[a-z]|S) /.test(e)).map((e) => e.slice(2)));
  const hidden = files.find((f) => marked.has(f.topRel));
  if (hidden) throw new Unreadable(`${hidden.display} is marked in git's index as unchanged or skipped`);

  // The judged bytes are exactly what `git add` stages: a temporary index holding the last
  // commit plus the judged files as `add --all` puts them there (git's own clean filters and
  // line-ending conversion). The rules read their new text and changed lines from it, and
  // rule 8 builds its patch from it, so the rules, the tests and the commit see one change.
  ctx.stageIndex = path.join(/** @type {string} */ (ctx.tmp), 'index');
  const stage = (args) => gitOut(ctx, top, args, { index: ctx.stageIndex });
  stage(['read-tree', /** @type {string} */ (ctx.head)]);
  stage(['add', '--all', '--', ...judged]);
  const staged = new Map();
  for (const entry of stage(['ls-files', '--stage', '-z', '--', ...judged]).toString('utf8').split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    staged.set(entry.slice(tab + 1), entry.slice(0, tab).split(' ')[1]);
  }
  for (const f of files) f.stagedId = staged.get(f.topRel) || 'deleted';

  if (runTests) {
    const first = hashJudged(ctx, files);
    for (const f of files) f.firstHash = first.get(f.topRel);
  }

  const unreadableMode = (m) => m === '120000' || m === '160000' || m === '000000';
  for (const f of files) {
    f.oldText = unreadableMode(f.oldMode) ? null : asText(read(['cat-file', 'blob', /** @type {string} */ (f.oldSha)]), f.display);
    f.newText = f.status === 'D' || f.stagedId === 'deleted' || unreadableMode(f.newMode) ? null
      : asText(read(['cat-file', 'blob', f.stagedId]), f.display);
  }

  const groups = parsePatch(stage(['diff', '--cached', /** @type {string} */ (ctx.head), '-U0', '--ignore-cr-at-eol',
    '--src-prefix=a/', '--dst-prefix=b/', '--inter-hunk-context=0', '--diff-algorithm=myers', '--indent-heuristic',
    ...FIXED_DIFF, '--', ...judged]).toString('utf8'));
  let lineCount = 0;
  for (const f of files) {
    f.hunks = groups.get(f.topRel) || [];
    for (const h of f.hunks) lineCount += h.removed.length + h.added.length;
  }
  return { files, lineCount, root: realRoot, rootFromTop, top };
}

/**
 * The file's name, its extension (lower case), and the folders above it (lower case): from
 * the project root (`folders`) and from the repository's top (`topFolders`). The folder
 * rules that refuse (tests, governing, build, database) read `topFolders`, so a project
 * inside `tests/e2e/` or `services/payment/` is judged by where it really sits.
 * @param {{display: string, topRel: string}} f
 * @returns {{base: string, ext: string, folders: string[], topFolders: string[]}}
 */
function nameParts(f) {
  const parts = f.display.split('/');
  const base = parts[parts.length - 1];
  const lower = (list) => list.slice(0, -1).map((p) => p.toLowerCase());
  return { base, ext: path.posix.extname(base).toLowerCase(), folders: lower(parts), topFolders: lower(f.topRel.split('/')) };
}

/** Rule 2 — same files, same names: no add, delete, rename, mode change, type change or link. */
function ruleSameFiles(f) {
  if (f.status === 'A' || f.status === 'D') return { clause: `it adds, removes or renames ${f.display}`, cause: 'adds-removes-renames' };
  if (f.status !== 'M' || f.oldMode !== f.newMode || f.oldMode === '120000' || f.oldMode === '160000') {
    return { clause: `I do not recognise ${f.display} as wording or a colour`, cause: 'unrecognised' };
  }
  return null;
}

/** Rule 7 — no test is edited (a test folder in the path from the repository top, or a `*.test.*` / `*.spec.*` name). */
function ruleNoTestEdited(f) {
  const { base, topFolders } = nameParts(f);
  const isTest = topFolders.some((p) => TEST_FOLDERS.has(p)) || /\.(test|spec)\./i.test(base);
  return isTest ? { clause: `it changes a test (${f.display})`, cause: 'test-edited' } : null;
}

/** @param {string} s @returns {string} the text with a carriage return before each line feed, or at the end, removed */
const withoutCarriageReturns = (s) => s.replace(/\r\n/g, '\n').replace(/\r$/, '');

/**
 * Rule 4, first — a modified file whose texts differ (carriage returns aside) but that
 * yields no changed-line group is never a 0-line pass: it is not recognised.
 */
function ruleTextsDiffer(f) {
  if (f.hunks.length > 0 || withoutCarriageReturns(f.oldText) === withoutCarriageReturns(f.newText)) return null;
  return { clause: `I do not recognise ${f.display} as wording or a colour`, cause: 'unrecognised' };
}

/**
 * The length of the common start (`p`) and of the common end (`s`) of two lines; the two
 * never overlap.
 * @param {string} o @param {string} n @returns {{p: number, s: number}}
 */
function commonEnds(o, n) {
  let p = 0;
  while (p < o.length && p < n.length && o[p] === n[p]) p++;
  let s = 0;
  while (s < o.length - p && s < n.length - p && o[o.length - 1 - s] === n[n.length - 1 - s]) s++;
  return { p, s };
}

/*
 * THE MARKUP SCANNER (rule 4: markup, and Markdown's inline HTML). One pass over a whole
 * file, a state machine after the HTML tokenization model, simplified: data; a tag (its
 * name, attribute names, unquoted, single- and double-quoted values, `/>`); comments,
 * `<!…>`, `<?…>` and `</` not followed by a letter, each to its end; raw text after
 * `<script>` (with the script-data escape states), `<style>`, `<textarea>`, `<title>`,
 * `<xmp>`, `<iframe>`, `<noembed>`, `<noframes>`, `<noscript>` and `<plaintext>`; and
 * braces `{…}` / `{{…}}`, in data and inside a tag, as one opaque expression. Character
 * references stay part of their token. JSX files start in JavaScript instead
 * ({@link scanJs}), which hands every `<` that starts an element to {@link scanJsx}.
 * Every token is a slice of the text, and the slices cover it, so two token sequences that
 * are identical are two identical texts. No pattern backtracks: each scanner moves forward.
 */

/** @typedef {{k: string, v: string, name?: string, end?: boolean, self?: boolean, attrs?: string[], quiet?: boolean}} Tok */

/** Elements whose content a browser reads as raw text, never as markup (`plaintext` runs to the end). */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
/**
 * An HTML host element's name: lower case letters and digits, no hyphen. Anything else is a
 * component (`RunSql`, `ui.p`) or a custom element (`my-widget`, `svelte:head`), whose text
 * is whatever the component makes of it, never wording.
 */
const HOST_NAME = /^[a-z][a-z0-9]*$/;
/** HTML's code elements: their text is code, compared exactly. */
const CODE_ELEMENTS = new Set(['code', 'pre', 'kbd', 'samp', 'var']);
/** @param {string} name @returns {boolean} the element's text, and all inside it, is never wording */
const holdsText = (name) => name !== '' && (CODE_ELEMENTS.has(name.toLowerCase()) || !HOST_NAME.test(name));
/** The end of each raw-text element but `<script>` and `<plaintext>`, and of `<title>`: its closing tag, letter case ignored. */
const RAW_CLOSE = {
  style: /<\/style(?=[\s/>]|$)/gi,
  textarea: /<\/textarea(?=[\s/>]|$)/gi,
  title: /<\/title(?=[\s/>]|$)/gi,
  xmp: /<\/xmp(?=[\s/>]|$)/gi,
  iframe: /<\/iframe(?=[\s/>]|$)/gi,
  noembed: /<\/noembed(?=[\s/>]|$)/gi,
  noframes: /<\/noframes(?=[\s/>]|$)/gi,
  noscript: /<\/noscript(?=[\s/>]|$)/gi
};
/** The marks that move a script block between the script-data states. */
const SCRIPT_MARKS = /<!--|-->|<(\/?)script(?=[\s/>]|$)/gi;
/** The characters after which a JavaScript `/` starts a regular expression and a `<` an element. */
const OPERAND_AFTER = new Set([...'([{,;:=?&|!~+-*%^<>']);
const OPERAND_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await', 'default']);

/** @param {string} c @returns {boolean} */
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
/** @param {string} c @returns {boolean} white space as the HTML tokenizer reads it */
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
/** @param {string} c @returns {boolean} a character of a JavaScript identifier */
const isWordChar = (c) => isLetter(c) || (c >= '0' && c <= '9') || c === '_' || c === '$';

/**
 * Skip a quoted string from its opening quote: to the matching unescaped quote, or to the
 * end of the line (an unclosed string) or of the text.
 * @param {string} s @param {number} i @returns {number} the index after it
 */
function skipString(s, i) {
  const q = s[i];
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') j += 2;
    else if (c === q) return j + 1;
    else if (c === '\n') return j;
    else j++;
  }
  return s.length;
}

/**
 * Skip a JavaScript template literal from its backtick, each `${…}` read as code.
 * @param {string} s @param {number} i @returns {number} the index after it
 */
function skipTemplate(s, i) {
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') j += 2;
    else if (c === '`') return j + 1;
    else if (c === '$' && s[j + 1] === '{') j = scanJs(s, j + 1, true, null);
    else j++;
  }
  return s.length;
}

/**
 * Skip a JavaScript regular expression from its `/`: to the closing `/` outside a class,
 * then its flags; an unclosed one ends at the line's end.
 * @param {string} s @param {number} i @returns {number} the index after it
 */
function skipRegex(s, i) {
  let j = i + 1;
  let inClass = false;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '\n') return j;
    if (inClass) { if (c === ']') inClass = false; }
    else if (c === '[') inClass = true;
    else if (c === '/') {
      j++;
      while (j < s.length && isLetter(s[j])) j++;
      return j;
    }
    j++;
  }
  return s.length;
}

/**
 * Skip a template expression from its `{`: braces counted, quoted strings skipped. Used in
 * HTML, Vue and Svelte, whose `{…}`, `{{…}}`, `{#if …}` and `{/if}` are not JavaScript
 * statements (a `/` there starts no regular expression).
 * @param {string} s @param {number} i @returns {number} the index after the matching `}`, or the text's end
 */
function skipBraces(s, i) {
  let depth = 0;
  let j = i;
  while (j < s.length) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') { j = c === '`' ? skipTemplate(s, j) : skipString(s, j); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j + 1;
    j++;
  }
  return s.length;
}

/**
 * JavaScript, skimmed for its extent: strings, template literals, comments and regular
 * expressions skipped, braces counted, and every `<` that starts a JSX element (a letter or
 * `>` after it, where an operand is expected) handed to {@link scanJsx}. With `brace`, `s[i]`
 * is `{` and the scan ends after its match. With `out` (the top level of a JSX file), each
 * run of code becomes a `code` token and each element's tokens follow it.
 * @param {string} s
 * @param {number} i
 * @param {boolean} brace
 * @param {Tok[]|null} out
 * @returns {number} the index after the scanned code
 */
function scanJs(s, i, brace, out) {
  const n = s.length;
  let depth = brace ? 1 : 0;
  let codeStart = i;
  let prev = brace ? '{' : '';
  let word = '';
  let j = brace ? i + 1 : i;
  const flush = (end) => { if (out && end > codeStart) out.push({ k: 'code', v: s.slice(codeStart, end) }); };
  while (j < n) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') {
      j = c === '`' ? skipTemplate(s, j) : skipString(s, j);
      prev = 'a';
      word = '';
      continue;
    }
    if (c === '/' && s[j + 1] === '/') { const e = s.indexOf('\n', j); j = e < 0 ? n : e; continue; }
    if (c === '/' && s[j + 1] === '*') { const e = s.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; }
    if (isSpace(c)) { j++; continue; }
    if (isWordChar(c)) {
      const start = j;
      while (j < n && isWordChar(s[j])) j++;
      word = s.slice(start, j);
      prev = 'a';
      continue;
    }
    const operand = prev === '' || OPERAND_AFTER.has(prev) || OPERAND_WORDS.has(word);
    word = '';
    if (c === '/' && operand) { j = skipRegex(s, j); prev = 'a'; continue; }
    const generic = c === '<' && operand ? typeParameters(s, j) : -1;
    if (generic > 0) { j = generic; prev = 'a'; continue; }
    if (c === '<' && operand && (isLetter(s[j + 1] || '') || s[j + 1] === '>')) {
      flush(j);
      j = scanJsx(s, j, out);
      codeStart = j;
      prev = 'a';
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0 && brace) return j + 1;
    prev = c;
    j++;
  }
  flush(n);
  return n;
}

/**
 * A TypeScript type parameter list where JSX could start, `<T,>` or `<T extends X>` (also
 * after a `const`, `in` or `out` modifier): the index after its matching `>`, strings
 * skipped and the `>` of an arrow `=>` not counted; -1 when `s[i]` starts no such list.
 * Without this, a `.tsx` generic arrow function read as an element made the rest of the
 * file its children.
 * @param {string} s @param {number} i the `<` @returns {number}
 */
function typeParameters(s, i) {
  const n = s.length;
  const word = (at) => {
    let e = at;
    while (e < n && isWordChar(s[e])) e++;
    return e;
  };
  let j = word(i + 1);
  if (j === i + 1) return -1;
  if (['const', 'in', 'out'].includes(s.slice(i + 1, j)) && isSpace(s[j] || '')) {
    while (j < n && isSpace(s[j])) j++;
    const e = word(j);
    if (e === j) return -1;
    j = e;
  }
  while (j < n && isSpace(s[j])) j++;
  if (s[j] !== ',' && !(s.startsWith('extends', j) && isSpace(s[j + 7] || ''))) return -1;
  let depth = 1;
  while (j < n) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') { j = c === '`' ? skipTemplate(s, j) : skipString(s, j); continue; }
    if (c === '<') depth++;
    else if (c === '>' && s[j - 1] !== '=' && --depth === 0) return j + 1;
    j++;
  }
  return n;
}

/**
 * One tag from its `<`, after the HTML tokenizer's tag states: the name runs to white space,
 * `/` or `>`; an attribute name to white space, `/`, `>` or `=`; a value is single- or
 * double-quoted (to the same quote, whatever lies between), braced (`{…}`, read by
 * `braces`), or unquoted (to white space or `>`). A `{` where an attribute starts (a JSX
 * spread) is braced too. An unclosed tag runs to the end of the text.
 * @param {string} s
 * @param {number} i
 * @param {boolean} isEnd whether it is `</…`
 * @param {(s: string, i: number) => number} braces
 * @returns {Tok}
 */
function scanTag(s, i, isEnd, braces) {
  const n = s.length;
  let j = i + (isEnd ? 2 : 1);
  const nameStart = j;
  while (j < n && !isSpace(s[j]) && s[j] !== '/' && s[j] !== '>') j++;
  const name = s.slice(nameStart, j);
  const attrs = [];
  let self = false;
  while (j < n) {
    const c = s[j];
    if (isSpace(c)) { j++; continue; }
    if (c === '>') { j++; break; }
    if (c === '/') {
      j++;
      if (s[j] === '>') { self = true; j++; break; }
      continue;
    }
    if (c === '{') { j = braces(s, j); continue; }
    const attrStart = j++;
    while (j < n && !isSpace(s[j]) && s[j] !== '/' && s[j] !== '>' && s[j] !== '=') j++;
    attrs.push(s.slice(attrStart, j).toLowerCase());
    while (j < n && isSpace(s[j])) j++;
    if (s[j] !== '=') continue;
    j++;
    while (j < n && isSpace(s[j])) j++;
    const q = s[j];
    if (q === '"' || q === "'") {
      const e = s.indexOf(q, j + 1);
      j = e < 0 ? n : e + 1;
    } else if (q === '{') {
      j = braces(s, j);
    } else {
      while (j < n && !isSpace(s[j]) && s[j] !== '>') j++;
    }
  }
  return { k: 'tag', v: s.slice(i, j), name, end: isEnd, self, attrs };
}

/**
 * Whether the text that follows `tag` is inside an `<option>` with no `value` attribute,
 * whose text is the value the form sends: from such an `<option>` until `</option>`, the
 * next `<option>` or `</select>`, whatever tags sit inside it.
 * @param {Tok} tag @param {boolean} open the state before it @returns {boolean} the state after it
 */
function optionState(tag, open) {
  const name = /** @type {string} */ (tag.name).toLowerCase();
  if (tag.end) return name === 'option' || name === 'select' ? false : open;
  if (name === 'option') return !(/** @type {string[]} */ (tag.attrs)).includes('value');
  return open;
}

/**
 * The end of a raw-text element's content, from just after its start tag: for `<script>`
 * the script-data states (`<!--` escapes, `<script` inside it escapes twice, and only a
 * `</script` outside the double escape ends the block); for the others their closing tag.
 * @param {string} s @param {number} from @param {string} name lower case @returns {number}
 */
function rawEnd(s, from, name) {
  if (name === 'plaintext') return s.length;
  if (name !== 'script') {
    const re = RAW_CLOSE[/** @type {keyof RAW_CLOSE} */ (name)];
    re.lastIndex = from;
    const m = re.exec(s);
    return m ? m.index : s.length;
  }
  let state = 0; // 0 script data, 1 escaped, 2 double escaped
  SCRIPT_MARKS.lastIndex = from;
  let m;
  while ((m = SCRIPT_MARKS.exec(s)) !== null) {
    if (m[0] === '<!--') { if (state === 0) state = 1; }
    else if (m[0] === '-->') state = 0;
    else if (m[1]) { if (state === 2) state = 1; else return m.index; }
    else if (state === 1) state = 2;
  }
  return s.length;
}

/**
 * Tokens of a JSX element from its `<` to the end of its matching closing tag (or of a
 * self-closing tag): tags, the text between them, and `{…}` children as opaque expressions
 * (read as JavaScript). Text inside `<script>`, `<style>`, `<textarea>`, `<template>` and
 * the other raw-text elements, inside a code element, a component or a custom element
 * ({@link holdsText}), or inside an `<option>` with no `value`, is marked `quiet`: never
 * wording.
 * @param {string} s @param {number} i @param {Tok[]|null} out @returns {number} the index after the element
 */
function scanJsx(s, i, out) {
  const n = s.length;
  const open = [];
  let quiet = 0;
  let option = false;
  const quietName = (name) => RAW_TEXT.has(name.toLowerCase()) || name.toLowerCase() === 'template' || holdsText(name);
  const push = (tok) => { if (out) out.push(tok); };
  let j = i;
  while (j < n) {
    /** @type {Tok} */
    let tag;
    if (s[j + 1] === '>') tag = { k: 'tag', v: '<>', name: '', end: false, self: false, attrs: [] };
    else if (s[j + 1] === '/' && s[j + 2] === '>') tag = { k: 'tag', v: '</>', name: '', end: true, self: false, attrs: [] };
    else tag = scanTag(s, j, s[j + 1] === '/', (t, at) => scanJs(t, at, true, null));
    push(tag);
    j += tag.v.length;
    option = optionState(tag, option);
    const name = /** @type {string} */ (tag.name);
    if (tag.end) {
      const closed = open.pop();
      if (closed !== undefined && quietName(closed)) quiet--;
      if (open.length === 0) return j;
    } else if (!tag.self) {
      open.push(name);
      if (quietName(name)) quiet++;
    } else if (open.length === 0) {
      return j;
    }
    let start = j;
    while (j < n && s[j] !== '<') {
      if (s[j] === '{') {
        if (j > start) push({ k: 'text', v: s.slice(start, j), quiet: quiet > 0 || option });
        const e = scanJs(s, j, true, null);
        push({ k: 'expr', v: s.slice(j, e) });
        j = e;
        start = j;
      } else {
        j++;
      }
    }
    if (j > start) push({ k: 'text', v: s.slice(start, j), quiet: quiet > 0 || option });
  }
  return n;
}

/**
 * Rule 4 — the tokens of a whole file. `mode` is `jsx` (`.jsx`, `.tsx`: JavaScript with JSX
 * elements), `vue` (a top-level `<template>` is the component's markup, not raw text, and
 * so is a `<template>` with `v-if`, `v-else-if` or `v-else` and no slot inside it), `svelte`
 * (as `html`, but `<Name />` closes itself), `html` (`.html`, `.htm`) or `md` (Markdown
 * prose, where only `{{…}}` and `{%…%}` are template braces). Any other `<template>` is
 * read as raw text: its text is `quiet`, never wording. So is the text inside a code
 * element, a component or a custom element ({@link holdsText}), each counted by its own
 * name so that another element's end tag does not end it, and the text of `<title>` is
 * read to its closing tag as one text token.
 * @param {string} s the text, line feeds only
 * @param {'jsx'|'vue'|'svelte'|'html'|'md'} mode
 * @returns {Tok[]}
 */
function scanMarkup(s, mode) {
  /** @type {Tok[]} */
  const out = [];
  if (mode === 'jsx') {
    scanJs(s, 0, false, out);
    return out;
  }
  const n = s.length;
  let i = 0;
  let start = 0;
  let template = 0;
  /** @type {boolean[]} per open `<template>`, whether it makes its text quiet */
  const templates = [];
  /** @type {Map<string, number>} the open elements whose text is never wording, by name */
  const holds = new Map();
  let held = 0;
  let option = false;
  const text = (end) => { if (end > start) out.push({ k: 'text', v: s.slice(start, end), quiet: template > 0 || held > 0 || option }); };
  const take = (k, end) => {
    text(i);
    out.push({ k, v: s.slice(i, end) });
    i = end;
    start = end;
  };
  while (i < n) {
    const c = s[i];
    if (c === '<') {
      const d = s[i + 1] || '';
      if (isLetter(d) || (d === '/' && isLetter(s[i + 2] || ''))) {
        text(i);
        const tag = scanTag(s, i, d === '/', skipBraces);
        out.push(tag);
        i += tag.v.length;
        start = i;
        option = optionState(tag, option);
        const name = /** @type {string} */ (tag.name).toLowerCase();
        if (name === 'template' && !tag.self) {
          if (tag.end) { if (templates.length > 0 && templates.pop()) template--; }
          else {
            const attrs = /** @type {string[]} */ (tag.attrs);
            const shown = mode === 'vue' && (templates.length === 0
              || (attrs.some((a) => a === 'v-if' || a === 'v-else-if' || a === 'v-else')
                && !attrs.some((a) => a.startsWith('#') || a.startsWith('v-slot'))));
            templates.push(!shown);
            if (!shown) template++;
          }
        }
        const raw = /** @type {string} */ (tag.name);
        if (holdsText(raw) && !(tag.self && (mode === 'vue' || mode === 'svelte'))) {
          const count = holds.get(raw) || 0;
          if (!tag.end) { holds.set(raw, count + 1); held++; }
          else if (count > 0) { holds.set(raw, count - 1); held--; }
        }
        if (!tag.end && name === 'title') {
          i = rawEnd(s, i, name);
          text(i);
          start = i;
          continue;
        }
        if (!tag.end && RAW_TEXT.has(name)) {
          const end = rawEnd(s, i, name);
          if (end > i) take('raw', end);
        }
        continue;
      }
      if (d === '!' || d === '?' || d === '/') {
        let end;
        if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i + 4); end = e < 0 ? n : e + 3; }
        else if (s.startsWith('<![CDATA[', i)) { const e = s.indexOf(']]>', i + 9); end = e < 0 ? n : e + 3; }
        else { const e = s.indexOf('>', i + 2); end = e < 0 ? n : e + 1; }
        take('comment', end);
        continue;
      }
    } else if (c === '{' && (mode !== 'md' || s[i + 1] === '{' || s[i + 1] === '%')) {
      let end;
      if (mode === 'md') { const e = s.indexOf(s[i + 1] === '{' ? '}}' : '%}', i + 2); end = e < 0 ? n : e + 2; }
      else end = skipBraces(s, i);
      take('expr', end);
      continue;
    }
    i++;
  }
  text(n);
  return out;
}

/**
 * Rule 4 — compare two token sequences: equal in length and kind, every token identical
 * but changed text tokens, each of which `wording` accepts on both sides. Returns the old
 * and new values of the changed text tokens (rule 6 reads them), or null.
 * @param {Tok[]} a @param {Tok[]} b
 * @param {(toks: Tok[], k: number) => boolean} wording
 * @returns {string[]|null}
 */
function changedTexts(a, b, wording) {
  if (a.length !== b.length) return null;
  const runs = [];
  for (let k = 0; k < a.length; k++) {
    if (a[k].k !== b[k].k) return null;
    if (a[k].v === b[k].v) continue;
    if (a[k].k !== 'text' || !wording(a, k) || !wording(b, k)) return null;
    runs.push(a[k].v, b[k].v);
  }
  return runs;
}

/** Characters a markup text token never holds when it changes (template, script or entity starts, a line break). */
const MARKUP_TEXT_BAD = /[{}$`&<\n]/;
/** In JSX, also the characters of code. */
const JSX_TEXT_BAD = /[();="']/;

/**
 * Rule 4 (markup) — a changed text token is visible text: not quiet, on one line, without
 * template, script or entity characters (in JSX also none of code), between two tags; in
 * JSX between an opening tag `<name …>` and its own closing tag `</name`, letter case
 * exact, so a generic type or a comparison chain is never text.
 * @param {Tok[]} toks @param {number} k @param {boolean} jsx @returns {boolean}
 */
function markupWording(toks, k, jsx) {
  const t = toks[k];
  if (t.quiet || MARKUP_TEXT_BAD.test(t.v) || (jsx && JSX_TEXT_BAD.test(t.v))) return false;
  const prev = toks[k - 1];
  const next = toks[k + 1];
  if (!prev || !next || prev.k !== 'tag' || next.k !== 'tag') return false;
  if (!jsx) return true;
  return !prev.end && !prev.self && isLetter((prev.name || '')[0] || '') && Boolean(next.end) && next.name === prev.name;
}

/** @param {Hunk[]} hunks @returns {boolean} every group replaces line for line */
const equalHunks = (hunks) => hunks.length > 0 && hunks.every((h) => h.removed.length > 0 && h.removed.length === h.added.length);

/** Every old/new line pair of equal-size groups, with their line numbers. */
function* linePairs(hunks) {
  for (const h of hunks) {
    for (let i = 0; i < h.removed.length; i++) {
      yield { o: h.removed[i], n: h.added[i], oldLine: h.oldStart + i, newLine: h.newStart + i };
    }
  }
}

/**
 * Rule 4 (message catalogue) — split one line into its key part and its value; `bare` when
 * the value is an unquoted YAML or properties value.
 * @param {string} line
 * @param {string} ext
 * @returns {{key: string, value: string, bare?: boolean, quote?: string}|null}
 */
function catalogueEntry(line, ext) {
  let m;
  if (ext === '.json') {
    // The tail is one run of white space and commas, at most one comma, read in one pass
    // (`\s*,?\s*` tried every split of the white space: 100,000 trailing spaces before a
    // stray character took 3.7 s; `\s*(?:,\s*)?` is refused by the unsafe-pattern lint rule).
    m = /^(\s*"(?:[^"\\]|\\.)*"\s*:\s*)"((?:[^"\\]|\\.)*)"([\s,]*)$/.exec(line);
    return m && m[3].indexOf(',') === m[3].lastIndexOf(',') ? { key: `${m[1]}\u0000${m[3]}`, value: m[2] } : null;
  }
  if (ext === '.po') {
    m = /^(msgstr(?:\[\d\]|\[\d\d\])?[ \t]+)"((?:[^"\\]|\\.)*)"\s*$/.exec(line);
    return m ? { key: m[1], value: m[2] } : null;
  }
  if (ext === '.properties') {
    m = /^(\s*[^\s=:#!][^=:]*[=:][ \t]*)(.*)$/.exec(line);
    return m && !m[2].endsWith('\\') ? { key: m[1], value: m[2], bare: true } : null;
  }
  m = /^(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z0-9_][\w.-]*)[ \t]*:[ \t]+)(.*)$/.exec(line);
  if (!m) return null;
  const value = m[2].trimEnd();
  if (value === '') return null;
  if (value[0] === '"') return /^"(?:[^"\\]|\\.)*"$/.test(value) ? { key: m[1], value: value.slice(1, -1), quote: '"' } : null;
  if (value[0] === "'") return /^'(?:[^']|'')*'$/.test(value) ? { key: m[1], value: value.slice(1, -1), quote: "'" } : null;
  // A plain value that YAML reads as structure, a comment or an alias, never as wording.
  if ('[]{}&*!|>%@`#'.includes(value[0]) || /^[-?:](?:[ \t]|$)/.test(value) || value.includes(' #')
    || value.includes(': ') || value.endsWith(':')) return null;
  return { key: m[1], value, bare: true };
}

/** YAML's double-quoted escapes, by the character after the backslash. */
const YAML_ESCAPES = { 0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029' };
/** Gettext's C escapes (the hexadecimal and octal ones are read apart). */
const C_ESCAPES = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'", '?': '?' };
/** The properties escapes; a backslash before any other character is that character. */
const PROPERTIES_ESCAPES = { t: '\t', n: '\n', r: '\r', f: '\f' };

/**
 * Decode one backslash-escaped value, or null for an escape the format does not know.
 * @param {string} raw
 * @param {Record<string, string>} simple the one-character escapes
 * @param {Record<string, number>} hex fixed-length hexadecimal escapes, by letter
 * @param {'yaml'|'c'|'properties'} format `c` also reads `\x` with any number of digits and octal; `properties` keeps any other escaped character
 * @returns {string|null}
 */
function unescapeValue(raw, simple, hex, format) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') { out += raw[i]; continue; }
    const e = raw[++i];
    if (e === undefined) return null;
    if (format === 'c' && (e === 'x' || (e >= '0' && e <= '7'))) {
      const octal = e !== 'x';
      const from = octal ? i : i + 1;
      let j = from;
      while (j < raw.length && (octal ? j < i + 3 && raw[j] >= '0' && raw[j] <= '7' : /[0-9A-Fa-f]/.test(raw[j]))) j++;
      if (j === from) return null;
      out += String.fromCodePoint(Math.min(parseInt(raw.slice(from, j), octal ? 8 : 16), 0x10ffff));
      i = j - 1;
    } else if (hex[e]) {
      const digits = raw.slice(i + 1, i + 1 + hex[e]);
      if (!/^[0-9A-Fa-f]+$/.test(digits) || digits.length !== hex[e]) return null;
      out += String.fromCodePoint(Math.min(parseInt(digits, 16), 0x10ffff));
      i += hex[e];
    } else if (Object.prototype.hasOwnProperty.call(simple, e)) {
      out += simple[e];
    } else if (format === 'properties') {
      out += e;
    } else {
      return null;
    }
  }
  return out;
}

/**
 * Rule 4 (message catalogue) — the value as the program reads it: a JSON string through
 * `JSON.parse`, a YAML double-quoted value through YAML's escapes (single-quoted: `''` is
 * `'`), a Gettext value through C's, a properties value through its own (a backslash before
 * any other character is that character); null for an escape the format refuses.
 * @param {{value: string, quote?: string}} entry @param {string} ext @returns {string|null}
 */
function decodeValue(entry, ext) {
  if (ext === '.json') {
    try {
      return JSON.parse(`"${entry.value}"`);
    } catch {
      return null;
    }
  }
  if (ext === '.properties') return unescapeValue(entry.value, PROPERTIES_ESCAPES, { u: 4 }, 'properties');
  if (ext === '.po') return unescapeValue(entry.value, C_ESCAPES, {}, 'c');
  if (entry.quote === '"') return unescapeValue(entry.value, YAML_ESCAPES, { x: 2, u: 4, U: 8 }, 'yaml');
  return entry.quote === "'" ? entry.value.replace(/''/g, "'") : entry.value;
}

/**
 * @param {string} s @returns {string} the text without tabs and line breaks, and without
 * control characters and spaces at either end — what a browser keeps of an address
 */
function asAddress(s) {
  const t = s.replace(/[\t\n\r]/g, '');
  let a = 0;
  let b = t.length;
  while (a < b && t.charCodeAt(a) <= 0x20) a++;
  while (b > a && t.charCodeAt(b - 1) <= 0x20) b--;
  return t.slice(a, b);
}

/**
 * Rule 4 (message catalogue) — the value reads as wording. It is decoded first
 * ({@link decodeValue}), then read as a browser reads an address ({@link asAddress}); it
 * needs a letter outside its placeholders, no start like an address (a scheme such as
 * `javascript:`, `/`, `//` or `\`), and, unquoted in YAML or properties, it is no switch
 * (`true`, `off`, `null`, `~`). Returns the read value, which rule 6 then reads, or null.
 * @param {{value: string, bare?: boolean, quote?: string}} entry @param {string} ext
 * @returns {string|null}
 */
function catalogueWording(entry, ext) {
  const decoded = decodeValue(entry, ext);
  if (decoded === null) return null;
  const v = asAddress(decoded);
  const wording = /\p{L}/u.test(v.replace(PLACEHOLDER, '')) && !ADDRESS_START.test(v) && !(entry.bare && BARE_SCALAR.test(v));
  return wording ? v : null;
}

/** @param {string} value @returns {string} the placeholders, sorted, as one comparable string */
const placeholders = (value) => (value.match(PLACEHOLDER) || []).sort().join('\u0000');

/**
 * Rule 4 (colour) — the stylesheet with every string, every `/* … *\/` comment (and in
 * SCSS, Sass and Less every `//` comment) and every unquoted `url(…)` replaced by a filler
 * character of the same length (line breaks kept), so neither a `;`, `{` or `}` nor a
 * colour inside them counts. One pass.
 * @param {string} s @param {boolean} lineComments @returns {string}
 */
function blankCss(s, lineComments) {
  const parts = [];
  const n = s.length;
  let at = 0;
  let i = 0;
  while (i < n) {
    const c = s[i];
    let end = -1;
    if (c === '/' && s[i + 1] === '*') {
      const e = s.indexOf('*/', i + 2);
      end = e < 0 ? n : e + 2;
    } else if (c === '/' && s[i + 1] === '/' && lineComments) {
      const e = s.indexOf('\n', i);
      end = e < 0 ? n : e;
    } else if (c === '"' || c === "'") {
      end = Math.min(skipString(s, i), n);
    } else if ((c === 'u' || c === 'U') && s.slice(i, i + 4).toLowerCase() === 'url(' && !/[\w-]/.test(s[i - 1] || '')) {
      let j = i + 4;
      while (j < n && isSpace(s[j])) j++;
      if (s[j] !== '"' && s[j] !== "'") {
        const e = s.indexOf(')', j);
        end = e < 0 ? n : e + 1;
      }
    }
    if (end < 0) {
      i++;
      continue;
    }
    parts.push(s.slice(at, i), s.slice(i, end).replace(/[^\n]/g, '\u0002'));
    at = end;
    i = end;
  }
  parts.push(s.slice(at));
  return parts.join('');
}

/**
 * Rule 4 (colour) — the statements of a blanked stylesheet: each runs to the `{`, `;` or
 * `}` that ends it (`term`), at the brace depth it starts in. In Sass's indented syntax a
 * line is a statement; it opens a block (`{`) when the next line that is not blank is
 * indented further, and its depth is 1 when it is indented at all.
 * @param {string} blank @param {boolean} sass
 * @returns {Array<{start: number, end: number, term: string, depth: number}>}
 */
function cssStatements(blank, sass) {
  const out = [];
  if (sass) {
    const lines = blank.split('\n');
    const indent = (l) => l.length - l.trimStart().length;
    const starts = [];
    for (let i = 0, at = 0; i < lines.length; at += lines[i].length + 1, i++) starts.push(at);
    let nextIndent = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const own = indent(lines[i]);
      out.push({ start: starts[i], end: starts[i] + lines[i].length, term: nextIndent > own ? '{' : ';', depth: own > 0 ? 1 : 0 });
      if (lines[i].trim() !== '') nextIndent = own;
    }
    return out.reverse();
  }
  let depth = 0;
  let start = 0;
  for (let i = 0; i < blank.length; i++) {
    const c = blank[i];
    if (c !== '{' && c !== ';' && c !== '}') continue;
    out.push({ start, end: i, term: c, depth });
    if (c === '{') depth++;
    else if (c === '}' && depth > 0) depth--;
    start = i + 1;
  }
  out.push({ start, end: blank.length, term: '', depth });
  return out;
}

/**
 * Rule 4 (colour) — every colour token of a whole stylesheet, each standing alone between
 * the separators the plan names, with the property whose declaration value it stands in,
 * or null. Strings, comments and `url(…)` are blanked first ({@link blankCss}), so a
 * fragment address such as `url(#fade)` is never a colour. Whether text is a selector or a
 * declaration is read from the whole file ({@link cssStatements}): a statement that ends in
 * `{` is a selector or a rule's head, wherever its `{` stands; a declaration starts with
 * `name:`, and at depth 0 only a variable or custom property (`$x`, `@x`, `--x`) is one.
 * The property's name must stand on the token's own line. A colour function is read only
 * in its two written forms ({@link colourFunction}). One forward pass.
 * @param {string} text @param {string} ext
 * @returns {Array<{t: string, i: number, j: number, prop: (string|null)}>}
 */
function colourSlots(text, ext) {
  const blank = blankCss(text, ext !== '.css');
  const statements = cssStatements(blank, ext === '.sass');
  const head = /\s*(--[\w-]+|\$[\w-]+|@[\w-]+|[A-Za-z-]+)\s*:/y;
  const re = /#[0-9A-Fa-f]+|(?:rgba?|hsla?)\([^()]*\)|[A-Za-z]+/g;
  const out = [];
  let si = 0;
  let lineStart = 0;
  let nextBreak = blank.indexOf('\n');
  let m;
  while ((m = re.exec(blank)) !== null) {
    const t = m[0];
    const i = m.index;
    const j = i + t.length;
    if (i > 0 && !/[\s:,(]/.test(blank[i - 1])) continue;
    if (j < blank.length && !/[\s;,)}!]/.test(blank[j])) continue;
    const ok = t[0] === '#' ? [4, 5, 7, 9].includes(t.length) : t.includes('(') ? colourFunction(t) : NAMED_COLOURS.has(t.toLowerCase());
    if (!ok) continue;
    while (nextBreak !== -1 && nextBreak < i) {
      lineStart = nextBreak + 1;
      nextBreak = blank.indexOf('\n', lineStart);
    }
    while (statements[si].end < i) si++;
    const st = /** @type {{start: number, end: number, term: string, depth: number, decl?: ({name: string, at: number, valueAt: number}|null)}} */ (statements[si]);
    if (st.decl === undefined) {
      head.lastIndex = st.start;
      const h = st.term === '{' ? null : head.exec(blank);
      st.decl = h && (st.depth > 0 || /^[-$@]/.test(h[1]))
        ? { name: h[1], at: st.start + h[0].length - h[0].trimStart().length, valueAt: head.lastIndex }
        : null;
    }
    const d = st.decl;
    out.push({ t, i, j, prop: d && d.valueAt <= i && d.at >= lineStart ? d.name : null });
  }
  return out;
}

/**
 * Rule 4 (colour) — one number of a colour function: an optional sign, digits with an
 * optional fraction, and an optional `%` or angle unit; or `none`. Read by hand, one pass.
 * @param {string} x @returns {boolean}
 */
function colourNumber(x) {
  if (x.toLowerCase() === 'none') return true;
  let i = x[0] === '+' || x[0] === '-' ? 1 : 0;
  const from = i;
  while (i < x.length && x[i] >= '0' && x[i] <= '9') i++;
  let digits = i - from;
  if (x[i] === '.') {
    const fraction = ++i;
    while (i < x.length && x[i] >= '0' && x[i] <= '9') i++;
    digits += i - fraction;
  }
  return digits > 0 && ['', '%', 'deg', 'rad', 'grad', 'turn'].includes(x.slice(i).toLowerCase());
}

/**
 * Rule 4 (colour) — a colour function in one of its two written forms: three or four
 * comma-separated numbers, or three space-separated numbers with an optional `/ alpha`
 * ({@link colourNumber} each), so `rgb(<11, 94, 215)` is no colour.
 * @param {string} t @returns {boolean}
 */
function colourFunction(t) {
  const inner = t.slice(t.indexOf('(') + 1, -1).trim();
  if (inner.includes(',')) {
    const parts = inner.split(',');
    return (parts.length === 3 || parts.length === 4) && parts.every((x) => colourNumber(x.trim()));
  }
  const [main, alpha, extra] = inner.split('/');
  const parts = main.trim().split(/\s+/);
  return extra === undefined && parts.length === 3 && parts.every((x) => colourNumber(x))
    && (alpha === undefined || colourNumber(alpha.trim()));
}

/** A custom property (`--x`), a Sass variable (`$x`) or a Less variable (`@x`). */
const VARIABLE = /^(?:--|\$|@)/;

/**
 * @param {(string|null)} prop @returns {boolean} a real CSS property whose value is a colour:
 * a name ending in `color` (`color`, `background-color`, `border-color`, `outline-color`,
 * ...) or one of {@link COLOUR_SHORTHANDS}; never a variable or custom property
 */
const colourMayStand = (prop) => prop !== null && !VARIABLE.test(prop)
  && (/(?:^|-)color$/i.test(prop) || COLOUR_SHORTHANDS.has(prop.toLowerCase()));

/**
 * Rule 4 (colour) — every variable and custom property declaration of a whole stylesheet,
 * `name:value` as written (comments and strings in the value included), in order. A
 * script reads a custom property (`getComputedStyle`), and a Sass or Less variable feeds
 * whatever the build makes of it, so any change to one is a setting, whatever it holds.
 * @param {string} text @param {string} ext @returns {string}
 */
function variableDeclarations(text, ext) {
  const blank = blankCss(text, ext !== '.css');
  const head = /\s*(--[\w-]+|\$[\w-]+|@[\w-]+)\s*:/y;
  const out = [];
  for (const st of cssStatements(blank, ext === '.sass')) {
    if (st.term === '{') continue;
    head.lastIndex = st.start;
    const h = head.exec(blank);
    if (h && head.lastIndex <= st.end) out.push(`${h[1]}:${text.slice(head.lastIndex, st.end).trim()}`);
  }
  return out.join('\u0000');
}

/** @param {string} text @param {Array<{i: number, j: number}>} toks @returns {string} the text with each token replaced by one marker, built in one pass */
function masked(text, toks) {
  const parts = [];
  let at = 0;
  for (const t of toks) {
    parts.push(text.slice(at, t.i));
    at = t.j;
  }
  parts.push(text.slice(at));
  return parts.join('\u0001');
}

/**
 * Rule 4 (colour) — the two whole stylesheets differ only in colours that stand in
 * declaration values: with every colour token replaced by one marker the texts are
 * identical (strings and comments included), at least one token differs, and every changed
 * token stands, on both sides, in the value of a real colour property
 * ({@link colourSlots}, {@link colourMayStand}), so `animation: red 2s` and `width: #fff`
 * are never a colour. Linear in the files' length.
 * @param {string} o @param {string} n @param {string} ext @returns {boolean}
 */
function colourEdit(o, n, ext) {
  const a = colourSlots(o, ext);
  const b = colourSlots(n, ext);
  if (a.length !== b.length || masked(o, a) !== masked(n, b)) return false;
  let changed = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k].t === b[k].t) continue;
    changed++;
    if (!colourMayStand(a[k].prop) || !colourMayStand(b[k].prop)) return false;
  }
  return changed > 0;
}

/** Program code — empty the inside of every string literal (a backtick literal with `${` kept). */
function emptyLiterals(line) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c !== '"' && c !== "'" && c !== '`') { out += c; i++; continue; }
    let j = i + 1;
    while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1;
    if (j >= line.length) return out + line.slice(i);
    out += c === '`' && line.slice(i + 1, j).includes('${') ? line.slice(i, j + 1) : c + c;
    i = j + 1;
  }
  return out;
}

/** @param {string} s @returns {string} the text with a carriage return before each line feed removed */
const lineFeeds = (s) => s.replace(/\r\n/g, '\n');

/**
 * Rule 4 (documentation) — how many lines from the top are front matter, which is
 * settings: a first line `---` (after an optional byte-order mark) closed by `---` or
 * `...`; a first line `+++` closed by `+++`; a JSON object whose first line is `{` or
 * starts with `{"`, closed by a line `}` (unclosed, it runs to the end). An unclosed `---` or `+++` is
 * no front matter.
 * @param {string[]} lines @returns {number}
 */
function frontMatterLines(lines) {
  const first = lines[0].replace(/^\uFEFF/, '').trimEnd();
  const close = first === '---' ? /^(?:---|\.\.\.)[ \t]*$/ : first === '+++' ? /^\+\+\+[ \t]*$/ : null;
  if (close) {
    for (let i = 1; i < lines.length; i++) if (close.test(lines[i])) return i + 1;
    return 0;
  }
  if (first !== '{' && !first.startsWith('{"')) return 0;
  for (let i = 0; i < lines.length; i++) if (lines[i].trimEnd() === '}') return i + 1;
  return lines.length;
}

/** @param {string} line @returns {number} the width of its leading white space, a tab to the next multiple of 4 */
function indentWidth(line) {
  let w = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ' ') w++;
    else if (line[i] === '\t') w += 4 - (w % 4);
    else break;
  }
  return w;
}

/** A doctest line, `>>> ` (or `>>>` alone): it and the lines after it up to a blank line are code. */
const DOCTEST = /^[ \t]*>>>(?:[ \t]|$)/;
/**
 * @param {string} line @returns {boolean} a Markdown thematic break (`* * *`, `---`), which
 * is no list item: at most three spaces, then three or more of one of `-`, `*`, `_` with
 * only spaces and tabs between. Read by hand, one pass.
 */
function thematicBreak(line) {
  let i = 0;
  while (i < 3 && line[i] === ' ') i++;
  const c = line[i];
  if (c !== '-' && c !== '*' && c !== '_') return false;
  let count = 0;
  for (; i < line.length; i++) {
    if (line[i] === c) count++;
    else if (line[i] !== ' ' && line[i] !== '\t') return false;
  }
  return count >= 3;
}
/** A Markdown list item's marker and the white space after it; the item must hold text. */
const LIST_ITEM = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]+)\S/;

/**
 * Rule 4 (documentation) — each line of a Markdown file: `settings` (front matter), `code`
 * or `prose`. Code is a fenced block of either fence kind (its fences included, unclosed to
 * the end), an indented block (four columns beyond the list item it stands in, after a
 * blank line or another such line), a list item whose text starts five or more columns
 * after its marker, and a doctest ({@link DOCTEST}), also where an item's text opens a
 * fence or a doctest. The list items are read after CommonMark's rules, so a paragraph
 * indented to an item's content column is prose; any line indented less than an item's
 * content column ends that item (a lazy continuation line is read as ending it too, which
 * only makes more lines code); a thematic break and an item with no text are no items; an
 * ordered item not numbered 1 starts an item only after a blank line or another item; and
 * a fence closes only at its own item's column.
 * @param {string} text line feeds only @returns {string[]}
 */
function markdownLines(text) {
  const lines = text.split('\n');
  const cls = new Array(lines.length).fill('prose');
  const top = frontMatterLines(lines);
  for (let i = 0; i < top; i++) cls[i] = 'settings';
  /** @type {{mark: string, col: number}|null} */
  let fence = null;
  /** @type {number[]} the content columns of the open list items */
  const cols = [];
  let prevBlank = true;
  let prevIndented = false;
  let prevItem = false;
  let doctest = false;
  for (let i = top; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      cls[i] = 'code';
      const close = /^[ \t]*(`+|~+)[ \t]*$/.exec(line);
      const w = indentWidth(line);
      if (close && w >= fence.col && w - fence.col <= 3 && close[1][0] === fence.mark[0] && close[1].length >= fence.mark.length) fence = null;
      continue;
    }
    if (line.trim() === '') {
      prevBlank = true;
      doctest = false;
      continue;
    }
    const w = indentWidth(line);
    while (cols.length > 0 && cols[cols.length - 1] > w) cols.pop();
    const rel = w - (cols.length > 0 ? cols[cols.length - 1] : 0);
    const indented = rel >= 4 && (prevBlank || prevIndented);
    const afterBlank = prevBlank;
    const afterItem = prevItem;
    prevIndented = indented;
    prevBlank = false;
    prevItem = false;
    if (indented) { cls[i] = 'code'; continue; }
    const body = line.trimStart();
    const open = /^(`{3,}|~{3,})/.exec(body);
    if (rel <= 3 && open && !(open[1][0] === '`' && body.slice(open[0].length).includes('`'))) {
      fence = { mark: open[1], col: w - rel };
      cls[i] = 'code';
      continue;
    }
    if (doctest || DOCTEST.test(line)) {
      doctest = true;
      cls[i] = 'code';
      continue;
    }
    let item = rel <= 3 && !thematicBreak(line) ? LIST_ITEM.exec(line) : null;
    // An ordered item that does not start at 1 cannot interrupt a paragraph: it is the
    // paragraph's text, unless a blank line or another item stands right before it.
    if (item && /^\d/.test(item[2]) && Number.parseInt(item[2], 10) !== 1 && !afterBlank && !afterItem) item = null;
    if (item) {
      prevItem = true;
      const after = indentWidth(line.slice(item[1].length + item[2].length).replace(/\S[\s\S]*$/, ''));
      const col = w + item[2].length + (after >= 5 ? 1 : after);
      cols.push(col);
      // The item's own text may open a fence or a doctest, or be indented code.
      const content = line.slice(item[0].length - 1);
      const inner = /^(`{3,}|~{3,})/.exec(content);
      if (after >= 5) cls[i] = 'code';
      else if (inner && !(inner[1][0] === '`' && content.slice(inner[0].length).includes('`'))) {
        fence = { mark: inner[1], col };
        cls[i] = 'code';
      } else if (DOCTEST.test(content)) {
        doctest = true;
        cls[i] = 'code';
      }
    }
  }
  return cls;
}

/** The start of a reStructuredText explicit markup block: a directive, a target, a substitution, a footnote or a comment. */
const RST_DIRECTIVE = /^([ \t]*)\.\.[ \t]/;
/** A directive's name and its `::`, domains included (`py:function::`). */
const RST_DIRECTIVE_NAME = /^([A-Za-z0-9][\w:.+-]*?)::(?:[ \t]|$)/;
/**
 * The directives whose body is prose: the admonitions, `seealso`, `topic`, `sidebar` and
 * `rubric`. Every other directive is code, its line and its indented body.
 */
const RST_PROSE_DIRECTIVES = new Set(['note', 'warning', 'tip', 'important', 'caution', 'danger', 'error', 'hint',
  'attention', 'seealso', 'admonition', 'topic', 'sidebar', 'rubric']);
/** A directive option, `:name:` at the start of the body. */
const RST_OPTION = /^[ \t]+:[^:\s][^:]*:(?:[ \t]|$)/;

/**
 * Rule 4 (documentation) — each line of a reStructuredText file: `code` or `prose`. Code is
 * every directive but the prose ones ({@link RST_PROSE_DIRECTIVES}), with its indented body;
 * a prose directive's options (its body's leading `:name:` lines), and the whole of one
 * whose own line ends in `::` (a literal block follows); a link target
 * `.. _name:` and its indented lines; a literal block, the indented (or quoted, each line
 * starting with the same punctuation) block after a paragraph ending in `::` or a line `::`
 * alone, after a blank line; and a doctest ({@link DOCTEST}). A prose directive's line and
 * body stay prose, read line by line, so a code directive nested in one is code.
 * @param {string} text line feeds only @returns {string[]}
 */
function rstLines(text) {
  const lines = text.split('\n');
  const cls = new Array(lines.length).fill('prose');
  const blank = (k) => lines[k].trim() === '';
  const indent = (k) => lines[k].length - lines[k].trimStart().length;
  /** the last line of the block indented deeper than `col` after line `i` (blank lines between included), or `i` */
  const body = (i, col) => {
    let last = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (blank(j)) continue;
      if (indent(j) <= col) break;
      last = j;
    }
    return last;
  };
  const mark = (from, to) => { for (let k = from; k <= to; k++) cls[k] = 'code'; };
  for (let i = 0; i < lines.length; i++) {
    if (blank(i)) continue;
    const m = RST_DIRECTIVE.exec(lines[i]);
    if (m) {
      let rest = lines[i].slice(m[0].length).trimStart();
      if (rest[0] === '|') rest = rest.slice(rest.indexOf('|', 1) + 1).trimStart(); // a substitution: `.. |name| raw:: html`
      const d = RST_DIRECTIVE_NAME.exec(rest);
      if (d && RST_PROSE_DIRECTIVES.has(d[1].toLowerCase()) && !rest.slice(d[0].length).trimEnd().endsWith('::')) {
        let j = i + 1;
        while (j < lines.length && RST_OPTION.test(lines[j]) && indent(j) > m[1].length) cls[j++] = 'code';
        i = j - 1;
        continue;
      }
      if (d || rest[0] === '_') { // `_`: a link target, `.. _name: address`
        const last = body(i, m[1].length);
        mark(i, last);
        i = last;
      }
      continue;
    }
    if (DOCTEST.test(lines[i])) {
      let j = i;
      while (j + 1 < lines.length && !blank(j + 1)) j++;
      mark(i, j);
      i = j;
      continue;
    }
    if (!lines[i].trimEnd().endsWith('::') || (i + 1 < lines.length && !blank(i + 1))) continue;
    let j = i + 1;
    while (j < lines.length && blank(j)) j++;
    if (j >= lines.length) continue;
    const col = indent(i);
    if (indent(j) > col) {
      const last = body(i, col);
      mark(j, last);
      i = last;
    } else if (indent(j) === col && /^[!-/:-@[-`{-~]/.test(lines[j].trimStart())) {
      const q = lines[j].trimStart()[0];
      let last = j;
      while (last + 1 < lines.length && indent(last + 1) === col && lines[last + 1].trimStart()[0] === q) last++;
      mark(j, last);
      i = last;
    }
  }
  return cls;
}

/**
 * Rule 4 (plain text) — each line of a `.txt` file: `code` for a doctest ({@link DOCTEST}),
 * else `prose`.
 * @param {string} text line feeds only @returns {string[]}
 */
function textLines(text) {
  const lines = text.split('\n');
  const cls = new Array(lines.length).fill('prose');
  let doctest = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') doctest = false;
    else if (doctest || DOCTEST.test(lines[i])) { doctest = true; cls[i] = 'code'; }
  }
  return cls;
}

/**
 * Rule 4 (documentation) — the class of the first changed line that is not prose, on
 * either side, or of the first unchanged line whose class the change moved (a fence or a
 * front matter opened or closed elsewhere); null when every changed line is prose and
 * nothing moved.
 * @param {Hunk[]} hunks @param {string[]} oldCls @param {string[]} newCls @returns {string|null}
 */
function lineClassChange(hunks, oldCls, newCls) {
  const moved = (a, b) => (a === 'settings' || b === 'settings' ? 'settings' : 'code');
  let o = 1;
  let n = 1;
  for (const h of hunks) {
    const oFirst = h.removed.length > 0 ? h.oldStart : h.oldStart + 1;
    const nFirst = h.added.length > 0 ? h.newStart : h.newStart + 1;
    for (; o < oFirst; o++, n++) if (oldCls[o - 1] !== newCls[n - 1]) return moved(oldCls[o - 1], newCls[n - 1]);
    for (let k = 0; k < h.removed.length; k++) if (oldCls[oFirst - 1 + k] !== 'prose') return oldCls[oFirst - 1 + k];
    for (let k = 0; k < h.added.length; k++) if (newCls[nFirst - 1 + k] !== 'prose') return newCls[nFirst - 1 + k];
    o = oFirst + h.removed.length;
    n = nFirst + h.added.length;
  }
  for (; o <= oldCls.length && n <= newCls.length; o++, n++) if (oldCls[o - 1] !== newCls[n - 1]) return moved(oldCls[o - 1], newCls[n - 1]);
  return null;
}

/**
 * Rule 4 (Markdown) — the inline code spans of the prose: a run of backticks closed by the
 * next run of the same length. Returns the spans' contents, joined, and the prose with each
 * span's content blanked (same length, line breaks kept), so that no tag or link inside one
 * counts. Each run is visited once.
 * @param {string} s @returns {{blanked: string, spans: string}}
 */
function codeSpans(s) {
  const spans = [];
  const parts = [];
  let at = 0;
  for (const { from, to } of backtickPairs(s)) {
    spans.push(s.slice(from, to));
    parts.push(s.slice(at, from), s.slice(from, to).replace(/[^\n]/g, '\u0002'));
    at = to;
  }
  parts.push(s.slice(at));
  return { blanked: parts.join(''), spans: spans.join('\u0000') };
}

/**
 * Every pair of backtick runs in the text: a run closed by the next run of the same length.
 * Each run is visited once.
 * @param {string} s @returns {Array<{open: number, from: number, to: number, len: number}>}
 * `open` is the opening run's start, `from` and `to` the content's ends, `len` the run length
 */
function backtickPairs(s) {
  /** @type {Array<[number, number]>} */
  const runs = [];
  for (let i = 0; i < s.length;) {
    if (s[i] !== '`') { i++; continue; }
    let j = i;
    while (j < s.length && s[j] === '`') j++;
    runs.push([i, j - i]);
    i = j;
  }
  /** @type {Map<number, number[]>} */
  const byLength = new Map();
  runs.forEach(([, len], r) => {
    if (!byLength.has(len)) byLength.set(len, []);
    /** @type {number[]} */ (byLength.get(len)).push(r);
  });
  const next = new Map();
  const pairs = [];
  for (let r = 0; r < runs.length;) {
    const [start, len] = runs[r];
    const list = /** @type {number[]} */ (byLength.get(len));
    let p = next.get(len) || 0;
    while (p < list.length && list[p] <= r) p++;
    next.set(len, p);
    if (p === list.length) { r++; continue; }
    const close = list[p];
    pairs.push({ open: start, from: start + len, to: runs[close][0], len });
    r = close + 1;
  }
  return pairs;
}

/**
 * @param {string} t one word, its surrounding punctuation removed @returns {boolean} a
 * reStructuredText simple reference (`guide_`, `guide__`), which links to the target of
 * that name, or a footnote or citation reference (`[1]_`)
 */
function rstReference(t) {
  if (/^\[[^\]]+\]_$/.test(t)) return true;
  let end = t.length;
  if (t[end - 1] !== '_') return false;
  end--;
  if (t[end - 1] === '_') end--;
  const name = t.slice(0, end);
  return /^[A-Za-z0-9][\w.+:-]*$/.test(name) && /[A-Za-z0-9]$/.test(name);
}

/**
 * Rule 4 (reStructuredText) — the inline spans that are never wording, in order: every role
 * span, `:name:` before or after the backquoted text (a role may be defined as `raw` and
 * carry HTML), with its name; every interpreted text without a role (a `default-role` may
 * make it one); every inline literal; the target `<…>` of every hyperlink reference,
 * or its whole text when that text names the target; and then every simple reference
 * (`guide_`, which links to the target `guide`) and footnote reference (`[1]_`).
 * @param {string} s the prose, code lines blanked @returns {string}
 */
function rstSpans(s) {
  const out = [];
  for (const { open, from, to, len } of backtickPairs(s)) {
    const text = s.slice(from, to);
    if (len !== 1) {
      out.push(`\`\`${text}`);
      continue;
    }
    const before = /:[A-Za-z][\w.+-]*:$/.exec(s.slice(Math.max(0, open - 64), open));
    const after = /^:[A-Za-z][\w.+-]*:/.exec(s.slice(to + 1, to + 65));
    if (before || after) out.push(`${before ? before[0] : ''}\`${text}\`${after ? after[0] : ''}`);
    else if (s[to + 1] === '_') out.push(text.slice(Math.max(0, text.lastIndexOf('<'))));
    else out.push(`\`${text}\``);
  }
  for (const word of s.split(/\s+/)) {
    let from = 0;
    let to = word.length;
    while (from < to && '(<{\'"'.includes(word[from])) from++;
    while (to > from && ')>}\'".,;:!?'.includes(word[to - 1])) to--; // by hand: a trailing pattern would rescan
    const t = word.slice(from, to);
    if (rstReference(t)) out.push(t);
  }
  return out.join('\u0000');
}

/** @param {string} label @returns {string} a link label as Markdown matches it */
const labelKey = (label) => label.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Rule 4 (Markdown) — every link and image target of the prose, in order: the `(…)` after
 * `]` (to its matching `)` or the line's end), each reference definition line
 * `[label]: …` with its destination and title where they stand on the following lines,
 * each `[label]` after `]`, and each `[label]` that names a definition. Link
 * text is not part of it. Linear: every search moves forward.
 * @param {string} s the prose, code spans blanked @returns {string}
 */
function linkTargets(s) {
  const out = [];
  for (let i = s.indexOf(']('); i >= 0; i = s.indexOf('](', i + 2)) {
    let j = i + 2;
    if (s[j] === '<') {
      while (j < s.length && s[j] !== '>' && s[j] !== '\n') j++;
    } else {
      let depth = 1;
      while (j < s.length && s[j] !== '\n') {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '(') depth++;
        else if (s[j] === ')' && --depth === 0) break;
        j++;
      }
    }
    j = Math.min(j, s.length);
    out.push(s.slice(i + 2, j));
    i = Math.max(i, j - 2);
  }
  const defined = new Set();
  const lines = s.split('\n');
  const definition = /^ {0,3}\[([^\]\n]*)\]:/;
  for (let i = 0; i < lines.length; i++) {
    const m = definition.exec(lines[i]);
    if (!m) continue;
    out.push(lines[i]);
    defined.add(labelKey(m[1]));
    // CommonMark lets the destination and the title each stand on the next line.
    let rest = lines[i].slice(m[0].length).trim();
    if (rest === '') {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j === lines.length) break;
      if (definition.test(lines[j])) { i = j - 1; continue; } // read as a definition of its own
      out.push(lines[j]);
      rest = lines[j].trim();
      i = j;
    }
    const destination = rest[0] === '<' ? rest.indexOf('>') + 1 || rest.length : rest.search(/\s|$/);
    if (rest.slice(destination).trim() !== '') continue;
    // A title on the next line: from a line that opens one to the next blank line (a title
    // may run over several lines, never over a blank one).
    if (i + 1 < lines.length && /^\s*["'(]/.test(lines[i + 1])) {
      while (i + 1 < lines.length && lines[i + 1].trim() !== '') out.push(lines[++i]);
    }
  }
  let close = -1;
  for (let a = s.indexOf('['); a >= 0;) {
    const after = s.indexOf('[', a + 1);
    if (close <= a) close = s.indexOf(']', a + 1);
    if (close < 0) break;
    if (after < 0 || after > close) {
      const label = s.slice(a + 1, close);
      if (!label.includes('\n') && (s[a - 1] === ']' || defined.has(labelKey(label)))) out.push(`[${label}]`);
    }
    a = after;
  }
  return out.join('\u0000');
}

/**
 * Rule 4 (Markdown) — the cause word of a Markdown change that is not wording, or null.
 * Front matter is settings; a fenced or indented code block is code, and so is an
 * unchanged line whose class the change moved. The rest is read whole, code spans blanked:
 * the code spans and the link targets must be identical, and the HTML scanner's tokens
 * ({@link scanMarkup}, `md` mode) identical but changed prose text, never inside raw text,
 * a template, an `<option>` with no `value` or template braces `{{…}}` / `{%…%}`.
 * @param {ChangedFile} f @returns {('settings'|'code'|null)}
 */
function markdownRefusal(f) {
  const o = lineFeeds(/** @type {string} */ (f.oldText));
  const n = lineFeeds(/** @type {string} */ (f.newText));
  const oc = markdownLines(o);
  const nc = markdownLines(n);
  const moved = lineClassChange(/** @type {Hunk[]} */ (f.hunks), oc, nc);
  if (moved) return /** @type {'settings'|'code'} */ (moved);
  const prose = (text, cls) => {
    const { blanked, spans } = codeSpans(text.split('\n').map((l, i) => (cls[i] === 'prose' ? l : '')).join('\n'));
    return { tokens: scanMarkup(blanked, 'md'), fixed: `${spans}\u0001${linkTargets(blanked)}` };
  };
  const a = prose(o, oc);
  const b = prose(n, nc);
  if (a.fixed !== b.fixed) return 'code';
  return changedTexts(a.tokens, b.tokens, (toks, k) => !toks[k].quiet) ? null : 'code';
}

/**
 * Rule 4 (reStructuredText) — `code` when a changed line, or an unchanged line whose class
 * moved, lies in a code, include or role directive or a link target ({@link rstLines}),
 * when the inline spans that are never wording differ ({@link rstSpans}), or when a changed
 * line holds template braces `{{` or `{%`; else null. Plain text outside them is wording.
 * @param {ChangedFile} f @returns {('code'|null)}
 */
function rstRefusal(f) {
  const hunks = /** @type {Hunk[]} */ (f.hunks);
  const sides = [f.oldText, f.newText].map((t) => {
    const text = lineFeeds(/** @type {string} */ (t));
    const cls = rstLines(text);
    return { cls, spans: rstSpans(text.split('\n').map((l, i) => (cls[i] === 'prose' ? l : '')).join('\n')) };
  });
  if (lineClassChange(hunks, sides[0].cls, sides[1].cls) || sides[0].spans !== sides[1].spans) return 'code';
  return hunks.some((h) => [...h.removed, ...h.added].some((l) => l.includes('{{') || l.includes('{%'))) ? 'code' : null;
}

/**
 * Rule 4 (plain text) — `code` when a changed line, or an unchanged line whose class moved,
 * is a doctest ({@link textLines}); else null.
 * @param {ChangedFile} f @returns {('code'|null)}
 */
function textRefusal(f) {
  const cls = (t) => textLines(lineFeeds(/** @type {string} */ (t)));
  return lineClassChange(/** @type {Hunk[]} */ (f.hunks), cls(f.oldText), cls(f.newText)) ? 'code' : null;
}

/**
 * Rule 4 — place the file in the first kind that fits and judge the whole old and new file
 * with that kind's scanner; a place that governs the work never qualifies, whatever the
 * kind; otherwise the clause of the first other kind it matches.
 * @param {ChangedFile} f
 * @returns {{kind: string, runs: string[]}|{clause: string, cause: string}}
 */
function ruleKind(f) {
  const { base, ext, folders, topFolders } = nameParts(f);
  const d = f.display;
  const lowerBase = base.toLowerCase();
  const unrecognised = { clause: `I do not recognise ${d} as wording or a colour`, cause: 'unrecognised' };
  const setting = { clause: `it changes a setting in ${d}, and settings changes are a common cause of outages`, cause: 'setting' };
  const build = { clause: `it changes how the project is built or shipped in ${d}`, cause: 'build' };
  const isDependency = DEPENDENCY_NAMES.has(base)
    || (ext === '.txt' && (/requirements|constraints/i.test(base) || topFolders.includes('requirements')));
  const governing = governingName(lowerBase)
    || topFolders.some((p, i) => GOVERNING_FOLDERS.has(p) || (p === '.github' && GITHUB_GOVERNING.has(topFolders[i + 1])));
  // Markdown under `.github/` outside `.github/workflows/` is the one documentation a
  // dot-folder may hold; every other dot-folder may be some tool's instructions.
  const githubDoc = (p, i) => p === '.github' && ext === '.md' && topFolders[i + 1] !== 'workflows';
  const dotFolder = topFolders.some((p, i) => p.startsWith('.') && p !== '.' && p !== '..' && !githubDoc(p, i));
  const settingsText = SETTINGS_TEXT_NAMES.has(lowerBase);
  const buildText = BUILD_TEXT_NAMES.has(lowerBase);
  // Markdown under `.github/` is documentation (a contributing guide, an issue template),
  // except under `.github/workflows/`; everything else under a build folder is the build.
  const buildFolder = topFolders.some((p, i) => BUILD_FOLDERS.has(p) && !githubDoc(p, i));

  let kind = null;
  if (DOC_EXT.has(ext) && !isDependency && !buildText && !settingsText) kind = 'documentation';
  else if (MARKUP_EXT.has(ext)) kind = 'markup';
  else if (CATALOGUE_EXT.has(ext) && folders.some((p) => CATALOGUE_FOLDERS.has(p))) kind = 'catalogue';
  else if (COLOUR_EXT.has(ext)) kind = 'colour';
  if (kind !== null && governing) return unrecognised;
  if (kind !== null && buildFolder) return build;
  if (kind === 'documentation' && dotFolder) return unrecognised;

  if (kind === 'documentation') {
    // Rule 2 has already refused a file with a missing side, so both texts are present.
    const refused = ext === '.md' ? markdownRefusal(f) : ext === '.rst' ? rstRefusal(f) : textRefusal(f);
    if (refused) return refused === 'settings' ? setting : unrecognised;
    return { kind, runs: changedWords(f.hunks) };
  }
  if (kind === 'markup') {
    if (!equalHunks(f.hunks)) return unrecognised;
    const jsx = ext === '.jsx' || ext === '.tsx';
    const mode = jsx ? 'jsx' : ext === '.vue' ? 'vue' : ext === '.svelte' ? 'svelte' : 'html';
    const runs = changedTexts(scanMarkup(lineFeeds(/** @type {string} */ (f.oldText)), mode),
      scanMarkup(lineFeeds(/** @type {string} */ (f.newText)), mode), (toks, k) => markupWording(toks, k, jsx));
    return runs ? { kind, runs } : unrecognised;
  }
  if (kind === 'catalogue') {
    if (!equalHunks(f.hunks)) return unrecognised;
    const runs = [];
    for (const pair of linePairs(f.hunks)) {
      const a = catalogueEntry(pair.o, ext);
      const b = catalogueEntry(pair.n, ext);
      if (!a || !b || a.key !== b.key || a.value === b.value || placeholders(a.value) !== placeholders(b.value)) return unrecognised;
      const oldValue = catalogueWording(a, ext);
      const newValue = catalogueWording(b, ext);
      if (oldValue === null || newValue === null) return unrecognised;
      runs.push(oldValue.replace(PLACEHOLDER, ''), newValue.replace(PLACEHOLDER, ''));
    }
    return { kind, runs };
  }
  if (kind === 'colour') {
    const o = lineFeeds(/** @type {string} */ (f.oldText));
    const n = lineFeeds(/** @type {string} */ (f.newText));
    if (variableDeclarations(o, ext) !== variableDeclarations(n, ext)) return setting;
    return equalHunks(f.hunks) && colourEdit(o, n, ext) ? { kind, runs: [] } : unrecognised;
  }

  if (isDependency) return { clause: `it changes the dependencies in ${d}`, cause: 'dependencies' };
  if (ext === '.sql' || topFolders.some((p) => DATABASE_FOLDERS.has(p))) return { clause: `it changes stored data in ${d}`, cause: 'stored-data' };
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.') || BUILD_NAMES.has(base) || buildText || ext === '.gradle'
    || base.endsWith('.gradle.kts') || /^(webpack|vite|rollup|esbuild|babel|tsup|turbo)\.config\./.test(base)
    || buildFolder) {
    return build;
  }
  if (SETTINGS_EXT.has(ext) || settingsText || base === '.env' || base.startsWith('.env.')) return setting;
  if (CODE_EXT.has(ext)) {
    const onlyText = equalHunks(f.hunks) && [...linePairs(f.hunks)].every((p) => emptyLiterals(p.o) === emptyLiterals(p.n));
    return onlyText
      ? { clause: `it changes text inside program code in ${d}, and no check can tell whether people read that text or the program depends on it`, cause: 'text-in-code' }
      : { clause: `it changes program logic in ${d}, and only wording and colours qualify`, cause: 'program-logic' };
  }
  return unrecognised;
}

/** @param {string} part a letter run, lower case @returns {string|null} the sensitive word it is, also in the plural (`s`, `es`) */
function sensitiveWord(part) {
  if (SENSITIVE_WORDS.has(part)) return part;
  if (part.endsWith('es') && SENSITIVE_WORDS.has(part.slice(0, -2))) return part.slice(0, -2);
  if (part.endsWith('s') && SENSITIVE_WORDS.has(part.slice(0, -1))) return part.slice(0, -1);
  return null;
}

/**
 * Rule 5 — not in a sensitive area: no letter run of the path from the repository top is a
 * sensitive word (also in the plural; a stylesheet's own file name aside); the path is no
 * secret-bearing file by CTOC's own secret-file guard (`isSecretTarget`: the word
 * `secret`), and, in CTOC's own repository only, no part of CTOC's enforcement by its
 * protected-paths list (`isProtectedEnforcementPath`: the word `enforcement`), which names
 * CTOC's own files (`src/hooks/`, ...), not another project's. Both lists are CTOC's, read
 * where they live, never copied.
 * @param {ChangedFile} f @param {boolean} ctoc the repository is CTOC's own source
 * @returns {Refusal|null}
 */
function ruleSensitiveArea(f, ctoc) {
  // A stylesheet's own name is no area: `tokens.css` and `design-tokens.css` hold design
  // tokens, not secrets. Its folders still count.
  const named = COLOUR_EXT.has(nameParts(f).ext) ? f.topRel.slice(0, f.topRel.lastIndexOf('/') + 1) : f.topRel;
  let word = null;
  for (const part of named.split(/[^A-Za-z]+/)) {
    word = sensitiveWord(part.toLowerCase());
    if (word) break;
  }
  if (!word && isSecretTarget(f.topRel)) word = 'secret';
  if (!word && ctoc && isProtectedEnforcementPath(f.topRel)) word = 'enforcement';
  return word ? { clause: `${f.display} sits in an area named ${word}, and such areas are never a hotfix`, cause: 'sensitive-area' } : null;
}

/**
 * Rule 6 (documentation) — the words a documentation change alters: for a line replaced
 * line for line, the changed part widened to whole words (runs between white space), so
 * a link or number the edit touches is read whole while a typo fixed beside a link is not;
 * every line of a group that adds or removes lines is read whole. Linear in the lines.
 * @param {Hunk[]} hunks
 * @returns {string[]}
 */
function changedWords(hunks) {
  const runs = [];
  const wordEnd = (line, e) => {
    while (e < line.length && !/\s/.test(line[e])) e++;
    return e;
  };
  for (const h of hunks) {
    if (h.removed.length !== h.added.length) {
      for (const line of [...h.removed, ...h.added]) runs.push(line);
      continue;
    }
    for (let i = 0; i < h.removed.length; i++) {
      const o = h.removed[i];
      const n = h.added[i];
      const { p, s } = commonEnds(o, n);
      let start = p;
      while (start > 0 && !/\s/.test(o[start - 1])) start--;
      runs.push(o.slice(start, wordEnd(o, o.length - s)), n.slice(start, wordEnd(n, n.length - s)));
    }
  }
  return runs;
}

/** Rule 6 — the old and new wording of markup, catalogue and documentation files carries no risk marker. */
function ruleRiskMarker(f) {
  const marker = f.kind === 'documentation' ? DOC_RISK : RISK_MARKER;
  return f.runs.some((r) => marker.test(r))
    ? { clause: `the wording in ${f.display} contains a number, a price, a web address or an e-mail address`, cause: 'risk-marker' }
    : null;
}

/**
 * Rules 2, 7, 4, 5, 6 and 3, in that order; the first failing file of the first failing
 * rule gives the clause. Rule 4 also records each file's kind and wording for rule 6.
 * @param {Change} change
 * @returns {Refusal|null}
 */
function ruleRefusal(change) {
  for (const rule of [ruleSameFiles, ruleNoTestEdited, ruleTextsDiffer]) {
    for (const f of change.files) {
      const r = rule(f);
      if (r) return r;
    }
  }
  for (const f of change.files) {
    const r = ruleKind(f);
    if ('clause' in r) return r;
    f.kind = r.kind;
    f.runs = r.runs;
  }
  // CTOC's own repository, detected as CTOC detects it everywhere (`package.json` named
  // `ctoc` at the project boundary); a change built by hand (the property test) has no top.
  const ctoc = Boolean(change.top) && isCtocProject(/** @type {string} */ (change.top)).isCtocRepo;
  for (const rule of [(f) => ruleSensitiveArea(f, ctoc), ruleRiskMarker]) {
    for (const f of change.files) {
      const r = rule(f);
      if (r) return r;
    }
  }
  const n = change.lineCount;
  const m = change.files.length;
  if (n > MAX_LINES || m > MAX_FILES) {
    return {
      clause: `it changes ${n} ${n === 1 ? 'line' : 'lines'} in ${m} ${m === 1 ? 'file' : 'files'} `
        + `and a hotfix is at most ${MAX_LINES} lines in at most ${MAX_FILES} files`,
      cause: 'too-big'
    };
  }
  return null;
}

/**
 * Rule 8 — run `fn` with the working directory at the copy's project root and
 * `console.log` silenced (the quality agent prints progress lines, which must stay off the
 * menu's JSON), restoring both in `finally`.
 * @template T
 * @param {string} dir
 * @param {() => (T|Promise<T>)} fn
 * @returns {Promise<T>}
 */
async function inProject(dir, fn) {
  const cwd = process.cwd();
  const log = console.log;
  try {
    process.chdir(dir);
    console.log = () => {};
    return await fn();
  } finally {
    console.log = log;
    process.chdir(cwd);
  }
}

/**
 * Rule 8 — the first failing test, read from the run's output: `<file>: <name>`, or
 * whichever of the two was read, or a plain statement that the command failed. Every
 * line-start pattern matches spaces and tabs only, never a line break, so it cannot try
 * every later line from every line start (195 KB of blank lines took 68.6 s that way).
 * @param {string} output standard output and standard error together
 * @param {string} root the copy's project root (real path), so the file reads as the same path in the working folder
 * @returns {string}
 */
function firstFailingTest(output, root) {
  const text = String(output).replace(ANSI, '');
  const lines = text.split(/\r?\n/);
  let name = null;
  let m = /^[ \t]*not ok \d+ - (.+)$/m.exec(text);
  if (m) name = m[1].trim();
  if (!name) {
    for (const line of lines) {
      const s = /^\s*✖ (.+)$/.exec(line);
      if (s && s[1].trim() !== 'failing tests:') { name = s[1].replace(/ \([\d.]+m?s\)$/, '').trim(); break; }
    }
  }
  if (!name && (m = /^[ \t]*● (.+)$/m.exec(text))) name = m[1].trim();
  let file = null;
  for (const re of [/^[ \t]*location: '(.+):\d+:\d+'[ \t]*$/m, /^[ \t]*test at (.+):\d+:\d+[ \t]*$/m, /^[ \t]*FAIL (\S+)/m]) {
    if ((m = re.exec(text))) { file = m[1]; break; }
  }
  if (file !== null) {
    if (file.startsWith('file://')) {
      const written = file;
      // An address with a host (file://server/...) names no local file: it is shown as written.
      try { file = fileURLToPath(file); } catch { file = written; }
    }
    if (path.isAbsolute(file) && within(root, file)) file = path.relative(root, file);
    file = clean(file.replace(/\\/g, '/'));
  }
  if (name !== null) name = clean(name);
  if (file && name) return `${file}: ${name}`;
  return file || name || 'the test command reported a failure';
}

/** @returns {'junction'|'dir'} a link that needs no administrator rights on Windows, read at each call */
const linkType = () => (process.platform === 'win32' ? 'junction' : 'dir');

/**
 * Rule 8, step 5 — link every ignored `node_modules` and every ignored folder holding
 * `pyvenv.cfg` (a Python virtual environment) into the copy at the same path. Before
 * anything is made for one, the deepest existing folder on the way to its parent must lie
 * inside the copy: a symbolic link tracked in the last commit could otherwise send the
 * folder or the link outside it, and the check stops (the entry in `detail`).
 * @param {Context} ctx
 * @param {string} tree the copy's top level
 * @returns {{nodeModules: string[], venvs: string[]}} the linked folders, in the working folder
 */
function linkInstalledPackages(ctx, tree) {
  const top = /** @type {string} */ (ctx.top);
  const treeReal = realPath(tree);
  const linked = { nodeModules: [], venvs: [] };
  const listed = gitOut(ctx, top, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
    { index: ctx.repoIndex }).toString('utf8').split('\0').filter(Boolean);
  for (const entry of listed) {
    const rel = entry.replace(/\/$/, '');
    const abs = path.join(top, ...rel.split('/'));
    const isNodeModules = path.posix.basename(rel) === 'node_modules';
    const venv = statOrNull(path.join(abs, 'pyvenv.cfg'));
    const target = statOrNull(abs);
    if (!(isNodeModules || (venv && venv.isFile())) || !target || !target.isDirectory()) continue;
    const at = path.join(tree, ...rel.split('/'));
    let parent = path.dirname(at);
    while (!lstatOrNull(parent)) parent = path.dirname(parent);
    let parentReal = null;
    try { parentReal = realPath(parent); } catch { parentReal = null; }
    if (parentReal === null || !within(treeReal, parentReal)) throw new Error(rel);
    safeFs.mkdirSync(path.dirname(at), { recursive: true });
    safeFs.symlinkSync(realPath(abs), at, linkType());
    ctx.links.push(at);
    (isNodeModules ? linked.nodeModules : linked.venvs).push(abs);
  }
  return linked;
}

/**
 * Rule 8, step 6 — the folders of the repository that a linked package folder leads the
 * tests to: workspace links inside a linked `node_modules` (a top-level entry, or an entry
 * of an `@scope` folder), and editable Python installs in a linked virtual environment
 * (`.pth` lines and `__editable__…finder.py` string literals that are absolute paths).
 * @param {string} top the repository's top level
 * @param {{nodeModules: string[], venvs: string[]}} linked
 * @returns {string[]} their real paths inside the top level
 */
function installedTargets(top, linked) {
  const targets = new Set();
  const add = (p) => {
    let real;
    try { real = realPath(p); } catch { return; } // a link or path that leads nowhere
    if (within(top, real)) targets.add(real);
  };
  const isLink = (p) => { const st = lstatOrNull(p); return Boolean(st && st.isSymbolicLink()); };
  for (const nm of linked.nodeModules) {
    for (const name of entriesOf(nm)) {
      const p = path.join(nm, name);
      if (isLink(p)) add(p);
      else if (name.startsWith('@')) for (const scoped of entriesOf(p)) if (isLink(path.join(p, scoped))) add(path.join(p, scoped));
    }
  }
  for (const venv of linked.venvs) {
    const lib = path.join(venv, 'lib');
    const sites = [path.join(venv, 'Lib', 'site-packages'),
      ...entriesOf(lib).filter((n) => /^(python|pypy)/.test(n)).map((n) => path.join(lib, n, 'site-packages'))];
    for (const site of sites) {
      for (const name of entriesOf(site)) {
        const file = path.join(site, name);
        const isPth = name.endsWith('.pth');
        if (!isPth && !/^__editable__.*finder\.py$/.test(name)) continue;
        let text;
        try { text = safeFs.readFileSync(file, 'utf8'); } catch { continue; }
        const candidates = isPth
          ? text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !/^import[ \t]/.test(l))
          : [...text.matchAll(/'((?:[^'\\\r\n]|\\.)*)'|"((?:[^"\\\r\n]|\\.)*)"/g)].map((m) => (m[1] !== undefined ? m[1] : m[2]).replace(/\\\\/g, '\\'));
        for (const c of candidates) if (path.isAbsolute(c)) add(c);
      }
    }
  }
  return [...targets];
}

/**
 * Rule 8, step 6 — refuse when other uncommitted work (not a judged file, not under the
 * project's `.ctoc/`) lies in a folder a linked package folder leads the tests to. With
 * none, the working-folder code the links reach equals the last commit plus the judged
 * change, so the run stays exact.
 * @param {Change} change
 * @param {Context} ctx
 * @param {{nodeModules: string[], venvs: string[]}} linked
 */
function refuseWorkBehindLinks(change, ctx, linked) {
  const top = /** @type {string} */ (ctx.top);
  const targets = installedTargets(top, linked);
  if (targets.length === 0) return;
  const read = (args) => gitOut(ctx, top, args, { index: ctx.repoIndex }).toString('utf8').split('\0').filter(Boolean);
  const judged = new Set(change.files.map((f) => f.topRel));
  const ctoc = change.rootFromTop ? `${change.rootFromTop}/.ctoc/` : '.ctoc/';
  const work = [...read(['diff', 'HEAD', '--name-only', '-z', ...FIXED_DIFF]), ...read(['ls-files', '--others', '--exclude-standard', '-z'])]
    .filter((p) => !judged.has(p) && !p.startsWith(ctoc))
    .map((p) => path.join(top, ...p.split('/')));
  const shown = targets.map((t) => ({ t, display: slash(path.relative(change.root, t)) }))
    .sort((a, b) => (a.display < b.display ? -1 : 1));
  for (const { t, display } of shown) {
    if (work.some((w) => within(t, w))) {
      throw new Unreadable(`other uncommitted work is in code the tests load through installed packages: ${display}`);
    }
  }
}

/**
 * Rule 8 — make the temporary copy (the last commit plus exactly the judged change),
 * compare the bytes, link the installed packages, run the tests there, hash again.
 * @param {Change} change
 * @param {Context} ctx
 * @returns {Promise<Refusal|{tests: string}>}
 */
async function ruleTestsInCopy(change, ctx) {
  const top = /** @type {string} */ (ctx.top);
  const head = /** @type {string} */ (ctx.head);
  const tree = path.join(/** @type {string} */ (ctx.tmp), 'tree');
  gitOut(ctx, top, ['worktree', 'add', '--detach', '--quiet', tree, head]);
  ctx.worktree = tree;

  // The patch, from the temporary index rule 1 staged the judged files in (the bytes the
  // rules judged); the repository's index is never named.
  for (const f of change.files) {
    if (f.stagedId !== f.firstHash) throw new Unreadable(`${f.display} changed while it was being checked`);
  }
  const patch = gitOut(ctx, top, ['-c', 'diff.suppressBlankEmpty=false', 'diff', '--cached', head, '--binary', '--full-index',
    '-U3', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-relative', '--src-prefix=a/', '--dst-prefix=b/'],
  { index: ctx.stageIndex });
  if (patch.length > 0) {
    const applied = runGit(ctx, tree, ['-c', 'apply.ignoreWhitespace=no', 'apply', '--whitespace=nowarn'], { input: patch });
    if (applied.status !== 0) {
      throw new Unreadable('the change does not apply cleanly to a fresh copy of the last commit',
        clean(applied.stderr.toString('utf8').split('\n')[0]));
    }
  }

  refuseWorkBehindLinks(change, ctx, linkInstalledPackages(ctx, tree));

  const copyRoot = path.join(tree, ...change.rootFromTop.split('/').filter(Boolean));
  const run = await inProject(copyRoot, async () => {
    const tools = require('./tool-detector').detectTools(copyRoot).tools;
    if (!Object.values(tools).some((t) => t && t.test)) return null;
    const coverageMap = require('./coverage-map');
    const selected = change.files.map((f) => coverageMap.findTestsByHeuristic(path.join(tree, ...f.topRel.split('/'))));
    const qa = require('./quality-agent');
    return selected.every((s) => s.length > 0)
      ? qa.runSpecificTests(tools, [...new Set(selected.flat())])
      : await qa.runFullTests(tools);
  });

  const second = hashJudged(ctx, change.files);
  for (const f of change.files) {
    if (second.get(f.topRel) !== f.stagedId) throw new Unreadable(`${f.display} changed while it was being checked`);
  }

  if (run === null) {
    return change.files.every((f) => f.kind === 'documentation') ? { tests: DOC_ONLY } : NO_TEST_RAN;
  }
  if (run.passed === true && run.passCount > 0) return { tests: `${run.passCount} ${run.passCount === 1 ? 'test' : 'tests'} passed.` };
  // A run that never started, could not be read, or whose command was refused before it ran
  // (shell structure in a tracked quality setting) is "no test ran", never a failing test.
  if (run.passed === true || run.undetermined || run.refused) return NO_TEST_RAN;
  return { clause: `the existing tests fail (${firstFailingTest(run.output, copyRoot)})`, cause: 'tests-fail' };
}

/**
 * Remove everything the check made, in this order, stopping at the first failure: every
 * link by itself (never the folder it points to; one already gone, or whose folder is gone,
 * counts as removed), the copy's own worktree registration and files (`worktree remove
 * --force`; nothing is pruned; git refuses a worktree that is no longer the one it
 * registered), then the temporary folder. Before each link is unlinked, its folder's real
 * path must still lie inside the temporary folder: the tests may have replaced the copy, or
 * a folder in it, by a link to somewhere else, and unlinking through that would delete a
 * file outside the copy; then removal stops and says so. Runs once: a second call (the
 * signal handler's, or the normal path's after it) finds nothing to do. Never throws.
 * @param {Context} ctx
 * @returns {(string|null)} what could not be removed, for `detail`
 */
function removeCopy(ctx) {
  const tmp = ctx.tmp;
  if (!tmp) return null;
  ctx.tmp = null;
  try {
    for (const link of ctx.links) {
      let folder;
      try {
        folder = realPath(path.dirname(link));
      } catch {
        continue; // its folder is gone, and the link with it
      }
      if (!within(tmp, folder)) throw new Error("a link's folder moved outside it");
      try {
        safeFs.unlinkSync(link);
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err;
      }
    }
    if (ctx.worktree) gitOut(ctx, /** @type {string} */ (ctx.top), ['worktree', 'remove', '--force', ctx.worktree]);
    safeFs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return null;
  } catch (err) {
    return clean(`the temporary copy at ${tmp} could not be removed: ${messageOf(err)}`);
  }
}

/** The signals a person or a supervisor ends a process with. */
const ENDING_SIGNALS = /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP']);

/**
 * While the copy exists, a SIGINT, SIGTERM or SIGHUP first removes it (the same synchronous
 * {@link removeCopy}), then removes these handlers and raises the signal again, so the
 * process still ends the way it was told to. A signal that arrives while a test runs is
 * handled when that run returns: `spawnSync` blocks the process, and Node cannot end the
 * test's own process group from here (the plan's Risks).
 * @param {Context} ctx
 * @returns {() => void} removes the handlers
 */
function guardSignals(ctx) {
  const uninstall = () => {
    for (const signal of ENDING_SIGNALS) process.removeListener(signal, handler);
  };
  /** @param {NodeJS.Signals} signal */
  function handler(signal) {
    uninstall();
    removeCopy(ctx);
    process.kill(process.pid, signal);
  }
  for (const signal of ENDING_SIGNALS) process.on(signal, handler);
  return uninstall;
}

/** @param {string} s @returns {string} the path single-quoted; the name check leaves nothing to escape */
const quoted = (s) => `'${s}'`;

/**
 * Judge the change. Returns the screen and, for a final answer, the cause and the change.
 * Never throws: anything unexpected becomes the "check stopped" clause, and the copy is
 * removed on every path.
 * @param {string} root
 * @param {string[]} named
 * @param {boolean} runTests
 */
async function judge(root, named, runTests) {
  /** @type {Context} */
  const ctx = { top: null, head: null, tmp: null, noHooks: null, repoIndex: null, stageIndex: null, worktree: null, links: [] };
  /** @type {Change|null} */
  let change = null;
  /** @type {Refusal|{tests: string}|{checking: true}} */
  let outcome;
  let unguard = () => {};
  try {
    makeTmp(ctx);
    unguard = guardSignals(ctx);
    change = readChange(root, named, ctx, runTests);
    outcome = ruleRefusal(change) || (runTests ? await ruleTestsInCopy(change, ctx) : { checking: true });
  } catch (err) {
    outcome = err instanceof Unreadable
      ? { clause: `I could not read the change (${err.why})`, cause: 'unreadable', detail: err.detail }
      : { clause: 'I could not read the change (the check stopped)', cause: 'unreadable', detail: clean(messageOf(err)) };
  }
  const removal = removeCopy(ctx);
  // One turn of the event loop first, so a signal that arrived while a test ran reaches its
  // handler (which then ends the process) instead of being dropped with the handlers.
  await new Promise((resolve) => setImmediate(resolve));
  unguard();
  const detail = [/** @type {Refusal} */ (outcome).detail, removal].filter(Boolean).join('; ');
  const tail = { ...(detail ? { detail } : {}), ask: { questions: [] }, actions: {} };

  if ('checking' in outcome) {
    // `--` only when a judged name starts with `-`: the usual `next` stays exactly the
    // acceptance criterion's, and a name such as `--x.md` still reaches the test run.
    const dashes = change.files.some((f) => f.display.startsWith('-')) ? '-- ' : '';
    const next = `hotfix check --run-tests ${dashes}${change.files.map((f) => quoted(f.display)).join(' ')}`;
    return { screen: { verdict: 'checking', text: STATUS_LINE, next, ...tail }, cause: undefined, change };
  }
  if ('tests' in outcome) {
    const files = change.files.map((f) => f.display);
    const list = files.map(quoted).join(' ');
    const commit = {
      files,
      add: `git --literal-pathspecs add -- ${list}`,
      message: `git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- ${list}`,
      // What was judged, by id, so that slice 2's gate can compare the real commit with it
      // (a project's own pre-commit hook may rewrite or add files while it commits).
      judged: change.files.map((f) => ({ path: f.display, blob: /** @type {string} */ (f.stagedId) }))
    };
    return { screen: { verdict: 'hotfix', text: '', tests: outcome.tests, commit, ...tail }, cause: null, change };
  }
  return {
    screen: { verdict: 'refused', text: `${SENTENCE_HEAD}${outcome.clause}${SENTENCE_TAIL}`, ...tail },
    cause: outcome.cause,
    change: outcome.cause === 'unreadable' ? null : change
  };
}

/**
 * The log of verdicts — append one line per final answer; best effort, never throws.
 * Never written through a link: the project is the owner's working tree and may be a
 * cloned repository that commits `.ctoc/logs/hotfix-checks.jsonl` as a link to some other
 * file. The project root is resolved to its real path; `.ctoc` and `.ctoc/logs` must each
 * be a real folder (created one level at a time when missing) and the log a regular file
 * with one link (so a hard link to another file is never appended to); an existing log is
 * opened without following a link where the platform has that flag, a new one created
 * exclusively, and the open descriptor must show the same single-link file. Above 1 MiB
 * the log is renamed to `.1` (replacing an older one) and a new one is started; no file
 * is ever emptied.
 * @param {string} root
 * @param {{at: string, verdict: string, cause: (string|null), urgent: boolean, files: number, lines: number}} entry
 * @returns {boolean} whether the line was written (the caller's answer never depends on it)
 */
function logVerdict(root, entry) {
  try {
    const ctoc = path.join(realPath(root), '.ctoc'); // a missing project folder throws: never created
    const dir = path.join(ctoc, 'logs');
    const file = path.join(dir, 'hotfix-checks.jsonl');
    for (const folder of [ctoc, dir]) {
      if (!lstatOrNull(folder)) safeFs.mkdirSync(folder);
      if (!safeFs.lstatSync(folder).isDirectory()) return false; // a link or a file: never written through
    }
    // lstat, never existsSync: a dangling link must read as a link, not as "absent".
    let st = lstatOrNull(file);
    if (st && (!st.isFile() || st.nlink !== 1)) return false;
    if (st && st.size > LOG_MAX_BYTES) {
      safeFs.renameSync(file, `${file}.1`);
      st = null;
    }
    const { O_WRONLY, O_APPEND, O_CREAT, O_EXCL, O_NOFOLLOW } = fs.constants;
    const flags = O_WRONLY | O_APPEND | (st ? 0 : O_CREAT | O_EXCL) | (O_NOFOLLOW || 0);
    const fd = safeFs.openSync(file, flags, 0o644);
    try {
      const now = fs.fstatSync(fd);
      if (!now.isFile() || now.nlink !== 1 || (st && (now.dev !== st.dev || now.ino !== st.ino))) return false;
      fs.writeSync(fd, `${JSON.stringify(entry)}\n`);
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch {
    // The verdict is already decided; a log that cannot be written is reported to the
    // caller as not written and never changes the answer.
    return false;
  }
}

/**
 * The `hotfix` menu route. `hotfix check [--run-tests] [--] [<file> ...]` judges the
 * change; after `--` every word is a file. Anything else answers the usage text. Never rejects: a fault can never read as a pass.
 * Every final answer (a pass or a refusal) appends one line to the log of verdicts.
 * @param {string[]} subArgs the words after `hotfix`
 * @param {string} root the project root
 * @returns {Promise<Object>} the menu screen (`text`, `ask`, `actions`, `verdict`, ...)
 */
async function hotfixRoute(subArgs, root) {
  const args = subArgs.map(String);
  const usage = (x) => ({ ok: false, text: `Unknown hotfix command: ${clean(x)}. ${USAGE}`, ask: { questions: [] }, actions: {} });
  if (args[0] !== 'check') return usage(args[0] === undefined ? '(none)' : args[0]);
  let runTests = false;
  const named = [];
  let options = true;
  for (const a of args.slice(1)) {
    if (options && a === '--') options = false;
    else if (options && a === '--run-tests') runTests = true;
    else if (options && a.startsWith('--')) return usage(a);
    else named.push(a);
  }
  const { screen, cause, change } = await judge(root, named, runTests);
  if (cause !== undefined) {
    logVerdict(root, {
      at: new Date().toISOString(), verdict: screen.verdict, cause, urgent: false,
      files: change ? change.files.length : 0, lines: change ? change.lineCount : 0
    });
  }
  return screen;
}

// `ruleRefusal` is the rules 2 to 7 that `judge` runs; the corpus's property test reads it
// directly, with thousands of edited texts and no git call.
module.exports = { hotfixRoute, ruleRefusal };
