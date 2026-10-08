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
 *         status line as `text`, and `next`, the exact route that runs the tests.
 *   ... hotfix check --run-tests [<file> ...]
 *       — the background test run: rules 1 to 7 again, then rule 8 in a temporary copy of
 *         the repository.
 * A pass answers `verdict: 'hotfix'`, `text: ''`, `tests` and `commit: { files, add,
 * message }`; `add` and `message` are the exact git commands, run from the project root,
 * that stage and commit exactly the judged files (`--literal-pathspecs`, `--only`).
 * A refusal answers `verdict: 'refused'` and the sentence; a fault, a patch that did not
 * apply and a copy that could not be removed also carry `detail`, outside the sentence.
 *
 * WHAT IS JUDGED. Exactly the change git would commit for the named files (or, with no
 * file named, every changed and new file outside `.ctoc/`, which holds CTOC's own state),
 * against the last commit. No language model is involved; the same change always gets
 * the same answer.
 *
 * THE RULES, in the order they run (the first that fails gives the clause; files are
 * looked at in sorted display-path order):
 *   1  the change can be read            — a git repository with a commit, the project
 *                                          inside it, every judged name one the commit
 *                                          command can carry, every file text
 *   2  same files, same names            — nothing added, removed, renamed, re-moded, linked
 *   7  no test is edited                 — fix the code, not the tests
 *   4  only kinds that qualify           — documentation, visible text in markup, message
 *                                          catalogue values, colour values in stylesheets;
 *                                          never in a place that governs the work
 *   5  not in a sensitive area           — 33 whole words in the path (auth, login, ...)
 *   6  no risk marker in wording         — no number, currency, %, address, e-mail, code
 *   3  size                              — at most 20 changed lines in at most 3 files
 *   8  the existing tests pass           — only in the `--run-tests` call, in a copy
 * Rule 7 and the kind rule run before size because the functional plan's own scenarios
 * name an edited test and the kind of change ahead of size; all of 2 to 7 read the same
 * diff, so the order costs nothing, and the tests still run last.
 *
 * THE COPY OF THE REPOSITORY'S INDEX. A diff against the working tree refreshes the index
 * it reads and rewrites it, whatever GIT_OPTIONAL_LOCKS says (verified, the plan's
 * Decision 44). So each call copies the repository's own index (`rev-parse --git-path
 * index`, the right one for a linked worktree too) into the check's own temporary folder
 * (`mkdtemp` under the system's temporary folder) with its modification time kept, and
 * every git call in the main repository names that copy through GIT_INDEX_FILE: the
 * listings, the diffs, `cat-file`, the hashings. The exceptions are rule 8's: the four
 * calls on its temporary index name that one, and `worktree add`, `worktree remove` and
 * `apply` name none. `.git/index` is never written.
 *
 * THE TWO HASHINGS (`--run-tests` only). Each judged regular file is hashed with
 * `hash-object` (git's own clean filters, exactly as `git add` applies them) before any
 * rule reads its content, and again after the tests. Rule 8 compares the first hashes
 * with the files' ids in its temporary index before any test runs, and the second hashes
 * with those ids after; any difference refuses with "<file> changed while it was being
 * checked". So the bytes the rules judged, the bytes the tests ran on and the ids slice 2
 * records are one set.
 *
 * RULE 8 — THE TEMPORARY COPY. The tests never run in the working folder. In the check's
 * temporary folder: an empty `no-hooks` folder; `tree`, a detached worktree of the last
 * commit made with that empty hooks folder and the file-system monitor off (the
 * repository's smudge filters still run, on purpose); the judged change carried in as a
 * `--binary --full-index` patch built through a temporary index (`read-tree`, `add
 * --all`, `ls-files --stage`, `diff --cached`) and applied by `git apply` inside the copy;
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
 * link unlinked by itself (one already gone counts as removed), then `git worktree remove
 * --force` of exactly the copy's worktree, then the folder; the first failure stops it and
 * is named in `detail`. Worktrees are never pruned.
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
 * name the commit command cannot carry; <file> is not text; the change does not apply
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

const GOVERNING_FOLDERS = new Set(['.claude', '.ctoc', 'agents', 'skills', 'commands', 'plans']);
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
/** Build lists that end in `.txt` and so are never documentation. */
const BUILD_TEXT_NAMES = new Set(['CMakeLists.txt', 'runtime.txt']);
const BUILD_NAMES = new Set(['Makefile', 'Jenkinsfile', 'Procfile', 'Vagrantfile', '.gitlab-ci.yml',
  'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', ...BUILD_TEXT_NAMES]);
const BUILD_FOLDERS = new Set(['.github', '.gitlab', '.circleci', '.buildkite']);
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
 * @property {boolean} untracked
 * @property {string} [firstHash] the id `hash-object` gave before any rule read the file
 * @property {string} [stagedId] the id rule 8's temporary index holds for it
 * @property {(string|null)} [oldText]
 * @property {(string|null)} [newText]
 * @property {Hunk[]} [hunks]
 * @property {string} [kind] the qualifying kind rule 4 placed it in
 * @property {string[]} [runs] the old and new wording rule 6 reads
 */
/** @typedef {{files: ChangedFile[], lineCount: number, root: string, rootFromTop: string}} Change */
/**
 * The check's own state for one call: the repository it reads, and everything rule 8
 * made, so that {@link removeCopy} can take it away on every path.
 * @typedef {Object} Context
 * @property {(string|null)} top the repository's top level (real path)
 * @property {(string|null)} head the last commit's full id
 * @property {(string|null)} tmp the check's temporary folder (real path)
 * @property {(string|null)} repoIndex the copy of the repository's index, inside `tmp`
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
 * environment, git's redirecting variables removed, output kept as a buffer. `index`
 * names the index the call reads (GIT_INDEX_FILE); `input` is handed on standard input.
 * A missing git is the "not installed" clause.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{index?: (string|null), input?: Buffer}} [opts]
 * @returns {{status: (number|null), stdout: Buffer, stderr: Buffer}}
 */
function runGit(cwd, args, { index = null, input } = {}) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, LC_ALL: 'C', GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' };
  for (const name of GIT_REDIRECTS) delete env[name];
  if (index) env.GIT_INDEX_FILE = index;
  const r = spawnSync('git', ['-c', 'core.quotepath=false', '-c', 'diff.autoRefreshIndex=true', ...args],
    { cwd, env, input, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.error) {
    if (/** @type {NodeJS.ErrnoException} */ (r.error).code === 'ENOENT') throw new Unreadable('git is not installed');
    throw r.error;
  }
  return r;
}

/**
 * {@link runGit} that throws (the "check stopped" clause) when git exits non-zero.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{index?: (string|null), input?: Buffer}} [opts]
 * @returns {Buffer}
 */
function gitOut(cwd, args, opts) {
  const r = runGit(cwd, args, opts);
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

/** @param {string} text @returns {string[]} the lines of a new file, without the empty one after a final newline */
function newFileLines(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
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
    const out = gitOut(top, ['hash-object', '--', ...regular], { index: ctx.repoIndex }).toString('utf8').trim().split('\n');
    regular.forEach((rel, i) => ids.set(rel, out[i]));
  }
  return ids;
}

/**
 * Rule 1 — the copy of the repository's index (Decision 44): the check's own temporary
 * folder under the system's temporary folder, and in it the index `rev-parse --git-path
 * index` names, its modification time kept (git trusts a cached file time only when it is
 * older than the index file's own). Every later read in the main repository names it.
 * @param {Context} ctx
 */
function copyIndex(ctx) {
  const top = /** @type {string} */ (ctx.top);
  const index = path.resolve(top, gitOut(top, ['rev-parse', '--git-path', 'index']).toString('utf8').trim());
  ctx.tmp = safeFs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hotfix-'));
  ctx.tmp = realPath(ctx.tmp);
  ctx.repoIndex = path.join(ctx.tmp, 'repo-index');
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
  const topRun = runGit(realRoot, ['rev-parse', '--show-toplevel']);
  if (topRun.status !== 0) throw new Unreadable('this folder is not a git repository');
  const top = realPath(topRun.stdout.toString('utf8').trim());
  const rootRel = path.relative(top, realRoot);
  if (climbsOut(rootRel)) throw new Unreadable('this folder lies outside the repository git reports');
  const headRun = runGit(top, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']);
  if (headRun.status !== 0) throw new Unreadable('this folder has no commit to compare with');
  ctx.top = top;
  ctx.head = headRun.stdout.toString('utf8').trim();
  copyIndex(ctx);
  const read = (args) => gitOut(top, args, { index: ctx.repoIndex });

  const rootFromTop = slash(rootRel);
  const toTop = (rel) => (rootFromTop ? `${rootFromTop}/${rel}` : rel);
  const wanted = named.map((arg) => {
    const written = arg.replace(/\\/g, '/');
    const rel = path.relative(realRoot, path.resolve(realRoot, written));
    if (rel === '' || climbsOut(rel)) throw new Unreadable(`${written} is outside this project`);
    return { display: slash(rel), topRel: toTop(slash(rel)) };
  });
  const specs = wanted.length > 0 ? wanted.map((w) => w.topRel) : (rootFromTop ? [rootFromTop] : []);

  /** @type {Array<Omit<ChangedFile, 'display'>>} */
  const entries = [];
  const raw = read(['diff', 'HEAD', '--raw', '-z', '--no-abbrev', ...FIXED_DIFF, '--', ...specs]).toString('utf8').split('\0');
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const meta = raw[i].slice(1).split(' ');
    entries.push({ topRel: raw[i + 1], oldMode: meta[0], newMode: meta[1], oldSha: meta[2], status: meta[4][0], untracked: false });
  }
  const others = read(['ls-files', '--others', '--exclude-standard', '-z', '--', ...specs])
    .toString('utf8').split('\0').filter(Boolean);
  for (const topRel of others) {
    const st = safeFs.lstatSync(path.join(top, topRel));
    entries.push({ topRel, oldMode: '000000', newMode: st.isSymbolicLink() ? '120000' : '100644', oldSha: null, status: 'A', untracked: true });
  }

  for (const w of wanted) {
    if (!entries.some((e) => e.topRel === w.topRel || e.topRel.startsWith(`${w.topRel}/`))) {
      throw new Unreadable(`${w.display} holds no change that git would commit`);
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

  if (runTests) {
    const first = hashJudged(ctx, files);
    for (const f of files) f.firstHash = first.get(f.topRel);
  }

  const unreadableMode = (m) => m === '120000' || m === '160000' || m === '000000';
  for (const f of files) {
    f.oldText = unreadableMode(f.oldMode) ? null : asText(read(['cat-file', 'blob', /** @type {string} */ (f.oldSha)]), f.display);
    f.newText = f.status === 'D' || unreadableMode(f.newMode) ? null
      : asText(safeFs.readFileSync(path.join(top, f.topRel)), f.display);
  }

  const tracked = files.filter((f) => !f.untracked).map((f) => f.topRel);
  const groups = tracked.length === 0 ? new Map() : parsePatch(read(['diff', 'HEAD', '-U0', '--ignore-cr-at-eol',
    '--src-prefix=a/', '--dst-prefix=b/', '--inter-hunk-context=0', '--diff-algorithm=myers', '--indent-heuristic',
    ...FIXED_DIFF, '--', ...tracked]).toString('utf8'));
  let lineCount = 0;
  for (const f of files) {
    f.hunks = f.untracked
      ? [{ oldStart: 0, newStart: 1, removed: [], added: f.newText === null ? [] : newFileLines(f.newText) }]
      : (groups.get(f.topRel) || []);
    for (const h of f.hunks) lineCount += h.removed.length + h.added.length;
  }
  return { files, lineCount, root: realRoot, rootFromTop };
}

/** @param {{display: string}} f @returns {{base: string, ext: string, folders: string[]}} */
function nameParts(f) {
  const parts = f.display.split('/');
  const base = parts[parts.length - 1];
  return { base, ext: path.posix.extname(base).toLowerCase(), folders: parts.slice(0, -1).map((p) => p.toLowerCase()) };
}

/** Rule 2 — same files, same names: no add, delete, rename, mode change, type change or link. */
function ruleSameFiles(f) {
  if (f.status === 'A' || f.status === 'D') return { clause: `it adds, removes or renames ${f.display}`, cause: 'adds-removes-renames' };
  if (f.status !== 'M' || f.oldMode !== f.newMode || f.oldMode === '120000' || f.oldMode === '160000') {
    return { clause: `I do not recognise ${f.display} as wording or a colour`, cause: 'unrecognised' };
  }
  return null;
}

/** Rule 7 — no test is edited (a test folder in the path, or a `*.test.*` / `*.spec.*` name). */
function ruleNoTestEdited(f) {
  const { base, folders } = nameParts(f);
  const isTest = folders.some((p) => TEST_FOLDERS.has(p)) || /\.(test|spec)\./i.test(base);
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
 * Rule 4 (markup) — the line pair is an edit of visible text: the parts that differ lie
 * after a `>` that closes a tag opened on the line and before the next `<` that opens a
 * tag, and the text run holds no template or script characters. In `.jsx` and `.tsx` the
 * `>` must end an opening tag `<name …>` and the `<` after the text must begin `</name`,
 * the same name, so a generic type or a comparison chain is never text.
 * @param {string} o the old line
 * @param {string} n the new line
 * @param {boolean} jsx whether the `.jsx`/`.tsx` rules apply
 * @returns {{oldRun: string, newRun: string}|null}
 */
function markupTextEdit(o, n, jsx) {
  let p = 0;
  while (p < o.length && p < n.length && o[p] === n[p]) p++;
  let s = 0;
  while (s < o.length - p && s < n.length - p && o[o.length - 1 - s] === n[n.length - 1 - s]) s++;
  if (p === 0) return null;
  const gt = o.lastIndexOf('>', p - 1);
  if (gt < 0) return null;
  const lt = gt === 0 ? -1 : o.lastIndexOf('<', gt - 1);
  // lt < gt, so o[lt + 1] exists; o[lt + 2] is read only after a `/`, which is not the `>`.
  if (lt < 0 || !(/[A-Za-z]/.test(o[lt + 1]) || (o[lt + 1] === '/' && /[A-Za-z]/.test(o[lt + 2])))) return null;
  const opening = jsx ? /^<([A-Za-z][\w.:-]*)/.exec(o.slice(lt, gt)) : null;
  if (jsx && !opening) return null;
  const runs = [];
  /** @type {Array<[string, number]>} */
  const sides = [[o, o.length - s], [n, n.length - s]];
  for (const [line, changedEnd] of sides) {
    const next = line.indexOf('<', gt + 1);
    if (next < 0 || !/[A-Za-z/]/.test(line[next + 1] || '') || changedEnd > next) return null;
    if (opening && !closesElement(line, next, opening[1])) return null;
    const run = line.slice(gt + 1, next);
    if (/[{}$`&]/.test(run) || (jsx && /[();="']/.test(run))) return null;
    runs.push(run);
  }
  return { oldRun: runs[0], newRun: runs[1] };
}

/** @param {string} line @param {number} at @param {string} name @returns {boolean} whether `</name` closes the element at `at` */
function closesElement(line, at, name) {
  const after = at + 2 + name.length;
  return line.startsWith(`</${name}`, at) && (after >= line.length || /[\s>]/.test(line[after]));
}

/**
 * Rule 4 (markup) — the 1-based line numbers inside `<script>`, `<style>` and
 * `<textarea>` blocks (letter case ignored; an unclosed block runs to the end).
 * @param {string} text
 * @returns {Set<number>}
 */
function blockedLines(text) {
  const blocked = new Set();
  const lower = text.toLowerCase();
  const lineAt = (idx) => {
    let n = 1;
    for (let i = text.indexOf('\n'); i !== -1 && i < idx; i = text.indexOf('\n', i + 1)) n++;
    return n;
  };
  const open = /<(script|style|textarea)(?=[\s>/]|$)/gi;
  let m;
  while ((m = open.exec(text)) !== null) {
    const close = lower.indexOf(`</${m[1].toLowerCase()}`, m.index + 1);
    const end = close < 0 ? text.length : close;
    for (let l = lineAt(m.index), last = lineAt(end); l <= last; l++) blocked.add(l);
    open.lastIndex = Math.max(open.lastIndex, end);
  }
  return blocked;
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
 * Rule 4 (message catalogue) — split one line into its key part and its value.
 * @param {string} line
 * @param {string} ext
 * @returns {{key: string, value: string}|null}
 */
function catalogueEntry(line, ext) {
  let m;
  if (ext === '.json') {
    m = /^(\s*"(?:[^"\\]|\\.)*"\s*:\s*)"((?:[^"\\]|\\.)*)"(\s*,?\s*)$/.exec(line);
    return m ? { key: `${m[1]}\u0000${m[3]}`, value: m[2] } : null;
  }
  if (ext === '.po') {
    m = /^(msgstr(?:\[\d\]|\[\d\d\])?[ \t]+)"((?:[^"\\]|\\.)*)"\s*$/.exec(line);
    return m ? { key: m[1], value: m[2] } : null;
  }
  if (ext === '.properties') {
    m = /^(\s*[^\s=:#!][^=:]*[=:][ \t]*)(.*)$/.exec(line);
    return m && !m[2].endsWith('\\') ? { key: m[1], value: m[2] } : null;
  }
  m = /^(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z0-9_][\w.-]*)[ \t]*:[ \t]+)(.*)$/.exec(line);
  if (!m) return null;
  const value = m[2].trimEnd();
  if (value === '') return null;
  if (value[0] === '"') return /^"(?:[^"\\]|\\.)*"$/.test(value) ? { key: m[1], value: value.slice(1, -1) } : null;
  if (value[0] === "'") return /^'(?:[^']|'')*'$/.test(value) ? { key: m[1], value: value.slice(1, -1) } : null;
  if ('[{&*!|>%@`'.includes(value[0]) || value.includes(' #')) return null;
  return { key: m[1], value };
}

/** @param {string} value @returns {string} the placeholders, sorted, as one comparable string */
const placeholders = (value) => (value.match(PLACEHOLDER) || []).sort().join('\u0000');

/**
 * Rule 4 (colour) — the colour tokens on a line, each standing alone between the
 * separators the plan names.
 * @param {string} line
 * @returns {Array<{t: string, i: number, j: number}>}
 */
function colourTokens(line) {
  const out = [];
  const re = /#[0-9A-Fa-f]+|(?:rgba?|hsla?)\([^()]*\)|[A-Za-z]+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const t = m[0];
    const i = m.index;
    const j = i + t.length;
    if (i > 0 && !/[\s:,(]/.test(line[i - 1])) continue;
    if (j < line.length && !/[\s;,)}!]/.test(line[j])) continue;
    const ok = t[0] === '#' ? [4, 5, 7, 9].includes(t.length) : t.includes('(') || NAMED_COLOURS.has(t.toLowerCase());
    if (ok) out.push({ t, i, j });
  }
  return out;
}

/** Rule 4 (colour) — a token stands in a declaration value (`prop: … <token>`). */
function inDeclaration(line, i) {
  const from = i === 0 ? 0 : Math.max(line.lastIndexOf('{', i - 1), line.lastIndexOf(';', i - 1)) + 1;
  return /^\s*(--[\w-]+|\$[\w-]+|@[\w-]+|[A-Za-z-]+)\s*:[^;{}]*$/.test(line.slice(from, i));
}

/** Rule 4 (colour) — the pair differs only in colours that stand in declaration values. */
function colourEdit(o, n) {
  const a = colourTokens(o);
  const b = colourTokens(n);
  const mask = (line, toks) => toks.reduceRight((s, t) => s.slice(0, t.i) + '\u0001' + s.slice(t.j), line);
  if (a.length !== b.length || mask(o, a) !== mask(n, b)) return false;
  let changed = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k].t === b[k].t) continue;
    changed++;
    if (!inDeclaration(o, a[k].i) || !inDeclaration(n, b[k].i)) return false;
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

/**
 * Rule 4 — place the file in the first kind that fits and check every changed line has
 * that kind's shape; a place that governs the work never qualifies, whatever the kind;
 * otherwise the clause of the first other kind it matches.
 * @returns {{kind: string, runs: string[]}|{clause: string, cause: string}}
 */
function ruleKind(f) {
  const { base, ext, folders } = nameParts(f);
  const d = f.display;
  const unrecognised = { clause: `I do not recognise ${d} as wording or a colour`, cause: 'unrecognised' };
  const isDependency = DEPENDENCY_NAMES.has(base) || /^(requirements|constraints).*\.txt$/i.test(base)
    || (ext === '.txt' && folders.includes('requirements'));
  const governing = base.toLowerCase() === 'claude.md' || folders.some((p) => GOVERNING_FOLDERS.has(p));

  let kind = null;
  if (DOC_EXT.has(ext) && !isDependency && !BUILD_TEXT_NAMES.has(base)) kind = 'documentation';
  else if (MARKUP_EXT.has(ext)) kind = 'markup';
  else if (CATALOGUE_EXT.has(ext) && folders.some((p) => CATALOGUE_FOLDERS.has(p))) kind = 'catalogue';
  else if (COLOUR_EXT.has(ext)) kind = 'colour';
  if (kind !== null && governing) return unrecognised;

  if (kind === 'documentation') return { kind, runs: [] };
  if (kind === 'markup') {
    if (!equalHunks(f.hunks)) return unrecognised;
    const jsx = ext === '.jsx' || ext === '.tsx';
    // Rule 2 has already refused a file with a missing side, so both texts are present.
    const oldBlocked = blockedLines(/** @type {string} */ (f.oldText));
    const newBlocked = blockedLines(/** @type {string} */ (f.newText));
    const runs = [];
    for (const pair of linePairs(f.hunks)) {
      if (oldBlocked.has(pair.oldLine) || newBlocked.has(pair.newLine)) return unrecognised;
      const edit = markupTextEdit(pair.o, pair.n, jsx);
      if (!edit) return unrecognised;
      runs.push(edit.oldRun, edit.newRun);
    }
    return { kind, runs };
  }
  if (kind === 'catalogue') {
    if (!equalHunks(f.hunks)) return unrecognised;
    const runs = [];
    for (const pair of linePairs(f.hunks)) {
      const a = catalogueEntry(pair.o, ext);
      const b = catalogueEntry(pair.n, ext);
      if (!a || !b || a.key !== b.key || a.value === b.value || placeholders(a.value) !== placeholders(b.value)) return unrecognised;
      runs.push(a.value.replace(PLACEHOLDER, ''), b.value.replace(PLACEHOLDER, ''));
    }
    return { kind, runs };
  }
  if (kind === 'colour') {
    if (!equalHunks(f.hunks)) return unrecognised;
    for (const pair of linePairs(f.hunks)) if (!colourEdit(pair.o, pair.n)) return unrecognised;
    return { kind, runs: [] };
  }

  if (isDependency) return { clause: `it changes the dependencies in ${d}`, cause: 'dependencies' };
  if (ext === '.sql' || folders.some((p) => DATABASE_FOLDERS.has(p))) return { clause: `it changes stored data in ${d}`, cause: 'stored-data' };
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.') || BUILD_NAMES.has(base) || ext === '.gradle'
    || base.endsWith('.gradle.kts') || /^(webpack|vite|rollup|esbuild|babel|tsup|turbo)\.config\./.test(base)
    || folders.some((p) => BUILD_FOLDERS.has(p))) {
    return { clause: `it changes how the project is built or shipped in ${d}`, cause: 'build' };
  }
  if (SETTINGS_EXT.has(ext) || base === '.env' || base.startsWith('.env.')) {
    return { clause: `it changes a setting in ${d}, and settings changes are a common cause of outages`, cause: 'setting' };
  }
  if (CODE_EXT.has(ext)) {
    const onlyText = equalHunks(f.hunks) && [...linePairs(f.hunks)].every((p) => emptyLiterals(p.o) === emptyLiterals(p.n));
    return onlyText
      ? { clause: `it changes text inside program code in ${d}, and no check can tell whether people read that text or the program depends on it`, cause: 'text-in-code' }
      : { clause: `it changes program logic in ${d}, and only wording and colours qualify`, cause: 'program-logic' };
  }
  return unrecognised;
}

/** Rule 5 — no letter run of the path equals a sensitive word. */
function ruleSensitiveArea(f) {
  const word = f.display.split(/[^A-Za-z]+/).map((p) => p.toLowerCase()).find((p) => SENSITIVE_WORDS.has(p));
  return word ? { clause: `${f.display} sits in an area named ${word}, and such areas are never a hotfix`, cause: 'sensitive-area' } : null;
}

/** Rule 6 — the old and new wording of markup and catalogue files carries no risk marker. */
function ruleRiskMarker(f) {
  return f.runs.some((r) => RISK_MARKER.test(r))
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
  for (const rule of [ruleSensitiveArea, ruleRiskMarker]) {
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
 * whichever of the two was read, or a plain statement that the command failed.
 * @param {string} output standard output and standard error together
 * @param {string} root the copy's project root (real path), so the file reads as the same path in the working folder
 * @returns {string}
 */
function firstFailingTest(output, root) {
  const text = String(output).replace(ANSI, '');
  const lines = text.split(/\r?\n/);
  let name = null;
  let m = /^\s*not ok \d+ - (.+)$/m.exec(text);
  if (m) name = m[1].trim();
  if (!name) {
    for (const line of lines) {
      const s = /^\s*✖ (.+)$/.exec(line);
      if (s && s[1].trim() !== 'failing tests:') { name = s[1].replace(/ \([\d.]+m?s\)$/, '').trim(); break; }
    }
  }
  if (!name && (m = /^\s*● (.+)$/m.exec(text))) name = m[1].trim();
  let file = null;
  for (const re of [/^\s*location: '(.+):\d+:\d+'\s*$/m, /^\s*test at (.+):\d+:\d+\s*$/m, /^\s*FAIL (\S+)/m]) {
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
  const listed = gitOut(top, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
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
  const read = (args) => gitOut(top, args, { index: ctx.repoIndex }).toString('utf8').split('\0').filter(Boolean);
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
  const tmp = /** @type {string} */ (ctx.tmp);
  const head = /** @type {string} */ (ctx.head);
  const noHooks = path.join(tmp, 'no-hooks');
  safeFs.mkdirSync(noHooks);
  const tree = path.join(tmp, 'tree');
  gitOut(top, ['-c', `core.hooksPath=${noHooks}`, '-c', 'core.fsmonitor=false', 'worktree', 'add', '--detach', '--quiet', tree, head]);
  ctx.worktree = tree;

  // The patch, through a temporary index that holds exactly the last commit plus the
  // judged files as they are in the working folder; the repository's index is never named.
  const temp = { index: path.join(tmp, 'index') };
  const judged = change.files.map((f) => f.topRel);
  gitOut(top, ['read-tree', head], temp);
  gitOut(top, ['add', '--all', '--', ...judged], temp);
  const staged = new Map();
  for (const entry of gitOut(top, ['ls-files', '--stage', '-z', '--', ...judged], temp).toString('utf8').split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    staged.set(entry.slice(tab + 1), entry.slice(0, tab).split(' ')[1]);
  }
  for (const f of change.files) {
    f.stagedId = staged.get(f.topRel) || 'deleted';
    if (f.stagedId !== f.firstHash) throw new Unreadable(`${f.display} changed while it was being checked`);
  }
  const patch = gitOut(top, ['-c', 'diff.suppressBlankEmpty=false', 'diff', '--cached', head, '--binary', '--full-index',
    '-U3', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-relative', '--src-prefix=a/', '--dst-prefix=b/'], temp);
  if (patch.length > 0) {
    const applied = runGit(tree, ['-c', 'core.fsmonitor=false', '-c', 'apply.ignoreWhitespace=no', 'apply', '--whitespace=nowarn'], { input: patch });
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
  if (run.passed === true || run.undetermined) return NO_TEST_RAN;
  return { clause: `the existing tests fail (${firstFailingTest(run.output, copyRoot)})`, cause: 'tests-fail' };
}

/**
 * Remove everything the check made, in this order, stopping at the first failure: every
 * link by itself (never the folder it points to; one already gone counts as removed), the
 * copy's own worktree registration and files (`worktree remove --force`; nothing is
 * pruned), then the temporary folder. Never throws.
 * @param {Context} ctx
 * @returns {(string|null)} what could not be removed, for `detail`
 */
function removeCopy(ctx) {
  if (!ctx.tmp) return null;
  try {
    for (const link of ctx.links) {
      try {
        safeFs.unlinkSync(link);
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err;
      }
    }
    if (ctx.worktree) gitOut(/** @type {string} */ (ctx.top), ['worktree', 'remove', '--force', ctx.worktree]);
    safeFs.rmSync(ctx.tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return null;
  } catch (err) {
    return clean(`the temporary copy at ${ctx.tmp} could not be removed: ${messageOf(err)}`);
  }
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
  const ctx = { top: null, head: null, tmp: null, repoIndex: null, worktree: null, links: [] };
  /** @type {Change|null} */
  let change = null;
  /** @type {Refusal|{tests: string}|{checking: true}} */
  let outcome;
  try {
    change = readChange(root, named, ctx, runTests);
    outcome = ruleRefusal(change) || (runTests ? await ruleTestsInCopy(change, ctx) : { checking: true });
  } catch (err) {
    outcome = err instanceof Unreadable
      ? { clause: `I could not read the change (${err.why})`, cause: 'unreadable', detail: err.detail }
      : { clause: 'I could not read the change (the check stopped)', cause: 'unreadable', detail: clean(messageOf(err)) };
  }
  const removal = removeCopy(ctx);
  const detail = [/** @type {Refusal} */ (outcome).detail, removal].filter(Boolean).join('; ');
  const tail = { ...(detail ? { detail } : {}), ask: { questions: [] }, actions: {} };

  if ('checking' in outcome) {
    const next = `hotfix check --run-tests ${change.files.map((f) => quoted(f.display)).join(' ')}`;
    return { screen: { verdict: 'checking', text: STATUS_LINE, next, ...tail }, cause: undefined, change };
  }
  if ('tests' in outcome) {
    const files = change.files.map((f) => f.display);
    const list = files.map(quoted).join(' ');
    const commit = {
      files,
      add: `git --literal-pathspecs add -- ${list}`,
      message: `git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- ${list}`
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
 * The `hotfix` menu route. `hotfix check [--run-tests] [<file> ...]` judges the change;
 * anything else answers the usage text. Never rejects: a fault can never read as a pass.
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
  for (const a of args.slice(1)) {
    if (a === '--run-tests') runTests = true;
    else if (a.startsWith('--')) return usage(a);
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

module.exports = { hotfixRoute };
