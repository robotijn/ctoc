'use strict';

/**
 * The hotfix check: CTOC looks at a change that someone called a hotfix ("hotfix",
 * "quick fix", "trivial fix", "trivial change", "urgent") and says whether it really is
 * small and safe. When it is not, the answer is one fixed sentence naming the cause.
 *
 * Reached as a menu route (`menu-screens.route`, `case 'hotfix'`):
 *   node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" hotfix check [<file> ...]
 *       — instant: every rule except the tests. On a refusal, the sentence. When every
 *         other rule holds: `verdict: 'checking'`, the one status line as `text`, and
 *         `next`, the exact route that runs the tests.
 *   ... hotfix check --run-tests [<file> ...]
 *       — the background test run: every rule again, then the existing tests.
 * A pass answers `verdict: 'hotfix'`, `text: ''` and `commit: { files, add, message }`.
 *
 * WHAT IS JUDGED. Exactly the change git would commit for the named files (or, with no
 * file named, every changed and new file outside `.ctoc/`, which holds CTOC's own state),
 * against the last commit. No language model is involved; the same change always gets
 * the same answer.
 *
 * THE RULES, in the order they run (the first that fails gives the clause):
 *   1  the change can be read            — a git repository with a commit; every file text
 *   2  same files, same names            — nothing added, removed, renamed, re-moded, linked
 *   7  no test is edited                 — fix the code, not the tests
 *   4  only kinds that qualify           — documentation, visible text in markup, message
 *                                          catalogue values, colour values in stylesheets
 *   5  not in a sensitive area           — 33 whole words in the path (auth, login, ...)
 *   6  no risk marker in wording         — no number, currency, %, address, e-mail, code
 *   3  size                              — at most 20 changed lines in at most 3 files
 *   8  the existing tests pass           — only in the `--run-tests` call
 * Rule 7 and the kind rule run before size because the functional plan's own scenarios
 * name an edited test and the kind of change ahead of size; all of 2 to 7 read the same
 * diff, so the order costs nothing, and the tests still run last.
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
 *
 * THE LOG. Every final answer (a pass or a refusal; never `checking` or the usage text)
 * appends one line to `.ctoc/logs/hotfix-checks.jsonl`:
 * `{ at, verdict, cause, urgent, files, lines }` — the time, `hotfix` or `refused`, the
 * cause word above (`null` on a pass), `false` (the urgent option is a later slice), and
 * the file and changed-line counts (0 when the change could not be read). No file name,
 * path or wording is written. Best effort: a log that cannot be written never changes
 * an answer. Above 1 MiB the file is emptied first.
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

const fs = require('fs'); // only the open-flag constants and descriptor writes; every path goes through safe-fs
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

/** Git's own environment variables that would point it at another repository or index. */
const GIT_REDIRECTS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_CEILING_DIRECTORIES'];

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
const BUILD_NAMES = new Set(['Makefile', 'Jenkinsfile', 'Procfile', 'Vagrantfile', '.gitlab-ci.yml',
  'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']);
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
const ANSI = /\u001b\[[0-9;:<=>?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

/**
 * @typedef {Object} Hunk one `-U0` hunk: its first old and new line numbers and its lines
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
 * @property {(string|null)} [oldText]
 * @property {(string|null)} [newText]
 * @property {Hunk[]} [hunks]
 * @property {string} [kind] the qualifying kind rule 4 placed it in
 * @property {string[]} [runs] the old and new wording rule 6 reads
 */
/** @typedef {{files: ChangedFile[], lineCount: number, root: string}} Change */

/** A rule-1 failure: the change could not be read, for a reason the owner can act on. */
class Unreadable extends Error {
  /** @param {string} why */
  constructor(why) {
    super(why);
    this.why = why;
  }
}

/**
 * Rule 1 — the one way git is called: an argument vector (no shell), fixed settings and
 * environment, output kept as a buffer. A missing git is the "not installed" clause.
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{status: (number|null), stdout: Buffer, stderr: Buffer}}
 */
function runGit(cwd, args) {
  const env = { ...process.env, LC_ALL: 'C', GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' };
  for (const name of GIT_REDIRECTS) delete env[name];
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args],
    { cwd, env, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
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
 * @returns {Buffer}
 */
function gitOut(cwd, args) {
  const r = runGit(cwd, args);
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.toString('utf8').trim()}`);
  return r.stdout;
}

/** @param {string} p @returns {string} the path with `/` separators */
const slash = (p) => p.split(path.sep).join('/');

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
 * Read one C-quoted git path (`"a/x\ty"`) starting at `s[0] === '"'`.
 * @param {string} s
 * @returns {string}
 */
function unquoteGitPath(s) {
  const bytes = [];
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (c === '"') break;
    if (c !== '\\') {
      bytes.push(...Buffer.from(c, 'utf8'));
      continue;
    }
    const e = s[++i];
    if (e >= '0' && e <= '7') {
      bytes.push(parseInt(s.slice(i, i + 3), 8));
      i += 2;
    } else {
      const map = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };
      bytes.push(Object.prototype.hasOwnProperty.call(map, e) ? map[/** @type {'a'} */ (e)] : e.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Rules 1 and 3 — split one `-U0` patch for all files into hunks per top-level path.
 * Hunk bodies are consumed by their header counts, so a removed line that itself starts
 * with `--` is never read as a file header.
 * @param {string} patch
 * @returns {Map<string, Array<{oldStart: number, newStart: number, removed: string[], added: string[]}>>}
 */
function parsePatch(patch) {
  const out = new Map();
  const lines = patch.split('\n');
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('diff --git ')) {
      const rest = line.slice('diff --git '.length);
      const name = rest.startsWith('"') ? unquoteGitPath(rest) : rest.slice(0, (rest.length - 3) / 2 + 1);
      current = name.slice(2);
      if (!out.has(current)) out.set(current, []);
      continue;
    }
    const h = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/.exec(line);
    if (!h || current === null) continue;
    const hunk = { oldStart: Number(h[1]), newStart: Number(h[3]), removed: [], added: [] };
    let oldLeft = h[2] === '' ? 1 : Number(h[2]);
    let newLeft = h[4] === '' ? 1 : Number(h[4]);
    while ((oldLeft > 0 || newLeft > 0) && i + 1 < lines.length) {
      const body = lines[++i];
      const text = body.slice(1).replace(/\r$/, '');
      if (body.startsWith('-')) { hunk.removed.push(text); oldLeft--; }
      else if (body.startsWith('+')) { hunk.added.push(text); newLeft--; }
    }
    out.get(current).push(hunk);
  }
  return out;
}

/**
 * Rule 1 — read the change: which files, their old and new text, and their hunks.
 * Throws {@link Unreadable} with the reason when the change cannot be read.
 * @param {string} root the project root
 * @param {string[]} named the files the session named (may be empty)
 * @returns {Change}
 */
function readChange(root, named) {
  const realRoot = safeFs.realpathSync(root);
  const topRun = runGit(realRoot, ['rev-parse', '--show-toplevel']);
  if (topRun.status !== 0) throw new Unreadable('this folder is not a git repository');
  const top = safeFs.realpathSync(topRun.stdout.toString('utf8').trim());
  if (runGit(top, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']).status !== 0) {
    throw new Unreadable('this folder has no commit to compare with');
  }
  const rootFromTop = slash(path.relative(top, realRoot));
  const toTop = (rel) => (rootFromTop ? `${rootFromTop}/${rel}` : rel);

  const wanted = named.map((arg) => {
    const written = arg.replace(/\\/g, '/');
    const rel = path.relative(realRoot, path.resolve(realRoot, written));
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new Unreadable(`${written} is outside this project`);
    return { display: slash(rel), topRel: toTop(slash(rel)) };
  });
  const specs = wanted.length > 0 ? wanted.map((w) => w.topRel) : (rootFromTop ? [rootFromTop] : []);

  /** @type {Array<Omit<ChangedFile, 'display'>>} */
  const entries = [];
  const raw = gitOut(top, ['diff', 'HEAD', '--raw', '-z', '--no-renames', '--no-abbrev', '--no-ext-diff',
    '--no-textconv', '--', ...specs]).toString('utf8').split('\0');
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const meta = raw[i].slice(1).split(' ');
    entries.push({ topRel: raw[i + 1], oldMode: meta[0], newMode: meta[1], oldSha: meta[2], status: meta[4][0], untracked: false });
  }
  const others = gitOut(top, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...specs])
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

  const unreadableMode = (m) => m === '120000' || m === '160000' || m === '000000';
  for (const f of files) {
    f.oldText = unreadableMode(f.oldMode) ? null : asText(gitOut(top, ['cat-file', 'blob', f.oldSha]), f.display);
    f.newText = f.status === 'D' || unreadableMode(f.newMode) ? null
      : asText(safeFs.readFileSync(path.join(top, f.topRel)), f.display);
  }

  const tracked = files.filter((f) => !f.untracked).map((f) => f.topRel);
  const hunks = tracked.length === 0 ? new Map() : parsePatch(gitOut(top, ['diff', 'HEAD', '-U0', '--no-color',
    '--no-ext-diff', '--no-textconv', '--no-renames', '--ignore-cr-at-eol', '--no-relative',
    '--src-prefix=a/', '--dst-prefix=b/', '--diff-algorithm=myers', '--indent-heuristic',
    '--inter-hunk-context=0', '--', ...tracked]).toString('utf8'));
  let lineCount = 0;
  for (const f of files) {
    f.hunks = f.untracked
      ? [{ oldStart: 0, newStart: 1, removed: [], added: f.newText === null ? [] : newFileLines(f.newText) }]
      : (hunks.get(f.topRel) || []);
    for (const h of f.hunks) lineCount += h.removed.length + h.added.length;
  }
  return { files, lineCount, root: realRoot };
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

/**
 * Rule 4 (markup) — the line pair is an edit of visible text: the parts that differ lie
 * after a `>` that closes a tag opened on the line and before the next `<` that opens a
 * tag, and the text run holds no template or script characters.
 * @param {string} o the old line
 * @param {string} n the new line
 * @param {boolean} jsx whether `.jsx`/`.tsx` code punctuation is also forbidden
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
  const runs = [];
  /** @type {Array<[string, number]>} */
  const sides = [[o, o.length - s], [n, n.length - s]];
  for (const [line, changedEnd] of sides) {
    const next = line.indexOf('<', gt + 1);
    if (next < 0 || !/[A-Za-z/]/.test(line[next + 1] || '') || changedEnd > next) return null;
    const run = line.slice(gt + 1, next);
    if (/[{}$`&]/.test(run) || (jsx && /[();="']/.test(run))) return null;
    runs.push(run);
  }
  return { oldRun: runs[0], newRun: runs[1] };
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

/** @param {Array<{removed: string[], added: string[]}>} hunks @returns {boolean} every hunk replaces line for line */
const equalHunks = (hunks) => hunks.length > 0 && hunks.every((h) => h.removed.length > 0 && h.removed.length === h.added.length);

/** Every old/new line pair of equal-size hunks, with their line numbers. */
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
 * that kind's shape; otherwise the clause of the first other kind it matches.
 * @returns {{kind: string, runs: string[]}|{clause: string, cause: string}}
 */
function ruleKind(f) {
  const { base, ext, folders } = nameParts(f);
  const d = f.display;
  const unrecognised = { clause: `I do not recognise ${d} as wording or a colour`, cause: 'unrecognised' };
  const isDependency = DEPENDENCY_NAMES.has(base) || /^requirements.*\.txt$/.test(base);

  if (DOC_EXT.has(ext) && base.toLowerCase() !== 'claude.md' && !folders.some((p) => GOVERNING_FOLDERS.has(p)) && !isDependency) {
    return { kind: 'documentation', runs: [] };
  }
  if (MARKUP_EXT.has(ext)) {
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
    return { kind: 'markup', runs };
  }
  if (CATALOGUE_EXT.has(ext) && folders.some((p) => CATALOGUE_FOLDERS.has(p))) {
    if (!equalHunks(f.hunks)) return unrecognised;
    const runs = [];
    for (const pair of linePairs(f.hunks)) {
      const a = catalogueEntry(pair.o, ext);
      const b = catalogueEntry(pair.n, ext);
      if (!a || !b || a.key !== b.key || a.value === b.value || placeholders(a.value) !== placeholders(b.value)) return unrecognised;
      runs.push(a.value.replace(PLACEHOLDER, ''), b.value.replace(PLACEHOLDER, ''));
    }
    return { kind: 'catalogue', runs };
  }
  if (COLOUR_EXT.has(ext)) {
    if (!equalHunks(f.hunks)) return unrecognised;
    for (const pair of linePairs(f.hunks)) if (!colourEdit(pair.o, pair.n)) return unrecognised;
    return { kind: 'colour', runs: [] };
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
 * @returns {{clause: string, cause: string}|null}
 */
function ruleRefusal(change) {
  for (const rule of [ruleSameFiles, ruleNoTestEdited]) {
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
 * Rule 8 — run `fn` with the working directory at the project root and `console.log`
 * silenced (the quality agent prints progress lines, which must stay off the menu's JSON),
 * restoring both in `finally`.
 * @template T
 * @param {string} root
 * @param {() => (T|Promise<T>)} fn
 * @returns {Promise<T>}
 */
async function inProject(root, fn) {
  const cwd = process.cwd();
  const log = console.log;
  try {
    process.chdir(root);
    console.log = () => {};
    return await fn();
  } finally {
    console.log = log;
    process.chdir(cwd);
  }
}

/** @param {string} s @returns {string} the text without control characters, at most 200 characters */
const clean = (s) => String(s).replace(CONTROL_CHARS, ' ').trim().slice(0, 200);

/**
 * Rule 8 — the first failing test, read from the run's output: `<file>: <name>`, or
 * whichever of the two was read, or a plain statement that the command failed.
 * @param {string} output
 * @param {string} root the project root (real path)
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
    if (path.isAbsolute(file)) {
      const rel = path.relative(root, file);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) file = rel;
    }
    file = clean(file.replace(/\\/g, '/'));
  }
  if (name !== null) name = clean(name);
  if (file && name) return `${file}: ${name}`;
  return file || name || 'the test command reported a failure';
}

/**
 * Rule 8 — run the existing tests: the affected-test selection when it names at least
 * one test, otherwise the whole suite (both from the quality agent).
 * @returns {Promise<{clause: string, cause: string}|{passCount: number}>}
 */
async function ruleTestsPass(change, tools) {
  const { findAffectedTests } = require('./coverage-map');
  const { runSpecificTests, runFullTests } = require('./quality-agent');
  const result = await inProject(change.root, () => {
    const affected = findAffectedTests(change.files.map((f) => path.join(change.root, f.display)));
    return !affected.requiresFullSuite && affected.tests.length > 0
      ? runSpecificTests(tools, affected.tests)
      : runFullTests(tools);
  });
  if (result.passed === true && result.passCount > 0) return { passCount: result.passCount };
  if (result.passed === true || result.undetermined) return NO_TEST_RAN;
  return { clause: `the existing tests fail (${firstFailingTest(result.output, change.root)})`, cause: 'tests-fail' };
}

/** @param {string} s @returns {string} the text single-quoted for a POSIX shell */
const shellQuote = (s) => `'${s.replace(/'/g, "'\\''")}'`;

/**
 * The log of verdicts — append one line per final answer; best effort, never throws.
 * Never written through a symbolic link: the project is the owner's working tree and may
 * be a cloned repository that commits `.ctoc/logs/hotfix-checks.jsonl` as a link to some
 * other file, so `.ctoc`, `.ctoc/logs` and the log itself must each be the real thing, the
 * log is opened without following a link where the platform allows it, and a log above
 * 1 MiB is emptied through the descriptor that was opened that way.
 * @param {string} root
 * @param {{at: string, verdict: string, cause: (string|null), urgent: boolean, files: number, lines: number}} entry
 * @returns {boolean} whether the line was written (the caller's answer never depends on it)
 */
function logVerdict(root, entry) {
  try {
    if (!safeFs.existsSync(root)) return false; // never create a project folder just to log in it
    const ctoc = path.join(root, '.ctoc');
    const dir = path.join(ctoc, 'logs');
    const file = path.join(dir, 'hotfix-checks.jsonl');
    // lstat, never existsSync: a dangling link must read as a link, not as "absent".
    const lstatOrNull = (p) => { try { return safeFs.lstatSync(p); } catch { return null; } };
    for (const folder of [ctoc, dir]) {
      if (!lstatOrNull(folder)) safeFs.mkdirSync(folder);
      if (!safeFs.lstatSync(folder).isDirectory()) return false; // a link or a file: never written through
    }
    const st = lstatOrNull(file);
    if (st && !st.isFile()) return false;
    // A new log is created exclusively, which refuses any link put in its place; an
    // existing one is opened without following a link where the platform allows it.
    // The size check and the emptying go through that descriptor, never the path again.
    const { O_WRONLY, O_APPEND, O_CREAT, O_EXCL, O_NOFOLLOW } = fs.constants;
    const flags = (st ? O_WRONLY | O_APPEND : O_WRONLY | O_APPEND | O_CREAT | O_EXCL) | (O_NOFOLLOW || 0);
    const fd = safeFs.openSync(file, flags, 0o644);
    try {
      if (fs.fstatSync(fd).size > LOG_MAX_BYTES) fs.ftruncateSync(fd, 0);
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
 * Judge the change. Returns the screen and, for a final answer, the log entry.
 * Never throws: anything unexpected becomes the "check stopped" clause.
 */
async function judge(root, named, runTests) {
  const base = { ask: { questions: [] }, actions: {} };
  let change = null;
  const refuse = (r) => ({
    screen: { verdict: 'refused', text: `${SENTENCE_HEAD}${r.clause}${SENTENCE_TAIL}`, ...base },
    cause: r.cause, change: r.cause === 'unreadable' ? null : change
  });
  const pass = (tests) => {
    const files = change.files.map((f) => f.display);
    return {
      screen: {
        verdict: 'hotfix', text: '', tests,
        commit: { files, add: `git add -- ${files.map(shellQuote).join(' ')}`, message: "git commit -m 'hotfix: <what changed>'" },
        ...base
      },
      cause: null, change
    };
  };
  try {
    change = readChange(root, named);
    const refusal = ruleRefusal(change);
    if (refusal) return refuse(refusal);
    const docOnly = change.files.every((f) => f.kind === 'documentation');
    const tools = await inProject(change.root, () => require('./tool-detector').detectTools(change.root).tools);
    if (!Object.values(tools).some((t) => t && t.test)) {
      return docOnly ? pass('The project has no test command, and the change is documentation only.') : refuse(NO_TEST_RAN);
    }
    if (!runTests) {
      const next = `hotfix check --run-tests ${change.files.map((f) => shellQuote(f.display)).join(' ')}`;
      return { screen: { verdict: 'checking', text: STATUS_LINE, next, ...base }, cause: undefined };
    }
    const tested = await ruleTestsPass(change, tools);
    if ('clause' in tested) return refuse(tested);
    return pass(`${tested.passCount} ${tested.passCount === 1 ? 'test' : 'tests'} passed.`);
  } catch (err) {
    const why = err instanceof Unreadable ? err.why : `the check stopped: ${clean(err && err.message ? err.message : err)}`;
    return refuse({ clause: `I could not read the change (${why})`, cause: 'unreadable' });
  }
}

/**
 * The `hotfix` menu route. `hotfix check [--run-tests] [<file> ...]` judges the change;
 * anything else answers the usage text. Never rejects: a fault can never read as a pass.
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
