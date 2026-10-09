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
 * THE RULES. They run in this order: 1, 2, 7, the kind of each file (the first half of rule
 * 4), 3, the content of each file (the rest of rule 4), 5, 6, and 8 last. The first that
 * fails gives the clause; files are looked at in sorted display-path order:
 *   1  the change can be read            — a git repository with a commit, the project
 *                                          inside it, every judged name one the commit
 *                                          command can carry, no index bit that hides the
 *                                          working file, every file text
 *   2  same files, same names            — nothing added, removed, renamed, re-moded, linked
 *   7  no test is edited                 — fix the code, not the tests
 *   4  only kinds that qualify           — documentation (Markdown, and plain text under a
 *                                          documentation name), visible text in
 *                                          plain HTML, message catalogue values (JSON, YAML,
 *                                          properties), colour values in plain CSS; these are the
 *                                          formats the check reads exactly (the owner's decision of
 *                                          2026-10-09), and a Vue, Svelte, JSX, TSX, MDX,
 *                                          reStructuredText, Sass, Less or gettext file is a kind it
 *                                          does not recognise; never in a place that governs the work
 *                                          (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`,
 *                                          `GEMINI.md`, `CONVENTIONS.md`, GitHub's assistant
 *                                          files, `.cursor/`, `.windsurf/`, `.clinerules/`,
 *                                          `.roo/`, `.kiro/`, `.junie/`, `.amazonq/`,
 *                                          `.continue/` and the governing folders), never in a
 *                                          build folder (`.github/` but its Markdown outside
 *                                          `workflows/`, `.changeset/`, ...); `robots.txt` and
 *                                          its kind are settings; a `.txt` named like
 *                                          `requirements` is a dependency list, and any other
 *                                          `.txt` without a documentation name (`README`,
 *                                          `CHANGELOG`, `NOTES`, ...) is not recognised; a legal
 *                                          text (`LICENSE`, `COPYING`, `NOTICE`, ...) never
 *                                          qualifies and is named as a sensitive area.
 *                                          EACH KIND IS JUDGED WHOLE, one scanner per side:
 *                                          HTML by a token stream after the HTML tokenizer, in a
 *                                          STRICT SUBSET in which the reader agrees with a browser's
 *                                          parser by construction (the session's decision of
 *                                          2026-10-09), held to the HTML standard's parser by a
 *                                          differential test (the decision at review of that day:
 *                                          `tests/hotfix-check-differential.test.js`, parse5 with
 *                                          scripting on and off); a file that holds anything outside
 *                                          it is refused whole: a brace inside a tag, a `<!…` that is
 *                                          no `<!DOCTYPE html>` and no standard comment, `<?`, a tag
 *                                          inside `<select>` that is no option, `<frameset>` and
 *                                          `<frame>`, an end tag that closes neither the element on
 *                                          top of the stack nor one that may leave its end tag out
 *                                          before it, a start tag for which a browser would close
 *                                          an element that is not on top, anything but white space
 *                                          and comments after `</body>`, `<noscript>` content that
 *                                          is not itself such markup, an element never closed. Tags
 *                                          with every attribute, raw text and comments are compared
 *                                          exactly, `<svg>` and `<math>` each as one opaque piece;
 *                                          only text between two tags or comments may change (over
 *                                          line breaks too; a `&` only as one of a few plain
 *                                          character references), never inside raw text, a
 *                                          `<select>` outside an `<option>` with a `value`, or an
 *                                          element that holds its text: a code element, a
 *                                          `<template>`, an element with an `is` attribute, a custom
 *                                          element and every name outside the fixed list of 111 HTML
 *                                          elements; a `<title>` is text); stylesheets by statements
 *                                          across the whole file (strings, comments and `url(…)`
 *                                          blanked), a colour only as the whole value of a real
 *                                          colour property on its line, and a change to a custom
 *                                          property a setting unless the property is named for a
 *                                          colour and holds exactly one colour before and after;
 *                                          Markdown and plain text as PURE PROSE (the decision at
 *                                          review of 2026-10-09: Markdown is not one language, and
 *                                          no reader agrees with every renderer on structure): only
 *                                          the words of plain prose lines may change, in a paragraph
 *                                          bounded by empty lines, outside front matter, code fences
 *                                          and whatever follows raw HTML, with nothing else in the
 *                                          file changed (held to markdown-it in four configurations
 *                                          by the same differential test); a
 *                                          catalogue value is decoded as its format reads it and
 *                                          read as a browser reads an address, each line only where
 *                                          it starts an entry.
 *                                          EVERY SCANNER FAILS CLOSED: a side that ends inside an
 *                                          unfinished construct, or holds one its scanner cannot
 *                                          follow, makes the change unreadable
 *   5  not in a sensitive area           — 33 whole words, also in the plural, in the path from
 *                                          the repository top (auth, login, ...; in a stylesheet's
 *                                          own file name not in the plural), the path folded first
 *                                          (Unicode NFKC, lower case), split at every character that
 *                                          is no letter, and each camel-case sub-word read too
 *                                          (`AuthPanel` is `auth`, `Author` is not); CTOC's own secret-file guard,
 *                                          and in CTOC's own repository its protected paths; the test,
 *                                          governing, build and database folders are read from
 *                                          the top too
 *   6  no risk marker in wording         — no number, currency, %, address, e-mail, code;
 *                                          in documentation, in the changed words only, and
 *                                          there also no word of 7 to 40 hexadecimal digits
 *   3  size                              — at most 20 changed lines in at most 3 files
 *   8  the existing tests pass           — only in the `--run-tests` call, in a copy
 * Rule 7 and the kind of each file (rule 4: where it is placed by its name and its place) run
 * before size because the functional plan's own scenarios name an edited test and the kind of
 * change ahead of size. Size then runs BEFORE any reader reads a file's content (the rest of
 * rule 4), before rule 5 and before rule 6 (the decision at review of 2026-10-09), so a change
 * over the limit gets the size clause the functional plan's scenario expects whatever its
 * content holds. All of 2 to 7 read the same diff, so the order costs nothing, and the tests
 * still run last.
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
 *   (three causes)       it changes <file> in a way the check cannot read exactly, and only what it can read exactly qualifies
 *                        — the functional plan's clause for a file whose format the check reads
 *                        but whose change it cannot vouch for, each case under the cause word it
 *                        had before: `unrecognised` for text inside a component or custom element
 *                        or inside `<svg>` or `<math>`, a Markdown or documentation-named text
 *                        change that is anything but a wording change in pure prose, and a colour
 *                        that is not the whole value of a colour property; `unreadable` for HTML
 *                        outside the strict subset; `setting` for a custom property named for a
 *                        colour whose value is not exactly one colour
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
/*
 * THE FORMATS THAT ARE READ (the owner's decision of 2026-10-09). Only the formats the check
 * can read exactly qualify: plain HTML, colours in plain CSS, catalogue wording in JSON,
 * YAML and Java properties files, and prose in Markdown and plain text. Vue, Svelte, JSX and
 * TSX, MDX, reStructuredText, Sass, Less and gettext files are no longer read: each needs
 * its own compiler to say what a change does, a hand-written reader disagreed with that
 * compiler round after round, and so such a file is a kind the check does not recognise and
 * goes through a normal plan.
 */
/** Markdown, and plain text (which qualifies only under a documentation name: {@link documentationText}). */
const DOC_EXT = new Set(['.md', '.txt']);
const MARKUP_EXT = new Set(['.html', '.htm']);
const CATALOGUE_EXT = new Set(['.json', '.yaml', '.yml', '.properties']);
const CATALOGUE_FOLDERS = new Set(['locales', 'locale', 'i18n', 'lang', 'translations', 'messages']);
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
/** The documentation names under which plain text qualifies ({@link documentationText}). */
const DOC_TEXT_NAMES = new Set(['readme', 'changelog', 'changes', 'news', 'history', 'authors', 'contributors', 'notes', 'install', 'humans']);
/**
 * Plain text qualifies only under a documentation name (the decision at review of
 * 2026-10-09), in any letter case, optionally with a language part: `README.txt`,
 * `README.en.txt`, `README.pt-BR.txt` (two or three letters, then at most two parts of two to
 * eight letters or digits behind `-` or `_`). Every other `.txt` is a kind the check does not
 * recognise: a list of dependencies, a template with placeholders, a list of exclusions,
 * build options.
 * @param {string} lower the base name, lower case @returns {boolean}
 */
function documentationText(lower) {
  const parts = lower.split('.');
  if (parts.length < 2 || parts.length > 3 || parts[parts.length - 1] !== 'txt' || !DOC_TEXT_NAMES.has(parts[0])) return false;
  if (parts.length === 2) return true;
  const [language, ...more] = parts[1].split(/[-_]/);
  return /^[a-z]{2,3}$/.test(language) && more.length <= 2 && more.every((part) => /^[a-z0-9]{2,8}$/.test(part));
}
/**
 * Legal texts never qualify, `.md` or `.txt` (the decision at review of 2026-10-09): for each
 * start of a file name, in lower case, the sensitive word the refusal names. The functional
 * plan's clause for a sensitive area fits, and its words `license` and `legal` are these.
 */
const LEGAL_NAMES = [['license', 'license'], ['licence', 'license'], ['copying', 'legal'], ['notice', 'legal'], ['patents', 'legal'], ['legal', 'legal']];
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
/** Documentation's risk markers, read in the changed words only: a number, a price, a web address, an e-mail address (and {@link HEX_WORD}). */
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
 * Rule 1 — decode one side of a file as text, or refuse: a zero byte or invalid UTF-8. A
 * leading byte-order mark stays in the text (`ignoreBOM`), so that one that comes or goes is
 * a change the rules see; the HTML reader takes one off, as a browser does.
 * @param {Buffer} buf
 * @param {string} display
 * @returns {string}
 */
function asText(buf, display) {
  if (buf.includes(0)) throw new Unreadable(`${display} is not text`);
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
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
 * THE MARKUP SCANNER (rule 4: HTML). THE STRICT SUBSET
 * (the session's design decision of 2026-10-09, after the owner's decision that the check
 * keeps only what it can read exactly): the scanner reads only the part of HTML in which it
 * agrees with a browser's parser by construction, and refuses the whole file for anything
 * outside it; it never copies the browser's recovery rules. HELD TO REAL PARSERS (the
 * decisions at review of 2026-10-09): `tests/hotfix-check-differential.test.js` generates
 * documents and edits, and for every edit the check passes requires that parse5, the HTML
 * standard's parser, with scripting on and off, reads the same tree on both sides but for one
 * text node outside every element that holds its text; and it holds one witness document for
 * every rule below, so that a rule taken out is noticed. One pass, after the HTML tokenizer:
 * data; a tag (its name, attribute names, unquoted, single- and double-quoted values, `/>`);
 * `<!DOCTYPE html>` and a standard comment; raw text after `<script>` (with the script-data
 * escape states), `<style>`, `<textarea>`, `<title>`, `<xmp>`, `<iframe>`, `<noembed>`,
 * `<noframes>` and `<plaintext>`; `<svg>` and `<math>` from their start tag to their matching
 * end tag as one opaque piece. Character references stay part of their token. A browser
 * knows no braces: in text they are plain characters. Names are lower-cased as HTML does it,
 * the ASCII letters only.
 * OUTSIDE THE SUBSET, each refusing the whole file ({@link outside}):
 *   - a `{` or `}` anywhere inside a tag;
 *   - anything that starts `<!` but `<!DOCTYPE html>` (any letter case; any other doctype
 *     puts a browser in quirks mode, where a table nests otherwise) and a standard comment
 *     (`<!--`, not followed at once by `>` or `->`, holding no `<!--` and no `--!>`, not
 *     ending in `<!-`, closed by the first `-->`); `<![CDATA[`, `<?` and `</` before anything
 *     but a letter; the same comment rule inside a script block;
 *   - anything but white space before the doctype (text or a tag there puts a browser in
 *     quirks mode; a comment does not, and the decision refuses it all the same);
 *   - an unfinished tag, attribute quote or comment; an attribute name that starts with `<`,
 *     `"`, `'` or `=`;
 *   - inside `<svg>` or `<math>`: an end tag that does not close the element on top, any
 *     tag inside an element where a browser reads HTML again (`foreignObject`, `desc`,
 *     `title`, `mi`, `mo`, `mn`, `ms`, `mtext`, `annotation-xml`), an HTML element's name
 *     other than `a`, `script`, `style` and `title` (a browser leaves the foreign content at
 *     many of them), and an `<svg>` or `<math>` that is never closed;
 *   - inside `<select>`: any tag but `<option>`, `<optgroup>`, `<hr>` and their end tags
 *     (older parsers ignore every other tag there, a `<style>` among them, newer ones do not);
 *   - `<frameset>` and `<frame>`; an `is` attribute on `<html>` or `<body>`;
 *   - an end tag that closes neither the element on top of the stack nor one above which
 *     only elements stand that may leave their end tag out before it ({@link IMPLIED_END});
 *   - a start tag for which a browser closes an open element that is not on top of the
 *     stack ({@link P_CLOSERS}), a part of a table where no table has it, a `<table>` among
 *     another table's rows, a `<form>` in a `<form>`;
 *   - a `<noscript>` whose end tag does not stand exactly where its raw text ends, or does
 *     not find it on top of the stack;
 *   - anything but white space, comments and `</body>` or `</html>` after one of those two,
 *     and text directly inside `<colgroup>`;
 *   - an element that is never closed, a raw-text element among them.
 * Every token is a slice of the text, and the slices cover it, so two token sequences that
 * are identical are two identical texts. No pattern backtracks: the scanner moves forward.
 */

/** @typedef {{k: string, v: string, name?: string, end?: boolean, attrs?: string[], self?: boolean, quiet?: boolean, inexact?: boolean, lead?: boolean}} Tok */

/*
 * EVERY SCANNER FAILS CLOSED. A scanner that ends inside an unfinished construct (a string,
 * a stylesheet comment or block) reports `open`; one that meets a
 * construct it cannot follow where it expects structure (a string running into a line
 * break; a `}` with nothing open; a custom property whose value opens a block; a catalogue
 * line that starts no entry) reports `lost`; the markup scanner reports `subset` for
 * anything outside its strict subset. Rule 4 resets the report before it judges a file and
 * refuses the change when either side reported one: a scanner that lost its place never
 * falls through to text.
 */
/** @type {('open'|'lost'|'subset'|null)} the first fault the scanners met since rule 4 last reset it */
let scanFault = null;
/** @param {'open'|'lost'} kind */
const fault = (kind) => { if (scanFault === null) scanFault = kind; };
/** The markup holds something outside the strict subset: the whole file is refused. */
const outside = () => { if (scanFault === null) scanFault = 'subset'; };

/**
 * Elements whose content a browser reads as raw text, never as markup (`plaintext` runs to
 * the end). `<noscript>` is not among them: a browser without scripting reads its content as
 * markup, so the scanner reads it in place ({@link scanMarkup}).
 */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
/** HTML's void elements: they have no content and no end tag, so they never open. */
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param',
  'source', 'track', 'wbr']);
/**
 * The host elements: the HTML element names, a fixed list of 111. The names are those of
 * Vue's `isHTMLTag` list (`HTML_TAGS` in `packages/shared/src/domTagConfig.ts` of
 * vuejs/core; the session compared the copy with that file on 2026-10-09), matched in lower
 * case, as HTML reads element names. An element of any other name is unknown to the browser
 * as HTML: a component or a custom element, whose text is whatever its script makes of it.
 * The SVG and MathML names are not in it: `<svg>` and `<math>` are opaque pieces
 * ({@link foreignEnd}), and outside them such a name is no host element.
 */
const HOST_ELEMENTS = new Set((
  'html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,'
  + 'nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,'
  + 'code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,'
  + 'track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,'
  + 'tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,'
  + 'select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot').split(','));
/** HTML's code elements: their text is code, compared exactly. */
const CODE_ELEMENTS = new Set(['code', 'pre', 'kbd', 'samp', 'var', 'listing', 'tt']);
/**
 * @param {string} name the element's name, lower case @param {string[]} attrs its attribute names, lower case
 * @returns {boolean} a component or custom element: an `is` attribute (a customised built-in
 * element), or a name that is no host element (every name with a hyphen among them)
 */
const isComponent = (name, attrs) => attrs.includes('is') || !HOST_ELEMENTS.has(name);
/**
 * Inside `<svg>` or `<math>`, the elements in which a browser reads HTML again: SVG's
 * `foreignObject`, `desc` and `title`, MathML's token elements and `annotation-xml`. Only
 * text may stand in one.
 */
const FOREIGN_TEXT_ONLY = new Set(['foreignobject', 'desc', 'title', 'mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml']);
/** The HTML element names that SVG has too; every other HTML name inside `<svg>` or `<math>` is outside the subset. */
const FOREIGN_SHARED = new Set(['a', 'script', 'style', 'title']);
/**
 * Names outside {@link HOST_ELEMENTS} that the HTML standard's parser still treats in a way
 * of its own (obsolete elements, mostly). Written from the executor's memory of the
 * standard's tree-construction rules, not compared with it (the round ran without network);
 * the differential test's foreign content exercises it against parse5. A browser leaves
 * `<svg>` and `<math>` at some of them.
 */
const PARSER_KNOWN = new Set(['acronym', 'applet', 'basefont', 'bgsound', 'big', 'center', 'dir', 'font', 'frame',
  'frameset', 'image', 'isindex', 'keygen', 'listing', 'marquee', 'menuitem', 'nobr', 'noembed', 'noframes',
  'plaintext', 'rb', 'rtc', 'search', 'selectedcontent', 'strike', 'tt', 'xmp']);
/** The end of each raw-text element but `<script>` and `<plaintext>`, of `<title>`, and of `<noscript>` as a browser with scripting reads it: its closing tag, letter case ignored. */
const RAW_CLOSE = {
  style: /<\/style(?=[\t\n\f\r />]|$)/gi,
  textarea: /<\/textarea(?=[\t\n\f\r />]|$)/gi,
  title: /<\/title(?=[\t\n\f\r />]|$)/gi,
  xmp: /<\/xmp(?=[\t\n\f\r />]|$)/gi,
  iframe: /<\/iframe(?=[\t\n\f\r />]|$)/gi,
  noembed: /<\/noembed(?=[\t\n\f\r />]|$)/gi,
  noframes: /<\/noframes(?=[\t\n\f\r />]|$)/gi,
  noscript: /<\/noscript(?=[\t\n\f\r />]|$)/gi
};
/** The marks that move a script block between the script-data states (a tag name ends at HTML's white space, `/` or `>`). */
const SCRIPT_MARKS = /<!--|--!?>|<(\/?)script(?=[\t\n\f\r />]|$)/gi;

/**
 * @param {string} s @returns {string} lower case as HTML reads a name: the ASCII letters
 * only. The Kelvin sign and the long s, which Unicode folds to `k` and `s`, stay what they
 * are, so `lin` with the Kelvin sign is no `link`.
 */
const asciiLower = (s) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
/** @param {string} c @returns {boolean} */
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
/** @param {string} c @returns {boolean} white space as the HTML tokenizer reads it */
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

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
    else if (c === '\n') { fault('lost'); return j; }
    else j++;
  }
  fault('open');
  return s.length;
}

/**
 * One tag from its `<`, after the HTML tokenizer's tag states: the name runs to white space,
 * `/` or `>`; an attribute name to white space, `/`, `>` or `=`; a value is single- or
 * double-quoted (to the same quote, whatever lies between) or unquoted (to white space or
 * `>`, a `/` included). `self`: the tag ends in `/>` as the tokenizer reads it (never after
 * an unquoted value); HTML ignores that, foreign content honours it. The name and the
 * attribute names are returned in lower case ({@link asciiLower}). A brace anywhere in the
 * tag, an attribute name that cannot start so, and a tag or quote that never ends are
 * outside the subset.
 * @param {string} s
 * @param {number} i
 * @param {boolean} isEnd whether it is `</…`
 * @returns {Tok}
 */
function scanTag(s, i, isEnd) {
  const n = s.length;
  let j = i + (isEnd ? 2 : 1);
  const nameStart = j;
  while (j < n && !isSpace(s[j]) && s[j] !== '/' && s[j] !== '>') j++;
  const name = asciiLower(s.slice(nameStart, j));
  const attrs = [];
  let slash = false; // the last character read was a `/` between attributes
  let self = false;
  while (j < n) {
    const c = s[j];
    if (c === '>') { self = slash; j++; break; }
    slash = c === '/';
    if (isSpace(c) || slash) { j++; continue; }
    if (c === '<' || c === '"' || c === "'" || c === '=') outside(); // no attribute name starts so
    const attrStart = j++;
    while (j < n && !isSpace(s[j]) && s[j] !== '/' && s[j] !== '>' && s[j] !== '=') j++;
    attrs.push(asciiLower(s.slice(attrStart, j)));
    while (j < n && isSpace(s[j])) j++;
    if (s[j] !== '=') continue;
    j++;
    while (j < n && isSpace(s[j])) j++;
    const q = s[j];
    if (q === '"' || q === "'") {
      const e = s.indexOf(q, j + 1);
      if (e < 0) outside();
      j = e < 0 ? n : e + 1;
    } else {
      while (j < n && !isSpace(s[j]) && s[j] !== '>') j++;
    }
  }
  const v = s.slice(i, j);
  if (v[v.length - 1] !== '>' || v.includes('{') || v.includes('}')) outside(); // never ended, or a brace in it
  return { k: 'tag', v, name, end: isEnd, attrs, self };
}

/**
 * The end of a raw-text element's content, from just after its start tag: for `<script>`
 * the script-data states (`<!--` escapes, `<script` inside it escapes twice, and only a
 * `</script` outside the double escape ends the block); for the others their closing tag.
 * Inside a script block the comment rule of the subset holds too: a `<!--` followed at once
 * by `>` or `->` (a browser leaves the escape there), a `<!--` inside another and a `--!>`
 * inside one are outside the subset. Content that never ends runs to the end of the file,
 * where its element is still open, which refuses the file ({@link scanMarkup}).
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
    if (m[0] === '<!--') {
      if (state !== 0 || s[m.index + 4] === '>' || s.startsWith('->', m.index + 4)) outside();
      if (state === 0) state = 1;
    } else if (m[0] === '-->') state = 0;
    else if (m[0] === '--!>') { if (state !== 0) outside(); }
    else if (m[1]) { if (state === 2) state = 1; else return m.index; }
    else if (state === 1) state = 2;
  }
  return s.length;
}

/**
 * The end of a piece that starts `<!`, `<?` or `</` before no letter. Inside the subset are
 * only `<!DOCTYPE html>` (any letter case) and a standard comment: `<!--`, not followed at
 * once by `>` or `->`, holding no `<!--` and no `--!>`, not ending in `<!-`, and closed by
 * the first `-->`. A browser ends every other such piece by recovery rules this scanner
 * does not copy (`<![CDATA[`, `<?…>`, `<!x>`, `</ x>`), so each is outside the subset.
 * @param {string} s @param {number} i the index of its `<` @returns {number} the index after it
 */
function declarationEnd(s, i) {
  if (s.startsWith('<!--', i)) {
    const e = s.indexOf('-->', i + 4);
    const inner = s.slice(i + 4, e < 0 ? s.length : e);
    if (e < 0 || inner[0] === '>' || inner.startsWith('->') || inner.includes('<!--') || inner.includes('--!>')
      || inner.endsWith('<!-')) outside();
    return e < 0 ? s.length : e + 3;
  }
  if (asciiLower(s.slice(i, i + 15)) === '<!doctype html>') return i + 15;
  outside();
  const e = s.indexOf('>', i + 2);
  return e < 0 ? s.length : e + 1;
}

/**
 * The end of foreign content: from the `<` of an `<svg>` or `<math>` start tag to the end
 * of its matching end tag, which the caller compares exactly as one opaque piece (no text
 * inside counts as wording). The tags inside are read as the tokenizer reads them (no raw
 * text there; `/>` closes), on a stack of their own, and the piece is inside the subset
 * only where a browser stays in the foreign content from end to end: every end tag closes
 * the element on top; no tag stands inside an element where HTML is read again
 * ({@link FOREIGN_TEXT_ONLY}); no start tag carries an HTML element's name but those SVG
 * shares ({@link FOREIGN_SHARED}) or another name the parser knows ({@link PARSER_KNOWN}),
 * because a browser leaves the foreign content at many of them; and the piece ends in the
 * file.
 * @param {string} s @param {number} from @returns {number} the index after the piece
 */
function foreignEnd(s, from) {
  /** @type {string[]} */
  const stack = [];
  let i = from;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    const d = s[lt + 1] || '';
    if (isLetter(d) || (d === '/' && isLetter(s[lt + 2] || ''))) {
      const tag = scanTag(s, lt, d === '/');
      i = lt + tag.v.length;
      const name = /** @type {string} */ (tag.name);
      if (tag.end) {
        if (stack.pop() !== name) outside();
      } else {
        if (stack.length > 0 && (FOREIGN_TEXT_ONLY.has(stack[stack.length - 1]) || PARSER_KNOWN.has(name)
          || (HOST_ELEMENTS.has(name) && !FOREIGN_SHARED.has(name)))) outside();
        if (!tag.self) stack.push(name);
      }
      if (stack.length === 0) return i;
    } else if (d === '!' || d === '?' || d === '/') {
      i = declarationEnd(s, lt);
    } else {
      i = lt + 1;
    }
  }
  outside(); // never closed
  return s.length;
}

/** No names: the end tags that close an element which never leaves its end tag out. */
const NO_NAMES = new Set();
/** A character that is no white space for the HTML parser. */
const NOT_HTML_SPACE = /[^ \t\n\f\r]/;
/**
 * THE END TAGS THAT MAY BE LEFT OUT (the decision at review of 2026-10-09). In an HTML file
 * an end tag closes the element on top of the stack; any other end tag is outside the
 * subset, with these exceptions only, each held to the HTML standard's parser by the
 * differential test (`tests/hotfix-check-differential.test.js`): for each element name, the
 * end tags that also close it while it stands above their own element.
 *   p                           the end tag of its parent: address, article, aside, blockquote,
 *                               details, dialog, div, dl, fieldset, figcaption, figure, footer,
 *                               header, hgroup, main, menu, nav, ol, section, summary, ul, li,
 *                               dd, dt, td, th, body, html
 *   li                          ul, ol, menu
 *   dt, dd                      dl
 *   rt, rp                      ruby
 *   option                      select, datalist, optgroup
 *   optgroup                    select, datalist
 *   caption, colgroup, thead,
 *   tbody, tfoot                table
 *   tr                          table, thead, tbody, tfoot
 *   td, th                      tr, table, thead, tbody, tfoot
 *   head, body                  html
 * Nothing is closed at the end of the file: an element still open there is outside the subset.
 * @type {Map<string, Set<string>>}
 */
const IMPLIED_END = new Map(Object.entries({
  p: ['address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset', 'figcaption', 'figure',
    'footer', 'header', 'hgroup', 'main', 'menu', 'nav', 'ol', 'section', 'summary', 'ul', 'li', 'dd', 'dt', 'td', 'th',
    'body', 'html'],
  li: ['ul', 'ol', 'menu'],
  dt: ['dl'],
  dd: ['dl'],
  rt: ['ruby'],
  rp: ['ruby'],
  option: ['select', 'datalist', 'optgroup'],
  optgroup: ['select', 'datalist'],
  caption: ['table'],
  colgroup: ['table'],
  thead: ['table'],
  tbody: ['table'],
  tfoot: ['table'],
  tr: ['table', 'thead', 'tbody', 'tfoot'],
  td: ['tr', 'table', 'thead', 'tbody', 'tfoot'],
  th: ['tr', 'table', 'thead', 'tbody', 'tfoot'],
  head: ['html'],
  body: ['html']
}).map(([name, ends]) => [name, new Set(ends)]));

/**
 * THE START TAGS THAT CLOSE AN OPEN ELEMENT (the decision at review of 2026-10-09). The HTML
 * parser closes some elements when certain start tags arrive, and where the element to
 * close is not the one on top it closes everything above it too, by rules of scope this
 * scanner does not copy. So each such start tag is followed only in its plain form, where
 * the element it closes is on top of the stack (it is then closed, exactly as a browser
 * does), and is outside the subset in every other form:
 *   - a tag that ends a paragraph ({@link P_CLOSERS}) while a `<p>` is open: the `<p>` on top;
 *   - `<li>` while an `<li>` is open in the same list: that `<li>` on top, or under a `<p>`
 *     on top; `<dd>` and `<dt>` likewise within their `<dl>`;
 *   - a heading on top of the stack is closed by the next heading's start tag;
 *   - `<a>` while an `<a>` is open, `<button>` while a `<button>` is open, `<nobr>` likewise:
 *     that element on top;
 *   - `<rt>` and `<rp>` inside a `<ruby>`: an `<rt>` or `<rp>` on top;
 *   - `<option>`, `<optgroup>` and, inside a `<select>`, `<hr>`: an `<option>` on top, and
 *     inside a `<select>` for the last two an `<optgroup>` on top after it;
 *   - the parts of a table, each only where a table has it ({@link TABLE_PARTS}); a `<table>`
 *     among another table's rows is outside the subset, also when elements stand between
 *     ({@link TABLE_ROW_PARTS}).
 * A `<form>` inside a `<form>` is ignored by a browser, and its end tag then closes the
 * outer one: outside the subset.
 */
const P_CLOSERS = new Set(['address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog', 'dir', 'div', 'dl',
  'fieldset', 'figcaption', 'figure', 'footer', 'header', 'hgroup', 'main', 'menu', 'nav', 'ol', 'p', 'search', 'section',
  'summary', 'ul', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'listing', 'form', 'li', 'dd', 'dt', 'plaintext', 'table',
  'hr', 'xmp']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/** The elements a list item belongs to, and the items themselves: `<li>` in a list, `<dd>` and `<dt>` in a `<dl>`. */
const ITEM_HOLDERS = new Map([['ul', 0], ['ol', 0], ['menu', 0], ['dl', 1]]);
const ITEMS = new Map([['li', 0], ['dd', 1], ['dt', 1]]);
/** The start tags that close an open element of their own name when it is on top, and are outside the subset when it is not. */
const CLOSES_OWN = new Set(['a', 'button', 'nobr']);
/** The end tags the parser adds by itself before an `<rt>` or `<rp>`; `rt` and `rp` are followed, the others are outside the subset. */
const RUBY_IMPLIED = new Set(['p', 'li', 'dd', 'dt', 'option', 'optgroup', 'rb', 'rtc']);
/**
 * The parts of a table: for each, the open parts its start tag closes while they are on
 * top, and the elements it may then stand in. A browser puts a part in its place whatever
 * stands between, by closing that; here anything else between is outside the subset, and so
 * is a part with no table around it (a browser ignores its start tag). Directly inside a
 * `<template>` every part may stand.
 */
const TABLE_ROWS = ['table', 'thead', 'tbody', 'tfoot'];
const TABLE_SECTION_CLOSES = ['td', 'th', 'tr', 'thead', 'tbody', 'tfoot', 'caption', 'colgroup'];
const TABLE_PARTS = new Map(Object.entries({
  caption: [TABLE_SECTION_CLOSES, ['table']],
  colgroup: [TABLE_SECTION_CLOSES, ['table']],
  thead: [TABLE_SECTION_CLOSES, ['table']],
  tbody: [TABLE_SECTION_CLOSES, ['table']],
  tfoot: [TABLE_SECTION_CLOSES, ['table']],
  col: [[], ['table', 'colgroup']],
  tr: [['td', 'th', 'tr', 'caption', 'colgroup'], TABLE_ROWS],
  td: [['td', 'th', 'caption', 'colgroup'], ['tr', ...TABLE_ROWS]],
  th: [['td', 'th', 'caption', 'colgroup'], ['tr', ...TABLE_ROWS]]
}));
/**
 * The parts of a table among which a browser is still reading rows, and those in which it
 * reads cell content again. While the nearest such part around a `<table>` start tag is one
 * of the first, a browser ends the table that is open and starts the new one beside it; the
 * scanner refuses the file instead.
 */
const TABLE_ROW_PARTS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup']);
const TABLE_CELL_PARTS = new Set(['td', 'th', 'caption', 'template']);
/** Directly inside these a browser moves text that is no white space in front of the table. */
const TABLE_TEXT_MOVES = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr']);

/**
 * Rule 4 — the tokens of a whole HTML file. The open elements are kept on a stack, their
 * names in lower case ({@link asciiLower}). Text is `quiet`, never wording, while an element
 * that holds its text is open (a code element, a `<template>`, a `<noscript>`, an `<option>`
 * with no `value`, a component or custom element: {@link isComponent}, then also `inexact`),
 * inside a `<select>` anywhere but directly in an `<option>` with a `value`, and after the
 * body's end (only white space stands there, and it is no wording). Text read before the body
 * (only `<html>` and `<head>` open) or directly inside a table is marked `lead`: a browser
 * puts its leading white space elsewhere than the rest.
 * A void element never opens, and `/>` closes nothing. The text of `<title>` is read to its
 * closing tag as one text token. `<svg>` and `<math>` are one `foreign` token each
 * ({@link foreignEnd}). Inside `<select>` only options are followed. `<frameset>` and
 * `<frame>` are outside the subset (a browser may drop the whole body for them), and so is
 * an `is` attribute on `<html>` or `<body>` (a browser adds the attributes of a second such
 * tag to the element that holds everything). A start tag closes what a browser closes for it
 * only where that is on top of the stack ({@link P_CLOSERS}). An end tag closes the element
 * on top of the stack, or the elements that may leave their end tag out before it
 * ({@link IMPLIED_END}); every other end tag is outside the subset: HTML itself ignores such
 * an end tag or moves elements for it, by rules this scanner does not copy. An element still
 * open at the end is outside the subset.
 * THE CONTENT OF `<noscript>` is read in place, on the same stack: a browser without
 * scripting reads it as markup, a browser with scripting as raw text up to the first
 * `</noscript`. Both end the element at the same place only when its end tag stands exactly
 * where the raw text ends and finds the `<noscript>` on top of the stack (as every end tag
 * must find its element); anything else is outside the subset.
 * THE DOCTYPE counts only before everything else: text or a tag before it leaves a browser
 * in quirks mode, and the decision lets only white space stand there (one byte-order mark is
 * taken off before the scan), so a comment before the doctype refuses the file too. Without
 * a doctype a `<table>` leaves an open `<p>` open (quirks mode). After `</body>` or `</html>`
 * only white space, comments and those two end tags may follow (a browser puts anything else
 * back into the body, inside whatever is still open there).
 * @param {string} s the whole file, line feeds only, without a leading byte-order mark
 * @returns {Tok[]}
 */
function scanMarkup(s) {
  /** @type {Tok[]} */
  const out = [];
  /**
   * @typedef {{name: string, holds: boolean, component: boolean, holder: number, item: number, rows: boolean, end: number}} Open
   * an open element: whether it holds its text and is a component; which kind of list it is
   * ({@link ITEM_HOLDERS}) or is an item of ({@link ITEMS}), or -1; whether the nearest part
   * of a table around it, itself included, is one that holds rows and not cells; for a
   * `<noscript>`, where its raw text ends
   */
  /** @type {Open[]} the open elements, the innermost last */
  const stack = [];
  /** @type {Map<string, number>} how many open elements carry each name */
  const open = new Map();
  let held = 0;
  let components = 0;
  let ended = false; // `</body>` or `</html>` has been read
  let initial = true; // nothing but white space has been read
  let quirks = true; // no `<!DOCTYPE html>` leads the file: a browser then leaves a `<p>` open at a `<table>`
  let noscriptEnd = -1; // where the raw text of the `<noscript>` last opened ends
  /** For lists and for `<dl>`: how many items are open in each open one, the innermost last. */
  const items = [[0], [0]];
  const top = () => (stack.length > 0 ? stack[stack.length - 1] : null);
  const pop = () => {
    const el = /** @type {Open} */ (stack.pop());
    open.set(el.name, /** @type {number} */ (open.get(el.name)) - 1);
    if (el.holds) held--;
    if (el.component) components--;
    if (el.holder >= 0) items[el.holder].pop();
    else if (el.item >= 0) items[el.item][items[el.item].length - 1]--;
  };
  /** @param {Open} el */
  const enter = (el) => {
    stack.push(el);
    open.set(el.name, (open.get(el.name) || 0) + 1);
    if (el.holds) held++;
    if (el.component) components++;
    if (el.holder >= 0) items[el.holder].push(0);
    else if (el.item >= 0) items[el.item][items[el.item].length - 1]++;
  };
  /** @param {string} name @param {boolean} holds @param {boolean} component @param {number} end @returns {Open} the element as it will stand on the stack */
  const element = (name, holds, component, end) => {
    const above = top();
    const rows = TABLE_ROW_PARTS.has(name) || (!TABLE_CELL_PARTS.has(name) && above !== null && above.rows);
    return { name, holds, component, holder: ITEM_HOLDERS.get(name) ?? -1, item: ITEMS.get(name) ?? -1, rows, end };
  };
  /** @param {number} back @returns {string} the name of the element `back` places under the top, or '' */
  const nameAt = (back) => (stack.length > back ? stack[stack.length - 1 - back].name : '');
  /** An end tag that does not close the element on top closes the elements above its own that may leave their end tag out before it, or is outside the subset. */
  const closeImplied = (name) => {
    let k = stack.length - 1;
    while (k >= 0 && stack[k].name !== name && (IMPLIED_END.get(stack[k].name) || NO_NAMES).has(name)) k--;
    if (k < 0 || stack[k].name !== name) outside();
    else while (stack.length > k) pop();
  };
  /**
   * The open elements a start tag closes ({@link P_CLOSERS} and what follows it), each only
   * where it is on top; where a browser would close through other elements, the start tag is
   * outside the subset.
   * @param {string} name @param {boolean} selects inside a `<select>`
   */
  const closeBefore = (name, selects) => {
    if (ITEMS.has(name)) {
      const of = items[/** @type {number} */ (ITEMS.get(name))];
      if (of[of.length - 1] > 0) {
        if (nameAt(0) === 'p' && ITEMS.get(nameAt(1)) === ITEMS.get(name)) pop();
        if (ITEMS.get(nameAt(0)) === ITEMS.get(name)) pop();
        else outside();
      }
    }
    // A table closes the paragraph only under `<!DOCTYPE html>`; in quirks mode it stays inside it.
    if (P_CLOSERS.has(name) && open.get('p') && !(name === 'table' && quirks)) {
      if (nameAt(0) === 'p') pop();
      else outside();
    }
    if (HEADINGS.has(name) && HEADINGS.has(nameAt(0))) pop();
    if (CLOSES_OWN.has(name) && open.get(name)) {
      if (nameAt(0) === name) pop();
      else outside();
    }
    if (name === 'form' && open.get('form')) outside();
    if ((name === 'rt' || name === 'rp' || name === 'rb' || name === 'rtc') && open.get('ruby')) {
      if (RUBY_IMPLIED.has(nameAt(0)) || name === 'rb' || name === 'rtc') outside();
      // A browser closes more than the `<rt>` or `<rp>` on top unless the `<ruby>` stands right under it.
      else if ((nameAt(0) === 'rt' || nameAt(0) === 'rp') && nameAt(1) !== 'ruby') outside();
      else if (nameAt(0) === 'rt' || nameAt(0) === 'rp') pop();
    }
    if (name === 'option' || name === 'optgroup' || (name === 'hr' && selects)) {
      if (nameAt(0) === 'option') pop();
      if (name !== 'option' && selects && nameAt(0) === 'optgroup') pop();
    }
    const part = TABLE_PARTS.get(name);
    if (part && nameAt(0) !== 'template') {
      while (part[0].includes(nameAt(0))) pop();
      if (!part[1].includes(nameAt(0))) outside();
    }
    // A table started among another table's rows, also through elements that stand there, ends that table for a browser.
    if (name === 'table' && stack.length > 0 && stack[stack.length - 1].rows) outside();
    if (nameAt(0) === 'colgroup' && name !== 'col' && name !== 'template') outside();
  };
  const n = s.length;
  let i = 0; // how far the file is read
  let start = 0; // where the text token in progress starts
  /** @param {number} end the text token in progress ends here */
  const text = (end) => {
    if (end <= start) return;
    const v = s.slice(start, end);
    start = end;
    const el = top();
    const blank = !NOT_HTML_SPACE.test(v);
    if (!blank) initial = false;
    // After the body's end, and directly inside a `<colgroup>`, a browser moves text elsewhere.
    if ((ended || (el !== null && el.name === 'colgroup')) && !blank) outside();
    const unsent = Boolean(open.get('select')) && !(el !== null && el.name === 'option' && !el.holds);
    const lead = !ended && (stack.length === (open.get('html') || 0) + (open.get('head') || 0) || (el !== null && TABLE_TEXT_MOVES.has(el.name)));
    out.push({ k: 'text', v, quiet: held > 0 || unsent || ended, inexact: components > 0, lead });
  };
  /** @param {string} k @param {number} end one token of kind `k` from where the scan stands to `end` */
  const take = (k, end) => {
    text(i);
    out.push({ k, v: s.slice(i, end) });
    i = end;
    start = end;
  };
  if (s.indexOf('<') < 0) i = n; // nothing but text: one token
  while (i < n && scanFault === null) {
    if (s[i] !== '<') { i++; continue; }
    const d = s[i + 1] || '';
    if (isLetter(d) || (d === '/' && isLetter(s[i + 2] || ''))) {
      const tag = scanTag(s, i, d === '/');
      const name = /** @type {string} */ (tag.name);
      const attrs = /** @type {string[]} */ (tag.attrs);
      const selects = Boolean(open.get('select'));
      if (selects && !['option', 'optgroup', tag.end ? 'select' : 'hr'].includes(name)) outside();
      if (ended && !(tag.end && (name === 'body' || name === 'html'))) outside();
      if (!tag.end && (name === 'svg' || name === 'math')) {
        take('foreign', foreignEnd(s, i));
        initial = false;
        continue;
      }
      text(i);
      initial = false;
      const at = i;
      out.push(tag);
      i += tag.v.length;
      start = i;
      if (scanFault !== null) break; // already refused: nothing more is followed
      if (tag.end) {
        // With scripting a `<noscript>` ends where its raw text ends; without, at this end tag: the same place, or the file is refused.
        if (name === 'noscript' && nameAt(0) === name && /** @type {Open} */ (top()).end !== at) outside();
        if (nameAt(0) === name) pop();
        else closeImplied(name);
        if (name === 'body' || name === 'html') ended = true;
        continue;
      }
      if (name === 'frameset' || name === 'frame' || ((name === 'html' || name === 'body') && attrs.includes('is'))) outside();
      closeBefore(name, selects);
      if (!VOID_ELEMENTS.has(name)) {
        const code = CODE_ELEMENTS.has(name) || name === 'template' || name === 'noscript';
        const component = !code && isComponent(name, attrs);
        // The first `</noscript` from here on is looked for once: a `<noscript>` inside another has the same one.
        if (name === 'noscript' && noscriptEnd < i) noscriptEnd = rawEnd(s, i, name);
        enter(element(name, code || component || (name === 'option' && !attrs.includes('value')), component,
          name === 'noscript' ? noscriptEnd : -1));
      }
      if (name === 'title') {
        i = rawEnd(s, i, name);
        text(i);
      } else if (RAW_TEXT.has(name)) {
        const end = rawEnd(s, i, name);
        if (end > i) take('raw', end);
      }
    } else if (d === '!' || d === '?' || d === '/') {
      text(i); // what stands before a doctype counts, so it is read first
      const end = declarationEnd(s, i);
      if (!s.startsWith('<!--', i)) { // the doctype: only white space may stand before it
        if (!initial) outside();
        quirks = false;
      }
      initial = false;
      take('comment', end);
    } else {
      i++;
    }
  }
  text(n);
  if (stack.length > 0) outside(); // an element never closed
  return out;
}

/**
 * Rule 4 — compare two token sequences: equal in length and kind, every token identical
 * but changed text tokens, each of which `wording` accepts on both sides. A changed text
 * token marked `lead` keeps its leading white space (a browser reads that white space into
 * another place than the text after it). Returns `runs`, the old and new values of the
 * changed text tokens (rule 6 reads them), or `runs: null` with `inexact`: the first change
 * that is no wording stands in a component or custom element, or in `<svg>` or `<math>`.
 * @param {Tok[]} a @param {Tok[]} b
 * @param {(toks: Tok[], k: number) => boolean} wording
 * @returns {{runs: (string[]|null), inexact: boolean}}
 */
function changedTexts(a, b, wording) {
  if (a.length !== b.length) return { runs: null, inexact: false };
  const runs = [];
  /** @param {string} v @returns {number} how much white space the text starts with */
  const leading = (v) => { const at = v.search(NOT_HTML_SPACE); return at < 0 ? v.length : at; };
  for (let k = 0; k < a.length; k++) {
    if (a[k].k !== b[k].k) return { runs: null, inexact: false };
    if (a[k].v === b[k].v) continue;
    // Text that comes or goes whole is no reworded text: a browser may then build another tree.
    if (a[k].k !== 'text' || !wording(a, k) || !wording(b, k) || NOT_HTML_SPACE.test(a[k].v) !== NOT_HTML_SPACE.test(b[k].v)
      || ((a[k].lead || b[k].lead) && a[k].v.slice(0, leading(a[k].v)) !== b[k].v.slice(0, leading(b[k].v)))) {
      return { runs: null, inexact: a[k].k === 'foreign' || Boolean(a[k].inexact || b[k].inexact) };
    }
    runs.push(a[k].v, b[k].v);
  }
  return { runs, inexact: false };
}

/** Characters a markup text token never holds when it changes (template and script starts, a lone `<`). */
const MARKUP_TEXT_BAD = /[{}$`<]/;
/**
 * A character of the control or format categories other than a tab, line feed, form feed or
 * carriage return: an escape, a right-to-left override, a zero-width or a tag character. A
 * changed text token holds none: a reader does not see them, and a terminal or a browser acts on them.
 */
const UNSEEN_CHARACTER = /(?![\t\n\f\r])[\p{Cc}\p{Cf}]/u;
/**
 * The character references a changed markup text token may hold, each written in full with
 * its semicolon: punctuation and spacing a sentence is written with. Any other `&` refuses,
 * because rule 6 reads the text as written and a reference can spell a digit, a currency
 * sign, an `@` or a `/` that it would not see.
 */
const PLAIN_REFERENCE = /&(?:amp|nbsp|quot|apos|copy|reg|trade|hellip|mdash|ndash|lsquo|rsquo|ldquo|rdquo|laquo|raquo|middot|bull|shy);/g;

/**
 * Rule 4 (markup) — a changed text token is visible text: not quiet, without template or
 * script characters and without a control or format character ({@link UNSEEN_CHARACTER}),
 * every `&` in it one of the plain references ({@link PLAIN_REFERENCE}), between two tags or
 * comments. It may run over several lines (the decision at review of 2026-10-09: a text node
 * is one node however many lines it is written on).
 * @param {Tok[]} toks @param {number} k @returns {boolean}
 */
function markupWording(toks, k) {
  const t = toks[k];
  if (t.quiet || MARKUP_TEXT_BAD.test(t.v) || UNSEEN_CHARACTER.test(t.v) || t.v.replace(PLAIN_REFERENCE, '').includes('&')) return false;
  const beside = (x) => Boolean(x) && (x.k === 'tag' || x.k === 'comment');
  return beside(toks[k - 1]) && beside(toks[k + 1]);
}

/**
 * Rule 4 (message catalogue) — whether each line of a catalogue starts a fresh entry, which
 * is the one state where a line is read alone: never a line inside a YAML block scalar
 * (`|`, `>` and the lines indented beneath its key), a YAML quoted value or flow collection
 * begun on an earlier line, or a properties value continued by a `\` at the end of the line
 * above. One pass.
 * @param {string} text line feeds only @param {string} ext @returns {boolean[]}
 */
function entryLines(text, ext) {
  const lines = text.split('\n');
  const fresh = new Array(lines.length).fill(true);
  const indent = (l) => l.length - l.trimStart().length;
  if (ext === '.properties') {
    for (let i = 1; i < lines.length; i++) {
      const m = /\\+$/.exec(lines[i - 1]);
      fresh[i] = !(m && m[0].length % 2 === 1);
    }
    return fresh;
  }
  if (ext !== '.yaml' && ext !== '.yml') return fresh;
  let block = -1; // inside a block scalar while a line is blank or indented deeper than this
  let quote = ''; // a quoted value still open
  let flow = 0; // open `[` and `{` of a flow collection
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let from = 0;
    if (quote || flow > 0) {
      fresh[i] = false;
    } else if (block >= 0 && (line.trim() === '' || indent(line) > block)) {
      fresh[i] = false;
      continue;
    } else {
      block = -1;
      const at = line.indexOf(': ');
      const value = at < 0 ? '' : line.slice(at + 2).trimStart();
      if (value[0] === '|' || value[0] === '>') { // a block scalar header: indicators, then at most a comment
        let k = 1;
        while (k < value.length && '-+0123456789'.includes(value[k])) k++;
        const rest = value.slice(k).trimEnd();
        if (rest === '' || /^[ \t]+#/.test(rest)) block = indent(line);
      }
      if (!'"\'[{'.includes(value[0] || 'x')) continue; // a plain value: its quotes are text
      from = line.length - value.length;
    }
    // Follow a quoted value or a flow collection through the line (escapes and doubled quotes skipped).
    for (let j = from; j < line.length; j++) {
      const c = line[j];
      if (quote) {
        if (quote === '"' && c === '\\') j++;
        else if (c === "'" && quote === "'" && line[j + 1] === "'") j++;
        else if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '[' || c === '{') flow++;
      else if ((c === ']' || c === '}') && flow > 0) flow--;
      if (!quote && flow === 0 && j >= from && fresh[i]) break; // the value closed on its own line
    }
  }
  return fresh;
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
/** The properties escapes; a backslash before any other character is that character. */
const PROPERTIES_ESCAPES = { t: '\t', n: '\n', r: '\r', f: '\f' };

/**
 * Decode one backslash-escaped value, or null for an escape the format does not know.
 * @param {string} raw
 * @param {Record<string, string>} simple the one-character escapes
 * @param {Record<string, number>} hex fixed-length hexadecimal escapes, by letter
 * @param {boolean} keep keep any other escaped character as itself (properties files)
 * @returns {string|null}
 */
function unescapeValue(raw, simple, hex, keep) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') { out += raw[i]; continue; }
    const e = raw[++i];
    if (e === undefined) return null;
    if (hex[e]) {
      const digits = raw.slice(i + 1, i + 1 + hex[e]);
      if (!/^[0-9A-Fa-f]+$/.test(digits) || digits.length !== hex[e]) return null;
      out += String.fromCodePoint(Math.min(parseInt(digits, 16), 0x10ffff));
      i += hex[e];
    } else if (Object.prototype.hasOwnProperty.call(simple, e)) {
      out += simple[e];
    } else if (keep) {
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
 * `'`), a properties value through its own (a backslash before any other character is that
 * character); null for an escape the format refuses.
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
  if (ext === '.properties') return unescapeValue(entry.value, PROPERTIES_ESCAPES, { u: 4 }, true);
  if (entry.quote === '"') return unescapeValue(entry.value, YAML_ESCAPES, { x: 2, u: 4, U: 8 }, false);
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
 * Rule 4 (colour) — the stylesheet with every string, every `/* … *\/` comment and every
 * unquoted `url(…)` replaced by a filler character of the same length (line breaks kept),
 * so neither a `;`, `{` or `}` nor a colour inside them counts. One pass.
 * @param {string} s @returns {string}
 */
function blankCss(s) {
  const parts = [];
  const n = s.length;
  let at = 0;
  let i = 0;
  while (i < n) {
    const c = s[i];
    let end = -1;
    if (c === '/' && s[i + 1] === '*') {
      const e = s.indexOf('*/', i + 2);
      if (e < 0) fault('open');
      end = e < 0 ? n : e + 2;
    } else if (c === '"' || c === "'") {
      end = Math.min(skipString(s, i), n);
    } else if ((c === 'u' || c === 'U') && s.slice(i, i + 4).toLowerCase() === 'url(' && !/[\w-]/.test(s[i - 1] || '')) {
      let j = i + 4;
      while (j < n && isSpace(s[j])) j++;
      if (s[j] !== '"' && s[j] !== "'") {
        const e = s.indexOf(')', j);
        if (e < 0) fault('open');
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
 * `}` that ends it (`term`), at the brace depth it starts in.
 * @param {string} blank
 * @returns {Array<{start: number, end: number, term: string, depth: number}>}
 */
function cssStatements(blank) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < blank.length; i++) {
    const c = blank[i];
    if (c !== '{' && c !== ';' && c !== '}') continue;
    out.push({ start, end: i, term: c, depth });
    if (c === '{') depth++;
    else if (c === '}' && depth > 0) depth--;
    else if (c === '}') fault('lost'); // a `}` with nothing open
    start = i + 1;
  }
  if (depth > 0) fault('open');
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
 * `name:`, and at depth 0 only a custom property (`--x`) is one. The property's name must
 * stand on the token's own line. `whole`: the token is the declaration's whole value (an
 * `!important` after it aside). A colour function is read only in its written forms
 * ({@link colourFunction}). One forward pass.
 * @param {string} text
 * @returns {Array<{t: string, i: number, j: number, prop: (string|null), whole: boolean}>}
 */
function colourSlots(text) {
  const blank = blankCss(text);
  const statements = cssStatements(blank);
  const head = /\s*(--[\w-]+|[A-Za-z-]+)\s*:/y;
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
    const st = /** @type {{start: number, end: number, term: string, depth: number, decl?: ({name: string, at: number, valueAt: number}|null), value?: string}} */ (statements[si]);
    if (st.decl === undefined) {
      head.lastIndex = st.start;
      const h = st.term === '{' ? null : head.exec(blank);
      st.decl = h && (st.depth > 0 || h[1].startsWith('--'))
        ? { name: h[1], at: st.start + h[0].length - h[0].trimStart().length, valueAt: head.lastIndex }
        : null;
    }
    const d = st.decl;
    if (d && st.value === undefined) st.value = blank.slice(d.valueAt, st.end).replace(/![ \t\n]*important[ \t\n]*$/i, '').trim();
    out.push({ t, i, j, prop: d && d.valueAt <= i && d.at >= lineStart ? d.name : null, whole: Boolean(d) && st.value === t });
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

/** The colour functions that may also be written with commas. */
const COMMA_COLOURS = new Set(['rgb', 'rgba', 'hsl', 'hsla']);
/** The colour functions written with spaces only; `color(…)` names a colour space first. */
const SPACE_COLOURS = new Set(['hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);

/**
 * Rule 4 (colour) — a colour function in one of its written forms: for `rgb`, `rgba`, `hsl`
 * and `hsla`, three or four comma-separated numbers; for those and for `hwb`, `lab`, `lch`,
 * `oklab`, `oklch` and `color` (after its colour space's name), three space-separated
 * numbers with an optional `/ alpha` ({@link colourNumber} each). So `rgb(<11, 94, 215)`
 * and `rgb(var(--x))` are no colour.
 * @param {string} t `name(…)`, no bracket inside @returns {boolean}
 */
function colourFunction(t) {
  const name = t.slice(0, t.indexOf('(')).toLowerCase();
  const inner = t.slice(t.indexOf('(') + 1, -1).trim();
  if (COMMA_COLOURS.has(name) && inner.includes(',')) {
    const parts = inner.split(',');
    return (parts.length === 3 || parts.length === 4) && parts.every((x) => colourNumber(x.trim()));
  }
  if (!COMMA_COLOURS.has(name) && !SPACE_COLOURS.has(name)) return false;
  const [main, alpha, extra] = inner.split('/');
  const parts = main.trim().split(/\s+/);
  if (name === 'color' && !/^[A-Za-z][A-Za-z0-9-]*$/.test(/** @type {string} */ (parts.shift()))) return false;
  return extra === undefined && parts.length === 3 && parts.every((x) => colourNumber(x))
    && (alpha === undefined || colourNumber(alpha.trim()));
}

/**
 * @param {string} v a custom property's whole value, trimmed @returns {boolean} it is
 * exactly one colour: a hexadecimal colour, a named colour, or one colour function
 * ({@link colourFunction}); nothing beside it, so no `var()`, no `url()`, no second token,
 * no comment and no `!important`
 */
function oneColour(v) {
  if (v[0] === '#') return [4, 5, 7, 9].includes(v.length) && /^#[0-9A-Fa-f]+$/.test(v);
  return NAMED_COLOURS.has(v.toLowerCase()) || (/^[A-Za-z]+\([^()]*\)$/.test(v) && colourFunction(v));
}

/**
 * @param {(string|null)} prop @returns {boolean} a real CSS property whose value is a colour:
 * a name ending in `color` (`color`, `background-color`, `border-color`, `outline-color`,
 * ...) or one of {@link COLOUR_SHORTHANDS}; never a custom property
 */
const colourMayStand = (prop) => prop !== null && !prop.startsWith('--')
  && (/(?:^|-)color$/i.test(prop) || COLOUR_SHORTHANDS.has(prop.toLowerCase()));

/**
 * Rule 4 (colour) — every custom property declaration of a whole stylesheet, in order: its
 * name, its value as written (comments and strings included, trimmed) and where that value
 * stands. A script reads a custom property (`getComputedStyle`), so a change to one is a
 * setting unless it is a colour by {@link colourNamedEdit}. A custom property whose value
 * opens a block (`--x: { … }`) cannot be followed: its inside would read as declarations.
 * @param {string} text @returns {Array<{name: string, value: string, from: number, to: number}>}
 */
function customProperties(text) {
  const blank = blankCss(text);
  const head = /\s*(--[\w-]+)\s*:/y;
  const out = [];
  for (const st of cssStatements(blank)) {
    head.lastIndex = st.start;
    const h = head.exec(blank);
    if (!h || head.lastIndex > st.end) continue;
    if (st.term === '{') fault('lost');
    const raw = text.slice(head.lastIndex, st.end);
    const from = head.lastIndex + raw.length - raw.trimStart().length;
    out.push({ name: h[1], value: raw.trim(), from, to: from + raw.trim().length });
  }
  return out;
}

/**
 * Rule 4 (colour) — a change to custom properties that is a colour change (the session's
 * decision of 2026-10-09, on the owner's instruction): the same properties in the same
 * order, and every one whose value changed has `color` or `colour` in its name and holds
 * exactly one colour before and after ({@link oneColour}). Returns the two stylesheets
 * with each such value replaced by one same colour, for the rest of the comparison (every
 * other character must still be identical, or a colour in a real colour property); or
 * `inexact`: a property named for a colour changed, and its value is not exactly one colour
 * before and after; or null: any other custom-property change is a setting.
 * @param {string} o @param {string} n @returns {([string, string]|'inexact'|null)}
 */
function colourNamedEdit(o, n) {
  const a = customProperties(o);
  const b = customProperties(n);
  if (a.length !== b.length) return null;
  const changed = [];
  let inexact = false;
  for (let k = 0; k < a.length; k++) {
    if (a[k].name !== b[k].name) return null;
    if (a[k].value === b[k].value) continue;
    if (!/colou?r/i.test(a[k].name)) return null;
    if (!oneColour(a[k].value) || !oneColour(b[k].value)) inexact = true;
    changed.push(k);
  }
  if (inexact) return 'inexact';
  const levelled = (text, list) => {
    const parts = [];
    let at = 0;
    for (const k of changed) {
      parts.push(text.slice(at, list[k].from));
      at = list[k].to;
    }
    parts.push(text.slice(at));
    return parts.join('red');
  };
  return [levelled(o, a), levelled(n, b)];
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
 * are never a colour. `inexact`: a changed colour stands in a real colour property on both
 * sides but is not its whole value (`border: 1px solid red`), which the functional plan
 * refuses as a change the check cannot read exactly. Linear in the files' length.
 * @param {string} o @param {string} n @returns {(boolean|'inexact')}
 */
function colourEdit(o, n) {
  const a = colourSlots(o);
  const b = colourSlots(n);
  if (a.length !== b.length || masked(o, a) !== masked(n, b)) return false;
  let changed = 0;
  let inexact = false;
  for (let k = 0; k < a.length; k++) {
    if (a[k].t === b[k].t) continue;
    changed++;
    if (!colourMayStand(a[k].prop) || !colourMayStand(b[k].prop)) return false;
    if (!a[k].whole || !b[k].whole) inexact = true;
  }
  return inexact ? 'inexact' : changed > 0;
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

/*
 * MARKDOWN AND PLAIN TEXT: PURE PROSE (rule 4; the decision at review of 2026-10-09, under the
 * owner's decision that the check keeps only what it can read exactly). Markdown is not one
 * language: a security run pushed 249,644 edits the check passed through other renderers
 * found on the machine (markdown-it in other configurations, marked, micromark with GitHub's
 * extensions, pandoc, Python-Markdown), and thousands changed a link, an attribute or code
 * under at least one of them. No reader can agree with all of them on structure. So this
 * check reads no structure at all: a `.md` or `.txt` edit qualifies only as a wording change
 * in pure prose, defined so that every renderer shows the same thing.
 *   1  A PLAIN PROSE LINE has 0 to 3 leading spaces, holds no white space but the space,
 *      starts with a letter or an opening quotation mark, and consists of letters, combining
 *      marks, decimal digits, spaces and `, . ; : ? ! ' " - ( )`, the typographic quotes, the
 *      two dashes and the ellipsis. Each of `. , ; ? !` stands before a space, a closing
 *      quote, a closing parenthesis or the end of the line (so no `example.com`), and `-` only
 *      between two letters. A changed line keeps its leading and its trailing spaces (two
 *      trailing spaces are a line break).
 *      WIDENED IN THE NINTH ROUND (the decisions at review of 2026-10-09, each step taken only
 *      because the differential test stayed at zero disagreements with it): (a) a COLON that
 *      follows a letter, a digit, a closing quote or a closing parenthesis and stands before a
 *      space or the end of the line, everywhere but in the file's first paragraph, where a
 *      metadata reader takes `Key: value` lines; (b) PARENTHESES: the paragraph still holds no
 *      `[`, `]`, `<`, `>` and no backtick, so no link and no tag can form; (c) LIST ITEMS: a
 *      line that starts with an item's prefix ({@link ITEM_PREFIX}) and goes on as plain
 *      prose, the prefix identical on both sides.
 *   2  A PLAIN PARAGRAPH is the run of non-blank lines around a changed line; every line of it
 *      is a plain prose line or a list item of plain prose, on both sides, and an empty line
 *      or the file's start or end bounds it (a line of spaces or of other white space is not
 *      empty: {@link isBlank}). The brief for (c) would let another item's line bound the run
 *      too; the run stays bounded by empty lines only, because renderers do not agree on what
 *      ends an item (a `2.` under a bullet, a `1)`, a list right under a paragraph), and with
 *      every line of the run plain, whichever way a renderer divides it only words change.
 *   3  POSITION. The paragraph does not lie inside front matter or a metadata block, inside a
 *      code fence, or below raw HTML ({@link proseHeld}), and the file holds no raw start tag
 *      anywhere ({@link RAW_START}).
 *   4  CHANGED WORDS. Rule 6 reads them, and also refuses a word of 7 to 40 hexadecimal
 *      digits, which sites link as a commit id ({@link HEX_WORD}).
 *   5  NOTHING ELSE in the file changes: no line comes or goes, no line ending and no
 *      byte-order mark changes.
 * HELD TO REAL RENDERERS: `tests/hotfix-check-differential.test.js` renders every edit this
 * reader passes with markdown-it in four configurations and requires the same tree but for
 * the text of paragraphs. What that test, Python-Markdown 3.9 and pandoc 3.11 (both run on
 * the build machine, 2026-10-09) showed beyond the decision's own words is marked "found"
 * below; each is on the refusing side.
 */
/** A plain prose line, by its characters (since the ninth round a colon and parentheses among them). */
const PLAIN_LINE = /^ {0,3}[\p{L}"'\u201c\u2018][\p{L}\p{M}\p{Nd} ,.;:?!'"()\u201c\u201d\u2018\u2019\u2013\u2014\u2026-]*$/u;
/**
 * What a plain prose line does not hold: sentence punctuation before anything but a space, a
 * closing quote, a closing parenthesis or the end of the line; a hyphen that does not stand
 * between two letters; a colon that does not follow a letter, a digit, a closing quote or a
 * closing parenthesis, or does not stand before a space or the end of the line (so no scheme,
 * no time of day, no emoticon and no `: ` at a line start).
 */
const PLAIN_BREAK = /[.,;?!](?![ "'\u201d\u2019)]|$)|(?<!\p{L})-|-(?!\p{L})|(?<![\p{L}\p{Nd}"'\u201d\u2019)]):|:(?! |$)/u;
/**
 * A list item's prefix (the ninth round): 0 to 3 spaces, a bullet (`-`, `*`, `+`) or one to
 * nine digits and `.` or `)`, then 1 to 4 spaces; the item's text follows, and must be plain
 * prose. Five spaces after the marker start code, and a marker with nothing after it may
 * underline the line above into a heading, so neither is a prefix.
 */
const ITEM_PREFIX = /^ {0,3}(?:[-*+]|\d{1,9}[.)]) {1,4}(?! )/;
/**
 * The raw start tags (the decision at review of 2026-10-09): a file that holds one of them
 * anywhere, in any letter case, is refused whole. What follows such a start is raw text to
 * some renderer whatever seems to close it, above the changed paragraph or below it (found,
 * Python-Markdown: a `<script>` in a block quote below the paragraph, its end tag outside the
 * quote, came out in four different ways by the length of the paragraph above).
 */
const RAW_START = /<(?:script|style|pre|textarea|xmp|plaintext|title|noscript|iframe|!--|!\[CDATA\[|\?)/i;
/** Found (pandoc): a first word that is one letter or a Roman numeral, with a full stop, starts a list. */
const LIST_WORD = /^(?:\p{L}|[ivxlcdm]+)\.(?: |$)/iu;
/**
 * A first word that starts code where Markdown is built as MDX: `import Chart from "chart"`
 * and `export default Layout` are plain prose lines by their characters. The decision
 * removed the guards for MDX; this one costs a line and is kept (the executor, 2026-10-09).
 */
const CODE_WORD = /^(?:import|export) /;
/** A line whose first characters, after any white space, are three or more backticks or tildes. */
const FENCE_LIKE = /^(\s*)(`{3,}|~{3,})(.*)$/su;
/** What may follow an opening fence: one word at most (Python-Markdown reads no fence with two). */
const FENCE_WORD = /^\.?[A-Za-z0-9_#.+-]*$/;
/** A `<` before a letter, `!` or `/`: where a renderer may start a tag or a declaration (`<?` and `<!--` refuse the file: {@link RAW_START}). */
const TAG_START = /<[A-Za-z!/]/;
/** A word of 7 to 40 hexadecimal digits: sites link such a word as a commit id. */
const HEX_WORD = /(?<![\p{L}\p{N}])[0-9a-f]{7,40}(?![\p{L}\p{N}])/iu;
/**
 * @param {string} line @returns {boolean} an empty line. A line of spaces is not one (the
 * decision at review of 2026-10-09; until then it was): one renderer (marked 4.3.0, found in
 * the ninth round's sample of passed edits) reads on over a line of spaces to a `---` or
 * `===` below it and makes a heading of the whole, so such a line is a line of its paragraph,
 * and no plain one.
 */
const isBlank = (line) => line === '';

/**
 * @param {string} text
 * @returns {{lines: string[], ends: string[]}} the lines, split at line feeds, and each
 * line's ending: a line feed, a carriage return and a line feed, or none (the last line)
 */
function proseLines(text) {
  const lines = [];
  const ends = [];
  let at = 0;
  for (let nl = text.indexOf('\n'); nl >= 0; nl = text.indexOf('\n', at)) {
    const cr = nl > at && text[nl - 1] === '\r';
    lines.push(text.slice(at, cr ? nl - 1 : nl));
    ends.push(cr ? '\r\n' : '\n');
    at = nl + 1;
  }
  lines.push(text.slice(at));
  ends.push('');
  return { lines, ends };
}

/**
 * @param {string} line @returns {boolean} the line may open front matter or a metadata block:
 * three or more `-`, or `+++`, optionally with a word right after (`---js`). Found (pandoc):
 * groups of dashes with spaces between open a table the same way. Read by hand, one pass.
 */
function metaOpener(line) {
  let end = line.length;
  while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--;
  let k = 3;
  if (line.startsWith('---')) while (k < end && (line[k] === '-' || line[k] === ' ')) k++;
  else if (!line.startsWith('+++')) return false;
  return /^[A-Za-z0-9]*$/.test(line.slice(k, end));
}

/**
 * @param {string} line @param {boolean} unsure a line above, in the same run of lines, left
 * a backtick or a backslash unpaired
 * @returns {{raw: boolean, unsure: boolean}} `raw`: the line holds a `<` before a letter,
 * `!` or `/` outside every code span that opens and closes on this line (a run of
 * backticks up to the next run of the same length, with no `|` between: a table cell ends
 * there). `unsure`: the line leaves a run of backticks unpaired, or holds a backslash, on
 * which readers disagree (found, Python-Markdown: `\<script>` is a tag there); from there
 * on nothing is taken for a code span. One pass.
 */
function rawOutsideSpans(line, unsure) {
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '<' && /[A-Za-z!/]/.test(line[i + 1] || '')) return { raw: true, unsure };
    if (c === '\\') unsure = true;
    if (c !== '`' || unsure) { i++; continue; }
    let run = i + 1;
    while (line[run] === '`') run++;
    let close = -1;
    for (let k = line.indexOf('`', run); k >= 0 && close < 0; k = line.indexOf('`', k)) {
      let e = k + 1;
      while (line[e] === '`') e++;
      if (e - k === run - i) close = e;
      k = e;
    }
    if (close < 0 || line.slice(run, close).includes('|')) unsure = true;
    i = close < 0 || unsure ? run : close;
  }
  return { raw: false, unsure };
}

/**
 * Rule 4 (documentation), position — for each line, whether prose there cannot be vouched
 * for; or null: the file holds a fence-like line that renderers read differently, and is
 * refused whole. One pass, three things followed:
 *   FRONT MATTER OR A METADATA BLOCK, from a line that may open one ({@link metaOpener}) and
 *   is directly followed by a non-blank line, to the next line that is exactly `---` or
 *   `...` (after `+++`: `+++`); with no such line, the rest of the file. A closing line that
 *   is itself directly followed by a non-blank line opens the next block (pandoc reads the
 *   text after it as a table or as more metadata when the first block was none to it).
 *   A CODE FENCE: a line of three or more backticks or tildes, with one word after it at
 *   most, opens one; a line of as many of the same character, followed only by spaces,
 *   closes it; a fence never closed makes the rest of the file code. Ambiguous, and refusing
 *   the file: other white space on the line; any indentation (four spaces by the decision;
 *   one to three found: a list item above may hold the fence and end before it closes); a
 *   backtick or a second word after the opening fence; a closing fence longer than the
 *   opening one (found, Python-Markdown reads neither as that fence); a fence right under a
 *   line that ends in `]:` (found: it is that definition's destination); a fence inside a
 *   metadata block (a reader that hides the block does not see it).
 *   RAW HTML ABOVE. A file that holds one of the twelve raw starts anywhere is refused
 *   before this is asked ({@link RAW_START}). Of every other tag: a closer can be escaped by
 *   the Markdown around it, a block quote or list item can end before it, and any element
 *   left open holds the paragraphs below it. So every `<` before a letter, `!` or `/` holds
 *   every line from there on, front matter included. One shape is closed for every renderer
 *   and holds nothing: a tag inside a code span on one line ({@link rawOutsideSpans}; until
 *   the ninth round a comment alone on its line was a second one, and a `<!--` anywhere now
 *   refuses the file). A tag inside a code fence holds what follows like any other
 *   (found, Python-Markdown without its fenced-code extension: a renderer that knows no
 *   fences reads the fence's lines as Markdown, runs a `<script>` there, and lets a block
 *   tag left open hold the rest of the file).
 * @param {string[]} lines @returns {(boolean[]|null)}
 */
function proseHeld(lines) {
  const held = new Array(lines.length).fill(false);
  /** @type {(string[]|null)} the lines that close the open metadata block */
  let meta = null;
  /** @type {(string|null)} the run of backticks or tildes that opened the open fence */
  let fence = null;
  let raw = false;
  let unsure = false;
  for (let i = 0; i < lines.length; i++) {
    // A byte-order mark before the first line is no part of it; next to a fence it is other white space.
    const line = i === 0 && lines[0][0] === '\ufeff' ? lines[0].slice(1) : lines[i];
    const like = FENCE_LIKE.exec(line);
    if (like) {
      const [, lead, run, rest] = like;
      const word = rest.trim();
      if (meta !== null || lead !== '' || line !== lines[i] || /[^\S ]/.test(line) || !FENCE_WORD.test(word)
        || (i > 0 && /\]:[ \t]*$/.test(lines[i - 1]))) return null;
      if (fence === null) fence = run;
      else if (run[0] === fence[0] && word === '') {
        if (run.length > fence.length) return null;
        if (run.length === fence.length) fence = null;
      }
      held[i] = true;
      unsure = false;
      continue;
    }
    const closes = meta !== null && meta.includes(line);
    if (meta !== null || fence !== null) held[i] = true;
    if (closes) meta = null;
    if (meta === null && fence === null && metaOpener(line) && i + 1 < lines.length && !isBlank(lines[i + 1])) {
      meta = line[0] === '+' ? ['+++'] : ['---', '...'];
      held[i] = true;
    }
    if (isBlank(line)) unsure = false;
    if (!raw && fence !== null) raw = TAG_START.test(line);
    else if (!raw) ({ raw, unsure } = rawOutsideSpans(line, unsure));
    if (raw) held[i] = true;
  }
  return held;
}

/**
 * Rule 4 (documentation) — the words a Markdown or plain-text change alters, or null when
 * it is anything but a wording change in pure prose (the rule above). The two sides are
 * compared line by line: the same lines with the same endings, none added or removed; no carriage return
 * on its own (found: to a Markdown reader it ends a line, to the count of lines here it does
 * not) and no raw start tag anywhere ({@link RAW_START}); every changed line in a plain
 * paragraph, on both sides, outside what {@link proseHeld} holds; each line of the paragraph
 * plain prose behind its item prefix, if it has one ({@link ITEM_PREFIX}); the paragraph's
 * first line not indented unless it is an item (found: a list item above holds an indented
 * paragraph) and starting with no code word ({@link CODE_WORD}); no list word
 * ({@link LIST_WORD}) at the start of the first line's text, nor, in a paragraph that holds
 * an item, of any line's text (pandoc reads `a.` there as a marker of a list inside the
 * item); no colon in the file's first paragraph; and a changed line's item prefix the same on
 * both sides. The words are the changed part of each changed line, widened to whole words,
 * for rule 6. Linear in the two texts.
 * @param {string} oldText @param {string} newText @returns {(string[]|null)}
 */
function proseChange(oldText, newText) {
  if (/\r(?!\n)/.test(oldText) || /\r(?!\n)/.test(newText) || RAW_START.test(oldText) || RAW_START.test(newText)) return null;
  const sides = [proseLines(oldText), proseLines(newText)];
  const [o, n] = sides;
  const count = o.lines.length;
  /** Where the file's first paragraph starts, on each side: a metadata reader takes `Key: value` lines there. */
  const lead = sides.map(({ lines }) => lines.findIndex((line) => !isBlank(line)));
  /** @param {string} line @returns {string} its item prefix, or none */
  const prefix = (line) => { const m = ITEM_PREFIX.exec(line); return m ? m[0] : ''; };
  // The same endings line for line; a line that comes or goes moves the file's last ending, so this holds the number of lines too.
  if (o.ends.some((end, i) => end !== n.ends[i])) return null;
  const held = [proseHeld(o.lines), proseHeld(n.lines)];
  if (held[0] === null || held[1] === null) return null;
  const runs = [];
  let done = -1; // the last line of the last paragraph judged
  for (let i = 0; i < count; i++) {
    const a = o.lines[i];
    const b = n.lines[i];
    if (a === b) continue;
    if (i > done) {
      let first = i;
      while (first > 0 && !isBlank(o.lines[first - 1]) && !isBlank(n.lines[first - 1])) first--;
      done = i;
      while (done + 1 < count && !isBlank(o.lines[done + 1]) && !isBlank(n.lines[done + 1])) done++;
      for (let side = 0; side < 2; side++) {
        const lines = sides[side].lines;
        const texts = [];
        let items = false;
        for (let k = first; k <= done; k++) {
          const at = prefix(lines[k]).length;
          items = items || at > 0;
          texts.push(lines[k].slice(at));
        }
        if ((lines[first][0] === ' ' && prefix(lines[first]) === '') || CODE_WORD.test(lines[first])) return null;
        for (let k = first; k <= done; k++) {
          const text = texts[k - first];
          if (/** @type {boolean[]} */ (held[side])[k] || !PLAIN_LINE.test(text) || PLAIN_BREAK.test(text)
            || ((k === first || items) && LIST_WORD.test(text.trimStart())) || (first === lead[side] && text.includes(':'))) return null;
        }
      }
    }
    if (prefix(a) !== prefix(b)) return null;
    const { p, s } = commonEnds(a, b);
    const spaces = (line, from, step) => { let k = from; while (line[k] === ' ') k += step; return Math.abs(k - from); };
    if (spaces(a, 0, 1) !== spaces(b, 0, 1) || spaces(a, a.length - 1, -1) !== spaces(b, b.length - 1, -1)) return null;
    let start = p;
    while (start > 0 && a[start - 1] !== ' ') start--;
    const wordEnd = (line) => { let e = line.length - s; while (e < line.length && line[e] !== ' ') e++; return e; };
    runs.push(a.slice(start, wordEnd(a)), b.slice(start, wordEnd(b)));
  }
  return runs;
}

/**
 * The functional plan's clause for a file whose format the check reads but whose change it
 * cannot vouch for: text inside a component or custom element, text inside `<svg>` or
 * `<math>`, HTML outside the strict subset, a Markdown or plain-text change that is anything
 * but a wording change in pure prose, a colour that is not the whole value of a colour property.
 * @param {string} display @returns {string}
 */
const inexactClause = (display) => `it changes ${display} in a way the check cannot read exactly, and only what it can read exactly qualifies`;

/**
 * Rule 4, the content — judge the whole old and new file with its kind's reader. When a
 * scanner of either side ended inside an unfinished construct or lost its place, the change
 * could not be read (every scanner fails closed); when the markup scanner met something
 * outside its strict subset, the change cannot be read exactly.
 * @param {ChangedFile} f a file {@link kindOf} placed in a qualifying kind
 * @returns {{runs: string[]}|{clause: string, cause: string}}
 */
function ruleContent(f) {
  scanFault = null;
  const judged = readKind(f);
  if (!scanFault) return judged;
  if (scanFault === 'subset') return { clause: inexactClause(f.display), cause: 'unreadable' };
  const why = scanFault === 'open' ? 'leaves a tag, quote, comment, block, fence or span open' : 'holds something I cannot follow';
  return { clause: `I could not read the change (${f.display} ${why})`, cause: 'unreadable' };
}

/**
 * Rule 4, the kind — place one file by its name and its place, before any reader reads its
 * content: the first qualifying kind that fits, or the clause that refuses it. A place that
 * governs the work never qualifies, whatever the kind; a file of no qualifying kind gets the
 * clause of the first other kind it matches.
 * @param {ChangedFile} f
 * @returns {{kind: string}|{clause: string, cause: string}}
 */
function kindOf(f) {
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
  const legal = DOC_EXT.has(ext) ? LEGAL_NAMES.find(([start]) => lowerBase.startsWith(start)) : undefined;
  // Markdown under `.github/` is documentation (a contributing guide, an issue template),
  // except under `.github/workflows/`; everything else under a build folder is the build.
  const buildFolder = topFolders.some((p, i) => BUILD_FOLDERS.has(p) && !githubDoc(p, i));

  // A legal text never qualifies, whatever its change: the functional plan's clause for a sensitive area.
  if (legal) return { clause: `${d} sits in an area named ${legal[1]}, and such areas are never a hotfix`, cause: 'sensitive-area' };
  let kind = null;
  // Plain text is documentation only under a documentation name; every other `.txt` falls to the clauses below.
  if ((ext === '.md' || documentationText(lowerBase)) && !isDependency && !buildText && !settingsText) kind = 'documentation';
  else if (MARKUP_EXT.has(ext)) kind = 'markup';
  else if (CATALOGUE_EXT.has(ext) && folders.some((p) => CATALOGUE_FOLDERS.has(p))) kind = 'catalogue';
  else if (ext === '.css') kind = 'colour';
  if (kind !== null && governing) return unrecognised;
  // A side emptied, or filled from empty, holds the content of a removal or an addition.
  if (kind !== null && (f.oldText === '') !== (f.newText === '')) return unrecognised;
  if (kind !== null && buildFolder) return build;
  if (kind === 'documentation' && dotFolder) return unrecognised;
  if (kind !== null) return { kind };

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

/**
 * Rule 4, the content — the wording one file's change alters, read by the reader of the kind
 * {@link kindOf} placed it in, or the clause that refuses it; the scanners' faults are read
 * by {@link ruleContent}.
 * @param {ChangedFile} f
 * @returns {{runs: string[]}|{clause: string, cause: string}}
 */
function readKind(f) {
  const { ext } = nameParts(f);
  const d = f.display;
  const kind = f.kind;
  const unrecognised = { clause: `I do not recognise ${d} as wording or a colour`, cause: 'unrecognised' };
  const setting = { clause: `it changes a setting in ${d}, and settings changes are a common cause of outages`, cause: 'setting' };
  const inexact = { clause: inexactClause(d), cause: 'unrecognised' };
  if (kind === 'documentation') {
    // Rule 2 has already refused a file with a missing side, so both texts are present.
    const runs = proseChange(/** @type {string} */ (f.oldText), /** @type {string} */ (f.newText));
    return runs ? { runs } : inexact;
  }
  if (kind === 'markup') {
    if (!equalHunks(f.hunks)) return unrecognised;
    // A browser takes one leading byte-order mark off the page before it reads it; the mark neither comes nor goes.
    const marked = (text) => /** @type {string} */ (text)[0] === '\uFEFF';
    if (marked(f.oldText) !== marked(f.newText)) return unrecognised;
    const tokens = (text) => scanMarkup(lineFeeds(/** @type {string} */ (text)).slice(marked(text) ? 1 : 0));
    const texts = changedTexts(tokens(f.oldText), tokens(f.newText), markupWording);
    return texts.runs ? { runs: texts.runs } : texts.inexact ? inexact : unrecognised;
  }
  if (kind === 'catalogue') {
    if (!equalHunks(f.hunks)) return unrecognised;
    const oldFresh = entryLines(lineFeeds(/** @type {string} */ (f.oldText)), ext);
    const newFresh = entryLines(lineFeeds(/** @type {string} */ (f.newText)), ext);
    const runs = [];
    for (const pair of linePairs(f.hunks)) {
      if (!oldFresh[pair.oldLine - 1] || !newFresh[pair.newLine - 1]) {
        fault('lost'); // the line is read alone, but it does not start an entry
        return unrecognised;
      }
      const a = catalogueEntry(pair.o, ext);
      const b = catalogueEntry(pair.n, ext);
      if (!a || !b || a.key !== b.key || a.value === b.value || placeholders(a.value) !== placeholders(b.value)) return unrecognised;
      const oldValue = catalogueWording(a, ext);
      const newValue = catalogueWording(b, ext);
      if (oldValue === null || newValue === null) return unrecognised;
      runs.push(oldValue.replace(PLACEHOLDER, ''), newValue.replace(PLACEHOLDER, ''));
    }
    return { runs };
  }
  // The fourth kind: a colour in a stylesheet.
  const o = lineFeeds(/** @type {string} */ (f.oldText));
  const n = lineFeeds(/** @type {string} */ (f.newText));
  // A custom property's change is a setting, unless the property is named for a colour and
  // holds exactly one colour before and after (any other value of such a property cannot be
  // read exactly); those values are then levelled, and what is left must be identical or a
  // colour that is the whole value of a real colour property.
  const levelled = colourNamedEdit(o, n);
  if (levelled === 'inexact') return { clause: inexactClause(d), cause: 'setting' };
  if (!levelled) return setting;
  if (!equalHunks(f.hunks)) return unrecognised;
  const [a, b] = levelled;
  const edit = a === b ? o !== n : colourEdit(a, b);
  return edit === true ? { runs: [] } : edit === 'inexact' ? inexact : unrecognised;
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
 * sensitive word, and no camel-case sub-word of one (`AuthPanel` holds `auth`, `Author`
 * does not). The path is folded first (Unicode NFKC, so full-width letters read as plain
 * ones, then lower case) and split at every character that is no letter; a sub-word starts
 * where a capital letter follows a small one. The words count also in the plural, but not in a stylesheet's own file name: `tokens.css`
 * holds design tokens, while `login.css` and `payment.css` still name their area); the path is no
 * secret-bearing file by CTOC's own secret-file guard (`isSecretTarget`: the word
 * `secret`), and, in CTOC's own repository only, no part of CTOC's enforcement by its
 * protected-paths list (`isProtectedEnforcementPath`: the word `enforcement`), which names
 * CTOC's own files (`src/hooks/`, ...), not another project's. Both lists are CTOC's, read
 * where they live, never copied.
 * @param {ChangedFile} f @param {boolean} ctoc the repository is CTOC's own source
 * @returns {Refusal|null}
 */
function ruleSensitiveArea(f, ctoc) {
  const nameAt = f.topRel.lastIndexOf('/') + 1;
  /** @param {string} text @param {boolean} plural @returns {string|null} the first sensitive word among its letter runs and their camel-case sub-words */
  const wordIn = (text, plural) => {
    for (const run of text.normalize('NFKC').split(/\P{L}+/u)) {
      for (const piece of [run, ...run.split(/(?<=\p{Ll})(?=\p{Lu})/u)]) {
        const part = piece.toLowerCase();
        const found = plural ? sensitiveWord(part) : SENSITIVE_WORDS.has(part) ? part : null;
        if (found) return found;
      }
    }
    return null;
  };
  let word = wordIn(f.topRel.slice(0, nameAt), true) || wordIn(f.topRel.slice(nameAt), nameParts(f).ext !== '.css');
  if (!word && isSecretTarget(f.topRel)) word = 'secret';
  if (!word && ctoc && isProtectedEnforcementPath(f.topRel)) word = 'enforcement';
  return word ? { clause: `${f.display} sits in an area named ${word}, and such areas are never a hotfix`, cause: 'sensitive-area' } : null;
}

/**
 * Rule 6 — the old and new wording of markup, catalogue and documentation files carries no
 * risk marker; in documentation the changed words ({@link proseChange}) also hold no word of
 * 7 to 40 hexadecimal digits ({@link HEX_WORD}).
 */
function ruleRiskMarker(f) {
  const marked = f.kind === 'documentation' ? (r) => DOC_RISK.test(r) || HEX_WORD.test(r) : (r) => RISK_MARKER.test(r);
  return f.runs.some(marked)
    ? { clause: `the wording in ${f.display} contains a number, a price, a web address or an e-mail address`, cause: 'risk-marker' }
    : null;
}

/**
 * Rules 2, 7, 4 (the kind of each file), 3, 4 (the content of each file), 5 and 6, in that
 * order; the first failing file of the first failing rule gives the clause. The size rule
 * runs once every file's kind is known and before any reader reads a file's content (the
 * decision at review of 2026-10-09): a change over the limit gets the size clause of the
 * functional plan's scenario, whatever a reader would have said of it, and a change that is
 * program code or a setting is still named for what it is. Rule 4 records each file's kind
 * and wording for rule 6.
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
    const r = kindOf(f);
    if ('clause' in r) return r;
    f.kind = r.kind;
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
  for (const f of change.files) {
    const r = ruleContent(f);
    if ('clause' in r) return r;
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
